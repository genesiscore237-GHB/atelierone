import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const EVIDENCE_DIR = path.resolve(process.cwd(), "../../audit/r8/fonctionnels");

function capture(page: Page, name: string) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  return page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

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

const ficheLink = (page: Page) =>
  page.locator('main a[href^="/dashboard/rh/employes/"]').first();

async function firstEmployeId(page: Page): Promise<number> {
  await gotoRetry(page, "/dashboard/rh/employes");
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(ficheLink(page)).toBeVisible({ timeout: 60_000 });
  const href = await ficheLink(page).getAttribute("href");
  const m = href?.match(/employes\/(\d+)$/);
  if (!m) throw new Error(`Fiche href inattendu: ${href}`);
  return Number(m[1]);
}

const tabNom = (page: Page, nom: string) =>
  page.getByRole("tab", { name: nom }).or(page.getByRole("button", { name: nom })).first();

function trackLogs(page: Page, logs: string[]) {
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
}

test.describe("R8 — Navigation / UX / Cohérence RH", () => {
  test("A — KPI dashboard → écran cible avec contexte", async ({ page }) => {
    const logs: string[] = [];
    trackLogs(page, logs);
    await login(page);
    await gotoRetry(page, "/dashboard/rh/tableau-de-bord");

    await page.getByText("CDI", { exact: true }).first().click();
    await page.waitForURL(/\/dashboard\/rh\/employes\?type=permanent/, { timeout: 60_000 });
    await capture(page, "A1-kpi-cdi-employes");

    await gotoRetry(page, "/dashboard/rh/tableau-de-bord");
    await page.getByText("Absences du mois", { exact: true }).first().click();
    await page.waitForURL(/\/dashboard\/rh\/absences/, { timeout: 60_000 });
    await capture(page, "A2-kpi-absences");
    expect(logs.filter((l) => l.startsWith("[pageerror]"))).toEqual([]);
  });

  test("B — liste → fiche → retour (breadcrumb)", async ({ page }) => {
    await login(page);
    await gotoRetry(page, "/dashboard/rh/employes");
    await ficheLink(page).click();
    await page.waitForURL(new RegExp("/dashboard/rh/employes/\\d+"), { timeout: 60_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
    await capture(page, "B1-fiche");
    await page.locator('main a[href="/dashboard/rh/employes"]').last().click();
    await page.waitForURL(/\/dashboard\/rh\/employes$/, { timeout: 60_000 });
    await capture(page, "B2-retour-liste");
  });

  test("C — fiche (hub contextuel) → situation employé présélectionnée", async ({ page }) => {
    await login(page);
    const id = await firstEmployeId(page);
    await gotoRetry(page, `/dashboard/rh/employes/${id}`);
    await page.locator('main a[href^="/dashboard/rh/situation?"]').first().click();
    await page.waitForURL(new RegExp(`/dashboard/rh/situation\\?employeId=${id}`), { timeout: 60_000 });
    await expect(page.locator("#sit-employe")).toBeVisible({ timeout: 30_000 });
    expect(await page.locator("#sit-employe").textContent()).not.toContain("Tous les employés");
    await capture(page, `C-situation-deeplink-${id}`);
  });

  test("D — onglets fiche : ?tab= dans l'URL puis refresh", async ({ page }) => {
    await login(page);
    const id = await firstEmployeId(page);
    await gotoRetry(page, `/dashboard/rh/employes/${id}`);
    await tabNom(page, "Historique").click();
    await page.waitForURL(new RegExp(`/dashboard/rh/employes/${id}\\?tab=historique`), { timeout: 30_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(tabNom(page, "Historique")).toBeVisible({ timeout: 30_000 });
    await capture(page, "D-tab-historique-refresh");
  });

  test("E — annuaire → fiche employé", async ({ page }) => {
    await login(page);
    await gotoRetry(page, "/dashboard/rh/annuaire");
    await page.getByRole("link", { name: /Ouvrir la fiche/ }).first().click();
    await page.waitForURL(new RegExp("/dashboard/rh/employes/\\d+"), { timeout: 60_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
    await capture(page, "E-annuaire-fiche");
  });

  test("F — documents filtrés par employé (deep-link + effacer)", async ({ page }) => {
    await login(page);
    const id = await firstEmployeId(page);
    await gotoRetry(page, `/dashboard/rh/documents?employeId=${id}`);
    await expect(page.getByText(/Documents de /)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: /Effacer le filtre employé/ })).toBeVisible();
    await capture(page, `F-documents-filtre-${id}`);
    await page.getByRole("link", { name: /Effacer le filtre employé/ }).click();
    await page.waitForURL(/\/dashboard\/rh\/documents$/, { timeout: 30_000 });
    await expect(page.getByText(/Documents de /)).toBeHidden();
  });

  test("G — contrats filtrés par employé (deep-link + effacer)", async ({ page }) => {
    await login(page);
    const id = await firstEmployeId(page);
    await gotoRetry(page, `/dashboard/rh/contrats?employeId=${id}`);
    await expect(page.getByText(/Contrats de /)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: /Effacer le filtre employé/ })).toBeVisible();
    await capture(page, `G-contrats-filtre-${id}`);
    await page.getByRole("link", { name: /Effacer le filtre employé/ }).click();
    await page.waitForURL(/\/dashboard\/rh\/contrats$/, { timeout: 30_000 });
    await expect(page.getByText(/Contrats de /)).toBeHidden();
  });

  test("H — situation : Analyse écrit l'employé dans l'URL", async ({ page }) => {
    await login(page);
    await gotoRetry(page, "/dashboard/rh/situation");
    await page.locator("#sit-employe").click();
    await page.locator('[role="option"]').nth(1).click();
    await page.locator("#sit-from").fill("2026-10-01");
    await page.locator("#sit-to").fill("2026-10-31");
    await page.getByRole("button", { name: /Analyser/ }).click();
    await page.waitForURL(/\/dashboard\/rh\/situation\?employeId=\d+/, { timeout: 30_000 });
    await expect(page.locator("#sit-employe")).not.toContainText("Tous les employés");
    await capture(page, "H-situation-url");
  });

  test("I — back / forward / refresh conservent le contexte", async ({ page }) => {
    await login(page);
    const id = await firstEmployeId(page);
    await gotoRetry(page, `/dashboard/rh/employes/${id}`);
    await tabNom(page, "Historique").click();
    await page.waitForURL(new RegExp(`/dashboard/rh/employes/${id}\\?tab=historique`), { timeout: 30_000 });
    await page.goBack();
    await page.waitForURL(/\/dashboard\/rh\/employes$/, { timeout: 30_000 });
    await page.goForward();
    await page.waitForURL(new RegExp(`/dashboard/rh/employes/${id}\\?tab=historique`), { timeout: 30_000 });
    await capture(page, "I-back-forward");
  });

  test("J — permissions réelles post-sync socle : registre disciplinaire disponible", async ({ page }) => {
    await login(page);
    await gotoRetry(page, "/dashboard/rh/tableau-de-bord");
    await tabNom(page, "Rapports").click();
    await expect(page.locator("main").getByText("Registre disciplinaire").first()).toBeVisible({ timeout: 60_000 });
    const boutonCSV = page.locator("main").getByRole("button", { name: "CSV" }).nth(3);
    await expect(boutonCSV).toBeEnabled({ timeout: 30_000 });
    await capture(page, "J-export-registre-disciplinaire");

    await gotoRetry(page, "/dashboard/rh/sanctions");
    await tabNom(page, "Registre").click();
    await expect(page.locator("main").getByRole("button", { name: /Exporter/ }).first()).toBeVisible({ timeout: 60_000 });
    await capture(page, "J2-sanctions-registre-export");
  });
});