import { describe, expect, it } from "vitest";
import {
  graviteAtelier,
  graviteParking,
  graviteStock,
  graviteSysteme,
  trierAlertes,
} from "./alertes-centrales";

describe("centre d'alertes — une seule échelle de gravité", () => {
  it("atelier : un retard ou un blocage est critique, avant même la priorité P1", () => {
    expect(graviteAtelier(["P1", "RETARD"])).toBe("CRITIQUE");
    expect(graviteAtelier(["BLOQUE"])).toBe("CRITIQUE");
    expect(graviteAtelier(["P1", "LONG"])).toBe("HAUTE");
    expect(graviteAtelier(["LONG"])).toBe("MOYENNE");
    expect(graviteAtelier(["PROCHE"])).toBe("BASSE");
    expect(graviteAtelier([])).toBe("MOYENNE");
  });

  it("parking : CRITIQUE/HAUTE/MOYENNE/BASSE et les anciens INFO/WARNING", () => {
    expect(graviteParking("CRITIQUE")).toBe("CRITIQUE");
    expect(graviteParking("HAUTE")).toBe("HAUTE");
    expect(graviteParking("MOYENNE")).toBe("MOYENNE");
    expect(graviteParking("WARNING")).toBe("MOYENNE");
    expect(graviteParking("BASSE")).toBe("BASSE");
    expect(graviteParking("INFO")).toBe("BASSE");
  });

  it("stock : rupture > critique > faible", () => {
    expect(graviteStock("rupture")).toBe("CRITIQUE");
    expect(graviteStock("critique")).toBe("HAUTE");
    expect(graviteStock("faible")).toBe("MOYENNE");
  });

  it("système : accepte les deux vocabulaires, français et anglais", () => {
    expect(graviteSysteme("CRITICAL")).toBe("CRITIQUE");
    expect(graviteSysteme("CRITIQUE")).toBe("CRITIQUE");
    expect(graviteSysteme("HIGH")).toBe("HAUTE");
    expect(graviteSysteme("LOW")).toBe("BASSE");
    expect(graviteSysteme(undefined)).toBe("MOYENNE");
  });

  it("trie par gravité puis par date décroissante — jamais par ordre de source", () => {
    const triees = trierAlertes([
      { id: "basse", gravite: "BASSE" as const, date: "2026-10-20T10:00:00Z" },
      { id: "haute-ancienne", gravite: "HAUTE" as const, date: "2026-10-01T10:00:00Z" },
      { id: "critique", gravite: "CRITIQUE" as const, date: null },
      { id: "haute-recente", gravite: "HAUTE" as const, date: "2026-10-19T10:00:00Z" },
    ]);

    expect(triees.map((a) => a.id)).toEqual([
      "critique",
      "haute-recente",
      "haute-ancienne",
      "basse",
    ]);
  });

  it("une date absente ou invalide ne fait pas remonter l'alerte", () => {
    const triees = trierAlertes([
      { id: "sans-date", gravite: "MOYENNE" as const, date: null },
      { id: "date", gravite: "MOYENNE" as const, date: "2026-10-19T10:00:00Z" },
      { id: "invalide", gravite: "MOYENNE" as const, date: "pas-une-date" },
    ]);

    expect(triees.map((a) => a.id)).toEqual(["date", "sans-date", "invalide"]);
  });
});
