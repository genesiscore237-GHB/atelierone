import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, posProcedure, protectedProcedure, adminProcedure } from "~/server/api/trpc";
import { db, clients, dettesClients, ventes, notifications } from "@atelierone/db";
import { eq, and, desc, sql } from "drizzle-orm";

export const customersRouter = createTRPCRouter({
  list: posProcedure
    .input(z.object({
      search: z.string().optional(),
      segment: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;

      const conditions = [
        eq(clients.agenceId, agenceId),
        eq(clients.isActive, true),
      ];

      if (input.search) {
        conditions.push(
          sql`(${clients.nom} ILIKE ${`%${input.search}%`} OR ${clients.prenom} ILIKE ${`%${input.search}%`} OR ${clients.telephone} ILIKE ${`%${input.search}%`})`
        );
      }

      const rows = await db
        .select()
        .from(clients)
        .where(and(...conditions))
        .orderBy(desc(clients.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows.map(c => ({
        id: String(c.id),
        clientId: String(c.id),
        nom: c.nom,
        prenom: c.prenom,
        telephone: c.telephone,
        email: c.email,
        adresse: c.adresse,
        codeClient: c.codeClient,
        agenceId: c.agenceId,
        isActive: c.isActive,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        name: c.nom,
        fullName: `${c.prenom ?? ""} ${c.nom}`.trim(),
        phone: c.telephone,
        address: c.adresse,
        segment: "standard",
        loyaltyPoints: 0,
        totalSpent: 0,
        lastPurchaseAt: null,
      }));
    }),

  create: posProcedure
    .input(z.object({
      nom: z.string().min(1).optional(),
      prenom: z.string().optional(),
      telephone: z.string().optional(),
      email: z.string().email().optional(),
      adresse: z.string().optional(),
      codeClient: z.string().optional(),
      name: z.string().min(1).optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      segment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const nom = input.nom ?? input.name;
      if (!nom) throw new TRPCError({ code: "BAD_REQUEST", message: "Le nom du client est requis" });

      const [client] = await db.insert(clients).values({
        nom,
        prenom: input.prenom || null,
        telephone: (input.telephone ?? input.phone) || null,
        email: input.email || null,
        adresse: (input.adresse ?? input.address) || null,
        codeClient: input.codeClient || null,
        agenceId,
        isActive: true,
      }).returning() as any;

      return {
        id: String(client.id),
        clientId: String(client.id),
        nom: client.nom,
        prenom: client.prenom,
        telephone: client.telephone,
        email: client.email,
        adresse: client.adresse,
        codeClient: client.codeClient,
        agenceId: client.agenceId,
        isActive: client.isActive,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
        name: client.nom,
        fullName: `${client.prenom ?? ""} ${client.nom}`.trim(),
        phone: client.telephone,
        address: client.adresse,
        segment: "standard",
        loyaltyPoints: 0,
        totalSpent: 0,
        lastPurchaseAt: null,
      };
    }),

  update: posProcedure
    .input(z.object({
      id: z.string(),
      nom: z.string().min(1),
      prenom: z.string().optional(),
      telephone: z.string().optional(),
      email: z.string().email().optional(),
      adresse: z.string().optional(),
      codeClient: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const { id, ...updateData } = input;

      const result = await db
        .update(clients)
        .set(updateData as any)
        .where(and(eq(clients.id, Number(id)), eq(clients.agenceId, agenceId)))
        .returning();

      const updated = result[0];
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable" });
      return {
        id: String(updated.id),
        clientId: String(updated.id),
        nom: updated.nom,
        prenom: updated.prenom,
        telephone: updated.telephone,
        email: updated.email,
        adresse: updated.adresse,
        codeClient: updated.codeClient,
        agenceId: updated.agenceId,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        name: updated.nom,
        phone: updated.telephone,
        address: updated.adresse,
      };
    }),

  delete: posProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      await db
        .update(clients)
        .set({ isActive: false })
        .where(and(eq(clients.id, Number(input.id)), eq(clients.agenceId, agenceId)));
      return { success: true };
    }),

  updateLoyaltyPoints: posProcedure
    .input(z.object({ id: z.string(), points: z.number() }))
    .mutation(async () => {
      throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "Fonctionnalité fidélité à venir" });
    }),

  search: posProcedure
    .input(z.object({
      q: z.string().min(1),
      limit: z.number().default(10),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;

      const rows = await db
        .select({
          id: clients.id,
          nom: clients.nom,
          prenom: clients.prenom,
          telephone: clients.telephone,
        })
        .from(clients)
        .where(and(
          eq(clients.agenceId, agenceId),
          eq(clients.isActive, true),
          sql`(${clients.nom} ILIKE ${`%${input.q}%`} OR ${clients.prenom} ILIKE ${`%${input.q}%`} OR ${clients.telephone} ILIKE ${`%${input.q}%`})`
        ))
        .limit(input.limit);
      return rows.map(r => ({
        id: String(r.id),
        clientId: String(r.id),
        nom: r.nom,
        prenom: r.prenom,
        telephone: r.telephone,
        name: `${r.prenom ?? ""} ${r.nom}`.trim(),
        phone: r.telephone,
      }));
    }),

  // ─── Échéancier client : dettes + échéances ───
  clientDebts: protectedProcedure
    .input(z.object({
      clientId: z.string().optional(),
      statut: z.string().optional(),
      overdueOnly: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const conditions: any[] = [];
      if (input.clientId) conditions.push(eq(dettesClients.clientId, Number(input.clientId)));
      if (input.statut) conditions.push(eq(dettesClients.statut, input.statut));

      const rows = await db.select({
        id: dettesClients.id,
        venteId: dettesClients.venteId,
        clientId: dettesClients.clientId,
        clientNom: clients.nom,
        clientPrenom: clients.prenom,
        clientTelephone: clients.telephone,
        montantTotal: dettesClients.montantTotal,
        montantPaye: dettesClients.montantPaye,
        montantRestant: dettesClients.montantRestant,
        statut: dettesClients.statut,
        echeanceLe: dettesClients.echeanceLe,
        createdAt: dettesClients.createdAt,
      })
        .from(dettesClients)
        .leftJoin(clients, eq(dettesClients.clientId, clients.id))
        .innerJoin(ventes, eq(dettesClients.venteId, ventes.id))
        .where(and(eq(ventes.agenceId, agenceId), ...conditions))
        .orderBy(dettesClients.echeanceLe);

      let result = rows.map(r => ({
        id: String(r.id),
        venteId: r.venteId,
        clientId: r.clientId,
        clientNom: r.clientNom ? `${r.clientPrenom ?? ""} ${r.clientNom}`.trim() : "Client inconnu",
        clientTelephone: r.clientTelephone,
        montantTotal: Number(r.montantTotal),
        montantPaye: Number(r.montantPaye ?? 0),
        montantRestant: Number(r.montantRestant),
        statut: r.statut ?? "impaye",
        echeanceLe: r.echeanceLe?.toISOString() ?? null,
        isOverdue: r.echeanceLe && new Date(r.echeanceLe) < new Date() && r.statut !== "paye",
        joursRestants: r.echeanceLe ? Math.ceil((new Date(r.echeanceLe).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null,
        createdAt: r.createdAt?.toISOString(),
      }));

      if (input.overdueOnly) {
        result = result.filter(r => r.isOverdue);
      }

      return {
        debts: result,
        totalImpaye: result.filter(r => r.statut !== "paye").reduce((s, r) => s + r.montantRestant, 0),
        totalOverdue: result.filter(r => r.isOverdue).reduce((s, r) => s + r.montantRestant, 0),
      };
    }),

  // ─── Relance client : créer une notification de relance ───
  createRelance: adminProcedure
    .input(z.object({
      clientId: z.number(),
      detteId: z.number(),
      type: z.enum(["SMS", "EMAIL", "SYSTEME"]).default("SYSTEME"),
      message: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const ref = `REL-${Date.now()}`;
      const [notification] = await db.insert(notifications).values({
        organisationId: agenceId,
        type: `RELANCE_CLIENT_${input.type}`,
        destinataire: String(input.clientId),
        sujet: `Relance de paiement #${input.detteId}`,
        message: input.message,
        statut: "EN_ATTENTE",
      } as any).returning() as any;
      return { id: String(notification.id), reference: ref };
    }) as any,

  // ─── Échéancier global : toutes les échéances à venir ───
  echeancier: protectedProcedure
    .input(z.object({
      jours: z.number().default(30),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const now = new Date();
      const horizon = new Date(now.getTime() + input.jours * 24 * 60 * 60 * 1000);

      const rows = await db.select({
        id: dettesClients.id,
        venteId: dettesClients.venteId,
        clientId: dettesClients.clientId,
        clientNom: clients.nom,
        clientPrenom: clients.prenom,
        clientTelephone: clients.telephone,
        montantTotal: dettesClients.montantTotal,
        montantRestant: dettesClients.montantRestant,
        statut: dettesClients.statut,
        echeanceLe: dettesClients.echeanceLe,
      })
        .from(dettesClients)
        .leftJoin(clients, eq(dettesClients.clientId, clients.id))
        .innerJoin(ventes, eq(dettesClients.venteId, ventes.id))
        .where(and(
          eq(ventes.agenceId, agenceId),
          lte(dettesClients.echeanceLe, horizon),
          sql`${dettesClients.statut} != 'paye'`,
        ))
        .orderBy(dettesClients.echeanceLe);

      const echeances = rows.map(r => ({
        id: String(r.id),
        venteId: r.venteId,
        clientId: r.clientId,
        clientNom: r.clientNom ? `${r.clientPrenom ?? ""} ${r.clientNom}`.trim() : "Client inconnu",
        clientTelephone: r.clientTelephone,
        montantTotal: Number(r.montantTotal),
        montantRestant: Number(r.montantRestant),
        statut: r.statut ?? "impaye",
        echeanceLe: r.echeanceLe?.toISOString() ?? null,
        isOverdue: r.echeanceLe && new Date(r.echeanceLe) < now,
        joursRestants: r.echeanceLe ? Math.ceil((new Date(r.echeanceLe).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null,
      }));

      return {
        echeances,
        total: echeances.reduce((s, e) => s + e.montantRestant, 0),
        enRetard: echeances.filter(e => e.isOverdue).reduce((s, e) => s + e.montantRestant, 0),
        aVenir: echeances.filter(e => !e.isOverdue).reduce((s, e) => s + e.montantRestant, 0),
      };
    }),
});
