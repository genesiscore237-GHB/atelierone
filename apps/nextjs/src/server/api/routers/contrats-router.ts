import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  contratsMaintenance,
  contratsMaintenanceVehicules,
  clients,
  vehicules,
} from "@atelierone/db";
import { eq, and, desc, sql, or, ilike } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  genererNumeroContrat,
  transitionStatutContratValide,
  verifierContratActif,
  statutContratEffectif,
} from "~/server/lib/client-service";

/** MODULE CONTRATS DE MAINTENANCE — cycle de vie complet + véhicules couverts. */
export const contratsRouter = createTRPCRouter({
  // ─── Liste ───
  list: requirePermissionProcedure("contrats.consulter")
    .input(
      z.object({
        clientId: z.number().int().optional(),
        statut: z.string().optional(),
        typeContrat: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().int().min(10).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(contratsMaintenance.agenceId, ctx.user.agenceId)];
      if (safe.clientId) conditions.push(eq(contratsMaintenance.clientId, safe.clientId));
      if (safe.statut) conditions.push(eq(contratsMaintenance.statut, safe.statut));
      if (safe.typeContrat) conditions.push(eq(contratsMaintenance.typeContrat, safe.typeContrat));
      if (safe.search?.trim()) {
        const q = `%${safe.search.trim()}%`;
        conditions.push(or(ilike(contratsMaintenance.numeroContrat, q), ilike(contratsMaintenance.libelle, q), ilike(clients.nom, q), ilike(clients.raisonSociale, q))!);
      }
      const rows = await db
        .select({
          id: contratsMaintenance.id,
          numeroContrat: contratsMaintenance.numeroContrat,
          libelle: contratsMaintenance.libelle,
          clientId: contratsMaintenance.clientId,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientRaisonSociale: clients.raisonSociale,
          typeContrat: contratsMaintenance.typeContrat,
          dateDebut: contratsMaintenance.dateDebut,
          dateFin: contratsMaintenance.dateFin,
          statut: contratsMaintenance.statut,
          montantForfait: contratsMaintenance.montantForfait,
          frequenceFacturation: contratsMaintenance.frequenceFacturation,
          remisePourcent: contratsMaintenance.remisePourcent,
          createdAt: contratsMaintenance.createdAt,
        })
        .from(contratsMaintenance)
        .leftJoin(clients, eq(contratsMaintenance.clientId, clients.id))
        .where(and(...conditions))
        .orderBy(desc(contratsMaintenance.createdAt))
        .limit(safe.limit)
        .offset(safe.offset);
      const [count] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(contratsMaintenance)
        .leftJoin(clients, eq(contratsMaintenance.clientId, clients.id))
        .where(and(...conditions));
      const today = new Date().toISOString().slice(0, 10);
      return {
        contrats: rows.map((c) => ({ ...c, statutEffectif: statutContratEffectif(c.statut ?? "BROUILLON", c.dateDebut, c.dateFin, today) })),
        total: count?.n ?? 0,
      };
    }),

  // ─── Fiche contrat + véhicules couverts ───
  get: requirePermissionProcedure("contrats.consulter")
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [contrat] = await db
        .select()
        .from(contratsMaintenance)
        .where(and(eq(contratsMaintenance.id, input.id), eq(contratsMaintenance.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!contrat) throw new TRPCError({ code: "NOT_FOUND", message: "Contrat introuvable." });
      const vehiculesCouverts = await db
        .select({
          id: contratsMaintenanceVehicules.id,
          vehiculeId: contratsMaintenanceVehicules.vehiculeId,
          immatriculationTemp: contratsMaintenanceVehicules.immatriculationTemp,
          dateAjout: contratsMaintenanceVehicules.dateAjout,
          dateRetrait: contratsMaintenanceVehicules.dateRetrait,
          actif: contratsMaintenanceVehicules.actif,
          notes: contratsMaintenanceVehicules.notes,
          immatriculation: vehicules.immatriculation,
          marque: vehicules.marque,
          modele: vehicules.modele,
        })
        .from(contratsMaintenanceVehicules)
        .leftJoin(vehicules, eq(contratsMaintenanceVehicules.vehiculeId, vehicules.id))
        .where(eq(contratsMaintenanceVehicules.contratId, input.id))
        .orderBy(desc(contratsMaintenanceVehicules.dateAjout));
      const [client] = await db.select().from(clients).where(eq(clients.id, contrat.clientId)).limit(1);
      return { contrat, vehiculesCouverts, client };
    }),

  // ─── Création ───
  create: requirePermissionProcedure("contrats.creer")
    .input(
      z.object({
        clientId: z.number().int(),
        libelle: z.string().min(3),
        typeContrat: z.enum(["FORFAIT_MENSUEL", "FORFAIT_ANNUEL", "A_LA_DEMANDE", "PREVENTIF_PROGRAMME", "MIXTE"]).default("A_LA_DEMANDE"),
        dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dateFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dateSignature: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        montantForfait: z.number().optional(),
        frequenceFacturation: z.enum(["MENSUELLE", "TRIMESTRIELLE", "ANNUELLE", "A_LA_DEMANDE"]).default("A_LA_DEMANDE"),
        delaiPaiementJours: z.number().optional(),
        delaiInterventionHeures: z.number().optional(),
        couverture: z.string().optional(),
        remisePourcent: z.number().optional(),
        conditionsParticulieres: z.string().optional(),
        responsableInterne: z.number().int().optional(),
        notes: z.string().optional(),
        statutInitial: z.enum(["BROUILLON", "ACTIF"]).default("BROUILLON"),
        vehicules: z.array(z.object({
          vehiculeId: z.number().int().optional(),
          immatriculationTemp: z.string().optional(),
        })).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [client] = await db
        .select({ id: clients.id, statut: clients.statut })
        .from(clients)
        .where(and(eq(clients.id, input.clientId), eq(clients.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable." });
      if (input.statutInitial === "ACTIF" && input.dateDebut > new Date().toISOString().slice(0, 10)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Un contrat ACTIF doit avoir une date de début ≤ aujourd'hui." });
      }
      if (input.dateFin && input.dateFin < input.dateDebut) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La date de fin doit suivre la date de début." });
      }
      if (input.vehicules?.length) {
        for (const v of input.vehicules) {
          if (!v.vehiculeId && !v.immatriculationTemp) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Chaque véhicule du contrat doit être identifié (véhicule existant ou immatriculation provisoire)." });
          }
        }
      }

      const [last] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(contratsMaintenance)
        .where(and(eq(contratsMaintenance.agenceId, ctx.user.agenceId), sql`${contratsMaintenance.numeroContrat} LIKE ${`CONT-${new Date().getFullYear()}-%`}`));
      const numeroContrat = genererNumeroContrat((last?.n ?? 0) + 1);

      const [contrat] = await db
        .insert(contratsMaintenance)
        .values({
          agenceId: ctx.user.agenceId,
          clientId: input.clientId,
          numeroContrat,
          libelle: input.libelle,
          typeContrat: input.typeContrat,
          dateDebut: input.dateDebut,
          dateFin: input.dateFin ?? null,
          dateSignature: input.dateSignature ?? null,
          statut: input.statutInitial,
          montantForfait: input.montantForfait != null ? String(input.montantForfait) : null,
          frequenceFacturation: input.frequenceFacturation,
          delaiPaiementJours: input.delaiPaiementJours ?? 0,
          delaiInterventionHeures: input.delaiInterventionHeures ?? null,
          couverture: input.couverture ?? "PIECES_ET_MO",
          remisePourcent: input.remisePourcent != null ? String(input.remisePourcent) : "0",
          conditionsParticulieres: input.conditionsParticulieres ?? null,
          responsableInterne: input.responsableInterne ?? null,
          notes: input.notes ?? null,
          createdBy: Number(ctx.user.id),
        } as any)
        .returning();

      for (const v of input.vehicules ?? []) {
        await db.insert(contratsMaintenanceVehicules).values({
          contratId: contrat.id,
          vehiculeId: v.vehiculeId ?? null,
          immatriculationTemp: v.immatriculationTemp ?? null,
          dateAjout: new Date().toISOString().slice(0, 10),
          actif: true,
        } as any);
      }
      return { id: contrat.id, numeroContrat, statut: contrat.statut };
    }),

  // ─── Mise à jour (brouillon) ───
  update: requirePermissionProcedure("contrats.modifier")
    .input(z.object({
      id: z.number().int(),
      libelle: z.string().optional(),
      typeContrat: z.string().optional(),
      dateDebut: z.string().optional(),
      dateFin: z.string().optional().nullable(),
      dateSignature: z.string().optional().nullable(),
      montantForfait: z.number().optional(),
      frequenceFacturation: z.string().optional(),
      delaiPaiementJours: z.number().optional(),
      delaiInterventionHeures: z.number().optional(),
      couverture: z.string().optional(),
      remisePourcent: z.number().optional(),
      conditionsParticulieres: z.string().optional().nullable(),
      responsableInterne: z.number().int().optional().nullable(),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [contrat] = await db
        .select({ id: contratsMaintenance.id, statut: contratsMaintenance.statut })
        .from(contratsMaintenance)
        .where(and(eq(contratsMaintenance.id, id), eq(contratsMaintenance.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!contrat) throw new TRPCError({ code: "NOT_FOUND", message: "Contrat introuvable." });
      if (contrat.statut !== "BROUILLON") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Seul un contrat BROUILLON est modifiable. Utilisez les actions dédiées (activer, suspendre, résilier, renouveler)." });
      }
      const updateData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) updateData[k] = v === null ? null : v;
      }
      if (updateData.montantForfait !== undefined && updateData.montantForfait !== null) updateData.montantForfait = String(updateData.montantForfait);
      if (updateData.remisePourcent !== undefined && updateData.remisePourcent !== null) updateData.remisePourcent = String(updateData.remisePourcent);
      updateData.updatedAt = new Date();
      await db.update(contratsMaintenance).set(updateData as any).where(eq(contratsMaintenance.id, id));
      return { success: true };
    }),

  // ─── Cycle de vie : activer / suspendre / résilier / renouveler ───
  activer: requirePermissionProcedure("contrats.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      return changerStatutContrat(ctx.user.agenceId, input.id, "ACTIF");
    }),

  suspendre: requirePermissionProcedure("contrats.modifier")
    .input(z.object({ id: z.number().int(), motif: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return changerStatutContrat(ctx.user.agenceId, input.id, "SUSPENDU", input.motif);
    }),

  resilier: requirePermissionProcedure("contrats.modifier")
    .input(z.object({ id: z.number().int(), motif: z.string().min(3, "Le motif de résiliation est obligatoire") }))
    .mutation(async ({ ctx, input }) => {
      const [contrat] = await db
        .select()
        .from(contratsMaintenance)
        .where(and(eq(contratsMaintenance.id, input.id), eq(contratsMaintenance.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!contrat) throw new TRPCError({ code: "NOT_FOUND", message: "Contrat introuvable." });
      const t = transitionStatutContratValide(contrat.statut, "RESILIE", input.motif);
      if (!t.ok) throw new TRPCError({ code: "BAD_REQUEST", message: t.raison ?? "Résiliation non autorisée." });
      await db
        .update(contratsMaintenance)
        .set({
          statut: "RESILIE",
          dateResiliation: new Date().toISOString().slice(0, 10),
          motifResiliation: input.motif,
          dateFin: contrat.dateFin ?? new Date().toISOString().slice(0, 10),
          updatedAt: new Date(),
        } as any)
        .where(eq(contratsMaintenance.id, input.id));
      await db.update(contratsMaintenanceVehicules).set({ actif: false } as any).where(eq(contratsMaintenanceVehicules.contratId, input.id));
      return { success: true, statut: "RESILIE" };
    }),

  renouveler: requirePermissionProcedure("contrats.modifier")
    .input(z.object({ id: z.number().int(), nouvelleFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }))
    .mutation(async ({ ctx, input }) => {
      const [contrat] = await db
        .select()
        .from(contratsMaintenance)
        .where(and(eq(contratsMaintenance.id, input.id), eq(contratsMaintenance.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!contrat) throw new TRPCError({ code: "NOT_FOUND", message: "Contrat introuvable." });
      const t = transitionStatutContratValide(contrat.statut, "RENOUVELLE");
      if (!t.ok) throw new TRPCError({ code: "BAD_REQUEST", message: t.raison ?? "Renouvellement non autorisé." });
      const nouvelleFin = input.nouvelleFin ?? prolongerDuree(contrat.dateDebut, contrat.dateFin, contrat.typeContrat);
      await db
        .update(contratsMaintenance)
        .set({ statut: "RENOUVELLE", dateFin: nouvelleFin, updatedAt: new Date() } as any)
        .where(eq(contratsMaintenance.id, input.id));
      await db.update(contratsMaintenanceVehicules).set({ actif: true } as any).where(eq(contratsMaintenanceVehicules.contratId, input.id));
      return { success: true, statut: "RENOUVELLE", nouvelleFin };
    }),

  // ─── Véhicules couverts ───
  ajouterVehicule: requirePermissionProcedure("contrats.modifier")
    .input(z.object({ contratId: z.number().int(), vehiculeId: z.number().int().optional(), immatriculationTemp: z.string().optional(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [contrat] = await db
        .select({ id: contratsMaintenance.id, statut: contratsMaintenance.statut })
        .from(contratsMaintenance)
        .where(and(eq(contratsMaintenance.id, input.contratId), eq(contratsMaintenance.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!contrat) throw new TRPCError({ code: "NOT_FOUND", message: "Contrat introuvable." });
      if (contrat.statut === "RESILIE") throw new TRPCError({ code: "BAD_REQUEST", message: "Un contrat résilié ne peut plus recevoir de véhicules." });
      if (!input.vehiculeId && !input.immatriculationTemp) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Identifiez le véhicule (existant ou immatriculation provisoire)." });
      }
      const [row] = await db
        .insert(contratsMaintenanceVehicules)
        .values({
          contratId: input.contratId,
          vehiculeId: input.vehiculeId ?? null,
          immatriculationTemp: input.immatriculationTemp ?? null,
          dateAjout: new Date().toISOString().slice(0, 10),
          actif: true,
          notes: input.notes ?? null,
        } as any)
        .returning();
      return row;
    }),

  retirerVehicule: requirePermissionProcedure("contrats.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(contratsMaintenanceVehicules)
        .set({ actif: false, dateRetrait: new Date().toISOString().slice(0, 10) } as any)
        .where(eq(contratsMaintenanceVehicules.id, input.id));
      return { success: true };
    }),
});

async function changerStatutContrat(agenceId: number, id: number, vers: string, motif?: string) {
  const [contrat] = await db
    .select()
    .from(contratsMaintenance)
    .where(and(eq(contratsMaintenance.id, id), eq(contratsMaintenance.agenceId, agenceId)))
    .limit(1);
  if (!contrat) throw new TRPCError({ code: "NOT_FOUND", message: "Contrat introuvable." });
  const t = transitionStatutContratValide(contrat.statut, vers, motif);
  if (!t.ok) throw new TRPCError({ code: "BAD_REQUEST", message: t.raison ?? `Transition « ${contrat.statut} → ${vers} » non autorisée.` });
  if (vers === "ACTIF") {
    const okActif = verifierContratActif(contrat.dateDebut, contrat.dateFin);
    if (!okActif) throw new TRPCError({ code: "BAD_REQUEST", message: "Impossible d'activer : le contrat est hors de sa période de validité (vérifiez les dates)." });
  }
  await db.update(contratsMaintenance).set({ statut: vers, updatedAt: new Date() } as any).where(eq(contratsMaintenance.id, id));
  return { success: true, statut: vers };
}

function prolongerDuree(dateDebut: string, dateFin: string | null, typeContrat: string | null): string {
  const base = dateFin ?? dateDebut;
  const d = new Date(`${base}T00:00:00`);
  const mois = typeContrat === "FORFAIT_ANNUEL" ? 12 : typeContrat === "FORFAIT_MENSUEL" ? 1 : 12;
  d.setMonth(d.getMonth() + mois);
  return d.toISOString().slice(0, 10);
}