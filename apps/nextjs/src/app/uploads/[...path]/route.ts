import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

/**
 * SERVICE DES FICHIERS TÉLÉVERSÉS — /uploads/<dossier>/<fichier>
 *
 * Jusqu'ici, `POST /api/uploads` écrivait bien le fichier sur le disque, mais
 * RIEN ne le relisait : en production c'est nginx qui sert /uploads/ (voir
 * deploy/nginx-atelierone.conf), et en développement aucun serveur ne
 * répondait. Une photo téléversée s'affichait donc comme une image cassée —
 * le fichier existait, il était inatteignable.
 *
 * Cette route comble ce trou. Elle est additive : derrière nginx, la règle
 * `location /uploads/` répond avant que la requête n'atteigne Next.js ; sans
 * nginx (poste de développement), c'est elle qui sert les fichiers.
 *
 * Elle ne sert QUE les extensions que l'upload accepte déjà : déposer un
 * fichier d'un autre type dans le dossier ne suffit pas à le rendre public.
 */

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
};

const UPLOAD_DIR = path.resolve(
  process.env.UPLOAD_DIR || path.join(process.cwd(), "..", "..", "uploads"),
);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;

  // Résolution puis vérification : la racine calculée doit rester un préfixe
  // du chemin final. C'est ce qui empêche `../../` de sortir du dossier.
  const cible = path.resolve(UPLOAD_DIR, ...segments);
  if (cible !== UPLOAD_DIR && !cible.startsWith(UPLOAD_DIR + path.sep)) {
    return NextResponse.json({ error: "Chemin invalide" }, { status: 400 });
  }

  const type = TYPES[path.extname(cible).toLowerCase()];
  if (!type) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  try {
    const contenu = await readFile(cible);
    return new NextResponse(new Uint8Array(contenu), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(contenu.byteLength),
        // Mêmes en-têtes que nginx, pour que le développement ne cache pas
        // moins bien que la production.
        "Cache-Control": "public, max-age=2592000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
}
