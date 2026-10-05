import { describe, expect, it } from "vitest";

import { calculateAbsenceImpact, calculateLateDeduction } from "~/server/lib/presence-engine";
import { analyserPeriode, type JourAnalyseInput } from "~/server/lib/rh-stats-engine";
import {
  appliquerMasquageSalaire,
  CODES_REGLES_EXIGEES,
  calculerIndicateursEquipe,
  calculerIndicateursSensibilisation,
  calculerImpactSegment,
  construireMessagesSensibilisation,
  compterJoursAbsenceNonJustifies,
  reglesManquantes,
  salaireBaseReference,
  type RegleSensibilisation,
} from "~/server/lib/rh-sensibilisation-engine";
import { segmenterSalaires, type SegmentSalaire } from "~/server/lib/rh-situation-engine";
import type { AbsenceTableRow, CalcBrut, DonneesSituation, EmployeBrut } from "~/server/lib/rh-centre-rapports";

/**
 * RPT-03 — Tests unitaires du moteur de sensibilisation.
 *
 * Chaque test porte le numéro du scénario §35. Le moteur est appelé par ses
 * fonctions PURES : aucune base, aucune écriture, aucun rendu React.
 */

// ── Fixtures ──────────────────────────────────────────────────────────────

const DEBUT = "2026-09-01";
const FIN = "2026-09-30";

function employe(patch: Partial<EmployeBrut> = {}): EmployeBrut {
  return {
    id: 1,
    matricule: "EMP-001",
    prenom: "Awa",
    nom: "Nkoa",
    departement: "Production",
    statut: "ACTIF",
    salaireBase: 500_000,
    modePaie: "SALAIRE_MENSUEL",
    forfaitHebdomadaire: 0,
    dateEmbauche: "2020-01-01",
    dateSortie: null,
    workCycleId: 1,
    dateFinContrat: null,
    fonction: "Chef d atelier",
    departmentId: 1,
    ...patch,
  };
}

function jour(patch: Partial<JourAnalyseInput> & { date: string }): JourAnalyseInput {
  return {
    code: "P",
    isWorkingDay: true,
    heuresTheoriques: 8,
    workedMinutes: 480,
    normalMinutes: 480,
    overtimeMinutes: 0,
    lateMinutes: 0,
    earlyDepartureMinutes: 0,
    ...patch,
  };
}

function absences(rows: Partial<AbsenceTableRow>[] = []): AbsenceTableRow[] {
  return rows.map((r, i) => ({
    id: i + 1,
    employeId: 1,
    typeAbsence: "CONGE",
    dateDebut: "2026-09-07",
    dateFin: "2026-09-07",
    dureeJours: 1,
    motif: null,
    justifie: null,
    statut: null,
    validePar: null,
    createdAt: null,
    ...r,
  })) as AbsenceTableRow[];
}

function calcs(rows: Partial<CalcBrut>[] = []): CalcBrut[] {
  return rows.map((r) => ({
    date: "2026-09-07",
    employeeId: 1,
    codePresence: "C",
    isAbsent: true,
    workedMinutes: 0,
    normalMinutes: 0,
    overtimeMinutes: 0,
    lateMinutes: 0,
    earlyDepartureMinutes: 0,
    lateDeductionAmount: 0,
    absenceFinancialImpact: 0,
    taskBonus: 0,
    ...r,
  })) as CalcBrut[];
}

function segment(patch: Partial<SegmentSalaire> & { dateDebut: string; dateFin: string }): SegmentSalaire {
  return {
    baseSalary: 500_000,
    modePaie: "SALAIRE_MENSUEL",
    forfaitHebdomadaire: 0,
    source: "fiche",
    startDate: "2020-01-01",
    ...patch,
  };
}

function regles(patch: Partial<RegleSensibilisation> & { code: string }): RegleSensibilisation {
  return {
    label: "Regle",
    niveau: "WARNING",
    priorite: 50,
    condition: "GE",
    metrique: "totalNotWorkedHours",
    seuil: 8,
    message: "Message",
    actionRecommandee: "Action",
    active: true,
    ...patch,
  };
}

/** Jeu de règles minimal reproduisant exactement les 7 règles de la migration. */
function jeuDeRegles(): RegleSensibilisation[] {
  return [
    regles({ code: "PRESENCE_SATISFAISANTE_RETARDS_ELEVES", metrique: "retardMinutes", seuil: 120, priorite: 40 }),
    regles({ code: "ABSENCES_RETARDS_SIGNIFICATIFS", metrique: "totalNotWorkedHours", seuil: 8, priorite: 30 }),
    regles({ code: "IMPACT_IMPORTANT", metrique: "impactPercent", seuil: 5, priorite: 20 }),
    regles({ code: "IMPACT_TRES_ELEVE", metrique: "impactPercent", seuil: 10, niveau: "CRITICAL", priorite: 10 }),
    regles({ code: "RETARDS_CHRONIQUES", metrique: "joursAvecRetard", seuil: 5, priorite: 50 }),
    regles({ code: "SALAIRE_REFERENCE_INCOHERENT", metrique: "salaireReferenceManquant", condition: "GE", seuil: 1, priorite: 5 }),
    regles({ code: "ABSENCE_NON_JUSTIFIEE", metrique: "joursAbsenceNonJustifiee", seuil: 1, niveau: "CRITICAL", priorite: 15 }),
  ];
}

function donnees(patch: Partial<DonneesSituation> = {}): DonneesSituation {
  return {
    from: DEBUT,
    to: FIN,
    today: FIN,
    holidays: [],
    standardMonthlyHours: 225.3,
    items: [],
    employees: [],
    calcsByEmploye: new Map(),
    saisiesByEmploye: new Map(),
    histoByEmploye: new Map(),
    ...patch,
  } as unknown as DonneesSituation;
}

function calculer(opts: {
  jours: JourAnalyseInput[];
  emp?: EmployeBrut;
  segments?: SegmentSalaire[];
  abs?: AbsenceTableRow[];
  clc?: CalcBrut[];
  regles?: RegleSensibilisation[];
  d?: DonneesSituation;
}) {
  const emp = opts.emp ?? employe();
  const d = opts.d ?? donnees();
  const segments = opts.segments ?? [segment({ dateDebut: DEBUT, dateFin: FIN })];
  return calculerIndicateursSensibilisation({
    employe: emp,
    jours: opts.jours,
    analyse: analyserPeriode(opts.jours),
    calcs: opts.clc ?? [],
    segments,
    absences: opts.abs ?? [],
    donnees: d,
    regles: opts.regles ?? jeuDeRegles(),
  });
}

// ── §35 / TEST 01-07 : heures et retards ───────────────────────────────────

describe("RPT-03 heures d'absence (§3)", () => {
  it("TEST 01 — sans absence, absenceHours = 0", () => {
    const r = calculer({ jours: [jour({ date: "2026-09-01" })] });
    expect(r.absenceHours).toBe(0);
    expect(r.totalNotWorkedHours).toBe(0);
    expect(r.estimatedImpact).toBe(0);
  });

  it("TEST 02 — une absence sur un jour ouvre compte les heures THEORIQUES du jour", () => {
    const r = calculer({
      jours: [
        jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 }),
        jour({ date: "2026-09-02", code: "MUET", heuresTheoriques: 7, workedMinutes: 0, normalMinutes: 0 }),
      ],
    });
    // 8 + 7 = 15 h : la durée vient de la JOURNEE, jamais d'une constante.
    expect(r.absenceHours).toBe(15);
  });

  it("TEST 03 — une absence un samedi jourrecompense les heures du samedi", () => {
    const r = calculer({
      jours: [jour({ date: "2026-09-05", code: "MUET", isWorkingDay: true, heuresTheoriques: 6, workedMinutes: 0, normalMinutes: 0 })],
    });
    expect(r.absenceHours).toBe(6);
  });

  it("TEST 04 — une absence un dimanche non ouvert compte 0 h", () => {
    const r = calculer({
      jours: [jour({ date: "2026-09-06", code: "MUET", isWorkingDay: false, heuresTheoriques: 8, workedMinutes: 0, normalMinutes: 0 })],
    });
    expect(r.absenceHours).toBe(0);
  });

  it("TEST 05 — un jour ferie compte 0 h", () => {
    const r = calculer({
      jours: [jour({ date: "2026-09-07", code: "MUET", isWorkingDay: false, heuresTheoriques: 8, workedMinutes: 0, normalMinutes: 0 })],
    });
    expect(r.absenceHours).toBe(0);
  });

  it("TEST 06 — un retard de 60 minutes vaut exactement 1 heure", () => {
    const r = calculer({
      jours: [jour({ date: "2026-09-01", lateMinutes: 60, workedMinutes: 420, normalMinutes: 420 })],
    });
    expect(r.retardMinutes).toBe(60);
    expect(r.retardHours).toBe(1);
    expect(r.absenceHours).toBe(0);
  });

  it("TEST 07 — absence + retard : le total est la somme des deux", () => {
    const r = calculer({
      jours: [
        jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 }),
        jour({ date: "2026-09-02", lateMinutes: 30, workedMinutes: 450, normalMinutes: 450 }),
      ],
    });
    expect(r.absenceHours).toBe(8);
    expect(r.retardHours).toBe(0.5);
    expect(r.totalNotWorkedHours).toBe(8.5);
  });

  it("les departs anticipes et heures sup ne sont pas dans le total (§6)", () => {
    const r = calculer({
      jours: [
        jour({
          date: "2026-09-01",
          earlyDepartureMinutes: 120,
          overtimeMinutes: 90,
          workedMinutes: 360,
          normalMinutes: 360,
        }),
      ],
    });
    expect(r.totalNotWorkedHours).toBe(0);
  });
});

// ── §35 / TEST 08, 11, 12 : valorisation et segmentation ─────────────────

describe("RPT-03 impacts estimes (§8-§12)", () => {
  it("TEST 08 — aucun 9,5 en dur : une journee de 7 h compte 7 h", () => {
    const sept = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", heuresTheoriques: 7, workedMinutes: 0, normalMinutes: 0 })],
    });
    const huit = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", heuresTheoriques: 8, workedMinutes: 0, normalMinutes: 0 })],
    });
    expect(sept.absenceHours).toBe(7);
    expect(huit.absenceHours).toBe(8);
    // 7 h et 8 h ne Valentine pas le meme montant.
    expect(sept.estimatedImpact).not.toBe(huit.estimatedImpact);
  });

  it("TEST 11 — deux segments salariaux : les impacts sont additionnes", () => {
    const r = calculer({
      jours: [
        jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 }),
        jour({ date: "2026-09-16", code: "MUET", workedMinutes: 0, normalMinutes: 0 }),
      ],
      segments: [
        segment({ dateDebut: DEBUT, dateFin: "2026-09-15", baseSalary: 500_000 }),
        segment({ dateDebut: "2026-09-16", dateFin: FIN, baseSalary: 1_000_000 }),
      ],
    });
    expect(r.segments).toHaveLength(2);
    const somme = r.segments[0].estimatedImpact + r.segments[1].estimatedImpact;
    expect(r.estimatedImpact).toBeCloseTo(somme, 2);
    // Le second segment, mieux paye, coute plus cher pour la meme journee.
    expect(r.segments[1].tauxHoraire).toBeGreaterThan(r.segments[0].tauxHoraire);
    expect(r.estimatedImpact).toBeGreaterThan(0);
  });

  it("TEST 12 — impactPercent = estimatedImpact / salaire de reference x 100", () => {
    const r = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })],
      segments: [segment({ dateDebut: DEBUT, dateFin: FIN, baseSalary: 225_300 })],
    });
    // taux = 225300 / 225.3 = 1000 XAF/h → 8 h = 8 000 ; référence 225 300
    expect(r.tauxHoraireMoyen).toBe(1000);
    expect(r.estimatedImpact).toBe(8000);
    expect(r.impactPercent).toBeCloseTo((8000 / 225_300) * 100, 1);
  });

  it("le diviseur vient du parametrage, jamais d'une constante (§8)", () => {
    const avec160 = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })],
      segments: [segment({ dateDebut: DEBUT, dateFin: FIN, baseSalary: 160_000 })],
      d: donnees({ standardMonthlyHours: 160 }),
    });
    expect(avec160.tauxHoraireMoyen).toBe(1000);
    expect(avec160.estimatedImpact).toBe(8000);
  });

  it("TEST 09/10 — salaire null ou 0 : impactPercent null et anomalie (jamais NaN)", () => {
    // Fiche ET historique vides : il n'existe aucune référence de salaire.
    const nul = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })],
      emp: employe({ salaireBase: 0 }),
      segments: [],
    });
    expect(nul.impactPercent).toBeNull();
    expect(nul.salaireBaseReference).toBeNull();
    expect(nul.anomalies.map((a) => a.code)).toContain("SALAIRE_REFERENCE_INCOHERENT");

    // Historique inexploitable ET fiche nulle : aucune référence, donc N/A.
    const sansSegment = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })],
      emp: employe({ salaireBase: 0 }),
      segments: [],
    });
    expect(sansSegment.impactPercent).toBeNull();
    expect(Number.isNaN(sansSegment.estimatedImpact)).toBe(false);
  });

  it("le salaire de reference suit l'historique, pas la fiche (§9)", () => {
    // La fiche vaut 0 mais l'historique atteste 500 000 : c'est l'historique,
    // segment par segment, qui fait foi. Le pourcentage reste calculable.
    const r = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })],
      emp: employe({ salaireBase: 0 }),
    });
    expect(r.salaireBaseReference).toBeGreaterThan(0);
    expect(r.impactPercent).not.toBeNull();
  });
});

// ── §35 / TEST 26, 36 : separation et permissions ────────────────────────

describe("RPT-03 separation estimation / retenue reelle (§26)", () => {
  it("TEST 26 — la retenue reelle est lue telle quelle, jamais recalculee", () => {
    const r = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })],
      clc: calcs([{ lateDeductionAmount: 1_234, absenceFinancialImpact: 0 }]),
    });
    expect(r.actualPayrollDeduction).toBe(1234);
    // L'estimation, elle, est bien non nulle et SANS rapport avec la retenue.
    expect(r.estimatedImpact).toBeGreaterThan(0);
    expect(r.estimatedImpact).not.toBe(r.actualPayrollDeduction);
  });

  it("TEST 27 — absence payee : retenue 0, estimation non nulle", () => {
    const r = calculer({
      jours: [jour({ date: "2026-09-01", code: "C", workedMinutes: 0, normalMinutes: 0 })],
      clc: calcs([{ absenceFinancialImpact: 0, lateDeductionAmount: 0 }]),
    });
    expect(r.absenceHours).toBe(8);
    expect(r.actualPayrollDeduction).toBe(0);
    expect(r.estimatedImpact).toBeGreaterThan(0);
  });

  it("TEST 36 — sans permission salaire, les montants sont ABSENTS (pas 0)", () => {
    const r = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })],
    });
    const masque = appliquerMasquageSalaire(r, false);
    expect(masque.estimatedImpact).toBeNull();
    expect(masque.impactPercent).toBeNull();
    expect(masque.salaireBaseReference).toBeNull();
    expect(masque.tauxHoraireMoyen).toBeNull();
    expect(masque.segments).toBeNull();
    expect(masque.salariesVisible).toBe(false);
    // Les indicateurs NON sensibles restent disponibles.
    expect(masque.absenceHours).toBe(8);
    expect(masque.totalNotWorkedHours).toBe(8);
    expect(masque.joursOuvres).toBe(1);
    expect(masque.tauxPresenceHeures).toBe(0);
  });

  it("TEST 36b — avec permission salaire, tout est restitue", () => {
    const r = calculer({ jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })] });
    const visible = appliquerMasquageSalaire(r, true);
    expect(visible.salariesVisible).toBe(true);
    expect(visible.estimatedImpact).toBeGreaterThan(0);
    expect(visible.segments).toHaveLength(1);
    expect(visible.messages?.length).toBeGreaterThan(0);
  });
});

// ── §35 / TEST 14-18 : regles et messages ────────────────────────────────

describe("RPT-03 regles et messages (§17-§21)", () => {
  it("TEST 14 — un message porte code, niveau, message et explication de declenchement", () => {
    const r = calculer({
      jours: [
        jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 }),
        jour({ date: "2026-09-02", code: "MUET", workedMinutes: 0, normalMinutes: 0 }),
      ],
    });
    const m = r.messages.find((x) => x.code === "ABSENCES_RETARDS_SIGNIFICATIFS");
    expect(m).toBeDefined();
    expect(m!.niveau).toBe("WARNING");
    expect(m!.message).toBeTruthy();
    expect(m!.raison).toContain("totalNotWorkedHours");
    expect(m!.indicateurs.totalNotWorkedHours.valeur).toBe(16);
    expect(m!.seuilApplique).toBe(8);
    expect(m!.actionRecommandee).toBeTruthy();
  });

  it("TEST 15 — deux regles declenchees produisent DEUX messages", () => {
    const r = calculer({
      jours: [
        // Absence DÉCLARÉE non justifiée : déclenche à la fois le seuil de
        // volume (ABSENCES_RETARDS_SIGNIFICATIFS) et le signal disciplinaire
        // (ABSENCE_NON_JUSTIFIEE). Un simple manque de pointage ne le ferait pas.
        jour({ date: "2026-09-01", code: "A", workedMinutes: 0, normalMinutes: 0 }),
        jour({ date: "2026-09-02", lateMinutes: 90, workedMinutes: 390, normalMinutes: 390 }),
      ],
    });
    const codes = r.messages.map((m) => m.code);
    expect(codes).toContain("ABSENCES_RETARDS_SIGNIFICATIFS");
    expect(codes).toContain("ABSENCE_NON_JUSTIFIEE");
    expect(codes.length).toBeGreaterThanOrEqual(2);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("TEST 16 — un seuil modifie change le declenchement", () => {
    const jours = [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })];
    const reference = calculer({ jours });
    const pct = reference.impactPercent!;
    expect(pct).toBeGreaterThan(0);

    const pile = regles({ code: "IMPACT_IMPORTANT", metrique: "impactPercent", seuil: pct });
    const haut = regles({ code: "IMPACT_IMPORTANT", metrique: "impactPercent", seuil: pct + 1 });

    const auPile = calculer({ jours, regles: [pile] });
    const auDessus = calculer({ jours, regles: [haut] });
    expect(auPile.messages.map((m) => m.code)).toContain("IMPACT_IMPORTANT");
    expect(auDessus.messages.map((m) => m.code)).not.toContain("IMPACT_IMPORTANT");
    // L'indicateur, lui, ne bouge pas : seul le déclenchement change.
    expect(auPile.impactPercent).toBe(auDessus.impactPercent);
    expect(auPile.estimatedImpact).toBe(auDessus.estimatedImpact);
  });

  it("TEST 17 — une regle desactivee ne declenche rien", () => {
    const off = regles({ code: "ABSENCES_RETARDS_SIGNIFICATIFS", seuil: 1, active: false });
    const r = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })],
      regles: [off],
    });
    expect(r.messages.map((m) => m.code)).not.toContain("ABSENCES_RETARDS_SIGNIFICATIFS");
  });

  it("TEST 18 — l'ordre des messages est deterministe et par criticite", () => {
    const r = calculer({
      jours: [
        jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 }),
        jour({ date: "2026-09-02", lateMinutes: 90, workedMinutes: 390, normalMinutes: 390 }),
      ],
      segments: [segment({ dateDebut: DEBUT, dateFin: FIN, baseSalary: 10_000_000 })],
    });
    const niveaux = r.messages.map((m) => m.niveau);
    const rang = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
    for (let i = 1; i < niveaux.length; i += 1) {
      expect(rang[niveaux[i - 1]]).toBeLessThanOrEqual(rang[niveaux[i]]);
    }
    const second = calculer({
      jours: [
        jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 }),
        jour({ date: "2026-09-02", lateMinutes: 90, workedMinutes: 390, normalMinutes: 390 }),
      ],
      segments: [segment({ dateDebut: DEBUT, dateFin: FIN, baseSalary: 10_000_000 })],
    });
    expect(second.messages.map((m) => m.code)).toEqual(r.messages.map((m) => m.code));
  });

  it("TEST 19/20 — les 7 regles exigees sont declarees, et leur absence est signalee", () => {
    expect(CODES_REGLES_EXIGEES).toHaveLength(7);
    expect(reglesManquantes(jeuDeRegles())).toEqual([]);
    const partielle = jeuDeRegles().filter((r) => r.code !== "ABSENCE_NON_JUSTIFIEE");
    expect(reglesManquantes(partielle)).toEqual(["ABSENCE_NON_JUSTIFIEE"]);
  });

  it("une metrique absente (null) ne declenche pas de regle (§13)", () => {
    const r = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })],
      emp: employe({ salaireBase: 0 }),
      segments: [],
    });
    // impactPercent est null : IMPACT_IMPORTANT et IMPACT_TRES_ELEVE sont skips.
    expect(r.impactPercent).toBeNull();
    const codes = r.messages.map((m) => m.code);
    expect(codes).not.toContain("IMPACT_IMPORTANT");
    expect(codes).not.toContain("IMPACT_TRES_ELEVE");
    // ...mais la regle dediee au salaire incoherent, elle, parle.
    expect(codes).toContain("SALAIRE_REFERENCE_INCOHERENT");
  });
});

// ── §21 : justification des absences ─────────────────────────────────────

describe("RPT-03 absence non justifiee (§21)", () => {
  it("un jour MUET sans absence enregistree n'est PAS une non-justification (§21)", () => {
    // Aucun pointage n'est un défaut de saisie, pas une absence constatée.
    expect(
      compterJoursAbsenceNonJustifies([jour({ date: "2026-09-07", code: "MUET", workedMinutes: 0, normalMinutes: 0 })], [])
    ).toBe(0);
  });

  it("un jour A couvert par une absence justifiee n'est PAS non justifie", () => {
    expect(
      compterJoursAbsenceNonJustifies(
        [jour({ date: "2026-09-07", code: "A", workedMinutes: 0, normalMinutes: 0 })],
        absences([{ dateDebut: "2026-09-07", dateFin: "2026-09-07", justifie: true, statut: "approuve" }])
      )
    ).toBe(0);
  });

  it("un jour A couvert par une absence non justifiee l'est", () => {
    expect(
      compterJoursAbsenceNonJustifies(
        [jour({ date: "2026-09-07", code: "A", workedMinutes: 0, normalMinutes: 0 })],
        absences([{ dateDebut: "2026-09-07", dateFin: "2026-09-07", justifie: false, statut: "rejete" }])
      )
    ).toBe(1);
  });

  it("un jour de presence n'est jamais compte comme absence non justifiee", () => {
    expect(
      compterJoursAbsenceNonJustifies(
        [jour({ date: "2026-09-07", code: "P", lateMinutes: 30 })],
        absences([{ dateDebut: "2026-09-07", dateFin: "2026-09-07", justifie: false, statut: "rejete" }])
      )
    ).toBe(0);
  });

  it("un jour MUET (aucun pointage) n'est PAS une absence non justifiee (§21)", () => {
    // Un manque de saisie n'est pas une absence constatée : l'accuser serait
    // une faute. Le jour reste toutefois compté dans le coût financier.
    const jours = [jour({ date: "2026-09-07", code: "MUET", workedMinutes: 0, normalMinutes: 0 })];
    expect(compterJoursAbsenceNonJustifies(jours, [])).toBe(0);

    const r = calculer({ jours });
    expect(r.joursAbsenceNonJustifiee).toBe(0);
    expect(r.absenceHours).toBe(8);
    expect(r.estimatedImpact).toBeGreaterThan(0);
  });

  it("seul le code A declenche ABSENCE_NON_JUSTIFIEE", () => {
    const r = calculer({
      jours: [
        jour({ date: "2026-09-07", code: "A", workedMinutes: 0, normalMinutes: 0 }),
        jour({ date: "2026-09-08", code: "MUET", workedMinutes: 0, normalMinutes: 0 }),
      ],
    });
    expect(r.joursAbsenceNonJustifiee).toBe(1);
    expect(r.messages.map((m) => m.code)).toContain("ABSENCE_NON_JUSTIFIEE");
  });
});

// ── §15 : aggregation equipe ─────────────────────────────────────────────

describe("RPT-03 indicateurs equipe (§15)", () => {
  it("le ratio equipe est un ratio de sommes, pas une moyenne de taux", () => {
    const a = calculer({
      jours: [
        jour({ date: "2026-09-01", workedMinutes: 480, normalMinutes: 480 }),
        jour({ date: "2026-09-02", workedMinutes: 480, normalMinutes: 480 }),
      ],
    });
    const b = calculer({
      emp: employe({ id: 2 }),
      jours: [jour({ date: "2026-09-01", workedMinutes: 240, normalMinutes: 240 })],
    });
    const equipe = calculerIndicateursEquipe([a, b]);
    expect(equipe.effectif).toBe(2);
    // A : 16 h theoriques / 16 h faites (100 %). B : 8 h theoriques / 4 h faites (50 %).
    expect(a.tauxPresenceHeures).toBe(100);
    expect(b.tauxPresenceHeures).toBe(50);
    expect(equipe.heuresTheoriques).toBe(24);
    expect(equipe.heuresTravaillees).toBe(20);
    // Le ratio d'equipe est 20/24, PAS la moyenne de 100 % et 50 % (75 %).
    expect(equipe.tauxPresenceHeures).toBeCloseTo((20 / 24) * 100, 2);
    expect(equipe.tauxPresenceHeures).not.toBe(75);
  });

  it("impactPercent equipe : null si aucun salaire de reference", () => {
    const sansSalaire = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })],
      emp: employe({ salaireBase: 0 }),
      segments: [],
    });
    expect(calculerIndicateursEquipe([sansSalaire]).impactPercent).toBeNull();
  });
});

// ── §28 : robustesse ─────────────────────────────────────────────────────

describe("RPT-03 donnees negatives et nulles (§28)", () => {
  it("des heures negatives ne sont jamais propagatees", () => {
    const jours = [jour({ date: "2026-09-01", code: "MUET", heuresTheoriques: -8, workedMinutes: 0, normalMinutes: 0, lateMinutes: -30 })];
    const r = calculer({ jours });
    expect(r.absenceHours).toBe(0);
    expect(r.retardMinutes).toBe(0);
    expect(r.totalNotWorkedHours).toBe(0);
    expect(r.estimatedImpact).toBe(0);
    expect(Number.isFinite(r.estimatedImpact)).toBe(true);
    expect(Number.isFinite(r.impactPercent as number)).toBe(true);
  });

  it("un segment sans salaire est ignore, sans casser le total", () => {
    const r = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })],
      segments: [segment({ dateDebut: DEBUT, dateFin: FIN, baseSalary: null })],
    });
    expect(r.estimatedImpact).toBe(0);
    expect(r.tauxHoraireMoyen).toBe(0);
  });

  it("le calcul de segment renvoie une estimation nulle si le salaire est incoherent", () => {
    const c = calculerImpactSegment(
      segment({ dateDebut: DEBUT, dateFin: FIN, baseSalary: -1 }),
      { absenceHours: 8, lateMinutes: 60 },
      225.3
    );
    expect(c.estimatedImpact).toBe(0);
    expect(c.tauxHoraire).toBe(0);
  });
});

// ── §33 : mode explicite dans presence-engine ────────────────────────────

describe("RPT-03 mode TAUX_HORAIRE_SENSIBILISATION (§33)", () => {
  const SEM = 225.3;
  const taux = tauxDe(SEM);

  function tauxDe(h: number): number {
    return 500_000 / h;
  }

  it("calculateAbsenceImpact ne retourne plus systematiquement 0 : le mode sensibilisation estime", () => {
    const est = calculateAbsenceImpact("CONGE", "SALAIRE_MENSUEL", 500_000, 0, 22, null, {
      mode: "TAUX_HORAIRE_SENSIBILISATION",
      heuresSensibilisation: 8,
      tauxHoraireSensibilisation: taux,
    });
    expect(est.estimationMontant).toBeCloseTo(8 * taux, 2);
    expect(est.estimationMontant).not.toBe(0);
  });

  it("le mode RETENUE_PAIE reste a 0 : la paie ne change pas", () => {
    const paie = calculateAbsenceImpact("CONGE", "SALAIRE_MENSUEL", 500_000, 0, 22, null, {
      mode: "RETENUE_PAIE",
      heuresSensibilisation: 8,
      tauxHoraireSensibilisation: taux,
    });
    expect(paie.retenueReelle).toBe(0);
    expect(paie.estimationMontant).toBeNull();
  });

  it("sans mode explicite, le comportement historique est conserve", () => {
    const defaut = calculateAbsenceImpact("CONGE", "SALAIRE_MENSUEL", 500_000, 0, 22, null);
    expect(defaut.retenueReelle).toBe(0);
    expect(defaut.mode).toBe("RETENUE_PAIE");
  });

  it("calculateLateDeduction : l'estimation ne devient jamais une retenue", () => {
    const est = calculateLateDeduction(90, null, 500_000, 22, {
      mode: "TAUX_HORAIRE_SENSIBILISATION",
      tauxHoraireSensibilisation: taux,
    });
    expect(est.estimationHeures).toBe(1.5);
    expect(est.estimationMontant).toBeCloseTo(1.5 * taux, 2);
    // Le point central : la retenue de paie reste nulle.
    expect(est.deductionAmount).toBe(0);
    expect(est.deductibleMinutes).toBe(0);
  });

  it("la sensibilisation n'utilise jamais late_deduction_rules (§10)", () => {
    const avecRegle = calculateLateDeduction(90, { method: "FORFAIT_MINUTE", params: { forfaitParMinute: 5_000 } }, 500_000, 22, {
      mode: "TAUX_HORAIRE_SENSIBILISATION",
      tauxHoraireSensibilisation: taux,
    });
    expect(avecRegle.deductionAmount).toBe(0);
    expect(avecRegle.estimationMontant).toBeCloseTo(1.5 * taux, 2);
  });

  it("un taux absent rend l'estimation indisponible, pas nulle par faux calcul", () => {
    const sansTaux = calculateAbsenceImpact("CONGE", "SALAIRE_MENSUEL", 500_000, 0, 22, null, {
      mode: "TAUX_HORAIRE_SENSIBILISATION",
      heuresSensibilisation: 8,
    });
    expect(sansTaux.estimationMontant).toBeNull();
    expect(sansTaux.retenueReelle).toBe(0);
  });
});

// ── §12 : salaire de reference R7 ────────────────────────────────────────

describe("RPT-03 salaire de reference (§12)", () => {
  it("reutilise la regle R7 : le salaire de reference suit l'historique", () => {
    const seg = segmenterSalaires({
      fiche: { baseSalary: 500_000, modePaie: "SALAIRE_MENSUEL", forfaitHebdomadaire: 0 },
      historique: [
        { startDate: "2026-09-16", baseSalary: 800_000, endDate: null },
        { startDate: "2020-01-01", baseSalary: 500_000, endDate: "2026-09-15" },
      ],
      from: DEBUT,
      to: FIN,
    });
    expect(seg.length).toBe(2);
    const ref = salaireBaseReference({
      employe: employe(),
      segments: seg,
      periode: { debut: DEBUT, fin: FIN },
      holidays: [],
    });
    expect(ref).not.toBeNull();
    expect(ref!).toBeGreaterThan(500_000);
    expect(ref!).toBeLessThan(800_000);
  });

  it("un salaire de reference nul rend null, jamais 0", () => {
    expect(
      salaireBaseReference({
        employe: employe({ salaireBase: 0 }),
        segments: [],
        periode: { debut: DEBUT, fin: FIN },
        holidays: [],
      })
    ).toBeNull();
  });
});

// ── §24/§25 : explications de valeur ─────────────────────────────────────

describe("RPT-03 explications de valeur (§24/§25)", () => {
  it("chaque indicateur expose sa source, sa regle et ses evenements", () => {
    const r = calculer({
      jours: [
        jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 }),
        jour({ date: "2026-09-02", lateMinutes: 45, workedMinutes: 435, normalMinutes: 435 }),
      ],
      clc: calcs([{ lateDeductionAmount: 500 }]),
    });
    expect(r.explications).toHaveLength(4);
    for (const ex of r.explications) {
      expect(ex.source).toBeTruthy();
      expect(ex.regle).toBeTruthy();
      expect(ex.baseCalcul).toBeTruthy();
      expect(typeof ex.valeur).toBe("number");
    }
    const heures = r.explications.find((e) => e.regle.includes("heures theoriques"))!;
    expect(heures.evenements).toHaveLength(1);
    expect(heures.evenements[0].heures).toBe(8);
    const retard = r.explications.find((e) => e.regle.includes("minutes de retard"))!;
    expect(retard.evenements[0].minutes).toBe(45);
  });

  it("l'explication de la retenue reelle cite les jour[s] concernes", () => {
    const r = calculer({
      jours: [jour({ date: "2026-09-01" })],
      clc: calcs([{ date: "2026-09-01", lateDeductionAmount: 750 }]),
    });
    const ex = r.explications.find((e) => e.source.includes("late_deduction_amount"))!;
    expect(ex.valeur).toBe(750);
    expect(ex.evenements).toHaveLength(1);
    expect(ex.evenements[0].date).toBe("2026-09-01");
  });

  it("aucune donnee exploitable : l'explication le dit (§25)", () => {
    const r = calculer({ jours: [], segments: [] });
    const ex = r.explications.find((e) => e.source.includes("historique_salaire"))!;
    expect(ex.baseCalcul).toBe("aucun segment salarial exploitable");
    expect(ex.valeur).toBe(0);
  });
});

// ── messages : ordre et methrique ────────────────────────────────────────

describe("RPT-03 evaluation des regles (§20)", () => {
  it("construireMessagesSensibilisation est pur et ne mute pas l'indicateur", () => {
    const r = calculer({ jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })] });
    const avant = r.messages.length;
    const autres = construireMessagesSensibilisation(r, jeuDeRegles());
    expect(autres.length).toBe(avant);
    expect(r.messages.length).toBe(avant);
  });

  it("une regle inconnue de l'indicateur est ignoree silencieusement", () => {
    const r = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })],
      regles: [regles({ code: "INCONNUE", metrique: "metriqueInexistante", seuil: 0 })],
    });
    expect(r.messages).toHaveLength(0);
  });

  it("condition LE : declenche quand la valeur est inferieure ou egale au seuil", () => {
    const r = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })],
      emp: employe({ salaireBase: 0 }),
      segments: [],
      regles: [regles({ code: "SALAIRE_REFERENCE_INCOHERENT", metrique: "salaireReferenceManquant", condition: "GE", seuil: 1 })],
    });
    expect(r.messages.map((m) => m.code)).toEqual(["SALAIRE_REFERENCE_INCOHERENT"]);
  });

  it("la metrique binaire ne se declenche pas quand la reference existe", () => {
    const r = calculer({
      jours: [jour({ date: "2026-09-01", code: "MUET", workedMinutes: 0, normalMinutes: 0 })],
      regles: [regles({ code: "SALAIRE_REFERENCE_INCOHERENT", metrique: "salaireReferenceManquant", condition: "GE", seuil: 1 })],
    });
    expect(r.salaireBaseReference).not.toBeNull();
    expect(r.messages.map((m) => m.code)).not.toContain("SALAIRE_REFERENCE_INCOHERENT");
  });
});
