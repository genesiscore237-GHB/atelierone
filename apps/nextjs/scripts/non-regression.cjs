/**
 * NON-RÉGRESSION — AtelierOne
 * Vérifie que les fondations (login, navigation, hubs, module RH) restent
 * fonctionnelles avant/après chaque itération.
 *
 * Usage :
 *   node scripts/non-regression.cjs
 * Variables d'env (optionnelles) :
 *   AO_BASE_URL  (défaut http://localhost:3000)
 *   AO_EMAIL     (défaut admin@gpj.cm)
 *   AO_PASSWORD  (défaut admin123)
 */
const { chromium } = require("playwright");

const BASE = process.env.AO_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.AO_EMAIL || "admin@gpj.cm";
const PASSWORD = process.env.AO_PASSWORD || "admin123";
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Login via flux NextAuth (CSRF) — robuste, identique à curl ──
const jar = new Map();
async function httpWithJar(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookieHeader) headers.cookie = cookieHeader;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers, redirect: "manual" });
  const setCookies = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie")].filter(Boolean);
  for (const sc of setCookies) {
    const pair = sc.split(";")[0];
    const idx = pair.indexOf("=");
    if (idx > 0 && !pair.startsWith("=")) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1));
  }
  return res;
}

async function sessionToken() {
  const csrfRes = await httpWithJar("/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const res = await httpWithJar("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      email: EMAIL,
      password: PASSWORD,
      callbackUrl: `${BASE}/dashboard`,
    }),
  });
  if (res.status !== 302 || !res.headers.get("location")?.includes("/dashboard")) {
    throw new Error(`Login refusé (${res.status})`);
  }
  const token = jar.get("authjs.session-token");
  if (!token) throw new Error("Session token manquant");
  return token;
}

/** Attend qu'un locator atteigne `min` (min=0 → attend la disparition). */
async function waitCount(locator, min = 1, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const count = await locator.count();
      if (min === 0 ? count === 0 : count >= min) return;
    } catch (e) {}
    await sleep(500);
  }
}

async function check(page, label, locator, expected = 1, inverse = false) {
  const count = await locator.count();
  const ok = inverse ? count === expected : count >= expected;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label} (trouvé: ${count}, attendu: ${expected})`);
  if (!ok) process.exitCode = 1;
  return ok;
}

(async () => {
  console.log(`Non-régression — ${BASE} (${EMAIL})`);
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);

  // 1. Login
  console.log("\n== 1. Authentification ==");
  const token = await sessionToken();
  const host = new URL(BASE).hostname;
  await ctx.addCookies([
    { name: "authjs.session-token", value: token, domain: host, path: "/", httpOnly: true },
  ]);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "commit" });
  await waitCount(page.locator("a[href='/dashboard/atelier']"));
  await check(page, "Accès bureau après login", page.locator("a[href='/dashboard/atelier']"));

  // 2. Bureau : 8 domaines, pas de sidebar
  console.log("\n== 2. Bureau ==");
  const domainSel =
    "a[href='/dashboard/administration'], a[href='/dashboard/rh'], a[href='/dashboard/clients'], a[href='/dashboard/atelier'], a[href='/dashboard/stock'], a[href='/dashboard/finance'], a[href='/dashboard/sites'], a[href='/dashboard/pilotage']";
  await waitCount(page.locator(domainSel), 8);
  await check(page, "8 domaines au bureau", page.locator(domainSel), 8);
  await check(page, "Pas de sidebar sur le bureau", page.locator("aside"), 0, true);

  // 3. Hub RH : sidebar + domaines hydratés
  console.log("\n== 3. Module RH ==");
  await page.goto(`${BASE}/dashboard/rh`, { waitUntil: "commit" });
  await waitCount(page.locator("aside button:has-text('Personnel (RH)')"));
  await check(page, "Sidebar pilotage visible", page.locator("aside:has-text('Domaines de gestion')"));
  await check(page, "Bouton domaine RH dans sidebar", page.locator("aside button:has-text('Personnel (RH)')"));
  await check(page, "Hub RH : lignes de modules", page.locator("ul.divide-y li"));

  // 4. Sous-page RH : breadcrumb + tabs
  await page.goto(`${BASE}/dashboard/rh/employes`, { waitUntil: "commit" });
  await waitCount(page.locator("nav[aria-label^='Fil']"));
  await check(page, "Breadcrumb RH", page.locator("nav[aria-label^='Fil']"));
  await check(page, "Onglet employés", page.locator("a[href='/dashboard/rh/employes']"));

  // 5. Governance : sous-onglets
  console.log("\n== 4. Utilisateurs & Rôles ==");
  await page.goto(`${BASE}/dashboard/governance`, { waitUntil: "commit" });
  await waitCount(page.locator("a[href='/dashboard/governance/roles']"));
  await check(page, "Sous-onglet Rôles", page.locator("a[href='/dashboard/governance/roles']"));
  await check(page, "Sous-onglet Matrice", page.locator("a[href='/dashboard/governance/matrix']"));
  await check(page, "Sous-onglet Connexions", page.locator("a[href='/dashboard/governance/audit']"));

  // 6. Pilotage : le même menu
  console.log("\n== 5. Pilotage ==");
  await page.goto(`${BASE}/dashboard/pilotage`, { waitUntil: "commit" });
  await waitCount(page.locator("h2:has-text('Tous les domaines')"));
  await check(page, "Section Tous les domaines", page.locator("h2:has-text('Tous les domaines')"));
  await check(page, "Section Direction", page.locator("h2:has-text('Pilotage Direction')"));

  // 7. Toggle sidebar
  console.log("\n== 6. Toggle navigation ==");
  await page.goto(`${BASE}/dashboard/rh`, { waitUntil: "commit" });
  // Attendre l'hydratation (boutons de domaine = rendus uniquement après getMe)
  await waitCount(page.locator("aside button:has-text('Personnel (RH)')"));
  await waitCount(page.locator("button[aria-label='Masquer la navigation']"));
  await page.locator("button[aria-label='Masquer la navigation']").click();
  await waitCount(page.locator("aside:has-text('Domaines de gestion')"), 0);
  await check(page, "Sidebar masquée", page.locator("aside:has-text('Domaines de gestion')"), 0, true);
  await check(page, "Bouton réouverture", page.locator("button[aria-label='Afficher la navigation']"));
  await page.locator("button[aria-label='Afficher la navigation']").click();
  await waitCount(page.locator("aside:has-text('Domaines de gestion')"), 1);
  await check(page, "Sidebar réaffichée", page.locator("aside:has-text('Domaines de gestion')"));

  // 8. Mobile
  console.log("\n== 7. Mobile ==");
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mobile.newPage();
  mp.setDefaultTimeout(90000);
  const cookies = await ctx.cookies();
  await mobile.addCookies(cookies);
  await mp.goto(`${BASE}/dashboard/rh`, { waitUntil: "commit" });
  await waitCount(mp.locator("button[aria-label='Ouvrir le menu']"));
  await check(mp, "Bouton menu mobile", mp.locator("button[aria-label='Ouvrir le menu']"));
  await mp.locator("button[aria-label='Ouvrir le menu']").click();
  await waitCount(mp.locator("aside:has-text('Domaines de gestion')"), 1);
  await check(mp, "Drawer mobile", mp.locator("aside:has-text('Domaines de gestion')"));
  await waitCount(mp.locator("nav[aria-label='Navigation mobile'] a"), 5);
  await check(mp, "Bottom nav (5 items)", mp.locator("nav[aria-label='Navigation mobile'] a"), 5);
  await mobile.close();

  console.log("\nRésultat:", process.exitCode ? "ÉCHEC (voir FAIL ci-dessus)" : "TOUT EST VERT ✔");
  await browser.close();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
