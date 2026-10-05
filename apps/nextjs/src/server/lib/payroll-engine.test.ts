import { describe, it, expect } from "vitest";
import {
  calculatePayroll,
  progressiveTax,
  calculerProrata,
  baseProratise,
  baseEffectifPeriode,
  joursOuvres,
  semainesDansPeriode,
  normaliserModePaie,
  regimeSuspensionEnPeriode,
  veilleDe,
  peutPreparer,
  peutCloturer,
  peutAjuster,
  peutPayer,
  STD_MONTHLY_HOURS,
  type PayrollInput,
  type PayrollConfigItem,
} from "./payroll-engine";

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
    modePaie: "SALAIRE_MENSUEL",
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

  it("2 h HS majorées au taux paramétré (1,25) — base std par défaut 225,3 h (N09)", () => {
    const hourly = 150000 / STD_MONTHLY_HOURS;
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

describe("RH-04 - prorata par date d'effet (CDC §11)", () => {
  it("joursOuvres : septembre 2025 (30 j, hors dimanches) = 26 jours", () => {
    expect(joursOuvres("2025-09-01", "2025-09-30")).toBe(26);
  });

  it("cas D (actif sur toute la période, sans sortie) : ratio = 1, base inchangée", () => {
    const p = calculerProrata({ dateDebutPeriode: "2025-09-01", dateFinPeriode: "2025-09-30", dateEmbauche: "2024-01-10", dateSortie: null });
    expect(p.joursEffectifs).toBe(26);
    expect(p.ratio).toBe(1);
    expect(baseProratise(150000, "SALAIRE_MENSUEL", p.ratio)).toBe(150000);
  });

  it("cas B (sorti le 15/09 pendant la période) : base proratisée, jours bornés", () => {
    const p = calculerProrata({ dateDebutPeriode: "2025-09-01", dateFinPeriode: "2025-09-30", dateEmbauche: "2024-01-10", dateSortie: "2025-09-15" });
    expect(p.debutEffectif).toBe("2025-09-01");
    expect(p.finEffective).toBe("2025-09-15");
    expect(p.ratio).toBeLessThan(1);
    expect(baseProratise(150000, "SALAIRE_MENSUEL", p.ratio)).toBe(Math.round(150000 * p.ratio));
  });

  it("cas A (sorti avant la période) : 0 jour effectif, ratio 0 — le router le saute avant le calcul", () => {
    const p = calculerProrata({ dateDebutPeriode: "2025-09-01", dateFinPeriode: "2025-09-30", dateEmbauche: "2020-01-01", dateSortie: "2025-08-20" });
    expect(p.joursEffectifs).toBe(0);
    expect(p.ratio).toBe(0);
  });

  it("base proratisée : mode horaire laissé intact (heures réelles)", () => {
    expect(baseProratise(150000, "SALAIRE_HORAIRE", 0.5)).toBe(150000);
  });

  it("cas C (sorti le dernier jour) : ratio = 1", () => {
    const p = calculerProrata({ dateDebutPeriode: "2025-09-01", dateFinPeriode: "2025-09-30", dateEmbauche: "2024-01-10", dateSortie: "2025-09-30" });
    expect(p.joursEffectifs).toBe(26);
    expect(p.ratio).toBe(1);
  });
});

describe("MISSION §19 — modes de rémunération et avances (moteur)", () => {
  it("CAS A : essai non rémunéré → net = 0, aucune cotisation", () => {
    const r = calculatePayroll(input({ modePaie: "NON_REMUNERE", baseSalary: 0, daysPresent: 15 }));
    expect(r.netPay).toBe(0);
    expect(r.grossPay).toBe(0);
    expect(r.cnpsEmployee).toBe(0);
    expect(r.irpp).toBe(0);
  });

  it("CAS B : forfait hebdomadaire 25 000/25 000/20 000 = 70 000 sur 3 semaines", () => {
    const r = calculatePayroll(input({ modePaie: "FORFAIT_HEBDOMADAIRE", forfaitHebdomadaire: 25000, weeksInPeriod: 3, weeklyForfaits: [25000, 25000, 20000], daysPresent: 15 }));
    expect(r.grossPay).toBe(70000);
    expect(r.lines.some((l) => l.itemCode === "FORFAIT" && l.amount === 70000)).toBe(true);
  });

  it("salaire 200 000 − avance 50 000 récupérée sur la période", () => {
    const r = calculatePayroll(
      input({
        baseSalary: 200000,
        daysPresent: 26,
        advancesToRecover: [{ advanceId: 1, amount: 50000 }],
      })
    );
    expect(r.lines.some((l) => l.itemCode === "AVANCE_RECUP" && l.amount === 50000 && l.direction === "retenue")).toBe(true);
    expect(r.advanceRecoveries).toEqual([{ advanceId: 1, amount: 50000, label: "Récupération avance #1" }]);
    expect(r.netPay).toBe(r.netImposable - r.irpp - 50000);
  });

  it("deux avances récupérées en cumul : 30 000 + 20 000 = 50 000", () => {
    const r = calculatePayroll(
      input({
        baseSalary: 200000,
        advancesToRecover: [
          { advanceId: 2, amount: 30000 },
          { advanceId: 3, amount: 20000 },
        ],
      })
    );
    expect(r.lines.filter((l) => l.itemCode === "AVANCE_RECUP").reduce((s, l) => s + l.amount, 0)).toBe(50000);
    expect(r.netPay).toBe(r.netImposable - r.irpp - 50000);
  });

  it("avance 80 000 déjà récupérée 50 000 → seule la fraction restante (solde 30 000) est re-passée", () => {
    // Le routeur transmet le solde restant ; le moteur ne doit retenir que ce solde
    const r = calculatePayroll(input({ advancesToRecover: [{ advanceId: 4, amount: 30000 }] }));
    expect(r.lines.filter((l) => l.itemCode === "AVANCE_RECUP").reduce((s, l) => s + l.amount, 0)).toBe(30000);
  });

  it("retenues retard appliquées en déduction du net (contrôle net positif)", () => {
    const r = calculatePayroll(input({ lateDeductionAmount: 43 }));
    const line = r.lines.find((l) => l.itemCode === "RETARD_DED");
    expect(line?.amount).toBe(43);
    // lateDeductionAmount est déjà déduit du net imposable
    expect(r.netImposable).toBe(r.grossPay - r.cnpsEmployee - 43);
    expect(r.netPay).toBe(r.netImposable - r.irpp);
  });

  it("impact financier absence déduit du net imposable et du net", () => {
    const r = calculatePayroll(input({ absenceFinancialImpact: 30000 }));
    expect(r.lines.some((l) => l.itemCode === "ABSENCE_IMPACT" && l.amount === 30000)).toBe(true);
    expect(r.netImposable).toBe(r.grossPay - r.cnpsEmployee - 30000);
  });

  it("net négatif → refusé par le contrôle du routeur (le moteur peut produire un solde, le router bloque)", () => {
    const r = calculatePayroll(input({ baseSalary: 50000, advancesToRecover: [{ advanceId: 5, amount: 80000 }] }));
    expect(r.netPay).toBeLessThan(0);
  });

  it("cas B : absence de forfait renseigné → forfait = 0, bulletin sans gain", () => {
    const r = calculatePayroll(input({ modePaie: "FORFAIT_HEBDOMADAIRE", forfaitHebdomadaire: null, weeksInPeriod: 2, daysPresent: 0 }));
    expect(r.grossPay).toBe(0);
  });
});

describe("MISSION §19 — changement de salaire mi-mois proratisé (G10, baseEffectifPeriode)", () => {
  const periode = { debut: "2025-01-01", fin: "2025-01-31" };

  it("70 000 → 100 000 au 15/01 : base = moyenne journalière (86 666,67)", () => {
    const base = baseEffectifPeriode({
      baseCourante: 100000,
      modePaie: "SALAIRE_MENSUEL",
      periode,
      salaries: [
        { baseSalary: 70000, startDate: "2024-12-01" },
        { baseSalary: 100000, startDate: "2025-01-15" },
      ],
    });
    // Janvier 2025 : 27 jours ouvrables. 12 jours à 70 000 (01–14) + 15 jours à 100 000 (15–31)
    expect(base).toBe(86666.67);
  });

  it("aucune ligne historique → base courante conservée (comportement legacy)", () => {
    const base = baseEffectifPeriode({
      baseCourante: 150000,
      modePaie: "SALAIRE_MENSUEL",
      periode,
      salaries: [],
    });
    expect(base).toBe(150000);
  });

  it("embauche mi-mois + salaire constante → prorata (équivalent ratio)", () => {
    const base = baseEffectifPeriode({
      baseCourante: 100000,
      modePaie: "SALAIRE_MENSUEL",
      periode,
      emploi: { dateEmbauche: "2025-01-10", dateSortie: null },
      salaries: [{ baseSalary: 100000, startDate: "2025-01-01" }],
    });
    // 19 jours ouvrables travaillés (10–31) / 27 jours de période
    expect(base).toBe(70370.37);
  });

  it("SALAIRE_HORAIRE / NON_REMUNERE : jamais proratisé sur l'historique", () => {
    const baseHoraire = baseEffectifPeriode({
      baseCourante: 2000,
      modePaie: "SALAIRE_HORAIRE",
      periode,
      salaries: [{ baseSalary: 1500, startDate: "2025-01-10" }],
    });
    expect(baseHoraire).toBe(2000);
    const baseNonRemunere = baseEffectifPeriode({ baseCourante: 0, modePaie: "NON_REMUNERE", periode, salaries: [] });
    expect(baseNonRemunere).toBe(0);
  });

  it("validation croisée : baseEffectifPeriode ≡ baseProratise quand ratio < 1 et aucun changement", () => {
    const prorata = calculerProrata({ dateDebutPeriode: periode.debut, dateFinPeriode: periode.fin, dateEmbauche: "2025-01-10", dateSortie: null });
    const attendu = baseProratise(200000, "SALAIRE_MENSUEL", prorata.ratio);
    const reconstruit = baseEffectifPeriode({
      baseCourante: 200000,
      modePaie: "SALAIRE_MENSUEL",
      periode,
      emploi: { dateEmbauche: "2025-01-10", dateSortie: null },
      salaries: [{ baseSalary: 200000, startDate: "2025-01-01" }],
    });
    expect(reconstruit).toBeCloseTo(attendu, 0);
  });
});

describe("N09 — heures standard de référence (fallback 225,3 h)", () => {
  it("faute de paramétrage, le fallback est la constante MVP 225,3 h (et plus 208)", () => {
    expect(STD_MONTHLY_HOURS).toBe(225.3);
    const r = calculatePayroll(input({ overtimeHours: 1 }));
    expect(r.lines.find((l) => l.itemCode === "HS")?.amount).toBeCloseTo((150000 / 225.3) * 1.25, 1);
  });

  it("paramétrage explicite toujours prioritaire", () => {
    const r = calculatePayroll(input({ standardMonthlyHours: 200, overtimeHours: 1 }));
    expect(r.lines.find((l) => l.itemCode === "HS")?.amount).toBeCloseTo((150000 / 200) * 1.25, 1);
  });
});

describe("N08 — semaines réelles pour forfait hebdomadaire (pas de ceil abusif)", () => {
  it("30 jours calendaires → 4,29 semaines (et non 5)", () => {
    expect(semainesDansPeriode("2025-09-01", "2025-09-30")).toBeCloseTo(4.29, 2);
  });
  it("28 jours → 4 semaines exactes", () => {
    expect(semainesDansPeriode("2025-02-01", "2025-02-28")).toBe(4);
  });
  it("14 jours → 2 semaines exactes", () => {
    expect(semainesDansPeriode("2025-01-01", "2025-01-14")).toBe(2);
  });
  it("période vide/invalide → 0", () => {
    expect(semainesDansPeriode("2025-09-10", "2025-09-09")).toBe(0);
  });
});

describe("N07 — dénominateur unifié avec fériés (cohérent workingDaysInMonth)", () => {
  const periode = { debut: "2025-01-01", fin: "2025-01-31" };
  it("joursOuvres exclut le dimanche ET le férié listé", () => {
    expect(joursOuvres("2025-09-01", "2025-09-30")).toBe(26);
    expect(joursOuvres("2025-09-01", "2025-09-30", ["2025-09-02"])).toBe(25);
  });

  it("prorata : 1 férié hors période travaillée → dénominateur plein = 26 (01/01 exclu)", () => {
    const p = calculerProrata({
      dateDebutPeriode: "2025-01-01",
      dateFinPeriode: "2025-01-31",
      dateEmbauche: "2025-01-15",
      dateSortie: null,
      holidays: ["2025-01-01"],
    });
    expect(p.joursEffectifs).toBe(15);
    expect(p.ratio).toBeCloseTo(15 / 26, 4);
  });

  it("baseEffectifPeriode : le férié 01/01 est exclu du cumul — 70 000 → 100 000 au 15/01", () => {
    const base = baseEffectifPeriode({
      baseCourante: 100000,
      modePaie: "SALAIRE_MENSUEL",
      periode,
      salaries: [
        { baseSalary: 70000, startDate: "2024-12-01" },
        { baseSalary: 100000, startDate: "2025-01-15" },
      ],
      holidays: ["2025-01-01"],
    });
    // 11 jours ouvrés à 70 000 (02–14, 2 dimanches retirés) + 15 jours à 100 000 (15–31) / 26
    expect(base).toBe(87307.69);
  });
});

describe("P14/N20 — table de correspondance canonique des modes (journalier/commission)", () => {
  const periode = { debut: "2025-01-01", fin: "2025-01-31" };
  it("normalise les valeurs léguées et canoniques", () => {
    expect(normaliserModePaie("mensuel")).toBe("SALAIRE_MENSUEL");
    expect(normaliserModePaie("SALAIRE_MENSUEL")).toBe("SALAIRE_MENSUEL");
    expect(normaliserModePaie("horaire")).toBe("SALAIRE_HORAIRE");
    expect(normaliserModePaie("journalier")).toBe("JOURNALIER");
    expect(normaliserModePaie("commission")).toBe("COMMISSION");
    expect(normaliserModePaie("forfait_hebdomadaire")).toBe("FORFAIT_HEBDOMADAIRE");
    expect(normaliserModePaie("non_remunere")).toBe("NON_REMUNERE");
    expect(normaliserModePaie("essai")).toBe("NON_REMUNERE");
    expect(normaliserModePaie("NON_REMUNERE")).toBe("NON_REMUNERE");
    expect(normaliserModePaie(null)).toBe("SALAIRE_MENSUEL");
    expect(normaliserModePaie("inconnu")).toBe("SALAIRE_MENSUEL");
  });

  it("CAS JOURNALIER : brut = taux journalier × jours présents, jamais mensuel", () => {
    const r = calculatePayroll(input({ modePaie: "JOURNALIER", baseSalary: 8000, daysPresent: 18, daysAbsent: 0, expectedWorkingDays: 26 }));
    const line = r.lines.find((l) => l.itemCode === "BASE_JOURNALIER");
    expect(line?.amount).toBe(18 * 8000);
    expect(r.grossPay).toBe(18 * 8000);
    expect(r.lines.some((l) => l.itemCode === "BASE")).toBe(false);
  });

  it("CAS COMMISSION : base fixe conservée (part variable = P14), pas de prorata historique", () => {
    const r = calculatePayroll(input({ modePaie: "COMMISSION", baseSalary: 150000, daysPresent: 26 }));
    expect(r.lines.some((l) => l.itemCode === "BASE" && l.amount === 150000)).toBe(true);
  });

  it("CAS COMMISSION : base fixe contractuelle jamais proratisée sur les jours présents", () => {
    const r = calculatePayroll(input({ modePaie: "COMMISSION", baseSalary: 150000, daysPresent: 10 }));
    const ligneBase = r.lines.find((l) => l.itemCode === "BASE");
    expect(ligneBase?.amount).toBe(150000);
    expect(r.grossPay).toBe(150000);
  });

  it("CAS COMMISSION : les absences ne réduisent pas la base (retenue absent_days désactivée)", () => {
    const r = calculatePayroll(input({ modePaie: "COMMISSION", baseSalary: 150000, daysPresent: 20, daysAbsent: 3 }));
    const ligneBase = r.lines.find((l) => l.itemCode === "BASE");
    expect(ligneBase?.amount).toBe(150000);
    expect(r.lines.some((l) => l.itemCode === "RETENUE_ABSENCE")).toBe(false);
  });

  it("modes horaire/commission/journalier jamais proratisés par l'historique", () => {
    const baseJ = baseEffectifPeriode({
      baseCourante: 8000,
      modePaie: "JOURNALIER",
      periode,
      salaries: [{ baseSalary: 6000, startDate: "2025-01-10" }],
    });
    expect(baseJ).toBe(8000);
    const baseC = baseEffectifPeriode({
      baseCourante: 150000,
      modePaie: "COMMISSION",
      periode,
      salaries: [{ baseSalary: 120000, startDate: "2025-01-10" }],
    });
    expect(baseC).toBe(150000);
  });
});

describe("R4-D2 — retenue absent_days réservée aux bases fixes (men/forfait)", () => {
  const periode = { debut: "2025-01-01", fin: "2025-01-31" };
  it("SALAIRE_HORAIRE : présence (0 h) + absences → AUCUNE retenue absent_days (ex bulletin 52 net négatif)", () => {
    const r = calculatePayroll(
      input({ modePaie: "SALAIRE_HORAIRE", baseSalary: 100000, daysPresent: 0, daysAbsent: 1, normalHours: 0, expectedWorkingDays: 26 })
    );
    expect(r.lines.some((l) => l.itemCode === "RETENUE_ABSENCE")).toBe(false);
    expect(r.grossPay).toBe(0);
  });
  it("JOURNALIER : absence → retenue absent_days désactivée (brut = jours présents × taux)", () => {
    const r = calculatePayroll(input({ modePaie: "JOURNALIER", baseSalary: 8000, daysPresent: 18, daysAbsent: 3, expectedWorkingDays: 26 }));
    expect(r.lines.some((l) => l.itemCode === "RETENUE_ABSENCE")).toBe(false);
    expect(r.grossPay).toBe(18 * 8000);
  });
  it("SALAIRE_MENSUEL : la retenue absent_days reste active (base fixe)", () => {
    const r = calculatePayroll(input({ daysAbsent: 2 }));
    const line = r.lines.find((l) => l.itemCode === "RETENUE_ABSENCE");
    expect(line?.amount).toBeCloseTo(2 * (150000 / 26), 1);
  });
  it("FORFAIT_HEBDOMADAIRE : la retenue absent_days reste active, assise sur forfait/26", () => {
    const r = calculatePayroll(input({ modePaie: "FORFAIT_HEBDOMADAIRE", baseSalary: 0, forfaitHebdomadaire: 25000, weeksInPeriod: 3, weeklyForfaits: [25000, 25000, 25000], daysPresent: 15, daysAbsent: 1 }));
    const line = r.lines.find((l) => l.itemCode === "RETENUE_ABSENCE");
    expect(line?.amount).toBeCloseTo(1 * (75000 / 26), 1);
  });
});

describe("N10 — ordre des opérations paie (machine d'état)", () => {
  it("préparation : présence clôturée + période ouverte requises", () => {
    expect(peutPreparer({ statutPeriode: "open", presenceMoisCloture: true })).toBeNull();
    expect(peutPreparer({ statutPeriode: "open", presenceMoisCloture: false })).not.toBeNull();
    expect(peutPreparer({ statutPeriode: "closed", presenceMoisCloture: true })).not.toBeNull();
  });

  it("clôture : refusée deux fois", () => {
    expect(peutCloturer({ statutPeriode: "open" })).toBeNull();
    expect(peutCloturer({ statutPeriode: "closed" })).not.toBeNull();
  });

  it("ajustement : refusé si payé ou période fermée", () => {
    expect(peutAjuster({ statutPeriode: "open", statutBulletin: "prepare" })).toBeNull();
    expect(peutAjuster({ statutPeriode: "open", statutBulletin: "paye" })).not.toBeNull();
    expect(peutAjuster({ statutPeriode: "closed", statutBulletin: "prepare" })).not.toBeNull();
  });

  it("paiement : exige la clôture de période, jamais deux fois", () => {
    expect(peutPayer({ statutPeriode: "closed", statutBulletin: "prepare" })).toBeNull();
    expect(peutPayer({ statutPeriode: "open", statutBulletin: "prepare" })).not.toBeNull();
    expect(peutPayer({ statutPeriode: "closed", statutBulletin: "paye" })).not.toBeNull();
  });
});

describe("N11 — jours suspendus non payés (régime suspension)", () => {
  const JUILLET = "2026-07-01";

  it("employé non suspendu → régime aucun (paie normale)", () => {
    expect(regimeSuspensionEnPeriode({ statut: "actif", suspensionStart: null, debutPeriode: JUILLET })).toBe("aucun");
    expect(regimeSuspensionEnPeriode({ statut: "conge", suspensionStart: "2026-07-10", debutPeriode: JUILLET })).toBe("aucun");
  });

  it("suspension sans traçage ou couvrant tout le mois → total (pas de bulletin)", () => {
    expect(regimeSuspensionEnPeriode({ statut: "suspendu", suspensionStart: null, debutPeriode: JUILLET })).toBe("total");
    expect(regimeSuspensionEnPeriode({ statut: "suspendu", suspensionStart: "2026-07-01", debutPeriode: JUILLET })).toBe("total");
    expect(regimeSuspensionEnPeriode({ statut: "suspendu", suspensionStart: "2026-06-15", debutPeriode: JUILLET })).toBe("total");
  });

  it("suspension débutant en cours de mois → partiel (prorata avant suspension)", () => {
    expect(regimeSuspensionEnPeriode({ statut: "suspendu", suspensionStart: "2026-07-15", debutPeriode: JUILLET })).toBe("partiel");
  });

  it("veille de suspension = borne de paie", () => {
    expect(veilleDe("2026-07-15")).toBe("2026-07-14");
    expect(veilleDe("2026-08-01")).toBe("2026-07-31");
    // lien avec le régime : un partiel borne la paie à la veille de la suspension
    const suspension = "2026-07-15";
    if (regimeSuspensionEnPeriode({ statut: "suspendu", suspensionStart: suspension, debutPeriode: JUILLET }) === "partiel") {
      expect(veilleDe(suspension)).toBe("2026-07-14");
    }
  });
});
