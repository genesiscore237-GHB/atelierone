#!/usr/bin/env node
/**
 * DIAGNOSTIC LOGIN — vérifie pourquoi un identifiant ne passe pas.
 *
 * Usage :
 *   node scripts/check-login.mjs db "<DATABASE_URL>" [email] [password]
 *       → vérifie le compte + le hash bcrypt directement sur la base cible
 *   node scripts/check-login.mjs http "<URL_APP>" [email] [password]
 *       → teste le login HTTP de bout en bout (CSRF + credentials + session)
 *
 * Exemples :
 *   node scripts/check-login.mjs db  "postgresql://...supabase..." admin@atelierone.cm admin123
 *   node scripts/check-login.mjs http "https://mon-app.vercel.app" admin@atelierone.cm admin123
 */
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [mode, target, email = "admin@atelierone.cm", password = "admin123"] = process.argv.slice(2);

if (!mode || !target) {
  console.log("Usage: node scripts/check-login.mjs [db|http] <cible> [email] [password]");
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), "check-login-"));
// Le script temporaire doit vivre sous packages/db pour résoudre le module
// `postgres` (sinon ERR_MODULE_NOT_FOUND depuis %TEMP%).
const tmpDb = resolve(ROOT, "packages/db", `check-login-${Date.now()}.mjs`);
const run = (file) => {
  const out = execFileSync(process.execPath, [file], { cwd: resolve(ROOT, "packages/db"), encoding: "utf8" });
  console.log(out.trim());
};

if (mode === "db") {
  const script = `
import postgres from "postgres";
import bcrypt from "bcryptjs";
const sql = postgres(${JSON.stringify(target)}, { ssl: ${/localhost|127\.0\.0\.1/.test(target) ? "false" : "{ rejectUnauthorized: false }"}, prepare: false });
const [u] = await sql\`SELECT id, email, is_active, status, agence_id, mot_de_passe FROM utilisateurs WHERE email = ${"${" + JSON.stringify(email) + "}"} LIMIT 1\`;
if (!u) { console.log("✗ COMPTE INTROUVABLE sur cette base :", ${JSON.stringify(email)}); process.exit(1); }
console.log("✓ Compte trouvé :", u.id, u.email, "| actif:", u.is_active, "| statut:", u.status, "| agence:", u.agence_id);
const ok = await bcrypt.compare(${JSON.stringify(password)}, u.mot_de_passe);
console.log(ok ? "✓ MOT DE PASSE VALIDE (bcrypt)" : "✗ MOT DE PASSE INCORRECT");
const role = await sql\`SELECT r.code FROM roles r JOIN utilisateurs u ON u.role_id = r.id WHERE u.id = \${u.id}\`;
console.log("  Rôle :", role[0]?.code ?? "aucun");
await sql.end();
`;
  const f = tmpDb;
  writeFileSync(f, script);
  run(f);
  try { rmSync(f, { force: true }); } catch {}
  rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
}

if (mode === "http") {
  const base = target.replace(/\/$/, "");
  const step = (label, cmd) => {
    try {
      const out = execFileSync("curl.exe", cmd, { encoding: "utf8" });
      console.log(`  ${label}: ${out.trim().slice(0, 200)}`);
      return out.trim();
    } catch (e) {
      console.log(`  ${label}: ERREUR ${e.message}`);
      return "";
    }
  };
  const jar = join(tmp, "cookies.txt");
  console.log(`Cible : ${base}`);
  const csrfRaw = step("CSRF", ["-s", "-c", jar, "-b", jar, `${base}/api/auth/csrf`]);
  const csrf = JSON.parse(csrfRaw || "{}").csrfToken;
  if (!csrf) { console.log("✗ Impossible d'obtenir le token CSRF — l'API auth ne répond pas (AUTH_SECRET manquant ? 500 ?)"); rmSync(tmp, { recursive: true, force: true }); process.exit(1); }
  const login = execFileSync("curl.exe", [
    "-s", "-c", jar, "-b", jar, "-i", "-X", "POST", `${base}/api/auth/callback/credentials`,
    "--data-urlencode", `csrfToken=${csrf}`,
    "--data-urlencode", `email=${email}`,
    "--data-urlencode", `password=${password}`,
  ], { encoding: "utf8" });
  const location = (login.match(/location: ([^\r\n]+)/i) ?? [])[1] ?? "";
  const hasError = /error=/.test(location);
  const hasSession = /authjs\.session-token/.test(login);
  console.log(`  Réponse : ${location || "(pas de redirection)"}`);
  if (!hasError && hasSession) {
    console.log("✓ LOGIN RÉUSSI (session créée)");
  } else if (hasError) {
    console.log(`✗ LOGIN REFUSÉ → ${location}`);
    console.log("  Causes possibles : compte absent/hash différent sur la base cible, rate limiter (5 essais/15 min), mot de passe incorrect.");
  } else {
    console.log("✗ Réponse inattendue (session non créée)");
  }
  const sess = execFileSync("curl.exe", ["-s", "-b", jar, `${base}/api/auth/session`], { encoding: "utf8" });
  console.log(`  Session : ${sess.trim().slice(0, 150) || "(vide)"}`);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
}

console.log("Mode inconnu :", mode);
process.exit(1);
