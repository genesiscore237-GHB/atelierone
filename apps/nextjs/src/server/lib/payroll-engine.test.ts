import { describe, it, expect } from "vitest";
import { calculatePayroll, progressiveTax, type PayrollInput, type PayrollConfigItem } from "./payroll-engine";

// Barème IRPP camerounais (paramétrable dans la config)
const IRPP_SCALE = [
  { max: 40000, rate: 0 },
  { max: 120000, rate: 10 },
  { max: 300000, rate: 15 },
  { max: 500000, rate: 25 },
  { max: null, rate: 35 },
];

const base: PayrollConfigItem[] = [
  { code: "PRIME_PRESENCE", name: "Prime de présence", type: "earning", method: "percent", params: { percent: 10, minAttendancePct: 95 } },
  { code: "PRIME_PERFORMANCE", name: "Prime de performance", type: "earning", method: "manual", params: {} },
  { code: "HS", name: "Heures supplémentaires", type: "earning", method: "hours_x_rate", params: { rate: 1.25 } },
  { code: "PRIME_TRANSPORT", name: "Prime de transport", type: "earning", method: "fixed", params: { amount: 0 } },
  { code: "RETENUE_ABSENCE", name: "Absences non justifiées", type: "deduction", method: "absent_days", params: { daysPerMonth: 26 } },
  { code: "AVANCE", name: "Avance sur salaire", type: "deduction", method: "manual", params: {} },
  { code: "CNPS_EMPLOYE", name: "CNPS salariale", type: "deduction", method: "percent", params: { percent: 4.5 } },
  { code: "CNPS_EMPLOYEUR", name: "CNPS patronale", type: "deduction", method: "percent", params: { percent: 5.6 } },
  { code: "IRPP", name: "IRPP", type: "deduction", method: "scale", params: { scale: IRPP_SCALE } },
];

function input(partial: Partial<PayrollInput>): PayrollInput {
  return {
    baseSalary: 150000,
    overtimeHours: 0,
    daysPresent: 26,
    daysAbsent: 0,
    expectedWorkingDays: 26,
    performanceBonus: 0,
    manualAdjustments: [],
    items: base,
    ...partial,
  };
}

describe("barème IRPP progressif", () => {
  it("tranches : 100 000 → 10 % sur (100 000 − 40 000) = 6 000", () => {
    expect(progressiveTax(100000, IRPP_SCALE)).toBe(6000);
  });
  it("tranches : 157 575 → 8 000 + 15 % × (157 575 − 120 000) = 13 636,25", () => {
    expect(progressiveTax(157575, IRPP_SCALE)).toBe(13636.25);
  });
  it("sous le seuil → 0", () => {
    expect(progressiveTax(30000, IRPP_SCALE)).toBe(0);
  });
});

describe("RH-04 — moteur de calcul de paie (modèle camerounais)", () => {
  it("mois complet : brut 165 000, CNPS 4,5 % du brut, IRPP barème, net conforme", () => {
    const r = calculatePayroll(input({}));
    expect(r.grossPay).toBe(165000); // base + prime présence 10 %
    expect(r.cnpsEmployee).toBe(7425); // 4,5 % × 165 000
    expect(r.cnpsEmployer).toBe(9240); // 5,6 % × 165 000
    const netImposable = 165000 - 7425;
    expect(r.netImposable).toBe(netImposable);
    expect(r.irpp).toBe(progressiveTax(netImposable, IRPP_SCALE));
    expect(r.netPay).toBe(netImposable - r.irpp);
  });

  it("présence insuffisante (< 95 %) → pas de prime de présence", () => {
    const r = calculatePayroll(input({ daysPresent: 20 }));
    expect(r.grossPay).toBe(150000);
    expect(r.cnpsEmployee).toBe(6750);
  });

  it("2 h HS majorées au taux paramétré (1,25)", () => {
    const hourly = 150000 / (26 * 8);
    const r = calculatePayroll(input({ overtimeHours: 2 }));
    const hsLine = r.lines.find((l) => l.itemCode === "HS");
    expect(hsLine?.amount).toBeCloseTo(hourly * 2 * 1.25, 1);
  });

  it("2 jours d'absence non justifiée → retenue + net imposable réduit", () => {
    const r = calculatePayroll(input({ daysAbsent: 2 }));
    const line = r.lines.find((l) => l.itemCode === "RETENUE_ABSENCE");
    expect(line?.amount).toBeCloseTo(2 * (150000 / 26), 1);
    expect(r.netImposable).toBeLessThan(165000 - 7425);
  });

  it("taux CNPS modifié → le calcul utilise la nouvelle valeur", () => {
    const items = base.map((i) => (i.code === "CNPS_EMPLOYE" ? { ...i, params: { percent: 5 } } : i));
    const r = calculatePayroll(input({ items }));
    expect(r.cnpsEmployee).toBe(8250); // 5 % × 165 000
  });

  it("prime de performance manuelle + avance retenue", () => {
    const r = calculatePayroll(
      input({
        performanceBonus: 10000,
        manualAdjustments: [{ code: "AVANCE", amount: -20000 }],
      })
    );
    expect(r.lines.some((l) => l.itemCode === "PRIME_PERFORMANCE" && l.amount === 10000)).toBe(true);
    expect(r.lines.some((l) => l.itemCode === "AVANCE" && l.amount === 20000 && l.direction === "retenue")).toBe(true);
    expect(r.netPay).toBe(r.netImposable - r.irpp - 20000);
  });
});

describe("RH-04 — paie sur heures réelles (specs MVP 03_Paie)", () => {
  it("taux horaire = salaire ÷ 225,3 h (standard mensuel du fichier)", () => {
    const r = calculatePayroll(input({ payOnHours: true, standardMonthlyHours: 225.3, normalHours: 0, daysPresent: 20 }));
    const hnLine = r.lines.find((l) => l.itemCode === "HN");
    expect(hnLine?.amount ?? 0).toBeCloseTo(0, 1); // aucune heure → aucun montant
    // 1h normale = 150000 / 225,3
    const r2 = calculatePayroll(input({ payOnHours: true, standardMonthlyHours: 225.3, normalHours: 1, daysPresent: 20 }));
    expect(r2.lines.find((l) => l.itemCode === "HN")?.amount).toBeCloseTo(150000 / 225.3, 1);
  });

  it("brut = HN × taux + HS × taux × 1,5 + primes de tâche (logique du fichier)", () => {
    const r = calculatePayroll(
      input({
        payOnHours: true,
        standardMonthlyHours: 225.3,
        overtimeMultiplier: 1.5,
        normalHours: 160,
        overtimeHours: 2,
        taskBonus: 5000,
        daysPresent: 20, // < 95 % → prime de présence non déclenchée
      })
    );
    const hourly = 150000 / 225.3;
    const hn = r.lines.find((l) => l.itemCode === "HN")?.amount ?? 0;
    const hs = r.lines.find((l) => l.itemCode === "HS")?.amount ?? 0;
    const pt = r.lines.find((l) => l.itemCode === "PRIME_TACHE")?.amount ?? 0;
    expect(hn).toBeCloseTo(hourly * 160, 1);
    expect(hs).toBeCloseTo(hourly * 2 * 1.5, 1);
    expect(pt).toBe(5000);
    expect(r.grossPay).toBeCloseTo(hn + hs + pt, 1);
    expect(r.lines.some((l) => l.itemCode === "BASE")).toBe(false);
  });

  it("majoration HS paramétrable (overtimeMultiplier) prime sur la config", () => {
    const r = calculatePayroll(
      input({ payOnHours: true, standardMonthlyHours: 225.3, overtimeMultiplier: 1.5, normalHours: 160, overtimeHours: 1, daysPresent: 20 })
    );
    const hs = r.lines.find((l) => l.itemCode === "HS")?.amount ?? 0;
    expect(hs).toBeCloseTo((150000 / 225.3) * 1.5, 1);
  });

  it("mode mensuel (payOnHours=false) : base mensuelle conservée, taux horaire recalé sur 225,3", () => {
    const r = calculatePayroll(input({ standardMonthlyHours: 225.3, overtimeMultiplier: 1.5, overtimeHours: 1 }));
    expect(r.lines.some((l) => l.itemCode === "BASE" && l.amount === 150000)).toBe(true);
    const hs = r.lines.find((l) => l.itemCode === "HS")?.amount ?? 0;
    expect(hs).toBeCloseTo((150000 / 225.3) * 1.5, 1);
  });

  it("aucune heure pointée en mode heures réelles → brut = primes uniquement", () => {
    const r = calculatePayroll(input({ payOnHours: true, standardMonthlyHours: 225.3, normalHours: 0, taskBonus: 10000, daysPresent: 0 }));
    expect(r.grossPay).toBeCloseTo(10000, 1);
  });
});
