import { describe, expect, it } from "vitest";
import { debutDeJournee, finDeJournee, borneDebut, borneFin } from "./dates-periode";

/**
 * P3.1 — La période demandée doit être celle obtenue.
 *
 * Le bug : `lte(col, new Date(dateFin))` avec `dateFin = "2026-01-15"`
 * compare à `2026-01-15T00:00:00`. Tout ce qui s'est passé pendant la journée
 * du 15 est exclu. Sur un rapport mensuel, c'est la dernière journée — celle
 * que l'utilisateur vient de saisir pour clôturer — qui disparaît, sans
 * message ni warning.
 */
describe("Bornes de période", () => {
  it("une date de fin inclut toute la journée", () => {
    const fin = finDeJournee("2026-01-15");
    expect(fin.getFullYear()).toBe(2026);
    expect(fin.getMonth()).toBe(0);
    expect(fin.getDate()).toBe(15);
    expect(fin.getHours()).toBe(23);
    expect(fin.getMinutes()).toBe(59);
    expect(fin.getSeconds()).toBe(59);
    expect(fin.getMilliseconds()).toBe(999);
  });

  it("une date isolée commence à minuit", () => {
    const debut = debutDeJournee("2026-01-15");
    expect(debut.getHours()).toBe(0);
    expect(debut.getMinutes()).toBe(0);
    expect(debut.getSeconds()).toBe(0);
    expect(debut.getMilliseconds()).toBe(0);
  });

  it("une ventas enregistrée EN JOUR est bien incluse", () => {
    // Le cas métier : une vente le 15 à 14h, un rapport « jusqu'au 15 ».
    const vente = new Date(2026, 0, 15, 14, 30, 0);
    const borne = finDeJournee("2026-01-15");
    expect(vente.getTime()).toBeLessThanOrEqual(borne.getTime());
  });

  it("une vente du lendemain reste exclue", () => {
    const lendemain = new Date(2026, 0, 16, 0, 30, 0);
    const borne = finDeJournee("2026-01-15");
    expect(lendemain.getTime()).toBeGreaterThan(borne.getTime());
  });

  it("une chaîne qui porte DÉJÀ une heure est respectée", () => {
    const f = finDeJournee("2026-01-15T14:30:00");
    expect(f.getHours()).toBe(14);
    expect(f.getMinutes()).toBe(30);
  });

  it("un Date est renvoyé tel quel", () => {
    const d = new Date(2026, 0, 15, 10, 0, 0);
    expect(finDeJournee(d)).toBe(d);
    expect(debutDeJournee(d)).toBe(d);
  });

  it("les bornes facultatives restent undefined", () => {
    expect(borneFin(undefined)).toBeUndefined();
    expect(borneDebut(undefined)).toBeUndefined();
    expect(borneFin("2026-01-15")).toBeInstanceOf(Date);
    expect(borneDebut("2026-01-15")).toBeInstanceOf(Date);
  });
});