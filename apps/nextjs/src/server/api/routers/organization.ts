import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "~/server/api/trpc";
import { db, agences, utilisateurs, roles, ensureSecuritySocle } from "@atelierone/db";
import { eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";

export const organizationRouter = createTRPCRouter({
  // Premier demarrage (base vierge) : cree l'agence + le premier compte admin.
  // Accessible sans authentification UNIQUEMENT tant qu'aucune organisation n'existe.
  // Apres initiaisation, toute nouvelle tentative est refusee.
  setup: publicProcedure
    .input(z.object({
      nom: z.string().min(2, "Le nom doit avoir au moins 2 caractères").optional(),
      orgName: z.string().min(2).optional(),
      code: z.string().regex(/^[a-z0-9-]+$/, "Le code ne doit contenir que des lettres minuscules, chiffres et tirets").optional(),
      orgSlug: z.string().optional(),
      adresse: z.string().optional(),
      telephone: z.string().optional(),
      email: z.string().email().optional(),
      ville: z.string().optional(),
      pays: z.string().optional(),
      adminEmail: z.string().email().optional(),
      adminPassword: z.string().min(6).optional(),
      adminFullName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Garde : le systeme ne s'initialise qu'une seule fois.
      const agenceCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(agences);
      if (Number(agenceCount[0]?.count ?? 0) > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Le système est déjà initialisé. Cette page est réservée au premier démarrage.",
        });
      }

      const effectiveCode = input.code ?? input.orgSlug ?? "";
      if (!effectiveCode) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le code de la librairie (URL) est requis." });
      }

      // Socle de securite (roles + permissions) si jamais absent
      await ensureSecuritySocle(db);

      const effectiveNom = input.nom ?? input.orgName ?? "";
      const [agence] = await db
        .insert(agences)
        .values({
          nom: effectiveNom,
          code: effectiveCode,
          adresse: input.adresse || null,
          telephone: input.telephone || null,
          email: input.email || null,
          ville: input.ville || null,
          pays: input.pays || null,
        } as any)
        .returning() as any;

      if (input.adminEmail && input.adminPassword) {
        const hashedPassword = await bcrypt.hash(input.adminPassword, 10);
        const [adminRole] = await db
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.code, "superadmin"))
          .limit(1);
        if (adminRole) {
          await db.insert(utilisateurs).values({
            email: input.adminEmail,
            loginEmail: input.adminEmail,
            motDePasse: hashedPassword,
            nom: input.adminFullName ?? "Admin",
            roleId: adminRole.id,
            agenceId: agence.id,
            isActive: true,
            status: "active",
            emailVerified: new Date(),
          } as any);
        }
      }

      return { id: String(agence.id) };
    }),

  getInfo: protectedProcedure.query(async ({ ctx }) => {
    const agence = await db
      .select()
      .from(agences)
      .where(eq(agences.id, ctx.user.agenceId))
      .limit(1);

    if (!agence.length) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Agence non trouvée." });
    }

    const userCount = await db
      .select({ count: agences.id })
      .from(utilisateurs)
      .where(eq(utilisateurs.agenceId, ctx.user.agenceId));

    const a = agence[0]!;
    return {
      id: String(a.id),
      nom: a.nom,
      code: a.code,
      adresse: a.adresse,
      telephone: a.telephone,
      email: a.email,
      ville: a.ville,
      pays: a.pays,
      isActive: a.isActive,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      utilisateursCount: userCount.length,
      name: a.nom,
      address: a.adresse ?? "",
      phone: a.telephone ?? "",
      orgSlug: a.code,
    };
  }),
});