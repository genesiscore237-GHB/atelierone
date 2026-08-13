import { pgTable, serial, integer, varchar, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { achats } from "./achats";
import { bonsReception } from "./bons_reception";
import { produits } from "./produits";
import { utilisateurs } from "./utilisateurs";

export const ecartsReception = pgTable("ecarts_reception", {
  id: serial("id").primaryKey(),
  bonReceptionId: integer("bon_reception_id").references(() => bonsReception.id),
  achatId: integer("achat_id").references(() => achats.id),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  typeEcart: varchar("type_ecart", { length: 20 }).notNull(),
  quantiteCommandee: integer("quantite_commandee").default(0),
  quantiteRecue: integer("quantite_recue").default(0),
  prixBC: numeric("prix_bc", { precision: 12, scale: 2 }),
  prixRecu: numeric("prix_recu", { precision: 12, scale: 2 }),
  motif: text("motif"),
  creePar: integer("cree_par").references(() => utilisateurs.id),
  createdAt: timestamp("created_at").defaultNow(),
});
