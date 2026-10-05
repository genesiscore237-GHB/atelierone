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
  const token = jar.get("authjs.session-token");
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "authjs.session-token", value: token, domain: new URL(BASE).hostname, path: "/", httpOnly: true }]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (err) => errors.push("PAGEERROR: " + err.message.slice(0, 300)));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push("CONSOLE: " + msg.text().slice(0, 300)); });

  await page.goto(`${BASE}/dashboard/rh/documents`, { waitUntil: "commit" });
  await page.waitForTimeout(12000);
  console.log("skeleton (animate-pulse):", await page.locator(".animate-pulse").count());
  console.log("texte 'Erreur de chargement':", await page.locator("text=Erreur de chargement").count());
  console.log("texte 'Aucun document':", await page.locator("text=Aucun document").count());
  console.log("texte 'Ajouter un document':", await page.locator("text=Ajouter un document").count());
  console.log("texte 'Rechercher':", await page.locator("input[placeholder*='Rechercher']").count());
  console.log("ERREURS:", errors.length ? errors.join("\n") : "aucune");
  await browser.close();
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });