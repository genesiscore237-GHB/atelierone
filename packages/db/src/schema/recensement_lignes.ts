import {
  integer,
  numeric,
  pgTable,
  serial,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { agences } from "./agences";
import { inventairesSessions } from "./inventaires_sessions";
import { unitesMesure } from "./unites_mesure";
import { utilisateurs } from "./utilisateurs";
import { emplacements } from "./emplacements";
import { lots } from "./lots";

/**
 * RECENSEMENT — lignes en attente d'une session.
 *
 * Étape 1 du Lot 1 : une ligne saisie au recensement est écrite AU MOMENT
 * de la saisie, pas seulement à la validation. Écran fermé, réact
 * réinitialisé, la ligne existe — la session se reprend sans ressaisir.
 *
 * À la validation, la ligne migre dans `inventaires` (le théorique et
 * l'écart ne peuvent être calculés qu'à ce moment) et la ligne en attente
 * est supprimée : chaque comptage finit exactement une fois.
 */
export const recensementLignes = pgTable("recensement_lignes", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => inventairesSessions.id),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  /** NULL = comptage global, non localisé. */
  emplacementId: integer("emplacement_id").references(() => emplacements.id),
  /** Renseigné pour les contenants traçables : bidons issus d'un fût. */
  lotId: integer("lot_id").references(() => lots.id),
  /** Ce que le magasinier a physiquement compté. */
  quantite: numeric("quantite", { precision: 12, scale: 2 }).notNull(),
  uniteId: uuid("unite_id").references(() => unitesMesure.id),
  /** Prix d'achat unitaire — facultatif, jamais deviné. */
  prixAchat: numeric("prix_achat", { precision: 14, scale: 2 }),
  note: varchar("note", { length: 500 }),
  creePar: integer("cree_par").references(() => utilisateurs.id),
  creeAt: timestamp("cree_at").defaultNow(),
});
