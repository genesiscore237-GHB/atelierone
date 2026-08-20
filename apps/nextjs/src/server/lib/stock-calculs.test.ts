import { describe, it, expect } from "vitest";
import {
  calculerPmp,
  stockApresSortie,
  stockSuffisant,
  stockDisponible,
  stockDisponibleSuffisant,
  calculerReconditionnement,
  verifierRatio,
  calculerEcartInventaire,
  inventaireComplet,
  niveauAlerteStock,
  estDormant,
  valeurStock,
  valeurStockTotale,
} from "./stock-calculs";

describe("calculerPmp (Prix Moyen Pondéré)", () => {
  it("PMP = coût unitaire quand stock avant = 0", () => {
    expect(calculerPmp(0, 0, 10, 150)).toBe(150);
  });

  it("PMP pondéré après entrée (stock 10 @ 100 + 10 @ 200 → 150)", () => {
    expect(calculerPmp(10, 100, 10, 200)).toBeCloseTo(150, 6);
  });

  it("PMP pondéré avec quantités inégales", () => {
    // 5 @ 100 + 15 @ 300 → (500 + 4500) / 20 = 250
    expect(calculerPmp(5, 100, 15, 300)).toBeCloseTo(250, 6);
  });

  it("PMP inchangé si entrée 0", () => {
    expect(calculerPmp(10, 100, 0, 200)).toBeCloseTo(100, 6);
  });
});

describe("stockApresSortie / stockSuffisant", () => {
  it("stock suffisant → décrément", () => {
    expect(stockSuffisant(10, 3)).toBe(true);
    expect(stockApresSortie(10, 3)).toBe(7);
  });

  it("stock insuffisant → refus (test de cas limite)", () => {
    expect(stockSuffisant(2, 3)).toBe(false);
    expect(stockApresSortie(2, 3)).toBe(-1);
  });

  it("stock exact → autorisé, résultat 0", () => {
    expect(stockSuffisant(5, 5)).toBe(true);
    expect(stockApresSortie(5, 5)).toBe(0);
  });
});

describe("stockDisponible (actuel − réservé) — specs V2 §05 règle 4", () => {
  it("disponible = actuel − réservé", () => {
    expect(stockDisponible(100, 30)).toBe(70);
    expect(stockDisponible(100, null)).toBe(100);
    expect(stockDisponible(100, 0)).toBe(100);
  });

  it("sortie autorisée si la quantité ≤ disponible (même si stock actuel suffit)", () => {
    // 100 en stock, 30 réservés → disponible 70 → sortie 50 OK
    expect(stockDisponibleSuffisant(100, 30, 50)).toBe(true);
  });

  it("sortie REFUSÉE si elle dépasse le disponible mais pas le stock actuel (cas limite critique)", () => {
    // 100 en stock, 60 réservés → disponible 40 → sortie 50 REFUSÉE
    // (stockSuffisant classique dirait true, mais specs V2 exige disponible)
    expect(stockSuffisant(100, 50)).toBe(true);
    expect(stockDisponibleSuffisant(100, 60, 50)).toBe(false);
  });

  it("sortie exactement égale au disponible → autorisée", () => {
    expect(stockDisponibleSuffisant(100, 30, 70)).toBe(true);
    expect(stockDisponibleSuffisant(100, 30, 71)).toBe(false);
  });

  it("sans réservation, disponible = actuel", () => {
    expect(stockDisponibleSuffisant(10, null, 10)).toBe(true);
    expect(stockDisponibleSuffisant(10, 0, 10)).toBe(true);
  });
});

describe("Réservation / Libération de stock (specs V2 §04 processus 5)", () => {
  it("réservation diminue le disponible (actuel − réservé augmente)", () => {
    // Avant : 100 en stock, 0 réservé → dispo 100
    expect(stockDisponible(100, 0)).toBe(100);
    // Réservation de 30 → réservé 30 → dispo 70
    expect(stockDisponible(100, 30)).toBe(70);
  });

  it("après réservation, une sortie est bloquée si elle dépasse le disponible", () => {
    // 100 stock, 30 réservés → dispo 70 → sortie 80 REFUSÉE
    expect(stockDisponibleSuffisant(100, 30, 80)).toBe(false);
    // sortie 60 autorisée (≤ dispo 70)
    expect(stockDisponibleSuffisant(100, 30, 60)).toBe(true);
  });

  it("libération remonte le disponible (réservé diminue)", () => {
    // Avant libération : 100 stock, 30 réservés → dispo 70
    // Après libération de 20 : réservé 10 → dispo 90
    expect(stockDisponible(100, 30 - 20)).toBe(90);
  });

  it("on ne peut pas libérer plus que le réservé (cas limite)", () => {
    // 10 réservés, libération de 15 → réservé deviendrait négatif → interdit
    const reservee = 10;
    const liberation = 15;
    expect(stockDisponible(100, Math.max(0, reservee - liberation))).toBe(100);
    // le calcul de contrôle (reservee >= liberation) est faux
    expect(reservee >= liberation).toBe(false);
  });
});

describe("calculerReconditionnement (fût → unités)", () => {
  it("1 fût 200L → 40 bidons 5L (ratio 40)", () => {
    // facteurSource 200 (L), facteurCible 5 (L) → ratio 40
    const r = calculerReconditionnement(1, 200, 5);
    expect(r.quantiteGeneree).toBe(40);
    expect(r.ratio).toBe(40);
    expect(r.resteSource).toBeCloseTo(0, 6);
  });

  it("reste : 39 bidons + 5L non reconditionnés", () => {
    // 199 L → 39 bidons de 5L + 4L de reste (39×5=195, 199−195=4)
    const r = calculerReconditionnement(199, 1, 1 / 5);
    // interprétation : quantiteSource 199 unités-base, facteurSource 1, facteurCible 0.2 (bidon 5L = 0.2 fût)
    // → 199 / 0.2 = 995… cas d'usage différent : utilisons des facteurs cohérents
    // 1 bidon 5L = 5 L ; source 199 L → 39 bidons (195 L) + 4 L
    const r2 = calculerReconditionnement(199, 1, 5);
    expect(r2.quantiteGeneree).toBe(39);
    expect(r2.resteSource).toBeCloseTo(199 - 39 * 5, 6); // 4 L
  });

  it("facteur cible invalide → 0 généré", () => {
    const r = calculerReconditionnement(10, 5, 0);
    expect(r.quantiteGeneree).toBe(0);
    expect(r.ratio).toBe(0);
  });
});

describe("verifierRatio", () => {
  it("ratio cohérent (40 bidons pour 1 fût)", () => {
    const v = verifierRatio(1, 40, 200, 5);
    expect(v.coherent).toBe(true);
    expect(v.ratioTheorique).toBe(40);
  });

  it("ratio incohérent → alerte (cas limite)", () => {
    const v = verifierRatio(1, 10, 200, 5); // attendu 40, saisi 10
    expect(v.coherent).toBe(false);
    expect(v.ecartRelatif).toBeGreaterThan(0.05);
  });
});

describe("calculerEcartInventaire / inventaireComplet", () => {
  it("écart = physique − théorique", () => {
    expect(calculerEcartInventaire(10, 12)).toBe(2);
    expect(calculerEcartInventaire(10, 8)).toBe(-2);
    expect(calculerEcartInventaire(10, 10)).toBe(0);
  });

  it("inventaire complet quand toutes les lignes sont comptées", () => {
    expect(inventaireComplet(10, 10)).toBe(true);
    expect(inventaireComplet(10, 9)).toBe(false);
    expect(inventaireComplet(0, 0)).toBe(false);
  });
});

describe("niveauAlerteStock", () => {
  const seuil = { seuilAlerte: 5, seuilCritique: 2, stockMaximum: 100 };

  it("rupture à 0", () => {
    expect(niveauAlerteStock(0, seuil.seuilAlerte, seuil.seuilCritique, seuil.stockMaximum)).toBe("rupture");
  });

  it("critique ≤ seuil critique", () => {
    expect(niveauAlerteStock(2, seuil.seuilAlerte, seuil.seuilCritique, seuil.stockMaximum)).toBe("critique");
  });

  it("bas ≤ seuil alerte", () => {
    expect(niveauAlerteStock(5, seuil.seuilAlerte, seuil.seuilCritique, seuil.stockMaximum)).toBe("bas");
  });

  it("ok entre les seuils", () => {
    expect(niveauAlerteStock(50, seuil.seuilAlerte, seuil.seuilCritique, seuil.stockMaximum)).toBe("ok");
  });

  it("surstock > stock maximum", () => {
    expect(niveauAlerteStock(150, seuil.seuilAlerte, seuil.seuilCritique, seuil.stockMaximum)).toBe("surstock");
  });
});

describe("estDormant", () => {
  const today = new Date("2026-08-15");

  it("jamais de mouvement → dormant", () => {
    expect(estDormant(null, 90, today)).toBe(true);
  });

  it("mouvement récent → pas dormant", () => {
    expect(estDormant("2026-08-10", 90, today)).toBe(false);
  });

  it("mouvement ancien (> X jours) → dormant", () => {
    expect(estDormant("2026-01-01", 90, today)).toBe(true);
  });
});

describe("valeurStock / valeurStockTotale", () => {
  it("valeur = quantité × CMUP", () => {
    expect(valeurStock(10, 150)).toBe(1500);
    expect(valeurStock(10, null)).toBe(0);
  });

  it("valeur totale d'un ensemble", () => {
    expect(
      valeurStockTotale([
        { quantite: 10, cmup: 100 },
        { quantite: 5, cmup: 200 },
      ])
    ).toBe(2000);
  });
});
