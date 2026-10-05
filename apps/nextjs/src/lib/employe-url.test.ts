import { describe, it, expect } from "vitest";
import { parseEmployeId } from "./employe-url";

describe("P04 — parseEmployeId (navigation ?employeId=)", () => {
  it("retourne l'entier pour une valeur valide > 0", () => {
    expect(parseEmployeId("12")).toBe(12);
    expect(parseEmployeId(" 5 ")).toBe(5);
  });

  it("retourne null pour absent / vide", () => {
    expect(parseEmployeId(null)).toBeNull();
    expect(parseEmployeId(undefined)).toBeNull();
    expect(parseEmployeId("")).toBeNull();
  });

  it("retourne null pour valeur non entière, mal formée, nulle ou négative", () => {
    expect(parseEmployeId("0")).toBeNull();
    expect(parseEmployeId("-3")).toBeNull();
    expect(parseEmployeId("12abc")).toBeNull();
    expect(parseEmployeId("abc")).toBeNull();
    expect(parseEmployeId("1.5")).toBeNull();
  });
});