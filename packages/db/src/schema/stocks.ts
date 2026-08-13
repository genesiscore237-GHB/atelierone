import { pgTable, serial, integer, timestamp, varchar, uuid, numeric, unique } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { agences } from "./agences";
import { unitesMesure } from "./unites_mesure";
import { emplacements } from "./emplacements";
import { lots } from "./lots";

export const stocks = pgTable("stocks", {
  id: serial("id").primaryKey(),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  emplacementId: integer("emplacement_id").references(() => emplacements.id),
  lotId: integer("lot_id").references(() => lots.id),
  quantite: numeric("quantite", { precision: 12, scale: 2 }).notNull().default("0"),
  quantiteReservee: numeric("quantite_reservee", { precision: 12, scale: 2 }).default("0"),
  quantiteRayon: numeric("quantite_rayon", { precision: 12, scale: 2 }).default("0"),
  uniteReferenceId: uuid("unite_reference_id").references(() => unitesMesure.id),
  coutUnitaireMoyen: numeric("cout_unitaire_moyen", { precision: 12, scale: 2 }),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  unqProduitAgenceEmplacementLot: unique("unq_stocks_produit_agence_emplacement_lot").on(t.produitId, t.agenceId, t.emplacementId, t.lotId),
}));
