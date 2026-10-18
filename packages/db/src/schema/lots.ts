import { pgTable, integer, varchar, timestamp, date, boolean, numeric, serial } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { produits } from "./produits";
import { fournisseurs } from "./fournisseurs";

/**
 * LOTS — la pièce la plus aboutie du module, et le seul endroit où une
 * quantité peut être attribuée à un Shelton précis.
 *
 * Pas de `agence_id` : un lot est identifié par (produit, numéro de lot)
 * et partagé entre agences. C'est `stocks_lots` qui porte l'agence.
 *
 * Migrations 0016 (quarantine / rappel) et 0017 (ouverture de contenant).
 */
export const lots = pgTable("lots", {
  id: serial("id").primaryKey(),
  produitId: integer("produit_id").notNull().references(() => produits.id),
  numeroLot: varchar("numero_lot", { length: 100 }).notNull(),
  fournisseurId: integer("fournisseur_id").references(() => fournisseurs.id),

  /**
   * Cycle de vie : disponible | perime | bloque | rappel_fournisseur |
   * epuise | rejete | retour_fournisseur.
   *
   * NE DÉCRIT PAS l'ouverture du contenant — c'est `dateOuverture`.
   * Ajouter un statut « ouvert » créerait un second état à synchroniser
   * avec cette date, donc une seconde occasion de désaccord.
   */
  statut: varchar("statut", { length: 50 }).default("disponible"),

  dateReception: timestamp("date_reception"),
  quantiteInitiale: integer("quantite_initiale"),
  coutUnitaire: numeric("cout_unitaire", { precision: 12, scale: 2 }),
  dateFabrication: date("date_fabrication"),
  /** DLC du contenant SCELLÉ. Après ouverture, c'est `dateOuverture +
   *  periodiciteOuvertureJours` qui fait foi — voir la vue
   *  `lots_contenants.dlc_effective`. */
  datePeremption: date("date_peremption"),
  dateEntree: timestamp("date_entree").defaultNow(),

  // ── Migration 0016 : rappel et consignation ──────────────────────────────
  // Séparé du statut : le statut décrit le cycle de vie, ce blocage décrit
  // une décision externe. Confondre les deux effacerait la trace du rappel
  // au moment où le lot finit par être consommé.
  estBloque: boolean("est_bloque").notNull().default(false),
  motifBlocage: varchar("motif_blocage", { length: 200 }),
  dateBlocage: timestamp("date_blocage"),
  bloquePar: integer("bloque_par"),

  // ── Migration 0017 : ouverture d'un contenant (0017) ─────────────────────
  // Un fût d'huile scellé se garde des années ; une fois ouvert, il s'oxyde
  // et se périme en quelques mois. Sans cette notion, le système annonce une
  // huile périmée quatre ans après la première vidange.
  //
  // NULL = scellé. Une date = ouvert. La présence de la date EST
  // l'information : pas de booléen `estOuvert` à synchroniser.
  dateOuverture: date("date_ouverture"),

  /** Délai de conservation APRÈS ouverture, en jours. Vient de
   *  `produits.dlcJours` (180 pour une huile moteur, 730 pour un DOT).
   *  Aucune valeur n'est imposée : c'est le garage qui saisit ce qu'il sait. */
  periodiciteOuvertureJours: integer("periodicite_ouverture_jours"),

  /** SOURCE du délai retenu — « notice constructeur Renault », « fiche
   *  fournisseur Mobil », « usage garage ». L'expert métier est explicite :
   *  il n'existe pas de périodicité universelle. On enregistre donc d'où
   *  vient le chiffre, pour qu'il soit contestable. */
  referenceOuverture: varchar("reference_ouverture", { length: 200 }),

  /** Lot d'origine. Renseigné sur les bidons issus d'un fût : c'est ce
   *  lien qui porte la traçabilité à travers le déconditionnement.
   *
   *  AUTO-RÉFÉRENCE. Le retour est typé `AnyPgColumn` et non `lots.id` :
   *  écrire `(): any` paraît contourner le problème mais ne fait que le
   *  déplacer — le type de la table dépend alors d'elle-même, et
   *  l'inférence se dégrade dans TOUTE l'application. Mesuré : 27 erreurs
   *  de typecheck supplémentaires, dans des fichiers sans rapport avec le
   *  stock (caisse, finance, catalogue), parce que `lots` est importé par
   *  `inventaires` et par le moteur.
   *
   *  `AnyPgColumn` est la forme documentée par Drizzle pour une référence
   *  circulaire : la contrainte existe toujours en base (migration 0018),
   *  seule l'inférence de TypeScript cesse de boucler. */
  lotSourceId: integer("lot_source_id").references((): AnyPgColumn => lots.id),

  /** Contenu du contenant ouvert, en unité de base. NULL = scellé ou
   *  inconnu. `contenuSource` figé à l'ouverture, `contenuRestant`
   *  décrémenté à chaque déconditionnement — permet d'afficher
   *  « 145 L restants sur 208 » et de repérer un fût déclaré ouvert
   *  alors qu'il est plein. */
  contenuSource: numeric("contenu_source", { precision: 14, scale: 4 }),
  contenuRestant: numeric("contenu_restant", { precision: 14, scale: 4 }),

  // Traçabilité lot (specs garage) : provenance / qualité / fabricant
  provenance: varchar("provenance", { length: 200 }),
  qualite: varchar("qualite", { length: 80 }),
  fabricant: varchar("fabricant", { length: 120 }),
  isActive: boolean("is_active").default(true),
});