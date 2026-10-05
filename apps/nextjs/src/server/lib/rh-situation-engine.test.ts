import { describe, it, expect } from "vitest";
import {
  segmenterSalaires,
  modeNormaliseSegments,
  soldeAvanceAFin,
  calculerAvancesRow,
  listeMoisCivils,
  libelleMois,
  calculerEtatPeriode,
  construireInputPaie,
  projeterPaie,
  couvertureBulletin,
  construireAnomalies,
  filtrerAnomaliesParPermission,
  resumerAnomalies,
  agregerLignes,
  trierLignes,
  classifierJourDetail,
  construireOrigine,
  SEUILS_ANOMALIE_DEFAUT,
  type SalairesRow,
  type AvancesRow,
  type PeriodeAnalyse,
  type PayrollConfigItem,
  type LigneSituation,
} from "./rh-situation-engine";

const FICHE = { baseSalary: 150000, modePaie: "SALAIRE_MENSUEL", forfaitHebdomadaire: null };

const INTERVAL = { // par défaut règles de config conformes socle
  items: [
    { code: "CNPS_EMPLOYE", name: "CNPS", type: "deduction", method: "percent", params: { percent: 4.5 } },
    { code: "CNPS_EMPLOYEUR", name: "CNPS Patronale", type: "deduction", method: "percent", params: { percent: 5.6 } },
    { code: "IRPP", name: "IRPP", type: "deduction", method: "scale", params: { scale: [] } },
    { code: "AVANCE_RECUP", name: "Récupération avance", type: "deduction", method: "advance_recovery", params: {} },
  ] as PayrollConfigItem[],
  standardMonthlyHours: 225.3,
  overtimeMultiplier: 1.5,
};

// ─── §E0 — Segmentation ───

describe("segmenterSalaires (§E0)", () => {
  it("aucun historique → un seul segment source fiche", () => {
    const segments = segmenterSalaires({ fiche: FICHE, historique: [], from: "2026-08-01", to: "2026-08-31" });
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ dateDebut: "2026-08-01", dateFin: "2026-08-31", baseSalary: 150000, source: "fiche", modePaie: "SALAIRE_MENSUEL" });
  });

  it("un changement en cours de période → deux segments délimités", () => {
    const segments = segmenterSalaires({
      fiche: FICHE,
      historique: [{ startDate: "2026-08-10", baseSalary: 200000 }],
      from: "2026-08-01",
      to: "2026-08-21",
    });
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ dateDebut: "2026-08-01", dateFin: "2026-08-09", baseSalary: 150000, source: "fiche" });
    expect(segments[1]).toMatchObject({ dateDebut: "2026-08-10", dateFin: "2026-08-21", baseSalary: 200000, source: "historique" });
  });

  it("plusieurs changements → bornes successives, dernier gouvernant applicable", () => {
    const segments = segmenterSalaires({
      fiche: FICHE,
      historique: [
        { startDate: "2026-08-05", baseSalary: 180000 },
        { startDate: "2026-08-15", baseSalary: 250000 },
      ],
      from: "2026-08-01",
      to: "2026-08-30",
    });
    expect(segments).toHaveLength(3);
    expect(segments.map((s) => [s.dateDebut, s.dateFin, s.baseSalary])).toEqual([
      ["2026-08-01", "2026-08-04", 150000],
      ["2026-08-05", "2026-08-14", 180000],
      ["2026-08-15", "2026-08-30", 250000],
    ]);
  });

  it("changement avant Du → ne découpe PAS dans [from,to] (borne hors bornes)", () => {
    const segments = segmenterSalaires({
      fiche: FICHE,
      historique: [{ startDate: "2026-07-20", baseSalary: 200000 }],
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ baseSalary: 200000, source: "historique", startDate: "2026-07-20" });
  });

  it("changement le jour de Du → segment unique dès Du", () => {
    const segments = segmenterSalaires({
      fiche: FICHE,
      historique: [{ startDate: "2026-08-01", baseSalary: 200000 }],
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ dateDebut: "2026-08-01", baseSalary: 200000, source: "historique" });
  });

  it("changement au-delà de Au → ignoré", () => {
    const segments = segmenterSalaires({
      fiche: FICHE,
      historique: [{ startDate: "2026-09-01", baseSalary: 200000 }],
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(segments).toHaveLength(1);
    expect(segments[0].baseSalary).toBe(150000);
  });

  it("record clos avant le début → ne gouverne pas (endDate respecté)", () => {
    const segments = segmenterSalaires({
      fiche: FICHE,
      historique: [
        { startDate: "2026-07-01", endDate: "2026-07-31", baseSalary: 90000 },
        { startDate: "2026-08-05", baseSalary: 180000 },
      ],
      from: "2026-08-01",
      to: "2026-08-10",
    });
    expect(segments[0].baseSalary).toBe(150000);
    expect(segments[1].baseSalary).toBe(180000);
  });

  it("modeNormaliseSegments : uniforme ou null si mixte", () => {
    expect(modeNormaliseSegments(segmenterSalaires({ fiche: FICHE, historique: [], from: "2026-08-01", to: "2026-08-31" }))).toBe("SALAIRE_MENSUEL");
    const mixte = segmenterSalaires({
      fiche: FICHE,
      historique: [{ startDate: "2026-08-10", baseSalary: 200000, modePaie: "SALAIRE_HORAIRE" }],
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(modeNormaliseSegments(mixte)).toBeNull();
  });
});

// ─── Avances — reconstruction §14 ───

describe("soldeAvanceAFin / calculerAvancesRow (§14)", () => {
  const advance = { id: 1, montant: 100000, dateVersement: "2026-08-05", statut: "VERSÉE", soldeRestant: 40000 };
  const recoveries = [
    { advanceId: 1, dateRecuperation: "2026-08-25", montant: 30000 },
    { advanceId: 1, dateRecuperation: "2026-09-25", montant: 30000 },
  ];

  it("solde reconstruit borne ≥ 0 (jamais solde_restant)", () => {
    expect(soldeAvanceAFin(advance, recoveries, "2026-08-31")).toBe(70000);
    expect(soldeAvanceAFin(advance, recoveries, "2026-10-31")).toBe(40000);
  });

  it("récupérations après Au exclues du solde fin de période", () => {
    expect(soldeAvanceAFin(advance, recoveries, "2026-08-31")).toBe(70000);
  });

  it("quatre indicateurs déterministes", () => {
    const row = calculerAvancesRow({
      advances: [advance],
      recoveries,
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(row).toMatchObject({
      avancePeriode: 100000,
      recuperePeriode: 30000, // seule récup. d'août
      soldeFinPeriode: 70000, // 100000 − 30000
      soldeActuel: 40000,     // valeur DB séparée
      nbAvances: 1,
    });
  });

  it("avance versée hors période → comptée au solde, pas dans avancePeriode/nb", () => {
    const row = calculerAvancesRow({
      advances: [{ ...advance, dateVersement: "2026-07-10" }],
      recoveries: [],
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(row).toMatchObject({ avancePeriode: 0, soldeFinPeriode: 100000, nbAvances: 0 });
  });

  it("plusieurs avances sommées indépendamment", () => {
    const row = calculerAvancesRow({
      advances: [
        { id: 1, montant: 50000, dateVersement: "2026-08-02", statut: "VERSÉE", soldeRestant: 50000 },
        { id: 2, montant: 30000, dateVersement: "2026-08-10", statut: "VERSÉE", soldeRestant: 30000 },
        { id: 3, montant: 20000, dateVersement: "2026-08-20", statut: "VERSÉE", soldeRestant: 20000 },
      ],
      recoveries: [],
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(row).toMatchObject({ avancePeriode: 100000, soldeFinPeriode: 100000, nbAvances: 3 });
  });

  it("récupérations partielles → soldeFin reconstruit correctement", () => {
    const row = calculerAvancesRow({
      advances: [advance],
      recoveries: [
        { advanceId: 1, dateRecuperation: "2026-08-15", montant: 20000 },
        { advanceId: 1, dateRecuperation: "2026-08-20", montant: 30000 },
      ],
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(row.soldeFinPeriode).toBe(50000);
  });
});

// ─── État de période §15 ───

describe("calculerEtatPeriode (§15)", () => {
  const mois = (from: string, to: string) => ({ from, to });

  it("un mois clos + un mois ouvert → MIXTE", () => {
    const etat = calculerEtatPeriode({
      ...mois("2026-08-15", "2026-09-20"),
      payrollPeriods: [{ startDate: "2026-08-01", endDate: "2026-08-31", status: "closed" }],
      summaries: [{ year: 2026, month: 8, locked: true }],
    });
    expect(etat.global).toBe("MIXTE");
    expect(etat.mois.map((m) => [m.mois, m.etat, m.source])).toEqual([
      ["2026-08", "CLOTURE", ["payroll_periods", "attendance_monthly_summaries"]],
      ["2026-09", "EN_COURS", []],
    ]);
  });

  it("tous closes → CLOTUREE", () => {
    const etat = calculerEtatPeriode({
      ...mois("2026-08-01", "2026-08-31"),
      payrollPeriods: [{ startDate: "2026-08-01", endDate: "2026-08-31", status: "closed" }],
      summaries: [{ year: 2026, month: 8, locked: true }],
    });
    expect(etat.global).toBe("CLOTUREE");
  });

  it("aucun close → EN_COURS", () => {
    const etat = calculerEtatPeriode({
      ...mois("2026-09-01", "2026-09-30"),
      payrollPeriods: [],
      summaries: [{ year: 2026, month: 9, locked: false }],
    });
    expect(etat.global).toBe("EN_COURS");
  });

  it("clôture partielle (paie close sans présence verrouillée) → PARTIELLEMENT_CLOTUREE", () => {
    const etat = calculerEtatPeriode({
      ...mois("2026-08-01", "2026-08-31"),
      payrollPeriods: [{ startDate: "2026-08-01", endDate: "2026-08-31", status: "closed" }],
      summaries: [{ year: 2026, month: 8, locked: false }],
    });
    expect(etat.global).toBe("PARTIELLEMENT_CLOTUREE");
  });

  it("libellés mensuels FR", () => {
    expect(libelleMois("2026-08")).toBe("Août 2026");
    expect(libelleMois("2026-01")).toBe("Janvier 2026");
  });

  it("listeMoisCivils sur période multi-mois", () => {
    expect(listeMoisCivils("2026-08-15", "2026-10-05")).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("période inversée → liste vide", () => {
    expect(listeMoisCivils("2026-09-05", "2026-08-05")).toEqual([]);
  });
});

// ─── Projection §N (délégation calculatePayroll) ───

describe("projeterPaie / construireInputPaie (§N)", () => {
  const base = {
    modePaie: "SALAIRE_MENSUEL" as const,
    baseSalary: 150000,
    forfaitHebdomadaire: 0,
    overtimeHours: 0,
    daysPresent: 0,
    daysAbsent: 0,
    expectedWorkingDays: 26,
    normalHours: 0,
    taskBonus: 0,
    lateDeductionAmount: 0,
    absenceFinancialImpact: 0,
    advancesToRecover: [],
    weeksInPeriod: 1,
    ...INTERVAL,
  };

  it("input conforme au moteur de paie (payOnHours pour horaire)", () => {
    const input = construireInputPaie({ ...base });
    expect(input.modePaie).toBe("SALAIRE_MENSUEL");
    expect(input.payOnHours).toBe(false);
    const horaire = construireInputPaie({ ...base, modePaie: "SALAIRE_HORAIRE" });
    expect(horaire.payOnHours).toBe(true);
  });

  it("mensuel net ≈ brut − CNPS − IRPP (barème vide)", () => {
    const r = projeterPaie(base);
    expect(r.net).toBeCloseTo(150000 - (150000 * 4.5) / 100, 1);
    expect(r.gains).toBe(150000);
  });

  it("avance récupérée déduite du net (récup sur période)", () => {
    const r = projeterPaie({ ...base, advancesToRecover: [{ advanceId: 1, amount: 40000 }] });
    expect(r.net).toBeCloseTo(150000 - 6750 - 40000, 1);
    expect(r.retenues).toBeGreaterThan(6750);
  });

  it("jours absents → retenue absence basée sur base/26", () => {
    const r = projeterPaie({
      ...base,
      daysAbsent: 2,
      items: [
        ...base.items.filter((i) => i.code === "CNPS_EMPLOYE" || i.code === "CNPS_EMPLOYEUR" || i.code === "IRPP" || i.code === "AVANCE_RECUP"),
        { code: "ABSENCE", name: "Retenue absence", type: "deduction", method: "absent_days", params: { daysPerMonth: 26 } },
      ] as PayrollConfigItem[],
    });
    expect(r.net).toBeCloseTo(150000 - (150000 / 26) * 2 - 6750, 1);
  });

  it("NON_REMUNERE → net = 0 sans cotisation", () => {
    const r = projeterPaie({ ...base, modePaie: "NON_REMUNERE" });
    expect(r.net).toBe(0);
    expect(r.gains).toBe(0);
  });

  it("couvertureBulletin : période close couvrant [from,to] → net réel lié", () => {
    const trouve = couvertureBulletin({
      periods: [
        { id: 7, startDate: "2026-08-01", endDate: "2026-08-31", status: "closed" },
        { id: 8, startDate: "2026-09-01", endDate: "2026-09-30", status: "open" },
      ],
      entries: [{ employeeId: 3, periodId: 7, netPay: 143250 }],
      employeeId: 3,
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(trouve).toMatchObject({ periodId: 7, net: 143250 });
  });

  it("couvertureBulletin : ouvert ou débordant → null", () => {
    const null1 = couvertureBulletin({
      periods: [{ id: 8, startDate: "2026-09-01", endDate: "2026-09-30", status: "open" }],
      entries: [],
      employeeId: 3,
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(null1).toBeNull();
  });
});

// ─── Anomalies §20/§21 ───

const PRESENCE_VIDE: PeriodeAnalyse = {
  joursTheoriques: 0, joursPresence: 0, joursAbsence: 0, joursConges: 0, joursMuets: 0,
  heuresTheoriques: 0, heuresTravaillees: 0, heuresNormales: 0, heuresSupp: 0,
  retardTotalMinutes: 0, departAnticipeTotalMinutes: 0, tauxPresence: 0, anomalies: [],
};

const SAL_BASE: SalairesRow = {
  baseContractuelle: 150000, gains: 143250, retenues: 6750, net: 143250,
  netLabel: "ESTIME", segments: [], tauxHoraire: 665.78, bulletinExiste: false,
};

const AV_VIDE: AvancesRow = { avancePeriode: 0, recuperePeriode: 0, soldeFinPeriode: 0, soldeActuel: 0, nbAvances: 0 };

function ctx(over: Partial<Parameters<typeof construireAnomalies>[0]> = {}) {
  return {
    periode: { from: "2026-08-01", to: "2026-08-31" },
    employe: {
      employeeId: 3, matricule: "EMP003", nom: "Test", prenom: "Jane", statut: "actif",
      departement: null, mode: "SALAIRE_MENSUEL" as const, contratExiste: true,
      dateEmbauche: "2024-01-15", dateSortie: null,
    },
    presence: PRESENCE_VIDE,
    salaires: SAL_BASE,
    avances: AV_VIDE,
    projectionNet: 143250,
    bulletinNet: null,
    today: "2026-08-31",
    ...over,
  };
}

describe("construireAnomalies (§21)", () => {
  it("aucune anomalie sur données propres", () => {
    expect(construireAnomalies(ctx())).toEqual([]);
  });

  it("ABSENCE_ELEVEE quand absent > 50 % des jours comptables", () => {
    const anomalies = construireAnomalies(ctx({
      presence: { ...PRESENCE_VIDE, joursTheoriques: 20, joursAbsence: 15, tauxPresence: 25 },
    }));
    expect(anomalies.map((a) => a.code)).toContain("ABSENCE_ELEVEE");
    expect(anomalies.find((a) => a.code === "ABSENCE_ELEVEE")?.gravite).toBe("ATTENTION");
  });

  it("seuil atteint pile → pas d'anomalie (strict >)", () => {
    const anomalies = construireAnomalies(ctx({
      presence: { ...PRESENCE_VIDE, joursTheoriques: 20, joursAbsence: 10, tauxPresence: 50 },
    }));
    expect(anomalies.map((a) => a.code)).not.toContain("ABSENCE_ELEVEE");
  });

  it("RETARDS_IMPORTANTS au-delà de 60 min cumulées", () => {
    const anomalies = construireAnomalies(ctx({
      presence: { ...PRESENCE_VIDE, retardTotalMinutes: 75 },
    }));
    expect(anomalies.map((a) => a.code)).toContain("RETARDS_IMPORTANTS");
  });

  it("NET_NEGATIF détecté et critique (jamais Math.max(0,...))", () => {
    const anomalies = construireAnomalies(ctx({
      salaires: { ...SAL_BASE, net: -15000, gains: 60000 },
      projectionNet: -15000,
    }));
    const a = anomalies.find((x) => x.code === "NET_NEGATIF");
    expect(a).toBeTruthy();
    expect(a?.gravite).toBe("CRITIQUE");
  });

  it("SALAIRE_SUPÉRIEUR base ×3 → SALAIRE_INHABITUEL", () => {
    const anomalies = construireAnomalies(ctx({
      salaires: { ...SAL_BASE, gains: 600000, net: 555000 },
    }));
    expect(anomalies.map((a) => a.code)).toContain("SALAIRE_INHABITUEL");
  });

  it("AVANCE_SUPERIEURE_SALAIRE quand versé > base", () => {
    const anomalies = construireAnomalies(ctx({
      avances: { ...AV_VIDE, avancePeriode: 200000, nbAvances: 1 },
    }));
    expect(anomalies.map((a) => a.code)).toContain("AVANCE_SUPERIEURE_SALAIRE");
  });

  it("SOLDE_AVANCE_IMPORTANT quand solde fin > base ×1,5", () => {
    const anomalies = construireAnomalies(ctx({
      avances: { ...AV_VIDE, soldeFinPeriode: 300000 },
    }));
    expect(anomalies.map((a) => a.code)).toContain("SOLDE_AVANCE_IMPORTANT");
  });

  it("RECUPERATION_IMPOSSIBLE : solde actuel > 0 + employé sorti", () => {
    const anomalies = construireAnomalies(ctx({
      employe: { ...ctx().employe, statut: "sorti" },
      avances: { ...AV_VIDE, soldeActuel: 50000 },
    }));
    expect(anomalies.map((a) => a.code)).toContain("RECUPERATION_IMPOSSIBLE");
  });

  it("CONTRAT_MANQUANT critique sans données salariales", () => {
    const anomalies = construireAnomalies(ctx({ employe: { ...ctx().employe, contratExiste: false } }));
    const a = anomalies.find((x) => x.code === "CONTRAT_MANQUANT");
    expect(a?.gravite).toBe("CRITIQUE");
  });

  it("MODE_REMUNERATION_MANQUANT quand mode null", () => {
    const anomalies = construireAnomalies(ctx({ employe: { ...ctx().employe, mode: null } }));
    expect(anomalies.map((a) => a.code)).toContain("MODE_REMUNERATION_MANQUANT");
  });

  it("BULLETIN_DIFFERENT_PROJECTION : écart réel/projection > seuil", () => {
    const anomalies = construireAnomalies(ctx({
      salaires: { ...SAL_BASE, netLabel: "REEL", bulletinExiste: true, net: 130000 },
      projectionNet: 143250,
      bulletinNet: 130000,
    }));
    expect(anomalies.map((a) => a.code)).toContain("BULLETIN_DIFFERENT_PROJECTION");
  });

  it("tri par gravité CRITIQUE d'abord", () => {
    const anomalies = construireAnomalies(ctx({
      employe: { ...ctx().employe, contratExiste: false, statut: null, mode: null },
      salaires: { ...SAL_BASE, net: -10 },
    }));
    expect(anomalies[0].gravite).toBe("CRITIQUE");
    for (let i = 1; i < anomalies.length; i++) {
      const ord = { CRITIQUE: 0, ATTENTION: 1, INFO: 2 };
      expect(ord[anomalies[i].gravite]).toBeGreaterThanOrEqual(ord[anomalies[i - 1].gravite]);
    }
  });
});

describe("filtrerAnomaliesParPermission (§20 — masquage serveur)", () => {
  it("gardé avec la permission, retiré sans", () => {
    for (const code of ["SALAIRE_INHABITUEL", "AVANCE_SUPERIEURE_SALAIRE", "SOLDE_AVANCE_IMPORTANT", "NET_NEGATIF", "BULLETIN_DIFFERENT_PROJECTION", "SALAIRE_SANS_CONTRAT", "RECUPERATION_IMPOSSIBLE"]) {
      const a = construireAnomalies(ctx({
        salaires: {
          ...SAL_BASE,
          gains: 600000,
          net: -5,
          netLabel: "REEL",
          bulletinExiste: true,
        },
        avances: { ...AV_VIDE, avancePeriode: 999999, soldeFinPeriode: 999999, soldeActuel: 1 },
        employe: { ...ctx().employe, statut: "sorti", contratExiste: false },
        bulletinNet: 100,
      }));
      const avec = filtrerAnomaliesParPermission(a, true);
      expect(avec.some((x) => x.code === code)).toBe(true);
      const sans = filtrerAnomaliesParPermission(a, false);
      expect(sans.some((x) => x.code === code)).toBe(false);
    }
  });

  it("les anomalies sans montant protégé restent visibles sans la permission", () => {
    const a = construireAnomalies(ctx({
      employe: { ...ctx().employe, contratExiste: false },
      presence: { ...PRESENCE_VIDE, joursTheoriques: 20, joursAbsence: 15, retardTotalMinutes: 90, joursMuets: 3 },
    }));
    const sans = filtrerAnomaliesParPermission(a, false);
    expect(sans.map((x) => x.code)).toEqual(expect.arrayContaining(["CONTRAT_MANQUANT", "ABSENCE_ELEVEE", "RETARDS_IMPORTANTS", "JOURNEE_INCOMPLETE"]));
    expect(sans).not.toContain("NET_NEGATIF");
  });
});

// ─── Tri / agrégats / résumé ───

describe("trierLignes / agregerLignes / resumerAnomalies", () => {
  interface LigneOver {
    gains?: number;
    net?: number;
    joursAbsence?: number;
    heuresTravaillees?: number;
    retardTotalMinutes?: number;
  }
  function ligne(id: number, nom: string, mat: string, over: LigneOver = {}): LigneSituation {
    return {
      employeeId: id,
      matricule: mat,
      prenom: null,
      nom,
      departement: null,
      statut: "actif",
      mode: "SALAIRE_MENSUEL",
      joursTheoriques: 20,
      joursPresence: 18,
      joursAbsence: over.joursAbsence ?? 0,
      joursConges: 0,
      joursMuets: 0,
      heuresTheoriques: 160,
      heuresTravaillees: over.heuresTravaillees ?? 144,
      heuresNormales: 144,
      heuresSupp: 0,
      retardTotalMinutes: over.retardTotalMinutes ?? 0,
      departAnticipeTotalMinutes: 0,
      tauxPresence: 90,
      salaires: { ...SAL_BASE, gains: over.gains ?? 143250, net: over.net ?? 143250 },
      avances: AV_VIDE,
      anomalies: [],
    };
  }

  it("tri serveur par nom asc/desc", () => {
    const rows = [ligne(1, "Abel", "E1", {}), ligne(2, "Zoe", "E2", {}), ligne(3, "Marc", "E3", {})];
    expect(trierLignes(rows, "nom", "asc").map((r) => r.nom)).toEqual(["Abel", "Marc", "Zoe"]);
    expect(trierLignes(rows, "nom", "desc").map((r) => r.nom)).toEqual(["Zoe", "Marc", "Abel"]);
  });

  it("tri par net numérique (bout de liste)", () => {
    const rows = [ligne(1, "A", "E1", { net: 1000 }), ligne(2, "B", "E2", { net: 500 })];
    expect(trierLignes(rows, "net", "desc").map((r) => r.employeeId)).toEqual([1, 2]);
  });

  it("tri mixte nulls de net en dernier", () => {
    const rows = [ligne(1, "A", "E1", { net: 1000 }), ligne(2, "B", "E2", { net: 500 })];
    const sansSal = { ...ligne(3, "C", "E3", { net: 0 }), salaires: null };
    const tri = trierLignes([...rows, sansSal], "net", "desc");
    expect(tri[tri.length - 1].employeeId).toBe(3);
  });

  it("agrégats sur le jeu filtré (masse nulle sans permission)", () => {
    const rows = [ligne(1, "A", "E1", { gains: 100000, net: 90000 }), ligne(2, "B", "E2", { gains: 50000, net: 45000 })];
    const avec = agregerLignes(rows, true);
    expect(avec.employes).toBe(2);
    expect(avec.masseAcquise).toBe(150000);
    const sans = agregerLignes(rows, false);
    expect(sans.masseAcquise).toBeNull();
    expect(sans.avancePeriode).toBeNull();
  });

  it("résumé anomalies par type/gravité", () => {
    const anomalies = construireAnomalies(ctx({
      employe: { ...ctx().employe, contratExiste: false },
      presence: { ...PRESENCE_VIDE, joursTheoriques: 20, joursAbsence: 15, retardTotalMinutes: 90 },
      salaires: { ...SAL_BASE, net: -5 },
    }));
    const rows = [{ ...ligne(1, "A", "E1", {}), anomalies }];
    const res = resumerAnomalies(rows);
    expect(res.total).toBe(anomalies.length);
    expect(res.parGravite.CRITIQUE).toBeGreaterThan(0);
    expect(res.parType.ALERTE_METIER).toBeGreaterThan(0);
  });
});

// ─── Timeline §23 ───

describe("classifierJourDetail (§23)", () => {
  const calc = (over = {}) => ({
    codePresence: "P", isAbsent: false, workedMinutes: 480, normalMinutes: 480,
    overtimeMinutes: 0, lateMinutes: 0, earlyDepartureMinutes: 0, ...over,
  });
  const saisie = (over = {}) => ({
    timeIn: "08:00", timeInBreak: null, timeOutBreak: null, timeOut: "17:00", validated: true, ...over,
  });

  it("jour ouvré pointé complet → PRESENT non provisoire", () => {
    const j = classifierJourDetail({ date: "2026-08-10", isWorkingDay: true, calc: calc(), saisie: saisie(), today: "2026-08-31" });
    expect(j.etat).toBe("PRESENT");
    expect(j.provisoire).toBe(false);
    expect(j.arrivee).toBe("08:00");
    expect(j.travailMinutes).toBe(480);
  });

  it("saisie non validée → provisoire", () => {
    const j = classifierJourDetail({ date: "2026-08-10", isWorkingDay: true, calc: calc(), saisie: saisie({ validated: false }), today: "2026-08-31" });
    expect(j.etat).toBe("PRESENT");
    expect(j.provisoire).toBe(true);
  });

  it("journée en cours : aujourd'hui sans départ pointé", () => {
    const j = classifierJourDetail({ date: "2026-08-20", isWorkingDay: true, calc: calc({ lateMinutes: 10 }), saisie: saisie({ timeOut: null }), today: "2026-08-20" });
    expect(j.etat).toBe("JOURNEE_EN_COURS");
    expect(j.provisoire).toBe(true);
  });

  it("absence → ABSENT", () => {
    const j = classifierJourDetail({ date: "2026-08-11", isWorkingDay: true, calc: calc({ codePresence: "A", isAbsent: true }), saisie: null, today: "2026-08-31" });
    expect(j.etat).toBe("ABSENT");
  });

  it("congé C/M/O/F → CONGE", () => {
    const j = classifierJourDetail({ date: "2026-08-12", isWorkingDay: true, calc: calc({ codePresence: "C" }), saisie: null, today: "2026-08-31" });
    expect(j.etat).toBe("CONGE");
  });

  it("jour non ouvré ou futur → NON_COMPTABILISE", () => {
    const dim = classifierJourDetail({ date: "2026-08-16", isWorkingDay: false, calc: null, saisie: null, today: "2026-08-31" });
    expect(dim.etat).toBe("NON_COMPTABILISE");
    const futur = classifierJourDetail({ date: "2026-09-02", isWorkingDay: true, calc: null, saisie: null, today: "2026-08-31" });
    expect(futur.etat).toBe("NON_COMPTABILISE");
  });

  it("jour comptable sans saisie → MUET", () => {
    const j = classifierJourDetail({ date: "2026-08-13", isWorkingDay: true, calc: null, saisie: null, today: "2026-08-31" });
    expect(j.etat).toBe("MUET");
  });

  it("retard et HS remontés dans le détail", () => {
    const j = classifierJourDetail({ date: "2026-08-10", isWorkingDay: true, calc: calc({ lateMinutes: 12, overtimeMinutes: 90 }), saisie: saisie(), today: "2026-08-31" });
    expect(j.retardMinutes).toBe(12);
    expect(j.heuresSuppMinutes).toBe(90);
  });
});

// ─── Origine §22 ───

describe("construireOrigine (§22)", () => {
  it("une ligne d'origine par code, avec règle et base", () => {
    const proj = projeterPaie({
      modePaie: "SALAIRE_MENSUEL", baseSalary: 150000, forfaitHebdomadaire: 0,
      overtimeHours: 0, daysPresent: 0, daysAbsent: 0, expectedWorkingDays: 26,
      normalHours: 150, taskBonus: 5000, lateDeductionAmount: 0, absenceFinancialImpact: 0,
      advancesToRecover: [{ advanceId: 1, amount: 20000 }], weeksInPeriod: 1, ...INTERVAL,
    });
    const origine = construireOrigine(proj.result, {
      baseSalary: 150000,
      evenementsParCode: { AVANCE_RECUP: ["2026-08-25"] },
    });
    expect(origine.length).toBe(proj.result.lines.length);
    const avance = origine.find((o) => o.regle === "recovery");
    expect(avance?.source).toBe("Avances");
    expect(avance?.evenements).toEqual(["2026-08-25"]);
    const base = origine.find((o) => o.regle === "base_param");
    expect(base?.baseCalcul).toContain("150 000");
  });
});