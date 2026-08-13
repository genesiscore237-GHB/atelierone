import { z } from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "~/server/api/trpc";
import { db, utilisateurs, roles, permissions, rolePermissions, auditLogs, employes } from "@atelierone/db";
import { eq, and, like, desc, count, asc, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const governanceRouter = createTRPCRouter({
  member: createTRPCRouter({
    list: protectedProcedure
      .input(
        z.object({
          page: z.number().min(1).default(1),
          limit: z.number().min(10).max(100).default(50),
          search: z.string().optional(),
          roleId: z.string().optional(),
          statut: z.enum(["active", "invited", "suspended"]).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const conditions = [eq(utilisateurs.agenceId, ctx.user.agenceId)];

        if (input.search) {
          conditions.push(
            sql`(${utilisateurs.nom} ILIKE ${`%${input.search}%`} OR ${utilisateurs.email} ILIKE ${`%${input.search}%`})`,
          );
        }
        if (input.roleId) conditions.push(eq(utilisateurs.roleId, input.roleId));
        if (input.statut) conditions.push(eq(utilisateurs.status, input.statut));

        const offset = (input.page - 1) * input.limit;

        const rows = await db
          .select({
            id: utilisateurs.id,
            nom: utilisateurs.nom,
            prenom: utilisateurs.prenom,
            email: utilisateurs.email,
            telephone: utilisateurs.telephone,
            statut: utilisateurs.status,
            isActive: utilisateurs.isActive,
            derniereConnexion: utilisateurs.derniereConnexion,
            createdAt: utilisateurs.createdAt,
            role: {
              id: roles.id,
              code: roles.code,
              nom: roles.nom,
              niveau: roles.niveau,
            },
          })
          .from(utilisateurs)
          .leftJoin(roles, eq(utilisateurs.roleId, roles.id))
          .where(and(...conditions))
          .orderBy(desc(utilisateurs.createdAt))
          .limit(input.limit)
          .offset(offset);

        const total = await db
          .select({ count: count() })
          .from(utilisateurs)
          .where(and(...conditions));

        return {
          members: rows.map((r) => ({
            id: r.id,
            nom: r.nom,
            prenom: r.prenom,
            email: r.email,
            telephone: r.telephone,
            statut: r.statut ?? "invited",
            isActive: r.isActive,
            derniereConnexion: r.derniereConnexion?.toISOString() ?? null,
            createdAt: r.createdAt?.toISOString() ?? null,
            role: r.role,
          })),
          total: total[0]?.count ?? 0,
          page: input.page,
          limit: input.limit,
        };
      }),

    get: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        const [member] = await db
          .select({
            id: utilisateurs.id,
            nom: utilisateurs.nom,
            prenom: utilisateurs.prenom,
            email: utilisateurs.email,
            telephone: utilisateurs.telephone,
            statut: utilisateurs.status,
            isActive: utilisateurs.isActive,
            derniereConnexion: utilisateurs.derniereConnexion,
            createdAt: utilisateurs.createdAt,
            role: {
              id: roles.id,
              code: roles.code,
              nom: roles.nom,
              niveau: roles.niveau,
            },
          })
          .from(utilisateurs)
          .leftJoin(roles, eq(utilisateurs.roleId, roles.id))
          .where(
            and(
              eq(utilisateurs.id, Number(input.id)),
              eq(utilisateurs.agenceId, ctx.user.agenceId),
            ),
          )
          .limit(1);

        if (!member) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Membre non trouvé." });
        }

        return {
          id: member.id,
          nom: member.nom,
          prenom: member.prenom,
          email: member.email,
          telephone: member.telephone,
          statut: member.statut ?? "invited",
          isActive: member.isActive,
          derniereConnexion: member.derniereConnexion?.toISOString() ?? null,
          createdAt: member.createdAt?.toISOString() ?? null,
          role: member.role,
        };
      }),

    update: adminProcedure
      .input(
        z.object({
          id: z.string(),
          nom: z.string().optional(),
          prenom: z.string().optional(),
          email: z.string().email().optional(),
          telephone: z.string().optional(),
          roleId: z.string().optional(),
          statut: z.enum(["active", "invited", "suspended"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const updateData: Record<string, unknown> = {};
        if (input.nom !== undefined) updateData.nom = input.nom;
        if (input.prenom !== undefined) updateData.prenom = input.prenom;
        if (input.email !== undefined) updateData.email = input.email;
        if (input.telephone !== undefined) updateData.telephone = input.telephone;
        if (input.roleId !== undefined) updateData.roleId = input.roleId;
        if (input.statut !== undefined) updateData.status = input.statut;
        updateData.updatedAt = new Date();

        const [updated] = await db
          .update(utilisateurs)
          .set(updateData as any)
          .where(
            and(
              eq(utilisateurs.id, Number(input.id)),
              eq(utilisateurs.agenceId, ctx.user.agenceId),
            ),
          )
          .returning({ id: utilisateurs.id });

        if (!updated) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Membre non trouvé." });
        }

        return { id: updated.id };
      }),

    toggleStatus: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const [member] = await db
          .select({ isActive: utilisateurs.isActive, status: utilisateurs.status })
          .from(utilisateurs)
          .where(
            and(
              eq(utilisateurs.id, Number(input.id)),
              eq(utilisateurs.agenceId, ctx.user.agenceId),
            ),
          )
          .limit(1);

        if (!member) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Membre non trouvé." });
        }

        const newIsActive = !member.isActive;
        const newStatus = newIsActive ? "active" : "suspended";

        await db
          .update(utilisateurs)
          .set({ isActive: newIsActive, status: newStatus, updatedAt: new Date() } as any)
          .where(eq(utilisateurs.id, Number(input.id)));
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const [deleted] = await db
          .update(utilisateurs)
          .set({ isActive: false, status: "suspended", updatedAt: new Date() } as any)
          .where(and(eq(utilisateurs.id, Number(input.id)), eq(utilisateurs.agenceId, ctx.user.agenceId)))
          .returning({ id: utilisateurs.id });
        if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Membre non trouvé." });
        return { id: deleted.id };
      }),

    bulkToggleStatus: adminProcedure
      .input(z.object({ ids: z.array(z.string()) }))
      .mutation(async ({ ctx, input }) => {
        const members = await db
          .select({ id: utilisateurs.id, isActive: utilisateurs.isActive })
          .from(utilisateurs)
          .where(and(inArray(utilisateurs.id, input.ids.map(Number)), eq(utilisateurs.agenceId, ctx.user.agenceId)));
        for (const m of members) {
          await db.update(utilisateurs)
            .set({ isActive: !m.isActive, status: !m.isActive ? "active" : "suspended", updatedAt: new Date() } as any)
            .where(eq(utilisateurs.id, m.id));
        }
        return { success: true, count: members.length };
      }),

    bulkDelete: adminProcedure
      .input(z.object({ ids: z.array(z.string()) }))
      .mutation(async ({ ctx, input }) => {
        await db
          .update(utilisateurs)
          .set({ isActive: false, status: "suspended", updatedAt: new Date() } as any)
          .where(and(inArray(utilisateurs.id, input.ids.map(Number)), eq(utilisateurs.agenceId, ctx.user.agenceId)));
        return { success: true };
      }),

    invite: adminProcedure
      .input(
        z.object({
          email: z.string().email(),
          nom: z.string().min(1),
          prenom: z.string().optional(),
          roleId: z.string(),
          employeId: z.union([z.string(), z.number()]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const [existing] = await db
          .select({ id: utilisateurs.id })
          .from(utilisateurs)
          .where(
            and(
              eq(utilisateurs.email, input.email),
              eq(utilisateurs.agenceId, ctx.user.agenceId),
            ),
          )
          .limit(1);

        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Un membre avec cet email existe déjà dans cette agence." });
        }

        const [newMember] = await db
          .insert(utilisateurs)
          .values({
            email: input.email,
            nom: input.nom,
            prenom: input.prenom || null,
            roleId: input.roleId,
            agenceId: ctx.user.agenceId,
            isActive: true,
            status: "invited",
            employeId: input.employeId ? Number(input.employeId) : null,
          } as any)
          .returning() as any;

        if (input.employeId && newMember) {
          await db.update(employes)
            .set({ userId: newMember.id } as any)
            .where(eq(employes.id, Number(input.employeId)));
        }

        return { id: String(newMember.id) };
      }),
  }),

  role: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await db
        .select({
          id: roles.id,
          nom: roles.nom,
          code: roles.code,
          description: roles.description,
          niveau: roles.niveau,
          permissionsCount: count(rolePermissions.id).as("permissions_count"),
        })
        .from(roles)
        .leftJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
        .groupBy(roles.id)
        .orderBy(asc(roles.niveau));

      const usersCounts = await db
        .select({
          roleId: utilisateurs.roleId,
          count: count(utilisateurs.id),
        })
        .from(utilisateurs)
        .where(eq(utilisateurs.agenceId, ctx.user.agenceId))
        .groupBy(utilisateurs.roleId);

      const countMap = new Map(usersCounts.map((r) => [r.roleId, r.count]));

      return rows.map((r) => ({
        id: r.id,
        nom: r.nom,
        code: r.code,
        description: r.description,
        niveau: r.niveau,
        permissionsCount: Number(r.permissionsCount),
        usersCount: countMap.get(r.id) ?? 0,
      }));
    }),

    create: adminProcedure
      .input(
        z.object({
          nom: z.string().min(1),
          code: z.string().min(1),
          description: z.string().optional(),
          niveau: z.number().default(0),
          permissions: z.array(z.string()).default([]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const [existing] = await db
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.code, input.code))
          .limit(1);

        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Un rôle avec ce code existe déjà." });
        }

        const [newRole] = await db
          .insert(roles)
          .values({
            nom: input.nom,
            code: input.code,
            description: input.description || null,
            niveau: input.niveau,
          } as any)
          .returning() as any;

        if (input.permissions.length > 0) {
          await db.insert(rolePermissions).values(
            input.permissions.map((permId) => ({
              roleId: newRole.id,
              permissionId: permId,
            })) as any,
          );
        }

        return { id: String(newRole.id) };
      }),

    update: adminProcedure
      .input(
        z.object({
          id: z.string(),
          nom: z.string().optional(),
          code: z.string().optional(),
          description: z.string().optional(),
          niveau: z.number().optional(),
          permissions: z.array(z.string()).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const updateData: Record<string, unknown> = {};
        if (input.nom !== undefined) updateData.nom = input.nom;
        if (input.code !== undefined) updateData.code = input.code;
        if (input.description !== undefined) updateData.description = input.description;
        if (input.niveau !== undefined) updateData.niveau = input.niveau;

        if (Object.keys(updateData).length > 0) {
          const [updated] = await db
            .update(roles)
            .set(updateData as any)
            .where(eq(roles.id, input.id))
            .returning({ id: roles.id });

          if (!updated) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Rôle non trouvé." });
          }
        }

        if (input.permissions !== undefined) {
          await db.delete(rolePermissions).where(eq(rolePermissions.roleId, input.id));
          if (input.permissions.length > 0) {
            await db.insert(rolePermissions).values(
              input.permissions.map((permId) => ({
                roleId: input.id,
                permissionId: permId,
              })) as any,
            );
          }
        }

        return { id: input.id };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await db.delete(rolePermissions).where(eq(rolePermissions.roleId, input.id));
        const [deleted] = await db
          .delete(roles)
          .where(eq(roles.id, input.id))
          .returning({ id: roles.id });

        if (!deleted) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Rôle non trouvé." });
        }

        return { id: deleted.id };
      }),

    bulkDelete: adminProcedure
      .input(z.object({ ids: z.array(z.string()) }))
      .mutation(async ({ ctx, input }) => {
        await db.delete(rolePermissions).where(inArray(rolePermissions.roleId, input.ids));
        const deleted = await db
          .delete(roles)
          .where(inArray(roles.id, input.ids))
          .returning({ id: roles.id });

        return { count: deleted.length };
      }),

    duplicate: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const [sourceRole] = await db
          .select()
          .from(roles)
          .where(eq(roles.id, input.id))
          .limit(1);

        if (!sourceRole) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Rôle source non trouvé." });
        }

        const newCode = `${sourceRole.code}_copy`;
        const [newRole] = await db
          .insert(roles)
          .values({
            nom: `${sourceRole.nom} (copie)`,
            code: newCode,
            description: sourceRole.description,
            niveau: sourceRole.niveau,
          } as any)
          .returning() as any;

        const sourcePermissions = await db
          .select({ permissionId: rolePermissions.permissionId })
          .from(rolePermissions)
          .where(eq(rolePermissions.roleId, input.id));

        if (sourcePermissions.length > 0) {
          await db.insert(rolePermissions).values(
            sourcePermissions.map((sp) => ({
              roleId: newRole.id,
              permissionId: sp.permissionId,
            })) as any,
          );
        }

        return { id: String(newRole.id) };
      }),
  }),

  permission: createTRPCRouter({
    list: protectedProcedure.query(async () => {
      const rows = await db
        .select()
        .from(permissions)
        .orderBy(asc(permissions.module), asc(permissions.code));
      return rows;
    }),

    getLinks: protectedProcedure.query(async () => {
      const rows = await db
        .select({ permissionId: rolePermissions.permissionId, roleId: rolePermissions.roleId })
        .from(rolePermissions);
      return rows.map((r) => ({ permissionId: r.permissionId, roleId: r.roleId, active: true }));
    }),

    toggle: adminProcedure
      .input(
        z.object({
          permissionId: z.string(),
          roleId: z.string(),
          active: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.active) {
          const [existing] = await db
            .select({ id: rolePermissions.id })
            .from(rolePermissions)
            .where(
              and(
                eq(rolePermissions.permissionId, input.permissionId),
                eq(rolePermissions.roleId, input.roleId),
              ),
            )
            .limit(1);

          if (!existing) {
            await db.insert(rolePermissions).values({
              permissionId: input.permissionId,
              roleId: input.roleId,
            } as any);
          }
        } else {
          await db
            .delete(rolePermissions)
            .where(
              and(
                eq(rolePermissions.permissionId, input.permissionId),
                eq(rolePermissions.roleId, input.roleId),
              ),
            );
        }

        return { permissionId: input.permissionId, roleId: input.roleId, active: input.active };
      }),
  }),

  audit: createTRPCRouter({
    list: protectedProcedure
      .input(
        z.object({
          page: z.number().min(1).default(1),
          limit: z.number().min(10).max(100).default(50),
          action: z.string().optional(),
          userId: z.string().optional(),
          entityType: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const conditions: any[] = [
          eq(utilisateurs.agenceId, ctx.user.agenceId),
        ];

        if (input.action) conditions.push(eq(auditLogs.action, input.action));
        if (input.userId) conditions.push(eq(auditLogs.userId, Number(input.userId)));
        if (input.entityType) conditions.push(eq(auditLogs.entityType, input.entityType));
        if (input.startDate) conditions.push(sql`${auditLogs.createdAt} >= ${new Date(input.startDate)}`);
        if (input.endDate) conditions.push(sql`${auditLogs.createdAt} <= ${new Date(input.endDate)}`);

        const offset = (input.page - 1) * input.limit;

        const rows = await db
          .select({
            id: auditLogs.id,
            userId: auditLogs.userId,
            action: auditLogs.action,
            entityType: auditLogs.entityType,
            entityId: auditLogs.entityId,
            details: auditLogs.details,
            ipAddress: auditLogs.ipAddress,
            userAgent: auditLogs.userAgent,
            createdAt: auditLogs.createdAt,
          })
          .from(auditLogs)
          .innerJoin(utilisateurs, eq(auditLogs.userId, utilisateurs.id))
          .where(and(...conditions))
          .orderBy(desc(auditLogs.createdAt))
          .limit(input.limit)
          .offset(offset);

        const total = await db
          .select({ count: count() })
          .from(auditLogs)
          .innerJoin(utilisateurs, eq(auditLogs.userId, utilisateurs.id))
          .where(and(...conditions));

        return {
          logs: rows.map((r) => ({
            id: r.id,
            userId: r.userId,
            action: r.action,
            entityType: r.entityType ?? "",
            entityId: r.entityId,
            details: r.details ?? "",
            ipAddress: r.ipAddress ?? "",
            createdAt: r.createdAt?.toISOString() ?? "",
          })),
          total: total[0]?.count ?? 0,
          page: input.page,
          limit: input.limit,
        };
      }),
  }),
});

