#!/usr/bin/env node
// Bascule DATABASE_URL entre PostgreSQL local, Supabase cloud et Neon cloud.
// Usage: node scripts/db-switch.mjs [local|supabase|neon|current]
// Met à jour, de façon cohérente :
//   - .env (racine)                 -> source de vérité (format toggle #)
//   - apps/nextjs/.env.local        -> format toggle identique
//   - packages/db/.env              -> ligne active (drizzle-kit, seeds)

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOGGLE_FILES = [resolve(root, ".env"), resolve(root, "apps/nextjs/.env.local")];
const SINGLE_FILE = resolve(root, "packages/db/.env");

const mode = process.argv[2];
if (!["local", "supabase", "neon", "current"].includes(mode)) {
  console.error("Usage: node scripts/db-switch.mjs [local|supabase|neon|current]");
  process.exit(1);
}

const URL_RE = /^(\s*#?\s*DATABASE_URL=)"([^"]+)"\s*$/;
const KINDS = {
  local: (u) => u.includes("@localhost:") || u.includes("@127.0.0.1:"),
  supabase: (u) => u.includes("pooler.supabase.com"),
  neon: (u) => u.includes(".neon.tech"),
};
const kindOf = (u) => Object.keys(KINDS).find((k) => KINDS[k](u)) ?? null;
const isLocalUrl = KINDS.local;

function hostOf(url) {
  try { return new URL(url).host; } catch { return "?"; }
}

if (mode === "current") {
  console.log("État DATABASE_URL :");
  for (const f of [...TOGGLE_FILES, SINGLE_FILE]) {
    const content = readFileSync(f, "utf8");
    const line = content.split("\n").map((l) => URL_RE.exec(l)).filter(Boolean).find((m) => !m[1].includes("#"));
    const label = line ? (kindOf(line[2]) ?? "inconnu").toUpperCase().padEnd(8) : "non déf.";
    console.log(`  ${label} ${f.replace(root, ".")} -> ${line ? hostOf(line[2]) : "-"}`);
  }
  process.exit(0);
}

function setToggleLine(line, wanted) {
  const m = URL_RE.exec(line);
  if (!m) return line;
  const kind = kindOf(m[2]);
  if (kind === null) return line; // variante inconnue : laisser intacte
  if (kind === wanted) return line.replace(/^(\s*)#\s*(DATABASE_URL=)/, "$1$2");
  return line.replace(/^(\s*)(DATABASE_URL=)/, "$1# $2");
}

const toggles = TOGGLE_FILES.map((file) => {
  const before = readFileSync(file, "utf8");
  const after = before.split("\n").map((l) => setToggleLine(l, mode)).join("\n");
  writeFileSync(file, after);
  const activeUrl = after.split("\n").map((l) => URL_RE.exec(l)).filter(Boolean).find((m) => !m[1].includes("#"));
  return { file, url: activeUrl ? activeUrl[2] : null };
});

const rootEnv = readFileSync(TOGGLE_FILES[0], "utf8");
const target = rootEnv.split("\n").map((l) => URL_RE.exec(l)).filter(Boolean).find((m) => kindOf(m[2]) === mode);
if (!target) {
  console.error(`Introuvable: variante "${mode}" dans ${TOGGLE_FILES[0]}`);
  process.exit(1);
}

// On ne touche QUE la ligne DATABASE_URL : le reste du fichier (AUTH_SECRET,
// app, supabase…) est conservé — l'ancienne version réécrivait tout le fichier.
// Toutes les variantes sont reconduites au bon état (active / commentée) pour
// éviter deux lignes actives après un aller-retour local <-> neon.
const singleLines = readFileSync(SINGLE_FILE, "utf8").split("\n");
let replaced = false;
const single = singleLines
  .map((l) => {
    const m = URL_RE.exec(l);
    if (!m) return l;
    replaced = true;
    return kindOf(m[2]) === mode
      ? `DATABASE_URL="${m[2]}"`
      : `# DATABASE_URL="${m[2]}"`;
  })
  .filter((l) => l !== null);
if (!replaced) single.push(`DATABASE_URL="${target[2]}"`);
writeFileSync(SINGLE_FILE, single.join("\n"));

console.log(`Bascule DB -> ${mode.toUpperCase()} (${hostOf(target[2])})`);
for (const t of toggles) {
  const active = t.url ? kindOf(t.url) === mode : false;
  console.log(`  ${active ? "OK " : "!! "} ${t.file.replace(root, ".")} -> ${t.url ? hostOf(t.url) : "aucune"}`);
}
console.log(`  OK  ${SINGLE_FILE.replace(root, ".")} -> ${hostOf(target[2])}`);
console.log("Note : les scripts seeds/reset/migrations bloquent sur une cible non-locale (FORCE=1 pour forcer).");
