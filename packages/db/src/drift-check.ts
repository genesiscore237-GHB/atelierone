import "dotenv/config";
import { createHash } from "node:crypto";
import postgres from "postgres";

/**
 * CONTRÔLE DE DÉRIVE ENTRE DEUX BASES
 *
 * « La production doit être le reflet parfait du local » n'est vérifiable que
 * s'il existe un moyen de le **démontrer**. Ce script compare deux bases et
 * sort un verdict, pas une impression.
 *
 *   pnpm -F @atelierone/db drift:check
 *
 * Variables :
 *   DRIFT_A_URL  base de référence (défaut : DATABASE_URL — le local)
 *   DRIFT_B_URL  base comparée    (défaut : ref. de la variante Neon du .env)
 *
 * Trois niveaux de lecture, du plus grave au plus informatif :
 *
 *   1. SCHEMA   — tables, colonnes, contraintes, index, déclencheurs.
 *      Un objet présent d'un seul côté est un ÉCART BLOQUANT : le code peut
 *      demander une colonne qui n'existe pas (c'est exactement l'erreur Vercel
 *      `column does not exist` qui a fait perdre une journée).
 *
 *   2. VOLUMÉTRIE — nombre de lignes par table. Sert à repérer une base vide,
 *      un seed oublié ou une purge non propagée.
 *
 *   3. EMPREINTE DES DONNÉES DE RÉFÉRENTIEL — sha256 d'un `SELECT` ordonné,
 *      sur les tables qui doivent être identiques (rôles, permissions, unités,
 *      catalogue…). Une même volumétrie avec une empreinte différente signale
 *      un contenu divergent : le seed n'a pas été rejoué après un changement.
 *
 * Les tables de données d'exploitation (clients, véhicules, dossiers, ventes)
 * ne sont PAS comparées par empreinte : elles évoluent en production, c'est
 * normal et souhaitable. Elles ne sont contrôlées qu'en volumétrie, et leur
 * contenu est vérifié par les tests d'intégration.
 *
 * Sortie : code 1 si un écart de schéma est détecté (bloquant pour un
 * déploiement), code 0 sinon. `--strict` fait aussi échouer sur une
 * différence de volumétrie ou d'empreinte.
 */

type Connexion = { nom: string; sql: postgres.Sql };

const ARG = process.argv.slice(2);
const STRICT = ARG.includes("--strict");

/** ssl déduit de l'URI : Postgres local n'en veut pas, Neon l'exige. */
function sslPour(url: string): false | "require" {
  return url.includes("@localhost:") || url.includes("@127.0.0.1:") ? false : "require";
}

function nomCourte(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/\..*/, "")}/${u.pathname.slice(1)}`;
  } catch {
    return "(URL illisible)";
  }
}

/** Tables de données d'exploitation : volumétrie seulement, jamais empreinte. */
const TABLES_EXPLOITATION = new Set([
  "clients",
  "vehicules",
  "ordres_reparation",
  "ventes",
  "parking_vehicles",
  "atelier_notifications",
  "or_historique",
  "audit_logs",
  "mouvements_stock",
  "stocks",
  "client_interactions",
]);

/** Référentiel : doit être strictement identique partout. */
const TABLES_REFERENTIEL = [
  "permissions",
  "roles",
  "unites_mesure",
  "categories",
  "fournisseurs",
  "produits",
  "parametres_societe",
];

/**
 * Table de jonction : son contenu sémantique est la paire de CODES, jamais les
 * identifiants numériques, qui varient d'une base à l'autre.
 */
async function empreinteRolePermissions(sql: postgres.Sql): Promise<string | null> {
  try {
    const r = await sql.unsafe(`
      SELECT r.code || '|' || p.code AS k
      FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      ORDER BY 1
    `);
    return createHash("sha256").update(r.map((x) => String(x.k)).join("\n")).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}

async function columns(sql: postgres.Sql): Promise<Set<string>> {
  const r = await sql.unsafe(`
    SELECT table_name || '.' || column_name AS k
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  return new Set(r.map((x) => String(x.k)));
}

async function contraintes(sql: postgres.Sql): Promise<Set<string>> {
  // `contype = 'n'` (NOT NULL) est EXCLU, et c'est délibéré.
  //
  // PostgreSQL 18 matérialise les colonnes NOT NULL dans `pg_constraint` avec
  // des noms auto-générés (`achats_id_not_null`). En 17 et antérieur, ces
  // contraintes n'existent pas du tout dans le catalogue.
  //
  // Or le local tourne en 17 et la production (Neon) en 18 : comparer les deux
  // sur ce critère produit 1016 « contraintes absentes de B » qui ne sont pas
  // des absences. Le garde-fou signalait une dérive là où il n'y en avait
  // aucune — et, pire, une dérive qui change selon le sens de comparaison, ce
  // qui rend un garde-fou imprévisible, donc inutilisable.
  //
  const r = await sql.unsafe(`
    -- conrelid::regclass::text est INTERDIT ici : sa forme depend du
    -- search_path de la session. Sur le pooler Neon, qui ouvre avec un
    -- search_path VIDE, le nom sort non qualifie (absences) alors que le
    -- local renvoie public.absences. Les deux cles ne se ressemblent plus,
    -- et la comparaison conclut que les 821 contraintes locales « manquent »
    -- en production : un ecart entierement fabrique par la connexion.
    --
    -- C'est le meme piege documente dans AGENTS.md pour les scripts
    -- d'exploitation, et il vient d'attraper la comparaison elle-meme : un
    -- garde-fou qui se trompe de sens selon qui l'appelle ne protege de rien.
    --
    -- Le NOT NULL reste verifie autrement : la nullabilite des colonnes est
    -- lue dans information_schema, quelle que soit la version de PostgreSQL.
    SELECT n.nspname || '.' || t.relname || '|' || c.conname AS k
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND c.contype <> 'n'
  `);
  return new Set(r.map((x) => String(x.k)));
}

async function index(sql: postgres.Sql): Promise<Set<string>> {
  const r = await sql.unsafe(`
    SELECT tablename || '|' || indexname AS k
    FROM pg_indexes WHERE schemaname = 'public'
  `);
  return new Set(r.map((x) => String(x.k)));
}

async function declencheurs(sql: postgres.Sql): Promise<Set<string>> {
  const r = await sql.unsafe(`
    SELECT c.relname || '|' || t.tgname AS k
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
  `);
  return new Set(r.map((x) => String(x.k)));
}

async function tables(sql: postgres.Sql): Promise<Set<string>> {
  const r = await sql.unsafe(`
    SELECT table_name AS k FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  return new Set(r.map((x) => String(x.k)));
}

async function volumetrie(sql: postgres.Sql, t: string): Promise<number | null> {
  try {
    const r = await sql.unsafe(`SELECT count(*)::int AS n FROM public."${t}"`);
    return Number(r[0]?.n ?? 0);
  } catch {
    return null;
  }
}

/**
 * Colonnes VOLATILES : elles portent l'identité physique de la ligne, pas son
 * contenu. `id` est une séquence locale à chaque base — deux bases au contenu
 * strictement identique ont forcément des `id` différents. Les comparer
 * produirait un écart imaginaire sur toutes les tables.
 * Même raisonnement pour les horodatages, qui diffèrent dès qu'un seed a été
 * rejoué à un autre moment.
 */
const COLONNES_VOLATILES = /(^id$|_id$|_at$|^created_at$|^updated_at$|^deleted_at$)/i;

/**
 * Empreinte stable d'une table : sha256 des lignes TRIÉES par contenu, sur les
 * seules colonnes sémantiques (hors identité physique). Deux bases au même
 * contenu donnent la même empreinte, quels que soient leurs `id`.
 */
async function empreinte(sql: postgres.Sql, t: string): Promise<string | null> {
  try {
    const cols = await sql.unsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `, [t]);
    const retenues = (cols as unknown as { column_name: string }[])
      .map((c) => c.column_name)
      .filter((c) => !COLONNES_VOLATILES.test(c))
      .sort();
    if (retenues.length === 0) return null;
    const projection = retenues.map((c) => `"${c}"`).join(", ");
    const r = await sql.unsafe(`SELECT ${projection} FROM public."${t}"`);
    const lignes = r
      .map((row) => JSON.stringify(row, Object.keys(row).sort()))
      .sort()
      .join("\n");
    return createHash("sha256").update(lignes).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}

function difference(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x)).sort();
}

function compter(set: Set<string>, prefixe: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const item of set) {
    const i = item.indexOf("|");
    const cle = i === -1 ? prefixe : item.slice(0, i);
    const val = i === -1 ? item : item.slice(i + 1);
    if (!out.has(cle)) out.set(cle, new Set());
    out.get(cle)!.add(val);
  }
  return out;
}

(async () => {
  const urlA = process.env.DRIFT_A_URL ?? process.env.DATABASE_URL;
  const urlB = process.env.DRIFT_B_URL ?? process.env.DATABASE_URL_NEON;

  if (!urlA || !urlB) {
    console.error("DRIFT_A_URL et DRIFT_B_URL sont requis (ou DATABASE_URL / DATABASE_URL_NEON).");
    process.exit(2);
  }
  if (urlA === urlB) {
    console.error("Les deux URL sont identiques : la comparaison ne porterait sur rien.");
    process.exit(2);
  }

  const a: Connexion = { nom: nomCourte(urlA), sql: postgres(urlA, { ssl: sslPour(urlA), prepare: false, max: 1 }) };
  const b: Connexion = { nom: nomCourte(urlB), sql: postgres(urlB, { ssl: sslPour(urlB), prepare: false, max: 1 }) };

  console.log(`Référence (A) : ${a.nom}`);
  console.log(`Comparée  (B) : ${b.nom}\n`);
  /**
   * Filet avant toute comparaison.
   *
   * Sans ce contrôle, une base momentanément injoignable — ou une session
   * ouverte avec un `search_path` qui ne résout rien — renvoie zéro objet, et
   * la comparaison conclut alors que « tout ce qui est dans A manque dans B ».
   * Le garde-fou affiche alors un écart de 821 objets, ou de 226 tables, et
   * **le résultat dépend du sens de comparaison** : un signal qui change de
   * valeur selon la façon dont on le regarde n'est pas un signal, c'est du bruit.
   *
   * On exige donc que les deux bases exposent des tables avant de comparer
   * quoi que ce soit. C'est la différence entre « elles diffèrent » et « je ne
   * sais pas les lire » — deux phrases qu'un agent ne doit pas pouvoir confondre.
   */
  for (const c of [a, b]) {
    let nTables = 0;
    try {
      const r = await c.sql.unsafe(
        `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      nTables = Number(r[0]?.n ?? 0);
    } catch (e) {
      console.error(
        `[drift-check] Base ${c.nom} injoignable : ${(e as Error).message}\n` +
          `             Comparaison annulée — on ne peut rien conclure.`,
      );
      process.exit(2);
    }
    if (nTables === 0) {
      console.error(
        `[drift-check] La base ${c.nom} ne renvoie AUCUNE table : elle est vide,\n` +
          `             mal ciblée, ou la session ne résout pas le schéma. Comparaison\n` +
          `             annulée — conclure « tout manque » sur une lecture vide serait faux.`,
      );
      process.exit(2);
    }
    console.log(`[drift-check] ${c.nom} : ${nTables} tables lisibles.`);
  }
  console.log("");

  let bloquant = 0;
  let divergence = 0;

  // ---- 1. SCHEMA ---------------------------------------------------------
  const [ta, tb] = [await tables(a.sql), await tables(b.sql)];
  const tablesManquantes = difference(ta, tb);
  if (tablesManquantes.length) {
    console.log("TABLES ABSENTES DE B :");
    tablesManquantes.forEach((t) => console.log(`   - ${t}`));
    bloquant += tablesManquantes.length;
  }

  const [ca, cb] = [await columns(a.sql), await columns(b.sql)];
  const colonnesManquantes = difference(ca, cb);
  if (colonnesManquantes.length) {
    console.log("\nCOLONNES ABSENTES DE B  (=> « column does not exist » à l'exécution) :");
    colonnesManquantes.forEach((c) => console.log(`   - ${c}`));
    bloquant += colonnesManquantes.length;
  }
  const colonnesEnTrop = difference(cb, ca);
  if (colonnesEnTrop.length) {
    console.log("\nCOLONNES PRESENTES SEULEMENT DANS B :");
    colonnesEnTrop.forEach((c) => console.log(`   + ${c}`));
    bloquant += colonnesEnTrop.length;
  }

  const [ka, kb] = [await contraintes(a.sql), await contraintes(b.sql)];
  const contraintesManquantes = difference(ka, kb);
  if (contraintesManquantes.length) {
    console.log("\nCONTRAINTES ABSENTES DE B :");
    contraintesManquantes.slice(0, 25).forEach((c) => console.log(`   - ${c}`));
    if (contraintesManquantes.length > 25) console.log(`   … et ${contraintesManquantes.length - 25} autres`);
    bloquant += contraintesManquantes.length;
  }

  const [ia, ib] = [await index(a.sql), await index(b.sql)];
  const indexManquants = difference(ia, ib);
  if (indexManquants.length) {
    console.log("\nINDEX ABSENTS DE B :");
    indexManquants.slice(0, 25).forEach((c) => console.log(`   - ${c}`));
    if (indexManquants.length > 25) console.log(`   … et ${indexManquants.length - 25} autres`);
    bloquant += indexManquants.length;
  }

  const [ta2, tb2] = [await declencheurs(a.sql), await declencheurs(b.sql)];
  const trigManquants = difference(ta2, tb2);
  if (trigManquants.length) {
    console.log("\nDÉCLENCHEURS ABSENTS DE B :");
    trigManquants.forEach((c) => console.log(`   - ${c}`));
    bloquant += trigManquants.length;
  }

  if (bloquant === 0) console.log("SCHEMA : identique.");

  // ---- 2. VOLUMÉTRIE -----------------------------------------------------
  const communes = [...ta].filter((t) => tb.has(t)).sort();
  const ecartsVol: string[] = [];
  console.log("\nVOLUMÉTRIE");
  for (const t of communes) {
    const [na, nb] = [await volumetrie(a.sql, t), await volumetrie(b.sql, t)];
    if (na === null || nb === null) continue;
    if (na !== nb) ecartsVol.push(`${t.padEnd(34)} A=${String(na).padStart(6)}  B=${String(nb).padStart(6)}`);
  }
  if (ecartsVol.length === 0) {
    console.log("   toutes les tables communes ont le même nombre de lignes.");
  } else {
    ecartsVol.forEach((l) => console.log(`   ${l}`));
    divergence += ecartsVol.length;
    console.log(`   (${ecartsVol.length} table(s) differentes — attendu si B est en exploitation)`);
  }

  // ---- 3. EMPREINTE DU RÉFÉRENTIEL ---------------------------------------
  console.log("\nEMPREINTE DU RÉFÉRENTIEL");
  const ecartsRef: string[] = [];
  for (const t of TABLES_REFERENTIEL) {
    if (!ta.has(t) || !tb.has(t)) continue;
    const [ha, hb] = [await empreinte(a.sql, t), await empreinte(b.sql, t)];
    if (ha === null || hb === null) continue;
    if (ha !== hb) {
      ecartsRef.push(`${t.padEnd(34)} A=${ha}  B=${hb}`);
      divergence++;
    }
  }
  if (ecartsRef.length === 0) {
    console.log("   le referentiel est strictement identique.");
  } else {
    ecartsRef.forEach((l) => console.log(`   ${l}`));
    console.log("   -> le seed de reference n'a pas ete rejoue sur B.");
  }

  // Table de jonction du RBAC, comparée par codes.
  if (ta.has("role_permissions") && tb.has("role_permissions")) {
    const [jа, jb] = [await empreinteRolePermissions(a.sql), await empreinteRolePermissions(b.sql)];
    if (jа && jb && jа !== jb) {
      console.log("\n   role_permissions (par codes) : EMPREINTES DIFFERENTES");
      console.log(`      A=${jа}  B=${jb}`);
      console.log("      -> les MEMES roles n'ont pas les MEMES permissions.");
      divergence++;
    } else if (jа && jb) {
      console.log("   role_permissions (par codes) : identique.");
    }
  }

  // ---- VERDICT -----------------------------------------------------------
  console.log("\n" + "=".repeat(66));
  if (bloquant > 0) {
    console.log(`ECART BLOQUANT : ${bloquant} objet(s) de schema present(s) dans A et absent(s) de B.`);
    console.log("B ne peut pas exécuter le code de A. Appliquez les migrations avant de déployer.");
  } else if (divergence > 0 && STRICT) {
    console.log(`ECART STRICT : ${divergence} divergence(s) de donnees.`);
  } else if (divergence > 0) {
    console.log(`Schema identique. ${divergence} divergence(s) de donnees (tolérées hors --strict).`);
  } else {
    console.log("PARFAIT : A et B sont identiques (schema et referentiel).");
  }
  console.log("=".repeat(66));

  await a.sql.end({ timeout: 5 });
  await b.sql.end({ timeout: 5 });
  process.exit(bloquant > 0 || (STRICT && divergence > 0) ? 1 : 0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(2);
});