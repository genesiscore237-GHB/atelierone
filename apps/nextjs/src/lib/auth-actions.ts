"use server";

import { db, utilisateurs, verificationTokens } from "@atelierone/db";
import { inviteUserSchema, setupPasswordSchema, checkEmailSchema } from "@atelierone/validators";
import { eq, and, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { auth } from "@atelierone/auth";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class InMemoryRateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private maxAttempts: number;
  private windowMs: number;

  constructor(maxAttempts: number, windowMs: number) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  async check(key: string): Promise<{ success: boolean }> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return { success: true };
    }

    if (entry.count >= this.maxAttempts) {
      return { success: false };
    }

    entry.count++;
    return { success: true };
  }
}

const emailCheckLimiter = new InMemoryRateLimiter(10, 15 * 60 * 1000);
const activateLimiter = new InMemoryRateLimiter(5, 15 * 60 * 1000);

export async function checkEmailForActivationAction(email: string, token: string) {
  try {
    const ipKey = "check-email";
    const ipCheck = await emailCheckLimiter.check(`ip:${ipKey}`);
    if (!ipCheck.success) {
      return { error: "Trop de tentatives. Veuillez réessayer dans 15 minutes." };
    }

    const parsed = checkEmailSchema.safeParse({ email, token });
    if (!parsed.success) {
      return { error: "Données invalides" };
    }

    const [tokenRecord] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.token, token),
          eq(verificationTokens.isUsed, false),
          sql`${verificationTokens.expiresAt} > NOW()`
        )
      )
      .limit(1);

    if (!tokenRecord) {
      return { error: "Lien d'invitation invalide ou expiré." };
    }

    const [user] = await db
      .select()
      .from(utilisateurs)
      .where(
        and(
          eq(utilisateurs.id, Number(tokenRecord.userId)),
          eq(utilisateurs.email, email),
          eq(utilisateurs.status, "invited"),
          sql`${utilisateurs.motDePasse} IS NULL`
        )
      )
      .limit(1);

    if (!user) {
      return { error: "Email incorrect ou compte déjà activé." };
    }

    return { success: true as const };
  } catch (e) {
    return { error: "Une erreur est survenue. Veuillez réessayer." };
  }
}

export async function activateAccountAction(params: { email: string; password: string; token: string }) {
  try {
    const ipKey = "activate";
    const ipCheck = await activateLimiter.check(`ip:${ipKey}`);
    if (!ipCheck.success) {
      return { error: "Trop de tentatives. Veuillez réessayer dans 15 minutes." };
    }

    const parsed = setupPasswordSchema.safeParse(params);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return { error: firstError?.message ?? "Données invalides" };
    }

    const { email, password, token } = parsed.data;

    const [tokenRecord] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.token, token),
          eq(verificationTokens.isUsed, false),
          sql`${verificationTokens.expiresAt} > NOW()`
        )
      )
      .limit(1);

    if (!tokenRecord) {
      return { error: "Lien d'invitation invalide ou expiré." };
    }

    const [user] = await db
      .select()
      .from(utilisateurs)
      .where(
        and(
          eq(utilisateurs.id, Number(tokenRecord.userId)),
          eq(utilisateurs.email, email)
        )
      )
      .limit(1);

    if (!user) {
      return { error: "Utilisateur non trouvé." };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.transaction(async (tx) => {
      await tx
        .update(utilisateurs)
        .set({
          motDePasse: hashedPassword,
          status: "active",
          emailVerified: new Date(),
          isActive: true,
        } as any)
        .where(eq(utilisateurs.id, user.id));

      await tx
        .update(verificationTokens)
        .set({
          isUsed: true,
          usedAt: new Date(),
        } as any)
        .where(eq(verificationTokens.id, tokenRecord.id));
    });

    return { success: true as const };
  } catch {
    return { error: "Une erreur est survenue lors de l'activation." };
  }
}

export async function inviteMemberAction(params: {
  nom: string;
  prenom?: string;
  email: string;
  telephone?: string;
  roleId: string;
}) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { error: "Vous devez être connecté." };
    }

    const parsed = inviteUserSchema.safeParse(params);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return { error: firstError?.message ?? "Données invalides" };
    }

    const { nom, prenom, email, telephone, roleId } = parsed.data;

    const [existing] = await db
      .select({ id: utilisateurs.id })
      .from(utilisateurs)
      .where(eq(utilisateurs.email, email))
      .limit(1);

    if (existing) {
      return { error: "Un utilisateur avec cet email existe déjà." };
    }

    const [newUser] = await db
      .insert(utilisateurs)
      .values({
        email,
        nom,
        prenom: prenom ?? null,
        telephone: telephone ?? null,
        agenceId: session.user.agenceId,
        roleId,
        status: "invited",
        motDePasse: null,
        isActive: false,
      } as any)
      .returning({ id: utilisateurs.id });

    if (!newUser) {
      return { error: "Échec de la création de l'utilisateur." };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(verificationTokens).values({
      userId: newUser.id,
      token,
      type: "account_activation",
      expiresAt,
    } as any);

    return {
      success: true as const,
      activationLink: `/auth/setup-password?token=${token}`,
    };
  } catch {
    return { error: "Une erreur est survenue lors de l'invitation." };
  }
}

export async function checkExistingEmailAction(email: string) {
  try {
    const [user] = await db
      .select({ id: utilisateurs.id })
      .from(utilisateurs)
      .where(eq(utilisateurs.email, email))
      .limit(1);

    return { exists: !!user };
  } catch {
    return { exists: false };
  }
}

const firstLoginLimiter = new InMemoryRateLimiter(5, 15 * 60 * 1000);

export async function verifyLoginIdAction(email: string) {
  try {
    const ipCheck = await firstLoginLimiter.check(`ip:verify-login`);
    if (!ipCheck.success) {
      return { error: "Trop de tentatives. Veuillez réessayer dans 15 minutes." };
    }

    if (!email || !/^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) {
      return { error: "Identifiant invalide." };
    }

    const [user] = await db
      .select({ id: utilisateurs.id, nom: utilisateurs.nom, prenom: utilisateurs.prenom })
      .from(utilisateurs)
      .where(
        and(
          eq(utilisateurs.email, email.toLowerCase()),
          eq(utilisateurs.status, "invited"),
          sql`${utilisateurs.motDePasse} IS NULL`
        )
      )
      .limit(1);

    if (!user) {
      return { error: "Identifiant introuvable ou compte déjà activé. Contactez votre administrateur." };
    }

    return { success: true as const, user: { id: user.id, nom: user.nom, prenom: user.prenom } };
  } catch {
    return { error: "Une erreur est survenue. Veuillez réessayer." };
  }
}

export async function activateFirstLoginAction(params: { email: string; password: string }) {
  try {
    const ipCheck = await firstLoginLimiter.check(`ip:activate`);
    if (!ipCheck.success) {
      return { error: "Trop de tentatives. Veuillez réessayer dans 15 minutes." };
    }

    if (!params.email || !params.password || params.password.length < 6) {
      return { error: "Le mot de passe doit contenir au moins 6 caractères." };
    }

    const [user] = await db
      .select({ id: utilisateurs.id })
      .from(utilisateurs)
      .where(
        and(
          eq(utilisateurs.email, params.email.toLowerCase()),
          eq(utilisateurs.status, "invited"),
          sql`${utilisateurs.motDePasse} IS NULL`
        )
      )
      .limit(1);

    if (!user) {
      return { error: "Identifiant introuvable ou compte déjà activé." };
    }

    const hashedPassword = await bcrypt.hash(params.password, 10);

    await db
      .update(utilisateurs)
      .set({
        motDePasse: hashedPassword,
        status: "active",
        isActive: true,
        emailVerified: new Date(),
        updatedAt: new Date(),
      } as any)
      .where(eq(utilisateurs.id, user.id));

    return { success: true as const };
  } catch {
    return { error: "Une erreur est survenue lors de l'activation." };
  }
}

export async function getOrCreateActivationLinkAction(email: string) {
  try {
    const parsed = checkEmailSchema.safeParse({ email, token: "placeholder" });
    if (!parsed.success) {
      return { error: "Email invalide." };
    }

    const [user] = await db
      .select({ id: utilisateurs.id, status: utilisateurs.status })
      .from(utilisateurs)
      .where(eq(utilisateurs.email, email))
      .limit(1);

    if (!user) {
      return { error: "Aucun compte trouvé avec cet email. Contactez votre administrateur." };
    }

    if (user.status !== "invited") {
      return { error: "Ce compte est déjà activé. Veuillez vous connecter." };
    }

    await db
      .update(verificationTokens)
      .set({ isUsed: true, usedAt: new Date() } as any)
      .where(
        and(
          eq(verificationTokens.userId, user.id),
          eq(verificationTokens.type, "account_activation"),
          eq(verificationTokens.isUsed, false)
        )
      );

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(verificationTokens).values({
      userId: user.id,
      token,
      type: "account_activation",
      expiresAt,
    } as any);

    return {
      success: true as const,
      activationLink: `/auth/setup-password?token=${token}`,
    };
  } catch {
    return { error: "Une erreur est survenue." };
  }
}

export async function resendInviteAction(userId: string) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { error: "Vous devez être connecté." };
    }

    const [user] = await db
      .select({ id: utilisateurs.id, email: utilisateurs.email, status: utilisateurs.status })
      .from(utilisateurs)
      .where(
        and(
          eq(utilisateurs.id, Number(userId)),
          eq(utilisateurs.agenceId, Number(session.user.agenceId))
        )
      )
      .limit(1);

    if (!user) {
      return { error: "Utilisateur non trouvé." };
    }

    if (user.status !== "invited") {
      return { error: "Cet utilisateur est déjà activé." };
    }

    await db
      .update(verificationTokens)
      .set({ isUsed: true, usedAt: new Date() } as any)
      .where(
        and(
          eq(verificationTokens.userId, Number(userId)),
          eq(verificationTokens.type, "account_activation"),
          eq(verificationTokens.isUsed, false)
        )
      );

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(verificationTokens).values({
      userId: Number(userId),
      token,
      type: "account_activation",
      expiresAt,
    } as any);

    return {
      success: true as const,
      activationLink: `/auth/setup-password?token=${token}`,
    };
  } catch {
    return { error: "Une erreur est survenue." };
  }
}
