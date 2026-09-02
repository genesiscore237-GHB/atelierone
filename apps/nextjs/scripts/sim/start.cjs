/**
 * DÉMARRAGE DE LA SIMULATION SAAS LOCALE (4 instances) :
 *   localhost:3000 → Garage A (GPJ-001) — base atelierone_erp (données actuelles)
 *   localhost:3002 → Garage B (GPJ-002) — base atelierone_erp_b
 *   localhost:3003 → Garage C (GPJ-003) — base atelierone_erp_c
 *   localhost:3001 → SERVEUR CENTRAL (portail + licences + sync + dashboard parent)
 *
 * Usage : node scripts/sim/start.cjs [--garages] [--central] [--no-open]
 */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

const root = path.resolve(__dirname, "../../../.."); // apps/nextjs
dotenv.config({ path: path.join(root, "apps/nextjs/.env") });

const PGHOST = process.env.PGHOST ?? "127.0.0.1";
const PGPORT = process.env.PGPORT ?? "5432";
const PGUSER = process.env.PGUSER ?? "postgres";
const PGPASSWORD = process.env.PGPASSWORD ?? "postgres";
const SECRET = process.env.SIM_LICENCE_SECRET ?? "sim-secret-atelierone-2026";
const dsn = (db) => `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${db}`;

const CENTRAL = "http://localhost:3001";
const AUTH_SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "sim-auth-secret-dev";

const instances = [
  {
    name: "GARAGE-A",
    port: 3000,
    db: "atelierone_erp",
    siteCode: "GPJ-001",
    cleApi: process.env.SIM_CLE_A ?? "cle-GPJ-001-simulation",
    role: undefined,
    open: true,
  },
  {
    name: "GARAGE-B",
    port: 3002,
    db: "atelierone_erp_b",
    siteCode: "GPJ-002",
    cleApi: "cle-GPJ-002-simulation",
    open: false,
  },
  {
    name: "GARAGE-C",
    port: 3003,
    db: "atelierone_erp_c",
    siteCode: "GPJ-003",
    cleApi: "cle-GPJ-003-simulation",
    open: false,
  },
  {
    name: "CENTRAL",
    port: 3001,
    db: "atelierone_central",
    siteCode: "CENTRAL",
    cleApi: undefined,
    role: "central",
    open: true,
  },
];

const procs = [];
let stopping = false;

function makeEnv(inst) {
  return {
    ...process.env,
    DATABASE_URL: dsn(inst.db),
    APP_ROLE: inst.role ?? "garage",
    PORT: String(inst.port),
    NEXT_DIST_DIR: `.next-sim-${inst.port}`,
    LICENCE_SECRET: SECRET,
    LICENCE_MODE: inst.role === "central" ? "off" : "on",
    CENTRAL_URL: CENTRAL,
    SITE_CODE: inst.siteCode,
    SITE_CLE_API: inst.cleApi ?? "",
    AUTH_SECRET,
    NEXTAUTH_SECRET: AUTH_SECRET,
  };
}

function log(name, chunk) {
  const lines = String(chunk).trim().split("\n");
  for (const l of lines) {
    if (l.trim()) console.log(`[${name}] ${l.slice(0, 300)}`);
  }
}

console.log("=== SIMULATION SAAS ATELIERONE ===");
console.log(`Secret licence : ${SECRET}`);
console.log("Instances :");
for (const i of instances) console.log(`  ${i.port} → ${i.name} (${i.db})${i.role ? " [CENTRAL]" : ""}`);

for (const inst of instances) {
  const env = makeEnv(inst);
  // Build prod par instance (fini le dev : 4 compilateurs à la volée qui saturent la machine)
  const dist = `.next-sim-${inst.port}`;
  const build = spawn("pnpm", ["-F", "@atelierone/nextjs", "exec", "next", "build"], { cwd: root, env, shell: true });
  build.stdout.on("data", (d) => log(inst.name + " BUILD", d));
  build.stderr.on("data", (d) => log(inst.name + " BUILD ERR", d));
  const p = spawn("pnpm", ["-F", "@atelierone/nextjs", "exec", "next", "start", "-p", String(inst.port)], {
    cwd: root,
    env,
    shell: true,
  });
  p.stdout.on("data", (d) => log(inst.name, d));
  p.stderr.on("data", (d) => log(inst.name + " ERR", d));
  p.on("exit", (code) => {
    if (!stopping) console.log(`[${inst.name}] arrêté (code ${code})`);
  });
  procs.push(p);
}

process.on("SIGINT", () => {
  stopping = true;
  console.log("\nArrêt de la simulation…");
  for (const p of procs) p.kill("SIGTERM");
  process.exit(0);
});

console.log("\nLancement en cours… (compilation initiale ~1-2 min)");
console.log("  Portail central : http://localhost:3001 (dashboard : /dashboard/saas)");
console.log("  Garage A : http://localhost:3000   Garage B : 3002   Garage C : 3003");
console.log("Ctrl+C pour tout arrêter.\n");