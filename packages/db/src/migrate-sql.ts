import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLocalOrForced, sslPourUrl } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("application des migrations SQL (migrate-sql.ts)");

/**
 * APPLICATION DES MIGRATIONS SQL, DANS L'ORDRE DU JOURNAL
 *
 * Pourquoi ne pas utiliser `drizzle-kit migrate` ?
 *
 * 1. Le journal `__drizzle_migrations` n'est fiable que si chaque migration y a
 *    été enregistrée. Sur une base reprise enmain (import, restauration,
 *    création manuelle), il est vide ou faux : drizzle rejoue alors le schéma
 *    ENTIER, ce qui échoue — ou pire, succeeds en recréant des tables.
 * 2. `drizzle-kit migrate` applique `0000` en premier. Or les migrations de
 *    cette application ne SuppORTENT PAS de repartir d'une base vide : elles
 *    supposent un socle déjà en place (catalogue, agences, rôles).
 * 3. Les timestamps du journal étaient, jusqu'à la migration 0011, NON
 *    CROISSANTS : drizzle ignorait silencieusement six migrations, sur toutes
 *    les bases.
 *
 * Ce moteur applique les fichiers `.sql` dans l'ordre du journal, un par un,
 * chacun dans sa propre transaction, et ENREGISTRE ce qu'il a fait dans
 * `drizzle.__drizzle_migrations` avec le `when` du journal — ce qui rend
 * `drizzle-kit migrate` inoffensif ensuite, puisqu'il n'aura plus rien à jouer.
 *
 * Chaque migration de ce dépôt est idempotente (`IF NOT EXISTS`, `DO $$`,
 * `DROP … IF EXISTS` avant `CREATE`) : un rejeu ne casse rien.
 *
 *   pnpm -F @atelierone/db migrate:sql
 *   FORCE=1 … --target   applique sur une base distante
 *   --force              réapplique tout (dépannage)
 */

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER = path.resolve(ICI, "..", "drizzle");
const JOURNAL = path.join(DOSSIER, "meta", "_journal.json");

type Entree = { idx: number; when: number; tag: string };

function chargerJournal(): Entree[] {
  const brut = JSON.parse(readFileSync(JOURNAL, "utf8")) as {
    entries: Entree[];
  };
  // Tri par `when` ET par `idx` : c'est le contournement du défaut historique
  // (timestamps non croissants) qui faisait sauter des migrations à drizzle.
  return [...brut.entries].sort((a, b) => a.when - b.when || a.idx - b.idx);
}

/**
 * Découpe un script SQL en instructions.
 *
 * Un découpage naïf sur `;` casse les blocs `DO $tag$ … $tag$` : le point-virgule
 * interne du corps du bloc est pris pour une fin d'instruction, et PostgreSQL
 * répond « chaîne entre guillemets dollars non terminée ». Trois migrations de
 * ce dépôt utilisent ce mécanisme (`0007`, `0009`, `0010`).
 *
 * On parcourt donc le texte caractère par caractère en suivant l'état
 * courant : commentaire ligne, commentaire bloc, chaîne simple, identifiant
 * quoté, bloc dollar-quoté. Seul un `;` hors de ces zones termine une
 * instruction.
 */
function splitSql(src: string): string[] {
  const out: string[] = [];
  let courant = "";
  let i = 0;
  let dollarTag: string | null = null;

  while (i < src.length) {
    const c = src[i];
    const deux = src.slice(i, i + 2);

    if (dollarTag) {
      if (src.startsWith(dollarTag, i)) {
        courant += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      courant += c;
      i++;
      continue;
    }
    if (deux === "--") {
      const fin = src.indexOf("\n", i);
      const stop = fin === -1 ? src.length : fin;
      courant += src.slice(i, stop);
      i = stop;
      continue;
    }
    if (deux === "/*") {
      const fin = src.indexOf("*/", i + 2);
      const stop = fin === -1 ? src.length : fin + 2;
      courant += src.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "'" && src[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (src[j] === "'") break;
        j++;
      }
      courant += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '"') {
      const fin = src.indexOf('"', i + 1);
      const stop = fin === -1 ? src.length : fin + 1;
      courant += src.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(src.slice(i));
      if (m) {
        dollarTag = m[0];
        courant += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (c === ";") {
      if (courant.trim()) out.push(courant.trim());
      courant = "";
      i++;
      continue;
    }
    courant += c;
    i++;
  }
  if (courant.trim()) out.push(courant.trim());
  return out;
}

(async () => {
  const url = process.env.DATABASE_URL!;
  const db = postgres(url, {
    ssl: sslPourUrl(url),
    prepare: false,
    max: 1,
    // Les migrations émettent des NOTICE volontaires (« trigger : n'existe pas,
    // poursuite du traitement »). Les laisser remonter sur la sortie standard
    // noie le rapport de migration et fait croire à une erreur.
    onnotice: () => {},
  });
  const forcer = process.argv.includes("--force");

  const entrees = chargerJournal();
  const nom = new URL(url).host + "/" + new URL(url).pathname.slice(1);

  await db.unsafe("CREATE SCHEMA IF NOT EXISTS drizzle;");
  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );`);

  const deja = new Set(
    (
      (await db.unsafe("SELECT created_at FROM drizzle.__drizzle_migrations;")) as unknown as {
        created_at: string;
      }[]
    ).map((r) => String(r.created_at)),
  );

  console.log(`=== MIGRATIONS SQL — ${nom} ===`);
  console.log(`${entrees.length} migration(s) au journal, ${deja.size} déjà enregistrée(s).`);
  if (!forcer) console.log("(--force rejoue tout ; sans ce drapeau, seules les nouvelles sont appliquées.)\n");
  else console.log();

  let appliquees = 0;
  let marquesSole = 0;
  const echecs: string[] = [];

  for (const e of entrees) {
    const fichier = path.join(DOSSIER, `${e.tag}.sql`);
    let sql: string;
    try {
      sql = readFileSync(fichier, "utf8");
    } catch {
      console.log(`  SKIP  ${e.tag} — fichier absent du disque`);
      continue;
    }
    const hash = createHash("sha256").update(sql).digest("hex");

    if (deja.has(String(e.when)) && !forcer) continue;

    try {
      // `statement-breakpoint` est un commentaire SQL : psql le tronque
      // naturellement. On retire les lignes vides pour éviter les
      // instructions vides sur certains clients.
      const corps = sql.replace(/-->\s*statement-breakpoint/g, "\n");
      const instructions = splitSql(corps);
      await db.unsafe(`BEGIN;`);
      for (const stmt of instructions) {
        await db.unsafe(stmt);
      }
      await db.unsafe(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
         VALUES ('${hash}', ${e.when})
         ON CONFLICT DO NOTHING;`,
      );
      await db.unsafe("COMMIT;");
      console.log(`  OK    ${e.tag}`);
      appliquees++;
    } catch (err) {
      await db.unsafe("ROLLBACK;");
      const message = (err as Error).message;
      // Les migrations de SOLE (idx <= 3) CRÉENT le schéma : par construction
      // elles ne sont pas idempotentes — les rendre telles reviendrait à
      // réécrire l'histoire du dépôt. Sur une base qui les a déjà (import,
      // restauration, reprise en main), les rejouer échoue
      // systématiquement sur « already exists ».
      //
      // Ce cas n'est donc pas une erreur : la migration EST appliquée, la base
      // le prouve par ses objets. On l'enregistre, en le signalant — car un
      // administrateur doit savoir que la base a été alignée par recognizes
      // et non par exécution, et donc que son schéma n'est pas forcément
      // celui qu'aurait produit cette migration.
      const estSole = e.idx <= 3;
      const dejaLa = /already exists|existe déjà/i.test(message);
      if (estSole && dejaLa) {
        await db.unsafe(
          `INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
           VALUES ('${hash}', ${e.when}) ON CONFLICT DO NOTHING;`,
        );
        marquesSole++;
        console.log(`  DÉJÀ  ${e.tag} — schéma présent, marquée sans exécution`);
        appliquees++;
        continue;
      }
      echecs.push(`${e.tag} :: ${message}`);
      console.log(`  ECHEC ${e.tag}`);
      console.log(`        ${message.split("\n")[0]}`);
    }
  }

  if (marquesSole) {
    console.log(
      `\n${marquesSole} migration(s) de socle marquées SANS exécution : leurs objets\n` +
        `  existent déjà. La base a été alignée sur le journal, pas rejouée.`,
    );
  }

  console.log(`\nAppliquées : ${appliquees}. En échec : ${echecs.length}.`);
  if (echecs.length) {
    echecs.forEach((f) => console.log(`   - ${f}`));
    await db.end({ timeout: 5 });
    process.exit(1);
  }
  await db.end({ timeout: 5 });
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", (e as Error).message);
  process.exit(1);
});