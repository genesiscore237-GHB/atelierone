/**
 * COPIE LE SOCLE ADMIN d'une base source vers une base cible (simulation multi-garages).
 * Copie : agences, utilisateurs (avec mot de passe hashé), user_roles.
 * Colonnes communes uniquement (source peut avoir des ALTER manuels absents côté cible).
 * Usage : node scripts/sim/copy-admin.cjs <db_source> <db_cible>
 */
const { Client } = require("pg");

async function colonnesCommunes(src, dst, table) {
  const s = (await src.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1`, [table])).rows.map((r) => r.column_name);
  const d = (await dst.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1`, [table])).rows.map((r) => r.column_name);
  return s.filter((c) => d.includes(c));
}

async function copier(source, cible) {
  const src = new Client({ connectionString: source });
  const dst = new Client({ connectionString: cible });
  await src.connect();
  await dst.connect();
  try {
    for (const table of ["agences", "roles", "permissions", "role_permissions", "utilisateurs", "user_roles"]) {
      const cols = await colonnesCommunes(src, dst, table);
      if (cols.length === 0) { console.log(`${table} : aucune colonne commune, ignoré`); continue; }
      const rows = (await src.query(`SELECT ${cols.join(", ")} FROM ${table}`)).rows;
      for (const r of rows) {
        const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
        await dst.query(
          `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${ph}) ON CONFLICT (id) DO NOTHING`,
          cols.map((c) => r[c])
        );
      }
      console.log(`${table} copiés:`, rows.length);
    }
  } finally {
    await src.end();
    await dst.end();
  }
}

const [s, c] = process.argv.slice(2);
if (!s || !c) { console.error("Usage: node copy-admin.cjs <source_dsn> <cible_dsn>"); process.exit(1); }
copier(s, c).then(() => process.exit(0)).catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });