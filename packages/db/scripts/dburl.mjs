import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * URL effective : process.env prime (CI, exports manuels), sinon la ligne
 * active de `packages/db/.env` — au même endroit que `dotenv/config` lu par
 * `drizzle.config.ts`, pour que garde et exécution voient la même cible.
 */
export function resolveUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = resolve(PKG_ROOT, ".env");
  if (!existsSync(envFile)) return "";
  const line = readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .map((l) => /^(\s*#?\s*DATABASE_URL=)"([^"]+)"/.exec(l))
    .find((m) => m && !m[1].includes("#"));
  return line ? line[2] : "";
}

export function isLocalUrl(url) {
  return /@(localhost|127\.0\.0\.1):/.test(url ?? resolveUrl());
}

export function hostOf(url) {
  try { return new URL(url ?? resolveUrl()).host; } catch { return "(URL illisible)"; }
}

/** Refuse une opération sur une base distante, sauf FORCE=1. */
export function assertLocalOrForced(label) {
  const url = resolveUrl();
  if (isLocalUrl(url)) return url;
  if (process.env.FORCE === "1") {
    console.warn(`[${label}] FORCE=1 actif — opération autorisée sur ${hostOf(url)}.`);
    return url;
  }
  console.error(`[${label}] REFUS — cible distante : ${hostOf(url)}`);
  console.error(`  Base locale attendue : postgresql://...@localhost:5432/...`);
  console.error(`  Pour consentir explicitement : FORCE=1 <commande>`);
  process.exit(1);
}

/**
 * Résolution du binaire d'un package sans passer par `exports`
 * (certains packages n'exposent pas `./package.json`) ni par un shell.
 */
export function findBin(pkgName) {
  let dir = PKG_ROOT;
  for (;;) {
    const pkgPath = resolve(dir, "node_modules", pkgName, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      const rel =
        typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.[pkgName] ?? Object.values(pkg.bin ?? {})[0];
      if (rel) {
        const bin = resolve(dirname(pkgPath), rel);
        if (existsSync(bin)) return bin;
      }
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
