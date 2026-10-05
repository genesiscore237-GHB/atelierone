import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@atelierone/auth";
import { db, parkingVehicles } from "@atelierone/db";

export const dynamic = "force-dynamic";

// Une photo du registre parking est stockée en jsonb sous forme de data URL
// (base64). L'inclure dans le JSON tRPC faisait transiter ~11 Mo par liste.
// Cette route sert le binaire, avec redimensionnement webp à la volée (sharp).
const DATA_URL = /^data:([\w/+.-]+);base64,(.+)$/s;

function parseDataUrl(url: string): { mime: string; buffer: Buffer } | null {
  const m = DATA_URL.exec(url);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id, index } = await params;
  const vehicleId = Number(id);
  const photoIndex = Number(index);
  if (!Number.isInteger(vehicleId) || !Number.isInteger(photoIndex) || photoIndex < 0) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const [row] = await db
    .select({ photos: parkingVehicles.photos, agenceId: parkingVehicles.agenceId })
    .from(parkingVehicles)
    .where(and(eq(parkingVehicles.id, vehicleId), eq(parkingVehicles.agenceId, session.user.agenceId)))
    .limit(1);

  const photo = row?.photos?.[photoIndex];
  if (!photo?.url) {
    return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });
  }

  // Certaines photos peuvent déjà être une URL relative (upload disque).
  if (!photo.url.startsWith("data:")) {
    return NextResponse.redirect(new URL(photo.url, req.url));
  }

  const parsed = parseDataUrl(photo.url);
  if (!parsed) {
    return NextResponse.json({ error: "Format de photo illisible" }, { status: 415 });
  }

  const width = Number(new URL(req.url).searchParams.get("w"));
  let body: Uint8Array = new Uint8Array(parsed.buffer);
  let mime = parsed.mime;

  if (Number.isFinite(width) && width > 0) {
    try {
      const sharp = (await import("sharp")).default;
      body = new Uint8Array(
        await sharp(parsed.buffer)
          .rotate()
          .resize({ width: Math.min(width, 1600), withoutEnlargement: true })
          .webp({ quality: 72 })
          .toBuffer(),
      );
      mime = "image/webp";
    } catch {
      /* sharp indisponible : on sert l'original */
    }
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
