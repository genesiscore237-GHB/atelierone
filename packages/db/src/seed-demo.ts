import "dotenv/config";
import {
  produits,
  produitsFournisseurs,
  lots,
  stocksLots,
  mouvementsStock,
  varianteAttributs,
  articleAttributs,
  produitSubstitutions,
  kitsLignes,
  pretsOutils,
  outillageMaintenance,
  outillageCalibration,
  tarifs,
  employes,
  fournisseurs,
  vehicules,
  articleDocuments,
} from "./schema";
import { eq } from "drizzle-orm";
import { prepare, AGENCE_ID, DT, Rec } from "./seed-lib";

/**
 * SEED DE DÉMONSTRATION « VITRINE » — petit, mais qui démontre l'architecture :
 *  1. Un ARTICLE → plusieurs VARIANTES → plusieurs RÉFÉRENCES / FOURNISSEURS /
 *     COMPATIBILITÉS / LOTS / EMPLACEMENTS (Batterie AGM 70 Ah).
 *  2. La séparation stricte PRODUIT ≠ STOCK ≠ LOT ≠ EMPLACEMENT (Huile 5W30 :
 *     37 L = LOT-A 12 L + LOT-B 25 L ; Magasin A 20 L + Magasin B 17 L).
 *  3. OUTIL → MODÈLE → EXEMPLAIRES (Clé dynamométrique : OUT-001 dispo,
 *     OUT-002 prêté à un mécanicien, OUT-003 en maintenance ; calibration).
 *  + véhicules (Hilux / Corolla / Sprinter), fournisseurs, employés,
 *    emplacements hiérarchiques (Magasin → Rayon → Étagère → Bac),
 *    kit composé, équipement suivi en maintenance, services tarifés.
 * Idempotent : refuse de relancer si un produit DEMO-% existe déjà.
 */
async function main() {
  const ctx = await prepare("seed-demo");

  if (await ctx.hasAnyProduct("DEMO-")) {
    console.log("Dataset DEMO déjà présent. Rien à faire.");
    return;
  }

  // Unités nécessaires (règle : tourner seed-references d'abord ; ajout idempotent en secours)
  await Promise.all([
    ctx.addUnite("PCE", "Pièce", "pc", "COMPTAGE"),
    ctx.addUnite("L", "Litre", "L", "VOLUME"),
    ctx.addUnite("H", "Heure", "h", "DUREE"),
    ctx.addUnite("V", "Volt", "V", "TENSION"),
    ctx.addUnite("A", "Ampère", "A", "INTENSITE"),
    ctx.addUnite("AH", "Ampère-heure", "Ah", "CAPACITE"),
    ctx.addUnite("NM", "Newton-mètre", "Nm", "COUPLE"),
    ctx.addUnite("POURCENT", "Pourcent", "%", "RATIO"),
    ctx.addUnite("KG", "Kilogramme", "kg", "MASSE"),
    ctx.addUnite("MM", "Millimètre", "mm", "LONGUEUR"),
  ]);
  const U = {
    PCE: ctx.units.get("PCE") ?? "",
    L: ctx.units.get("L") ?? "",
    H: ctx.units.get("H") ?? "",
    V: ctx.units.get("V") ?? "",
    A: ctx.units.get("A") ?? "",
    AH: ctx.units.get("AH") ?? "",
    NM: ctx.units.get("NM") ?? "",
    POURCENT: ctx.units.get("POURCENT") ?? "",
    KG: ctx.units.get("KG") ?? "",
    MM: ctx.units.get("MM") ?? "",
  };

  // ── Catégories ────────────────────────────────────────────────────────
  await Promise.all([
    ctx.ensureCategory({ code: "DEMO-BATTERIES", nom: "Batteries & accessoires", parentCode: "PIECE_MECA", niveau: "CATEGORIE", typeBranche: "PIECE" }),
    ctx.ensureCategory({ code: "DEMO-FREIN", nom: "Système de freinage", parentCode: "PIECE_MECA", niveau: "CATEGORIE", typeBranche: "PIECE" }),
    ctx.ensureCategory({ code: "DEMO-HUILES", nom: "Huiles moteur", parentCode: "FLUIDES", niveau: "SOUS", typeBranche: "CONSOMMABLE" }),
    ctx.ensureCategory({ code: "DEMO-OUTCLES", nom: "Clés & clés dynamométriques", parentCode: "OUTILLAGE", niveau: "SOUS", typeBranche: "OUTIL" }),
    ctx.ensureCategory({ code: "DEMO-EQP-PONT", nom: "Ponts élévateurs", parentCode: "EQUIPEMENT_GARAGE", niveau: "SOUS", typeBranche: "EQUIPEMENT" }),
    ctx.ensureCategory({ code: "DEMO-SRV-ENTRETIEN", nom: "Entretien courant", parentCode: "SERVICES", niveau: "SOUS", typeBranche: "SERVICE" }),
  ]);

  // ── Emplacements hiérarchiques (Magasin → Rayon → Étagère → Bac) ─────
  await ctx.ensureEmplacement({ code: "LOC-DEMO-MAG-A", libelle: "Magasin principal A", type: "ZONE" });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-MAG-A-RA", libelle: "Rayon A", parentCode: "LOC-DEMO-MAG-A", type: "RAYON", ordre: 1 });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-MAG-A-RA-ET1", libelle: "Étagère 1", parentCode: "LOC-DEMO-MAG-A-RA", type: "RAYON" });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-MAG-A-RA-ET1-BAC03", libelle: "Bac 03", parentCode: "LOC-DEMO-MAG-A-RA-ET1", type: "BAC" });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-MAG-A-RA-ET1-BAC05", libelle: "Bac 05", parentCode: "LOC-DEMO-MAG-A-RA-ET1", type: "BAC" });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-MAG-A-RB", libelle: "Rayon B", parentCode: "LOC-DEMO-MAG-A", type: "RAYON" });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-MAG-A-RB-ET2", libelle: "Étagère 2", parentCode: "LOC-DEMO-MAG-A-RB", type: "RAYON" });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-MAG-A-RB-ET2-BAC14", libelle: "Bac 14", parentCode: "LOC-DEMO-MAG-A-RB-ET2", type: "BAC" });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-MAG-A-ZONEV", libelle: "Zone vrac (fûts / contenants)", parentCode: "LOC-DEMO-MAG-A", type: "ZONE" });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-MAG-B", libelle: "Magasin B", type: "ZONE" });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-MAG-B-RB1", libelle: "Rayon B1", parentCode: "LOC-DEMO-MAG-B", type: "RAYON" });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-MAG-B-RB1-ET3", libelle: "Étagère 3", parentCode: "LOC-DEMO-MAG-B-RB1", type: "RAYON" });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-MAG-B-RB1-ET3-BAC08", libelle: "Bac 08", parentCode: "LOC-DEMO-MAG-B-RB1-ET3", type: "BAC" });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-MAG-B-ZONEV", libelle: "Zone vrac B", parentCode: "LOC-DEMO-MAG-B", type: "ZONE" });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-ARM-A", libelle: "Armoire A — outillage sous clé", parentCode: "LOC-DEMO-MAG-A", type: "CASIER" });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-ATEL-1", libelle: "Atelier mécanique 1", type: "ATELIER" });
  await ctx.ensureEmplacement({ code: "LOC-DEMO-MAINT", libelle: "Poste maintenance outillage", type: "ATELIER" });

  // ── Ressources humaines / fournisseurs / véhicules ────────────────────
  const empByMat = new Map<string, number>();
  const EMPLOYES: { matricule: string; nom: string; prenom: string; fonction: string }[] = [
    { matricule: "MAG-DEMO-01", nom: "ZINSOU", prenom: "Aristide", fonction: "Magasinier" },
    { matricule: "TEC-DEMO-01", nom: "HOUNKPE", prenom: "Séraphin", fonction: "Technicien" },
    { matricule: "TEC-DEMO-02", nom: "AGBODJAN", prenom: "Fidèle", fonction: "Technicien" },
    { matricule: "GES-DEMO-01", nom: "MENSAH", prenom: "Lucresse", fonction: "Gestionnaire d'atelier" },
  ];
  for (const e of EMPLOYES) {
    const [ex] = await ctx.db.select({ id: employes.id }).from(employes).where(eq(employes.matricule, e.matricule)).limit(1).catch(() => []);
    const id = ex?.id ?? (await ctx.db.insert(employes).values({ matricule: e.matricule, nom: e.nom, prenom: e.prenom, fonction: e.fonction, typeEmploye: "permanent", agenceId: AGENCE_ID, statut: "actif", dateEmbauche: "2020-01-02" } as any).returning({ id: employes.id }))[0].id;
    empByMat.set(e.matricule, id);
  }
  const MAG = empByMat.get("MAG-DEMO-01");
  const TEC1 = empByMat.get("TEC-DEMO-01");
  const TEC2 = empByMat.get("TEC-DEMO-02");
  const GES = empByMat.get("GES-DEMO-01");

  const fourByCode = new Map<string, number>();
  const FOURNISSEURS: { code: string; nom: string; typeService: string }[] = [
    { code: "SUP-DEMO-TOTAL", nom: "TOTAL Lubrifiants Bénin", typeService: "PIECES_AUTO" },
    { code: "SUP-DEMO-JPAUTO", nom: "JP Auto Distribution", typeService: "PIECES_AUTO" },
    { code: "SUP-DEMO-BOSCH", nom: "BOSCH Outillage & Pièces", typeService: "OUTILLAGE" },
  ];
  for (const f of FOURNISSEURS) {
    const [ex] = await ctx.db.select({ id: fournisseurs.id }).from(fournisseurs).where(eq(fournisseurs.code, f.code)).limit(1).catch(() => []);
    const id = ex?.id ?? (await ctx.db.insert(fournisseurs).values({ code: f.code, nom: f.nom, typeService: f.typeService, circuit: "PIECES", pays: "Bénin", isActive: true } as any).returning({ id: fournisseurs.id }))[0].id;
    fourByCode.set(f.code, id);
  }
  const SUP_TOTAL = fourByCode.get("SUP-DEMO-TOTAL");
  const SUP_JPA = fourByCode.get("SUP-DEMO-JPAUTO");
  const SUP_BOSCH = fourByCode.get("SUP-DEMO-BOSCH");

  const VEHICULE_DEFS: { immatriculation: string; marque: string; modele: string; version: string; annee: number; carburant: string; typeVehicule: string; kilometrage: number }[] = [
    { immatriculation: "CM-DEMO-HLX-01", marque: "Toyota", modele: "Hilux", version: "2.8 D-4D Double Cab", annee: 2019, carburant: "diesel", typeVehicule: "utilitaire", kilometrage: 142500 },
    { immatriculation: "CM-DEMO-COR-01", marque: "Toyota", modele: "Corolla", version: "1.8 VVT-i Comfort", annee: 2017, carburant: "essence", typeVehicule: "voiture", kilometrage: 98400 },
    { immatriculation: "CM-DEMO-SPR-01", marque: "Mercedes", modele: "Sprinter", version: "313 CDI L3H2", annee: 2020, carburant: "diesel", typeVehicule: "utilitaire", kilometrage: 63400 },
  ];
  const vehByMat = new Map<string, number>();
  for (const v of VEHICULE_DEFS) {
    const [ex] = await ctx.db.select({ id: vehicules.id }).from(vehicules).where(eq(vehicules.immatriculation, v.immatriculation)).limit(1).catch(() => []);
    const id = ex?.id ?? (await ctx.db.insert(vehicules).values({ agenceId: AGENCE_ID, ...v, statutImmobilisation: "en_reception", isActive: true, notes: "SEED-DEMO3" } as any).returning({ id: vehicules.id }))[0].id;
    vehByMat.set(v.immatriculation, id);
  }

  // ── Helpers produits ──────────────────────────────────────────────────
  const pidMap = new Map<string, number>();
  const addProduct = async (p: Rec) => {
    const cb = p.codeBarre as string;
    const existing = await ctx.findProduitId(cb);
    if (existing) {
      pidMap.set(cb, existing);
      return existing;
    }
    const [row] = await ctx.db
      .insert(produits)
      .values({
        ...p,
        isActive: true,
        createdAt: DT(new Date().toISOString()),
        updatedAt: DT(new Date().toISOString()),
      } as any)
      .returning({ id: produits.id });
    const id = row?.id;
    if (id) {
      pidMap.set(cb, id);
      await ctx.attachSku(id, cb, (p.uniteBase as string) ?? U.PCE);
      if (p.ean) await ctx.addCodeBarre(id, "EAN", p.ean as string, false);
    }
    return id ?? 0;
  };

  // ═══ 1. BATTERIE AGM 70 Ah — l'ARTICLE complet (variantes × refs × fournisseurs × compat × lots × emplacements × historique) ═══
  const artBatt = await ctx.ensureArticle({ code: "ART-DEMO-BAT-AGM70", designation: "Batterie AGM 70 Ah", categorieId: ctx.cats.get("DEMO-BATTERIES"), typeProduit: "PIECE" });

  const batV1 = await addProduct({
    articleId: artBatt,
    typeProduit: "PIECE",
    codeBarre: "DEMO-BAT-AGM70-760",
    codeArticle: "BAT-DEMO-AGM70-760",
    titre: "Batterie AGM 70 Ah — 760 A (VARTA)",
    designationCourte: "Batterie AGM 70 Ah 760A VARTA",
    categorieId: ctx.cats.get("DEMO-BATTERIES"),
    marque: "VARTA",
    referenceFabricant: "VARTA-570-901-068",
    refOem: "28800-0Y050",
    refAftermarket: "JPA-BAT-AGM70-760",
    referencePrincipale: "VARTA-570-901-068",
    prixVente: "178000",
    prixAchat: "118000",
    prixPro: "162000",
    prixParticulier: "178000",
    dernierPrixAchat: "118000",
    tva: "19.25",
    uniteBaseId: U.PCE,
    conditionnement: "Pièce",
    suiviLot: true,
    seuilAlerte: 4,
    seuilCritique: 1,
    stockMaximum: 12,
    stockSecurite: 2,
    pointCommande: 3,
    classeAbc: "A",
    garantieMois: 24,
    poidsKg: "18.5",
    dimensions: "278x175x190",
    emplacementPrincipalId: ctx.emplacementId("LOC-DEMO-MAG-A-RB-ET2-BAC14"),
    statut: "actif",
    statutCycleVie: "ACTIF",
    niveau: "VARIANTE",
    etatProduit: "NEUF",
    origineProduit: "OEM",
    relationProduit: "EQUIVALENT",
    methodeValorisation: "CUMP",
    positionCote: "N_A",
    positionEssieu: "N_A",
    positionZone: "N_A",
    positionEmplacement: "N_A",
    ean: "3793322412345",
  });
  await ctx.addRef(batV1, "FABRICANT", "VARTA-570-901-068", true);
  await ctx.addRef(batV1, "OEM", "28800-0Y050");
  await ctx.addRef(batV1, "OEM", "28800-0Y051");
  await ctx.addRef(batV1, "FOURNISSEUR", "JPA-BAT-AGM70-760");
  await ctx.addRef(batV1, "ANCIENNE", "BAT-560-222");
  const attrsBatt = [
    { cle: "technologie", valeur: "AGM", typeAttribut: "ENUM" },
    { cle: "tension_nominale", valeur: "12", typeAttribut: "NOMBRE", unite: "V", uniteId: U.V },
    { cle: "capacite", valeur: "70", typeAttribut: "NOMBRE", unite: "Ah", uniteId: U.AH },
    { cle: "courant_cca", valeur: "760", typeAttribut: "NOMBRE", unite: "A", uniteId: U.A },
    { cle: "poids", valeur: "18.5", typeAttribut: "NOMBRE", unite: "kg", uniteId: U.KG },
  ];
  for (let i = 0; i < attrsBatt.length; i++) {
    const a = attrsBatt[i];
    await ctx.addAttribut("VARIANTE", batV1, a.cle, a.valeur, { typeAttribut: a.typeAttribut, unite: a.unite, uniteId: a.uniteId, ordre: i });
  }
  await ctx.addRefEquiv(artBatt, "Toyota", "28800-0Y050", "OEM constructeur");
  await ctx.addRefEquiv(artBatt, "VARTA", "VARTA-570-901-068", "Fabricant");
  await ctx.addRefEquiv(artBatt, "BOSCH", "BOSCH-AGM70-760", "Équivalent");
  await ctx.addFournisseur(batV1, SUP_JPA!, "JPA-BAT-AGM70-760", "118000", { estPrincipal: true, uniteId: U.PCE });
  await ctx.addFournisseur(batV1, SUP_BOSCH!, "BOSCH-AGM70-760", "124000", { delai: 8, uniteId: U.PCE });
  await ctx.addCompat({ produitId: batV1, typeCompat: "POSITIVE", marque: "Toyota", modele: "Hilux", anneeDe: 2016, anneeA: 2026, motorisation: "2.8 D-4D", codeMoteur: "1GD-FTV", carburant: "diesel", refOem: "28800-0Y050", notes: "AGM premium — montage d'origine" });
  await ctx.addCompat({ produitId: batV1, typeCompat: "POSITIVE", marque: "Toyota", modele: "RAV4", anneeDe: 2019, anneeA: 2025, motorisation: "2.5", carburant: "hybride", notes: "Hybride — position coffre" });
  await ctx.addCompat({ produitId: batV1, typeCompat: "NEGATIVE", marque: "Toyota", modele: "Hilux", anneeDe: 2016, anneeA: 2026, motorisation: "2.4 D-4D", codeMoteur: "2GD-FTV", restrictions: "Se monte sur 2.8 uniquement" });

  // stock 4 niveaux : 10 en stock (dispo 7 / réservé 2 / bloqué 1), 2 lots + 2 unités hors lot
  const stkV1a = await ctx.setStock(batV1, "LOC-DEMO-MAG-A-RB-ET2-BAC14", { quantite: "6", reservee: "1", bloquee: "1", rayon: "6", coutMoyen: "118000", uniteReferenceId: U.PCE });
  const stkV1b = await ctx.setStock(batV1, "LOC-DEMO-MAG-B-RB1-ET3-BAC08", { quantite: "4", reservee: "1", rayon: "4", coutMoyen: "118000", uniteReferenceId: U.PCE });
  const lotBatt1 = await ctx.addLot({
    produitId: batV1, numeroLot: "LOT-DEMO-BAT-2026-001", fournisseurId: SUP_JPA, statut: "disponible",
    dateReception: "2026-07-10", quantiteInitiale: 5, coutUnitaire: "118000",
    dateFabrication: "2026-06-01", datePeremption: "2029-12-31",
    provenance: "Import — Port de Cotonou", qualite: "OEM", fabricant: "VARTA",
  });
  const lotBatt2 = await ctx.addLot({
    produitId: batV1, numeroLot: "LOT-DEMO-BAT-2026-002", fournisseurId: SUP_JPA, statut: "disponible",
    dateReception: "2026-08-14", quantiteInitiale: 3, coutUnitaire: "118000",
    dateFabrication: "2026-07-10", datePeremption: "2030-06-30",
    provenance: "Import — Port de Cotonou", qualite: "OEM", fabricant: "VARTA",
  });
  await ctx.addStockLot(batV1, lotBatt1, "5");
  await ctx.addStockLot(batV1, lotBatt2, "3");
  void stkV1a; void stkV1b;
  // historique : réception → déplacement → réservation → sortie → inventaire
  await ctx.journal(batV1, "ACHAT_RECEPTION", "E", 5, { lotId: lotBatt1, date: "2026-07-10", motif: "Réception BL-2026-0812 — lot 001 (5 u)" });
  await ctx.journal(batV1, "ACHAT_RECEPTION", "E", 3, { lotId: lotBatt2, date: "2026-08-14", motif: "Réception BL-2026-0841 — lot 002 (3 u)" });
  await ctx.journal(batV1, "ACHAT_RECEPTION", "E", 2, { date: "2026-08-20", motif: "Réception hors lot (2 u)" });
  await ctx.journal(batV1, "TRANSFERT_SORTIE", "S", 4, { emplacementId: ctx.emplacementId("LOC-DEMO-MAG-B-RB1-ET3-BAC08"), date: "2026-08-21", motif: "Déplacement Magasin A → Magasin B (BAC14 → BAC08)" });
  await ctx.journal(batV1, "TRANSFERT_ENTREE", "E", 4, { emplacementId: ctx.emplacementId("LOC-DEMO-MAG-B-RB1-ET3-BAC08"), date: "2026-08-21", motif: "Arrivée Magasin B" });
  await ctx.journal(batV1, "SORTIE_OR", "S", 2, { date: "2026-08-26", motif: "Sortie atelier 2 unités — OR#1401 (Hilux, dont 2 pré-réservées)" });
  await ctx.journal(batV1, "AJUSTEMENT_INVENTAIRE_POSITIF", "E", 2, { date: "2026-09-02", motif: "Inventaire : 2 unités retrouvées en réserve" });

  // variantes 2 et 3 (mêmes attributs, CCA différent)
  const batV2 = await addProduct({
    articleId: artBatt, typeProduit: "PIECE", codeBarre: "DEMO-BAT-AGM70-680", codeArticle: "BAT-DEMO-AGM70-680",
    titre: "Batterie AGM 70 Ah — 680 A (VARTA)", designationCourte: "Batterie AGM 70 Ah 680A",
    categorieId: ctx.cats.get("DEMO-BATTERIES"), marque: "VARTA", referenceFabricant: "VARTA-570-901-065",
    referencePrincipale: "VARTA-570-901-065", prixVente: "168000", prixAchat: "112000", prixPro: "153000",
    prixParticulier: "168000", tva: "19.25", uniteBaseId: U.PCE, suiviLot: false,
    seuilAlerte: 3, pointCommande: 2, emplacementPrincipalId: ctx.emplacementId("LOC-DEMO-MAG-A-RA-ET1-BAC03"),
    statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", origineProduit: "OEM",
    relationProduit: "EQUIVALENT", methodeValorisation: "CUMP", positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "N_A",
  });
  await ctx.addRef(batV2, "FABRICANT", "VARTA-570-901-065", true);
  await ctx.addRef(batV2, "FOURNISSEUR", "JPA-BAT-AGM70-680");
  await ctx.addFournisseur(batV2, SUP_JPA!, "JPA-BAT-AGM70-680", "112000", { estPrincipal: true, uniteId: U.PCE });
  await ctx.addCompat({ produitId: batV2, typeCompat: "POSITIVE", marque: "Toyota", modele: "Hilux", anneeDe: 2016, anneeA: 2026, motorisation: "2.8 D-4D", codeMoteur: "1GD-FTV", carburant: "diesel" });
  for (let i = 0; i < attrsBatt.length; i++) {
    const a = attrsBatt[i];
    await ctx.addAttribut("VARIANTE", batV2, a.cle, a.cle === "courant_cca" ? "680" : a.valeur, { typeAttribut: a.typeAttribut, unite: a.unite, uniteId: a.uniteId, ordre: i });
  }
  await ctx.setStock(batV2, "LOC-DEMO-MAG-A-RA-ET1-BAC03", { quantite: "3", rayon: "2", coutMoyen: "112000", uniteReferenceId: U.PCE });

  const batV3 = await addProduct({
    articleId: artBatt, typeProduit: "PIECE", codeBarre: "DEMO-BAT-AGM70-640", codeArticle: "BAT-DEMO-AGM70-640",
    titre: "Batterie AGM 70 Ah — 640 A (VARTA)", designationCourte: "Batterie AGM 70 Ah 640A",
    categorieId: ctx.cats.get("DEMO-BATTERIES"), marque: "VARTA", referenceFabricant: "VARTA-570-901-063",
    referencePrincipale: "VARTA-570-901-063", prixVente: "158000", prixAchat: "107000", prixPro: "144000",
    prixParticulier: "158000", tva: "19.25", uniteBaseId: U.PCE, suiviLot: false,
    seuilAlerte: 4, pointCommande: 3, statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE",
    etatProduit: "NEUF", origineProduit: "OEM", relationProduit: "EQUIVALENT", methodeValorisation: "CUMP",
    positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "N_A",
  });
  await ctx.addRef(batV3, "FABRICANT", "VARTA-570-901-063", true);
  await ctx.addFournisseur(batV3, SUP_JPA!, "JPA-BAT-AGM70-640", "107000", { estPrincipal: true, uniteId: U.PCE });
  for (let i = 0; i < attrsBatt.length; i++) {
    const a = attrsBatt[i];
    await ctx.addAttribut("VARIANTE", batV3, a.cle, a.cle === "courant_cca" ? "640" : a.valeur, { typeAttribut: a.typeAttribut, unite: a.unite, uniteId: a.uniteId, ordre: i });
  }
  // stock 0 → rupture sans lot
  await ctx.setStock(batV3, "LOC-DEMO-MAG-A-RB-ET2-BAC14", { quantite: "0", coutMoyen: "107000", uniteReferenceId: U.PCE });

  // Substitution EFB → AGM (niveauConfiance TECHNIQUE)
  const artBattEfb = await ctx.ensureArticle({ code: "ART-DEMO-BAT-EFB60", designation: "Batterie EFB 60 Ah", categorieId: ctx.cats.get("DEMO-BATTERIES"), typeProduit: "PIECE" });
  const batEfb = await addProduct({
    articleId: artBattEfb, typeProduit: "PIECE", codeBarre: "DEMO-BAT-EFB60", codeArticle: "BAT-DEMO-EFB60",
    titre: "Batterie EFB 60 Ah — 540 A (VARTA)", designationCourte: "Batterie EFB 60 Ah", categorieId: ctx.cats.get("DEMO-BATTERIES"),
    marque: "VARTA", referenceFabricant: "VARTA-570-901-060", referencePrincipale: "VARTA-570-901-060",
    prixVente: "135000", prixAchat: "92000", tva: "19.25", uniteBaseId: U.PCE,
    seuilAlerte: 2, statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF",
    origineProduit: "OEM", relationProduit: "SUBSTITUT", methodeValorisation: "CUMP", positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "N_A",
  });
  await ctx.addRef(batEfb, "FABRICANT", "VARTA-570-901-060", true);
  await ctx.addFournisseur(batEfb, SUP_JPA!, "JPA-BAT-EFB60", "92000", { estPrincipal: true, uniteId: U.PCE });
  await ctx.addCompat({ produitId: batEfb, typeCompat: "POSITIVE", marque: "Toyota", modele: "Corolla", anneeDe: 2014, anneeA: 2018, motorisation: "1.8", carburant: "essence" });
  await ctx.setStock(batEfb, "LOC-DEMO-MAG-A-RB-ET2-BAC14", { quantite: "2", coutMoyen: "92000", uniteReferenceId: U.PCE });
  await ctx.db.insert(produitSubstitutions).values({
    varianteAId: batEfb, varianteBId: batV1, niveauConfiance: "TECHNIQUE",
    motif: "EFB → AGM acceptable lorsque la chimie le permet (tournée vers le haut de gamme)", actif: true,
  } as any).onConflictDoNothing();

  // ═══ 2. HUILE MOTEUR 5W30 — PRODUIT ≠ STOCK ≠ LOT ≠ EMPLACEMENT (37 L = 2 lots = 2 magasins) ═══
  const artHuile = await ctx.ensureArticle({ code: "ART-DEMO-HUILE-5W30", designation: "Huile moteur 5W30 — Total Quartz 9000", categorieId: ctx.cats.get("DEMO-HUILES"), typeProduit: "CONSOMMABLE" });
  const huileV1 = await addProduct({
    articleId: artHuile, typeProduit: "CONSOMMABLE", codeBarre: "DEMO-HUILE-5W30-VRAC", codeArticle: "HUILE-DEMO-5W30-VRAC",
    titre: "Huile moteur 5W30 Total Quartz 9000 — vrac", designationCourte: "Huile 5W30 Quartz — vrac",
    categorieId: ctx.cats.get("DEMO-HUILES"), marque: "TOTAL", referenceFabricant: "TOTAL QUARTZ 9000 5W30",
    referencePrincipale: "TOTAL QUARTZ 9000 5W30", conditionnement: "Vrac (contenant 208 L)",
    prixVente: "6500", prixAchat: "3500", prixPro: "5500", prixParticulier: "6500", dernierPrixAchat: "3500",
    tva: "19.25", uniteBaseId: U.L, suiviLot: true, estReconditionnable: true, dlcJours: 180,
    seuilAlerte: 20, seuilCritique: 10, pointCommande: 30, stockMaximum: 100, stockSecurite: 15, classeAbc: "A",
    emplacementPrincipalId: ctx.emplacementId("LOC-DEMO-MAG-A-ZONEV"),
    statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", origineProduit: "CONSTRUCTEUR",
    methodeValorisation: "FIFO", positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "N_A",
  });
  await ctx.addRef(huileV1, "FABRICANT", "TOTAL QUARTZ 9000 5W30", true);
  await ctx.addRef(huileV1, "FOURNISSEUR", "TOT-H5W30-VRAC");
  await ctx.addRefEquiv(artHuile, "Toyota", "08798-9050", "OEM constructeur");
  await ctx.addFournisseur(huileV1, SUP_TOTAL!, "TOT-H5W30-VRAC", "3500", { estPrincipal: true, uniteId: U.L });
  await ctx.addAttribut("VARIANTE", huileV1, "viscosite", "5W-30", { typeAttribut: "TEXTE", ordre: 0 });
  await ctx.addAttribut("VARIANTE", huileV1, "norme", "API SN/SP — ACEA C3", { typeAttribut: "TEXTE", ordre: 1 });
  await ctx.addAttribut("VARIANTE", huileV1, "specification", "Total Quartz 9000", { typeAttribut: "TEXTE", ordre: 2 });

  // 4 niveaux : 37 L physiques (Magasin A 20 L / Magasin B 17 L) = LOT-A 12 L + LOT-B 25 L (16 + 21 → voir stocks_lots)
  await ctx.setStock(huileV1, "LOC-DEMO-MAG-A-ZONEV", { quantite: "20", rayon: "20", coutMoyen: "3500", uniteReferenceId: U.L });
  await ctx.setStock(huileV1, "LOC-DEMO-MAG-B-ZONEV", { quantite: "17", rayon: "17", coutMoyen: "3500", uniteReferenceId: U.L });
  const lotH1 = await ctx.addLot({
    produitId: huileV1, numeroLot: "LOT-DEMO-H5W30-A", fournisseurId: SUP_TOTAL, statut: "disponible",
    dateReception: "2026-07-15", quantiteInitiale: 12, coutUnitaire: "3500",
    dateFabrication: "2026-06-20", datePeremption: "2028-07-15",
    provenance: "Total Lubrifiants — Port de Cotonou", qualite: "API SN/SP", fabricant: "TOTAL",
  });
  const lotH2 = await ctx.addLot({
    produitId: huileV1, numeroLot: "LOT-DEMO-H5W30-B", fournisseurId: SUP_TOTAL, statut: "disponible",
    dateReception: "2026-08-20", quantiteInitiale: 25, coutUnitaire: "3500",
    dateFabrication: "2026-08-05", datePeremption: "2029-08-20",
    provenance: "Total Lubrifiants — Port de Cotonou", qualite: "API SN/SP", fabricant: "TOTAL",
  });
  await ctx.addStockLot(huileV1, lotH1, "12");
  await ctx.addStockLot(huileV1, lotH2, "25");
  await ctx.journal(huileV1, "ACHAT_RECEPTION", "E", 25, { lotId: lotH2, date: "2026-08-20", motif: "Réception fût 25 L — lot B" });
  await ctx.journal(huileV1, "ACHAT_RECEPTION", "E", 12, { lotId: lotH1, date: "2026-07-15", motif: "Réception fût 12 L — lot A" });
  await ctx.journal(huileV1, "SORTIE_OR", "S", 3, { date: "2026-08-28", motif: "Vidange OR#1398 (3 L) — Hilux" });
  await ctx.journal(huileV1, "RETOUR_ATELIER", "E", 3, { date: "2026-08-28", motif: "Retour 3 L non consommés (citerne)" });

  // Variante pack 4 L (SKU unitaire différent)
  const huileV2 = await addProduct({
    articleId: artHuile, typeProduit: "CONSOMMABLE", codeBarre: "DEMO-HUILE-5W30-4L", codeArticle: "HUILE-DEMO-5W30-4L",
    titre: "Huile moteur 5W30 Total Quartz 9000 — bidon 4 L", designationCourte: "Huile 5W30 Quartz — bidon 4 L",
    categorieId: ctx.cats.get("DEMO-HUILES"), marque: "TOTAL", referenceFabricant: "TOTAL QUARTZ 9000 4L",
    referencePrincipale: "TOTAL QUARTZ 9000 4L", conditionnement: "Carton de 6 bidons × 4 L",
    prixVente: "24500", prixAchat: "19500", prixPro: "22500", prixParticulier: "24500", tva: "19.25",
    uniteBaseId: U.PCE, suiviLot: true, dlcJours: 180, seuilAlerte: 2, pointCommande: 2,
    emplacementPrincipalId: ctx.emplacementId("LOC-DEMO-MAG-A-RA-ET1-BAC05"),
    statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", origineProduit: "CONSTRUCTEUR",
    methodeValorisation: "FIFO", positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "N_A",
  });
  await ctx.addRef(huileV2, "FABRICANT", "TOTAL QUARTZ 9000 4L", true);
  await ctx.addRef(huileV2, "FOURNISSEUR", "TOT-H5W30-4L");
  await ctx.addFournisseur(huileV2, SUP_TOTAL!, "TOT-H5W30-4L", "19500", { estPrincipal: true, uniteId: U.PCE });
  await ctx.setStock(huileV2, "LOC-DEMO-MAG-A-RA-ET1-BAC05", { quantite: "12", coutMoyen: "19500", uniteReferenceId: U.PCE });

  // ═══ 3. CLÉ DYNAMOMÉTRIQUE 40–200 N·m — MODÈLE → EXEMPLAIRES (dispo / prêté / maintenance) ═══
  const artCle = await ctx.ensureArticle({ code: "ART-DEMO-OUT-CLE200", designation: "Clé dynamométrique 40–200 N·m", categorieId: ctx.cats.get("DEMO-OUTCLES"), typeProduit: "OUTIL" });
  await ctx.db.insert(articleAttributs).values([
    { articleId: artCle, cle: "plage_couple", valeur: "40–200 N·m", ordre: 0, typeAttribut: "TEXTE", portee: "ARTICLE", searchable: true, filtrable: true, statutValeur: "RENSEIGNE" },
    { articleId: artCle, cle: "carre_transmission", valeur: "1/2\" (12,5 mm)", ordre: 1, typeAttribut: "TEXTE", portee: "ARTICLE", searchable: true, filtrable: true, statutValeur: "RENSEIGNE" },
    { articleId: artCle, cle: "precision", valeur: "± 4 %", ordre: 2, typeAttribut: "TEXTE", portee: "ARTICLE", searchable: true, filtrable: true, statutValeur: "RENSEIGNE" },
    { articleId: artCle, cle: "longueur", valeur: "660 mm", ordre: 3, typeAttribut: "TEXTE", portee: "ARTICLE", searchable: true, filtrable: true, statutValeur: "RENSEIGNE" },
  ] as any).onConflictDoNothing();

  const cleModele = await addProduct({
    articleId: artCle, typeProduit: "OUTIL", codeBarre: "OUT-CLE-M01", codeArticle: "OUT-CLE-M01",
    titre: "MODÈLE — Clé dynamométrique FACOM K.203A.200 (40–200 N·m)", designationCourte: "Modèle clé dynamo 40-200 Nm",
    categorieId: ctx.cats.get("DEMO-OUTCLES"), marque: "FACOM", referenceFabricant: "FACOM K.203A.200",
    referencePrincipale: "FACOM K.203A.200", prixAchat: "189000", tva: "19.25", uniteBaseId: U.PCE,
    typeOutil: "INDIVIDUEL", calibrable: true, suiviSerie: false, suiviLot: false,
    emplacementPrincipalId: ctx.emplacementId("LOC-DEMO-ARM-A"),
    statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", origineProduit: "AFTERMARKET",
    positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "N_A",
  });
  await ctx.addRef(cleModele, "FABRICANT", "FACOM K.203A.200", true);
  await ctx.addFournisseur(cleModele, SUP_BOSCH!, "BSH-CLE-40-200", "189000", { estPrincipal: true, uniteId: U.PCE });

  const cleEx = async (sku: string, titre: string, numSerie: string, emplacement: string | null, statutOutil: string | null) => {
    const pid = await addProduct({
      articleId: artCle, typeProduit: "OUTIL", codeBarre: sku, codeArticle: sku, titre,
      designationCourte: titre, categorieId: ctx.cats.get("DEMO-OUTCLES"), marque: "FACOM",
      referenceFabricant: "FACOM K.203A.200", referencePrincipale: "FACOM K.203A.200", prixAchat: "189000",
      tva: "19.25", uniteBaseId: U.PCE, typeOutil: "INDIVIDUEL", calibrable: true,
      suiviSerie: true, suiviLot: false, numeroSerie: numSerie, statutOutil: statutOutil ?? null,
      emplacementPrincipalId: emplacement ? ctx.emplacementId(emplacement) : null,
      statut: "actif", statutCycleVie: "ACTIF", niveau: "EXEMPLAIRE", etatProduit: "NEUF", origineProduit: "AFTERMARKET",
      positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "N_A",
    });
    return pid;
  };
  const cle1 = await cleEx("OUT-CLE-001", "Clé dynamométrique 40–200 N·m — exemplaire n°1 (disponible)", "K203A.200-1001", "LOC-DEMO-ARM-A", null);
  const cle2 = await cleEx("OUT-CLE-002", "Clé dynamométrique 40–200 N·m — exemplaire n°2 (prêtée)", "K203A.200-1002", "LOC-DEMO-ATEL-1", null);
  const cle3 = await cleEx("OUT-CLE-003", "Clé dynamométrique 40–200 N·m — exemplaire n°3 (maintenance)", "K203A.200-1003", "LOC-DEMO-MAINT", "REPARATION");

  // prêt actif sur OUT-CLE-002 (retour non fait) + historique calibration
  await ctx.db.insert(pretsOutils).values({
    agenceId: AGENCE_ID, outilId: cle2, technicienId: TEC1!, motif: "Reprise culasse — Hilux",
    dateSortie: DT("2026-09-05"), sortiePar: MAG, dateRetour: null, retourneLe: null, retournePar: null,
    etatRetour: null, remarque: null, actif: true,
  } as any).onConflictDoNothing();
  await ctx.db.insert(outillageCalibration).values([
    { outilId: cle1, dateCalibration: DT("2026-01-10"), organisme: "MecaDiag Expertises", certificat: "CAL-2026-0110", resultat: "CONFORME", tolerance: "±4 %", prochaineCalibration: DT("2027-01-10"), effectuePar: ctx.adminId },
    { outilId: cle2, dateCalibration: DT("2025-06-12"), organisme: "MecaDiag Expertises", certificat: "CAL-2025-0612", resultat: "CONFORME", tolerance: "±4 %", prochaineCalibration: DT("2026-06-12"), effectuePar: ctx.adminId },
  ] as any).onConflictDoNothing();
  await ctx.db.insert(outillageMaintenance).values({
    outilId: cle3, type: "CURATIVE", dateMaintenance: DT("2026-09-01"), prestataire: "FACOM Service",
    cout: "24000", rapportUrl: null, observations: "Cliquet de réglage dur — démontage + nettoyage + graissage",
    prochaineMaintenance: null, effectuePar: ctx.adminId,
  } as any).onConflictDoNothing();
  await ctx.db.insert(articleDocuments).values([
    { articleId: artCle, type: "FICHE_TECHNIQUE", titre: "Fiche technique FACOM K.203A.200", url: "https://example.com/fiches/facom-k203a200.pdf" },
    { articleId: artCle, type: "MANUEL", titre: "Manuel d'utilisation et calibration", url: "https://example.com/manuels/facom-k203a200.pdf" },
  ] as any).onConflictDoNothing();

  // ═══ 4. Support : plaquettes / disques / liquide dot4 + KIT révision freins (3 composants) ═══
  const artPlaq = await ctx.ensureArticle({ code: "ART-DEMO-PLAQ", designation: "Plaquettes de frein avant", categorieId: ctx.cats.get("DEMO-FREIN"), typeProduit: "PIECE" });
  const plaqToy = await addProduct({
    articleId: artPlaq, typeProduit: "PIECE", codeBarre: "DEMO-PLAQ-TOY-01", codeArticle: "PLAQ-DEMO-TOY-01",
    titre: "Plaquettes de frein avant — Toyota (HART)", designationCourte: "Plaquettes avant Toyota",
    categorieId: ctx.cats.get("DEMO-FREIN"), marque: "HART", referenceFabricant: "HART 950-01", refOem: "04465-0K120",
    referencePrincipale: "HART 950-01", prixVente: "30000", prixAchat: "18500", tva: "19.25",
    uniteBaseId: U.PCE, conditionnement: "Jeu de 4", suiviLot: true,
    seuilAlerte: 3, pointCommande: 4, emplacementPrincipalId: ctx.emplacementId("LOC-DEMO-MAG-A-RA-ET1-BAC05"),
    statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", origineProduit: "AFTERMARKET",
    methodeValorisation: "CUMP", positionCote: "LES_DEUX", positionEssieu: "AVANT", positionZone: "N_A", positionEmplacement: "FREINAGE",
  });
  await ctx.addRef(plaqToy, "FABRICANT", "HART 950-01", true);
  await ctx.addRef(plaqToy, "OEM", "04465-0K120");
  await ctx.addRef(plaqToy, "FOURNISSEUR", "JPA-PLAQ-TOY");
  await ctx.addFournisseur(plaqToy, SUP_JPA!, "JPA-PLAQ-TOY", "18500", { estPrincipal: true, uniteId: U.PCE });
  await ctx.addCompat({ produitId: plaqToy, typeCompat: "POSITIVE", marque: "Toyota", modele: "Hilux", anneeDe: 2016, anneeA: 2026, motorisation: "2.8 D-4D", position: "AVANT" });
  await ctx.addCompat({ produitId: plaqToy, typeCompat: "POSITIVE", marque: "Toyota", modele: "Corolla", anneeDe: 2014, anneeA: 2019, motorisation: "1.8", position: "AVANT" });
  await ctx.setStock(plaqToy, "LOC-DEMO-MAG-A-RA-ET1-BAC05", { quantite: "6", coutMoyen: "18500", uniteReferenceId: U.PCE });
  const lotPlaq = await ctx.addLot({ produitId: plaqToy, numeroLot: "LOT-DEMO-PLAQ-001", fournisseurId: SUP_JPA, dateReception: "2026-08-05", quantiteInitiale: 12, coutUnitaire: "18500", provenance: "JP Auto Distribution", fabricant: "HART" });
  await ctx.addStockLot(plaqToy, lotPlaq, "6");
  await ctx.journal(plaqToy, "ACHAT_RECEPTION", "E", 12, { lotId: lotPlaq, date: "2026-08-05", motif: "Réception BL-2026-0790" });
  await ctx.journal(plaqToy, "SORTIE_OR", "S", 6, { date: "2026-08-20", motif: "Sorties atelier (OR#1340, #1355)" });

  const plaqMB = await addProduct({
    articleId: artPlaq, typeProduit: "PIECE", codeBarre: "DEMO-PLAQ-MB-01", codeArticle: "PLAQ-DEMO-MB-01",
    titre: "Plaquettes de frein avant — Mercedes Sprinter (BOSCH)", designationCourte: "Plaquettes avant Sprinter",
    categorieId: ctx.cats.get("DEMO-FREIN"), marque: "BOSCH", referenceFabricant: "BOSCH 0 986 494 724",
    referencePrincipale: "BOSCH 0 986 494 724", prixVente: "45000", prixAchat: "29000", tva: "19.25",
    uniteBaseId: U.PCE, conditionnement: "Jeu de 2", seuilAlerte: 2, pointCommande: 2,
    emplacementPrincipalId: ctx.emplacementId("LOC-DEMO-MAG-A-RA-ET1-BAC05"),
    statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", origineProduit: "AFTERMARKET",
    methodeValorisation: "CUMP", positionCote: "LES_DEUX", positionEssieu: "AVANT", positionZone: "N_A", positionEmplacement: "FREINAGE",
  });
  await ctx.addRef(plaqMB, "FABRICANT", "BOSCH 0 986 494 724", true);
  await ctx.addRef(plaqMB, "FOURNISSEUR", "BSH-PLAQ-MB");
  await ctx.addFournisseur(plaqMB, SUP_BOSCH!, "BSH-PLAQ-MB", "29000", { estPrincipal: true, uniteId: U.PCE });
  await ctx.addCompat({ produitId: plaqMB, typeCompat: "POSITIVE", marque: "Mercedes", modele: "Sprinter", anneeDe: 2018, anneeA: 2026, motorisation: "313 CDI", position: "AVANT" });
  await ctx.setStock(plaqMB, "LOC-DEMO-MAG-A-RA-ET1-BAC05", { quantite: "3", coutMoyen: "29000", uniteReferenceId: U.PCE });

  const artDisq = await ctx.ensureArticle({ code: "ART-DEMO-DISQ", designation: "Disques de frein avant ventilés 278 mm", categorieId: ctx.cats.get("DEMO-FREIN"), typeProduit: "PIECE" });
  const disqToy = await addProduct({
    articleId: artDisq, typeProduit: "PIECE", codeBarre: "DEMO-DISQ-TOY-01", codeArticle: "DISQ-DEMO-TOY-01",
    titre: "Disque de frein avant ventilé 278 mm — Toyota", designationCourte: "Disque frein 278 mm",
    categorieId: ctx.cats.get("DEMO-FREIN"), marque: "HART", referenceFabricant: "HART 321-01", referencePrincipale: "HART 321-01",
    prixVente: "85000", prixAchat: "52000", tva: "19.25", uniteBaseId: U.PCE, conditionnement: "Pièce (paire vendue séparément)",
    seuilAlerte: 2, pointCommande: 3, emplacementPrincipalId: ctx.emplacementId("LOC-DEMO-MAG-A-RA-ET1-BAC03"),
    statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", origineProduit: "AFTERMARKET",
    methodeValorisation: "CUMP", positionCote: "LES_DEUX", positionEssieu: "AVANT", positionZone: "N_A", positionEmplacement: "FREINAGE",
  });
  await ctx.addRef(disqToy, "FABRICANT", "HART 321-01", true);
  await ctx.addRef(disqToy, "OEM", "43512-0K130");
  await ctx.addFournisseur(disqToy, SUP_JPA!, "JPA-DISQ-TOY", "52000", { estPrincipal: true, uniteId: U.PCE });
  await ctx.setStock(disqToy, "LOC-DEMO-MAG-A-RA-ET1-BAC03", { quantite: "4", coutMoyen: "52000", uniteReferenceId: U.PCE });

  const artDot4 = await ctx.ensureArticle({ code: "ART-DEMO-LQF", designation: "Liquide de frein DOT4 — 1 L", categorieId: ctx.cats.get("DEMO-HUILES"), typeProduit: "CONSOMMABLE" });
  const dot4 = await addProduct({
    articleId: artDot4, typeProduit: "CONSOMMABLE", codeBarre: "DEMO-LQF-DOT4-01", codeArticle: "LQF-DEMO-DOT4-01",
    titre: "Liquide de frein DOT4 1 L (TOTAL)", designationCourte: "Liquide frein DOT4 1L",
    categorieId: ctx.cats.get("DEMO-HUILES"), marque: "TOTAL", referenceFabricant: "TOTAL FLUIDE 9000 DOT4", referencePrincipale: "TOTAL FLUIDE 9000 DOT4",
    prixVente: "8500", prixAchat: "4200", tva: "19.25", uniteBaseId: U.PCE, suiviLot: true, dlcJours: 730,
    seuilAlerte: 4, pointCommande: 6, emplacementPrincipalId: ctx.emplacementId("LOC-DEMO-MAG-A-RA-ET1-BAC05"),
    statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", origineProduit: "CONSTRUCTEUR",
    methodeValorisation: "FIFO", positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "N_A",
  });
  await ctx.addRef(dot4, "FABRICANT", "TOTAL FLUIDE 9000 DOT4", true);
  await ctx.addFournisseur(dot4, SUP_TOTAL!, "TOT-DOT4-1L", "4200", { estPrincipal: true, uniteId: U.PCE });
  await ctx.setStock(dot4, "LOC-DEMO-MAG-A-RA-ET1-BAC05", { quantite: "12", coutMoyen: "4200", uniteReferenceId: U.PCE });

  // Kit révision freins : 3 composants (plaquettes + disques + liquide)
  const artKit = await ctx.ensureArticle({ code: "ART-DEMO-KIT-FREIN", designation: "Kit révision freins avant (plaquettes + disques + DOT4)", categorieId: ctx.cats.get("DEMO-FREIN"), typeProduit: "PIECE" });
  const kitFrein = await addProduct({
    articleId: artKit, typeProduit: "PIECE", codeBarre: "DEMO-KIT-FREIN-01", codeArticle: "KIT-DEMO-FREIN-01",
    titre: "Kit révision freins avant — paire plaquettes + 2 disques + DOT4 1L", designationCourte: "Kit révision freins",
    categorieId: ctx.cats.get("DEMO-FREIN"), referencePrincipale: "KIT-FREIN-TOY", conditionnement: "Kit complet",
    prixVente: "205000", prixAchat: "130000", tva: "19.25", uniteBaseId: U.PCE, seuilAlerte: 1,
    statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE", etatProduit: "NEUF", methodeValorisation: "CUMP",
    positionCote: "LES_DEUX", positionEssieu: "AVANT", positionZone: "N_A", positionEmplacement: "FREINAGE",
  });
  await ctx.db.insert(kitsLignes).values([
    { kitId: kitFrein, composantId: plaqToy, quantite: "1" },
    { kitId: kitFrein, composantId: disqToy, quantite: "2" },
    { kitId: kitFrein, composantId: dot4, quantite: "1" },
  ] as any).onConflictDoNothing();

  // ═══ 5. ÉQUIPEMENT : pont élévateur 2 colonnes 4 t (immobilisation + maintenance) ═══
  const artPont = await ctx.ensureArticle({ code: "ART-DEMO-EQP-PONT", designation: "Pont élévateur 2 colonnes 4 t", categorieId: ctx.cats.get("DEMO-EQP-PONT"), typeProduit: "EQUIPEMENT" });
  const pont = await addProduct({
    articleId: artPont, typeProduit: "EQUIPEMENT", codeBarre: "EQP-DEMO-01", codeArticle: "EQP-DEMO-01",
    titre: "Pont élévateur 2 colonnes 4 t (SIVERTEC)", designationCourte: "Pont 2 colonnes 4t",
    categorieId: ctx.cats.get("DEMO-EQP-PONT"), marque: "SIVERTEC", numeroImmobilisation: "EQP-DEMO-01",
    numeroSerie: "SN-SV-P42-DEMO1", dateAchat: DT("2019-03-15"), valeurAcquisition: "4850000",
    responsableId: GES, emplacementPrincipalId: ctx.emplacementId("LOC-DEMO-ATEL-1"), etatEquipement: "TRES_BON",
    typeOutil: "MACHINE", calibrable: false, garantieMois: 0, prixAchat: "0",
    statut: "actif", statutCycleVie: "ACTIF", niveau: "EXEMPLAIRE", etatProduit: "NEUF", origineProduit: "CONSTRUCTEUR",
    positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "N_A",
  });
  await ctx.db.insert(outillageMaintenance).values({
    outilId: pont, type: "PREVENTIVE", dateMaintenance: DT("2026-06-10"), prestataire: "SIVERTEC SA",
    cout: "85000", rapportUrl: null, observations: "Contrôle ISO 17924 — câbles + calage", prochaineMaintenance: DT("2026-12-10"), effectuePar: ctx.adminId,
  } as any).onConflictDoNothing();

  // ═══ 6. SERVICES tarifés (main d'œuvre) ═══
  const services = [
    { art: "SRV-DEMO-VIDANGE", designation: "Vidange complète (huile + filtre)", duree: "1 h 00", pro: "8500", part: "11000", garantie: "3" },
    { art: "SRV-DEMO-DIAG-ELEC", designation: "Diagnostic électronique", duree: "1 h 00", pro: "15000", part: "20000", garantie: "0" },
    { art: "SRV-DEMO-POSE-BAT", designation: "Remplacement batterie (dépose / repose)", duree: "0 h 30", pro: "6000", part: "8000", garantie: "0" },
  ];
  for (const s of services) {
    const artId = await ctx.ensureArticle({ code: s.art, designation: s.designation, categorieId: ctx.cats.get("DEMO-SRV-ENTRETIEN"), typeProduit: "SERVICE" });
    const pid = await addProduct({
      articleId: artId, typeProduit: "SERVICE", codeBarre: `DEMO-${s.art}`, codeArticle: `SRV-${s.art}`,
      titre: s.designation, designationCourte: s.designation, categorieId: ctx.cats.get("DEMO-SRV-ENTRETIEN"),
      prixVente: s.part, prixPro: s.pro, prixParticulier: s.part, prixMinimumVente: s.pro, tva: "19.25",
      uniteBaseId: U.H, conditionnement: s.duree, statut: "actif", statutCycleVie: "ACTIF",
      niveau: "VARIANTE", etatProduit: "NEUF", origineProduit: "CONSTRUCTEUR", methodeValorisation: "CUMP",
      positionCote: "N_A", positionEssieu: "N_A", positionZone: "N_A", positionEmplacement: "N_A",
    });
    if (pid) {
      await ctx.db.insert(tarifs).values([
        { produitId: pid, type: "PRO", prix: s.pro, label: "Tarif professionnel", quantiteMin: 1, isActive: true },
        { produitId: pid, type: "PARTICULIER", prix: s.part, label: "Tarif particulier", quantiteMin: 1, isActive: true },
      ] as any).onConflictDoNothing();
      await ctx.addAttribut("VARIANTE", pid, "duree", s.duree, { typeAttribut: "DUREE", ordre: 0 });
      await ctx.addAttribut("VARIANTE", pid, "expertise", "Technicien confirmé", { typeAttribut: "TEXTE", ordre: 1 });
      await ctx.addAttribut("VARIANTE", pid, "garantie_prestation", s.garantie, { typeAttribut: "NOMBRE", ordre: 2 });
    }
  }

  // ── Décompte ──
  const summary = await ctx.db.select({ n: mouvementsStock.id }).from(mouvementsStock).limit(1);
  void summary;
  console.log("=== SEED DEMO (VITRINE) TERMINÉ ===");
  console.log(`Produits réels créés        : ${pidMap.size}`);
  console.log("Articles (produit_articles)  : ART-DEMO-BAT-AGM70, ART-DEMO-BAT-EFB60, ART-DEMO-HUILE-5W30, ART-DEMO-OUT-CLE200, ART-DEMO-PLAQ, ART-DEMO-DISQ, ART-DEMO-LQF, ART-DEMO-KIT-FREIN, ART-DEMO-EQP-PONT, SRV-DEMO-*");
  console.log("Emplacements hiérarchiques   : 17 (Magasin A → Rayon B → Étagère 2 → Bac 14 ; Magasin B ; Armoire A ; Atelier ; Maintenance)");
  console.log("Véhicules                    : 3 (Hilux / Corolla / Sprinter)");
  console.log("Fournisseurs                 : 3 — Employés : 4");
  console.log("────────────────────────────────────────────");
  console.log("DÉMONSTRATION 1 — Batterie AGM 70 Ah (fiche variante) :");
  console.log("  Réf. principale VARTA-570-901-068 + OEM 28800-0Y050 + fournisseur + ancienne BAT-560-222 (5 réfs)");
  console.log("  3 variantes (760 / 680 / 640 A) ; attributs Technologie AGM, 12 V, 70 Ah, CCA 760 A");
  console.log("  Compat : Hilux 2.8 (POSITIVE) · RAV4 2.5 (POSITIVE) · Hilux 2.4 (NEGATIVE)");
  console.log("  Stock : Disponible 7 / Réservé 2 / Bloqué 1 = 10 (Bac 14 Magasin A : 6 dont 1 réservée + 1 bloquée ; Bac 08 Magasin B : 4 dont 1 réservée)");
  console.log("  Lots  : LOT-DEMO-BAT-2026-001 (5 u, péremption 2029) + LOT-DEMO-BAT-2026-002 (3 u, 2030) + 2 hors lot");
  console.log("  Historique : réception (10) → déplacement MagA→MagB → réservation 2 → sortie OR → inventaire +2");
  console.log("DÉMONSTRATION 2 — Huile 5W30 (4 niveaux) : PRODUIT ≠ STOCK ≠ LOT ≠ EMPLACEMENT");
  console.log("  37 L physiques = Magasin A 20 L + Magasin B 17 L ; stocks_lots : LOT-A 12 L + LOT-B 25 L ; FEFO FIFO");
  console.log("DÉMONSTRATION 3 — Clé dynamométrique (MODÈLE → EXEMPLAIRES) :");
  console.log("  Modèle FACOM K.203A.200 : 40–200 N·m, carré 1/2\", précision ±4 %, longueur 660 mm");
  console.log("  OUT-CLE-001 Dispo (Armoire A · SN 1001 · calibrée) | OUT-CLE-002 PRÊTÉ à S. Hounkpé (Atelier · SN 1002 · cal. échue) | OUT-CLE-003 Maintenance (SN 1003)");
  console.log("  + Kit révision freins (3 composants) · Pont 2 colonnes (immobilisation + maintenance ISO) · 3 services tarifés");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });