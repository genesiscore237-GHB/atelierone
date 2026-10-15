/**
 * LOT P0.3 — GARDES SUR LES TRAVAUX
 * ================================
 *
 * Constat (audit du 2026-10-15) : la garde « travaux non terminés » de
 * `or.restituerVehicule` ne vérifiait **aucune ligne de travaux**. Elle
 * contrôlait `ordres_reparation.statut === "PRET_A_LIVRER"`, c'est-à-dire
 * l'état du DOSSIER, et son message annonçait pourtant l'état des travaux.
 *
 * `or.validerControleQualite` ne consultant pas davantage les lignes : on
 * pouvait donc faire passer un dossier en `PRET_A_LIVRER` avec dix lignes en
 * `a_faire`, puis le restituer. Le véhicule partait avec la moitié du travail
 * non faite, sans que rien ne bronche.
 *
 * Ces règles vivent ici, et non dans les routeurs : c'est la même cause racine
 * que le lot U0a — une règle recopiée par écran diverge de sa voisine, et
 * personne ne voit laquelle.
 */

import { and, eq, ne, inArray, or as ou } from "drizzle-orm";
import { lignesOrdreReparation } from "@atelierone/db";
import { ligneEstReglee } from "./atelier-service";

type Exec = any;

export type LigneNonReglee = { id: number; libelle: string; statut: string; raison: string };

/**
 * Lignes de travaux d'un dossier qui ne sont pas réglées.
 *
 * Une ligne est signalée si son statut n'est pas terminal (`fait`/`valide`)
 * **ou** si elle est bloquée : une ligne bloquée avec un motif est
 * précisément le cas que le chef d'atelier doit trancher avant de rendre le
 * véhicule.
 *
 * Ne renvoie que ce qui bloque — pas la liste complète. Un contrôle de
 * restitution qui renverrait 40 lignes serait illisible dans le message
 * d'erreur ; on plafonne et on annonce le reste.
 */
export async function lignesNonReglees(exec: Exec, orId: number): Promise<LigneNonReglee[]> {
  const lignes = (await exec
    .select({
      id: lignesOrdreReparation.id,
      libelle: lignesOrdreReparation.libelle,
      quantite: lignesOrdreReparation.quantite,
      statut: lignesOrdreReparation.statut,
      bloque: lignesOrdreReparation.bloque,
      raisonBlocage: lignesOrdreReparation.raisonBlocageLigne,
    })
    .from(lignesOrdreReparation)
    .where(eq(lignesOrdreReparation.ordreId, orId))) as unknown as {
      id: number;
      libelle: string | null;
      quantite: number | null;
      statut: string | null;
      bloque: boolean | null;
      raisonBlocage: string | null;
    }[];

  return lignes
    .filter((l) => !ligneEstReglee(l.statut) || l.bloque === true)
    .map((l) => ({
      id: Number(l.id),
      libelle: (l.libelle ?? "(sans désignation)").slice(0, 80),
      statut: l.statut ?? "a_faire",
      raison:
        l.bloque === true && l.raisonBlocage
          ? `bloquée — ${l.raisonBlocage}`
          : l.bloque === true
            ? "bloquée"
            : `statut « ${l.statut ?? "a_faire"} »`,
    }));
}

/**
 * Message d'erreur destiné à l'agent : il nomme les travaux fautifs.
 *
 * Un message « travaux non terminés » sans détail oblige l'agent à deviner
 * lesquels. Un message qui les nomme se traite en trente secondes.
 */
export function messageTravauxNonTermines(bloquantes: LigneNonReglee[]): string {
  const AFFICHAGE_MAX = 5;
  const liste = bloquantes
    .slice(0, AFFICHAGE_MAX)
    .map((l) => `• ${l.libelle} (${l.raison})`)
    .join("\n");
  const reste = bloquantes.length - AFFICHAGE_MAX;
  return reste > 0 ? `${liste}\n… et ${reste} autre(s).` : liste;
}

/**
 * Lignes dont l'autorisation client n'a pas été obtenue.
 *
 * Question distincte de « le travail est-il fait ? » : une ligne peut être
 * techniquement terminée et n'avoir jamais été autorisée à être facturée.
 * Une restitution ne doit pas considers cela comme bloquant — c'est l'objet
 * de la garde financière — mais l'appelant peut vouloir l'afficher.
 */
export async function lignesNonAutorisees(exec: Exec, orId: number): Promise<number> {
  const lignes = (await exec
    .select({ id: lignesOrdreReparation.id })
    .from(lignesOrdreReparation)
    .where(
      and(
        eq(lignesOrdreReparation.ordreId, orId),
        ne(lignesOrdreReparation.statutAutorisation, "AUTORISE"),
      ),
    )) as unknown as { id: number }[];
  return lignes.length;
}