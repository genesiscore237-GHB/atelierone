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
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text() || "";
    if (t.includes("fonts.googleapis.com") || t.includes("Content Security Policy")) return;
    errors.push("CONSOLE: " + t.slice(0, 300));
  });

  const verdict = (name, ok, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  const searchInput = () => page.locator("input[placeholder*='Filtre à huile']");
  const go = async (s) => {
    await searchInput().fill(s);
    await searchInput().press("Enter");
  };
  const waitText = async (sel, ms = 15000) => {
    try { await page.waitForSelector(sel, { timeout: ms }); return true; } catch { return false; }
  };

  // 1. Page charge (attendre l'interactivité, pas un délai arbitraire)
  await page.goto(`${BASE}/dashboard/catalog/aide`, { waitUntil: "commit" });
  const inputOk = await waitText("input[placeholder*='Filtre à huile']", 25000);
  verdict("champ de recherche présent", inputOk);
  if (!inputOk) { console.log("ERREURS JS:", errors.length ? errors.join("\n") : "aucune"); await browser.close(); process.exit(2); }
  verdict("état initial (chips exemples)", (await page.locator("text=Essayez :").count()) > 0);

  // 2. Recherche "Filtre à huile" → désambiguïsation puis clic sur la meilleure carte
  await go("Filtre à huile");
  const carteOk = await waitText("button:has-text('Filtre à huile')", 15000);
  verdict("carte top 'Filtre à huile' affichée", carteOk);
  if (carteOk) {
    await page.locator("button:has-text('Filtre à huile')").first().click();
  }
  const ficheOk = await waitText("text=Variantes types", 20000);
  verdict("fiche ouverte 'Variantes types'", ficheOk);
  verdict("section 'Procédures de saisie'", await waitText("text=Procédures de saisie", 10000));
  verdict("section 'Champs à renseigner'", await waitText("text=Champs à renseigner", 10000));
  verdict("badge 'Variante de référence'", await waitText("text=Variante de référence", 5000));
  verdict("scénarios NOM_SEUL/NOM_REF/EXISTANT", (await page.locator("text=Nom seul").count()) > 0 && (await page.locator("text=Nom + référence").count()) > 0 && (await page.locator("text=Déjà existant").count()) > 0);
  verdict("bouton 'Nouvelle recherche'", await waitText("button:has-text('Nouvelle recherche')", 5000));

  // 3. Recherche multiple → désambiguïsation
  await go("plaquettes");
  const multiOk = await waitText("text=Plaquettes de frein avant", 15000);
  verdict("carte désambiguation 'Plaquettes de frein avant'", multiOk);
  verdict("compteur pluriel 'résultats'", (await page.locator("text=/[2-9][0-9]? résultats/").count()) > 0);

  // 4. Zéro résultat → état vide
  await go("zzzz inexistant");
  verdict("état vide 'Aucun concept trouvé'", await waitText("text=Aucun concept trouvé", 15000));

  // 5. Champ vide → bouton désactivé (validation explicite, pas de submit)
  await searchInput().fill("   ");
  const disabled = await page.locator("button[type=submit]").isDisabled();
  verdict("bouton désactivé si terme vide", disabled);

  // 6. Panneau "?" du catalogue : saisir une pièce → obtenir le guide
  await page.goto(`${BASE}/dashboard/catalog/dashboard`, { waitUntil: "commit" });
  const dashReady = await waitText("text=Vue d'ensemble — Catalogue", 25000);
  verdict("dashboard chargé avant test « ? »", dashReady);
  const aideBtn = page.locator('button[aria-label="Aide du module"]');
  const helpSheetOk = await (await page.waitForSelector('button[aria-label="Aide du module"]', { timeout: 10000 }).then(() => true).catch(() => false));
  verdict("bouton « ? » visible sur le catalogue", helpSheetOk && dashReady);
  if (helpSheetOk) {
    await aideBtn.click();
    const sheetInput = page.locator('input[aria-label="Rechercher un concept article"]');
    const sheetInputOk = await (await sheetInput.waitFor({ timeout: 15000 }).then(() => true).catch(() => false));
    verdict("champ de saisie présent dans le panneau « ? »", sheetInputOk);
    if (sheetInputOk) {
      await sheetInput.fill("Filtre à huile");
      await sheetInput.press("Enter");
      const sheetResultOk = await waitText("button:has-text('Filtre à huile')", 15000);
      verdict("résultats de recherche dans le panneau", sheetResultOk);
      if (sheetResultOk) {
        await page.locator("button:has-text('Filtre à huile')").first().click();
        verdict("fiche guide dans le panneau (Variantes types)", await waitText("text=Variantes types", 15000));
      }
    }
  }

  // 7. Vue d'ensemble (fix 500 catalog.apercu)
  await page.goto(`${BASE}/dashboard/catalog/dashboard`, { waitUntil: "commit" });
  verdict("dashboard 'Vue d'ensemble — Catalogue'", await waitText("text=Vue d'ensemble — Catalogue", 25000));
  verdict("stats référentiel (score qualité)", await waitText("text=Score qualité", 15000));

  console.log("ERREURS JS:", errors.length ? errors.join("\n") : "aucune");
  await browser.close();
  process.exit(errors.length ? 2 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });