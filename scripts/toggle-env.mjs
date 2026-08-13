#!/usr/bin/env node
// ============================================================================
// AtelierOne - toggle-env : bascule DATABASE_URL local <-> Supabase
// Lit .env.supabase (source de verite cloud, non versionnee) et reecrit
// les DATABASE_URL dans .env (racine) et apps/nextjs/.env.local.
// Usage : node scripts/toggle-env.mjs
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ENV_FILES = [".env", "apps/nextjs/.env.local"];
const LOCAL_PREFIX = "postgresql://postgres:postgres@localhost";

function readSupabaseUrl() {
  const raw = fs.readFileSync(path.join(ROOT, ".env.supabase"), "utf8");
  const m = raw.match(/^DATABASE_URL=(?:"([^"]*)"|(\S+))/m);
  if (!m || !(m[1] ?? m[2])) {
    throw new Error("DATABASE_URL introuvable dans .env.supabase");
  }
  return m[1] ?? m[2];
}

function currentMode() {
  const raw = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
  const m = raw.match(/^DATABASE_URL="([^"\r\n]*)"/m);
  if (!m) throw new Error("DATABASE_URL active introuvable dans .env (racine)");
  return m[1].includes("localhost") ? "LOCAL" : "SUPABASE";
}

function apply(files, supabaseUrl, target) {
  for (const rel of files) {
    const p = path.join(ROOT, rel);
    let txt = fs.readFileSync(p, "utf8");
    if (target === "SUPABASE") {
      txt = txt.replace(/^# DATABASE_URL="(?!postgresql:\/\/postgres:postgres@localhost)[^"\r\n]*"[ \t]*(?=\r?\n|$)/gm, `DATABASE_URL="${supabaseUrl}"`);
      txt = txt.replace(/^DATABASE_URL="postgresql:\/\/postgres:postgres@localhost[^"\r\n]*"/gm, "# $&");
    } else {
      txt = txt.replace(/^DATABASE_URL="[^"\r\n]*"/gm, "# $&");
      txt = txt.replace(/^# (DATABASE_URL="postgresql:\/\/postgres:postgres@localhost[^"\r\n]*")/gm, "$1");
    }
    fs.writeFileSync(p, txt);
    console.log(`  [ok] ${rel} -> ${target === "SUPABASE" ? "SUPABASE CLOUD" : "LOCAL DEV"}`);
  }
}

try {
  const supabaseUrl = readSupabaseUrl();
  const mode = currentMode();
  const target = mode === "LOCAL" ? "SUPABASE" : "LOCAL";

  console.log("============================================");
  console.log(" AtelierOne - Environnement Switch");
  console.log("============================================");
  console.log(`  Actuellement : ${mode === "LOCAL" ? "LOCAL DEV (localhost)" : "SUPABASE CLOUD"}`);
  console.log(`  Bascule vers : ${target === "SUPABASE" ? "SUPABASE CLOUD" : "LOCAL DEV (localhost)"} ...`);

  apply(ENV_FILES, supabaseUrl, target);

  console.log(`  > Mode ${target === "SUPABASE" ? "SUPABASE CLOUD" : "LOCAL DEV"} actif`);
  console.log("  Fait ! Redemarre le dev avec : npm run dev");
} catch (e) {
  console.error(`  ERREUR: ${e.message}`);
  process.exitCode = 1;
}
