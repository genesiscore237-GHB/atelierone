const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const jar = new Map();
async function httpWithJar(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookieHeader) headers.cookie = cookieHeader;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers, redirect: "manual" });
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  for (const sc of setCookies) {
    const pair = sc.split(";")[0];
    const idx = pair.indexOf("=");
    if (idx > 0 && !pair.startsWith("=")) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1));
  }
  return res;
}
(async () => {
  const csrfRes = await httpWithJar("/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  await httpWithJar("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: `${BASE}/dashboard` }),
  });
  const cookies = [...jar.entries()].map(([k, v]) => ({ name: k, value: v, domain: new URL(BASE).hostname, path: "/" }));
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  const errors = [];
  page.on("pageerror", (err) => errors.push("PAGEERROR: " + err.message.slice(0, 250)));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push("CONSOLE: " + msg.text().slice(0, 250)); });

  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 60000 });
  // Attendre l'apparition de la carte Performance (avec timeout de secours)
  try {
    await page.waitForSelector("text=Performance & Qualité", { timeout: 20000 });
  } catch (e) { console.log("waitFor Performance: TIMEOUT"); }
  await page.waitForTimeout(3000);

  const cards = await page.locator('a[href^="/dashboard/"]').count();
  console.log("Total cartes:", cards);
  for (const label of ["Performance & Qualité", "Véhicules & Atelier", "Stock & Approvisionnement", "Clients & Contrats", "Finance", "Personnel (RH)", "Socle & Administration"]) {
    console.log(label + ":", await page.locator("text=" + label).count() > 0 ? "OUI ✓" : "NON ✗");
  }
  console.log("Lien href=/dashboard/atelier/performance:", await page.locator('a[href="/dashboard/atelier/performance"]').count() > 0 ? "OUI ✓" : "NON ✗");
  if (errors.length) console.log("ERREURS JS:", errors.slice(0, 5));
  await browser.close();
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });