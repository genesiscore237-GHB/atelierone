import { describe, it, expect } from "vitest";
import {
  presenceRate,
  presenceRateForHeadcount,
  classifierJour,
  joursComptablesEmployeMois,
  analyserPeriode,
  repartition,
  payrollMass,
  toCsv,
  workingDaysInMonth,
  effectifParStatut,
  type JourAnalyseInput,
  type EmployePourJoursComptables,
} from "./rh-stats-engine";

describe("presenceRate", () => {
  it("calcule le taux de présence arrondi à 0,1", () => {
    expect(presenceRate(20, 25)).toEqual({ presentDays: 20, paidDays: 25, rate: 80 });
    expect(presenceRate(10, 25)).toEqual({ presentDays: 10, paidDays: 25, rate: 40 });
  });

  it("0 jour ouvé → taux 0", () => {
    expect(presenceRate(5, 0)).toEqual({ presentDays: 5, paidDays: 0, rate: 0 });
  });
});

describe("P07 — presenceRateForHeadcount", () => {
  it("dénominateur = jours ouvrés × effectif, taux ∈ [0,100]", () => {
    // 25 employés × 20 jours = 500 jours attendus ; 450 présents
    const r = presenceRateForHeadcount(450, 20, 25);
    expect(r.paidDays).toBe(500);
    expect(r.rate).toBe(90);
  });

  it("reste ≤ 100 même quand Σ jours présents ≈ jours ouvrés totaux", () => {
    // Sans × effectif le taux serait 100 % déjà ; avec effectif > 1 il diminue
    const r = presenceRateForHeadcount(100, 20, 5);
    expect(r.rate).toBe(100); // 100 / (20×5) = 100 % max théorique
  });

  it("effective : présentTotal cumulé < workingDays → baisse du taux réel", () => {
    const r = presenceRateForHeadcount(20, 20, 5);
    expect(r.rate).toBe(20); // 20 / 100
  });

  it("0 jour ouvré → taux 0 (quand même avec effectif)", () => {
    const r = presenceRateForHeadcount(5, 0, 5);
    expect(r.rate).toBe(0);
  });
});

describe("N06/P06/P08 — classifierJour", () => {
  it("C/M/O/F = CONGE (ni présent ni absent)", () => {
    expect(classifierJour("C", false)).toBe("CONGE");
    expect(classifierJour("M", false)).toBe("CONGE");
    expect(classifierJour("O", false)).toBe("CONGE");
    expect(classifierJour("F", false)).toBe("CONGE");
  });

  it("A ou isAbsent = ABSENCE", () => {
    expect(classifierJour("A", false)).toBe("ABSENCE");
    expect(classifierJour("P", true)).toBe("ABSENCE");
    expect(classifierJour(null, true)).toBe("ABSENCE");
  });

  it("P/HS/R = PRESENCE", () => {
    expect(classifierJour("P", false)).toBe("PRESENCE");
    expect(classifierJour("HS", false)).toBe("PRESENCE");
    expect(classifierJour("R", false)).toBe("PRESENCE");
    expect(classifierJour(null, false)).toBe("PRESENCE");
  });
});

describe("analyse de période (Phase 4)", () => {
  const jour = (partial: Partial<JourAnalyseInput>): JourAnalyseInput => ({
    date: "2026-08-10",
    code: "P",
    isWorkingDay: true,
    heuresTheoriques: 9.5,
    workedMinutes: 570,
    normalMinutes: 570,
    overtimeMinutes: 0,
    lateMinutes: 0,
    earlyDepartureMinutes: 0,
    ...partial,
  });

  it("cumule jours théoriques/présents/absents/congés/muets + heures", () => {
    const r = analyserPeriode([
      jour({ date: "2026-08-03", code: "P" }),
      jour({ date: "2026-08-04", code: "HS", workedMinutes: 630, overtimeMinutes: 60 }),
      jour({ date: "2026-08-05", code: "R", lateMinutes: 25, workedMinutes: 540, normalMinutes: 540 }),
      jour({ date: "2026-08-06", code: "A", workedMinutes: 0, normalMinutes: 0 }),
      jour({ date: "2026-08-07", code: "C", workedMinutes: 0, normalMinutes: 0 }),
      jour({ date: "2026-08-08", code: "MUET", workedMinutes: 0, normalMinutes: 0 }),
      jour({ date: "2026-08-09", code: "P", isWorkingDay: false }), // dimanche : hors périmètre
    ]);
    expect(r.joursTheoriques).toBe(6);
    expect(r.joursPresence).toBe(3);
    expect(r.joursAbsence).toBe(1);
    expect(r.joursConges).toBe(1);
    expect(r.joursMuets).toBe(1);
    expect(r.heuresTheoriques).toBeCloseTo(9.5 * 6, 1);
    expect(r.heuresTravaillees).toBeCloseTo(9.5 + 10.5 + 9.0, 1); // P=9,5 ; HS=10,5 ; R=9,0 (25 min de retard, 9,0 h réellement travaillées)
    expect(r.heuresNormales).toBeCloseTo(9.5 * 2 + 9.0, 1);
    expect(r.heuresSupp).toBe(1);
    expect(r.retardTotalMinutes).toBe(25);
    expect(r.tauxPresence).toBe(50); // 3 / 6
  });

  it("liste les anomalies (AB) : retards, absences, non pointés", () => {
    const r = analyserPeriode([
      jour({ date: "2026-08-03", code: "R", lateMinutes: 10 }),
      jour({ date: "2026-08-04", code: "A" }),
      jour({ date: "2026-08-05", code: "MUET" }),
    ]);
    expect(r.anomalies).toEqual([
      { date: "2026-08-03", code: "R", detail: "Retard 10 min" },
      { date: "2026-08-04", code: "A", detail: "Jour d'absence" },
      { date: "2026-08-05", code: "MUET", detail: "Non pointé — aucune saisie du jour" },
    ]);
  });

  it("période vide → zéros", () => {
    expect(analyserPeriode([])).toMatchObject({
      joursTheoriques: 0,
      tauxPresence: 0,
      anomalies: [],
    });
  });
});

describe("repartition", () => {
  it("compte par label, tri décroissant, « Non défini » pour null", () => {
    const r = repartition([
      { key: "a", label: "Atelier" },
      { key: "b", label: "Atelier" },
      { key: "c", label: "Accueil" },
      { key: null, label: null },
    ]);
    expect(r).toEqual([
      { label: "Atelier", count: 2 },
      { label: "Accueil", count: 1 },
      { label: "Non défini", count: 1 },
    ]);
  });
});

describe("payrollMass", () => {
  it("somme les salaires", () => {
    expect(payrollMass([400000, "250000", null, undefined])).toBe(650000);
    expect(payrollMass([])).toBe(0);
  });
});

describe("toCsv", () => {
  it("échappe les virgules, points-virgules et guillemets", () => {
    const csv = toCsv(["Nom", "Motif"], [["Dupont, Jean", 'Il a dit "bonjour"']]);
    expect(csv).toContain('"Dupont, Jean"');
    expect(csv).toContain('"Il a dit ""bonjour"""');
    expect(csv).toContain("\r\n");
  });

  it("lignes simples sans échappement", () => {
    const csv = toCsv(["A", "B"], [[1, "x"]]);
    expect(csv).toBe("A;B\r\n1;x");
  });
});

describe("workingDaysInMonth", () => {
  it("août 2026 : 26 jours ouvrés (lun-sat, 5 dimanches)", () => {
    // août 2026 : 1er = samedi, 31 jours, 5 dimanches → 31-5 = 26
    expect(workingDaysInMonth(2026, 8)).toBe(26);
  });

  it("exclut les fériés", () => {
    expect(workingDaysInMonth(2026, 8, ["2026-08-15"])).toBe(25);
  });
});

describe("P07/P08 — joursComptablesEmployeMois (dénominateur KPI, bug C)", () => {
  const emp = (partial: Partial<EmployePourJoursComptables> = {}): EmployePourJoursComptables => ({
    workCycleId: 1,
    dateEmbauche: null,
    dateSortie: null,
    ...partial,
  });
  const nonWorking = new Map<number, Set<number>>([[1, new Set([0])]]); // cycle 1 : seul dimanche non travaillé (lun-sam)

  it("août 2026 (lun-sam, seul dimanche exclu) : 26 jours", () => {
    // août 2026 : 31 jours, 5 dimanches → 31-5 = 26
    expect(joursComptablesEmployeMois(2026, 8, emp(), nonWorking, [])).toBe(26);
  });

  it("sans cycle → 0 jour (jamais au dénominateur)", () => {
    expect(joursComptablesEmployeMois(2026, 8, emp({ workCycleId: null }), nonWorking, [])).toBe(0);
  });

  it("exclut les fériés", () => {
    expect(joursComptablesEmployeMois(2026, 8, emp(), nonWorking, ["2026-08-13"])).toBe(25);
  });

  it("bornes P05 : hors période d'emploi non compté (début/sortie)", () => {
    // embauche 22/08 → dimanches 23 et 30 exclus → 8 jours comptables du 22 au 31
    expect(joursComptablesEmployeMois(2026, 8, emp({ dateEmbauche: "2026-08-22" }), nonWorking, [])).toBe(8);
    // sortie 15/08 → jours 1..15 − dimanches 2 et 9 → 13
    expect(joursComptablesEmployeMois(2026, 8, emp({ dateSortie: "2026-08-15" }), nonWorking, [])).toBe(13);
  });

  it("septembre 2026 (lun-sam) : 30 − 4 dimanches = 26", () => {
    expect(joursComptablesEmployeMois(2026, 9, emp(), nonWorking, [])).toBe(26);
  });

  it("cycle lun-sam + samedi non travaillé : 21 jours en août", () => {
    const nonWorkingSam = new Map<number, Set<number>>([[1, new Set([0, 6])]]);
    expect(joursComptablesEmployeMois(2026, 8, emp(), nonWorkingSam, [])).toBe(21);
  });
});

describe("N11/P19 — effectifParStatut", () => {
  it("compte effectif vivant : actif + congé + suspendu, sorti/archive exclus", () => {
    expect(effectifParStatut(["actif", "actif", "conge", "suspendu", "sorti", "archive"])).toEqual({
      effectif: 4,
      actifs: 2,
      enConge: 1,
      suspendus: 1,
      inactifs: 2,
    });
  });

  it("liste vide → zéros", () => {
    expect(effectifParStatut([])).toEqual({ effectif: 0, actifs: 0, enConge: 0, suspendus: 0, inactifs: 0 });
  });
});
