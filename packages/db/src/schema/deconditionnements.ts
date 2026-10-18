import { pgTable, integer, numeric, timestamp, varchar, uuid, date } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { agences } from "./agences";
import { unitesMesure } from "./unites_mesure";
import { utilisateurs } from "./utilisateurs";
import { lots } from "./lots";

export const deconditionnements = pgTable("deconditionnements", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  agenceId: integer("agence_id").notNull().references(() => agences.id),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  uniteSourceId: uuid("unite_source_id").notNull().references(() => unitesMesure.id),
  quantiteSource: numeric("quantite_source", { precision: 12, scale: 2 }).notNull(),
  uniteCibleId: uuid("unite_cible_id").notNull().references(() => unitesMesure.id),
  quantiteGeneree: numeric("quantite_generee", { precision: 12, scale: 2 }).notNull(),
  effectuePar: integer("effectue_par").notNull().references(() => utilisateurs.id),
  // ── Migration 0021 : le conditionnement change d'ARTICLE ──────────────────
  // Un fût d'huile et un bidon de 4 L ne sont pas le même article : ni prix
  // de vente, ni fournisseur, ni moment d'achat. `operationDouble` accepte
  // déjà un `produitCibleId`, mais la table ne le portait pas — donc le
  // déconditionnement ne pouvait tracer que « même article, unité différente »,
  // ce qui est exactement le cas d'un vrai fût de garage : jamais.
  produitCibleId: integer("produit_cible_id").references(() => produits.id),

  /** Unités cible par unité source, FIGÉES à l'opération (208 bidons pour un
   *  fût). À ne pas recalculer depuis les tables d'unités : les unités
   *  évoluent, et un historique qui se réécrit n'est plus une trace. */
  facteurConversion: numeric("facteur_conversion", { precision: 14, scale: 4 }),

  motif: varchar("motif", { length: 255 }),
  dateDeconditionnement: timestamp("date_deconditionnement").defaultNow(),

  // ── Migration 0017 : le lot traverse enfin le déconditionnement ──────────
  //
  // Ces quatre colonnes n'existaient pas. Le fût L1 entrait traçable, on
  // l'ouvrait, on en tirait 208 bidons — et le lien disparaissait à cet
  // instant précis, celui où la traçabilité compte. 19 déconditionnements
  // sont déjà en base sans lot : leur traçabilité est perdue.
  lotIdSource: integer("lot_id_source").references(() => lots.id),
  lotIdCible: integer("lot_id_cible").references(() => lots.id),
  /** Date d'ouverture du contenant — reportée sur le lot cible. */
  dateOuverture: date("date_ouverture"),
  /** DLC des unités produites : ouverture + périodicité du produit. */
  dlcCible: date("dlc_cible"),
});
