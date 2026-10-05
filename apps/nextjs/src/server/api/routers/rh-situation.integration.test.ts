import { describe, it, expect, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({
  auth: async () => null,
  signIn: async () => null,
  signOut: async () => null,
  handlers: {},
}));

import { rhPeriodeRouter } from "./rh-situation";
import type { ExtendedUser } from "@atelierone/auth/types";

const AGENCE = 1;

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

const caller = () => rhPeriodeRouter.createCaller(ctxDe("1", "superadmin") as never);

async function codeDe(promise: Promise<unknown>) {
  try {
    await promise;
    return "OK";
  } catch (e) {
    const x = e as { shape?: { data?: { code?: unknown } }; code?: unknown };
    return x.shape?.data?.code ?? x.code ?? "UNKNOWN";
  }
}

describe("rhPeriode (intégration — DB locale, lecture seule)", () => {
  const from = "2026-08-01";
  const to = "2026-08-31";

  describe("gardes d'entrée", () => {
    it("to < from → BAD_REQUEST", async () => {
      expect(await codeDe(caller().situation({ from: to, to: from }))).toBe("BAD_REQUEST");
    });

    it("plage > 13 mois civils → BAD_REQUEST", async () => {
      expect(await codeDe(caller().situation({ from: "2025-07-01", to: "2026-08-31" }))).toBe("BAD_REQUEST");
      expect(await codeDe(caller().situation({ from: "2025-08-01", to: "2026-08-31" }))).not.toBe("BAD_REQUEST");
    });

    it("sort hors whitelist → BAD_REQUEST", async () => {
      expect(await codeDe(caller().situation({ from, to, sort: "invraisemblable" as never }))).toBe("BAD_REQUEST");
    });

    it("date mal formée → BAD_REQUEST", async () => {
      expect(await codeDe(caller().situation({ from: "01/08/2026", to }))).toBe("BAD_REQUEST");
    });
  });

  describe("situation", () => {
    it("retourne la structure attendue (rows/total/page/pageSize/aggregates/anomaliesSummary/periodState)", async () => {
      const res = await caller().situation({ from, to });
      expect(typeof res.total).toBe("number");
      expect(res.rows).toBeInstanceOf(Array);
      expect(res.rows.length).toBeLessThanOrEqual(res.pageSize);
      expect(res.total).toBeGreaterThanOrEqual(res.rows.length);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(50);
      expect(res.aggregates.employes).toBe(res.total);
      expect(res.anomaliesSummary.total).toBeGreaterThanOrEqual(0);
      expect(res.periodState.mois).toBeInstanceOf(Array);
      expect(res.periodState.mois.length).toBeGreaterThanOrEqual(1);
      expect(res.periodState.mois[0].mois).toBe("2026-08");
    });

    it("filtre employeId → une seule ligne, identité exacte", async () => {
      const res = await caller().situation({ from, to, employeId: 62 });
      expect(res.total).toBe(1);
      const row = res.rows[0];
      expect(row.employeeId).toBe(62);
      expect(row.matricule).toBe("GPJ-NaN-0010");
      expect(row.nom).toContain("Zo'o Mbarga");
      expect(row.statut).toBe("actif");
      if (row.salaires) expect(typeof row.salaires.netLabel).toBe("string");
    });

    it("recherche texte serveur (matricule)", async () => {
      const res = await caller().situation({ from, to, search: "GPJ-NaN-0010" });
      expect(res.total).toBe(1);
      expect(res.rows[0].employeeId).toBe(62);
    });

    it("tri global serveur — ordre local cohérent asc/desc", async () => {
      const asc = await caller().situation({ from, to, sort: "nom", dir: "asc", pageSize: 10 });
      const desc = await caller().situation({ from, to, sort: "nom", dir: "desc", pageSize: 10 });
      expect(asc.total).toBe(desc.total);
      const nomsAsc = asc.rows.map((r) => r.nom);
      const nomsDesc = desc.rows.map((r) => r.nom);
      for (let i = 1; i < nomsAsc.length; i++) expect(nomsAsc[i - 1].toLowerCase() <= nomsAsc[i].toLowerCase()).toBe(true);
      for (let i = 1; i < nomsDesc.length; i++) expect(nomsDesc[i - 1].toLowerCase() >= nomsDesc[i].toLowerCase()).toBe(true);
    });

    it("pagination — page 2 disjoint de page 1", async () => {
      const p1 = await caller().situation({ from, to, page: 1, pageSize: 10 });
      const p2 = await caller().situation({ from, to, page: 2, pageSize: 10 });
      expect(p1.rows.length).toBeLessThanOrEqual(10);
      expect(p2.rows.length).toBeLessThanOrEqual(10);
      const ids1 = new Set(p1.rows.map((r) => r.employeeId));
      expect(p2.rows.some((r) => ids1.has(r.employeeId))).toBe(false);
    });

    it("idempotence x3 — réponses identiques, aucune écriture", async () => {
      const a = await caller().situation({ from, to, employeId: 62 });
      const b = await caller().situation({ from, to, employeId: 62 });
      const c = await caller().situation({ from, to, employeId: 62 });
      expect(b).toEqual(a);
      expect(c).toEqual(a);
    });
  });

  describe("employe (volet investigation)", () => {
    it("détail complet pour un employé de l'agence", async () => {
      const det = await caller().employe({ employeId: 62, from, to });
      expect(det.employe.employeeId).toBe(62);
      expect(det.employe.matricule).toBe("GPJ-NaN-0010");
      expect(det.segmentsSalaires).toBeInstanceOf(Array);
      expect(det.presence.joursTheoriques).toBeGreaterThanOrEqual(0);
      expect(det.timeline).toBeInstanceOf(Array);
      expect(det.timeline.length).toBeGreaterThan(0);
      expect(det.avances.row).toMatchObject({
        avancePeriode: expect.any(Number),
        recuperePeriode: expect.any(Number),
        soldeFinPeriode: expect.any(Number),
        soldeActuel: expect.any(Number),
        nbAvances: expect.any(Number),
      });
      expect(Array.isArray(det.avances.journal)).toBe(true);
      expect(["REEL", "ESTIME"]).toContain(det.paie.netLabel);
      expect(det.anomalies).toBeInstanceOf(Array);
    });

    it("employé hors agence → NOT_FOUND (tenant scope)", async () => {
      expect(await codeDe(caller().employe({ employeId: 999999, from, to }))).toBe("NOT_FOUND");
    });
  });

  describe("export (CSV)", () => {
    it("renvoie un CSV RFC-4180 avec en-têtes et la ligne de l'employé filtré", async () => {
      const csv = await caller().export({ from, to, employeId: 62 });
      expect(typeof csv).toBe("string");
      const lines = csv.split(/\r?\n/);
      expect(lines[0]).toContain("Matricule");
      expect(lines[0]).toContain("Net");
      expect(csv).toContain("Zo'o Mbarga");
      expect(csv).toContain(";");
    });
  });
});