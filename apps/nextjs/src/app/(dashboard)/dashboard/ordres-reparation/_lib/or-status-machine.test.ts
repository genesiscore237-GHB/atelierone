import { describe, expect, it } from "vitest";
import {
  OR_TABS,
  orCurrentStep,
  orNextAction,
  orRoleDefaultTab,
  orStepStates,
  orTabsForRole,
} from "./or-status-machine";

describe("orCurrentStep — états terminaux", () => {
  it("BLOQUE reprend l'étape du statut précédent, pas Pièces par défaut", () => {
    expect(
      orCurrentStep({
        statut: "BLOQUE",
        historique: [
          {
            type: "STATUT",
            ancienneValeur: "EN_ATTENTE_VALIDATION",
            nouvelleValeur: "BLOQUE",
          },
        ],
      }),
    ).toBe("devis");
  });

  it("ANNULE reprend l'étape du statut précédent", () => {
    expect(
      orCurrentStep({
        statut: "ANNULE",
        historique: [
          { type: "STATUT", ancienneValeur: "EN_COURS", nouvelleValeur: "ANNULE" },
        ],
      }),
    ).toBe("travaux");
  });

  it("ferme_definitif reste sur Facture / Restitution", () => {
    expect(orCurrentStep({ statut: "ferme_definitif" })).toBe("facture-restitution");
  });
});

describe("orStepStates — calcul sur les données réelles", () => {
  it("marque l'étape réellement bloquée, pas Pièces par défaut", () => {
    const states = orStepStates({
      statut: "BLOQUE",
      raisonBlocage: "Attente de validation du devis client",
      historique: [
        {
          type: "STATUT",
          ancienneValeur: "EN_ATTENTE_VALIDATION",
          nouvelleValeur: "BLOQUE",
        },
      ],
    });
    expect(states.devis.state).toBe("blocked");
    expect(states.pieces.state).not.toBe("blocked");
  });

  it("ne marque pas toutes les étapes terminées pour un OR annulé", () => {
    const states = orStepStates({
      statut: "ANNULE",
      historique: [
        { type: "STATUT", ancienneValeur: "EN_COURS", nouvelleValeur: "ANNULE" },
      ],
    });

    expect(states.travaux.state).toBe("blocked");
    expect(Object.values(states).filter((s) => s.state === "done").length).toBeLessThan(7);
  });

  it("marque le diagnostic terminé seulement avec un rapport validé", () => {
    const states = orStepStates({
      statut: "EN_ATTENTE_DIAGNOSTIC",
      rapportDiagnostic: { statut: "VALIDE" },
    });
    expect(states.diagnostic.state).toBe("done");

    const sansRapport = orStepStates({ statut: "EN_ATTENTE_DIAGNOSTIC" });
    expect(sansRapport.diagnostic.state).toBe("todo");
  });

  it("ne déclare pas le devis terminé quand l'OR attend une validation sans devis", () => {
    const states = orStepStates({ statut: "EN_ATTENTE_VALIDATION" });
    expect(states.devis.state).toBe("in_progress");
  });

  it("rend Pièces non applicable quand l'OR ne contient aucune pièce", () => {
    const states = orStepStates({
      statut: "EN_ATTENTE_DIAGNOSTIC",
      lignes: [{ type: "SERVICE", statutAutorisation: "PROPOSE" }],
    });
    expect(states.pieces.state).toBe("not_applicable");
  });

  it("bloque la qualité quand le dernier contrôle est rejeté", () => {
    const states = orStepStates({
      statut: "CONTROLE_QUALITE",
      controlesQualite: [{ resultat: "REJETE", observations: "Fuite persistante" }],
    });
    expect(states.qualite.state).toBe("blocked");
    expect(states.qualite.detail).toContain("Fuite");
  });

  it("ne marque pas les étapes antérieures terminées pour un dossier fermé sans traces", () => {
    const states = orStepStates({ statut: "ferme_definitif" });
    expect(states["facture-restitution"].state).toBe("done");
    expect(states.diagnostic.state).not.toBe("done");
  });

  it("termine Facture / Restitution quand l'OR est facturé et restitué", () => {
    const states = orStepStates({
      statut: "LIVRE",
      venteId: 42,
      restitutions: [{ dateRestitution: new Date() }],
    });
    expect(states["facture-restitution"].state).toBe("done");
  });

  it("ne déclare pas les travaux terminés si une ligne autorisée reste à faire", () => {
    const states = orStepStates({
      statut: "EN_COURS",
      lignes: [
        { type: "SERVICE", statut: "fait", statutAutorisation: "AUTORISE" },
        { type: "SERVICE", statut: "a_faire", statutAutorisation: "AUTORISE" },
      ],
    });
    expect(states.travaux.state).toBe("in_progress");
    expect(states.travaux.detail).toContain("1/2");
  });
});

describe("orNextAction — action cliquable", () => {
  it("pointe vers Travaux quand l'OR est en cours", () => {
    const action = orNextAction({ statut: "EN_COURS" });
    expect(action?.tab).toBe("travaux");
    expect(action?.cta).toBeTruthy();
  });

  it("ne propose aucune progression pour un OR annulé", () => {
    expect(orNextAction({ statut: "ANNULE" })).toBeNull();
  });

  it("propose la clôture quand le véhicule est livré", () => {
    expect(orNextAction({ statut: "LIVRE" })?.tab).toBe("facture-restitution");
  });

  it("ne confond pas la date de restitution avec la fermeture définitive", () => {
    const action = orNextAction({ statut: "LIVRE", dateCloture: new Date() });
    expect(action?.cta).toBe("Clôturer le dossier");
  });

  it("ne propose plus d'action quand le dossier est fermé définitivement", () => {
    expect(
      orNextAction({
        statut: "LIVRE",
        dateCloture: new Date(),
        dateFermeture: new Date(),
      }),
    ).toBeNull();
  });
});

describe("orTabsForRole — focus par rôle", () => {
  const allTabs = OR_TABS.map((t) => t.id);

  it("limite le technicien à son travail", () => {
    expect(orTabsForRole("technicien", allTabs)).toEqual([
      "diagnostic",
      "pieces",
      "travaux",
    ]);
  });

  it("limite le magasinier aux pièces", () => {
    expect(orTabsForRole("magasinier", allTabs)).toEqual(["pieces"]);
  });

  it("laisse le chef d'atelier voir tout le dossier", () => {
    expect(orTabsForRole("chef_atelier", allTabs)).toEqual(allTabs);
  });

  it("fait atterrir un technicien sur Travaux quand l'OR est prêt à livrer", () => {
    const tabs = orTabsForRole("technicien", allTabs);
    expect(orRoleDefaultTab("facture-restitution", tabs)).toBe("travaux");
  });

  it("fait atterrir un magasinier sur Pièces même si l'OR est au diagnostic", () => {
    const tabs = orTabsForRole("magasinier", allTabs);
    expect(orRoleDefaultTab("diagnostic", tabs)).toBe("pieces");
  });
});
