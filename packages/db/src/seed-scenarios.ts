import "dotenv/config";
import {
  produits,
  employes,
  pretsOutils,
  outillageMaintenance,
  produitSubstitutions,
  produitSupersessions,
  kitsLignes,
} from "./schema";
import { eq } from "drizzle-orm";
import { prepare, AGENCE_ID, DT, Rec } from "./seed-lib";

/**
 * SEED DE SCÉNARIOS MÉTIER — 10 situations réelles du garage, chacune avec
 * un produit `SCENARIO-*` autonome (emplacements LOC-SCEN-*) :
 *   1. LOW-STOCK    : stock sous le seuil d'alerte (déclenche alerte).
 *   2. EXPIRED-LOT  : lot dont la DLC est PASSÉE — indisponible en FIFO/FEFO.
 *   3. TOOL-LOAN    : outil exemplaire PRÊTÉ à un technicien (retour non fait).
 *   4. LOST-TOOL    : outil déclaré PERDU.
 *   5. DAMAGED-TOOL : outil CASSE + maintenance curative en cours.
 *   6. SUPERSESSION : ancienne référence remplacée par une nouvelle.
 *   7. SUBSTITUTION : variante A remplaçable par variante B (validée homologué).
 *   8. DUPLICATE    : deux variantes partageant la même réf OEM (à détecter).
 *   9. MULTI-LOCATION : même produit réparti sur plusieurs emplacements.
 *  10. KIT-INCOMPLETE : kit dont un composant est en rupture → kit incomplet.
 * Réutilise les ressources du seed-demo (TEC-DEMO-02, SUP-DEMO-JPAUTO).
 * Idempotent : refuse de relancer si un produit SCENARIO-% existe déjà.
 */
async function main() {
  const ctx = await prepare("seed-scenarios");

  if (await ctx.hasAnyProduct("SCENARIO-")) {
    console.log("Scénarios SCENARIO-* déjà présents. Rien à faire.");
    return;
  }

  const U = {
    PCE: ctx.units.get("PCE") ?? "",
  };

  // Emplacements propres aux scénarios
  await ctx.ensureEmplacement({ code: "LOC-SCEN-MAGA", libelle: "Magasin scénarios A", type: "ZONE" });
  await ctx.ensureEmplacement({ code: "LOC-SCEN-MAGB", libelle: "Magasin scénarios B", type: "ZONE" });
  await ctx.ensureEmplacement({ code: "LOC-SCEN-ATEL", libelle: "Atelier scénarios", type: "ATELIER" });

  // Catégories de rattachement (refuses à MATERIEL si absent ? → on raccroche aux racines du référentiel)
  const cat = ctx.cats.get("DEMO-HUILES") ?? ctx.cats.get("FLUIDES") ?? null;
  const catOut = ctx.cats.get("DEMO-OUTCLES") ?? ctx.cats.get("OUTILLAGE") ?? null;

  // Technicien du seed-demo (réutilisé pour le prêt) sinon au premier employé disponible
  let tec2 = 0;
  {
    const [r] = await ctx.db.select({ id: employes.id }).from(employes).where(eq(employes.matricule, "TEC-DEMO-02")).limit(1).catch(() => []);
    tec2 = r?.id ?? 0;
  }

  const addProduct = async (p: Rec) => {
    const cb = p.codeBarre as string;
    const existing = await ctx.findProduitId(cb);
    if (existing) return existing;
    const [row] = await ctx.db
      .insert(produits)
      .values({
        ...p,
        isActive: true,
        createdAt: DT(new Date().toISOString()),
        updatedAt: DT(new Date().toISOString()),
      } as any)
      .returning({ id: produits.id });
    const id = row?.id ?? 0;
    if (id) {
      pidMap.set(cb, id);
      await ctx.attachSku(id, cb, (p.uniteBaseId as string) ?? U.PCE);
    }
    return id;
  };
  const pidMap = new Map<string, number>();
  const pid = (cb: string) => pidMap.get(cb) ?? 0;

  // ── Catégorie articles scénarios ─────────────────────────────────────
  const catFluide = (cat ?? null);
  const catOutillage = (catOut ?? null);

  // ═══ 1. LOW-STOCK : sous le seuil d'alerte ═══
  {
    const a = await ctx.ensureArticle({ code: "ART-SCEN-FILTRE", designation: "Filtre à huile scénario — 90915-0L040", categorieId: catFluide, typeProduit: "CONSOMMABLE" });
    const p = await addProduct({
      articleId: a, typeProduit: "CONSOMMABLE", codeBarre: "SCENARIO-LOWSTOCK-01", codeArticle: "SCEN-LOWSTOCK-01",
      titre: "Filtre à huile 90915-0L040 — stock sous alerte", designationCourte: "Filtre basse alerte",
      categorieId: catFluide, marque: "Toyota", referenceFabricant: "90915-0L040", referencePrincipale: "90915-0L040",
      prixVente: "4500", prixAchat: "2600", tva: "19.25", uniteBaseId: U.PCE, seuilAlerte: 5, seuilCritique: 2,
      pointCommande: 4, stockMaximum: 20, stockSecurite: 3, classeAbc: "B",
      emplacementPrincipalId: ctx.emplacementId("LOC-SCEN-MAGA"),
      statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", origineProduit: "CONSTRUCTEUR",
      methodeValorisation: "CUMP", positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "MOTEUR",
    });
    await ctx.addRef(p, "OEM", "90915-0L040", true);
    await ctx.setStock(p, "LOC-SCEN-MAGA", { quantite: "2", rayon: "2", coutMoyen: "2600", uniteReferenceId: U.PCE });
    await ctx.journal(p, "ACHAT_RECEPTION", "E", 10, { date: "2026-06-01", reference: "SEED-SCEN", motif: "Réception 10 un." });
    await ctx.journal(p, "SORTIE_OR", "S", 8, { date: "2026-08-30", reference: "SEED-SCEN", motif: "Sorties atelier — 8 un." });
  }

  // ═══ 2. EXPIRED-LOT : DLC passée → non vendable ═══
  {
    const a = await ctx.ensureArticle({ code: "ART-SCEN-LQF", designation: "Liquide de refroidissement 5 L scénario", categorieId: catFluide, typeProduit: "CONSOMMABLE" });
    const p = await addProduct({
      articleId: a, typeProduit: "CONSOMMABLE", codeBarre: "SCENARIO-EXPLOT-01", codeArticle: "SCEN-EXPLOT-01",
      titre: "Liquide de refroidissement 5 L — lot périmé", designationCourte: "LDR 5L lot périmé",
      categorieId: catFluide, marque: "TOTAL", referenceFabricant: "GLACEOL RX", referencePrincipale: "GLACEOL RX",
      prixVente: "11900", prixAchat: "8200", tva: "19.25", uniteBaseId: U.PCE, suiviLot: true, dlcJours: 730,
      seuilAlerte: 3, pointCommande: 4, emplacementPrincipalId: ctx.emplacementId("LOC-SCEN-MAGA"),
      statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", origineProduit: "CONSTRUCTEUR",
      methodeValorisation: "FIFO", positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "N_A",
    });
    const lot = await ctx.addLot({
      produitId: p, numeroLot: "LOT-SCEN-EXPLOT-001", fournisseurId: null, statut: "perime",
      dateReception: "2023-05-10", quantiteInitiale: 12, coutUnitaire: "8200",
      dateFabrication: "2023-04-01", datePeremption: "2024-01-15",
      provenance: "Stock hérité", qualite: "G12", fabricant: "TOTAL",
    });
    await ctx.setStock(p, "LOC-SCEN-MAGA", { quantite: "12", rayon: "12", coutMoyen: "8200", uniteReferenceId: U.PCE });
    await ctx.addStockLot(p, lot, "12");
    await ctx.journal(p, "ACHAT_RECEPTION", "E", 12, { lotId: lot, date: "2023-05-10", reference: "SEED-SCEN", motif: "Réception lot hérité" });
  }

  // ═══ 3. TOOL-LOAN : prêt non retourné ═══
  {
    const a = await ctx.ensureArticle({ code: "ART-SCEN-PONCEUSE", designation: "Ponceuse d'atelier scénario", categorieId: catOutillage, typeProduit: "OUTIL" });
    const p = await addProduct({
      articleId: a, typeProduit: "OUTIL", codeBarre: "SCENARIO-TOLLOAN-01", codeArticle: "SCEN-TOLLOAN-01",
      titre: "Ponceuse orbitale — exemplaire n°1 (prêtée)", designationCourte: "Ponceuse orbitale EX1",
      categorieId: catOutillage, marque: "BOSCH", typeOutil: "INDIVIDUEL", calibrable: false, suiviSerie: true,
      numeroSerie: "SN-PONC-SCEN1001", prixAchat: "85000", tva: "19.25", uniteBaseId: U.PCE,
      emplacementPrincipalId: ctx.emplacementId("LOC-SCEN-ATEL"),
      statut: "actif", statutCycleVie: "ACTIF", niveau: "EXEMPLAIRE", etatProduit: "NEUF", origineProduit: "AFTERMARKET",
      positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "N_A",
    });
    if (tec2) {
      await ctx.db.insert(pretsOutils).values({
        agenceId: AGENCE_ID, outilId: p, technicienId: tec2, motif: "Ponçage carrosserie — Corolla",
        dateSortie: DT("2026-09-01"), sortiePar: null, dateRetour: null, retourneLe: null, retournePar: null,
        etatRetour: null, remarque: "Non rendue à échéance", actif: true,
      } as any).onConflictDoNothing();
    }
  }

  // ═══ 4. LOST-TOOL : perdu ═══
  {
    const a = await ctx.ensureArticle({ code: "ART-SCEN-MULTI", designation: "Multimètre d'atelier scénario", categorieId: catOutillage, typeProduit: "OUTIL" });
    const p = await addProduct({
      articleId: a, typeProduit: "OUTIL", codeBarre: "SCENARIO-LOSTTOOL-01", codeArticle: "SCEN-LOSTTOOL-01",
      titre: "Multimètre numérique — exemplaire n°2 (PERDU)", designationCourte: "Multimètre EX2 perdu",
      categorieId: catOutillage, marque: "FLUKE", calibrable: true, suiviSerie: true, numeroSerie: "SN-MULTI-SCEN2002",
      prixAchat: "120000", tva: "19.25", uniteBaseId: U.PCE, emplacementPrincipalId: null,
      statut: "actif", statutCycleVie: "ACTIF", niveau: "EXEMPLAIRE", etatProduit: "NEUF", statutOutil: "PERDU",
      origineProduit: "AFTERMARKET", positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "N_A",
    });
    void p;
  }

  // ═══ 5. DAMAGED-TOOL : cassé + maintenance curative ═══
  {
    const a = await ctx.ensureArticle({ code: "ART-SCEN-DEVR", designation: "Dévireuse à chocs scénario", categorieId: catOutillage, typeProduit: "OUTIL" });
    const p = await addProduct({
      articleId: a, typeProduit: "OUTIL", codeBarre: "SCENARIO-DAMAGED-01", codeArticle: "SCEN-DAMAGED-01",
      titre: "Dévireuse à chocs 1/2\" — exemplaire n°1 (CASSÉ)", designationCourte: "Dévireuse EX1 cassée",
      categorieId: catOutillage, marque: "INGERSOLL-RAND", calibrable: false, suiviSerie: true,
      numeroSerie: "SN-DEVR-SCEN1001", prixAchat: "240000", tva: "19.25", uniteBaseId: U.PCE,
      emplacementPrincipalId: ctx.emplacementId("LOC-SCEN-ATEL"),
      statut: "actif", statutCycleVie: "ACTIF", niveau: "EXEMPLAIRE", etatProduit: "OCCASION", statutOutil: "CASSE",
      origineProduit: "AFTERMARKET", positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "N_A",
    });
    await ctx.db.insert(outillageMaintenance).values({
      outilId: p, type: "CURATIVE", dateMaintenance: DT("2026-09-03"), prestataire: "IR Service",
      cout: "45000", rapportUrl: null, observations: "Rotors moteur HS — remplacement en cours",
      prochaineMaintenance: null, effectuePar: ctx.adminId,
    } as any).onConflictDoNothing();
  }

  // ═══ 6. SUPERSESSION : ancienne réf → nouvelle ═══
  {
    const a = await ctx.ensureArticle({ code: "ART-SCEN-BOUG", designation: "Bougie scénario BKR6E-11", categorieId: cat, typeProduit: "PIECE" });
    void a;
    const pOld = await addProduct({
      typeProduit: "PIECE", codeBarre: "SCENARIO-SUPER-OLD", codeArticle: "SCEN-SUPER-OLD",
      titre: "Bougie BKR6E-11 — ancienne réf (supersédée)", designationCourte: "Bougie ancienne réf",
      categorieId: cat, marque: "NGK", referenceFabricant: "BKR6E-11", referencePrincipale: "BKR6E-11",
      prixVente: "9800", prixAchat: "5900", tva: "19.25", uniteBaseId: U.PCE,
      statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", methodeValorisation: "CUMP",
      positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "MOTEUR",
    });
    const pNew = await addProduct({
      typeProduit: "PIECE", codeBarre: "SCENARIO-SUPER-NEW", codeArticle: "SCEN-SUPER-NEW",
      titre: "Bougie BKR6E-11 — nouvelle réf actuelle", designationCourte: "Bougie nouvelle réf",
      categorieId: cat, marque: "NGK", referenceFabricant: "BKR6EGP-11", referencePrincipale: "BKR6EGP-11",
      prixVente: "11200", prixAchat: "6900", tva: "19.25", uniteBaseId: U.PCE,
      statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", methodeValorisation: "CUMP",
      positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "MOTEUR",
    });
    await ctx.addRef(pOld, "FABRICANT", "BKR6E-11", true);
    await ctx.addRef(pNew, "FABRICANT", "BKR6EGP-11", true);
    await ctx.db.insert(produitSupersessions).values({
      ancienneVarianteId: pOld, ancienneReference: "BKR6E-11",
      nouvelleVarianteId: pNew, nouvelleReference: "BKR6EGP-11",
      fabricant: "NGK", motif: "Supersession constructeur", commandeAutorisee: false,
    } as any).onConflictDoNothing();
  }

  // ═══ 7. SUBSTITUTION : A ↔ B validée ═══
  {
    const pA = await addProduct({
      typeProduit: "PIECE", codeBarre: "SCENARIO-SUB-A", codeArticle: "SCEN-SUB-A",
      titre: "Filtre à air A — substitutable", designationCourte: "Filtre air A",
      categorieId: cat, marque: "MANN", referenceFabricant: "C 30 018", referencePrincipale: "C 30 018",
      prixVente: "6900", prixAchat: "4100", tva: "19.25", uniteBaseId: U.PCE,
      statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", methodeValorisation: "CUMP",
      positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "MOTEUR",
    });
    const pB = await addProduct({
      typeProduit: "PIECE", codeBarre: "SCENARIO-SUB-B", codeArticle: "SCEN-SUB-B",
      titre: "Filtre à air B — substitut", designationCourte: "Filtre air B",
      categorieId: cat, marque: "HENGST", referenceFabricant: "E1509L", referencePrincipale: "E1509L",
      prixVente: "6500", prixAchat: "3900", tva: "19.25", uniteBaseId: U.PCE,
      statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", methodeValorisation: "CUMP",
      positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "MOTEUR",
    });
    await ctx.db.insert(produitSubstitutions).values({
      varianteAId: pA, varianteBId: pB, niveauConfiance: "HOMOLOGUE",
      motif: "Dimension identique 250/200 mm — homologué constructeur", actif: true,
    } as any).onConflictDoNothing();
  }

  // ═══ 8. DUPLICATE : 2 variantes, même réf OEM ═══
  {
    const a = await ctx.ensureArticle({ code: "ART-SCEN-ETANCHE", designation: "Garniture d'étanchéité scénario", categorieId: cat, typeProduit: "PIECE" });
    for (const cb of ["SCENARIO-DUPLICATE-01", "SCENARIO-DUPLICATE-02"]) {
      const p = await addProduct({
        articleId: a, typeProduit: "PIECE", codeBarre: cb, codeArticle: cb.replace("SCENARIO-", "SCEN-"),
        titre: `Garniture d'étanchéité — lot ${cb.endsWith("01") ? "A" : "B"}`, designationCourte: `Garniture ${cb.endsWith("01") ? "A" : "B"}`,
        categorieId: cat, marque: "VICTOR REINZ", referenceFabricant: "VR-01-0340", referencePrincipale: "VR-01-0340",
        prixVente: "3500", prixAchat: "1800", tva: "19.25", uniteBaseId: U.PCE,
        statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", methodeValorisation: "CUMP",
        positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "MOTEUR",
      });
      await ctx.addRef(p, "OEM", "SCEN-DUP-REF-A"); // MÊME réf OEM sur les 2 variantes → doublon détectable
    }
  }

  // ═══ 9. MULTI-LOCATION : 1 produit → 2 emplacements ═══
  {
    const a = await ctx.ensureArticle({ code: "ART-SCEN-BATT60", designation: "Batterie 60 Ah scénario", categorieId: cat, typeProduit: "PIECE" });
    const p = await addProduct({
      articleId: a, typeProduit: "PIECE", codeBarre: "SCENARIO-MULTILOC-01", codeArticle: "SCEN-MULTILOC-01",
      titre: "Batterie 60 Ah (liée) — répartie sur 2 emplacements", designationCourte: "Batterie 60 Ah éclatée",
      categorieId: cat, marque: "EXIDE", referenceFabricant: "EA770", referencePrincipale: "EA770",
      prixVente: "142000", prixAchat: "106000", tva: "19.25", uniteBaseId: U.PCE, suiviLot: false,
      seuilAlerte: 2, pointCommande: 2, emplacementPrincipalId: ctx.emplacementId("LOC-SCEN-MAGA"),
      statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", methodeValorisation: "CUMP",
      positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "MOTEUR",
    });
    await ctx.setStock(p, "LOC-SCEN-MAGA", { quantite: "4", rayon: "4", coutMoyen: "106000", uniteReferenceId: U.PCE });
    await ctx.setStock(p, "LOC-SCEN-MAGB", { quantite: "6", rayon: "6", coutMoyen: "106000", uniteReferenceId: U.PCE });
    await ctx.journal(p, "ACHAT_RECEPTION", "E", 10, { date: "2026-07-01", reference: "SEED-SCEN", motif: "Réception 10 un." });
    await ctx.journal(p, "TRANSFERT_SORTIE", "S", 4, { emplacementId: ctx.emplacementId("LOC-SCEN-MAGA"), date: "2026-07-02", reference: "SEED-SCEN", motif: "Éclatement MagA 4 / MagB 6" });
    await ctx.journal(p, "TRANSFERT_ENTREE", "E", 4, { emplacementId: ctx.emplacementId("LOC-SCEN-MAGB"), date: "2026-07-02", reference: "SEED-SCEN", motif: "Arrivée MagB 4 un." });
  }

  // ═══ 10. KIT-INCOMPLETE : composant en rupture ═══
  {
    const a = await ctx.ensureArticle({ code: "ART-SCEN-KITJOINT", designation: "Kit joint scénario (2 composants)", categorieId: cat, typeProduit: "PIECE" });
    const c1 = await addProduct({
      typeProduit: "PIECE", codeBarre: "SCENARIO-KITIN-C1", codeArticle: "SCEN-KITIN-C1",
      titre: "Joint de culasse — EN RUPTURE", designationCourte: "Joint culasse rupture",
      categorieId: cat, marque: "VICTOR REINZ", referenceFabricant: "VR-0150", referencePrincipale: "VR-0150",
      prixVente: "25000", prixAchat: "15000", tva: "19.25", uniteBaseId: U.PCE, suiviLot: false,
      seuilAlerte: 2, pointCommande: 1, statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE",
      etatProduit: "NEUF", methodeValorisation: "CUMP", positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "MOTEUR",
    });
    const c2 = await addProduct({
      typeProduit: "PIECE", codeBarre: "SCENARIO-KITIN-C2", codeArticle: "SCEN-KITIN-C2",
      titre: "Joint de cache culbuteurs", designationCourte: "Joint cache culbuteurs",
      categorieId: cat, marque: "VICTOR REINZ", referenceFabricant: "VR-0151", referencePrincipale: "VR-0151",
      prixVente: "8000", prixAchat: "4200", tva: "19.25", uniteBaseId: U.PCE, suiviLot: false,
      seuilAlerte: 2, pointCommande: 1, statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE",
      etatProduit: "NEUF", methodeValorisation: "CUMP", positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "MOTEUR",
    });
    const kit = await addProduct({
      articleId: a, typeProduit: "PIECE", codeBarre: "SCENARIO-KITIN-01", codeArticle: "SCEN-KITIN-01",
      titre: "Kit joint moteur (culasse + cache culbuteurs)", designationCourte: "Kit joint moteur",
      categorieId: cat, referencePrincipale: "KIT-JOINT-SCEN", conditionnement: "Kit 2 pièces",
      prixVente: "35000", prixAchat: "19500", tva: "19.25", uniteBaseId: U.PCE,
      statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", methodeValorisation: "CUMP",
      positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "MOTEUR",
    });
    await ctx.db.insert(kitsLignes).values([
      { kitId: kit, composantId: c1, quantite: "1" },
      { kitId: kit, composantId: c2, quantite: "1" },
    ] as any).onConflictDoNothing();
    // c1 en rupture, c2 en stock
    await ctx.setStock(c1, "LOC-SCEN-MAGA", { quantite: "0", coutMoyen: "15000", uniteReferenceId: U.PCE });
    await ctx.setStock(c2, "LOC-SCEN-MAGA", { quantite: "3", coutMoyen: "4200", uniteReferenceId: U.PCE });
  }

  console.log("=== SEED SCÉNARIOS TERMINÉ ===");
  console.log(`Produits SCENARIO-* créés : ${pidMap.size}`);
  console.log("  1. LOW-STOCK     : stock 2 < seuil 5 (filtre 90915-0L040)");
  console.log("  2. EXPIRED-LOT   : lot LOT-SCEN-EXPLOT-001 DLC 2024 → périmé (12 u bloquées)");
  console.log("  3. TOOL-LOAN     : ponceuse prêtée à TEC-DEMO-02, retour non fait");
  console.log("  4. LOST-TOOL     : multimètre PERDU");
  console.log("  5. DAMAGED-TOOL  : dévireuse CASSE + maintenance curative");
  console.log("  6. SUPERSESSION  : BKR6E-11 → BKR6EGP-11 (NGK)");
  console.log("  7. SUBSTITUTION  : filtre air A ↔ B (HOMOLOGUE)");
  console.log("  8. DUPLICATE     : réf OEM SCEN-DUP-REF-A sur 2 variantes");
  console.log("  9. MULTI-LOCATION: batterie 4 u MagA + 6 u MagB = 10");
  console.log(" 10. KIT-INCOMPLETE: kit joint — composant 1 en rupture");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });