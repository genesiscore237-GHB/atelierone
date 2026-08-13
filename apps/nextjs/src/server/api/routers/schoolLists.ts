import { z } from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "~/server/api/trpc";
import { db, listesScolaires, listeScolaireItems, produits } from "@atelierone/db";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const schoolListsRouter = createTRPCRouter({
  list: protectedProcedure.query(async () => {
    return db.select()
      .from(listesScolaires)
      .where(eq(listesScolaires.isActive, true))
      .orderBy(desc(listesScolaires.createdAt));
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const [liste] = await db.select()
        .from(listesScolaires)
        .where(eq(listesScolaires.id, input.id))
        .limit(1);
      if (!liste) throw new TRPCError({ code: "NOT_FOUND" });
      const items = await db.select({
        id: listeScolaireItems.id,
        produitId: listeScolaireItems.produitId,
        quantiteRequise: listeScolaireItems.quantiteRequise,
        priorite: listeScolaireItems.priorite,
        produit: {
          id: produits.id,
          titre: produits.titre,
          auteur: produits.auteur,
          prixVente: produits.prixVente,
          codeBarre: produits.codeBarre,
        },
      })
        .from(listeScolaireItems)
        .innerJoin(produits, eq(listeScolaireItems.produitId, produits.id))
        .where(eq(listeScolaireItems.listeId, input.id));
      return { ...liste, items };
    }),

  getItems: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .query(async ({ input }) => {
      return db.select({
        id: listeScolaireItems.id,
        produitId: listeScolaireItems.produitId,
        quantiteRequise: listeScolaireItems.quantiteRequise,
        priorite: listeScolaireItems.priorite,
        produit: {
          id: produits.id,
          titre: produits.titre,
          auteur: produits.auteur,
          prixVente: produits.prixVente,
        },
      })
        .from(listeScolaireItems)
        .innerJoin(produits, eq(listeScolaireItems.produitId, produits.id))
        .where(eq(listeScolaireItems.listeId, input.listId));
    }),

  create: adminProcedure
    .input(z.object({
      nom: z.string().min(1),
      anneeScolaire: z.string().optional(),
      ministere: z.enum(["MINESEC", "MINEDUB"]).optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [liste] = await db.insert(listesScolaires).values({
        nom: input.nom,
        anneeScolaire: input.anneeScolaire || "2026-2027",
        ministere: input.ministere || "MINESEC",
        description: input.description || null,
        agenceId: ctx.user.agenceId,
      }).returning() as any;
      return { id: String(liste.id), ...liste };
    }) as any,

  addItem: adminProcedure
    .input(z.object({
      listId: z.string(),
      produitId: z.string(),
      quantiteRequise: z.number().int().min(1).default(1),
      priorite: z.enum(["obligatoire", "suggere"]).default("obligatoire"),
    }))
    .mutation(async ({ input }) => {
      const [item] = await db.insert(listeScolaireItems).values({
        listeId: input.listId,
        produitId: input.produitId,
        quantiteRequise: input.quantiteRequise,
        priorite: input.priorite,
      }).returning() as any;
      return { id: String(item.id), ...item };
    }) as any,

  removeItem: adminProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ input }) => {
      await db.delete(listeScolaireItems).where(eq(listeScolaireItems.id, input.itemId));
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.delete(listeScolaireItems).where(eq(listeScolaireItems.listeId, input.id));
      await db.delete(listesScolaires).where(eq(listesScolaires.id, input.id));
      return { success: true };
    }),

  bulkImport: adminProcedure
    .input(z.object({
      items: z.array(z.object({
        titre: z.string().min(1),
        auteur: z.string().optional(),
        editeur: z.string().optional(),
        niveauScolaire: z.string().optional(),
        matiere: z.string().optional(),
        prixVente: z.string().min(1),
        priorite: z.enum(["obligatoire", "suggere"]).default("obligatoire"),
      })).min(1).max(1000),
      nomListe: z.string().min(1),
      anneeScolaire: z.string().default("2026-2027"),
      ministere: z.enum(["MINESEC", "MINEDUB"]).default("MINESEC"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { ensureBarcodeSequence, generateBarcode } = await import("@atelierone/db/utils");
      await ensureBarcodeSequence();

      const [liste] = await db.insert(listesScolaires).values({
        nom: input.nomListe,
        anneeScolaire: input.anneeScolaire,
        ministere: input.ministere,
        agenceId: ctx.user.agenceId,
      }).returning() as any;

      let created = 0;
      let skipped = 0;

      for (const item of input.items) {
        try {
          const [existing] = await db.select()
            .from(produits)
            .where(eq(produits.titre, item.titre))
            .limit(1);

          let prodId: number;
          if (existing) {
            prodId = existing.id;
          } else {
            const barcode = await generateBarcode();
            const [prod] = await db.insert(produits).values({
              titre: item.titre,
              auteur: item.auteur ?? null,
              editeur: item.editeur ?? null,
              niveauScolaire: item.niveauScolaire ?? null,
              matiere: item.matiere ?? null,
              prixVente: item.prixVente,
              codeBarre: barcode,
              statut: "actif",
              typeProduit: "MANUEL",
            }).returning() as any;
            prodId = prod.id;
          }

          await db.insert(listeScolaireItems).values({
            listeId: liste.id,
            produitId: prodId,
            priorite: item.priorite,
            quantiteRequise: 1,
          } as any);

          created++;
        } catch {
          skipped++;
        }
      }

      return { success: true, created, skipped, total: input.items.length };
    }) as any,
});
