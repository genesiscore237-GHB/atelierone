import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Le service des fichiers téléversés n'avait aucun test, parce qu'il n'existait
 * pas : les fichiers étaient écrits sur le disque et jamais relus.
 *
 * Ces tests s'exécutent sur un dossier temporaire dédié (UPLOAD_DIR fixé avant
 * l'import du module, qui le lit à ce moment-là) : ils ne touchent ni aux
 * vrais fichiers téléversés, ni à la base.
 */

type GetRoute = (
  req: unknown,
  ctx: { params: Promise<{ path: string[] }> },
) => Promise<Response>;

let GET: GetRoute;
let racine: string;

const OCTETS_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

const appeler = (segments: string[]) =>
  GET({} as never, { params: Promise.resolve({ path: segments }) });

beforeAll(async () => {
  racine = await mkdtemp(path.join(tmpdir(), "uploads-service-"));
  process.env.UPLOAD_DIR = racine;
  ({ GET } = (await import("./route")) as { GET: GetRoute });

  await mkdir(path.join(racine, "articles"), { recursive: true });
  await writeFile(path.join(racine, "articles", "photo.png"), OCTETS_PNG);
  // Fichier réel mais d'un type que l'upload n'accepte pas : il ne doit pas
  // devenir public simplement parce qu'il est présent dans le dossier.
  await writeFile(path.join(racine, "articles", "notes.txt"), "interdit");
});

afterAll(async () => {
  delete process.env.UPLOAD_DIR;
  await rm(racine, { recursive: true, force: true });
});

describe("service des fichiers téléversés", () => {
  it("sert un fichier déposé par l'upload, avec son type et ses octets", async () => {
    const res = await appeler(["articles", "photo.png"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(OCTETS_PNG);
  });

  it("refuse de sortir du dossier (traversée de chemin)", async () => {
    const res = await appeler(["..", "..", "package.json"]);
    expect(res.status).toBe(400);
  });

  it("ne sert pas une extension que l'upload refuse", async () => {
    const res = await appeler(["articles", "notes.txt"]);
    expect(res.status).toBe(404);
  });

  it("rend 404 pour un fichier absent", async () => {
    const res = await appeler(["articles", "absente.png"]);
    expect(res.status).toBe(404);
  });
});
