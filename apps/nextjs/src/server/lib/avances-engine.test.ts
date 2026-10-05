import { describe, it, expect } from "vitest";
import {
  validerSaisieAvance,
  validerRecuperation,
  validerAnnulation,
  apresRecuperation,
  validerApprobation,
  validerVersement,
  validerRefus,
  estEligibleRecuperationPaie,
  montantRecuperationPaie,
  baseMensuelleEmploye,
  genererReferenceAvance,
  syntheseAvances,
  ACTIFS,
  ADVANCE_STATUTS,
} from "./avances-engine";

describe("MISSION §19 — avances sur salaire (règles §4-§7 + contrôles §18)", () => {
  it("avance après sortie → refusée (dette éventuelle conservée)", () => {
    const erreur = validerSaisieAvance({
      montant: 50000,
      periodeConcerneeDebut: null,
      periodeConcerneeFin: null,
      avancesActives: [],
      employe: { statut: "sorti", salaireBase: 200000, forfaitHebdomadaire: 0 },
    });
    expect(erreur).toContain("sorti");
  });

  it("avance dans la limite du salaire mensuel → valide", () => {
    const erreur = validerSaisieAvance({
      montant: 150000,
      periodeConcerneeDebut: null,
      periodeConcerneeFin: null,
      avancesActives: [],
      employe: { statut: "actif", salaireBase: 200000, forfaitHebdomadaire: 0 },
    });
    expect(erreur).toBeNull();
  });

  it("avance > salaire mensuel → refusée", () => {
    const erreur = validerSaisieAvance({
      montant: 250000,
      periodeConcerneeDebut: null,
      periodeConcerneeFin: null,
      avancesActives: [],
      employe: { statut: "actif", salaireBase: 200000, forfaitHebdomadaire: 0 },
    });
    expect(erreur).toContain("supérieure au salaire mensuel");
  });

  it("plafond forfait hebdo × 4 : 25 000 × 4 = 100 000 (salaire de base nul)", () => {
    expect(baseMensuelleEmploye({ salaireBase: 0, forfaitHebdomadaire: 25000 })).toBe(100000);
    const erreur = validerSaisieAvance({
      montant: 100001,
      periodeConcerneeDebut: null,
      periodeConcerneeFin: null,
      avancesActives: [],
      employe: { statut: "actif", salaireBase: 0, forfaitHebdomadaire: 25000 },
    });
    expect(erreur).toContain("100000");
  });

  it("avance doublée sur la même période concernée → refusée", () => {
    const erreur = validerSaisieAvance({
      montant: 50000,
      periodeConcerneeDebut: "2025-03-01",
      periodeConcerneeFin: "2025-03-31",
      avancesActives: [
        { statut: "VERSÉE", periodeConcerneeDebut: "2025-03-01", periodeConcerneeFin: "2025-03-31" },
      ],
      employe: { statut: "actif", salaireBase: 200000, forfaitHebdomadaire: 0 },
    });
    expect(erreur).toContain("doublée");
  });

  it("périodes différentes → pas de doublon (valide)", () => {
    const erreur = validerSaisieAvance({
      montant: 50000,
      periodeConcerneeDebut: "2025-04-01",
      periodeConcerneeFin: "2025-04-30",
      avancesActives: [{ statut: "VERSÉE", periodeConcerneeDebut: "2025-03-01", periodeConcerneeFin: "2025-03-31" }],
      employe: { statut: "actif", salaireBase: 200000, forfaitHebdomadaire: 0 },
    });
    expect(erreur).toBeNull();
  });

  it("récupération dépassant le montant initial → refusée (50 000 déjà sur 80 000, montant 40 000)", () => {
    const erreur = validerRecuperation({ montant: 40000, montantRecupereAvant: 50000, montantInitial: 80000, statut: "PARTIELLEMENT_RÉCUPÉRÉE" });
    expect(erreur).toContain("dépasserait");
  });

  it("statut et solde après récupération : 50 000/80 000 → PARTIELLEMENT_RÉCUPÉRÉE solde 30 000", () => {
    const r = apresRecuperation(80000, 50000);
    expect(r).toEqual({ soldeRestant: 30000, statut: "PARTIELLEMENT_RÉCUPÉRÉE" });
  });

  it("cumul = montant → RÉCUPÉRÉE, solde 0", () => {
    const r = apresRecuperation(80000, 80000);
    expect(r).toEqual({ soldeRestant: 0, statut: "RÉCUPÉRÉE" });
  });

  it("récupération sur avance ANNULÉE → refusée", () => {
    expect(validerRecuperation({ montant: 10, montantRecupereAvant: 0, montantInitial: 50000, statut: "ANNULÉE" })).not.toBeNull();
    expect(validerRecuperation({ montant: 10, montantRecupereAvant: 0, montantInitial: 50000, statut: "RÉCUPÉRÉE" })).not.toBeNull();
  });

  it("annulation refusée si des récupérations existent déjà", () => {
    expect(validerAnnulation({ montantRecupere: 5000, statut: "PARTIELLEMENT_RÉCUPÉRÉE" })).toContain("récupérations");
  });

  it("annulation refusée si intégralement récupérée", () => {
    expect(validerAnnulation({ montantRecupere: 0, statut: "RÉCUPÉRÉE" })).toContain("intégralement");
  });

  it("annulation d'une avance jamais récupérée → autorisée", () => {
    expect(validerAnnulation({ montantRecupere: 0, statut: "VERSÉE" })).toBeNull();
  });

  it("vocabulaire des statuts et actifs cohérent", () => {
    expect(ADVANCE_STATUTS).toContain("DEMANDÉE");
    expect(ACTIFS).toEqual(["DEMANDÉE", "APPROUVÉE", "VERSÉE", "PARTIELLEMENT_RÉCUPÉRÉE"]);
  });

  it("approbation séquence du workflow : DEMANDÉE → APPROUVÉE → VERSÉE", () => {
    expect(validerApprobation("DEMANDÉE")).toBeNull();
    expect(validerApprobation("APPROUVÉE")).toContain("DEMANDÉE");
    expect(validerVersement("APPROUVÉE")).toBeNull();
    expect(validerVersement("DEMANDÉE")).toContain("APPROUVÉE");
  });

  it("refus possible uniquement sur DEMANDÉE ou APPROUVÉE", () => {
    expect(validerRefus("DEMANDÉE")).toBeNull();
    expect(validerRefus("APPROUVÉE")).toBeNull();
    expect(validerRefus("VERSÉE")).toContain("DEMANDÉE");
    expect(validerRefus("RÉCUPÉRÉE")).toContain("DEMANDÉE");
  });

  // ── Tests de référence Phase 1 (plan §gates) — vecteurs paie ──
  it("vecteur 1 — avance 100 000 jamais récupérée → déduction intégrale 100 000", () => {
    expect(apresRecuperation(100000, 100000)).toEqual({ soldeRestant: 0, statut: "RÉCUPÉRÉE" });
    const cumul = 0 + 100000;
    expect(apresRecuperation(100000, cumul).soldeRestant).toBe(0);
    expect(validerRecuperation({ montant: 100000, montantRecupereAvant: 0, montantInitial: 100000, statut: "VERSÉE" })).toBeNull();
  });

  it("vecteur 2 — 100 000, 40 000 déjà récupérés → solde 60 000 déduits sur paie suivante", () => {
    const premieres = apresRecuperation(100000, 40000);
    expect(premieres).toEqual({ soldeRestant: 60000, statut: "PARTIELLEMENT_RÉCUPÉRÉE" });
    const restantes = apresRecuperation(100000, 100000);
    expect(restantes.soldeRestant).toBe(0);
    expect(validerRecuperation({ montant: 60000, montantRecupereAvant: 40000, montantInitial: 100000, statut: "PARTIELLEMENT_RÉCUPÉRÉE" })).toBeNull();
  });

  it("vecteur 3 — avance intégralement récupérée (100 000/100 000) → aucune déduction possible", () => {
    expect(apresRecuperation(100000, 100000)).toEqual({ soldeRestant: 0, statut: "RÉCUPÉRÉE" });
    expect(validerRecuperation({ montant: 1, montantRecupereAvant: 100000, montantInitial: 100000, statut: "RÉCUPÉRÉE" })).toContain("récupérée");
  });

  // ── Intégrité §18 — avances multiples / doublons / report / annulation ──
  it("avances multiples dans la limite salaire mensuel → chaque avance validée", () => {
    const base = validerSaisieAvance({
      montant: 60000,
      periodeConcerneeDebut: "2025-03-01",
      periodeConcerneeFin: "2025-03-31",
      avancesActives: [{ statut: "VERSÉE", periodeConcerneeDebut: "2025-02-01", periodeConcerneeFin: "2025-02-28" }],
      employe: { statut: "actif", salaireBase: 200000, forfaitHebdomadaire: 0 },
    });
    expect(base).toBeNull();
    const cumul = validerSaisieAvance({
      montant: 60000,
      periodeConcerneeDebut: "2025-04-01",
      periodeConcerneeFin: "2025-04-30",
      avancesActives: [
        { statut: "VERSÉE", periodeConcerneeDebut: "2025-03-01", periodeConcerneeFin: "2025-03-31" },
        { statut: "VERSÉE", periodeConcerneeDebut: "2025-02-01", periodeConcerneeFin: "2025-02-28" },
      ],
      employe: { statut: "actif", salaireBase: 200000, forfaitHebdomadaire: 0 },
    });
    expect(cumul).toBeNull();
  });

  it("report sur période suivante : fenêtre de récupération couvrant la paie suivante — solde conservé", () => {
    const apresPremiere = apresRecuperation(100000, 40000);
    expect(apresPremiere.soldeRestant).toBe(60000);
    const report = apresRecuperation(100000, 100000);
    expect(report).toEqual({ soldeRestant: 0, statut: "RÉCUPÉRÉE" });
  });

  it("annulation d'une avance avec récupérations déjà enregistrées → refusée (intégrité solde)", () => {
    expect(validerAnnulation({ montantRecupere: 10000, statut: "VERSÉE" })).toContain("récupérations");
    expect(validerAnnulation({ montantRecupere: 0, statut: "DEMANDÉE" })).toBeNull();
    expect(validerAnnulation({ montantRecupere: 0, statut: "APPROUVÉE" })).toBeNull();
  });

  // ── Tests P02 : éligibilité et montant de récupération de paie ──
  it("P02 éligibilité : seul VERSÉE / PARTIELLEMENT avec solde positif est déduit", () => {
    const base = {
      statut: "VERSÉE",
      soldeRestant: 100000,
      debut: null as string | null,
      fin: null as string | null,
      periodeDebut: "2025-05-01",
      periodeFin: "2025-05-31",
    };
    expect(estEligibleRecuperationPaie(base)).toBe(true);
    expect(estEligibleRecuperationPaie({ ...base, statut: "PARTIELLEMENT_RÉCUPÉRÉE" })).toBe(true);
    expect(estEligibleRecuperationPaie({ ...base, statut: "RÉCUPÉRÉE" })).toBe(false);
    expect(estEligibleRecuperationPaie({ ...base, statut: "DEMANDÉE" })).toBe(false);
    expect(estEligibleRecuperationPaie({ ...base, soldeRestant: 0 })).toBe(false);
  });

  it("P02 éligibilité respecte la fenêtre de récupération (borne NULL = illimitée)", () => {
    const opts = {
      statut: "VERSÉE",
      soldeRestant: 50000,
      debut: "2025-04-01" as string | null,
      fin: "2025-06-30" as string | null,
      periodeDebut: "2025-05-01",
      periodeFin: "2025-05-31",
    };
    expect(estEligibleRecuperationPaie(opts)).toBe(true);
    expect(estEligibleRecuperationPaie({ ...opts, fin: null })).toBe(true);
    expect(estEligibleRecuperationPaie({ ...opts, debut: null, fin: null })).toBe(true);
    expect(estEligibleRecuperationPaie({ ...opts, fin: "2025-04-30" })).toBe(false); // fenêtre entièrement avant la paie
  });

  it("P02 montant : ne peut jamais dépasser le cumul récupéré ni le solde restant", () => {
    expect(montantRecuperationPaie({ montant: 100000, montantRecupere: 40000, soldeRestant: 60000 })).toBe(60000);
    expect(montantRecuperationPaie({ montant: 100000, montantRecupere: 100000, soldeRestant: 0 })).toBe(0);
    expect(montantRecuperationPaie({ montant: 100000, montantRecupere: 95000, soldeRestant: 3000 })).toBe(3000);
  });

  // ── R5 : référence et synthèse (E2/E3) ──
  it("R5-E3 : génère une référence déterministe ADV-<yyyymm>-<id>", () => {
    expect(genererReferenceAvance(new Date(2026, 8, 25), 7)).toBe("ADV-202609-7");
    expect(genererReferenceAvance(new Date(2026, 0, 1), 1)).toBe("ADV-202601-1");
    expect(genererReferenceAvance(new Date(2026, 11, 31), 123)).toBe("ADV-202612-123");
  });

  it("R5-E2 : synthèse agrégée — totaux + répartition par statut", () => {
    const synth = syntheseAvances([
      { montant: 100000, montantRecupere: 0, soldeRestant: 100000, statut: "VERSÉE" },
      { montant: 200000, montantRecupere: 50000, soldeRestant: 150000, statut: "PARTIELLEMENT_RÉCUPÉRÉE" },
      { montant: 50000, montantRecupere: 50000, soldeRestant: 0, statut: "RÉCUPÉRÉE" },
      { montant: 30000, montantRecupere: 0, soldeRestant: 30000, statut: "DEMANDÉE" },
      { montant: 40000, montantRecupere: 0, soldeRestant: 40000, statut: "ANNULÉE" },
    ]);
    expect(synth.totalAccorde).toBe(420000);
    expect(synth.totalRecupere).toBe(100000);
    expect(synth.totalRestant).toBe(320000);
    expect(synth.actives).toBe(2); // VERSÉE + DEMANDÉE
    expect(synth.partielles).toBe(1);
    expect(synth.soldees).toBe(1);
    expect(synth.annulees).toBe(1);
  });

  it("R5-E2 : synthèse tolère valeurs nulles et chaînes numériques", () => {
    const synth = syntheseAvances([
      { montant: null, montantRecupere: null, soldeRestant: null, statut: null },
      { montant: "5000", montantRecupere: "2000", soldeRestant: "3000", statut: "VERSÉE" },
    ] as never);
    expect(synth.totalAccorde).toBe(5000);
    expect(synth.totalRecupere).toBe(2000);
    expect(synth.totalRestant).toBe(3000);
    expect(synth.actives).toBe(1);
  });
});