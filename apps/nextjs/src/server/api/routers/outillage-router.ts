import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db, produits, categories, stocks, stocksUnites, stocksLots, lots, unitesMesure, pretsOutils, employes, mouvementsStock, emplacements, outillageCalibration, outillageMaintenance, outilsExemplaires } from "@atelierone/db";
import { eq, and, desc, asc, sql, or, ilike, inArray, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { enregistrerMouvement, TYPES_MOUVEMENT } from "~/server/lib/stock-engine";

/**
 * OUTILLAGE & MATÉRIEL — outils prêtés aux techniciens + consommables.
 * OUTIL : prêt (sortie → retour) — CONSOMMABLE : stock classique.
 * Statuts d'outil (specs garage) : REPARATION | USE | CASSE | PERDU | VOLE | REFORME
 * Le prêt décrémente la quantité disponible, le retour OK la réintègre.
 * Permission mécanicien : stock.utiliser (sortir/rendre) — stock.modifier (gestion).
 */

/**
 * Sort (ou remet) UNE unité d'outillage, via le moteur unique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ANCIENNE VERSION ÉTAIT FAUSSE SUR DEUX POINTS
 *
 * 1. Elle lisait le stock sur UN SEUL emplacement — celui du bureau — et
 *    traitait « aucune ligne ici » comme « zéro pièce en stock ». Un outil
 *    rangé en rayon était donc déclaré indisponible au prêt, avec le message
 *    « stock insuffisant » : ce qui est exactement le contraire de la
 *    réalité. Le modèle de l'utilisateur prévoit 5 magasins ; un outil
 *    n'a aucune raison d'être au bureau pour être prêté.
 *
 * 2. Elle écrivait `stocks` et `mouvements_stock` en direct, hors moteur.
 *    Toute la règle du projet — « aucune variation de stock sans passer par
 *    `enregistrerMouvement` » — était contournée ici : pas de contrôle de
 *    quarantaine, pas de coût moyen, pas de lot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ SORT LA PIÈCE
 *
 * Aucun emplacement n'est passé : `verifierStockDisponible` choisit alors la
 * ligne la PLUS REMPLIE, de façon déterministe (M0). C'est la bonne règle —
 * l'outil sort d'où il est vraiment, pas d'où l'écran suppose qu'il est.
 * Le mouvement est enregistré sans emplacement : un outil prêté n'est pas
 * sur un étagère, il est chez un technicien, et le lieu du prêt est déjà
 * dans `prets_outils`.
 */
async function ajusterStockOutil(
  tx: any,
  outilId: number,
  agenceId: number,
  sens: "E" | "S",
  type: string,
  motif: string,
  par: number,
) {
  await enregistrerMouvement(tx, {
    type: type as never,
    sens,
    produitId: outilId,
    agenceId,
    quantite: 1,
    motif,
    effectuePar: par,
  } as any);
}

/**
 * L'employé correspondant à l'utilisateur connecté, ou `null`.
 *
 * `prets_outils.sortie_par` et `retourne_par` référencent `employes`, pas
 * `utilisateurs`. Le code y écrivait `ctx.user.id` : la base rejetait
 * l'écriture en clé étrangère et le prêt échouait systématiquement. La
 * fonction n'était donc pas bancale, elle était inopérante.
 *
 * On ne devine pas. Un compte sans fiche salarié — un manager qui emprunte
 * un outil, un compte de démonstration — ne fabrique pas d'employé : on
 * laisse `sortie_par` à NULL et l'historique reste exact pour tous les
 * autres.
 */
async function employeDeLUtilisateur(tx: any, userId: number): Promise<number | null> {
  const [ligne] = await tx
    .select({ id: employes.id })
    .from(employes)
    .where(eq(employes.userId, userId))
    .limit(1);
  return ligne ? Number(ligne.id) : null;
}

const STATUT_OUTIL_META: Record<string, string> = {
  REPARATION: "En réparation",
  USE: "Usé",
  CASSE: "Cassé",
  PERDU: "Perdu",
  VOLE: "Volé",
  REFORME: "Réformé",
};

/**
 * Les états d'un exemplaire physique.
 *
 * Un texte, pas une ENUM : un garage découvre un état de plus tous les six
 * mois, et un ALTER TABLE à chaque découverte est le meilleur moyen de
 * rendre l'état suivant inutilisable. La liste est donc vérifiée ici, à
 * l'écriture, et la base reste ouverte.
 *
 * `DISPONIBLE` et `PRETE` sont les deux seuls états gérables : les autres
 * décrivent une panne, une perte, un vol — on ne les choisit pas au prêt, on
 * les constate.
 */
const ETATS_EXEMPLAIRE = [
  "DISPONIBLE",
  "PRETE",
  "REPARATION",
  "USE",
  "CASSE",
  "PERDU",
  "VOLE",
  "REFORME",
] as const;

/** Une pièce sortie du parc ne réapparaît pas magiquement dans un rayon. */
const ETATS_RETIRES = new Set<string>(["PERDU", "VOLE", "CASSE", "REFORME"]);

/** Emplacement « Bureau du magasinier » de l'agence (créé à la première utilisation). */
async function getOrCreateBureau(q: any, agenceId: number): Promise<{ id: number; libelle: string | null }> {
  const [bureau] = await q
    .select({ id: emplacements.id, libelle: emplacements.libelle })
    .from(emplacements)
    .where(and(eq(emplacements.agenceId, agenceId), eq(emplacements.code, "BUREAU")))
    .limit(1);
  if (bureau) return bureau;
  const [row] = await q
    .insert(emplacements)
    .values({ agenceId, type: "BUREAU", code: "BUREAU", libelle: "Bureau du magasinier", ordre: 999, profondeur: 0 } as any)
    .returning({ id: emplacements.id, libelle: emplacements.libelle });
  return row;
}

export const outillageRouter = createTRPCRouter({
  /** Liste des outils / consommables avec recherche, stock et statut. */
  list: requirePermissionProcedure("stock.consulter")
    .input(
      z.object({
        q: z.string().optional(),
        type: z.enum(["OUTIL", "CONSOMMABLE", "EQUIPEMENT"]).optional(),
        categorieId: z.number().int().optional(),
        statut: z.enum(["TOUS", "DISPONIBLE", "PRETE", "STOCK_EPUISE", "REPARATION", "USE", "CASSE", "PERDU", "VOLE", "REFORME"]).optional(),
        limit: z.number().int().min(10).max(300).default(100),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [
        eq(produits.isActive, true),
        inArray(produits.typeProduit, safe.type ? [safe.type] : ["OUTIL", "CONSOMMABLE", "EQUIPEMENT"]),
      ];
      if (safe.categorieId) conditions.push(eq(produits.categorieId, safe.categorieId));
      if (safe.q?.trim()) {
        const q = `%${safe.q.trim()}%`;
        conditions.push(
          or(
            ilike(produits.titre, q),
            ilike(produits.codeBarre, q),
            ilike(produits.codeArticle, q),
            ilike(produits.designationCourte, q),
          )!
        );
      }

      const rows = await db
        .select({
          id: produits.id,
          typeProduit: produits.typeProduit,
          titre: produits.titre,
          codeBarre: produits.codeBarre,
          codeArticle: produits.codeArticle,
          designationCourte: produits.designationCourte,
          marque: produits.marque,
          etat: produits.etat,
          description: produits.description,
          categorieId: produits.categorieId,
          categorieNom: categories.nom,
          emplacementPrincipalId: produits.emplacementPrincipalId,
          seuilAlerte: produits.seuilAlerte,
          photos: produits.photos,
          imageUrl: produits.imageUrl,
          statutOutil: produits.statutOutil,
          suiviSerie: produits.suiviSerie,
          typeOutil: produits.typeOutil,
          stockTotal: sql<number>`COALESCE(SUM(${stocks.quantite}), 0)`,
        })
        .from(produits)
        .leftJoin(categories, eq(produits.categorieId, categories.id))
        .leftJoin(stocks, and(eq(stocks.produitId, produits.id), eq(stocks.agenceId, ctx.user.agenceId)))
        .where(and(...conditions))
        .groupBy(produits.id, categories.nom)
        .orderBy(produits.titre);

      // Prêts actifs par outil (avec date de retour prévue → détection des retards)
      const ids = rows.map((r) => r.id);
      const prets = ids.length
        ? await db
            .select({
              id: pretsOutils.id,
              outilId: pretsOutils.outilId,
              technicienNom: employes.nom,
              technicienPrenom: employes.prenom,
              dateSortie: pretsOutils.dateSortie,
              dateRetour: pretsOutils.dateRetour,
            })
            .from(pretsOutils)
            .leftJoin(employes, eq(pretsOutils.technicienId, employes.id))
            .where(and(inArray(pretsOutils.outilId, ids), eq(pretsOutils.actif, true)))
        : [];
      const now = new Date();
      const pretsParOutil = new Map<number, { id: number; technicien: string; dateSortie: Date | null; dateRetour: Date | null; enRetard: boolean }[]>();
      for (const p of prets) {
        const cur = pretsParOutil.get(p.outilId) ?? [];
        cur.push({
          id: p.id,
          technicien: `${p.technicienPrenom ?? ""} ${p.technicienNom ?? ""}`.trim(),
          dateSortie: p.dateSortie,
          dateRetour: p.dateRetour,
          enRetard: !!p.dateRetour && new Date(p.dateRetour) < now,
        });
        pretsParOutil.set(p.outilId, cur);
      }

      const result = rows.map((r) => {
        const stock = Number(r.stockTotal ?? 0);
        const pretsActifs = pretsParOutil.get(r.id) ?? [];
        const estPrete = pretsActifs.length > 0;
        // Statut specs garage prioritaire (usé, cassé, perdu, volé, en réparation, réformé)
        const statutSpecial = r.statutOutil ?? null;
        const statut = statutSpecial
          ? statutSpecial
          : r.typeProduit === "OUTIL" ? (estPrete ? "PRETE" : stock > 0 ? "DISPONIBLE" : "STOCK_EPUISE") : stock > 0 ? "DISPONIBLE" : "STOCK_EPUISE";
        return {
          ...r,
          stockTotal: stock,
          prets: pretsActifs,
          estPrete,
          statut,
          statutLabel: statutSpecial ? STATUT_OUTIL_META[statutSpecial] ?? statutSpecial : null,
        };
      });

      if (safe.statut && safe.statut !== "TOUS") {
        return result.filter((r) => r.statut === safe.statut);
      }
      return result;
    }),

  /**
   * Le parc, prêt à afficher : pour chaque outil, combien de pièces et
   * combien sont réellement disponibles.
   *
   * La nuance compte : `stockTotal` baisse au prêt et remonte au retour, mais
   * une pièce cassée ou en réparation reste dans le garage sans être
   * utilisable. Sans ce décompte, un magasinier voit « 4 clés » et ne peut
   * pas savoir qu'une est à l'atelier.
   */
  parc: requirePermissionProcedure("stock.consulter")
    .input(z.object({ limite: z.number().int().min(1).max(300).default(100) }).optional())
    .query(async ({ ctx, input }) => {
      // `produits` est le CATALOGUE : il n'appartient pas à une agence. C'est
      // `stocks` et `outils_exemplaires` qui portent `agence_id` — filtrer
      // les produits par agence ne renverrait rien.
      const liste = await db
        .select({ id: produits.id })
        .from(produits)
        .where(and(eq(produits.isActive, true), eq(produits.typeProduit, "OUTIL")))
        .limit(input?.limite ?? 100);

      const ids = liste.map((r) => r.id);
      if (!ids.length) return [];

      const [ex] = await db
        .select({
          produitId: outilsExemplaires.produitId,
          total: sql<number>`count(*)`,
          disponibles: sql<number>`count(*) FILTER (WHERE ${outilsExemplaires.etat} = 'DISPONIBLE' AND ${outilsExemplaires.actif} = true)`,
          pretes: sql<number>`count(*) FILTER (WHERE ${outilsExemplaires.etat} = 'PRETE')`,
          hs: sql<number>`count(*) FILTER (WHERE ${outilsExemplaires.etat} IN ('REPARATION','USE'))`,
          perdus: sql<number>`count(*) FILTER (WHERE ${outilsExemplaires.etat} IN ('PERDU','VOLE','CASSE','REFORME'))`,
        })
        .from(outilsExemplaires)
        .where(and(inArray(outilsExemplaires.produitId, ids), eq(outilsExemplaires.agenceId, ctx.user.agenceId)))
        .groupBy(outilsExemplaires.produitId);

      type CompteurExemplaires = {
        produitId: number;
        total: number;
        disponibles: number;
        pretes: number;
        hs: number;
        perdus: number;
      };

      // Le type est écrit en toutes lettres : `new Map(ex.map(e => [e.a, e]))`
      // s'infère en `Map<unknown, unknown>`, et chaque accès devient `unknown`.
      const parProduit = new Map<number, CompteurExemplaires>();
      for (const e of ex as unknown as CompteurExemplaires[]) parProduit.set(e.produitId, e);

      return ids.map((id) => {
        const c = parProduit.get(id);
        return {
          produitId: id,
          // Pas d'exemplaires = outil suivi « en gros » : le stock fait foi,
          // et l'écran affiche alors le stock, pas ce compteur.
          total: c?.total ?? 0,
          disponibles: c?.disponibles ?? 0,
          pretes: c?.pretes ?? 0,
          horsService: c?.hs ?? 0,
          perdus: c?.perdus ?? 0,
          suivi: (c?.total ?? 0) > 0,
        };
      });
    }),

  /** Fiche outil : infos + prêts historisés + mouvements de stock. */
  get: requirePermissionProcedure("stock.consulter")
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [p] = await db
        .select({
          id: produits.id,
          typeProduit: produits.typeProduit,
          titre: produits.titre,
          codeBarre: produits.codeBarre,
          codeArticle: produits.codeArticle,
          designationCourte: produits.designationCourte,
          marque: produits.marque,
          etat: produits.etat,
          description: produits.description,
          categorieId: produits.categorieId,
          categorieNom: categories.nom,
          emplacementPrincipalId: produits.emplacementPrincipalId,
          seuilAlerte: produits.seuilAlerte,
          statutOutil: produits.statutOutil,
          photos: produits.photos,
          imageUrl: produits.imageUrl,
          estReconditionnable: produits.estReconditionnable,
          valeurCore: produits.valeurCore,
          estCore: produits.estCore,
          calibrable: produits.calibrable,
        })
        .from(produits)
        .leftJoin(categories, eq(produits.categorieId, categories.id))
        .where(eq(produits.id, input.id))
        .limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Outil introuvable." });

      const [stocksLignes, pretsHisto, mouvements, stockParUnite, futs, calibrations] = await Promise.all([
        db
          .select({ emplacementId: stocks.emplacementId, quantite: stocks.quantite })
          .from(stocks)
          .where(and(eq(stocks.produitId, input.id), eq(stocks.agenceId, ctx.user.agenceId))),
        db
          .select({
            id: pretsOutils.id,
            technicienNom: employes.nom,
            technicienPrenom: employes.prenom,
            dateSortie: pretsOutils.dateSortie,
            dateRetour: pretsOutils.dateRetour,
            retourneLe: pretsOutils.retourneLe,
            etatRetour: pretsOutils.etatRetour,
            motif: pretsOutils.motif,
            remarque: pretsOutils.remarque,
            actif: pretsOutils.actif,
            orId: pretsOutils.orId,
          })
          .from(pretsOutils)
          .leftJoin(employes, eq(pretsOutils.technicienId, employes.id))
          .where(eq(pretsOutils.outilId, input.id))
          .orderBy(desc(pretsOutils.dateSortie))
          .limit(50),
        db
          .select({ id: mouvementsStock.id, type: mouvementsStock.type, quantite: mouvementsStock.quantite, dateMouvement: mouvementsStock.dateMouvement, motif: mouvementsStock.motif })
          .from(mouvementsStock)
          .where(eq(mouvementsStock.produitId, input.id))
          .orderBy(desc(mouvementsStock.dateMouvement))
          .limit(30),
        db
          .select({
            uniteId: stocksUnites.uniteId,
            uniteCode: unitesMesure.code,
            uniteLibelle: unitesMesure.libelle,
            uniteSymbole: unitesMesure.symbole,
            quantite: stocksUnites.quantite,
          })
          .from(stocksUnites)
          .leftJoin(unitesMesure, eq(stocksUnites.uniteId, unitesMesure.id))
          .where(and(eq(stocksUnites.produitId, input.id), eq(stocksUnites.agenceId, ctx.user.agenceId))),
        // Fûts / lots (specs huiles : volume initial / restant, ouvert / fermé)
        db
          .select({
            lotId: lots.id,
            numeroLot: lots.numeroLot,
            volumeInitial: lots.quantiteInitiale,
            volumeRestant: stocksLots.quantite,
            datePeremption: lots.datePeremption,
            dateReception: lots.dateReception,
            statut: lots.statut,
          })
          .from(stocksLots)
          .innerJoin(lots, eq(stocksLots.lotId, lots.id))
          .where(and(eq(stocksLots.produitId, input.id), eq(stocksLots.agenceId, ctx.user.agenceId))),
        // Calibration des instruments de mesure (échéances, certificats)
        db
          .select({
            id: outillageCalibration.id,
            dateCalibration: outillageCalibration.dateCalibration,
            organisme: outillageCalibration.organisme,
            certificat: outillageCalibration.certificat,
            resultat: outillageCalibration.resultat,
            tolerance: outillageCalibration.tolerance,
            prochaineCalibration: outillageCalibration.prochaineCalibration,
          })
          .from(outillageCalibration)
          .where(eq(outillageCalibration.outilId, input.id))
          .orderBy(desc(outillageCalibration.dateCalibration))
          .limit(10),
      ]);

      const pretsActifs = pretsHisto.filter((h) => h.actif);
      const now = new Date();
      const [derniereCalibration] = calibrations;
      const derniereCalibrationInfo = derniereCalibration
        ? {
            ...derniereCalibration,
            enAttente: !!derniereCalibration.prochaineCalibration && new Date(derniereCalibration.prochaineCalibration) < now,
          }
        : null;
      return {
        outil: p,
        stock: stocksLignes.map((s) => ({ emplacementId: s.emplacementId, quantite: Number(s.quantite) })),
        stockTotal: stocksLignes.reduce((acc, s) => acc + Number(s.quantite), 0),
        stockParUnite: stockParUnite.map((u) => ({ uniteId: u.uniteId, code: u.uniteCode, libelle: u.uniteLibelle, symbole: u.uniteSymbole, quantite: Number(u.quantite) })),
        futs: futs.map((f) => ({
          lotId: f.lotId,
          numeroLot: f.numeroLot,
          volumeInitial: Number(f.volumeInitial ?? 0),
          volumeRestant: Number(f.volumeRestant ?? 0),
          datePeremption: f.datePeremption,
          dateReception: f.dateReception,
          ouvert: f.statut !== "CLOTURE",
        })),
        pretsActifs,
        historiquePrets: pretsHisto.map((h) => ({ ...h, enRetard: !!h.actif && !!h.dateRetour && new Date(h.dateRetour) < now })),
        mouvements,
        calibrations: calibrations.map((c) => ({
          ...c,
          dateCalibration: c.dateCalibration,
          prochaineCalibration: c.prochaineCalibration,
          enAttente: !!c.prochaineCalibration && new Date(c.prochaineCalibration) < now,
        })),
        derniereCalibration: derniereCalibrationInfo,
        prochaineCalibration: derniereCalibrationInfo?.prochaineCalibration ?? null,
      };
    }),

  /** Prêt d'un outil à un technicien. */
  // ==========================================================================
  // SUIVI INDIVIDUEL — chaque pièce physique, un numéro
  // ==========================================================================

  /**
   * Le parc d'un outil : ses exemplaires, leur état, et qui les a.
   *
   * Renvoie aussi `nbExemplaires` / `nbDisponibles` pour un produit NON suivi,
   * afin que l'écran affiche toujours la même chose : « disponible sur 4 ».
   */
  exemplesParProduit: requirePermissionProcedure("stock.consulter")
    .input(z.object({ produitIds: z.array(z.number().int()).min(1).max(300) }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: outilsExemplaires.id,
          produitId: outilsExemplaires.produitId,
          numero: outilsExemplaires.numero,
          etat: outilsExemplaires.etat,
          emplacementId: outilsExemplaires.emplacementId,
          emplacementCode: emplacements.code,
          actif: outilsExemplaires.actif,
          note: outilsExemplaires.note,
          pretId: sql<number | null>`(
            SELECT ${pretsOutils.id} FROM ${pretsOutils}
             WHERE ${pretsOutils.exemplaireId} = ${outilsExemplaires.id}
               AND ${pretsOutils.actif} = true
             LIMIT 1
          )`,
        })
        .from(outilsExemplaires)
        .leftJoin(emplacements, eq(outilsExemplaires.emplacementId, emplacements.id))
        .where(
          and(
            inArray(outilsExemplaires.produitId, input.produitIds),
            eq(outilsExemplaires.agenceId, ctx.user.agenceId),
          ),
        )
        .orderBy(asc(outilsExemplaires.numero));

      return rows.map((r) => ({
        ...r,
        disponible: r.etat === "DISPONIBLE" && r.actif,
      }));
    }),

  /**
   * Activer — ou désactiver — le suivi pièce par pièce d'un outil.
   *
   * Le drapeau s'appelle `produits.suivi_serie` et existait depuis le début
   * du schéma sans être lu nulle part. On l'active plutôt que d'en créer un
   * deuxième qui dirait la même chose.
   *
   * Désactiver est refusé s'il reste des exemplaires : le garderait des
   * lignes orphelines que plus aucun écran ne verrait, et un parc
   * « 4 disponibles » qui serait en réalité faux. Il faut d'abord retirer
   * les pièces du parc.
   */
  setSuivi: requirePermissionProcedure("stock.modifier")
    .input(z.object({ produitId: z.number().int(), suivi: z.boolean() }))
    // Pas de `ctx` : `produits` est le catalogue, il n'appartient pas à une
    // agence. Le drapeau dit « ce produit se suit pièce par pièce », partout.
    .mutation(async ({ input }) => {
      return db.transaction(async (tx) => {
        const [p] = await tx
          .select({ id: produits.id, titre: produits.titre })
          .from(produits)
          .where(and(eq(produits.id, input.produitId)))
          .limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Article introuvable." });

        if (!input.suivi) {
          const [restant] = await tx
            .select({ n: sql<number>`count(*)` })
            .from(outilsExemplaires)
            .where(
              and(
                eq(outilsExemplaires.produitId, input.produitId),
                eq(outilsExemplaires.actif, true),
              ),
            );
          if (Number(restant?.n ?? 0) > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Ce outil a encore des pièces enregistrées. Retirez-les du parc avant d'arrêter le suivi individuel.",
            });
          }
        }

        await tx
          .update(produits)
          .set({ suiviSerie: input.suivi } as any)
          .where(eq(produits.id, input.produitId));
        return { produitId: input.produitId, suiviSerie: input.suivi };
      }) as any;
    }),

  /**
   * Créer les exemplaires d'un outil à partir de son stock.
   *
   * C'est le geste de mise en service : « j'ai 4 clés, elles sont numérotées
   * 1 à 4 ». Le nombre vient du STOCK RÉEL, pas d'un nombre saisi à part —
   * sinon l'écran afficherait « 3 disponibles » pour un stock de 4, et
   * personne ne saurait où est la quatrième.
   *
   * Idempotent : un numéro déjà pris est ignoré. Un scan raté qui rejoue la
   * même création ne crée pas deux « n° 17 ».
   */
  initialiserExemplaires: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      produitId: z.number().int(),
      prefixe: z.string().max(20).optional(),
      quantite: z.number().int().min(1).max(200).optional(),
      emplacementId: z.number().int().nullish(),
      debut: z.number().int().min(1).max(100000).default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [p] = await tx
          .select({
            id: produits.id,
            titre: produits.titre,
            typeProduit: produits.typeProduit,
            typeOutil: produits.typeOutil,
            suiviSerie: produits.suiviSerie,
          })
          .from(produits)
          .where(eq(produits.id, input.produitId))
          .limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Article introuvable." });
        if (p.typeProduit !== "OUTIL") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Seul un outil (type OUTIL) peut être suivi pièce par pièce.",
          });
        }

        // Combien de pièces le garage possède réellement ?
        const [s] = await tx
          .select({ total: sql<string>`COALESCE(SUM(${stocks.quantite}), 0)` })
          .from(stocks)
          .where(and(eq(stocks.produitId, input.produitId), eq(stocks.agenceId, ctx.user.agenceId)));
        const enStock = Number(s?.total ?? 0);
        const aCreer = input.quantite ?? enStock;

        if (aCreer <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Aucun exemplaire à créer : cet outil n'a pas de stock. Recevez-le d'abord, ou saisissez une quantité.",
          });
        }

        const prefixe = (input.prefixe ?? "").trim();
        const largeur = String(input.debut + aCreer - 1).length;
        const numeros = Array.from({ length: aCreer }, (_, i) => {
          const n = input.debut + i;
          return prefixe ? `${prefixe}${String(n).padStart(largeur, "0")}` : String(n);
        });

        // ON CONFLICT DO NOTHING : la migration pose un UNIQUE (produit, numero).
        const inseres = await tx
          .insert(outilsExemplaires)
          .values(
            numeros.map((numero) => ({
              produitId: input.produitId,
              agenceId: ctx.user.agenceId,
              numero,
              etat: "DISPONIBLE" as const,
              emplacementId: input.emplacementId ?? null,
              actif: true,
            })),
          )
          .onConflictDoNothing({ target: [outilsExemplaires.produitId, outilsExemplaires.numero] })
          .returning({ id: outilsExemplaires.id, numero: outilsExemplaires.numero });

        // Le suivi s'active ici, et pas avant : créer des pièces sans le
        // dire laisserait un parc de 4 sur un produit qui se croit encore
        // suivi « en gros », et personne ne verrait les numéros.
        await tx.update(produits).set({ suiviSerie: true } as any).where(eq(produits.id, input.produitId));

        return {
          produits: input.produitId,
          demandes: aCreer,
          crees: inseres.length,
          dejaLa: aCreer - inseres.length,
          numeros: inseres.map((r) => r.numero),
        };
      }) as any;
    }),

  /** Changer l'état d'UNE pièce : c'est tout l'intérêt du suivi individuel. */
  setEtatExemplaire: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      exemplaireId: z.number().int(),
      etat: z.enum(ETATS_EXEMPLAIRE),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [ex] = await tx
          .select({
            id: outilsExemplaires.id,
            etat: outilsExemplaires.etat,
            produitId: outilsExemplaires.produitId,
          })
          .from(outilsExemplaires)
          .where(
            and(
              eq(outilsExemplaires.id, input.exemplaireId),
              eq(outilsExemplaires.agenceId, ctx.user.agenceId),
            ),
          )
          .limit(1);
        if (!ex) throw new TRPCError({ code: "NOT_FOUND", message: "Exemplaire introuvable." });

        // Un prêt actif ne se déclare pas « disponible » : il se rend d'abord.
        const [pret] = await tx
          .select({ id: pretsOutils.id })
          .from(pretsOutils)
          .where(and(eq(pretsOutils.exemplaireId, ex.id), eq(pretsOutils.actif, true)))
          .limit(1);
        if (pret && input.etat !== "PRETE") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cette pièce est actuellement prêtée. Enregistrez d'abord son retour.",
          });
        }

        await tx
          .update(outilsExemplaires)
          .set({
            etat: input.etat,
            // Une pièce prête ou perdue n'est plus dans un rayon : elle perd
            // son emplacement. Une pièce réparable ou usée, elle, y est
            // toujours — c'est justement là qu'on la retrouve.
            emplacementId:
              input.etat === "PRETE" || ETATS_RETIRES.has(input.etat) ? null : undefined,
            note: input.note ?? null,
          } as any)
          .where(eq(outilsExemplaires.id, ex.id));

        return { id: ex.id, etat: input.etat };
      }) as any;
    }),

  preter: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      outilId: z.number().int(),
      technicienId: z.number().int(),
      /**
       * La PIÈCE prêtée. Obligatoire si l'outil est suivi individuellement.
       *
       * Sans ce champ, « prêter un outil » veut dire « prêter la référence » :
       * avec 4 clés sur l'établi, l'écran ne peut pas dire laquelle part, et
       * le retour non plus. C'est la raison d'être du suivi.
       */
      exemplaireId: z.number().int().nullish(),
      orId: z.number().int().optional(),
      motif: z.string().optional(),
      dateRetour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [p] = await tx
          .select({
            id: produits.id,
            typeProduit: produits.typeProduit,
            statutOutil: produits.statutOutil,
            suiviSerie: produits.suiviSerie,
          })
          .from(produits)
          .where(eq(produits.id, input.outilId))
          .limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Outil introuvable." });
        if (p.typeProduit !== "OUTIL") throw new TRPCError({ code: "BAD_REQUEST", message: "Seul un outil (type OUTIL) peut être prêté." });

        // ── À QUI APPARTIENT LA PIÈCE ? ────────────────────────────────────
        // Ce contrôle passe AVANT le drapeau. Fournir un numéro qui n'est pas
        // celui de cet outil est d'abord une question d'appartenance, et « cette
        // pièce est d'une autre clé » est un diagnostic que le magasinier peut
        // corriger. « Cet outil n'est pas suivi » le laisserait(deviner).
        let ex: { id: number; numero: string; etat: string } | null = null;
        if (input.exemplaireId) {
          const [ligne] = await tx
            .select({
              id: outilsExemplaires.id,
              numero: outilsExemplaires.numero,
              etat: outilsExemplaires.etat,
            })
            .from(outilsExemplaires)
            .where(
              and(
                eq(outilsExemplaires.id, input.exemplaireId),
                eq(outilsExemplaires.produitId, input.outilId),
                eq(outilsExemplaires.agenceId, ctx.user.agenceId),
              ),
            )
            .limit(1);
          if (!ligne) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Pièce introuvable pour cet outil." });
          }
          ex = ligne;
        }

        // ── OUTIL SUIVI PIÈCE PAR PIÈCE ──────────────────────────────────
        if (p.suiviSerie) {
          if (!ex) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Cet outil est suivi pièce par pièce : choisissez la pièce précise qui sort.",
            });
          }
          // `ex` est résolu et vérifié plus haut : il appartient bien à cet
          // outil, dans cette agence.
          if (ex.etat !== "DISPONIBLE") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `La pièce n° ${ex.numero} n'est pas disponible (${STATUT_OUTIL_META[ex.etat] ?? ex.etat}).`,
            });
          }

          const [tech] = await tx.select({ id: employes.id }).from(employes).where(eq(employes.id, input.technicienId)).limit(1);
          if (!tech) throw new TRPCError({ code: "NOT_FOUND", message: "Technicien introuvable." });

          await tx
            .update(outilsExemplaires)
            .set({ etat: "PRETE", emplacementId: null } as any)
            .where(eq(outilsExemplaires.id, ex.id));

          // Le stock baisse de 1 comme pour un outil non suivi : le parc
          // disponible est le même nombre, vu autrement.
          await ajusterStockOutil(tx, input.outilId, ctx.user.agenceId, "S", TYPES_MOUVEMENT.SORTIE_OUTIL, `Prêt n° ${ex.numero} — retour prévu ${input.dateRetour}`, Number(ctx.user.id));

          const [row] = await tx
            .insert(pretsOutils)
            .values({
              agenceId: ctx.user.agenceId,
              outilId: input.outilId,
              exemplaireId: ex.id,
              technicienId: input.technicienId,
              orId: input.orId ?? null,
              motif: input.motif ?? null,
              dateSortie: new Date(),
              dateRetour: new Date(`${input.dateRetour}T18:00:00`),
              sortiePar: await employeDeLUtilisateur(tx, Number(ctx.user.id)),
              actif: true,
            } as any)
            .returning();
          return row;
        }

        // ── OUTIL NON SUIVI : le stock fait foi ──────────────────────────
        // La pièce a été résolue plus haut, et elle existe : elle appartient
        // donc bien à cet outil — mais le produit n'est pas suivi. C'est une
        // incohérence d'écran (drapeau éteint derrière une page restée
        // ouverte), pas une erreur de l'utilisateur. On refuse plutôt que de
        // prêter « la référence » en silence.
        if (ex) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Cet outil n'est pas suivi pièce par pièce : retirez le numéro de pièce, ou activez le suivi individuel.",
          });
        }
        if (p.statutOutil) throw new TRPCError({ code: "BAD_REQUEST", message: `Outil non disponible : ${STATUT_OUTIL_META[p.statutOutil] ?? p.statutOutil} — il ne peut pas être prêté.` });

        // L'ancien code refusait tout second prêt du MÊME produit tant que le
        // premier n'était pas rendu. Avec 4 clés sur l'établi, une seule
        // pouvait sortir : l'outil n'était utilisable que s'il était unique.
        //
        // Ce refus était en outre redondant : le stock décrémente déjà au
        // prêt, donc le stock disponible compte les pièces sorties. Il ne
        // restait qu'à le laisser dire.
        // On ne refuse plus que si TOUT le parc est sorti, ce que
        // `ajusterStockOutil` signale déjà (« Stock disponible insuffisant »).
        const [tech] = await tx.select({ id: employes.id }).from(employes).where(eq(employes.id, input.technicienId)).limit(1);
        if (!tech) throw new TRPCError({ code: "NOT_FOUND", message: "Technicien introuvable." });

        // Specs garage : quantity_available diminue de 1 (le stock est contrôlé)
        await ajusterStockOutil(tx, input.outilId, ctx.user.agenceId, "S", TYPES_MOUVEMENT.SORTIE_OUTIL, `Prêt à technicien — retour prévu ${input.dateRetour}`, Number(ctx.user.id));

        const [row] = await tx
          .insert(pretsOutils)
          .values({
            agenceId: ctx.user.agenceId,
            outilId: input.outilId,
            technicienId: input.technicienId,
            orId: input.orId ?? null,
            motif: input.motif ?? null,
            dateSortie: new Date(),
            dateRetour: new Date(`${input.dateRetour}T18:00:00`),
            sortiePar: await employeDeLUtilisateur(tx, Number(ctx.user.id)),
            actif: true,
          } as any)
          .returning();
        return row;
      }) as any;
    }),

  /** Retour d'un outil (état + remarque). Specs : notes obligatoires si état ≠ OK. */
  retourner: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      pretId: z.number().int(),
      etatRetour: z.enum(["OK", "ENDOMMAGE", "PERDU"]).default("OK"),
      remarque: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.etatRetour !== "OK" && (!input.remarque || input.remarque.trim().length < 3)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Une remarque (min 3 caractères) est obligatoire quand l'outil revient endommagé ou perdu." });
      }
      return db.transaction(async (tx) => {
        const [pret] = await tx
          .select()
          .from(pretsOutils)
          .where(and(eq(pretsOutils.id, input.pretId), eq(pretsOutils.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!pret) throw new TRPCError({ code: "NOT_FOUND", message: "Prêt introuvable." });
        if (!pret.actif) throw new TRPCError({ code: "BAD_REQUEST", message: "Ce prêt est déjà rendu." });

        const [p] = await tx.select({ statutOutil: produits.statutOutil, suiviSerie: produits.suiviSerie }).from(produits).where(eq(produits.id, pret.outilId)).limit(1);
        // Le bureau sert à RANGER la pièce rendue, pas à débiter le stock :
        // `ajusterStockOutil` la choisit où elle est, sans emplacement.
        const bureau = await getOrCreateBureau(tx, ctx.user.agenceId);

        // ── PIÈCE SUIVIE : l'état revient sur l'exemplaire, pas sur le produit
        //
        // Écrire `produits.statut_outil = 'CASSE'` dirait « ce produit est
        // cassé » : les 3 autres clés du même lot seraient déclarées
        // indisponibles. Avec une pièce identifiée, une seule est hors
        // service — les autres restent disponibles, et l'écran peut les
        // montrer.
        if (pret.exemplaireId) {
          const etatExemplaire =
            input.etatRetour === "OK"
              ? "DISPONIBLE"
              : input.etatRetour === "ENDOMMAGE"
                ? "CASSE"
                : "PERDU";

          await tx
            .update(outilsExemplaires)
            .set({
              etat: etatExemplaire,
              // Une pièce perdue ou cassée ne réintègre pas le stock : elle en
              // sort. Une pièce rendue en bon état revient au bureau, d'où
              // elle repartira.
              emplacementId: etatExemplaire === "DISPONIBLE" ? bureau.id : null,
              note: input.remarque ?? null,
            } as any)
            .where(eq(outilsExemplaires.id, pret.exemplaireId));

          if (etatExemplaire === "DISPONIBLE") {
            await ajusterStockOutil(tx, pret.outilId, ctx.user.agenceId, "E", TYPES_MOUVEMENT.RETOUR_OUTIL, `Retour n° de pièce — ${input.remarque ?? "bon état"}`, Number(ctx.user.id));
          }
          // CASSE et PERDU ne touchent PAS au stock, et c'est délibéré : le
          // prêt a déjà sorti la pièce (N → N-1). La re-déduire à la perte
          // ferait disparaître un outil de trop par pièce perdue, sans
          // retour possible pour corriger. L'ancien code le faisait.
        } else if (p) {
          // Specs : retour OK → quantité disponible +1, statut disponible ;
          // Endommagé → statut CASSE ; Perdu → statut PERDU.
          // Comme ci-dessus, PERDU ne re-déduit pas : le prêt l'a déjà fait.
          if (input.etatRetour === "OK") {
            await ajusterStockOutil(tx, pret.outilId, ctx.user.agenceId, "E", TYPES_MOUVEMENT.RETOUR_OUTIL, `Retour OK — ${input.remarque ?? "bon état"}`, Number(ctx.user.id));
            await tx.update(produits).set({ statutOutil: null } as any).where(eq(produits.id, pret.outilId));
          } else if (input.etatRetour === "ENDOMMAGE") {
            await tx.update(produits).set({ statutOutil: "CASSE" } as any).where(eq(produits.id, pret.outilId));
          } else {
            await tx.update(produits).set({ statutOutil: "PERDU" } as any).where(eq(produits.id, pret.outilId));
          }
        }

        await tx
          .update(pretsOutils)
          .set({
            actif: false,
            retourneLe: new Date(),
            retournePar: await employeDeLUtilisateur(tx, Number(ctx.user.id)),
            etatRetour: input.etatRetour,
            remarque: input.remarque ?? null,
          } as any)
          .where(eq(pretsOutils.id, input.pretId));
        return { success: true };
      }) as any;
    }),

  /**
   * Déclaration directe : perdu, volé, cassé, usé, en réparation, réformé.
   *
   * Sur un outil suivi pièce par pièce, le statut est celui d'UNE pièce. Écrire
   * `produits.statut_outil` y condamnerait tout le parc : dire « en
   * réparation » pour une clé condamnerait les 3 autres, qui sont saines et sur
   * l'établi. C'est exactement ce que le suivi individuel vient de corriger —
   * il ne suffisait pas de le créer, il fallait que ces deux procédures
   * l'utilisent.
   *
   * Sur un outil non suivi, `produits.statut_outil` reste le seul endroit où
   * tenir l'information, et le comportement est inchangé.
   */
  declarerStatut: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      outilId: z.number().int(),
      /** La pièce concernée. Obligatoire si l'outil est suivi individuellement. */
      exemplaireId: z.number().int().nullish(),
      statut: z.enum(["REPARATION", "USE", "CASSE", "PERDU", "VOLE", "REFORME"]),
      motif: z.string().min(3),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [p] = await tx
          .select({
            id: produits.id,
            typeProduit: produits.typeProduit,
            statutOutil: produits.statutOutil,
            suiviSerie: produits.suiviSerie,
          })
          .from(produits)
          .where(eq(produits.id, input.outilId))
          .limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Outil introuvable." });
        if (p.typeProduit !== "OUTIL" && p.typeProduit !== "EQUIPEMENT") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Seul un outil (OUTIL) ou un équipement (EQUIPEMENT) peut être déclaré." });
        }

        if (p.suiviSerie) {
          if (!input.exemplaireId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Cet outil est suivi pièce par pièce : dites quelle pièce est concernée. Sinon tout le parc est condamné.",
            });
          }
          const [ex] = await tx
            .select({ id: outilsExemplaires.id, numero: outilsExemplaires.numero })
            .from(outilsExemplaires)
            .where(
              and(
                eq(outilsExemplaires.id, input.exemplaireId),
                eq(outilsExemplaires.produitId, input.outilId),
                eq(outilsExemplaires.agenceId, ctx.user.agenceId),
              ),
            )
            .limit(1);
          if (!ex) throw new TRPCError({ code: "NOT_FOUND", message: "Pièce introuvable pour cet outil." });

          await tx
            .update(outilsExemplaires)
            .set({
              etat: input.statut,
              // Une pièce perdue, volée ou réformée quitte le parc ; une pièce
              // cassée ou en réparation y reste — c'est là qu'on la retrouve.
              emplacementId: ETATS_RETIRES.has(input.statut) ? null : undefined,
              note: input.motif,
            } as any)
            .where(eq(outilsExemplaires.id, ex.id));

          // Sortie du parc → le stock baisse de 1, comme avant.
          if (["PERDU", "VOLE", "CASSE", "REFORME"].includes(input.statut)) {
            await ajusterStockOutil(tx, input.outilId, ctx.user.agenceId, "S", TYPES_MOUVEMENT.RETOUR_OUTIL, `Pièce n° ${ex.numero} ${STATUT_OUTIL_META[input.statut]} — ${input.motif}`, Number(ctx.user.id));
          }

          return {
            success: true,
            piece: ex.numero,
            statutLabel: STATUT_OUTIL_META[input.statut],
          };
        }

        if (input.exemplaireId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cet outil n'est pas suivi pièce par pièce : retirez le numéro de pièce.",
          });
        }

        // Perte / vol / casse / réforme → déduction d'une unité (specs : quantity_available ajustée)
        if (["PERDU", "VOLE", "CASSE", "REFORME"].includes(input.statut)) {
          await ajusterStockOutil(tx, input.outilId, ctx.user.agenceId, "S", TYPES_MOUVEMENT.RETOUR_OUTIL, `${STATUT_OUTIL_META[input.statut]} — ${input.motif}`, Number(ctx.user.id));
        }
        await tx.update(produits).set({ statutOutil: input.statut } as any).where(eq(produits.id, input.outilId));
        return { success: true, statutLabel: STATUT_OUTIL_META[input.statut] };
      }) as any;
    }),

  /**
   * Retour d'un outil à l'état disponible (fin de réparation, pièce retrouvée).
   *
   * Symétrique de `declarerStatut` : sur un outil suivi, on remet UNE pièce en
   * service ; sur un outil non suivi, on lève le statut du produit comme avant.
   */
  leverStatut: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      outilId: z.number().int(),
      exemplaireId: z.number().int().nullish(),
      motif: z.string().min(3),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [p] = await tx
          .select({ id: produits.id, statutOutil: produits.statutOutil, typeProduit: produits.typeProduit, suiviSerie: produits.suiviSerie })
          .from(produits)
          .where(eq(produits.id, input.outilId))
          .limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Outil introuvable." });
        const [pret] = await tx.select({ id: pretsOutils.id }).from(pretsOutils).where(and(eq(pretsOutils.outilId, input.outilId), eq(pretsOutils.actif, true))).limit(1);
        if (pret) throw new TRPCError({ code: "BAD_REQUEST", message: "Cet outil est en prêt — il doit d'abord être rendu." });

        if (p.suiviSerie) {
          if (!input.exemplaireId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cet outil est suivi pièce par pièce : dites quelle pièce est remise en service.",
            });
          }
          const [ex] = await tx
            .select({ id: outilsExemplaires.id, numero: outilsExemplaires.numero, etat: outilsExemplaires.etat })
            .from(outilsExemplaires)
            .where(
              and(
                eq(outilsExemplaires.id, input.exemplaireId),
                eq(outilsExemplaires.produitId, input.outilId),
                eq(outilsExemplaires.agenceId, ctx.user.agenceId),
              ),
            )
            .limit(1);
          if (!ex) throw new TRPCError({ code: "NOT_FOUND", message: "Pièce introuvable pour cet outil." });

          await tx
            .update(outilsExemplaires)
            .set({ etat: "DISPONIBLE", note: input.motif } as any)
            .where(eq(outilsExemplaires.id, ex.id));

          // « Retiré du parc » = perdu, volé, réformé. Une pièce cassée ou en
          // réparation n'a jamais quitté le stock, elle y était seulement
          // indisponible : la réintégrer le déduirait deux fois.
          const etaitRetire = ETATS_RETIRES.has(ex.etat);
          if (etaitRetire) {
            await ajusterStockOutil(tx, input.outilId, ctx.user.agenceId, "E", TYPES_MOUVEMENT.RETOUR_OUTIL, `Pièce n° ${ex.numero} remise en service — ${input.motif}`, Number(ctx.user.id));
          }

          return { success: true, piece: ex.numero, stockReintegre: etaitRetire };
        }

        if (input.exemplaireId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cet outil n'est pas suivi pièce par pièce : retirez le numéro de pièce.",
          });
        }

        // Un statut « perdu / volé / cassé / réformé » avait déjà déduit 1 unité :
        // le lever réintègre l'exemplaire retrouvé / réparé (traçabilité conservée).
        const etaitDeductible = p.statutOutil != null && ["PERDU", "VOLE", "CASSE", "REFORME"].includes(p.statutOutil);
        if (etaitDeductible) {
          await ajusterStockOutil(tx, input.outilId, ctx.user.agenceId, "E", TYPES_MOUVEMENT.RETOUR_OUTIL, `Exemplaire retrouvé/réparé (${STATUT_OUTIL_META[p.statutOutil!] ?? p.statutOutil}) — ${input.motif}`, Number(ctx.user.id));
        }

        await tx.update(produits).set({ statutOutil: null } as any).where(eq(produits.id, input.outilId));
        return { success: true, stockReintegre: etaitDeductible };
      }) as any;
    }),

  /** Calibration / étalonnage d'un outil ou équipement de mesure (échéance, organisme, certificat, essai). */
  calibrer: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      outilId: z.number().int(),
      resultat: z.enum(["CONFORME", "NON_CONFORME", "AVEC_RESERVES"]),
      organisme: z.string().optional(),
      certificat: z.string().optional(),
      tolerance: z.string().optional(),
      prochaineCalibration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      motif: z.string().min(3).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [p] = await tx
          .select({ id: produits.id, typeProduit: produits.typeProduit, calibrable: produits.calibrable })
          .from(produits)
          .where(eq(produits.id, input.outilId))
          .limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Outil introuvable." });
        if (p.typeProduit !== "OUTIL" && p.typeProduit !== "EQUIPEMENT") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Seuls les outils et équipements de mesure peuvent être calibrés." });
        }

        const [row] = await tx.insert(outillageCalibration).values({
          outilId: input.outilId,
          organisme: input.organisme || null,
          certificat: input.certificat || null,
          resultat: input.resultat,
          tolerance: input.tolerance || null,
          prochaineCalibration: input.prochaineCalibration ? new Date(`${input.prochaineCalibration}T18:00:00`) : null,
          effectuePar: Number(ctx.user.id),
        } as any).returning();

        // Un essai NON_CONFORME retire l'instrument de la circulation jusqu'à réparation.
        if (input.resultat === "NON_CONFORME") {
          await tx.update(produits).set({ statutOutil: "REPARATION" } as any).where(eq(produits.id, input.outilId));
        }

        await tx.insert(mouvementsStock).values({
          produitId: input.outilId,
          agenceId: ctx.user.agenceId,
          type: "CALIBRATION",
          sens: "N",
          quantite: "0",
          stockAvant: "0",
          stockApres: "0",
          motif: `Calibration ${input.resultat} — ${input.certificat ?? "sans certificat"}${input.organisme ? ` (${input.organisme})` : ""}`,
          effectuePar: ctx.user.id,
        } as any);

        return { success: true, calibrationId: row.id, resultat: input.resultat };
      }) as any;
    }),

  /** Historique des calibrations d'un outil / équipement. */
  calibrationHistorique: requirePermissionProcedure("stock.consulter")
    .input(z.object({ outilId: z.number().int(), limit: z.number().int().default(20) }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: outillageCalibration.id,
          dateCalibration: outillageCalibration.dateCalibration,
          organisme: outillageCalibration.organisme,
          certificat: outillageCalibration.certificat,
          resultat: outillageCalibration.resultat,
          tolerance: outillageCalibration.tolerance,
          prochaineCalibration: outillageCalibration.prochaineCalibration,
        })
        .from(outillageCalibration)
        .where(eq(outillageCalibration.outilId, input.outilId))
        .orderBy(desc(outillageCalibration.dateCalibration))
        .limit(input.limit);
      return rows.map((r) => ({
        ...r,
        enAttente: !!r.prochaineCalibration && new Date(r.prochaineCalibration) < new Date(),
      }));
    }),

  /** Opération de maintenance (préventive/curative/contrôle) sur un équipement ou outil. */
  maintenance: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      outilId: z.number().int(),
      type: z.enum(["PREVENTIVE", "CURATIVE", "CONTROLE"]),
      dateMaintenance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      prestataire: z.string().optional(),
      cout: z.number().min(0).optional(),
      observations: z.string().optional(),
      prochaineMaintenance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [p] = await tx
          .select({ id: produits.id, typeProduit: produits.typeProduit })
          .from(produits)
          .where(eq(produits.id, input.outilId))
          .limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Outil introuvable." });
        if (p.typeProduit !== "OUTIL" && p.typeProduit !== "EQUIPEMENT") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Seuls les outils et équipements peuvent être maintenus." });
        }
        const [row] = await tx.insert(outillageMaintenance).values({
          outilId: input.outilId,
          type: input.type,
          dateMaintenance: input.dateMaintenance ? new Date(`${input.dateMaintenance}T18:00:00`) : new Date(),
          prestataire: input.prestataire || null,
          cout: input.cout != null ? String(input.cout) : null,
          observations: input.observations || null,
          prochaineMaintenance: input.prochaineMaintenance ? new Date(`${input.prochaineMaintenance}T18:00:00`) : null,
          effectuePar: Number(ctx.user.id),
        } as any).returning();
        return { success: true, maintenanceId: row.id };
      }) as any;
    }),

  /** Historique de maintenance d'un équipement / outil. */
  maintenanceHistorique: requirePermissionProcedure("stock.consulter")
    .input(z.object({ outilId: z.number().int(), limit: z.number().int().default(20) }))
    .query(async ({ ctx, input }) => {
      return db
        .select({
          id: outillageMaintenance.id,
          type: outillageMaintenance.type,
          dateMaintenance: outillageMaintenance.dateMaintenance,
          prestataire: outillageMaintenance.prestataire,
          cout: outillageMaintenance.cout,
          observations: outillageMaintenance.observations,
          prochaineMaintenance: outillageMaintenance.prochaineMaintenance,
        })
        .from(outillageMaintenance)
        .where(eq(outillageMaintenance.outilId, input.outilId))
        .orderBy(desc(outillageMaintenance.dateMaintenance))
        .limit(input.limit);
    }),

  /** Historique des prêts (par technicien ou global). */
  historiquePrets: requirePermissionProcedure("stock.consulter")
    .input(z.object({ technicienId: z.number().int().optional(), limit: z.number().int().default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const rows = await db
        .select({
          id: pretsOutils.id,
          outilTitre: produits.titre,
          outilCode: produits.codeBarre,
          technicienNom: employes.nom,
          technicienPrenom: employes.prenom,
          dateSortie: pretsOutils.dateSortie,
          dateRetour: pretsOutils.dateRetour,
          retourneLe: pretsOutils.retourneLe,
          etatRetour: pretsOutils.etatRetour,
          motif: pretsOutils.motif,
          remarque: pretsOutils.remarque,
          orId: pretsOutils.orId,
          actif: pretsOutils.actif,
        })
        .from(pretsOutils)
        .leftJoin(produits, eq(pretsOutils.outilId, produits.id))
        .leftJoin(employes, eq(pretsOutils.technicienId, employes.id))
        .where(and(eq(pretsOutils.agenceId, ctx.user.agenceId), input?.technicienId ? eq(pretsOutils.technicienId, input.technicienId) : undefined))
        .orderBy(desc(pretsOutils.dateSortie))
        .limit(input?.limit ?? 50);
      return rows.map((r) => ({ ...r, enRetard: !!r.actif && !!r.dateRetour && new Date(r.dateRetour) < now }));
    }),

  /** Prêts en cours (avec retards) — pour les alertes du magasinier. */
  pretsEnCours: requirePermissionProcedure("stock.consulter")
    .query(async ({ ctx }) => {
      const now = new Date();
      const rows = await db
        .select({
          id: pretsOutils.id,
          outilTitre: produits.titre,
          outilCode: produits.codeBarre,
          technicienNom: employes.nom,
          technicienPrenom: employes.prenom,
          dateSortie: pretsOutils.dateSortie,
          dateRetour: pretsOutils.dateRetour,
          motif: pretsOutils.motif,
          orId: pretsOutils.orId,
        })
        .from(pretsOutils)
        .leftJoin(produits, eq(pretsOutils.outilId, produits.id))
        .leftJoin(employes, eq(pretsOutils.technicienId, employes.id))
        .where(and(eq(pretsOutils.agenceId, ctx.user.agenceId), eq(pretsOutils.actif, true)))
        .orderBy(asc(pretsOutils.dateSortie));
      return rows.map((r) => ({
        ...r,
        enRetard: !!r.dateRetour && new Date(r.dateRetour) < now,
        joursEcoules: Math.max(0, Math.floor((now.getTime() - new Date(r.dateSortie).getTime()) / 86400000)),
      }));
    }),

  // ─── BUREAU DU MAGASINIER (MVP conception stock + outillage) ───

  /** Emplacement « Bureau » de l'agence (créé à la première utilisation). */
  bureauEmplacement: requirePermissionProcedure("stock.consulter")
    .query(async ({ ctx }) => {
      return getOrCreateBureau(db, ctx.user.agenceId);
    }),

  /** Approvisionner le bureau depuis un grand magasin (transfert tracé). */
  approvisionnerBureau: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      produitId: z.number().int(),
      emplacementSourceId: z.number().int(),
      quantite: z.number().positive(),
      motif: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const groupeOperationId = crypto.randomUUID();
      return db.transaction(async (tx) => {
        const [prod] = await tx.select({ titre: produits.titre }).from(produits).where(eq(produits.id, input.produitId)).limit(1);
        if (!prod) throw new TRPCError({ code: "NOT_FOUND", message: "Article introuvable." });
        const motif = input.motif || "Réassort du bureau";
        const bureau = await getOrCreateBureau(tx, ctx.user.agenceId);
        await enregistrerMouvement(tx, {
          produitId: input.produitId,
          agenceId: ctx.user.agenceId,
          type: TYPES_MOUVEMENT.APPROVISIONNEMENT_BUREAU_SORTIE,
          sens: "S",
          quantite: input.quantite,
          emplacementId: input.emplacementSourceId,
          motif: `Sortie magasin → bureau : ${motif}`,
          effectuePar: Number(ctx.user.id),
          groupeOperationId,
        });
        await enregistrerMouvement(tx, {
          produitId: input.produitId,
          agenceId: ctx.user.agenceId,
          type: TYPES_MOUVEMENT.APPROVISIONNEMENT_BUREAU_ENTREE,
          sens: "E",
          quantite: input.quantite,
          emplacementId: bureau.id,
          motif: `Entrée bureau depuis magasin #${input.emplacementSourceId} : ${motif}`,
          effectuePar: Number(ctx.user.id),
          groupeOperationId,
        });
        return { success: true, bureauId: bureau.id };
      }) as any;
    }),

  /** Dotation de consommable : sortie bureau → OR / technicien, sans retour. */
  doter: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({
      produitId: z.number().int(),
      quantite: z.number().positive(),
      orId: z.number().int().optional(),
      technicienId: z.number().int().optional(),
      motif: z.string().min(3),
    }))
.mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const bureau = await getOrCreateBureau(tx, ctx.user.agenceId);
        const [prod] = await tx.select({ titre: produits.titre, typeProduit: produits.typeProduit }).from(produits).where(eq(produits.id, input.produitId)).limit(1);
        if (!prod) throw new TRPCError({ code: "NOT_FOUND", message: "Article introuvable." });
        if (prod.typeProduit === "OUTIL") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Un outil se prête (pas de dotation) - utilisez « Prêter un outil »." });
        }
        const cible = input.orId ? `OR #${input.orId}` : input.technicienId ? `technicien #${input.technicienId}` : "atelier";
        await enregistrerMouvement(tx, {
          produitId: input.produitId,
          agenceId: ctx.user.agenceId,
          type: TYPES_MOUVEMENT.DOTATION_CONSOMMABLE,
          sens: "S",
          quantite: input.quantite,
          emplacementId: bureau.id,
          orId: input.orId,
          motif: `Dotation → ${cible} : ${input.motif}`,
          effectuePar: Number(ctx.user.id),
        });
        return { success: true, bureauId: bureau.id };
      }) as any;
    }),

  /** Stock du bureau (quantités, seuils locaux, statut OK / sous seuil). */
  bureauList: requirePermissionProcedure("stock.consulter")
    .input(z.object({
      q: z.string().optional(),
      type: z.enum(["OUTIL", "CONSOMMABLE", "PIECE"]).optional(),
      sousSeuilOnly: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const bureau = await getOrCreateBureau(db, ctx.user.agenceId);
      const safe = input ?? {};
      const conditions: any[] = [
        eq(stocks.emplacementId, bureau.id),
        eq(stocks.agenceId, ctx.user.agenceId),
      ];
      if (safe.type) conditions.push(eq(produits.typeProduit, safe.type));
      if (safe.q?.trim()) {
        const q = `%${safe.q.trim()}%`;
        conditions.push(
          or(
            ilike(produits.titre, q),
            ilike(produits.codeBarre, q),
            ilike(produits.codeArticle, q),
            ilike(produits.designationCourte, q),
          )!
        );
      }
      const rows = await db
        .select({
          produitId: stocks.produitId,
          titre: produits.titre,
          codeBarre: produits.codeBarre,
          codeArticle: produits.codeArticle,
          typeProduit: produits.typeProduit,
          statutOutil: produits.statutOutil,
          seuilGlobal: produits.seuilAlerte,
          quantite: stocks.quantite,
          quantiteReservee: stocks.quantiteReservee,
          seuilLocal: stocks.seuilAlerteLocal,
        })
        .from(stocks)
        .innerJoin(produits, eq(stocks.produitId, produits.id))
        .where(and(...conditions))
        .orderBy(desc(stocks.quantite));
      const result = rows.map((r) => {
        const quantite = Number(r.quantite ?? 0);
        const reservee = Number(r.quantiteReservee ?? 0);
        const seuil = r.seuilLocal ?? r.seuilGlobal ?? 0;
        return {
          ...r,
          quantite,
          reservee,
          disponible: Math.max(0, quantite - reservee),
          seuil,
          sousSeuil: seuil > 0 && quantite < seuil,
        };
      });
      return safe.sousSeuilOnly ? result.filter((r) => r.sousSeuil) : result;
    }),

  /** Régler le seuil d'alerte local d'un produit au bureau. */
  setSeuilBureau: requirePermissionProcedure("stock.utiliser", "stock.modifier")
    .input(z.object({ produitId: z.number().int(), seuil: z.number().int().min(0) }))
    .mutation(async ({ ctx, input }) => {
      const bureau = await getOrCreateBureau(db, ctx.user.agenceId);
      await db
        .update(stocks)
        .set({ seuilAlerteLocal: input.seuil } as any)
        .where(and(eq(stocks.produitId, input.produitId), eq(stocks.emplacementId, bureau.id), eq(stocks.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  /** Mouvements liés au bureau (entrées/sorties/dotations/prêts). */
  bureauMouvements: requirePermissionProcedure("stock.consulter")
    .input(z.object({ produitId: z.number().int().optional(), limit: z.number().int().default(100) }))
    .query(async ({ ctx, input }) => {
      const bureau = await getOrCreateBureau(db, ctx.user.agenceId);
      const conditions: any[] = [
        eq(mouvementsStock.agenceId, ctx.user.agenceId),
        or(
          eq(mouvementsStock.emplacementId, bureau.id),
          inArray(mouvementsStock.type, [
            TYPES_MOUVEMENT.APPROVISIONNEMENT_BUREAU_SORTIE,
            TYPES_MOUVEMENT.APPROVISIONNEMENT_BUREAU_ENTREE,
            TYPES_MOUVEMENT.DOTATION_CONSOMMABLE,
          ]),
        ),
      ];
      if (input.produitId) conditions.push(eq(mouvementsStock.produitId, input.produitId));
      const rows = await db
        .select({
          id: mouvementsStock.id,
          type: mouvementsStock.type,
          sens: mouvementsStock.sens,
          quantite: mouvementsStock.quantite,
          motif: mouvementsStock.motif,
          orId: mouvementsStock.orId,
          emplacementId: mouvementsStock.emplacementId,
          dateMouvement: mouvementsStock.dateMouvement,
          produitTitre: produits.titre,
          produitCode: produits.codeArticle,
        })
        .from(mouvementsStock)
        .leftJoin(produits, eq(mouvementsStock.produitId, produits.id))
        .where(and(...conditions))
        .orderBy(desc(mouvementsStock.dateMouvement))
        .limit(input.limit);
      return rows;
    }),
});