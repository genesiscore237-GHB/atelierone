/**
 * LOT P0.1 — STATUT DU VÉHICULE, DÉRIVÉ ET NON ÉCRIT
 * ==================================================
 *
 * ## Le problème
 *
 * `vehicules.statut_immobilisation` était une **colonne dénormalisée écrite à
 * la main** par dix points d'entrée différents. Personne ne la déduisait.
 *
 * La machine d'états (`TRANSITIONS` dans `vehicule-service.ts`) n'était
 * appliquée que par `vehicules.changerStatut`. Les neuf autres écritures la
 * contournaient. Six désynchronisations en ont découlé, toutes reproductibles :
 *
 *  1. `garage.sortie` sortait le véhicule du parking sans toucher au véhicule
 *     canonique → invisible à l'atelier, alors qu'il était physicalement sorti.
 *  2. `garage.transfertRecevoir` rebattait en `en_reception` un véhicule dont
 *     le dossier était `EN_COURS` → l'atelier perdait la trace des travaux en
 *     cours à la réception d'un transfert.
 *  3. Un dossier `ANNULE` ou `ferme_definitif` ne remettait jamais le statut
 *     à jour → véhicule figé « en réparation » **indéfiniment**, sans aucun
 *     dossier ouvert. La fiche affichait alors « En réparation » juste au-dessus
 *     de « Aucun ordre de réparation en cours — le véhicule est disponible ».
 *  4. `or.receptionner` écrivait `en_reception` puis `en_reparation` quarante
 *     lignes plus bas : deux statuts écrits, un seul conservé.
 *  5. `or.receptionner` sautait `sorti → en_reception`, ce que la machine
 *     interdit — et donc le contrôle « véhicule sorti ⇒ ré-entrée » de
 *     `or.create`, que la réception est le chemin le plus fréquent.
 *  6. Un `statut_immobilisation` à `NULL` (produit par un ancien backfill)
 *     faisait échouer toute garde en silence : `transitionStatutVehiculeValide`
 *     répondait `true` pour n'importe quelle transition.
 *
 * ## La règle
 *
 * **Le statut du véhicule n'est plus écrit : il est DÉDUIT.**
 *
 * Un dossier d'atelier ouvert est la source la plus fiable — c'est lui qui sait
 * où en est le véhicule. À défaut, le registre parking. À défaut encore,
 * `en_reception`.
 *
 * La colonne reste en base : c'est un **cache**, alimenté par
 * `synchroniserStatutVehicule`, jamais lu comme une vérité. On le garde
 * parce que les listes et les KPI le jointurent partout — le remplacer par un
 * calcul à chaque lecture serait un coût sur chaque page.
 *
 * ## Ce qui change fonctionnellement
 *
 * `PRET_A_LIVRER` devient `terminee_attente_paiement` (le véhicule est fini,
 * il attend le client). C'est aussi ce qui **rétablit la chaîne d'alerte** :
 * le moteur parking ne se déclenche que sur `TERMINE_A_RECUPERER`, et aucun
 * code ne l'écrivait depuis le chemin atelier — un véhicule prêt depuis
 * trente jours ne produisait donc aucune alerte.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { ordresReparation, parkingVehicles } from "@atelierone/db";
import { immobilisationDepuisParking } from "./parking-vehicule-service";

type Exec = any;

/** Valeur de repli : un véhicule connu mais sans dossier ni ligne parking. */
export const STATUT_VEHICULE_PAR_DEFAUT = "en_reception";

/**
 * Statuts que le DÉROULEMENT de l'atelier sait produire.
 *
 * Un agent ne peut pas poser ces statuts à la main tant qu'un dossier est
 * ouvert : le dossier est alors plus savant que lui. Les statuts ABSENTS de
 * cette liste sont au contraire hors flux — `transfere_site2`,
 * `abandonne_contentieux`, `terminee_client_non_venu` — et restent posables
 * manuellement, avec motif : personne d'autre ne le fera à leur place.
 */
export const STATUTS_DERIVABLES = [
  "en_reception",
  "en_diagnostic",
  "en_reparation",
  "attente_validation_client",
  "attente_piece_locale",
  "piece_commandee_import",
  "terminee_attente_paiement",
  "sorti",
] as const;

/**
 * Statut d'un véhicule donné celui du dossier d'atelier ouvert.
 *
 * `null` = pas d équivalent franc. Le cas est traité explicitement en dessous
 * plutôt que laissé au hasard : un `?? "en_reception"` silencieux enverrait
 * un véhicule accidenté ou en vente vers « en réception », ce qui le ferait
 * réapparaître dans le parc d'atelier alors qu'il n'y est plus.
 */
const DOSSIER_VERS_IMMOBILISATION: Readonly<Record<string, string | null>> = {
  EN_ATTENTE_DIAGNOSTIC: "en_reception",
  EN_ATTENTE_VALIDATION_DIAGNOSTIC: "en_diagnostic",
  // `EN_COURS` couvre toute la phase active du dossier, du début des travaux
  // au milieu. « En réparation » est la valeur la moins fausse de la
  // nomenclature : les états fins (pièce, validation) ont leurs propres
  // statuts et sont traduits plus bas.
  EN_COURS: "en_reception",
  EN_ATTENTE_PIECES: "attente_piece_locale",
  EN_ATTENTE_VALIDATION: "attente_validation_client",
  // Contrôle qualité : le véhicule est toujours immobilisé à l'atelier.
  // L'ancien code le projetait en `en_reception`, ce qui le faisait passer
  // pour « pas encore pris en charge » alors qu'il sortait de l'atelier.
  CONTROLE_QUALITE: "en_reception",
  // LOT P0.1 — la chaîne d'alerte. Terminé, en attente du client.
  PRET_A_LIVRER: "terminee_attente_paiement",
  // Bloqué : le véhicule n'avance pas. La nomenclature n'a pas d'état
  // « bloqué » côté véhicule ; on le garde en réparation plutôt que de le
  // faire disparaître du parc.
  BLOQUE: "en_reception",
  // Terminaux : aucun équivalent. Le statut vient alors du parking.
  LIVRE: "sorti",
  ANNULE: null,
  ferme_definitif: null,
};

/**
 * Traduit un statut de dossier en statut d'immobilisation.
 * `null` quand le dossier ne dit rien d'utilisable sur le véhicule.
 */
export function immobilisationDepuisDossier(statutDossier: string | null | undefined): string | null {
  if (!statutDossier) return null;
  return DOSSIER_VERS_IMMOBILISATION[statutDossier] ?? null;
}

export type SourceStatut = "dossier" | "parking" | "defaut";

/**
 * Statut courant d'un vehicule, et la source dont il provient.
 *
 * Priorité : le dossier d'atelier le plus avancé, puis la ligne parking la plus
 * récente, puis `en_reception`.
 *
 * Pourquoi « le plus avancé » et pas « le premier trouvé » : un véhicule peut
 * avoir plusieurs dossiers (un annulé et un en cours). Prendre le premier
 * venu — c'est-à-dire l'ordre arbitraire de PostgreSQL — affichait le statut
 * d'un dossier clos à la place du dossier actif.
 */
export async function resoudreStatutVehicule(
  exec: Exec,
  vehiculeId: number,
  agenceId: number,
): Promise<{ statut: string; source: SourceStatut }> {
  // 1. Dossiers non clos.
  const dossiers = (await exec
    .select({ statut: ordresReparation.statut })
    .from(ordresReparation)
    .where(
      and(
        eq(ordresReparation.vehiculeId, vehiculeId),
        eq(ordresReparation.agenceId, agenceId),
        sql`${ordresReparation.statut} NOT IN ('LIVRE','ANNULE','ferme_definitif')`,
      ),
    )) as unknown as { statut: string }[];

  for (const d of dossiers) {
    const immo = immobilisationDepuisDossier(d.statut);
    if (immo) return { statut: immo, source: "dossier" };
  }

  // 2. Aucun dossier actif. Un dossier LIVRE dit quelque chose de precis : le
  //    vehicule est parti. Sans ce cas, un vehicule restitue retombait sur le
  //    repli `en_reception` : il reapparait dans le parc d'atelier alors que
  //    le client etait reparti avec.
  const livres = (await exec
    .select({ n: sql<number>`count(*)::int` })
    .from(ordresReparation)
    .where(
      and(
        eq(ordresReparation.vehiculeId, vehiculeId),
        eq(ordresReparation.agenceId, agenceId),
        eq(ordresReparation.statut, "LIVRE"),
      ),
    )) as unknown as { n: number }[];
  if (Number(livres[0]?.n ?? 0) > 0) return { statut: "sorti", source: "dossier" };

  // 3. Le registre parking.
  const lignes = (await exec
    .select({ statut: parkingVehicles.statut })
    .from(parkingVehicles)
    .where(and(eq(parkingVehicles.vehiculeId, vehiculeId), eq(parkingVehicles.agenceId, agenceId)))
    .orderBy(desc(parkingVehicles.id))) as unknown as { statut: string }[];

  for (const l of lignes) {
    const immo = immobilisationDepuisParking(l.statut);
    if (immo) return { statut: immo, source: "parking" };
  }

  // 4. Des lignes parking existent mais aucune ne se traduit (`EN_VENTE`,
  //    `ACCIDENTE`, `DONNEES_INCOMPLETES` n'ont aucun équivalent véhicule).
  //    Le véhicule n'est pas en atelier, mais on ne sait pas où il est : on
  //    ne l'invente pas. Statut vide = « ne rien écrire », ce qui préserve la
  //    dernière valeur connue au lieu de le ramener à `en_reception`.
  if (lignes.length > 0) return { statut: "", source: "parking" };

  return { statut: STATUT_VEHICULE_PAR_DEFAUT, source: "defaut" };
}

/**
 * Recalcule le statut et le propage aux DEUX registres.
 *
 * Unique point d'écriture autorisé sur `statut_immobilisation`.
 *
 * La projection vers le registre parking est faite ICI, et non par l'appelant.
 * Laisser deux appels à faire, c'est garantir que l'un des deux sera oublié —
 * et c'est exactement ce qui produisait les désynchronisations : six points
 * d'entrée appelaient la projection, aucun n'appelait les deux.
 *
 * Le `WHERE statut <> ...` évite une écriture quand rien n'a changé : sans
 * lui, chaque réception réécrivait la ligne du véhicule, ce qui faisait
 * remonter `updated_at` et déclenchait des invalidations de cache pour un
 * champ identique — donc du bruit pour rien.
 */
export async function synchroniserStatutVehicule(
  exec: Exec,
  vehiculeId: number | null | undefined,
  agenceId: number,
): Promise<string | null> {
  if (!vehiculeId) return null;
  const { statut } = await resoudreStatutVehicule(exec, vehiculeId, agenceId);

  // Statut vide = aucune source exploitable, et une écriture transformerait
  // une absence d'information en une affirmation (`en_reception`).
  if (!statut) return null;

  await exec.execute(sql`
    UPDATE vehicules
    SET statut_immobilisation = ${statut}, updated_at = now()
    WHERE id = ${vehiculeId}
      AND agence_id = ${agenceId}
      AND coalesce(statut_immobilisation, '') <> ${statut}`);

  await projeterParkingDepuisStatut(exec, vehiculeId, statut, agenceId);
  return statut;
}

/**
 * Met à jour le registre parking à partir du statut dérivé.
 *
 * Appelé après la synchronisation : les deux registres doivent raconter la
 * même histoire. C'est la projection existante (`projeterParkingDepuisImmo`)
 * qui s'en charge, sans équivalent pour les statuts « sans projection »
 * (transfert, contentieux).
 */
export async function projeterParkingDepuisStatut(
  exec: Exec,
  vehiculeId: number | null | undefined,
  statut: string | null,
  agenceId?: number,
): Promise<void> {
  if (!vehiculeId || !statut) return;
  const cible = PARKING_POUR_IMMOBILISATION[statut];
  if (!cible) return;
  // Un véhicule peut avoir plusieurs passages. La projection ne concerne que
  // le passage ACTIF : écrire sur toutes les lignes ressuscitait les anciens
  // `SORTI` et transformait l'historique en doublons du présent.
  await exec.execute(sql`
    UPDATE parking_vehicles
    SET statut = ${cible}, date_derniere_action = now()
    WHERE vehicule_id = ${vehiculeId}
      ${agenceId != null ? sql`AND agence_id = ${agenceId}` : sql``}
      AND statut <> 'SORTI'
      AND id = (
        SELECT id FROM parking_vehicles
        WHERE vehicule_id = ${vehiculeId}
          ${agenceId != null ? sql`AND agence_id = ${agenceId}` : sql``}
          AND statut <> 'SORTI'
        ORDER BY id DESC
        LIMIT 1
      )
      AND statut <> ${cible}`);
}

/**
 * Projection statut immobilisation → statut parking.
 *
 * `sorti` en est ABSENT, volontairement.
 *
 * Sortir un véhicule n'est pas changer une étiquette : c'est libérer la
 * place, effacer la position et écrire un mouvement `SORTIE` — c'est le rôle
 * de `sortirVehiculeParking` (lot S1). La projection générique s'en contente de
 * poser `SORTI` sur la ligne ; appelée avant elle, elle faisait dire
 * « déjà sorti » à `sortirVehiculeParking`, qui n'écrivait alors plus aucun
 * mouvement et ne libérait aucune place.
 *
 * Cette projection ne couvre donc que les états d'IMMOBILISATION, et laisse
 * la sortie au service qui sait la faire entièrement.
 */
const PARKING_POUR_IMMOBILISATION: Readonly<Record<string, string>> = {
  en_reception: "EN_PARKING",
  en_diagnostic: "EN_ATTENTE_DIAGNOSTIC",
  en_reparation: "EN_TRAVAUX",
  attente_validation_client: "EN_ATTENTE_DEVIS",
  attente_piece_locale: "EN_ATTENTE_PIECE",
  piece_commandee_import: "EN_ATTENTE_PIECE",
  terminee_attente_paiement: "TERMINE_A_RECUPERER",
  terminee_client_non_venu: "TERMINE_A_RECUPERER",
};
