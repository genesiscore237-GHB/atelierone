import { describe, it, expect } from "vitest";
import { calculateAttendance, dayThreshold, intervalleMois, type CalcInput } from "./presence-engine";

// Cycle « Atelier Standard » (specs MVP) : Lun–Ven 7h30–18h (pause 13h–14h),
// seuil HS 9,5h ; Samedi 7h30–12h seuil 4,5h.
const schedule = {
  startTime: "07:30",
  endTime: "18:00",
  breakStart: "13:00",
  breakEnd: "14:00",
  expectedHours: "9.5",
  overtimeThreshold: "9.5",
  isWorkingDay: true,
};

const settings = {
  lateToleranceMinutes: 5,
  roundToMinutes: 0,
  autoDeductBreak: true,
  countEarlyArrival: false,
  countLateDeparture: false,
  autoDeductLate: true,
  autoDeductEarlyDeparture: true,
  maxNormalHoursPerDay: "9.5",
};

function input(partial: Partial<CalcInput>): CalcInput {
  return {
    timeIn: "07:30",
    timeOut: "18:00",
    schedule,
    settings,
    overtimeAuth: null,
    ...partial,
  };
}

describe("RH-02 — moteur de pointage (specs MVP 02_Pointage)", () => {
  it("seuil HS du jour : cycle > plafond > attendu > défaut 9,5", () => {
    expect(dayThreshold(schedule, settings)).toBe(570);
    expect(dayThreshold({ ...schedule, overtimeThreshold: "4.5" }, settings)).toBe(270);
    expect(dayThreshold({ ...schedule, overtimeThreshold: null }, { ...settings, maxNormalHoursPerDay: "8.5" })).toBe(510);
    expect(dayThreshold({ ...schedule, overtimeThreshold: null, expectedHours: null }, { ...settings, maxNormalHoursPerDay: null })).toBe(570);
  });

  it("journée standard 7h30–18h → 9,5h normales, 0 HS, code P", () => {
    const r = calculateAttendance(input({}));
    expect(r.isAbsent).toBe(false);
    expect(r.rawMinutes).toBe(630); // 10,5h de présence brute
    expect(r.workedMinutes).toBe(570); // − 1h de pause
    expect(r.normalMinutes).toBe(570);
    expect(r.overtimeMinutes).toBe(0);
    expect(r.lateMinutes).toBe(0);
    expect(r.codePresence).toBe("P");
  });

  it("retard 30 min (tolérance 5) → 25 min indiquées, heures déduites, code R", () => {
    const r = calculateAttendance(input({ timeIn: "08:00" }));
    expect(r.lateMinutes).toBe(25);
    expect(r.workedMinutes).toBe(540);
    expect(r.normalMinutes).toBe(540);
    expect(r.codePresence).toBe("R");
  });

  it("arrivée anticipée NON validée → plafonnée à 7h30 (règle 1)", () => {
    const r = calculateAttendance(input({ timeIn: "07:00" }));
    expect(r.rawMinutes).toBe(630); // calculé depuis 07:30
    expect(r.lateMinutes).toBe(0);
  });

  it("arrivée anticipée validée (ligne) → l'extra compte", () => {
    const r = calculateAttendance(input({ timeIn: "07:00", validateEarlyArrival: true }));
    expect(r.rawMinutes).toBe(660);
    expect(r.workedMinutes).toBe(600);
  });

  it("arrivée anticipée validée (global) → l'extra compte", () => {
    const r = calculateAttendance(input({ timeIn: "07:00", settings: { ...settings, countEarlyArrival: true } }));
    expect(r.rawMinutes).toBe(660);
  });

  it("départ tardif NON validé → plafonné à 18h, pas de HS (règle 2)", () => {
    const r = calculateAttendance(input({ timeOut: "19:00" }));
    expect(r.rawMinutes).toBe(630);
    expect(r.overtimeMinutes).toBe(0);
  });

  it("départ tardif validé + seuil 9,5h dépassé SANS autorisation → 0 HS (règle CDC §2.3)", () => {
    const r = calculateAttendance(input({ timeOut: "19:00", validateLateDeparture: true }));
    expect(r.rawMinutes).toBe(690); // 7h30–19h
    expect(r.workedMinutes).toBe(630); // 10,5h
    expect(r.normalMinutes).toBe(570); // min(10,5 ; 9,5)
    expect(r.overtimeMinutes).toBe(0); // pas d'autorisation → HS ignorées
    expect(r.codePresence).toBe("P");
  });

  it("CDC cas 4 : départ 19:00 avec autorisation 2h approuvée → 8h30 + 1h HS", () => {
    const r = calculateAttendance(input({ timeOut: "19:00", validateLateDeparture: true, overtimeAuth: { maxHours: "2", status: "approuvee" } }));
    expect(r.normalMinutes).toBe(570);
    expect(r.overtimeMinutes).toBe(60); // 1h HS validée
    expect(r.codePresence).toBe("HS");
  });

  it("départ tardif validé (global) SANS autorisation → 0 HS (règle CDC)", () => {
    const r = calculateAttendance(input({ timeOut: "19:00", settings: { ...settings, countLateDeparture: true } }));
    expect(r.overtimeMinutes).toBe(0);
  });

  it("autorisation HS approuvée → plafonne les HS (supplément)", () => {
    const r = calculateAttendance(
      input({ timeOut: "20:00", validateLateDeparture: true, overtimeAuth: { maxHours: "1", status: "approuvee" } })
    );
    expect(r.overtimeMinutes).toBe(60); // plafonné à 1h alors que 2h potentielles
    expect(r.normalMinutes).toBe(570);
  });

  it("autorisation HS refusée → 0 HS (supplément)", () => {
    const r = calculateAttendance(
      input({ timeOut: "19:00", validateLateDeparture: true, overtimeAuth: { maxHours: "2", status: "refusee" } })
    );
    expect(r.overtimeMinutes).toBe(0);
  });

  it("samedi (seuil 4,5h) : départ validé SANS autorisation → 0 HS (règle CDC)", () => {
    const samedi = { ...schedule, startTime: "07:30", endTime: "12:00", breakStart: null, breakEnd: null, overtimeThreshold: "4.5" };
    const r = calculateAttendance(input({ schedule: samedi, timeIn: "07:30", timeOut: "12:30", validateLateDeparture: true }));
    expect(r.workedMinutes).toBe(300);
    expect(r.normalMinutes).toBe(270);
    expect(r.overtimeMinutes).toBe(0);
    expect(r.codePresence).toBe("P");
  });

  it("samedi : départ validé + autorisation 1h approuvée → 0,5h HS", () => {
    const samedi = { ...schedule, startTime: "07:30", endTime: "12:00", breakStart: null, breakEnd: null, overtimeThreshold: "4.5" };
    const r = calculateAttendance(input({ schedule: samedi, timeIn: "07:30", timeOut: "12:30", validateLateDeparture: true, overtimeAuth: { maxHours: "1", status: "approuvee" } }));
    expect(r.overtimeMinutes).toBe(30);
    expect(r.codePresence).toBe("HS");
  });

  it("samedi sans validation → départ plafonné à 12h, pas de HS", () => {
    const samedi = { ...schedule, startTime: "07:30", endTime: "12:00", breakStart: null, breakEnd: null, overtimeThreshold: "4.5" };
    const r = calculateAttendance(input({ schedule: samedi, timeIn: "07:30", timeOut: "12:30" }));
    expect(r.workedMinutes).toBe(270);
    expect(r.overtimeMinutes).toBe(0);
  });

  it("pause déduite seulement si la présence couvre la plage (règle 6)", () => {
    const r = calculateAttendance(input({ timeIn: "14:30", timeOut: "18:00" }));
    expect(r.breakMinutes).toBe(0);
    expect(r.workedMinutes).toBe(210); // 14:30–18:00 sans pause
  });

  it("départ anticipé → minutes manquantes déduites + indicateur", () => {
    const r = calculateAttendance(input({ timeOut: "16:00" }));
    expect(r.earlyDepartureMinutes).toBe(120);
    expect(r.workedMinutes).toBe(450);
    expect(r.codePresence).toBe("P");
  });

  it("pointage incomplet sur journée ouvrée → absent, code A", () => {
    const r = calculateAttendance(input({ timeIn: null, timeOut: null }));
    expect(r.isAbsent).toBe(true);
    expect(r.codePresence).toBe("A");
  });

  it("dimanche (cycle non ouvré) → pas d'absence", () => {
    const r = calculateAttendance(input({ schedule: { ...schedule, isWorkingDay: false }, timeIn: null, timeOut: null }));
    expect(r.isAbsent).toBe(false);
    expect(r.codePresence).toBe("P");
  });

  it("jour férié → pas d'absence", () => {
    const r = calculateAttendance(input({ timeIn: null, timeOut: null, isPublicHoliday: true }));
    expect(r.isAbsent).toBe(false);
  });
});

describe("MISSION §10 — retards constatés vs déductibles", () => {
  it("retard constaté classique (arrivée 8h00, tolérance 5 min → 25 min constatées)", () => {
    const r = calculateAttendance(input({ timeIn: "08:00" }));
    expect(r.lateMinutes).toBe(25); // 8h00 − 7h30 − 5 min
    expect(r.codePresence).toBe("R");
  });

  it("règle TAUX_HORAIRE : le retard déductible = retard constaté × taux", () => {
    const baseSalary = 200000;
    const workingDays = 26;
    const tauxHoraire = baseSalary / (workingDays * 8);
    const r = calculateAttendance(
      input({
        timeIn: "08:00",
        baseSalary,
        workingDaysInMonth: workingDays,
        lateDeductionRule: { method: "TAUX_HORAIRE", params: {} },
      })
    );
    expect(r.lateDeductibleMinutes).toBe(25);
    expect(r.lateDeductionAmount).toBeCloseTo((25 / 60) * tauxHoraire, 1);
  });

  it("règle FORFAIT_MINUTE : taux fixe par minute de retard", () => {
    const r = calculateAttendance(
      input({
        timeIn: "08:00",
        lateDeductionRule: { method: "FORFAIT_MINUTE", params: { forfaitParMinute: 50 } },
      })
    );
    expect(r.lateDeductibleMinutes).toBe(25);
    expect(r.lateDeductionAmount).toBe(25 * 50);
  });

  it("absence justifiée non rémunérée sans pointage → absent, code A", () => {
    const r = calculateAttendance(input({ timeIn: null, timeOut: null, absenceType: "JUSTIFIEE_NON_REMUNEREE" }));
    expect(r.isAbsent).toBe(true);
    expect(r.codePresence).toBe("A");
  });

  it("congé planifié → code C, pas d'absence", () => {
    const r = calculateAttendance(input({ timeIn: null, timeOut: null, absenceType: "CONGE" }));
    expect(r.isAbsent).toBe(false);
    expect(r.codePresence).toBe("C");
  });

  it("jour hors période d'emploi → traité comme hors période", () => {
    const r = calculateAttendance(input({ timeIn: null, timeOut: null, details: { horsPeriodeEmploi: true } }));
    expect(r.codePresence).toBe("A");
    expect(r.isAbsent).toBe(true);
  });
});

describe("P05 — borne de clôture du mois (intervalle [début, finExclusive[)", () => {
  it("septembre 2025 → [2025-09-01, 2025-10-01[", () => {
    expect(intervalleMois(2025, 9)).toEqual({ debut: "2025-09-01", finExclusive: "2025-10-01" });
  });

  it("décembre → chevauchement d'année (finExclusive en janvier N+1)", () => {
    expect(intervalleMois(2025, 12)).toEqual({ debut: "2025-12-01", finExclusive: "2026-01-01" });
  });

  it("janvier → janvier précédent non affecté", () => {
    expect(intervalleMois(2025, 1)).toEqual({ debut: "2025-01-01", finExclusive: "2025-02-01" });
  });

  it("bornes : 30/09 inclus (filtre gte(debut) + lt(finExclusive)), 01/10 exclu", () => {
    const { debut, finExclusive } = intervalleMois(2025, 9);
    const dansLeMois = (iso: string) => iso >= debut && iso < finExclusive;
    expect(dansLeMois("2025-09-30")).toBe(true); // dernier jour du mois M : INCLUS
    expect(dansLeMois("2025-10-01")).toBe(false); // 1er du mois M+1 : EXCLU (bug P05 corrigé)
    expect(dansLeMois("2025-09-01")).toBe(true);
    expect(dansLeMois("2025-08-31")).toBe(false);
  });
});