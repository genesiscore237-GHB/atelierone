/**
 * warmup.mjs — pré-compile les routes principales après le démarrage du dev server.
 *
 * Problème : `next dev` compile chaque route paresseusement (10-30 s par route
 * sur un poste modeste). Le premier clic sur une page non encore visitée est
 * donc très lent. Ce script « chauffe » les routes les plus utilisées dès que
 * le serveur est prêt, pour que la navigation de l'utilisateur soit immédiate.
 *
 * Il s'authentifie d'abord (credentials NextAuth) pour que les routes du
 * dashboard se compilent réellement (sans session, le middleware répond 302
 * vers /login et la compilation n'est jamais déclenchée).
 *
 * Usage :  node scripts/warmup.mjs [port] [baseUrl]
 * Env   :  ADMIN_EMAIL / ADMIN_PASSWORD (défaut : admin@gpj.cm / admin123)
 */
const PORT = Number(process.argv[2] ?? 3000);
const BASE = process.argv[3] ?? `http://localhost:${PORT}`;
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@gpj.cm";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";

const ROUTES = [
  "/dashboard",
  "/dashboard/ordres-reparation",
  "/dashboard/ordres-reparation/5",
  "/dashboard/atelier",
  "/dashboard/atelier/parc",
  "/dashboard/atelier/performance",
  "/dashboard/atelier/interventions",
  "/dashboard/stock",
  "/dashboard/stock/mouvements",
  "/dashboard/customers",
  "/dashboard/vehicules",
  "/dashboard/rh",
  "/dashboard/cash",
  "/dashboard/catalog",
  "/dashboard/pos",
  "/dashboard/settings",
  "/dashboard/finance",
  "/dashboard/administration",
  "/dashboard/garage",
  "/dashboard/garage/vehicules",
  "/dashboard/garage/vehicules/1",
  "/dashboard/garage/carte",
  "/dashboard/garage/alertes",
  "/dashboard/garage/configuration",
  // Endpoint binaire des photos (toute réponse compile la route, même un 404).
  "/api/parking/photo/1/0?w=160",
];

/** Petit gestionnaire de cookies (jar) compatible Node 18+. */
const jar = [];
function cookieHeader() {
  return jar.join("; ");
}
function captureCookies(resp) {
  const setCookies = typeof resp.headers.getSetCookie === "function"
    ? resp.headers.getSetCookie()
    : [];
  for (const sc of setCookies) {
    const name = sc.split("=")[0];
    const value = sc.split(";")[0];
    const idx = jar.findIndex((e) => e.startsWith(name + "="));
    if (idx >= 0) jar[idx] = value;
    else jar.push(value);
  }
}

function fetchWithTimeout(url, opts = {}, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    fetch(url, { ...opts, signal: ctrl.signal, redirect: "manual" })
      .then((r) => {
        clearTimeout(t);
        resolve(r);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

async function login() {
  console.log(`→ Authentification (${EMAIL})...`);
  const csrfResp = await fetchWithTimeout(BASE + "/api/auth/csrf", {}, 30_000);
  captureCookies(csrfResp);
  const { csrfToken } = await csrfResp.json();
  if (!csrfToken) throw new Error("csrfToken introuvable");

  const body = new URLSearchParams({
    csrfToken,
    email: EMAIL,
    password: PASSWORD,
    totp: "",
    redirect: "false",
  });
  const cb = await fetchWithTimeout(
    BASE + "/api/auth/callback/credentials",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: cookieHeader(),
      },
      body: body.toString(),
    },
    30_000
  );
  captureCookies(cb);
  const authed = jar.some((c) => c.startsWith("next-auth.session-token=") || c.startsWith("authjs.session-token="));
  if (!authed) {
    console.error("✗ Échec de connexion (status " + cb.status + ") — warm-up sans session.");
    return false;
  }
  console.log("→ Connecté.");
  return true;
}

async function warmTrpc(authed) {
  // Compile la route catch-all /api/trpc et les requêtes globales (licence,
  // sync, utilisateur) jouées à chaque navigation, pour que le 1er clic ne
  // paie pas la compilation tRPC.
  const queries = ["user.getMe", "licence.etat", "sync.etat", "garage.overview"];
  const t0 = Date.now();
  try {
    const r = await fetchWithTimeout(
      `${BASE}/api/trpc/${queries.join(",")}`,
      { headers: authed ? { cookie: cookieHeader() } : {} },
      60_000,
    );
    console.log(`  [trpc] ${queries.join(",")} -> ${r.status} (${Date.now() - t0} ms)`);
  } catch (e) {
    console.log(`  [trpc] ${queries.join(",")} -> ERR ${e.name} (${Date.now() - t0} ms)`);
  }
}

async function main() {
  const authed = await login();
  await warmTrpc(authed);

  console.log(`→ Warm-up de ${ROUTES.length} routes sur ${BASE}...`);
  for (let i = 0; i < ROUTES.length; i++) {
    const route = ROUTES[i];
    const t0 = Date.now();
    try {
      const r = await fetchWithTimeout(BASE + route, {
        headers: authed ? { cookie: cookieHeader() } : {},
      });
      const ms = Date.now() - t0;
      const status = r.status === 0 ? "redirect" : r.status;
      console.log(`  [${i + 1}/${ROUTES.length}] ${route} -> ${status} (${ms} ms)`);
    } catch (e) {
      const ms = Date.now() - t0;
      console.log(`  [${i + 1}/${ROUTES.length}] ${route} -> ERR ${e.name} (${ms} ms)`);
    }
  }
  console.log("→ Warm-up terminé.");
}

main();