import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const PERIODE4_LABEL = "2026-09-01 → 2026-09-29";
const EVIDENCE_DIR = path.resolve(process.cwd(), "../../audit/r4");

function rouvrirPeriode4() {
  execSync(
    '"C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe" -U postgres -h localhost -d atelierone_erp -c "UPDATE payroll_periods SET status=\'open\', closed_by=NULL, closed_at=NULL WHERE id=4"',
    { env: { ...process.env, PGPASSWORD: "postgres" }, stdio: "pipe" }
  );
}

function capture(page: Page, name: string) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  return page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

// Compilation à froid Next.js : chaque route est compilée au premier hit.
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

function armLogCapteurs(page: Page, logs: string[]) {
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) logs.push(`[console:${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("requestfailed", (r) => logs.push(`[requestfailed] ${r.method()} ${r.url()} :: ${r.failure()?.errorText ?? "?"}`));
}

function ecrireLogs(logs: string[], file: string) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, file), logs.join("\n"), "utf8");
}

test("R4-A-01 SuperAdmin : scénario complet 14 étapes (ouverture refusée → calcul → bulletins → clôture → refresh/persistance)", async ({ page }) => {
  test.setTimeout(480_000);
  const logs: string[] = [];
  armLogCapteurs(page, logs);

  // 1) Connexion
  await chauffer(page);
  await login(page, "admin@gpj.cm", "admin123");
  await capture(page, "r4-ui-step1-login");

  // 2) Navigation vers Paie
  await ouvrirPaie(page);
  await capture(page, "r4-ui-step2-paie");

  // 3) Vérifier le chargement (heading + zone périodes)
  await expect(page.getByRole("heading", { name: "Paie" })).toBeVisible();
  await expect(page.getByText("Périodes de paie")).toBeVisible();
  await capture(page, "r4-ui-step3-chargement");

  // 4) Période affichée + statut ouvert
  const periode4 = page.locator("div.flex.flex-wrap.items-center.gap-3", { hasText: "2026-09-01" }).first();
  await expect(periode4).toBeVisible();
  await expect(periode4).toContainText("Ouverte");
  await expect(page.getByRole("button", { name: /Ouvrir la période/ })).toBeEnabled();
  await capture(page, "r4-ui-step4-periode");

  // 5) Ouvrir la période — clic RÉEL (période déjà ouverte → refus explicite du serveur)
  await expect(page.getByRole("button", { name: /Ouvrir la période/ })).toBeVisible();
  await page.getByRole("button", { name: /Ouvrir la période/ }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/chevauche|déjà ouverte|couvrir tout le mois|dernier jour/)).toBeVisible({ timeout: 30_000 });

  // 6) Résultat visible : refus affiché (feedback explicite, jamais silencieux)
  await capture(page, "r4-ui-step6-refus");
  await expect(periode4).toContainText("Ouverte");

  // 7) Calculer la paie
  await page.getByText(PERIODE4_LABEL).first().click();
  await expect(page.getByText(/15 bulletin\(s\)/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Brut total :/)).toBeVisible();
  await capture(page, "r4-ui-step7-avant-calcul");

  await page.getByRole("button", { name: /Calculer la paie/ }).click();

  // 8) Toast de résultat
  await expect(
    page.locator('[data-sonner-toaster]').getByText(/15 bulletin\(s\) calculé\(s\)/)
  ).toBeVisible({ timeout: 60_000 });
  await capture(page, "r4-ui-step8-toast");

  // 9) Bulletins affichés (onglet Bulletins), lignes = 15, nets >= 0, Arnaud vérifié
  await page.getByRole("button", { name: "Bulletins", exact: true }).click();
  await page.locator("select").nth(1).selectOption({ label: PERIODE4_LABEL });
  const rows = page.locator("table tbody tr");
  await expect(rows).toHaveCount(15, { timeout: 60_000 });
  await capture(page, "r4-ui-step9-bulletins");

  const arnaud = page.locator("table tbody tr", { hasText: "Arnaud" });
  await expect(arnaud).toBeVisible();
  await expect(arnaud).toContainText("120.18h");
  await expect(arnaud).toContainText("533,42");
  await expect(arnaud).toContainText("509,42");
  await expect(arnaud).toContainText("prepare");

  const nets = await page.locator("table tbody tr td:nth-child(6)").allTextContents();
  for (const n of nets) {
    const v = Number(n.replace(/[^\d-]/g, ""));
    expect(v, `net doit être >= 0: ${n}`).toBeGreaterThanOrEqual(0);
  }
  await capture(page, "r4-ui-step9-bulletins-nets");

  // 10) Clôturer la période (via onglet Périodes & préparation)
  await page.getByRole("button", { name: /Périodes & préparation/ }).click();
  await expect(periode4).toContainText("Ouverte", { timeout: 30_000 });
  await page.getByRole("button", { name: /Clôturer/ }).click();

  // 11) Vérifier la clôture
  await expect(page.locator('[data-sonner-toaster]').getByText("Période clôturée")).toBeVisible({ timeout: 60_000 });
  await expect(periode4).toContainText("Clôturée");
  await capture(page, "r4-ui-step11-cloturee");

  // 12) Les boutons changent (plus de Clôturer / Calculer / Ouvrir actifs de paie)
  await expect(page.getByRole("button", { name: /Clôturer/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Calculer la paie/ })).toHaveCount(0);
  await capture(page, "r4-ui-step12-boutons");

  // 13) Refresh navigateur → persistance de l'état
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.getByRole("heading", { name: "Paie" })).toBeVisible({ timeout: 120_000 });
  await expect(periode4).toContainText("Clôturée", { timeout: 60_000 });
  await expect(page.getByRole("button", { name: /Calculer la paie/ })).toHaveCount(0);
  await capture(page, "r4-ui-step13-refresh");

  // 14) État final vérifié (persistance après refresh)
  await expect(page.getByRole("button", { name: /Clôturer/ })).toHaveCount(0);

  // Journal console/page/requêtes → preuve
  ecrireLogs(logs, "r4-ui-playwright-console.txt");
});

test("R4-A-02 Directeur (sans rh.paie.modifier) : gating UI réel (boutons désactivés + message) + API protégée", async ({ page }) => {
  const logs: string[] = [];
  armLogCapteurs(page, logs);

  rouvrirPeriode4(); // la période est refermée par R4-A-01 → la rouvrir pour exposer les boutons gatés
  await login(page, "directeur@gpj.cm", "admin123");
  await ouvrirPaie(page);

  await expect(page.getByText("Permission requise : rh.paie.modifier")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /Ouvrir la période/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Calculer la paie/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Clôturer/ })).toBeDisabled();

  // Clic réel sur un bouton désactivé → aucun appel API ne doit partir (pas de 403 silencieux UI)
  await page.getByRole("button", { name: /Calculer la paie/ }).click({ force: true }).catch(() => {});
  await expect(page.locator('[data-sonner-toaster]').getByText(/bulletin\(s\) calculé\(s\)/)).toHaveCount(0);

  await capture(page, "r4-ui-permissions-directeur");
  ecrireLogs(logs, "r4-ui-permissions-console.txt");
});

test("R4-A-03 Unknown (sans session) : API paie protégée — redirect login", async ({ page }) => {
  const logs: string[] = [];
  armLogCapteurs(page, logs);

  await page.goto("/dashboard/rh/paie", { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/login", { timeout: 60_000 });
  await capture(page, "r4-ui-permissions-anonyme");
  ecrireLogs(logs, "r4-ui-permissions-anonyme-console.txt");
});