#!/usr/bin/env node
/**
 * Garde-fou drizzle-kit : toute opération de schéma (push/migrate/studio)
 * est refusée si DATABASE_URL pointe vers une base distante (Neon, Supabase),
 * sauf consentement explicite FORCE=1.
 *
 * Motif : `drizzle-kit push` est destructeur (DROP/ALTER calculés en aveugle).
 * Les seeds et scripts reset ont déjà le même garde-fou via
 * `requireLocalOrForced()` (src/env-guard.ts) ; drizzle-kit étant un binaire
 * externe, il faut un wrapper Node dédié.
 *
 * Usage : node scripts/drizzle-guard.mjs <push|migrate|studio|...> [args...]
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { PKG_ROOT, findBin, hostOf, isLocalUrl, resolveUrl } from "./dburl.mjs";

const url = resolveUrl();
const isLocal = isLocalUrl(url);

if (!isLocal && process.env.FORCE !== "1") {
  console.error(`[drizzle-guard] REFUS — l'opération demandée cible une base distante.`);
  console.error(`  cible : ${url ? hostOf(url) : "(aucune DATABASE_URL)"}`);
  console.error(`  Cette opération peut SUPPRIMER des colonnes, index, contraintes ou tables.`);
  console.error(`  Base locale attendue : postgresql://...@localhost:5432/...`);
  console.error(`  Pour consentir explicitement : FORCE=1 <commande>`);
  process.exit(1);
}

if (!isLocal) {
  console.warn(`[drizzle-guard] FORCE=1 actif — opération autorisée sur ${hostOf(url)}.`);
}

const drizzleKitBin = findBin("drizzle-kit");
if (!drizzleKitBin) {
  console.error("[drizzle-guard] drizzle-kit introuvable dans node_modules.");
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/drizzle-guard.mjs <commande drizzle-kit> [args...]");
  process.exit(1);
}

const res = spawnSync(process.execPath, [drizzleKitBin, ...args], {
  stdio: "inherit",
  cwd: PKG_ROOT,
  env: process.env,
});

process.exit(res.status ?? 1);
