/**
 * RPT-05 â€” Tests du noyau de validation serveur.
 *
 * Unites pures : aucune base, aucun appel reseau. On teste ce que le client ne
 * peut pas decider a la place du serveur.
 */
import { describe, expect, it } from "vitest";

import {
  COLONNES_TRI_SALARIALES,
  EMPLOYEE_IDS_MAX,
  EVENT_PAGE_SIZE_MAX,
  estJourIsoValide,
  normaliserEmployeeIds,
  normaliserListe,
  normaliserPagination,
  normaliserSearch,
  normaliserTri,
  PAGE_SIZE_MAX,
  validerPeriodeRapport,
} from "~/server/lib/rh-centre-rapports-input";

const SORT = [
  "nom",
  "matricule",
  "retardTotalMinutes",
  "tauxPresence",
  "totalNet",
  "masseAcquise",
  "avancePeriode",
  "soldeActuel",
] as const;

describe("RPT-05 periode", () => {
  it("accepte une periode reelle et coherente", () => {
    expect(() => validerPeriodeRapport("2026-09-01", "2026-09-30")).not.toThrow();
  });

  it("refuse une date qui n'existe pas", () => {
    expect(() => validerPeriodeRapport("2026-13-01", "2026-09-30")).toThrow(/Dates invalides/);
    expect(() => validerPeriodeRapport("2026-02-31", "2026-03-31")).toThrow(/Dates invalides/);
    expect(() => validerPeriodeRapport("2026-09-01", "2026-09-31")).toThrow(/Dates invalides/);
  });

  it("refuse le format non ISO", () => {
    expect(estJourIsoValide("01/09/2026")).toBe(false);
    expect(estJourIsoValide("2026-9-1")).toBe(false);
    expect(estJourIsoValide("2026-09-01")).toBe(true);
    expect(estJourIsoValide("2024-02-29")).toBe(true);
    expect(estJourIsoValide("2026-02-29")).toBe(false);
  });

  it("refuse une periode inversee", () => {
    expect(() => validerPeriodeRapport("2026-09-30", "2026-09-01")).toThrow(/Periode incoherente/);
  });

  it("refuse une periodeå¤ªé•¿ avant de lire la base", () => {
    expect(() => validerPeriodeRapport("2024-01-01", "2026-12-31")).toThrow(/trop longue/);
  });

  it("accepte une periode de 13 mois pile", () => {
    expect(() => validerPeriodeRapport("2025-09-01", "2026-09-30")).not.toThrow();
  });
});

describe("RPT-05 population d'employes", () => {
  it("retire les doublons sans changer la population", () => {
    expect(normaliserEmployeeIds([7, 3, 7, 3, 9])).toEqual([7, 3, 9]);
  });

  it("liste vide = aucun filtre (la borne tenant reste seule faire foi)", () => {
    expect(normaliserEmployeeIds([])).toBeUndefined();
    expect(normaliserEmployeeIds(undefined)).toBeUndefined();
  });

  it("refuse un identifiant non entier ou negatif", () => {
    expect(() => normaliserEmployeeIds([0])).toThrow(/invalide/);
    expect(() => normaliserEmployeeIds([-4])).toThrow(/invalide/);
    expect(() => normaliserEmployeeIds([1.5] as unknown as number[])).toThrow(/invalide/);
  });

  it("refuse une selectionï¼Œç”¨æ¥ le vol de masse", () => {
    const trop = Array.from({ length: EMPLOYEE_IDS_MAX + 1 }, (_, i) => i + 1);
    expect(() => normaliserEmployeeIds(trop)).toThrow(/trop volumineuse/);
    expect(normaliserEmployeeIds(Array.from({ length: EMPLOYEE_IDS_MAX }, (_, i) => i + 1))).toHaveLength(
      EMPLOYEE_IDS_MAX
    );
  });
});

describe("RPT-05 pagination", () => {
  it("applique les defauts", () => {
    expect(normaliserPagination(undefined, undefined, 50, PAGE_SIZE_MAX)).toEqual({
      page: 1,
      pageSize: 50,
    });
  });

  it("accepte les bornes", () => {
    expect(normaliserPagination(1, PAGE_SIZE_MAX, 50, PAGE_SIZE_MAX).pageSize).toBe(PAGE_SIZE_MAX);
    expect(normaliserPagination(1, EVENT_PAGE_SIZE_MAX, 200, EVENT_PAGE_SIZE_MAX).pageSize).toBe(
      EVENT_PAGE_SIZE_MAX
    );
  });

  it("refuse page <= 0 et pageSize hors bornes", () => {
    expect(() => normaliserPagination(0, 50, 50, PAGE_SIZE_MAX)).toThrow(/Page invalide/);
    expect(() => normaliserPagination(-1, 50, 50, PAGE_SIZE_MAX)).toThrow(/Page invalide/);
    expect(() => normaliserPagination(1, 0, 50, PAGE_SIZE_MAX)).toThrow(/Taille de page invalide/);
    expect(() => normaliserPagination(1, PAGE_SIZE_MAX + 1, 50, PAGE_SIZE_MAX)).toThrow(
      /Taille de page invalide/
    );
  });
});

describe("RPT-05 tri", () => {
  it("defaut sur le nom, sens croissant", () => {
    expect(normaliserTri(undefined, undefined, false, SORT)).toEqual({ sort: "nom", dir: "asc" });
  });

  it("refuse une colonne inconnue", () => {
    expect(() => normaliserTri("secret" as never, "asc", true, SORT)).toThrow(/non supporte/);
  });

  it("refuse un tri salarial quand le droit salaire est absent", () => {
    for (const colonne of COLONNES_TRI_SALARIALES) {
      expect(() => normaliserTri(colonne, "asc", false, SORT), colonne).toThrow(
        /rh.salaire.consulter/
      );
    }
  });

  it("accepte un tri salarial quand le droit salaire est present", () => {
    expect(normaliserTri("totalNet", "desc", true, SORT)).toEqual({ sort: "totalNet", dir: "desc" });
  });

  it("laisse passer un tri non salarial sans droit salaire", () => {
    expect(normaliserTri("retardTotalMinutes" as never, "desc", false, SORT)).toEqual({
      sort: "retardTotalMinutes",
      dir: "desc",
    });
  });
});

describe("RPT-05 recherche et listes", () => {
  it("une recherche vide ne ramene pas tout le monde", () => {
    expect(normaliserSearch("   ")).toBeUndefined();
    expect(normaliserSearch("")).toBeUndefined();
    expect(normaliserSearch(undefined)).toBeUndefined();
    expect(normaliserSearch("  ndiaye ")).toBe("ndiaye");
  });

  it("refuse une recherche enorme", () => {
    expect(() => normaliserSearch("a".repeat(121))).toThrow(/Recherche trop longue/);
  });

  it("une liste vide = aucun filtre, les doublons partent", () => {
    expect(normaliserListe([], 5)).toBeUndefined();
    expect(normaliserListe(undefined, 5)).toBeUndefined();
    expect(normaliserListe(["a", "a", "b"], 5)).toEqual(["a", "b"]);
  });

  it("refuse une liste trop longue", () => {
    expect(() => normaliserListe(["a", "b", "c"], 2)).toThrow(/Filtre trop long/);
  });
});