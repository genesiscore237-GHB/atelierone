import { describe, it, expect, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/lib/rbac-service", () => ({
  RBACService: { isSuperAdmin: vi.fn(), hasPermission: vi.fn() },
}));

import {
  classerEvenement,
  construireEvenementsRapport,
  construireLigneRapport,
  construireMethodologie,
  construireResumeRapport,
  trierRowsRapport,
  type DonneesSituation,
  type EmployeBrut,
  type EmployeeReportRow,
  type SaisieBrute,
} from "~/server/lib/rh-centre-rapports";
import type { LigneSituation } from "~/server/lib/rh-situation-engine";

const FROM = "2026-09-01";
const TO = "2026-09-30";

function employe(over: Partial<EmployeBrut> = {}): EmployeBrut {
  return {
    id: 1,
    matricule: "GPJ-TEST-001",
    prenom: "Test",
    nom: "Employe",
    departement: "Carrosserie",
    statut: "actif",
    salaireBase: 80000,
    modePaie: "SALAIRE_HORAIRE",
    forfaitHebdomadaire: 0,
    dateEmbauche: "2026-01-01",
    dateSortie: null,
    workCycleId: null,
    dateFinContrat: null,
    fonction: "TÃ´lier",
    departmentId: null,
    ...over,
  };
}

function saisie(over: Partial<SaisieBrute> = {}): SaisieBrute {
  return {
    id: 1,
    timeIn: null,
    timeInBreak: null,
    timeOutBreak: null,
    timeOut: null,
    validated: false,
    status: "PRESENT",
    source: "manual",
    absenceType: null,
    absenceMotif: null,
    absenceJustificatif: null,
    notes: null,
    validatedBy: null,
    validatedAt: null,
    createdBy: null,
    createdAt: null,
    ...over,
  };
}

function baseDonnees(): DonneesSituation {
  return {
    from: FROM,
    to: TO,
    today: "2026-10-01",
    holidays: [],
    items: [],
    standardMonthlyHours: 225.3,
    overtimeMultiplier: 1.5,
    seuilDefaut: 9.5,
    employees: [],
    calcsByEmploye: new Map(),
    saisiesByEmploye: new Map(),
    histoByEmploye: new Map(),
    advancesByEmploye: new Map(),
    recoveriesByEmp: new Map(),
    suspensions: new Map(),
    situationsByEmploye: new Map(),
    payrollPeriods: [],
    summaries: [],
    bulletinByEmp: new Map(),
    nonWorkingByCycle: new Map(),
    schedByCycleDay: new Map(),
    absencesByEmploye: new Map(),
    posteSegmentsByEmploye: new Map(),
    parametresPresence: {
      lateToleranceMinutes: 10,
      roundToMinutes: 5,
      autoDeductLate: true,
      countEarlyArrival: false,
      countLateDeparture: false,
    },
    nomsUtilisateurs: new Map([[7, "Admin RH"]]),
  };
}

function ligneBase(over: Partial<LigneSituation> = {}): LigneSituation {
  return {
    employeeId: 1,
    matricule: "GPJ-TEST-001",
    prenom: "Test",
    nom: "Employe",
    departement: "Carrosserie",
    statut: "actif",
    mode: "SALAIRE_HORAIRE",
    joursTheoriques: 22,
    joursPresence: 20,
    joursAbsence: 2,
    joursConges: 0,
    joursMuets: 0,
    heuresTheoriques: 209,
    heuresTravaillees: 190,
    heuresNormales: 190,
    heuresSupp: 0,
    retardTotalMinutes: 30,
    departAnticipeTotalMinutes: 0,
    tauxPresence: 90.9,
    salaires: {
      baseContractuelle: 80000,
      gains: 100000,
      retenues: 10000,
      net: 90000,
      netLabel: "ESTIME",
      segments: [],
      tauxHoraire: 526.31,
      bulletinExiste: false,
    },
    avances: { avancePeriode: 0, recuperePeriode: 0, soldeFinPeriode: 0, soldeActuel: 0, nbAvances: 0 },
    anomalies: [],
    ...over,
  };
}

describe("RPT-01 classification des evenements", () => {
  it("classe un code court d'absence (A) en ABSENCE", () => {
    expect(classerEvenement({ status: "ABSENCE_INJUSTIFIEE", codePresence: "A", isAbsent: true })).toBe("ABSENCE");
  });

  it("classe conge, maladie et accident depuis le statut", () => {
    expect(classerEvenement({ status: "CONGE", isAbsent: true })).toBe("CONGE");
    expect(classerEvenement({ status: "MALADIE", isAbsent: true })).toBe("MALADIE");
    expect(classerEvenement({ status: "ACCIDENT", isAbsent: true })).toBe("ACCIDENT");
  });

  it("retombe sur ABSENCE si le calcul atteste l'absence", () => {
    expect(classerEvenement({ status: null, codePresence: null, isAbsent: true })).toBe("ABSENCE");
  });

  it("ne fabrique pas de type : AUTRE si rien ne qualifie", () => {
    expect(classerEvenement({ status: "PRESENT", codePresence: "P", isAbsent: false })).toBe("AUTRE");
    expect(classerEvenement({})).toBe("AUTRE");
  });
});

describe("RPT-01 reconciliation des absences", () => {
  it("emmet un seul evenement quand la journee est dans les deux sources", () => {
    const d = baseDonnees();
    const emp = employe();
    d.saisiesByEmploye.set(
      emp.id,
      new Map([["2026-09-07", saisie({ id: 10, status: "ABSENCE_INJUSTIFIEE", absenceType: "INJUSTIFIEE" })]])
    );
    d.calcsByEmploye.set(
      emp.id,
      [{ date: "2026-09-07", employeeId: emp.id, codePresence: "A", isAbsent: true, workedMinutes: 0, normalMinutes: 0, overtimeMinutes: 0, lateMinutes: 0, earlyDepartureMinutes: 0, lateDeductionAmount: null, absenceFinancialImpact: null, taskBonus: null }]
    );
    d.absencesByEmploye.set(emp.id, [
      { id: 55, employeId: emp.id, typeAbsence: "INJUSTIFIEE", dateDebut: "2026-09-07", dateFin: "2026-09-07", dureeJours: 1, motif: "Non justifiee", justifie: false, statut: "en_attente", validePar: null, createdAt: null },
    ]);

    const events = construireEvenementsRapport(emp, ligneBase(), d, true);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("ABSENCE");
    expect(events[0].date).toBe("2026-09-07");
    expect(events[0].source).toBe("attendance_entries");
  });

  it("synthetise une absence presente uniquement dans la table absences", () => {
    const d = baseDonnees();
    const emp = employe();
    d.absencesByEmploye.set(emp.id, [
      { id: 56, employeId: emp.id, typeAbsence: "MALADIE", dateDebut: "2026-09-09", dateFin: "2026-09-11", dureeJours: 3, motif: "Arret", justifie: true, statut: "valide", validePar: 7, createdAt: null },
    ]);

    const events = construireEvenementsRapport(emp, ligneBase(), d, true);
    expect(events.map((e) => e.date)).toEqual(["2026-09-09", "2026-09-10", "2026-09-11"]);
    expect(events.every((e) => e.source === "absences")).toBe(true);
    expect(events.every((e) => e.type === "MALADIE")).toBe(true);
    expect(events[0].validePar).toBe("Admin RH");
  });

  it("gere une absence ouverte (dateFin null) sans deborder la periode", () => {
    const d = baseDonnees();
    const emp = employe();
    d.absencesByEmploye.set(emp.id, [
      { id: 57, employeId: emp.id, typeAbsence: "CONGE", dateDebut: "2026-09-28", dateFin: null, dureeJours: null, motif: null, justifie: true, statut: "valide", validePar: null, createdAt: null },
    ]);

    const events = construireEvenementsRapport(emp, ligneBase(), d, true);
    expect(events.map((e) => e.date)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
  });

  it("ignore les journees hors periode", () => {
    const d = baseDonnees();
    const emp = employe();
    d.absencesByEmploye.set(emp.id, [
      { id: 58, employeId: emp.id, typeAbsence: "CONGE", dateDebut: "2026-08-20", dateFin: "2026-08-25", dureeJours: 6, motif: null, justifie: true, statut: "valide", validePar: null, createdAt: null },
    ]);
    expect(construireEvenementsRapport(emp, ligneBase(), d, true)).toHaveLength(0);
  });

  it("n'ajoute pas les retards dans le decompte des absences", () => {
    const d = baseDonnees();
    const emp = employe();
    d.saisiesByEmploye.set(emp.id, new Map([["2026-09-03", saisie({ id: 11 })]]));
    d.calcsByEmploye.set(
      emp.id,
      [{ date: "2026-09-03", employeeId: emp.id, codePresence: "R", isAbsent: false, workedMinutes: 480, normalMinutes: 480, overtimeMinutes: 0, lateMinutes: 15, earlyDepartureMinutes: 0, lateDeductionAmount: 0, absenceFinancialImpact: 0, taskBonus: null }]
    );

    const events = construireEvenementsRapport(emp, ligneBase(), d, true);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("RETARD");
    expect(events[0].lateMinutes).toBe(15);
    expect(events[0].payrollImpact).toBeNull();
  });

  it("expose les situations RH comme evenements dedies", () => {
    const d = baseDonnees();
    const emp = employe();
    // RPT-02 : la cle du map est l'identifiant employe (cf. chargerSituation).
    // Lire par matricule rendait ce bloc silencieusement vide en production.
    d.situationsByEmploye.set(String(emp.id), [
      {
        category: "DISCIPLINAIRE",
        type: "AVERTISSEMENT",
        dateDebut: "2026-09-15",
        dateFin: null,
        impactContrat: "AUCUN",
        impactPresence: "AUCUN",
        impactPlanning: "AUCUN",
        impactPaie: "AUCUN",
        montantRetenue: "1500",
      },
    ]);
    const events = construireEvenementsRapport(emp, ligneBase(), d, true);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("SITUATION_RH");
    expect(events[0].payrollImpact).toBe(1500);
  });
});

describe("RPT-01 contrat EmployeeReportRow", () => {
  it("expose les aliases sans second calcul", () => {
    const d = baseDonnees();
    const row = construireLigneRapport(employe(), ligneBase(), d, true);
    expect(row.heuresAttendues).toBe(row.heuresTheoriques);
    expect(row.joursAbsents).toBe(row.joursAbsence);
  });

  it("complete fonction et segments de poste", () => {
    const d = baseDonnees();
    d.posteSegmentsByEmploye.set(1, [
      { positionId: 3, poste: "TÃ´lier", code: "TOL", departmentId: 1, departement: "Carrosserie", dateDebut: "2026-02-01", dateFin: "2026-05-31", motif: "Promotion" },
      { positionId: 4, poste: "Chef d'Ã©quipe", code: "CHEF", departmentId: 1, departement: "Carrosserie", dateDebut: "2026-06-01", dateFin: null, motif: null },
    ]);
    const row = construireLigneRapport(employe(), ligneBase(), d, true);
    expect(row.fonction).toBe("TÃ´lier");
    expect(row.posteSegments).toHaveLength(2);
    expect(row.posteSegments[0].poste).toBe("TÃ´lier");
    expect(row.posteSegments[1].poste).toBe("Chef d'Ã©quipe");
  });

  it("retire les champs de remuneration quand la permission est absente", () => {
    const d = baseDonnees();
    const row = construireLigneRapport(employe(), ligneBase({ salaires: null, avances: null }), d, false);
    expect(row.salariesVisible).toBe(false);
    expect(row).not.toHaveProperty("totalNet");
    expect(row).not.toHaveProperty("gains");
    expect(row).not.toHaveProperty("masseAcquise");
    expect(row).not.toHaveProperty("avancePeriode");
    expect(row).not.toHaveProperty("tauxHoraire");
    expect(row).not.toHaveProperty("segmentsSalaires");
    expect(row.joursPresence).toBe(20);
  });

  it("distingue le taux de presence en jours de celui en heures", () => {
    const d = baseDonnees();
    const row = construireLigneRapport(employe(), ligneBase({ tauxPresence: 90.9 }), d, true);
    expect(row.tauxPresence).toBe(90.9);
    expect(row.tauxPresenceHeures).toBeCloseTo((190 / 209) * 100, 2);
  });
});

describe("RPT-01 resume et pagination", () => {
  it("calcule le resume depuis les lignes produites", () => {
    const d = baseDonnees();
    const rows: EmployeeReportRow[] = [
      construireLigneRapport(employe(), ligneBase(), d, true),
      construireLigneRapport(employe({ id: 2, matricule: "GPJ-TEST-002", nom: "Autre" }), ligneBase({ employeeId: 2, matricule: "GPJ-TEST-002", nom: "Autre", heuresTravaillees: 100, retardTotalMinutes: 10 }), d, true),
    ];
    const summary = construireResumeRapport(rows, [], true);
    expect(summary.employes).toBe(2);
    expect(summary.heuresTravaillees).toBe(290);
    expect(summary.retardTotalMinutes).toBe(40);
    expect(summary.gains).toBe(200000);
    expect(summary.salariesVisible).toBe(true);
  });

  it("masque les totaux de remuneration sans permission", () => {
    const d = baseDonnees();
    const rows = [construireLigneRapport(employe(), ligneBase(), d, false)];
    const summary = construireResumeRapport(rows, [], false) as unknown as Record<string, unknown>;
    // RPT-05 : la cle est ABSENTE, pas null.
    expect(Object.hasOwn(summary, "masseAcquise")).toBe(false);
    expect(Object.hasOwn(summary, "totalNet")).toBe(false);
    expect(Object.hasOwn(summary, "gains")).toBe(false);
    expect(summary.heuresTravaillees).toBe(190);
  });

  it("tri ascendant et descendant, valeurs nulles en fin", () => {
    const d = baseDonnees();
    const a = construireLigneRapport(employe(), ligneBase(), d, true);
    const b = construireLigneRapport(employe({ id: 2, matricule: "M2", nom: "Beta" }), ligneBase({ employeeId: 2, matricule: "M2", nom: "Beta", heuresTravaillees: 50 }), d, true);
    const c = construireLigneRapport(employe({ id: 3, matricule: "M3", nom: "Gamma" }), ligneBase({ employeeId: 3, matricule: "M3", nom: "Gamma", heuresTravaillees: null as unknown as number }), d, true);

    expect(trierRowsRapport([a, b, c], "heuresTravaillees", "desc").map((r) => r.employeeId)).toEqual([1, 2, 3]);
    expect(trierRowsRapport([b, a, c], "nom", "asc").map((r) => r.nom)).toEqual(["Beta", "Employe", "Gamma"]);
  });
});

describe("RPT-01 methodologie", () => {
  it("documente la periode, les feries et la regle de retard sans donnee sensible", () => {
    const d = baseDonnees();
    d.holidays = ["2026-09-15"];
    const m = construireMethodologie(d, true, {
      evenementsAbsence: 0,
      evenementsComptabilises: 0,
      joursComptabilises: 0,
      ecart: 0,
      parMotifNonComptabilisation: {},
      doublonsSupprimes: 0,
    });
    expect(m.periode).toEqual({ from: FROM, to: TO });
    expect(m.joursOuvres).toBe(30);
    expect(m.joursOuvresHorsFeries).toBe(25);
    expect(m.feries).toEqual(["2026-09-15"]);
    expect(m.lateToleranceMinutes).toBe(10);
    expect(m.regleRetard).toContain("10");
    expect(m.sourceAbsences).toContain("attendance_entries");
    expect(m.salariesVisible).toBe(true);
  });

  it("reste non sensible quand la remuneration est masquee", () => {
    const m = construireMethodologie(baseDonnees(), false, {
      evenementsAbsence: 0,
      evenementsComptabilises: 0,
      joursComptabilises: 0,
      ecart: 0,
      parMotifNonComptabilisation: {},
      doublonsSupprimes: 0,
    });
    expect(m.salariesVisible).toBe(false);
    expect(m.sourceSalaires).toBeTypeOf("string");
    expect(Object.keys(m)).not.toContain("employes");
  });
});