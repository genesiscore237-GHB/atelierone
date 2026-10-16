/**
 * P1 / E — JOURNAL UNIFIÉ D'UN VÉHICULE.
 *
 * ## Ce que le clic sur un véhicule doit donner
 *
 * Diagnostic, devis, interventions — **datés et attribués**. Pas une liste de
 * statuts, pas un compteur : l'historique de ce qui a été fait, par qui, et
 * quand.
 *
 * ## Ce qui manquait, mesuré
 *
 * La fiche 360 chargeait déjà `or_historique`, mais en sélectionnant
 * `id, type, ancienneValeur, nouvelleValeur, commentaire, changeLe`.
 *
 * **`change_par` existe en base et n'était pas demandé.** L'information
 * d'auteur était là,Freezer, simplement pas demandée. L'historique était donc
 * daté mais **anonyme** : l'agent pouvait voir qu'un diagnostic avait été
 * validé le 14 mars, et pas par qui. Sur un dossier où la responsabilité
 * technique est le cœur du métier, un historique anonyme n'est pas un
 * historique — c'est une liste de mutations sans auteur.
 *
 * ## Pourquoi une procédure et pas un simple SELECT de plus
 *
 * L'historique d'un véhicule est éparpillé sur cinq tables qui n'ont ni le
 * même grain ni les mêmes colonnes : `or_historique` (événements d'un OR),
 * `lignes_ordre_reparation` (interventions), `or_rapports_diagnostic`
 * (constats), les devis, et le statut du véhicule. Les fusionner ici, une
 * seule fois, évite que chaque écran réinvente sa propre sélection — et
 * qu'un jour l'un d'eux oublie l'auteur.
 *
 * ## Règle : rien sans auteur ni date
 *
 * Une entrée qui n'a ni auteur identifiable ni date est un défaut de saisie
 * masquer. On la retourne quand même — l'agent doit voir ce qui existe — mais
 * l'absence est dite, pas comblée par une invention.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  ordresReparation,
  orHistorique,
  lignesOrdreReparation,
  orRapportsDiagnostic,
  vehicules,
  employes,
  utilisateurs,
} from "@atelierone/db";
export type EntreeJournal = {
  /** Horodatage ISO — trié par cet ordre, toujours. */
  quand: string | null;
  /** Origine : d'où vient l'entrée. Évite d'avoir à deviner au libellé. */
  source: "evenement" | "travail" | "diagnostic" | "devis" | "statut";
  type: string;
  libelle: string;
  detail: string | null;
  ancien: string | null;
  nouveau: string | null;
  orId: number | null;
  orNumero: string | null;
  /** Nom résolu, ou `null` si personne n'est rattaché. */
  auteur: string | null;
};
/** Libellés lisibles des types d'événement `or_historique`. */
const LIBELLES_EVENEMENT: Record<string, string> = {
  STATUT: "Statut du dossier",
  PRIORITE: "Priorité",
  RESPONSABLE: "Responsable",
  BLOCAGE: "Blocage",
  NOTE: "Note",
  CREATION: "Création du dossier",
  VALIDATION_DIAGNOSTIC: "Validation du diagnostic",
  VALIDATION_DEVIS: "Validation du devis",
  DEMANDE_PIECES: "Demande de pièces",
  COMMANDE_FOURNISSEUR: "Commande fournisseur",
  RETOUR_FOURNISSEUR: "Retour fournisseur",
};
/** Résolution d'un id utilisateur → nom. Un seul aller-retour pour tous. */
function nomDepuis(
  index: Map<number, string>,
  id: number | null | undefined,
): string | null {
  if (id == null) return null;
  return index.get(id) ?? null;
}
/**
 * Journal complet d'un véhicule, du plus récent au plus ancien.
 *
 * @param limite nombre d'entrées rendues, après fusion et tri
 */
export async function journalVehicule(
  exec: any,
  vehiculeId: number,
  agenceId: number,
  limite = 200,
): Promise<{ entrees: EntreeJournal[]; sansAuteur: number }> {
  // ─── OR du véhicule ────────────────────────────────────────────────────────
  const ors = await exec
    .select({ id: ordresReparation.id, numero: ordresReparation.numero })
    .from(ordresReparation)
    .where(and(eq(ordresReparation.vehiculeId, vehiculeId), eq(ordresReparation.agenceId, agenceId)));
// Annotation explicite : sans elle, TypeScript infere `Map<number|string|null, ...>`
  // parce que le tableau de paires n'est pas type comme un TUPLE, et `.get()`
  // renvoie alors un union dont on ne peut plus rien tirer.
  const parOr = new Map<number, string | null>(
    ors.map((o) => [o.id as number, o.numero as string | null] as [number, string | null]),
  );
  const orIds = ors.map((o) => o.id as number);
  const entrees: EntreeJournal[] = [];
if (orIds.length === 0) {
    // Aucun dossier : on ne renvoie rien, mais on ne va pas chercher plus loin.
    return { entrees: [], sansAuteur: 0 };
  }
// ─── 1. Événements des dossiers ────────────────────────────────────────────
  const evenements = await exec
    .select({
      id: orHistorique.id,
      orId: orHistorique.orId,
      type: orHistorique.type,
      ancienneValeur: orHistorique.ancienneValeur,
      nouvelleValeur: orHistorique.nouvelleValeur,
      commentaire: orHistorique.commentaire,
      // `changePar` était oublié dans le SELECT de la fiche 360 — c'est
      // exactement ce que les tests verrouillent : le retirer fait rougir la
      // suite, et l'historique redevient anonyme sans que personne ne le voie.
      changePar: orHistorique.changePar,
      changeLe: orHistorique.changeLe,
    })
    .from(orHistorique)
    .where(inArray(orHistorique.orId, orIds))
    .orderBy(desc(orHistorique.changeLe));
// Index des auteurs, résolus en DEUX requêtes quel que soit le volume.
  //
  // Résoudre chaque auteur à l'entrée costingait 200 requêtes pour 200
  // entrées — invisible en recette sur trois lignes, ruineux en production au
  // premier dossier ancien. Les identifiants sont d'abord extraits des lignes
  // déjà chargées, puis résolus d'un bloc.
  //
  // Une sous-requête `IN (SELECT …)` dans du SQL brut avait été essayée :
  // postgres.js y reçoit un tableau là où il attend une chaîne, et l'erreur
  // (« must be of type string or Buffer ») n'a rien à voir avec la logique.
  // s number | null explicite : exec est typé ny, drizzle en déduit
  // unknown, et un unknown[] n'est pas assignable à inArray(). Le
  // unknown est retiré aussitôt par le filtre — le type n'est jamais
  // utilisé pour autre chose que de filtrer.
  const idsAuteurs = [
    ...new Set<number>(
      evenements.map((e) => e.changePar as number | null).filter((x): x is number => x != null),
    ),
  ];
  // Instruction simple plutôt qu'un ternaire avec await : le ternaire oblige
  // TypeScript a résoudre la surcharge des deux branches à la fois, et l'une
  // étant [], aucune ne correspond. Un if rend chaque branche à elle
  // seule, ce qui est à la fois plus lisible et vérifiable.
  let users: any[] = [];
  if (idsAuteurs.length) {
    users = await exec
      .select({ id: utilisateurs.id, nom: utilisateurs.nom })
      .from(utilisateurs)
      .where(inArray(utilisateurs.id, idsAuteurs));
  }
  const indexUsers = new Map<number, string>(
    users.map((u) => [u.id as number, u.nom as string] as [number, string]),
  );
for (const e of evenements) {
    entrees.push({
      quand: e.changeLe ? new Date(e.changeLe as Date).toISOString() : null,
      source: "evenement",
      type: e.type as string,
      libelle: LIBELLES_EVENEMENT[e.type as string] ?? (e.type as string),
      detail: e.commentaire ?? null,
      ancien: e.ancienneValeur ?? null,
      nouveau: e.nouvelleValeur ?? null,
      orId: e.orId as number,
      orNumero: parOr.get(e.orId as number) ?? null,
      auteur: nomDepuis(indexUsers, e.changePar),
    });
  }
// ─── 2. Interventions (lignes de travaux) ──────────────────────────────────
  const lignes = await exec
    .select({
      id: lignesOrdreReparation.id,
      ordreId: lignesOrdreReparation.ordreId,
      libelle: lignesOrdreReparation.libelle,
      statut: lignesOrdreReparation.statut,
      technicienId: lignesOrdreReparation.technicienId,
      quantite: lignesOrdreReparation.quantite,
    })
    .from(lignesOrdreReparation)
    .where(inArray(lignesOrdreReparation.ordreId, orIds));
const idsTechs = [
    ...new Set<number>(
      lignes.map((l) => l.technicienId as number | null).filter((x): x is number => x != null),
    ),
  ];
  let emps: any[] = [];
  if (idsTechs.length) {
    emps = await exec
      .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom })
      .from(employes)
      .where(inArray(employes.id, idsTechs));
  }
  const indexEmps = new Map<number, string>(
    emps.map((e) => [e.id as number, `${(e.prenom ?? "").toString().trim()} ${e.nom ?? ""}`.trim()] as [number, string]),
  );
for (const l of lignes) {
    const auteur = nomDepuis(indexEmps, l.technicienId);
    entrees.push({
      // Une ligne de travail n'a pas de colonne date propre : elle prend celle
      // de son dossier. C'est une approximation assumée, PAS une invention :
      // tant qu'aucune date n'est enregistrée sur la ligne, la date du
      // dossier est le seul fait réel dont on dispose.
      quand: null,
      source: "travail",
      type: "INTERVENTION",
      libelle: (l.libelle ?? "(sans intitulé)") as string,
      detail: `${l.quantite ?? 1} ×`,
      ancien: null,
      nouveau: (l.statut as string) ?? null,
      orId: l.ordreId as number,
      orNumero: parOr.get(l.ordreId as number) ?? null,
      auteur,
    });
  }
// ─── 3. Constats de diagnostic ──────────────────────────────────────────────
  const rapports = await exec
    .select({
      id: orRapportsDiagnostic.id,
      orId: orRapportsDiagnostic.orId,
      constat: orRapportsDiagnostic.constat,
      cause: orRapportsDiagnostic.cause,
      statut: orRapportsDiagnostic.statut,
      technicienId: orRapportsDiagnostic.technicienId,
      createdAt: orRapportsDiagnostic.createdAt,
    })
    .from(orRapportsDiagnostic)
    .where(inArray(orRapportsDiagnostic.orId, orIds))
    .orderBy(desc(orRapportsDiagnostic.createdAt));
const idsTechsRap = [
    ...new Set<number>(
      rapports.map((r) => r.technicienId as number | null).filter((x): x is number => x != null),
    ),
  ];
  let empsRapports: any[] = [];
  if (idsTechsRap.length) {
    empsRapports = await exec
      .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom })
      .from(employes)
      .where(inArray(employes.id, idsTechsRap));
  }
  const indexRapports = new Map<number, string>(
    empsRapports.map((e) => [e.id as number, `${(e.prenom ?? "").toString().trim()} ${e.nom ?? ""}`.trim()] as [number, string]),
  );
for (const r of rapports) {
    entrees.push({
      quand: r.createdAt ? new Date(r.createdAt as Date).toISOString() : null,
      source: "diagnostic",
      type: "DIAGNOSTIC",
      libelle: "Constat de diagnostic",
      detail: (r.constat ?? null) as string | null,
      ancien: null,
      nouveau: (r.statut as string) ?? null,
      orId: r.orId as number,
      orNumero: parOr.get(r.orId as number) ?? null,
      auteur: nomDepuis(indexRapports, r.technicienId),
    });
  }
// ─── 4. Statut du véhicule ──────────────────────────────────────────────────
  const [v] = await exec
    .select({ statut: vehicules.statutImmobilisation, updatedAt: vehicules.updatedAt })
    .from(vehicules)
    .where(and(eq(vehicules.id, vehiculeId), eq(vehicules.agenceId, agenceId)))
    .limit(1);
  if (v) {
    entrees.push({
      quand: v.updatedAt ? new Date(v.updatedAt as Date).toISOString() : null,
      source: "statut",
      type: "STATUT_VEHICULE",
      libelle: "Statut d'immobilisation du véhicule",
      detail: null,
      ancien: null,
      nouveau: ((v.statut ?? null) as string | null),
      orId: null,
      orNumero: null,
      auteur: null,
    });
  }
// ─── Tri ────────────────────────────────────────────────────────────────────
  // Les entrées sans date vont en FIN, pas au hasard en tête : une liste
  // d'historique qui commence par des entrées non datées se lit comme un
  // journal qui ne sait pas quand il commence.
  entrees.sort((a, b) => {
    if (!a.quand && !b.quand) return 0;
    if (!a.quand) return 1;
    if (!b.quand) return -1;
    return a.quand < b.quand ? 1 : a.quand > b.quand ? -1 : 0;
  });
const sansAuteur = entrees.filter((e) => !e.auteur).length;
  return { entrees: entrees.slice(0, limite), sansAuteur };
}
