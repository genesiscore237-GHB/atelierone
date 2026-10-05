import { describe, it, expect, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/lib/rbac-service", () => ({
  RBACService: { isSuperAdmin: vi.fn(), hasPermission: vi.fn() },
}));

import {
  analyserRetard,
  calculateAttendance,
  latenessPolicy,
  SEUIL_BUSINESS_DEFAUT,
  TOLERANCE_TECHNIQUE_DEFAUT,
  type CalcInput,
  type PresenceSettings,
} from "~/server/lib/presence-engine";
import { estIsoDateValide, joursOuvres, semainesDansPeriode } from "~/server/lib/payroll-engine";
import { analyserPeriode, type JourAnalyseInput } from "~/server/lib/rh-stats-engine";
import {
  construireEvenementsRapport,
  construireJoursEmploye,
  construireLigneRapport,
  construireReconciliationAbsences,
  decisionComptabilisationAbsence,
  heuresTheoriquesDuJour,
  jourOuvrePour,
  validerPeriode,
  type AbsenceTableRow,
  type DonneesSituation,
  type EmployeBrut,
  type ReportEvent,
  type SaisieBrute,
} from "~/server/lib/rh-centre-rapports";
import type { LigneSituation } from "~/server/lib/rh-situation-engine";

/**
 * RPT-02 -- VERITE TEMPORELLE DU CENTRE DE RAPPORTS
 *
 * Une date doit produire partout la meme interpretation :
 * jour travaille ? ferie ? week-end ? conge ? absence ? presence ? retard ?
 *
 * Calendrier de reference septembre 2026 (verifie) :
 *   01 = mardi ... 05 = samedi, 06 = dimanche, 21 = lundi, 30 = mercredi
 *   22 jours de semaine, 4 samedis (05,12,19,26), 4 dimanches (06,13,20,27)
 */

const FROM = "2026-09-01";
const TO = "2026-09-30";

const LUN_21 = "2026-09-21";
const MAR_22 = "2026-09-22";
const MER_23 = "2026-09-23";
const JEU_24 = "2026-09-24";
const VEN_25 = "2026-09-25";
const SAM_05 = "2026-09-05";
const SAM_26 = "2026-09-26";
const DIM_06 = "2026-09-06";
const DIM_20 = "2026-09-20";
const DIM_27 = "2026-09-27";
const MER_30 = "2026-09-30";

const CYCLE_ID = 1;

const RECO_VIDE = {
  evenementsAbsence: 0,
  evenementsComptabilises: 0,
  joursComptabilises: 0,
  ecart: 0,
  parMotifNonComptabilisation: {} as Record<string, number>,
  doublonsSupprimes: 0,
};

function employe(over: Partial<EmployeBrut> = {}): EmployeBrut {
  return {
    id: 1,
    matricule: "GPJ-T002-001",
    prenom: "Test",
    nom: "Employe",
    departement: "Carrosserie",
    statut: "actif",
    salaireBase: 80000,
    modePaie: "SALAIRE_HORAIRE",
    forfaitHebdomadaire: 0,
    dateEmbauche: "2026-01-01",
    dateSortie: null,
    workCycleId: CYCLE_ID,
    dateFinContrat: null,
    fonction: "Tolier",
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

function baseDonnees(over: Partial<DonneesSituation> = {}): DonneesSituation {
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
      lateToleranceMinutes: 0,
      roundToMinutes: 0,
      autoDeductLate: true,
      countEarlyArrival: false,
      countLateDeparture: false,
    },
    nomsUtilisateurs: new Map([[7, "Admin RH"]]),
    ...over,
  };
}

/** Planning horaire reel : 9,5 h lun-ven, 4,5 h samedi, rien le dimanche. */
function baseDonneesPlanning(d: DonneesSituation): DonneesSituation {
  // Le lecteur ne charge que les horaires : l'ouverture du jour vient de
  // `jourOuvrePour` (calendrier + planning de cycle), pas de cette table.
  for (let day = 1; day <= 5; day++) {
    d.schedByCycleDay.set(`${CYCLE_ID}:${day}`, {
      startTime: "07:30",
      endTime: "18:00",
      breakStart: "13:00",
      breakEnd: "14:00",
      expectedHours: "9.50",
    });
  }
  d.schedByCycleDay.set(`${CYCLE_ID}:6`, {
    startTime: "07:30",
    endTime: "12:00",
    breakStart: null,
    breakEnd: null,
    expectedHours: "4.50",
  });
  return d;
}

const planning = (from = FROM, to = TO, over: Partial<DonneesSituation> = {}) =>
  baseDonneesPlanning(baseDonnees({ from, to, ...over }));

function ligneBase(over: Partial<LigneSituation> = {}): LigneSituation {
  return {
    employeeId: 1,
    matricule: "GPJ-T002-001",
    prenom: "Test",
    nom: "Employe",
    departement: "Carrosserie",
    statut: "actif",
    mode: "SALAIRE_HORAIRE",
    joursTheoriques: 22,
    joursPresence: 20,
    joursAbsence: 0,
    joursConges: 0,
    joursMuets: 0,
    heuresTheoriques: 227,
    heuresTravaillees: 190,
    heuresNormales: 190,
    heuresSupp: 0,
    retardTotalMinutes: 0,
    departAnticipeTotalMinutes: 0,
    tauxPresence: 90.9,
    anomalies: [],
    ...over,
  } as LigneSituation;
}

const absences = (d: DonneesSituation) =>
  construireEvenementsRapport(employe(), ligneBase(), d, true).filter((e) => e.type === "ABSENCE");

/** Ligne de la table `absences` telle que la charge le lecteur de situation. */
function absenceTable(over: Partial<AbsenceTableRow> = {}): AbsenceTableRow {
  return {
    id: 1,
    employeId: 1,
    typeAbsence: "INJUSTIFIEE",
    dateDebut: LUN_21,
    dateFin: null,
    dureeJours: null,
    motif: null,
    justifie: false,
    statut: "APPROUVEE",
    validePar: 7,
    createdAt: null,
    ...over,
  } as AbsenceTableRow;
}

// --------------------------------------------------------------------------
describe("RPT-02 section 4 -- bornes de periode", () => {
  it("accepte 01/09 -> 30/09 et n'inclut jamais le 01/10", () => {
    expect(() => validerPeriode(FROM, TO)).not.toThrow();
    const jours = construireJoursEmploye(employe(), planning());
    expect(jours[0].date).toBe(FROM);
    expect(jours[jours.length - 1].date).toBe(TO);
    expect(jours.some((j) => j.date >= "2026-10-01")).toBe(false);
    expect(jours).toHaveLength(30);
  });

  it.each([
    ["2026-09-01", "2026-09-01"],
    ["2026-09-01", "2026-09-15"],
    ["2026-09-15", "2026-09-30"],
    ["2026-09-30", "2026-09-30"],
  ])("borne exacte %s -> %s : aucune journee hors plage", (from, to) => {
    expect(() => validerPeriode(from, to)).not.toThrow();
    const jours = construireJoursEmploye(employe(), planning(from, to));
    expect(jours[0].date).toBe(from);
    expect(jours[jours.length - 1].date).toBe(to);
    expect(jours.filter((j) => j.date < from)).toHaveLength(0);
    expect(jours.filter((j) => j.date > to)).toHaveLength(0);
  });

  it("refuse une periode inversee 30 -> 01 (contrat existant : refus, pas de normalisation silencieuse)", () => {
    expect(() => validerPeriode(TO, FROM)).toThrow(/date de fin doit suivre/i);
  });

  it("refuse une periode de plus de 13 mois", () => {
    expect(() => validerPeriode("2025-01-01", "2026-09-30")).toThrow(/13 mois/i);
  });

  it("ne confond pas la comparaison de chaines : 2026-09-30 inclus, 2026-10-01 exclu", () => {
    const jours = construireJoursEmploye(employe(), planning());
    expect(jours.some((j) => j.date === "2026-09-30")).toBe(true);
    expect(jours.some((j) => j.date === "2026-10-01")).toBe(false);
  });

  it("borne un mois complet sur un mois civil adjacent sans debordement", () => {
    const jours = construireJoursEmploye(employe(), planning("2026-09-01", "2026-10-01"));
    expect(jours).toHaveLength(31);
    expect(jours.filter((j) => j.date.startsWith("2026-10")).map((j) => j.date)).toEqual(["2026-10-01"]);
  });
});

// --------------------------------------------------------------------------
describe("RPT-02 section 5/6 -- jours ouvres et heures theoriques", () => {
  it("lundi, mardi, mercredi, jeudi, vendredi : jour ouvre", () => {
    const d = planning();
    const emp = employe();
    for (const iso of [LUN_21, MAR_22, MER_23, JEU_24, VEN_25]) {
      expect(jourOuvrePour(emp, iso, d), iso).toBe(true);
    }
  });

  it("samedi : jour ouvre issu du planning, avec SA duree propre", () => {
    const d = planning();
    const emp = employe();
    expect(jourOuvrePour(emp, SAM_05, d)).toBe(true);
    const jours = construireJoursEmploye(emp, d);
    expect(jours.find((j) => j.date === SAM_05)!.heuresTheoriques).toBe(4.5);
    expect(jours.find((j) => j.date === LUN_21)!.heuresTheoriques).toBe(9.5);
  });

  it("dimanche : jamais un jour ouvre, et zero heure theorique", () => {
    const d = planning();
    const emp = employe();
    expect(jourOuvrePour(emp, DIM_06, d)).toBe(false);
    expect(jourOuvrePour(emp, DIM_20, d)).toBe(false);
    const jours = construireJoursEmploye(emp, d);
    for (const iso of [DIM_06, DIM_20]) {
      const j = jours.find((x) => x.date === iso)!;
      expect(j.isWorkingDay).toBe(false);
      expect(j.heuresTheoriques).toBe(0);
    }
  });

  it("changement de planning : le jour devient non ouvert des que le cycle le declare non travaille", () => {
    const d = planning();
    expect(jourOuvrePour(employe(), SAM_05, d)).toBe(true);
    d.nonWorkingByCycle.set(CYCLE_ID, new Set([6]));
    expect(jourOuvrePour(employe(), SAM_05, d)).toBe(false);
  });

  it("heuresTheoriquesDuJour lit le planning, deduit de l'horaire sinon, et retombe sur le seuil", () => {
    expect(heuresTheoriquesDuJour({ expectedHours: "7.25", startTime: null, endTime: null, breakStart: null, breakEnd: null }, 9.5)).toBe(7.25);
    expect(heuresTheoriquesDuJour({ expectedHours: null, startTime: "07:30", endTime: "18:00", breakStart: "13:00", breakEnd: "14:00" }, 9.5)).toBe(9.5);
    expect(heuresTheoriquesDuJour({ expectedHours: null, startTime: "07:30", endTime: "12:00", breakStart: null, breakEnd: null }, 9.5)).toBe(4.5);
    expect(heuresTheoriquesDuJour(null, 9.5)).toBe(9.5);
    expect(heuresTheoriquesDuJour({ expectedHours: "0", startTime: null, endTime: null, breakStart: null, breakEnd: null }, 9.5)).toBe(9.5);
  });

  it("changement de planning change les heures theoriques sans toucher aux jours ouvres", () => {
    const avant = construireJoursEmploye(employe(), planning());
    const dApres = planning();
    dApres.schedByCycleDay.set(`${CYCLE_ID}:1`, {
      startTime: "08:00",
      endTime: "17:00",
      breakStart: "12:00",
      breakEnd: "13:00",
      expectedHours: "8.00",
    });
    const apres = construireJoursEmploye(employe(), dApres);
    expect(apres.filter((j) => j.isWorkingDay)).toHaveLength(
      avant.filter((j) => j.isWorkingDay).length
    );
    expect(apres.find((j) => j.date === LUN_21)!.heuresTheoriques).toBe(8);
    expect(avant.find((j) => j.date === LUN_21)!.heuresTheoriques).toBe(9.5);
  });

  it("periode multi-mois 15/09 -> 15/10 : bornes et jours ouvres coherents", () => {
    const d = planning("2026-09-15", "2026-10-15");
    const jours = construireJoursEmploye(employe(), d);
    expect(jours[0].date).toBe("2026-09-15");
    expect(jours[jours.length - 1].date).toBe("2026-10-15");
    expect(jours).toHaveLength(31);
    const ouvres = jours.filter((j) => j.isWorkingDay);
    expect(ouvres.filter((j) => j.date.startsWith("2026-09"))).toHaveLength(14); // 12 jours de semaine + 2 samedis
    expect(ouvres.filter((j) => j.date.startsWith("2026-10"))).toHaveLength(13); // 11 jours de semaine + 2 samedis
    expect(jours.filter((j) => !j.isWorkingDay).every((j) => new Date(`${j.date}T12:00:00`).getDay() === 0)).toBe(true);
  });
});

// --------------------------------------------------------------------------
describe("RPT-02 section 3 -- jours feries", () => {
  it("lundi ferie : jour ferme, zero heure theorique", () => {
    const d = planning(FROM, TO, { holidays: [LUN_21] });
    const emp = employe();
    expect(jourOuvrePour(emp, LUN_21, d)).toBe(false);
    const jour = construireJoursEmploye(emp, d).find((j) => j.date === LUN_21)!;
    expect(jour.isWorkingDay).toBe(false);
    expect(jour.heuresTheoriques).toBe(0);
  });

  it("mardi ferie : jour ferme", () => {
    expect(jourOuvrePour(employe(), MAR_22, planning(FROM, TO, { holidays: [MAR_22] }))).toBe(false);
  });

  it("samedi ferie : ferme meme si le planning ouvre le samedi", () => {
    const d = planning(FROM, TO, { holidays: [SAM_26] });
    expect(jourOuvrePour(employe(), SAM_26, d)).toBe(false);
    expect(heuresTheoriquesDuJour(d.schedByCycleDay.get(`${CYCLE_ID}:6`), 9.5)).toBe(4.5);
  });

  it("dimanche ferie : ferme, jamais ouvert", () => {
    expect(jourOuvrePour(employe(), DIM_20, planning(FROM, TO, { holidays: [DIM_20] }))).toBe(false);
  });

  it("periode sans ferie : le compte de jours ouvres est le compte calendaire", () => {
    expect(joursOuvres("2026-09-01", "2026-09-30", [])).toBe(26); // 30 - 4 dimanches
  });

  it("periode avec plusieurs feries : chaque ferie retire exactement un jour ouvre", () => {
    const base = joursOuvres("2026-09-01", "2026-09-30", []);
    expect(joursOuvres("2026-09-01", "2026-09-30", ["2026-09-15"])).toBe(base - 1);
    expect(joursOuvres("2026-09-01", "2026-09-30", ["2026-09-15", "2026-09-22", "2026-09-29"])).toBe(base - 3);
  });

  it("un ferie dimanche ne retire rien : il ne compte pas deux fois", () => {
    const base = joursOuvres("2026-09-01", "2026-09-30", []);
    expect(joursOuvres("2026-09-01", "2026-09-30", ["2026-09-20"])).toBe(base);
  });

  it("une date ferie invalide ne peut pas devenir un jour travaille", () => {
    // Regression de la cause racine RPT-02 : "2026-15-08" ne peut plus exister en base,
    // et une date impossible ne doit pas non plus etre reinterpretée par le moteur.
    expect(estIsoDateValide("2026-08-15")).toBe(true);
    expect(estIsoDateValide("2026-02-31")).toBe(false);
    expect(estIsoDateValide("2026-13-01")).toBe(false);
    expect(estIsoDateValide("2026-00-10")).toBe(false);
    expect(estIsoDateValide("15/08/2026")).toBe(false);
    expect(estIsoDateValide("2026-8-5")).toBe(false);
    // 15/08/2026 = samedi : la paie compte le samedi (lun-sam), seule l'absence
    // de lowness cycle peut le fermer. Cette divergence est DOCUMENTEE.
    expect(joursOuvres("2026-08-15", "2026-08-15", [])).toBe(1);
    expect(joursOuvres("2026-05-20", "2026-05-20", [])).toBe(1); // mercredi ferie reel
    expect(joursOuvres("2026-05-20", "2026-05-20", ["2026-05-20"])).toBe(0);
  });

  it("periode inversee ou date inexistante : zero, sans boucle infinie", () => {
    expect(joursOuvres("2026-09-30", "2026-09-01", [])).toBe(0);
    expect(joursOuvres("2026-02-31", "2026-03-05", [])).toBe(0);
    expect(joursOuvres("2026-09-01", "2026-13-01", [])).toBe(0);
    expect(semainesDansPeriode("2026-02-31", "2026-03-05")).toBe(0);
  });

  it("semainesDansPeriode reste coherent sur une periode multi-mois", () => {
    expect(semainesDansPeriode("2026-09-15", "2026-10-15")).toBeCloseTo(31 / 7, 2);
    expect(semainesDansPeriode("2026-09-01", "2026-08-01")).toBe(0);
  });
});

// --------------------------------------------------------------------------
const schedule = {
  startTime: "07:30",
  endTime: "18:00",
  breakStart: "13:00",
  breakEnd: "14:00",
  expectedHours: "9.50",
  overtimeThreshold: null,
  isWorkingDay: true,
};

function settingsBase(over: Partial<PresenceSettings> = {}): PresenceSettings {
  return {
    lateToleranceMinutes: 0,
    roundToMinutes: 0,
    autoDeductBreak: true,
    countEarlyArrival: false,
    countLateDeparture: false,
    autoDeductLate: true,
    autoDeductEarlyDeparture: true,
    maxNormalHoursPerDay: "9.5",
    ...over,
  };
}

function calc(over: Partial<CalcInput> = {}) {
  return calculateAttendance({
    timeIn: "07:30",
    timeOut: "18:00",
    schedule,
    settings: settingsBase(),
    overtimeAuth: null,
    ...over,
  });
}

describe("RPT-02 section 7 -- tolerance technique vs seuil metier", () => {
  it("les deux reglages sont distincts et lisibles separement", () => {
    const p = latenessPolicy(settingsBase({ lateToleranceMinutes: 15, businessLateThresholdMinutes: 10 }));
    expect(p.technicalToleranceMinutes).toBe(15);
    expect(p.businessThresholdMinutes).toBe(10);
  });

  it("defauts : tolerance 0 et seuil metier 0, aucune regle inventee", () => {
    expect(TOLERANCE_TECHNIQUE_DEFAUT).toBe(0);
    expect(SEUIL_BUSINESS_DEFAUT).toBe(0);
    expect(latenessPolicy(settingsBase({ lateToleranceMinutes: null, businessLateThresholdMinutes: null }))).toEqual({
      technicalToleranceMinutes: 0,
      businessThresholdMinutes: 0,
    });
  });

  it.each([
    [0, 0, 0, 0],
    [1, 0, 1, 1],
    [14, 0, 14, 14],
    [15, 0, 15, 15],
    [16, 0, 16, 16],
    [30, 0, 30, 30],
    [1, 15, 0, 0],
    [14, 15, 0, 0],
    [15, 15, 0, 0],
    [16, 15, 1, 1],
    [30, 15, 15, 15],
    [10, 15, 0, 0],
  ])("retard de %i min avec tolerance %i => constate %i, classe %i", (minutes, tolerance, attenduConstate, attenduClasse) => {
    const arrivee = `07:${String(30 + minutes).padStart(2, "0")}`;
    const r = analyserRetard("07:30", arrivee, latenessPolicy(settingsBase({ lateToleranceMinutes: tolerance })));
    expect(r.retardConstateMin).toBe(attenduConstate);
    expect(r.retardClasseMin).toBe(attenduClasse);
    expect(r.classe).toBe(attenduClasse > 0);
  });

  it("un seuil metier superieur a zero retire des minutes du classe sans toucher au constate", () => {
    const r = analyserRetard("07:30", "08:00", { technicalToleranceMinutes: 0, businessThresholdMinutes: 10 });
    expect(r.retardConstateMin).toBe(30);
    expect(r.retardClasseMin).toBe(20);
    expect(r.seuilBusinessMin).toBe(10);
    expect(r.toleranceTechniqueMin).toBe(0);
  });

  it("arrivee en avance : aucun retard quelle que soit la tolerance", () => {
    const r = analyserRetard("07:30", "07:00", { technicalToleranceMinutes: 15, businessThresholdMinutes: 5 });
    expect(r.retardConstateMin).toBe(0);
    expect(r.classe).toBe(false);
  });

  it("heure d'arrivee ou de debut absente : aucun retard invente", () => {
    expect(analyserRetard("07:30", null, latenessPolicy(settingsBase())).retardConstateMin).toBe(0);
    expect(analyserRetard(null, "08:00", latenessPolicy(settingsBase())).retardConstateMin).toBe(0);
  });

  it("le moteur conserve le comportement historique : tolerance seule, seuil metier a 0", () => {
    const r = calc({ timeIn: "08:00", settings: settingsBase({ lateToleranceMinutes: 15 }) });
    expect(r.lateMinutes).toBe(15);
    expect(r.lateBusinessMinutes).toBe(15);
    expect(r.isLate).toBe(true);
    expect(r.codePresence).toBe("R");
  });

  it("avec un seuil metier a 10, 10 min constatees ne sont pas classees retard", () => {
    const sous = calc({ timeIn: "07:40", settings: settingsBase({ businessLateThresholdMinutes: 10 }) });
    expect(sous.lateMinutes).toBe(10);
    expect(sous.lateBusinessMinutes).toBe(0);
    expect(sous.isLate).toBe(false);
    expect(sous.codePresence).toBe("P");
    const sur = calc({ timeIn: "08:00", settings: settingsBase({ businessLateThresholdMinutes: 10 }) });
    expect(sur.lateMinutes).toBe(30);
    expect(sur.lateBusinessMinutes).toBe(20);
    expect(sur.isLate).toBe(true);
  });

  it("details explique heure theorique, arrivee, tolerance et seuil", () => {
    const r = calc({ timeIn: "08:07", settings: settingsBase({ lateToleranceMinutes: 15, businessLateThresholdMinutes: 5 }) });
    const ex = (r.details as Record<string, Record<string, number>>).retardExplication;
    expect(ex.heureTheoriqueMin).toBe(450);
    expect(ex.heureArriveeMin).toBe(487);
    expect(ex.toleranceTechniqueMin).toBe(15);
    expect(ex.seuilBusinessMin).toBe(5);
    expect(ex.retardConstateMin).toBe(22);
    expect(ex.retardClasseMin).toBe(17);
  });
});

// --------------------------------------------------------------------------
describe("RPT-02 section 11 -- conge et situations R6", () => {
  it("un conge planifie n'est PAS une absence injustifiee", () => {
    const r = calc({ timeIn: null, timeOut: null, absenceType: "CONGE" });
    expect(r.codePresence).toBe("C");
    expect(r.isAbsent).toBe(false);
    expect(r.workedMinutes).toBe(0);
    expect(r.lateMinutes).toBe(0);
  });

  it("maladie, mission et formation gardent leur code et ne sont pas des absences", () => {
    for (const [type, code] of [
      ["MALADIE", "M"],
      ["MISSION", "O"],
      ["FORMATION", "F"],
    ] as const) {
      const r = calc({ timeIn: null, timeOut: null, absenceType: type });
      expect(r.codePresence).toBe(code);
      expect(r.isAbsent).toBe(false);
    }
  });

  it("absence injustifiee sur jour ouvre : code A", () => {
    const r = calc({ timeIn: null, timeOut: null, absenceType: "INJUSTIFIEE" });
    expect(r.codePresence).toBe("A");
    expect(r.isAbsent).toBe(true);
  });

  it("conge + pointage complet : le pointage fait foi, le conge n'ecrase pas les heures", () => {
    const r = calc({ timeIn: "07:30", timeOut: "15:00", absenceType: "CONGE" });
    expect(r.workedMinutes).toBe(6.5 * 60); // 07:30 -> 15:00 moins la pause 13h-14h
    expect(r.codePresence).toBe("P");
    expect(r.isAbsent).toBe(false);
    // le type d'absence reste trace, il n'est pas perdu
    expect(r.details.absenceType).toBe("CONGE");
  });

  it("conge + pointage INCOMPLET : le conge reste le code du jour", () => {
    const r = calc({ timeIn: "07:30", timeOut: null, absenceType: "CONGE" });
    expect(r.codePresence).toBe("C");
    expect(r.workedMinutes).toBe(0);
    expect(r.isAbsent).toBe(false);
  });

  it("conge sans pointage un jour non ouvert : aucune absence, aucune heure", () => {
    const r = calc({ timeIn: null, timeOut: null, absenceType: "CONGE", schedule: { ...schedule, isWorkingDay: false } });
    expect(r.codePresence).toBe("C");
    expect(r.isAbsent).toBe(false);
    expect(r.workedMinutes).toBe(0);
  });

  it("situation hors periode d'emploi : A, avec motif trace", () => {
    const r = calc({ timeIn: null, timeOut: null, details: { horsPeriodeEmploi: true } });
    expect(r.codePresence).toBe("A");
    expect(r.isAbsent).toBe(true);
    expect(String(r.details.reason)).toMatch(/hors p.riode d'emploi/i);
  });

  it("conge un dimanche ou un ferie : aucune absence, aucune heure", () => {
    const dimanche = calc({ timeIn: null, timeOut: null, schedule: { ...schedule, isWorkingDay: false } });
    expect(dimanche.isAbsent).toBe(false);
    expect(dimanche.workedMinutes).toBe(0);
    const ferie = calc({ timeIn: null, timeOut: null, isPublicHoliday: true });
    expect(ferie.isAbsent).toBe(false);
    expect(ferie.workedMinutes).toBe(0);
  });
});

// --------------------------------------------------------------------------
describe("RPT-02 section 14/15/16 -- presence reelle, depart anticipe, HS", () => {
  it("arrivee seule : aucune heure travaillee (presence != existence de ligne)", () => {
    const r = calc({ timeIn: "07:30", timeOut: null });
    expect(r.rawMinutes).toBe(0);
    expect(r.workedMinutes).toBe(0);
  });

  it("arrivee + depart : heures reelles apres pause, et la pause suit le planning", () => {
    const r = calc({ timeIn: "07:30", timeOut: "18:00" });
    expect(r.rawMinutes).toBe(10.5 * 60);
    expect(r.breakMinutes).toBe(60);
    expect(r.workedMinutes).toBe(9.5 * 60);
  });

  it("pointage incomplet : aucune minute inventee, aucun retard ni depart", () => {
    const r = calc({ timeIn: "07:30", timeOut: null });
    expect(Number.isFinite(r.workedMinutes)).toBe(true);
    expect(r.workedMinutes).toBe(0);
    expect(r.lateMinutes).toBe(0);
    expect(r.earlyDepartureMinutes).toBe(0);
  });

  it("depart anticipe reste distinct du retard et ne se fusionne jamais", () => {
    const r = calc({ timeIn: "07:30", timeOut: "16:00" });
    expect(r.lateMinutes).toBe(0);
    expect(r.earlyDepartureMinutes).toBe(120);
    expect(r.codePresence).toBe("P");
  });

  it("retard seul, depart seul, les deux, aucun : les 4 combinaisons", () => {
    const aucun = calc({ timeIn: "07:30", timeOut: "18:00" });
    expect([aucun.lateMinutes, aucun.earlyDepartureMinutes]).toEqual([0, 0]);

    const retardSeul = calc({ timeIn: "08:00", timeOut: "18:00" });
    expect([retardSeul.lateMinutes, retardSeul.earlyDepartureMinutes]).toEqual([30, 0]);

    const departSeul = calc({ timeIn: "07:30", timeOut: "16:00" });
    expect([departSeul.lateMinutes, departSeul.earlyDepartureMinutes]).toEqual([0, 120]);

    const lesDeux = calc({ timeIn: "08:00", timeOut: "16:00" });
    expect([lesDeux.lateMinutes, lesDeux.earlyDepartureMinutes]).toEqual([30, 120]);
  });

  it("depart tardif plafonne : au-dela de l'heure de fin, rien n'est compte", () => {
    // regle 2 du moteur : un depart apres l'heure de fin est plafonne, SAUF si
    // le depart tardif est explicitement valide.
    const plafonne = calc({ timeIn: "07:30", timeOut: "20:00" });
    expect(plafonne.rawMinutes).toBe(10.5 * 60);
    expect(plafonne.workedMinutes).toBe(9.5 * 60);
    expect(plafonne.overtimeMinutes).toBe(0);
  });

  it("HS : le temps au-dela du seuil n'est compte que si l'autorisation est approuvee", () => {
    const valide = { validateLateDeparture: true } as const;
    const sansAutorisation = calc({ ...valide, timeIn: "07:30", timeOut: "20:00" });
    expect(sansAutorisation.workedMinutes).toBe(11.5 * 60);
    expect(sansAutorisation.overtimeMinutes).toBe(0);
    expect(sansAutorisation.normalMinutes).toBe(9.5 * 60);

    const approuvee = calc({ ...valide, timeIn: "07:30", timeOut: "20:00", overtimeAuth: { maxHours: 3, status: "approuvee" } });
    expect(approuvee.overtimeMinutes).toBe(2 * 60);
    expect(approuvee.normalMinutes).toBe(9.5 * 60);
    expect(approuvee.codePresence).toBe("HS");

    const refusee = calc({ ...valide, timeIn: "07:30", timeOut: "20:00", overtimeAuth: { maxHours: 3, status: "refusee" } });
    expect(refusee.overtimeMinutes).toBe(0);
    expect(refusee.codePresence).toBe("P");
  });

  it("HS plafonnees par le plafond de l'autorisation", () => {
    const r = calc({
      validateLateDeparture: true,
      timeIn: "07:30",
      timeOut: "23:00",
      overtimeAuth: { maxHours: 1, status: "validee" },
    });
    expect(r.workedMinutes).toBe(14.5 * 60);
    // le HS potentiel est trace, meme quand il est ecrete par le plafond
    expect(r.details.automaticOT).toBe(5 * 60);
    expect(r.details.authCapMinutes).toBe(60);
    expect(r.overtimeMinutes).toBe(60);
    expect(r.normalMinutes).toBe(9.5 * 60);
  });
});

// --------------------------------------------------------------------------
describe("RPT-02 section 8 -- taux de presence", () => {
  it("tauxPresence (jours) reste le taux historique et ne bouge pas", () => {
    const analyse = analyserPeriode(construireJoursEmploye(employe(), planning()));
    expect(analyse.joursTheoriques).toBe(26); // 22 jours de semaine + 4 samedis
    expect(analyse.tauxPresence).toBe(0); // aucun pointage => 0 jour present
  });

  it("tauxPresenceHeures vaut heuresTravaillees / heuresTheoriques x 100", () => {
    const row = construireLigneRapport(
      employe(),
      ligneBase({ heuresTheoriques: 227, heuresTravaillees: 190 }),
      baseDonnees(),
      true
    );
    expect(row.tauxPresence).toBe(90.9);
    expect(row.tauxPresenceHeures).toBeCloseTo((190 / 227) * 100, 2);
  });

  it("heures theoriques nulles => tauxPresenceHeures null, jamais NaN ni Infinity", () => {
    const row = construireLigneRapport(
      employe(),
      ligneBase({ heuresTheoriques: 0, heuresTravaillees: 0 }),
      baseDonnees(),
      true
    );
    expect(row.heuresTheoriques).toBe(0);
    expect(row.tauxPresenceHeures).toBeNull();
    expect(Number.isFinite(row.tauxPresenceHeures ?? Number.NaN)).toBe(false);
  });

  it("periode entierement non ouvree : aucun NaN sur les champs derives", () => {
    const analyse = analyserPeriode(construireJoursEmploye(employe(), planning(DIM_06, DIM_06)));
    expect(analyse.joursTheoriques).toBe(0);
    expect(analyse.heuresTheoriques).toBe(0);
    expect(analyse.tauxPresence).toBe(0);
    for (const v of Object.values(analyse)) {
      if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("periode multi-mois : le taux presence heures reste fini", () => {
    const d = planning("2026-09-15", "2026-10-15");
    const analyse = analyserPeriode(construireJoursEmploye(employe(), d));
    expect(analyse.heuresTheoriques).toBeGreaterThan(0);
    expect(Number.isFinite((analyse.heuresTravaillees / analyse.heuresTheoriques) * 100)).toBe(true);
  });

  it("salaire zero : aucun NaN sur la ligne de rapport", () => {
    const row = construireLigneRapport(employe({ salaireBase: 0, modePaie: null }), ligneBase(), baseDonnees(), true);
    for (const v of [row.heuresTheoriques, row.heuresTravaillees, row.tauxPresence, row.tauxPresenceHeures ?? 0]) {
      expect(Number.isFinite(v as number)).toBe(true);
    }
  });
});

// --------------------------------------------------------------------------
describe("RPT-02 section 9/10 -- absence : evenement vs jour comptabilise", () => {
  function avecAbsence(iso: string, code = "A", statut = "ABSENT") {
    const d = planning();
    d.saisiesByEmploye.set(1, new Map([[iso, saisie({ status: statut })]]));
    d.calcsByEmploye.set(1, [
      {
        date: iso,
        employeeId: 1,
        codePresence: code,
        isAbsent: true,
        workedMinutes: 0,
        normalMinutes: 0,
        overtimeMinutes: 0,
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        lateDeductionAmount: 0,
        absenceFinancialImpact: 0,
        taskBonus: null,
      },
    ]);
    return d;
  }


  it("absence un jour ouvre : trace ET jour comptabilise", () => {
    const d = avecAbsence(LUN_21);
    const ev = absences(d);
    expect(ev).toHaveLength(1);
    expect(ev[0].comptabilise).toBe(true);
    expect(ev[0].motifNonComptabilisation).toBeNull();
    expect(decisionComptabilisationAbsence(employe(), LUN_21, d, "attendance_entries", "A")).toEqual({
      comptabilise: true,
      motif: null,
    });
  });

  it("absence le dimanche : evenement administratif, PAS un jour d'absence", () => {
    const d = avecAbsence(DIM_20);
    const emp = employe();
    const ev = absences(d);
    expect(ev).toHaveLength(1);
    expect(ev[0].comptabilise).toBe(false);
    expect(ev[0].motifNonComptabilisation).toBe("DIMANCHE");
    const analyse = analyserPeriode(construireJoursEmploye(emp, d));
    expect(analyse.joursAbsence).toBe(0);
    expect(analyse.joursTheoriques).toBe(26); // 30 jours - 4 dimanches
    expect(analyse.heuresTheoriques).toBe(227);
  });

  it("absence un ferie : motif explicite, jamais comptabilise", () => {
    const d = avecAbsence(MER_30);
    d.holidays = [MER_30];
    const ev = absences(d);
    expect(ev[0].comptabilise).toBe(false);
    expect(ev[0].motifNonComptabilisation).toBe("JOUR_FERIE");
  });

  it("absence un jour non planifie (samedi declare non travaille) : motif explicite", () => {
    const d = avecAbsence(SAM_05);
    d.nonWorkingByCycle.set(CYCLE_ID, new Set([6]));
    expect(absences(d)[0].motifNonComptabilisation).toBe("NON_OUVRE_PLANNING");
  });

  it("absence apres la sortie : motif HORS_PERIODE_EMPLOI", () => {
    const d = avecAbsence(MER_30);
    // cas reel RPT-02 : employe sorti le 25/09, absences tracees du 26 au 30/09
    const sorti = employe({ dateSortie: VEN_25 });
    expect(decisionComptabilisationAbsence(sorti, MER_30, d, "attendance_entries", "A")).toEqual({
      comptabilise: false,
      motif: "HORS_PERIODE_EMPLOI",
    });
    // le jour de sortie inclus reste un jour d'absence legitime
    expect(decisionComptabilisationAbsence(sorti, VEN_25, d, "attendance_entries", "A")).toEqual({
      comptabilise: true,
      motif: null,
    });
  });

  it("absence avant l'embauche : motif HORS_PERIODE_EMPLOI", () => {
    const d = avecAbsence(LUN_21);
    expect(decisionComptabilisationAbsence(employe({ dateEmbauche: MAR_22 }), LUN_21, d, "attendance_entries", "A")).toEqual({
      comptabilise: false,
      motif: "HORS_PERIODE_EMPLOI",
    });
    expect(decisionComptabilisationAbsence(employe({ dateEmbauche: LUN_21 }), LUN_21, d, "attendance_entries", "A")).toEqual({
      comptabilise: true,
      motif: null,
    });
  });

  it("trace declarative sans calcul R3 : jamais un jour comptabilise", () => {
    const d = planning();
    d.absencesByEmploye.set(1, [
      absenceTable({ motif: "non motive" }),
    ]);
    const ev = absences(d);
    // l'absence ouverte est tracee jour par jour jusqu'a la fin de periode (21 -> 30)
    expect(ev).toHaveLength(10);
    expect(ev[0].date).toBe(LUN_21);
    expect(ev[ev.length - 1].date).toBe(MER_30);
    expect(ev.every((e) => e.source === "absences" && e.comptabilise === false)).toBe(true);
    expect(ev.filter((e) => e.date === DIM_27).every((e) => e.motifNonComptabilisation === "DIMANCHE")).toBe(true);
    const rec = construireReconciliationAbsences(ev, [{ joursAbsence: 0 }] as never);
    expect(rec.evenementsAbsence).toBe(10);
    expect(rec.evenementsComptabilises).toBe(0);
    expect(rec.parMotifNonComptabilisation).toEqual({ DIMANCHE: 1, DECLARATION_SEULE: 9 }); // 21->30 : 1 seul dimanche (27/09)
  });

  it("doublons : un jour deja trace par le journal n'est pas recompte, et le doublon est publie", () => {
    const d = avecAbsence(LUN_21);
    // la table absences redonne le meme jour, avec le meme code R3
    d.absencesByEmploye.set(1, [
      absenceTable({ id: 77, dateFin: LUN_21, motif: "doublon" }),
    ]);
    const stats = { doublonsSupprimes: 0 };
    const ev = construireEvenementsRapport(employe(), ligneBase(), d, true, stats);
    expect(ev.filter((e) => e.type === "ABSENCE")).toHaveLength(1);
    expect(ev.find((e) => e.date === LUN_21)!.source).toBe("attendance_entries");
    expect(stats.doublonsSupprimes).toBe(1);
    // et la reconciliation publie le doublon au lieu de le masquer
    const rec = construireReconciliationAbsences(ev, [{ joursAbsence: 1 }] as never, stats);
    expect(rec.doublonsSupprimes).toBe(1);
    expect(rec.evenementsAbsence).toBe(1);
    expect(rec.evenementsComptabilises).toBe(1);
    expect(rec.joursComptabilises).toBe(1);
    expect(rec.ecart).toBe(0);
  });

  it("situations RH actives : elles apparaissent, indexees par identifiant employe", () => {
    const d = planning();
    d.situationsByEmploye.set("1", [
      { id: 5, category: "CONGE", type: "PARTIEL", subType: "MATIN", dateDebut: LUN_21, dateFin: null, dateEffet: LUN_21, montantRetenue: 1500 },
    ] as never);
    const ev = construireEvenementsRapport(employe(), ligneBase(), d, true);
    const sit = ev.filter((e) => e.type === "SITUATION_RH");
    expect(sit).toHaveLength(1);
    expect(sit[0].date).toBe(LUN_21);
    expect(sit[0].libelle).toBe("CONGE - PARTIEL - MATIN");
    expect(sit[0].payrollImpact).toBe(1500);
  });

  it("situation terminee avant la periode : aucune trace", () => {
    const d = planning();
    d.situationsByEmploye.set("1", [
      { id: 6, category: "CONGE", type: "PARTIEL", dateDebut: "2026-08-01", dateFin: "2026-08-31", dateEffet: "2026-08-01" },
    ] as never);
    expect(construireEvenementsRapport(employe(), ligneBase(), d, true).filter((e) => e.type === "SITUATION_RH")).toHaveLength(0);
  });

  it("absence declaree avec un code calcule different : motif CODE_CALCULE_DIFFERENT", () => {
    const d = avecAbsence(LUN_21, "C");
    const ev = construireEvenementsRapport(employe(), ligneBase(), d, true);
    expect(ev[0].comptabilise).toBe(false);
    expect(ev[0].motifNonComptabilisation).toBe("CODE_CALCULE_DIFFERENT");
  });

  it("reconciliation : la difference evenements / jours est expliquee, jamais masquee", () => {
    const events = [
      { comptabilise: true, motifNonComptabilisation: null },
      { comptabilise: true, motifNonComptabilisation: null },
      { comptabilise: false, motifNonComptabilisation: "DIMANCHE" as const },
      { comptabilise: false, motifNonComptabilisation: "DIMANCHE" as const },
      { comptabilise: false, motifNonComptabilisation: "JOUR_FERIE" as const },
    ].map((x, i) => ({ type: "ABSENCE", ...x, id: `e${i}` })) as unknown as ReportEvent[];
    const rows = [{ joursAbsence: 2 }] as unknown as Parameters<typeof construireReconciliationAbsences>[1];
    const rec = construireReconciliationAbsences(events, rows);
    expect(rec.evenementsAbsence).toBe(5);
    expect(rec.evenementsComptabilises).toBe(2);
    expect(rec.joursComptabilises).toBe(2);
    expect(rec.ecart).toBe(0);
    expect(rec.parMotifNonComptabilisation).toEqual({ DIMANCHE: 2, JOUR_FERIE: 1 });
  });

  it("reconciliation : un ecart residuel est publie tel quel", () => {
    const events = [
      { type: "ABSENCE", comptabilise: true, motifNonComptabilisation: null, id: "e1" },
    ] as unknown as ReportEvent[];
    const rows = [{ joursAbsence: 3 }] as unknown as Parameters<typeof construireReconciliationAbsences>[1];
    expect(construireReconciliationAbsences(events, rows).ecart).toBe(-2);
  });

  it("reconciliation : population complete, independante du filtre de type", () => {
    const events = [
      { type: "ABSENCE", comptabilise: true, motifNonComptabilisation: null, id: "a1" },
      { type: "RETARD", comptabilise: null, motifNonComptabilisation: null, id: "r1" },
    ] as unknown as ReportEvent[];
    const rows = [{ joursAbsence: 1 }] as unknown as Parameters<typeof construireReconciliationAbsences>[1];
    const rec = construireReconciliationAbsences(events, rows);
    expect(rec.evenementsAbsence).toBe(1);
    expect(rec.ecart).toBe(0);
  });
});

// --------------------------------------------------------------------------
describe("RPT-02 section 13 -- absence ouverte", () => {
  function absenceOuverte(dateDebut: string, from = FROM, to = TO) {
    const d = planning(from, to);
    d.absencesByEmploye.set(1, [
      absenceTable({ dateDebut, motif: "arret", justifie: true }),
    ]);
    return d;
  }

  it("commencee AVANT la periode : reste ouverte, bornee a la fin de periode", () => {
    const ev = construireEvenementsRapport(employe(), ligneBase(), absenceOuverte("2026-08-01")).filter(
      (e) => e.type === "ABSENCE"
    );
    expect(ev).toHaveLength(30); // tous les jours calendaires 01 -> 30, dimanches inclus
    expect(ev[0].date).toBe(FROM);
    expect(ev[ev.length - 1].date).toBe(TO);
    expect(ev.some((e) => e.date > TO)).toBe(false);
    expect(ev.some((e) => e.date < FROM)).toBe(false);
  });

  it("commencee DANS la periode : traitee jusqu'a la fin de periode", () => {
    const ev = construireEvenementsRapport(employe(), ligneBase(), absenceOuverte(LUN_21)).filter(
      (e) => e.type === "ABSENCE"
    );
    expect(ev).toHaveLength(10); // 21 -> 30 : 10 jours calendaires
    expect(ev[0].date).toBe(LUN_21);
    expect(ev[ev.length - 1].date).toBe(MER_30);
  });

  it("reportee sur la periode suivante : rien n'est perdu", () => {
    const ev = construireEvenementsRapport(
      employe(),
      ligneBase(),
      absenceOuverte("2026-09-28", "2026-10-01", "2026-10-15"),
      true
    ).filter((e) => e.type === "ABSENCE");
    expect(ev.length).toBeGreaterThan(0);
    expect(ev[0].date).toBe("2026-10-01");
    expect(ev[ev.length - 1].date).toBe("2026-10-15");
  });

  it("multi-mois : une absence ouverte traverse les deux mois sans trou", () => {
    const d = absenceOuverte("2026-09-28", "2026-09-25", "2026-10-10");
    const dates = construireEvenementsRapport(employe(), ligneBase(), d, true)
      .filter((e) => e.type === "ABSENCE")
      .map((e) => e.date);
    expect(dates[0]).toBe("2026-09-28");
    expect(dates[dates.length - 1]).toBe("2026-10-10");
    expect(dates).toContain("2026-09-29");
    expect(dates).toContain("2026-10-01");
    expect(dates.every((x) => x >= "2026-09-25" && x <= "2026-10-10")).toBe(true);
  });

  it("absence fermee : bornee par dateFin", () => {
    const d = planning();
    d.absencesByEmploye.set(1, [
      absenceTable({ dateFin: MER_23, justifie: true }),
    ]);
    const dates = construireEvenementsRapport(employe(), ligneBase(), d, true)
      .filter((e) => e.type === "ABSENCE")
      .map((e) => e.date);
    expect(dates).toEqual([LUN_21, MAR_22, MER_23]);
  });

  it("absence fermee AVANT la periode : aucune trace, pas de debordement", () => {
    const d = planning();
    d.absencesByEmploye.set(1, [
      absenceTable({ id: 2, dateDebut: "2026-08-03", dateFin: "2026-08-07", justifie: true }),
    ]);
    expect(absences(d)).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
describe("RPT-02 section 12 -- regles de calendrier explicites", () => {
  it("un jour sans holiday et hors dimanche reste ouvert : la regle est explicite", () => {
    const d = planning();
    expect(jourOuvrePour(employe(), MER_30, d)).toBe(true);
    expect(jourOuvrePour(employe(), DIM_20, d)).toBe(false);
  });

  it("sans cycle de travail, le dimanche reste exclu (defaut explicite)", () => {
    const d = baseDonnees();
    const sansCycle = employe({ workCycleId: null });
    expect(jourOuvrePour(sansCycle, DIM_06, d)).toBe(false);
    expect(jourOuvrePour(sansCycle, LUN_21, d)).toBe(true);
  });

  it("sans cycle, le samedi suit le defaut et le seuil horaire de repli", () => {
    const d = baseDonnees();
    const jour = construireJoursEmploye(employe({ workCycleId: null }), d).find((j) => j.date === SAM_05)!;
    expect(jour.isWorkingDay).toBe(true);
    expect(jour.heuresTheoriques).toBe(d.seuilDefaut);
  });

  it("periode d'un seul jour : aucun crash, compte coherent", () => {
    const analyse = analyserPeriode(construireJoursEmploye(employe(), planning(MER_30, MER_30)));
    expect(analyse.joursTheoriques).toBe(1);
    expect(analyse.joursMuets).toBe(1);
  });
});

// --------------------------------------------------------------------------
describe("RPT-02 section 19 -- references attendues", () => {
  it("septembre 2026 : 30 jours, 26 ouvres (22 jours de semaine + 4 samedis), 4 dimanches", () => {
    const jours = construireJoursEmploye(employe(), planning());
    expect(jours).toHaveLength(30);
    expect(jours.filter((j) => j.isWorkingDay)).toHaveLength(26);
    expect(jours.filter((j) => !j.isWorkingDay)).toHaveLength(4);
    const heures = jours.filter((j) => j.isWorkingDay).reduce((a, j) => a + j.heuresTheoriques, 0);
    expect(heures).toBeCloseTo(22 * 9.5 + 4 * 4.5, 5);
    expect(heures).toBeCloseTo(227, 5);
  });

  it("un jour d'analyse stable reste un jour de presence", () => {
    const jour: JourAnalyseInput = {
      date: LUN_21,
      code: "P",
      isWorkingDay: true,
      heuresTheoriques: 9.5,
      workedMinutes: 570,
      normalMinutes: 570,
      overtimeMinutes: 0,
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
    };
    expect(analyserPeriode([jour]).joursPresence).toBe(1);
  });

  it("la reconciliation vide reste neutre", () => {
    expect(construireReconciliationAbsences([], [])).toEqual(RECO_VIDE);
  });
});