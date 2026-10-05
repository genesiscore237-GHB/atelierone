import { describe, it, expect, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({
  auth: async () => null,
  signIn: async () => null,
  signOut: async () => null,
  handlers: {},
}));

import { rhCentreRapportsRouter } from "./rh-centre-rapports";
import { rhSettingsRouter } from "./rh-settings";
import { rhPresenceRouter } from "./rh-presence";
import { rhPayrollRouter } from "./rh-payroll";
import { rhPeriodeRouter } from "./rh-situation";
import type { ExtendedUser } from "@atelierone/auth/types";

/**
 * RPT-02 - Integration DB -> moteur -> API, LECTURE SEULE.
 *
 * Ces tests ne creent aucune donnee : ils prouvent que la chaine de verite
 * temporelle (date -> ferie -> planning -> presence R3 -> calcul -> paie ->
 * rapport) resiste sur les donnees REELLES, pas seulement sur des fixtures.
 */

const AGENCE = 1;

/** Employe reel de l'agence 1, actif et rattache a un cycle de travail. */
const EMPLOYE = 9;

function ctxDe(userId: string, role: ExtendedUser["role"]) {
  const user: ExtendedUser = {
    id: userId,
    email: `${role}@gpj.cm`,
    name: role,
    agenceId: AGENCE,
    agenceName: "GPJ",
    organizationId: String(AGENCE),
    role,
    permissions: [],
    isActive: true,
    status: "active",
  };
  return {
    headers: new Headers(),
    user,
    session: { user, expires: "2099-01-01T00:00:00.000Z" },
  };
}

const rap = () => rhCentreRapportsRouter.createCaller(ctxDe("1", "superadmin") as never);
const set = () => rhSettingsRouter.createCaller(ctxDe("1", "superadmin") as never);
const pres = () => rhPresenceRouter.createCaller(ctxDe("1", "superadmin") as never);
const pai = () => rhPayrollRouter.createCaller(ctxDe("1", "superadmin") as never);
const per = () => rhPeriodeRouter.createCaller(ctxDe("1", "superadmin") as never);

async function codeDe(promise: Promise<unknown>) {
  try {
    await promise;
    return "OK";
  } catch (e) {
    const x = e as { shape?: { data?: { code?: unknown } }; code?: unknown };
    return x.shape?.data?.code ?? x.code ?? "UNKNOWN";
  }
}

const ISO_REEL = /^\d{4}-\d{2}-\d{2}$/;

/** Une date doit exister dans le calendrier, pas seulement respecter le format. */
function estDateReelle(iso: string): boolean {
  if (!ISO_REEL.test(iso)) return false;
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(a, m - 1, j);
  return d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j;
}

describe("RPT-02 integration - jours feries", () => {
  it("la base ne contient que des dates reelles, en ordre chronologique", async () => {
    const feries = (await set().listHolidays()) as Array<{ id: number; date: string; agenceId: number }>;
    expect(feries.length).toBeGreaterThan(0);
    for (const f of feries) {
      expect(estDateReelle(f.date), `date non reelle : ${f.date}`).toBe(true);
      expect(f.agenceId).toBe(AGENCE);
    }
    const dates = feries.map((f) => f.date);
    expect([...dates]).toEqual([...dates].sort());
  });

  it("aucune date ferie ne peut plus etre un fragment MM-JJ", async () => {
    const feries = (await set().listHolidays()) as Array<{ date: string }>;
    for (const f of feries) {
      // l'ancien bug produisait "2026-15-08" ou "2026-05-01" concatene
      expect(f.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const [, mois, jour] = f.date.split("-");
      expect(Number(mois)).toBeGreaterThanOrEqual(1);
      expect(Number(mois)).toBeLessThanOrEqual(12);
      expect(Number(jour)).toBeGreaterThanOrEqual(1);
      expect(Number(jour)).toBeLessThanOrEqual(31);
    }
  });

  it("un ferie reellement saisi ferme le jour pour tout le monde", async () => {
    // 20/05/2026 (mercredi) est un ferie reel des deux agences
    const lignes = await pres().analysePeriode({ from: "2026-05-20", to: "2026-05-20" });
    expect(lignes.length).toBeGreaterThan(0);
    for (const l of lignes) {
      expect(l.analyse.joursTheoriques).toBe(0);
      expect(l.analyse.heuresTheoriques).toBe(0);
      expect(l.analyse.joursAbsence).toBe(0);
      expect(l.analyse.retardTotalMinutes).toBe(0);
    }
  });

  it("le lendemain, hors ferie, redevient un jour theorique", async () => {
    // 21/05/2026 est un jeudi ordinaire : le jour compte pour l'employe actif
    const lignes = await pres().analysePeriode({
      from: "2026-05-21",
      to: "2026-05-21",
      employeeId: EMPLOYE,
    });
    expect(lignes.length).toBe(1);
    expect(lignes[0].analyse.joursTheoriques).toBe(1);
    expect(lignes[0].analyse.heuresTheoriques).toBeGreaterThan(0);
    expect(lignes[0].analyse.heuresTheoriques).toBeLessThanOrEqual(9.5);
  });

  it("un jour non ouvert du cycle (dimanche) porte zero heure theorique", async () => {
    // 20/09/2026 est un dimanche : meme avec un cycle qui travaille le samedi,
    // le dimanche n'est jamais un jour theorique.
    const lignes = await pres().analysePeriode({ from: "2026-09-20", to: "2026-09-20" });
    expect(lignes.length).toBeGreaterThan(0);
    for (const l of lignes) {
      expect(l.analyse.joursTheoriques).toBe(0);
      expect(l.analyse.heuresTheoriques).toBe(0);
    }
  });
});

describe("RPT-02 integration - bornes de periode", () => {
  it("une date impossible est refusee par l'API, pas reinterpretée", async () => {
    expect(await codeDe(rap().rapport({ from: "2026-02-31", to: "2026-03-05" }))).toBe("BAD_REQUEST");
    expect(await codeDe(rap().rapport({ from: "2026-13-01", to: "2026-12-01" }))).toBe("BAD_REQUEST");
  });

  it("format invalide et periode inversee restent refuses", async () => {
    expect(await codeDe(rap().rapport({ from: "01/09/2026", to: "2026-09-30" }))).toBe("BAD_REQUEST");
    expect(await codeDe(rap().rapport({ from: "2026-09-30", to: "2026-09-01" }))).toBe("BAD_REQUEST");
    expect(await codeDe(rap().rapport({ from: "2025-07-01", to: "2026-09-30" }))).toBe("BAD_REQUEST");
  });

  it("la plage multi-mois reste servie et bornee", async () => {
    const r = await rap().rapport({ from: "2026-09-15", to: "2026-10-15" });
    expect(r.rowPagination.total).toBeGreaterThan(0);
    for (const row of r.rows) {
      expect(row.heuresTheoriques).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("RPT-02 integration - reconciliation des absences", () => {
  const from = "2026-09-01";
  const to = "2026-09-30";

  it("l'ecart evenements / jours d'absence est nul et explique", async () => {
    const r = await rap().rapport({ from, to, eventPageSize: 2000 });
    const rec = r.methodology.reconciliationAbsences;
    expect(rec.evenementsAbsence).toBeGreaterThanOrEqual(rec.evenementsComptabilises);
    expect(rec.ecart).toBe(0);
    expect(rec.evenementsComptabilises).toBe(rec.joursComptabilises);
    expect(rec.doublonsSupprimes).toBeGreaterThanOrEqual(0);
    const sommeMotifs = Object.values(rec.parMotifNonComptabilisation).reduce((a, b) => a + b, 0);
    expect(sommeMotifs).toBe(rec.evenementsAbsence - rec.evenementsComptabilises);
  });

  it("chaque evenement d'absence porte son motif de comptabilisation", async () => {
    const r = await rap().rapport({ from, to, eventPageSize: 2000 });
    const absences = r.events.filter((e) => e.type === "ABSENCE");
    expect(absences.length).toBeGreaterThan(0);
    for (const e of absences) {
      if (e.comptabilise === true) {
        expect(e.motifNonComptabilisation).toBeNull();
      } else {
        expect(e.motifNonComptabilisation).toBeTruthy();
      }
      expect(estDateReelle(e.date)).toBe(true);
      expect(e.date >= from && e.date <= to).toBe(true);
    }
  });

  it("aucune absence d'evenement n'est comptee comme jour d'absence sans code A", async () => {
    const r = await rap().rapport({ from, to, eventPageSize: 2000 });
    const absences = r.events.filter((e) => e.type === "ABSENCE");
    const comptabilisees = absences.filter((e) => e.comptabilise === true);
    const sommeJours = r.rows.reduce((a, row) => a + (row.joursAbsence ?? 0), 0);
    expect(comptabilisees.length).toBe(sommeJours);
    for (const e of comptabilisees) expect(e.presenceCode).toBe("A");
  });

  it("un dimanche porte une trace mais jamais un jour d'absence", async () => {
    const r = await rap().rapport({ from, to, eventPageSize: 2000 });
    const dimanches = r.events.filter(
      (e) => e.type === "ABSENCE" && new Date(`${e.date}T12:00:00`).getDay() === 0
    );
    for (const e of dimanches) {
      expect(e.comptabilise).toBe(false);
      expect(e.motifNonComptabilisation).toBe("DIMANCHE");
    }
  });
});

describe("RPT-02 integration - taux de presence", () => {
  it("aucun NaN ni Infinity dans les lignes, tauxPresenceHeures fini ou null", async () => {
    const r = await rap().rapport({ from: "2026-09-01", to: "2026-09-30" });
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows) {
      for (const v of [
        row.joursTheoriques,
        row.joursPresence,
        row.joursAbsence,
        row.heuresTheoriques,
        row.heuresTravaillees,
        row.tauxPresence,
      ]) {
        expect(Number.isFinite(v as number)).toBe(true);
      }
      if (row.heuresTheoriques > 0) {
        expect(row.tauxPresenceHeures).not.toBeNull();
        expect(Number.isFinite(row.tauxPresenceHeures as number)).toBe(true);
      } else {
        expect(row.tauxPresenceHeures).toBeNull();
      }
    }
  });

  it("le resume agregate reste coherent avec la somme des lignes", async () => {
    const r = await rap().rapport({ from: "2026-09-01", to: "2026-09-30", pageSize: 500 });
    const somme = (sel: (x: (typeof r.rows)[number]) => number | null) =>
      r.rows.reduce((a, x) => a + (sel(x) ?? 0), 0);
    expect(r.summary.heuresTravaillees).toBeCloseTo(somme((x) => x.heuresTravaillees), 1);
    expect(r.summary.joursAbsence).toBe(somme((x) => x.joursAbsence));
    expect(r.summary.heuresTheoriques).toBeCloseTo(somme((x) => x.heuresTheoriques), 1);
  });
});

describe("RPT-02 integration - non-regression R3/R4/R6/RPT-01", () => {
  it("R3 : analysePeriode renvoie une ligne par employe, bornee et finie", async () => {
    const lignes = await pres().analysePeriode({
      from: "2026-09-01",
      to: "2026-09-30",
      employeeId: EMPLOYE,
    });
    expect(lignes.length).toBe(1);
    const a = lignes[0].analyse;
    expect(Number.isFinite(a.heuresTheoriques)).toBe(true);
    expect(a.joursTheoriques).toBeGreaterThanOrEqual(0);
    expect(a.joursPresence).toBeLessThanOrEqual(a.joursTheoriques);
    expect(a.joursAbsence).toBeGreaterThanOrEqual(0);
    const summaries = await pres().listSummaries({ year: 2026, month: 9 });
    expect(Array.isArray(summaries ?? [])).toBe(true);
  });

  it("R4 : les periodes de paie restent listables", async () => {
    const periodes = await pai().listPeriods();
    expect(Array.isArray(periodes ?? [])).toBe(true);
  });

  it("R6 : les situations actives sont exposees par le rapport, a date reelle", async () => {
    const r = await rap().rapport({ from: "2026-09-01", to: "2026-09-30", eventPageSize: 2000 });
    const situations = r.events.filter((e) => e.type === "SITUATION_RH");
    expect(situations.length).toBeGreaterThan(0);
    for (const s of situations) {
      expect(estDateReelle(s.date)).toBe(true);
      // une situation encore active a pu commencer AVANT la periode : on ne
      // peut pas exiger l'encadrement, mais la date doit rester reelle.
      expect(s.date <= "2026-09-30").toBe(true);
    }
  });

  it("RPT-01 : la source situation reste servie, paginee et datee", async () => {
    const s = await per().situation({ from: "2026-09-01", to: "2026-09-30", pageSize: 200 });
    expect(s.total).toBeGreaterThan(0);
    expect(s.total).toBeLessThanOrEqual(200);
    expect(s.rows.length).toBe(s.total);
    expect(s.aggregates.employes).toBe(s.total);
    for (const row of s.rows) {
      expect(Number.isFinite(row.heuresTheoriques)).toBe(true);
      expect(row.joursTheoriques).toBeGreaterThanOrEqual(0);
      if (row.tauxPresence !== null) {
        expect(row.tauxPresence).toBeGreaterThanOrEqual(0);
        expect(row.tauxPresence).toBeLessThanOrEqual(100);
      }
    }
    expect(s.periodState).toBeTruthy();
  });

  it("RPT-01 : le rapport expose la methode (tolerance ET seuil metier distincts)", async () => {
    const r = await rap().rapport({ from: "2026-09-01", to: "2026-09-30" });
    expect(r.methodology).toHaveProperty("lateToleranceMinutes");
    expect(r.methodology).toHaveProperty("businessLateThresholdMinutes");
    expect(typeof r.methodology.businessLateThresholdMinutes).toBe("number");
    expect(r.methodology.periode).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
});
