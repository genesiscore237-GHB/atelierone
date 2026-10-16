const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const ROOT = path.resolve(__dirname, "..", "..");
const env = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
const neon = env
  .split("\n")
  .map((l) => /^\s*#?\s*DATABASE_URL="([^"]+)"/.exec(l))
  .find((m) => m && m[1].includes(".neon.tech"));

if (!neon) {
  console.log("  aucune variante Neon dans .env");
  process.exit(0);
}
console.log("  production :", neon[1].replace(/:[^:@/]+@/, ":***@"));

const { sslPourUrl } = require("./src/env-guard.ts");