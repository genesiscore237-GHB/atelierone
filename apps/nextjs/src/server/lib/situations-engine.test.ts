import { describe, it, expect } from "vitest";
import {
  statutAdministratif,
  situationsActivesEnDate,
  couvre,
  conflits,
  verifierGardeFousMap,
  regimeSituationPeriode,
  timelineEvenements,
  mapperTypeCongeeVersSituation,
  veilleDe,
  lendemainDe,
  impactsPaieCompatibles,
} from "./situations-engine";
import type { SituationLike } from "./situations-engine";

const base = (over: Partial<SituationLike>): SituationLike => ({
  category: "ABSENCE",
  type: "ABSENCE_INJUSTIFIEE",
  dateDebut: "2026-09-01",
  impactContrat: "ACTIVE",
  impactPresence: "ABSENCE",
  impactPlanning: "ABSENT",
  impactPaie: "RETENUE",
  statutWorkflow: "ACTIF",
  ...over,
});

describe("R6 — situations-engine : statutAdministratif (D-R6-01 §3)", () => {
  it("aucune situation → actif", () => {
    expect(statutAdministratif({ statutCourant: "actif", situations: [], date: "2026-09-10" }).statut).toBe("actif");
  });

  it("situation SUSPENDU ACTIF couvrant la date → suspendu dérivé", () => {
    const susp = base({ category: "DISCIPLINAIRE", type: "MISE_A_PIED", dateDebut: "2026-09-10", dateFin: "2026-09-12", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "RETENUE" });
    const r = statutAdministratif({ statutCourant: "actif", situations: [susp], date: "2026-09-11" });
    expect(r.statut).toBe("suspendu");
    expect(r.situationDerivante?.type).toBe("MISE_A_PIED");
  });

  it("situation future (hors date) → reste actif", () => {
    const fut = base({ category: "DISCIPLINAIRE", type: "MISE_A_PIED", dateDebut: "2026-10-01", dateFin: "2026-10-03", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "RETENUE" });
    expect(statutAdministratif({ statutCourant: "actif", situations: [fut], date: "2026-09-11" }).statut).toBe("actif");
  });

  it("statut terminal sorti conservé, jamais surchargé", () => {
    expect(statutAdministratif({ statutCourant: "sorti", situations: [], date: "2026-09-11" }).statut).toBe("sorti");
    expect(statutAdministratif({ statutCourant: "archive", situations: [], date: "2026-09-11" }).statut).toBe("archive");
  });

  it("conge (legacy) n'est plus produit → actif (aucun nouvel écrit 'conge')", () => {
    expect(statutAdministratif({ statutCourant: "conge", situations: [], date: "2026-09-11" }).statut).toBe("actif");
  });

  it("congé annuel (contrat ACTIF) ne suspend pas le contrat", () => {
    const conge = base({ category: "CONGE", type: "CONGE_ANNUEL", dateDebut: "2026-09-01", dateFin: "2026-09-10", impactContrat: "ACTIVE", impactPresence: "CONGE", impactPlanning: "NON_PLANIFIABLE", impactPaie: "MAINTIEN_REMUNERATION" });
    expect(statutAdministratif({ statutCourant: "actif", situations: [conge], date: "2026-09-05" }).statut).toBe("actif");
  });
});

describe("R6 — couvre / situationsActivesEnDate", () => {
  it("date hors intervalle → non couverte ; situation ouverte → couvre jusqu'à l'infini", () => {
    const ouverte = base({ category: "SUSPENSION", type: "CHOMAGE_TECHNIQUE", dateDebut: "2026-09-01", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "A_DETERMINER" });
    expect(couvre(ouverte, "2026-09-30")).toBe(true);
    expect(couvre(ouverte, "2026-08-31")).toBe(false);
    const fermee = base({ dateDebut: "2026-09-01", dateFin: "2026-09-05" });
    expect(couvre(fermee, "2026-09-06")).toBe(false);
  });

  it("statutWorkflow non effectif (BROUILLON/APPROUVE/TERMINE) → sans effet", () => {
    const brouillon = base({ statutWorkflow: "BROUILLON" });
    expect(couvre(brouillon, "2026-09-03")).toBe(false);
    const terminée = base({ statutWorkflow: "TERMINE" });
    expect(couvre(terminée, "2026-09-03")).toBe(false);
  });

  it("date d'effet postérieure au début départ = source de vérité (D-R6-11)", () => {
    const avecEffet = base({ dateDebut: "2026-09-01", dateEffet: "2026-09-04" });
    expect(couvre(avecEffet, "2026-09-03")).toBe(false);
    expect(couvre(avecEffet, "2026-09-04")).toBe(true);
  });
});

describe("R6 — conflits (D-R6-12 §14)", () => {
  const map = () =>
    base({ category: "DISCIPLINAIRE", type: "MISE_A_PIED", dateDebut: "2026-09-10", dateFin: "2026-09-12", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "RETENUE" });
  const conge = () =>
    base({ category: "CONGE", type: "CONGE_ANNUEL", dateDebut: "2026-09-08", dateFin: "2026-09-15", impactContrat: "ACTIVE", impactPresence: "CONGE", impactPlanning: "NON_PLANIFIABLE", impactPaie: "MAINTIEN_REMUNERATION" });

  it("MAP + congé chevauchant → REFUS", () => {
    const c = conflits({ candidate: map(), existantes: [conge()] });
    expect(c.some((x) => x.type === "REFUS" && x.code === "MAP_CONGE")).toBe(true);
  });

  it("deux situations suspensives → REFUS (suspension double)", () => {
    const autre = base({ category: "SUSPENSION", type: "AUTRE_CAUSE_LEGALE", dateDebut: "2026-09-11", dateFin: "2026-09-20", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "NON_REMUNERE" });
    const c = conflits({ candidate: map(), existantes: [autre] });
    expect(c.some((x) => x.type === "REFUS" && x.code === "SUSPENSION_DOUBLE")).toBe(true);
  });

  it("sortie prioritaire face à une suspension → PRIORITE, pas REFUS", () => {
    const sortie = base({ category: "SORTIE", type: "SORTIE", dateDebut: "2026-09-11", impactContrat: "TERMINE", impactPresence: "NON_COMPTABLE", impactPlanning: "ABSENT", impactPaie: "PARTIEL" });
    const c = conflits({ candidate: sortie, existantes: [map()] });
    expect(c.some((x) => x.type === "PRIORITE" && x.code === "SORTIE_PRIORITAIRE")).toBe(true);
    expect(c.some((x) => x.type === "REFUS")).toBe(false);
  });

  it("impacts paie incompatibles sur le même intervalle → REFUS", () => {
    const candidate = base({ category: "ABSENCE", type: "ABSENCE_INJUSTIFIEE", dateDebut: "2026-09-10", dateFin: "2026-09-12", impactPaie: "NON_REMUNERE" });
    const c = conflits({ candidate, existantes: [map()] });
    expect(c.some((x) => x.code === "IMPACT_PAIE_INCOMPATIBLE" && x.type === "REFUS")).toBe(true);
  });

  it("maladie + externé complementaire (maternité CNPS + complément POL) → compatible", () => {
    expect(impactsPaieCompatibles("MAINTIEN_REMUNERATION", "INDEMNISATION_EXTERNE")).toBe(true);
    expect(impactsPaieCompatibles("NON_REMUNERE", "RETENUE")).toBe(false);
    expect(impactsPaieCompatibles("RETENUE", "RETENUE")).toBe(false);
  });

  it("doublon même type non suspensif sur même intervalle → ANOMALIE", () => {
    const absAut = () =>
      base({ category: "ABSENCE", type: "ABSENCE_AUTORISEE", dateDebut: "2026-09-01", dateFin: "2026-09-03", impactContrat: "ACTIVE", impactPresence: "PRESENCE", impactPlanning: "PLANIFIE", impactPaie: "NORMAL" });
    const c = conflits({ candidate: absAut(), existantes: [absAut()] });
    expect(c.some((x) => x.type === "ANOMALIE" && x.code === "DOUBLON_TYPE")).toBe(true);
  });
});

describe("R6 — garde-fous mise à pied (art. 30, D-R6-03 §5)", () => {
  it("durée > 8 jours → violation ; notification et inspection manquantes → violations", () => {
    const v = verifierGardeFousMap(
      base({ category: "DISCIPLINAIRE", type: "MISE_A_PIED", dateDebut: "2026-09-10", dateFin: "2026-09-25", dureeJours: 12, impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "RETENUE" }),
      { dureeMaxJours: 8, notificationEcriteRequise: true, communicationInspectionRequise: true }
    );
    expect(v.join(" | ")).toContain("8 jours ouvrables");
    expect(v.join(" | ")).toContain("Notification écrite");
    expect(v.join(" | ")).toContain("inspection");
  });

  it("conforme quand dans les bornes + garde-fous respectés", () => {
    const v = verifierGardeFousMap(
      base({ category: "DISCIPLINAIRE", type: "MISE_A_PIED", dateDebut: "2026-09-10", dateFin: "2026-09-12", dureeJours: 3, impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "RETENUE", notificationEcrite: true, communicationInspection: true }),
      { dureeMaxJours: 8, notificationEcriteRequise: true, communicationInspectionRequise: true }
    );
    expect(v).toEqual([]);
  });

  it("retenue négative → interdiction des amendes (art. 30-1)", () => {
    const v = verifierGardeFousMap(base({ category: "DISCIPLINAIRE", type: "MISE_A_PIED", dureeJours: 2, montantRetenue: -5000, impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "RETENUE" }));
    expect(v.join(" | ")).toContain("amendes");
  });
});

describe("R6 — regimeSituationPeriode (D-R6-17 §20/§22)", () => {
  const p = { debutPeriode: "2026-09-01", finPeriode: "2026-09-30" };
  const suspension = () =>
    base({ category: "SUSPENSION", type: "CHOMAGE_TECHNIQUE", dateDebut: "2026-09-01", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "A_DETERMINER" });

  it("aucune situation → aucun, paie normale", () => {
    expect(regimeSituationPeriode({ situations: [], ...p })).toEqual({ regime: "aucun", impactPaie: "NORMAL" });
  });

  it("situation couvrant toute la période → total", () => {
    const r = regimeSituationPeriode({ situations: [suspension()], ...p });
    expect(r.regime).toBe("total");
    expect(r.impactPaie).toBe("A_DETERMINER");
    expect(r.doitBloquerCloture).toBe(true);
  });

  it("situation commençant en cours de période → partiel", () => {
    const r = regimeSituationPeriode({
      situations: [suspension()],
      debutPeriode: "2026-09-01",
      finPeriode: "2026-09-30",
    });
    expect(r.regime).toBe("total");
    const partiel = regimeSituationPeriode({
      situations: [{ ...suspension(), dateDebut: "2026-09-15" }],
      ...p,
    });
    expect(partiel.regime).toBe("partiel");
    expect(partiel.dateDebut).toBe("2026-09-15");
  });

  it("NON_REMUNERE à effet total → profil non rémunéré", () => {
    const r = regimeSituationPeriode({
      situations: [{ ...suspension(), impactPaie: "NON_REMUNERE", dateDebut: "2026-09-01" }],
      ...p,
    });
    expect(r.impactPaie).toBe("NON_REMUNERE");
    expect(r.regime).toBe("total");
  });

  it("situation TERMINE (pas effectif ACTIF) ignorée", () => {
    const r = regimeSituationPeriode({
      situations: [{ ...suspension(), statutWorkflow: "TERMINE" }],
      ...p,
    });
    expect(r.regime).toBe("aucun");
  });
});

describe("R6 — timeline + pont congés", () => {
  it("timeline triée par date d'effet", () => {
    const evts = timelineEvenements([
      base({ category: "CONGE", type: "CONGE_ANNUEL", dateDebut: "2026-05-15", dateFin: "2026-05-20", impactContrat: "ACTIVE", impactPresence: "CONGE", impactPlanning: "NON_PLANIFIABLE", impactPaie: "MAINTIEN_REMUNERATION" }),
      base({ category: "DISCIPLINAIRE", type: "MISE_A_PIED", dateDebut: "2026-09-10", dateFin: "2026-09-12", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "RETENUE" }),
      base({ category: "MATERNITE", type: "MATERNITE", dateDebut: "2026-03-01", dateFin: "2026-06-13", impactContrat: "SUSPENDU", impactPresence: "SUSPENSION", impactPlanning: "BLOQUE", impactPaie: "INDEMNISATION_EXTERNE" }),
    ]);
    expect(evts.map((e) => e.dateEffet)).toEqual(["2026-03-01", "2026-05-15", "2026-09-10"]);
  });

  it("mapperTypeCongeeVersSituation couvre les types connus", () => {
    expect(mapperTypeCongeeVersSituation("CONGE_ANNUEL")).toEqual({ category: "CONGE", type: "CONGE_ANNUEL" });
    expect(mapperTypeCongeeVersSituation("SANS_SOLDE")).toEqual({ category: "CONGE", type: "CONGE_SANS_SOLDE" });
    expect(mapperTypeCongeeVersSituation("MALADIE")).toEqual({ category: "MALADIE", type: "MALADIE" });
    expect(mapperTypeCongeeVersSituation("INCONNU")).toEqual({ category: "AUTRE", type: "AUTRE" });
  });
});

describe("R6 — veilleDe / lendemainDe", () => {
  it("bornes calendaires exactes", () => {
    expect(veilleDe("2026-09-20")).toBe("2026-09-19");
    expect(veilleDe("2026-03-01")).toBe("2026-02-28");
    expect(lendemainDe("2026-09-20")).toBe("2026-09-21");
  });
});