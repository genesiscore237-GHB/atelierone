/**
 * Catalogue des colonnes exportables du registre vehicules.
 *
 * Ce module est volontairement sans dependance serveur : il est importe a la
 * fois par la modale de selection (client) et par la procedure TRPC (serveur).
 *
 * Il joue aussi le role d'ALLOWLIST de securite : la procedure d'export ne
 * construit jamais une requete SQL a partir d'un nom de colonne recu du client,
 * elle accepte uniquement des `cle` presentes ici puis mappe vers une projection
 * SQL ecrite en dur.
 */

import type { LigneExportVehicule } from "@/lib/parking-export";

export type TypeChampExport = "texte" | "nombre" | "mesure" | "date" | "booleen" | "photos";

export interface ChampExportVehicule {
  /** Cle stable, seule valeur acceptee par l'API et utilisee comme cle de colonne. */
  cle: string;
  /** En-tete affiche dans le fichier et dans la modale. */
  label: string;
  /** Nom du groupe dans la modale de selection. */
  groupe: string;
  type: TypeChampExport;
  /** Inclus dans la selection par defaut. */
  defaut: boolean;
  /** Largeur indicative de colonne (en caracteres) pour les tableurs. */
  largeur: number;
  /** Aide contextuelle affichee dans la modale. */
  aide?: string;
}

export const GROUPES_EXPORT_VEHICULE = [
  "Identification",
  "Client",
  "Situation",
  "Localisation",
  "Dimensions",
  "Dates",
  "Photos",
  "Divers",
] as const;

export type GroupeExportVehicule = (typeof GROUPES_EXPORT_VEHICULE)[number];

export const CHAMPS_EXPORT_VEHICULE: ChampExportVehicule[] = [
  // --- Identification -----------------------------------------------------
  {
    cle: "numRegistre",
    label: "N° registre",
    groupe: "Identification",
    type: "nombre",
    defaut: true,
    largeur: 12,
  },
  {
    cle: "immatriculation",
    label: "Immatriculation",
    groupe: "Identification",
    type: "texte",
    defaut: true,
    largeur: 18,
    aide: "Plaque d'immatriculation.",
  },
  { cle: "marque", label: "Marque", groupe: "Identification", type: "texte", defaut: true, largeur: 16 },
  { cle: "modele", label: "Modèle", groupe: "Identification", type: "texte", defaut: true, largeur: 20 },
  { cle: "version", label: "Version", groupe: "Identification", type: "texte", defaut: false, largeur: 20 },
  { cle: "couleur", label: "Couleur", groupe: "Identification", type: "texte", defaut: false, largeur: 14 },
  { cle: "vin", label: "N° de châssis (VIN)", groupe: "Identification", type: "texte", defaut: false, largeur: 22 },

  // --- Client -------------------------------------------------------------
  { cle: "clientNom", label: "Client", groupe: "Client", type: "texte", defaut: true, largeur: 26 },
  {
    cle: "clientTelephone",
    label: "Téléphone client",
    groupe: "Client",
    type: "texte",
    defaut: true,
    largeur: 18,
    aide: "Affiché comme texte pour conserver les zéros initiaux.",
  },

  // --- Situation ----------------------------------------------------------
  { cle: "statut", label: "Statut", groupe: "Situation", type: "texte", defaut: true, largeur: 16 },
  {
    cle: "motif",
    label: "Motif",
    groupe: "Situation",
    type: "texte",
    defaut: false,
    largeur: 22,
    aide: "Raison de la sortie ou du blocage.",
  },
  {
    cle: "provenance",
    label: "Provenance",
    groupe: "Situation",
    type: "texte",
    defaut: false,
    largeur: 30,
    aide: "Trace du registre d'origine (verbatim).",
  },

  // --- Localisation -------------------------------------------------------
  {
    cle: "site",
    label: "Site",
    groupe: "Localisation",
    type: "texte",
    defaut: true,
    largeur: 20,
    aide: "Nom du site de rattachement.",
  },
  { cle: "zone", label: "Zone", groupe: "Localisation", type: "texte", defaut: true, largeur: 20 },
  { cle: "spot", label: "Emplacement", groupe: "Localisation", type: "texte", defaut: true, largeur: 18 },
  {
    cle: "position",
    label: "Position (X, Y)",
    groupe: "Localisation",
    type: "texte",
    defaut: false,
    largeur: 20,
    aide: "Centre géométrique de l'empreinte, en mètres, dans le repère du site.",
  },
  {
    cle: "positionne",
    label: "Positionné ?",
    groupe: "Localisation",
    type: "booleen",
    defaut: false,
    largeur: 14,
    aide: "OUI si le véhicule a une position sur le plan.",
  },

  // --- Dimensions ---------------------------------------------------------
  { cle: "longueur", label: "Longueur (m)", groupe: "Dimensions", type: "mesure", defaut: false, largeur: 14 },
  { cle: "largeur", label: "Largeur (m)", groupe: "Dimensions", type: "mesure", defaut: false, largeur: 13 },
  { cle: "hauteur", label: "Hauteur (m)", groupe: "Dimensions", type: "mesure", defaut: false, largeur: 13 },
  { cle: "poids", label: "Poids (kg)", groupe: "Dimensions", type: "mesure", defaut: false, largeur: 14 },
  {
    cle: "dimensionsEstimees",
    label: "Dimensions estimées",
    groupe: "Dimensions",
    type: "booleen",
    defaut: false,
    largeur: 18,
    aide: "OUI si les dimensions sont estimées plutôt que relevées.",
  },

  // --- Dates --------------------------------------------------------------
  { cle: "dateEntree", label: "Entrée", groupe: "Dates", type: "date", defaut: true, largeur: 14 },
  {
    cle: "dateDerniereAction",
    label: "Dernière action",
    groupe: "Dates",
    type: "date",
    defaut: false,
    largeur: 16,
  },
  { cle: "dateDevis", label: "Devis", groupe: "Dates", type: "date", defaut: false, largeur: 14 },
  { cle: "dateCommande", label: "Commande", groupe: "Dates", type: "date", defaut: false, largeur: 14 },
  { cle: "dateFinTravaux", label: "Fin des travaux", groupe: "Dates", type: "date", defaut: false, largeur: 16 },
  {
    cle: "dateDerniereRelance",
    label: "Dernière relance",
    groupe: "Dates",
    type: "date",
    defaut: false,
    largeur: 16,
  },

  // --- Photos -------------------------------------------------------------
  {
    cle: "nbPhotos",
    label: "N° de photos",
    groupe: "Photos",
    type: "nombre",
    defaut: true,
    largeur: 12,
    aide: "Nombre de photos enregistrées pour le véhicule.",
  },
  {
    cle: "photos",
    label: "Photos",
    groupe: "Photos",
    type: "photos",
    defaut: true,
    largeur: 46,
    aide: "Photos intégrées au fichier. Coûte très vite de la mémoire : à utiliser avec parcimonie.",
  },

  // --- Divers -------------------------------------------------------------
  {
    cle: "notes",
    label: "Notes",
    groupe: "Divers",
    type: "texte",
    defaut: false,
    largeur: 40,
    aide: "Notes libres saisies sur la fiche.",
  },
];

const PAR_CLE = new Map(CHAMPS_EXPORT_VEHICULE.map((c) => [c.cle, c]));

export function getChampExport(cle: string): ChampExportVehicule | undefined {
  return PAR_CLE.get(cle);
}

/** Champs propositions par defaut (registre + situation + localisation + dates cles). */
export const CHAMPS_EXPORT_DEFAUT: string[] = CHAMPS_EXPORT_VEHICULE.filter((c) => c.defaut).map((c) => c.cle);

/**
 * Ne conserve que les cles reellement declarees et dedoublonne en conservant
 * l'ordre du catalogue : c'est la seule maniere dont le client peut choisir,
 * et elle borne le jeu de colonnes servi.
 */
export function normaliserChampsExport(cleDemandees: readonly string[] | undefined | null): string[] {
  if (!cleDemandees || cleDemandees.length === 0) return [...CHAMPS_EXPORT_DEFAUT];
  const demandees = new Set(cleDemandees);
  return CHAMPS_EXPORT_VEHICULE.filter((c) => demandees.has(c.cle)).map((c) => c.cle);
}

/** Le champ photos est le seul a produire des images : il pese en memoire. */
export function contientChampPhotos(cle: readonly string[]): boolean {
  return cle.includes("photos");
}

/** Nombre maximal de colonnes accepte par l'API. */
export const MAX_CHAMPS_EXPORT = 30;

/** Garde-fou : un registre entier ne doit pas faire exploser la memoire du navigateur. */
export const MAX_LIGNES_EXPORT = 500;

/** Limite quand photos incluses : eviter OOM / payload trop lourd. */
export const MAX_LIGNES_EXPORT_AVEC_PHOTOS = 50;

export const FORMATS_EXPORT = ["xlsx", "csv", "pdf"] as const;
export type FormatExport = (typeof FORMATS_EXPORT)[number];

export const LIBELLES_FORMAT_EXPORT: Record<FormatExport, string> = {
  xlsx: "Excel (.xlsx)",
  csv: "CSV (.csv)",
  pdf: "PDF (.pdf)",
};

/**
 * Type de retour d'audit pour une Data URI image décodée.
 */
export interface ImageDataAudit {
  blob: Blob;
  mimeTypeDeclared: string;
  base64LengthBefore: number;
  base64LengthAfter: number;
  byteLength: number;
  firstBytesHex: string;
  signature: "jpeg" | "png" | "webp" | "gif" | "unknown";
  isDoubleEncoded: boolean;
}

/**
 * Audit et décodage robuste d'une Data URI image vers un Blob.
 * Retourne le Blob + métadonnées de diagnostic.
 * Lance une erreur si la Data URI est invalide ou non décodable.
 */
export function dataUriVersBlobAudite(dataUri: string): ImageDataAudit {
  if (typeof dataUri !== "string" || dataUri.trim().length === 0) {
    throw new Error("Data URI vide ou invalide");
  }

  const trimmed = dataUri.trim();
  const match = trimmed.match(/^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([\s\S]+)$/i);

  if (!match) {
    throw new Error("Format Data URI image Base64 non reconnu");
  }

  let mimeTypeDeclared = match[1].toLowerCase();

  if (mimeTypeDeclared === "image/jpg") {
    mimeTypeDeclared = "image/jpeg";
  }

  let base64 = match[2]
    .replace(/[\r\n\t\s]/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const base64LengthBefore = match[2].length;
  const base64LengthAfter = base64.length;

  const remainder = base64.length % 4;

  if (remainder === 2) {
    base64 += "==";
  } else if (remainder === 3) {
    base64 += "=";
  } else if (remainder === 1) {
    throw new Error("Base64 invalide : longueur modulo 4 égale à 1");
  }

  let binary: string;

  try {
    binary = atob(base64);
  } catch {
    throw new Error("Base64 invalide : échec de décodage atob");
  }

  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const firstBytes = Array.from(bytes.slice(0, 32));

  const firstBytesHex = firstBytes
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");

  const isJpeg =
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;

  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;

  const isWebp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  const isGif =
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61;

  const signature =
    isJpeg ? "jpeg" :
    isPng ? "png" :
    isWebp ? "webp" :
    isGif ? "gif" :
    "unknown";

  const decodedTextPrefix = new TextDecoder()
    .decode(bytes.slice(0, 32))
    .toLowerCase();

  const isDoubleEncoded =
    decodedTextPrefix.startsWith("data:image/") ||
    decodedTextPrefix.startsWith("/9j/") ||
    decodedTextPrefix.startsWith("ivbor");

  return {
    blob: new Blob([bytes], {
      type: mimeTypeDeclared,
    }),
    mimeTypeDeclared,
    base64LengthBefore: match[2].length,
    base64LengthAfter: base64.length,
    byteLength: bytes.length,
    firstBytesHex: Array.from(bytes.slice(0, 32))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" "),
    signature,
    isDoubleEncoded,
  };
}

import { jpegAUnMarqueurFinal } from "@/lib/jpeg-utils";

/**
 * Charge une image depuis un Blob avec fallback : createImageBitmap puis HTMLImageElement.
 */
export type SourceImageChargee =
  | { kind: "bitmap"; value: ImageBitmap }
  | { kind: "html-image"; value: HTMLImageElement };

async function chargerImageAvecFallback(blob: Blob): Promise<SourceImageChargee> {
  try {
    const bitmap = await createImageBitmap(blob);
    return { kind: "bitmap", value: bitmap };
  } catch (bitmapError) {
    const objectUrl = URL.createObjectURL(blob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();

        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("HTMLImageElement n'a pas pu décoder l'image"));
        element.src = URL.createObjectURL(blob);
      });

      return { kind: "html-image", value: image };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

/**
 * Reduit une photo a une vignette pour l'integration dans un tableur ou un PDF.
 * Version robuste avec audit, fallback HTMLImageElement, et signature.
 */
export interface VignetteExportResult {
  bytes: ArrayBuffer;
  largeur: number;
  hauteur: number;
  type: string;
  sourceSignature: string;
  sourceMimeType: string;
  usedFallback: boolean;
}

export async function reduirePhoto(
  dataUri: string,
  largeurMax = 200,
  qualite = 0.72,
): Promise<VignetteExportResult | null> {
  let audit: ImageDataAudit;

  try {
    audit = dataUriVersBlobAudite(dataUri);
  } catch (e) {
    console.warn("[LIBRACORE_PHOTO_REDUCE] Data URI invalide", { error: e instanceof Error ? e.message : e, prefix: dataUri.slice(0, 60) });
    return null;
  }

  const jpegHasEndMarker = audit.signature === "jpeg" ? await jpegAUnMarqueurFinal(audit.blob) : false;

  console.info("[LIBRACORE_PHOTO_BINARY_AUDIT]", {
    dataUriPrefix: dataUri.slice(0, 60),
    dataUriLength: dataUri.length,
    mimeTypeDeclared: audit.mimeTypeDeclared,
    blobType: audit.blob.type,
    blobSize: audit.blob.size,
    base64LengthBefore: audit.base64LengthBefore,
    base64LengthAfter: audit.base64LengthAfter,
    firstBytesHex: audit.firstBytesHex,
    detectedSignature: audit.signature,
    isDoubleEncoded: audit.isDoubleEncoded,
    jpegHasEndMarker: audit.signature === "jpeg" ? jpegHasEndMarker : undefined,
  });

  if (audit.signature === "unknown" || audit.isDoubleEncoded) {
    console.warn("[LIBRACORE_PHOTO_REDUCE] signature inconnue ou double encodage", { signature: audit.signature, isDoubleEncoded: audit.isDoubleEncoded });
    return null;
  }

  let imageSource: SourceImageChargee;
  let usedFallback = false;

  try {
    const loaded = await chargerImageAvecFallback(audit.blob);
    imageSource = loaded;
    usedFallback = loaded.kind === "html-image";
  } catch (e) {
    console.warn("[LIBRACORE_PHOTO_REDUCE] Échec chargement image (bitmap + HTMLImageElement)", { error: e instanceof Error ? e.message : e });
    return null;
  }

  try {
    let largeur: number;
    let hauteur: number;

    if (imageSource.kind === "bitmap") {
      largeur = imageSource.value.width;
      hauteur = imageSource.value.height;
    } else {
      largeur = imageSource.value.naturalWidth;
      hauteur = imageSource.value.naturalHeight;
    }

    const ratio = Math.min(1, 200 / largeur);
    const largeurFinale = Math.max(1, Math.round(largeur * ratio));
    const hauteurFinale = Math.max(1, Math.round(hauteur * ratio));

    const canevas = document.createElement("canvas");
    canevas.width = largeurFinale;
    canevas.height = hauteurFinale;
    const ctx = canevas.getContext("2d");
    if (!ctx) {
      console.warn("[LIBRACORE_PHOTO_REDUCE] canvas getContext('2d') failed");
      return null;
    }
    ctx.imageSmoothingQuality = "high";

    if (imageSource.kind === "bitmap") {
      ctx.drawImage(imageSource.value, 0, 0, largeurFinale, hauteurFinale);
      imageSource.value.close?.();
    } else {
      ctx.drawImage(imageSource.value, 0, 0, largeurFinale, hauteurFinale);
    }

    const sortie = await new Promise<Blob | null>((resolve) => {
      canevas.toBlob((b) => resolve(b), "image/jpeg", 0.72);
    });

    if (!sortie) {
      console.warn("[LIBRACORE_PHOTO_REDUCE] canvas.toBlob returned null", { largeur: largeurFinale, hauteur: hauteurFinale });
      return null;
    }
    if (sortie.size === 0) {
      console.warn("[LIBRACORE_PHOTO_REDUCE] canvas.toBlob produced empty blob");
      return null;
    }

    const buffer = await sortie.arrayBuffer();
    if (buffer.byteLength === 0) {
      console.warn("[LIBRACORE_PHOTO_REDUCE] blob.arrayBuffer() empty");
      return null;
    }

    console.info("[LIBRACORE_PHOTO_REDUCE_OK]", {
      originalType: "image/jpeg",
      outputType: sortie.type,
      originalSize: audit.blob.size,
      outputSize: sortie.size,
      largeur: largeurFinale,
      hauteur: hauteurFinale,
      sourceSignature: audit.signature,
      sourceMimeType: audit.mimeTypeDeclared,
      usedFallback,
    });

    return {
      bytes: buffer,
      largeur: largeurFinale,
      hauteur: hauteurFinale,
      type: "image/jpeg",
      sourceSignature: audit.signature,
      sourceMimeType: audit.mimeTypeDeclared,
      usedFallback,
    };
  } finally {
    // Nothing to close for HTMLImageElement
  }
}

/**
 * Trouve une photo exploitable pour l'export selon l'ordre de priorité :
 * 1. Photo principale (isPrimary) dans vehicule.photos
 * 2. Première photo valide dans vehicule.photos
 * 3. Vignette de liste (photo) si disponible
 * 4. null si aucune photo exploitable
 */
export function trouverPhotoExportable(
  vehicule: LigneExportVehicule,
  listePhoto?: { url: string } | null
): string | null {
  // 1. Essayer la photo principale (isPrimary) dans photos
  if (vehicule.photos && vehicule.photos.length > 0) {
    const principale = vehicule.photos.find(p => (p as any).isPrimary);
    if (principale?.url) return principale.url;
    
    // 2. Première photo valide dans photos
    for (const photo of vehicule.photos) {
      if (photo?.url) return photo.url;
    }
  }

  // 3. Vignette de liste (photo) si disponible
  if (listePhoto?.url) return listePhoto.url;

  // 4. Aucune photo exploitable
  return null;
}

/** Nom de fichier normalise, sans accents ni caracteres indesirables. */
export function nomFichierExport(prefixe: string, extension: string, horodatage = new Date()): string {
  const suffixe = horodatage.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const prefixeClean = prefixe
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefixeClean || "export"}-${suffixe}.${extension}`;
}

/** Declenche le telechargement d'un blob sans passer par le presse-papiers. */
export function telechargerBlob(blob: Blob, nomFichier: string): void {
  const url = URL.createObjectURL(blob);
  // Méthode principale : navigation vers l'URL blob (fiable partout, pas de blocage)
  window.location.href = url;
  // Libération différée de l'URL objet (le navigateur a déjà commencé le téléchargement)
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}