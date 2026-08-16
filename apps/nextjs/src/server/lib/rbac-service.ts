import { db } from "~/server/db";
import { rolePermissions, permissions, profiles, roles } from "~/server/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { t } from "~/server/api/trpc";

export class RBACService {
  static async hasPermission(
    userId: string,
    permission: string,
    organizationId: string
  ): Promise<boolean> {
    const profileResult = await db
      .select({ roleId: profiles.roleId })
      .from(profiles)
      .where(and(eq(profiles.id, Number(userId)), eq(profiles.agenceId, Number(organizationId))))
      .limit(1);

    const profile = profileResult[0];
    if (!profile || !profile.roleId) return false;

    const userPermissions = await db
      .select({ code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, profile.roleId));

    return userPermissions.some(p => p.code === permission);
  }

  static async getUserPermissions(
    userId: string,
    organizationId: string
  ): Promise<string[]> {
    const profileResult = await db
      .select({ roleId: profiles.roleId })
      .from(profiles)
      .where(and(eq(profiles.id, Number(userId)), eq(profiles.agenceId, Number(organizationId))))
      .limit(1);

    const profile = profileResult[0];
    if (!profile || !profile.roleId) return [];

    const userPermissions = await db
      .select({ code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, profile.roleId));

    return userPermissions.map(p => p.code);
  }

  static async hasRole(
    userId: string,
    roleName: string,
    organizationId: string
  ): Promise<boolean> {
    const profileResult = await db
      .select({ roleId: profiles.roleId })
      .from(profiles)
      .innerJoin(roles, eq(profiles.roleId, roles.id))
      .where(
        and(
          eq(profiles.id, Number(userId)),
          eq(profiles.agenceId, Number(organizationId)),
          eq(roles.code, roleName)
        )
      )
      .limit(1);

    return profileResult.length > 0;
  }

  static async isSuperAdmin(userId: string): Promise<boolean> {
    const profileResult = await db
      .select({ roleId: profiles.roleId })
      .from(profiles)
      .where(eq(profiles.id, Number(userId)))
      .limit(1);

    const p = profileResult[0];
    if (!p || !p.roleId) return false;

    const roleResult = await db
      .select({ code: roles.code })
      .from(roles)
      .where(and(eq(roles.id, p.roleId), eq(roles.code, "superadmin")))
      .limit(1);

    return roleResult.length > 0;
  }
}

export function requirePermission(permission: string) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    if (await RBACService.isSuperAdmin(ctx.user.id)) {
      return next({ ctx });
    }

    const profileResult = await db
      .select({ organizationId: profiles.agenceId, roleId: profiles.roleId })
      .from(profiles)
      .where(eq(profiles.id, Number(ctx.user.id)))
      .limit(1);

    const profile = profileResult[0];
    if (!profile || !profile.organizationId || !profile.roleId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const hasPerm = await RBACService.hasPermission(
      ctx.user.id,
      permission,
      String(profile.organizationId)
    );

    if (!hasPerm) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Permission manquante: ${permission}`
      });
    }

    return next({
      ctx: {
        ...ctx,
        organizationId: profile.organizationId,
      },
    });
  });
}

export function requireScope(siteId?: string) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    if (await RBACService.isSuperAdmin(ctx.user.id)) {
      return next({ ctx });
    }

    const profileResult = await db
      .select({ organizationId: profiles.agenceId, roleId: profiles.roleId })
      .from(profiles)
      .where(eq(profiles.id, Number(ctx.user.id)))
      .limit(1);

    const profile = profileResult[0];
    if (!profile || !profile.organizationId || !profile.roleId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    if (siteId && String(profile.organizationId) !== siteId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Accès refusé au site`
      });
    }

    return next({
      ctx: {
        ...ctx,
        organizationId: profile.organizationId,
      },
    });
  });
}
