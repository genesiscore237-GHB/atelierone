import { describe, it, expect } from "vitest";
import {
  montantLigne,
  calculerTotalFacture,
  calculerEcheance,
  respectePlafondCredit,
  genererReferenceFacture,
  estComptant,
  classerDette,
} from "./facturation-service";

describe("Facturation du cycle — totaux et échéances", () => {
  it("montant de ligne : totalLigne prioritaire, sinon qte × PU (TVA incluse)", () => {
    expect(montantLigne({ quantite: 2, prixUnitaire: 5000, totalLigne: 11000 })).toBe(11000);
    expect(montantLigne({ quantite: 2, prixUnitaire: 5000 })).toBe(10000);
    expect(montantLigne({ quantite: 2, prixUnitaire: 5000, tva: 10 })).toBe(11000);
  });

  it("total facture : Σ lignes − remise %", () => {
    const lignes = [
      { quantite: 1, prixUnitaire: 100000 },
      { quantite: 2, prixUnitaire: 5000 },
    ];
    expect(calculerTotalFacture(lignes)).toBe(110000);
    expect(calculerTotalFacture(lignes, 10)).toBe(99000);
    expect(calculerTotalFacture([], 0)).toBe(0);
  });

  it("échéance = aujourd'hui + délai", () => {
    expect(calculerEcheance(30, new Date("2026-08-01T10:00:00"))).toBe("2026-08-31");
    expect(calculerEcheance(0, new Date("2026-08-01T10:00:00"))).toBe("2026-08-01");
  });

  it("plafond de crédit : encours + facture ≤ plafond ; plafond 0 = illimité", () => {
    expect(respectePlafondCredit(300000, 200000, 500000)).toBe(true);
    expect(respectePlafondCredit(400000, 200000, 500000)).toBe(false);
    expect(respectePlafondCredit(400000, 200000, 0)).toBe(true);
    expect(respectePlafondCredit(400000, 200000, null)).toBe(true);
  });

  it("référence FAC-2026-00001", () => {
    expect(genererReferenceFacture(1, new Date("2026-01-01"))).toBe("FAC-2026-00001");
    expect(genererReferenceFacture(45, new Date("2026-08-24"))).toBe("FAC-2026-00045");
  });

  it("mode crédit vs comptant", () => {
    expect(estComptant("especes")).toBe(true);
    expect(estComptant("credit")).toBe(false);
  });

  it("classement créances (P0-1) : statistut dérivé des montants et de l'échéance réels", () => {
    const maintenant = new Date("2026-09-15T12:00:00");
    // non payée (100 000 / 0) → UNPAID
    expect(classerDette(100000, 0, new Date("2026-09-30"), maintenant)).toBe("UNPAID");
    // partiellement payée (100 000 / 40 000) → PARTIAL
    expect(classerDette(100000, 40000, new Date("2026-09-30"), maintenant)).toBe("PARTIAL");
    // entièrement payée (100 000 / 100 000), échéance passée → PAID (pas de retard)
    expect(classerDette(100000, 100000, new Date("2026-09-01"), maintenant)).toBe("PAID");
    // échéance dépassée + reste > 0 → OVERDUE
    expect(classerDette(100000, 40000, new Date("2026-09-10"), maintenant)).toBe("OVERDUE");
    // échéance le jour même → pas encore en retard (PARTIAL)
    expect(classerDette(100000, 40000, "2026-09-15", maintenant)).toBe("PARTIAL");
    // aucune échéance → retard impossible
    expect(classerDette(100000, 0, null, maintenant)).toBe("UNPAID");
    // remise 0 n'influence pas le reste dû : 100 000 total, 120 000 payé → PAID
    expect(classerDette(100000, 120000, null, maintenant)).toBe("PAID");
  });
});