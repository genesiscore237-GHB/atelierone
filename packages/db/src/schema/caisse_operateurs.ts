import { boolean, integer, pgTable, serial, timestamp, unique } from "drizzle-orm/pg-core";
import { caisses } from "./caisses";
import { utilisateurs } from "./utilisateurs";

export const caisseOperateurs = pgTable("caisse_operateurs", {
  id: serial("id").primaryKey(),
  caisseId: integer("caisse_id").notNull().references(() => caisses.id),
  userId: integer("user_id").notNull().references(() => utilisateurs.id),
  peutOuvrir: boolean("peut_ouvrir").default(false),
  peutFermer: boolean("peut_fermer").default(false),
  peutDepenser: boolean("peut_depenser").default(false),
  peutVoirMouvements: boolean("peut_voir_mouvements").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqCaisseUser: unique().on(t.caisseId, t.userId),
}));
