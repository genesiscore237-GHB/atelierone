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

export const FORMATS_EXPORT = ["xlsx", "csv", "pdf"] as const;
export type FormatExport = (typeof FORMATS_EXPORT)[number];

export const LIBELLES_FORMAT_EXPORT: Record<FormatExport, string> = {
  xlsx: "Excel (.xlsx)",
  csv: "CSV (.csv)",
  pdf: "PDF (.pdf)",
};

/**
 * Resolution d'une data URI d'image vers un Blob, sans passer par un canevas :
 * plus rapide et fidele a l'original (toDataURL a deja encode le JPEG).
 */
export async function dataUriVersBlob(dataUri: string): Promise<Blob | null> {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUri);
  if (!match) return null;
  const [, mime = "image/jpeg,base64", , data = ""] = match;
  const type = mime.replace(/;base64$/, "");
  const isBase64 = /;base64/.test(mime) || !match[2];
  try {
    if (!isBase64) {
      return new Blob([decodeURIComponent(data)], { type });
    }
    const binaire = atob(data);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return new Blob([octets], { type });
  } catch {
    return null;
  }
}

/**
 * Reduit une photo a une vignette pour l'integration dans un tableur ou un PDF.
 * La data URI d'origine peut faire plusieurs Mo : on refuse de l'integrer telle
 * quelle au fichier, ce qui ferait exploser le poids de celui-ci.
 */
export async function reduirePhoto(
  dataUri: string,
  largeurMax = 320,
  qualite = 0.72,
): Promise<{ bytes: ArrayBuffer; largeur: number; hauteur: number; type: string } | null> {
  const blob = await dataUriVersBlob(dataUri);
  if (!blob) return null;
  if (blob.type !== "image/jpeg" && blob.type !== "image/png" && blob.type !== "image/webp") return null;

  const bitmap = await createImageBitmap(blob);
  try {
    const ratio = Math.min(1, largeurMax / bitmap.width);
    const largeur = Math.max(1, Math.round(bitmap.width * ratio));
    const hauteur = Math.max(1, Math.round(bitmap.height * ratio));
    const canevas = document.createElement("canvas");
    canevas.width = largeur;
    canevas.height = hauteur;
    const ctx = canevas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
    const sortie = await new Promise<Blob | null>((resolve) => {
      canevas.toBlob((b) => resolve(b), "image/jpeg", qualite);
    });
    if (!sortie) return null;
    const buffer = await sortie.arrayBuffer();
    return { bytes: buffer, largeur, hauteur, type: sortie.type || "image/jpeg" };
  } finally {
    bitmap.close?.();
  }
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