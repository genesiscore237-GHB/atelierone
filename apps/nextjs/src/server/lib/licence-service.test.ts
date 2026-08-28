import { describe, it, expect } from "vitest";
import {
  signerLicence,
  verifierLicence,
  etendrePeriode,
  joursAvantEcheance,
  type LicencePayload,
} from "./licence-service";

const SECRET = "test-secret-simulation";
const base: LicencePayload = {
  siteId: "GPJ-001",
  nomGarage: "Garage Test",
  dateDebut: "2026-08-01",
  dateFin: "2026-08-31",
  graceJours: 7,
  mode: "ABONNEMENT",
  emitLe: "2026-08-01",
};

const j = (fin: string) => signerLicence({ ...base, dateFin: fin }, SECRET);
const auj = () => new Date();

describe("licence-service", () => {
  it("OK quand échéance > 7 jours", () => {
    const fin = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const r = verifierLicence(j(fin), SECRET, auj());
    expect(r.valide).toBe(true);
    expect(r.statut).toBe("OK");
    expect(r.joursRestants).toBeGreaterThan(7);
  });

  it("AVERTISSEMENT dans les 7 derniers jours", () => {
    const fin = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const r = verifierLicence(j(fin), SECRET, auj());
    expect(r.statut).toBe("AVERTISSEMENT");
  });

  it("AVERTISSEMENT le jour de l'échéance (J-0)", () => {
    const fin = new Date().toISOString().slice(0, 10);
    const r = verifierLicence(j(fin), SECRET, auj());
    expect(r.statut).toBe("AVERTISSEMENT");
  });

  it("LECTURE_SEULE après échéance, pendant la grâce", () => {
    const fin = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const r = verifierLicence(j(fin), SECRET, auj());
    expect(r.statut).toBe("LECTURE_SEULE");
    expect(r.joursGrace).toBeGreaterThanOrEqual(0);
  });

  it("BLOQUE après échéance + grâce dépassée", () => {
    const fin = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
    const r = verifierLicence(j(fin), SECRET, auj());
    expect(r.statut).toBe("BLOQUE");
    expect(r.joursGrace).toBeLessThan(0);
  });

  it("jeton falsifié rejeté", () => {
    const jeton = j(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    const [body] = jeton.split(".");
    const faux = `${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    const r = verifierLicence(faux, SECRET, auj());
    expect(r.valide).toBe(false);
    expect(r.statut).toBe("BLOQUE");
  });

  it("jeton signé avec un autre secret rejeté", () => {
    const jeton = j(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    const r = verifierLicence(jeton, "autre-secret", auj());
    expect(r.valide).toBe(false);
    expect(r.statut).toBe("BLOQUE");
  });

  it("etendrePeriode : +1 mois depuis l'échéance si dépassée", () => {
    const p = { ...base, dateFin: "2026-09-15" };
    const r = etendrePeriode(p, 1);
    expect(r.dateFin).toBe("2026-10-15");
    expect(r.mode).toBe("ABONNEMENT");
  });

  it("joursAvantEcheance positif", () => {
    const fin = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    expect(joursAvantEcheance({ ...base, dateFin: fin })).toBe(5);
  });
});