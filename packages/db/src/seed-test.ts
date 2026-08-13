import "dotenv/config";
import { db } from "./client";
import { sql } from "drizzle-orm";

async function seedTest() {
  console.log("Seeding test data for bourse E2E tests...");

  // Apply missing migration columns (schema drift fix)
  const migrationStatements = [
    `ALTER TABLE produits ADD COLUMN IF NOT EXISTS prix_minimum_vente numeric(12, 2)`,
    `ALTER TABLE produits ADD COLUMN IF NOT EXISTS type_produit varchar(20) DEFAULT 'FOURNITURE'`,
    `ALTER TABLE produits ADD COLUMN IF NOT EXISTS statut_officiel varchar(20) DEFAULT 'OFFICIEL'`,
    `ALTER TABLE produits ADD COLUMN IF NOT EXISTS niveau_id uuid`,
    `ALTER TABLE rachats ADD COLUMN IF NOT EXISTS type varchar(50) DEFAULT 'rachat_simple'`,
    `ALTER TABLE rachats ADD COLUMN IF NOT EXISTS stocke boolean DEFAULT false`,
    `ALTER TABLE rachats ADD COLUMN IF NOT EXISTS vente_id integer`,
    `ALTER TABLE rachats ADD COLUMN IF NOT EXISTS montant_echange numeric(12, 2)`,
    `ALTER TABLE rachats ADD COLUMN IF NOT EXISTS difference numeric(12, 2)`,
    `ALTER TABLE rachats_lignes ADD COLUMN IF NOT EXISTS prix_reseal numeric(12, 2)`,
    `ALTER TABLE rachats_lignes ADD COLUMN IF NOT EXISTS lot_id integer`,
    `ALTER TABLE rachats_lignes ADD COLUMN IF NOT EXISTS vendu boolean DEFAULT false`,
    `ALTER TABLE rachats_lignes ADD COLUMN IF NOT EXISTS vente_ligne_id integer`,
    `ALTER TABLE lots ADD COLUMN IF NOT EXISTS date_reception timestamp`,
    `ALTER TABLE lots ADD COLUMN IF NOT EXISTS quantite_initiale integer`,
    `ALTER TABLE lots ADD COLUMN IF NOT EXISTS cout_unitaire numeric(12, 2)`,
    `ALTER TABLE lots ADD COLUMN IF NOT EXISTS statut varchar(50) DEFAULT 'disponible'`,
    `ALTER TABLE lots ADD COLUMN IF NOT EXISTS date_entree timestamp DEFAULT now()`,
    `ALTER TABLE lots ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true`,
    `CREATE SEQUENCE IF NOT EXISTS lots_id_seq`,
    `SELECT setval('lots_id_seq', COALESCE((SELECT MAX(id) FROM lots), 0) + 1, false)`,
    `ALTER TABLE lots ALTER COLUMN id SET DEFAULT nextval('lots_id_seq')`,
  ];
  for (const stmt of migrationStatements) {
    try { await db.execute(sql.raw(stmt)); } catch (e: any) { if (!e?.message?.includes('already exists')) console.error('Migration warn:', stmt, e?.message); }
  }
  console.log("Applied missing bourse migrations");

  // 1. Ensure reference data exists (niveaux, sous_systemes)
  let rows = await db.execute(sql`SELECT id FROM sous_systemes WHERE code = 'FR' LIMIT 1`);
  if (!(rows as any[]).length) {
    await db.execute(sql`INSERT INTO sous_systemes (code, libelle) VALUES ('FR', 'Francophone'), ('EN', 'Anglophone')`);
    console.log("Created sous_systemes (FR, EN)");
  }
  rows = await db.execute(sql`SELECT id FROM sous_systemes WHERE code = 'FR' LIMIT 1`);
  const ssFr = (rows as any[])[0]?.id;
  rows = await db.execute(sql`SELECT id FROM sous_systemes WHERE code = 'EN' LIMIT 1`);
  const ssEn = (rows as any[])[0]?.id;

  const niveauxToInsert = [
    { code: 'MAT', libelle: 'Maternelle', ordre: 1, ssId: ssFr },
    { code: 'PRIM', libelle: 'Primaire', ordre: 2, ssId: ssFr },
    { code: 'SEC', libelle: 'Secondaire', ordre: 3, ssId: ssFr },
    { code: 'NURSERY', libelle: 'Nursery', ordre: 1, ssId: ssEn },
    { code: 'PRIMARY', libelle: 'Primary', ordre: 2, ssId: ssEn },
    { code: 'SECONDARY', libelle: 'Secondary', ordre: 3, ssId: ssEn },
  ];
  for (const n of niveauxToInsert) {
    const existing = await db.execute(sql`SELECT id FROM niveaux WHERE code = ${n.code} LIMIT 1`);
    if (!(existing as any[]).length) {
      await db.execute(sql`INSERT INTO niveaux (code, libelle, ordre, sous_systeme_id) VALUES (${n.code}, ${n.libelle}, ${n.ordre}, ${n.ssId}::uuid)`);
    }
  }
  console.log("Reference data (niveaux) ready");

  const secRows = await db.execute(sql`SELECT id FROM niveaux WHERE code = 'SEC' LIMIT 1`);
  const secNiveauId = (secRows as any[])[0].id;

  // 2. Find agence + operateur
  const agenceRows = await db.execute(sql`SELECT id FROM agences LIMIT 1`);
  if (!(agenceRows as any[]).length) throw new Error("No agency found");
  const agenceId = (agenceRows as any[])[0].id;

  const opRows = await db.execute(sql`SELECT id FROM utilisateurs WHERE email = 'operateur@atelierone.cm' LIMIT 1`);
  if (!(opRows as any[]).length) throw new Error("operateur@atelierone.cm not found");
  const operateurId = (opRows as any[])[0].id;

  // 3. Find category + supplier
  const catRows = await db.execute(sql`SELECT id FROM categories WHERE code IN ('LIV-SCO-SEC', 'LIV-SCO') LIMIT 1`);
  const catId = (catRows as any[])[0]?.id ?? null;
  const fournRows = await db.execute(sql`SELECT id FROM fournisseurs LIMIT 1`);
  const fournisseurId = (fournRows as any[])[0]?.id ?? null;

  // 4. Find or create "Test Book" product (raw SQL to avoid schema-vs-DB drift)
  const existingRows = await db.execute(sql`SELECT id, titre, code_barre, type_produit, statut_officiel, statut, prix_vente FROM produits WHERE code_barre = 'TST-BK-001' LIMIT 1`);
  let testProduct: any;
  if (!(existingRows as any[]).length) {
    const res = await db.execute(sql`
      INSERT INTO produits (titre, code_barre, isbn, type_produit, statut_officiel, statut, niveau_id, prix_vente, prix_achat, tva, categorie_id, fournisseur_id, auteur, editeur, seuil_alerte, seuil_critique, unite_vente, unite_achat)
      VALUES ('Test Book (Manuel Scolaire)', 'TST-BK-001', '9781234567890', 'MANUEL', 'OFFICIEL', 'actif', ${secNiveauId}::uuid, 2500, 1500, 5.5, ${catId}, ${fournisseurId}, 'Test Author', 'Test Publisher', 5, 2, 'unite', 'unite')
      RETURNING id
    `);
    testProduct = { id: (res as any[])[0]?.id };
    console.log(`Created product: Test Book (id=${testProduct.id})`);
  } else {
    testProduct = (existingRows as any[])[0];
    console.log(`Found existing product: ${testProduct.titre} (id=${testProduct.id})`);
    if (testProduct.type_produit !== 'MANUEL' || testProduct.statut_officiel !== 'OFFICIEL') {
      await db.execute(sql`UPDATE produits SET type_produit = 'MANUEL', statut_officiel = 'OFFICIEL', statut = 'actif', niveau_id = ${secNiveauId}::uuid, prix_vente = 2500 WHERE id = ${testProduct.id}`);
      console.log("Updated product with bourse-eligible fields");
    }
  }

  // 5. Create stock for the product
  const stockRows = await db.execute(sql`SELECT id FROM stocks WHERE produit_id = ${testProduct.id} AND agence_id = ${agenceId} AND lot_id IS NULL LIMIT 1`);
  if (!(stockRows as any[]).length) {
    await db.execute(sql`INSERT INTO stocks (produit_id, agence_id, quantite) VALUES (${testProduct.id}, ${agenceId}, 50)`);
    console.log("Created stock entry (qty=50)");
  }

  // 6. Create rachat + lot + stock (lot) for revente tests
  const lotRows = await db.execute(sql`SELECT id FROM lots WHERE produit_id = ${testProduct.id} LIMIT 1`);
  if (!(lotRows as any[]).length) {
    const maxR = await db.execute(sql`SELECT COALESCE(MAX(id), 0) + 1 AS next FROM rachats`);
    const rachatId = Number((maxR as any[])[0]?.next ?? 1);
    const ref = `BRS-TEST-${Date.now()}`;

    await db.execute(sql`INSERT INTO rachats (id, reference, client_nom, client_contact, agence_id, operateur_id, montant_total, type, stocke, statut) VALUES (${rachatId}, ${ref}, 'Client Test Bourse', '60000000', ${agenceId}, ${operateurId}, 1250, 'rachat_bourse', true, 'termine')`);
    console.log(`Created rachat #${rachatId}`);

    const maxL = await db.execute(sql`SELECT COALESCE(MAX(id), 0) + 1 AS next FROM lots`);
    const lotId = Number((maxL as any[])[0]?.next ?? 1);

    await db.execute(sql`INSERT INTO lots (id, produit_id, numero_lot, date_reception, statut, quantite_initiale, cout_unitaire) VALUES (${lotId}, ${testProduct.id}, ${`BRS-${ref}-${testProduct.id}`}, NOW(), 'stocke', 5, 500)`);
    console.log(`Created lot #${lotId}`);

    const maxRl = await db.execute(sql`SELECT COALESCE(MAX(id), 0) + 1 AS next FROM rachats_lignes`);
    const rlId = Number((maxRl as any[])[0]?.next ?? 1);

    await db.execute(sql`INSERT INTO rachats_lignes (id, rachat_id, produit_id, quantite, prix_unitaire, etat, total_ligne, prix_reseal, lot_id, vendu) VALUES (${rlId}, ${rachatId}, ${testProduct.id}, 1, 500, 'usage', 500, 650, ${lotId}, false)`);
    console.log(`Created rachats_lignes #${rlId}`);

    await db.execute(sql`INSERT INTO stocks (produit_id, agence_id, lot_id, quantite) VALUES (${testProduct.id}, ${agenceId}, ${lotId}, 5)`);
    console.log(`Created stock for lot #${lotId} (qty=5)`);
  } else {
    // Update existing lot statut to "stocke"
    await db.execute(sql`UPDATE lots SET statut = 'stocke' WHERE statut = 'disponible' AND produit_id = ${testProduct.id}`);
    console.log("Updated existing lots statut to stocke");
  }

  console.log("Test seed completed successfully!");
}

seedTest()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
