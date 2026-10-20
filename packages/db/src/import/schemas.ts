import { z } from "zod";
import {
  montant,
  montantOptionnel,
  code,
  texteRequis,
  texteOptionnel,
  texteOptionnelMax,
  booleen,
  entierOptionnel,
  dateOptionnelle,
  refSource,
} from "./primitives";

/**
 * SCHÉMAS CANONIQUES — le format d'import IMPOSÉ par le système.
 * Toute donnée fournie pour un import doit respecter ces contrats.
 * Les références entre entités se font par CODES STABLES (jamais par IDs internes) :
 *   categorieCode, uniteCode, fournisseurCode, codeBarre.
 * Chaque fichier contient UNE entité, sous forme de tableau JSON (array) ou JSONL (1 objet par ligne).
 */

export const TYPE_PRODUIT = ["PIECE", "SERVICE"] as const;
export const STATUT_CYCLE_VIE = ["ACTIF", "BROUILLON", "SUSPENDU", "DISCONTINUE", "ARCHIVE"] as const;
export const STATUT_PRODUIT = ["actif", "inactif", "rupture", "a_commander", "bloque", "suspendu", "archive"] as const;
export const TYPE_BRANCHE = ["PIECE", "SERVICE", "AUTRE"] as const;
export const TYPE_UNITE = ["QUANTITE", "POIDS", "LONGUEUR", "SURFACE", "VOLUME", "TEMPS"] as const;
export const TYPE_TARIF = ["PUBLIC", "ECOLE", "GROSSISTE", "REVENDEUR", "PROMO"] as const;
export const TYPE_PRIX_HISTORIQUE = ["VENTE", "ACHAT", "MINIMUM", "REGLEMENTE"] as const;

/** categories.jsonl — références : parentCode */
export const categoriesSchema = z.object({
  code,
  nom: texteRequis.max(255, "Nom trop long (max 255)"),
  typeBranche: z.enum(TYPE_BRANCHE).optional(),
  parentCode: code.optional(),
  description: texteOptionnelMax(500),
  isActive: booleen,
  refSource,
}).strict();

/** unites.jsonl — références : aucune */
export const unitesSchema = z.object({
  code,
  libelle: texteRequis.max(50, "Libellé trop long (max 50)"),
  symbole: texteOptionnelMax(10),
  type: z.enum(TYPE_UNITE).default("QUANTITE"),
  isActive: booleen,
  refSource,
}).strict();

/** fournisseurs.jsonl — références : agenceCode ; clé d'upsert : code */
export const fournisseursSchema = z.object({
  code,
  nom: texteRequis.max(255, "Nom trop long (max 255)"),
  contact: texteOptionnel,
  telephone: texteOptionnel,
  email: texteOptionnel,
  adresse: texteOptionnel,
  ville: texteOptionnel,
  pays: texteOptionnel,
  agenceCode: code.optional(),
  isActive: booleen,
  refSource,
}).strict();

/** produits.jsonl — références : categorieCode, fournisseurCode, uniteBaseCode ; clé d'upsert : codeBarre */
export const produitsSchema = z.object({
  codeBarre: texteRequis.max(100, "Code-barres trop long (max 100)"),
  nomCode: texteOptionnelMax(100),
  typeProduit: z.enum(TYPE_PRODUIT).default("PIECE"),
  titre: texteRequis.max(500, "Titre trop long (max 500)"),
  etat: texteOptionnel,
  description: texteOptionnel,
  categorieCode: code,
  fournisseurCode: code.optional(),
  prixVente: montant,
  prixMinimumVente: montantOptionnel,
  prixAchat: montantOptionnel,
  prixAchatReference: montantOptionnel,
  tva: montantOptionnel,
  seuilAlerte: entierOptionnel,
  seuilCritique: entierOptionnel,
  stockMaximum: entierOptionnel,
  statut: z.enum(STATUT_PRODUIT).default("actif"),
  statutCycleVie: z.enum(STATUT_CYCLE_VIE).default("ACTIF"),
  uniteBaseCode: code,
  uniteVente: texteOptionnel,
  uniteAchat: texteOptionnel,
  /** Article « conceptuel » qui regroupe les variantes du même produit
   *  (produit_articles.designation). Créé s'il n'existe pas ; les variantes
   *  du même article le partagent. Absent → variante sans article. */
  designationArticle: texteOptionnelMax(255),
  /** Réf. constructeur (OEM) portée par la variante — migration 0023. */
  refOem: texteOptionnelMax(255),
  refAftermarket: texteOptionnelMax(255),
  /** Position de montage (4 axes V3) : côté / essieu. */
  positionCote: z.enum(["GAUCHE", "DROITE", "CENTRAL", "LES_DEUX", "N_A"]).optional(),
  positionEssieu: z.enum(["AVANT", "ARRIERE", "N_A"]).optional(),
  marque: texteOptionnel,
  referenceFabricant: texteOptionnel,
  couleur: texteOptionnel,
  format: texteOptionnel,
  matiereComposition: texteOptionnel,
  photos: z.array(z.string()).optional(),
  imageUrl: texteOptionnel,
  isActive: booleen,
  refSource,
}).strict();

/** produits_unites.jsonl — références : codeBarre, uniteCode ; RG-012/013/014/017 */
export const produitsUnitesSchema = z.object({
  codeBarre: texteRequis.max(100),
  uniteCode: code,
  facteurVersBase: z
    .union([z.string(), z.number()])
    .transform((v) => {
      const s = String(v);
      if (!/^\d+$/.test(s) || Number(s) <= 0) throw new Error("Facteur invalide : entier strictement positif (RG-017)");
      return s;
    }),
  estUniteBase: booleen,
  estUniteAchatDefaut: booleen,
  estUniteVenteDefaut: booleen,
  prixAchat: montantOptionnel,
  prixVente: montantOptionnel,
  refSource,
}).strict();

/** produits_fournisseurs.jsonl — références : codeBarre, fournisseurCode */
export const produitsFournisseursSchema = z.object({
  codeBarre: texteRequis.max(100),
  fournisseurCode: code,
  referenceFournisseur: texteOptionnel,
  prixAchat: montantOptionnel,
  delaiApprovisionnement: entierOptionnel,
  estPrincipal: booleen,
  isActive: booleen,
  refSource,
}).strict();

/** tarifs.jsonl — références : codeBarre */
export const tarifsSchema = z.object({
  codeBarre: texteRequis.max(100),
  type: z.enum(TYPE_TARIF),
  prix: montant,
  label: texteOptionnel,
  quantiteMin: entierOptionnel,
  isActive: booleen,
  refSource,
}).strict();

/** prix_historique.jsonl — références : codeBarre, fournisseurCode, uniteCode ; append-only */
export const prixHistoriqueSchema = z.object({  codeBarre: texteRequis.max(100),
  fournisseurCode: code.optional(),
  uniteCode: code.optional(),
  typePrix: z.enum(TYPE_PRIX_HISTORIQUE),
  ancienPrix: montantOptionnel,
  nouveauPrix: montant,
  source: texteRequis.max(50),
  reference: texteOptionnel,
  referenceType: texteOptionnel,
  motif: texteOptionnel,
  date: dateOptionnelle,
  refSource,
}).strict();

/** stocks_initiaux.jsonl — références : codeBarre, agenceCode ; clé : codeBarre + agenceCode */
export const stocksSchema = z.object({
  codeBarre: texteRequis.max(100),
  agenceCode: code.optional(),
  quantite: z
    .union([z.string().trim(), z.number()])
    .transform((v) => {
      const s = typeof v === "number" ? String(v) : v;
      if (!/^\d+$/.test(s)) throw new Error("Quantité invalide : entier positif ou nul");
      return s;
    }),
  coutUnitaireMoyen: montantOptionnel,
  refSource,
}).strict();

/* --------
 * QUALIFICATION CATALOGUE — références équivalentes & compatibilités.
 * Deux entités de la migration 0023 : une ligne importée sans source garde
 * NON_VERIFIE jusqu'à vérification (le bon cahier des charges).
 * Attachement : par désignation d'article (créée si absente) OU par code-barres
 * de variante (article de la variante) — jamais par IDs internes.
 * -------- */
export const NIVEAU_VERIFICATION = ["CONFIRME", "CONDITIONNEL", "NON_VERIFIE"] as const;
export const TYPE_COMPAT = ["POSITIVE", "NEGATIVE"] as const;

/** references_equiv.jsonl — clé d'upsert : attachement + référence (purifiée). */
export const referencesEquivSchema = z.object({
  articleDesignation: texteOptionnelMax(255),
  codeBarre: texteOptionnelMax(100),
  marque: texteOptionnelMax(100),
  reference: texteRequis.max(160, "Référence trop longue (max 160)"),
  note: texteOptionnelMax(255),
  source: texteOptionnelMax(60),
  niveauVerification: z.enum(NIVEAU_VERIFICATION).optional(),
  refSource,
}).strict();

/** compatibilites.jsonl — véhicule caractérisé ; POSITIVE par défaut. */
export const compatibilitesSchema = z.object({
  articleDesignation: texteOptionnelMax(255),
  codeBarre: texteOptionnelMax(100),
  typeCompat: z.enum(TYPE_COMPAT).default("POSITIVE"),
  marque: texteRequis.max(80, "Marque trop longue (max 80)"),
  modele: texteRequis.max(120, "Modèle trop long (max 120)"),
  anneeDe: entierOptionnel,
  anneeA: entierOptionnel,
  motorisation: texteOptionnelMax(80),
  version: texteOptionnelMax(120),
  generation: texteOptionnelMax(120),
  carburant: texteOptionnelMax(30),
  codeMoteur: texteOptionnelMax(60),
  boite: texteOptionnelMax(40),
  transmission: texteOptionnelMax(40),
  carrosserie: texteOptionnelMax(40),
  codeChassis: texteOptionnelMax(60),
  position: texteOptionnelMax(40),
  notes: texteOptionnel,
  source: texteOptionnelMax(60),
  niveauVerification: z.enum(NIVEAU_VERIFICATION).optional(),
  refSource,
}).strict();

export type CategorieImport = z.infer<typeof categoriesSchema>;
export type UniteImport = z.infer<typeof unitesSchema>;
export type FournisseurImport = z.infer<typeof fournisseursSchema>;
export type ProduitImport = z.infer<typeof produitsSchema>;
export type ProduitUniteImport = z.infer<typeof produitsUnitesSchema>;
export type ProduitFournisseurImport = z.infer<typeof produitsFournisseursSchema>;
export type TarifImport = z.infer<typeof tarifsSchema>;
export type PrixHistoriqueImport = z.infer<typeof prixHistoriqueSchema>;
export type StockImport = z.infer<typeof stocksSchema>;
export type ReferenceEquivImport = z.infer<typeof referencesEquivSchema>;
export type CompatibiliteImport = z.infer<typeof compatibilitesSchema>;
