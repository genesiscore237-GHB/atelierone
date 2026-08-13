import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db, unitesMesure, fournisseurs } from "@atelierone/db";
import { eq, and } from "drizzle-orm";

/**
 * Référentiel minimal : unités de mesure et fournisseurs (selects de formulaire).
 */
export const referenceRouter = createTRPCRouter({
  listUnitesMesure: protectedProcedure.query(async () => {
    return db.select({ id: unitesMesure.id, code: unitesMesure.code, libelle: unitesMesure.libelle, symbole: unitesMesure.symbole })
      .from(unitesMesure)
      .where(eq(unitesMesure.isActive, true))
      .orderBy(unitesMesure.libelle);
  }),

  listFournisseurs: protectedProcedure.query(async () => {
    return db.select({ id: fournisseurs.id, nom: fournisseurs.nom, code: fournisseurs.code })
      .from(fournisseurs)
      .where(and(eq(fournisseurs.isActive, true)))
      .orderBy(fournisseurs.nom);
  }),
});
