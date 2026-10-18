import { z } from "zod";
import { sql } from "drizzle-orm";
import { and, asc, eq } from "drizzle-orm";
import { db, produits, fournisseurs, unitesMesure } from "@atelierone/db";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { procurementRouter } from "~/server/api/routers/procurement";
import { rechercherArticles } from "~/server/lib/recherche-articles";

/**
 * RÉCEPTION RAPIDE — « je viens d'acheter 12 filtres, ils sont là ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN SEUL MOTEUR, DEUX PORTES
 *
 * `procurement.createReception` est un bon moteur : bon de réception, lots,
 * écarts avec motif, conversion d'unité, application des prix catalogue,
 * cumul de dette fournisseur. Il est aussi LOURD — il exige un
 * `fournisseurId`, une quantité commandée par ligne, un prix, et il refuse
 * toute réception partielle sans motif.
 *
 * Rien de tout cela ne s'applique à un achat au comptoir, où personne n'a
 * commandé. Ce router ne réécrit donc pas un moteur : il construit la même
 * charge utile et la passe à `createReception`.
 *
 *   · `quantiteCommandee = quantiteRecue` — il n'y a pas d'écart à justifier
 *     puisqu'il n'y a pas de commande. C'est ce point qui rend la réception
 *     rapide possible sans mentir sur le bon de réception.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PRIX N'EST JAMAIS INVENTÉ
 *
 * Un prix d'achat laissé vide vaut 0. Et 0 n'est PAS enregistré comme coût :
 * la ligne reste sans CMUP. C'est la valeur exacte — on ne connaît pas le
 * prix de ce qu'on n'a pas chiffré — et c'est bien plus utile qu'un zéro,
 * qui ferait disparaître la pièce de la « Valeur du stock » sans prévenir.
 *
 * L'écran signale les lignes sans coût : c'est un CHOIX à voir, pas une
 * erreur à corriger.
 */

const ligneReception = z.object({
  produitId: z.number().int(),
  quantite: z.number().positive(),
  /** Vide = prix inconnu. Ne sera pas enregistré comme coût. */
  prixUnitaire: z.number().min(0).nullish(),
  uniteId: z.string().uuid().nullish(),
  emplacementId: z.number().int().nullish(),
  // Métadonnées de lot — pour les traçables.
  numeroLot: z.string().max(100).nullish(),
  datePeremption: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  dateFabrication: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  fabricant: z.string().max(120).nullish(),
  note: z.string().max(255).nullish(),
});

export const stockReceptionRouter = createTRPCRouter({
  /** Recherche — service PARTAGÉ avec le recensement (M1). */
  rechercher: requirePermissionProcedure("stock.consulter")
    .input(z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(50).default(12) }))
    .query(async ({ ctx, input }) => rechercherArticles(ctx.user.agenceId, input.query, input.limit)),

  /**
   * Fournisseurs — la liste courte, pour un sélecteur.
   *
   * On ne propose pas de « fournisseur inconnu » : un bon de réception porte
   * un fournisseur, et une dette fournisseur sans nom est une dette qu'on ne
   * peut pas relancer. Si le garage achète au comptoir sans bon, c'est un
   * autre métier (vente), pas une réception.
   */
  fournisseurs: requirePermissionProcedure("stock.consulter")
    .query(async () => {
      return db
        .select({ id: fournisseurs.id, nom: fournisseurs.nom, code: fournisseurs.code })
        .from(fournisseurs)
        .where(eq(fournisseurs.isActive, true))
        .orderBy(asc(fournisseurs.nom))
        .limit(200);
    }),

  /** Les unités d'un article, pour proposer le bon conditionnement. */
  unitesArticle: requirePermissionProcedure("stock.consulter")
    .input(z.object({ produitId: z.number().int() }))
    .query(async ({ input }) => {
      return db.execute(sql`
        SELECT u.id, u.code, u.libelle, u.symbole, pu.facteur_vers_base AS facteur
          FROM produit_unites pu
          JOIN unites_mesure u ON u.id = pu.unite_id
         WHERE pu.produit_id = ${input.produitId}
         ORDER BY pu.facteur_vers_base DESC`);
    }),

  /**
   * PRÉVISUALISER — ce que la réception va faire, sans rien écrire.
   *
   * Trois questions par ligne, et une seule réponse : le stock va-t-il
   * changer d'emplacement, le CMUP va-t-il bouger, un lot va-t-il être
   * créé. Le magasinier valide en connaissance de cause.
   */
  previsualiser: requirePermissionProcedure("stock.consulter")
    .input(z.object({ lignes: z.array(ligneReception).min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const ids = [...new Set(input.lignes.map((l) => l.produitId))];

      const articles = ((await db
        .select({
          id: produits.id,
          titre: produits.titre,
          typeProduit: produits.typeProduit,
          dlcJours: produits.dlcJours,
          prixAchat: produits.prixAchat,
          stockMaximum: produits.stockMaximum,
          seuilAlerte: produits.seuilAlerte,
        })
        .from(produits)
        .where(and(sql`${produits.id} IN (${sql.join(ids, sql`, `)})`))) as unknown as {
        id: number;
        titre: string;
        typeProduit: string;
        dlcJours: number | null;
        prixAchat: string | null;
        stockMaximum: number | null;
        seuilAlerte: number | null;
      }[]);
      const indexArticle = new Map(articles.map((a) => [a.id, a]));

      const stocks = ((await db.execute(sql`
            SELECT produit_id, quantite, disponible, nb_lignes, cmup_pondere
              FROM stock_agregat
             WHERE agence_id = ${ctx.user.agenceId}
               AND produit_id IN (${sql.join(ids, sql`, `)})
           `)) as unknown as {
        produit_id: number;
        quantite: string;
        disponible: string;
        nb_lignes: number;
        cmup_pondere: string | null;
      }[]);
      const indexStock = new Map(stocks.map((s) => [s.produit_id, s]));

      const lignes = input.lignes.map((l) => {
        const a = indexArticle.get(l.produitId);
        const s = indexStock.get(l.produitId);
        const prix = l.prixUnitaire ?? (a?.prixAchat != null ? Number(a.prixAchat) : 0);
        const cmupActuel = s?.cmup_pondere != null ? Number(s.cmup_pondere) : null;
        const quantiteApres = (s ? Number(s.quantite) : 0) + l.quantite;

        // Le CMUP ne bouge que si un coût NON NUL est fourni. C'est la règle
        // du moteur, appliquée ici pour être affichée AVANT validation.
        const cmupApres =
          prix > 0
            ? cmupActuel != null && (s ? Number(s.quantite) : 0) > 0
              ? ((cmupActuel * (s ? Number(s.quantite) : 0)) + prix * l.quantite) / quantiteApres
              : prix
            : cmupActuel;

        return {
          produitId: l.produitId,
          titre: a?.titre ?? `#${l.produitId}`,
          quantite: l.quantite,
          quantiteAvant: s ? Number(s.quantite) : 0,
          quantiteApres,
          /** Prix retenu : saisi, sinon celui du catalogue. */
          prixUnitaire: prix,
          prixSource: l.prixUnitaire != null ? "saisi" : a?.prixAchat != null ? "catalogue" : "aucun",
          cmupAvant: cmupActuel,
          cmupApres,
          /** Un lot sera créé — donc une traçabilité de plus. */
          lotCree: Boolean(l.numeroLot),
          /** Un produit traçable reçu sans lot : à signaler, pas à bloquer. */
          lotAttendu: a?.dlcJours != null || l.numeroLot != null,
          /** Le stock dépasse le maximum déclaré par le produit. */
          auDessusDuMaximum: a?.stockMaximum != null && quantiteApres > Number(a.stockMaximum),
          /** Un lot sera créé et un numéro de série serait utile — hors MVP. */
          dlcJours: a?.dlcJours ?? null,
        };
      });

      return {
        lignes,
        totaux: {
          articles: new Set(input.lignes.map((l) => l.produitId)).size,
          quantite: lignes.reduce((s, l) => s + l.quantite, 0),
          valeur: lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0),
          sansCout: lignes.filter((l) => l.prixUnitaire === 0).length,
          lotsACreer: lignes.filter((l) => l.lotCree).length,
          auDessusDuMaximum: lignes.filter((l) => l.auDessusDuMaximum).length,
        },
      };
    }),

  /**
   * RECEVOIR — le lot entier, en une transaction.
   *
   * Everything passe par `procurement.createReception` : un seul moteur,
   * donc une seule façon de créer un lot, de calculer un CMUP et d'écrire
   * un mouvement. Dupliquer ici une partie de cette logique serait exactement
   * le défaut que ce chantier répare — voir cadrage § 3.3.
   */
  recevoir: requirePermissionProcedure("achats.recevoir")
    .input(z.object({
      fournisseurId: z.number().int(),
      lignes: z.array(ligneReception).min(1).max(100),
      notes: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const caller = procurementRouter.createCaller(ctx as never);

      const r = await caller.createReception({
        achatId: "standalone",
        fournisseurId: String(input.fournisseurId),
        lignes: input.lignes.map((l) => {
          const prix = l.prixUnitaire ?? 0;
          return {
            produitId: String(l.produitId),
            // Aucune commande : ce qui est reçu EST ce qui était attendu.
            // C'est ce qui rend la réception possible sans bon, et qui évite
            // d'écrire un motif d'écart qui n'existerait pas.
            quantiteCommandee: l.quantite,
            quantiteRecue: l.quantite,
            prixUnitaire: String(prix),
            uniteId: l.uniteId ?? undefined,
            emplacementId: l.emplacementId ?? undefined,
            numeroLot: l.numeroLot ?? undefined,
            datePeremption: l.datePeremption ?? undefined,
            dateFabrication: l.dateFabrication ?? undefined,
            fabricant: l.fabricant ?? undefined,
            motifEcart: l.note ?? undefined,
            appliquerPrixCatalogue: false,
            facteurConversion: 1,
          };
        }),
        notes: input.notes,
      });

      return {
        bonReceptionId: (r as { bonReceptionId?: number; brId?: number }).bonReceptionId ?? null,
        lignesRecues: input.lignes.length,
        reference: (r as { reference?: string }).reference ?? null,
      };
    }),
});

/** Réexporté pour l'écran : la forme d'une ligne, sans la validation zod. */
export type LigneReception = z.infer<typeof ligneReception>;

/** Libellés d'unités — pour afficher « bidon 4 L » plutôt qu'un identifiant. */
export async function libellesUnites(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: unitesMesure.id, libelle: unitesMesure.libelle, code: unitesMesure.code })
    .from(unitesMesure)
    .where(and(sql`${unitesMesure.id} IN (${sql.join(ids, sql`, `)})`));
  return new Map(rows.map((r) => [r.id, r.libelle ?? r.code]));
}