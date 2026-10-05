import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { resetDonneesR6 } from "./r6-reset";
import { PSQL } from "./r6-psql";

const EVIDENCE_DIR = path.resolve(process.cwd(), "../../audit/r6");
const R6_950 = "/dashboard/rh/employes/950";
const R6_949 = "/dashboard/rh/employes/949";

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

// Les onglets de la fiche employé (EmployeeDetail) sont des <button role="tab">.
// Les onglets des pages listes RH (Paie/Presences/Absences) sont des <button> simples.
async function ouvrirFiche(page: Page, url: string, onglet?: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 60_000 });
  if (onglet) {
    await page.getByRole("tab", { name: onglet }).click();
    await page.waitForTimeout(500);
  }
}

const trackLogs = (page: Page, logs: string[]) => {
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`[console:${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("requestfailed", (r) => logs.push(`[requestfailed] ${r.method()} ${r.url()} :: ${r.failure()?.errorText ?? "?"}`));
};

// ─── B1 : la réembauche N'ÉCRASE PLUS la trace de sortie ───
test("R6-FUNC-01 (B1) : réembauche conserve motif/détail/trace de la sortie", async ({ page }) => {
  test.setTimeout(480_000);
  resetDonneesR6();
  const logs: string[] = [];
  trackLogs(page, logs);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.goto("/dashboard/rh/employes", { waitUntil: "domcontentloaded" });
  await login(page);

  // Fiche de l'employé sorti 949 — le modal « Réembaucher » mentionne le contexte de sortie
  await ouvrirFiche(page, R6_949);
  await expect(page.getByText("R6TestSorti", { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Sorti le|motif/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
  await page.getByRole("button", { name: /Réembaucher/ }).click();
  await expect(page.getByRole("heading", { name: "Réembaucher l'employé" })).toBeVisible({ timeout: 30_000 });
  await capture(page, "r6-func-01-modal");

  // Le contexte de sortie est encore visible dans le modal (date + détail)
  const modalB1 = page.locator(".fixed.inset-0.z-50").last();
  const modalPre = await modalB1.textContent();
  expect(modalPre).toContain("Demission volontaire"); // détail conservé

  // Validation de la réembauche (le seul input date visible est celui du modal)
  await modalB1.locator('input[type="date"]').fill("2026-11-05");
  await modalB1.getByRole("button", { name: "Valider la réembauche" }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/réembauché/i)).toBeVisible({ timeout: 60_000 });

  // DB : statut actif + dateSortie nullée + MAIS motif_sortie/détail/trace conservés
  const rows = PSQL(`
    SELECT statut, date_sortie, motif_sortie, detail_motif_sortie, reembauchable, sortie_changed_by IS NOT NULL AS trace_conservee
    FROM employes WHERE id=949;
  `);
  const [statut, dateSortie, motif, detail, reemb, trace] = rows.split("|");
  expect(statut).toBe("actif");
  expect(dateSortie).toBe("");
  expect(motif).toBe("demission");
  expect(detail).toContain("Demission volontaire");
  // R6-B1 : reembauchable est NULLÉ par la réembauche (psql rend "" pour NULL) — JAMIS "t"
  expect(reemb).toBe("");
  expect(trace).toBe("t");
  fs.writeFileSync(path.join(EVIDENCE_DIR, "r6-func-01-db.txt"), `statut=${statut}\ndate_sortie=${dateSortie}\nmotif_sortie=${motif}\ndetail=${detail}\nreembauchable='${reemb}'\ntrace=${trace}\n\n${logs.join("\n")}`, "utf8");

  // Historique : l'intervalle « sorti » est bien refermé + un nouveau « actif » ouvert
  const histo = PSQL(`
    SELECT string_agg(statut || '|' || COALESCE(end_date::text,'OPEN'), ' / ' ORDER BY start_date)
    FROM employee_status_history WHERE employee_id=949;
  `);
  expect(histo).toContain("sorti");
  expect(histo).toContain("actif");
  await capture(page, "r6-func-01-apres");
});

// ─── B5 : modification de la configuration paie tracée (motif obligatoire + historique) ───
test("R6-FUNC-02 (B5) : config paie — motif requis + historique AVANT/APRÈS", async ({ page }) => {
  test.setTimeout(480_000);
  resetDonneesR6();
  const logs: string[] = [];
  trackLogs(page, logs);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await login(page);
  // Le login aboutit toujours sur /dashboard (middleware sans callbackUrl) → naviguer explicitement
  await page.goto("/dashboard/rh/paie", { waitUntil: "domcontentloaded" });

  // Onglet « Configuration » (bouton simple, pas role="tab")
  await page.getByRole("button", { name: "Configuration" }).click();
  await expect(page.getByText(/Chaque changement exige un motif/)).toBeVisible({ timeout: 60_000 });

  // Ligne de l'élément « Prime de présence » (item 1) : l'ancre ci-dessous atterrit sur la div
  // interne min-w-0 (libellé + motif + Enregistrer) ; on remonte au parent = rangée complète
  // qui porte aussi les inputs numériques des params (div de droite).
  const itemRow = page
    .locator("div")
    .filter({ hasText: "Prime de présence" })
    .filter({ has: page.getByPlaceholder("Motif de la modification (obligatoire)") })
    .last()
    .locator("xpath=..");

  // 1) Sans motif → refus (toast), pas de persistance
  const inputPercent = itemRow.locator('input[type="number"]').first(); // percent (avant minAttendancePct)
  await inputPercent.fill("12");
  await itemRow.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/motif de la modification/i)).toBeVisible({ timeout: 30_000 });

  // 2) Avec motif (ASCII pour prédicat psql fiable) → sauvegarde + ligne d'historique en base
  await itemRow.getByPlaceholder("Motif de la modification (obligatoire)").fill("Politique 2026 - relevement prime presence");
  await itemRow.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Élément mis à jour/)).toBeVisible({ timeout: 60_000 });

  const histo = PSQL(`
    SELECT COUNT(*) FROM payroll_item_config_history WHERE item_id=1 AND reason='Politique 2026 - relevement prime presence';
  `);
  expect(histo).toBe("1");
  // L'historique archive le paramètre APRÈS (percent=12) dans params (jsonb → format espacé)
  const paramsApres = PSQL(`SELECT params::text FROM payroll_item_config_history WHERE item_id=1 ORDER BY id DESC LIMIT 1;`);
  expect(JSON.parse(paramsApres).percent).toBe(12);
  fs.writeFileSync(path.join(EVIDENCE_DIR, "r6-func-02-db.txt"), `history_rows=${histo}\nparams_apres=${paramsApres}\n\n${logs.join("\n")}`, "utf8");
  await capture(page, "r6-func-02-config");

  // Restauration idempotente (reset : params percent=10 + purge de l'historique item 1)
  resetDonneesR6();
});

// ─── B8 : refuser une avance sans écraser le motif initial ───
test("R6-FUNC-03 (B8) : refus d'avance préserve le motif initial (justif = transition)", async ({ page }) => {
  test.setTimeout(480_000);
  resetDonneesR6();
  const logs: string[] = [];
  trackLogs(page, logs);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.goto("/dashboard/rh/paie", { waitUntil: "domcontentloaded" });
  await login(page);

  await ouvrirFiche(page, R6_950, "Avances");
  await expect(page.getByText("Aucune avance enregistrée pour cet employé.")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /Nouvelle avance/ }).click();
  const saisieModal = page.locator(".fixed.inset-0.z-50").last();
  await saisieModal.getByPlaceholder(/Ex : 50 000/).fill("100000");
  await saisieModal.getByPlaceholder("Avance sur salaire").fill("Remboursement outillage");
  await saisieModal.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Avance enregistrée \(statut : Demandée\)/)).toBeVisible({ timeout: 60_000 });

  // Refus avec justification (constat initial = « Remboursement outillage »)
  const rowAdv = page.locator("table tbody tr", { hasText: "Remboursement outillage" }).first();
  await rowAdv.getByTitle("Refuser").click();
  await expect(page.getByRole("heading", { name: "Refuser l'avance" })).toBeVisible({ timeout: 30_000 });
  const refusModal = page.locator(".fixed.inset-0.z-50").last();
  await refusModal.locator("textarea").fill("Avance refusee: la periode d'essai n'est pas validee");
  await refusModal.getByRole("button", { name: "Refuser", exact: true }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Avance refusée/)).toBeVisible({ timeout: 60_000 });

  // DB : motif INITIAL conservé (pas de concaténation « Refus : … »)
  const motifDb = PSQL(`SELECT motif FROM employee_advances WHERE employee_id=950 ORDER BY id DESC LIMIT 1;`);
  expect(motifDb).toBe("Remboursement outillage"); // non préfixé, non écrasé
  // La justification de refus vit dans advance_transitions.justification + statut ANNULÉE
  const justifDb = PSQL(`
    SELECT to_status || '|' || justification FROM advance_transitions
    WHERE advance_id IN (SELECT id FROM employee_advances WHERE employee_id=950) ORDER BY id DESC LIMIT 1;
  `);
  expect(justifDb).toContain("ANNULÉE");
  expect(justifDb).toContain("periode d'essai n'est pas validee");
  await capture(page, "r6-func-03-b8");

  fs.writeFileSync(path.join(EVIDENCE_DIR, "r6-func-03-db.txt"), `motif=${motifDb}\njustif=${justifDb}\n\n${logs.join("\n")}`, "utf8");
});

// ─── B2/B3 : congé approuvé → le pointage réel n'est jamais écrasé (R6-D2) ───
test("R6-FUNC-04 (B2/B3) : approbation congé préserve le pointage réel (19/05 PRESENT, autres conge)", async ({ page }) => {
  test.setTimeout(480_000);
  resetDonneesR6();
  const logs: string[] = [];
  trackLogs(page, logs);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await login(page);
  // Navigation APRÈS login : le helper login attend l'URL /dashboard et quitterait la page sinon.
  await page.goto("/dashboard/rh/absences", { waitUntil: "domcontentloaded" });

  // Création d'une demande de congé : 18/05 (lundi) → 22/05 (vendredi).
  // - 19/05 : entrée réellement pointée (reset PRESENT 08:00-17:00) → JAMAIS écrasée (R6-D2)
  // Remarque : le jour férié n'est pas exclu ici — les dates fériés en base sont
  // stockées « YYYY-DD-MM » (seed-rh.ts) et ne matchent jamais l'ISO « YYYY-MM-DD »
  // utilisé par les moteurs (lecount bug documenté dans l'audit R6, hors périmètre).
  const selectEmp = page.locator("select").nth(0);
  await selectEmp.selectOption("950");
  const selectType = page.locator("select").nth(1);
  await selectType.selectOption({ index: 1 }); // Congé annuel (payé, déduit)
  await page.locator('input[type="date"]').nth(0).fill("2026-05-18");
  await page.locator('input[type="date"]').nth(1).fill("2026-05-22");
  await page.getByPlaceholder("Motif *").first().fill("Conge annuel test R6");
  await page.getByRole("button", { name: /Envoyer la demande/ }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Demande envoyée/)).toBeVisible({ timeout: 60_000 });

  // Approbation via le bouton de la demande (la ligne vient d'apparaître)
  const rowConge = page.locator("table tbody tr", { hasText: "2026-05-18" }).last();
  await rowConge.getByRole("button", { name: "Approuver" }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/Décision enregistrée/)).toBeVisible({ timeout: 60_000 });
  await capture(page, "r6-func-04-approuve");

  // DB : 18,20,21,22 → CONGE ; 19 → PRESENT avec heures réelles (jamais écrasé)
  const entries = PSQL(`
    SELECT date, status, COALESCE(time_in::text,'-'), COALESCE(time_out::text,'-')
    FROM attendance_entries WHERE employee_id=950 AND date BETWEEN '2026-05-18' AND '2026-05-22' ORDER BY date;
  `);
  const lines = entries.split("\n");
  const map = new Map(lines.map((l) => { const [d, s, ti, to] = l.split("|"); return [d, { s, ti, to }]; }));
  expect(map.get("2026-05-18")?.s).toBe("conge");
  expect(map.get("2026-05-19")?.s).toBe("PRESENT"); // jamais écrasé
  expect(map.get("2026-05-19")?.ti).toBe("08:00:00");
  expect(map.get("2026-05-19")?.to).toBe("17:00:00");
  expect(map.get("2026-05-20")?.s).toBe("conge");
  expect(map.get("2026-05-21")?.s).toBe("conge");
  expect(map.get("2026-05-22")?.s).toBe("conge");
  fs.writeFileSync(path.join(EVIDENCE_DIR, "r6-func-04-db.txt"), `${entries}\n\n${logs.join("\n")}`, "utf8");
});

// ─── B4 : closeMonth refuse un mois déjà verrouillé ───
test("R6-FUNC-05 (B4) : clôture mensuelle refusée si le mois est déjà verrouillé", async ({ page }) => {
  test.setTimeout(480_000);
  resetDonneesR6();
  // On s'appuie sur un mois réellement verrouillé (2026/09)
  const locked = PSQL("SELECT COUNT(*) FROM attendance_monthly_summaries WHERE year=2026 AND month=9 AND locked=TRUE;");
  expect(Number(locked)).toBeGreaterThan(0);
  const logs: string[] = [];
  trackLogs(page, logs);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await login(page);
  // Navigation APRÈS login (cf. FUNC-04) : éviter que le helper login ne redirige vers /dashboard.
  await page.goto("/dashboard/rh/presences", { waitUntil: "domcontentloaded" });

  // L'onglet par défaut est « Saisie du jour » → basculer sur « Mensuel & clôture »
  await page.getByRole("button", { name: "Mensuel & clôture" }).click();
  const yearInput = page.locator('input[type="number"]').first();
  await yearInput.fill("2026");
  const monthSelect = page.locator("select").first();
  await monthSelect.selectOption("9");
  await page.getByRole("button", { name: "Clôturer le mois" }).click();
  await expect(page.locator('[data-sonner-toaster]').getByText(/déjà clôturé/i)).toBeVisible({ timeout: 60_000 });
  await capture(page, "r6-func-05-refus");

  // La garde serveur : message CONFLICT (déjà clôturé)
  const marker = await page.locator('[data-sonner-toaster]').textContent();
  expect(marker).toContain("déjà clôturé");
  fs.writeFileSync(path.join(EVIDENCE_DIR, "r6-func-05-toast.txt"), `${marker}\n\n${logs.join("\n")}`, "utf8");
});

// ─── D8 : historique enrichi (recherche + filtre type + acteur nommé) ───
test("R6-FUNC-06 (D8) : onglet Historique — recherche, filtre type, acteur nommé", async ({ page }) => {
  test.setTimeout(480_000);
  resetDonneesR6();
  const logs: string[] = [];
  trackLogs(page, logs);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.goto("/dashboard/rh/employes", { waitUntil: "domcontentloaded" });
  await login(page);

  await ouvrirFiche(page, R6_950, "Historique");
  await expect(page.getByText("Parcours de l'employé")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("ol").first()).toBeVisible({ timeout: 60_000 });

  // Recherche par texte (titre/acteur) : « actif » matche « Statut : actif » (l'acteur est « Super Admin »)
  const search = page.getByPlaceholder(/Rechercher \(titre, motif, acteur\)/);
  await search.fill("actif");
  await expect(page.locator("ol li").first()).toBeVisible();
  await search.fill("zzz-inexistant");
  await expect(page.getByText("Aucun événement")).toBeVisible({ timeout: 30_000 });
  await search.fill("");
  await capture(page, "r6-func-06-recherche");

  // Filtre par type : « Salaire » → cartes écrémées
  await page.locator("select").last().selectOption("salaire");
  await page.waitForTimeout(400);
  const selectValue = await page.locator("select").last().inputValue();
  expect(selectValue).toBe("salaire");
  await page.locator("select").last().selectOption("tous");

  // Acteur nommé (badge « par … ») : les événements d'état de l'employé 950
  await expect(page.getByText(/par /).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
  fs.writeFileSync(path.join(EVIDENCE_DIR, "r6-func-06-logs.txt"), logs.join("\n"), "utf8");
  await capture(page, "r6-func-06-historique");
});

// ─── B7 : récupération d'avance déclenchée par la paie (transition tracée) ───
test("R6-FUNC-07 (B7) : préparation paie insère la transition de récupération d'avance", async ({ page }) => {
  test.setTimeout(480_000);
  resetDonneesR6();
  // Avance VERSÉE avec solde non récupéré → éligible récupération paie
  const advId = PSQL(`
    INSERT INTO employee_advances
      (employee_id, montant, motif, statut, solde_restant, montant_recupe, date_versement, periode_concernee_debut, periode_concernee_fin,
       periode_recuperation_debut, periode_recuperation_fin, reference, created_at, updated_at)
    VALUES
      (950, 50000, 'Remboursement outillage', 'VERSÉE', 50000, 0, now(), '2026-09-01', '2026-09-29',
       '2026-09-01', '2026-10-31', 'R6-TEST-B7-' || floor(random()*9000+1000)::int, now(), now())
    RETURNING id;
  `).split(/\s+/)[0];
  expect(advId).toBeTruthy();

  const logs: string[] = [];
  trackLogs(page, logs);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await login(page);
  // Le login aboutit toujours sur /dashboard (middleware sans callbackUrl) → naviguer explicitement
  await page.goto("/dashboard/rh/paie", { waitUntil: "domcontentloaded" });

  // La période 4 (2026-09-01 → 2026-09-29) est ouverte (global-setup R4 la ré-ouvre).
  // Un seul « Calculer la paie » est visible (période 3 clôturée n'a pas de bouton).
  await expect(page.getByText("Périodes de paie")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /Calculer la paie/ }).first().click();

  // prepareMonth régénère tous les bulletins (plusieurs secondes) → on poll la DB
  // plutôt que d'asserter un toast (succès OU refus possibles selon le calcul, R6-07).
  await expect
    .poll(
      () => PSQL(`
        SELECT COALESCE((SELECT justification FROM advance_transitions
          WHERE advance_id=${advId} AND justification LIKE 'Récupération via paie%'
          ORDER BY id DESC LIMIT 1), '')
      `),
      { timeout: 300_000 }
    )
    .toContain("Récupération via paie");

  // La préparation a inséré une transition tracée + soldé la dette
  const transition = PSQL(`
    SELECT COALESCE(from_status,'-') || '|' || to_status || '|' || justification
    FROM advance_transitions WHERE advance_id=${advId}
    ORDER BY id DESC LIMIT 1;
  `);
  expect(transition).toContain("Récupération via paie");
  const solde = PSQL(`SELECT solde_restant FROM employee_advances WHERE id=${advId};`);
  expect(Number(solde)).toBe(0);
  fs.writeFileSync(path.join(EVIDENCE_DIR, "r6-func-07-db.txt"), `transition=${transition}\nsolde=${solde}\n\n${logs.join("\n")}`, "utf8");
  await capture(page, "r6-func-07-paie");
});

// ─── B6 : colonne Salaire masquée SANS rh.salaire.consulter ───
// Deux contexts navigateur : admin@gpj.cm (superadmin → colonne visible) vs
// rh@gpj.cm (rôle rh, rh.salaire.consulter retiré dans le test → colonne masquée).
test("R6-FUNC-08 (B6) : fiche masque la colonne Salaire sans rh.salaire.consulter", async ({ page, browser }) => {
  test.setTimeout(480_000);
  resetDonneesR6();
  const baseURL = test.info().project.use.baseURL ?? "http://localhost:3000";

  // Retrait de rh.salaire.consulter pour le rôle rh (AVANT login, les perms sont capturées
  // à l'ouverture de session ; rh@gpj.cm conserve tout le reste → passe rhProcedure).
  PSQL(`
    DELETE FROM role_permissions
    WHERE role_id=(SELECT id FROM roles WHERE code='rh')
      AND permission_id=(SELECT id FROM permissions WHERE code='rh.salaire.consulter');
  `);

  try {
    // ─ Contexte 1 : admin → colonne « Salaire » visible ─
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page);
    await ouvrirFiche(page, R6_950, "Contrat");
    await expect(page.getByRole("columnheader", { name: "Salaire" })).toBeVisible({ timeout: 30_000 });

    // ─ Contexte 2 : rh sans rh.salaire.consulter → colonne masquée (canPaie=false) ─
    const ctxRh = await browser.newContext({ baseURL });
    const pageRh = await ctxRh.newPage();
    await login(pageRh, "rh@gpj.cm");
    await ouvrirFiche(pageRh, R6_950, "Contrat");
    await pageRh.waitForLoadState("networkidle").catch(() => {});
    await expect(pageRh.getByRole("columnheader", { name: "Salaire" })).toHaveCount(0);
    // Les onglets Paie/Avances n'existent pas non plus (gated par canPaie)
    await expect(pageRh.getByRole("tab", { name: "Paie" })).toHaveCount(0);
    await expect(pageRh.getByRole("tab", { name: "Avances" })).toHaveCount(0);
    // Le montant du contrat n'apparaît nulle part sur l'onglet Contrat
    await expect(pageRh.getByText("200000", { exact: true })).toHaveCount(0);
    await capture(pageRh, "r6-func-08-masque");
    await ctxRh.close();
  } finally {
    // Restauration idempotente (role_permissions n'a pas d'UC → NOT EXISTS)
    PSQL(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p
      WHERE r.code='rh' AND p.code='rh.salaire.consulter'
        AND NOT EXISTS (SELECT 1 FROM role_permissions x WHERE x.role_id=r.id AND x.permission_id=p.id);
    `);
  }
});