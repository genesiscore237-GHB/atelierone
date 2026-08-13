#!/usr/bin/env node
/**
 * DÉPLOIEMENT STANDARDISÉ LIBRACORE (installation client + peuplement catalogue).
 *
 * Usage :
 *   node scripts/deploy.mjs local          → déploie sur la base locale
 *   node scripts/deploy.mjs supabase       → déploie sur la base Supabase cloud
 *   node scripts/deploy.mjs all            → déploie local PUIS supabase, puis compare
 *   node scripts/deploy.mjs backup         → sauvegarde uniquement (local + supabase)
 *   node scripts/deploy.mjs --catalogue <dossier>   → autre dossier d'import (défaut: DOC/import-atelierone)
 *
 * Chaîne exécutée par cible (tout échec interrompt le déploiement) :
 *   1. BACKUP    : pg_dump de la base cible dans backups/
 *   2. SCHÉMA    : reset:schema (DROP+CREATE public) puis migrate:clean
 *                  (migration complète du schéma, non interactive)
 *   3. INSTALL   : seed-install (agence Mvog-Ada → socle → admin → référentiel)
 *   4. VÉRIF     : verify-deploy <dossier> (conformité des fichiers ; BLOQUE si erreur)
 *   5. IMPORT    : import:catalogue <dossier> --apply (peuplement ordonné)
 *   6. VÉRIF DATA: verify-deploy <dossier> --data (invariants en base)
 *
 * Les fichiers .env (racine, apps/nextjs, packages/db) sont basculés sur la
 * cible AVANT les étapes et restaurés à la fin (sauf --keep).
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGUE = (() => {
  const rel = process.argv.includes("--catalogue")
    ? process.argv[process.argv.indexOf("--catalogue") + 1]
    : "DOC/import-atelierone";
  // Chemin ABSOLU : les scripts pnpm s'exécutent depuis packages/db.
  return resolve(ROOT, rel);
})();
const KEEP_ENV = process.argv.includes("--keep");
const PGDUMPS = [
  "pg_dump",
  "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe",
  "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe",
  "/usr/bin/pg_dump",
  "/opt/homebrew/bin/pg_dump",
];

const ENV_FILES = [
  resolve(ROOT, ".env"),
  resolve(ROOT, "apps/nextjs/.env.local"),
  resolve(ROOT, "packages/db/.env"),
];

function readUrl(file) {
  const content = readFileSync(file, "utf8");
  const line = content.split("\n").map((l) => /^(\s*#?\s*DATABASE_URL=)"([^"]+)"/.exec(l)).find((m) => m && !m[1].includes("#"));
  return line ? line[2] : null;
}
const isLocalUrl = (u) => u.includes("@localhost:") || u.includes("@127.0.0.1:");
const isSupabaseUrl = (u) => u.includes("pooler.supabase.com");

function hostOf(url) {
  try { return new URL(url).host; } catch { return "?"; }
}

function switchEnv(mode) {
  console.log(`\n[ENV] Bascule DATABASE_URL → ${mode.toUpperCase()}`);
  execSync(`node scripts/db-switch.mjs ${mode}`, { cwd: ROOT, stdio: "inherit" });
}

function restoreEnv(previous) {
  if (KEEP_ENV) { console.log("[ENV] --keep : environnement cible conservé."); return; }
  for (const f of ENV_FILES) {
    const url = readUrl(f);
    const wasLocal = isLocalUrl(url);
    if (previous === "local" && !wasLocal) switchEnv("local");
    if (previous === "supabase" && !wasLocal && isSupabaseUrl(url)) break;
  }
  console.log("[ENV] Environnement restauré (cible de départ).");
}

function currentTarget() {
  const url = readUrl(ENV_FILES[0]) ?? "";
  if (isLocalUrl(url)) return "local";
  if (isSupabaseUrl(url)) return "supabase";
  return "inconnu";
}

function backup(target) {
  const url = readUrl(ENV_FILES[0]);
  if (!url) { console.error("[BACKUP] DATABASE_URL introuvable"); process.exit(1); }
  mkdirSync(resolve(ROOT, "backups"), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = resolve(ROOT, "backups", `backup-${target}-${stamp}.dump`);
  console.log(`\n[BACKUP] ${target} → ${out}`);
  let pgdump = null;
  for (const p of PGDUMPS) {
    try { execFileSync(p, ["--version"], { stdio: "ignore" }); pgdump = p; break; } catch {}
  }
  if (!pgdump) { console.error("[BACKUP] pg_dump introuvable — backup ignoré (installez PostgreSQL client)."); return null; }
  execFileSync(pgdump, ["-Fc", "-d", url, "-f", out], { stdio: "inherit", env: { ...process.env, PGPASSWORD: new URL(url).password ? decodeURIComponent(new URL(url).password) : "" } });
  console.log(`[BACKUP] OK → ${out}`);
  return out;
}

function runPnpm(args, target) {
  const env = { ...process.env, PATH: process.env.PATH };
  if (target === "supabase") env.FORCE = "1";
  execSync(`pnpm -F @atelierone/db ${args}`, { cwd: ROOT, stdio: "inherit", env });
}

function deploy(target) {
  console.log(`\n${"=".repeat(70)}\nDÉPLOIEMENT → ${target.toUpperCase()}\n${"=".repeat(70)}`);
  const startingTarget = currentTarget();
  if (startingTarget !== target) switchEnv(target);

  backup(target);
  runPnpm(`reset:schema`, target);
  runPnpm(`migrate:clean`, target);
  runPnpm(`seed:install`, target);
  runPnpm(`verify:conformity -- "${CATALOGUE}"`, target);
  runPnpm(`import:catalogue -- "${CATALOGUE}" --apply`, target);
  runPnpm(`verify:data -- "${CATALOGUE}"`, target);
  console.log(`\n${"=".repeat(70)}\nDÉPLOIEMENT ${target.toUpperCase()} TERMINÉ ✓\n${"=".repeat(70)}`);

  if (startingTarget !== target) switchEnv(startingTarget);
}

async function countsOf(target) {
  switchEnv(target);
  const url = readUrl(ENV_FILES[0]);
  const sql = `select
    (select count(*) from agences) agences,
    (select count(*) from utilisateurs) utilisateurs,
    (select count(*) from categories) categories,
    (select count(*) from editeurs) editeurs,
    (select count(*) from fournisseurs) fournisseurs,
    (select count(*) from produits) produits,
    (select count(*) from manuel_scolaire_detail) manuels,
    (select count(*) from produit_unites) produit_unites,
    (select count(*) from produits_fournisseurs) pf,
    (select count(*) from stocks) stocks,
    (select count(*) from ventes) ventes`;
  const script = `
    import postgres from "postgres";
    const sql = postgres(${JSON.stringify(url)}, { ssl: ${isLocalUrl(url) ? "false" : "{ rejectUnauthorized: false }"}, prepare: false });
    const [r] = await sql.unsafe(${JSON.stringify(sql)});
    console.log(JSON.stringify(r));
    await sql.end();
  `;
  const tmp = resolve(ROOT, "packages/db", `counts-${Date.now()}.mjs`);
  writeFileSync(tmp, script);
  const out = execFileSync(process.execPath, [tmp], { cwd: resolve(ROOT, "packages/db"), encoding: "utf8" });
  const counts = JSON.parse(out.trim().split("\n").pop());
  try { execSync(`del "${tmp}"`); } catch {}
  return counts;
}

function compare(local, supabase) {
  console.log(`\n${"=".repeat(70)}\nSYNC LOCAL ↔ SUPABASE\n${"=".repeat(70)}`);
  const keys = ["agences", "utilisateurs", "categories", "editeurs", "fournisseurs", "produits", "manuels", "produit_unites", "pf", "stocks", "ventes"];
  let diff = 0;
  for (const k of keys) {
    const l = Number(local[k] ?? 0);
    const s = Number(supabase[k] ?? 0);
    const ok = l === s;
    if (!ok) diff++;
    console.log(`  ${ok ? "✓" : "✗"} ${k.padEnd(16)} local:${String(l).padStart(6)}  supabase:${String(s).padStart(6)}`);
  }
  console.log(diff === 0 ? "\nSYNC: LES DEUX BASES SONT IDENTIQUES ✓" : `\nSYNC: ${diff} écart(s) — à corriger`);
  return diff;
}

const arg = process.argv[2];

(async () => {
  if (arg === "backup") {
    for (const t of ["local", "supabase"]) {
      const starting = currentTarget();
      if (starting !== t) switchEnv(t);
      backup(t);
      if (starting !== t) switchEnv(starting);
    }
    return;
  }

  if (arg === "local" || arg === "supabase" || arg === "all") {
    if (arg !== "local") {
      const conf = readFileSync(resolve(ROOT, ".env.supabase"), "utf8");
      if (!conf.includes("DATABASE_URL")) { console.error("Fichier .env.supabase introuvable/invalide"); process.exit(1); }
    }
    if (arg === "local" || arg === "all") deploy("local");
    if (arg === "supabase" || arg === "all") deploy("supabase");
    if (arg === "all") {
      const local = await countsOf("local");
      const supabase = await countsOf("supabase");
      compare(local, supabase);
    }
    return;
  }

  if (arg === "sync") {
    const local = await countsOf("local");
    const supabase = await countsOf("supabase");
    const diff = compare(local, supabase);
    process.exit(diff > 0 ? 1 : 0);
  }

  console.log("Usage: node scripts/deploy.mjs [local|supabase|all|backup|sync] [--catalogue <dossier>] [--keep]");
  process.exit(1);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});
