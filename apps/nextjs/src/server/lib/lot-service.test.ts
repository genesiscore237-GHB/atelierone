import { describe, it, expect } from "vitest";
import { statutDlc } from "./lot-service";

describe("DLC / péremption (specs V2 §05 règle 8)", () => {
  const joursDepuis = (n: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return d;
  };

  it("aucune date -> aucune (pas de suivi DLC)", () => {
    expect(statutDlc(null)).toBe("aucune");
    expect(statutDlc(undefined as any)).toBe("aucune");
  });

  it("date passée -> perime", () => {
    expect(statutDlc(joursDepuis(-1))).toBe("perime");
    expect(statutDlc(joursDepuis(-365))).toBe("perime");
  });

  it("date dans les X jours -> proche (par défaut 30)", () => {
    expect(statutDlc(joursDepuis(1))).toBe("proche");
    expect(statutDlc(joursDepuis(29))).toBe("proche");
    expect(statutDlc(joursDepuis(30))).toBe("proche");
  });

  it("date au-delà du seuil -> ok", () => {
    expect(statutDlc(joursDepuis(31))).toBe("ok");
    expect(statutDlc(joursDepuis(120))).toBe("ok");
  });

  it("seuil personnalisé respecté", () => {
    expect(statutDlc(joursDepuis(10), 7)).toBe("ok");
    expect(statutDlc(joursDepuis(7), 7)).toBe("proche");
    expect(statutDlc(joursDepuis(6), 7)).toBe("proche");
  });

  it("chaîne ISO acceptée", () => {
    expect(statutDlc("2020-01-01")).toBe("perime");
    expect(statutDlc("2099-12-31")).toBe("ok");
  });
});