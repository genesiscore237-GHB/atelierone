#!/usr/bin/env node
// Bascule DATABASE_URL entre PostgreSQL local et Supabase cloud.
// Usage: node scripts/db-switch.mjs [local|supabase]
// Met à jour, de façon cohérente :
//   - .env (racine)                 -> source de vérité (format toggle #)
//   - apps/nextjs/.env.local        -> format toggle identique
//   - packages/db/.env              -> single-line (drizzle-kit, seeds)

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOGGLE_FILES = [resolve(root, ".env"), resolve(root, "apps/nextjs/.env.local")];
const SINGLE_FILE = resolve(root, "packages/db/.env");

const mode = process.argv[2];
if (!["local", "supabase", "current"].includes(mode)) {
  console.error("Usage: node scripts/db-switch.mjs [local|supabase|current]");
  process.exit(1);
}

const URL_RE = /^(\s*#?\s*DATABASE_URL=)"([^"]+)"\s*$/;
const isLocalUrl = (u) => u.includes("@localhost:") || u.includes("@127.0.0.1:");
const isSupabaseUrl = (u) => u.includes("pooler.supabase.com");

function hostOf(url) {
  try { return new URL(url).host; } catch { return "?"; }
}

if (mode === "current") {
  console.log("État DATABASE_URL :");
  for (const f of [...TOGGLE_FILES, SINGLE_FILE]) {
    const content = readFileSync(f, "utf8");
    const line = content.split("\n").map((l) => URL_RE.exec(l)).filter(Boolean).find((m) => !m[1].includes("#"));
    console.log(`  ${line ? (isLocalUrl(line[2]) ? "LOCAL    " : isSupabaseUrl(line[2]) ? "SUPABASE " : "INCONNU  ") : "non déf."} ${f.replace(root, ".")} -> ${line ? hostOf(line[2]) : "-"}`);
  }
  process.exit(0);
}

function setToggleLine(line, mode) {
  const m = URL_RE.exec(line);
  if (!m) return line;
  const url = m[2];
  let shouldBeActive = false;
  if (isLocalUrl(url)) shouldBeActive = mode === "local";
  else if (isSupabaseUrl(url)) shouldBeActive = mode === "supabase";
  else return line; // variante inconnue : laisser intacte
  if (shouldBeActive) return line.replace(/^(\s*)#\s*(DATABASE_URL=)/, "$1$2");
  return line.replace(/^(\s*)(DATABASE_URL=)/, "$1# $2");
}

const toggles = TOGGLE_FILES.map((file) => {
  const before = readFileSync(file, "utf8");
  const after = before.split("\n").map((l) => setToggleLine(l, mode)).join("\n");
  writeFileSync(file, after);
  const active = (after.match(URL_RE) || []).filter((m) => m && !m[1].includes("#"));
  const activeUrl = after.split("\n").map((l) => URL_RE.exec(l)).filter(Boolean).find((m) => !m[1].includes("#"));
  return { file, url: activeUrl ? activeUrl[2] : null };
});

const rootEnv = readFileSync(TOGGLE_FILES[0], "utf8");
const targetUrl = rootEnv.split("\n").map((l) => URL_RE.exec(l)).filter(Boolean).find((m) => {
  const u = m[2];
  return mode === "local" ? isLocalUrl(u) : isSupabaseUrl(u);
});
if (!targetUrl) {
  console.error(`Introuvable: variante "${mode}" dans ${TOGGLE_FILES[0]}`);
  process.exit(1);
}
writeFileSync(SINGLE_FILE, `DATABASE_URL="${targetUrl[2]}"\n`);

console.log(`Bascule DB -> ${mode.toUpperCase()} (${hostOf(targetUrl[2])})`);
for (const t of toggles) {
  const active = t.url ? (mode === "local" ? isLocalUrl(t.url) : isSupabaseUrl(t.url)) : false;
  console.log(`  ${active ? "OK " : "!! "} ${t.file.replace(root, ".")} -> ${t.url ? hostOf(t.url) : "aucune"}`);
}
console.log(`  OK  ${SINGLE_FILE.replace(root, ".")} -> ${hostOf(targetUrl[2])}`);
