const { chromium } = require("playwright");
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
const EXE = "C:\\Users\\FAYA COMPUTER\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe";

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("  [PAGEERROR]", e.message.slice(0, 120)));

  // Login (formulaire custom : email + mdp + clic « Se Connecter »)
  await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.fill('input[placeholder="votre@email.com"]', "admin@gpj.cm");
  await page.fill('input[placeholder="********"]', "admin123");
  await page.getByRole("button", { name: "Se Connecter" }).click();
  await page.waitForURL("**/dashboard**", { timeout: 60000 });
  check("Connexion OK", true);

  // 1. Liste : sous-nav du catalogue (Articles / Catégories / Statistiques)
  await page.goto("http://localhost:3000/dashboard/catalog", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  const stats = await page.getByText("Statistiques", { exact: false }).count();
  const categories = await page.getByText("Catégories", { exact: false }).count();
  check("Sous-nav catalogue : Statistiques visible", stats >= 1, "n=" + stats);
  check("Sous-nav catalogue : Catégories visible", categories >= 1, "n=" + categories);

  // 2. En-tête allégé : « Nouveau » présent, « Tableau de bord » retiré de l'en-tête
  const nouveau = await page.getByRole("link", { name: /Nouveau/ }).count();
  const btnDashboard = await page.getByText("Tableau de bord", { exact: false }).count();
  check("En-tête : bouton Nouveau présent", nouveau >= 1, "n=" + nouveau);
  check("En-tête : bouton Tableau de bord retiré (Statistiques dans la sous-nav)", btnDashboard === 0, "n=" + btnDashboard);

  // 3. Formulaire de création : 1 écran unique, 4 types disponibles, Pièce par défaut
  await page.goto("http://localhost:3000/dashboard/catalog/produits/nouveau", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("text=Informations essentielles", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(800);
  const piece = await page.locator("text=Pièce détachée").count();
  const consommable = await page.locator("text=Consommable").count();
  const outil = await page.locator("text=Outil / Matériel").count();
  const service = await page.locator("text=Main d'œuvre").count();
  const sectionEssentiel = await page.locator("text=Informations essentielles").count();
  const sectionPrix = await page.locator("text=Prix (stock)").count();
  check("Formulaire : 4 types (Pièce/Consommable/Outil/Main d'œuvre)", piece >= 1 && consommable >= 1 && outil >= 1 && service >= 1, `${piece}/${consommable}/${outil}/${service}`);
  check("Formulaire : 1 écran — section « Informations essentielles » ouverte", sectionEssentiel >= 1, "n=" + sectionEssentiel);
  check("Formulaire : section « Prix (stock) » présente", sectionPrix >= 1, "n=" + sectionPrix);
  check("Formulaire : plus d'écran « Que souhaitez-vous enregistrer ? »", (await page.locator("text=Que souhaitez-vous enregistrer").count()) === 0);

  // 4. Navigation rapide : créer une pièce en un seul écran (champs essentiels visibles sans déplier)
  const designations = await page.locator('input[placeholder*="Filtre à huile"]').count();
  check("Ajout rapide : champ Désignation directement visible", designations >= 1, "n=" + designations);

  await browser.close();
  console.log(`\nRÉSULTAT CATALOGUE UI : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });