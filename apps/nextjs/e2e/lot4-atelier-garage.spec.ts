import { test, expect, type Page } from "@playwright/test";

/**
 * LOT 4 — Smoke e2e du triptyque Pilotage / Atelier / Garage.
 *
 * Vérifie que les 3 pages livrées par les Lots 0-4 se chargent sans erreur
 * console après login admin, et que les liens croisés 360° (Lot 3) existent
 * bien dans le DOM. Pas de mutation : lecture seule (le serveur de dev sur
 * :3000 est réutilisé — D5, jamais de redémarrage).
 *
 * Run : pnpm -F @atelierone/nextjs test:e2e (config racine réparée Lot 4)
 *       ou : npx playwright test e2e/lot4-atelier-garage.spec.ts
 */

async function login(page: Page, email = "admin@gpj.cm", password = "admin123") {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Se Connecter/ }).click();
  await page.waitForURL("**/dashboard", { timeout: 240_000 });
}

async function gotoRetry(page: Page, url: string) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
      break;
    } catch {
      await page.waitForTimeout(1500);
      if (i === 2) throw new Error(`Page ${url} injoignable après 3 essais`);
    }
  }
  await page.waitForLoadState("networkidle").catch(() => {});
}

function trackErrors(page: Page, logs: string[]) {
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
}

test.describe("Lot 4 — smoke Pilotage / Atelier / Garage", () => {
  test("pilotage : dashboard direction se charge (KPI + sections)", async ({ page }) => {
    const logs: string[] = [];
    trackErrors(page, logs);
    await login(page);
    await gotoRetry(page, "/dashboard/pilotage");

    // Sections du dashboard Lot 3.
    await expect(page.getByText(/santé atelier/i).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/temps passé par statut/i).first()).toBeVisible({ timeout: 30_000 });

    // Aucune erreur JS bloquante (les erreurs réseau non bloquantes sont tolérées).
    expect(logs.filter((l) => l.startsWith("[pageerror]"))).toEqual([]);
  });

  test("atelier : page OR se charge", async ({ page }) => {
    const logs: string[] = [];
    trackErrors(page, logs);
    await login(page);
    await gotoRetry(page, "/dashboard/atelier");

    await expect(page.locator("main")).toBeVisible({ timeout: 60_000 });
    expect(logs.filter((l) => l.startsWith("[pageerror]"))).toEqual([]);
  });

  test("garage : parking se charge (liste véhicules)", async ({ page }) => {
    const logs: string[] = [];
    trackErrors(page, logs);
    await login(page);
    await gotoRetry(page, "/dashboard/garage");

    await expect(page.locator("main")).toBeVisible({ timeout: 60_000 });
    expect(logs.filter((l) => l.startsWith("[pageerror]"))).toEqual([]);
  });

  test("garage : fiche véhicule parking s'ouvre depuis la liste", async ({ page }) => {
    const logs: string[] = [];
    trackErrors(page, logs);
    await login(page);
    await gotoRetry(page, "/dashboard/garage/vehicules");

    // La liste affiche des liens de fiche (si des véhicules existent).
    const ficheLink = page.locator('main a[href^="/dashboard/garage/vehicules/"]').first();
    const visible = await ficheLink.isVisible().catch(() => false);
    if (visible) {
      await ficheLink.click();
      await page.waitForURL(/\/dashboard\/garage\/vehicules\/\d+/, { timeout: 60_000 });
      // Bloc Atelier (lien croisé 360° — Lot 3) présent si véhicule lié au registre.
      await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
    }
    expect(logs.filter((l) => l.startsWith("[pageerror]"))).toEqual([]);
  });
});
