const { chromium } = require("@playwright/test");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    storageState: "apps/nextjs/e2e/.auth/operateurPos.json",
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  let bodies = [];
  page.on("response", async (res) => {
    if (res.url().includes("catalog.list")) {
      bodies.push({ t: Date.now(), status: res.status(), body: (await res.text().catch(() => "ERR")).slice(0, 500) });
    }
  });

  await page.goto("http://localhost:3000/dashboard/catalog", { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.locator("table tbody tr").first().waitFor({ timeout: 240000 });

  bodies = [];
  const search = page.locator('input[placeholder="Rechercher un produit..."]');
  await search.fill("manu");
  await page.waitForTimeout(6000);
  const rows = await page.locator("table tbody tr").count();
  const errVisible = await page.locator("text=Erreur de chargement").isVisible().catch(() => false);
  const skeletonVisible = await page.locator(".animate-pulse").first().isVisible().catch(() => false);
  const emptyMsg = await page.locator("text=/Aucun produit ne correspond/i").isVisible().catch(() => false);
  console.log("rows:", rows, "| errVisible:", errVisible, "| skeleton:", skeletonVisible, "| empty:", emptyMsg);
  for (const b of bodies) console.log("body:", b.body);

  await browser.close();
  console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
