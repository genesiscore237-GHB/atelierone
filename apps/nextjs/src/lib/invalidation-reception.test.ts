/**
 * LOT U5 (E11, P2-6) — Invalidation des caches après une réception.
 *
 * On ne peut pas tester « le cache est périmé » sans navigateur. Ce qui est
 * testable, et qui porte l'essentiel du risque, c'est la LISTE : une
 * réception écrit dans plusieurs tables et chaque requête lisant ces tables
 * doit être invalidée. Une liste incomplète est un oubli SILENCIEUX — l'agent
 * voit une donnée périmée sans aucun signal.
 *
 * Ces tests vérifient donc que :
 *  1. chaque invalidation annoncée est APPELÉE ;
 *  2. les caches parking / KPI / dédoublonnage y figurent (c'était l'oubli) ;
 *  3. une route absente ne fait pas échouer l'invalidation — la réception est
 *     déjà enregistrée, un oubli de route ne doit pas faire croire à l'agent
 *     que l'enregistrement a échoué ;
 *  4. la liste reste sans doublon.
 */

import { describe, expect, it } from "vitest";
import {
  INVALIDATIONS_RECEPTION,
  invaliderApresReception,
} from "~/lib/invalidation-reception";

/** Fabrique un `utils` tRPC factice qui enregistre ce qui est invalidé. */
const utilsFactice = (chemins: string[]) => {
  const appels: string[] = [];
  return { appels, utils: utilsFromPaths(chemins, appels) };
};

/** Construit un objet imbriqué à partir de chemins « a.b.c ». */
const utilsFromPaths = (chemins: string[], appels: string[]): any => {
  const racine: any = {};
  for (const chemin of chemins) {
    const parts = chemin.split(".");
    let noeud = racine;
    for (let i = 0; i < parts.length - 1; i++) {
      noeud[parts[i]] = noeud[parts[i]] ?? {};
      noeud = noeud[parts[i]];
    }
    const feuille = parts[parts.length - 1];
    noeud[feuille] = { invalidate: () => { appels.push(chemin); return Promise.resolve(); } };
  }
  return racine;
};

describe("LOT U5 — invalidation des caches après réception", () => {
  it("1. chaque invalidation annoncée est effectivement appelée", async () => {
    const chemins = INVALIDATIONS_RECEPTION.map((i) => i.chemin);
    const { appels, utils } = utilsFactice(chemins);
    await invaliderApresReception(utils);
    expect(appels.sort()).toEqual([...chemins].sort());
  });

  it("2. les caches parking, KPI et dédoublonnage sont inclus (P2-6)", () => {
    const chemins = INVALIDATIONS_RECEPTION.map((i) => i.chemin);
    // Ce sont précisément ceux qui ÉTAIENT absents avant ce lot.
    expect(chemins).toContain("garage.overview");
    expect(chemins).toContain("garage.alertes");
    expect(chemins).toContain("atelierKpi.getSanteGarage");
    expect(chemins).toContain("clients.suggestionsClients");
    expect(chemins).toContain("vehicules.typesUtilises");
  });

  it("2b. chaque entrée porte un MOTIF (pas d'oubli muet)", () => {
    for (const i of INVALIDATIONS_RECEPTION) {
      expect(i.motif.trim().length, `${i.chemin} sans motif`).toBeGreaterThan(10);
    }
  });

  it("3. une route absente n'échoue pas l'invalidation", async () => {
    // Seules deux routes existent : les huit autres doivent être ignorées
    // silencieusement. La réception est DÉJÀ enregistrée à ce stade.
    const appels: string[] = [];
    const utils = utilsFromPaths(["or.list", "vehicules.list"], appels);
    await expect(invaliderApresReception(utils)).resolves.toBeUndefined();
    expect(appels.sort()).toEqual(["or.list", "vehicules.list"]);
  });

  it("3b. un utils vide ne lève pas", async () => {
    await expect(invaliderApresReception(undefined)).resolves.toBeUndefined();
    await expect(invaliderApresReception({})).resolves.toBeUndefined();
  });

  it("4. la liste ne contient pas de doublon", () => {
    const chemins = INVALIDATIONS_RECEPTION.map((i) => i.chemin);
    expect(new Set(chemins).size).toBe(chemins.length);
  });
});