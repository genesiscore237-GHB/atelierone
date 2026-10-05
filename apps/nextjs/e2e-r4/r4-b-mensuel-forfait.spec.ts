import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const PERIODE4_LABEL = "2026-09-01 → 2026-09-29";
const EVIDENCE_DIR = path.resolve(process.cwd(), "../../audit/r4");

function capture(page: Page, name: string) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  return page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

async function chauffer(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.goto("/dashboard/rh/paie", { waitUntil: "domcontentloaded" });
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Se Connecter/ }).click();
  await page.waitForURL("**/dashboard", { timeout: 240_000 });
}

async function ouvrirPaie(page: Page) {
  await page.goto("/dashboard/rh/paie", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.getByRole("heading", { name: "Paie" })).toBeVisible({ timeout: 120_000 });
}

test("R4-B-01 SuperAdmin : injection R4-B — préparation de la période 4 (18 bulletins : 15 réels + 3 test) + bulletins mensuels/forfait réels", async ({ page }) => {
  test.setTimeout(480_000);
  await chauffer(page);
  await login(page, "admin@gpj.cm", "admin123");
  await ouvrirPaie(page);

  // La période 4 est ouverte (amendée par le scénario R4-A / setup)
  const periode4 = page.locator("div.flex.flex-wrap.items-center.gap-3", { hasText: "2026-09-01" }).first();
  await expect(periode4).toContainText("Ouverte", { timeout: 60_000 });

  // Sélectionner la période → aperçu avant calcul = 15 bulletins (les 3 test n'ont
  // pas encore de bulletin ; ils seront créés par « Calculer la paie »)
  await page.getByText(PERIODE4_LABEL).first().click();
  await expect(page.getByText(/15 bulletin\(s\)/, { exact: false })).toBeVisible({ timeout: 120_000 });
  await capture(page, "r4-monthly-real-apercu-15");

  // Calculer réellement la paie → toast de synthèse (upsert 15 + création 3 = 18)
  await page.getByRole("button", { name: /Calculer la paie/ }).click();
  await expect(
    page.locator('[data-sonner-toaster]').getByText(/18 bulletin\(s\) calculé\(s\)/)
  ).toBeVisible({ timeout: 120_000 });
  await capture(page, "r4-monthly-real-toast");

  // Onglet Bulletins → 18 lignes
  await page.getByRole("button", { name: "Bulletins", exact: true }).click();
  await page.locator("select").nth(1).selectOption({ label: PERIODE4_LABEL });
  const rows = page.locator("table tbody tr");
  await expect(rows).toHaveCount(18, { timeout: 60_000 });
  await capture(page, "r4-monthly-real-bulletins-18");

  // Bulletins des 3 salariés test bien présents et nets >= 0
  const testRows = ["Mensuel Cas1", "Mensuel Cas2", "Forfait Hebdo"];
  for (const nom of testRows) {
    const row = page.locator("table tbody tr", { hasText: nom });
    await expect(row).toBeVisible();
    await expect(row).toContainText("prepare");
  }

  // Reconnaissance Arnaud inchangée (non-régression bulletins réels)
  const arnaud = page.locator("table tbody tr", { hasText: "Arnaud" });
  await expect(arnaud).toBeVisible();
  await expect(arnaud).toContainText("120.18h");
  await expect(arnaud).toContainText("509,42");

  // Nets tous >= 0 (dont les nouveaux salariés test)
  const nets = await page.locator("table tbody tr td:nth-child(6)").allTextContents();
  for (const n of nets) {
    const v = Number(n.replace(/[^\d-]/g, ""));
    expect(v, `net doit être >= 0: ${n}`).toBeGreaterThanOrEqual(0);
  }
});