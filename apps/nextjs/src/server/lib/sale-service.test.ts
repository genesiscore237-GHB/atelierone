import { describe, it, expect, vi } from "vitest";
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("@atelierone/db", () => ({}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));
vi.mock("@trpc/server", () => ({ TRPCError: class TRPCError extends Error { constructor(opts: any) { super(opts.message); this.code = opts.code; } code: string } }));
vi.mock("./compta-service", () => ({ ComptaService: { genererEcritureVente: vi.fn() } }));

import { computeDiscountPercent, MAX_DISCOUNT_BY_ROLE } from "./sale-service";

describe("computeDiscountPercent", () => {
  it("returns 0 when subtotal is 0", () => {
    expect(computeDiscountPercent(100, [])).toBe(0);
  });

  it("returns 0 when remise is 0", () => {
    const lignes = [{ produitId: 1, quantite: 2, prixUnitaire: 100 }];
    expect(computeDiscountPercent(0, lignes)).toBe(0);
  });

  it("computes correct percentage for simple case", () => {
    const lignes = [{ produitId: 1, quantite: 1, prixUnitaire: 100 }];
    expect(computeDiscountPercent(10, lignes)).toBe(9); // 10/(100+10)*100 ≈ 9.09 → 9
  });

  it("computes correct percentage for 50% discount", () => {
    const lignes = [{ produitId: 1, quantite: 2, prixUnitaire: 50 }];
    expect(computeDiscountPercent(100, lignes)).toBe(50); // 100/(100+100)*100 = 50
  });

  it("handles multiple lines", () => {
    const lignes = [
      { produitId: 1, quantite: 3, prixUnitaire: 100 },
      { produitId: 2, quantite: 1, prixUnitaire: 50 },
    ];
    expect(computeDiscountPercent(50, lignes)).toBe(13); // 50/(350+50)*100 ≈ 12.5 → 13
  });
});

describe("MAX_DISCOUNT_BY_ROLE", () => {
  it("allows operateur_pos up to 15% discount", () => {
    expect(MAX_DISCOUNT_BY_ROLE.operateur_pos).toBe(15);
  });

  it("allows caissier up to 5% discount", () => {
    expect(MAX_DISCOUNT_BY_ROLE.caissier).toBe(5);
  });

  it("allows admin_reseau up to 100%", () => {
    expect(MAX_DISCOUNT_BY_ROLE.admin_reseau).toBe(100);
  });

  it("allows responsable_agence up to 100%", () => {
    expect(MAX_DISCOUNT_BY_ROLE.responsable_agence).toBe(100);
  });

  it("allows magasinier 0% discount", () => {
    expect(MAX_DISCOUNT_BY_ROLE.magasinier).toBe(0);
  });

  it("allows rh 0% discount", () => {
    expect(MAX_DISCOUNT_BY_ROLE.rh).toBe(0);
  });

  it("allows comptable 0% discount", () => {
    expect(MAX_DISCOUNT_BY_ROLE.comptable).toBe(0);
  });
});
