import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  vehicules,
  clients,
  ordresReparation,
  contratsMaintenance,
  contratsMaintenanceVehicules,
} from "@atelierone/db";
import { eq, and, desc, sql, or, ilike } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  transitionStatutVehiculeValide,
  STATUTS_IMMOBILISATION,
  CARBURANTS,
  TYPES_VEHICULE,
} from "~/server/lib/vehicule-service";

/** MODULE VÉHICULES & ATELIER — parc, fiche, statuts d'immobilisation, historique. */
export const vehiculesRouter = createTRPCRouter({
  // ─── Liste du parc ───
  list: requirePermissionProcedure("vehicules.consulter")
    .input(
      z.object({
        search: z.string().optional(),
        statut: z.string().optional(),
        clientId: z.number().int().optional(),
        typeVehicule: z.string().optional(),
        limit: z.number().int().min(10).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(vehicules.agenceId, ctx.user.agenceId), eq(vehicules.isActive, true)];
      if (safe.statut) conditions.push(eq(vehicules.statutImmobilisation, safe.statut));
      if (safe.clientId) conditions.push(eq(vehicules.clientId, safe.clientId));
      if (safe.typeVehicule) conditions.push(eq(vehicules.typeVehicule, safe.typeVehicule));
      if (safe.search?.trim()) {
        const q = `%${safe.search.trim()}%`;
        conditions.push(
          or(
            ilike(vehicules.immatriculation, q),
            ilike(vehicules.marque, q),
            ilike(vehicules.modele, q),
            ilike(clients.nom, q),
            ilike(clients.raisonSociale, q),
          )!
        );
      }
      const rows = await db
        .select({
          id: vehicules.id,
          immatriculation: vehicules.immatriculation,
          marque: vehicules.marque,
          modele: vehicules.modele,
          annee: vehicules.annee,
          couleur: vehicules.couleur,
          typeVehicule: vehicules.typeVehicule,
          carburant: vehicules.carburant,
          kilometrage: vehicules.kilometrage,
          statutImmobilisation: vehicules.statutImmobilisation,
          clientId: vehicules.clientId,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientRaisonSociale: clients.raisonSociale,
          createdAt: vehicules.createdAt,
        })
        .from(vehicules)
        .leftJoin(clients, eq(vehicules.clientId, clients.id))
        .where(and(...conditions))
        .orderBy(desc(vehicules.createdAt))
        .limit(safe.limit)
        .offset(safe.offset);
      const [count] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(vehicules)
        .leftJoin(clients, eq(vehicules.clientId, clients.id))
        .where(and(...conditions));
      return { vehicules: rows, total: count?.n ?? 0 };
    }),

  // ─── Fiche véhicule (historique OR + contrat actif) ───
  get: requirePermissionProcedure("vehicules.consulter")
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [vehicule] = await db
        .select({
          id: vehicules.id,
          agenceId: vehicules.agenceId,
          clientId: vehicules.clientId,
          immatriculation: vehicules.immatriculation,
          marque: vehicules.marque,
          modele: vehicules.modele,
          annee: vehicules.annee,
          couleur: vehicules.couleur,
          numeroChassis: vehicules.numeroChassis,
          kilometrage: vehicules.kilometrage,
          carburant: vehicules.carburant,
          typeVehicule: vehicules.typeVehicule,
          statutImmobilisation: vehicules.statutImmobilisation,
          siteId: vehicules.siteId,
          emplacementId: vehicules.emplacementId,
          notes: vehicules.notes,
          createdAt: vehicules.createdAt,
        })
        .from(vehicules)
        .where(and(eq(vehicules.id, input.id), eq(vehicules.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!vehicule) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });

      const [client] = vehicule.clientId
        ? await db.select().from(clients).where(eq(clients.id, vehicule.clientId)).limit(1)
        : [null];

      const historiqueOR = await db
        .select({
          id: ordresReparation.id,
          numero: ordresReparation.numero,
          statut: ordresReparation.statut,
          plainte: ordresReparation.plainte,
          dateOuverture: ordresReparation.dateOuverture,
          dateCloture: ordresReparation.dateCloture,
          totalTTC: ordresReparation.totalTTC,
        })
        .from(ordresReparation)
        .where(eq(ordresReparation.vehiculeId, input.id))
        .orderBy(desc(ordresReparation.dateOuverture))
        .limit(50);

      const liaisonContrat = await db
        .select({
          id: contratsMaintenanceVehicules.id,
          contratId: contratsMaintenanceVehicules.contratId,
          immatriculationTemp: contratsMaintenanceVehicules.immatriculationTemp,
          actif: contratsMaintenanceVehicules.actif,
          numeroContrat: contratsMaintenance.numeroContrat,
          libelle: contratsMaintenance.libelle,
          statutContrat: contratsMaintenance.statut,
          typeContrat: contratsMaintenance.typeContrat,
          dateFin: contratsMaintenance.dateFin,
        })
        .from(contratsMaintenanceVehicules)
        .leftJoin(contratsMaintenance, eq(contratsMaintenanceVehicules.contratId, contratsMaintenance.id))
        .where(and(eq(contratsMaintenanceVehicules.vehiculeId, input.id), eq(contratsMaintenanceVehicules.actif, true)))
        .limit(5);

      return { vehicule, client, historiqueOR, contrats: liaisonContrat };
    }),

  // ─── Création ───
  create: requirePermissionProcedure("vehicules.creer")
    .input(
      z.object({
        immatriculation: z.string().min(1).max(50),
        clientId: z.number().int().optional(),
        marque: z.string().optional(),
        modele: z.string().optional(),
        annee: z.number().int().min(1900).max(2100).optional(),
        couleur: z.string().optional(),
        numeroChassis: z.string().optional(),
        kilometrage: z.number().int().min(0).optional(),
        carburant: z.enum(CARBURANTS).optional(),
        typeVehicule: z.enum(TYPES_VEHICULE).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [dup] = await db
        .select({ id: vehicules.id })
        .from(vehicules)
        .where(and(eq(vehicules.immatriculation, input.immatriculation.trim()), eq(vehicules.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (dup) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette immatriculation existe déjà dans votre agence." });

      if (input.clientId) {
        const [client] = await db
          .select({ id: clients.id, statut: clients.statut })
          .from(clients)
          .where(and(eq(clients.id, input.clientId), eq(clients.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable." });
      }

      const [row] = await db
        .insert(vehicules)
        .values({
          agenceId: ctx.user.agenceId,
          immatriculation: input.immatriculation.trim(),
          clientId: input.clientId ?? null,
          marque: input.marque ?? null,
          modele: input.modele ?? null,
          annee: input.annee ?? null,
          couleur: input.couleur ?? null,
          numeroChassis: input.numeroChassis ?? null,
          kilometrage: input.kilometrage ?? 0,
          carburant: input.carburant ?? null,
          typeVehicule: input.typeVehicule ?? "voiture",
          statutImmobilisation: "en_reception",
          notes: input.notes ?? null,
          isActive: true,
        } as any)
        .returning();
      return row;
    }),

  // ─── Mise à jour ───
  update: requirePermissionProcedure("vehicules.modifier")
    .input(
      z.object({
        id: z.number().int(),
        clientId: z.number().int().optional().nullable(),
        marque: z.string().optional(),
        modele: z.string().optional(),
        annee: z.number().int().min(1900).max(2100).optional(),
        couleur: z.string().optional(),
        numeroChassis: z.string().optional(),
        kilometrage: z.number().int().min(0).optional(),
        carburant: z.enum(CARBURANTS).optional(),
        typeVehicule: z.enum(TYPES_VEHICULE).optional(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [existing] = await db
        .select({ id: vehicules.id })
        .from(vehicules)
        .where(and(eq(vehicules.id, id), eq(vehicules.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });
      const updateData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) updateData[k] = v;
      }
      updateData.updatedAt = new Date();
      await db.update(vehicules).set(updateData as any).where(eq(vehicules.id, id));
      return { success: true };
    }),

  // ─── Changement de statut d'immobilisation (workflow atelier) ───
  changerStatut: requirePermissionProcedure("vehicules.modifier")
    .input(z.object({ id: z.number().int(), nouveauStatut: z.enum(STATUTS_IMMOBILISATION), motif: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [vehicule] = await db
        .select({ id: vehicules.id, statutImmobilisation: vehicules.statutImmobilisation, notes: vehicules.notes })
        .from(vehicules)
        .where(and(eq(vehicules.id, input.id), eq(vehicules.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!vehicule) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });
      if (!transitionStatutVehiculeValide(vehicule.statutImmobilisation, input.nouveauStatut)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Transition « ${vehicule.statutImmobilisation} → ${input.nouveauStatut} » non autorisée.` });
      }
      await db
        .update(vehicules)
        .set({
          statutImmobilisation: input.nouveauStatut,
          notes: input.motif ? `${vehicule.notes ? vehicule.notes + "\n" : ""}[${new Date().toISOString().slice(0, 10)}] ${input.motif}` : vehicule.notes,
          updatedAt: new Date(),
        } as any)
        .where(eq(vehicules.id, input.id));
      return { success: true, statut: input.nouveauStatut };
    }),

  // ─── Lier à un contrat de maintenance ───
  lierContrat: requirePermissionProcedure("vehicules.modifier")
    .input(z.object({ vehiculeId: z.number().int(), contratId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [contrat] = await db
        .select({ id: contratsMaintenance.id, statut: contratsMaintenance.statut })
        .from(contratsMaintenance)
        .where(and(eq(contratsMaintenance.id, input.contratId), eq(contratsMaintenance.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!contrat) throw new TRPCError({ code: "NOT_FOUND", message: "Contrat introuvable." });
      if (contrat.statut !== "ACTIF" && contrat.statut !== "RENOUVELLE") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Seul un contrat ACTIF peut couvrir un véhicule." });
      }
      const [dup] = await db
        .select({ id: contratsMaintenanceVehicules.id })
        .from(contratsMaintenanceVehicules)
        .where(and(eq(contratsMaintenanceVehicules.contratId, input.contratId), eq(contratsMaintenanceVehicules.vehiculeId, input.vehiculeId), eq(contratsMaintenanceVehicules.actif, true)))
        .limit(1);
      if (dup) throw new TRPCError({ code: "BAD_REQUEST", message: "Ce véhicule est déjà couvert par ce contrat." });
      const [row] = await db
        .insert(contratsMaintenanceVehicules)
        .values({ contratId: input.contratId, vehiculeId: input.vehiculeId, dateAjout: new Date().toISOString().slice(0, 10), actif: true } as any)
        .returning();
      return row;
    }),

  retirerContrat: requirePermissionProcedure("vehicules.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(contratsMaintenanceVehicules)
        .set({ actif: false, dateRetrait: new Date().toISOString().slice(0, 10) } as any)
        .where(eq(contratsMaintenanceVehicules.id, input.id));
      return { success: true };
    }),

  // ─── Contrats actifs disponibles pour la liaison ───
  listContratsActifs: requirePermissionProcedure("vehicules.consulter")
    .query(async ({ ctx }) => {
      return db
        .select({
          id: contratsMaintenance.id,
          numeroContrat: contratsMaintenance.numeroContrat,
          libelle: contratsMaintenance.libelle,
          clientId: contratsMaintenance.clientId,
          clientNom: clients.nom,
          clientRaisonSociale: clients.raisonSociale,
          typeContrat: contratsMaintenance.typeContrat,
        })
        .from(contratsMaintenance)
        .leftJoin(clients, eq(contratsMaintenance.clientId, clients.id))
        .where(and(eq(contratsMaintenance.agenceId, ctx.user.agenceId), eq(contratsMaintenance.statut, "ACTIF")))
        .orderBy(desc(contratsMaintenance.dateDebut))
        .limit(100);
    }),
});