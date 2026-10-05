/**
 * RPT-05 — Normalisation et validation COTE SERVEUR de l'entree du rapport.
 *
 * Regle du projet : le client propose, le serveur decide. Aucune valeur de ce
 * module ne provient d'une confiance accordee au payload : periode, population
 * d'employes, filtres, tri et pagination sont revalides ici, et les erreurs sont
 * explicites plutot que silencieusement corrigees.
 *
 * Ce module est PUR : aucune lecture DB. La resolution des droits reste dans
 * `rh-centre-rapports.ts`.
 */

import { TRPCError } from "@trpc/server";

/** Plafond de periode : 13 mois civils, comme le contrat RPT-01. */
export const MAX_SPAN_MOIS = 13;
/** Au-dela, la lecture est un deni de service, pas une requete. */
export const PERIODE_MAX_JOURS = 400;

/**
 * Plafonds de pagination.
 *
 * Ces valeurs reprennent le CONTRAT EXISTANT du rapport (500 lignes / 2000
 * evenements), et non un choix arbitraire : RPT-02 consomme le rapport avec
 * `pageSize: 500` et `eventPageSize: 2000`. Les resserrer casse des appels
 * legitimes deja en production ; le role de ce module est de BORNER le risque
 * (aucun `pageSize: 1e9`), pas de redefinir le contrat.
 *
 * Le plafond doit rester un multiple de la taille d'ecran courante (50/200).
 */
export const PAGE_SIZE_MAX = 500;
export const EVENT_PAGE_SIZE_MAX = 2000;
export const EMPLOYEE_IDS_MAX = 500;

const ISO_JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** Une date ISO reelle : `2026-02-31` et `2026-13-01` sont refuses. */
export function estJourIsoValide(valeur: string): boolean {
  if (!ISO_JOUR.test(valeur)) return false;
  const d = new Date(`${valeur}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  // Aller-retour : detecte les debordements de mois (31 avril -> 1er mai).
  return d.toISOString().slice(0, 10) === valeur;
}

export function validerPeriodeRapport(from: string, to: string): void {
  if (!estJourIsoValide(from) || !estJourIsoValide(to)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Dates invalides : format attendu AAAA-MM-JJ et jour existant (recu ${from} → ${to}).`,
    });
  }
  if (from > to) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Periode incoherente : la date de debut (${from}) est posterieure a la date de fin (${to}).`,
    });
  }
  const debut = new Date(`${from}T12:00:00`);
  const fin = new Date(`${to}T12:00:00`);
  const jours = Math.round((fin.getTime() - debut.getTime()) / 86_400_000);
  if (jours > PERIODE_MAX_JOURS) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Periode trop longue : ${jours} jours demandés, maximum ${PERIODE_MAX_JOURS}. Reduisez la plage [Du, Au].`,
    });
  }
  const spanMonths =
    (fin.getFullYear() - debut.getFullYear()) * 12 + (fin.getMonth() - debut.getMonth());
  if (spanMonths >= MAX_SPAN_MOIS) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Periode trop longue : maximum 13 mois civils. Reduisez la plage [Du, Au].",
    });
  }
}

/**
 * Normalise une selection d'employes.
 *
 * - doublons retires, ordre conserve ;
 * - ids non positifs ou non entiers refuses ;
 * - plus de `EMPLOYEE_IDS_MAX` ids refuses (au-dela, le client veut tout) ;
 * - `undefined` ou tableau vide = « aucun filtre » : la borne TENANT du
 *   chargement source reste seule faire foi, jamais la selection client.
 */
export function normaliserEmployeeIds(ids: readonly number[] | undefined): number[] | undefined {
  if (ids === undefined) return undefined;
  if (ids.length > EMPLOYEE_IDS_MAX) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Selection trop volumineuse : ${ids.length} employes demandes, maximum ${EMPLOYEE_IDS_MAX}.`,
    });
  }
  const vus = new Set<number>();
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Identifiant d'employe invalide : ${String(id)}. Attendu : entier positif.`,
      });
    }
    vus.add(id);
  }
  return vus.size === 0 ? undefined : [...vus];
}

export interface Pagination {
  page: number;
  pageSize: number;
}

/**
 * Pagination bornee. Un `page` negatif ou un `pageSize` enorme ne sont pas
 * « ajustes » en silence : ils sont refuses, pour que le client sache que son
 * etat local est incoherent.
 */
export function normaliserPagination(
  page: number | undefined,
  pageSize: number | undefined,
  defaut: number,
  max: number
): Pagination {
  const p = page ?? 1;
  const s = pageSize ?? defaut;
  if (!Number.isInteger(p) || p < 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Page invalide : ${String(page)}.` });
  }
  if (!Number.isInteger(s) || s < 1 || s > max) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Taille de page invalide : ${String(pageSize)}. Attendu : entier entre 1 et ${max}.`,
    });
  }
  return { page: p, pageSize: s };
}

/** Colonnes de tri dont la valeur est un montant. */
export const COLONNES_TRI_SALARIALES = [
  "masseAcquise",
  "totalNet",
  "avancePeriode",
  "soldeActuel",
] as const;

export type ColonneTriSalariale = (typeof COLONNES_TRI_SALARIALES)[number];

/**
 * Un utilisateur sans `rh.salaire.consulter` ne peut pas trier sur une colonne
 * salariale : il n'en a pas la valeur, et l'accepter produirait un ordre muet.
 * On refuse explicitement plutot que de reordonner derriere son dos.
 */
export function normaliserTri<T extends string>(
  sort: T | undefined,
  dir: "asc" | "desc" | undefined,
  canSeeSalary: boolean,
  colonnesAutorisees: readonly T[]
): { sort: T; dir: "asc" | "desc" } {
  const colonne = sort ?? (colonnesAutorisees.includes("nom" as T) ? ("nom" as T) : colonnesAutorisees[0]);
  if (!colonnesAutorisees.includes(colonne)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Tri non supporte : ${String(colonne)}.`,
    });
  }
  if (!canSeeSalary && (COLONNES_TRI_SALARIALES as readonly string[]).includes(colonne)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Tri sur « ${colonne} » refuse : la colonne exige le droit rh.salaire.consulter.`,
    });
  }
  return { sort: colonne, dir: dir ?? "asc" };
}

/** Longueur maximale d'un texte libre recherche. */
export const SEARCH_MAX = 120;

/**
 * Normalise une recherche : espaces de bord retires, longueur bornee. Une
 * recherche vide ne doit pas produire un `%%` qui ramene tout le monde.
 */
export function normaliserSearch(valeur: string | undefined): string | undefined {
  if (valeur === undefined) return undefined;
  const propre = valeur.trim();
  if (propre.length === 0) return undefined;
  if (propre.length > SEARCH_MAX) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Recherche trop longue : ${propre.length} caracteres, maximum ${SEARCH_MAX}.`,
    });
  }
  return propre;
}

/** Liste de valeurs d'un filtre : liste vide = aucun filtre. */
export function normaliserListe<T extends string>(
  valeurs: readonly T[] | undefined,
  max: number
): T[] | undefined {
  if (valeurs === undefined) return undefined;
  const uniques = [...new Set(valeurs)];
  if (uniques.length === 0) return undefined;
  if (uniques.length > max) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Filtre trop long : ${uniques.length} valeurs, maximum ${max}.`,
    });
  }
  return uniques;
}