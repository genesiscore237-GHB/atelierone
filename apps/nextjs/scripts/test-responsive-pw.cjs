const { chromium } = require("playwright");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const VIEWPORTS = [
  { w: 375, h: 812, nom: "MOBILE" },
  { w: 768, h: 1024, nom: "TABLETTE" },
  { w: 1440, h: 900, nom: "DESKTOP" },
];
const PAGES = [
  { base: "http://localhost:3000", path: "/", login: false },
  { base: "http://localhost:3000", path: "/login", login: false },
  { base: "http://localhost:3000", path: "/dashboard", login: true },
  { base: "http://localhost:3000", path: "/dashboard/vehicules", login: true },
  { base: "http://localhost:3000", path: "/dashboard/ordres-reparation", login: true },
  { base: "http://localhost:3000", path: "/dashboard/atelier/parc", login: true },
  { base: "http://localhost:3000", path: "/dashboard/atelier/performance", login: true },
  { base: "http://localhost:3000", path: "/dashboard/customers", login: true },
  { base: "http://localhost:3000", path: "/dashboard/mon-abonnement", login: true },
  { base: "http://localhost:3000", path: "/dashboard/fournisseurs-factures", login: true },
  { base: "http://localhost:3001", path: "/dashboard/saas", login: true },
];

let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };

async function login(page, base) {
  const ctx = page.context();
  const csrf = await (await fetch(base + "/api/auth/csrf", { headers: { cookie: "" } })).json().catch(() => null);
  return csrf;
}

(async () => {
  const jar = new Map();
  async function httpWithJar(base, path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookieHeader) headers.cookie = cookieHeader;
    const res = await fetch(base + path, { ...opts, headers, redirect: "manual" });
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
    for (const sc of setCookies) {
      const pair = sc.split(";")[0];
      const idx = pair.indexOf("=");
      if (idx > 0 && !pair.startsWith("=")) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1));
    }
    return res;
  }

  // Connexion sur les deux instances
  const cookies3000 = new Map();
  async function loginJar(base, store) {
    const csrf = await (await fetch(base + "/api/auth/csrf")).json();
    const res = await fetch(base + "/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: base + "/dashboard" }),
      redirect: "manual",
    });
    const scs = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
    for (const sc of scs) { const pair = sc.split(";")[0]; const i = pair.indexOf("="); if (i > 0) store.set(pair.slice(0, i).trim(), pair.slice(i + 1)); }
  }
  await loginJar("http://localhost:3000", cookies3000);
  await loginJar("http://localhost:3001", new Map()); // le central partage les mêmes cookies de session ? non — refetch
  // Central : relogin séparé
  const cookies3001 = new Map();
  await loginJar("http://localhost:3001", cookies3001);

  const browser = await chromium.launch({ executablePath: CHROME });
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message.slice(0, 150)));

    for (const p of PAGES) {
      const base = p.base;
      const cookies = base.includes("3001") ? cookies3001 : cookies3000;
      const domain = new URL(base).hostname;
      const cookList = [...cookies.entries()].map(([k, v]) => ({ name: k, value: v, domain, path: "/" }));
      await ctx.addCookies(cookList);
      try {
        await page.goto(base + p.path, { waitUntil: "networkidle", timeout: 90000 });
        await page.waitForTimeout(3500);
        // Débordement horizontal
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          return doc.scrollWidth - window.innerWidth;
        });
        const errs = errors.length;
        errors.length = 0;
        check(`${vp.nom} ${p.path} (overflow ≤ 4 px, 0 erreur JS)`, overflow <= 4 && errs === 0, `overflow=${overflow}px errs=${errs}`);
      } catch (e) {
        check(`${vp.nom} ${p.path} (chargement)`, false, e.message.slice(0, 100));
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\nRÉSULTAT RESPONSIVE : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });