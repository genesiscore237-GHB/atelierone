import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  ssl: "require",
  max: 2,
  idle_timeout: 60,
});
const db = drizzle(client, { schema: {} as never });

async function main() {
  const rows = await db.execute<{ col: string; val: string | null; n: string }>(sql`
    SELECT 'statut_cycle_vie' AS col, statut_cycle_vie::text AS val, count(*)::text AS n FROM produits GROUP BY 2
    UNION ALL SELECT 'statut', statut::text, count(*)::text FROM produits GROUP BY 2
    UNION ALL SELECT 'type_produit', type_produit::text, count(*)::text FROM produits GROUP BY 2
    ORDER BY col, val
  `);
  for (const r of rows) console.log(`${r.col} = '${r.val}' -> ${r.n}`);

  console.log("\n=== produits de test / suspects ===");
  const test = await db.execute<Record<string, string>>(sql`
    SELECT id::text, left(titre, 50) AS titre, code_barre, statut_cycle_vie, statut, is_active::text
    FROM produits
    WHERE lower(titre) LIKE '%test%' OR lower(titre) LIKE '%scolaire%' AND length(titre) < 30 OR lower(titre) LIKE '%essai%' OR lower(titre) LIKE '%temporary%'
    ORDER BY id LIMIT 15
  `);
  for (const r of test) console.log(JSON.stringify(r));

  console.log("\n=== BROUILLON (jamais finalises) ===");
  const b = await db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM produits WHERE statut_cycle_vie = 'BROUILLON'`);
  console.log(JSON.stringify(b[0]));
  const bId = await db.execute<{ min: string; max: string }>(sql`
    SELECT min(id)::text AS min, max(id)::text AS max FROM produits WHERE statut_cycle_vie = 'BROUILLON'
  `);
  console.log(JSON.stringify(bId[0]));

  console.log("\n=== produits NON actifs ===");
  const na = await db.execute<{ val: string; n: string }>(sql`
    SELECT statut::text AS val, count(*)::text AS n FROM produits WHERE statut IS DISTINCT FROM 'actif' GROUP BY 1
  `);
  for (const r of na) console.log(`statut='${r.val}' -> ${r.n}`);

  console.log("\n=== 17 sans unite_base + 9 sans categorie (id + titre) ===");
  const nu = await db.execute<Record<string, string>>(sql`
    SELECT id::text, left(titre, 45) AS titre, type_produit, (categorie_id IS NULL)::text AS sans_cat, statut_cycle_vie
    FROM produits WHERE unite_base_id IS NULL OR categorie_id IS NULL ORDER BY id LIMIT 20
  `);
  for (const r of nu) console.log(JSON.stringify(r));

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
