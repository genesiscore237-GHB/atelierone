import { describe, it, expect } from "vitest";
import { calculateAttendance, type CalcInput } from "./presence-engine";

// Paramètres RH-00 du garage (seed) : cycle Atelier Standard,
// tolérance 5 min, pause 13h-14h déduite, plafond 8h30.
const schedule = {
  startTime: "07:30",
  endTime: "18:00",
  breakStart: "13:00",
  breakEnd: "14:00",
  expectedHours: "9.5",
  isWorkingDay: true,
};

const settings = {
  lateToleranceMinutes: 5,
  roundToMinutes: 5,
  autoDeductBreak: true,
  countEarlyArrival: false,
  maxNormalHoursPerDay: "8.5",
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

describe("RH-02 — moteur de calcul des présences", () => {
  it("CAS 1 : journée standard 07:30-18:00 → 8h30 normales, 0 HS", () => {
    const r = calculateAttendance(input({}));
    expect(r.isAbsent).toBe(false);
    expect(r.workedMinutes).toBe(570); // 9h30 de présence
    expect(r.normalMinutes).toBe(510); // 8h30 (plafond)
    expect(r.overtimeMinutes).toBe(0);
    expect(r.lateMinutes).toBe(0);
  });

  it("CAS 2 : arrivée 08:00 → 25 min de retard", () => {
    const r = calculateAttendance(input({ timeIn: "08:00" }));
    expect(r.lateMinutes).toBe(25);
    expect(r.isAbsent).toBe(false);
  });

  it("CAS 3 : départ 19:00 sans autorisation → 8h30, 0 HS", () => {
    const r = calculateAttendance(input({ timeOut: "19:00" }));
    expect(r.overtimeMinutes).toBe(0);
    expect(r.normalMinutes).toBe(510);
  });

  it("CAS 4 : départ 19:00 avec autorisation 2h approuvée → 8h30 + 1h HS", () => {
    const r = calculateAttendance(
      input({
        timeOut: "19:00",
        overtimeAuth: { maxHours: "2", status: "approuvee" },
      })
    );
    expect(r.overtimeMinutes).toBe(60);
    expect(r.normalMinutes).toBe(510);
  });

  it("CAS 4b : autorisation refusée → HS ignorées", () => {
    const r = calculateAttendance(
      input({
        timeOut: "19:00",
        overtimeAuth: { maxHours: "2", status: "refusee" },
      })
    );
    expect(r.overtimeMinutes).toBe(0);
    expect(r.normalMinutes).toBe(510);
  });

  it("CAS 5 : horaires modifiés dans RH-00 → le calcul utilise les nouvelles valeurs", () => {
    const r = calculateAttendance(
      input({
        schedule: { ...schedule, startTime: "08:00", endTime: "17:00" },
        timeIn: "08:00",
        timeOut: "17:00",
      })
    );
    expect(r.lateMinutes).toBe(0);
    expect(r.rawMinutes).toBe(540);
    expect(r.workedMinutes).toBe(480); // 8h (pause déduite)
  });

  it("CAS 6 : jour férié paramétré → traité comme non ouvré (pas d'absence)", () => {
    const r = calculateAttendance(
      input({ timeIn: null, timeOut: null, isPublicHoliday: true })
    );
    expect(r.isAbsent).toBe(false);
    expect(r.details.reason).toBe("jour non ouvre");
  });

  it("dimanche (cycle) → non ouvré, pas d'absence", () => {
    const r = calculateAttendance(
      input({ schedule: { ...schedule, isWorkingDay: false }, timeIn: null, timeOut: null })
    );
    expect(r.isAbsent).toBe(false);
  });

  it("pointage incomplet sur journée ouvrée → absent", () => {
    const r = calculateAttendance(input({ timeIn: null, timeOut: null }));
    expect(r.isAbsent).toBe(true);
  });

  it("départ anticipé : départ 16:00 → 120 min", () => {
    const r = calculateAttendance(input({ timeOut: "16:00" }));
    expect(r.earlyDepartureMinutes).toBe(120);
  });

  it("arrivée anticipée non comptée (countEarlyArrival=false)", () => {
    const r = calculateAttendance(input({ timeIn: "07:00", timeOut: "18:00" }));
    expect(r.rawMinutes).toBe(630); // calculé depuis 07:30, pas 07:00
  });

  it("arrivée anticipée comptée (countEarlyArrival=true)", () => {
    const r = calculateAttendance(
      input({
        timeIn: "07:00",
        timeOut: "18:00",
        settings: { ...settings, countEarlyArrival: true },
      })
    );
    expect(r.rawMinutes).toBe(660);
  });
});
