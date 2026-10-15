#!/usr/bin/env node
/**
 * VERROU DE COHÉRENCE AVANT POUSSUER SUR `main`
 *
 * Ce que le projet cherche à garantir : après un push et la migration, la
 * production est le même que le local. Symétriquement, il faut empêcher qu'un
 * push arrive sur `main` alors que la base ne suit pas — sinon la garantie
 * n'est vraie qu'au moment où l'on pense à la vérifier, c'est-à-dire jamais.
 *
 * Pourquoi un hook local et non une étape de CI :
 *   - la CI ne peut pas écrire en production sans déposer les identifiants
 *     Neon dans les secrets GitHub, ce qui ouvre l'écriture en production à
 *     tout le dépôt et à toutes ses dépendances ;
 *   - le hook échoue AVANT le push : le code refusant d'arriver est plus sûr
 *     que le code qu'il faut rattraper ensuite.
 *
 * Le verrou est donc volontairement étroit :
 *   - uniquement sur `main` — pousser une branche de travail ne touche rien ;
 *   - uniquement de l'ADDITION idempotent (`db:sync`) : aucune migration ne
 *     supprime de données, c'est une exigence du dépôt ;
 *   - vérification de dérive (`db:check`) : si la production ne rejoint pas le
 *     local, le push est ANNULÉ.
 *
 * Contournement explicite quand on sait ce qu'on fait :
 *     NO_VERROU_BASE=1 git push origin main
 * Le motif est alors demandé, pour qu'une exception reste un acte motivé.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FICHIER_ENV = resolve(ROOT, ".env");

/**
 * Vrai si le push vise `main`.
 *
 * ATTENTION au contrat de git : un hook `pre-push` reçoit la liste des
 * RÉFÉRENCES sur STDIN, et non dans ses arguments — argv ne contient que le
 * nom du dépôt distant et son URL. Lire argv revient donc à ne jamais voir la
 * branche : le hook sortait sans rien vérifier, en silence, sur chaque push.
 * Format de stdin, une ligne par référence poussée :
 *   <ref locale> SP <sha local> SP <ref distante> SP <sha distant> LF
 */
function cibleMain() {
  let stdin = "";
  try {
    stdin = readFileSync(0, "utf8");
  } catch {
    // Pas de stdin (lancement manuel) : on ne peut rien prouver.
    return false;
  }
  const lignes = stdin.split("\n").filter(Boolean);
  if (lignes.length === 0) return false;
  return lignes.some((l) => l.split(" ")[0] === "refs/heads/main");
}

/** Variante « neon » de DATABASE_URL, présente et commentée dans le .env. */
function urlNeon() {
  if (!existsSync(FICHIER_ENV)) return null;
  const ligne = readFileSync(FICHIER_ENV, "utf8")
    .split("\n")
    .map((l) => /^\s*#?\s*DATABASE_URL="([^"]+)"/.exec(l))
    .find((m) => m && m[1].includes(".neon.tech"));
  return ligne ? ligne[1] : null;
}

function pas(fn, args, env = {}) {
  const r = spawnSync(fn, args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } });
  return r.status === 0;
}

if (!cibleMain()) {
  process.exit(0);
}

if (process.env.NO_VERROU_BASE === "1") {
  console.warn("[verrou-base] IGNORÉ (NO_VERROU_BASE=1) — la production peut diverger.");
  process.exit(0);
}

const neon = urlNeon();
if (!neon) {
  console.warn("[verrou-base] Aucune variante Neon dans .env — verrou non appliqué.");
  process.exit(0);
}

console.log("\n[verrou-base] Push sur main : synchronisation de la production.\n");

const envProd = { DATABASE_URL: neon, FORCE: "1" };

if (!pas("pnpm", ["-F", "@atelierone/db", "db:sync"], envProd)) {
  console.error("\n[verrou-base] ÉCHEC de la synchronisation — push annulé.");
  console.error("            Corrigez la base, ou passez par NO_VERROU_BASE=1 en connaissance de cause.");
  process.exit(1);
}

const local = readFileSync(FICHIER_ENV, "utf8")
  .split("\n")
  .map((l) => /^\s*DATABASE_URL="([^"]+)"/.exec(l))
  .find((m) => m && !m[1].includes(".neon.tech"));

if (local) {
  const r = spawnSync("pnpm", ["-F", "@atelierone/db", "drift:check"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, DRIFT_A_URL: local[1], DRIFT_B_URL: neon },
  });
  if (r.status !== 0) {
    console.error("\n[verrou-base] DÉRIVE BLOQUANTE — push annulé.");
    console.error("\n            La production ne peut pas exécuter ce que le local sait faire.");
    process.exit(1);
  }
}

console.log("[verrou-base] Production alignée — push autorisé.\n");
process.exit(0);
