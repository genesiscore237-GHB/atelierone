import { integer, numeric, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { agences } from "./agences";
import { inventairesSessions } from "./inventaires_sessions";
import { unitesMesure } from "./unites_mesure";
import { utilisateurs } from "./utilisateurs";

export const inventaires = pgTable("inventaires", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => inventairesSessions.id),
  produitId: integer("produit_id").references(() => produits.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  uniteId: uuid("unite_id").references(() => unitesMesure.id),
  quantiteTheorique: numeric("quantite_theorique", { precision: 12, scale: 2 }).notNull(),
  quantiteReelle: numeric("quantite_reelle", { precision: 12, scale: 2 }).notNull(),
  ecart: numeric("ecart", { precision: 12, scale: 2 }).notNull(),
  commentaire: text("commentaire"),
  effectuePar: integer("effectue_par").references(() => utilisateurs.id),
  dateInventaire: timestamp("date_inventaire").defaultNow(),
});
