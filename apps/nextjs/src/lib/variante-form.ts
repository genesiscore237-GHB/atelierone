/**
 * Source unique du formulaire de variante / exemplaire.
 *
 * Trois écrans créent ou modifient des variantes : le wizard du
 * recensement (VarianteCard), le modal « nouvelle variante » de la fiche
 * article et le formulaire d'édition de la fiche variante. Jusqu'ici
 * chacun copiait ses listes d'états, son état de formulaire et son
 * mapping vers l'input TRPC : ajouter un champ obligeait à modifier
 * quatre endroits, et le service en oubliait un avec une donnée
 * silencieusement perdue.
 *
 * Ce module ne connaît ni la base ni le réseau : valeurs de référence,
 * état partagé, valeurs par défaut et payload pour les deux inputs
 * server (`articles.addVariante`, `articles.updateVariante`). Le
 * contrat des VALEURS d'enum reste le routeur articles ; ici, on
 * fournit libellés + mécanique de formulaire.
 */

/** Contrat de référence des valeurs : articles-router.ts. */
export const ETATS_PRODUIT = ["NEUF", "OCCASION", "RECONDITIONNE", "REMANUFACTURE"] as const;
export const ORIGINES_PRODUIT = ["CONSTRUCTEUR", "OEM", "AFTERMARKET", "ADAPTABLE"] as const;
export const COTES = ["GAUCHE", "DROITE", "CENTRAL", "LES_DEUX", "N_A"] as const;
export const ESSIEUX = ["AVANT", "ARRIERE", "N_A"] as const;
export const ZONES = ["INTERIEUR", "EXTERIEUR", "SUPERIEUR", "INFERIEUR", "N_A"] as const;
export const EMPLACEMENTS_POS = ["MOTEUR", "BOITE", "ROUE", "HABITACLE", "CARROSSERIE", "FREINAGE", "CLIM", "CHASSIS", "N_A"] as const;
export const TYPES_OUTIL = ["INDIVIDUEL", "KIT", "JEU", "MACHINE"] as const;
export const ETATS_EQUIPEMENT = ["NEUF", "TRES_BON", "BON", "MOYEN", "USE", "ENDOMMAGE", "HORS_SERVICE", "EN_REPARATION"] as const;

export const ETAT_PRODUIT_LABELS: Record<string, string> = {
  NEUF: "Neuf",
  OCCASION: "Occasion",
  RECONDITIONNE: "Reconditionné",
  REMANUFACTURE: "Remanufacturé",
};

export const ORIGINE_PRODUIT_LABELS: Record<string, string> = {
  CONSTRUCTEUR: "Constructeur",
  OEM: "OEM",
  AFTERMARKET: "Aftermarket",
  ADAPTABLE: "Adaptable",
};

export const LIB_COTE: Record<string, string> = {
  GAUCHE: "Gauche",
  DROITE: "Droite",
  CENTRAL: "Central",
  LES_DEUX: "Gauche + droit",
  N_A: "— non applicable —",
};

export const LIB_ESSIEU: Record<string, string> = {
  AVANT: "Essieu avant",
  ARRIERE: "Essieu arrière",
  N_A: "— non applicable —",
};

export const LIB_ZONE: Record<string, string> = {
  INTERIEUR: "Intérieur",
  EXTERIEUR: "Extérieur",
  SUPERIEUR: "Supérieur",
  INFERIEUR: "Inférieur",
  N_A: "— non applicable —",
};

export const LIB_EMP: Record<string, string> = {
  MOTEUR: "Moteur",
  BOITE: "Boîte",
  ROUE: "Roue",
  HABITACLE: "Habitacle",
  CARROSSERIE: "Carrosserie",
  FREINAGE: "Freinage",
  CLIM: "Climatisation",
  CHASSIS: "Châssis",
  N_A: "— non applicable —",
};

/** Conversions des positions de montage. Logique pure (aucune dépendance)
 * : importable côté client autant que côté serveur. Les unions ci-dessous
 * sont exactement ce que le serveur accepte — le formulaire ne peut donc
 * pas produire autre chose. */
function positionDeListe<E extends string>(liste: readonly E[], valeur: string | null | undefined, sinon: E): E {
  return valeur && (liste as readonly string[]).includes(valeur) ? (valeur as E) : sinon;
}

/** Sélection d'un menu déroulant (chaîne du DOM) → valeur de l'état. */
export const positionCoteDuSelect = (v: string): VarianteFormState["positionCote"] => positionDeListe(COTES, v, "N_A");
export const positionEssieuDuSelect = (v: string): VarianteFormState["positionEssieu"] => positionDeListe(ESSIEUX, v, "N_A");
export const positionZoneDuSelect = (v: string): VarianteFormState["positionZone"] => positionDeListe(ZONES, v, "N_A");
export const positionEmplacementDuSelect = (v: string): VarianteFormState["positionEmplacement"] => positionDeListe(EMPLACEMENTS_POS, v, "N_A");

/** Lecture d'un champ serveur brut (string | null) → valeur de l'état. */
export const positionCoteDuServeur = positionCoteDuSelect;
export const positionEssieuDuServeur = positionEssieuDuSelect;
export const positionZoneDuServeur = positionZoneDuSelect;
export const positionEmplacementDuServeur = positionEmplacementDuSelect;

/** Sélection d'un menu déroulant (chaîne du DOM) → valeur de l'état. */
export const etatProduitDuSelect = (v: string): VarianteFormState["etatProduit"] => positionDeListe(ETATS_PRODUIT, v, "NEUF");
export const origineProduitDuSelect = (v: string): VarianteFormState["origineProduit"] => positionDeListe(ORIGINES_PRODUIT, v, "AFTERMARKET");
export const etatProduitDuServeur = etatProduitDuSelect;
export const origineProduitDuServeur = origineProduitDuSelect;

/** État partagé des trois formulaires. Tout en chaînes : la source de
 * vérité de la saisie, la conversion numérique ne se fait qu'au moment
 * du payload (une case vide vaut « non renseigné », jamais zéro). */
export type VarianteFormState = {
  marque: string;
  referenceFabricant: string;
  refOem: string;
  refAftermarket: string;
  referencePrincipale: string;
  codeArticle: string;
  codeBarre: string;
  conditionnement: string;
  fournisseurId: string;
  prixAchat: string;
  prixVente: string;
  prixPro: string;
  prixParticulier: string;
  prixMinimumVente: string;
  tva: string;
  etatProduit: (typeof ETATS_PRODUIT)[number];
  origineProduit: (typeof ORIGINES_PRODUIT)[number];
  // Positions de montage : les unions exactes du contrat serveur — l'état ne
  // peut pas dire autre chose que ce que le backend accepte.
  positionCote: "GAUCHE" | "DROITE" | "CENTRAL" | "LES_DEUX" | "N_A";
  positionEssieu: "AVANT" | "ARRIERE" | "N_A";
  positionZone: "INTERIEUR" | "EXTERIEUR" | "SUPERIEUR" | "INFERIEUR" | "N_A";
  positionEmplacement: "MOTEUR" | "BOITE" | "ROUE" | "HABITACLE" | "CARROSSERIE" | "FREINAGE" | "CLIM" | "CHASSIS" | "N_A";
  uniteStockId: string;
  stockInitial: string;
  emplacementStockId: string;
  seuilAlerte: string;
  stockSecurite: string;
  pointCommande: string;
  qteMinCommande: string;
  numeroSerie: string;
  numeroLot: string;
  dateFabrication: string;
  dateExpiration: string;
  garantieMois: string;
  estCore: boolean;
  valeurCore: string;
  typeOutil: string;
  etatEquipement: string;
  calibrable: boolean;
  numeroImmobilisation: string;
  valeurAcquisition: string;
  occasionEtatConstate: string;
  occasionDefauts: string;
  occasionProvenance: string;
  occasionKilometrage: string;
  occasionGarantieMois: string;
};

export const varianteVide = (): VarianteFormState => ({
  marque: "",
  referenceFabricant: "",
  refOem: "",
  refAftermarket: "",
  referencePrincipale: "",
  codeArticle: "",
  codeBarre: "",
  conditionnement: "",
  fournisseurId: "",
  prixAchat: "",
  prixVente: "",
  prixPro: "",
  prixParticulier: "",
  prixMinimumVente: "",
  tva: "",
  etatProduit: "NEUF",
  origineProduit: "AFTERMARKET",
  positionCote: "N_A",
  positionEssieu: "N_A",
  positionZone: "N_A",
  positionEmplacement: "N_A",
  uniteStockId: "",
  stockInitial: "",
  emplacementStockId: "",
  seuilAlerte: "5",
  stockSecurite: "",
  pointCommande: "",
  qteMinCommande: "",
  numeroSerie: "",
  numeroLot: "",
  dateFabrication: "",
  dateExpiration: "",
  garantieMois: "",
  estCore: false,
  valeurCore: "",
  typeOutil: "INDIVIDUEL",
  etatEquipement: "",
  calibrable: false,
  numeroImmobilisation: "",
  valeurAcquisition: "",
  occasionEtatConstate: "",
  occasionDefauts: "",
  occasionProvenance: "",
  occasionKilometrage: "",
  occasionGarantieMois: "",
});

/** État initial d'édition : prérempli depuis la variante enregistrée. */
export const varianteDepuisServeur = (v: any): VarianteFormState => ({
  ...varianteVide(),
  marque: v?.marque ?? "",
  referenceFabricant: v?.referenceFabricant ?? "",
  refOem: v?.refOem ?? "",
  refAftermarket: v?.refAftermarket ?? "",
  referencePrincipale: v?.referencePrincipale ?? "",
  codeArticle: v?.codeArticle ?? "",
  codeBarre: v?.codeBarre ?? "",
  conditionnement: v?.conditionnement ?? "",
  fournisseurId: v?.fournisseurId ? String(v.fournisseurId) : "",
  prixAchat: v?.prixAchat ?? "",
  prixVente: v?.prixVente ?? "",
  prixPro: v?.prixPro ?? "",
  prixParticulier: v?.prixParticulier ?? "",
  prixMinimumVente: v?.prixMinimumVente ?? "",
  tva: v?.tva ?? "",
  etatProduit: etatProduitDuServeur(v?.etatProduit),
  origineProduit: origineProduitDuServeur(v?.origineProduit),
  positionCote: positionCoteDuServeur(v?.positionCote),
  positionEssieu: positionEssieuDuServeur(v?.positionEssieu),
  positionZone: positionZoneDuServeur(v?.positionZone),
  positionEmplacement: positionEmplacementDuServeur(v?.positionEmplacement),
  uniteStockId: v?.uniteStockId ?? "",
  stockInitial: v?.stockInitial ?? "",
  emplacementStockId: v?.emplacementStockId ? String(v.emplacementStockId) : "",
  seuilAlerte: v?.seuilAlerte ?? "",
  stockSecurite: v?.stockSecurite ?? "",
  pointCommande: v?.pointCommande ?? "",
  qteMinCommande: v?.qteMinCommande ?? "",
  numeroSerie: v?.numeroSerie ?? "",
  numeroLot: v?.numeroLot ?? "",
  dateFabrication: v?.dateFabrication ? String(v.dateFabrication).slice(0, 10) : "",
  dateExpiration: v?.dateExpiration ? String(v.dateExpiration).slice(0, 10) : "",
  garantieMois: v?.garantieMois ?? "",
  estCore: v?.estCore ?? false,
  valeurCore: v?.valeurCore ?? "",
  typeOutil: v?.typeOutil ?? "",
  etatEquipement: v?.etatEquipement ?? "",
  calibrable: v?.calibrable ?? false,
  numeroImmobilisation: v?.numeroImmobilisation ?? "",
  valeurAcquisition: v?.valeurAcquisition ?? "",
  occasionEtatConstate: v?.occasionEtatConstate ?? "",
  occasionDefauts: v?.occasionDefauts ?? "",
  occasionProvenance: v?.occasionProvenance ?? "",
  occasionKilometrage: v?.occasionKilometrage ?? "",
  occasionGarantieMois: v?.occasionGarantieMois ?? "",
});

/** Chaîne de saisie → string | undefined. Une case blanche = non renseigné. */
export const strSaisie = (s?: string) => {
  const t = (s ?? "").trim();
  return t === "" ? undefined : t;
};

/** Nombre de saisie → number | undefined. « 0 » explicite = zéro. */
export const numSaisie = (s?: string) => {
  const t = (s ?? "").trim();
  return t === "" ? undefined : Number(t);
};

/** Nombre de saisie → number | null. À l'édition, « vide » efface le champ
 * en base (le formulaire fait foi). */
export const numSaisieEffacable = (s?: string) => {
  const t = (s ?? "").trim();
  return t === "" ? null : Number(t);
};

/** Payload pour `articles.addVariante`. Vétuste par rapport au wizard
 * (pas de dates fabrication / expiration affichées) : les champs non
 * affichés restent vides et ne partent pas au serveur. */
export function payloadCreation(f: VarianteFormState, typeProduit: string) {
  const estOutil = typeProduit === "OUTIL" || typeProduit === "EQUIPEMENT";
  const estEquipement = typeProduit === "EQUIPEMENT";
  return {
    marque: strSaisie(f.marque),
    referenceFabricant: strSaisie(f.referenceFabricant),
    refOem: strSaisie(f.refOem),
    refAftermarket: strSaisie(f.refAftermarket),
    referencePrincipale: strSaisie(f.referencePrincipale),
    codeArticle: strSaisie(f.codeArticle),
    codeBarre: strSaisie(f.codeBarre),
    conditionnement: strSaisie(f.conditionnement),
    prixAchat: numSaisie(f.prixAchat),
    prixVente: numSaisie(f.prixVente),
    prixPro: numSaisie(f.prixPro),
    prixParticulier: numSaisie(f.prixParticulier),
    prixMinimumVente: numSaisie(f.prixMinimumVente),
    tva: numSaisie(f.tva),
    fournisseurId: numSaisie(f.fournisseurId),
    uniteStockId: strSaisie(f.uniteStockId),
    stockInitial: numSaisie(f.stockInitial),
    emplacementStockId: numSaisie(f.emplacementStockId),
    typeOutil: estOutil ? strSaisie(f.typeOutil) || "INDIVIDUEL" : undefined,
    etatEquipement: estOutil ? strSaisie(f.etatEquipement) : undefined,
    calibrable: estOutil ? f.calibrable : undefined,
    numeroImmobilisation: estEquipement ? strSaisie(f.numeroImmobilisation) : undefined,
    valeurAcquisition: estEquipement ? numSaisie(f.valeurAcquisition) : undefined,
    etatProduit: f.etatProduit || undefined,
    origineProduit: f.origineProduit || undefined,
    positionCote: f.positionCote && f.positionCote !== "N_A" ? f.positionCote : undefined,
    positionEssieu: f.positionEssieu && f.positionEssieu !== "N_A" ? f.positionEssieu : undefined,
    positionZone: f.positionZone && f.positionZone !== "N_A" ? f.positionZone : undefined,
    positionEmplacement: f.positionEmplacement && f.positionEmplacement !== "N_A" ? f.positionEmplacement : undefined,
    seuilAlerte: numSaisie(f.seuilAlerte),
    stockSecurite: numSaisie(f.stockSecurite),
    pointCommande: numSaisie(f.pointCommande),
    qteMinCommande: numSaisie(f.qteMinCommande),
    numeroSerie: strSaisie(f.numeroSerie),
    numeroLot: strSaisie(f.numeroLot),
    garantieMois: numSaisie(f.garantieMois),
    estCore: f.estCore,
    valeurCore: f.estCore ? numSaisie(f.valeurCore) : undefined,
    // Occasion : renseigné seulement quand la pièce n'est pas neuve. Un
    // champ laissé vide reste NULL en base — c'est « inconnu », pas « zéro ».
    ...(f.etatProduit && f.etatProduit !== "NEUF"
      ? {
          occasionEtatConstate: strSaisie(f.occasionEtatConstate),
          occasionDefauts: strSaisie(f.occasionDefauts),
          occasionProvenance: strSaisie(f.occasionProvenance),
          occasionKilometrage: numSaisie(f.occasionKilometrage),
          occasionGarantieMois: numSaisie(f.occasionGarantieMois),
        }
      : {}),
  };
}

/** Payload pour `articles.updateVariante`. Le formulaire fait foi : tout
 * champ nullable remplacé à vide part en `null` (efface), jamais en
 * « silence, on garde l'ancien ». Les chaînes non nullables ne partent
 * que si elles sont renseignées — le contrat serveur ne permet pas de
 * les effacer (limite à lever côté serveur plus tard). */
export function payloadEdition(f: VarianteFormState) {
  return {
    marque: strSaisie(f.marque),
    referenceFabricant: strSaisie(f.referenceFabricant),
    refOem: strSaisie(f.refOem) ?? null,
    refAftermarket: strSaisie(f.refAftermarket) ?? null,
    referencePrincipale: strSaisie(f.referencePrincipale),
    conditionnement: strSaisie(f.conditionnement),
    codeBarre: strSaisie(f.codeBarre),
    codeArticle: strSaisie(f.codeArticle),
    fournisseurId: numSaisieEffacable(f.fournisseurId),
    prixAchat: numSaisieEffacable(f.prixAchat),
    prixVente: numSaisieEffacable(f.prixVente),
    prixPro: numSaisieEffacable(f.prixPro),
    prixParticulier: numSaisieEffacable(f.prixParticulier),
    prixMinimumVente: numSaisieEffacable(f.prixMinimumVente),
    tva: numSaisieEffacable(f.tva),
    etatProduit: f.etatProduit || undefined,
    origineProduit: f.origineProduit || undefined,
    positionCote: f.positionCote && f.positionCote !== "N_A" ? f.positionCote : null,
    positionEssieu: f.positionEssieu && f.positionEssieu !== "N_A" ? f.positionEssieu : null,
    positionZone: f.positionZone && f.positionZone !== "N_A" ? f.positionZone : null,
    positionEmplacement: f.positionEmplacement && f.positionEmplacement !== "N_A" ? f.positionEmplacement : null,
    seuilAlerte: numSaisieEffacable(f.seuilAlerte),
    stockSecurite: numSaisieEffacable(f.stockSecurite),
    pointCommande: numSaisieEffacable(f.pointCommande),
    qteMinCommande: numSaisieEffacable(f.qteMinCommande),
    numeroSerie: strSaisie(f.numeroSerie),
    numeroLot: strSaisie(f.numeroLot),
    dateFabrication: strSaisie(f.dateFabrication),
    dateExpiration: strSaisie(f.dateExpiration),
    garantieMois: numSaisieEffacable(f.garantieMois),
    estCore: f.estCore,
    valeurCore: f.estCore ? numSaisieEffacable(f.valeurCore) : undefined,
    typeOutil: strSaisie(f.typeOutil),
    etatEquipement: strSaisie(f.etatEquipement),
    calibrable: f.calibrable,
    numeroImmobilisation: strSaisie(f.numeroImmobilisation),
    valeurAcquisition: numSaisieEffacable(f.valeurAcquisition),
    // Occasion : le formulaire fait foi. Repasser la pièce en « neuf » efface
    // ces champs (null explicite) — une donnée d'occasion sur une pièce neuve
    // serait un mensonge de plus, pas une donnée de plus.
    ...(f.etatProduit && f.etatProduit !== "NEUF"
      ? {
          occasionEtatConstate: strSaisie(f.occasionEtatConstate) ?? null,
          occasionDefauts: strSaisie(f.occasionDefauts) ?? null,
          occasionProvenance: strSaisie(f.occasionProvenance) ?? null,
          occasionKilometrage: numSaisieEffacable(f.occasionKilometrage),
          occasionGarantieMois: numSaisieEffacable(f.occasionGarantieMois),
        }
      : {
          occasionEtatConstate: null,
          occasionDefauts: null,
          occasionProvenance: null,
          occasionKilometrage: null,
          occasionGarantieMois: null,
        }),
  };
}
