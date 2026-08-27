import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  ordresReparation,
  orHistorique,
  orRapportsDiagnostic,
  orDemandesPieces,
  kpiCibles,
  servicesStandards,
  atelierNotifications,
  atelierParametres,
  employes,
  vehicules,
  clients,
  ventes,
  ventesLignes,
} from "@atelierone/db";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  respectPromesse,
  leadTimeMoyenJours,
  retardMoyenJours,
  delaiDiagnosticMoyenJours,
  precisionDiagnostic,
  tauxRetouche,
  analyseComebacks,
  firstTimeQuality,
  fiabiliteAppro,
  performanceVsStandard,
  statutKPI,
  scoreSante,
  scoreTechnicien,
} from "~/server/lib/kpi-service";

const PERIODE_JOURS: Record<string, number> = { jour: 1, semaine: 7, mois: 30, trimestre: 90 };

const fenetreDepuis = (periode: string): string => {
  const jours = PERIODE_JOURS[periode] ?? 90;
  return new Date(Date.now() - jours * 86400000).toISOString().slice(0, 10);
};
const jourStr = (v: string | Date): string => (typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10));

/** Charge les OR de l'agence enrichis des horodatages dérivés de l'historique. */
async function chargerRecords(agenceId: number) {
  const rows = await db
    .select({
      id: ordresReparation.id,
      numero: ordresReparation.numero,
      statut: ordresReparation.statut,
      priorite: ordresReparation.priorite,
      familleService: ordresReparation.familleService,
      motEntree: ordresReparation.motEntree,
      clientId: ordresReparation.clientId,
      vehiculeId: ordresReparation.vehiculeId,
      immatriculation: vehicules.immatriculation,
      clientNom: clients.nom,
      clientPrenom: clients.prenom,
      clientRaisonSociale: clients.raisonSociale,
      dateOuverture: ordresReparation.dateOuverture,
      datePromesse: ordresReparation.datePromesse,
      dateCloture: ordresReparation.dateCloture,
      savOrigineOrId: ordresReparation.savOrigineOrId,
      motifRetourSAV: ordresReparation.motifRetourSAV,
      responsableTechnicienId: ordresReparation.responsableTechnicienId,
      responsableNom: employes.nom,
      responsablePrenom: employes.prenom,
      satisfactionNote: ordresReparation.satisfactionNote,
    })
    .from(ordresReparation)
    .innerJoin(vehicules, eq(ordresReparation.vehiculeId, vehicules.id))
    .leftJoin(clients, eq(ordresReparation.clientId, clients.id))
    .leftJoin(employes, eq(ordresReparation.responsableTechnicienId, employes.id))
    .where(eq(ordresReparation.agenceId, agenceId))
    .orderBy(desc(ordresReparation.dateOuverture));

  const histRows = await db
    .select({
      orId: orHistorique.orId,
      type: orHistorique.type,
      ancienneValeur: orHistorique.ancienneValeur,
      nouvelleValeur: orHistorique.nouvelleValeur,
      changeLe: orHistorique.changeLe,
      commentaire: orHistorique.commentaire,
    })
    .from(orHistorique)
    .innerJoin(ordresReparation, eq(orHistorique.orId, ordresReparation.id))
    .where(eq(ordresReparation.agenceId, agenceId))
    .orderBy(orHistorique.changeLe);

  return rows.map((r) => {
    const h = histRows.filter((x) => x.orId === r.id);
    const soumis = h.find((x) => x.type === "VALIDATION_DIAGNOSTIC" && x.nouvelleValeur === "EN_ATTENTE_VALIDATION_DIAGNOSTIC");
    const accepte = [...h].reverse().find((x) => x.type === "VALIDATION_DEVIS" && x.nouvelleValeur === "EN_COURS");
    const retouche = h.some((x) => x.type === "STATUT" && x.ancienneValeur === "CONTROLE_QUALITE" && x.nouvelleValeur === "EN_COURS");
    const renvoye = h.some((x) => x.type === "VALIDATION_DIAGNOSTIC" && /renvoy/i.test(x.commentaire ?? ""));
    return {
      ...r,
      dateDiagSoumis: soumis?.changeLe ?? null,
      dateDevisAccepte: accepte?.changeLe ?? null,
      retouche,
      renvoye,
      clientDisplay: r.clientRaisonSociale ?? `${r.clientPrenom ?? ""} ${r.clientNom ?? ""}`.trim(),
    };
  });
}

/** MODULE PERFORMANCE & QUALITÉ — indicateurs décisionnels du garage. */
export const atelierKpiRouter = createTRPCRouter({
  // ─── Santé du garage (vue Direction) ───
  getSanteGarage: requirePermissionProcedure("or.consulter")
    .input(z.object({ periode: z.enum(["jour", "semaine", "mois", "trimestre"]).default("mois") }).optional())
    .query(async ({ ctx, input }) => {
      const periode = input?.periode ?? "mois";
      const debut = fenetreDepuis(periode);

      const cibles = await db.select().from(kpiCibles).where(eq(kpiCibles.agenceId, ctx.user.agenceId));
      const cibleMap = new Map(cibles.map((c) => [c.code, c]));

      const records = (await chargerRecords(ctx.user.agenceId)) as any[];
      const actifs = records.filter((o) => o.statut !== "ANNULE" && jourStr(o.dateOuverture) >= debut);
      const livresPeriode = records.filter((o) => o.statut === "LIVRE" && o.dateCloture && jourStr(o.dateCloture) >= debut);
            const savPeriode = records.filter((o) => o.savOrigineOrId && jourStr(o.createdAt) >= debut);
      const demandes = await db.select({ statut: orDemandesPieces.statut }).from(orDemandesPieces).innerJoin(ordresReparation, eq(orDemandesPieces.orId, ordresReparation.id)).where(eq(ordresReparation.agenceId, ctx.user.agenceId));

      const ponctualité = respectPromesse(livresPeriode);
      const lead = leadTimeMoyenJours(livresPeriode);
      const retard = retardMoyenJours(livresPeriode);
      const diag = delaiDiagnosticMoyenJours(records.filter((o) => o.dateDiagSoumis && jourStr(o.dateOuverture) >= debut));
      const ftq = firstTimeQuality(livresPeriode);
      const comebacks = analyseComebacks(savPeriode, records.filter((o) => !o.savOrigineOrId));
      const appro = fiabiliteAppro(demandes);
      const notes = livresPeriode.filter((o) => o.satisfactionNote != null).map((o) => Number(o.satisfactionNote));
      const satisf = notes.length ? Math.round((notes.reduce((s, n) => s + n, 0) / notes.length) * 100) / 100 : null;

      const c = (code: string): any => cibleMap.get(code);
      const val = (code: string) =>
        code === "PONCTUALITE" ? ponctualité.pourcent
        : code === "FTQ" ? ftq
        : code === "TAUX_RETOUR_SAV" ? comebacks.tauxSurLivres
        : code === "RAPIDITE_DIAG_JOURS" ? diag
        : code === "FIABILITE_APPRO" ? appro
        : code === "SATISFACTION_CLIENT" ? satisf
        : null;

      const kpis = ["PONCTUALITE", "FTQ", "TAUX_RETOUR_SAV", "RAPIDITE_DIAG_JOURS", "FIABILITE_APPRO", "SATISFACTION_CLIENT"].map((code) => {
        const cb = c(code);
        const valeur = val(code);
        const statut = cb ? statutKPI(valeur, Number(cb.cible), cb.seuilOrange != null ? Number(cb.seuilOrange) : null, cb.seuilRouge != null ? Number(cb.seuilRouge) : null, (cb.sens as "HAUT" | "BAS") ?? "HAUT") : "SANS_DATA";
        return { code, valeur, cible: cb ? Number(cb.cible) : null, unite: cb?.unite ?? "%", sens: cb?.sens ?? "HAUT", statut };
      });

      // Règles décisionnelles → notifications E1 (sans spam : une non-lue max par règle)
      const regles: Array<{ type: string; titre: string; message: string }> = [];
      if (comebacks.total > 0 && comebacks.malfaçonOuDiagnostic >= Math.ceil(comebacks.total / 2)) {
        regles.push({ type: "REGLE_QUALITE", titre: "Alerte Qualité", message: `${comebacks.malfaçonOuDiagnostic} comeback(s) imputable(s) à une malfaçon ou un diagnostic erroné — analyser techniciens et types d'interventions concernés.` });
      }
      const cibleDiag = c("RAPIDITE_DIAG_JOURS");
      if (diag != null && cibleDiag && diag > Number(cibleDiag.cible)) {
        regles.push({ type: "REGLE_DIAGNOSTIC", titre: "Délai de diagnostic au-dessus de la cible", message: `Délai moyen ${diag} j > cible ${Number(cibleDiag.cible)} j — formation ou profil spécialisé requis sur la famille concernée.` });
      }
      const unread = await db.select({ type: atelierNotifications.type }).from(atelierNotifications).where(and(eq(atelierNotifications.agenceId, ctx.user.agenceId), eq(atelierNotifications.lu, false)));
      const unreadTypes = new Set(unread.map((u) => u.type));
      for (const regle of regles) {
        if (!unreadTypes.has(regle.type)) {
          await db.insert(atelierNotifications).values({ agenceId: ctx.user.agenceId, type: regle.type, titre: regle.titre, message: regle.message, lu: false } as any);
        }
      }

      const repPriorite = ["P1", "P2", "P3", "P4"].map((p) => ({ priorite: p, nombre: actifs.filter((o) => o.priorite === p).length }));
      const repStatut = [
        ["EN_ATTENTE_DIAGNOSTIC", "En attente diagnostic"], ["EN_ATTENTE_VALIDATION_DIAGNOSTIC", "Diagnostic à valider"],
        ["EN_COURS", "En cours"], ["EN_ATTENTE_PIECES", "En attente pièces"], ["EN_ATTENTE_VALIDATION", "En attente validation"],
        ["CONTROLE_QUALITE", "Contrôle qualité"], ["PRET_A_LIVRER", "Prêt à livrer"], ["BLOQUE", "Bloqué"],
      ].map(([s, libelle]: any) => ({ statut: s, libelle, nombre: actifs.filter((o) => o.statut === s).length })).filter((s) => s.nombre > 0);

      const topAnciens = actifs.map((o) => ({
        id: o.id, numero: o.numero, immatriculation: o.immatriculation, clientDisplay: o.clientDisplay ?? "",
        priorite: o.priorite,
        joursImmobilisation: Math.max(0, Math.floor((Date.now() - new Date(o.dateOuverture).getTime()) / 86400000)),
      })).sort((a, b) => b.joursImmobilisation - a.joursImmobilisation).slice(0, 5);

      return { periode, kpis, repPriorite, repStatut, topAnciens, reglesGenerees: regles.length, totalActifs: actifs.length, totalLivrePeriode: livresPeriode.length };
    }),

  // ─── Vue Qualité & SAV (comebacks par motif) ───
  getQualiteSAV: requirePermissionProcedure("or.consulter")
    .input(z.object({ periode: z.enum(["jour", "semaine", "mois", "trimestre"]).default("trimestre") }).optional())
    .query(async ({ ctx, input }) => {
      const periode = input?.periode ?? "trimestre";
      const debut = fenetreDepuis(periode);
      const sav = await db
        .select({
          id: ordresReparation.id,
          numero: ordresReparation.numero,
          statut: ordresReparation.statut,
          motifRetourSAV: ordresReparation.motifRetourSAV,
          savOrigineOrId: ordresReparation.savOrigineOrId,
          createdAt: ordresReparation.createdAt,
          immatriculation: vehicules.immatriculation,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientRaisonSociale: clients.raisonSociale,
          responsableNom: employes.nom,
          responsablePrenom: employes.prenom,
        })
        .from(ordresReparation)
        .innerJoin(vehicules, eq(ordresReparation.vehiculeId, vehicules.id))
        .leftJoin(clients, eq(ordresReparation.clientId, clients.id))
        .leftJoin(employes, eq(ordresReparation.responsableTechnicienId, employes.id))
        .where(and(
          eq(ordresReparation.agenceId, ctx.user.agenceId),
          sql`${ordresReparation.savOrigineOrId} IS NOT NULL`,
          gte(ordresReparation.createdAt, new Date(`${debut}T00:00:00`)),
        ))
        .orderBy(desc(ordresReparation.createdAt));
      const parMotif: Record<string, number> = {};
      for (const s of sav) parMotif[s.motifRetourSAV ?? "AUTRE"] = (parMotif[s.motifRetourSAV ?? "AUTRE"] ?? 0) + 1;
      return {
        sav: sav.map((s) => ({ ...s, clientDisplay: s.clientRaisonSociale ?? `${s.clientPrenom ?? ""} ${s.clientNom ?? ""}`.trim() })),
        parMotif,
        total: sav.length,
      };
    }),

  // ─── Vue Diagnostic (délais + précision + cas problématiques) ───
  getDiagnostics: requirePermissionProcedure("or.consulter")
    .input(z.object({ periode: z.enum(["jour", "semaine", "mois", "trimestre"]).default("trimestre") }).optional())
    .query(async ({ ctx, input }) => {
      const periode = input?.periode ?? "trimestre";
      const debut = fenetreDepuis(periode);
      const records = ((await chargerRecords(ctx.user.agenceId)) as any[]).filter((o) => o.dateDiagSoumis && jourStr(o.dateOuverture) >= debut);
      const rapports = await db
        .select({ orId: orRapportsDiagnostic.orId, statut: orRapportsDiagnostic.statut })
        .from(orRapportsDiagnostic)
        .innerJoin(ordresReparation, eq(orRapportsDiagnostic.orId, ordresReparation.id))
        .where(and(eq(ordresReparation.agenceId, ctx.user.agenceId), gte(ordresReparation.createdAt, new Date(`${debut}T00:00:00`))));
      const precision = precisionDiagnostic(rapports.map((r) => ({ statut: r.statut, renvoye: false })));
      const delais = records.map((o) => ({
        id: o.id, numero: o.numero, immatriculation: o.immatriculation, clientDisplay: o.clientDisplay ?? "",
        jours: Math.round(((new Date(o.dateDiagSoumis!).getTime() - new Date(jourStr(o.dateOuverture)).getTime()) / 86400000) * 10) / 10,
        statut: o.statut, priorite: o.priorite,
      })).sort((a, b) => b.jours - a.jours);
      return {
        delaiMoyenJours: delaiDiagnosticMoyenJours(records),
        precision,
        count: records.length,
        casProblematiques: delais.slice(0, 5),
      };
    }),

  // ─── Vue Compétences / RH (fiches + comparatif techniciens) ───
  getCompetences: requirePermissionProcedure("or.consulter")
    .input(z.object({
      periode: z.enum(["jour", "semaine", "mois", "trimestre"]).default("trimestre"),
      technicienId: z.number().int().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const techs = await db
        .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom, fonction: employes.fonction })
        .from(employes)
        .where(and(eq(employes.agenceId, ctx.user.agenceId), eq(employes.statut, "actif")));
      const orsAgence = (await chargerRecords(ctx.user.agenceId)) as any[];
      const savOrs = orsAgence.filter((o) => o.savOrigineOrId);
      const fiches = techs.map((t) => {
        const score = scoreTechnicien(orsAgence, t.id, savOrs);
        const debut = fenetreDepuis(input?.periode ?? "trimestre");
        const orsPeriode = orsAgence.filter((o) => o.responsableTechnicienId === t.id && jourStr(o.dateOuverture) >= debut).length;
        return { technicien: t, ...score, orsPeriode };
      }).sort((a, b) => b.livres - a.livres);
      const fiche = input?.technicienId ? fiches.find((f) => f.technicien.id === input.technicienId) ?? null : null;
      return { fiches, fiche };
    }),

  // ─── Vue Compétitivité délais (temps réel vs standards par famille) ───
  getCompetitivite: requirePermissionProcedure("or.consulter")
    .input(z.object({ periode: z.enum(["jour", "semaine", "mois", "trimestre"]).default("trimestre") }).optional())
    .query(async ({ ctx, input }) => {
      const periode = input?.periode ?? "trimestre";
      const debut = fenetreDepuis(periode);
      const standards = await db.select().from(servicesStandards).where(and(eq(servicesStandards.agenceId, ctx.user.agenceId), eq(servicesStandards.active, true)));
      const stdMap: Record<string, { delaiCibleJours: number }> = {};
      for (const s of standards) stdMap[s.famille] = { delaiCibleJours: s.delaiCibleJours ?? 1 };

      const livrés = ((await chargerRecords(ctx.user.agenceId)) as any[]).filter(
        (o) => o.statut === "LIVRE" && o.dateCloture && jourStr(o.dateCloture) >= debut
      );
      const familles = performanceVsStandard(livrés, stdMap).map((l) => ({
        ...l,
        libelle: standards.find((s) => s.famille === l.famille)?.libelle ?? l.famille,
      }));
      return { familles, totalLivrés: livrés.length };
    }),

  // ─── Détection SAV : dernière livraison d'un véhicule dans la fenêtre paramétrée ───
  detecterSAV: requirePermissionProcedure("or.consulter")
    .input(z.object({ vehiculeId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [p] = await db.select().from(atelierParametres).where(eq(atelierParametres.agenceId, ctx.user.agenceId)).limit(1);
      const jours = p?.seuilSavJours ?? 30;
      const limite = new Date(Date.now() - jours * 86400000).toISOString().slice(0, 10);
      const [dernier] = await db
        .select({ id: ordresReparation.id, numero: ordresReparation.numero, dateCloture: ordresReparation.dateCloture, plainte: ordresReparation.plainte })
        .from(ordresReparation)
        .where(and(eq(ordresReparation.vehiculeId, input.vehiculeId), eq(ordresReparation.statut, "LIVRE")))
        .orderBy(desc(ordresReparation.dateCloture))
        .limit(1);
      if (!dernier || !dernier.dateCloture) return { savPossible: false };
      const clotureStr = new Date(dernier.dateCloture).toISOString().slice(0, 10);
      return {
        savPossible: clotureStr >= limite,
        dernierOR: dernier,
        seuilJours: jours,
      };
    }),

  // ─── Satisfaction client à la livraison ───
  noterSatisfaction: requirePermissionProcedure("or.modifier")
    .input(z.object({ orId: z.number().int(), note: z.number().int().min(1).max(5), commentaire: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [or] = await db
        .select({ id: ordresReparation.id, statut: ordresReparation.statut })
        .from(ordresReparation)
        .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });
      if (or.statut !== "LIVRE" && or.statut !== "PRET_A_LIVRER") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La satisfaction se saisit à la livraison du véhicule." });
      }
      await db.update(ordresReparation).set({ satisfactionNote: input.note, satisfactionCommentaire: input.commentaire ?? null, updatedAt: new Date() } as any).where(eq(ordresReparation.id, input.orId));
      return { success: true, note: input.note };
    }),

  // ─── Cibles KPI (lecture + upsert) ───
  getCibles: requirePermissionProcedure("or.consulter")
    .query(async ({ ctx }) => {
      return db.select().from(kpiCibles).where(eq(kpiCibles.agenceId, ctx.user.agenceId)).orderBy(kpiCibles.code);
    }),

  updateCible: requirePermissionProcedure("or.modifier")
    .input(z.object({
      code: z.string().min(1),
      cible: z.number(),
      seuilOrange: z.number().optional(),
      seuilRouge: z.number().optional(),
      unite: z.string().optional(),
      sens: z.enum(["HAUT", "BAS"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const values: Record<string, unknown> = { cible: String(input.cible), updatedAt: new Date() };
      if (input.seuilOrange !== undefined) values.seuilOrange = String(input.seuilOrange);
      if (input.seuilRouge !== undefined) values.seuilRouge = String(input.seuilRouge);
      if (input.unite !== undefined) values.unite = input.unite;
      if (input.sens !== undefined) values.sens = input.sens;
      const [existing] = await db
        .select({ id: kpiCibles.id })
        .from(kpiCibles)
        .where(and(eq(kpiCibles.agenceId, ctx.user.agenceId), eq(kpiCibles.code, input.code)))
        .limit(1);
      if (existing) {
        await db.update(kpiCibles).set(values as any).where(eq(kpiCibles.id, existing.id));
      } else {
        await db.insert(kpiCibles).values({ agenceId: ctx.user.agenceId, code: input.code, ...values } as any);
      }
      return { success: true };
    }),

  // ─── Standards de service (lecture + upsert) ───
  getServicesStandards: requirePermissionProcedure("or.consulter")
    .query(async ({ ctx }) => {
      return db.select().from(servicesStandards).where(eq(servicesStandards.agenceId, ctx.user.agenceId)).orderBy(servicesStandards.famille);
    }),

  upsertServiceStandard: requirePermissionProcedure("or.modifier")
    .input(z.object({
      id: z.number().int().optional(),
      famille: z.string().min(1),
      libelle: z.string().min(1),
      tempsStandardHeures: z.number().positive(),
      delaiCibleJours: z.number().int().min(0),
      active: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const values = {
        famille: input.famille,
        libelle: input.libelle,
        tempsStandardHeures: String(input.tempsStandardHeures),
        delaiCibleJours: input.delaiCibleJours,
        active: input.active,
      };
      if (input.id) {
        await db.update(servicesStandards).set(values as any).where(and(eq(servicesStandards.id, input.id), eq(servicesStandards.agenceId, ctx.user.agenceId)));
      } else {
        const [row] = await db.insert(servicesStandards).values({ agenceId: ctx.user.agenceId, ...values } as any).returning();
        return row;
      }
      return { success: true };
    }),

  // ─── Vue facturation direction : facturé / encaissé / restant + top clients en retard ───
  getFacturation: requirePermissionProcedure("or.consulter")
    .input(z.object({ periode: z.enum(["jour", "semaine", "mois", "trimestre"]).default("mois") }))
    .query(async ({ ctx, input }) => {
      const depuis = fenetreDepuis(input.periode);
      const ors = await db
        .select({
          id: ordresReparation.id,
          numero: ordresReparation.numero,
          venteId: ordresReparation.venteId,
          totalTTC: ordresReparation.totalTTC,
          factureTransmiseLe: ordresReparation.factureTransmiseLe,
          attenteBonCommande: ordresReparation.attenteBonCommande,
          clientId: ordresReparation.clientId,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientRaisonSociale: clients.raisonSociale,
          vehiculeImmat: vehicules.immatriculation,
          dateCloture: ordresReparation.dateCloture,
        })
        .from(ordresReparation)
        .leftJoin(clients, eq(ordresReparation.clientId, clients.id))
        .leftJoin(vehicules, eq(ordresReparation.vehiculeId, vehicules.id))
        .where(and(eq(ordresReparation.agenceId, ctx.user.agenceId), sql`${ordresReparation.dateCloture} >= ${depuis}::date`));

      let totalFacture = 0, totalPaye = 0, totalMarge = 0;
      const etats = { NON_TRANSMISE: 0, ATTENTE_BON_COMMANDE: 0, ATTENTE_PAIEMENT: 0, AVANCE: 0, PAYEE: 0 };
      const parClient = new Map<number, { client: string; facture: number; paye: number; reste: number; ors: number }>();
      const lignes: Record<number, { totalLigne: string | null; coutUnitaire: string | null; quantite: number }[]> = {};
      const ids = ors.map((o) => o.venteId).filter(Boolean) as number[];

      if (ids.length) {
        const vRows = await db.select({ id: ventes.id, montantTotal: ventes.montantTotal, montantPaye: ventes.montantPaye }).from(ventes).where(sql`${ventes.id} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
        const vMap = new Map(vRows.map((v) => [v.id, v]));
        const lRows = await db.select({ venteId: ventesLignes.venteId, totalLigne: ventesLignes.totalLigne, coutUnitaire: ventesLignes.coutUnitaire, quantite: ventesLignes.quantite }).from(ventesLignes).where(sql`${ventesLignes.venteId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
        for (const l of lRows) (lignes[l.venteId] ??= []).push(l);

        for (const o of ors) {
          if (!o.venteId) continue;
          const v = vMap.get(o.venteId);
          if (!v) continue;
          const total = Number(v.montantTotal ?? 0);
          const paye = Number(v.montantPaye ?? 0);
          const margeLignes = lignes[o.venteId] ?? [];
          const marge = margeLignes.reduce((s, l) => s + (Number(l.totalLigne ?? 0) - (l.coutUnitaire != null ? Number(l.coutUnitaire) * Number(l.quantite) : 0)), 0);
          totalFacture += total; totalPaye += paye; totalMarge += marge;
          let etat: keyof typeof etats;
          if (paye >= total && total > 0) etat = "PAYEE";
          else if (paye > 0) etat = "AVANCE";
          else if (o.attenteBonCommande) etat = "ATTENTE_BON_COMMANDE";
          else if (o.factureTransmiseLe) etat = "ATTENTE_PAIEMENT";
          else etat = "NON_TRANSMISE";
          etats[etat]++;
          const key = o.clientId ?? 0;
          const pc = parClient.get(key) ?? { client: o.clientRaisonSociale ?? `${o.clientPrenom ?? ""} ${o.clientNom ?? ""}`.trim(), facture: 0, paye: 0, reste: 0, ors: 0 };
          pc.facture += total; pc.paye += paye; pc.reste += total - paye; pc.ors++;
          parClient.set(key, pc);
        }
      }

      const topClientsRetard = [...parClient.values()]
        .filter((p) => p.reste > 0)
        .sort((a, b) => b.reste - a.reste)
        .slice(0, 8);

      return {
        totalFacture, totalPaye, totalReste: totalFacture - totalPaye, totalMarge,
        etats, topClientsRetard,
        tauxRecouvrement: totalFacture > 0 ? Math.round((totalPaye / totalFacture) * 1000) / 10 : null,
      };
    }),
});