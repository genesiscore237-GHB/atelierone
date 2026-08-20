import { pgTable, serial, integer, varchar, timestamp, boolean, numeric, text, jsonb, uuid } from "drizzle-orm/pg-core";
import { categories } from "./categories";
import { fournisseurs } from "./fournisseurs";
import { unitesMesure } from "./unites_mesure";
import { modelesEmballage } from "./modeles_emballage";
import { emplacements } from "./emplacements";

export const produits = pgTable("produits", {
  id: serial("id").primaryKey(),
  // PIECE = pièce de rechange, SERVICE = main d'œuvre / prestation
  typeProduit: varchar("type_produit", { length: 20 }).default("PIECE"),
  codeBarre: varchar("code_barre", { length: 100 }).unique().notNull(),
  // Code article métier unique (specs stock : ex. FIL-HUI-001)
  codeArticle: varchar("code_article", { length: 100 }).unique(),
  // Désignation courte (specs 02 §2.1)
  designationCourte: varchar("designation_courte", { length: 200 }),
  nomCode: varchar("nom_code", { length: 100 }),
  titre: varchar("titre", { length: 500 }).notNull(),
  editeur: varchar("editeur", { length: 255 }),
  etat: varchar("etat", { length: 50 }).default("neuf"),
  description: text("description"),
  categorieId: integer("categorie_id").references(() => categories.id),
  fournisseurId: integer("fournisseur_id").references(() => fournisseurs.id),
  uniteBaseId: uuid("unite_base_id").references(() => unitesMesure.id),
  prixVente: numeric("prix_vente", { precision: 12, scale: 2 }).notNull(),
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
});
