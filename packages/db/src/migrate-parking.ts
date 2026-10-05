import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

requireLocalOrForced("parking / garage (migrate-parking.ts)");

/**
 * CRÉATION DU MODULE PARKING (GPJ) sur une base EXISTANTE — additive, idempotente.
 * Tables : parking_sites, parking_zones, parking_spots, parking_vehicles,
 *          parking_movements, parking_alerts, parking_tasks, parking_configs,
 *          parking_vehicle_photos + vue parking_spots_v.
 * Sans PostGIS : colonnes geometry()/footprint et EXCLUDE GiST gérés côté app.
 */
(async () => {
  const raw = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  const sql = fs.readFileSync(path.resolve(__dirname, "schema-parking.sql"), "utf-8");
  console.log("=== MODULE PARKING (GPJ) — création additive ===");
  await raw.unsafe(sql);
  console.log("Schéma parking : OK (9 tables + vue parking_spots_v).");
  await raw.end();
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});