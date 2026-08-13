import { z } from "zod";
import { createTRPCRouter, adminProcedure, protectedProcedure } from "~/server/api/trpc";
import { db, agences, utilisateurs, roles, caisses, sessionsCaisse } from "@atelierone/db";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const FACTURE_CHAMPS_DEFAUTS = {
  telephone: true,
  email: true,
  identifiantsLegaux: true,
  slogan: true,
  ville: true,
  operateur: true,
  caisse: true,
  remise: true,
  tva: true,
  logoTicket: false,
};

const photoDataUrl = z
  .string()
  .refine((v) => v.startsWith("data:image/") && v.length <= 3_000_000, {
    message: "Logo invalide ou trop volumineux (max 3 Mo)",
  });

const mapAgence = (a: typeof agences.$inferSelect) => ({
  id: String(a.id),
  nom: a.nom,
  code: a.code,
  adresse: a.adresse,
  telephone: a.telephone,
  email: a.email,
  ville: a.ville,
  pays: a.pays,
  slogan: a.slogan,
  logoUrl: a.logoUrl,
  rcRccm: a.rcRccm,
  niu: a.niu,
  ifu: a.ifu,
  capital: a.capital,
  siteWeb: a.siteWeb,
  devise: a.devise ?? "XAF",
  tvaDefaut: Number(a.tvaDefaut ?? 0),
  margeDefautManuels: Number(a.margeDefautManuels ?? 25),
  prefixeFacture: a.prefixeFacture ?? "PF",
  mentionPiedFacture: a.mentionPiedFacture,
  mentionPiedTicket: a.mentionPiedTicket,
  politiqueRetour: a.politiqueRetour,
  champsVisibles: { ...FACTURE_CHAMPS_DEFAUTS, ...((a.factureChampsVisibles ?? {}) as Record<string, boolean>) },
  isActive: a.isActive,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
  name: a.nom,
  address: a.adresse ?? "",
  phone: a.telephone ?? "",
  status: "ACTIVE",
});

const organizationUpdateInput = z.object({
  nom: z.string().min(2).optional(),
  name: z.string().min(2).optional(),
  adresse: z.string().optional(),
  address: z.string().optional(),
  telephone: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  ville: z.string().optional(),
  pays: z.string().optional(),
  slogan: z.string().max(255).optional().nullable(),
  siteWeb: z.string().max(255).optional().nullable(),
  logoUrl: photoDataUrl.optional().nullable(),
  rcRccm: z.string().max(50).optional().nullable(),
  niu: z.string().max(50).optional().nullable(),
  ifu: z.string().max(50).optional().nullable(),
  capital: z.string().max(100).optional().nullable(),
  devise: z.string().max(10).optional(),
  tvaDefaut: z.coerce.number().min(0).max(100).optional(),
  margeDefautManuels: z.coerce.number().min(0).max(100).optional(),
  prefixeFacture: z.string().max(20).optional(),
  mentionPiedFacture: z.string().optional().nullable(),
  mentionPiedTicket: z.string().optional().nullable(),
  politiqueRetour: z.string().optional().nullable(),
  champsVisibles: z
    .object({
      telephone: z.boolean().optional(),
      email: z.boolean().optional(),
      identifiantsLegaux: z.boolean().optional(),
      slogan: z.boolean().optional(),
      ville: z.boolean().optional(),
      operateur: z.boolean().optional(),
      caisse: z.boolean().optional(),
      remise: z.boolean().optional(),
      tva: z.boolean().optional(),
      logoTicket: z.boolean().optional(),
    })
    .optional(),
});

export const settingsRouter = createTRPCRouter({
  organization: createTRPCRouter({
    get: protectedProcedure.query(async ({ ctx }) => {
      const agence = await db
        .select()
        .from(agences)
        .where(eq(agences.id, ctx.user.agenceId))
        .limit(1);
      if (!agence.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agence non trouvée." });
      }
      return mapAgence(agence[0]!);
    }),
    update: adminProcedure
      .input(organizationUpdateInput)
      .mutation(async ({ ctx, input }) => {
        const updateData: Record<string, unknown> = {};
        if (input.nom !== undefined || input.name !== undefined) updateData.nom = input.nom ?? input.name;
        if (input.adresse !== undefined || input.address !== undefined) updateData.adresse = input.adresse ?? input.address;
        if (input.telephone !== undefined || input.phone !== undefined) updateData.telephone = input.telephone ?? input.phone;
        if (input.email !== undefined) updateData.email = input.email;
        if (input.ville !== undefined) updateData.ville = input.ville;
        if (input.pays !== undefined) updateData.pays = input.pays;
        if (input.slogan !== undefined) updateData.slogan = input.slogan;
        if (input.siteWeb !== undefined) updateData.siteWeb = input.siteWeb;
        if (input.logoUrl !== undefined) updateData.logoUrl = input.logoUrl;
        if (input.rcRccm !== undefined) updateData.rcRccm = input.rcRccm;
        if (input.niu !== undefined) updateData.niu = input.niu;
        if (input.ifu !== undefined) updateData.ifu = input.ifu;
        if (input.capital !== undefined) updateData.capital = input.capital;
        if (input.devise !== undefined) updateData.devise = input.devise;
        if (input.tvaDefaut !== undefined) updateData.tvaDefaut = String(input.tvaDefaut);
        if (input.margeDefautManuels !== undefined) updateData.margeDefautManuels = String(input.margeDefautManuels);
        if (input.prefixeFacture !== undefined) updateData.prefixeFacture = input.prefixeFacture;
        if (input.mentionPiedFacture !== undefined) updateData.mentionPiedFacture = input.mentionPiedFacture;
        if (input.mentionPiedTicket !== undefined) updateData.mentionPiedTicket = input.mentionPiedTicket;
        if (input.politiqueRetour !== undefined) updateData.politiqueRetour = input.politiqueRetour;
        if (input.champsVisibles !== undefined) updateData.factureChampsVisibles = input.champsVisibles;
        updateData.updatedAt = new Date();
        const result = await db
          .update(agences)
          .set(updateData)
          .where(eq(agences.id, ctx.user.agenceId))
          .returning();
        if (!result[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return mapAgence(result[0]!);
      }),
    resetFactureConfig: adminProcedure.mutation(async ({ ctx }) => {
      const result = await db
        .update(agences)
        .set({
          slogan: null,
          logoUrl: null,
          rcRccm: null,
          niu: null,
          ifu: null,
          capital: null,
          siteWeb: null,
          devise: "XAF",
          tvaDefaut: "0",
          prefixeFacture: "PF",
          mentionPiedFacture: null,
          mentionPiedTicket: null,
          politiqueRetour: null,
          factureChampsVisibles: {},
          updatedAt: new Date(),
        } as any)
        .where(eq(agences.id, ctx.user.agenceId))
        .returning();
      if (!result[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return mapAgence(result[0]!);
    }),
  }),

  pos: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await db
        .select({
          id: caisses.id,
          libelle: caisses.libelle,
          statut: sessionsCaisse.statut,
        })
        .from(caisses)
        .leftJoin(sessionsCaisse, and(eq(sessionsCaisse.caisseId, caisses.id), eq(sessionsCaisse.statut, "ouverte")))
        .where(eq(caisses.agenceId, ctx.user.agenceId));
      return rows.map(c => ({
        id: String(c.id),
        name: c.libelle,
        code: String(c.id),
        address: "",
        status: c.statut ?? "fermee",
      }));
    }),
    registers: protectedProcedure.query(async ({ ctx }) => {
      const rows = await db
        .select({
          id: caisses.id,
          libelle: caisses.libelle,
          statut: sessionsCaisse.statut,
          soldeOuverture: sessionsCaisse.soldeOuverture,
          soldeActuel: sessionsCaisse.soldeActuel,
        })
        .from(caisses)
        .leftJoin(sessionsCaisse, and(eq(sessionsCaisse.caisseId, caisses.id), eq(sessionsCaisse.statut, "ouverte")))
        .where(eq(caisses.agenceId, ctx.user.agenceId));
      return rows.map(c => ({
        id: String(c.id),
        name: c.libelle,
        posName: c.libelle,
        code: String(c.id),
        address: "",
        status: c.statut ?? "fermee",
        openingBalance: Number(c.soldeOuverture ?? 0),
        currentBalance: Number(c.soldeActuel ?? 0),
      }));
    }),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        address: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const [caisse] = await db.insert(caisses).values({
          agenceId: ctx.user.agenceId,
          libelle: input.name,
        } as any).returning() as any;
        return { id: String(caisse.id) };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await db.update(caisses).set({ isActive: false } as any).where(and(eq(caisses.id, Number(input.id)), eq(caisses.agenceId, ctx.user.agenceId)));
        return { success: true };
      }),
  }),

  getAgence: protectedProcedure.query(async ({ ctx }) => {
    const agence = await db
      .select()
      .from(agences)
      .where(eq(agences.id, ctx.user.agenceId))
      .limit(1);
    if (!agence.length) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Agence non trouvée." });
    }
    return mapAgence(agence[0]!);
  }),

  updateAgence: adminProcedure
    .input(z.object({
      nom: z.string().min(2).optional(),
      adresse: z.string().optional(),
      telephone: z.string().optional(),
      email: z.string().email().optional(),
      ville: z.string().optional(),
      pays: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const updateData: Record<string, unknown> = {};
      if (input.nom !== undefined) updateData.nom = input.nom;
      if (input.adresse !== undefined) updateData.adresse = input.adresse;
      if (input.telephone !== undefined) updateData.telephone = input.telephone;
      if (input.email !== undefined) updateData.email = input.email;
      if (input.ville !== undefined) updateData.ville = input.ville;
      if (input.pays !== undefined) updateData.pays = input.pays;
      updateData.updatedAt = new Date();
      const result = await db
        .update(agences)
        .set(updateData)
        .where(eq(agences.id, ctx.user.agenceId))
        .returning();
      if (!result[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return mapAgence(result[0]!);
    }),

  listUsers: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id: utilisateurs.id,
        nom: utilisateurs.nom,
        prenom: utilisateurs.prenom,
        email: utilisateurs.email,
        telephone: utilisateurs.telephone,
        isActive: utilisateurs.isActive,
        role: {
          id: roles.id,
          code: roles.code,
          nom: roles.nom,
        },
        createdAt: utilisateurs.createdAt,
      })
      .from(utilisateurs)
      .leftJoin(roles, eq(utilisateurs.roleId, roles.id))
      .where(eq(utilisateurs.agenceId, ctx.user.agenceId));
    return rows.map(r => ({
      id: String(r.id),
      nom: r.nom,
      prenom: r.prenom,
      email: r.email,
      telephone: r.telephone,
      isActive: r.isActive,
      role: r.role,
      createdAt: r.createdAt,
      fullName: `${r.prenom ?? ""} ${r.nom}`.trim(),
      name: r.nom,
      roleName: r.role?.nom ?? "",
      roleCode: r.role?.code ?? "",
    }));
  }),
});
