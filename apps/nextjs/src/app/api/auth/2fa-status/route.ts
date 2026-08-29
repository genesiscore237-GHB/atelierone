import { NextResponse } from "next/server";
import { db, utilisateurs } from "@atelierone/db";
import { eq } from "drizzle-orm";

/** Statut 2FA d'un compte (pour afficher le champ code au login). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "email requis" }, { status: 400 });
    const [u] = await db.select({ twoFactorEnabled: utilisateurs.twoFactorEnabled }).from(utilisateurs).where(eq(utilisateurs.email, email)).limit(1);
    return NextResponse.json({ required: u?.twoFactorEnabled === true });
  } catch {
    return NextResponse.json({ required: false });
  }
}