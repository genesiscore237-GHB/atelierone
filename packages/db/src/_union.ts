import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "./client";

async function main() {
  const productIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const catIds = ["1", "2", "3"];
  try {
    const enrich = await db.execute(sql<{
      kind: string; pid: string; v: string;
    }[]>`
      SELECT 'stock' AS kind, s.produit_id::text AS pid, COALESCE(SUM(s.quantite), 0)::text AS v
      FROM stocks s
      WHERE s.produit_id IN (${sql.join(productIds.map(id => sql`${Number(id)}`), sql`, `)})
      GROUP BY s.produit_id
      UNION ALL
      SELECT 'cat' AS kind, c.id::text AS pid, c.nom AS v
      FROM categories c
      WHERE c.id IN (${sql.join(catIds.map(id => sql`${Number(id)}`), sql`, `)})
      UNION ALL
      SELECT 'unit' AS kind, pu.produit_id::text AS pid,
        pu.unite_id || '|' || um.libelle || '|' || COALESCE(um.symbole, '') || '|' || COALESCE(pu.facteur_vers_base::text, '1') AS v
      FROM produit_unites pu
      JOIN unites_mesure um ON um.id = pu.unite_id
      WHERE pu.statut = 'ACTIF' AND pu.produit_id IN (${sql.join(productIds.map(id => sql`${Number(id)}`), sql`, `)})
    `);
    console.log("rows:", enrich.length);
    console.log(enrich.slice(0, 10));
  } catch (e) {
    console.error("ERROR:", (e as Error).message);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
