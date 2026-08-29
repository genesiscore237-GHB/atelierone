import bcrypt from "bcryptjs";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";
import { loginSchema } from "@atelierone/validators";
import { loginRateLimiter } from "./rate-limiter";
import { doThrow } from "./utils";
import type { ExtendedUser, UserRole } from "./types";

async function getDb() {
  const { db, utilisateurs, agences, roles, rolePermissions, permissions, auditLogs } = await import("@atelierone/db");
  return { db, utilisateurs, agences, roles, rolePermissions, permissions, auditLogs };
}

async function getUserPermissions(roleId: string): Promise<string[]> {
  const { db, permissions, rolePermissions } = await getDb();
  const { eq } = await import("drizzle-orm");
  const result = await db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));
  return result.map((r) => r.code);
}

async function recordAuditLog(params: {
  userId: number;
  action: string;
  entityType: string;
  entityId?: number;
  ipAddress?: string;
}) {
  try {
    const { db, auditLogs } = await getDb();
    await db.insert(auditLogs).values({
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      ipAddress: params.ipAddress ?? null,
    } as any);
  } catch {
    console.error("Failed to record audit log");
  }
}

export const config: Omit<NextAuthConfig, "providers"> & {
  providers: ReturnType<typeof CredentialsProvider>[];
} = {
  secret: process.env.AUTH_SECRET ?? doThrow("AUTH_SECRET is not set"),
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 jours d'inactivité maximum
    updateAge: 24 * 60 * 60, // renouvellement de session toutes les 24 h d'activité
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials, req) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const ipAddress =
          req?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          req?.headers?.get("x-real-ip") ??
          "unknown";

        const [ipCheck, emailCheck] = await Promise.all([
          loginRateLimiter.check(`ip:${ipAddress}`),
          loginRateLimiter.check(`email:${email}`),
        ]);

        if (!ipCheck.success || !emailCheck.success) return null;

        const { db, utilisateurs, agences, roles } = await getDb();
        const { eq } = await import("drizzle-orm");

        const userResult = await db
          .select({
            id: utilisateurs.id,
            email: utilisateurs.email,
            nom: utilisateurs.nom,
            prenom: utilisateurs.prenom,
            motDePasse: utilisateurs.motDePasse,
            isActive: utilisateurs.isActive,
            status: utilisateurs.status,
            agenceId: utilisateurs.agenceId,
            roleId: utilisateurs.roleId,
            twoFactorEnabled: utilisateurs.twoFactorEnabled,
            twoFactorSecret: utilisateurs.twoFactorSecret,
            agenceName: agences.nom,
          })
          .from(utilisateurs)
          .leftJoin(agences, eq(utilisateurs.agenceId, agences.id))
          .where(eq(utilisateurs.email, email))
          .limit(1);

        const foundUser = userResult[0];
        if (!foundUser) return null;
        if (!foundUser.motDePasse) return null;
        if (!foundUser.isActive) return null;

        const isValidPassword = await bcrypt.compare(password, foundUser.motDePasse);
        if (!isValidPassword) return null;

        // 2FA : si activé, le code TOTP est obligatoire
        if (foundUser.twoFactorEnabled) {
          const totpCode = (credentials as Record<string, unknown>)?.totp as string | undefined;
          const { verifierCodeTOTP } = await import("./totp-service");
          if (!totpCode || !foundUser.twoFactorSecret || !verifierCodeTOTP(foundUser.twoFactorSecret, totpCode)) {
            return null;
          }
        }

        const roleId = foundUser.roleId ?? "9";
        const roleResult = await db
          .select({ code: roles.code })
          .from(roles)
          .where(eq(roles.id, roleId))
          .limit(1);

        const roleCode = (roleResult[0]?.code as UserRole) ?? "consultation";
        const userPermissions = await getUserPermissions(roleId);
        const fullName = `${foundUser.nom} ${foundUser.prenom ?? ""}`.trim();

        await loginRateLimiter.reset(`email:${email}`);
        await loginRateLimiter.reset(`ip:${ipAddress}`);

        await recordAuditLog({
          userId: foundUser.id,
          action: "LOGIN_SUCCESS",
          entityType: "utilisateur",
          entityId: foundUser.id,
          ipAddress,
        });

        return {
          id: String(foundUser.id),
          email: foundUser.email,
          name: fullName,
          agenceId: foundUser.agenceId,
          organizationId: String(foundUser.agenceId),
          agenceName: foundUser.agenceName ?? "",
          role: roleCode,
          permissions: userPermissions,
          isActive: foundUser.isActive,
          status: foundUser.status ?? "active",
        } as ExtendedUser;
      },
    }),
  ],
};
