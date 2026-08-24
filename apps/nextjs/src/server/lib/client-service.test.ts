import { describe, it, expect } from "vitest";
import {
  validerFicheClient,
  contactPrincipalObligatoire,
  genererCodeClient,
  genererNumeroContrat,
  transitionStatutClientValide,
  peutOuvrirOrdre,
  transitionStatutContratValide,
  verifierContratActif,
  statutContratEffectif,
  calculerSolde,
  champsObligatoires,
} from "./client-service";

describe("Clients & Contrats — validation par type (specs §2-3)", () => {
  it("PART : civilité, nom, prénom, téléphone obligatoires", () => {
    expect(validerFicheClient({ type: "PART" })).toEqual(["civilite", "nom", "prenom", "telephone"]);
    expect(validerFicheClient({ type: "PART", civilite: "M", nom: "Doe", prenom: "John", telephone: "677" })).toEqual([]);
  });

  it("ENTR : raison sociale, NIU, téléphone, email obligatoires", () => {
    expect(validerFicheClient({ type: "ENTR", raisonSociale: "GPJ", niuNif: "X", telephone: "1", email: "a@b.cm" })).toEqual([]);
    expect(validerFicheClient({ type: "ENTR", raisonSociale: "GPJ" })).toEqual(["niuNif", "telephone", "email"]);
  });

  it("ASSUR : raison sociale + compagnie + téléphone", () => {
    expect(validerFicheClient({ type: "ASSUR", raisonSociale: "Assur", compagnieAssurance: "AXA", telephone: "1" })).toEqual([]);
    expect(validerFicheClient({ type: "ASSUR", raisonSociale: "Assur" })).toEqual(["compagnieAssurance", "telephone"]);
  });

  it("PROSP : nom seul suffit", () => {
    expect(validerFicheClient({ type: "PROSP", nom: "Prospect" })).toEqual([]);
  });

  it("contact principal obligatoire pour ENTR/ADMIN/FLOTTE, pas pour PART", () => {
    expect(contactPrincipalObligatoire("ENTR")).toBe(true);
    expect(contactPrincipalObligatoire("ADMIN")).toBe(true);
    expect(contactPrincipalObligatoire("FLOTTE")).toBe(true);
    expect(contactPrincipalObligatoire("PART")).toBe(false);
    expect(contactPrincipalObligatoire("ASSUR")).toBe(false);
  });

  it("champs obligatoires documentés pour chaque type", () => {
    expect(champsObligatoires("FLOTTE")).toEqual(["raisonSociale", "niuNif", "telephone", "email"]);
    expect(champsObligatoires("ADMIN")).toEqual(["raisonSociale", "niuNif", "telephone", "email"]);
  });
});

describe("Codes (specs : code_client immuable, numéros uniques)", () => {
  it("CLT-2026-0001", () => {
    expect(genererCodeClient(1, new Date("2026-01-01"))).toBe("CLT-2026-0001");
    expect(genererCodeClient(42, new Date("2026-08-24"))).toBe("CLT-2026-0042");
  });
  it("CONT-2026-00001", () => {
    expect(genererNumeroContrat(1, new Date("2026-01-01"))).toBe("CONT-2026-00001");
    expect(genererNumeroContrat(45, new Date("2026-08-24"))).toBe("CONT-2026-00045");
  });
});

describe("Transitions statut client (specs §5)", () => {
  it("PROSPECT → ACTIF explicite (et ARCHIVE)", () => {
    expect(transitionStatutClientValide("PROSPECT", "ACTIF")).toBe(true);
    expect(transitionStatutClientValide("PROSPECT", "ARCHIVE")).toBe(true);
    expect(transitionStatutClientValide("PROSPECT", "BLOQUE")).toBe(false);
  });
  it("ACTIF → INACTIF / BLOQUE / ARCHIVE", () => {
    expect(transitionStatutClientValide("ACTIF", "INACTIF")).toBe(true);
    expect(transitionStatutClientValide("ACTIF", "BLOQUE")).toBe(true);
    expect(transitionStatutClientValide("ACTIF", "ARCHIVE")).toBe(true);
    expect(transitionStatutClientValide("ACTIF", "PROSPECT")).toBe(false);
  });
  it("BLOQUE → ACTIF (déblocage) ou ARCHIVE", () => {
    expect(transitionStatutClientValide("BLOQUE", "ACTIF")).toBe(true);
    expect(transitionStatutClientValide("BLOQUE", "ARCHIVE")).toBe(true);
  });
  it("ARCHIVE : aucune transition", () => {
    expect(transitionStatutClientValide("ARCHIVE", "ACTIF")).toBe(false);
  });
  it("création → ACTIF par défaut", () => {
    expect(transitionStatutClientValide(null, "ACTIF")).toBe(true);
  });
});

describe("Blocage OR (règle : client BLOQUÉ → pas de nouvel OR)", () => {
  it("ACTIF autorise, BLOQUE/ARCHIVE refusent", () => {
    expect(peutOuvrirOrdre("ACTIF")).toBe(true);
    expect(peutOuvrirOrdre("BLOQUE")).toBe(false);
    expect(peutOuvrirOrdre("ARCHIVE")).toBe(false);
    expect(peutOuvrirOrdre("INACTIF")).toBe(true);
    expect(peutOuvrirOrdre(null)).toBe(true);
  });
});

describe("Transitions statut contrat (specs §5)", () => {
  it("BROUILLON → ACTIF ; résiliation exige un motif", () => {
    expect(transitionStatutContratValide("BROUILLON", "ACTIF").ok).toBe(true);
    expect(transitionStatutContratValide("BROUILLON", "RESILIE", null).ok).toBe(false);
    expect(transitionStatutContratValide("BROUILLON", "RESILIE", "fin de partenariat").ok).toBe(true);
  });
  it("ACTIF → SUSPENDU / RENOUVELLE / RESILIE (motif requis)", () => {
    expect(transitionStatutContratValide("ACTIF", "SUSPENDU").ok).toBe(true);
    expect(transitionStatutContratValide("ACTIF", "RENOUVELLE").ok).toBe(true);
    expect(transitionStatutContratValide("ACTIF", "RESILIE").ok).toBe(false);
    expect(transitionStatutContratValide("ACTIF", "RESILIE", "mécontentement").ok).toBe(true);
    expect(transitionStatutContratValide("ACTIF", "BROUILLON").ok).toBe(false);
  });
  it("SUSPENDU → ACTIF ou RESILIE (motif)", () => {
    expect(transitionStatutContratValide("SUSPENDU", "ACTIF").ok).toBe(true);
    expect(transitionStatutContratValide("SUSPENDU", "RESILIE", "motif").ok).toBe(true);
    expect(transitionStatutContratValide("SUSPENDU", "EXPIRE").ok).toBe(false);
  });
});

describe("Cohérence temporelle des contrats (specs §5)", () => {
  it("ACTIF : début ≤ aujourd'hui et fin nulle ou ≥ aujourd'hui", () => {
    expect(verifierContratActif("2026-01-01", null, "2026-08-24")).toBe(true);
    expect(verifierContratActif("2026-01-01", "2026-12-31", "2026-08-24")).toBe(true);
    expect(verifierContratActif("2026-01-01", "2026-08-01", "2026-08-24")).toBe(false);
    expect(verifierContratActif("2026-09-01", null, "2026-08-24")).toBe(false);
  });

  it("statut effectif : EXPIRE automatique si fin dépassée", () => {
    expect(statutContratEffectif("ACTIF", "2026-01-01", "2026-08-01", "2026-08-24")).toBe("EXPIRE");
    expect(statutContratEffectif("ACTIF", "2026-01-01", "2026-12-31", "2026-08-24")).toBe("ACTIF");
    expect(statutContratEffectif("SUSPENDU", "2026-01-01", "2026-08-01", "2026-08-24")).toBe("SUSPENDU");
  });
});

describe("Solde client (specs : solde = factures non soldées)", () => {
  it("somme des restants", () => {
    expect(calculerSolde([{ montantTotal: 100000, montantPaye: 0 }, { montantTotal: 50000, montantPaye: 50000 }])).toBe(100000);
    expect(calculerSolde([])).toBe(0);
    expect(calculerSolde([{ montantTotal: "25000", montantPaye: "10000" }])).toBe(15000);
  });
});