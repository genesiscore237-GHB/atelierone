/**
 * LOT U0a — RÈGLES VÉHICULE, SOURCE UNIQUE DE VÉRITÉ.
 *
 * Constat (inventaire U0) : trois écrans créent un véhicule, avec trois
 * comportements divergents.
 *
 *   /atelier/reception → or.receptionner : RÉCONCILIE par plaque normalisée,
 *                                 conserve le propriétaire historique (RD4)
 *   /garage/vehicules  → garage.create      : lie au canonique, aucun client
 *   /vehicules         → vehicules.create   : REFUSE la plaque en doublon
 *
 * Conséquence : un agent qui saisit la même plaque obtient un résultat
 * différent selon l'écran, et un type « benne » accepté à la réception est
 * refusé par `/vehicules` (champ `z.enum` fermé).
 *
 * Décision actée : les règles vivent dans UN service, plus dans les routeurs.
 * Un nouvel écran ne peut plus les contourner — c'est la cause racine des
 * bugs constatés, pas un détail de style.
 */

import { and, eq, sql } from "drizzle-orm";
import { vehicules, clients, immatNormaleCondition, immatNormPreferenceSql, normaliserImmat } from "@atelierone/db";
import { normaliserTelephone } from "@atelierone/db";

/** Champs qu'un enregistrement peut venir COMPLÉTER sans jamais écraser. */
export const CHAMPS_COMPLETABLES = [
  "marque",
  "modele",
  "version",
  "couleur",
  "numeroChassis",
  "carburant",
  "typeVehicule",
  "annee",
] as const;

export type ChampCompletable = (typeof CHAMPS_COMPLETABLES)[number];

/**
 * Clé TS du schéma Drizzle → nom réel de la colonne SQL.
 *
 * Indispensable : les noms du schéma (`typeVehicule`) et les noms de colonnes
 * (`type_vehicule`) diffèrent. Écrire la clé TS dans du SQL brut produit
 * « column typeVehicule does not exist » (erreur 42703).
 * Une clé inconnue lève une erreur explicite plutôt que de produire un SQL
 * invalide qui n'échouerait qu'à l'exécution.
 */
export const COLONNES_VEHICULE: Record<string, string> = {
  clientId: "client_id",
  numeroChassis: "numero_chassis",
  typeVehicule: "type_vehicule",
  chauffeurNom: "chauffeur_nom",
  chauffeurTelephone: "chauffeur_telephone",
  immatriculation: "immatriculation",
  immatNorm: "immat_norm",
  marque: "marque",
  modele: "modele",
  version: "version",
  annee: "annee",
  couleur: "couleur",
  carburant: "carburant",
  kilometrage: "kilometrage",
  statutImmobilisation: "statut_immobilisation",
  notes: "notes",
  longueur: "longueur",
  largeur: "largeur",
  hauteur: "hauteur",
  poids: "poids",
  dimensionsEstimees: "dimensions_estimees",
  siteId: "site_id",
  emplacementId: "emplacement_id",
  isActive: "is_active",
};

const nomColonne = (cle: string): string => {
  const col = COLONNES_VEHICULE[cle];
  if (!col) throw new Error(`Complétion véhicule : champ inconnu « ${cle} » (ajoutez-le à COLONNES_VEHICULE).`);
  return col;
};

export type ResultatResolutionVehicule = {
  vehiculeId: number;
  /** Faux si la plaque a retrouvé un véhicule déjà connu (réconciliation RD3). */
  cree: boolean;
  immatNorm: string;
  /** Propriétaire historique du véhicule réutilisé (null si nouveau / sans propriétaire). */
  clientIdHistorique: number | null;
};

type Exec = any;

const texteVide = (v: unknown): boolean => {
  if (v == null) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (typeof v === "number") return Number.isNaN(v);
  return false;
};

/**
 * Résout la plaque vers un véhicule existant, ou crée le véhicule.
 *
 * Règle unique appliquée par les TROIS points d'écriture :
 *   - la plaque est normalisée (RD1) et comparée sur sa forme normalisée, avec
 *     repli sur les lignes héritées dont `immat_norm` est NULL ;
 *   - un véhicule trouvé est RÉUTILISÉ (aucun doublon possible grâce à l'index
 *     partiel unique) et n'est JAMAIS écrasé : ses valeurs restent celles de
 *     l'historique (RD4 — pas d'écrasement silencieux) ;
 *   - les champs VIDE sont seuls complétés par ce que la saisie apporte.
 */
export async function resoudreOuCreerVehicule(
  exec: Exec,
  params: {
    agenceId: number;
    immatriculation: string;
    /** Propriétaire demandé par l'écran. Appliqué seulement si le véhicule n'en a pas. */
    clientId?: number | null;
    /**
     * RD4 — l'opérateur a coché « réassigner ce véhicule au nouveau client ».
     * Seul cas où le propriétaire historique EST remplacé : décision humaine
     * explicite, jamais déduite d'une simple saisie.
     */
    reassignerClient?: boolean;
    statutImmobilisation?: string | null;
    notes?: string | null;
    /** Champs de fiche proposés (marque, modèle, …) — complétés si vides. */
    fiche?: Partial<Record<ChampCompletable, unknown>> & Record<string, unknown>;
    /** Renseigne `immat_norm` et d'autres colonnes nonstandard du registre. */
    colonnesSup?: Record<string, unknown>;
  },
): Promise<ResultatResolutionVehicule> {
  const brut = (params.immatriculation ?? "").trim();
  const immatNorm = normaliserImmat(brut);
  if (!immatNorm) throw new Error("Immatriculation vide.");

  const [existant] = await exec
    .select({ id: vehicules.id, clientId: vehicules.clientId })
    .from(vehicules)
    .where(
      and(
        eq(vehicules.agenceId, params.agenceId),
        immatNormaleCondition(vehicules.immatriculation, params.immatriculation),
      ),
    )
    .orderBy(immatNormPreferenceSql(vehicules.immatNorm))
    .limit(1);

  const fiche = params.fiche ?? {};
  const clientIdDemande = params.clientId ?? null;

  if (existant) {
    // RD4 — le propriétaire historique est conservé ; le client demandé ne
    // comble que le cas d'un véhicule encore sans propriétaire, SAUF si
    // l'opérateur a explicitement demandé la réassignation.
    const aAppliquer: Record<string, unknown> = { ...fiche };
    const aForcer: string[] = [];
    if (clientIdDemande != null) {
      if (existant.clientId == null || (params.reassignerClient && existant.clientId !== clientIdDemande)) {
        aAppliquer.clientId = clientIdDemande;
        aForcer.push("clientId");
      }
    }
    await completerVehiculeSansEcrasement(exec, existant.id, aAppliquer, aForcer);
    await exec.update(vehicules).set({ updatedAt: new Date() } as any).where(eq(vehicules.id, existant.id));
    return {
      vehiculeId: existant.id,
      cree: false,
      immatNorm,
      clientIdHistorique: existant.clientId,
    };
  }

  const valeurs: Record<string, unknown> = {
    agenceId: params.agenceId,
    immatriculation: brut,
    immatNorm,
    clientId: clientIdDemande,
    statutImmobilisation: params.statutImmobilisation ?? "en_reception",
    notes: params.notes ?? null,
    ...fiche,
    ...(params.colonnesSup ?? {}),
  };
  const [cree] = await exec.insert(vehicules).values(valeurs as any).returning({ id: vehicules.id });
  return { vehiculeId: Number(cree.id), cree: true, immatNorm, clientIdHistorique: null };
}

/**
 * Ne complète que les champs VIDE d'un véhicule (RD4 : jamais d'écrasement).
 *
 * `clientId` et les colonnes numériques suivent la même règle : `0` et `null`
 * comptent comme « non renseigné ». Une valeur existante, même poorer, est
 * conservée — c'est l'historique qui fait foi, pas la saisie du jour.
 *
 * `forcer` est l'UNIQUE exception, et elle est explicite : la réassignation de
 * propriétaire demandée par l'opérateur (RD4). Sans ce paramètre, la règle «
 * ne pas écraser » rendrait la case à cocher de la réception inopérante.
 */
export async function completerVehiculeSansEcrasement(
  exec: Exec,
  vehiculeId: number,
  champs: Record<string, unknown>,
  forcer: string[] = [],
): Promise<string[]> {
  const cles = Object.keys(champs).filter((k) => champs[k] != null && !texteVide(champs[k]));
  if (!cles.length) return [];

  const lignes = (await exec.execute(sql`
    SELECT ${sql.raw(cles.map((k) => `"${nomColonne(k)}"`).join(", "))}
    FROM vehicules WHERE id = ${vehiculeId}`)) as unknown as Record<string, unknown>[];
  const actuel = lignes[0];
  if (!actuel) return [];

  const aRemplir: Record<string, unknown> = {};
  for (const k of cles) {
    const autorise = forcer.includes(k);
    if (autorise || texteVide(actuel[nomColonne(k)])) aRemplir[k] = champs[k];
  }
  if (!Object.keys(aRemplir).length) return [];

  await exec
    .update(vehicules)
    .set(aRemplir as any)
    .where(eq(vehicules.id, vehiculeId));
  return Object.keys(aRemplir);
}

/**
 * LOT R5 — marque le nouveau client ET le client existant qui partagent un
 * téléphone normalisé, SANS jamais les fusionner (D3 : pas d'invention).
 *
 * Utilisé par les écrans qui créent un client ; le garage n'a pas de client à
 * créer et n'appelle donc pas cette règle.
 */
export async function marquerDoublonClientTelephone(
  exec: Exec,
  params: { agenceId: number; nouveauClientId: number; telephone: string | null | undefined },
): Promise<boolean> {
  const telNorm = normaliserTelephone(params.telephone);
  if (!telNorm) return false;

  // NB : `[^0-9]` et non `\D` — l'échappement est réinterprété par le sql``
  // de Drizzle et produirait un NULL silencieux.
  const [memeTel] = await exec
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.agenceId, params.agenceId),
        sql`${clients.deletedAt} IS NULL`,
        sql`${clients.id} <> ${params.nouveauClientId}`,
        sql`regexp_replace(substring(regexp_replace(coalesce(${clients.telephone}, ''), '[^0-9]', '', 'g') from '^(?:237)?([0-9]{9})$'), '[^0-9]', '', 'g') = ${telNorm}`,
      ),
    )
    .limit(1);
  if (!memeTel) return false;

  await exec
    .update(clients)
    .set({ clientsDoublonnes: true } as any)
    .where(eq(clients.id, memeTel.id));
  await exec
    .update(clients)
    .set({ clientsDoublonnes: true } as any)
    .where(eq(clients.id, params.nouveauClientId));
  return true;
}
