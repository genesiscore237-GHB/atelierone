import { integer, numeric, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { agences } from "./agences";
import { inventairesSessions } from "./inventaires_sessions";
import { unitesMesure } from "./unites_mesure";
import { utilisateurs } from "./utilisateurs";
import { emplacements } from "./emplacements";
import { lots } from "./lots";

export const inventaires = pgTable("inventaires", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => inventairesSessions.id),
  produitId: integer("produit_id").references(() => produits.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  uniteId: uuid("unite_id").references(() => unitesMesure.id),
  quantiteTheorique: numeric("quantite_theorique", { precision: 12, scale: 2 }).notNull(),
  quantiteReelle: numeric("quantite_reelle", { precision: 12, scale: 2 }).notNull(),
  ecart: numeric("ecart", { precision: 12, scale: 2 }).notNull(),

  // ── Migration 0020 : le recensement sait OÙ ──────────────────────────────
  // Sans ces deux colonnes, une ligne de comptage ne dit pas où le comptage a
  // eu lieu ni de quel lot elle relève. Le besoin du garage est spatial :
  // « 12 dans le magasin, 3 dans le bureau du chef ». Et pour l'huile, le lot
  // est ce qui porte la traçabilité du fût jusqu'au bidon.
  /** NULL = comptage global, non localisé. */
  emplacementId: integer("emplacement_id").references(() => emplacements.id),
  /** Renseigné pour les contenants traçables : bidons issus d'un fût. */
  lotId: integer("lot_id").references(() => lots.id),

  commentaire: text("commentaire"),
  effectuePar: integer("effectue_par").references(() => utilisateurs.id),
  dateInventaire: timestamp("date_inventaire").defaultNow(),
});
