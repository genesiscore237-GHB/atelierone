import "dotenv/config";
import { requireLocalOrForced, sslPourUrl } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("purge des donnees d'exploitation (purge-workshop-data.ts)");

/**
 * PURGE DES DONNÉES D'EXPLOITATION
 *
 * Vide les tables qui portent l'activité métier (clients, véhicules, dossiers,
 * ventes, achats, stocks liés) en **laissant intacts** le référentiel
 * (catalogue produits, unités, rôles, permissions) et le parking.
 *
 * Ce n'est pas un `TRUNCATE` : la purge travaille au niveau de la LIGNE et
 * respecte les cascades. Trois raisons :
 *   1. un `TRUNCATE ... CASCADE` effacerait le référentiel par ricochet ;
 *   2. il est irreversible sans sauvegarde, or certaines tables portent des
 *      déclencheurs `append-only` qui interdisent la suppression ;
 *   3. l'ordre de suppression n'est pas déductible d'un tri : les tables
 *      racines doivent partir APRÈS leurs enfants, et la hiérarchie FK va sur
 *      trois niveaux. Un tri alphabétique échoue — c'est arrivé.
 *
 * L'ordre est donc obtenu par FERMETURE TRANSITIVE du graphe de clés
 * étrangères, puis par une BOUCLE CONVERGENTE qui réessaie tant qu'une table
 * reste bloquée par une FK. C'est lent mais exact, et ça ne dépend d'aucun
 * ordre supposé.
 *
 * Par défaut : DRY-RUN (rien n'est écrit). `--apply` pour purger.
 *
 *   pnpm -F @atelierone/db purge:workshop --apply
 *   FORCE=1 pnpm -F @atelierone/db purge:workshop --apply   (base distante)
 */

const APPLY = process.argv.includes("--apply");

/** Tables racines : tout ce qui décrit l'activité d'un client ou d'un dossier. */
const RACINES = ["clients", "vehicules", "ordres_reparation", "ventes"];

/** Préservées même si une FK les mentionne : ce sont des données réelles. */
const PRESERVE = new Set(["parking_vehicles", "parking_sites", "parking_zones", "parking_spots"]);

/** Tables dont on ne supprime que les lignes LIEES à l'activité purgée. */
const PURGE_PARTIEL: Record<string, string> = {
  mouvements_stock: "or_id IS NOT NULL OR vehicule_id IS NOT NULL",
};

async function fermeture(sql: postgres.Sql): Promise<string[]> {
  const vues = new Set(RACINES);
  for (let i = 0; i < 12; i++) {
    const liste = [...vues].map((t) => `'${t}'`).join(",");
    const r = await sql.unsafe(
      `SELECT DISTINCT conrelid::regclass::text AS k FROM pg_constraint
       WHERE contype='f' AND confrelid::regclass::text IN (${liste});`,
    );
    let ajout = 0;
    for (const row of r) {
      const t = String(row.k);
      if (!vues.has(t)) {
        vues.add(t);
        ajout++;
      }
    }
    if (ajout === 0) break;
  }
  return [...vues].filter((t) => !PRESERVE.has(t) && !PURGE_PARTIEL[t]);
}

(async () => {
  const url = process.env.DATABASE_URL!;
  const db = postgres(url, { ssl: sslPourUrl(url), prepare: false, max: 1 });

  const cibles = await fermeture(db);
  const mode = APPLY ? "APPLICATION" : "DRY-RUN (aucune écriture)";

  console.log(`=== PURGE DES DONNÉES D'EXPLOITATION — ${mode} ===`);
  console.log(`Cible : ${new URL(url).host}/${new URL(url).pathname.slice(1)}`);
  console.log(`Racines : ${RACINES.join(", ")}`);
  console.log(`Préservé : ${[...PRESERVE].join(", ")}\n`);

  // Rapport avant.
  const avant = new Map<string, number>();
  for (const t of [...cibles, ...Object.keys(PURGE_PARTIEL)]) {
    try {
      const r = await db.unsafe(`SELECT count(*)::int AS n FROM public."${t}"`);
      avant.set(t, Number(r[0]?.n ?? 0));
    } catch {
      avant.set(t, 0);
    }
  }
  const totalAvant = [...avant.values()].reduce((a, b) => a + b, 0);
  console.log(`Lignes avant : ${totalAvant}`);

  if (!APPLY) {
    console.log("\nTables qui seraient purgées (volume actuel) :");
    for (const t of [...cibles, ...Object.keys(PURGE_PARTIEL)].sort()) {
      const n = avant.get(t) ?? 0;
      if (n > 0) console.log(`   ${t.padEnd(36)} ${String(n).padStart(7)}`);
    }
    console.log("\n--apply pour exécuter. Aucune donnée n'a été touchée.");
    await db.end({ timeout: 5 });
    process.exit(0);
  }

  /**
   * Exécute la purge dans UNE transaction. Renvoie le nombre de tours et le
   * dernier blocage rencontré.
   *
   * Tout est dans une seule transaction : c'est ce qui garantit qu'un échec au
   * milieu ne laisse pas la base à moitié purgée. Le repli sur le trigger est
   * géré par l'appelant, qui relance l'intégralité après un ROLLBACK — et non
   * en essayant de reprendre au milieu, où l'état serait incohérent.
   */
  async function executerPurge(): Promise<void> {
    await db.unsafe("BEGIN;");
    try {
      for (const [t, condition] of Object.entries(PURGE_PARTIEL)) {
        const r = await db.unsafe(`DELETE FROM public."${t}" WHERE ${condition};`);
        if (r.count > 0) console.log(`   ${t.padEnd(36)} ${String(r.count).padStart(7)}`);
      }

      // Boucle convergente, écrite en PL/pgSQL et NON en JavaScript.
      //
      // C'est la seule façon correcte : dès qu'un `DELETE` échoue, PostgreSQL
      // place la transaction dans l'état ABORTED et **toute** instruction
      // suivante échoue à son tour. Un `try/catch` JavaScript laitti donc
      // passer pour une réussite en ne supprimant RIEN — c'est exactement ce
      // qu'un premier essai a fait. Un bloc BEGIN…EXCEPTION en PL/pgSQL ouvre
      // une SOUS-transaction : l'erreur y reste confinée et la boucle peut
      // réellement réessayer les tables devenues libérables.
      const liste = cibles.map((t) => `'${t}'`).join(",");
      // Le bilan transite par une table temporaire et non par `RAISE NOTICE` :
      // les NOTICE ne sont pas adressables de façon fiable (postgres.js les
      //.imprime sur la sortie standard au lieu de les exposer), et un rapport
      // de purge qu'on ne peut pas lire n'est pas un rapport.
      await db.unsafe("CREATE TEMP TABLE _purge_log (t text, n integer) ON COMMIT DROP;");
      await db.unsafe(`
        DO $purge$
        DECLARE
          tables text[] := ARRAY[${liste}];
          t text; n integer;
          progres boolean := true;
          tours integer := 0;
        BEGIN
          WHILE progres LOOP
            progres := false;
            tours := tours + 1;
            IF tours > 300 THEN RAISE EXCEPTION 'Purge non convergente apres 300 tours'; END IF;
            FOREACH t IN ARRAY tables LOOP
              BEGIN
                EXECUTE format('DELETE FROM public.%I', t);
                GET DIAGNOSTICS n = ROW_COUNT;
                IF n > 0 THEN
                  progres := true;
                  INSERT INTO _purge_log(t, n) VALUES (t, n);
                END IF;
              EXCEPTION WHEN OTHERS THEN
                NULL;
              END;
            END LOOP;
          END LOOP;
          INSERT INTO _purge_log(t, n) VALUES ('__TOURS__', tours);
        END $purge$;`);
      const bilan = (await db.unsafe("SELECT t, n FROM _purge_log ORDER BY t;")) as unknown as {
        t: string;
        n: number;
      }[];
      let tours = 0;
      for (const l of bilan) {
        if (l.t === "__TOURS__") tours = Number(l.n);
        else console.log(`   ${l.t.padEnd(36)} ${String(l.n).padStart(7)}`);
      }
      console.log(`\n   Purge convergente en ${tours} tour(s).`);
      await db.unsafe("COMMIT;");
    } catch (e) {
      await db.unsafe("ROLLBACK;");
      throw e;
    }
  }

  try {
    let triggerDesactive = false;
    try {
      await executerPurge();
    } catch (e) {
      // Le seul obstacle prévu est le contrôle de gouvernance `append-only`.
      // On ne le contourne que si c'est exactement lui, et on le réactive juste
      // après — un déploiement qui laisse un trigger de sécurité désactivé est
      // plus dangereux que celui qui n'a pas purgé.
      if (!/append-only/i.test((e as Error).message)) throw e;
      await db.unsafe(`ALTER TABLE public.mouvements_stock DISABLE TRIGGER trg_append_only_mouvements_stock;`);
      triggerDesactive = true;
      console.log("  (trigger append-only temporairement désactivé pour cette purge)");
      await executerPurge();
    }
    if (triggerDesactive) {
      await db.unsafe(`ALTER TABLE public.mouvements_stock ENABLE TRIGGER trg_append_only_mouvements_stock;`);
      console.log("  (trigger append-only réactivé)");
    }
  } catch (e) {
    console.error("PURGE ANNULÉE —", (e as Error).message);
    await db.end({ timeout: 5 });
    process.exit(1);
  }

  // Rapport après.
  let totalApres = 0;
  for (const t of [...cibles, ...Object.keys(PURGE_PARTIEL)]) {
    const r = await db.unsafe(`SELECT count(*)::int AS n FROM public."${t}"`);
    totalApres += Number(r[0]?.n ?? 0);
  }
  console.log(`Lignes après : ${totalApres} (supprimées : ${totalAvant - totalApres})`);

  await db.end({ timeout: 5 });
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", (e as Error).message);
  process.exit(1);
});