/**
 * RPT-05 â€” Tests de la projection de securite du Centre RH/Paie.
 *
 * Les permissions sont resolues par `canSeeSalary`, mais la REGLE de projection
 * (champ absent, jamais null/0/"Masque") est testee ici comme fonction pure.
 */
import { describe, expect, it, vi } from "vitest";

// `rh-centre-rapports` tire `rbac-service` -> `trpc` -> next-auth : coupe ici,
// le test reste une unite pure sans besoin de serveur.
vi.mock("@atelierone/auth", () => ({
  auth: async () => null,
  signIn: async () => null,
  signOut: async () => null,
  handlers: {},
}));

import {
  CHAMPS_SENSIBLES_REMUNERATION,
  construireEvenementsRapport,
  construireLigneRapport,
  type DonneesSituation,
} from "~/server/lib/rh-centre-rapports";
import { CHAMPS_SENSIBLES_IMPACT, masquerImpacts } from "~/server/lib/rh-journal-engine";

type LigneSituation = Parameters<typeof construireLigneRapport>[1];

function employe() {
  return {
    id: 7,
    matricule: "GPJ-0007",
    nom: "NDIAYE",
    prenom: "Awa",
    fonction: "Comptable",
    statut: "actif",
    departement: "Comptabilite",
    modePaie: "SALAIRE_MENSUEL",
    dateEmbauche: "2020-01-01",
    dateFinContrat: null,
    dateSortie: null,
    salaireBase: "350000",
  } as never;
}

function ligneBase(): LigneSituation {
  return {
    employeeId: 7,
    matricule: "GPJ-0007",
    nom: "NDIAYE",
    prenom: "Awa",
    departement: "Comptabilite",
    statut: "actif",
    mode: "SALAIRE_MENSUEL",
    joursTheoriques: 22,
    joursPresence: 20,
    joursAbsence: 2,
    joursConges: 1,
    joursMuets: 0,
    heuresTheoriques: 176,
    heuresTravaillees: 168,
    heuresNormales: 168,
    heuresSupp: 0,
    retardTotalMinutes: 45,
    departAnticipeTotalMinutes: 0,
    tauxPresence: 90.9,
    salaires: {
      baseContractuelle: 350000,
      gains: 350000,
      retenues: 45000,
      net: 305000,
      netLabel: "ESTIME",
      tauxHoraire: 1988,
      bulletinExiste: false,
      segments: [],
    },
    avances: {
      avancePeriode: 50000,
      recuperePeriode: 20000,
      soldeFinPeriode: 30000,
      soldeActuel: 120000,
      nbAvances: 1,
    },
    anomalies: [],
  } as never;
}

function baseDonnees(): DonneesSituation {
  return {
    from: "2026-09-01",
    to: "2026-09-30",
    today: "2026-09-30",
    holidays: [],
    items: [],
    standardMonthlyHours: 176,
    overtimeMultiplier: 1.5,
    seuilDefaut: 9.5,
    employees: [employe()],
    calcsByEmploye: new Map([
      [
        7,
        [
          {
            date: "2026-09-03",
            employeeId: 7,
            codePresence: "ABSENT",
            isAbsent: true,
            workedMinutes: 0,
            normalMinutes: 480,
            overtimeMinutes: 0,
            lateMinutes: 0,
            earlyDepartureMinutes: 0,
            lateDeductionAmount: 0,
            absenceFinancialImpact: 19886,
            taskBonus: null,
          },
        ],
      ],
    ]),
    saisiesByEmploye: new Map([
      [7, new Map([["2026-09-03", { id: 11, status: "ABSENT", absenceType: "MALADIE", absenceJustificatif: "Certificat", notes: null, validated: false, validatedBy: null, createdBy: null }]])],
    ]),
    absencesByEmploye: new Map(),
    situationsByEmploye: new Map(),
    nomsUtilisateurs: new Map([[7, "Admin RH"]]),
    posteSegmentsByEmploye: new Map(),
    histoByEmploye: new Map(),
    advancesByEmploye: new Map(),
    recoveriesByEmp: new Map(),
    suspensions: new Map(),
    payrollPeriods: [],
    summaries: [],
    bulletinByEmp: new Map(),
    nonWorkingByCycle: new Map(),
    schedByCycleDay: new Map(),
    parametresPresence: {
      lateToleranceMinutes: 10,
      roundToMinutes: 5,
      autoDeductLate: true,
      countEarlyArrival: false,
      countLateDeparture: false,
    },
  } as never;
}

describe("RPT-05 projection des montants", () => {
  it("rows : sans droit salaire, AUCUN champ remuneration dans le payload", () => {
    const row = construireLigneRapport(employe(), ligneBase(), baseDonnees(), false) as unknown as Record<string, unknown>;

    for (const champ of CHAMPS_SENSIBLES_REMUNERATION) {
      expect(Object.hasOwn(row, champ), `${champ} doit etre ABSENT, pas null`).toBe(false);
    }
    // Les donnees non sensibles restent presentes : on ne casse pas le rapport.
    expect(row.matricule).toBe("GPJ-0007");
    expect(row.joursPresence).toBe(20);
    expect(row.tauxPresence).toBeCloseTo(90.9);
  });

  it("rows : avec droit salaire, les montants sont laisses intacts", () => {
    const row = construireLigneRapport(employe(), ligneBase(), baseDonnees(), true) as unknown as Record<string, unknown>;

    for (const champ of CHAMPS_SENSIBLES_REMUNERATION) {
      expect(Object.hasOwn(row, champ), `${champ} doit etre present`).toBe(true);
    }
    expect(row.totalNet).toBe(305000);
    expect(row.tauxHoraire).toBe(1988);
    expect(row.avancePeriode).toBe(50000);
  });

  it("events : sans droit salaire, `payrollImpact` est ABSENT (pas 0, pas null)", () => {
    const events = construireEvenementsRapport(employe(), ligneBase(), baseDonnees(), false) as unknown as Record<string, unknown>[];

    expect(events).toHaveLength(1);
    const ev = events[0] as Record<string, unknown>;
    expect(Object.hasOwn(ev, "payrollImpact"), "payrollImpact doit etre absent").toBe(false);
    // Le reste de l'evenement reste exploitable.
    expect(ev.type).toBe("ABSENCE");
    expect(ev.employeeId).toBe(7);
    expect(ev.presenceCode).toBe("ABSENT");
  });

  it("events : avec droit salaire, `payrollImpact` est conserve", () => {
    const events = construireEvenementsRapport(employe(), ligneBase(), baseDonnees(), true) as unknown as Record<string, unknown>[];

    expect(events).toHaveLength(1);
    expect(events[0].payrollImpact).toBe(19886);
  });

  it("journal : sans droit salaire, les 4 cles d'impact sont ABSENTES", () => {
    const lignes = [
      {
        eventId: "journal:7:2026-09-03",
        employeeId: 7,
        matricule: "GPJ-0007",
        payrollImpact: 19886,
        payrollImpactAbsence: 19886,
        payrollImpactRetard: 0,
        payrollImpactSituationRH: 0,
        presenceImpactHours: 8,
      },
    ];

    const [visible] = masquerImpacts(lignes, false) as Record<string, unknown>[];

    for (const champ of CHAMPS_SENSIBLES_IMPACT) {
      expect(Object.hasOwn(visible, champ), `${champ} doit ettre absent`).toBe(false);
    }
    // Un impact non salarial reste visible : la journee n'est pas videe.
    expect(visible.presenceImpactHours).toBe(8);
    expect(visible.matricule).toBe("GPJ-0007");
  });

  it("journal : avec droit salaire, rien n'est retire", () => {
    const lignes = [
      {
        eventId: "journal:7:2026-09-03",
        employeeId: 7,
        payrollImpact: 19886,
        payrollImpactAbsence: 19886,
        payrollImpactRetard: 0,
        payrollImpactSituationRH: 0,
      },
    ];

    const [visible] = masquerImpacts(lignes, true) as Record<string, unknown>[];

    expect(visible.payrollImpact).toBe(19886);
    expect(visible.payrollImpactRetard).toBe(0);
  });

  it("projection : ne mute jamais l'objet source", () => {
    const lignes = [
      { employeeId: 7, payrollImpact: 500, payrollImpactAbsence: 500 },
    ];
    const [projecte] = masquerImpacts(lignes, false) as Record<string, unknown>[];

    expect(Object.hasOwn(projecte, "payrollImpact")).toBe(false);
    // Le moteur reste intact pour un appelant interne autorise ulterieurement.
    expect(lignes[0].payrollImpact).toBe(500);
  });
});