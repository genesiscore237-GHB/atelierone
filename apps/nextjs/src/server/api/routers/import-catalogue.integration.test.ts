import { beforeAll, afterAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * IMPORT CATALOGUE — LOT C3 : la qualification passe la porte de l'import.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS PROUVENT
 *
 *   · le DRY-RUN n'écrit RIEN (aucun article, produit, référence, compatibilité)
 *     et PROJETE ce qu'il créerait — y compris les variantes créées dans le
 *     même jeu de fichiers (projection profonde) ;
 *   · l'article conceptuel (produit_articles) est créé à la volée depuis
 *     `designationArticle` — c'est lui le regroupement formulaire ;
 *   · une référence équivalente sans attache reste REFUSÉE — on ne déduit pas ;
 *   · POSITIVE et NEGATIVE coexistent sur le même attache ;
 *   · un RÉ-IMPORT est idempotent : 0 ligne nouvelle, comptes inchangés ;
 *   · l'attachement est ONE-WAY : le ré-import ne nullifie JAMAIS ce qui a été
 *     rattaché/qualifié à la main entre-temps (refOem pris {au doigt} survit).
 */

const { importerCatalogue } = await import("@atelierone/db");

const NS = "impq"; // invariant : codes fichiers → préfixe NS + suffixes uniques
let dossier = "";

async function q<T>(text: string): Promise<T[]> {
  const r = (await db.execute(sql.raw(text))) as unknown as T[];
  return r as unknown as T[];
}

/** Préfixes stables des clés du dossier de fixtures (categories C_*…). */
const FIX_PREFIXES = ["impq-pce", "impq-cat", "impq-fou", "impq-p-"];
const ARTICLES_NS = ["impq filtre", "impq inconnu complet"];

async function purger() {
  await q(`DELETE FROM compatibilites_produits ct USING produits p WHERE ct.produit_id = p.id AND lower(p.code_barre) LIKE 'impq-p-%'`);
  await q(`DELETE FROM compatibilites_produits ca USING produit_articles a WHERE ca.article_id = a.id AND lower(a.designation) IN ('impq filtre','impq inconnu complet')`);
  await q(`DELETE FROM produit_references_equiv r USING produit_articles a WHERE r.article_id = a.id AND lower(a.designation) IN ('impq filtre','impq inconnu complet')`);
  await q(`DELETE FROM produits WHERE lower(code_barre) LIKE 'impq-p-%'`);
  await q(`DELETE FROM produit_articles WHERE lower(designation) IN ('impq filtre','impq inconnu complet')`);
  await q(`DELETE FROM fournisseurs WHERE lower(code) LIKE 'impq-fou%'`);
  await q(`DELETE FROM categories WHERE lower(code) LIKE 'impq-cat%'`);
  await q(`DELETE FROM unites_mesure WHERE lower(code) LIKE 'impq-pce%'`);
}

beforeAll(async () => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), "impq-import-"));

  fs.writeFileSync(path.join(dossier, "unites.jsonl"), [
    JSON.stringify({ code: "IMPQ-PCE", libelle: "Piece impq", type: "QUANTITE", isActive: true, refSource: "impq-test" }),
  ].join("\n") + "\n");

  fs.writeFileSync(path.join(dossier, "categories.jsonl"), [
    JSON.stringify({ code: "IMPQ-CAT-FIL", nom: "Filtres impq", typeBranche: "PIECE", isActive: true, refSource: "impq-test" }),
  ].join("\n") + "\n");

  fs.writeFileSync(path.join(dossier, "fournisseurs.jsonl"), [
    JSON.stringify({ code: "IMPQ-FOU", nom: "Impq Importer", isActive: true, refSource: "impq-test" }),
  ].join("\n") + "\n");

  fs.writeFileSync(path.join(dossier, "produits.jsonl"), [
    JSON.stringify({ codeBarre: "IMPQ-P-1", typeProduit: "PIECE", designationArticle: "Impq Filtre", titre: "Filtre impq", fournisseurCode: "IMPQ-FOU", categorieCode: "IMPQ-CAT-FIL", uniteBaseCode: "IMPQ-PCE", prixVente: "4500", tva: "19.25", refOem: "90915-IMPQ", refSource: "impq-test" }),
    JSON.stringify({ codeBarre: "IMPQ-P-2", typeProduit: "PIECE", titre: "Plaquette impq", categorieCode: "IMPQ-CAT-FIL", uniteBaseCode: "IMPQ-PCE", prixVente: "18000", tva: "19.25", positionEssieu: "AVANT", refSource: "impq-test" }),
    JSON.stringify({ codeBarre: "IMPQ-P-3", typeProduit: "PIECE", titre: "Sans article impq", categorieCode: "IMPQ-CAT-FIL", uniteBaseCode: "IMPQ-PCE", prixVente: "2500", tva: "19.25", refSource: "impq-test" }),
  ].join("\n") + "\n");

  fs.writeFileSync(path.join(dossier, "references_equiv.jsonl"), [
    JSON.stringify({ articleDesignation: "Impq Filtre", marque: "MANN", reference: "W68-IMPQ", source: "CATALOGUE_MANN", refSource: "impq-test" }),
    JSON.stringify({ codeBarre: "IMPQ-P-1", marque: "TOYOTA", reference: "90915-IMPQ-EQUIV", refSource: "impq-test" }),
    // sans attache : légitime pour le schéma, refusée à l'import
    JSON.stringify({ reference: "SANS-ATTACHE-IMPQ", refSource: "impq-test" }),
  ].join("\n") + "\n");

  fs.writeFileSync(path.join(dossier, "compatibilites.jsonl"), [
    JSON.stringify({ codeBarre: "IMPQ-P-1", marque: "Toyota", modele: "Corolla-impq", anneeDe: 2020, source: "CATALOGUE_EDI", niveauVerification: "CONFIRME", refSource: "impq-test" }),
    JSON.stringify({ articleDesignation: "Impq Filtre", typeCompat: "NEGATIVE", marque: "Nissan", modele: "Qashqai-impq", notes: "Impq exclusion", source: "SAISIE_MAGASINIER", refSource: "impq-test" }),
    // article totalement inconnu : crée l'article à la volée
    JSON.stringify({ articleDesignation: "Impq Inconnu Complet", marque: "Honda", modele: "Jazz-impq", refSource: "impq-test" }),
  ].join("\n") + "\n");

  await purger();
});

afterAll(() => {
  fs.rmSync(dossier, { recursive: true, force: true });
});

it("le DRY-RUN projette tout et n'écrit RIEN", async () => {
  const avant = Number((await q<{ n: string }>(`SELECT count(*) AS n FROM compatibilites_produits`))[0]!.n)
    + Number((await q<{ n: string }>(`SELECT count(*) AS n FROM produit_references_equiv`))[0]!.n);

  const { resultats } = await importerCatalogue({
    dossier,
    dryRun: true,
    cles: ["unites", "categories", "fournisseurs", "produits", "references_equiv", "compatibilites"],
  });

  // rien d'écrit :
  expect((await q<{ n: string }>(`SELECT count(*) AS n FROM produits WHERE lower(code_barre) LIKE 'impq-p-%'`))[0]!.n).toBe("0");
  expect((await q<{ n: string }>(`SELECT count(*) AS n FROM produit_articles WHERE lower(designation) IN ('impq filtre','impq inconnu complet')`))[0]!.n).toBe("0");

  const produits = resultats.find((r) => r.entite === "produits")!;
  const refs = resultats.find((r) => r.entite === "references_equiv")!;
  const compats = resultats.find((r) => r.entite === "compatibilites")!;

  expect(produits.dryRun).toBe(true);
  expect(produits.creees).toBe(3);
  expect(refs.creees).toBe(2); // 1 refusée : sans attache
  expect(refs.details.some((d) => d.includes("REFUSÉ"))).toBe(true);
  // Projection profonde : ce qui sera créable au run réel est compté —
  // la compat Toyota (codeBarre) résout SA variante projetée.
  expect(compats.creees).toBe(3);
  expect(compats.details.filter((d) => d.includes("REFUSÉ")).length).toBe(0);

  const apres = Number((await q<{ n: string }>(`SELECT count(*) AS n FROM compatibilites_produits`))[0]!.n)
    + Number((await q<{ n: string }>(`SELECT count(*) AS n FROM produit_references_equiv`))[0]!.n);
  expect(apres).toBe(avant);
});

it("l'exécution crée articles, produits, attaches et compatibilité", async () => {
  const { resultats } = await importerCatalogue({
    dossier,
    dryRun: false,
    cles: ["unites", "categories", "fournisseurs", "produits", "references_equiv", "compatibilites"],
  });

  const produits = resultats.find((r) => r.entite === "produits")!;
  const refs = resultats.find((r) => r.entite === "references_equiv")!;
  const compats = resultats.find((r) => r.entite === "compatibilites")!;

  expect(produits.creees).toBe(3);
  expect(compats.creees).toBe(3);
  expect(refs.creees).toBe(2);

  // L'article a été créé à la volée et la variante y est rattachée :
  const art = await q<{ id: number; designation: string; n_variantes: string }>(`
    SELECT a.id, a.designation, (SELECT count(*) FROM produits p WHERE p.article_id = a.id) AS n_variantes
    FROM produit_articles a WHERE lower(a.designation) = 'impq filtre'`);
  expect(art).toHaveLength(1);
  expect(Number(art[0]!.n_variantes)).toBe(1); // IMPQ-P-1

  // L'article de la compat "inconnu" a été créé depuis la ligne compat :
  const art2 = await q<{ id: number }>(`
    SELECT a.id FROM produit_articles a WHERE lower(a.designation) = 'impq inconnu complet'`);
  expect(art2).toHaveLength(1);

  // Réfs attachées au bon article :
  const refsRows = await q<{ reference: string; source: string; niveau: string | null; article: string }>(`
    SELECT r.reference, r.source, r.niveau_verification AS niveau, a.designation AS article
    FROM produit_references_equiv r
    JOIN produit_articles a ON a.id = r.article_id
    WHERE lower(a.designation) IN ('impq filtre','impq inconnu complet')
    ORDER BY r.reference`);
  expect(refsRows.map((r) => r.reference).sort()).toEqual(["90915-IMPQ-EQUIV", "W68-IMPQ"]);
  const w68 = refsRows.find((r) => r.reference === "W68-IMPQ")!;
  expect(w68.article).toBe("Impq Filtre");
  expect(w68.source).toBe("CATALOGUE_MANN");
  expect(w68.niveau).toBe("NON_VERIFIE"); // défaut du système : importé NON_VERIFIE

  // Compatibilité POSITIVE sur la variante + NEGATIVE sur l'article coexistent :
  const comps = await q<{ marque: string; modele: string; type: string; produit: string | null; article: string | null; niveau: string | null }>(`
    SELECT c.marque, c.modele, c.type_compat AS type, p.code_barre AS produit, a.designation AS article, c.niveau_verification AS niveau
    FROM compatibilites_produits c
    LEFT JOIN produits p ON p.id = c.produit_id
    LEFT JOIN produit_articles a ON a.id = c.article_id
    WHERE c.marque IN ('Toyota','Nissan','Honda')
      AND (p.code_barre LIKE 'IMPQ-P-%' OR a.designation IN ('Impq Filtre','Impq Inconnu Complet'))`);
  expect(comps).toHaveLength(3);
  expect(comps.map((c) => `${c.marque}|${c.type}|${c.produit ?? c.article}`).sort()).toEqual(
    [
      "Honda|POSITIVE|Impq Inconnu Complet",
      "Nissan|NEGATIVE|Impq Filtre",
      "Toyota|POSITIVE|IMPQ-P-1",
    ].sort(),
  );
  const toy = comps.find((c) => c.marque === "Toyota")!;
  expect(toy.produit).toBe("IMPQ-P-1");
  expect(toy.niveau).toBe("CONFIRME");
});

it("le RÉ-import est idempotent et l'attachement one-way survit", async () => {
  // Qualification à la main entre les deux imports :
  await q(`UPDATE produits SET ref_oem = 'FAX-MANUEL-IMPQ' WHERE code_barre = 'IMPQ-P-2'`);

  const avant = {
    produits: Number((await q<{ n: string }>(`SELECT count(*) AS n FROM produits WHERE lower(code_barre) LIKE 'impq-p-%'`))[0]!.n),
    articles: Number((await q<{ n: string }>(`SELECT count(*) AS n FROM produit_articles WHERE lower(designation) IN ('impq filtre','impq inconnu complet')`))[0]!.n),
    refs: Number((await q<{ n: string }>(`SELECT count(*) AS n FROM produit_references_equiv r JOIN produit_articles a ON a.id = r.article_id WHERE lower(a.designation) IN ('impq filtre','impq inconnu complet')`))[0]!.n),
    comps: Number((await q<{ n: string }>(`SELECT count(*) AS n FROM compatibilites_produits WHERE marque IN ('Toyota','Nissan','Honda') AND (produit_id IS NOT NULL OR article_id IS NOT NULL) AND (modele LIKE '%-impq' OR article_id IS NOT NULL)`))[0]!.n),
  };

  await importerCatalogue({
    dossier,
    dryRun: false,
    cles: ["unites", "categories", "fournisseurs", "produits", "references_equiv", "compatibilites"],
  });

  const apres = {
    produits: Number((await q<{ n: string }>(`SELECT count(*) AS n FROM produits WHERE lower(code_barre) LIKE 'impq-p-%'`))[0]!.n),
    articles: Number((await q<{ n: string }>(`SELECT count(*) AS n FROM produit_articles WHERE lower(designation) IN ('impq filtre','impq inconnu complet')`))[0]!.n),
    refs: Number((await q<{ n: string }>(`SELECT count(*) AS n FROM produit_references_equiv r JOIN produit_articles a ON a.id = r.article_id WHERE lower(a.designation) IN ('impq filtre','impq inconnu complet')`))[0]!.n),
    comps: Number((await q<{ n: string }>(`SELECT count(*) AS n FROM compatibilites_produits WHERE marque IN ('Toyota','Nissan','Honda') AND (produit_id IS NOT NULL OR article_id IS NOT NULL) AND (modele LIKE '%-impq' OR article_id IS NOT NULL)`))[0]!.n),
  };
  expect(apres).toEqual(avant);

  // ONE-WAY : le refOem saisi à la main n'a PAS été nullifié par la ligne
  // IMPQ-P-2 qui ne le mentionne pas.
  const p2 = await q<{ refOem: string | null }>(`SELECT ref_oem AS "refOem" FROM produits WHERE code_barre = 'IMPQ-P-2'`);
  expect(p2[0]!.refOem).toBe("FAX-MANUEL-IMPQ");

  // Et le refOem importé de IMPQ-P-1 est toujours en place :
  const p1 = await q<{ refOem: string | null }>(`SELECT ref_oem AS "refOem" FROM produits WHERE code_barre = 'IMPQ-P-1'`);
  expect(p1[0]!.refOem).toBe("90915-IMPQ");
});
