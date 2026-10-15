/**
 * LOT U4 (E10) â€” Validation de la rÃ©ception.
 *
 * Tests unitaires des rÃ¨gles pures (`~/lib/validation-reception`). Ils ne
 * couvrent pas l'affichage mais ce qui compte : que TOUS les champs marquÃ©s
 * d'un astÃ©risque dans l'interface soient rÃ©ellement contrÃ´lÃ©s, et que les
 * rÃ¨gles ne soient pas trop strictes sur des saisies lÃ©gitimes.
 */

import { describe, expect, it } from "vitest";
import {
  validerReception,
  messageResume,
  emailValide,
  telephoneSaisissable,
  immatriculationValide,
  type DonneesReception,
} from "~/lib/validation-reception";

const complet = (): DonneesReception => ({
  vehicule: { immatriculation: "AB-123-CD", marque: "Peugeot", typeVehicule: "voiture" },
  client: { nom: "Dupont", telephone: "06 12 34 56 78" },
  reception: {
    kilometrageEntree: 120000,
    pannesDeclarees: "Voyant moteur",
    signatureDeposant: "A. Dupont",
  },
});

describe("LOT U4 â€” validation de la rÃ©ception (E10)", () => {
  it("1. un formulaire complet n'a aucune erreur", () => {
    expect(validerReception(complet())).toEqual({});
  });

  it("2. P2-4 â€” chaque champ marquÃ© d'un astÃ©risque est RÃ‰ELLEMENT contrÃ´lÃ©", () => {
    // Les champs exigÃ©s par l'interface. Avant ce lot, Â« marque Â», Â« type Â»
    // et Â« tÃ©lÃ©phone Â» ne l'Ã©taient pas.
    const champsExiges: [string, () => DonneesReception][] = [
      ["immatriculation", () => ({ ...complet(), vehicule: { marque: "X", typeVehicule: "voiture" } })],
      ["marque", () => ({ ...complet(), vehicule: { immatriculation: "AB-123-CD", typeVehicule: "voiture" } })],
      ["typeVehicule", () => ({ ...complet(), vehicule: { immatriculation: "AB-123-CD", marque: "X" } })],
      ["clientTelephone", () => ({ ...complet(), client: { nom: "Dupont" } })],
      [
        "kilometrageEntree",
        () => ({ ...complet(), reception: { pannesDeclarees: "X", signatureDeposant: "A" } }),
      ],
      ["pannesDeclarees", () => ({ ...complet(), reception: { kilometrageEntree: 1, signatureDeposant: "A" } })],
      ["signature", () => ({ ...complet(), reception: { kilometrageEntree: 1, pannesDeclarees: "X" } })],
    ];
    for (const [champ, build] of champsExiges) {
      const erreurs = validerReception(build());
      expect(erreurs[champ], `Â« ${champ} Â» devrait Ãªtre contrÃ´lÃ©`).toBeTruthy();
    }
  });

  it("3. la signature peut Ãªtre remplacÃ©e par la validation verbale", () => {
    const d = complet();
    d.reception = { ...d.reception, signatureDeposant: "", validationVerbale: true };
    expect(validerReception(d).signature).toBeUndefined();
  });

  it("4. l'e-mail reste facultatif mais est contrÃ´lÃ© s'il est saisi", () => {
    const sansEmail = complet();
    expect(validerReception(sansEmail).clientEmail).toBeUndefined();

    const mauvais = complet();
    mauvais.client = { ...mauvais.client, email: "pas-une-adresse" };
    expect(validerReception(mauvais).clientEmail).toBeTruthy();

    const bon = complet();
    bon.client = { ...bon.client, email: "contact@exemple.cm" };
    expect(validerReception(bon).clientEmail).toBeUndefined();
  });

  it("5. le kilomÃ©trage 0 est VALIDE (vÃ©hicule neuf, pas une erreur)", () => {
    const d = complet();
    d.reception = { ...d.reception, kilometrageEntree: 0 };
    expect(validerReception(d).kilometrageEntree).toBeUndefined();
  });

  it("6. l'ORDRE des erreurs suit l'ordre du formulaire", () => {
    // C'est ce qui permet de défiler vers la VRAIE première erreur.
    const vide: DonneesReception = {};
    const cles = Object.keys(validerReception(vide));
    expect(cles[0]).toBe("immatriculation");
    expect(cles).toContain("marque");
    // `clientNom` n'est plus contrôlé : sans client, le véhicule part à
    // wartier. Le téléphone ne l'est qu'APRÈS un nom saisi.
    expect(cles).not.toContain("clientNom");
  });

  it("6-bis. un nom sans telephone est signale, aucun nom ne l'est", () => {
    const sansClient = complet();
    sansClient.client = {};
    expect(validerReception(sansClient).clientNom).toBeUndefined();
    expect(validerReception(sansClient).clientTelephone).toBeUndefined();

    const nomSansTel = complet();
    nomSansTel.client = { nom: "Dupont" };
    expect(validerReception(nomSansTel).clientTelephone).toBeTruthy();
  });

  it("7. rÃ¨gles de format â€” tolÃ©rantes sur les saisies lÃ©gitimes", () => {
    expect(telephoneSaisissable("06 12 34 56 78")).toBe(true);
    expect(telephoneSaisissable("+237 6 99 12 34 56")).toBe(true);
    expect(telephoneSaisissable("690000000")).toBe(true);
    expect(telephoneSaisissable("6")).toBe(false);
    expect(telephoneSaisissable("abc")).toBe(false);

    expect(emailValide("a@b.cm")).toBe(true);
    expect(emailValide("a@b")).toBe(false);
    expect(emailValide("a b@c.cm")).toBe(false);

    expect(immatriculationValide("AB-123-CD")).toBe(true);
    expect(immatriculationValide("AB1")).toBe(true);
    expect(immatriculationValide("AB")).toBe(false);
  });

  it("8. le message de rÃ©sumÃ© annonce le nombre d'erreurs restantes", () => {
    expect(messageResume({})).toBe("");
    expect(messageResume({ immatriculation: "Immatriculation requise" })).toBe("Immatriculation requise");
    const deux = messageResume({ a: "Champ A requis", b: "Champ B requis" });
    expect(deux).toContain("Champ A requis");
    expect(deux).toContain("1 autre");
    const trois = messageResume({ a: "A", b: "B", c: "C" });
    expect(trois).toContain("2 autres");
  });
});
