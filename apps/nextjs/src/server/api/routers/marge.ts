import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { ventes, ventesLignes, produits, retours, lignesRetour, utilisateurs, lots, stocksLots, fournisseurs, pertesFinancieres } from "@atelierone/db";
import { eq, and, gte, lte, sql, desc, asc, inArray, type SQL, type SQLWrapper } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const estPerime = (dlc: string | Date | null): boolean => {
  if (!dlc) return false;
  const d = typeof dlc === "string" ? new Date(`${dlc}T00:00:00`) : dlc;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
};

const estDlcProche = (dlc: string | Date | null): boolean => {
  if (!dlc) return false;
  const d = typeof dlc === "string" ? new Date(`${dlc}T00:00:00`) : dlc;
  const seuil = new Date();
  seuil.setHours(0, 0, 0, 0);
  seuil.setDate(seuil.getDate() + 30);
  return d >= new Date(seuil.getTime() - 30 * 24 * 3600 * 1000) && d <= seuil;
};

const coutLigne = sql`${ventesLignes.quantite} * COALESCE(${ventesLignes.coutUnitaire}, ${produits.prixAchat} * ${ventesLignes.facteurConversion}, 0)`;
const margeLigne = sql`${ventesLignes.totalLigne} - ${coutLigne}`;

function periodeFilters(input: {
  agenceId: number;
  dateDebut?: string;
  dateFin?: string;
  typeProduit?: string;
  operateurId?: string;
}): SQL[] {
  const filters: SQL[] = [eq(ventes.agenceId, input.agenceId), eq(ventes.statut, "termine")];
  if (input.dateDebut) filters.push(gte(ventes.createdAt, new Date(input.dateDebut)));
  if (input.dateFin) filters.push(lte(ventes.createdAt, new Date(input.dateFin)));
  if (input.typeProduit) filters.push(eq(produits.typeProduit, input.typeProduit));
  if (input.operateurId) filters.push(eq(ventes.operateurId, Number(input.operateurId)));
  return filters;
}

export const margeRouter = createTRPCRouter({
  getMargeKpis: protectedProcedure
    .input(z.object({
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const [resume] = await db.select({
        ca: sql<number>`COALESCE(sum(${ventesLignes.totalLigne}), 0)`,
        cout: sql<number>`COALESCE(sum(${coutLigne}), 0)`,
        remises: sql<number>`COALESCE(sum(${ventes.remise}), 0)`,
        nbVentes: sql<number>`count(distinct ${ventes.id})`,
        pertes: sql<number>`COALESCE(sum(case when ${ventesLignes.coutUnitaire} > ${ventesLignes.prixUnitaire} then ${ventesLignes.quantite} * (${ventesLignes.coutUnitaire} - ${ventesLignes.prixUnitaire}) else 0 end), 0)`,
      })
      .from(ventesLignes)
      .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
      .innerJoin(produits, eq(ventesLignes.produitId, produits.id))
      .where(and(...periodeFilters({ ...input, agenceId: ctx.user.agenceId })));

      const [retoursResume] = await db.select({
        ca: sql<number>`COALESCE(sum(${lignesRetour.totalLigne}), 0)`,
        cout: sql<number>`COALESCE(sum(${lignesRetour.quantite} * COALESCE(${lignesRetour.coutUnitaire}, ${produits.prixAchat} * ${lignesRetour.facteurConversion}, 0)), 0)`,
        nbRetours: sql<number>`count(distinct ${retours.id})`,
      })
      .from(lignesRetour)
      .innerJoin(retours, eq(lignesRetour.retourId, retours.id))
      .innerJoin(ventes, eq(retours.venteId, ventes.id))
      .innerJoin(produits, eq(lignesRetour.produitId, produits.id))
      .where(and(
        eq(ventes.agenceId, ctx.user.agenceId),
        input.dateDebut ? gte(ventes.createdAt, new Date(input.dateDebut)) : undefined,
        input.dateFin ? lte(ventes.createdAt, new Date(input.dateFin)) : undefined,
      ));

      const ca = Number(resume?.ca ?? 0);
      const cout = Number(resume?.cout ?? 0);
      const remises = Number(resume?.remises ?? 0);
      const retoursCa = Number(retoursResume?.ca ?? 0);
      const retoursCout = Number(retoursResume?.cout ?? 0);
      const margeBrute = ca - cout;

      return {
        ca,
        cout,
        remises,
        margeBrute,
        margeRetours: retoursCa - retoursCout,
        margeNet: margeBrute - remises - (retoursCa - retoursCout),
        tauxMarge: ca > 0 ? (margeBrute / ca) * 100 : 0,
        nbVentes: Number(resume?.nbVentes ?? 0),
        nbRetours: Number(retoursResume?.nbRetours ?? 0),
        pertes: Number(resume?.pertes ?? 0),
      };
    }),

  getMargeParProduit: protectedProcedure
    .input(z.object({
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
      typeProduit: z.string().optional(),
      operateurId: z.string().optional(),
      sortBy: z.enum(["marge", "ca", "quantite", "tauxMarge", "cout"]).default("marge"),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const sortExpr: Record<string, SQL> = {
        marge: sql`sum(${margeLigne})`,
        ca: sql`sum(${ventesLignes.totalLigne})`,
        quantite: sql`sum(${ventesLignes.quantite})`,
        cout: sql`sum(${coutLigne})`,
        tauxMarge: sql`CASE WHEN sum(${ventesLignes.totalLigne}) > 0 THEN (sum(${ventesLignes.totalLigne}) - sum(${coutLigne})) / sum(${ventesLignes.totalLigne}) * 100 ELSE 0 END`,
      };

      const rows = await db.select({
        produitId: produits.id,
        titre: produits.titre,
        codeBarre: produits.codeBarre,
        quantite: sql<number>`sum(${ventesLignes.quantite})`,
        ca: sql<number>`sum(${ventesLignes.totalLigne})`,
        cout: sql<number>`sum(${coutLigne})`,
        marge: sql<number>`sum(${margeLigne})`,
        taux: sql<number>`CASE WHEN sum(${ventesLignes.totalLigne}) > 0 THEN (sum(${ventesLignes.totalLigne}) - sum(${coutLigne})) / sum(${ventesLignes.totalLigne}) * 100 ELSE 0 END`,
        prixMoyen: sql<number>`avg(${ventesLignes.prixUnitaire})`,
        coutMoyen: sql<number>`avg(COALESCE(${ventesLignes.coutUnitaire}, ${produits.prixAchat} * ${ventesLignes.facteurConversion}, 0))`,
      })
      .from(ventesLignes)
      .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
      .innerJoin(produits, eq(ventesLignes.produitId, produits.id))
      .where(and(...periodeFilters({ ...input, agenceId: ctx.user.agenceId })))
      .groupBy(produits.id, produits.titre, produits.codeBarre)
      .orderBy(desc(sortExpr[input.sortBy] ?? sortExpr.marge))
      .limit(input.limit)
      .offset(input.offset);

      const mapped = rows.map((r) => ({
        produitId: String(r.produitId),
        titre: r.titre ?? "",
        codeBarre: r.codeBarre ?? "",
        quantite: Number(r.quantite ?? 0),
        ca: Number(r.ca ?? 0),
        cout: Number(r.cout ?? 0),
        marge: Number(r.marge ?? 0),
        tauxMarge: Number(r.taux ?? 0),
        prixMoyen: Number(r.prixMoyen ?? 0),
        coutMoyen: Number(r.coutMoyen ?? 0),
      }));

      const [total] = await db.select({ n: sql<number>`count(distinct ${produits.id})` })
        .from(ventesLignes)
        .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
        .innerJoin(produits, eq(ventesLignes.produitId, produits.id))
        .where(and(...periodeFilters({ ...input, agenceId: ctx.user.agenceId })));

      return { produits: mapped, total: Number(total?.n ?? 0) };
    }),

  getAnalyseProduits: protectedProcedure
    .input(z.object({
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
      produitIds: z.array(z.number()).optional(),
      sortBy: z.enum(["marge", "ca", "quantite", "cout", "tauxMarge", "nbVentes", "stock", "pertes"]).default("marge"),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const d1 = input.dateDebut;
      const d2 = input.dateFin;

      const filtresProduits: SQL[] = [eq(produits.isActive, true)];
      if (input.produitIds?.length) filtresProduits.push(inArray(produits.id, input.produitIds));

      const venteAgg = (debut?: string, fin?: string) => sql`
        select vl.produit_id as pid,
               coalesce(sum(vl.quantite), 0)::float as qte,
               coalesce(sum(vl.quantite * vl.facteur_conversion), 0)::float as qte_base,
               coalesce(sum(vl.total_ligne), 0)::float as ca,
               coalesce(sum(vl.quantite * coalesce(vl.cout_unitaire, p.prix_achat * vl.facteur_conversion, 0)), 0)::float as cout,
               count(distinct v.id)::int as nb_ventes,
               avg(vl.prix_unitaire)::float as prix_moyen,
               coalesce(sum(case when coalesce(vl.cout_unitaire, p.prix_achat * vl.facteur_conversion, 0) > vl.prix_unitaire
                 then vl.quantite * (coalesce(vl.cout_unitaire, p.prix_achat * vl.facteur_conversion, 0) - vl.prix_unitaire) else 0 end), 0)::float as sous_cout
        from ventes_lignes vl
        join ventes v on v.id = vl.vente_id
        join produits p on p.id = vl.produit_id
        where v.agence_id = ${agenceId} and v.statut = 'termine'
        ${debut ? sql`and v.created_at >= ${debut}::date` : sql``}
        ${fin ? sql`and v.created_at < ${fin}::date + interval '1 day'` : sql``}
        group by vl.produit_id`;

      const retourAgg = (debut?: string, fin?: string) => sql`
        select lr.produit_id as pid,
               coalesce(sum(lr.quantite), 0)::float as qte,
               coalesce(sum(lr.total_ligne), 0)::float as montant,
               coalesce(sum(lr.quantite * coalesce(lr.cout_unitaire, p.prix_achat * lr.facteur_conversion, 0)), 0)::float as cout
        from lignes_retour lr
        join retours r on r.id = lr.retour_id
        join ventes v on v.id = r.vente_id
        join produits p on p.id = lr.produit_id
        where v.agence_id = ${agenceId}
        ${debut ? sql`and v.created_at >= ${debut}::date` : sql``}
        ${fin ? sql`and v.created_at < ${fin}::date + interval '1 day'` : sql``}
        group by lr.produit_id`;

      const pertesAgg = (debut?: string, fin?: string) => sql`
        select pf.produit_id as pid,
               coalesce(sum(pf.montant_perte), 0)::float as montant,
               coalesce(jsonb_agg(jsonb_build_object('type', pf.type_perte, 'montant', pf.montant_perte) order by pf.montant_perte desc), '[]'::jsonb) as par_type
        from pertes_financieres pf
        where pf.agence_id = ${agenceId}
        ${debut ? sql`and pf.date_perte >= ${debut}::date` : sql``}
        ${fin ? sql`and pf.date_perte < ${fin}::date + interval '1 day'` : sql``}
        group by pf.produit_id`;

      const stockAgg = sql`
        select s.produit_id as pid,
               coalesce(sum(s.quantite), 0)::float as qte,
               coalesce(sum(s.quantite * coalesce(s.cout_unitaire_moyen, p.prix_achat, 0)), 0)::float as valeur
        from stocks s
        join produits p on p.id = s.produit_id
        where s.agence_id = ${agenceId}
        group by s.produit_id`;

      const selectLigne = {
        produitId: produits.id,
        titre: produits.titre,
        codeBarre: produits.codeBarre,
        typeProduit: produits.typeProduit,
        prixVente: produits.prixVente,
        prixAchat: produits.prixAchat,
        quantite: sql<number>`COALESCE(va.qte, 0)`,
        ca: sql<number>`COALESCE(va.ca, 0)`,
        cout: sql<number>`COALESCE(va.cout, 0)`,
        nbVentes: sql<number>`COALESCE(va.nb_ventes, 0)`,
        prixMoyen: sql<number>`COALESCE(va.prix_moyen, 0)`,
        sousCout: sql<number>`COALESCE(va.sous_cout, 0)`,
        retoursQte: sql<number>`COALESCE(ra.qte, 0)`,
        retoursMontant: sql<number>`COALESCE(ra.montant, 0)`,
        retoursCout: sql<number>`COALESCE(ra.cout, 0)`,
        pertes: sql<number>`COALESCE(pa.montant, 0)`,
        pertesParType: sql<unknown>`COALESCE(pa.par_type, '[]'::jsonb)`,
        stockQte: sql<number>`COALESCE(sa.qte, 0)`,
        stockValeur: sql<number>`COALESCE(sa.valeur, 0)`,
        dernierPrixVente: sql<number>`(select vl.prix_unitaire from ventes_lignes vl join ventes v on v.id = vl.vente_id where vl.produit_id = ${produits.id} and v.agence_id = ${agenceId} and v.statut = 'termine' ${d1 ? sql`and v.created_at >= ${d1}::date` : sql``} ${d2 ? sql`and v.created_at < ${d2}::date + interval '1 day'` : sql``} order by v.created_at desc limit 1)`,
      };

      const sortExpr: Record<string, SQLWrapper> = {
        marge: sql`(COALESCE(va.ca, 0) - COALESCE(va.cout, 0))`,
        ca: sql`va.ca`,
        quantite: sql`va.qte`,
        cout: sql`va.cout`,
        nbVentes: sql`va.nb_ventes`,
        stock: sql`sa.qte`,
        pertes: sql`pa.montant`,
        tauxMarge: sql`case when COALESCE(va.ca, 0) > 0 then (COALESCE(va.ca, 0) - COALESCE(va.cout, 0)) / COALESCE(va.ca, 0) * 100 else 0 end`,
      };
      const sortCol = sortExpr[input.sortBy] ?? sortExpr.marge;

      const rows = await db.select(selectLigne)
        .from(produits)
        .leftJoin(sql`(${venteAgg(d1, d2)}) va`, sql`va.pid = ${produits.id}`)
        .leftJoin(sql`(${retourAgg(d1, d2)}) ra`, sql`ra.pid = ${produits.id}`)
        .leftJoin(sql`(${pertesAgg(d1, d2)}) pa`, sql`pa.pid = ${produits.id}`)
        .leftJoin(sql`(${stockAgg}) sa`, sql`sa.pid = ${produits.id}`)
        .where(and(...filtresProduits))
        .orderBy(sql`${sortCol} desc nulls last`)
        .limit(input.limit)
        .offset(input.offset);

      const mapped = rows.map((r) => {
        const ca = Number(r.ca ?? 0);
        const cout = Number(r.cout ?? 0);
        const marge = ca - cout;
        const margeRetours = Number(r.retoursMontant ?? 0) - Number(r.retoursCout ?? 0);
        const nbVentes = Number(r.nbVentes ?? 0);
        const rawTypes = r.pertesParType;
        const pertesParType = Array.isArray(rawTypes)
          ? (rawTypes as { type: string; montant: number }[])
          : typeof rawTypes === "string"
            ? JSON.parse(rawTypes as string)
            : [];
        return {
          produitId: String(r.produitId),
          titre: r.titre ?? "",
          codeBarre: r.codeBarre ?? "",
          typeProduit: r.typeProduit ?? null,
          prixVente: Number(r.prixVente ?? 0),
          prixAchat: Number(r.prixAchat ?? 0),
          quantite: Number(r.quantite ?? 0),
          ca,
          cout,
          marge,
          tauxMarge: ca > 0 ? (marge / ca) * 100 : 0,
          prixMoyen: Number(r.prixMoyen ?? 0),
          nbVentes,
          panierMoyen: nbVentes > 0 ? ca / nbVentes : 0,
          sousCout: Number(r.sousCout ?? 0),
          retoursQte: Number(r.retoursQte ?? 0),
          retoursMontant: Number(r.retoursMontant ?? 0),
          margeRetours,
          pertes: Number(r.pertes ?? 0),
          pertesParType,
          stockQte: Number(r.stockQte ?? 0),
          stockValeur: Number(r.stockValeur ?? 0),
          dernierPrixVente: r.dernierPrixVente ? Number(r.dernierPrixVente) : null,
        };
      });

      const [tot] = await db.select({
        nbProduits: sql<number>`count(*)`,
        ca: sql<number>`coalesce(sum(va.ca), 0)`,
        cout: sql<number>`coalesce(sum(va.cout), 0)`,
        quantite: sql<number>`coalesce(sum(va.qte), 0)`,
        pertes: sql<number>`coalesce(sum(pa.montant), 0)`,
        retoursMontant: sql<number>`coalesce(sum(ra.montant), 0)`,
        retoursCout: sql<number>`coalesce(sum(ra.cout), 0)`,
        stockValeur: sql<number>`coalesce(sum(sa.valeur), 0)`,
      })
        .from(produits)
        .leftJoin(sql`(${venteAgg(d1, d2)}) va`, sql`va.pid = ${produits.id}`)
        .leftJoin(sql`(${retourAgg(d1, d2)}) ra`, sql`ra.pid = ${produits.id}`)
        .leftJoin(sql`(${pertesAgg(d1, d2)}) pa`, sql`pa.pid = ${produits.id}`)
        .leftJoin(sql`(${stockAgg}) sa`, sql`sa.pid = ${produits.id}`)
        .where(and(...filtresProduits));

      const totCa = Number(tot?.ca ?? 0);
      const totCout = Number(tot?.cout ?? 0);
      const totMarge = totCa - totCout;
      const totMargeRetours = Number(tot?.retoursMontant ?? 0) - Number(tot?.retoursCout ?? 0);
      const totPertes = Number(tot?.pertes ?? 0);

      const [ventesTot] = await db.execute(sql`
        select count(distinct v.id) as n from ventes v
        join ventes_lignes vl on vl.vente_id = v.id
        where v.agence_id = ${agenceId} and v.statut = 'termine'
        ${input.produitIds?.length ? sql`and vl.produit_id = any(${`{${input.produitIds.join(",")}}`}::int[])` : sql``}
        ${d1 ? sql`and v.created_at >= ${d1}::date` : sql``}
        ${d2 ? sql`and v.created_at < ${d2}::date + interval '1 day'` : sql``}
      `);

      const resume = {
        nbProduits: Number(tot?.nbProduits ?? 0),
        ca: totCa,
        cout: totCout,
        quantite: Number(tot?.quantite ?? 0),
        marge: totMarge,
        margeRetours: totMargeRetours,
        pertes: totPertes,
        beneficeNet: totMarge - totMargeRetours - totPertes,
        tauxMarge: totCa > 0 ? (totMarge / totCa) * 100 : 0,
        nbVentes: Number(ventesTot?.n ?? 0),
        stockValeur: Number(tot?.stockValeur ?? 0),
      };

      const deltas = d1 && d2
        ? (() => {
            const duree = new Date(d2).getTime() - new Date(d1).getTime();
            const p1 = new Date(new Date(d1).getTime() - duree).toISOString().slice(0, 10);
            const p2 = new Date(new Date(d2).getTime() - duree).toISOString().slice(0, 10);
            return [p1, p2] as const;
          })()
        : null;

      let deltaResume: { ca: number | null; marge: number | null; quantite: number | null } | null = null;
      if (deltas) {
        const [prev] = await db.select({
          ca: sql<number>`coalesce(sum(va.ca), 0)`,
          cout: sql<number>`coalesce(sum(va.cout), 0)`,
          quantite: sql<number>`coalesce(sum(va.qte), 0)`,
        })
          .from(produits)
          .leftJoin(sql`(${venteAgg(deltas[0], deltas[1])}) va`, sql`va.pid = ${produits.id}`)
          .where(and(...filtresProduits));
        const pCa = Number(prev?.ca ?? 0);
        const pMarge = pCa - Number(prev?.cout ?? 0);
        const pQte = Number(prev?.quantite ?? 0);
        deltaResume = {
          ca: pCa > 0 ? ((resume.ca - pCa) / pCa) * 100 : null,
          marge: pMarge !== 0 ? ((resume.marge - pMarge) / Math.abs(pMarge)) * 100 : null,
          quantite: pQte > 0 ? ((resume.quantite - pQte) / pQte) * 100 : null,
        };
      }

      const topLigne = { produitId: produits.id, titre: produits.titre };
      const top = async (order: SQLWrapper, avecPertes: boolean, limit = 5) => {
        const q = await db.select({
          ...topLigne,
          valeur: avecPertes ? sql<number>`COALESCE(pa.montant, 0)` : sql<number>`${order}`,
        })
          .from(produits)
          .leftJoin(sql`(${venteAgg(d1, d2)}) va`, sql`va.pid = ${produits.id}`)
          .leftJoin(sql`(${pertesAgg(d1, d2)}) pa`, sql`pa.pid = ${produits.id}`)
          .where(and(...filtresProduits))
          .orderBy(sql`${order} desc nulls last`)
          .limit(limit);
        return q.map((r) => ({ produitId: String(r.produitId), titre: r.titre ?? "", valeur: Number(r.valeur ?? 0) }));
      };

      return {
        produits: mapped,
        total: resume.nbProduits,
        resume,
        delta: deltaResume,
        top: {
          marge: await top(sql`(COALESCE(va.ca, 0) - COALESCE(va.cout, 0))`, false),
          ca: await top(sql`va.ca`, false),
          pertes: await top(sql`pa.montant`, true),
        },
      };
    }),

  getMargeSeries: protectedProcedure
    .input(z.object({
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
      groupBy: z.enum(["day", "month"]).default("day"),
    }))
    .query(async ({ ctx, input }) => {
      const period = input.groupBy === "month"
        ? sql`to_char(${ventes.createdAt}, 'YYYY-MM')`
        : sql`to_char(${ventes.createdAt}, 'YYYY-MM-DD')`;

      const rows = await db.select({
        periode: sql<string>`${period}`,
        ca: sql<number>`sum(${ventesLignes.totalLigne})`,
        cout: sql<number>`sum(${coutLigne})`,
        marge: sql<number>`sum(${margeLigne})`,
      })
      .from(ventesLignes)
      .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
      .innerJoin(produits, eq(ventesLignes.produitId, produits.id))
      .where(and(...periodeFilters({ ...input, agenceId: ctx.user.agenceId })))
      .groupBy(sql`${period}`)
      .orderBy(asc(sql`${period}`));

      return rows.map((r) => ({
        periode: String(r.periode ?? ""),
        ca: Number(r.ca ?? 0),
        cout: Number(r.cout ?? 0),
        marge: Number(r.marge ?? 0),
      }));
    }),

  getMargeParType: protectedProcedure
    .input(z.object({
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await db.select({
        groupe: produits.typeProduit,
        libelle: produits.typeProduit,
        ca: sql<number>`sum(${ventesLignes.totalLigne})`,
        cout: sql<number>`sum(${coutLigne})`,
        marge: sql<number>`sum(${margeLigne})`,
      })
      .from(ventesLignes)
      .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
      .innerJoin(produits, eq(ventesLignes.produitId, produits.id))
      .where(and(...periodeFilters({ ...input, agenceId: ctx.user.agenceId })))
      .groupBy(produits.typeProduit, produits.typeProduit)
      .orderBy(desc(sql`sum(${margeLigne})`));

      return rows.map((r) => ({
        groupe: r.groupe == null ? "Sans groupe" : String(r.groupe),
        libelle: r.libelle ?? "Sans groupe",
        ca: Number(r.ca ?? 0),
        cout: Number(r.cout ?? 0),
        marge: Number(r.marge ?? 0),
        tauxMarge: Number(r.ca ?? 0) > 0 ? (Number(r.marge ?? 0) / Number(r.ca ?? 0)) * 100 : 0,
      }));
    }),

  getVentesSousCout: protectedProcedure
    .input(z.object({
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
      limit: z.number().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await db.select({
        produitId: produits.id,
        titre: produits.titre,
        quantite: sql<number>`sum(${ventesLignes.quantite})`,
        perte: sql<number>`sum(case when ${ventesLignes.coutUnitaire} > ${ventesLignes.prixUnitaire} then ${ventesLignes.quantite} * (${ventesLignes.coutUnitaire} - ${ventesLignes.prixUnitaire}) else 0 end)`,
        perteMoyenne: sql<number>`avg(case when ${ventesLignes.coutUnitaire} > ${ventesLignes.prixUnitaire} then ${ventesLignes.coutUnitaire} - ${ventesLignes.prixUnitaire} else 0 end)`,
      })
      .from(ventesLignes)
      .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
      .innerJoin(produits, eq(ventesLignes.produitId, produits.id))
      .where(and(
        ...periodeFilters({ ...input, agenceId: ctx.user.agenceId }),
        sql`${ventesLignes.coutUnitaire} > ${ventesLignes.prixUnitaire}`,
      ))
      .groupBy(produits.id, produits.titre)
      .orderBy(desc(sql`sum(case when ${ventesLignes.coutUnitaire} > ${ventesLignes.prixUnitaire} then ${ventesLignes.quantite} * (${ventesLignes.coutUnitaire} - ${ventesLignes.prixUnitaire}) else 0 end)`))
      .limit(input.limit);

      return rows.map((r) => ({
        produitId: String(r.produitId),
        titre: r.titre ?? "",
        quantite: Number(r.quantite ?? 0),
        perte: Number(r.perte ?? 0),
        perteMoyenne: Number(r.perteMoyenne ?? 0),
      }));
    }),

  getMargeRetours: protectedProcedure
    .input(z.object({
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await db.select({
        produitId: produits.id,
        titre: produits.titre,
        quantite: sql<number>`sum(${lignesRetour.quantite})`,
        ca: sql<number>`sum(${lignesRetour.totalLigne})`,
        cout: sql<number>`sum(${lignesRetour.quantite} * COALESCE(${lignesRetour.coutUnitaire}, ${produits.prixAchat} * ${lignesRetour.facteurConversion}, 0))`,
        marge: sql<number>`sum(${lignesRetour.totalLigne} - ${lignesRetour.quantite} * COALESCE(${lignesRetour.coutUnitaire}, ${produits.prixAchat} * ${lignesRetour.facteurConversion}, 0))`,
      })
      .from(lignesRetour)
      .innerJoin(retours, eq(lignesRetour.retourId, retours.id))
      .innerJoin(ventes, eq(retours.venteId, ventes.id))
      .innerJoin(produits, eq(lignesRetour.produitId, produits.id))
      .where(and(
        eq(ventes.agenceId, ctx.user.agenceId),
        input.dateDebut ? gte(ventes.createdAt, new Date(input.dateDebut)) : undefined,
        input.dateFin ? lte(ventes.createdAt, new Date(input.dateFin)) : undefined,
      ))
      .groupBy(produits.id, produits.titre)
      .orderBy(desc(sql`sum(${lignesRetour.totalLigne} - ${lignesRetour.quantite} * COALESCE(${lignesRetour.coutUnitaire}, ${produits.prixAchat} * ${lignesRetour.facteurConversion}, 0))`));

      return rows.map((r) => ({
        produitId: String(r.produitId),
        titre: r.titre ?? "",
        quantite: Number(r.quantite ?? 0),
        ca: Number(r.ca ?? 0),
        cout: Number(r.cout ?? 0),
        marge: Number(r.marge ?? 0),
      }));
    }),

  getAnalyseLots: protectedProcedure
    .input(z.object({
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
      produitIds: z.array(z.number()).optional(),
      lotIds: z.array(z.number()).optional(),
      typeProduit: z.string().optional(),
      statut: z.enum(["disponible", "epuise", "alerte_dlc"]).optional(),
      sortBy: z.enum(["marge", "montantVendu", "qteVendue", "cout", "tauxEcoulement", "dateEntree", "datePeremption"]).default("marge"),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;

      const ventesAgg = sql`
        select vl.lot_id,
               coalesce(sum(vl.quantite), 0)::float as qte_vendue,
               coalesce(sum(vl.quantite * vl.facteur_conversion), 0)::float as qte_vendue_base,
               coalesce(sum(vl.total_ligne), 0)::float as montant_vendu
        from ventes_lignes vl
        join ventes v on v.id = vl.vente_id
        where vl.lot_id is not null
          and v.agence_id = ${agenceId}
          and v.statut = 'termine'
          ${input.dateDebut ? sql`and v.created_at >= ${input.dateDebut}::date` : sql``}
          ${input.dateFin ? sql`and v.created_at < ${input.dateFin}::date + interval '1 day'` : sql``}
        group by vl.lot_id`;

      const jointureStocks = and(eq(stocksLots.lotId, lots.id), eq(stocksLots.agenceId, agenceId));

      const whereConds: SQL[] = [eq(lots.isActive, true)];
      if (input.produitIds?.length) whereConds.push(inArray(lots.produitId, input.produitIds));
      if (input.lotIds?.length) whereConds.push(inArray(lots.id, input.lotIds));
      if (input.typeProduit) whereConds.push(eq(produits.typeProduit, input.typeProduit));
      if (input.statut === "disponible") whereConds.push(sql`COALESCE(${stocksLots.quantite}, 0) > 0`);
      if (input.statut === "epuise") whereConds.push(sql`COALESCE(${stocksLots.quantite}, 0) <= 0`);
      if (input.statut === "alerte_dlc") whereConds.push(lte(lots.datePeremption, sql`(now() + interval '30 days')::date`));

      const sortExpr: Record<string, SQLWrapper> = {
        marge: sql`COALESCE(vagg.montant_vendu, 0) - COALESCE(vagg.qte_vendue_base, 0) * COALESCE(${lots.coutUnitaire}, ${produits.prixAchat}, 0)`,
        montantVendu: sql`COALESCE(vagg.montant_vendu, 0)`,
        qteVendue: sql`COALESCE(vagg.qte_vendue, 0)`,
        cout: sql`COALESCE(vagg.qte_vendue_base, 0) * COALESCE(${lots.coutUnitaire}, ${produits.prixAchat}, 0)`,
        tauxEcoulement: sql`case when (COALESCE(vagg.qte_vendue_base, 0) + COALESCE(${stocksLots.quantite}, 0)) > 0 then COALESCE(vagg.qte_vendue_base, 0) / (COALESCE(vagg.qte_vendue_base, 0) + COALESCE(${stocksLots.quantite}, 0)) * 100 else 0 end`,
        dateEntree: lots.dateEntree,
        datePeremption: lots.datePeremption,
      };

      const ascSorts = new Set(["datePeremption"]);
      const sortCol = sortExpr[input.sortBy] ?? sortExpr.marge;

      const rows = await db.select({
        lotId: lots.id,
        numeroLot: lots.numeroLot,
        produitId: produits.id,
        titre: produits.titre,
        codeBarre: produits.codeBarre,
        typeProduit: produits.typeProduit,
        fournisseur: fournisseurs.nom,
        dateReception: lots.dateReception,
        dateEntree: lots.dateEntree,
        datePeremption: lots.datePeremption,
        quantiteInitiale: lots.quantiteInitiale,
        coutUnitaire: lots.coutUnitaire,
        qteRestante: sql<number>`COALESCE(${stocksLots.quantite}, 0)`,
        qteVendue: sql<number>`COALESCE(vagg.qte_vendue, 0)`,
        qteVendueBase: sql<number>`COALESCE(vagg.qte_vendue_base, 0)`,
        montantVendu: sql<number>`COALESCE(vagg.montant_vendu, 0)`,
        coutVendu: sql<number>`COALESCE(vagg.qte_vendue_base, 0) * COALESCE(${lots.coutUnitaire}, ${produits.prixAchat}, 0)`,
        marge: sql<number>`COALESCE(vagg.montant_vendu, 0) - COALESCE(vagg.qte_vendue_base, 0) * COALESCE(${lots.coutUnitaire}, ${produits.prixAchat}, 0)`,
        pertes: sql<number>`(select coalesce(sum(pf.montant_perte), 0) from pertes_financieres pf where pf.agence_id = ${agenceId} and (pf.lot_id = ${lots.id} or (pf.reference_type = 'LOT' and pf.reference = ${lots.numeroLot})))`,
      })
        .from(lots)
        .innerJoin(produits, eq(lots.produitId, produits.id))
        .leftJoin(stocksLots, jointureStocks)
        .leftJoin(fournisseurs, eq(lots.fournisseurId, fournisseurs.id))
        .leftJoin(sql`(${ventesAgg}) vagg`, sql`vagg.lot_id = ${lots.id}`)
        .where(and(...whereConds))
        .groupBy(lots.id, produits.id, fournisseurs.id, stocksLots.quantite, sql`vagg.qte_vendue`, sql`vagg.qte_vendue_base`, sql`vagg.montant_vendu`)
        .orderBy(ascSorts.has(input.sortBy)
          ? sql`${sortCol} asc nulls last`
          : sql`${sortCol} desc`)
        .limit(input.limit)
        .offset(input.offset);

      const mapped = rows.map((r) => {
        const qteVendueBase = Number(r.qteVendueBase ?? 0);
        const qteRestante = Number(r.qteRestante ?? 0);
        const montantVendu = Number(r.montantVendu ?? 0);
        const coutVendu = Number(r.coutVendu ?? 0);
        const marge = montantVendu - coutVendu;
        const pertes = Number(r.pertes ?? 0);
        return {
          lotId: String(r.lotId),
          numeroLot: r.numeroLot,
          produitId: String(r.produitId),
          titre: r.titre ?? "",
          codeBarre: r.codeBarre ?? "",
          typeProduit: r.typeProduit ?? "FOURNITURE",
          fournisseur: r.fournisseur ?? null,
          dateReception: r.dateReception?.toISOString() ?? null,
          dateEntree: r.dateEntree?.toISOString() ?? null,
          datePeremption: r.datePeremption ?? null,
          quantiteInitiale: Number(r.quantiteInitiale ?? 0),
          coutUnitaire: Number(r.coutUnitaire ?? 0),
          qteVendue: Number(r.qteVendue ?? 0),
          qteRestante,
          qteVendueBase,
          montantVendu,
          coutVendu,
          marge,
          beneficeNetLot: marge - pertes,
          tauxMarge: montantVendu > 0 ? (marge / montantVendu) * 100 : 0,
          tauxEcoulement: qteVendueBase + qteRestante > 0 ? (qteVendueBase / (qteVendueBase + qteRestante)) * 100 : 0,
          pertes,
          statutDlc: estPerime(r.datePeremption) ? "perime" : estDlcProche(r.datePeremption) ? "bientot" : null,
        };
      });

      const [tot] = await db.select({
        nbLots: sql<number>`count(*)`,
        montantVendu: sql<number>`COALESCE(sum(COALESCE(vagg.montant_vendu, 0)), 0)`,
        coutVendu: sql<number>`COALESCE(sum(COALESCE(vagg.qte_vendue_base, 0) * COALESCE(${lots.coutUnitaire}, ${produits.prixAchat}, 0)), 0)`,
        qteRestante: sql<number>`COALESCE(sum(COALESCE(${stocksLots.quantite}, 0)), 0)`,
      })
        .from(lots)
        .innerJoin(produits, eq(lots.produitId, produits.id))
        .leftJoin(stocksLots, jointureStocks)
        .leftJoin(sql`(${ventesAgg}) vagg`, sql`vagg.lot_id = ${lots.id}`)
        .where(and(...whereConds));

      const montantVendu = Number(tot?.montantVendu ?? 0);
      const coutVendu = Number(tot?.coutVendu ?? 0);
      const marge = montantVendu - coutVendu;

      return {
        lots: mapped,
        total: Number(tot?.nbLots ?? 0),
        resume: {
          montantVendu,
          coutVendu,
          marge,
          tauxMarge: montantVendu > 0 ? (marge / montantVendu) * 100 : 0,
          qteRestante: Number(tot?.qteRestante ?? 0),
        },
      };
    }),

  // Détail d'un lot : ventes rattachées + aléas (vols/casses) — drill-down de l'analyse par lot
  getDetailLot: protectedProcedure
    .input(z.object({ lotId: z.coerce.number() }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const [lot] = await db.select({
        id: lots.id,
        numeroLot: lots.numeroLot,
        produitId: lots.produitId,
        titre: produits.titre,
        codeBarre: produits.codeBarre,
        typeProduit: produits.typeProduit,
        fournisseur: fournisseurs.nom,
        dateReception: lots.dateReception,
        datePeremption: lots.datePeremption,
        quantiteInitiale: lots.quantiteInitiale,
        coutUnitaire: lots.coutUnitaire,
      }).from(lots)
        .leftJoin(produits, eq(lots.produitId, produits.id))
        .leftJoin(fournisseurs, eq(lots.fournisseurId, fournisseurs.id))
        .where(eq(lots.id, input.lotId))
        .limit(1) as any;
      if (!lot) throw new TRPCError({ code: "NOT_FOUND", message: "Lot introuvable" });

      const [stk] = await db.select({ qteRestante: stocksLots.quantite })
        .from(stocksLots)
        .where(and(eq(stocksLots.lotId, input.lotId), eq(stocksLots.agenceId, agenceId)))
        .limit(1) as any;

      const ventesLot = await db.select({
        venteId: ventes.id,
        reference: ventes.reference,
        date: ventes.createdAt,
        quantite: ventesLignes.quantite,
        prixUnitaire: ventesLignes.prixUnitaire,
        total: ventesLignes.totalLigne,
      }).from(ventesLignes)
        .innerJoin(ventes, eq(ventesLignes.venteId, ventes.id))
        .where(and(eq(ventesLignes.lotId, input.lotId), eq(ventes.agenceId, agenceId)))
        .orderBy(desc(ventes.createdAt)) as any;

      const pertesLot = await db.select({
        id: pertesFinancieres.id,
        typePerte: pertesFinancieres.typePerte,
        quantite: pertesFinancieres.quantite,
        coutUnitaire: pertesFinancieres.coutUnitaire,
        montantPerte: pertesFinancieres.montantPerte,
        motif: pertesFinancieres.motif,
        datePerte: pertesFinancieres.datePerte,
        effectuePar: pertesFinancieres.effectuePar,
      }).from(pertesFinancieres)
        .where(and(eq(pertesFinancieres.lotId, input.lotId), eq(pertesFinancieres.agenceId, agenceId)))
        .orderBy(desc(pertesFinancieres.datePerte)) as any;

      const montantVendu = ventesLot.reduce((s: number, v: any) => s + Number(v.total ?? 0), 0);
      const qteVendue = ventesLot.reduce((s: number, v: any) => s + Number(v.quantite ?? 0), 0);
      const coutVendu = qteVendue * Number(lot.coutUnitaire ?? 0);
      const pertesTotal = pertesLot.reduce((s: number, p: any) => s + Number(p.montantPerte ?? 0), 0);

      return {
        lot: {
          ...lot,
          qteRestante: Number(stk?.qteRestante ?? 0),
          montantVendu,
          coutVendu,
          marge: montantVendu - coutVendu,
          pertes: pertesTotal,
          beneficeNetLot: montantVendu - coutVendu - pertesTotal,
        },
        ventes: ventesLot,
        pertes: pertesLot,
      };
    }),

  listOperateurs: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select({
      id: utilisateurs.id,
      nom: utilisateurs.nom,
      prenom: utilisateurs.prenom,
    })
    .from(utilisateurs)
    .where(eq(utilisateurs.agenceId, ctx.user.agenceId))
    .orderBy(utilisateurs.nom);
    return rows.map((r) => ({ id: String(r.id), nom: `${r.prenom ?? ""} ${r.nom ?? ""}`.trim() }));
  }),
});
