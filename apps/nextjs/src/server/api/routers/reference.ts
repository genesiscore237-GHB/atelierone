import { z } from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "~/server/api/trpc";
import {
  db,
  sousSystemes, niveaux, filieres, classes, matieres,
  anneesScolaires, ministeres, unitesMesure, unitesMesureProduits, produitUnites,
  fournisseurs,
} from "@atelierone/db";
import { eq, asc, and, ilike, or } from "drizzle-orm";

export const referenceRouter = createTRPCRouter({
  search: protectedProcedure
    .input(z.object({
      type: z.enum(["niveaux", "classes", "filieres", "matieres", "ministeres", "unitesMesure", "sousSystemes"]),
      query: z.string().min(1),
      limit: z.number().default(10),
    }))
    .query(async ({ input }) => {
      const { type, query, limit } = input;
      const pattern = `%${query}%`;
      switch (type) {
        case "niveaux":
          return db.select().from(niveaux)
            .where(or(ilike(niveaux.libelle, pattern), ilike(niveaux.code, pattern)))
            .limit(limit);
        case "classes":
          return db.select().from(classes)
            .where(or(ilike(classes.libelle, pattern), ilike(classes.code, pattern)))
            .limit(limit);
        case "filieres":
          return db.select().from(filieres)
            .where(or(ilike(filieres.libelle, pattern), ilike(filieres.code, pattern)))
            .limit(limit);
        case "matieres":
          return db.select().from(matieres)
            .where(or(ilike(matieres.libelle, pattern), ilike(matieres.code, pattern)))
            .limit(limit);
        case "ministeres":
          return db.select().from(ministeres)
            .where(or(ilike(ministeres.libelle, pattern), ilike(ministeres.code, pattern)))
            .limit(limit);
        case "unitesMesure":
          return db.select().from(unitesMesure)
            .where(or(ilike(unitesMesure.libelle, pattern), ilike(unitesMesure.code, pattern)))
            .limit(limit);
        case "sousSystemes":
          return db.select().from(sousSystemes)
            .where(or(ilike(sousSystemes.libelle, pattern), ilike(sousSystemes.code, pattern)))
            .limit(limit);
      }
    }),
  listSousSystemes: protectedProcedure.query(async () => {
    return db.select().from(sousSystemes).where(eq(sousSystemes.isActive, true)).orderBy(asc(sousSystemes.code));
  }),

  listNiveaux: protectedProcedure
    .input(z.object({ sousSystemeId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      if (input?.sousSystemeId) {
        return db.select().from(niveaux)
          .where(and(eq(niveaux.isActive, true), eq(niveaux.sousSystemeId, input.sousSystemeId)))
          .orderBy(asc(niveaux.ordre));
      }
      return db.select().from(niveaux).where(eq(niveaux.isActive, true)).orderBy(asc(niveaux.ordre));
    }),

  listFilieres: protectedProcedure.query(async () => {
    return db.select().from(filieres).where(eq(filieres.isActive, true)).orderBy(asc(filieres.code));
  }),

  listClasses: protectedProcedure
    .input(z.object({ niveauId: z.string().optional(), filiereId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const conditions = [eq(classes.isActive, true)];
      if (input?.niveauId) conditions.push(eq(classes.niveauId, input.niveauId));
      if (input?.filiereId) conditions.push(eq(classes.filiereId, input.filiereId));
      return db.select().from(classes).where(and(...conditions)).orderBy(asc(classes.code));
    }),

  listMatieres: protectedProcedure.query(async () => {
    return db.select().from(matieres).where(eq(matieres.isActive, true)).orderBy(asc(matieres.code));
  }),

  listAnneesScolaires: protectedProcedure.query(async () => {
    return db.select().from(anneesScolaires).orderBy(asc(anneesScolaires.dateDebut));
  }),

  listMinisteres: protectedProcedure.query(async () => {
    return db.select().from(ministeres).where(eq(ministeres.isActive, true)).orderBy(asc(ministeres.code));
  }),

  listFournisseurs: protectedProcedure.query(async () => {
    return db.select().from(fournisseurs).where(eq(fournisseurs.isActive, true)).orderBy(asc(fournisseurs.nom));
  }),

  listUnitesMesure: protectedProcedure.query(async () => {
    return db.select().from(unitesMesure).where(eq(unitesMesure.isActive, true)).orderBy(asc(unitesMesure.code));
  }),

  listUnitesProduit: protectedProcedure
    .input(z.object({ produitId: z.string() }))
    .query(async ({ input }) => {
      const pu = await db.select({
        id: produitUnites.id,
        produitId: produitUnites.produitId,
        uniteId: produitUnites.uniteId,
        facteurVersBase: produitUnites.facteurVersBase,
        prixAchat: produitUnites.prixAchat,
        prixVente: produitUnites.prixVente,
        estUniteBase: produitUnites.estUniteBase,
        estUniteAchatDefaut: produitUnites.estUniteAchatDefaut,
        estUniteVenteDefaut: produitUnites.estUniteVenteDefaut,
        unite: {
          id: unitesMesure.id,
          code: unitesMesure.code,
          libelle: unitesMesure.libelle,
          symbole: unitesMesure.symbole,
        },
      })
        .from(produitUnites)
        .innerJoin(unitesMesure, eq(produitUnites.uniteId, unitesMesure.id))
        .where(and(eq(produitUnites.produitId, Number(input.produitId)), eq(produitUnites.statut, "ACTIF")));

      if (pu.length > 0) {
        return pu.map(u => ({
          id: u.id,
          produitId: u.produitId,
          uniteId: u.uniteId,
          facteurConversion: Number(u.facteurVersBase ?? 1),
          prixAchat: u.prixAchat,
          prixVente: u.prixVente,
          estUniteBase: u.estUniteBase,
          estUniteAchatDefaut: u.estUniteAchatDefaut,
          estUniteVenteDefaut: u.estUniteVenteDefaut,
          unite: u.unite,
        }));
      }

      return db.select({
        id: unitesMesureProduits.id,
        produitId: unitesMesureProduits.produitId,
        uniteId: unitesMesureProduits.uniteId,
        facteurConversion: unitesMesureProduits.facteurConversion,
        prixAchat: unitesMesureProduits.prixAchat,
        prixVente: unitesMesureProduits.prixVente,
        estUniteAchatDefaut: unitesMesureProduits.estUniteAchatDefaut,
        estUniteVenteDefaut: unitesMesureProduits.estUniteVenteDefaut,
        estUniteBase: unitesMesureProduits.estUniteBase,
        unite: {
          id: unitesMesure.id,
          code: unitesMesure.code,
          libelle: unitesMesure.libelle,
          symbole: unitesMesure.symbole,
        },
      })
        .from(unitesMesureProduits)
        .innerJoin(unitesMesure, eq(unitesMesureProduits.uniteId, unitesMesure.id))
        .where(eq(unitesMesureProduits.produitId, Number(input.produitId)));
    }),

  createNiveau: adminProcedure
    .input(z.object({ code: z.string().min(1), libelle: z.string().min(1), ordre: z.number().int().default(0), sousSystemeId: z.string().optional() }))
    .mutation(async ({ input }) => {
      const [existing] = await db.select().from(niveaux).where(eq(niveaux.code, input.code)).limit(1);
      if (existing) return existing;
      const [row] = await db.insert(niveaux).values(input as any).returning();
      return row;
    }),

  createClasse: adminProcedure
    .input(z.object({ code: z.string().min(1), libelle: z.string().min(1), niveauId: z.string(), filiereId: z.string().optional() }))
    .mutation(async ({ input }) => {
      const [existing] = await db.select().from(classes).where(eq(classes.code, input.code)).limit(1);
      if (existing) return existing;
      const [row] = await db.insert(classes).values(input as any).returning();
      return row;
    }),

  createFiliere: adminProcedure
    .input(z.object({ code: z.string().min(1), libelle: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const [existing] = await db.select().from(filieres).where(eq(filieres.code, input.code)).limit(1);
      if (existing) return existing;
      const [row] = await db.insert(filieres).values(input as any).returning();
      return row;
    }),

  createMatiere: adminProcedure
    .input(z.object({ code: z.string().min(1), libelle: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const [existing] = await db.select().from(matieres).where(eq(matieres.code, input.code)).limit(1);
      if (existing) return existing;
      const [row] = await db.insert(matieres).values(input as any).returning();
      return row;
    }),

  createUniteMesure: adminProcedure
    .input(z.object({ code: z.string().min(1), libelle: z.string().min(1), symbole: z.string().optional(), type: z.string().default("QUANTITE") }))
    .mutation(async ({ input }) => {
      const [existing] = await db.select().from(unitesMesure).where(eq(unitesMesure.code, input.code)).limit(1);
      if (existing) return existing;
      const [row] = await db.insert(unitesMesure).values(input as any).returning();
      return row;
    }),

  createMinistere: adminProcedure
    .input(z.object({ code: z.string().min(1), libelle: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const [existing] = await db.select().from(ministeres).where(eq(ministeres.code, input.code)).limit(1);
      if (existing) return existing;
      const [row] = await db.insert(ministeres).values(input as any).returning();
      return row;
    }),

  createSousSysteme: adminProcedure
    .input(z.object({ code: z.string().min(1), libelle: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const [existing] = await db.select().from(sousSystemes).where(eq(sousSystemes.code, input.code)).limit(1);
      if (existing) return existing;
      const [row] = await db.insert(sousSystemes).values(input as any).returning();
      return row;
    }),
});
