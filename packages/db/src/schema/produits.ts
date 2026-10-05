import { pgTable, serial, integer, varchar, timestamp, boolean, numeric, text, jsonb, uuid } from "drizzle-orm/pg-core";
import { categories } from "./categories";
import { fournisseurs } from "./fournisseurs";
import { unitesMesure } from "./unites_mesure";
import { modelesEmballage } from "./modeles_emballage";
import { emplacements } from "./emplacements";
import { employes } from "./employes";
import { produitArticles } from "./produit_articles";

export const produits = pgTable("produits", {
  id: serial("id").primaryKey(),
  // Article conceptuel parent (variante → article) : « Plaquette de frein » → variantes Bosch/Brembo…
  articleId: integer("article_id").references(() => produitArticles.id),
  // PIECE = pièce de rechange, SERVICE = main d'œuvre / prestation
  typeProduit: varchar("type_produit", { length: 20 }).default("PIECE"),
  codeBarre: varchar("code_barre", { length: 100 }).unique().notNull(),
  // Code article métier unique (specs stock : ex. FIL-HUI-001)
  codeArticle: varchar("code_article", { length: 100 }).unique(),
  // Désignation courte (specs 02 §2.1)
  designationCourte: varchar("designation_courte", { length: 200 }),
  // Conditionnement commercial (specs 02 §2.1) : ex. « jeu de 4 », « 5 L »
  conditionnement: varchar("conditionnement", { length: 200 }),
  nomCode: varchar("nom_code", { length: 100 }),
  titre: varchar("titre", { length: 500 }).notNull(),
  editeur: varchar("editeur", { length: 255 }),
  etat: varchar("etat", { length: 50 }).default("neuf"),
  description: text("description"),
  categorieId: integer("categorie_id").references(() => categories.id),
  fournisseurId: integer("fournisseur_id").references(() => fournisseurs.id),
  uniteBaseId: uuid("unite_base_id").references(() => unitesMesure.id),
  prixVente: numeric("prix_vente", { precision: 12, scale: 2 }), // nullable : outils sans prix (specs stock/outillage)
  prixMinimumVente: numeric("prix_minimum_vente", { precision: 12, scale: 2 }),
  prixAchat: numeric("prix_achat", { precision: 12, scale: 2 }),
  prixAchatReference: numeric("prix_achat_reference", { precision: 12, scale: 2 }),
  // Dernier prix d'achat réel (mis à jour à chaque réception — specs stock)
  dernierPrixAchat: numeric("dernier_prix_achat", { precision: 12, scale: 2 }),
  tva: numeric("tva", { precision: 5, scale: 2 }).default("0"),
  seuilAlerte: integer("seuil_alerte").default(5),
  seuilCritique: integer("seuil_critique").default(2),
  stockMaximum: integer("stock_maximum"),
  // Quantité minimale de gestion (specs stock : qte_min)
  quantiteMinimale: numeric("quantite_minimale", { precision: 12, scale: 2 }).default("0"),
  statut: varchar("statut", { length: 50 }).default("actif"),
  statutCycleVie: varchar("statut_cycle_vie", { length: 20 }).default("BROUILLON"),
  // Statut outillage (specs garage) : REPARATION | USE | CASSE | PERDU | VOLE | REFORME — null = disponible
  statutOutil: varchar("statut_outil", { length: 20 }),
  // Classification ABC (référentiel garage) : A = haute rotation, B = moyenne, C = faible
  classeAbc: varchar("classe_abc", { length: 1 }),
  // Wireframe produit : infos complémentaires + suivi
  poidsKg: numeric("poids_kg", { precision: 8, scale: 2 }),
  dimensions: varchar("dimensions", { length: 50 }), // L x l x H
  garantieMois: integer("garantie_mois"),
  suiviSerie: boolean("suivi_serie").default(false),
  suiviLot: boolean("suivi_lot").default(false),
  dateDiscontinuation: timestamp("date_discontinuation"),
  motifSuspension: text("motif_suspension"),
  modeleEmballageId: uuid("modele_emballage_id").references(() => modelesEmballage.id),
  uniteVente: varchar("unite_vente", { length: 50 }).default("unite"),
  uniteAchat: varchar("unite_achat", { length: 50 }).default("unite"),
  // Emplacement principal de stockage (specs stock)
  emplacementPrincipalId: integer("emplacement_principal_id").references(() => emplacements.id),
  // Article reconditionnable : fût → unités plus petites (specs stock)
  estReconditionnable: boolean("est_reconditionnable").default(false),
  // Specs V2 §02 : origine / qualité de la pièce
  // CONSTRUCTEUR (Genuine) | OEM (équivalent) | AFTERMARKET | AUTRE
  origineQualite: varchar("origine_qualite", { length: 20 }).default("AUTRE"),
  // Specs V2 §02/§05 : DLC — délai d'alerte avant péremption (jours) pour fluides, colles…
  dlcJours: integer("dlc_jours"),
  // Specs V2 §02 règle 9 : échange standard — pièce en échange standard (core) + valeur du dépôt
  estCore: boolean("est_core").default(false),
  valeurCore: numeric("valeur_core", { precision: 12, scale: 2 }),
  // Fiche technique pièce / service
  marque: varchar("marque", { length: 255 }),
  referenceFabricant: varchar("reference_fabricant", { length: 255 }),
  // Références constructeur (specs 02 §2.1 : ref_oem / ref_aftermarket)
  refOem: varchar("ref_oem", { length: 255 }),
  refAftermarket: varchar("ref_aftermarket", { length: 255 }),
  couleur: varchar("couleur", { length: 100 }),
  format: varchar("format", { length: 50 }),
  matiereComposition: text("matiere_composition"),
  // Notes internes (specs 02 §2.1)
  notes: text("notes"),
  photos: jsonb("photos").$type<string[]>().default([]),
  imageUrl: varchar("image_url", { length: 500 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // ─── Conception garage étendue : comptable & analytique ───
  compteComptable: varchar("compte_comptable", { length: 20 }),
  centreDeCout: varchar("centre_de_cout", { length: 60 }),
  methodeValorisation: varchar("methode_valorisation", { length: 10 }).default("CUMP"), // CUMP | FIFO
  // ─── Type d'outil (outillage avancé) : INDIVIDUEL | KIT | JEU | MACHINE ───
  typeOutil: varchar("type_outil", { length: 30 }),
  // ─── Équipement / immobilisation (machines, installations) ───
  numeroImmobilisation: varchar("numero_immobilisation", { length: 50 }),
  dateAchat: timestamp("date_achat"),
  valeurAcquisition: numeric("valeur_acquisition", { precision: 12, scale: 2 }),
  responsableId: integer("responsable_id").references(() => employes.id),
  // NEUF | TRES_BON | BON | MOYEN | USE | ENDOMMAGE | HORS_SERVICE | EN_REPARATION
  etatEquipement: varchar("etat_equipement", { length: 30 }),
  // Outils de mesure soumis à calibration
  calibrable: boolean("calibrable").default(false),
  // ─── V3 — Niveau d'objet : VARIANTE (SKU pièces/consommables) | EXEMPLAIRE (outillage/équipement) ───
  niveau: varchar("niveau", { length: 10 }).default("VARIANTE"),
  // Référence commerciale principale qui identifie la variante (GF2)
  referencePrincipale: varchar("reference_principale", { length: 160 }),
  // Nature du produit en 3 dimensions (GF : etat × origine × relation)
  etatProduit: varchar("etat_produit", { length: 20 }), // NEUF | OCCASION | RECONDITIONNE | REMANUFACTURE
  origineProduit: varchar("origine_produit", { length: 20 }), // CONSTRUCTEUR | OEM | AFTERMARKET | ADAPTABLE
  relationProduit: varchar("relation_produit", { length: 20 }), // EQUIVALENT | SUBSTITUT | ECHANGE_STANDARD
  // Position de montage structurée (avec N_A = non applicable)
  positionCote: varchar("position_cote", { length: 20 }), // GAUCHE | DROITE | CENTRAL | LES_DEUX | N_A
  positionEssieu: varchar("position_essieu", { length: 20 }), // AVANT | ARRIERE | N_A
  positionZone: varchar("position_zone", { length: 20 }), // INTERIEUR | EXTERIEUR | SUPERIEUR | INFERIEUR | N_A
  positionEmplacement: varchar("position_emplacement", { length: 30 }), // MOTEUR | BOITE | ROUE | HABITACLE | CARROSSERIE | FREINAGE | CLIM | CHASSIS | N_A
  // Stock : sécurité & point de commande
  stockSecurite: integer("stock_securite"),
  pointCommande: integer("point_commande"),
  qteMinCommande: numeric("qte_min_commande", { precision: 12, scale: 2 }),
  // Prix avancés
  prixPro: numeric("prix_pro", { precision: 12, scale: 2 }),
  prixParticulier: numeric("prix_particulier", { precision: 12, scale: 2 }),
  // Traçabilité
  numeroSerie: varchar("numero_serie", { length: 100 }),
  numeroLot: varchar("numero_lot", { length: 100 }),
  dateFabrication: timestamp("date_fabrication"),
  dateExpiration: timestamp("date_expiration"),
});
