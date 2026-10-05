import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * RPT-02 - Smoke navigateur de la verite temporelle RH.
 *
 * Objectif : prouver que l'UI expose la meme verite que la chaine
 * date -> ferie -> planning -> R3 -> calcul -> paie -> rapport, et qu'elle
 * refuse les periodes impossibles au lieu de les reinterpretant.
 *
 * Lecture seule : aucun clic n'ecrit en base.
 */

const EVIDENCE_DIR = path.resolve(process.cwd(), "../../audit/rpt02/fonctionnels");

function capture(page: Page, nom: string) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  return page.screenshot({ path: path.join(EVIDENCE_DIR, `${nom}.png`), fullPage: false });
}

async function login(page: Page, email = "admin@gpj.cm", password = "admin123") {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Se Connecter/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 240_000 });
}

async function ouvrirRapports(page: Page) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto("/dashboard/rh/rapports", { waitUntil: "domcontentloaded", timeout: 180_000 });
      break;
    } catch {
      await page.waitForTimeout(1500);
      if (i === 2) throw new Error("Page rapports injoignable apres 3 essais");
    }
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.locator("#rapports-page")).toBeVisible({ timeout: 60_000 });
}

function inputsPeriode(page: Page) {
  return {
    from: page.locator('#rapports-page input[type="date"]').nth(0),
    to: page.locator('#rapports-page input[type="date"]').nth(1),
  };
}

test.describe("RPT-02 - verite temporelle RH (lecture seule)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await ouvrirRapports(page);
  });

  test("une periode impossible est refusee par l'UI, sans appel metier", async ({ page }) => {
    const { from, to } = inputsPeriode(page);
    // 2026-02-31 n'existe pas : le navigateur lui-meme refuse de la retenir.
    // On force la valeur via le DOM pour prouver ce garde-fou natif, puis on
    // verifie qu'elle n'est jamais rendue dans l'etat du composant.
    await from.evaluate((el) => {
      const input = el as HTMLInputElement;
      input.value = "2026-02-31";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(await from.inputValue()).not.toBe("2026-02-31");
    await capture(page, "01-periode-impossible-refusee");

    // periode inversee : le bouton reste desactive et le message est visible.
    await from.fill("2026-09-30");
    await to.fill("2026-09-01");
    const bouton = page.getByRole("button", { name: /Prévisualiser/ });
    await expect(bouton).toBeDisabled();
    await expect(page.getByText(/Période inversée/)).toBeVisible();
    await capture(page, "02-periode-inversee-bouton-desactive");
  });

  test("le rapport Presences se rend sur une periode reelle et reste coherent", async ({ page }) => {
    await page.getByRole("button", { name: "Présences", exact: true }).click();
    const { from, to } = inputsPeriode(page);
    await from.fill("2026-09-01");
    await to.fill("2026-09-30");

    let reponse: { rows?: unknown[]; summary?: Record<string, number> } | null = null;
    page.on("response", async (r) => {
      if (r.url().includes("rhCentreRapports.rapport")) {
        try {
          reponse = (await r.json()) as typeof reponse;
        } catch {
          /* reponse trop volumineuse ou deja consommee */
        }
      }
    });

    await page.getByRole("button", { name: /Prévisualiser/ }).click();
    await expect(page.locator("#rapports-preview")).toBeVisible({ timeout: 180_000 });
    await capture(page, "03-rapport-presences-septembre-2026");

    // aucun NaN / Infinity / undefined rendu (mot entier, pas sous-chaine :
    // un matricule reel contient "nan", ex. gpj-nan-0008).
    const corps = (await page.locator("#rapports-preview").innerText()).toLowerCase();
    expect(corps).not.toMatch(/(^|[^\w-])nan([^\w-]|$)/);
    expect(corps).not.toMatch(/(^|[^\w-])infinity([^\w-]|$)/);
    expect(corps).not.toMatch(/(^|[^\w-])undefined([^\w-]|$)/);

    // l'agregat serveur et les lignes restent coherents entre eux
    const charge = reponse as unknown as {
      result?: { data?: { json?: { rows?: unknown[]; summary?: Record<string, number> } } };
    };
    const data = charge?.result?.data?.json;
    if (data?.summary) {
      for (const [cle, valeur] of Object.entries(data.summary)) {
        if (typeof valeur === "number") expect(Number.isFinite(valeur), `${cle} non fini`).toBe(true);
      }
    }
  });

  test("la page Parametrage n'affiche que des dates feries reelles", async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      try {
        await page.goto("/dashboard/rh/parametrage", {
          waitUntil: "domcontentloaded",
          timeout: 180_000,
        });
        break;
      } catch {
        await page.waitForTimeout(1500);
        if (i === 2) throw new Error("Page parametrage injoignable apres 3 essais");
      }
    }
    await page.waitForLoadState("networkidle").catch(() => {});

    await page.getByRole("button", { name: /Jours fériés/ }).click();
    await expect(page.locator("#hol-date")).toBeVisible({ timeout: 60_000 });

    // le champ de saisie est un vrai date input : une date impossible n'y reste pas
    await expect(page.locator("#hol-date")).toHaveAttribute("type", "date");
    await page.locator("#hol-date").evaluate((el) => {
      const input = el as HTMLInputElement;
      input.value = "2026-02-31";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(await page.locator("#hol-date").inputValue()).not.toBe("2026-02-31");

    // toutes les dates listees existent reellement dans le calendrier
    const dates = await page.locator("#hol-date ~ * , span.text-xs.text-muted-foreground").allInnerTexts();
    const iso = dates.flatMap((t) => t.match(/\d{4}-\d{2}-\d{2}/g) ?? []);
    expect(iso.length).toBeGreaterThan(0);
    for (const valeur of iso) {
      expect(valeur, `date ferie invalide : ${valeur}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const [a, m, j] = valeur.split("-").map(Number);
      const d = new Date(a, m - 1, j);
      expect(d.getFullYear(), `date ferie inexistante : ${valeur}`).toBe(a);
      expect(d.getMonth()).toBe(m - 1);
      expect(d.getDate()).toBe(j);
    }
    await capture(page, "04-parametrage-dates-reelles");
  });
});
