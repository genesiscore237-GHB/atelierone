import { describe, it, expect } from "vitest";
import {
  suggererPriorite,
  joursImmobilisation,
  retardJours,
  calculerAlertes,
  transitionStatutAtelierValide,
  migrerStatutLegacy,
  chargeTechnicien,
  STATUTS_FACTURABLES,
} from "./atelier-service";

describe("Parc V2 — priorités (matrice fichier client)", () => {
  it("P1 : client attend / promesse jour J / sécurité / SLA flotte / comeback / courtoisie", () => {
    expect(suggererPriorite({ clientAttend: true })).toBe("P1");
    expect(suggererPriorite({ promesseJourJ: true })).toBe("P1");
    expect(suggererPriorite({ securite: true })).toBe("P1");
    expect(suggererPriorite({ slaFlotte: true })).toBe("P1");
    expect(suggererPriorite({ comeback: true })).toBe("P1");
    expect(suggererPriorite({ courtoisie: true })).toBe("P1");
  });
  it("P2 : promesse J+1 / client important / pièces dispo / diagnostic terminé", () => {
    expect(suggererPriorite({ promesseJ1: true })).toBe("P2");
    expect(suggererPriorite({ clientImportant: true })).toBe("P2");
    expect(suggererPriorite({ piecesDispo: true })).toBe("P2");
  });
  it("P4 : attente pièces / validation client ; sinon P3 par défaut", () => {
    expect(suggererPriorite({ attentePieces: true })).toBe("P4");
    expect(suggererPriorite({ attenteValidation: true })).toBe("P4");
    expect(suggererPriorite({})).toBe("P3");
  });
});

describe("Parc V2 — jours d'immobilisation et retard", () => {
  it("jours = aujourd'hui − date d'entrée", () => {
    expect(joursImmobilisation("2026-08-20", "2026-08-24")).toBe(4);
    expect(joursImmobilisation("2026-08-24", "2026-08-24")).toBe(0);
    expect(joursImmobilisation("2026-08-26", "2026-08-24")).toBe(0);
  });
  it("retard = max(0, aujourd'hui − promesse)", () => {
    expect(retardJours("2026-08-21", "2026-08-24")).toBe(3);
    expect(retardJours("2026-08-26", "2026-08-24")).toBe(0);
    expect(retardJours(null, "2026-08-24")).toBe(0);
  });
});

describe("Parc V2 — alertes automatiques (seuils paramétrables)", () => {
  const base = { statut: "EN_COURS", priorite: "P3", dateEntree: "2026-08-20", datePromesse: "2026-08-30" };

  it("OK : rien d'alarmant", () => {
    const r = calculerAlertes({ ...base, aujourdhui: "2026-08-24" });
    expect(r.principale).toBe("OK");
  });
  it("RETARD : promesse dépassée (priorité d'affichage n°1)", () => {
    const r = calculerAlertes({ ...base, datePromesse: "2026-08-21", priorite: "P1", statut: "BLOQUE", aujourdhui: "2026-08-24" });
    expect(r.alertes).toContain("RETARD");
    expect(r.principale).toBe("RETARD");
  });
  it("BLOQUE : statut bloqué", () => {
    const r = calculerAlertes({ ...base, statut: "BLOQUE", aujourdhui: "2026-08-24" });
    expect(r.alertes).toContain("BLOQUE");
    expect(r.principale).toBe("BLOQUE");
  });
  it("P1 : priorité critique encore ouverte", () => {
    const r = calculerAlertes({ ...base, priorite: "P1", aujourdhui: "2026-08-24" });
    expect(r.alertes).toContain("P1");
  });
  it("PROCHE : promesse dans ≤ seuil (défaut 1 j)", () => {
    const r = calculerAlertes({ ...base, datePromesse: "2026-08-25", aujourdhui: "2026-08-24" });
    expect(r.alertes).toContain("PROCHE");
  });
  it("LONG : immobilisation ≥ seuil (défaut 5 j)", () => {
    const r = calculerAlertes({ ...base, dateEntree: "2026-08-15", aujourdhui: "2026-08-24" });
    expect(r.alertes).toContain("LONG");
  });
  it("véhicule livré/annulé : plus d'alerte", () => {
    expect(calculerAlertes({ ...base, statut: "LIVRE", datePromesse: "2026-08-20", aujourdhui: "2026-08-24" }).principale).toBe("OK");
    expect(calculerAlertes({ ...base, statut: "ANNULE", priorite: "P1", aujourdhui: "2026-08-24" }).principale).toBe("OK");
  });
});

describe("Parc V2 — transitions de statut (règles strictes)", () => {
  it("cycle nominal : diagnostic → cours → qualité → prêt → livré", () => {
    expect(transitionStatutAtelierValide("EN_ATTENTE_DIAGNOSTIC", "EN_COURS").ok).toBe(true);
    expect(transitionStatutAtelierValide("EN_COURS", "CONTROLE_QUALITE").ok).toBe(true);
    expect(transitionStatutAtelierValide("CONTROLE_QUALITE", "PRET_A_LIVRER").ok).toBe(true);
    expect(transitionStatutAtelierValide("PRET_A_LIVRER", "LIVRE").ok).toBe(true);
  });
  it("BLOQUÉ exige une raison ; ANNULE exige un motif", () => {
    expect(transitionStatutAtelierValide("EN_COURS", "BLOQUE").ok).toBe(false);
    expect(transitionStatutAtelierValide("EN_COURS", "BLOQUE", "Pièces manquantes").ok).toBe(true);
    expect(transitionStatutAtelierValide("EN_COURS", "ANNULE").ok).toBe(false);
    expect(transitionStatutAtelierValide("EN_COURS", "ANNULE", "Client annule").ok).toBe(true);
  });
  it("déblocage : BLOQUE → EN_COURS", () => {
    expect(transitionStatutAtelierValide("BLOQUE", "EN_COURS").ok).toBe(true);
  });
  it("LIVRE et ANNULE sont terminaux", () => {
    expect(transitionStatutAtelierValide("LIVRE", "EN_COURS").ok).toBe(false);
    expect(transitionStatutAtelierValide("ANNULE", "LIVRE").ok).toBe(false);
  });
  it("transitions illégales refusées", () => {
    expect(transitionStatutAtelierValide("EN_ATTENTE_DIAGNOSTIC", "LIVRE").ok).toBe(false);
    expect(transitionStatutAtelierValide("PRET_A_LIVRER", "EN_ATTENTE_DIAGNOSTIC").ok).toBe(false);
  });
});

describe("Parc V2 — divers", () => {
  it("migration des statuts legacy", () => {
    expect(migrerStatutLegacy("ouvert")).toBe("EN_ATTENTE_DIAGNOSTIC");
    expect(migrerStatutLegacy("termine")).toBe("PRET_A_LIVRER");
    expect(migrerStatutLegacy("facture")).toBe("LIVRE");
    expect(migrerStatutLegacy("annule")).toBe("ANNULE");
    expect(migrerStatutLegacy(null)).toBe("EN_ATTENTE_DIAGNOSTIC");
  });
  it("statuts facturables : prêt à livrer / livré / contrôle qualité", () => {
    expect(STATUTS_FACTURABLES).toContain("PRET_A_LIVRER");
    expect(STATUTS_FACTURABLES).toContain("LIVRE");
  });
  it("charge technicien : règle 80 %", () => {
    expect(chargeTechnicien(4, 5)).toEqual({ actifs: 4, capacite: 5, pourcent: 80, depassement80: false });
    expect(chargeTechnicien(5, 5).depassement80).toBe(true);
    expect(chargeTechnicien(1, 5).pourcent).toBe(20);
  });
});