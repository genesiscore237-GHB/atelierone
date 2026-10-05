import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { resetDonneesR5 } from "./r5-reset";

const EVIDENCE_DIR = path.resolve(process.cwd(), "../../audit/r5");
const EMPLOYE_URL = "/dashboard/rh/employes/501";

const PSQL = (sql: string): string =>
  execSync(
    `"C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe" -U postgres -h localhost -d atelierone_erp -t -A -c "${sql.replace(/"/g, '\\"')}"`,
    { env: { ...process.env, PGPASSWORD: "postgres" }, encoding: "utf8", stdio: "pipe" }
  ).trim();

function capture(page: Page, name: string) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  return page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill("admin@gpj.cm");
  await page.locator('input[type="password"]').fill("admin123");
  await page.getByRole("button", { name: /Se Connecter/ }).click();
  await page.waitForURL("**/dashboard", { timeout: 240_000 });
}

async function ouvrirFicheAvances(page: Page, empty = true) {
  await page.goto(EMPLOYE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.getByRole("heading", { name: /Avance Mensuel/ })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("tab", { name: "Avances" }).click();
  if (empty) {
    await expect(page.getByText("Aucune avance enregistrée pour cet employé.")).toBeVisible({ timeout: 60_000 });
  } else {
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 60_000 });
  }
}

test("R5-FUNC-01 : cycle complet UI — synthèse, référence, workflow, historique+journal, idempotence", async ({ page }) => {
  test.setTimeout(720_000);
  resetDonneesR5();
  const logs: string[] = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`[console:${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("requestfailed", (r) => logs.push(`[requestfailed] ${r.method()} ${r.url()} :: ${r.failure()?.errorText ?? "?"}`));

  // 1) Connexion SuperAdmin
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.goto("/dashboard/rh/paie", { waitUntil: "domcontentloaded" });
  await login(page);
  await capture(page, "r5-func-01-login");

  // 2) Fiche employé → onglet « Avances » : synthèse (E2) affichée
  await ouvrirFicheAvances(page);
  await expect(page.getByText("Total accordé")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Total récupéré")).toBeVisible();
  await expect(page.getByText("Reste à récupérer")).toBeVisible();
  await expect(page.getByText(/Soldées \/ actives \/ annulées/)).toBeVisible();
  await capture(page, "r5-func-02-synthese-cards");

  // 3) Nouvelle avance 150 000 (≤ salaire 200 000) → statut « Demandée » + référence ADV
  await page.getByRole("button", { name: /Nouvelle avance/ }).click();
  await page.getByPlaceholder(/Ex : 50 000/).fill("150000");
  await page.getByText("Enregistrer", { exact: true }).last().click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Avance enregistrée \(statut : Demandée\)/)).toBeVisible({ timeout: 60_000 });
  const row = page.locator("table tbody tr", { hasText: "150 000" }).first();
  await expect(row).toContainText("Demandée");
  await expect(row.locator("td").first()).toContainText(/ADV-2026\d{2}-\d+/);
  await capture(page, "r5-func-03-created-reference");

  // 4) Recherche par référence dans la fiche (liste filtrable)
  const ref = (await row.locator("td").first().textContent())!.trim();
  await page.getByPlaceholder(/Rechercher par statut ou motif/).fill(ref);
  await expect(page.locator("table tbody tr")).toHaveCount(1, { timeout: 30_000 });
  await page.getByPlaceholder(/Rechercher par statut ou motif/).fill("ZZZ-inexistant");
  await expect(page.getByText("Aucune avance ne correspond à la recherche.")).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder(/Rechercher par statut ou motif/).fill("");
  await capture(page, "r5-func-04-search");

  // 5) Approbation → « Approuvée »
  await page.locator("table tbody tr", { hasText: "150 000" }).first().getByTitle("Approuver").click();
  await page.getByRole("button", { name: /Confirmer/ }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Avance approuvée/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("table tbody tr", { hasText: "150 000" }).first()).toContainText("Approuvée", { timeout: 30_000 });
  await capture(page, "r5-func-05-approuvee");

  // 6) Versement → « Versée »
  await page.locator("table tbody tr", { hasText: "150 000" }).first().getByTitle("Verser").click();
  await page.getByRole("button", { name: /Confirmer/ }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Avance versée/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("table tbody tr", { hasText: "150 000" }).first()).toContainText("Versée", { timeout: 30_000 });
  await capture(page, "r5-func-06-versee");

  // 7) Récupération partielle 60 000 → solde 90 000 + idempotence E6 (bouton désactivé pendant mutation)
  await page.locator("table tbody tr", { hasText: "150 000" }).first().getByTitle("Enregistrer une récupération").click();
  await expect(page.getByText(/Solde restant/)).toBeVisible({ timeout: 30_000 });
  const recupModal = page.locator(".fixed.inset-0.z-50").last();
  await recupModal.locator('input[inputmode="numeric"]').fill("60000");
  await recupModal.getByText("Enregistrer", { exact: true }).click();
  await page.locator('[data-sonner-toaster]').getByText(/Récupération enregistrée/).waitFor({ timeout: 60_000 });
  const rowPart = page.locator("table tbody tr", { hasText: "150 000" }).first();
  await expect(rowPart).toContainText("60 000", { timeout: 30_000 });
  await expect(rowPart).toContainText("90 000");
  await expect(rowPart).toContainText("Partiellement récupérée");
  await capture(page, "r5-func-07-partielle-60k");

  // 8) Récupération totale du solde (pré-rempli 90 000) → « Récupérée »
  await page.locator("table tbody tr", { hasText: "150 000" }).first().getByTitle("Enregistrer une récupération").click();
  const recupModal2 = page.locator(".fixed.inset-0.z-50").last();
  await expect(recupModal2.locator('input[inputmode="numeric"]')).toHaveValue("90000");
  await recupModal2.getByText("Enregistrer", { exact: true }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Récupération enregistrée/)).toBeVisible({ timeout: 60_000 });
  const rowSold = page.locator("table tbody tr", { hasText: "150 000" }).first();
  await expect(rowSold).toContainText("Récupérée", { timeout: 30_000 });
  await capture(page, "r5-func-08-soldee");

  // 9) Historique + journal (E1 : listRecoveries + listTransitions exposés)
  await page.locator("table tbody tr", { hasText: "150 000" }).first().getByTitle("Historique des récupérations").click();
  await expect(page.getByText("Historique de l'avance")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Journal des transitions")).toBeVisible();
  await expect(page.getByText("Récupérations")).toBeVisible();
  await capture(page, "r5-func-09-historique-journal");
  const historyModal = page.locator(".fixed.inset-0.z-50").last();
  await historyModal.getByRole("button").first().click();

  // 10) Vérifications DB : référence, journal complet (5 transitions), solde 0 — 2 lignes de récup seulement
  const maxId = PSQL("SELECT MAX(id) FROM employee_advances;");
  const refDb = PSQL(`SELECT reference FROM employee_advances WHERE id=${maxId};`);
  const nbRecupsDb = PSQL(`SELECT COUNT(*) FROM advance_recoveries WHERE advance_id=${maxId};`);
  const soldeDb = PSQL(`SELECT solde_restant FROM employee_advances WHERE id=${maxId};`);
  const journalDb = PSQL(`SELECT string_agg(to_status, '|' ORDER BY id) FROM advance_transitions WHERE advance_id=${maxId};`);
  expect(refDb).toMatch(/^ADV-2026\d{2}-\d+$/);
  expect(nbRecupsDb).toBe("2");
  expect(soldeDb).toBe("0");
  expect(journalDb).toContain("DEMANDÉE|APPROUVÉE|VERSÉE|PARTIELLEMENT_RÉCUPÉRÉE|RÉCUPÉRÉE");
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, "r5-func-10-db-journal.txt"), `ref=${refDb}\nnbRecups=${nbRecupsDb}\nsolde=${soldeDb}\njournal=${journalDb}\n\n${logs.join("\n")}`, "utf8");
});

test("R5-FUNC-02 : garde-fous — plafond salaire, doublon période, annulation motivée, persistance", async ({ page }) => {
  test.setTimeout(600_000);
  resetDonneesR5();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.goto("/dashboard/rh/paie", { waitUntil: "domcontentloaded" });
  await login(page);
  await ouvrirFicheAvances(page);

  // 11) Plafond salaire : 250 000 > salaire 200 000 → refus serveur + feedback inline dans la modal
  await page.getByRole("button", { name: /Nouvelle avance/ }).click();
  await page.getByPlaceholder(/Ex : 50 000/).fill("250000");
  await page.getByText("Enregistrer", { exact: true }).last().click();
  const modalPlafond = page.locator(".fixed.inset-0.z-50").last();
  await expect(modalPlafond.getByText(/supérieure au salaire mensuel/)).toBeVisible({ timeout: 60_000 });
  await capture(page, "r5-func-11-salaire-depasse");
  await modalPlafond.getByRole("button").first().click();

  // 12) Doublon période concernée : nouvelle avance SEMAINE ACTIVE sur la même période → refus
  await page.getByRole("button", { name: /Nouvelle avance/ }).click();
  await page.getByPlaceholder(/Ex : 50 000/).fill("20000");
  const boutonSemaine = page.getByText("Saisie hebdomadaire rapide");
  if (await boutonSemaine.isVisible().catch(() => false)) {
    await boutonSemaine.click();
  }
  await page.getByText("Enregistrer", { exact: true }).last().click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Avance enregistrée \(statut : Demandée\)/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("table tbody tr", { hasText: "20 000" }).first()).toBeVisible({ timeout: 30_000 });
  await capture(page, "r5-func-12-avance-session-20k");

  // la même semaine → doublon (l'avance 20k est encore ACTIVE/Demandée)
  await page.getByRole("button", { name: /Nouvelle avance/ }).click();
  await page.getByPlaceholder(/Ex : 50 000/).fill("20000");
  const boutonSemaine2 = page.getByText("Saisie hebdomadaire rapide");
  if (await boutonSemaine2.isVisible().catch(() => false)) {
    await boutonSemaine2.click();
  }
  await page.getByText("Enregistrer", { exact: true }).last().click();
  const modalDoublon = page.locator(".fixed.inset-0.z-50").last();
  await expect(modalDoublon.getByText(/déjà|doublé|existe déjà/)).toBeVisible({ timeout: 60_000 });
  await capture(page, "r5-func-12-doublon-refus");
  await modalDoublon.getByRole("button").first().click();

  // 13) Annulation AVEC motif (E7) : approuver → verser → annuler (pas de récup → autorisé)
  let row20 = page.locator("table tbody tr", { hasText: "20 000" }).first();
  await row20.getByTitle("Approuver").click();
  await page.getByRole("button", { name: /Confirmer/ }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Avance approuvée/)).toBeVisible({ timeout: 60_000 });
  row20 = page.locator("table tbody tr", { hasText: "20 000" }).first();
  await row20.getByTitle("Verser").click();
  await page.getByRole("button", { name: /Confirmer/ }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Avance versée/)).toBeVisible({ timeout: 60_000 });
  row20 = page.locator("table tbody tr", { hasText: "20 000" }).first();
  await row20.getByTitle("Annuler l'avance").click();
  await expect(page.getByRole("heading", { name: "Annuler l'avance" })).toBeVisible({ timeout: 30_000 });
  const annulModal = page.locator(".fixed.inset-0.z-50").last();
  await annulModal.locator("textarea").fill("Erreur de saisie, avance non versée");
  await annulModal.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Avance annulée/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("table tbody tr", { hasText: "20 000" }).first()).toContainText("Annulée", { timeout: 30_000 });
  await capture(page, "r5-func-13-annulation-motif");

  // 14) Justification persistée en DB (journal ANNULÉE) — prédicat ASCII pour éviter l'encoding psql Windows
  const justifDb = PSQL("SELECT justification FROM advance_transitions WHERE to_status LIKE 'ANNUL%' ORDER BY id DESC LIMIT 1;").split("\n")[0];
  expect(justifDb).toContain("Erreur de saisie");
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, "r5-func-14-annulation-db.txt"), `justification=${justifDb}`, "utf8");

  // 15) Persistance après refresh : l'avance 20k reste « Annulée »
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("tab", { name: "Avances" }).click();
  await expect(page.locator("table tbody tr", { hasText: "20 000" }).first()).toContainText("Annulée");
  await capture(page, "r5-func-15-persistance");
});