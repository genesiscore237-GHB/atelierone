import { integer, numeric, pgTable, serial, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { produits } from "./produits";
import { utilisateurs } from "./utilisateurs";
import { organisations } from "./platform";
import { unitesMesure } from "./unites_mesure";

export const transfertsStock = pgTable("transferts_stock", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id").notNull().references(() => organisations.id),
  depuisAgenceId: integer("depuis_agence_id").notNull().references(() => agences.id),
  versAgenceId: integer("vers_agence_id").notNull().references(() => agences.id),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  quantite: integer("quantite").notNull(),
  quantiteRecue: integer("quantite_recue"),
  uniteId: uuid("unite_id").references(() => unitesMesure.id),
  statut: varchar("statut", { length: 50 }).default("EN_ATTENTE"),
  motif: text("motif"),
  notesReception: text("notes_reception"),
  ecart: integer("ecart"),
  effectuePar: integer("effectue_par").references(() => utilisateurs.id),
  expediePar: integer("expedie_par").references(() => utilisateurs.id),
  recuPar: integer("recu_par").references(() => utilisateurs.id),
  groupeOperationId: uuid("groupe_operation_id"),
  dateExpedition: timestamp("date_expedition"),
  dateReception: timestamp("date_reception"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});


