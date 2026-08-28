import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  fournisseurs,
  facturesFournisseur,
  achats,
  clients,
  ordresReparation,
  vehicules,
} from "@atelierone/db";
import { eq, and, or, ilike, desc, sql, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { TYPES_SERVICE, CATEGORIES_DEPENSE } from "~/server/lib/fournisseurs-types";

/**
 * MODULE FOURNISSEURS & FACTURES — socle commun tous prestataires.
 * Circuit PIECES : fournisseurs liés au stock / OR / véhicules (traçabilité forte).
 * Circuit CHARGES : prestataires de services généraux (électricité, nettoyage…).
 * Une seule fiche fournisseur + une seule archive de factures (avec scan).
 */

export const fournisseursRouter = createTRPCRouter({
  // ─── Référentiel : liste avec recherche intelligente ───
  list: requirePermissionProcedure("achats.consulter")
    .input(
      z.object({
        q: z.string().optional(),
        typeService: z.string().optional(),
        circuit: z.string().optional(),
        inclureInactifs: z.boolean().optional(),
        limit: z.number().int().min(10).max(200).default(100),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(fournisseurs.agenceId, ctx.user.agenceId)];
      if (!safe.inclureInactifs) conditions.push(eq(fournisseurs.isActive, true));
      if (safe.typeService) conditions.push(eq(fournisseurs.typeService, safe.typeService));
      if (safe.circuit) conditions.push(eq(fournisseurs.circuit, safe.circuit));
      if (safe.q?.trim()) {
        const q = `%${safe.q.trim()}%`;
        conditions.push(
          or(
            ilike(fournisseurs.nom, q),
            ilike(fournisseurs.contact, q),
            ilike(fournisseurs.telephone, q),
            ilike(fournisseurs.ville, q),
            ilike(fournisseurs.niuNif, q),
            ilike(fournisseurs.notes, q),
          )!
        );
      }
      const [rows, count] = await Promise.all([
        db
          .select({
            id: fournisseurs.id,
            nom: fournisseurs.nom,
            code: fournisseurs.code,
            contact: fournisseurs.contact,
            telephone: fournisseurs.telephone,
            email: fournisseurs.email,
            ville: fournisseurs.ville,
            typeService: fournisseurs.typeService,
            circuit: fournisseurs.circuit,
            conditionsPaiement: fournisseurs.conditionsPaiement,
            niuNif: fournisseurs.niuNif,
            rccm: fournisseurs.rccm,
            notes: fournisseurs.notes,
            isActive: fournisseurs.isActive,
            createdAt: fournisseurs.createdAt,
          })
          .from(fournisseurs)
          .where(and(...conditions))
          .orderBy(fournisseurs.nom)
          .limit(safe.limit),
        db.select({ n: sql<number>`count(*)::int` }).from(fournisseurs).where(and(...conditions)),
      ]);
      return { fournisseurs: rows, total: count?.[0]?.n ?? 0 };
    }),

  // ─── Fiche fournisseur : infos + stats + factures ───
  get: requirePermissionProcedure("achats.consulter")
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [f] = await db
        .select()
        .from(fournisseurs)
        .where(and(eq(fournisseurs.id, input.id), eq(fournisseurs.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Fournisseur introuvable." });

      const factures = await db
        .select({
          id: facturesFournisseur.id,
          reference: facturesFournisseur.reference,
          libelle: facturesFournisseur.libelle,
          categorieDepense: facturesFournisseur.categorieDepense,
          circuit: facturesFournisseur.circuit,
          modePaiement: facturesFournisseur.modePaiement,
          montantTTC: facturesFournisseur.montantTTC,
          montantPaye: facturesFournisseur.montantPaye,
          montantRestant: facturesFournisseur.montantRestant,
          statut: facturesFournisseur.statut,
          dateFacture: facturesFournisseur.dateFacture,
          numeroFactureFournisseur: facturesFournisseur.numeroFactureFournisseur,
          fichierUrl: facturesFournisseur.fichierUrl,
          notes: facturesFournisseur.notes,
          achatId: facturesFournisseur.achatId,
          createdAt: facturesFournisseur.createdAt,
        })
        .from(facturesFournisseur)
        .where(eq(facturesFournisseur.fournisseurId, input.id))
        .orderBy(desc(facturesFournisseur.dateFacture))
        .limit(100);

      const stats = factures.reduce(
        (acc, fx) => {
          const ttc = Number(fx.montantTTC ?? 0);
          const paye = Number(fx.montantPaye ?? 0);
          acc.totalTTC += ttc;
          acc.totalPaye += paye;
          acc.totalRestant += Math.max(0, ttc - paye);
          acc.nbFactures++;
          if (fx.statut === "paye") acc.payees++;
          if (fx.statut === "impayee" || fx.statut === "partielle") acc.impayees++;
          if (fx.circuit === "CHARGES") acc.charges++;
          else acc.pieces++;
          return acc;
        },
        { totalTTC: 0, totalPaye: 0, totalRestant: 0, nbFactures: 0, payees: 0, impayees: 0, charges: 0, pieces: 0 }
      );

      const nbCommandes = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(achats)
        .where(and(eq(achats.fournisseurId, input.id), eq(achats.agenceId, ctx.user.agenceId)));

      return { fournisseur: f, factures, stats: { ...stats, nbCommandes: nbCommandes?.[0]?.n ?? 0 } };
    }),

  // ─── Création (tous types de prestataires) ───
  create: requirePermissionProcedure("achats.commander")
    .input(
      z.object({
        nom: z.string().min(1).max(255),
        typeService: z.enum(TYPES_SERVICE).default("AUTRE"),
        circuit: z.enum(["PIECES", "CHARGES"]).default("PIECES"),
        contact: z.string().optional(),
        telephone: z.string().optional(),
        email: z.string().optional(),
        adresse: z.string().optional(),
        ville: z.string().optional(),
        conditionsPaiement: z.string().optional(),
        niuNif: z.string().optional(),
        rccm: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select({ id: fournisseurs.id })
        .from(fournisseurs)
        .where(and(eq(fournisseurs.nom, input.nom.trim()), eq(fournisseurs.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Un fournisseur avec ce nom existe déjà." });
      const code = `F-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
      const [row] = await db
        .insert(fournisseurs)
        .values({
          agenceId: ctx.user.agenceId,
          nom: input.nom.trim(),
          code,
          typeService: input.typeService,
          circuit: input.circuit,
          contact: input.contact ?? null,
          telephone: input.telephone ?? null,
          email: input.email ?? null,
          adresse: input.adresse ?? null,
          ville: input.ville ?? null,
          conditionsPaiement: input.conditionsPaiement ?? null,
          niuNif: input.niuNif ?? null,
          rccm: input.rccm ?? null,
          notes: input.notes ?? null,
          isActive: true,
        } as any)
        .returning();
      return row;
    }),

  // ─── Mise à jour de la fiche ───
  update: requirePermissionProcedure("achats.commander")
    .input(
      z.object({
        id: z.number().int(),
        nom: z.string().min(1).optional(),
        typeService: z.enum(TYPES_SERVICE).optional(),
        circuit: z.enum(["PIECES", "CHARGES"]).optional(),
        contact: z.string().optional().nullable(),
        telephone: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        adresse: z.string().optional().nullable(),
        ville: z.string().optional().nullable(),
        conditionsPaiement: z.string().optional().nullable(),
        niuNif: z.string().optional().nullable(),
        rccm: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [existing] = await db
        .select({ id: fournisseurs.id })
        .from(fournisseurs)
        .where(and(eq(fournisseurs.id, id), eq(fournisseurs.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Fournisseur introuvable." });
      const updateData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) updateData[k] = v;
      updateData.updatedAt = new Date();
      await db.update(fournisseurs).set(updateData as any).where(eq(fournisseurs.id, id));
      return { success: true };
    }),

  // ─── Désactivation / réactivation (jamais de suppression dure : archive vivante) ───
  changerStatut: requirePermissionProcedure("achats.commander")
    .input(z.object({ id: z.number().int(), actif: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select({ id: fournisseurs.id })
        .from(fournisseurs)
        .where(and(eq(fournisseurs.id, input.id), eq(fournisseurs.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Fournisseur introuvable." });
      await db.update(fournisseurs).set({ isActive: input.actif, updatedAt: new Date() } as any).where(eq(fournisseurs.id, input.id));
      return { success: true, actif: input.actif };
    }),

  // ─── Archive factures : recherche intelligente ───
  listFactures: requirePermissionProcedure("achats.consulter")
    .input(
      z.object({
        q: z.string().optional(), // mots-clés libellé / n° facture fournisseur / référence
        fournisseurId: z.number().int().optional(),
        circuit: z.enum(["PIECES", "CHARGES"]).optional(),
        categorieDepense: z.string().optional(),
        statut: z.string().optional(),
        dateDebut: z.string().optional(),
        dateFin: z.string().optional(),
        montantMin: z.number().min(0).optional(),
        montantMax: z.number().min(0).optional(),
        limit: z.number().int().min(10).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(facturesFournisseur.agenceId, ctx.user.agenceId)];
      if (safe.fournisseurId) conditions.push(eq(facturesFournisseur.fournisseurId, safe.fournisseurId));
      if (safe.circuit) conditions.push(eq(facturesFournisseur.circuit, safe.circuit));
      if (safe.categorieDepense) conditions.push(eq(facturesFournisseur.categorieDepense, safe.categorieDepense));
      if (safe.statut) conditions.push(eq(facturesFournisseur.statut, safe.statut));
      if (safe.dateDebut) conditions.push(gte(facturesFournisseur.dateFacture, safe.dateDebut));
      if (safe.dateFin) conditions.push(lte(facturesFournisseur.dateFacture, safe.dateFin));
      if (safe.montantMin != null) conditions.push(gte(facturesFournisseur.montantTTC, String(safe.montantMin)));
      if (safe.montantMax != null) conditions.push(lte(facturesFournisseur.montantTTC, String(safe.montantMax)));
      if (safe.q?.trim()) {
        const q = `%${safe.q.trim()}%`;
        conditions.push(
          or(
            ilike(facturesFournisseur.libelle, q),
            ilike(facturesFournisseur.numeroFactureFournisseur, q),
            ilike(facturesFournisseur.reference, q),
            ilike(facturesFournisseur.notes, q),
            ilike(fournisseurs.nom, q),
          )!
        );
      }
      const [rows, count] = await Promise.all([
        db
          .select({
            id: facturesFournisseur.id,
            reference: facturesFournisseur.reference,
            libelle: facturesFournisseur.libelle,
            categorieDepense: facturesFournisseur.categorieDepense,
            circuit: facturesFournisseur.circuit,
            modePaiement: facturesFournisseur.modePaiement,
            montantHT: facturesFournisseur.montantHT,
            montantTVA: facturesFournisseur.montantTVA,
            montantTTC: facturesFournisseur.montantTTC,
            montantPaye: facturesFournisseur.montantPaye,
            montantRestant: facturesFournisseur.montantRestant,
            statut: facturesFournisseur.statut,
            dateFacture: facturesFournisseur.dateFacture,
            dateEcheance: facturesFournisseur.dateEcheance,
            numeroFactureFournisseur: facturesFournisseur.numeroFactureFournisseur,
            fichierUrl: facturesFournisseur.fichierUrl,
            notes: facturesFournisseur.notes,
            achatId: facturesFournisseur.achatId,
            createdAt: facturesFournisseur.createdAt,
            fournisseurId: facturesFournisseur.fournisseurId,
            fournisseurNom: fournisseurs.nom,
            fournisseurType: fournisseurs.typeService,
            achatReference: achats.reference,
            orNumero: ordresReparation.numero,
            orVehicule: vehicules.immatriculation,
            clientDisplay: clients.raisonSociale,
          })
          .from(facturesFournisseur)
          .leftJoin(fournisseurs, eq(facturesFournisseur.fournisseurId, fournisseurs.id))
          .leftJoin(achats, eq(facturesFournisseur.achatId, achats.id))
          .leftJoin(ordresReparation, eq(achats.orId, ordresReparation.id))
          .leftJoin(vehicules, eq(ordresReparation.vehiculeId, vehicules.id))
          .leftJoin(clients, eq(ordresReparation.clientId, clients.id))
          .where(and(...conditions))
          .orderBy(desc(facturesFournisseur.dateFacture))
          .limit(safe.limit)
          .offset(safe.offset),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(facturesFournisseur)
          .leftJoin(fournisseurs, eq(facturesFournisseur.fournisseurId, fournisseurs.id))
          .where(and(...conditions)),
      ]);
      return { factures: rows, total: count?.[0]?.n ?? 0 };
    }),

  // ─── Stats globales archive (par circuit / statut) ───
  stats: requirePermissionProcedure("achats.consulter")
    .input(z.object({ dateDebut: z.string().optional(), dateFin: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [eq(facturesFournisseur.agenceId, ctx.user.agenceId)];
      if (input?.dateDebut) conditions.push(gte(facturesFournisseur.dateFacture, input.dateDebut));
      if (input?.dateFin) conditions.push(lte(facturesFournisseur.dateFacture, input.dateFin));
      const rows = await db
        .select({
          circuit: facturesFournisseur.circuit,
          statut: facturesFournisseur.statut,
          montantTTC: facturesFournisseur.montantTTC,
          montantPaye: facturesFournisseur.montantPaye,
          id: facturesFournisseur.id,
        })
        .from(facturesFournisseur)
        .where(and(...conditions));
      const stats = {
        nbFactures: rows.length,
        totalTTC: 0, totalPaye: 0, totalRestant: 0,
        pieces: { nb: 0, total: 0 }, charges: { nb: 0, total: 0 },
        parStatut: {} as Record<string, number>,
      };
      for (const r of rows) {
        const ttc = Number(r.montantTTC ?? 0);
        const paye = Number(r.montantPaye ?? 0);
        stats.totalTTC += ttc;
        stats.totalPaye += paye;
        stats.totalRestant += Math.max(0, ttc - paye);
        if (r.circuit === "CHARGES") { stats.charges.nb++; stats.charges.total += ttc; }
        else { stats.pieces.nb++; stats.pieces.total += ttc; }
        stats.parStatut[r.statut ?? "impayee"] = (stats.parStatut[r.statut ?? "impayee"] ?? 0) + 1;
      }
      return stats;
    }),

  // ─── Enregistrement d'une facture (à chaque règlement ou à l'archivage) ───
  createFacture: requirePermissionProcedure("achats.commander")
    .input(
      z.object({
        fournisseurId: z.number().int(),
        dateFacture: z.string().optional(),
        numeroFactureFournisseur: z.string().optional(),
        montantTTC: z.number().min(0),
        montantHT: z.number().min(0).optional(),
        montantTVA: z.number().min(0).optional(),
        libelle: z.string().max(255).optional(),
        categorieDepense: z.enum(CATEGORIES_DEPENSE).optional(),
        circuit: z.enum(["PIECES", "CHARGES"]).default("CHARGES"),
        modePaiement: z.enum(["especes", "carte", "momo", "om", "virement", "cheque"]).default("especes"),
        montantPaye: z.number().min(0).default(0),
        fichierUrl: z.string().optional(), // scan PDF / image via /api/uploads
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [f] = await db
        .select({ id: fournisseurs.id })
        .from(fournisseurs)
        .where(and(eq(fournisseurs.id, input.fournisseurId), eq(fournisseurs.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Fournisseur introuvable." });

      const ref = `FF-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
      const montantPaye = Math.min(input.montantPaye, input.montantTTC);
      const statut = montantPaye >= input.montantTTC && input.montantTTC > 0 ? "paye" : montantPaye > 0 ? "partielle" : "impayee";
      const [row] = await db
        .insert(facturesFournisseur)
        .values({
          reference: ref,
          fournisseurId: input.fournisseurId,
          agenceId: ctx.user.agenceId,
          libelle: input.libelle ?? null,
          categorieDepense: input.categorieDepense ?? null,
          circuit: input.circuit,
          modePaiement: input.modePaiement,
          montantHT: input.montantHT != null ? String(input.montantHT) : String(input.montantTTC),
          montantTVA: input.montantTVA != null ? String(input.montantTVA) : "0",
          montantTTC: String(input.montantTTC),
          montantPaye: String(montantPaye),
          montantRestant: String(Math.max(0, input.montantTTC - montantPaye)),
          statut,
          dateFacture: input.dateFacture ?? new Date().toISOString().slice(0, 10),
          numeroFactureFournisseur: input.numeroFactureFournisseur ?? null,
          fichierUrl: input.fichierUrl ?? null,
          notes: input.notes ?? null,
          creePar: ctx.user.id,
        } as any)
        .returning();
      return row;
    }),

  // ─── Rattacher / remplacer le scan (PDF, image) ───
  attacherScan: requirePermissionProcedure("achats.commander")
    .input(z.object({ id: z.number().int(), fichierUrl: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [fx] = await db
        .select({ id: facturesFournisseur.id })
        .from(facturesFournisseur)
        .where(and(eq(facturesFournisseur.id, input.id), eq(facturesFournisseur.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!fx) throw new TRPCError({ code: "NOT_FOUND", message: "Facture introuvable." });
      await db.update(facturesFournisseur).set({ fichierUrl: input.fichierUrl, updatedAt: new Date() } as any).where(eq(facturesFournisseur.id, input.id));
      return { success: true };
    }),

  // ─── Paiement partiel / total ───
  payerFacture: requirePermissionProcedure("achats.commander")
    .input(z.object({ id: z.number().int(), montant: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [fx] = await tx
          .select()
          .from(facturesFournisseur)
          .where(and(eq(facturesFournisseur.id, input.id), eq(facturesFournisseur.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!fx) throw new TRPCError({ code: "NOT_FOUND", message: "Facture introuvable." });
        const ttc = Number(fx.montantTTC ?? 0);
        const paye = Number(fx.montantPaye ?? 0);
        const restant = Math.max(0, ttc - paye);
        if (restant <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette facture est déjà entièrement payée." });
        if (input.montant > restant + 0.01) throw new TRPCError({ code: "BAD_REQUEST", message: `Le montant dépasse le reste à payer (${restant}).` });
        const newPaye = Math.round((paye + input.montant) * 100) / 100;
        const newRestant = Math.max(0, Math.round((ttc - newPaye) * 100) / 100);
        const statut = newRestant <= 0 ? "paye" : "partielle";
        await tx
          .update(facturesFournisseur)
          .set({ montantPaye: String(newPaye), montantRestant: String(newRestant), statut, updatedAt: new Date() } as any)
          .where(eq(facturesFournisseur.id, input.id));
        return { success: true, statut, montantPaye: newPaye, montantRestant: newRestant };
      });
    }),

  // ─── Suppression logique d'une facture mal saisie (archive vivante conservée) ───
  supprimerFacture: requirePermissionProcedure("achats.commander")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [fx] = await db
        .select({ id: facturesFournisseur.id, achatId: facturesFournisseur.achatId })
        .from(facturesFournisseur)
        .where(and(eq(facturesFournisseur.id, input.id), eq(facturesFournisseur.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!fx) throw new TRPCError({ code: "NOT_FOUND", message: "Facture introuvable." });
      if (fx.achatId) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette facture est liée à une commande — supprimez-la depuis le module Commandes." });
      await db.delete(facturesFournisseur).where(eq(facturesFournisseur.id, input.id));
      return { success: true };
    }),
});