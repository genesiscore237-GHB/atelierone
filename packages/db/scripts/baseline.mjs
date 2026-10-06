#!/usr/bin/env node
/**
 * Baseline drizzle : marque les migrations du journal comme DÉJÀ APPLIQUÉES
 * sans les exécuter.
 *
 * Cas d'usage : `drizzle-kit generate` a été lancé sur une base pré-existante
 * (créée avant l'existence du dossier drizzle/). La 0000 contient l'intégralité
 * du schéma (225 tables) : l'exécuter sur une base qui les a déjà échouerait.
 * Le moteur drizzle compare `created_at` (=> `when` du journal) à la dernière
 * ligne de drizzle.__drizzle_migrations : insérer `when` suffit à skipper.
 *
 * Verrou : base locale uniquement (FORCE=1 pour consentir sur une base distante),
 * et refuse si le schéma public est vide (→ utiliser `db:migrate` à la place).
 *
 * Usage : node scripts/baseline.mjs [--dry-run]
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { PKG_ROOT, assertLocalOrForced, hostOf } from "./dburl.mjs";

const dryRun = process.argv.includes("--dry-run");
const url = assertLocalOrForced("baseline");

const journalPath = resolve(PKG_ROOT, "drizzle", "meta", "_journal.json");
const journal = JSON.parse(readFileSync(journalPath, "utf8"));
if (!journal.entries?.length) {
  console.error("[baseline] Aucune entrée dans drizzle/meta/_journal.json");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  await sql`create schema if not exists drizzle`;
  await sql`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `;

  const existing = await sql`
    select coalesce(max(created_at), 0)::bigint as last from drizzle.__drizzle_migrations
  `;
  const lastApplied = Number(existing[0].last);

  const tables = await sql`
    select count(*)::int as n from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `;
  if (tables[0].n === 0) {
    console.error("[baseline] REFUS — schéma public vide : rien à baseline.");
    console.error("  Créez d'abord le schéma : pnpm db:migrate");
    process.exit(1);
  }

  let pending = 0;
  for (const entry of journal.entries) {
    if (Number(entry.when) <= lastApplied) continue; // déjà appliquée
    pending++;
    const file = resolve(PKG_ROOT, "drizzle", `${entry.tag}.sql`);
    const content = readFileSync(file, "utf8");
    const hash = createHash("sha256").update(content).digest("hex");

    if (dryRun) {
      console.log(`[baseline] (dry-run) marquerait idx=${entry.idx} tag=${entry.tag} when=${entry.when} hash=${hash.slice(0, 12)}…`);
      continue;
    }
    await sql`
      insert into drizzle.__drizzle_migrations (hash, created_at)
      values (${hash}, ${Number(entry.when)})
    `;
    console.log(`[baseline] idx=${entry.idx} « ${entry.tag} » marquée comme appliquée (hash ${hash.slice(0, 12)}…).`);
  }

  if (pending === 0) {
    console.log(`[baseline] Rien à faire : les ${journal.entries.length} migration(s) du journal sont déjà appliquées.`);
  } else if (!dryRun) {
    console.log(`[baseline] OK — ${pending} migration(s) baselined sur ${hostOf(url)} (${tables[0].n} tables présentes).`);
    console.log(`[baseline] Les prochaines modifications passent par : pnpm -F @atelierone/db generate`);
  }
} catch (err) {
  console.error("[baseline] ÉCHEC :", err.message);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
