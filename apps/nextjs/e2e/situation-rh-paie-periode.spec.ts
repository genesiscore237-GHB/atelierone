import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { psqlSituation, resetSituationRH, SIT_PERIOD } from "./situation-rh-paie-reset";

const EVIDENCE_DIR = path.resolve(process.cwd(), "../../audit/situation-rh/fonctionnels");

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

/** Ouvre la page situation, pose la période et lance l'analyse (état par défaut : jeu complet). */
async function ouvrirSituation(page: Page, from: string = SIT_PERIOD.from, to: string = SIT_PERIOD.to) {
  // Dev server : le premier chargement de la route déclenche une compilation Next → goto
  // peut être avorté (ERR_ABORTED). On réessaie.
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto("/dashboard/rh/situation", { waitUntil: "domcontentloaded", timeout: 120_000 });
      break;
    } catch {
      await page.waitForTimeout(1500);
      if (i === 2) throw new Error("Page situation injoignable après 3 essais");
    }
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.getByRole("heading", { name: /Situation RH/ })).toBeVisible({ timeout: 60_000 });
  await page.locator("#sit-from").fill(from);
  await page.locator("#sit-to").fill(to);
}

async function analyser(page: Page) {
  await page.getByRole("button", { name: "Analyser" }).click();
  await expect(page.locator(".animate-pulse").first()).toBeHidden({ timeout: 120_000 }).catch(() => {});
}

/** Restreint le jeu au périmètre TERRAIN : 4 fixtures GPJ-SIT (déterministe pour toutes les assertions). */
async function jeuTerrain(page: Page) {
  await analyser(page);
  await page.locator("#sit-search").fill("GPJ-SIT");
  await analyser(page);
  await expect(page.locator("table tbody tr")).toHaveCount(4, { timeout: 60_000 });
}

const trackLogs = (page: Page, logs: string[]) => {
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`[console:${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("requestfailed", (r) => logs.push(`[requestfailed] ${r.method()} ${r.url()} :: ${r.failure()?.errorText ?? "?"}`));
};

// ── Intégrité : aucune écriture déclenchée par la consultation (SIT-10) ──
let fingerprintAvant = "";
function fingerprintDB(): string {
  return psqlSituation(`
    SELECT (SELECT COUNT(*) FROM payroll_entries)::text || '|' ||
           (SELECT COUNT(*) FROM employee_advances)::text || '|' ||
           (SELECT COUNT(*) FROM advance_transitions)::text || '|' ||
           (SELECT COUNT(*) FROM attendance_entries)::text || '|' ||
           (SELECT COUNT(*) FROM payroll_periods)::text;
  `);
}

test.describe("Situation RH & Paie — fonctionnels (période TERRAIN)", () => {
  test.beforeAll(() => {
    resetSituationRH();
    fingerprintAvant = fingerprintDB();
  });

  test.afterAll(() => {
    const fingerprintApres = fingerprintDB();
    const ok = fingerprintAvant === fingerprintApres;
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(EVIDENCE_DIR, "sit-10-integrity.txt"),
      `avant=${fingerprintAvant}\napres=${fingerprintApres}\nintegrity=${ok ? "OK (aucune écriture)" : "KO (écritures détectées)"}`,
      "utf8"
    );
    expect(ok, "SIT-10 : la simple consultation ne doit créer aucune écriture DB").toBe(true);
  });

  // ── SIT-01 : jeu TERRAIN → cartes = somme lignes + badge période en cours ──
  test("SIT-01 : cartes d'agrégation égales aux 4 fixtures + badge période en cours", async ({ page }) => {
    test.setTimeout(300_000);
    resetSituationRH();
    const logs: string[] = [];
    trackLogs(page, logs);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page);
    await ouvrirSituation(page);
    await jeuTerrain(page);

    await expect(page.getByText("Période en cours", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Employés", { exact: true }).first()).toBeVisible();

    const cartes = await page.locator("div.grid.gap-3").first().textContent();
    // Sommes sur les 4 fixtures : théoriques 95 (804 proratisé 17 j sur sa sortie),
    // présence 78, absence 17 (803 11→30), anomalies 6 (2×803 + 2×804 + 2×802).
    expect(cartes ?? "").toContain("Jours théoriques95");
    expect(cartes ?? "").toContain("Jours présence78");
    expect(cartes ?? "").toContain("Jours absence17");
    expect(cartes ?? "").toContain("Anomalies6");
    await capture(page, "sit-01-cartes");
    fs.writeFileSync(path.join(EVIDENCE_DIR, "sit-01-logs.txt"), logs.join("\n"), "utf8");
  });

  // ── SIT-02 : recherche serveur + écrémage + empty state ──
  test("SIT-02 : recherche multi-critères et état vide", async ({ page }) => {
    test.setTimeout(300_000);
    resetSituationRH();
    const logs: string[] = [];
    trackLogs(page, logs);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page);
    await ouvrirSituation(page);
    await jeuTerrain(page);

    await page.locator("#sit-search").fill("GPJ-SIT-803");
    await analyser(page);
    await expect(page.locator("table tbody tr")).toHaveCount(1, { timeout: 60_000 });
    await expect(page.locator("table tbody tr").first()).toContainText("GPJ-SIT-803");

    await page.locator("#sit-search").fill("zzz-inexistant");
    await analyser(page);
    await expect(page.getByText("Aucune donnée sur la période")).toBeVisible({ timeout: 60_000 });
    await capture(page, "sit-02-vide");

    await page.getByRole("button", { name: "Réinitialiser" }).click();
    await expect(page.getByText("Analyse non lancée")).toBeVisible({ timeout: 30_000 });
    fs.writeFileSync(path.join(EVIDENCE_DIR, "sit-02-logs.txt"), logs.join("\n"), "utf8");
  });

  // ── SIT-03 : 30 cellules, 26 jours théoriques, jour courant marqué EN COURS ──
  test("SIT-03 : fixture 801, 30 cellules — unique marque EN COURS sur le jour courant", async ({ page }) => {
    test.setTimeout(300_000);
    resetSituationRH();
    const logs: string[] = [];
    trackLogs(page, logs);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page);
    await ouvrirSituation(page);
    await jeuTerrain(page);

    await page.locator("table tbody tr", { hasText: "GPJ-SIT-801" }).first().click();
    await expect(page.getByText("Présence sur la période")).toBeVisible({ timeout: 60_000 });

    const cellules = page.locator("[title^='2026-09-']");
    await expect(cellules).toHaveCount(30, { timeout: 60_000 });
    // Le jour courant porte TOUJOURS la marque PROVISOIRE/EN COURS (exigence §I),
    // même pointé avec time_out ; les 29 autres cellules sont définitives.
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    await expect(page.getByText("EN COURS", { exact: true })).toHaveCount(1);
    await expect(page.locator(`[title^='${today}']`)).toBeVisible();
    await expect(page.locator(`[title^='${today}']`)).toContainText("EN COURS");
    await expect(page.getByText("Jours théoriques26")).toBeVisible();
    await capture(page, "sit-03-timeline");
    fs.writeFileSync(path.join(EVIDENCE_DIR, "sit-03-logs.txt"), logs.join("\n"), "utf8");
  });

  // ── SIT-04 : 4 indicateurs d'avance distincts (802) ──
  test("SIT-04 : volet 802 — avancé 150 000 / récupéré 30 000 / solde fin 120 000", async ({ page }) => {
    test.setTimeout(300_000);
    resetSituationRH();
    const logs: string[] = [];
    trackLogs(page, logs);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page);
    await ouvrirSituation(page);
    await jeuTerrain(page);

    await page.locator("table tbody tr", { hasText: "GPJ-SIT-802" }).first().click();
    await expect(page.getByText("Avances & récupérations")).toBeVisible({ timeout: 60_000 });

    await expect(page.getByText("Avancé sur période", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("150 000 F", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Récupéré sur période", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("30 000 F", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Solde fin de période", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Solde actuel", { exact: true }).first()).toBeVisible();
    // solde fin = solde actuel = 120 000 (récupération post-période non comptée dans le solde fin)
    await expect(page.getByText("Solde fin de période120 000 F")).toBeVisible();
    await expect(page.getByText("Solde actuel120 000 F")).toBeVisible();

    await expect(page.getByText("Journal de période")).toBeVisible();
    await expect(page.getByText(/Versement avance #/).first()).toBeVisible();
    await expect(page.getByText(/Récupération avance #/).first()).toBeVisible();
    await capture(page, "sit-04-avances");
    fs.writeFileSync(path.join(EVIDENCE_DIR, "sit-04-logs.txt"), logs.join("\n"), "utf8");
  });

  // ── SIT-05 : net reconstruit + origine + segmentation salariale (801) ──
  test("SIT-05 : volet 801 — base 225 000 F, net ESTIME, bannière multi-segment", async ({ page }) => {
    test.setTimeout(300_000);
    resetSituationRH();
    const logs: string[] = [];
    trackLogs(page, logs);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page);
    await ouvrirSituation(page);
    await jeuTerrain(page);

    await page.locator("table tbody tr", { hasText: "GPJ-SIT-801" }).first().click();
    await expect(page.getByText("Net reconstruit")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Base contractuelle", { exact: true })).toBeVisible();
    await expect(page.getByText("225 000 F", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("ESTIME", { exact: true }).first()).toBeVisible();

    await expect(page.getByText(/Changement de rémunération en cours de période/)).toBeVisible();
    await expect(page.getByText(/2026-09-01 → 2026-09-15/)).toBeVisible();
    await expect(page.getByText(/2026-09-16 → 2026-09-30/)).toBeVisible();
    await capture(page, "sit-05-net");
    fs.writeFileSync(path.join(EVIDENCE_DIR, "sit-05-logs.txt"), logs.join("\n"), "utf8");
  });

  // ── SIT-06 : libellés statut / parcours (804 sorti) ──
  test("SIT-06 : volet 804 — statut Sorti + parcours contrat", async ({ page }) => {
    test.setTimeout(300_000);
    resetSituationRH();
    const logs: string[] = [];
    trackLogs(page, logs);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page);
    await ouvrirSituation(page);
    await jeuTerrain(page);

    await page.locator("table tbody tr", { hasText: "GPJ-SIT-804" }).first().click();
    await expect(page.getByText("Sorti", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Parcours", { exact: true })).toBeVisible();
    await expect(page.getByText("Sortie", { exact: true })).toBeVisible();
    await capture(page, "sit-06-statut");
    fs.writeFileSync(path.join(EVIDENCE_DIR, "sit-06-logs.txt"), logs.join("\n"), "utf8");
  });

  // ── SIT-07 : permissions SANS rh.salaire.consulter → aucun montant (table + volet) ──
  test("SIT-07 : rôle rh sans rh.salaire.consulter — salaires/avances masqués", async ({ page, browser }) => {
    test.setTimeout(400_000);
    resetSituationRH();
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:3000";
    psqlSituation(`
      DELETE FROM role_permissions
      WHERE role_id=(SELECT id FROM roles WHERE code='rh')
        AND permission_id=(SELECT id FROM permissions WHERE code='rh.salaire.consulter');
    `);

    try {
      // Contexte 1 : admin → montants visibles sur le jeu TERRAIN
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await login(page);
      await ouvrirSituation(page);
      await jeuTerrain(page);
      await expect(page.getByText("150 000 F", { exact: true }).first()).toBeVisible();
      await capture(page, "sit-07-admin");

      // Contexte 2 : rh sans permission → aucun montant n'apparaît nulle part
      const ctx = await browser.newContext({ baseURL });
      const pageRh = await ctx.newPage();
      await login(pageRh, "rh@gpj.cm");
      await ouvrirSituation(pageRh);
      await jeuTerrain(pageRh);

      const bodyRh = await pageRh.locator("body").textContent();
      for (const m of ["225 000", "150 000", "30 000", "120 000"]) {
        expect(bodyRh ?? "", `montant ${m} masqué pour rh sans permission`).not.toContain(m);
      }

      // Volet 802 : la section avances est entièrement absente (masquage serveur repris à l'UI)
      await pageRh.locator("table tbody tr", { hasText: "GPJ-SIT-802" }).first().click();
      await expect(pageRh.getByText("Présence sur la période")).toBeVisible({ timeout: 30_000 });
      await expect(pageRh.getByText("Avances & récupérations")).toHaveCount(0);
      await expect(pageRh.getByText("Net reconstruit")).toHaveCount(0);
      await capture(pageRh, "sit-07-masque");
      await ctx.close();
    } finally {
      psqlSituation(`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r, permissions p
        WHERE r.code='rh' AND p.code='rh.salaire.consulter'
          AND NOT EXISTS (SELECT 1 FROM role_permissions x WHERE x.role_id=r.id AND x.permission_id=p.id);
      `);
    }
  });

  // ── SIT-08 : tri serveur (absences desc → 803 en tête ; nom asc → 802) ──
  test("SIT-08 : tri serveur par absences décroissantes puis nom croissant", async ({ page }) => {
    test.setTimeout(300_000);
    resetSituationRH();
    const logs: string[] = [];
    trackLogs(page, logs);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page);
    await ouvrirSituation(page);
    await jeuTerrain(page);

    await page.getByRole("button", { name: /Absences/ }).click();
    await expect(page.locator("table tbody tr").first()).toContainText("GPJ-SIT-803", { timeout: 60_000 });
    // égalité à 0 absence → ordre stable initial (801 Salou → 802 Mballet → 804 Etoa)
    await expect(page.locator("table tbody tr").last()).toContainText("GPJ-SIT-804");

    await page.getByRole("button", { name: /Employé/ }).first().click();
    // tri nom asc (locale fr sur « nom prénom ») : 804 Etoa en tête, 801 Salou en queue
    await expect(page.locator("table tbody tr").first()).toContainText("GPJ-SIT-804", { timeout: 60_000 });
    await expect(page.locator("table tbody tr").last()).toContainText("GPJ-SIT-801");
    await capture(page, "sit-08-tri");
    fs.writeFileSync(path.join(EVIDENCE_DIR, "sit-08-logs.txt"), logs.join("\n"), "utf8");
  });

  // ── SIT-11 : période multi-mois MIXTE (15/07 → 20/09) ──
  test("SIT-11 : période traversant clôtures — badge mixte + chips Juillet/Août/Sept", async ({ page }) => {
    test.setTimeout(300_000);
    resetSituationRH();
    const logs: string[] = [];
    trackLogs(page, logs);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page);
    await ouvrirSituation(page, "2026-07-15", "2026-09-20");
    await jeuTerrain(page);

    // P3 (août) ne couvre pas le mois civil complet → LATÉRAL mixte prend juillet clôturé.
    await expect(page.getByText(/Période mixte/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Juillet/).first()).toBeVisible();
    await expect(page.getByText(/Août/).first()).toBeVisible();
    await expect(page.getByText(/Sept/).first()).toBeVisible();
    await expect(page.getByText(/clôturé/).first()).toBeVisible();
    await capture(page, "sit-11-mixte");
    fs.writeFileSync(path.join(EVIDENCE_DIR, "sit-11-logs.txt"), logs.join("\n"), "utf8");
  });

  // ── SIT-12 : garde période inversée + export CSV ──
  test("SIT-12 : période inversée refusée, export CSV téléchargeable", async ({ page }) => {
    test.setTimeout(300_000);
    resetSituationRH();
    const logs: string[] = [];
    trackLogs(page, logs);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page);
    await ouvrirSituation(page);
    await jeuTerrain(page);

    // Période inversée → refus explicite via toast (garde moteur + UI)
    await page.locator("#sit-from").fill("2026-09-30");
    await page.locator("#sit-to").fill("2026-09-01");
    await analyser(page);
    await expect(page.locator('[data-sonner-toaster]').getByText(/Période inversée/)).toBeVisible({ timeout: 30_000 });
    await capture(page, "sit-12-inverse");

    // Export CSV (admin) : téléchargement déclenché pour la période commutée
    const downloadP = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: "Exporter CSV" }).click();
    const dl = await downloadP;
    expect(dl.suggestedFilename()).toContain("situation-rh-");
    fs.writeFileSync(path.join(EVIDENCE_DIR, "sit-12-logs.txt"), logs.join("\n"), "utf8");
  });
});

// Référence documentaire (plan Conception §O) :
// - SIT-03 journée en cours (trio finalisé/en cours/projeté + badge PROVISOIRE) :
//   couvert par rh-posture (unitaires) + contrôle positif E2E SIT-03 (EN COURS restreint au jour courant).
// - SIT-07 incluant l'export : les gardes de l'export couvrent déjà la permission
//   rh.presence.consulter + masquage (tests de terrain).
// - SIT-09 non-régression : suites R3/R4/R5/R6 exécutées séparément (étape 13).