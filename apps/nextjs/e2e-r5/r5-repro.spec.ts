import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { resetDonneesR5 } from "./r5-reset";
import { PSQL } from "../e2e-r6/r6-psql";

const EVIDENCE_DIR = path.resolve(process.cwd(), "../../audit/r5");
const EMPLOYE_URL = "/dashboard/rh/employes/501";

function capture(page: Page, name: string) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  return page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Se Connecter/ }).click();
  await page.waitForURL("**/dashboard", { timeout: 240_000 });
}

// La réinitialisation de l'état 501 (fixture R5 + avances/bulletins de test)
// est partagée depuis ./r5-reset : resetDonneesR5().

async function ouvrirFicheAvances(page: Page, empty = true) {
  await page.goto(EMPLOYE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.getByRole("heading", { name: /Avance Mensuel/ })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("tab", { name: "Avances" }).click();
  if (empty) {
    await expect(page.getByText("Aucune avance enregistrée pour cet employé.")).toBeVisible({ timeout: 60_000 });
    await capture(page, "r5-repro-01-avant-avance-vide");
  } else {
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 60_000 });
  }
}

test("R5-REPRO-B : avance 100k → récupération partielle 40k → solde 60k → report sur préparation P4", async ({ page }) => {
  test.setTimeout(600_000);
  resetDonneesR5();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.goto("/dashboard/rh/paie", { waitUntil: "domcontentloaded" });
  await login(page, "admin@gpj.cm", "admin123");
  await ouvrirFicheAvances(page);

  // ── CRÉATION : bouton « Nouvelle avance »
  await page.getByRole("button", { name: /Nouvelle avance/ }).click();
  await page.getByPlaceholder(/Ex : 50 000/).fill("100000");
  await page.getByText("Enregistrer", { exact: true }).last().click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Avance enregistrée \(statut : Demandée\)/)).toBeVisible({ timeout: 60_000 });
  await capture(page, "r5-repro-02-create-demandee");

  // Vérifier la ligne créée : montant 100 000, solde 100 000, statut Demandée
  const row = page.locator("table tbody tr", { hasText: "100 000" });
  await expect(row).toContainText("Demandée");
  await capture(page, "r5-repro-03-ligne-demandee");

  // ── APPROBATION : bouton title="Approuver"
  await row.getByTitle("Approuver").click();
  await page.getByRole("button", { name: /Confirmer/ }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Avance approuvée/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("table tbody tr", { hasText: "100 000" })).toContainText("Approuvée", { timeout: 30_000 });
  await capture(page, "r5-repro-04-approuvee");

  // ── VERSEMENT : bouton title="Verser"
  const rowApr = page.locator("table tbody tr", { hasText: "100 000" });
  await rowApr.getByTitle("Verser").click();
  await page.getByRole("button", { name: /Confirmer/ }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Avance versée/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("table tbody tr", { hasText: "100 000" })).toContainText("Versée", { timeout: 30_000 });
  await capture(page, "r5-repro-05-versee");

  // ── RÉCUPÉRATION PARTIELLE : 40 000 → solde restant 60 000
  const rowVer = page.locator("table tbody tr", { hasText: "100 000" });
  await rowVer.getByTitle("Enregistrer une récupération").click();
  await expect(page.getByText(/Solde restant/)).toBeVisible({ timeout: 30_000 });
  const recupModal = page.locator(".fixed.inset-0.z-50").last();
  await recupModal.locator('input[inputmode="numeric"]').fill("40000");
  await recupModal.getByText("Enregistrer", { exact: true }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Récupération enregistrée/)).toBeVisible({ timeout: 60_000 });
  await capture(page, "r5-repro-06-partielle-40k");

  // Vérifier la ligne mise à jour : Récupéré 40 000, Solde 60 000, statut « Partiellement récupérée »
  const rowPart = page.locator("table tbody tr", { hasText: "100 000" });
  await expect(rowPart).toContainText("40 000", { timeout: 30_000 });
  await expect(rowPart).toContainText("60 000");
  await expect(rowPart).toContainText("Partiellement récupérée");
  await capture(page, "r5-repro-07-solde-60k");

  // ── Lien direct paie : préparer la période 4 → le bulletin 501 doit déduire 60 000
  await page.goto("/dashboard/rh/paie", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.getByRole("heading", { name: "Paie" })).toBeVisible({ timeout: 120_000 });
  await page.getByText("2026-09-01 → 2026-09-29").first().click();
  // L'aperçu expose toujours le badge du nombre de bulletins (population variable entre phases).
  await expect(page.getByText(/\d+ bulletin\(s\)/)).toBeVisible({ timeout: 120_000 });

  // Calculer la paie → le bulletin 501 (solde 60 000) doit être créé
  await page.getByRole("button", { name: /Calculer la paie/ }).click();
  await expect(
    page.locator('[data-sonner-toaster]').getByText(/\d+ bulletin\(s\) calculé\(s\)/)
  ).toBeVisible({ timeout: 120_000 });

  // Onglet Bulletins → ligne 501 : statut prepare avec la déduction du solde 60 000
  await page.getByRole("button", { name: "Bulletins", exact: true }).click();
  await page.locator("select").nth(1).selectOption({ label: "2026-09-01 → 2026-09-29" });
  const testRow = page.locator("table tbody tr", { hasText: "Avance Mensuel" });
  await expect(testRow).toBeVisible({ timeout: 60_000 });
  await expect(testRow).toContainText("prepare");

  // Le solde 60 000 est déduit en retenue « Récupération avance » (visible dans le bulletin détaillé)
  await testRow.getByRole("button", { name: "Détail" }).click();
  await expect(page.getByText("Bulletin détaillé")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Récupération avance/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/60\s+000/).first()).toBeVisible({ timeout: 30_000 });
  await capture(page, "r5-repro-11-bulletin-detail-solde-60k");

  // Preuve SQL : retenue « Récupération avance #… » de 60 000 sur le bulletin 501 (période 4)
  const recup = PSQL(
    `SELECT amount || '|' || direction FROM payroll_entry_lines pel
     JOIN payroll_entries pe ON pe.id = pel.payroll_entry_id
     WHERE pe.employee_id = 501 AND pel.item_code = 'AVANCE_RECUP'`
  ).trim();
  if (recup !== "60000.00|retenue") throw new Error("Déduction avance solde 60 000 absente du bulletin 501 : " + recup);
  await capture(page, "r5-repro-10-bulletin-501");
});

test("R5-REPRO-A corrigé : le bouton d'historique des récupérations est désormais exposé (E1)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.goto("/dashboard/rh/paie", { waitUntil: "domcontentloaded" });
  await login(page, "admin@gpj.cm", "admin123");
  await ouvrirFicheAvances(page, false);

  // Le défaut (A) a été corrigé : un bouton « Historique des récupérations » existe désormais.
  const historyBtns = page.getByTitle("Historique des récupérations");
  await expect(historyBtns.first()).toBeVisible({ timeout: 30_000 });
  await capture(page, "r5-repro-A-corrige-history-btn");
});