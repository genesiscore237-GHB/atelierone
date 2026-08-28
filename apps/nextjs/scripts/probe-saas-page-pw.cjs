const { chromium } = require("playwright");
const BASE = "http://localhost:3001";
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
  page.on("pageerror", (err) => errors.push("PAGEERROR: " + err.message.slice(0, 200)));

  await page.goto(`${BASE}/dashboard/saas`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(8000);
  const acces = await page.locator("text=Accès non autorisé").count();
  const central = await page.locator("text=Serveur central").count();
  const mrr = await page.locator("text=MRR").count();
  const garages = await page.locator("text=Garages clients").count();
  const revenu = await page.locator("text=Revenu mensuel").count();
  console.log("Accès non autorisé:", acces > 0 ? "NON ✗ (page bloquée !)" : "non ✓");
  console.log("Titre Serveur central:", central > 0 ? "OUI ✓" : "NON");
  console.log("MRR:", mrr > 0 ? "OUI ✓" : "NON");
  console.log("Garages clients:", garages > 0 ? "OUI ✓" : "NON");
  console.log("Revenu mensuel:", revenu > 0 ? "OUI ✓" : "NON");
  if (errors.length) console.log("ERREURS:", errors.slice(0, 3));
  await browser.close();
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });