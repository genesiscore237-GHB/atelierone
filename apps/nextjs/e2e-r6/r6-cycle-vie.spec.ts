import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { resetDonneesR6Cycle, psqlR6Cycle } from "./r6-cycle-reset";
import { PSQL } from "./r6-psql";

const EVIDENCE_DIR = path.resolve(process.cwd(), "../../audit/r6/cycle");
const R6_950 = "/dashboard/rh/employes/950";
const R6_960 = "/dashboard/rh/employes/960";

function capture(page: Page, name: string) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  return page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

async function login(page: Page, email = "admin@gpj.cm", password = "admin123") {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Se Connecter/ }).click();
  await page.waitForURL("**/dashboard", { timeout: 240_000 });
}

async function ouvrirFiche(page: Page, url: string, onglet = "Cycle de vie") {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole("tab", { name: onglet }).click();
  await expect(page.getByText("Cycle de vie — situations RH")).toBeVisible({ timeout: 60_000 });
}

const panel = (page: Page) => page.locator("section").filter({ hasText: "Cycle de vie — situations RH" });

// Crée une situation MAP (3 jours, garde-fous cochés), statut initial SOUMIS (ou BROUILLON si workflow=).
async function creerMap(page: Page, duree: string, gardeFous = true, dateDebut = "2026-11-02", workflow = false) {
  const p = panel(page);
  await p.getByRole("button", { name: "Nouvelle situation" }).click();
  const mapId = PSQL("SELECT id FROM hr_situation_types WHERE agence_id=1 AND type='MISE_A_PIED' LIMIT 1;");
  const typeSel = p.locator("select").nth(0);
  await expect(typeSel.locator(`option[value="${mapId}"]`)).toHaveCount(1, { timeout: 90_000 });
  await typeSel.selectOption(mapId);
  await p.locator('input[type="date"]').nth(0).fill(dateDebut);
  await p.locator('input[type="number"]').first().fill(duree);
  if (workflow) await p.locator("select").nth(1).selectOption("BROUILLON");
  if (!gardeFous) {
    const cb = p.locator('input[type="checkbox"]');
    for (let i = 0; i < (await cb.count()); i++) await cb.nth(i).uncheck();
  }
  await p.getByRole("button", { name: "Enregistrer" }).click();
}

const rowMap = (page: Page) =>
  panel(page).locator("div.rounded-lg.border.border-border.bg-card.px-3.py-2").filter({ hasText: "MISE_A_PIED" }).last();

test("R6V2-01 : création MAP 3 jours → SOUMIS ; garde-fou durée > 8 j refusé", async ({ page }) => {
  test.setTimeout(480_000);
  resetDonneesR6Cycle();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await login(page);
  await ouvrirFiche(page, R6_960);

  await creerMap(page, "3");
  await expect(page.locator('[data-sonner-toaster]').getByText("Situation enregistrée")).toBeVisible({ timeout: 60_000 });
  await expect(rowMap(page)).toContainText("MISE_A_PIED");
  await expect(rowMap(page)).toContainText("3 j");
  await expect(rowMap(page)).toContainText("Soumis");
  await capture(page, "r6v2-01-map-soumise");

  // Garde-fou art. 30-3-a : 12 jours > 8 → refusé (validation client explicite)
  const avant = await PSQL("SELECT COUNT(*) FROM employee_situations WHERE employee_id=960;");
  await creerMap(page, "12");
  await expect(page.locator('[data-sonner-toaster]').getByText(/Durée maximale pour cette situation/)).toBeVisible({ timeout: 60_000 });
  const apresRefus = await PSQL("SELECT COUNT(*) FROM employee_situations WHERE employee_id=960;");
  expect(apresRefus).toBe(avant);

  const db = `avant=${avant}\napres_refus=${apresRefus}\nrow=${await rowMap(page).textContent()}`;
  fs.writeFileSync(path.join(EVIDENCE_DIR, "r6v2-01-db.txt"), db, "utf8");
});

test("R6V2-02 : MAP sans notification écrite ni inspection → refus serveur (art. 30-3-b/c)", async ({ page }) => {
  test.setTimeout(480_000);
  resetDonneesR6Cycle();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await login(page);
  await ouvrirFiche(page, R6_960);

  await creerMap(page, "3", false);
  await expect(page.locator('[data-sonner-toaster]').getByText(/Notification écrite obligatoire/)).toBeVisible({ timeout: 60_000 });
  const count = await PSQL("SELECT COUNT(*) FROM employee_situations WHERE employee_id=960;");
  expect(count).toBe("0");
  await capture(page, "r6v2-02-refus-garde-fous");
  fs.writeFileSync(path.join(EVIDENCE_DIR, "r6v2-02-db.txt"), `situations=${count}\ntoast=${await page.locator("[data-sonner-toaster]").textContent()}`, "utf8");
});

test("R6V2-03 : workflow Soumettre → Approuver → Activer (statut dérivé suspendu) puis Terminer (actif)", async ({ page }) => {
  test.setTimeout(480_000);
  resetDonneesR6Cycle();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await login(page);
  await ouvrirFiche(page, R6_960);

  await creerMap(page, "3", true, "2026-06-10", true);
  await expect(page.locator('[data-sonner-toaster]').getByText("Situation enregistrée")).toBeVisible({ timeout: 60_000 });

  // Soumettre → Approuver → Activer
  let row = rowMap(page);
  await row.getByRole("button", { name: "Soumettre" }).click();
  await expect(row).toContainText("Soumis", { timeout: 60_000 });
  row = rowMap(page);
  await row.getByRole("button", { name: "Approuver" }).click();
  await expect(row).toContainText("Approuvé", { timeout: 60_000 });
  row = rowMap(page);
  await row.getByRole("button", { name: "Activer" }).click();
  await expect(row).toContainText("Actif", { timeout: 60_000 });
  await capture(page, "r6v2-03-active");

  // DB : situation ACTIF + statut dérivé « suspendu » (impactContrat=SUSPENDU)
  const db1 = await PSQL(`
    SELECT s.statut_workflow, e.statut
    FROM employee_situations s JOIN employes e ON e.id=s.employee_id
    WHERE s.employee_id=960 AND s.type='MISE_A_PIED';
  `);
  const [wf, st] = db1.split("|");
  expect(wf).toBe("ACTIF");
  expect(st).toBe("suspendu");

  // Header : badge dérivé « Suspendu »
  await page.reload();
  await expect(page.getByRole("tab", { name: "Cycle de vie" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Suspendu", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await capture(page, "r6v2-03-suspendu-badge");

  // Terminer → TERMINE + statut « actif »
  await page.getByRole("tab", { name: "Cycle de vie" }).click();
  await expect(page.getByText("Cycle de vie — situations RH")).toBeVisible({ timeout: 60_000 });
  row = rowMap(page);
  await row.getByRole("button", { name: "Terminer" }).click();
  const modal = page.locator(".fixed.inset-0.z-50").last();
  await modal.getByRole("button", { name: "Confirmer" }).click();
  await expect(row).toContainText("Terminé", { timeout: 60_000 });
  await page.reload();
  await expect(page.getByRole("tab", { name: "Cycle de vie" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Actif", { exact: true }).first()).toBeVisible({ timeout: 60_000 });

  const db2 = await PSQL(`
    SELECT s.statut_workflow, e.statut
    FROM employee_situations s JOIN employes e ON e.id=s.employee_id
    WHERE s.employee_id=960 AND s.type='MISE_A_PIED';
  `);
  const [wf2] = db2.split("|");
  expect(wf2).toBe("TERMINE");
  fs.writeFileSync(path.join(EVIDENCE_DIR, "r6v2-03-db.txt"), `apres_activation=${db1}\napres_terminaison res=${st}\n→ ${db2}`, "utf8");
});

test("R6V2-04 : deux situations suspensives simultanées → REFUS (conflit)", async ({ page }) => {
  test.setTimeout(480_000);
  resetDonneesR6Cycle();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await login(page);
  await ouvrirFiche(page, R6_960);

  await creerMap(page, "3", true, "2026-11-02", true);
  await expect(page.locator('[data-sonner-toaster]').getByText("Situation enregistrée")).toBeVisible({ timeout: 60_000 });
  let row = rowMap(page);
  await row.getByRole("button", { name: "Soumettre" }).click();
  row = rowMap(page);
  await row.getByRole("button", { name: "Approuver" }).click();
  row = rowMap(page);
  await row.getByRole("button", { name: "Activer" }).click();
  await expect(row).toContainText("Actif", { timeout: 60_000 });

  // Seconde MAP sur le même intervalle → REFUS (contrat déjà suspendu)
  await creerMap(page, "3");
  await expect(page.locator('[data-sonner-toaster]').getByText(/Deux situations suspensives/)).toBeVisible({ timeout: 60_000 });
  const count = await PSQL("SELECT COUNT(*) FROM employee_situations WHERE employee_id=960;");
  expect(count).toBe("1");
  await capture(page, "r6v2-04-conflit");
  fs.writeFileSync(path.join(EVIDENCE_DIR, "r6v2-04-db.txt"), `situations=${count}\ntoast=${await page.locator("[data-sonner-toaster]").textContent()}`, "utf8");
});

test("R6V2-05 : écriture dans une période de paie close → CONFLICT", async ({ page }) => {
  test.setTimeout(480_000);
  resetDonneesR6Cycle();
  // Période close de paie (novembre) : toute création sur l'intervalle est refusée
  PSQL(`INSERT INTO payroll_periods (id, agence_id, start_date, end_date, status, created_at)
        SELECT (SELECT COALESCE(MAX(p.id),0)+1 FROM payroll_periods p), 1, '2026-11-02', '2026-11-30', 'closed', now();`);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await login(page);
  await ouvrirFiche(page, R6_960);

  await creerMap(page, "3");
  await expect(page.locator('[data-sonner-toaster]').getByText(/période de paie du/)).toBeVisible({ timeout: 60_000 });
  const count = await PSQL("SELECT COUNT(*) FROM employee_situations WHERE employee_id=960;");
  expect(count).toBe("0");
  await capture(page, "r6v2-05-periode-close");
  fs.writeFileSync(path.join(EVIDENCE_DIR, "r6v2-05-db.txt"), `situations=${count}\ntoast=${await page.locator("[data-sonner-toaster]").textContent()}`, "utf8");
  PSQL(`DELETE FROM payroll_periods WHERE agence_id=1 AND start_date='2026-11-02' AND end_date='2026-11-30';`);
});

test("R6V2-06 : congé approuvé → situation CONGÉ ACTIF autogénérée (provenance leave_requests)", async ({ page }) => {
  test.setTimeout(480_000);
  resetDonneesR6Cycle();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await login(page);
  await page.goto("/dashboard/rh/absences", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  await page.locator("select").nth(0).selectOption("950");
  await page.locator("select").nth(1).selectOption({ index: 1 }); // Congé annuel (payé, déduit)
  await page.locator('input[type="date"]').nth(0).fill("2026-05-18");
  await page.locator('input[type="date"]').nth(1).fill("2026-05-22");
  await page.getByPlaceholder("Motif *").first().fill("Conge annuel test cycle vie");
  await page.getByRole("button", { name: /Envoyer la demande/ }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Demande envoyée/)).toBeVisible({ timeout: 60_000 });

  const rowConge = page.locator("table tbody tr", { hasText: "2026-05-18" }).last();
  await rowConge.getByRole("button", { name: "Approuver" }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Décision enregistrée/)).toBeVisible({ timeout: 60_000 });
  await capture(page, "r6v2-06-conge-approuve");

  // R6 V2 : la situation CONGÉ ACTIF a été générée à partir de la demande approuvée
  const sit = PSQL(`
    SELECT category, statut_workflow, provenance_table, provenance_id IS NOT NULL, date_debut, date_fin
    FROM employee_situations WHERE employee_id=950 AND category='CONGE' ORDER BY id DESC LIMIT 1;
  `);
  const [cat, wf, prov, hasId, db, df] = sit.split("|");
  expect(cat).toBe("CONGE");
  expect(wf).toBe("ACTIF");
  expect(prov).toBe("leave_requests");
  expect(hasId).toBe("t");
  expect(db).toBe("2026-05-18");
  expect(df).toBe("2026-05-22");
  await capture(page, "r6v2-06-situation-vue");
  fs.writeFileSync(path.join(EVIDENCE_DIR, "r6v2-06-db.txt"), `situation=${sit}\n`, "utf8");
});

test("R6V2-07 : sortie → situation SORTIE ACTIF ; réembauche → TERMINE, statut actif", async ({ page }) => {
  test.setTimeout(480_000);
  resetDonneesR6Cycle();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await login(page);
  await ouvrirFiche(page, R6_950);

  // Sortie via le modal dédié
  await page.getByRole("button", { name: "Sortir" }).click();
  const modalSortie = page.locator(".fixed.inset-0.z-50").last();
  await modalSortie.locator("select").first().selectOption("demission");
  await modalSortie.locator('input[type="date"]').fill("2026-12-01");
  await modalSortie.getByRole("button", { name: "Valider la sortie" }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Employé sorti/)).toBeVisible({ timeout: 60_000 });

  const apresSortie = PSQL(`
    SELECT s.statut_workflow, e.statut
    FROM employee_situations s JOIN employes e ON e.id=s.employee_id
    WHERE s.employee_id=950 AND s.category='SORTIE';
  `);
  const [wf1, st1] = apresSortie.split("|");
  expect(wf1).toBe("ACTIF");
  expect(st1).toBe("sorti");
  await capture(page, "r6v2-07-sorti");

  // Réembauche → la situation SORTIE se referme (TERMINE), statut redevient actif
  await page.reload();
  await expect(page.getByRole("button", { name: "Réembaucher" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Réembaucher" }).click();
  const modalReemb = page.locator(".fixed.inset-0.z-50").last();
  await modalReemb.locator('input[type="date"]').fill("2026-12-10");
  await modalReemb.getByRole("button", { name: "Valider la réembauche" }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/réembauché/i)).toBeVisible({ timeout: 60_000 });

  const apresReemb = PSQL(`
    SELECT s.statut_workflow, e.statut, e.motif_sortie
    FROM employee_situations s JOIN employes e ON e.id=s.employee_id
    WHERE s.employee_id=950 AND s.category='SORTIE';
  `);
  const [wf2, st2, motif] = apresReemb.split("|");
  expect(wf2).toBe("TERMINE");
  expect(st2).toBe("actif");
  expect(motif).toBe("demission"); // trace de sortie conservée
  await capture(page, "r6v2-07-reembauche");
  fs.writeFileSync(path.join(EVIDENCE_DIR, "r6v2-07-db.txt"), `apres_sortie=${apresSortie}\napres_reembauche=${apresReemb}\n`, "utf8");
});

test("R6V2-08 : sans rh.situation.modifier → lecture seule (pas de bouton de création ni d'actions)", async ({ page }) => {
  test.setTimeout(480_000);
  resetDonneesR6Cycle();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await login(page, "rh@gpj.cm", "admin123");
  await ouvrirFiche(page, R6_960);

  // Profil rh : writable par défaut → le bouton est visible
  await expect(panel(page).getByRole("button", { name: "Nouvelle situation" })).toBeVisible({ timeout: 60_000 });

  // Retrait de la permission (simulation RBAC serveur) → rechargement → lecture seule
  PSQL(`DELETE FROM role_permissions WHERE role_id=(SELECT id FROM roles WHERE code='rh')
        AND permission_id=(SELECT id FROM permissions WHERE code='rh.situation.modifier');`);
  try {
    await page.reload();
    await expect(page.getByRole("tab", { name: "Cycle de vie" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("tab", { name: "Cycle de vie" }).click();
    await expect(page.getByText("Cycle de vie — situations RH")).toBeVisible({ timeout: 60_000 });
    await expect(panel(page).getByRole("button", { name: "Nouvelle situation" })).toHaveCount(0);
    await expect(panel(page).getByText("Le cycle de vie de cet employé est vide.")).toBeVisible({ timeout: 60_000 });
    await capture(page, "r6v2-08-lecture-seule");
  } finally {
    // Restauration (toujours exécutée, même en cas d'échec d'assertion)
    PSQL(`INSERT INTO role_permissions (role_id, permission_id)
          SELECT r.id, p.id FROM roles r, permissions p
          WHERE r.code='rh' AND p.code='rh.situation.modifier'
            AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id);`);
  }
});