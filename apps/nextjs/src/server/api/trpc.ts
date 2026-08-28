import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { sql, eq } from "drizzle-orm";
import { auth } from "@atelierone/auth";
import { db, auditLogs, licenceLocale } from "@atelierone/db";
import type { ExtendedUser, UserRole } from "@atelierone/auth/types";
import { RBACService } from "~/server/lib/rbac-service";
import { logger } from "~/server/lib/logger";
import { verifierLicence, type LicenceStatut } from "~/server/lib/licence-service";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();
  return {
    user: session?.user ?? null,
    session: session ?? null,
    ...opts,
  };
};

export const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();
  const result = await next();
  const end = Date.now();
  if (t._config.isDev) {
    logger.debug({ path, durationMs: end - start }, "[TRPC] %s took %dms", path, end - start);
  }
  return result;
});

// ─── LICENCE À DÉCOMPTE (module SaaS) ───
// Actif uniquement si LICENCE_MODE=on (garages de simulation / production).
//  BLOQUE        → toutes les procédures refusées
//  LECTURE_SEULE → queries OK, mutations refusées
// Exemptions : licence.* (état/renouvellement) et sync.* (agent) pour permettre
// au garage de se réenregistrer et de synchroniser même bloqué.
let licenceCache: { at: number; statut: LicenceStatut | null; joursRestants: number; joursGrace: number } | null = null;

/** Invalidation forcée (après enregistrement / renouvellement local). */
export function invaliderLicenceCache() {
  licenceCache = null;
}

async function lireLicenceLocale() {
  const TTL = 5_000;
  if (licenceCache && Date.now() - licenceCache.at < TTL) return licenceCache;
  let result = { statut: null as LicenceStatut | null, joursRestants: 0, joursGrace: 0 };
  try {
    const [row] = await db.select({ jeton: licenceLocale.jeton, dateFin: licenceLocale.dateFin, graceJours: licenceLocale.graceJours }).from(licenceLocale).limit(1);
    if (row) {
      const v = verifierLicence(row.jeton, process.env.LICENCE_SECRET ?? "", new Date(row.dateFin));
      // On vérifie depuis MAINTENANT (l'échéance locale est relative au temps réel)
      const vMaintenant = verifierLicence(row.jeton, process.env.LICENCE_SECRET ?? "");
      result = { statut: vMaintenant.valide ? vMaintenant.statut : "BLOQUE", joursRestants: vMaintenant.joursRestants, joursGrace: vMaintenant.joursGrace };
      void v;
    }
  } catch (e) {
    logger.warn({ e }, "Licence locale illisible");
  }
  licenceCache = { at: Date.now(), ...result };
  return licenceCache;
}

const licenceGuard = t.middleware(async ({ ctx, type, path, next }) => {
  if (process.env.LICENCE_MODE !== "on") return next();
  if (path.startsWith("licence.") || path.startsWith("sync.") || path.startsWith("auth.")) return next();
  const l = await lireLicenceLocale();
  if (l.statut === "BLOQUE") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Licence expirée : renouvelez votre abonnement pour continuer à utiliser AtelierOne." });
  }
  if (type === "mutation" && l.statut === "LECTURE_SEULE") {
    throw new TRPCError({ code: "PAYMENT_REQUIRED", message: "Abonnement échu : vous êtes en lecture seule. Renouvelez pour retrouver toutes les fonctionnalités." });
  }
  return next();
});

const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Vous devez être connecté." });
  }
  return next({ ctx: { ...ctx, user: ctx.user as ExtendedUser } });
});

const isAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Vous devez être connecté." });
  }
  const user = ctx.user as ExtendedUser;
  if (user.role !== "superadmin" && user.role !== "directeur") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Accès réservé aux administrateurs." });
  }
  return next({ ctx: { ...ctx, user, role: user.role } });
});

const tenantMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) return next();
  const user = ctx.user as ExtendedUser;
  try {
    await db.execute(sql`SELECT set_current_agence_id(${user.agenceId})`);
    await db.execute(sql`SELECT set_current_user_id(${Number(user.id)}::integer)`);
  } catch (err) {
    logger.warn({ err }, "Failed to set tenant context");
  }
  return next();
});

const enforceRole = (requiredRoles: UserRole[]) => t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Vous devez être connecté." });
  }
  const user = ctx.user as ExtendedUser;
  if (!requiredRoles.includes(user.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Rôle requis: ${requiredRoles.join(" ou ")}`,
    });
  }
  return next({ ctx: { ...ctx, user } });
});

const auditMiddlware = t.middleware(async ({ ctx, next, path, type, input }) => {
  if (type !== "mutation" || !ctx.user) return next();
  const result = await next();
  if (result.ok) {
    const ipAddress = ctx.headers.get("x-forwarded-for") ?? ctx.headers.get("x-real-ip");
    const userAgent = ctx.headers.get("user-agent");
    const sanitizedInput = typeof input === "object" && input !== null
      ? { ...input, password: undefined, token: undefined }
      : input;
    try {
      await db.insert(auditLogs).values({
        userId: ctx.user.id,
        action: path,
        entityType: path.split(".")[0] ?? "unknown",
        details: JSON.stringify({ input: sanitizedInput }),
        ipAddress: ipAddress ?? undefined,
        userAgent: userAgent ?? undefined,
      } as any);
    } catch (err) {
      logger.error({ err, path }, "Failed to record audit log for %s", path);
    }
  }
  return result;
});

export const publicProcedure = t.procedure.use(timingMiddleware);
export const protectedProcedure = t.procedure.use(timingMiddleware).use(isAuthed).use(tenantMiddleware).use(licenceGuard).use(auditMiddlware);
export const adminProcedure = t.procedure.use(timingMiddleware).use(isAuthed).use(tenantMiddleware).use(isAdmin).use(licenceGuard).use(auditMiddlware);
export const posProcedure = t.procedure.use(timingMiddleware).use(isAuthed).use(tenantMiddleware).use(licenceGuard).use(enforceRole(["secretaire", "secretaire", "superadmin", "directeur"])).use(auditMiddlware);
export const caisseProcedure = t.procedure.use(timingMiddleware).use(isAuthed).use(tenantMiddleware).use(licenceGuard).use(enforceRole(["secretaire", "secretaire", "comptable", "superadmin", "directeur"])).use(auditMiddlware);
export const stockProcedure = t.procedure.use(timingMiddleware).use(isAuthed).use(tenantMiddleware).use(licenceGuard).use(enforceRole(["magasinier", "superadmin", "directeur"])).use(auditMiddlware);
export const financeProcedure = t.procedure.use(timingMiddleware).use(isAuthed).use(tenantMiddleware).use(licenceGuard).use(enforceRole(["comptable", "superadmin", "directeur"])).use(auditMiddlware);
export const rhProcedure = t.procedure.use(timingMiddleware).use(isAuthed).use(tenantMiddleware).use(licenceGuard).use(enforceRole(["rh", "superadmin", "directeur"])).use(auditMiddlware);

export function requirePermissionProcedure(...permissions: string[]) {
  const permissionCheck = t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
    const user = ctx.user as ExtendedUser;
    if (user.role === "superadmin") return next({ ctx });
    for (const perm of permissions) {
      const has = await RBACService.hasPermission(user.id, perm, String(user.agenceId ?? ""));
      if (has) return next({ ctx });
    }
    throw new TRPCError({ code: "FORBIDDEN", message: `Permission manquante: ${permissions.join(" ou ")}` });
  });
  return t.procedure.use(timingMiddleware).use(isAuthed).use(tenantMiddleware).use(licenceGuard).use(permissionCheck).use(auditMiddlware);
}
