import { z } from "zod";
import { createTRPCRouter, financeProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { ventes, ventesLignes, produits, retours, lignesRetour, depenses, pertesFinancieres, remboursementsFournisseurs, dettesFournisseurs, mouvementsCaisse } from "@atelierone/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

const coutLigne = sql`${ventesLignes.quantite} * COALESCE(${ventesLignes.coutUnitaire}, ${produits.prixAchat} * ${ventesLignes.facteurConversion}, 0)`;

export const profitRouter = createTRPCRouter({
  getProfitKpis: financeProcedure
    .input(z.object({
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const filters = [eq(ventes.agenceId, agenceId), eq(ventes.statut, "termine")];
      if (input.dateDebut) filters.push(gte(ventes.createdAt, new Date(input.dateDebut)));
      if (input.dateFin) filters.push(lte(ventes.createdAt, new Date(input.dateFin)));

      const [resume] = await db.select({
        ca: sql<number>`COALESCE(sum(${ventesLignes.totalLigne}), 0)`,
        cout: sql<number>`COALESCE(sum(${coutLigne}), 0)`,
        remises: sql<number>`COALESCE(sum(${ventes.remise}), 0)`,
        nbVentes: sql<number>`count(distinct ${ventes.id})`,
      })
        .from(ventesLignes)
        .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
        .innerJoin(produits, eq(ventesLignes.produitId, produits.id))
        .where(and(...filters));

      const [retoursResume] = await db.select({
        ca: sql<number>`COALESCE(sum(${lignesRetour.totalLigne}), 0)`,
        cout: sql<number>`COALESCE(sum(${lignesRetour.quantite} * COALESCE(${lignesRetour.coutUnitaire}, ${produits.prixAchat} * ${lignesRetour.facteurConversion}, 0)), 0)`,
      })
        .from(lignesRetour)
        .innerJoin(retours, eq(lignesRetour.retourId, retours.id))
        .innerJoin(ventes, eq(retours.venteId, ventes.id))
        .innerJoin(produits, eq(lignesRetour.produitId, produits.id))
        .where(and(
          eq(ventes.agenceId, agenceId),
          input.dateDebut ? gte(ventes.createdAt, new Date(input.dateDebut)) : undefined,
          input.dateFin ? lte(ventes.createdAt, new Date(input.dateFin)) : undefined,
        ));

      // CA encaissé réel = montants reçus (montantPaye) − remboursements de retours
      const [encaisseResume] = await db.select({
        total: sql<number>`COALESCE(sum(${ventes.montantPaye}::numeric), 0)`,
      })
        .from(ventes)
        .where(and(
          eq(ventes.agenceId, agenceId),
          eq(ventes.statut, "termine"),
          input.dateDebut ? gte(ventes.createdAt, new Date(input.dateDebut)) : undefined,
          input.dateFin ? lte(ventes.createdAt, new Date(input.dateFin)) : undefined,
        ));

      const depenseFilters = [eq(depenses.agenceId, agenceId)];
      if (input.dateDebut) depenseFilters.push(gte(depenses.dateDepense, new Date(input.dateDebut)));
      if (input.dateFin) depenseFilters.push(lte(depenses.dateDepense, new Date(input.dateFin)));

      const [depensesResume] = await db.select({
        total: sql<number>`COALESCE(sum(${depenses.montant}::numeric), 0)`,
        count: sql<number>`count(*)`,
      })
        .from(depenses)
        .where(and(...depenseFilters));

      const depensesParCategorie = await db.select({
        categorie: depenses.categorie,
        total: sql<number>`COALESCE(sum(${depenses.montant}::numeric), 0)`,
      })
        .from(depenses)
        .where(and(...depenseFilters))
        .groupBy(depenses.categorie)
        .orderBy(desc(sql`COALESCE(sum(${depenses.montant}::numeric), 0)`));

      const perteFilters = [eq(pertesFinancieres.agenceId, agenceId)];
      if (input.dateDebut) perteFilters.push(gte(pertesFinancieres.datePerte, new Date(input.dateDebut)));
      if (input.dateFin) perteFilters.push(lte(pertesFinancieres.datePerte, new Date(input.dateFin)));

      const [pertesResume] = await db.select({
        total: sql<number>`COALESCE(sum(${pertesFinancieres.montantPerte}::numeric), 0)`,
        count: sql<number>`count(*)`,
      })
        .from(pertesFinancieres)
        .where(and(...perteFilters));

      const pertesParType = await db.select({
        typePerte: pertesFinancieres.typePerte,
        total: sql<number>`COALESCE(sum(${pertesFinancieres.montantPerte}::numeric), 0)`,
      })
        .from(pertesFinancieres)
        .where(and(...perteFilters))
        .groupBy(pertesFinancieres.typePerte)
        .orderBy(desc(sql`COALESCE(sum(${pertesFinancieres.montantPerte}::numeric), 0)`));

      // Écarts de caisse : une ligne perte ECART_CAISSE par session fermée avec écart positif
      // (CaisseService.fermerSession). Ces lignes sont DÉJÀ incluses dans `pertes` →
      // `ecartsCaisse` est exposé pour l'affichage, jamais soustrait une 2ᵉ fois dans beneficeNet.
      const [ecartsResume] = await db.select({
        total: sql<number>`COALESCE(sum(${pertesFinancieres.montantPerte}::numeric), 0)`,
        count: sql<number>`count(*)`,
      })
        .from(pertesFinancieres)
        .where(and(
          eq(pertesFinancieres.agenceId, agenceId),
          eq(pertesFinancieres.typePerte, "ECART_CAISSE"),
          input.dateDebut ? gte(pertesFinancieres.datePerte, new Date(input.dateDebut)) : undefined,
          input.dateFin ? lte(pertesFinancieres.datePerte, new Date(input.dateFin)) : undefined,
        ));

      // Paiements fournisseurs : remboursements de dettes + paiements de factures fournisseur
      const [paiementsFournisseursResume] = await db.select({
        total: sql<number>`COALESCE(sum(${remboursementsFournisseurs.montant}::numeric), 0)`,
      })
        .from(remboursementsFournisseurs)
        .innerJoin(dettesFournisseurs, eq(remboursementsFournisseurs.detteId, dettesFournisseurs.id))
        .where(and(
          eq(dettesFournisseurs.agenceId, agenceId),
          input.dateDebut ? gte(remboursementsFournisseurs.effectueLe, new Date(input.dateDebut)) : undefined,
          input.dateFin ? lte(remboursementsFournisseurs.effectueLe, new Date(input.dateFin)) : undefined,
        ));

      const [paiementsFacturesResume] = await db.select({
        total: sql<number>`COALESCE(sum(${mouvementsCaisse.montant}::numeric), 0)`,
      })
        .from(mouvementsCaisse)
        .where(and(
          eq(mouvementsCaisse.type, "paiement_fournisseur"),
          eq(mouvementsCaisse.entiteType, "FACTURE_FOURNISSEUR"),
          input.dateDebut ? gte(mouvementsCaisse.createdAt, new Date(input.dateDebut)) : undefined,
          input.dateFin ? lte(mouvementsCaisse.createdAt, new Date(input.dateFin)) : undefined,
        ));

      const ca = Number(resume?.ca ?? 0);
      const cout = Number(resume?.cout ?? 0);
      const remises = Number(resume?.remises ?? 0);
      const margeBrute = ca - cout;
      const margeRetours = Number(retoursResume?.ca ?? 0) - Number(retoursResume?.cout ?? 0);
      const margeNet = margeBrute - remises - margeRetours;
      const depensesTotal = Number(depensesResume?.total ?? 0);
      const pertesTotal = Number(pertesResume?.total ?? 0);
      const beneficeNet = margeNet - depensesTotal - pertesTotal;

      // CA encaissé réel et sorties de trésorerie
      const caEncaisse = Math.max(0, Number(encaisseResume?.total ?? 0) - Number(retoursResume?.ca ?? 0));
      const paiementsFournisseurs = Number(paiementsFournisseursResume?.total ?? 0) + Number(paiementsFacturesResume?.total ?? 0);
      const sortiesTotal = paiementsFournisseurs + depensesTotal + pertesTotal;
      const resultatTresorerie = caEncaisse - sortiesTotal;

      return {
        ca,
        caEncaisse,
        cout,
        remises,
        margeBrute,
        margeRetours,
        margeNet,
        depenses: depensesTotal,
        depensesCount: Number(depensesResume?.count ?? 0),
        depensesParCategorie: depensesParCategorie.map((r) => ({ categorie: r.categorie, total: Number(r.total ?? 0) })),
        pertes: pertesTotal,
        pertesCount: Number(pertesResume?.count ?? 0),
        pertesParType: pertesParType.map((r) => ({ typePerte: r.typePerte, total: Number(r.total ?? 0) })),
        ecartsCaisse: Number(ecartsResume?.total ?? 0),
        ecartsCaisseCount: Number(ecartsResume?.count ?? 0),
        beneficeNet,
        tauxBenefice: ca > 0 ? (beneficeNet / ca) * 100 : 0,
        nbVentes: Number(resume?.nbVentes ?? 0),
        // Trésorerie : paiements fournisseurs (dettes + factures), sorties totales, résultat cash
        paiementsFournisseurs,
        sortiesTotal,
        resultatTresorerie,
      };
    }),

  getProfitSeries: financeProcedure
    .input(z.object({
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;

      const margeRows = await db.select({
        periode: sql<string>`to_char(${ventes.createdAt}, 'YYYY-MM')`,
        ca: sql<number>`COALESCE(sum(${ventesLignes.totalLigne}), 0)`,
        cout: sql<number>`COALESCE(sum(${coutLigne}), 0)`,
      })
        .from(ventesLignes)
        .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
        .innerJoin(produits, eq(ventesLignes.produitId, produits.id))
        .where(and(
          eq(ventes.agenceId, agenceId),
          eq(ventes.statut, "termine"),
          input.dateDebut ? gte(ventes.createdAt, new Date(input.dateDebut)) : undefined,
          input.dateFin ? lte(ventes.createdAt, new Date(input.dateFin)) : undefined,
        ))
        .groupBy(sql`to_char(${ventes.createdAt}, 'YYYY-MM')`);

      const depenseRows = await db.select({
        periode: sql<string>`to_char(${depenses.dateDepense}, 'YYYY-MM')`,
        total: sql<number>`COALESCE(sum(${depenses.montant}::numeric), 0)`,
      })
        .from(depenses)
        .where(and(
          eq(depenses.agenceId, agenceId),
          input.dateDebut ? gte(depenses.dateDepense, new Date(input.dateDebut)) : undefined,
          input.dateFin ? lte(depenses.dateDepense, new Date(input.dateFin)) : undefined,
        ))
        .groupBy(sql`to_char(${depenses.dateDepense}, 'YYYY-MM')`);

      const perteRows = await db.select({
        periode: sql<string>`to_char(${pertesFinancieres.datePerte}, 'YYYY-MM')`,
        total: sql<number>`COALESCE(sum(${pertesFinancieres.montantPerte}::numeric), 0)`,
      })
        .from(pertesFinancieres)
        .where(and(
          eq(pertesFinancieres.agenceId, agenceId),
          input.dateDebut ? gte(pertesFinancieres.datePerte, new Date(input.dateDebut)) : undefined,
          input.dateFin ? lte(pertesFinancieres.datePerte, new Date(input.dateFin)) : undefined,
        ))
        .groupBy(sql`to_char(${pertesFinancieres.datePerte}, 'YYYY-MM')`);

      const encaisseRows = await db.select({
        periode: sql<string>`to_char(${ventes.createdAt}, 'YYYY-MM')`,
        total: sql<number>`COALESCE(sum(${ventes.montantPaye}::numeric), 0)`,
      })
        .from(ventes)
        .where(and(
          eq(ventes.agenceId, agenceId),
          eq(ventes.statut, "termine"),
          input.dateDebut ? gte(ventes.createdAt, new Date(input.dateDebut)) : undefined,
          input.dateFin ? lte(ventes.createdAt, new Date(input.dateFin)) : undefined,
        ))
        .groupBy(sql`to_char(${ventes.createdAt}, 'YYYY-MM')`);

      const retoursPeriodRows = await db.select({
        periode: sql<string>`to_char(${ventes.createdAt}, 'YYYY-MM')`,
        total: sql<number>`COALESCE(sum(${lignesRetour.totalLigne}), 0)`,
      })
        .from(lignesRetour)
        .innerJoin(retours, eq(lignesRetour.retourId, retours.id))
        .innerJoin(ventes, eq(retours.venteId, ventes.id))
        .where(and(
          eq(ventes.agenceId, agenceId),
          input.dateDebut ? gte(ventes.createdAt, new Date(input.dateDebut)) : undefined,
          input.dateFin ? lte(ventes.createdAt, new Date(input.dateFin)) : undefined,
        ))
        .groupBy(sql`to_char(${ventes.createdAt}, 'YYYY-MM')`);

      const depensesMap = new Map(depenseRows.map((r) => [String(r.periode), Number(r.total ?? 0)]));
      const pertesMap = new Map(perteRows.map((r) => [String(r.periode), Number(r.total ?? 0)]));
      const encaisseMap = new Map(encaisseRows.map((r) => [String(r.periode), Number(r.total ?? 0)]));
      const retoursMap = new Map(retoursPeriodRows.map((r) => [String(r.periode), Number(r.total ?? 0)]));

      return margeRows.map((r) => {
        const periode = String(r.periode ?? "");
        const ca = Number(r.ca ?? 0);
        const cout = Number(r.cout ?? 0);
        const depenses = depensesMap.get(periode) ?? 0;
        const pertes = pertesMap.get(periode) ?? 0;
        const caEncaisse = Math.max(0, (encaisseMap.get(periode) ?? 0) - (retoursMap.get(periode) ?? 0));
        const benefice = ca - cout - depenses - pertes;
        return { periode, ca, caEncaisse, cout, depenses, pertes, benefice };
      });
    }),
});
