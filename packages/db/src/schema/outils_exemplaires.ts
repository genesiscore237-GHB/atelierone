import { pgTable, serial, integer, varchar, boolean, text, timestamp } from "drizzle-orm/pg-core";
import { agences } from "./agences";
import { produits } from "./produits";
import { emplacements } from "./emplacements";

/**
 * OUTILLAGE — LES EXEMPLAIRES PHYSIQUES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE STOCK NE DIT QUE « COMBIEN »
 *
 * Il dit « 4 clés dynamométriques ». Il ne dit pas que la n° 3 est sur
 * l'établi du Michelin, que la n° 1 est passée en réparation, et que la n° 2 a
 * été perdue dans une fuite de liquide de frein.
 *
 * `prets_outils` enregistre un prêt PAR PRODUIT et `produits.statut_outil`
 * est UNE chaîne pour tout le parc. Le modèle ne peut donc pas représenter un
 * parc d'outils, seulement une référence d'outil. C'est ce tableau qui le
 * rend possible — mais UNIQUEMENT pour les outils qui le demandent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE SUIVI EST UN CHOIX, PAS UNE DÉFAUT
 *
 * Suivre chaque pièce coûte un numéro à saisir, un état à maintenir, un
 * inventaire à passer. Pour un jeu de tournevis interchangeables, ce coût est
 * absurde. Pour une clé étalonnée dont on doit rendre compte au client, il est
 * obligatoire.
 *
 * Le drapeau qui arbitre est `produits.suivi_serie` — il EXISTE déjà et n'était
 * lu nulle part dans l'application (cf. migration 0022).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `etat` EST UN TEXTE, PAS UNE ENUM
 *
 * Les états sont ceux que le métier connaît déjà : DISPONIBLE, PRETE,
 * REPARATION, USE, CASSE, PERDU, VOLE, REFORME. Les formaliser en ENUM
 * obligerait à un ALTER TABLE dès le premier état oublié — et un garage
 * découvre un état de plus tous les six mois. La liste est vérifiée par le
 * serveur, à l'écriture ; la base reste ouverte.
 */
export const outilsExemplaires = pgTable("outils_exemplaires", {
  id: serial("id").primaryKey(),

  /** Le produit dont c'est un exemplaire. CASCADE : sans référence, il n'a pas de sens. */
  produitId: integer("produit_id")
    .notNull()
    .references(() => produits.id, { onDelete: "cascade" }),
  agenceId: integer("agence_id")
    .notNull()
    .references(() => agences.id, { onDelete: "cascade" }),

  /** Le numéro frappé ou collé sur la pièce — ce qu'on lit au scan. */
  numero: varchar("numero", { length: 50 }).notNull(),

  /** DISPONIBLE | PRETE | REPARATION | USE | CASSE | PERDU | VOLE | REFORME */
  etat: varchar("etat", { length: 20 }).notNull().default("DISPONIBLE"),

  /**
   * Où se trouve la pièce. NULL quand elle est sortie.
   *
   * C'est le cas le plus fréquent, et un état « elle est ici » qui vaut « elle
   * est au fond d'un bac chez un client » n'apprend rien. NULL veut dire
   * « dehors », ce qui est une information, pas une absence.
   */
  emplacementId: integer("emplacement_id").references(() => emplacements.id, {
    onDelete: "set null",
  }),

  /**
   * Une pièce cassée ne disparaît pas du parc.
   *
   * Si `actif` tombait à false au cassage, l'outil sortirait de l'inventaire
   * et on rachèterait des tournevis en double parce qu'on ne les voit plus.
   * `actif` distingue « cette pièce existe encore » de « ce numéro a été
   * retiré du parc » — un cas rare et délibéré.
   */
  actif: boolean("actif").notNull().default(true),

  /**
   * Ce qu'on note dessus : n° de série constructeur, date du dernier
   * étalonnage, particularités. Un champ libre, parce qu'un champ structuré
   * par outil est une arborescence de plus à maintenir pour une information
   * que personne ne relira de la même façon.
   */
  note: text("note"),

  dateCreation: timestamp("date_creation").notNull().defaultNow(),
});