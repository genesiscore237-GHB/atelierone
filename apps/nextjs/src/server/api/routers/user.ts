import { z } from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "~/server/api/trpc";
import { db, utilisateurs, roles, agences } from "@atelierone/db";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { inviteUserSchema } from "@atelierone/validators";
import { inviteMemberAction, resendInviteAction } from "~/lib/auth-actions";
import { RBACService } from "~/server/lib/rbac-service";

export const userRouter = createTRPCRouter({
  getMe: protectedProcedure.query(async ({ ctx }) => {
    const u = ctx.user;
    // Permissions relues depuis la matrice DB à chaque appel :
    // une modification faite par l'admin (Gouvernance → Matrice) est
    // répercutée immédiatement, sans attendre une reconnexion.
    const permissions = await RBACService.getUserPermissions(
      String(u.id),
      String(u.agenceId ?? "")
    ).catch(() => u.permissions ?? []);
    return {
      id: String(u.id),
      email: u.email,
      fullName: u.name,
      name: u.name,
      role: u.role,
      organizationId: u.organizationId,
      agenceId: u.agenceId,
      agenceName: u.agenceName,
      isActive: u.isActive,
      permissions,
      pointsOfSale: [],
    };
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id: utilisateurs.id,
        nom: utilisateurs.nom,
        prenom: utilisateurs.prenom,
        email: utilisateurs.email,
        telephone: utilisateurs.telephone,
        isActive: utilisateurs.isActive,
        status: utilisateurs.status,
        role: {
          id: roles.id,
          code: roles.code,
          nom: roles.nom,
        },
        agence: {
          id: agences.id,
          nom: agences.nom,
          code: agences.code,
        },
        createdAt: utilisateurs.createdAt,
      })
      .from(utilisateurs)
      .leftJoin(roles, eq(utilisateurs.roleId, roles.id))
      .leftJoin(agences, eq(utilisateurs.agenceId, agences.id))
      .where(eq(utilisateurs.agenceId, ctx.user.agenceId));
    return rows.map(r => ({
      id: String(r.id),
      nom: r.nom,
      prenom: r.prenom,
      email: r.email,
      telephone: r.telephone,
      isActive: r.isActive,
      status: r.status,
      role: r.role,
      agence: r.agence,
      createdAt: r.createdAt,
      fullName: `${r.prenom ?? ""} ${r.nom}`.trim(),
      name: r.nom,
    }));
  }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        nom: z.string().optional(),
        prenom: z.string().optional(),
        telephone: z.string().optional(),
        email: z.string().email().optional(),
        roleCode: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: Record<string, unknown> = {};
      if (input.nom !== undefined) updateData.nom = input.nom;
      if (input.prenom !== undefined) updateData.prenom = input.prenom;
      if (input.telephone !== undefined) updateData.telephone = input.telephone;
      if (input.email !== undefined) updateData.email = input.email;
      if (input.roleCode !== undefined) {
        const [role] = await db
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.code, input.roleCode))
          .limit(1);
        if (!role) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Rôle non trouvé.",
          });
        }
        updateData.roleId = role.id;
      }

      const [updated] = await db
        .update(utilisateurs)
        .set(updateData as any)
        .where(
          and(
            eq(utilisateurs.id, Number(input.id)),
            eq(utilisateurs.agenceId, ctx.user.agenceId)
          )
        )
        .returning({
          id: utilisateurs.id,
          email: utilisateurs.email,
          nom: utilisateurs.nom,
          prenom: utilisateurs.prenom,
          telephone: utilisateurs.telephone,
          isActive: utilisateurs.isActive,
        });

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Utilisateur non trouvé.",
        });
      }

      return {
        id: String(updated.id),
        email: updated.email,
        name: updated.nom,
        fullName: updated.nom,
        nom: updated.nom,
        prenom: updated.prenom,
        telephone: updated.telephone,
        isActive: updated.isActive,
      };
    }),

  deactivate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(utilisateurs)
        .set({ isActive: false } as any)
        .where(and(eq(utilisateurs.id, Number(input.id)), eq(utilisateurs.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  invite: adminProcedure
    .input(inviteUserSchema)
    .mutation(async ({ input }) => {
      const result: any = await inviteMemberAction(input as any);
      if ("error" in result) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error,
        });
      }
      return result;
    }),

  resendInvite: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input }) => {
      const result = await resendInviteAction(input.userId);
      if ("error" in result) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error,
        });
      }
      return result;
    }),
});

