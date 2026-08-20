import { pgTable, integer, timestamp, text, varchar, uuid, numeric } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { agences } from "./agences";
import { unitesMesure } from "./unites_mesure";
import { utilisateurs } from "./utilisateurs";
import { emplacements } from "./emplacements";
import { lots } from "./lots";
import { ordresReparation } from "./ordres_reparation";
import { vehicules } from "./vehicules";

export const mouvementsStock = pgTable("mouvements_stock", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  type: varchar("type", { length: 50 }).notNull(),
  sens: varchar("sens", { length: 1 }).notNull(),
  quantite: numeric("quantite", { precision: 12, scale: 2 }).notNull(),
  uniteId: uuid("unite_id").references(() => unitesMesure.id),
  emplacementId: integer("emplacement_id").references(() => emplacements.id),
  lotId: integer("lot_id").references(() => lots.id),
  // Lien OR / véhicule (specs V2 §04 : Sortie_OR, traçabilité véhicule)
  orId: integer("or_id").references(() => ordresReparation.id),
  vehiculeId: integer("vehicule_id").references(() => vehicules.id),
  coutUnitaireBase: numeric("cout_unitaire_base", { precision: 12, scale: 2 }),
  stockAvant: numeric("stock_avant", { precision: 12, scale: 2 }).notNull(),
  stockApres: numeric("stock_apres", { precision: 12, scale: 2 }).notNull(),
  groupeOperationId: uuid("groupe_operation_id"),
  reference: varchar("reference", { length: 255 }),
  referenceType: varchar("reference_type", { length: 50 }),
  documentLie: varchar("document_lie", { length: 100 }),
  motif: varchar("motif", { length: 255 }),
  commentaire: text("commentaire"),
  effectuePar: integer("effectue_par").references(() => utilisateurs.id),
  validePar: integer("valide_par").references(() => utilisateurs.id),
  dateMouvement: timestamp("date_mouvement").defaultNow(),
});
