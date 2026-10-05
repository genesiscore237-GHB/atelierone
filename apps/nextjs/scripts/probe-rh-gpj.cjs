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
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (err) => errors.push("PAGEERROR: " + err.message.slice(0, 300)));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text() || "";
    if (t.includes("fonts.googleapis.com") || t.includes("Content Security Policy")) return;
    errors.push("CONSOLE: " + t.slice(0, 300));
  });
  const verdict = (name, ok, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  const waitText = async (sel, ms = 20000) => { try { await page.waitForSelector(sel, { timeout: ms }); return true; } catch { return false; } };

  // 1. Employés : 15 employés GPJ + EMP014/015
  await page.goto(`${BASE}/dashboard/rh/employes`, { waitUntil: "commit" });
  const empOk = await waitText("input[placeholder='Rechercher...']", 25000);
  verdict("page employés chargée (recherche)", empOk);
  if (!empOk) {
    const body = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 800) : "(vide)");
    const url = page.url();
    console.log("URL:", url);
    console.log("BODY:", JSON.stringify(body));
  }
  if (!empOk) { console.log("ERREURS JS:", errors.length ? errors.join("\n") : "aucune"); await browser.close(); process.exit(2); }
  const statsActifs = await waitText("text=Actifs", 10000);
  verdict("stat 'Actifs' affichée", statsActifs);
  await page.locator("input[placeholder='Rechercher...']").fill("EMP015");
  await page.waitForTimeout(1200);
  const emp015Row = (await page.locator("body").innerText()).includes("Boyomo Ntsoli");
  verdict("EMP015 (Boyomo Ntsoli Simon) visible après recherche", emp015Row);
  await page.locator("input[placeholder='Rechercher...']").fill("EMP013");
  await page.waitForTimeout(1200);
  const emp013Ok = (await page.locator("body").innerText()).includes("Nague Zemdjui");
  verdict("EMP013 (Nague Zemdjui Arnaud) visible", emp013Ok);
  await page.locator("input[placeholder='Rechercher...']").fill("EMP014");
  await page.waitForTimeout(1200);
  const emp014Ok = (await page.locator("body").innerText()).includes("Zo'o Mbarga");
  verdict("EMP014 (Zo'o Mbarga Jean Loic) visible", emp014Ok);

  // 2. Tableau de bord RH : masse salariale
  await page.goto(`${BASE}/dashboard/rh/tableau-de-bord`, { waitUntil: "commit" });
  const dashOk = await waitText("text=Tableau de bord RH", 25000);
  verdict("tableau de bord RH chargé", dashOk);
  verdict("carte 'Masse salariale (base)'", await waitText("text=Masse salariale (base)", 15000));

  // 3. Présences : pointage novembre rejoué (onglets Saisie / Historique / Mensuel)
  await page.goto(`${BASE}/dashboard/rh/presences`, { waitUntil: "commit" });
  const presOk = await waitText("text=Tsafack Ndongmo", 25000);
  verdict("présences chargées (nom d'employé visible)", presOk);

  let histOk = false;
  await page.locator("button:has-text('Historique')").click().catch(() => {});
  try {
    await page.waitForFunction(() => (document.body?.innerText ?? "").includes("2026-09"), { timeout: 30000 });
    const t = await page.evaluate(() => document.body?.innerText ?? "");
    histOk = t.includes("2026-09") && t.includes("Tsafack Ndongmo");
  } catch {}
  verdict("historique : pointage importé (dates 2026-09 + employés)", histOk);

  let btnClose = false;
  await page.locator("button:has-text('Mensuel & clôture')").click().catch(() => {});
  try {
    await page.waitForFunction(() => (document.body?.innerText ?? "").includes("Clôturer le mois"), { timeout: 30000 });
    btnClose = true;
  } catch {}
  verdict("mensuel : bouton 'Clôturer le mois' présent", btnClose);

  // 4. Paie : préparation du mois
  await page.goto(`${BASE}/dashboard/rh/paie`, { waitUntil: "commit" });
  const paieOk = await waitText("button:has-text('Clôturer')", 25000);
  verdict("paie chargée (bouton clôturer/préparer)", paieOk);

  // 5. Absences : EMP006 (accident de travail)
  await page.goto(`${BASE}/dashboard/rh/absences`, { waitUntil: "commit" });
  let absOk = false;
  try {
    await page.waitForFunction(() => (document.body?.innerText ?? "").includes("accident de travail"), { timeout: 30000 });
    const absBody = await page.evaluate(() => document.body?.innerText ?? "");
    absOk = absBody.includes("accident de travail") && absBody.includes("Nyontyen") && absBody.includes("Maladie");
  } catch {}
  verdict("absences chargées (congé maladie EMP006)", absOk);
  if (!absOk) console.log("ABS-DBG", JSON.stringify((await page.evaluate(() => document.body ? document.body.innerText : "")).slice(-900)));

  console.log("ERREURS JS:", errors.length ? errors.join("\n") : "aucune");
  await browser.close();
  process.exit(errors.length ? 2 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });