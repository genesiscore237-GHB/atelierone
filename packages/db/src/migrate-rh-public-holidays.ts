import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("RPT-02 — vérité temporelle : jours fériés (migrate-rh-public-holidays.ts)");

/**
 * RPT-02 §2 — VÉRITÉ TEMPORELLE DES JOURS FÉRIÉS
 *
 * Constat : `hr_public_holidays.date` est un `varchar(10)`. Le seed historique
 * écrivait `${annee}-${h.date}` alors que `h.date` était codé au format MM-JJ
 * (cf. PUBLIC_HOLIDAYS dans seed-rh.ts). Résultat : 4 lignes sur 12 sont fausses.
 *
 *   2026-01-01  ok
 *   2026-11-02  ok
 *   2026-01-05  FAUX  (Fête du Travail = 05-01)
 *   2026-20-05  INVALIDE (Fête Nationale = 05-20)
 *   2026-15-08  INVALIDE (Assomption = 08-15)
 *   2026-25-12  INVALIDE (Noël = 12-25)
 *
 * Une date holiday invalide n'est jamais reconnue par `joursOuvres()` ni par
 * `jourOuvrePour()` : le jour férié se comporte en jour travaillé.
 *
 * Stratégie de correction — AUCUNE valeur n'est devinée :
 *  1. carte autoritative `nom normalisé -> MM-JJ` (jours fériés du Cameroun) ;
 *  2. si la valeur est une date valide mais absente de la carte  -> conservée ;
 *  3. si la valeur est invalide mais réparable par inversion MM-JJ -> corrigée ;
 *  4. sinon -> ABORT avec rapport ligne par ligne (aucune écriture).
 *
 * Usage :
 *   DRY_RUN=1  npx tsx src/migrate-rh-public-holidays.ts   (rapport seul)
 *              npx tsx src/migrate-rh-public-holidays.ts   (application)
 *   ROLLBACK=1 npx tsx src/migrate-rh-public-holidays.ts   (restauration)
 *
 * Garanti : idempotent (rejouable sans effet), réversible, transactionnel,
 * sauvegarde integral dans hr_public_holidays_rpt02_bak.
 */

const TABLE = "hr_public_holidays";
const BAK = "hr_public_holidays_rpt02_bak";

/** Jours fériés officiels du Cameroun : nom normalisé -> "MM-JJ". */
const FERIES_AUTORITATIFS: Record<string, string> = {
  "nouvel an": "01-01",
  "fete du travail": "05-01",
  "fete nationale": "05-20",
  "assomption": "08-15",
  "noel": "12-25",
  "fete de la jeunesse": "11-02",
};

type Nature = "INVALIDE_CORRIGE" | "INVERSION_MMJJ" | "DEJA_CONFORME" | "HORS_CARTE_CONSERVE";

interface Ligne {
  id: number;
  agence_id: number;
  date: string;
  name: string;
  is_recurring_yearly: boolean;
}

interface Decision {
  id: number;
  agence_id: number;
  avant: string;
  apres: string;
  name: string;
  nature: Nature;
  motif: string;
}

const sansAccent = (s: string): string =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function dateValide(iso: string): boolean {
  if (!ISO.test(iso)) return false;
  const [a, m, j] = iso.split("-").map(Number);
  if (m < 1 || m > 12 || j < 1 || j > 31) return false;
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

function depuisMmJJ(annee: number, mmjj: string): string | null {
  const [m, j] = mmjj.split("-").map(Number);
  const candidat = `${annee}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
  return dateValide(candidat) ? candidat : null;
}

function decider(l: Ligne): Decision | { id: number; nature: "ABORT"; avant: string; name: string; motif: string } {
  const norm = sansAccent(l.name);
  const autoritaire = FERIES_AUTORITATIFS[norm];
  const annee = ISO.test(l.date) ? Number(l.date.slice(0, 4)) : Number(l.date.slice(0, 4));

  // 1. Date valide : on ne touche que si le nom est connu et contredit la date.
  if (dateValide(l.date)) {
    if (!autoritaire) {
      return {
        id: l.id, agence_id: l.agence_id, avant: l.date, apres: l.date, name: l.name,
        nature: "HORS_CARTE_CONSERVE", motif: "date valide, nom hors carte autoritative",
      };
    }
    const attendu = depuisMmJJ(annee, autoritaire);
    if (attendu === null) {
      return { id: l.id, nature: "ABORT", avant: l.date, name: l.name, motif: `carte contradictoire : ${autoritaire}` };
    }
    if (attendu === l.date) {
      return {
        id: l.id, agence_id: l.agence_id, avant: l.date, apres: l.date, name: l.name,
        nature: "DEJA_CONFORME", motif: "conforme a la carte autoritative",
      };
    }
    return {
      id: l.id, agence_id: l.agence_id, avant: l.date, apres: attendu, name: l.name,
      nature: "INVERSION_MMJJ",
      motif: `"${l.date}" inverse le couple ; "${l.name}" = ${attendu}`,
    };
  }

  // 2. Date invalide mais forme YYYY-MM-DD : reparable uniquement via la carte.
  if (!ISO.test(l.date)) {
    return { id: l.id, nature: "ABORT", avant: l.date, name: l.name, motif: "format non reconnu (ni YYYY-MM-DD ni reparable)" };
  }
  if (!autoritaire) {
    return { id: l.id, nature: "ABORT", avant: l.date, name: l.name, motif: "date invalide et nom hors carte : correction manuelle requise" };
  }
  const reparable = depuisMmJJ(annee, autoritaire);
  if (!reparable) {
    return { id: l.id, nature: "ABORT", avant: l.date, name: l.name, motif: `date irreparable pour "${l.name}"` };
  }
  return {
    id: l.id, agence_id: l.agence_id, avant: l.date, apres: reparable, name: l.name,
    nature: "INVALIDE_CORRIGE", motif: `date inexistante ; "${l.name}" = ${reparable}`,
  };
}

(async () => {
  const raw = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  const DRY = process.env.DRY_RUN === "1";
  const ROLLBACK = process.env.ROLLBACK === "1";

  console.log("=== RPT-02 — Migration jours fériés ===");
  console.log(`mode : ${ROLLBACK ? "ROLLBACK" : DRY ? "DRY-RUN" : "APPLY"}`);
  console.log(`cible: ${TABLE} (dry-run=${DRY}, rollback=${ROLLBACK})`);

  const typeCol = await raw.unsafe(
    `select data_type from information_schema.columns
      where table_schema='public' and table_name=$1 and column_name='date'`,
    [TABLE]
  );
  const typeActuel: string = typeCol[0]?.data_type ?? "INCONNU";
  console.log(`type actuel de ${TABLE}."date" : ${typeActuel}`);

  if (ROLLBACK) {
    const existe = await raw.unsafe(`select to_regclass($1) as t`, [`public.${BAK}`]);
    if (!existe[0]?.t) {
      console.error("ABORT : aucune sauvegarde disponible, rollback impossible.");
      await raw.end();
      process.exit(1);
    }
    await raw.begin(async (tx) => {
      // L'ordre compte : la colonne est encore en `date`, et la sauvegarde peut
      // contenir des chaines IMPOSSIBLES ("2026-15-08"). Les y affecter avant
      // conversion echouerait. On rebascule donc en varchar(10) d'abord.
      await tx.unsafe(`ALTER TABLE ${TABLE} ALTER COLUMN "date" TYPE varchar(10) USING "date"::text`);
      await tx.unsafe(`UPDATE ${TABLE} h SET "date" = b."date" FROM ${BAK} b WHERE h.id = b.id`);
      await tx.unsafe(`DROP INDEX IF EXISTS ${TABLE}_agence_date_idx`);
      await tx.unsafe(`ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS ${TABLE}_agence_date_key`);
    });
    console.log(`ROLLBACK applique : ${TABLE}."date" restaure en varchar(10) depuis ${BAK}.`);
    await raw.end();
    process.exit(0);
  }

  // `::text` rend la lecture identique avant (varchar) et apres (date) : le
  // script reste jouable en|idempotent une fois la colonne convertie.
  const lignes = (await raw.unsafe(
    `select id, agence_id, "date"::text as date, name, is_recurring_yearly from ${TABLE} order by id`
  )) as unknown as Ligne[];

  const decisions: Decision[] = [];
  const aborts: Array<Record<string, unknown>> = [];
  for (const l of lignes) {
    const d = decider(l);
    if ((d as { nature: string }).nature === "ABORT") {
      aborts.push(d);
    } else {
      decisions.push(d as Decision);
    }
  }

  console.log(`\n--- AUDIT (${decisions.length + aborts.length} lignes) ---`);
  for (const d of decisions) {
    const flag = d.avant === d.apres ? "  " : "=>";
    console.log(`  #${String(d.id).padStart(2)} agence ${d.agence_id}  ${d.avant} ${flag} ${d.apres}  [${d.nature}] ${d.motif}`);
  }
  for (const a of aborts) {
    console.log(`  #${a.id} ABORT  valeur="${a.avant}" nom="${a.name}" -> ${a.motif}`);
  }

  const parNature = decisions.reduce<Record<string, number>>((acc, d) => {
    acc[d.nature] = (acc[d.nature] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\nresume : ${JSON.stringify(parNature)} | aborts=${aborts.length}`);

  if (aborts.length > 0) {
    console.error("\nABORT : des lignes ne peuvent pas etre corrigees sans decision humaine. Aucune ecriture.");
    await raw.end();
    process.exit(2);
  }

  const aCorriger = decisions.filter((d) => d.avant !== d.apres);
  if (DRY) {
    console.log(`\nDRY-RUN : ${aCorriger.length} ligne(s) a corriger, ${typeActuel === "date" ? "type deja conforme" : "colonne a convertir en date"}. Aucune ecriture.`);
    await raw.end();
    process.exit(0);
  }

  await raw.begin(async (tx) => {
    // 1. Sauvegarde integrale, une seule fois par valeur d'origine (idempotent).
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS ${BAK} (
        id integer PRIMARY KEY,
        agence_id integer NOT NULL,
        "date" varchar(10) NOT NULL,
        name varchar(120) NOT NULL,
        is_recurring_yearly boolean,
        sauvegarde_le timestamp NOT NULL DEFAULT now()
      )`);
    await tx.unsafe(`
      INSERT INTO ${BAK} (id, agence_id, "date", name, is_recurring_yearly)
      SELECT h.id, h.agence_id, h."date"::text, h.name, h.is_recurring_yearly FROM ${TABLE} h
      ON CONFLICT (id) DO NOTHING`);

    // 2. Correction des valeurs (colonne encore varchar).
    for (const d of aCorriger) {
      await tx.unsafe(`UPDATE ${TABLE} SET "date" = $2::text WHERE id = $1 AND "date"::text = $3`, [d.id, d.apres, d.avant]);
    }

    // 3. Aucune valeur non convertissable ne doit subsister.
    const restants = await tx.unsafe(`SELECT id, "date"::text as date FROM ${TABLE} WHERE "date"::text !~ '^\\d{4}-\\d{2}-\\d{2}$'`);
    if (restants.length > 0) {
      throw new Error(`valeurs non convertibles residuelles : ${JSON.stringify(restants)}`);
    }

    // 4. Modele : varchar(10) -> date (le vrai garde-fou).
    if (typeActuel !== "date") {
      await tx.unsafe(`ALTER TABLE ${TABLE} ALTER COLUMN "date" TYPE date USING "date"::date`);
    }

    // 5. Integrite : un seul ferie par jour et par agence.
    await tx.unsafe(`CREATE INDEX IF NOT EXISTS ${TABLE}_agence_date_idx ON ${TABLE} (agence_id, "date")`);
    await tx.unsafe(`ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS ${TABLE}_agence_date_key`);
    await tx.unsafe(`ALTER TABLE ${TABLE} ADD CONSTRAINT ${TABLE}_agence_date_key UNIQUE (agence_id, "date")`);
  });

  const apres = await raw.unsafe(
    `select id, agence_id, to_char("date", 'YYYY-MM-DD') as date_iso, name from ${TABLE} order by id`
  );
  console.log("\n--- APRES ---");
  for (const l of apres) console.log(`  #${l.id} agence ${l.agence_id}  ${l.date_iso}  ${l.name}`);
  console.log(`\nOK : ${aCorriger.length} ligne(s) corrigee(s), type = date, contrainte UNIQUE (agence_id, date) posee.`);
  console.log(`Rollback : ROLLBACK=1 npx tsx src/migrate-rh-public-holidays.ts`);

  await raw.end();
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});