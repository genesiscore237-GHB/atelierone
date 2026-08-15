/**
 * RH-04 — MOTEUR DE CALCUL DE PAIE (pur, sans DB).
 * Aucune formule en dur : chaque élément vient de la configuration.
 * Structure conforme au bulletin camerounais :
 * Brut → cotisations salariales (CNPS) → Net imposable → IRPP (barème) → Net à payer.
 */

export interface PayrollConfigItem {
  code: string;
  name: string;
  type: "earning" | "deduction";
  method: "percent" | "fixed" | "manual" | "hours_x_rate" | "absent_days" | "scale";
  params: Record<string, unknown> | null;
}

export interface PayrollInput {
  baseSalary: number;
  overtimeHours: number;
  daysPresent: number;
  daysAbsent: number;
  expectedWorkingDays: number; // jours ouvrables de la période (ex. 26)
  performanceBonus: number; // saisie manuelle
  manualAdjustments: Array<{ code: string; amount: number }>; // ex. avance (négatif = retenue)
  items: PayrollConfigItem[];
}

export interface PayrollLine {
  itemCode: string;
  label: string;
  amount: number;
  direction: "gain" | "retenue";
}

export interface PayrollResult {
  lines: PayrollLine[];
  grossPay: number; // salaire brut
  totalEarnings: number;
  totalDeductions: number;
  cnpsEmployee: number;
  cnpsEmployer: number;
  netImposable: number;
  irpp: number;
  netPay: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Barème progressif par tranches : [{max, rate}, …] (max null = illimité) */
export function progressiveTax(
  amount: number,
  scale: Array<{ max: number | null; rate: number }>
): number {
  if (amount <= 0 || !scale.length) return 0;
  let tax = 0;
  let previousMax = 0;
  for (const bracket of scale) {
    const upper = bracket.max ?? Number.POSITIVE_INFINITY;
    if (amount <= previousMax) break;
    const taxableInBracket = Math.min(amount, upper) - previousMax;
    if (taxableInBracket > 0) {
      tax += taxableInBracket * (bracket.rate / 100);
    }
    previousMax = upper;
  }
  return round2(tax);
}

export function calculatePayroll(input: PayrollInput): PayrollResult {
  const {
    baseSalary,
    overtimeHours,
    daysPresent,
    daysAbsent,
    expectedWorkingDays,
    performanceBonus,
    manualAdjustments,
    items,
  } = input;

  const lines: PayrollLine[] = [];
  const hourlyRate = expectedWorkingDays > 0 ? baseSalary / (expectedWorkingDays * 8) : 0;
  const attendancePct = expectedWorkingDays > 0 ? (daysPresent / expectedWorkingDays) * 100 : 0;

  const push = (itemCode: string, label: string, amount: number, direction: "gain" | "retenue") => {
    if (amount === 0) return;
    lines.push({ itemCode, label, amount: round2(amount), direction });
  };

  push("BASE", "Salaire de base", baseSalary, "gain");

  let absentDeduction = 0;
  let manualDeduction = 0;

  for (const item of items) {
    if (!item.code || item.code === "BASE") continue;
    switch (item.method) {
      case "percent": {
        const percent = num(item.params?.percent);
        if (item.code === "PRIME_PRESENCE") {
          const minPct = num(item.params?.minAttendancePct, 95);
          if (attendancePct >= minPct) {
            push(item.code, item.name, (baseSalary * percent) / 100, "gain");
          }
        }
        // CNPS et IRPP sont calculés à la fin sur le brut / net imposable
        break;
      }
      case "fixed": {
        const amount = num(item.params?.amount);
        push(item.code, item.name, amount, item.type === "earning" ? "gain" : "retenue");
        break;
      }
      case "hours_x_rate": {
        if (overtimeHours > 0) {
          const rate = num(item.params?.rate, 1.25);
          push(item.code, item.name, overtimeHours * hourlyRate * rate, "gain");
        }
        break;
      }
      case "absent_days": {
        if (daysAbsent > 0) {
          const daysPerMonth = num(item.params?.daysPerMonth, 26);
          absentDeduction = daysAbsent * (baseSalary / (daysPerMonth || 26));
          push(item.code, item.name, absentDeduction, "retenue");
        }
        break;
      }
      case "manual": {
        const adj = manualAdjustments.find((a) => a.code === item.code);
        if (adj && adj.amount !== 0) {
          if (adj.amount > 0) {
            push(item.code, item.name, adj.amount, "gain");
          } else {
            manualDeduction += Math.abs(adj.amount);
            push(item.code, item.name, Math.abs(adj.amount), "retenue");
          }
        }
        break;
      }
      case "scale": {
        // IRPP : calculé à la fin sur le net imposable
        break;
      }
    }
  }

  if (performanceBonus > 0) {
    push("PRIME_PERFORMANCE", "Prime de performance", performanceBonus, "gain");
  }

  // Brut imposable = base + toutes les primes/HS (hors absences)
  const grossPay = round2(lines.filter((l) => l.direction === "gain").reduce((s, l) => s + l.amount, 0));

  // Cotisations CNPS sur le brut (part salariale déductible + part patronale hors net)
  const cnpsPctEmp = num(items.find((i) => i.code === "CNPS_EMPLOYE")?.params?.percent, 4.5);
  const cnpsPctEmployer = num(items.find((i) => i.code === "CNPS_EMPLOYEUR")?.params?.percent, 5.6);
  const cnpsEmployee = round2((grossPay * cnpsPctEmp) / 100);
  const cnpsEmployer = round2((grossPay * cnpsPctEmployer) / 100);
  push("CNPS_EMPLOYE", "CNPS — part salariale (4,5 %)", cnpsEmployee, "retenue");

  // Net imposable = brut − absences non justifiées − CNPS salariale
  const netImposable = round2(grossPay - absentDeduction - cnpsEmployee);

  // IRPP au barème progressif (paramétrable)
  const irppItem = items.find((i) => i.code === "IRPP");
  const scale = ((irppItem?.params?.scale as Array<{ max: number | null; rate: number }>) ?? []);
  const irpp = progressiveTax(netImposable, scale);
  push("IRPP", "IRPP — retenue à la source", irpp, "retenue");

  // Net à payer = brut − absences − CNPS − IRPP − avances
  const netPay = round2(grossPay - absentDeduction - cnpsEmployee - irpp - manualDeduction);

  const totalEarnings = round2(grossPay);
  const totalDeductions = round2(lines.filter((l) => l.direction === "retenue").reduce((s, l) => s + l.amount, 0));

  return {
    lines,
    grossPay,
    totalEarnings,
    totalDeductions,
    cnpsEmployee,
    cnpsEmployer,
    netImposable,
    irpp,
    netPay,
  };
}
