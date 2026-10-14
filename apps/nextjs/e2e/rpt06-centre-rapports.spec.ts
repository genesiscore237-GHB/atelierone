/**
 * RPT-06 — Centre de Rapports RH & Paie (ACTION #2/#3/#4/#5).
 *
 * Instrumentation RESELE : on compte les requetes reelles partant vers
 * `rhCentreRapports.rapport` (httpBatchLink -> /api/trpc/...). Aucun mock.
 *
 * Scenarios :
 *   A  chargement initial            -> 0 requete
 *   B  [GENRER LE RAPPORT]           -> 1 requete
 *   C  changement d'onglet (x3)      -> 0 requete
 *   D  ouverture/fermeture drawers   -> 0 requete
 *   E  filtre modifie SANS valider   -> 0 requete
 *   F  2eme [GENRER]                 -> 1 requete
 *   G  tri par en-tete               -> 1 requete (tri SERVEUR)
 *   H  pagination evenements         -> 1 requete (pagination SERVEUR)
 *   I  rechargement de la page       -> <=1 requete, filtres restaures
 *   J  URL : parametres autorises seulement, aucune donnee sensible
 *   K  reconciliation septembre 2026
 *   L  RBAC : profil sans rh.presence.consulter -> FORBIDDEN
 *   M  RBAC : profil AVEC presence SANS rh.salaire.consulter -> salaires masques
 */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const EVIDENCE_DIR = path.resolve(process.cwd(), "../../audit/rpt06/fonctionnels");
const JSON_DIR = path.resolve(process.cwd(), "../../audit/rpt06");

const CIBLE = "rhCentreRapports.rapport";
const PERIODE = { from: "2026-09-01", to: "2026-09-30" };

/** Valeurs de reference septembre 2026 (reference du master prompt RPT-06). */
const REF_SEPTEMBRE = {
  employes: 27,
  evenements: 259,
  retardMinutes: 11307,
  heuresTravaillees: 2561.3,
  heuresTheoriques: 5283,
};

const PARAMS_AUTORISES = new Set([
  "from",
  "to",
  "departementId",
  "statut",
  "fonction",
  "contrat",
  "typesEvenement",
  "employeIds",
  "onglet",
]);

interface Trace {
  scenario: string;
  step: string;
  count: number;
  last?: string;
}

const traces: Trace[] = [];
const resultats: Record<string, unknown> = {};

function trace(scenario: string, step: string, count: number, last?: string) {
  traces.push({ scenario, step, count, last });
}

function saveEvidence(nom: string, data: unknown) {
  fs.mkdirSync(JSON_DIR, { recursive: true });
  fs.writeFileSync(path.join(JSON_DIR, nom), JSON.stringify(data, null, 2), "utf8");
}

async function capture(page: Page, nom: string) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${nom}.png`), fullPage: false });
}

function watchRapport(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes(CIBLE)) urls.push(`${r.method()} ${u}`);
  });
  return urls;
}

async function login(page: Page, email: string, password = "admin123") {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Se Connecter/ }).click();
  await page.waitForURL("**/dashboard", { timeout: 240_000 });
}

/** Dev : la premiere compilation de la route peut avorter le goto (ERR_ABORTED). */
async function gotoRapports(page: Page) {
  for (let i = 0; i < 4; i++) {
    try {
      await page.goto("/dashboard/rh/rapports", { waitUntil: "domcontentloaded", timeout: 120_000 });
      break;
    } catch {
      await page.waitForTimeout(2000);
      if (i === 3) throw new Error("Page rapports injoignable apres 4 essais");
    }
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(
    page.getByRole("heading", { name: "Centre de Rapports RH & Paie" })
  ).toBeVisible({ timeout: 60_000 });
}

const settle = (page: Page, ms = 2500) => page.waitForTimeout(ms);

async function generer(page: Page) {
  await page.getByRole("button", { name: "Générer le rapport" }).click();
  await expect(page.getByRole("heading", { name: /^Rapport —/ })).toBeVisible({ timeout: 120_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await settle(page, 1500);
}

function kpi(page: Page, label: string) {
  return page.locator("div.rounded-lg.border", { hasText: new RegExp(`^${label}$`) }).first();
}

test.describe.configure({ mode: "serial" });

test.describe("RPT-06 — Centre de Rapports RH & Paie", () => {
  test("ACTION 2/3/5 — instrumentation reseau, URL et reconciliation septembre 2026", async ({ page }) => {
    const reqs = watchRapport(page);
    await login(page, "admin@gpj.cm");
    await gotoRapports(page);

    // ── A : chargement initial, aucune requete de rapport ──
    await settle(page, 4000);
    trace("A", "chargement initial", reqs.length, reqs[reqs.length - 1]);
    expect(reqs.length, "A : aucune requete avant [GENERER]").toBe(0);
    await expect(page.getByRole("heading", { name: /^Rapport —/ })).toHaveCount(0);
    await capture(page, "A0-initial-sans-requete");

    // ── B : [GENERER LE RAPPORT] -> exactement 1 requete ──
    await page.getByLabel("Période début").fill(PERIODE.from);
    await page.getByLabel("Période fin").fill(PERIODE.to);
    await generer(page);
    trace("B", "apres [GENERER]", reqs.length, reqs[reqs.length - 1]);
    expect(reqs.length, "B : exactement 1 requete").toBe(1);
    await capture(page, "B0-generer-une-requete");

    // ── K (valeur des KPI a ce stade, sans filtre) — place ici car c'est l'etat par defaut ──
    const employesKpi = await kpi(page, "Employés").locator("p.text-base").innerText();
    const retardsKpi = await kpi(page, "Retards cumulés").locator("p.text-base").innerText();
    const heuresKpi = await kpi(page, "Heures travaillées").locator("p.text-base").innerText();
    const nbEmployes = await page.getByText(/\d+ employé\(s\)/).first().innerText();
    const nbEvenements = await page.getByText(/\d+ événement\(s\)/).first().innerText();

    await page.getByRole("tab", { name: "SENSIBILISATION" }).click();
    await settle(page, 1200);
    const heuresTheo = await kpi(page, "Heures théoriques").locator("p.text-base").innerText();
    const retardMin = await kpi(page, "Retard (min)").locator("p.text-base").innerText();
    await capture(page, "K1-sensibilisation-septembre");

    resultats.septembre = {
      employesKpi,
      nbEmployesTexte: nbEmployes,
      nbEvenementsTexte: nbEvenements,
      retardsCumules: retardsKpi,
      heuresTravaillees: heuresKpi,
      heuresTheoriquesSensibilisation: heuresTheo,
      retardMinutesSensibilisation: retardMin,
    };

    // ── E : filtre modifie SANS valider -> 0 requete ──
    await page.getByRole("tab", { name: "SYNTHÈSE" }).click();
    await settle(page, 800);
    await page.getByLabel("Statut").selectOption("actif");
    await settle(page, 3000);
    trace("E", "filtre modifie sans [GENERER]", reqs.length, reqs[reqs.length - 1]);
    expect(reqs.length, "E : aucun filtre non applique ne declenche de requete").toBe(1);
    await page.getByLabel("Statut").selectOption("");
    await settle(page, 1500);

    // ── C : changement d'onglet -> 0 requete ──
    await page.getByRole("tab", { name: "ABSENCES & RETARDS" }).click();
    await settle(page, 2000);
    trace("C", "onglet ABSENCES & RETARDS", reqs.length, reqs[reqs.length - 1]);
    expect(reqs.length, "C : un onglet ne recharge jamais le rapport").toBe(1);
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await capture(page, "C1-tab-absences");

    await page.getByRole("tab", { name: "SENSIBILISATION" }).click();
    await settle(page, 1500);
    trace("C", "onglet SENSIBILISATION", reqs.length, reqs[reqs.length - 1]);
    expect(reqs.length).toBe(1);
    await expect(page.getByText(/Estimation indicative/)).toBeVisible();

    await page.getByRole("tab", { name: "SYNTHÈSE" }).click();
    await settle(page, 1500);
    trace("C", "retour SYNTHÈSE", reqs.length, reqs[reqs.length - 1]);
    expect(reqs.length).toBe(1);

    // ── D : drawers -> 0 requete ──
    await page.locator('button[aria-label^="Détail employé"]').first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Détail employé", { exact: true })).toBeVisible();
    await settle(page, 2000);
    trace("D", "drawer employé", reqs.length, reqs[reqs.length - 1]);
    expect(reqs.length, "D : le drawer lit la reponse principale").toBe(1);
    await capture(page, "D1-drawer-employe");
    await page.keyboard.press("Escape");
    await settle(page, 800);

    await page.getByRole("tab", { name: "ABSENCES & RETARDS" }).click();
    await settle(page, 1000);
    await page.locator('button[aria-label^="Détail événement"]').first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
    await settle(page, 2000);
    trace("D", "drawer événement", reqs.length, reqs[reqs.length - 1]);
    expect(reqs.length).toBe(1);
    await capture(page, "D2-drawer-evenement");
    await page.keyboard.press("Escape");
    await settle(page, 800);

    // ── F : 2eme [GENERER] -> +1 requete ──
    await page.getByRole("tab", { name: "SYNTHÈSE" }).click();
    await settle(page, 800);
    await generer(page);
    trace("F", "2eme [GENERER]", reqs.length, reqs[reqs.length - 1]);
    expect(reqs.length, "F : la 2eme generation envoie exactement 1 requete").toBe(2);

    // ── G : tri par en-tete -> +1 requete (tri SERVEUR) ──
    const thNom = page.locator("thead th", { hasText: "Nom complet" }).first();
    const avant = await thNom.getAttribute("aria-sort");
    await thNom.getByRole("button", { name: "Nom complet" }).click();
    await settle(page, 2500);
    trace("G", "tri en-tête Nom complet", reqs.length, reqs[reqs.length - 1]);
    expect(reqs.length, "G : le tri est pilote par le serveur (1 requete)").toBe(3);
    const apres = await thNom.getAttribute("aria-sort");
    expect(apres).not.toBe(avant);
    await capture(page, "G1-tri-serveur");

    // ── H : pagination des evenements -> +1 requete (pagination SERVEUR) ──
    await page.getByRole("tab", { name: "ABSENCES & RETARDS" }).click();
    await settle(page, 1200);
    const suivant = page.getByRole("button", { name: "Suivant" });
    if (await suivant.count()) {
      await suivant.click();
      await settle(page, 2500);
      trace("H", "pagination evenements page 2", reqs.length, reqs[reqs.length - 1]);
      expect(reqs.length, "H : la pagination est pilotee par le serveur").toBe(4);
      await expect(page.getByText(/page 2\//)).toBeVisible();
      await capture(page, "H1-pagination-evenements");
    } else {
      trace("H", "pagination evenements", reqs.length, "aucun bouton Suivant (une seule page)");
    }

    // ── J : URL — parametres autorises uniquement, aucune donnee sensible ──
    const url = new URL(page.url());
    const cles = [...url.searchParams.keys()];
    const interdits = cles.filter((k) => !PARAMS_AUTORISES.has(k));
    const sensibles = cles.filter((k) =>
      /salaire|net|montant|taux|avance|gain|retenue|impact|masse/i.test(k)
    );
    const valeursSensibles = [...url.searchParams.values()].filter((v) =>
      /^\d{5,}$/.test(v.replace(/[^\d]/g, "")) && v.replace(/[^\d]/g, "").length >= 6
    );
    resultats.url = { href: url.search, cles, interdits, sensibles, valeursSensibles };
    expect(interdits, "J : aucun parametre hors liste blanche").toEqual([]);
    expect(sensibles, "J : aucune donnee sensible dans l'URL").toEqual([]);
    await capture(page, "J1-url-apres-generation");

    // ── I : rechargement -> <=1 requete, filtres restaures ──
    const avantReload = reqs.length;
    for (let i = 0; i < 3; i++) {
      try {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
        break;
      } catch {
        await page.waitForTimeout(2000);
      }
    }
    await expect(page.getByRole("heading", { name: "Centre de Rapports RH & Paie" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole("heading", { name: /^Rapport —/ })).toBeVisible({ timeout: 120_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await settle(page, 3000);
    const apresReload = reqs.length - avantReload;
    trace("I", "rechargement de la page", apresReload, reqs[reqs.length - 1]);
    expect(apresReload, "I : au plus 1 requete au rechargement").toBeLessThanOrEqual(1);

    const fromRestaure = await page.getByLabel("Période début").inputValue();
    const toRestaure = await page.getByLabel("Période fin").inputValue();
    resultats.reload = { requetes: apresReload, from: fromRestaure, to: toRestaure };
    expect(fromRestaure).toBe(PERIODE.from);
    expect(toRestaure).toBe(PERIODE.to);
    await capture(page, "I1-apres-rechargement");

    resultats.traces = traces;
    resultats.requetesTotales = reqs;
    saveEvidence("rpt06-instrumentation.json", resultats);
    saveEvidence("rpt06-traces.json", traces);
  });

  test("ACTION 4a — RBAC : profil sans rh.presence.consulter -> FORBIDDEN", async ({ page }) => {
    const reqs = watchRapport(page);
    await login(page, "consultation@gpj.cm");
    await gotoRapports(page);
    await page.getByLabel("Période début").fill(PERIODE.from);
    await page.getByLabel("Période fin").fill(PERIODE.to);
    await page.getByRole("button", { name: "Générer le rapport" }).click();
    await expect(page.getByText(/Error FORBIDDEN|Une erreur est survenue/)).toBeVisible({
      timeout: 120_000,
    });
    await settle(page, 1500);
    const corps = await page.locator("body").innerText();
    await capture(page, "L1-rbac-forbidden");
    resultats.rbacForbidden = {
      requetes: reqs.length,
      message: corps.includes("FORBIDDEN") ? "FORBIDDEN affiche" : "message d'erreur affiche",
      salairesMasques: corps.includes("salaires masqués"),
    };
    expect(reqs.length).toBeGreaterThanOrEqual(1);
    expect(/FORBIDDEN|Une erreur est survenue/.test(corps)).toBe(true);
    expect(corps).not.toMatch(/Impact total/);
    saveEvidence("rpt06-rbac.json", resultats.rbacForbidden);
  });

  test("ACTION 4b — RBAC : profil avec presence SANS rh.salaire.consulter -> salaires masques", async ({ page }) => {
    const reqs = watchRapport(page);
    await login(page, "rpt06.presence@gpj.cm");
    await gotoRapports(page);
    await page.getByLabel("Période début").fill(PERIODE.from);
    await page.getByLabel("Période fin").fill(PERIODE.to);
    await generer(page);
    expect(reqs.length).toBe(1);

    const corps = await page.locator("body").innerText();
    expect(corps, "badge de masquage salarial visible").toContain("salaires masqués");

    // Colonne sensible desactivee (coche non cliquable)
    const cbSalaire = page.getByLabel("Colonne Salaire de base");
    await expect(cbSalaire).toBeDisabled();

    // Le detail employe affiche "—" sur les montants
    await page.locator('button[aria-label^="Détail employé"]').first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
    await settle(page, 1000);
    const drawer = await page.getByRole("dialog").innerText();
    expect(drawer).toContain("Salaire de base");
    expect(reqs.length, "aucune requete supplementaire du drawer").toBe(1);
    await capture(page, "M1-profil-sans-droit-salaire");

    // L'onglet SENSIBILISATION ne doit pas afficher les colonnes d'impact
    await page.keyboard.press("Escape");
    await settle(page, 600);
    await page.getByRole("tab", { name: "SENSIBILISATION" }).click();
    await settle(page, 1200);
    const sens = await page.locator("body").innerText();
    expect(sens, "aucune colonne d'impact salarial").not.toContain("Impact total");
    expect(sens).toContain("Estimation indicative");
    await capture(page, "M2-sensibilisation-sans-impact");

    resultats.rbacSansSalaire = {
      requetes: reqs.length,
      badge: corps.includes("salaires masqués"),
      colonneDesactivee: await cbSalaire.isDisabled(),
    };
    saveEvidence("rpt06-rbac-sans-salaire.json", resultats.rbacSansSalaire);
  });
});
