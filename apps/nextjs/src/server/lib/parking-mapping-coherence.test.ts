import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PARKING_VERS_IMMOBILISATION, IMMOBILISATION_VERS_PARKING } from "./parking-vehicule-service";

/**
 * La traduction parking → immobilisation est écrite DEUX fois :
 *   - `PARKING_VERS_IMMOBILISATION`, en TypeScript, utilisée par la dérivation ;
 *   - dans `migrate-parking-vehicules.ts`, en SQL.
 *
 * Elles sont d'accord aujourd'hui. Rien ne les y oblige demain.
 *
 * C'est exactement le motif que `vehicule-regles.ts` documente comme cause
 * racine des bugs : « trois écrans, trois comportements divergents ». La
 * duplication n'est pas une question de style — c'est la raison pour laquelle
 * une règle se contournera.
 *
 * On ne peut pas partager la constante directement : `packages/db` ne dépend pas
 * d'`apps/nextjs`. Ce test tient donc la corde à la place de l'import, et
 * échoue si le SQL ajoute, retire ou contredit une correspondance.
 */
describe("Cohérence du mapping parking → immobilisation", () => {
  // `process.cwd()` est la racine vitest (apps/nextjs) ; deux niveaux montent
  // à la racine du dépôt, où vit `packages/db`.
  const chemin = resolve(process.cwd(), "../../packages/db/src/migrate-parking-vehicules.ts");
  const sql = readFileSync(chemin, "utf8");

  // TOUS les blocs CASE du fichier, pas seulement le premier : le script en a
  // deux (avec et sans immatriculation), et n'analyser que le premier laissait
  // le second diverger en silence.
  const cas = [...sql.matchAll(/CASE\s+c\.statut([\s\S]*?)END,/g)].map((m) => m[1] ?? "").join('n');
  expect(cas, 'le script doit contenir une traduction de statut').not.toBe('');
  expect(cas, "le CASE de traduction doit exister dans le script de migration").not.toBeNull();
  const corps = cas;

  // Le motif accepte les CHIFFRES : `transfere_site2` en contient un, et une
  // regex sans chiffres le faisait disparaître en silence — un statut manquant
  // se lit exactement comme un statut qu'on aurait oublié.
  const motif = /WHEN\s+'([A-Z_]+)'\s+THEN\s+(?:'([a-z_0-9]+)'|NULL)/g;
  const lignes: Array<readonly [string, string | null]> = [];
  for (const m of corps.matchAll(motif)) {
    lignes.push([m[1]!, m[2] ?? null]);
  }

  it("le SQL couvre exactement les mêmes statuts parking que le service", () => {
    const duSql = new Set(lignes.map(([k]) => k));
    const duService = new Set(Object.keys(PARKING_VERS_IMMOBILISATION));

    const manquants = [...duService].filter((k) => !duSql.has(k));
    const enTrop = [...duSql].filter((k) => !duService.has(k));

    expect(
      { manquants, enTrop },
      `la traduction SQL a divergé — manquants: [${manquants}], en trop: [${enTrop}]`,
    ).toEqual({ manquants: [], enTrop: [] });
  });

  it("chaque correspondance SQL donne la même valeur que le service", () => {
    const ecarts: string[] = [];
    for (const [statutParking, valeurSql] of lignes) {
      const valeurService = PARKING_VERS_IMMOBILISATION[statutParking] ?? null;
      if (valeurService !== valeurSql) {
        ecarts.push(`${statutParking} : SQL=${String(valeurSql)} service=${String(valeurService)}`);
      }
    }
    expect(ecarts, ecarts.join("\n")).toEqual([]);
  });

  // Ce test affirmait l'INVERSE, et il avait raison de le faire tant que la
  // decision etait « ne pas inventer d'equivalent ».
  //
  // Etape 3 : c'etait une decision de prudence, fausse par ses effets. Un
  // `null` veut dire « ne rien ecrire » — donc garder le statut PRECEDENT. Un
  // vehicule en ACCIDENTE restait `en_reception` : l'agent lisait « accident »
  // au parking et « en reception » a l'atelier. Deux verites contradictoires,
  // invisibles, donc jamais corrigees.
  //
  // Le refus d'inventer reste juste pour un statut qui n'existe pas. Mais
  // ACCIDENTE et EN_VENTE sont des etats REELS du garage, pas des inventions.
  it("tout statut parking a un equivalent nomme", () => {
    for (const [parking, attendu] of [
      ["ACCIDENTE", "accidente"],
      ["EN_VENTE", "en_vente"],
      // `transfere_site2` existait cote code, orphelin : personne ne l'a relie.
      ["A_TRANSFERER", "transfere_site2"],
      // La voiture EST recue ; c'est la fiche qui est incomplete. Inverser
      // revient a inventer une absence de vehicule.
      ["DONNEES_INCOMPLETES", "en_reception"],
    ] as const) {
      expect(PARKING_VERS_IMMOBILISATION[parking], `${parking} doit avoir un equivalent`).toBe(attendu);
    }
  });

  it("aucun statut parking n'est plus ignore", () => {
    // Un `null` restant signifierait qu'un vehicule garderait un statut faux.
    // Le test le rend visible des que quelqu'un reintroduit le trou.
    const ignores = Object.entries(PARKING_VERS_IMMOBILISATION)
      .filter(([, v]) => v === null)
      .map(([k]) => k);
    expect(ignores, `statuts parking sans verite : [${ignores}]`).toEqual([]);
  });

  it("le mapping aller-retour ne perd rien", () => {
    // Un statut projete vers `null` ferait un aller simple : le parking et
    // l'atelier divergeraient a la premiere lecture.
    for (const [immo, parking] of Object.entries(IMMOBILISATION_VERS_PARKING)) {
      if (parking === null) continue;
      expect(PARKING_VERS_IMMOBILISATION[parking], `${immo} -> ${parking} ne revient pas`).toBeDefined();
    }
  });
});
