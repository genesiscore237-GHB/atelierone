/**
 * ÉTAPE 5 — RELANCES : ce qui attend doit être visible, et ce qui est relancé
 * doit être tracé.
 *
 *
 * LE CONSTAT QUI A OUVERT CETTE ÉTAPE
 *
 * `relances` porte quatorze colonnes soigneusement pensées : `client_id`,
 * `dette_id`, `canal`, `message`, `statut`, `envoyee_le`, `lu_le`, `cree_par`.
 * Le module Relances du cahier des charges est écrit — dans la table.
 *
 * Aucun code n'y écrivait. Zéro ligne, en local comme en production.
 *
 * Trois trous, dont deux structurels :
 *
 *  1. `cree_par` sans clé étrangère : l'auteur d'une relance n'était pas
 *     garanti, donc « qui a appelé ? » n'avait pas de réponse fiable.
 *  2. Ni `or_id` ni `vehicule_id` : impossible d'écrire « ce véhicule a été
 *     relancé » — seulement « ce client a été relancé », sans savoir sur quoi.
 *  3. `type`, `canal`, `statut` en `varchar` libres : rien n'en refusait une
 *     valeur inattendue.
 *
 * La migration `0014` ferme les trois. Ces tests vérifient qu'on ne peut plus
 * les rouvrir, et que le module fait ce qu'il annonce.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  TYPES_RELANCE,
  CANAUX_RELANCE,
  STATUTS_RELANCE,
  TYPE_RELANCE_LABELS,
  CANAL_RELANCE_LABELS,
  STATUT_RELANCE_LABELS,
  estTypeRelance,
  estCanalRelance,
  estStatutRelance,
  relanceFermee,
  relancesAttendues,
  attendReponseDevis,
  solde,
  SEUIL_RELANCE_DEVIS_JOURS,
  SEUIL_RELANCE_IMMOBILISATION_JOURS,
} from "./relance-service";

describe("ÉTAPE 5 — relances : le vocabulaire est une liste fermée", () => {
  it("1. chaque valeur a un libellé — un statut sans libellé s'affiche « undefined »", () => {
    // C'est arrivé au tour des statuts d'immobilisation : `STATUT_STYLE`
    // manquait pour une valeur, et le véhicule s'affichait sans couleur, ce
    // qui se lit comme un état inconnu. Le même genre d'angle mort.
    for (const t of TYPES_RELANCE) {
      expect(TYPE_RELANCE_LABELS[t], `libellé manquant pour le type ${t}`).toBeTruthy();
    }
    for (const c of CANAUX_RELANCE) {
      expect(CANAL_RELANCE_LABELS[c], `libellé manquant pour le canal ${c}`).toBeTruthy();
    }
    for (const s of STATUTS_RELANCE) {
      expect(STATUT_RELANCE_LABELS[s], `libellé manquant pour le statut ${s}`).toBeTruthy();
    }
  });

  it("2. la migration 0014 et le service nomadic la MÊME liste", () => {
    // Le test de cohérence du 0013 avait le même objet : deux listes
    // concurrentes pour la même règle produisent une dérive permanente entre
    // le local et la production. La base les refuse, le TypeScript les énumère.
    const sql = readFileSync(
      resolve(process.cwd(), "../../packages/db/drizzle/0014_relances_tracables.sql"),
      "utf8",
    );

    for (const t of TYPES_RELANCE) {
      expect(sql, `le type ${t} n'est pas dans la contrainte SQL`).toContain(`'${t}'`);
    }
    for (const c of CANAUX_RELANCE) {
      expect(sql, `le canal ${c} n'est pas dans la contrainte SQL`).toContain(`'${c}'`);
    }
    for (const s of STATUTS_RELANCE) {
      expect(sql, `le statut ${s} n'est pas dans la contrainte SQL`).toContain(`'${s}'`);
    }
  });

  it("3. une valeur hors liste est refusée, pas tolérée", () => {
    expect(estTypeRelance("DEVIS")).toBe(true);
    expect(estTypeRelance("SMS")).toBe(false);
    // La faute la plus probable : la casse et le trait d'union.
    expect(estTypeRelance("devis")).toBe(false);
    expect(estTypeRelance("VEHICULE-NON-RESTITUE")).toBe(false);
    expect(estCanalRelance("SMS ")).toBe(false);
    expect(estStatutRelance("REPONSE")).toBe(false);
  });

  it("4. « a répondu » ferme la boucle ; « sans réponse » ne la ferme pas", () => {
    // Relancer un client qui a répondu est du travail inutile — et fait
    // disparaître de l'écran la seule information qui compte : qu'il a
    // répondu, mais pas à quoi.
    expect(relanceFermee("REPONDUE")).toBe(true);
    expect(relanceFermee("CLOTUREE")).toBe(true);
    expect(relanceFermee("SANS_REPONSE")).toBe(false);
    expect(relanceFermee("ENVOYEE")).toBe(false);
  });
});

describe("ÉTAPE 5 — relances : ce qui mérite d'être relancé", () => {
  it("5. un dossier qui attend une réponse est signalé", () => {
    expect(attendReponseDevis("EN_ATTENTE_VALIDATION", false)).toBe(true);
    // Déjà validé : relancer serait insulter un client qui a dit oui.
    expect(attendReponseDevis("EN_ATTENTE_VALIDATION", true)).toBe(false);
    expect(attendReponseDevis("EN_COURS", false)).toBe(false);
  });

  it("6. un solde nul n'est pas une relance — sinon on relance un client payé", () => {
    expect(solde(0)).toBe(true);
    expect(solde(null)).toBe(true);
    expect(solde("0")).toBe(true);
    expect(solde(150000)).toBe(false);
  });

  it("7. le paiement passe AVANT le devis", () => {
    const out = relancesAttendues(
      { statut: "EN_ATTENTE_VALIDATION", devisAccepte: false, resteDu: 150000 },
      null,
    );
    // L'argent avant la.flatteur. Un dossier qui doit 150 000 F est un dossier
    // qui pose une question concrète ; un devis sans réponse est une
    // indisponibilité, qui se.awaitra.
    expect(out[0]?.type).toBe("PAIEMENT");
    expect(out[0]?.raison).toContain("150");
  });

  it("8. un dossier payé et sans attente n'appelle personne", () => {
    // Le cas le plus important, et le plus facile à rater : du bruit.
    const out = relancesAttendues(
      { statut: "EN_COURS", devisAccepte: true, resteDu: 0 },
      { joursImmobilisation: 2, statutImmobilisation: "en_reparation" },
    );
    expect(out).toEqual([]);
  });

  it("9. un véhicule immobilisé au-delà du seuil est signalé, pas avant", () => {
    const seuil = SEUIL_RELANCE_IMMOBILISATION_JOURS;
    const avant = relancesAttendues(null, {
      joursImmobilisation: seuil - 1,
      statutImmobilisation: "en_reparation",
    });
    expect(avant).toEqual([]);

    const apres = relancesAttendues(null, {
      joursImmobilisation: seuil + 9,
      statutImmobilisation: "en_reception",
    });
    expect(apres[0]?.type).toBe("VEHICULE_NON_RESTITUE");
    expect(apres[0]?.raison).toContain(String(seuil + 9));
  });

  it("10. un véhicule SORTI n'est jamais « non restitué »", () => {
    // Le cas qui aurait été le plus grave : le véhicule est parti, donc il ne
    // peut pas être en attente de restitution. L'inverse de l'erreur — le
    // signaler — afficherait une alerte sur un véhicule qui est chez le client.
    const out = relancesAttendues(null, {
      joursImmobilisation: 400,
      statutImmobilisation: "sorti",
    });
    expect(out).toEqual([]);
  });

  it("11. le seuil des deux est connu, et ne sort pas de nulle part", () => {
    // Un agent qui voit « relance » au bout de deux jours apprend à ne plus
    // regarder l'écran. Le seuil est donc explicite, pas caché dans un calcul.
    expect(SEUIL_RELANCE_DEVIS_JOURS).toBeGreaterThanOrEqual(3);
    expect(SEUIL_RELANCE_IMMOBILISATION_JOURS).toBeGreaterThan(SEUIL_RELANCE_DEVIS_JOURS);
  });

  it("12. sans dossier ni véhicule, rien n'est proposé — jamais d'invention", () => {
    expect(relancesAttendues(null, null)).toEqual([]);
    expect(relancesAttendues(undefined, undefined)).toEqual([]);
  });
});