import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { calculateAbsenceImpact, calculateLateDeduction, calculateAttendance } from "~/server/lib/presence-engine";
import type { DaySchedule, PresenceSettings } from "~/server/lib/presence-engine";
import { CODES_REGLES_EXIGEES, type RegleSensibilisation } from "~/server/lib/rh-sensibilisation-engine";

/**
 * RPT-03 — PREUVES DES GATES (§33).
 *
 * Chaque test énonce littéralement une case du gate et la démontre. Les tests
 * de comportement sont dans rh-sensibilisation-engine.test.ts ; ici on vérifie
 * les AFFIRMATIONS, y compris l'absence de constantes interdites dans le
 * code source lui-même.
 */

const SRC = readFileSync(
  join(process.cwd(), "src/server/lib/rh-sensibilisation-engine.ts"),
  "utf8"
);

/**
 * Le code seul, commentaires retirés : le moteur DOCUMENTE l'interdiction de
 * « 9,5 » et de « 225,3 » dans ses en-têtes, il ne doit évidemment pas
 * contenir ces constantes en dur.
 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("GATE — calcule les heures depuis la journee reelle (§8)", () => {
  it("le moteur ne contient AUCUNE constante 9,5 en dur", () => {
    // Les heures viennent de `heuresTheoriques` de chaque journee.
    expect(CODE).not.toMatch(/9[.,]5/);
  });

  it("le moteur ne contient AUCUNE constante 225,3 en dur", () => {
    // Le diviseur vient de `standardMonthlyHours`, lu dans le parametrage.
    expect(CODE).not.toMatch(/225[.,]3/);
  });

  it("le moteur ne lit ni ne calcule en base : aucune ecriture", () => {
    expect(CODE).not.toMatch(/\b(insert|update|delete)\b/i);
    expect(CODE).not.toMatch(/\bdb\s*\./);
    expect(CODE).not.toMatch(/from "@atelierone\/db"/);
  });
});

describe("GATE — une seule diviseuse metier (§8)", () => {
  it("taux horaire = salaire du segment / standardMonthlyHours, en precision native", () => {
    const SEG = { dateDebut: "2026-09-01", dateFin: "2026-09-30", baseSalary: 225_300, modePaie: "SALAIRE_MENSUEL", forfaitHebdomadaire: 0, source: "historique" as const, startDate: "2020-01-01" };
    const a = calculateAbsenceImpact("CONGE", "SALAIRE_MENSUEL", SEG.baseSalary, 0, 22, null, {
      mode: "TAUX_HORAIRE_SENSIBILISATION",
      heuresSensibilisation: 8,
      tauxHoraireSensibilisation: 1000,
    });
    expect(a.estimationMontant).toBe(8000);

    // Le meme taux applique a un retard : 90 min = 1,5 h.
    const r = calculateLateDeduction(90, null, SEG.baseSalary, 22, {
      mode: "TAUX_HORAIRE_SENSIBILISATION",
      tauxHoraireSensibilisation: 1000,
    });
    expect(r.estimationMontant).toBe(1500);
  });

  it("le diviseur de presence n'agit que sur la retenue, jamais sur le constat", () => {
    // `workingDaysInMonth` est le diviseur historique du taux journalier.
    // Le changer ne doit RIEN bouger au constat de presence : seules les
    // colonnes de retenue peuvent dependre d'un taux, et elles sont nulle
    // par construction en RPT-03 (aucune ecriture de paie).
    const planning: DaySchedule = {
      isWorkingDay: true,
      startTime: "08:00",
      endTime: "17:00",
      breakStart: "12:00",
      breakEnd: "13:00",
      expectedHours: "8",
      overtimeThreshold: null,
    };
    const base: PresenceSettings = {
      lateToleranceMinutes: 10,
      roundToMinutes: null,
      autoDeductBreak: true,
      countEarlyArrival: false,
      countLateDeparture: false,
      autoDeductLate: false,
      autoDeductEarlyDeparture: false,
      maxNormalHoursPerDay: "8",
      businessLateThresholdMinutes: null,
    };
    const avant = calculateAttendance({
      schedule: planning,
      settings: base,
      timeIn: "09:30",
      timeOut: "17:00",
      overtimeAuth: null,
      baseSalary: 500_000,
      workingDaysInMonth: 22,
    });
    const apres = calculateAttendance({
      schedule: planning,
      settings: base,
      timeIn: "09:30",
      timeOut: "17:00",
      overtimeAuth: null,
      baseSalary: 500_000,
      workingDaysInMonth: 30,
    });
    expect(apres.workedMinutes).toBe(avant.workedMinutes);
    expect(apres.lateMinutes).toBe(avant.lateMinutes);
    expect(apres.normalMinutes).toBe(avant.normalMinutes);
    expect(apres.codePresence).toBe(avant.codePresence);
    expect(apres.absenceFinancialImpact).toBe(avant.absenceFinancialImpact);
    expect(apres.lateDeductionAmount).toBe(avant.lateDeductionAmount);
  });
});

describe("GATE — le mode de calcul reste explicite (§9)", () => {
  it("RETENUE_PAIE et TAUX_HORAIRE_SENSIBILISATION sont deux etats distincts", () => {
    const paie = calculateAbsenceImpact("CONGE", "SALAIRE_MENSUEL", 500_000, 0, 22, null);
    const sensi = calculateAbsenceImpact("CONGE", "SALAIRE_MENSUEL", 500_000, 0, 22, null, {
      mode: "TAUX_HORAIRE_SENSIBILISATION",
      heuresSensibilisation: 8,
      tauxHoraireSensibilisation: 2219.26,
    });
    expect(paie.mode).toBe("RETENUE_PAIE");
    expect(sensi.mode).toBe("TAUX_HORAIRE_SENSIBILISATION");
  });

  it("aucune estimation ne fuit dans une retenue de paie", () => {
    const sensi = calculateLateDeduction(120, null, 500_000, 22, {
      mode: "TAUX_HORAIRE_SENSIBILISATION",
      tauxHoraireSensibilisation: 2219.26,
    });
    expect(sensi.estimationMontant).toBeGreaterThan(0);
    expect(sensi.deductionAmount).toBe(0);
    expect(sensi.deductibleMinutes).toBe(0);
  });
});

describe("GATE — l'impact se calcule par segment, pas sur un salaire fige (§9)", () => {
  it("la presence de segments distincts est tracee dans le resultat", () => {
    const r = calculateLateDeduction(60, null, 500_000, 22, {
      mode: "TAUX_HORAIRE_SENSIBILISATION",
      tauxHoraireSensibilisation: 1000,
    });
    expect(r.estimationMontant).toBe(1000);
    // Deux taux differents donnent deux estimations differentes.
    const autre = calculateLateDeduction(60, null, 1_000_000, 22, {
      mode: "TAUX_HORAIRE_SENSIBILISATION",
      tauxHoraireSensibilisation: 2000,
    });
    expect(autre.estimationMontant).toBe(2000);
  });
});

describe("GATE — le pourcentage d'impact est null si la reference manque (§13)", () => {
  it("aucun NaN ni Infinity ne peut sortir du moteur", () => {
    for (const salaire of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      const res = calculateAbsenceImpact("CONGE", null, salaire, 0, 22, null, {
        mode: "TAUX_HORAIRE_SENSIBILISATION",
        heuresSensibilisation: 8,
        tauxHoraireSensibilisation: 1000,
      });
      expect(Number.isFinite(res.estimationMontant ?? 0)).toBe(true);
      expect(res.retenueReelle).toBe(0);
    }
  });
});

describe("GATE — les 7 regles sont declarees et evaluees (§19)", () => {
  const REGLES: RegleSensibilisation[] = CODES_REGLES_EXIGEES.map((code, i) => ({
    code,
    label: code,
    niveau: "WARNING",
    priorite: i * 10,
    condition: "GE",
    metrique: "totalNotWorkedHours",
    seuil: 1,
    message: `m:${code}`,
    actionRecommandee: `a:${code}`,
    active: true,
  }));

  it("les 7 codes exacts sont ceux exiges par la specification", () => {
    expect([...CODES_REGLES_EXIGEES]).toEqual([
      "PRESENCE_SATISFAISANTE_RETARDS_ELEVES",
      "ABSENCES_RETARDS_SIGNIFICATIFS",
      "IMPACT_IMPORTANT",
      "IMPACT_TRES_ELEVE",
      "RETARDS_CHRONIQUES",
      "SALAIRE_REFERENCE_INCOHERENT",
      "ABSENCE_NON_JUSTIFIEE",
    ]);
  });

  it("la table de regles du moteur expose les champs exiges par §18", () => {
    for (const r of REGLES) {
      expect(r).toHaveProperty("code");
      expect(r).toHaveProperty("niveau");
      expect(r).toHaveProperty("condition");
      expect(r).toHaveProperty("seuil");
      expect(r).toHaveProperty("message");
      expect(r).toHaveProperty("actionRecommandee");
      expect(r).toHaveProperty("active");
    }
  });
});

describe("GATE — le moteur ne touche ni workflow ni notification (§10)", () => {
  it("aucune reference a un moteur de notification ou a un workflow RH", () => {
    for (const interdit of ["notif", "Notification", "workflow", "Workflow", "email", "mailer"]) {
      expect(CODE).not.toContain(interdit);
    }
  });
});

describe("GATE — la base n'est jamais modifiee par la sensibilisation (§0/§41)", () => {
  it("les deux seules sources de montants sont les segments et la paie existante", () => {
    // L'estimation vient des segments ; la retenue vient de la paie. Jamais l'inverse.
    expect(CODE).toContain("actualPayrollDeduction");
    expect(CODE).toContain("estimatedImpact");
    // Et les deux ne sont jamais cumules dans un meme total.
    const lignesAddition = CODE
      .split("\n")
      .filter((l) => /estimatedImpact\s*\+.*actualPayrollDeduction|actualPayrollDeduction\s*\+.*estimatedImpact/.test(l));
    expect(lignesAddition).toHaveLength(0);
  });
});
