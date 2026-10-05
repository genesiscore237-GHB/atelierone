import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertEmployeEnAgence } from "./rh-scope";

/** Monde agence simulé : agenceId 1 « possède » les employés 1..3. */
const verifier = (employeId: number, agenceId: number) =>
  Promise.resolve(agenceId === 1 && employeId >= 1 && employeId <= 3);

describe("N01 — assertEmployeEnAgence", () => {
  it("employé de l'agence courante → passe", async () => {
    await expect(assertEmployeEnAgence(2, 1, verifier)).resolves.toBeUndefined();
  });

  it("employé d'une autre agence → 404 (aucune fuite)", async () => {
    await expect(assertEmployeEnAgence(2, 2, verifier)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("employé inexistant → 404", async () => {
    await expect(assertEmployeEnAgence(999, 1, verifier)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lève bien un TRPCError (contrat d'API respecté)", async () => {
    try {
      await assertEmployeEnAgence(4, 1, verifier);
      expect.unreachable("devrait lever");
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      expect((e as TRPCError).code).toBe("NOT_FOUND");
    }
  });
});