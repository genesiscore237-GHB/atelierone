import postgres from "postgres";

const sql = postgres("postgresql://postgres:postgres@localhost:5432/atelierone_erp");

const counts = await sql`
  SELECT
    (SELECT count(*) FROM produit_articles WHERE is_active = true) AS articles,
    (SELECT count(*) FROM produits WHERE is_active = true) AS produits_total,
    (SELECT count(*) FROM produits WHERE is_active = true AND niveau = 'ARTICLE') AS produits_article,
    (SELECT count(*) FROM produits WHERE is_active = true AND niveau = 'VARIANTE') AS produits_variante,
    (SELECT count(*) FROM produits WHERE is_active = true AND (niveau IS NULL OR niveau = '')) AS produits_sans_niveau,
    (SELECT count(*) FROM produits WHERE is_active = true AND article_id IS NOT NULL) AS produits_avec_article_id
`;
console.log(JSON.stringify(counts, null, 1));

const sample = await sql`SELECT id, titre, code_article, type_produit, niveau, article_id, marque, designation_courte FROM produits WHERE is_active = true ORDER BY id DESC LIMIT 5`;
console.log("echantillon:", JSON.stringify(sample, null, 1));

const pa = await sql`SELECT id, code, designation, type_produit, categorie_id FROM produit_articles WHERE is_active = true ORDER BY id DESC LIMIT 5`;
console.log("produit_articles:", JSON.stringify(pa, null, 1));

await sql.end();