import { describe, it, expect } from "vitest";
import {
  getEtatEmploye,
  getEmployeeStateAt,
  getEmployeeSegments,
  prochaineVersionContrat,
  type HistoryEngineInput,
} from "./rh-history-engine";

function baseEmploye(over: Partial<HistoryEngineInput["employe"]> = {}): HistoryEngineInput {
  return {
    employe: {
      id: 7,
      matricule: "EMP-007",
      fonction: "Mecanicien",
      departmentId: 1,
      positionId: 11,
      statut: "actif",
      dateEmbauche: "2026-01-05",
      dateSortie: null,
      motifSortie: null,
      salaireBase: 150000,
      modePaie: "SALAIRE_MENSUEL",
      forfaitHebdomadaire: null,
      ...over,
    },
    statusHistory: [],
    salaryHistory: [],
    positionHistory: [],
    contractVersions: [],
    contratsCourants: [],
    situations: [],
  };
}

describe("getEtatEmploye (§36/E) — reconstruction à date", () => {
  it("l'intervalle salarial gouvernant prime sur la fiche", () => {
    const input = baseEmploye();
    input.salaryHistory = [
      { baseSalary: "150000", modePaie: "SALAIRE_MENSUEL", forfaitHebdomadaire: null, startDate: "2026-01-05", endDate: "2026-02-28", reason: "EMBAUCHE", changedBy: 1 },
      { baseSalary: "175000", modePaie: "SALAIRE_HORAIRE", forfaitHebdomadaire: null, startDate: "2026-03-01", endDate: null, reason: "AUGMENTATION", changedBy: 2 },
    ];
    const avant = getEtatEmploye(input, "2026-02-20");
    expect(avant.salaire?.baseSalary).toBe(150000);
    expect(avant.salaire?.modePaie).toBe("SALAIRE_MENSUEL");
    expect(avant.salaire?.source).toBe("historique");

    const apres = getEtatEmploye(input, "2026-03-15");
    expect(apres.salaire?.baseSalary).toBe(175000);
    expect(apres.salaire?.modePaie).toBe("SALAIRE_HORAIRE");
    expect(apres.salaire?.source).toBe("historique");
  });

  it("sans intervalle : chute sur la fiche (source 'fiche')", () => {
    const input = baseEmploye({ salaireBase: 90000, modePaie: "JOURNALIER" });
    const r = getEtatEmploye(input, "2026-05-10");
    expect(r.salaire?.baseSalary).toBe(90000);
    expect(r.salaire?.modePaie).toBe("JOURNALIER");
    expect(r.salaire?.source).toBe("fiche");
  });

  it("statut : historique sinon fiche, sinon inexistant avant embauche", () => {
    const input = baseEmploye();
    expect(getEtatEmploye(input, "2026-01-05").statut).toBe("actif");
    const sorti = baseEmploye();
    sorti.statusHistory = [
      { statut: "actif", startDate: "2026-01-05", endDate: "2026-08-31", reason: null, changedBy: null },
      { statut: "sorti", startDate: "2026-09-01", endDate: null, reason: "DEMISSION", changedBy: 3 },
    ];
    const s = getEtatEmploye(sorti, "2026-09-15");
    expect(s.statut).toBe("sorti");
    expect(s.sourceStatut).toBe("historique");
    expect(s.dateSortieEffective).toBeNull(); // date_sortie absente de la fiche : l'état sorti vient de l'historique
    expect(s.emploiActif).toBe(true); // pas de date de sortie fiche → l'emploi est considéré actif au statut près
  });

  it("dateSortieEffective remonte quand D >= date_sortie et que l'état est 'sorti'", () => {
    const input = baseEmploye({ dateSortie: "2026-09-01", motifSortie: "demission" });
    input.statusHistory = [
      { statut: "actif", startDate: "2026-01-05", endDate: "2026-08-31", reason: null, changedBy: null },
      { statut: "sorti", startDate: "2026-09-01", endDate: null, reason: "DEMISSION", changedBy: 3 },
    ];
    const r = getEtatEmploye(input, "2026-09-30");
    expect(r.dateSortieEffective).toBe("2026-09-01");
    expect(r.emploiActif).toBe(false);
    expect(r.ancienneteJours).toBe(268);
  });

  it("avant embauche : sourceStatut 'inexistant' et emploiActif false", () => {
    const r = getEtatEmploye(baseEmploye(), "2025-12-01");
    expect(r.sourceStatut).toBe("inexistant");
    expect(r.emploiActif).toBe(false);
    expect(r.ancienneteJours).toBeNull();
  });

  it("positions : historique sinon fiche", () => {
    const input = baseEmploye();
    input.positionHistory = [
      { positionId: 20, departmentId: 3, startDate: "2026-04-01", endDate: null, reason: "PROMOTION", changedBy: 1 },
    ];
    const r = getEtatEmploye(input, "2026-04-10");
    expect(r.poste?.positionId).toBe(20);
    expect(r.poste?.source).toBe("historique");
    const fiche = getEtatEmploye(baseEmploye(), "2026-02-01");
    expect(fiche.poste?.positionId).toBe(11);
    expect(fiche.poste?.source).toBe("fiche");
  });

  it("contrat : version gouvernante sinon contrat courant (projection)", () => {
    const input = baseEmploye();
    input.contratsCourants = [
      { id: 5, typeContrat: "CDI", poste: "Mecanicien", dateDebut: "2026-06-01", dateFin: null, dureeMois: null, salaireBase: "175000", statut: "ACTIF", fichierUrl: null, notes: null, finPeriodeEssai: null, avantages: null, renouvellement: null },
    ];
    input.contractVersions = [
      { id: 1, contractId: 5, version: 1, typeContrat: "CDD", poste: "Mecanicien", dateDebut: "2026-01-05", dateFin: "2026-05-31", dureeMois: 5, salaireBase: "150000", statut: "ACTIF", finPeriodeEssai: null, avantages: null, renouvellement: null, reason: "CONTRAT_INITIAL", changedBy: 1 },
    ];
    const enCdd = getEtatEmploye(input, "2026-03-01");
    expect(enCdd.contrat?.typeContrat).toBe("CDD");
    expect(enCdd.contrat?.source).toBe("historique");
    expect(enCdd.contrat?.version).toBe(1);
    const apresCdd = getEtatEmploye(input, "2026-07-01");
    expect(apresCdd.contrat?.typeContrat).toBe("CDI");
    expect(apresCdd.contrat?.source).toBe("fiche");
  });

  it("situations actives à la date seulement", () => {
    const input = baseEmploye();
    input.situations = [
      { id: 1, dateDebut: "2026-02-02", dateFin: "2026-02-08", type: "MISE_A_PIED", name: "Suspension", impactContrat: "SUSPENDU", impactPresence: null, impactPlanning: null, impactPaie: "NON_REMUNERE", modeCalculPaie: null, baseCalculPaie: null },
      { id: 2, dateDebut: "2026-03-01", dateFin: null, type: "CONGE", name: "Congé", impactContrat: null, impactPresence: null, impactPlanning: null, impactPaie: null, modeCalculPaie: null, baseCalculPaie: null },
    ];
    const pendant = getEtatEmploye(input, "2026-02-05");
    expect(pendant.situationsActives.map((s) => s.id)).toEqual([1]);
    const apres = getEtatEmploye(input, "2026-03-15");
    expect(apres.situationsActives.map((s) => s.id)).toEqual([2]);
  });
});

describe("getEmployeeStateAt (§36 complet)", () => {
  it("renvoie l'état paie + agrégeats pass-through", () => {
    const r = getEmployeeStateAt(
      baseEmploye(),
      "2026-05-01",
      { soldeConges: 8.5, dernierBulletin: { period: "2026-04", net: 150000 } } as Record<string, unknown>
    );
    expect(r.statut).toBe("actif");
    expect(r.agregats.soldeConges).toBe(8.5);
    expect((r.agregats.dernierBulletin as { net: number }).net).toBe(150000);
    expect(r.agregats).not.toBeUndefined();
  });
});

describe("getEmployeeSegments (§37) — segmentation de constance maximale", () => {
  it("chaque changement de salaire/statut ouvre un segment", () => {
    const input = baseEmploye();
    input.statusHistory = [
      { statut: "actif", startDate: "2026-01-05", endDate: "2026-02-28", reason: null, changedBy: null },
      { statut: "conge", startDate: "2026-03-01", endDate: "2026-03-20", reason: "CONGE", changedBy: 1 },
    ];
    input.salaryHistory = [
      { baseSalary: "150000", modePaie: "SALAIRE_MENSUEL", forfaitHebdomadaire: null, startDate: "2026-01-05", endDate: "2026-02-28", reason: null, changedBy: null },
      { baseSalary: "175000", modePaie: "SALAIRE_MENSUEL", forfaitHebdomadaire: null, startDate: "2026-03-01", endDate: null, reason: "AUGMENTATION", changedBy: 2 },
    ];
    const segs = getEmployeeSegments(input, "2026-02-10", "2026-03-31");
    expect(segs.length).toBe(2);
    expect(segs[0].from).toBe("2026-02-10");
    expect(segs[0].to).toBe("2026-02-28");
    expect(segs[0].salaire?.baseSalary).toBe(150000);
    expect(segs[0].statut).toBe("actif");
    expect(segs[1].from).toBe("2026-03-01");
    expect(segs[1].to).toBe("2026-03-31");
    expect(segs[1].salaire?.baseSalary).toBe(175000);
    expect(segs[1].statut).toBe("conge");
  });

  it("from > to → liste vide (jamais un segment fantôme)", () => {
    expect(getEmployeeSegments(baseEmploye(), "2026-03-31", "2026-02-10")).toEqual([]);
  });

  it("avant embauche → segment marqué horsPeriodeEmploi avec état vide", () => {
    const segs = getEmployeeSegments(baseEmploye(), "2025-12-01", "2025-12-31");
    expect(segs).toHaveLength(1);
    expect(segs[0].horsPeriodeEmploi).toBe(true);
    expect(segs[0].sourceStatut).toBe("inexistant");
  });

  it("les situations ouvrent aussi un segment", () => {
    const input = baseEmploye();
    input.situations = [
      { id: 9, dateDebut: "2026-06-01", dateFin: "2026-06-05", type: "MISE_A_PIED", name: "Suspension", impactContrat: "SUSPENDU", impactPresence: null, impactPlanning: null, impactPaie: "NON_REMUNERE", modeCalculPaie: null, baseCalculPaie: null },
    ];
    const segs = getEmployeeSegments(input, "2026-05-25", "2026-06-10");
    expect(segs).toHaveLength(2);
    expect(segs[0].situationsActives).toHaveLength(0);
    expect(segs[1].situationsActives.map((s) => s.id)).toEqual([9]);
  });
});

describe("prochaineVersionContrat", () => {
  it("1 s'il n'y a aucune version ; max+1 sinon", () => {
    expect(prochaineVersionContrat([])).toBe(1);
    expect(
      prochaineVersionContrat([
        { id: 1, contractId: 5, version: 2, typeContrat: null, poste: null, dateDebut: null, dateFin: null, dureeMois: null, salaireBase: null, statut: null, finPeriodeEssai: null, avantages: null, renouvellement: null, reason: null, changedBy: null },
        { id: 2, contractId: 5, version: 1, typeContrat: null, poste: null, dateDebut: null, dateFin: null, dureeMois: null, salaireBase: null, statut: null, finPeriodeEssai: null, avantages: null, renouvellement: null, reason: null, changedBy: null },
      ] as any)
    ).toBe(3);
  });
});