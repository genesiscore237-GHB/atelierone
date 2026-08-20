import { pgTable, serial, integer, numeric, unique } from "drizzle-orm/pg-core";
import { produits } from "./produits";

/**
 * COMPOSITION DE KIT — specs V2 §02, US18 (Epic C).
 * Un article de type Kit est composé de plusieurs articles composants.
 * La sortie d'un kit sort le kit ET ses composants (mouvements liés).
 */
export const kitsLignes = pgTable("kits_lignes", {
  id: serial("id").primaryKey(),
  kitId: integer("kit_id").notNull().references(() => produits.id, { onDelete: "cascade" }),
  composantId: integer("composant_id").notNull().references(() => produits.id),
  quantite: numeric("quantite", { precision: 12, scale: 2 }).notNull().default("1"),
}, (t) => ({
  unqKitComposant: unique("unq_kits_lignes_kit_composant").on(t.kitId, t.composantId),
}));