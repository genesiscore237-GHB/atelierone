import { z } from "zod";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import {
  produits,
  produitArticles,
  codesBarres,
  emplacements,
  stocks,
  inventaires,
  inventairesSessions,
  lots,
  unitesMesure,
  recensementLignes,
} from "@atelierone/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { rechercherArticles } from "~/server/lib/recherche-articles";
import {
  enregistrerMouvement,
  TYPES_MOUVEMENT,
} from "~/server/lib/stock-engine";
import { exigerPasDeDoublon } from "~/server/lib/garde-doublons";
import { detectBarcodeType } from "~/server/lib/barcodes";
import { creerVariante } from "./articles-router";

/**
 * RECENSEMENT — « je compte ce que j'ai dans mon garage ».
 *
 * Ce module ne remplace pas l'inventaire cyclique : il répond à un autre
 * besoin, celui du premier jour. Un garage qui utilise AtelierOne pour la
 * première fois ne veut pas « inventorier » un stock qu'il n'a jamais saisi
 * — il veut **dire ce qu'il possède**, pièce par pièce, et savoir où.
 *
 * Il ne remplace pas non plus le moteur d'inventaire existant : il s'y
 * branche par dessus et lui apporte ce qui lui manquait — la localisation
 * et le lot (migration 0020).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PRINCIPE : CONSTATER PUIS DÉCIDER, JAMAIS ÉCRASER
 *
 * Un recensement peut être exécuté trois fois sur la même zone : la première
 * pour se repérer, la deuxième pour confirmer, la troisième parce qu'une
 * étagère a été rangée entre-temps. Si chaque passage RÉÉCRIT le stock, le
 * magasinier perd la trace de ce qu'il a vu et de ce qu'il a appliqué.
 *
 * Donc : `previsualiser` ne RIEN écrit et rend les écarts visibles ;
 * `valider` applique, en traceant la différence. Et `valider` refuse de
 * valider deux fois la même session.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS FAIT ICI, ET POURQUOI
 *
 * · Aucun déclencheur automatique de stock. Une pièce du bureau du chef
 *   n'est pas dans le stock tant que le magasinier ne l'a pas saisie.
 * · Aucune valeur de CMUP inventée. Un census physique ne connaît pas le
 *   coût d'achat ; la colonne reste vide et le magasinier la renseigne s'il
 *   la connaît. Inventer un coût produirait une « Valeur du stock » fausse
 *   mais crédible — bien plus difficile à repérer qu'un zéro.
 */

const ligneRecensement = z.object({
  produitId: z.number().int(),
  /** Où la pièce a été comptée. NULL = stock global non localisé. */
  emplacementId: z.number().int().nullish(),
  /** Contenant d'origine pour les traçables : bidons issus d'un fût. */
  lotId: z.number().int().nullish(),
  /** Ce que le magasinier a physiquement compté. */
  quantite: z.number().min(0),
  uniteId: z.string().uuid().nullish(),
  /** Prix d'achat unitaire — facultatif, jamais deviné. */
  prixAchat: z.number().min(0).nullish(),
  /** Note libre : « found behind the compressor ». */
  note: z.string().max(500).nullish(),
});

export const stockRecensementRouter = createTRPCRouter({
  /**
   * RECHERCHE POUR LA SAISIE.
   *
   * Le magasinier tape — ou scanne — et doit voir CE QUI EXISTE déjà. La
   * recherche renvoie donc les articles correspondants ET, séparément, les
   * articles dont le texte ressemble : c'est le garde-fou anti-doublon, et
   * il doit apparaître au moment de créer, pas après coup.
   *
   * On ne fusionne jamais deux articles sur similarité textuelle : deux
   * pièces peuvent porter la même désignation et être incompatibles. Le
   * logiciel le signale, il ne tranche pas à la place du magasinier.
   */
  rechercher: requirePermissionProcedure("stock.consulter")
    .input(z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(50).default(12),
    }))
    .query(async ({ ctx, input }) =>
      // Service PARTAGÉ avec la réception (M3) : une seule implémentation de la
      // recherche tolérante et du garde-fou anti-doublon. Deux copies
      // divergeraient — et c'est exactement la maladie que ce chantier combat.
      rechercherArticles(ctx.user.agenceId, input.query, input.limit),
    ),
  /**
   * PRÉPARATION D'UNE LIGNE — ce que l'écran doit proposer avant que le
   * magasinier saisisse le nombre.
   *
   * On lui montre le stock DÉJÀ connu, réparti par emplacement, pour qu'il
   * saisisse une quantité qui a un sens : « il y en a 4 dans le magasin, et
   * j'en trouve 7 au total » se comprend ; « j'en trouve 7 » contre du vide
   * ne se comprend pas.
   */
  preparerLigne: requirePermissionProcedure("stock.consulter")
    .input(z.object({ produitId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [p] = await db
        .select({
          id: produits.id,
          titre: produits.titre,
          codeBarre: produits.codeBarre,
          typeProduit: produits.typeProduit,
          uniteBaseId: produits.uniteBaseId,
          dlcJours: produits.dlcJours,
          seuilAlerte: produits.seuilAlerte,
        })
        .from(produits)
        .where(eq(produits.id, input.produitId))
        .limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Article introuvable." });

      const parEmplacement = await db
        .select({
          emplacementId: stocks.emplacementId,
          quantite: stocks.quantite,
          quantiteReservee: stocks.quantiteReservee,
          lotId: stocks.lotId,
        })
        .from(stocks)
        .where(and(eq(stocks.produitId, input.produitId), eq(stocks.agenceId, ctx.user.agenceId)))
        .orderBy(sql`${stocks.quantite} DESC`);

      const emplacementsConnus = new Map(
        parEmplacement
          .filter((l) => l.emplacementId != null)
          .map((l) => [l.emplacementId as number, Number(l.quantite)]),
      );

      const libellesEmplacements = await chargerLibellesEmplacements(
        [...emplacementsConnus.keys()],
        ctx.user.agenceId,
      );

      const unites = p.uniteBaseId
        ? await db
            .select({ id: unitesMesure.id, code: unitesMesure.code, libelle: unitesMesure.libelle })
            .from(unitesMesure)
        : [];

      // Le stock déjà connu, par la vue : la somme, jamais une ligne.
      const [agregat] = (await db.execute(sql`
            SELECT quantite, disponible, nb_lignes, nb_emplacements, nb_lots
              FROM stock_agregat
             WHERE produit_id = ${input.produitId} AND agence_id = ${ctx.user.agenceId}
           `)) as unknown as {
        quantite: string;
        disponible: string;
        nb_lignes: number;
        nb_emplacements: number;
        nb_lots: number;
      }[];

      const lotsDuProduit =
        (await db
          .select({
            id: lots.id,
            numeroLot: lots.numeroLot,
            dateOuverture: lots.dateOuverture,
            datePeremption: lots.datePeremption,
            contenuRestant: lots.contenuRestant,
            estBloque: lots.estBloque,
          })
          .from(lots)
          .where(eq(lots.produitId, input.produitId))
          .limit(20)) as unknown as {
          id: number;
          numeroLot: string;
          dateOuverture: string | null;
          datePeremption: string | null;
          contenuRestant: string | null;
          estBloque: boolean;
        }[];

      return {
        produit: p,
        stockConnu: agregat
          ? {
              quantite: Number(agregat.quantite),
              disponible: Number(agregat.disponible),
              nbLignes: agregat.nb_lignes,
              nbEmplacements: agregat.nb_emplacements,
              nbLots: agregat.nb_lots,
            }
          : { quantite: 0, disponible: 0, nbLignes: 0, nbEmplacements: 0, nbLots: 0 },
        parEmplacement: parEmplacement.map((l) => ({
          emplacementId: l.emplacementId,
          libelle: l.emplacementId != null ? libellesEmplacements.get(l.emplacementId) ?? null : null,
          quantite: Number(l.quantite),
          quantiteReservee: Number(l.quantiteReservee),
          lotId: l.lotId,
        })),
        unites,
        lots: lotsDuProduit,
      };
    }),

  /**
   * ENREGISTRER UNE LIGNE — immédiatement, pas à la validation.
   *
   * Le comptage se fait sur site, la pièce entre les mains. Si la ligne
   * n'existe que dans le réact, une fermeture d'écran, une perte de
   * réseau, un appel la tue. La ligne est donc écrite AU MOMENT de la
   * saisie ; ressaisir la même clé (produit, emplacement, lot) met à jour
   * la valeur — on corrige un comptage, on n'empile pas.
   */
  enregistrerLigne: requirePermissionProcedure("stock.inventaire")
    .input(z.object({ sessionId: z.number().int(), ligne: ligneRecensement }))
    .mutation(async ({ ctx, input }) => {
      const ligne = input.ligne;
      const session = await sessionDeRecensement(ctx.user.agenceId, input.sessionId);
      const s = session[0];
      if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Session de recensement introuvable." });
      if (s.statut !== "en_cours" && s.statut !== "brouillon") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            `Cette session est « ${s.statut} » : elle a déjà été appliquée. ` +
            `Ouvrez un nouveau recensement pour compter à nouveau.`,
        });
      }

      return db.transaction(async (tx) =>
        inscrireLigne(tx, {
          sessionId: input.sessionId,
          agenceId: ctx.user.agenceId,
          userId: Number(ctx.user.id),
          ligne,
        }),
      ) as any;
    }),

  /**
   * RETIRER UNE LIGNE — une erreur de comptage disparaît de la liste des
   * lignes en attente ; elle ne laisse rien derrière elle.
   */
  retirerLigne: requirePermissionProcedure("stock.inventaire")
    .input(z.object({ ligneId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .select({ id: recensementLignes.id })
        .from(recensementLignes)
        .where(
          and(eq(recensementLignes.id, input.ligneId), eq(recensementLignes.agenceId, ctx.user.agenceId)),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Ligne de recensement introuvable." });
      await db.delete(recensementLignes).where(eq(recensementLignes.id, input.ligneId));
      return { retiré: true };
    }),

  /**
   * CRÉER LA PIÈCE PUIS LA COMPTER — le CAS D'USAGE DU GARAGE.
   *
   * « Est-ce un article que je connais déjà ? » — non. Alors la fiche (article
   * + variante + unité de base + code-barres) naît ICI, le comptage s'écrit
   * aussitôt, et personne n'a comparé deux écrans ni perdu une saisie.
   *
   * Tout CELA dans UNE transaction : si le code-barres est porté par une
   * autre pièce, si la session est fermée, si l'unité est absente, la
   * transaction RETOURNE EN ARRIÈRE — jamais une fiche orpheline.
   */
  creerPieceEtCompter: requirePermissionProcedure("stock.modifier")
    .input(z.object({
      sessionId: z.number().int().optional(),
      titre: z.string().min(2).max(200),
      typeProduit: z.enum([
        "PIECE", "CONSOMMABLE", "OUTIL", "EQUIPEMENT",
        "SERVICE", "FOURNITURE", "KIT",
      ]).default("PIECE"),
      quantite: z.number().min(0).default(0),
      emplacementId: z.number().int().nullish(),
      lotId: z.number().int().nullish(),
      uniteBaseId: z.string().uuid().optional(),
      /* Identification complète (mode « complet » du panneau — facultatif) */
      codeBarre: z.string().max(64).nullish(),
      prixAchat: z.number().min(0).nullish(),
      note: z.string().max(500).nullish(),
      marque: z.string().max(120).nullish(),
      refOem: z.string().max(80).nullish(),
      referenceFabricant: z.string().max(80).nullish(),
      /* Classification et champs pilotés par la famille (ontologie) */
      categorieId: z.number().int().nullish(),
      attributs: z.array(z.object({
        cle: z.string().min(1).max(100),
        valeur: z.string().max(500).optional(),
        unite: z.string().max(40).optional(),
        typeAttribut: z.string().max(30).optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        precision: z.number().optional(),
        liste: z.array(z.string()).optional(),
        uniteId: z.string().uuid().optional(),
        aide: z.string().optional(),
      })).optional(),
      /* Photo au moment de l'enregistrement (≤ 3, URL courte — jamais un data URL). */
      photos: z.array(z.string().max(500)).max(3).optional(),
      accepterDoublon: z.boolean().optional(),
      motifReemploi: z.string().max(500).nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        // ── 1. Session — si l'on est en session, elle doit être ouverte ──
        if (input.sessionId != null) {
          const session = await tx
            .select({ statut: inventairesSessions.statut })
            .from(inventairesSessions)
            .where(and(
              eq(inventairesSessions.id, input.sessionId),
              eq(inventairesSessions.agenceId, ctx.user.agenceId),
            ))
            .limit(1);
          const s = session[0];
          if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Session de recensement introuvable." });
          if (s.statut !== "en_cours" && s.statut !== "brouillon") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                `Cette session est « ${s.statut} » : elle a déjà été appliquée. ` +
                `Ouvrez un nouveau recensement pour compter à nouveau.`,
            });
          }
        }

        // ── 2. Garde anti-doublons — AVANT TOUTE ÉCRITURE ────────────────
        await exigerPasDeDoublon(
          tx,
          {
            titre: input.titre,
            designationCourte: input.titre,
            marque: input.marque ?? undefined,
            referencePrincipale: undefined,
            referenceFabricant: input.referenceFabricant ?? undefined,
            refOem: input.refOem ?? undefined,
            codeArticle: undefined,
            codeBarre: input.codeBarre ?? undefined,
            referenceFournisseur: undefined,
          },
          {
            accepterDoublon: input.accepterDoublon,
            motifReemploi: input.motifReemploi ?? undefined,
          },
        );

        // ── 3. Unité de base — OBLIGATOIRE dès qu'il y a du stock ────────
        const existeUnite = input.uniteBaseId
          ? (await tx.select({ id: unitesMesure.id }).from(unitesMesure).where(eq(unitesMesure.id, input.uniteBaseId)).limit(1))[0]
          : undefined;
        const idUniteBase = existeUnite?.id ?? await garantirUnitePCE(tx);
        if ((input.quantite ?? 0) > 0 && input.typeProduit !== "SERVICE" && !idUniteBase) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "L'unité de base est obligatoire pour compter une quantité — aucune unité n'est disponible.",
          });
        }

        // ── 4. Article ───────────────────────────────────────────────────
        const [article] = await tx
          .insert(produitArticles)
          .values({
            code: `ART-${Date.now().toString(36)}-${Math.floor(Math.random() * 900 + 100)}`,
            designation: input.titre.trim(),
            designationCourte: input.titre.trim().slice(0, 80),
            typeProduit: input.typeProduit,
            categorieId: input.categorieId ?? null,
            etatProduitDefaut: "NEUF",
            origineProduitDefaut: "AFTERMARKET",
          } as any)
          .returning({ id: produitArticles.id });

        // ── 5. Variante — une seule, la pièce comme elle est ─────────────
        const variante = await creerVariante(
          tx,
          { id: article.id, typeProduit: input.typeProduit },
          {
            titre: input.titre.trim(),
            designationCourte: input.titre.trim().slice(0, 80),
            marque: input.marque ?? undefined,
            refOem: input.refOem ?? undefined,
            referenceFabricant: input.referenceFabricant ?? undefined,
            codeBarre: input.codeBarre ?? undefined,
            prixAchat: input.prixAchat ?? undefined,
            /* Champs pilotés par la famille — l'ontologie décide, ici on
               écrit ce qu'on a reçu : la validation du type vit dans le
               garde formulaire du panneau. */
            attributs: input.attributs,
            // du stock exige l'unité en place ; un SERVICE n'en a pas
            unites: input.typeProduit !== "SERVICE" && idUniteBase
              ? [{
                  uniteId: idUniteBase,
                  facteurVersBase: 1,
                  estUniteBase: true,
                  estUniteAchatDefaut: true,
                  estUniteVenteDefaut: true,
                }]
              : [],
            fournisseurs: [],
          } as any,
          ctx.user.agenceId,
          Number(ctx.user.id),
        );

        // ── 6. Unité de base portée par le produit lui-même ──────────────
        if (idUniteBase && input.typeProduit !== "SERVICE") {
          await tx
            .update(produits)
            .set({ uniteBaseId: idUniteBase } as any)
            .where(eq(produits.id, variante));
        }
        // Photos prises au moment du recensement — une pièce rognée sans
        // image est une pièce que le prochain ne reconnaîtra pas.
        if (input.photos?.length) {
          await tx
            .update(produits)
            .set({ photos: input.photos, imageUrl: input.photos[0] } as any)
            .where(eq(produits.id, variante));
        }

        // ── 7. Code-barres témoin (croisé) — la pièce porte le code Et la table en reste ──
        if (input.codeBarre) {
          await tx
            .insert(codesBarres)
            .values({
              produitId: variante,
              type: detectBarcodeType(input.codeBarre),
              valeur: input.codeBarre,
              estDefaut: true,
            } as any)
            .onConflictDoNothing();
        }

        // ── 8. Stock initial — par le MOTEUR jamais une écriture directe ──
        if ((input.quantite ?? 0) > 0 && input.typeProduit !== "SERVICE") {
          await enregistrerMouvement(tx as any, {
            type: TYPES_MOUVEMENT.INITIAL_RECEIPT as any,
            sens: "E",
            produitId: variante,
            agenceId: ctx.user.agenceId,
            quantite: input.quantite,
            emplacementId: input.emplacementId ?? undefined,
            lotId: input.lotId ?? undefined,
            uniteId: idUniteBase ?? undefined,
            coutUnitaireBase: input.prixAchat ?? undefined,
            reference: `RECENS-INIT-${variante}`,
            referenceType: "RECENSEMENT",
            documentLie: input.sessionId != null ? `RECENS-${input.sessionId}` : undefined,
            motif: `Création de pièce au recensement — ${input.titre.trim()}`,
            effectuePar: Number(ctx.user.id),
          });
        }

        // ── 9. Ligne de comptage dans la session en cours ────────────────
        let ligneId: number | null = null;
        if (input.sessionId != null && (input.quantite ?? 0) > 0) {
          const ligne = await inscrireLigne(tx, {
            sessionId: input.sessionId,
            agenceId: ctx.user.agenceId,
            userId: Number(ctx.user.id),
            ligne: {
              produitId: variante,
              emplacementId: input.emplacementId ?? null,
              lotId: input.lotId ?? null,
              quantite: input.quantite,
              uniteId: idUniteBase ?? null,
              prixAchat: input.prixAchat ?? null,
              note: input.note ?? null,
            },
          });
          ligneId = Number(ligne.ligneId);
        }

        return {
          articleId: article.id,
          produitId: variante,
          codeBarre: input.codeBarre ?? null,
          sessionId: input.sessionId ?? null,
          ligneId,
        };
      }) as any;
    }),

  /**
   * PRÉVISUALISATION — aucun écrit, aucun effet.
   *
   * Renvoie pour chaque ligne le théorique réellement connu, l'écart, et ce
   * que la validation FERAIT. Le magasinier tranche en connaissance de cause,
   * et non après coup.
   */
  previsualiser: requirePermissionProcedure("stock.consulter")
    .input(z.object({ lignes: z.array(ligneRecensement).min(1).max(500) }))
    .query(async ({ ctx, input }) => {
      const ids = [...new Set(input.lignes.map((l) => l.produitId))];

      // Le théorique vient de la VUE et se ventile par emplacement. Jamais
      // d'un `.limit(1)` : c'est exactement le défaut que la vue remplace.
      const agregats = ((await db.execute(sql`
            SELECT produit_id, quantite, disponible, nb_lignes, nb_emplacements
              FROM stock_agregat
             WHERE agence_id = ${ctx.user.agenceId}
               AND produit_id IN (${sql.join(ids, sql`, `)})
           `)) as unknown as {
        produit_id: number;
        quantite: string;
        disponible: string;
        nb_lignes: number;
        nb_emplacements: number;
      }[]);

      const parEmplacement = ((await db
        .select({
          produitId: stocks.produitId,
          emplacementId: stocks.emplacementId,
          quantite: stocks.quantite,
        })
        .from(stocks)
        .where(
          and(
            eq(stocks.agenceId, ctx.user.agenceId),
            inArray(stocks.produitId, ids),
          ),
        )) as unknown as {
        produitId: number;
        emplacementId: number | null;
        quantite: string;
      }[]);

      const indexAgregat = new Map(agregats.map((a) => [a.produit_id, a]));
      const stockParCle = new Map<string, number>();
      for (const l of parEmplacement) {
        const cle = `${l.produitId}:${l.emplacementId ?? "GLOBAL"}`;
        stockParCle.set(cle, (stockParCle.get(cle) ?? 0) + Number(l.quantite));
      }

      const lignes = input.lignes.map((l) => {
        const cle = `${l.produitId}:${l.emplacementId ?? "GLOBAL"}`;
        const theoLieu = stockParCle.get(cle) ?? 0;
        const a = indexAgregat.get(l.produitId);
        const theoTotal = a ? Number(a.quantite) : 0;

        // Deux écarts distincts, et les confondre est la première cause
        // d'un inventaire faux :
        //  · l'écart au LIEU   — ce qui manque ici, ce qui est en trop là ;
        //  · l'écart au TOTAL  — ce que le stock sait, contre le comptage.
        const ecartLieu = l.quantite - theoLieu;
        const ecartTotal = l.quantite - theoTotal;

        return {
          produitId: l.produitId,
          emplacementId: l.emplacementId ?? null,
          lotId: l.lotId ?? null,
          quantiteComptee: l.quantite,
          quantiteTheoriqueLieu: theoLieu,
          quantiteTheoriqueTotal: theoTotal,
          ecartLieu,
          ecartTotal,
          /** Vrai quand le stock existe déjà : on ne crée pas, on corrige. */
          stockDejaConnu: theoTotal > 0,
          nbEmplacementsConnus: a?.nb_emplacements ?? 0,
          // Une pièce comptée hors de tout emplacement alors que le stock en
          // connaît plusieurs : le lieu est vraisemblablement faux.
          emplacementSuspect:
            l.emplacementId != null && theoLieu === 0 && (a?.nb_emplacements ?? 0) > 0,
        };
      });

      return {
        lignes,
        totaux: {
          articles: new Set(input.lignes.map((l) => l.produitId)).size,
          quantiteComptee: lignes.reduce((s, l) => s + l.quantiteComptee, 0),
          ecarts: lignes.filter((l) => l.ecartTotal !== 0).length,
          lignesSuspectes: lignes.filter((l) => l.emplacementSuspect).length,
        },
      };
    }),

  /**
   * VALIDATION — écrit, trace, et refuse de s'appliquer deux fois.
   *
   * Chaque ligne produit une ligne de comptage dans la session ET, si l'écart
   * est non nul, un mouvement d'ajustement par le MOTEUR — jamais une
   * écriture directe de `stocks.quantite`. C'est la règle 3 du cadrage.
   */
  valider: requirePermissionProcedure("stock.inventaire")
    .input(z.object({
      sessionId: z.number().int(),
      mode: z.enum(["ajuster", "constater"]).default("ajuster"),
      lignes: z.array(ligneRecensement).min(1).max(500),
      notes: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await db
        .select({
          id: inventairesSessions.id,
          statut: inventairesSessions.statut,
          libelle: inventairesSessions.libelle,
          dateDebut: inventairesSessions.dateDebut,
        })
        .from(inventairesSessions)
        .where(eq(inventairesSessions.id, input.sessionId))
        .limit(1);

      const s = session[0];
      if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Session de recensement introuvable." });
      if (s.statut !== "en_cours" && s.statut !== "brouillon") {
        // Rejouer une session validée appliquerait DEUXIÈME fois les mêmes
        // écarts : le stock s'éloignerait du réel à chaque rejeu. On refuse,
        // et on dit quoi faire à la place.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            `Cette session est « ${s.statut} » : elle a déjà été appliquée. ` +
            `Relancez un nouveau recensement pour compter à nouveau.`,
        });
      }

      return db.transaction(async (tx) => {
        const groupeOperationId = crypto.randomUUID();
        const produitIds = [...new Set(input.lignes.map((l) => l.produitId))];

        const agregats = ((await tx.execute(sql`
              SELECT produit_id, quantite
                FROM stock_agregat
               WHERE agence_id = ${ctx.user.agenceId}
                 AND produit_id IN (${sql.join(produitIds, sql`, `)})
             `)) as unknown as { produit_id: number; quantite: string }[]);
        const indexAgregat = new Map(agregats.map((a) => [a.produit_id, Number(a.quantite)]));

        let ecroutes = 0;
        let sansEcart = 0;

        for (const l of input.lignes) {
          const theoTotal = indexAgregat.get(l.produitId) ?? 0;
          const ecart = l.quantite - theoTotal;

          await tx.insert(inventaires).values({
            sessionId: input.sessionId,
            produitId: l.produitId,
            agenceId: ctx.user.agenceId,
            emplacementId: l.emplacementId ?? null,
            lotId: l.lotId ?? null,
            uniteId: l.uniteId ?? null,
            quantiteTheorique: String(theoTotal),
            quantiteReelle: String(l.quantite),
            ecart: String(ecart),
            commentaire: l.note ?? "Recensement",
            effectuePar: Number(ctx.user.id),
          } as any);

          if (ecart === 0) {
            sansEcart++;
            continue;
          }
          if (input.mode === "constater") {
            // On enregistre l'observation sans toucher au stock : utile
            // quand on veut la liste des écarts avant de décider.
            continue;
          }

          await enregistrerMouvement(tx as any, {
            type:
              ecart > 0
                ? (TYPES_MOUVEMENT.AJUSTEMENT_INVENTAIRE_POSITIF as any)
                : (TYPES_MOUVEMENT.AJUSTEMENT_INVENTAIRE_NEGATIF as any),
            sens: ecart > 0 ? "E" : "S",
            produitId: l.produitId,
            agenceId: ctx.user.agenceId,
            quantite: Math.abs(ecart),
            emplacementId: l.emplacementId ?? null,
            lotId: l.lotId ?? null,
            uniteId: l.uniteId ?? undefined,
            coutUnitaireBase: l.prixAchat ?? undefined,
            groupeOperationId,
            reference: `RECENS-${input.sessionId}`,
            referenceType: "INVENTAIRE",
            documentLie: `RECENS-${input.sessionId}`,
            motif:
              `Recensement ${s.libelle ?? input.sessionId} (ecart ${ecart > 0 ? "+" : ""}${ecart})` +
              (l.note ? ` — ${l.note}` : ""),
            effectuePar: Number(ctx.user.id),
          });
          ecroutes++;
        }

        if (input.mode === "ajuster") {
          await tx
            .update(inventairesSessions)
            .set({
              statut: "valide",
              validePar: ctx.user.id,
              dateFin: new Date(),
              notes: input.notes ?? null,
            } as any)
            .where(eq(inventairesSessions.id, input.sessionId));
        }

        // Les lignes en attente sont consumées : elles ont migré dans
        // `inventaires`. Relire la session les rend une et une seule fois —
        // sinon chaque reprise doublerait le comptage.
        await tx.delete(recensementLignes).where(eq(recensementLignes.sessionId, input.sessionId));

        return {
          sessionId: input.sessionId,
          lignesEnregistrees: input.lignes.length,
          ecroutes,
          sansEcart,
          mode: input.mode,
        };
      }) as any;
    }),

  /**
   * OUVRIR UNE SESSION DE RECENSEMENT.
   *
   * Séparée de la validation pour que le magasinier puisse compter par
   * vaguely — rayon par rayon, étagère par étagère — sans créer une session
   * par aller-retour. Une session longue reste réversible tant qu'elle n'est
   * pas validée.
   */
  ouvrirSession: requirePermissionProcedure("stock.inventaire")
    .input(z.object({ libelle: z.string().min(1).max(255).default("Recensement") }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await tx_insertSession(ctx.user.agenceId, input.libelle, Number(ctx.user.id));
      // Forme stable et explicite : l'appelant ne devine pas si la session
      // s'appelle `id` ou `sessionId`. Le nom de la clé dit ce qu'il désigne.
      return {
        sessionId: row.id,
        libelle: row.libelle,
        statut: row.statut,
        dateDebut: row.dateDebut,
      };
    }),

  /** Les sessions ouvertes — pour reprendre un recensement laissé en cours. */
  sessions: requirePermissionProcedure("stock.consulter")
    .query(async ({ ctx }) => {
      return db
        .select({
          id: inventairesSessions.id,
          libelle: inventairesSessions.libelle,
          statut: inventairesSessions.statut,
          dateDebut: inventairesSessions.dateDebut,
          dateFin: inventairesSessions.dateFin,
        })
        .from(inventairesSessions)
        .where(eq(inventairesSessions.agenceId, ctx.user.agenceId))
        .orderBy(sql`${inventairesSessions.dateDebut} DESC`)
        .limit(30);
    }),

  /**
   * Lignes déjà comptées d'une session — pour reprendre sans ressaisir.
   *
   * Deux familles, une seule liste :
   *  · en ATTENTE (recensement_lignes) — ce qui a été compté et pas encore
   *    appliqué : c'est ce qui fait la reprise réelle d'une session en
   *    cours ;
   *  · APPLIQUÉES (inventaires) — ce que la session a déjà consommé ;
   *    les garder visibles évite de recompter (ou de recouvrir) à l'aveugle.
   *
   * Chaque ligne finit exactement une fois : à la validation, l'attente
   * migre dans les appliquées, jamais dans les deux.
   */
  lignesSession: requirePermissionProcedure("stock.consulter")
    .input(z.object({ sessionId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const enAttente = ((await db
        .select({
          id: recensementLignes.id,
          produitId: recensementLignes.produitId,
          titre: produits.titre,
          emplacementId: recensementLignes.emplacementId,
          lotId: recensementLignes.lotId,
          uniteId: recensementLignes.uniteId,
          quantiteReelle: recensementLignes.quantite,
          prixAchat: recensementLignes.prixAchat,
          note: recensementLignes.note,
        })
        .from(recensementLignes)
        .innerJoin(produits, eq(recensementLignes.produitId, produits.id))
        .where(
          and(
            eq(recensementLignes.sessionId, input.sessionId),
            eq(recensementLignes.agenceId, ctx.user.agenceId),
          ),
        )
        .orderBy(sql`${recensementLignes.id} ASC`)) as unknown as []) as {
        id: number;
        produitId: number;
        titre: string;
        emplacementId: number | null;
        lotId: number | null;
        uniteId: string | null;
        quantiteReelle: string;
        prixAchat: string | null;
        note: string | null;
      }[];

      const appliquees = ((await db
        .select({
          id: inventaires.id,
          produitId: inventaires.produitId,
          titre: produits.titre,
          emplacementId: inventaires.emplacementId,
          lotId: inventaires.lotId,
          uniteId: inventaires.uniteId,
          quantiteReelle: inventaires.quantiteReelle,
          prixAchat: sql<string | null>`NULL`,
          note: inventaires.commentaire,
          quantiteTheorique: inventaires.quantiteTheorique,
          ecart: inventaires.ecart,
        })
        .from(inventaires)
        .innerJoin(produits, eq(inventaires.produitId, produits.id))
        .where(
          and(
            eq(inventaires.sessionId, input.sessionId),
            eq(inventaires.agenceId, ctx.user.agenceId),
          ),
        )
        .orderBy(sql`${inventaires.id} ASC`)) as unknown as []) as unknown as {
        id: number;
        produitId: number;
        titre: string;
        emplacementId: number | null;
        lotId: number | null;
        uniteId: string | null;
        quantiteReelle: string;
        prixAchat: string | null;
        note: string | null;
        quantiteTheorique: string;
        ecart: string;
      }[];

      return [
        ...enAttente.map((l) => ({ ...l, appliquee: false, ecart: null, quantiteTheorique: null })),
        ...appliquees.map((l) => ({ ...l, appliquee: true })),
      ];
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Aides
// ─────────────────────────────────────────────────────────────────────────────

function sessionDeRecensement(agenceId: number, sessionId: number) {
  return db
    .select({
      id: inventairesSessions.id,
      statut: inventairesSessions.statut,
      libelle: inventairesSessions.libelle,
      dateDebut: inventairesSessions.dateDebut,
    })
    .from(inventairesSessions)
    .where(and(eq(inventairesSessions.id, sessionId), eq(inventairesSessions.agenceId, agenceId)))
    .limit(1);
}

/**
 * La clé logique d'une ligne : (produit, emplacement, lot). Ressaisir cette
 * clé met à jour le comptage — on corrige, on n'empile pas. Les	NULL sont
 * traités explicitement car PG les considère distincts dans un index unique.
 */
function cleLigne(
  sessionId: number,
  agenceId: number,
  ligne: { produitId?: number | null; emplacementId?: number | null; lotId?: number | null },
) {
  if (ligne.produitId == null) throw new TRPCError({ code: "BAD_REQUEST", message: "produitId requis." });
  return and(
    eq(recensementLignes.sessionId, sessionId),
    eq(recensementLignes.agenceId, agenceId),
    eq(recensementLignes.produitId, ligne.produitId),
    ligne.emplacementId != null
      ? eq(recensementLignes.emplacementId, ligne.emplacementId)
      : isNull(recensementLignes.emplacementId),
    ligne.lotId != null
      ? eq(recensementLignes.lotId, ligne.lotId)
      : isNull(recensementLignes.lotId),
  );
}

async function tx_insertSession(agenceId: number, libelle: string, userId: number) {
  return db
    .insert(inventairesSessions)
    .values({
      agenceId,
      libelle,
      statut: "en_cours",
      effectuePar: userId,
      notes: "Recensement — premier relevé physique",
    } as any)
    .returning();
}

async function chargerLibellesEmplacements(
  ids: number[],
  agenceId: number,
): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: emplacements.id, code: emplacements.code, libelle: emplacements.libelle })
    .from(emplacements)
    .where(and(eq(emplacements.agenceId, agenceId), inArray(emplacements.id, ids)));
  return new Map(
    rows.map((r) => [r.id, r.libelle ? `${r.libelle} (${r.code})` : r.code]),
  );
}

// La recherche tolérante et le garde-fou anti-doublon vivent dans
// `~/server/lib/recherche-articles`, partagés avec la réception (M3).
// Voir ce service pour le détail des mots vides et du score de similarité.

/**
 * Insère (ou met à jour) une ligne de comptage PENDANT une session — clé
 * logique (produit, emplacement, lot), ressaisir corrige, n'empile pas.
 * Utilisé par `enregistrerLigne` et par `creerPieceEtCompter` : la ligne
 * d'aujourd'hui ne peut pas diverger de celle de demain.
 */
async function inscrireLigne(
  tx: any,
  p: {
    sessionId: number;
    agenceId: number;
    userId: number;
    ligne: z.infer<typeof ligneRecensement>;
  },
): Promise<{ ligneId: number; totalLignes: number }> {
  const { sessionId, agenceId, userId, ligne } = p;

  const existante = await tx
    .select({ id: recensementLignes.id })
    .from(recensementLignes)
    .where(cleLigne(sessionId, agenceId, ligne))
    .limit(1);

  const valeurs = {
    quantite: String(ligne.quantite),
    uniteId: ligne.uniteId ?? null,
    prixAchat: ligne.prixAchat != null ? String(ligne.prixAchat) : null,
    note: ligne.note ?? null,
    creePar: userId,
  } as const;

  const [row] = existante.length
    ? await tx
        .update(recensementLignes)
        .set(valeurs)
        .where(eq(recensementLignes.id, existante[0]!.id))
        .returning({ id: recensementLignes.id })
    : await tx
        .insert(recensementLignes)
        .values({
          sessionId,
          produitId: ligne.produitId,
          agenceId,
          emplacementId: ligne.emplacementId ?? null,
          lotId: ligne.lotId ?? null,
          ...valeurs,
        } as any)
        .returning({ id: recensementLignes.id });

  const [total] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(recensementLignes)
    .where(eq(recensementLignes.sessionId, sessionId));
  return { ligneId: Number(row!.id), totalLignes: Number(total!.n) };
}

/**
 * L'unité PCE (« pièce ») — la base universelle du décompte morcelé. Si la
 * base attend encore sa création, elle nasît ici, idempotente :
 * `onConflictDoNothing` sur le code unique + relecture.
 */
async function garantirUnitePCE(tx: any): Promise<string> {
  const deja = await tx
    .select({ id: unitesMesure.id })
    .from(unitesMesure)
    .where(eq(unitesMesure.code, "PCE"))
    .limit(1);
  if (deja[0]) return deja[0].id;
  await tx
    .insert(unitesMesure)
    .values({ code: "PCE", libelle: "Pièce", symbole: "pce", type: "QUANTITE" } as any)
    .onConflictDoNothing();
  const [creee] = await tx
    .select({ id: unitesMesure.id })
    .from(unitesMesure)
    .where(eq(unitesMesure.code, "PCE"))
    .limit(1);
  if (!creee) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unité PCE non créable." });
  return creee.id;
}