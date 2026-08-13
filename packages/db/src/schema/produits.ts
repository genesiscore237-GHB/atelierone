import { pgTable, serial, integer, varchar, timestamp, boolean, numeric, text, jsonb, uuid } from "drizzle-orm/pg-core";
import { categories } from "./categories";
import { fournisseurs } from "./fournisseurs";
import { unitesMesure } from "./unites_mesure";
import { modelesEmballage } from "./modeles_emballage";

export const produits = pgTable("produits", {
  id: serial("id").primaryKey(),
  // PIECE = pièce de rechange, SERVICE = main d'œuvre / prestation
  typeProduit: varchar("type_produit", { length: 20 }).default("PIECE"),
  codeBarre: varchar("code_barre", { length: 100 }).unique().notNull(),
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
  tva: numeric("tva", { precision: 5, scale: 2 }).default("0"),
  seuilAlerte: integer("seuil_alerte").default(5),
  seuilCritique: integer("seuil_critique").default(2),
  stockMaximum: integer("stock_maximum"),
  statut: varchar("statut", { length: 50 }).default("actif"),
  statutCycleVie: varchar("statut_cycle_vie", { length: 20 }).default("BROUILLON"),
  dateDiscontinuation: timestamp("date_discontinuation"),
  motifSuspension: text("motif_suspension"),
  modeleEmballageId: uuid("modele_emballage_id").references(() => modelesEmballage.id),
  uniteVente: varchar("unite_vente", { length: 50 }).default("unite"),
  uniteAchat: varchar("unite_achat", { length: 50 }).default("unite"),
  // Fiche technique pièce / service
  marque: varchar("marque", { length: 255 }),
  referenceFabricant: varchar("reference_fabricant", { length: 255 }),
  couleur: varchar("couleur", { length: 100 }),
  format: varchar("format", { length: 50 }),
  matiereComposition: text("matiere_composition"),
  photos: jsonb("photos").$type<string[]>().default([]),
  imageUrl: varchar("image_url", { length: 500 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
