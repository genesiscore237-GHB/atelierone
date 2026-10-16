import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PARKING_VERS_IMMOBILISATION } from "./parking-vehicule-service";

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

  const cas = sql.match(/CASE\s+c\.statut([\s\S]*?)END,/);
  expect(cas, "le CASE de traduction doit exister dans le script de migration").not.toBeNull();
  const corps = cas ? cas[1] ?? "" : "";

  const motif = /WHEN\s+'([A-Z_]+)'\s+THEN\s+(?:'([a-z_]+)'|NULL)/g;
  const lignes: ReadonlyArray<readonly [string, string | null]> = [];
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

  it("un statut sans équivalent reste NULL — pas de repli silencieux", () => {
    // `EN_VENTE`, `ACCIDENTE`, `DONNEES_INCOMPLETES` : le véhicule est au garage
    // mais pas en atelier. Les ramener à `en_reception` le ferait réapparaître
    // dans le parc d'atelier alors qu'il n'y est plus. C'est une décision
    // consciemment prise dans le service — le SQL ne doit pas la contredire.
    for (const statut of ["EN_VENTE", "ACCIDENTE", "DONNEES_INCOMPLETES"]) {
      expect(PARKING_VERS_IMMOBILISATION[statut]).toBeNull();
    }
  });
});