/**
 * SEED DU RÉFÉRENTIEL DES CATÉGORIES GARAGE (16 familles, ~320 catégories).
 * Usage : pnpm -F @atelierone/nextjs exec tsx scripts/seed-categories-garage.ts
 * Idempotent : codes uniques (ON CONFLICT DO NOTHING).
 * Inclut la migration des 14 anciennes catégories : réassignation des produits
 * existants vers les nouvelles catégories correspondantes + désactivation.
 */
import postgres from "postgres";
import { REFERENTIEL_GARAGE } from "../src/server/db/seed-data/categories-garage";

const BASES = ["atelierone_erp", "atelierone_central", "atelierone_erp_b", "atelierone_erp_c"];

const MIGRATION_ANCIENNES: Record<string, string> = {
  Filtres: "G0101", // filtres → famille 1.1 Filtres
  Freinage: "G02",
  Lubrifiants: "G0301", // lubrifiants → huiles moteur
  "Électricité": "G06",
  "Éclairage": "G0602",
  Distribution: "G0103",
  Suspension: "G0502",
  Pneumatiques: "G12",
  Divers: "G16",
  Outillage: "G13",
  "Équipement de protection": "G1304",
  "Consommables": "G14",
  "Main d'œuvre": null, // conservée (SERVICE)
};

async function seedBase(base: string) {
  const sql = postgres(`postgresql://postgres:postgres@127.0.0.1:5432/${base}`, { max: 1 });
  let total = 0;

  const inserer = async (nom: string, code: string, typeBranche: string | null, parentId: number | null) => {
    const rows = await sql`INSERT INTO categories (nom, code, type_branche, parent_id, is_active)
      VALUES (${nom}, ${code}, ${typeBranche}, ${parentId}, true)
      ON CONFLICT (code) DO NOTHING
      RETURNING id`.catch((e) => {
      // Le code existe déjà (ON CONFLICT ne retourne rien) → récupérer son id
      return [];
    });
    if (rows.length > 0) {
      total++;
      return rows[0].id as number;
    }
    const [ex] = await sql`SELECT id FROM categories WHERE code = ${code}`;
    return (ex?.id as number) ?? null;
  };

  let idxFamille = 0;
  for (const famille of REFERENTIEL_GARAGE) {
    idxFamille++;
    const codeFamille = `G${String(idxFamille).padStart(2, "0")}`;
    const familleId = await inserer(famille.nom, codeFamille, famille.typeBranche, null);

    if (famille.sous) {
      let idxSous = 0;
      for (const sous of famille.sous) {
        idxSous++;
        const codeSous = `${codeFamille}${String(idxSous).padStart(2, "0")}`;
        const sousId = await inserer(sous.nom, codeSous, famille.typeBranche, familleId);
        let idxArt = 0;
        for (const article of sous.articles) {
          idxArt++;
          const codeArt = `${codeSous}${String(idxArt).padStart(2, "0")}`;
          await inserer(article, codeArt, famille.typeBranche, sousId);
        }
      }
    } else if (famille.articles) {
      let idxArt = 0;
      for (const article of famille.articles) {
        idxArt++;
        const codeArt = `${codeFamille}${String(idxArt).padStart(2, "0")}`;
        await inserer(article, codeArt, famille.typeBranche, familleId);
      }
    }
  }

  // ── Migration des anciennes catégories ──
  const anciennes = await sql`SELECT id, nom, code FROM categories WHERE id <= 14`;
  for (const a of anciennes) {
    const cible = MIGRATION_ANCIENNES[a.nom as string];
    if (cible === null) continue; // Main d'œuvre conservée
    if (!cible) continue; // pas de mapping (2 catégories restantes)
    const [nouvelle] = await sql`SELECT id FROM categories WHERE code = ${cible}`;
    if (nouvelle) {
      await sql`UPDATE produits SET categorie_id = ${nouvelle.id} WHERE categorie_id = ${a.id}`;
    }
    await sql`UPDATE categories SET is_active = false WHERE id = ${a.id}`;
  }

  // Le mapping par nom peut rater (apostrophes) → désactiver aussi les restantes non mappées (hors Main d'œuvre)
  await sql`UPDATE categories SET is_active = false WHERE id <= 14 AND nom <> 'Main d''œuvre' AND is_active = true AND NOT EXISTS (SELECT 1 FROM produits WHERE categorie_id = categories.id)`;

  const [count] = await sql`SELECT COUNT(*) AS n FROM categories`;
  console.log(`[${base}] : ${total} catégories créées — total en base : ${count.n}`);
  await sql.end();
}

(async () => {
  for (const base of BASES) {
    try {
      await seedBase(base);
    } catch (e) {
      console.error(`[${base}] ERREUR :`, (e as Error).message);
    }
  }
  console.log("SEED RÉFÉRENTIEL TERMINÉ");
})();