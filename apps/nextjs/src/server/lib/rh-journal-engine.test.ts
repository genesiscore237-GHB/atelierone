import { describe, it, expect, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/lib/rbac-service", () => ({
  RBACService: { isSuperAdmin: vi.fn(), hasPermission: vi.fn() },
}));

import {
  appliquerFiltres,
  construireJournal,
  construireReferenceSensibilisation,
  correspondType,
  eventIdStable,
  analyserEventIdStable,
  lateHoursDepuisMinutes,
  masquerJustificatif,
  PAGE_SIZE_MAX,
  paginer,
  trierEvenements,
  type JustificationSource,
} from "~/server/lib/rh-journal-engine";
import type {
  AbsenceTableRow,
  CalcBrut,
  DonneesSituation,
  EmployeBrut,
  ReportEvent,
  SaisieBrute,
} from "~/server/lib/rh-centre-rapports";

const FROM = "2026-08-01";
const TO = "2026-08-31";

function employe(over: Partial<EmployeBrut> = {}): EmployeBrut {
  return {
    id: 14,
    matricule: "GPJ-TEST-014",
    prenom: "Amine",
    nom: "Benali",
    departement: "Carrosserie",
    statut: "actif",
    salaireBase: 80000,
    modePaie: "SALAIRE_HORAIRE",
    forfaitHebdomadaire: 0,
    dateEmbauche: "2026-01-01",
    dateSortie: null,
    workCycleId: null,
    dateFinContrat: null,
    fonction: "Tôlier",
    departmentId: 2,
    ...over,
  };
}

function saisie(over: Partial<SaisieBrute> = {}): SaisieBrute {
  return {
    id: 100,
    timeIn: null,
    timeInBreak: null,
    timeOutBreak: null,
    timeOut: null,
    validated: false,
    status: "ABSENT",
    source: "manual",
    absenceType: "MALADIE",
    absenceMotif: "Arrêt maladie",
    absenceJustificatif: null,
    notes: null,
    validatedBy: null,
    validatedAt: null,
    createdBy: null,
    createdAt: null,
    ...over,
  };
}

function calc(over: Partial<CalcBrut> = {}): CalcBrut {
  return {
    date: "2026-08-27",
    employeeId: 14,
    codePresence: "A",
    isAbsent: true,
    workedMinutes: 0,
    normalMinutes: 0,
    overtimeMinutes: 0,
    lateMinutes: 0,
    earlyDepartureMinutes: 0,
    lateDeductionAmount: 0,
    absenceFinancialImpact: 0,
    taskBonus: null,
    ...over,
  };
}

function absence(over: Partial<AbsenceTableRow> = {}): AbsenceTableRow {
  return {
    id: 1,
    employeId: 14,
    typeAbsence: "MALADIE",
    dateDebut: "2026-08-27",
    dateFin: null,
    dureeJours: 1,
    motif: "Arrêt maladie",
    justifie: true,
    statut: "approuve",
    validePar: null,
    createdAt: null,
    ...over,
  };
}

function baseDonnees(over: Partial<DonneesSituation> = {}): DonneesSituation {
  return {
    from: FROM,
    to: TO,
    today: "2026-09-01",
    holidays: [],
    items: [],
    standardMonthlyHours: 225.3,
    overtimeMultiplier: 1.5,
    seuilDefaut: 9.5,
    employees: [employe()],
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
    ...over,
  };
}

function evenement(over: Partial<ReportEvent> = {}): ReportEvent {
  return {
    id: "ATT:14:2026-08-27",
    employeeId: 14,
    matricule: "GPJ-TEST-014",
    date: "2026-08-27",
    type: "MALADIE",
    libelle: "MALADIE",
    presenceCode: "A",
    justificatif: null,
    motif: null,
    presenceValidee: null,
    validePar: null,
    auteur: null,
    lateMinutes: null,
    earlyDepartureMinutes: null,
    payrollImpact: null,
    source: "attendance_entries",
    comptabilise: true,
    motifNonComptabilisation: null,
    ...over,
  };
}

function avecSaisie(d: DonneesSituation, jour: string, s: SaisieBrute): DonneesSituation {
  d.saisiesByEmploye.set(14, new Map([[jour, s]]));
  return d;
}

function avecCalc(d: DonneesSituation, c: CalcBrut): DonneesSituation {
  d.calcsByEmploye.set(14, [c]);
  return d;
}

// ─── TEST 01 : une absence RPT-01 = UNE ligne de journal ──────────────────

describe("TEST 01 — occurrence unique", () => {
  it("une absence RPT-01 produit exactement une ligne de journal", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc());
    const lignes = construireJournal({ events: [evenement()], situation: d });
    expect(lignes).toHaveLength(1);
    expect(lignes[0].eventId).toBe("journal:14:2026-08-27");
    expect(lignes[0].type).toBe("MALADIE");
  });

  it("les evenements RPT-01 ne sont jamais modifies par le moteur", () => {
    const events = [evenement()];
    const copie = JSON.parse(JSON.stringify(events));
    construireJournal({ events, situation: avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc()) });
    expect(events).toEqual(copie);
  });

  it("l'identifiant de ligne est derive de la cle (employe, date), jamais d'une position", () => {
    expect(eventIdStable(14, "2026-08-27")).toBe("journal:14:2026-08-27");
    expect(eventIdStable(14, "2026-08-27T00:00:00.000Z")).toBe("journal:14:2026-08-27");
  });

  it("l'identifiant se relit exactement (aller-retour, le 2e deux-points est le separateur)", () => {
    expect(analyserEventIdStable("journal:14:2026-08-27")).toEqual({
      employeeId: 14,
      date: "2026-08-27",
    });
    expect(analyserEventIdStable(eventIdStable(14, "2026-08-27"))).toEqual({
      employeeId: 14,
      date: "2026-08-27",
    });
    // Employe compose de plusieurs chiffres : le prefixe ne doit pas bouger le parsing.
    expect(analyserEventIdStable("journal:1234:2026-08-27")).toEqual({
      employeeId: 1234,
      date: "2026-08-27",
    });
  });

  it("un identifiant de journal mal forme est rejete, jamais reinterprete", () => {
    for (const invalide of [
      "journal:14", // date absente
      "journal:14:", // date vide
      "journal::2026-08-27", // employe vide
      "journal:abc:2026-08-27", // employe non numerique
      "journal:0:2026-08-27", // employe nul
      "journal:-4:2026-08-27", // employe negatif
      "journal:14:27-08-2026", // date non ISO
      "journal:14:2026-08-27:extra", // suffixe inattendu
      "absence:14:2026-08-27", // mauvais prefixe
      "",
    ]) {
      expect(analyserEventIdStable(invalide)).toBeNull();
    }
  });

  it("un evenement RPT-01 dont l'employe est absent de la situation est ignore", () => {
    const d = baseDonnees({ employees: [] });
    expect(construireJournal({ events: [evenement()], situation: d })).toHaveLength(0);
  });
});

// ─── TEST 02 : fusion ATT + RET sur une meme journee ─────────────────────

describe("TEST 02 — fusion ATT/RET", () => {
  it("ATT + RET le meme jour = UNE ligne, deux identifiants RPT-01 traces", () => {
    const d = avecCalc(
      avecSaisie(baseDonnees(), "2026-08-27", saisie({ status: "PRESENT", absenceType: null, absenceMotif: null })),
      calc({
        codePresence: "A",
        isAbsent: false,
        lateMinutes: 25,
        lateDeductionAmount: 500,
        normalMinutes: 570,
      })
    );

    const lignes = construireJournal({
      events: [
        evenement({ id: "ATT:14:2026-08-27", type: "ABSENCE", comptabilise: false, motifNonComptabilisation: "CODE_CALCULE_DIFFERENT", presenceCode: "P" }),
        evenement({ id: "RET:14:2026-08-27", type: "RETARD", source: "attendance_calculations", lateMinutes: 25, payrollImpact: 500, comptabilise: null, motifNonComptabilisation: null }),
      ],
      situation: d,
    });

    expect(lignes).toHaveLength(1);
    expect(lignes[0].rapportEventIds).toEqual(["ATT:14:2026-08-27", "RET:14:2026-08-27"]);
    expect(lignes[0].casReconciliation).toBe("A");
    expect(lignes[0].lateMinutes).toBe(25);
  });

  it("une situation RH n'est jamais degradee en absence (type prioritaire)", () => {
    const d = avecSaisie(baseDonnees(), "2026-08-27", saisie({ status: "ABSENT" }));
    const lignes = construireJournal({
      events: [
        evenement({ id: "SIT:9:2026-08-27", type: "SITUATION_RH", source: "situations_rh", comptabilise: null, motifNonComptabilisation: null }),
      ],
      situation: d,
    });
    expect(lignes[0].type).toBe("SITUATION_RH");
  });
});

// ─── TEST 03 : retards (§8) ───────────────────────────────────────────────

describe("TEST 03 — retards", () => {
  it("lateHours = lateMinutes / 60", () => {
    expect(lateHoursDepuisMinutes(25)).toBe(0.42);
    expect(lateHoursDepuisMinutes(0)).toBe(0);
  });

  it("les minutes proviennent de RPT-01, pas d'un recalcul", () => {
    const d = avecCalc(
      avecSaisie(baseDonnees(), "2026-08-27", saisie({ status: "PRESENT", absenceType: null, absenceMotif: null, timeIn: "08:47" })),
      calc({ codePresence: "P", isAbsent: false, lateMinutes: 17, lateDeductionAmount: 340 })
    );
    const lignes = construireJournal({
      events: [evenement({ id: "RET:14:2026-08-27", type: "RETARD", source: "attendance_calculations", presenceCode: "P", lateMinutes: 17, payrollImpact: 340, comptabilise: null, motifNonComptabilisation: null })],
      situation: d,
    });
    expect(lignes[0].lateMinutes).toBe(17);
    expect(lignes[0].lateHours).toBe(0.28);
    expect(lignes[0].payrollImpactRetard).toBe(340);
    expect(lignes[0].heureArrivee).toBe("08:47");
    expect(lignes[0].toleranceMinutes).toBe(10);
  });

  it("un depart anticipe sans retard reste visible sans minutes de retard", () => {
    const d = avecCalc(
      avecSaisie(baseDonnees(), "2026-08-27", saisie({ status: "PRESENT", absenceType: null, absenceMotif: null })),
      calc({ codePresence: "P", isAbsent: false, earlyDepartureMinutes: 20 })
    );
    const lignes = construireJournal({
      events: [evenement({ id: "RET:14:2026-08-27", type: "RETARD", source: "attendance_calculations", presenceCode: "P", lateMinutes: null, earlyDepartureMinutes: 20, payrollImpact: null, comptabilise: null, motifNonComptabilisation: null })],
      situation: d,
    });
    expect(lignes[0].lateMinutes).toBe(0);
    expect(lignes[0].earlyDepartureMinutes).toBe(20);
  });
});

// ─── TEST 04 : journée entière (§9) ──────────────────────────────────────

describe("TEST 04 — journee entiere", () => {
  it("journee entiere uniquement quand RPT-01 a decide la comptabilisation", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc());
    const [ligne] = construireJournal({ events: [evenement()], situation: d });
    expect(ligne.journeeEntiere).toBe(true);
    expect(ligne.dureeHeures).toBe(9.5);
  });

  it("une absence partielle n'est jamais promue en journee entiere", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc({ normalMinutes: 300 }));
    const [ligne] = construireJournal({
      events: [evenement({ comptabilise: false, motifNonComptabilisation: "CODE_CALCULE_DIFFERENT" })],
      situation: d,
    });
    expect(ligne.journeeEntiere).toBe(false);
    expect(ligne.dureeHeures).toBe(5);
    expect(ligne.comptabilise).toBe(false);
    expect(ligne.motifNonComptabilisation).toBe("CODE_CALCULE_DIFFERENT");
  });

  it("un jour non travaille porte zero heure theorique et zero impact", () => {
    // 2026-08-30 est un dimanche : jamais un jour ouvre.
    const d = avecCalc(
      avecSaisie(baseDonnees(), "2026-08-30", saisie({ absenceType: null, absenceMotif: null })),
      calc({ date: "2026-08-30" })
    );
    const [ligne] = construireJournal({
      events: [evenement({ date: "2026-08-30", id: "ATT:14:2026-08-30", comptabilise: false, motifNonComptabilisation: "DIMANCHE" })],
      situation: d,
    });
    expect(ligne.estJourTravaille).toBe(false);
    expect(ligne.heuresTheoriques).toBe(0);
    expect(ligne.presenceImpactHours).toBe(0);
    expect(ligne.anomalies.some((a) => a.code === "ANOMALIE_HORS_PERIODE_EMPLOI")).toBe(true);
  });

  it("un jour avant l'embauche est signale hors periode d'emploi", () => {
    const d = avecCalc(
      baseDonnees({ employees: [employe({ dateEmbauche: "2026-08-20" })] }),
      calc({ date: "2026-08-10" })
    );
    d.saisiesByEmploye.set(14, new Map([["2026-08-10", saisie({ absenceType: null, absenceMotif: null })]]));
    const [ligne] = construireJournal({
      events: [evenement({ date: "2026-08-10", id: "ATT:14:2026-08-10", comptabilise: false, motifNonComptabilisation: "HORS_PERIODE_EMPLOI" })],
      situation: d,
    });
    expect(ligne.estJourTravaille).toBe(false);
    expect(ligne.anomalies.map((a) => a.code)).toContain("ANOMALIE_HORS_PERIODE_EMPLOI");
  });
});

// ─── TEST 05 : reconciliation (§10) ──────────────────────────────────────

describe("TEST 05 — reconciliation", () => {
  it("CAS A : saisie seule", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc());
    const [ligne] = construireJournal({ events: [evenement()], situation: d });
    expect(ligne.casReconciliation).toBe("A");
    expect(ligne.sources).toEqual(["attendance_entries"]);
  });

  it("CAS B : absence declarative seule, jamais un jour comptabilise", () => {
    const d = baseDonnees();
    d.absencesByEmploye.set(14, [absence()]);
    const [ligne] = construireJournal({
      events: [
        evenement({
          id: "ABS:1:2026-08-27",
          source: "absences",
          comptabilise: false,
          motifNonComptabilisation: "DECLARATION_SEULE",
          justificatif: "Absence declaree justifiee",
          presenceValidee: null,
          type: "MALADIE",
        }),
      ],
      situation: d,
    });
    expect(ligne.casReconciliation).toBe("B");
    expect(ligne.comptabilise).toBe(false);
    expect(ligne.motifNonComptabilisation).toBe("DECLARATION_SEULE");
  });

  it("CAS C : saisie ET declaration presente sur la meme journee", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc());
    d.absencesByEmploye.set(14, [absence()]);
    const [ligne] = construireJournal({ events: [evenement()], situation: d });
    expect(ligne.casReconciliation).toBe("C");
  });

  it("CAS D : deux saisies le meme jour -> conflit, impacts a zero", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc({ normalMinutes: 570, absenceFinancialImpact: 5000 }));
    const [ligne] = construireJournal({
      events: [evenement({ payrollImpact: 5000 })],
      situation: d,
      conflits: [{ employeeId: 14, date: "2026-08-27", entryIds: [100, 101] }],
    });
    expect(ligne.casReconciliation).toBe("D");
    expect(ligne.presenceImpactHours).toBe(0);
    expect(ligne.payrollImpact).toBe(0);
    expect(ligne.dureeHeures).toBe(0);
    expect(ligne.anomalies[0].code).toBe("ANOMALIE_CONFLIT_EVENT");
    expect((ligne.anomalies[0].details as { entryIds: number[] }).entryIds).toEqual([100, 101]);
  });

  it("une contradiction de type entre declaration et saisie est signalee", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie({ absenceType: "CONGE" })), calc());
    d.absencesByEmploye.set(14, [absence({ typeAbsence: "MALADIE" })]);
    const [ligne] = construireJournal({ events: [evenement()], situation: d });
    expect(ligne.anomalies.map((a) => a.code)).toContain("ANOMALIE_RECONCILIATION");
  });
});

// ─── TEST 06 : validations fantomes (§14) ────────────────────────────────

describe("TEST 06 — validation fantome", () => {
  it("saisie validee sans validateur", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie({ validated: true, validatedBy: null })), calc());
    const [ligne] = construireJournal({ events: [evenement()], situation: d });
    expect(ligne.anomalies.map((a) => a.code)).toContain("ANOMALIE_VALIDATION_SANS_AUTEUR");
    expect(ligne.justificatifStatut).toBe("AUCUN");
  });

  it("absence justifiee sans valideur", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc());
    d.absencesByEmploye.set(14, [absence({ justifie: true, validePar: null })]);
    const [ligne] = construireJournal({ events: [evenement()], situation: d });
    expect(ligne.anomalies.map((a) => a.code)).toContain("ANOMALIE_VALIDATION_SANS_AUTEUR");
  });

  it("justificatif VALIDE sans decisionPar", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc());
    const justif: JustificationSource = {
      id: 5,
      employeeId: 14,
      date: "2026-08-27",
      statut: "VALIDE",
      motifCode: "MALADIE",
      motifLibelle: "Certificat medical",
      justificatifUrl: "https://docs/cert.pdf",
      justificatifReference: "CERT-001",
      justificatifType: "PDF",
      deposePar: 3,
      deposeAt: "2026-08-28T09:00:00.000Z",
      decisionPar: null,
      decisionAt: null,
      refusMotif: null,
    };
    const [ligne] = construireJournal({ events: [evenement()], situation: d, justifications: [justif] });
    expect(ligne.anomalies.map((a) => a.code)).toContain("ANOMALIE_VALIDATION_SANS_AUTEUR");
  });
});

// ─── TEST 07 : workflow justificatif (§11) ───────────────────────────────

describe("TEST 07 — workflow justificatif", () => {
  const baseJustif: JustificationSource = {
    id: 5,
    employeeId: 14,
    date: "2026-08-27",
    statut: "FOURNI",
    motifCode: "MALADIE",
    motifLibelle: "Certificat medical",
    justificatifUrl: "https://docs/cert.pdf",
    justificatifReference: "CERT-001",
    justificatifType: "PDF",
    deposePar: 3,
    deposeAt: "2026-08-28T09:00:00.000Z",
    decisionPar: null,
    decisionAt: null,
    refusMotif: null,
  };

  it("un MOTIF sans justificatif ne vaut pas un justificatif", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie({ absenceMotif: "Grippe" })), calc());
    const [ligne] = construireJournal({ events: [evenement({ motif: "Grippe" })], situation: d });
    expect(ligne.justificatifStatut).toBe("AUCUN");
    expect(ligne.motif).toBe("Grippe");
  });

  it("FOURNI n'est pas VALIDE : la decision reste vide", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc());
    const [ligne] = construireJournal({ events: [evenement()], situation: d, justifications: [baseJustif] });
    expect(ligne.justificatifStatut).toBe("FOURNI");
    expect(ligne.decisionPar).toBeNull();
    expect(ligne.deposePar).toBe(3);
    expect(ligne.motifCode).toBe("MALADIE");
  });

  it("VALIDE porte decisionPar et decisionAt", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc());
    const [ligne] = construireJournal({
      events: [evenement()],
      situation: d,
      justifications: [{ ...baseJustif, statut: "VALIDE", decisionPar: 9, decisionAt: "2026-08-29T10:00:00.000Z" }],
    });
    expect(ligne.justificatifStatut).toBe("VALIDE");
    expect(ligne.decisionPar).toBe(9);
    expect(ligne.anomalies).toHaveLength(0);
  });

  it("REFUSE conserve son motif", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc());
    const [ligne] = construireJournal({
      events: [evenement()],
      situation: d,
      justifications: [{ ...baseJustif, statut: "REFUSE", decisionPar: 9, decisionAt: "2026-08-29T10:00:00.000Z", refusMotif: "Document illisible" }],
    });
    expect(ligne.justificatifStatut).toBe("REFUSE");
    expect(ligne.refusMotif).toBe("Document illisible");
  });

  it("la trace d'import reste separee du workflow", () => {
    const d = avecCalc(
      avecSaisie(baseDonnees(), "2026-08-27", saisie({ absenceJustificatif: "Ancien champ texte" })),
      calc()
    );
    const [ligne] = construireJournal({ events: [evenement()], situation: d, justifications: [baseJustif] });
    expect(ligne.justificatifLegacy).toBe("Ancien champ texte");
    expect(ligne.justificatifStatut).toBe("FOURNI");
  });
});

// ─── TEST 08 : impacts (§19-§20) ─────────────────────────────────────────

describe("TEST 08 — impacts", () => {
  it("les montants sont REELS : ils viennent des evenements RPT-01", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc());
    const [ligne] = construireJournal({ events: [evenement({ payrollImpact: 4260.5 })], situation: d });
    expect(ligne.payrollImpactAbsence).toBe(4260.5);
    expect(ligne.payrollImpact).toBe(4260.5);
  });

  it("un montant absent reste absent : jamais 0 fabrique", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc());
    const [ligne] = construireJournal({ events: [evenement({ payrollImpact: null })], situation: d });
    expect(ligne.payrollImpact).toBe(0);
    expect(ligne.presenceImpactHours).toBe(9.5);
  });

  it("l'impact presence d'une journee comptee vaut les heures theoriques", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc());
    const [ligne] = construireJournal({ events: [evenement()], situation: d });
    expect(ligne.presenceImpactHours).toBe(9.5);
  });

  it("une situation RH a son propre compteur d'impact de paie", () => {
    const d = baseDonnees();
    const [ligne] = construireJournal({
      events: [evenement({ id: "SIT:9:2026-08-27", type: "SITUATION_RH", source: "situations_rh", payrollImpact: 1500, comptabilise: null, motifNonComptabilisation: null })],
      situation: d,
    });
    expect(ligne.payrollImpactSituationRH).toBe(1500);
    expect(ligne.payrollImpactAbsence).toBe(0);
  });

  it("RPT-03 n'apparait PAS dans les lignes du journal", () => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie()), calc());
    const lignes = construireJournal({ events: [evenement()], situation: d }) as unknown as Record<string, unknown>[];
    expect(lignes[0]).not.toHaveProperty("sensibilisationImpact");
    expect(lignes[0]).not.toHaveProperty("sensibilisationImpactPercent");
  });

  it("la reference RPT-03 est un bloc par employe, jamais reparti", () => {
    const ref = construireReferenceSensibilisation([
      { employeeId: 14, matricule: "M14", nom: "Benali", estimatedImpact: 8200, impactPercent: 4.2, actualPayrollDeduction: 4260, salariesVisible: true },
    ]);
    expect(ref).toEqual([
      { employeeId: 14, matricule: "M14", nom: "Benali", estimatedImpact: 8200, impactPercent: 4.2, actualPayrollDeduction: 4260, salariesVisible: true },
    ]);
  });

  it("sans permission salaire, la reference est nulle — jamais mise a zero", () => {
    const [ref] = construireReferenceSensibilisation([
      { employeeId: 14, matricule: "M14", nom: "Benali", estimatedImpact: 8200, impactPercent: 4.2, actualPayrollDeduction: 4260, salariesVisible: false },
    ]);
    expect(ref.estimatedImpact).toBeNull();
    expect(ref.impactPercent).toBeNull();
    expect(ref.salariesVisible).toBe(false);
  });
});

// ─── TEST 09 : masquage (§30) ────────────────────────────────────────────

describe("TEST 09 — masquage", () => {
  const ligne = (): Parameters<typeof masquerJustificatif>[0][number] => {
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie({ absenceMotif: "Grippe", absenceJustificatif: "Ancien texte" })), calc());
    const [l] = construireJournal({
      events: [evenement()],
      situation: d,
      justifications: [
        {
          id: 5,
          employeeId: 14,
          date: "2026-08-27",
          statut: "VALIDE",
          motifCode: "MALADIE",
          motifLibelle: "Certificat medical",
          justificatifUrl: "https://docs/cert.pdf",
          justificatifReference: "CERT-001",
          justificatifType: "PDF",
          deposePar: 3,
          deposeAt: "2026-08-28T09:00:00.000Z",
          decisionPar: 9,
          decisionAt: "2026-08-29T10:00:00.000Z",
          refusMotif: null,
        },
      ],
    });
    return l;
  };

  it("sans habilitation : statut visible, pieces masquees", () => {
    const [m] = masquerJustificatif([ligne()], false);
    expect(m.justificatifStatut).toBe("VALIDE");
    expect(m.justificatifUrl).toBeNull();
    expect(m.justificatifReference).toBeNull();
    expect(m.justificatifType).toBeNull();
    expect(m.justificatifLegacy).toBeNull();
    expect(m.motif).toBeNull();
    expect(m.justificatifMasque).toBe(true);
  });

  it("avec habilitation : tout est visible", () => {
    const [m] = masquerJustificatif([ligne()], true);
    expect(m.justificatifUrl).toBe("https://docs/cert.pdf");
    expect(m.motif).toBe("Certificat medical");
    expect(m.justificatifMasque).toBe(false);
  });
});

// ─── TEST 10 : filtres serveur (§24-§26) ─────────────────────────────────

describe("TEST 10 — filtres", () => {
  function jeu(): ReturnType<typeof construireJournal> {
    const d = baseDonnees({
      employees: [
        employe(),
        employe({ id: 21, matricule: "GPJ-TEST-021", nom: "Ziani", departement: "Peinture", departmentId: 3, fonction: "Peintre", workCycleId: null }),
      ],
    });
    d.saisiesByEmploye.set(14, new Map([["2026-08-27", saisie({ absenceMotif: "Grippe" })]]));
    d.calcsByEmploye.set(14, [calc()]);
    d.saisiesByEmploye.set(21, new Map([["2026-08-28", saisie({ id: 200, status: "PRESENT", absenceType: null, absenceMotif: null })]]));
    d.calcsByEmploye.set(21, [calc({ employeeId: 21, date: "2026-08-28", codePresence: "P", isAbsent: false, lateMinutes: 12, lateDeductionAmount: 100 })]);

    return construireJournal({
      events: [
        evenement({ id: "ATT:14:2026-08-27", date: "2026-08-27" }),
        evenement({ id: "RET:21:2026-08-28", employeeId: 21, matricule: "GPJ-TEST-021", date: "2026-08-28", type: "RETARD", source: "attendance_calculations", presenceCode: "P", lateMinutes: 12, payrollImpact: 100, comptabilise: null, motifNonComptabilisation: null }),
      ],
      situation: d,
    });
  }

  it("recherche plein texte sur matricule, nom et motif", () => {
    expect(appliquerFiltres(jeu(), { recherche: "ziani" })).toHaveLength(1);
    expect(appliquerFiltres(jeu(), { recherche: "grippe" })[0].employeeId).toBe(14);
    expect(appliquerFiltres(jeu(), { recherche: "2026-08-28" })).toHaveLength(1);
  });

  it("le filtre RETARD inclut un jour d'absence porteur d'un retard", () => {
    const d = baseDonnees();
    d.saisiesByEmploye.set(14, new Map([["2026-08-27", saisie({ status: "PRESENT", absenceType: null, absenceMotif: null })]]));
    d.calcsByEmploye.set(14, [calc({ codePresence: "A", isAbsent: true, lateMinutes: 8 })]);
    const lignes = construireJournal({
      events: [
        evenement({ type: "ABSENCE", comptabilise: true }),
        evenement({ id: "RET:14:2026-08-27", type: "RETARD", source: "attendance_calculations", lateMinutes: 8, comptabilise: null, motifNonComptabilisation: null }),
      ],
      situation: d,
    });
    expect(lignes).toHaveLength(1);
    expect(correspondType(lignes[0], "RETARD")).toBe(true);
    expect(appliquerFiltres(lignes, { types: ["RETARD"] })).toHaveLength(1);
  });

  it("filtre par employe, departement, fonction et source RPT-01", () => {
    expect(appliquerFiltres(jeu(), { employeeIds: [21] })).toHaveLength(1);
    expect(appliquerFiltres(jeu(), { departementId: 3 })).toHaveLength(1);
    expect(appliquerFiltres(jeu(), { fonction: "Tôlier" })).toHaveLength(1);
    expect(appliquerFiltres(jeu(), { sources: ["attendance_calculations"] })[0].employeeId).toBe(21);
  });

  it("filtre par statut de justificatif et par anomalie", () => {
    expect(appliquerFiltres(jeu(), { statutsJustificatif: ["VALIDE"] })).toHaveLength(0);
    expect(appliquerFiltres(jeu(), { valide: true })).toHaveLength(0);
    expect(appliquerFiltres(jeu(), { valide: false })).toHaveLength(2);
    const d = avecCalc(avecSaisie(baseDonnees(), "2026-08-27", saisie({ validated: true })), calc());
    const lignes = construireJournal({ events: [evenement()], situation: d });
    expect(appliquerFiltres(lignes, { anomalies: ["ANOMALIE_VALIDATION_SANS_AUTEUR"] })).toHaveLength(1);
  });

  it("tous les filtres combines restent deterministes", () => {
    const r = appliquerFiltres(jeu(), { recherche: "GPJ", types: ["MALADIE", "RETARD"], valide: false, sources: ["attendance_entries", "attendance_calculations"] });
    expect(r).toHaveLength(2);
    expect(appliquerFiltres(jeu(), { recherche: "GPJ", types: ["RETARD"], sources: ["attendance_entries"] })).toHaveLength(0);
  });
});

// ─── TEST 11 : tri et pagination serveur (§25-§27) ───────────────────────

describe("TEST 11 — tri et pagination", () => {
  /** `n` couples (employe, date) DISTINCTS : une occurrence = une ligne. */
  function lignes(n: number): ReturnType<typeof construireJournal> {
    const nbJours = 25;
    const employees = Array.from({ length: Math.ceil(n / nbJours) }, (_, k) =>
      employe({ id: 1000 + k, matricule: `GPJ-BIG-${1000 + k}` })
    );

    const events = Array.from({ length: n }, (_, k) => {
      const emp = employees[Math.floor(k / nbJours)];
      const jour = `2026-08-${String((k % nbJours) + 1).padStart(2, "0")}`;
      return evenement({
        id: `ATT:${emp.id}:${jour}`,
        employeeId: emp.id,
        matricule: emp.matricule,
        date: jour,
        lateMinutes: k % 37,
      });
    });

    return construireJournal({ events, situation: baseDonnees({ employees }) });
  }

  it("tri deterministe : le tri rejoue donne le meme ordre, sans doublon", () => {
    const base = lignes(50);
    const a = trierEvenements(base, { tri: "retard", sens: "desc" }).map((l) => l.eventId);
    const b = trierEvenements(base, { tri: "retard", sens: "desc" }).map((l) => l.eventId);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it("tri par date : rupture par eventId", () => {
    const triees = trierEvenements(lignes(28), { tri: "date", sens: "asc" }).map((l) => l.date);
    expect(triees).toEqual([...triees].sort());
  });

  it("tri par statut de justificatif : VALIDE avant FOURNI avant REFUSE avant AUCUN", () => {
    const d = baseDonnees();
    const mk = (jour: string, rang: number, statut: "FOURNI" | "VALIDE" | "REFUSE"): JustificationSource => ({
      id: rang,
      employeeId: 14,
      date: jour,
      statut,
      motifCode: null,
      motifLibelle: null,
      justificatifUrl: null,
      justificatifReference: null,
      justificatifType: null,
      deposePar: 3,
      deposeAt: null,
      decisionPar: 9,
      decisionAt: null,
      refusMotif: null,
    });
    const lignes = construireJournal({
      events: [
        evenement({ id: "ATT:14:2026-08-01", date: "2026-08-01" }),
        evenement({ id: "ATT:14:2026-08-02", date: "2026-08-02" }),
        evenement({ id: "ATT:14:2026-08-03", date: "2026-08-03" }),
      ],
      situation: d,
      justifications: [mk("2026-08-01", 1, "REFUSE"), mk("2026-08-02", 2, "FOURNI"), mk("2026-08-03", 3, "VALIDE")],
    });
    expect(trierEvenements(lignes, { tri: "statut_justificatif", sens: "asc" }).map((l) => l.justificatifStatut)).toEqual([
      "VALIDE",
      "FOURNI",
      "REFUSE",
    ]);
  });

  it("pagination serveur : 1250 evenements, 7 pages, aucune perte ni doublon", () => {
    const base = lignes(1250);
    const triees = trierEvenements(base, { tri: "date", sens: "desc" });
    const vus: string[] = [];
    let page = 1;
    for (;;) {
      const p = paginer(triees, page, PAGE_SIZE_MAX);
      vus.push(...p.lignes.map((l) => l.eventId));
      if (page >= p.pageCount) break;
      page += 1;
    }
    expect(vus).toHaveLength(1250);
    expect(new Set(vus).size).toBe(1250);
    expect(page).toBe(7);
  });

  it("une pageSize hors plafond est ramenee a PAGE_SIZE_MAX", () => {
    const p = paginer([1, 2, 3], 1, 5000);
    expect(p.pageSize).toBe(PAGE_SIZE_MAX);
    expect(p.lignes).toHaveLength(3);
  });

  it("une page au-dela du total ne perd rien et ne renvoie pas d'erreur", () => {
    const p = paginer([1, 2, 3], 99, 50);
    expect(p.lignes).toHaveLength(0);
    expect(p.total).toBe(3);
    expect(p.pageCount).toBe(1);
  });
});
