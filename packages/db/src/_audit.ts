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

async function q<T>(label: string, query: Parameters<typeof db.execute>[0]) {
  try {
    const rows = await db.execute<T>(query);
    console.log(`\n=== ${label} ===`);
    for (const r of rows as Array<Record<string, unknown>>) {
      console.log(JSON.stringify(r));
    }
  } catch (e) {
    console.log(`\n=== ${label} === ERREUR: ${(e as Error).message.slice(0, 150)}`);
  }
}

async function main() {
  await q<{ total: string }>("TOTAL produits", sql`
    SELECT count(*) AS total FROM produits
  `);

  await q<{ k: string; n: string }>("Comptages qualité (ligne = 1 critère)", sql`
    SELECT 'total' AS k, count(*)::text AS n FROM produits
    UNION ALL SELECT 'categorie_id NULL', count(*)::text FROM produits WHERE categorie_id IS NULL
    UNION ALL SELECT 'unite_base_id NULL', count(*)::text FROM produits WHERE unite_base_id IS NULL
    UNION ALL SELECT 'sous_systeme_id NULL', count(*)::text FROM produits WHERE sous_systeme_id IS NULL
    UNION ALL SELECT 'prix_vente <= 0', count(*)::text FROM produits WHERE prix_vente IS NULL OR prix_vente <= 0
    UNION ALL SELECT 'prix_minimum > prix_vente', count(*)::text FROM produits WHERE prix_minimum_vente IS NOT NULL AND prix_minimum_vente > prix_vente
    UNION ALL SELECT 'prix_achat NULL', count(*)::text FROM produits WHERE prix_achat IS NULL
    UNION ALL SELECT 'statut_cycle_vie != VALIDE', count(*)::text FROM produits WHERE statut_cycle_vie IS DISTINCT FROM 'VALIDE'
    UNION ALL SELECT 'statut != actif', count(*)::text FROM produits WHERE statut IS DISTINCT FROM 'actif'
    UNION ALL SELECT 'is_active false', count(*)::text FROM produits WHERE is_active = false
    UNION ALL SELECT 'titre vide', count(*)::text FROM produits WHERE btrim(titre) = ''
    UNION ALL SELECT 'type_produit inattendu', count(*)::text FROM produits WHERE type_produit NOT IN ('FOURNITURE','LIVRE','MANUEL','IMPRIME')
    UNION ALL SELECT 'unite_vente NULL/vide', count(*)::text FROM produits WHERE unite_vente IS NULL OR btrim(unite_vente) = ''
    UNION ALL SELECT 'sans ligne stock', count(*)::text FROM produits p
      WHERE NOT EXISTS (SELECT 1 FROM stocks s WHERE s.produit_id = p.id)
  `);

  await q<{ k: string; n: string }>("Incohérences livre (niveau/matiere)", sql`
    SELECT 'niveau_id NULL mais niveau_scolaire renseigne' AS k, count(*)::text AS n FROM produits WHERE niveau_id IS NULL AND niveau_scolaire IS NOT NULL
    UNION ALL SELECT 'niveau_scolaire NULL mais niveau_id renseigne', count(*)::text FROM produits WHERE niveau_scolaire IS NULL AND niveau_id IS NOT NULL
    UNION ALL SELECT 'matiere_id NULL mais matiere renseigne', count(*)::text FROM produits WHERE matiere_id IS NULL AND matiere IS NOT NULL
    UNION ALL SELECT 'sans sous_systeme (manuels attendus)', count(*)::text FROM produits WHERE type_produit IN ('LIVRE','MANUEL') AND sous_systeme_id IS NULL
  `);

  await q<{ titre: string; n: string }>("Doublons titre (meme titre)", sql`
    SELECT titre, count(*)::text AS n FROM produits GROUP BY titre HAVING count(*) > 1 ORDER BY n DESC LIMIT 10
  `);

  await q<Record<string, string>>("TOP 12 produits incomplets (sans unite_base ni categorie)", sql`
    SELECT p.id::text, left(p.titre, 40) AS titre, p.type_produit, p.statut_cycle_vie,
           (p.categorie_id IS NULL)::text AS sans_cat, (p.unite_base_id IS NULL)::text AS sans_unite,
           (p.prix_vente <= 0)::text AS prix_0, (p.prix_achat IS NULL)::text AS sans_achat
    FROM produits p
    WHERE p.categorie_id IS NULL OR p.unite_base_id IS NULL OR p.prix_vente <= 0 OR p.prix_achat IS NULL OR p.statut_cycle_vie IS DISTINCT FROM 'VALIDE' OR p.is_active = false
    ORDER BY p.id LIMIT 12
  `);

  await q<Record<string, string>>("FK casses (categorie inexistante)", sql`
    SELECT count(*)::text AS n FROM produits p
    LEFT JOIN categories c ON c.id = p.categorie_id
    WHERE p.categorie_id IS NOT NULL AND c.id IS NULL
  `);

  await q<Record<string, string>>("Stocks: produits sans unite_reference / quantite 0", sql`
    SELECT 'lignes stock totales' AS k, count(*)::text AS n FROM stocks
    UNION ALL SELECT 'lignes quantite <= 0', count(*)::text FROM stocks WHERE quantite <= 0
    UNION ALL SELECT 'lignes sans unite_reference_id', count(*)::text FROM stocks WHERE unite_reference_id IS NULL
  `);

  await q<Record<string, string>>("Categories & unites de base", sql`
    SELECT 'categories' AS k, count(*)::text AS n FROM categories
    UNION ALL SELECT 'unites_mesure', count(*)::text FROM unites_mesure
  `);

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
