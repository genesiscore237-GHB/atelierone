import "dotenv/config";
import path from "path";
import { existsSync } from "fs";
import postgres from "postgres";
import { chargerFichier, validerEntite, ORDRE_IMPORT } from "./import/engine";
import type { EntiteCle } from "./import/engine";

/**
 * VÉRIFICATION DE CONFORMITÉ AVANT / APRÈS IMPORT.
 *
 * Usage :
 *   tsx src/verify-deploy.ts <dossier-import>            → conformité des fichiers
 *   tsx src/verify-deploy.ts <dossier-import> --data     → conformité + invariants en base
 *
 * Sortie : 0 si tout est conforme, 1 sinon (bloque le déploiement).
 * Les fichiers absents (entités optionnelles : tarifs, prix_historique) sont tolérés.
 */

// Entités optionnelles : leur fichier peut être absent sans bloquer le déploiement.
const OPTIONNELS: EntiteCle[] = ["tarifs", "prix_historique"];

const args = process.argv.slice(2).filter((a) => a !== "--");
const dossier = args.find((a) => !a.startsWith("--")) ?? "DOC/donnéés papeterie/import-atelierone";
const avecData = args.includes("--data");
const dossierAbs = path.resolve(process.cwd(), dossier);

const FICHIER: Record<EntiteCle, string> = {
  unites: "unites.jsonl",
  categories: "categories.jsonl",
  editeurs: "editeurs.jsonl",
  fournisseurs: "fournisseurs.jsonl",
  produits: "produits.jsonl",
  manuels: "manuels.jsonl",
  produits_unites: "produits_unites.jsonl",
  produits_fournisseurs: "produits_fournisseurs.jsonl",
  tarifs: "tarifs.jsonl",
  prix_historique: "prix_historique.jsonl",
  stocks: "stocks_initiaux.jsonl",
};

let erreurs = 0;

function afficherRapport(cle: EntiteCle, fichier: string): void {
  if (!existsSync(fichier)) {
    if (OPTIONNELS.includes(cle)) {
      console.log(`  ${cle.padEnd(22)} fichier absent (entité optionnelle) — ignoré`);
      return;
    }
    console.error(`  [${cle}] FICHIER ABSENT ou INVALIDE : ${fichier}`);
    erreurs++;
    return;
  }
  let rows: unknown[] = [];
  try {
    rows = chargerFichier(fichier);
  } catch (e: any) {
    console.error(`  [${cle}] FICHIER ABSENT ou INVALIDE : ${fichier} (${e?.message ?? e})`);
    erreurs++;
    return;
  }
  const rapport = validerEntite(cle, rows, fichier);
  const problemes = rapport.lignes.filter((l) => l.statut !== "valide");
  console.log(`  ${cle.padEnd(22)} total:${rapport.total}  valides:${rapport.valides}  invalides:${rapport.invalides}  ${problemes.length ? "✗" : "✓"}`);
  for (const l of problemes.slice(0, 10)) {
    console.error(`      #${l.index} [${l.statut}] ${l.erreurs.join(" ; ")}`);
  }
  if (problemes.length > 10) console.error(`      … et ${problemes.length - 10} autres lignes en erreur`);
  erreurs += problemes.length;
}

async function verifierData(): Promise<void> {
  const raw = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false });
  console.log("\n=== INVARIANTS EN BASE ===");
  const inv = async (label: string, sql: string, attendu?: string) => {
    try {
      const [r] = await raw.unsafe(sql);
      const v = r?.n ?? r?.count ?? 0;
      const ok = attendu === undefined || String(v) === attendu;
      console.log(`  ${ok ? "✓" : "✗"} ${label}: ${v}${attendu !== undefined ? ` (attendu: ${attendu})` : ""}`);
      if (!ok) erreurs++;
    } catch (e: any) {
      console.error(`  ✗ ${label}: ERREUR ${e?.message?.split("\n")[0] ?? e}`);
      erreurs++;
    }
  };

  await inv("agences", "select count(*)::int as n from agences");
  await inv("utilisateurs", "select count(*)::int as n from utilisateurs");
  await inv("rôles", "select count(*)::int as n from roles");
  await inv("permissions", "select count(*)::int as n from permissions");
  await inv("unités de mesure", "select count(*)::int as n from unites_mesure");
  await inv("sous-systèmes", "select count(*)::int as n from sous_systemes");
  await inv("niveaux", "select count(*)::int as n from niveaux");
  await inv("classes", "select count(*)::int as n from classes");
  await inv("matières", "select count(*)::int as n from matieres");
  await inv("ministères", "select count(*)::int as n from ministeres");
  await inv("années scolaires", "select count(*)::int as n from annees_scolaires");
  await inv("catégories", "select count(*)::int as n from categories");
  await inv("éditeurs", "select count(*)::int as n from editeurs");
  await inv("fournisseurs", "select count(*)::int as n from fournisseurs");
  await inv("produits", "select count(*)::int as n from produits");
  await inv("produits avec nom_code", "select count(*)::int as n from produits where nom_code is not null and nom_code <> ''");
  await inv("manuel_scolaire_detail", "select count(*)::int as n from manuel_scolaire_detail");
  await inv("produit_unites", "select count(*)::int as n from produit_unites");
  await inv("produits_fournisseurs", "select count(*)::int as n from produits_fournisseurs");
  await inv("stocks", "select count(*)::int as n from stocks");
  await inv("mouvements_stock (ENTREE_INITIALE)", "select count(*)::int as n from mouvements_stock where type = 'ENTREE_INITIALE'");
  await inv("ventes (doit être 0 après installation)", "select count(*)::int as n from ventes", "0");
  await inv("sessions caisse (doit être 0)", "select count(*)::int as n from sessions_caisse", "0");

  // Conformité : tout produit importé possède son unité de base
  const [sansUnite] = await raw`select count(*)::int as n from produits p
    where not exists (select 1 from produit_unites pu where pu.produit_id = p.id and pu.est_unite_base)`;
  console.log(`  ${sansUnite.n === 0 ? "✓" : "✗"} produits sans unité de base: ${sansUnite.n}`);
  if (sansUnite.n !== 0) erreurs++;

  // Conformité : tout manuel a sa ligne manuel_scolaire_detail (RG-004)
  const [manuelsSansDetail] = await raw`select count(*)::int as n from produits p
    where p.type_produit = 'MANUEL'
    and not exists (select 1 from manuel_scolaire_detail md where md.produit_id = p.id)`;
  console.log(`  ${manuelsSansDetail.n === 0 ? "✓" : "✗"} manuels sans détail manuel_scolaire_detail: ${manuelsSansDetail.n}`);
  if (manuelsSansDetail.n !== 0) erreurs++;

  // Unicité des codeBarre et nom_code
  const [dupBarres] = await raw`select count(*)::int as n from (
    select code_barre from produits group by code_barre having count(*) > 1) t`;
  console.log(`  ${dupBarres.n === 0 ? "✓" : "✗"} code-barres dupliqués: ${dupBarres.n}`);
  if (dupBarres.n !== 0) erreurs++;
  const [dupNomCodes] = await raw`select count(*)::int as n from (
    select nom_code from produits where nom_code is not null group by nom_code having count(*) > 1) t`;
  console.log(`  ${dupNomCodes.n === 0 ? "✓" : "✗"} nom_codes dupliqués: ${dupNomCodes.n}`);
  if (dupNomCodes.n !== 0) erreurs++;

  await raw.end();
}

(async () => {
  console.log(`=== CONFORMITÉ DES FICHIERS D'IMPORT ===`);
  console.log(`Dossier: ${dossierAbs}`);
  for (const cle of ORDRE_IMPORT) {
    afficherRapport(cle, path.join(dossierAbs, `${FICHIER[cle]}`));
  }

  if (avecData) await verifierData();

  console.log("");
  if (erreurs > 0) {
    console.error(`RÉSULTAT: ${erreurs} problème(s) détecté(s) — déploiement BLOQUÉ.`);
    process.exit(1);
  }
  console.log("RÉSULTAT: TOUT EST CONFORME ✓");
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});
