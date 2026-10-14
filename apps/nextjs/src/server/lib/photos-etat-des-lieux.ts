/**
 * LOT U0c — État des lieux photographique VERSIONNÉ PAR VISITE.
 *
 * Problème métier : le registre parking écrase les photos (une photo par face,
 * portée par `parking_vehicles.photos`). C'est acceptable pour une fiche parc,
 * mais faux pour un atelier : à chaque intervention le véhicule change
 * d'aspect, et l'entrée doit être conservée comme preuve — sinon, en cas de
 * litige, on compare l'état de sortie à un état qui n'a jamais existé.
 *
 * Modèle retenu (décision actée) :
 *
 *  - Les photos sont portées par `or_photos.orId` : **une intervention = un jeu**.
 *    Aucune photo n'écrase une autre ; deux visites du même véhicule sont
 *    deux ensembles distincts et directement comparables.
 *  - `categorie` = face photographiée (AVANT, ARRIERE, COTE_GAUCHE, …).
 *  - `visite` = 'ENTREE' | 'SORTIE' (état des lieux à la réception / à la
 *    restitution). La comparaison se fait à l'intérieur d'une même visite.
 *  - `reprise_de` = photo recopiée d'une visite antérieure. Une reprise est
 *    tracée comme telle et ne remplace jamais une prise réelle : c'est une
 *    aide à l'agent, pas un faux état des lieux.
 *
 * Règle de qualité : `categoriesAttendues` sert à rappeler à l'agent ce qui
 * manque (règle UX du projet — pas d'action invisible).
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { orPhotos } from "@atelierone/db";

/** Faces photographiées à l'état des lieux (nomenclature alignée parking). */
export const CATEGORIES_ETAT_DES_LIEUX = [
  "AVANT",
  "ARRIERE",
  "COTE_GAUCHE",
  "COTE_DROIT",
  "INTERIEUR",
  "PLAQUE_IMMATRICULATION",
  "MOTEUR",
  "AUTRE",
] as const;

export type CategorieEtatDesLieu = (typeof CATEGORIES_ETAT_DES_LIEUX)[number];

export const LIBELLE_CATEGORIE: Record<string, string> = {
  AVANT: "Avant",
  ARRIERE: "Arrière",
  COTE_GAUCHE: "Côté gauche",
  COTE_DROIT: "Côté droit",
  INTERIEUR: "Intérieur",
  PLAQUE_IMMATRICULATION: "Plaque",
  MOTEUR: "Moteur",
  AUTRE: "Autre",
};

export const LIBELLE_VISITE: Record<string, string> = {
  ENTREE: "Entrée",
  SORTIE: "Sortie",
};

/** Étape de la visite à laquelle appartient la photo. */
export type Visite = "ENTREE" | "SORTIE";

/**
 * Poids maximal par photo APRÈS compression (octets).
 *
 * Le parking accepte 6 Mo. Ici l'image est stockée en base64 dans une colonne
 * `text` : 8 photos à 6 Mo font ~48 Mo par dossier, ce qui rend la base
 * inexploitable. Le cadrage est donc fait côté CLIENT (redimensionnement +
 * JPEG ~0,7) et cette limite est la garde-fou serveur : on refuse
 * explicitement au lieu de jeter le fichier en silence (corrige P2-5).
 */
export const PHOTO_MAX_TAILLE = 2_500_000;

export type PhotoEtatDesLieu = {
  id: number;
  categorie: string;
  visite: string;
  repriseDe: number | null;
  creePar: number | null;
  createdAt: Date;
  url: string;
};

export class PhotoTropLourdeError extends Error {
  constructor(laTaille: number) {
    super(`Photo trop lourde (${Math.round(laTaille / 1024)} Ko). Maximum ${Math.round(PHOTO_MAX_TAILLE / 1024)} Ko après compression.`);
    this.name = "PhotoTropLourdeError";
  }
}

const estBase64Valide = (url: unknown): url is string =>
  typeof url === "string" && (url.startsWith("data:image/") || url.startsWith("http"));

/**
 * Enregistre les photos d'un état des lieux pour une intervention.
 *
 * FUSION PAR FACE : seule la face écrite est remplacée, à l'intérieur du
 * couple (intervention, étape). Les autres faces et l'autre étape ne sont pas
 * touchées — sans quoi une mise à jour partielle ferait disparaître l'état
 * des lieux déjà constaté. Sur une réception neuve (rien en base) la fusion
 * équivaut à un remplacement complet : même résultat, une seule règle.
 *
 * Une reprise reste tracée via `reprise_de` et ne remplace jamais une prise
 * réelle déjà enregistrée pour cette face.
 */
export async function enregistrerPhotosEtatDesLieu(
  db: any,
  params: {
    orId: number;
    visite: Visite;
    creePar: number | null;
    photos: { categorie: string; url: string }[];
    /** Photos recopiées d'une visite antérieure : tracées via `reprise_de`. */
    reprises?: { categorie: string; url: string; sourceId: number }[];
  },
): Promise<number[]> {
  const brutes: { categorie: string; url: string }[] = [
    ...(params.photos ?? []),
    ...(params.reprises ?? []).map((r) => ({ categorie: r.categorie, url: r.url })),
  ];
  const pris: { categorie: string; url: string }[] = [];
  for (const p of brutes) {
    if (!estBase64Valide(p.url)) continue;
    if (p.url.length > PHOTO_MAX_TAILLE) throw new PhotoTropLourdeError(p.url.length);
    pris.push({ categorie: p.categorie || "AUTRE", url: p.url });
  }
  if (!pris.length) return [];

  // Une seule photo par face et par étape : on remplace UNIQUEMENT les faces
  // effectivement réécrites.
  const faces = [...new Set(pris.map((p) => p.categorie))];
  await db
    .delete(orPhotos)
    .where(
      and(
        eq(orPhotos.orId, params.orId),
        eq(orPhotos.visite, params.visite),
        inArray(orPhotos.categorie, faces),
      ),
    );

  // L'ordre d'insertion des reprises est conservé : les n premières entrées
  // correspondent à `photos`, les suivantes à `reprises`.
  const reprisesParIndex = new Map<number, number>();
  (params.reprises ?? []).forEach((r, i) => reprisesParIndex.set(i + (params.photos?.length ?? 0), r.sourceId));

  const inserees = await db
    .insert(orPhotos)
    .values(
      pris.map((p, i) => ({
        orId: params.orId,
        url: p.url,
        type: "PHOTO",
        creePar: params.creePar,
        categorie: p.categorie,
        visite: params.visite,
        repriseDe: reprisesParIndex.get(i) ?? null,
        photoPresente: true,
      })),
    )
    .returning({ id: orPhotos.id });
  return inserees.map((r: { id: number }) => r.id);
}

/** Photos d'une intervention pour une étape donnée. */
export async function listerPhotosEtatDesLieu(
  db: any,
  orId: number,
  visite?: Visite,
): Promise<PhotoEtatDesLieu[]> {
  const where = visite
    ? and(eq(orPhotos.orId, orId), eq(orPhotos.visite, visite))
    : eq(orPhotos.orId, orId);
  return (await db
    .select({
      id: orPhotos.id,
      categorie: orPhotos.categorie,
      visite: orPhotos.visite,
      repriseDe: orPhotos.repriseDe,
      creePar: orPhotos.creePar,
      createdAt: orPhotos.createdAt,
      url: orPhotos.url,
    })
    .from(orPhotos)
    .where(where)
    .orderBy(orPhotos.categorie)) as PhotoEtatDesLieu[];
}

/** Faces manquantes sur une étape (rappel actionnable, jamais un échec bloquant). */
export function categoriesManquantes(photos: { categorie: string }[]): string[] {
  const prises = new Set(photos.map((p) => p.categorie));
  return CATEGORIES_ETAT_DES_LIEUX.filter((c) => !prises.has(c));
}

/**
 * État des lieux de la visite PRÉCÉDENTE du même véhicule — la base de la
 * « reprise intelligente ». On ne remonte que les photos réellement prises
 * (jamais les reprises) : la référence doit être un état constaté, pas une
 * copie de copie.
 *
 * `vehiculeId` null → aucune visite antérieure, donc aucune reprise possible.
 */
export async function etatDesLieuVisitePrecedente(
  db: any,
  vehiculeId: number | null | undefined,
  avantOrId: number,
): Promise<{ orId: number; numero: string | null; dateReception: Date | null; photos: PhotoEtatDesLieu[] } | null> {
  if (!vehiculeId) return null;
  const lignes = (await db.execute(sql`
    SELECT o.id, o.numero, o.date_reception
    FROM ordres_reparation o
    WHERE o.vehicule_id = ${vehiculeId}
      AND o.id <> ${avantOrId}
      AND EXISTS (SELECT 1 FROM or_photos p WHERE p.or_id = o.id AND p.reprise_de IS NULL)
    ORDER BY o.date_reception DESC NULLS LAST, o.id DESC
    LIMIT 1`)) as unknown as { id: number; numero: string | null; date_reception: Date | null }[];
  const l = lignes[0];
  if (!l) return null;
  const photos = await listerPhotosEtatDesLieu(db, Number(l.id), "ENTREE");
  if (!photos.length) return null;
  return { orId: Number(l.id), numero: l.numero ?? null, dateReception: l.date_reception ?? null, photos };
}

/**
 * Comparaison entrée / sortie d'une MÊME visite — la pièce à conviction.
 * Renvoie, par face, l'état à l'entrée et (si prise) celui de la sortie.
 */
export async function comparerEntreeSortie(
  db: any,
  orId: number,
): Promise<{ categorie: string; entree: PhotoEtatDesLieu | null; sortie: PhotoEtatDesLieu | null }[]> {
  const photos = await listerPhotosEtatDesLieu(db, orId);
  const parFace = new Map<string, { entree: PhotoEtatDesLieu | null; sortie: PhotoEtatDesLieu | null }>();
  for (const c of CATEGORIES_ETAT_DES_LIEUX) parFace.set(c, { entree: null, sortie: null });
  for (const p of photos) {
    const ligne = parFace.get(p.categorie) ?? { entree: null, sortie: null };
    if (p.visite === "SORTIE") ligne.sortie = p;
    else ligne.entree = p;
    parFace.set(p.categorie, ligne);
  }
  return [...parFace.entries()].map(([categorie, v]) => ({ categorie, entree: v.entree, sortie: v.sortie }));
}

/** Supprime le jeu de photos d'une étape (correction avant clôture). */
export async function supprimerPhotosEtatDesLieu(db: any, orId: number, visite: Visite): Promise<void> {
  await db.delete(orPhotos).where(and(eq(orPhotos.orId, orId), eq(orPhotos.visite, visite)));
}
