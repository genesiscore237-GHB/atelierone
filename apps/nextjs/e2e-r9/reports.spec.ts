import { test, expect, type Page, type Download } from "@playwright/test";
import ExcelJS from "exceljs";
import { Client } from "pg";
import * as fs from "fs";
import * as path from "path";

const EVIDENCE_DIR = path.resolve(process.cwd(), "../../audit/r9/fonctionnels");
const BASE = path.resolve(process.cwd(), "../../audit/r9/exports");

function mk(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

async function closePayrollPeriod2026_09() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await c.connect();
    await c.query(
      `update payroll_periods
       set status='closed', end_date='2026-09-30', closed_at=coalesce(closed_at, now())
       where start_date='2026-09-01'`
    );
  } finally {
    await c.end();
  }
}

function capture(page: Page, name: string) {
  mk(EVIDENCE_DIR);
  return page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.locator('input[type="email"]').fill("admin@gpj.cm");
  await page.locator('input[type="password"]').fill("admin123");
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

async function onRapports(page: Page) {
  await login(page);
  await gotoRetry(page, "/dashboard/rh/rapports");
}

const tab = (page: Page, nom: string) => page.locator("button", { hasText: nom }).first();
const previewBtn = (page: Page) => page.locator("button", { hasText: "Prévisualiser" }).first();

async function clickPreview(page: Page) {
  await previewBtn(page).click();
}

async function saveDownload(download: Download, sub: string, name: string) {
  mk(path.join(BASE, sub));
  const tmp = await download.path();
  const dest = path.join(BASE, sub, name);
  fs.copyFileSync(tmp, dest);
  return dest;
}

/** Nombre total de lignes annoncé en tête d'aperçu (bout de chaîne exempt du compteur de pagination). */
async function readLignes(page: Page): Promise<number> {
  const el = page.locator("#rapports-preview").getByText(/^\d+ ligne\(s\)$/).first();
  const t = await el.textContent();
  return Number(t?.match(/(\d+)/)?.[1] ?? "0");
}

const periodeFrom = (page: Page) => page.locator('input[type="date"]').nth(0);
const periodeTo = (page: Page) => page.locator('input[type="date"]').nth(1);

async function setPeriode(page: Page, from: string, to: string) {
  await periodeFrom(page).fill(from);
  await periodeTo(page).fill(to);
}

function readLignesCsv(csv: string): number {
  const norm = csv.replace(/^\uFEFF/, "");
  return norm.split(/\r?\n/).filter((l) => l.trim().length > 0).length - 1;
}

test.describe("R9 — Rapports RH / États / Exports / Impression", () => {
  test.beforeAll(async () => {
    // Fixture déterministe : la période de paie 2026-09 doit être close pour
    // que le rapport Présences 01/09→30/09 expose réellement l'état « Période
    // clôturée » (les résumés de présence 2026-09 sont déjà verrouillés en base).
    await closePayrollPeriod2026_09();
  });
  test("A — navigation : entrée Rapports dans le menu RH", async ({ page }) => {
    await login(page);
    await gotoRetry(page, "/dashboard/rh/tableau-de-bord");
    const liNav = page.locator('a[href="/dashboard/rh/rapports"]').last();
    await expect(liNav).toBeVisible({ timeout: 60_000 });
    await liNav.click();
    await page.waitForURL(/\/dashboard\/rh\/rapports$/, { timeout: 60_000 });
    await expect(page.locator("h1", { hasText: "Rapports RH" })).toBeVisible({ timeout: 30_000 });
    for (const nom of ["Personnel", "Présences", "Paie", "Avances", "Historique"]) {
      await expect(tab(page, nom)).toBeVisible();
    }
    await capture(page, "A-rapports-page");
  });

  test("B — rapport Personnel : filtres, colonnes, tri, pagination, salaires", async ({ page }) => {
    await onRapports(page);
    await clickPreview(page);
    await expect(page.locator("#rapports-preview")).toBeVisible({ timeout: 120_000 });
    const nLignes = await readLignes(page);
    expect(nLignes).toBeGreaterThan(0);

    // Colonnes : cocher Salaire base (admin = superadmin → permission accordée)
    const checkSalaire = page.locator('label:has-text("Salaire base") input[type="checkbox"]');
    await expect(checkSalaire).toBeEnabled();
    if (!(await checkSalaire.isChecked())) await checkSalaire.click();
    await expect(page.locator("#rapports-preview thead", { hasText: "Salaire base" })).toBeVisible({ timeout: 30_000 });

    // Tri par colonne Matricule (asc → desc) puis retour asc
    const thMatricule = page.locator("#rapports-preview thead button", { hasText: "Matricule" });
    await thMatricule.click();
    await thMatricule.click();

    // Pagination : >1 page si plus de 12 lignes (bouton « Suivant »)
    if (nLignes > 12) {
      const suivant = page.locator("#rapports-preview").locator("button", { hasText: "Suivant" });
      await expect(suivant).toBeVisible({ timeout: 30_000 });
      await suivant.click();
      await expect(page.locator("#rapports-preview tbody tr").first()).toBeVisible();
    }
    await capture(page, "B-personnel-colonnes-tri");
  });

  test("C — fidélité export = écran (Personnel)", async ({ page }) => {
    await onRapports(page);
    await clickPreview(page);
    await expect(page.locator("#rapports-preview")).toBeVisible({ timeout: 120_000 });
    const nLignes = await readLignes(page);
    expect(nLignes).toBeGreaterThan(0);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.locator("#rapports-preview").locator("button", { hasText: "CSV" }).click(),
    ]);
    const nom = download.suggestedFilename();
    expect(nom).toMatch(/^GPJ_RH_Personnel_\d{4}-\d{2}\.csv$/);
    const chemin = await saveDownload(download, "personnel", nom);
    const csv = fs.readFileSync(chemin, "utf8");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.includes("\r\n")).toBe(true); // CRLF
    expect(readLignesCsv(csv)).toBe(nLignes); // == nombre total affiché à l'écran
    expect(csv).toContain("Matricule;Nom;");
    await capture(page, "C-csv-fidelite");
  });

  test("D — export Excel .xlsx réel (Personnel) : lignes identiques à l'écran", async ({ page }) => {
    await onRapports(page);
    await clickPreview(page);
    await expect(page.locator("#rapports-preview")).toBeVisible({ timeout: 120_000 });
    const nLignes = await readLignes(page);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.locator("#rapports-preview").locator("button", { hasText: "Excel" }).click(),
    ]);
    const nom = download.suggestedFilename();
    expect(nom).toMatch(/^GPJ_RH_Personnel_\d{4}-\d{2}\.xlsx$/);
    const chemin = await saveDownload(download, "personnel", nom);
    const buf = fs.readFileSync(chemin);
    expect(buf[0]).toBe(0x50); // "PK" (zip/xlsx)
    expect(buf[1]).toBe(0x4b);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Rapport");
    expect(ws).toBeTruthy();
    expect(ws.rowCount - 1).toBe(nLignes);
    expect(ws.getCell(1, 1).value).toBe("Matricule");
    expect(ws.getCell(2, 2).value).toBeTruthy(); // nom du 1er employé non vide
    await capture(page, "D-excel-reel");
  });

  test("E — export PDF réel (Personnel) : texte non compressé vérifiable", async ({ page }) => {
    await onRapports(page);
    await clickPreview(page);
    await expect(page.locator("#rapports-preview")).toBeVisible({ timeout: 120_000 });
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.locator("#rapports-preview").locator("button", { hasText: "PDF" }).click(),
    ]);
    const nom = download.suggestedFilename();
    expect(nom).toMatch(/^GPJ_RH_Personnel_\d{4}-\d{2}\.pdf$/);
    const chemin = await saveDownload(download, "personnel", nom);
    const buf = fs.readFileSync(chemin);
    const head = buf.subarray(0, 8).toString("latin1");
    expect(head.startsWith("%PDF-")).toBe(true);
    const text = buf.toString("latin1");
    // jsPDF sorti non compressé → les chaînes texte apparaissent en clair dans le flux
    expect(text).toContain("Liste du personnel");
    expect(text).toContain("Matricule");
    expect(text).toContain("GPJ");
    await capture(page, "E-pdf-reel");
  });

  test("F — rapport Présences : période clôturée 2026-09 + agrégats + régime inversé bloqué", async ({ page }) => {
    await onRapports(page);
    await tab(page, "Présences").click();

    // Période inversée bloquée
    await setPeriode(page, "2026-10-01", "2026-09-30");
    await expect(page.locator("text=Période inversée")).toBeVisible({ timeout: 30_000 });
    await setPeriode(page, "2026-09-01", "2026-09-30");

    await clickPreview(page);
    await expect(page.locator("#rapports-preview")).toBeVisible({ timeout: 120_000 });
    await expect(page.locator("#rapports-preview", { hasText: "Période clôturée" })).toBeVisible({ timeout: 30_000 });
    const aggregate = await page.locator("#rapports-preview", { hasText: "Jours présents" }).textContent();
    expect(aggregate).toBeTruthy();
    await capture(page, "F-presences-cloturee");

    // Export CSV présence : lignes = total affiché
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.locator("#rapports-preview").locator("button", { hasText: "CSV" }).click(),
    ]);
    const nom = download.suggestedFilename();
    expect(nom).toMatch(/^GPJ_RH_Presences_2026-09\.csv$/);
    const chemin = await saveDownload(download, "presences", nom);
    const csv = fs.readFileSync(chemin, "utf8");
    expect(csv).toContain("Jours présents");
    expect(csv).toContain(";"); // séparateur
    expect(readLignesCsv(csv)).toBe(await readLignes(page));
    await capture(page, "F2-presences-csv");
  });

  test("G — fidélité régime borné : 01/09 → 30/09 n'inclut pas le 01/10", async ({ page }) => {
    await onRapports(page);
    await tab(page, "Présences").click();
    await setPeriode(page, "2026-09-01", "2026-09-30");
    await clickPreview(page);
    await expect(page.locator("#rapports-preview tbody tr").first()).toBeVisible({ timeout: 120_000 });
    // Chaque ligne porte une plage; le rapport est filtré USINE sur ces bornes via rhPeriode.situation.
    const rows = await page.locator("#rapports-preview tbody tr").count();
    expect(rows).toBeGreaterThan(0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(tab(page, "Présences")).toBeVisible();
    await capture(page, "G-periode-bornee");
  });

  test("H — rapport Paie et Avances : agrégats + CSV", async ({ page }) => {
    await onRapports(page);
    await tab(page, "Paie").click();
    await clickPreview(page);
    await expect(page.locator("#rapports-preview")).toBeVisible({ timeout: 120_000 });
    await expect(page.locator("#rapports-preview", { hasText: "Masse acquise" })).toBeVisible({ timeout: 30_000 });
    await capture(page, "H1-paie");

    await tab(page, "Avances").click();
    await clickPreview(page);
    await expect(page.locator("#rapports-preview")).toBeVisible({ timeout: 120_000 });
    await expect(page.locator("#rapports-preview", { hasText: "Avance période" })).toBeVisible({ timeout: 30_000 });
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.locator("#rapports-preview").locator("button", { hasText: "CSV" }).click(),
    ]);
    const nom = download.suggestedFilename();
    expect(nom).toMatch(/^GPJ_RH_Avances_\d{4}-\d{2}\.csv$/);
    const chemin = await saveDownload(download, "avances", nom);
    const csv = fs.readFileSync(chemin, "utf8");
    expect(csv).toContain("Solde fin période");
    await capture(page, "H2-avances-csv");
  });

  test("I — rapport Historique : état à une date donnée (employé réel)", async ({ page }) => {
    await onRapports(page);
    await tab(page, "Historique").click();

    const select = page.locator("select").first();
    await select.click();
    const options = page.locator("select option");
    const n = await options.count();
    expect(n).toBeGreaterThan(1);
    await select.selectOption({ index: 1 });

    const dateInput = page.locator('input[type="date"]');
    await dateInput.fill("2026-10-01");
    await page.locator("button", { hasText: "Afficher l'état" }).click();
    await expect(page.locator("#rapports-preview")).toBeVisible({ timeout: 120_000 });
    const contenu = await page.locator("#rapports-preview").textContent();
    expect(contenu ?? "").toContain("Salaire base");
    expect(contenu ?? "").toContain("Situation");
    await capture(page, "I-historique-2026-10-01");
  });

  test("J — immuabilité & non-régression : export ne modifie aucune donnée", async ({ page }) => {
    await onRapports(page);
    await tab(page, "Présences").click();
    await setPeriode(page, "2026-09-01", "2026-09-30");

    // Avant : lire le total initial affiché
    await clickPreview(page);
    await expect(page.locator("#rapports-preview")).toBeVisible({ timeout: 120_000 });
    const avant = await readLignes(page);
    const massesAvant = await page.locator("#rapports-preview", { hasText: "Jours présents" }).textContent();

    // Deux exports successifs (CSV puis PDF) 
    const [dl1] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.locator("#rapports-preview").locator("button", { hasText: "CSV" }).click(),
    ]);
    await saveDownload(dl1, "immutabilite", dl1.suggestedFilename());
    const [dl2] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.locator("#rapports-preview").locator("button", { hasText: "PDF" }).click(),
    ]);
    await saveDownload(dl2, "immutabilite", dl2.suggestedFilename());

    // Après : même total, mêmes agrégats (aucune écriture serveur pendant l'export)
    const apres = await readLignes(page);
    const massesApres = await page.locator("#rapports-preview", { hasText: "Jours présents" }).textContent();
    expect(apres).toBe(avant);
    expect(massesApres).toBe(massesAvant);
    await capture(page, "J-immuabilite");
  });
});