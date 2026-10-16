import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `pnpm db:check` — compare la base locale à la production.
 *
 * Cette commande est documentée dans AGENTS.md comme LA vérification à lancer
 * avant de conclure qu'un travail est terminé. Elle ne fonctionnait pas :
 * `drift-check` exige `DRIFT_A_URL` et `DRIFT_B_URL`, et personne ne les fournissait.
 * Lancer la commande documentée renvoyait `DRIFT_A_URL et DRIFT_B_URL sont
 * requis` — donc la seule façon de savoir si la production suit le local était
 * de connaître la mécanique interne du script.
 *
 * Pire : le hook `pre-push` les fournissait, et fournissait bien. La commande
 * fonctionnait donc **uniquement au moment du push**, ce qui laisse croire à
 * tort qu'elle fonctionne. Un garde-fou qui ne marche que dans un contexte
 * précis et échoue quand on le cherche, c'est un garde-fou qui donne l'illusion de fonctionner.
 *
 * On résout les deux URL ici, depuis le `.env`, et on ne delegate que si
 * l'appelant les fournit réellement — ce qui permet encore de comparer deux
 * bases arbitraires.
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FICHIER_ENV = resolve(RACINE, ".env");

function urlNeon(): string | null {
  if (!existsSync(FICHIER_ENV)) return null;
  const m = readFileSync(FICHIER_ENV, "utf8")
    .split("\n")
    .map((l) => /^\s*#?\s*DATABASE_URL="([^"]+)"/.exec(l))
    .find((x) => x && x[1]!.includes(".neon.tech"));
  return m ? m[1]! : null;
}

function urlLocale(): string | null {
  if (!existsSync(FICHIER_ENV)) return null;
  const m = readFileSync(FICHIER_ENV, "utf8")
    .split("\n")
    .map((l) => /^\s*DATABASE_URL="([^"]+)"/.exec(l))
    .find((x) => x && x[1] && !x[1].includes(".neon.tech"));
  return m ? m[1]! : null;
}

// L'appelant reste maître : comparer deux bases quelconques doit rester possible.
const A = process.env.DRIFT_A_URL ?? urlLocale();
const B = process.env.DRIFT_B_URL ?? urlNeon();

if (!A || !B) {
  console.error(
    "[db:check] Impossible de déterminer les deux bases à comparer.\n" +
      `  Base locale  : ${A ?? "introuvable"}\n` +
      `  Base Neon    : ${B ?? "introuvable"}\n\n` +
      "  Vérifiez le .env, ou fournissez DRIFT_A_URL / DRIFT_B_URL.",
  );
  process.exit(2);
}

const rigides = [A, B].map((u) => u.replace(/:[^:@/]+@/, ":***@"));
console.log(`[db:check] A (référence) : ${rigides[0]}`);
console.log(`[db:check] B (comparé)   : ${rigides[1]}\n`);

const args = process.argv.slice(2);
const r = spawnSync("pnpm", ["-F", "@atelierone/db", "drift:check", ...args], {
  cwd: RACINE,
  stdio: "inherit",
  // Sur Windows, `pnpm` est un script PowerShell : sans `shell`, spawnSync
  // renvoie un statut vide au lieu de le lancer. C'est précisément ce qui
  // faisait échouer cette commande sansmessage — un garde-fou qui sort en
  // silence est plus dangereux qu'un garde-fou qui crie.
  shell: process.platform === "win32",
  env: { ...process.env, DRIFT_A_URL: A, DRIFT_B_URL: B },
});
if (r.error) {
  console.error("[db:check] Impossible de lancer drift:check :", r.error.message);
  process.exit(1);
}
process.exit(r.status ?? 1);