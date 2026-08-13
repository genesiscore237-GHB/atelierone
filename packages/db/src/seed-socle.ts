import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import { ensureSecuritySocle } from "./security-socle";

requireLocalOrForced("db:socle (seed-socle.ts)");

(async () => {
  console.log("=== SOCLE SECURITE (roles + permissions) ===");
  const res = await ensureSecuritySocle(db);
  console.log(`Roles crees: ${res.rolesCrees} (total socle: ${res.roles.length})`);
  console.log(`Permissions creees: ${res.permissionsCrees} (total socle: ${res.permissions.length})`);
  console.log(`Associations role-permission creees: ${res.associationsCrees}`);
  console.log("Aucun utilisateur cree. Le premier compte admin se cree via la page /setup.");
  console.log("OK");
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});