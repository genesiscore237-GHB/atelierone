/**
 * ÉTAPE 7 — La règle de la revue de parc.
 *
 * Ce que ces tests protègent, c'est une phrase qu'on lit en réunion :
 * « ce véhicule ne bouge pas parce que… ».
 *
 * Si elle devient fausse, l'agent prend une décision sur une information
 * fausse. C'est le pire défaut possible dans une réunion d'organisation, et
 * c'est invisible : personne ne voit une ligne de tableau mentir.
 */

import { describe, it, expect } from "vitest";
import {
  blocages,
  compteursParc,
  enRetard,
  joursDeRetard,
  pretARendre,
  SEUIL_IMMOBILISATION_ALERTE_JOURS,
  type ContexteBlocage,
} from "./revue-parc-service";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const aujourdhui = new Date("2026-10-19T08:00:00Z");

describe("revue de parc — ce qui bloque un véhicule", () => {
  it("1. une pièce manquante est NOMMÉE, pas seulement signalée", () => {
    const b = blocages({
      piecesManquantes: [{ libelle: "Disque d'embrayage", motif: "Rupture confirmée" }],
    });
    expect(b).toHaveLength(1);
    // Le statut parking disait « en attente de pièce » : treize lettres qui ne
    // disent rien. La question de la réunion est « laquelle ? ».
    expect(b[0]!.libelle).toContain("Disque d'embrayage");
    expect(b[0]!.code).toBe("piece");
  });

  it("2. un dossier sans pièce demandée n'est PAS annoncé bloqué", () => {
    // Le mensonge inverse : annoncer « en attente de pièces » sur un véhicule
    // dont on n'a pas encore fait le diagnostic serait faux.
    const b = blocages({ or: { statut: "EN_ATTENTE_DIAGNOSTIC" }, piecesManquantes: [] });
    expect(b).toEqual([]);
  });

  it("3. la sous-traitance se lit, prestataire et étape", () => {
    const b = blocages({
      or: {
        sousTraitanceStatut: "EN_ATTENTE_FOURNISSEUR",
        sousTraitanceFournisseur: "GARAGE TRANSMISSIONS",
      },
    });
    expect(b[0]!.code).toBe("sous_traitance");
    expect(b[0]!.libelle).toContain("GARAGE TRANSMISSIONS");
  });

  it("4. la pièce passe AVANT la sous-traitance dans l'ordre de la réunion", () => {
    const b = blocages({
      or: { sousTraitanceStatut: "REPARTI", sousTraitanceFournisseur: "X" },
      piecesManquantes: [{ libelle: "Boîte" }],
    });
    // Le poids porte l'ordre de la réunion. La pièce d'abord : c'est ce que
    // l'agent peut traiter tout de suite.
    expect(b[0]!.code).toBe("piece");
  });

  it("5. le retard se mesure sur la PROMESSE, pas sur une durée fixe", () => {
    // Un moteur immobilisé depuis vingt jours sans promesse n'est pas « en
    // retard » : personne n'avait promis de date. Une durée fixe produirait
    // une alerte que l'agent ne peut pas défendre en réunion.
    expect(enRetard(null)).toBe(false);
    expect(enRetard(iso(new Date("2026-10-25")))).toBe(false);
    expect(enRetard(iso(new Date("2026-10-15")), aujourdhui)).toBe(true);
    expect(joursDeRetard(iso(new Date("2026-10-15")), aujourdhui)).toBe(4);
    expect(joursDeRetard(iso(new Date("2026-10-25")), aujourdhui)).toBe(-6);
  });

  it("6. « ça traîne » ne se signale que s'il n'y a pas de raison plus précise", () => {
    const vide: ContexteBlocage = {
      or: { statut: "EN_COURS" },
      joursImmobilisation: SEUIL_IMMOBILISATION_ALERTE_JOURS + 5,
    };
    const b = blocages(vide);
    expect(b).toHaveLength(1);
    expect(b[0]!.code).toBe("immobilise");

    // Si une raison est déjà nommée, « ça traîne » n'apporte rien : il
    // double le signal au lieu de le préciser.
    const avecRaison: ContexteBlocage = { ...vide, piecesManquantes: [{ libelle: "Pare-brise" }] };
    const b2 = blocages(avecRaison);
    expect(b2.map((x) => x.code)).toEqual(["piece"]);
  });

  it("7. le dossier prêt à rendre est identifié, pas compté comme blocage", () => {
    expect(pretARendre("PRET_A_LIVRER")).toBe(true);
    expect(pretARendre("LIVRE")).toBe(true);
    expect(pretARendre("EN_COURS")).toBe(false);
    // Prêt à rendre n'est pas un blocage : c'est une bonne nouvelle.
    expect(blocages({ or: { statut: "PRET_A_LIVRER" } })).toEqual([]);
  });

  it("8. un contexte vide ne fabrique aucun blocage", () => {
    expect(blocages({})).toEqual([]);
    expect(blocages({ or: null })).toEqual([]);
  });
});

describe("revue de parc — la vue permanente du garage", () => {
  it("9. les compteurs concordent avec le parc donné", () => {
    const c = compteursParc(
      [
        { orStatut: "PRET_A_LIVRER", joursImmobilisation: 3 },
        { orStatut: "EN_COURS", joursImmobilisation: 40 },
        { orStatut: "EN_ATTENTE_PIECES", joursImmobilisation: 12 },
        { orStatut: "EN_ATTENTE_DIAGNOSTIC", sousTraitanceStatut: "REPARTI", datePromesse: "2026-10-01" },
      ],
      aujourdhui,
    );
    expect(c.total).toBe(4);
    expect(c.aRendre).toBe(1);
    expect(c.enReparation).toBe(1);
    expect(c.enAttentePiece).toBe(1);
    expect(c.enDiagnostic).toBe(1);
    expect(c.enSousTraitance).toBe(1);
    expect(c.enRetard).toBe(1);
    expect(c.traines).toBe(1);
    // Le total doit être la somme de ce qu'on voit : un compteur qui ne
    // s'additionne pas est un compteur qu'on ne peut pas discuter.
    expect(c.total).toBe(c.aRendre + c.enReparation + c.enAttentePiece + c.enDiagnostic);
  });

  it("10. un parc vide donne des compteurs à zéro, pas des nulls", () => {
    const c = compteursParc([]);
    expect(c.total).toBe(0);
    expect(c.aRendre).toBe(0);
    expect(c.traines).toBe(0);
  });
});