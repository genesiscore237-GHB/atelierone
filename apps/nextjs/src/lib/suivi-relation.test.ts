import { describe, expect, it } from "vitest";
import { analyserSuiviRelation, formatDelaiHeures } from "./suivi-relation";

const ouverture = new Date("2026-10-01T08:00:00Z");

describe("suivi relation client", () => {
  it("calcule le délai de la PREMIÈRE réponse, pas de la dernière", () => {
    const r = analyserSuiviRelation(ouverture, [
      { type: "REPONSE_CLIENT", nouvelleValeur: "APPEL", changeLe: "2026-10-01T10:30:00Z" },
      { type: "REPONSE_CLIENT", nouvelleValeur: "SMS", changeLe: "2026-10-03T09:00:00Z" },
    ]);
    expect(r.reponse?.canal).toBe("APPEL");
    expect(r.reponse?.delaiHeures).toBe(2.5);
    expect(r.reponse?.canalLabel).toBe("Appel téléphonique");
  });

  it("suit un cycle de réclamation jusqu'à sa résolution", () => {
    const r = analyserSuiviRelation(ouverture, [
      { type: "RECLAMATION", nouvelleValeur: "OUVERTE", commentaire: "Pièce encore bruyante", changeLe: "2026-10-04T09:00:00Z" },
      { type: "RECLAMATION", nouvelleValeur: "EN_COURS", changeLe: "2026-10-05T09:00:00Z" },
      { type: "RECLAMATION", nouvelleValeur: "RESOLUE", commentaire: "Reprise du serrage", changeLe: "2026-10-06T15:00:00Z" },
    ]);
    expect(r.reclamation).toEqual({
      statut: "RESOLUE",
      ouverteLe: "2026-10-04T09:00:00.000Z",
      motif: "Pièce encore bruyante",
      resolueLe: "2026-10-06T15:00:00.000Z",
      resolution: "Reprise du serrage",
    });
  });

  it("affiche le DERNIER cycle quand une réclamation rouvre après résolution", () => {
    const r = analyserSuiviRelation(ouverture, [
      { type: "RECLAMATION", nouvelleValeur: "OUVERTE", commentaire: "Ancienne", changeLe: "2026-10-02T09:00:00Z" },
      { type: "RECLAMATION", nouvelleValeur: "RESOLUE", commentaire: "Ancienne résolution", changeLe: "2026-10-03T09:00:00Z" },
      { type: "RECLAMATION", nouvelleValeur: "OUVERTE", commentaire: "Nouvelle", changeLe: "2026-10-10T09:00:00Z" },
    ]);
    expect(r.reclamation?.statut).toBe("OUVERTE");
    expect(r.reclamation?.motif).toBe("Nouvelle");
    expect(r.reclamation?.resolution).toBeNull();
  });

  it("ne fabrique rien sans événement", () => {
    expect(analyserSuiviRelation(ouverture, [])).toEqual({ reponse: null, reclamation: null });
    expect(analyserSuiviRelation(null, [])).toEqual({ reponse: null, reclamation: null });
  });

  it("formate les durées sans seuil métier inventé", () => {
    expect(formatDelaiHeures(0.5)).toBe("30 min");
    expect(formatDelaiHeures(2.5)).toBe("2,5 h");
    expect(formatDelaiHeures(25.5)).toBe("1 j 2 h");
    expect(formatDelaiHeures(null)).toBe("—");
  });
});
