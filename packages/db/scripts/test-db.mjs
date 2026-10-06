#!/usr/bin/env node
/**
 * Prépare la base de tests d'intégration (atelierone_erp_test).
 *
 * Étapes :
 *   1. crée la base si absente ;
 *   2. vide les schémas public + drizzle (reset) ;
 *   3. applique le schéma via `drizzle-kit migrate` (baseline 0000 = 225 tables).
 *
 * Verrous : base LOCALE uniquement, nom obligatoirement suffixé `_test`
 * (défense en profondeur contre une exécution accidentelle sur la prod).
 *
 * Usage : node scripts/test-db.mjs [--keep] [--quiet] [--no-socle]
 *   --keep     : pas de reset (conserve le contenu existant)
 *   --quiet    : log réduit (CI)
 *   --no-socle : saute le socle (rôles/permissions + 2 agences)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { PKG_ROOT, findBin, hostOf } from "./dburl.mjs";

const TEST_URL =
  process.env.DATABASE_URL_TEST ??
  "postgres://postgres:postgres@localhost:5432/atelierone_erp_test";

const keep = process.argv.includes("--keep");
const quiet = process.argv.includes("--quiet");
const noSocle = process.argv.includes("--no-socle");

const log = (...a) => { if (!quiet) console.log("[test-db]", ...a); };

// ── verrous ────────────────────────────────────────────────────────────
if (!/@(localhost|127\.0\.0\.1):/.test(TEST_URL)) {
  console.error(`[test-db] REFUS — la base de test doit être locale. Cible : ${hostOf(TEST_URL)}`);
  process.exit(1);
}
let testDb = "";
try { testDb = new URL(TEST_URL).pathname.slice(1); } catch { /* géré ci-dessous */ }
if (!testDb) {
  console.error(`[test-db] REFUS — URL de test illisible.`);
  process.exit(1);
}
if (!testDb.endsWith("_test")) {
  console.error(`[test-db] REFUS — le nom « ${testDb} » ne se termine pas par _test.`);
  console.error(`  Toute base de test doit porter ce suffixe pour éviter toute collision avec la prod.`);
  process.exit(1);
}

// URL d'administration : même serveur, base « postgres ».
const adminUrl = TEST_URL.replace(/\/[^/?]+(\?|$)/, "/postgres$1");
const admin = postgres(adminUrl, { max: 1 });

try {
  // 1. création
  const exists = await admin`select 1 from pg_database where datname = ${testDb}`;
  if (!exists.length) {
    await admin.unsafe(`create database "${testDb}"`);
    log(`base « ${testDb} » créée.`);
  }

  // 2. reset
  if (!keep) {
    const t = postgres(TEST_URL, { max: 1, onnotice: quiet ? () => {} : undefined });
    await t.unsafe(`drop schema if exists public cascade`);
    await t.unsafe(`drop schema if exists drizzle cascade`);
    await t.unsafe(`create schema public`);
    await t.end({ timeout: 5 });
    log(`schémas public + drizzle purgés.`);
  }

  // 3. schéma via drizzle-kit migrate (garde-fou intégré, base locale → autorisé)
  const guard = resolve(PKG_ROOT, "scripts", "drizzle-guard.mjs");
  const res = spawnSync(process.execPath, [guard, "migrate"], {
    stdio: quiet ? "pipe" : "inherit",
    cwd: PKG_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_URL },
    encoding: "utf8",
  });
  if (res.status !== 0) {
    if (quiet) {
      console.error("[test-db] migrate échoué :", res.stdout ?? "", res.stderr ?? "");
    }
    console.error(`[test-db] ÉCHEC — drizzle-kit migrate exit ${res.status}`);
    process.exit(res.status ?? 1);
  }

  // 3b. objets SQL hors schéma TS : fonctions tenant (set_current_agence_id…),
  //     triggers d'audit, vues de lecture, RLS, séquences barcode.
  //     Idempotent (voir GUIDE-DEPLOIEMENT) — sans eux, tout test passant par
  //     trpc.ts rate : « Failed to set tenant context ».
  //     Exécuté via postgres-js (pas psql) : le runner CI n'a pas de client PG.
  const extras = resolve(PKG_ROOT, "src", "schema-extras.sql");
  const tExtras = postgres(TEST_URL, { max: 1, onnotice: quiet ? () => {} : undefined });
  try {
    await tExtras.unsafe(readFileSync(extras, "utf8"));
  } catch (err) {
    console.error("[test-db] ÉCHEC — application de schema-extras.sql :");
    console.error(err.message);
    process.exit(1);
  } finally {
    await tExtras.end({ timeout: 5 });
  }
  log("schema-extras.sql appliqué (fonctions tenant, triggers, vues, RLS).");

  // 4. socle applicatif minimal — les fixtures de tests (RPT-05) et la plupart
  //    des routers supposent un référentiel de base : permissions/rôles, et au
  //    moins deux agences (bornes du scoping tenant). Sans elles, chaque test
  //    échoue à l'installation de ses propres fixtures.
  if (!noSocle) {
    const tsx = findBin("tsx");
    if (!tsx) {
      console.error("[test-db] ÉCHEC — binaire tsx introuvable (seed-socle).");
      process.exit(1);
    }
    const rSocle = spawnSync(
      process.execPath,
      [tsx, resolve(PKG_ROOT, "src", "seed-socle.ts")],
      {
        cwd: PKG_ROOT,
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: TEST_URL, FORCE: undefined },
        stdio: quiet ? "pipe" : "inherit",
      },
    );
    if (rSocle.status !== 0) {
      console.error("[test-db] ÉCHEC — seed-socle :");
      console.error(`${rSocle.stdout ?? ""}\n${rSocle.stderr ?? ""}`);
      process.exit(rSocle.status ?? 1);
    }
    log("socle sécurité synchronisé (rôles + permissions).");

    const tSocle = postgres(TEST_URL, { max: 1 });
    await tSocle.unsafe(`
      insert into agences (id, nom, code)
      values (1, 'Agence centrale', 'AG001'),
             (2, 'Agence secondaire', 'AG002')
      on conflict do nothing
    `);
    await tSocle.unsafe(
      `select setval('agences_id_seq', greatest((select max(id) from agences), 1))`,
    );
    // Employé témoin agence 1 : requis par rbac-fixtures-rpt05 (cloisonnement
    // inter-agence). Pas de `salaire_base` : RPT-05 interdit d'inventer des
    // données salariales — colonne nullable.
    await tSocle.unsafe(`
      insert into employes (matricule, nom, prenom, fonction, type_employe, statut, agence_id)
      values ('SOCLE-001', 'SOCLE', 'Temooin', 'Temooin de cloisonnement',
              'permanent', 'actif', 1)
      on conflict do nothing
    `);
    const agences = await tSocle`select count(*)::int as n from agences`;
    const temoins = await tSocle`
      select count(*)::int as n from employes where agence_id = 1 and statut = 'actif'`;
    await tSocle.end({ timeout: 5 });
    if (agences[0].n < 2 || temoins[0].n < 1) {
      console.error(
        `[test-db] ÉCHEC — socle incomplet : ${agences[0].n} agence(s), ${temoins[0].n} employé(s) témoin.`
      );
      process.exit(1);
    }
    log(`socle métier : ${agences[0].n} agences, employé témoin présent.`);
  }

  // 4b. Seed parking : véhicules de démo pour tests (export, liste, fiche, carte)
  if (!noSocle) {
    const tsx = findBin("tsx");
    if (!tsx) {
      console.error("[test-db] ÉCHEC — binaire tsx introuvable (seed-garage).");
      process.exit(1);
    }
    const rGarage = spawnSync(
      process.execPath,
      [tsx, resolve(PKG_ROOT, "src", "seed-garage.ts"), "--vehicules"],
      {
        cwd: PKG_ROOT,
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: TEST_URL, FORCE: undefined },
        stdio: quiet ? "pipe" : "inherit",
      },
    );
    if (rGarage.status !== 0) {
      console.error("[test-db] ÉCHEC — seed-garage :");
      console.error(`${rGarage.stdout ?? ""}\n${rGarage.stderr ?? ""}`);
      process.exit(rGarage.status ?? 1);
    }
    log("parking : véhicules démo insérés (mode --vehicules).");
  }

  // 5. vérification
  const t = postgres(TEST_URL, { max: 1 });
  const n = await t`select count(*)::int as n from information_schema.tables
                    where table_schema = 'public' and table_type = 'BASE TABLE'`;
  await t.end({ timeout: 5 });
  log(`OK — ${n[0].n} tables prêtes dans « ${testDb} ».`);
  if (n[0].n < 200) {
    console.error(`[test-db] ERREUR — seulement ${n[0].n} tables (225 attendues).`);
    process.exit(1);
  }
} catch (err) {
  console.error("[test-db] ÉCHEC :", err.message);
  process.exit(1);
} finally {
  await admin.end({ timeout: 5 });
}
