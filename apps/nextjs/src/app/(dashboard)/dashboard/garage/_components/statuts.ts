// ─── Labels & couleurs module Parking (GPJ) ───────────────────────────────────

export const STATUTS_VEHICULE_OPTIONS = [
  "EN_PARKING",
  "EN_ATTENTE_DEVIS",
  "EN_ATTENTE_DIAGNOSTIC",
  "EN_ATTENTE_PIECE",
  "EN_TRAVAUX",
  "TERMINE_A_RECUPERER",
  "EN_VENTE",
  "ACCIDENTE",
  "A_TRANSFERER",
  "DONNEES_INCOMPLETES",
  "SORTI",
];

export const STATUTS_SPOT_OPTIONS = ["LIBRE", "OCCUPE", "BLOQUE", "RESERVE"];

export const ALERTE_CODES = [
  "PRET_POUR_SORTIE",
  "ATTENTE_CLIENT",
  "ATTENTE_PIECE",
  "SANS_EVOLUTION",
  "IMMOBILISATION_LONGUE",
  "DOSSIER_INCOMPLET",
  "TRANSFERT_A_ETUDIER",
];

export const STATUTS_VEHICULE_LABELS: Record<string, string> = {
  EN_PARKING: "En parking",
  EN_ATTENTE_DEVIS: "Attente devis",
  EN_ATTENTE_DIAGNOSTIC: "Attente diagnostic",
  EN_ATTENTE_PIECE: "Attente pièce",
  EN_TRAVAUX: "En travaux",
  TERMINE_A_RECUPERER: "Terminé à récupérer",
  EN_VENTE: "En vente",
  ACCIDENTE: "Accidenté",
  A_TRANSFERER: "À transférer",
  SORTI: "Sorti",
  DONNEES_INCOMPLETES: "Données incomplètes",
};

export const STATUTS_VEHICULE_COLORS: Record<string, string> = {
  EN_PARKING: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  EN_ATTENTE_DEVIS: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  EN_ATTENTE_DIAGNOSTIC: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  EN_ATTENTE_PIECE: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  EN_TRAVAUX: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  TERMINE_A_RECUPERER: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  EN_VENTE: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  ACCIDENTE: "bg-red-500/10 text-red-600 dark:text-red-400",
  A_TRANSFERER: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  SORTI: "bg-muted text-muted-foreground",
  DONNEES_INCOMPLETES: "bg-muted text-muted-foreground",
};

export const STATUTS_SPOT_LABELS: Record<string, string> = {
  LIBRE: "Libre",
  OCCUPE: "Occupé",
  BLOQUE: "Bloqué",
  RESERVE: "Réservé",
};

export const STATUTS_SPOT_COLORS: Record<string, string> = {
  LIBRE: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  OCCUPE: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  BLOQUE: "bg-red-500/10 text-red-600 dark:text-red-400",
  RESERVE: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export const ALERTE_NIVEAU_LABELS: Record<string, string> = {
  INFO: "Info",
  WARNING: "Attention",
  CRITIQUE: "Critique",
};

export const ALERTE_NIVEAU_COLORS: Record<string, string> = {
  INFO: "bg-muted text-muted-foreground",
  WARNING: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  CRITIQUE: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export const ALERTE_CODE_LABELS: Record<string, string> = {
  PRET_POUR_SORTIE: "Prêt pour sortie",
  ATTENTE_CLIENT: "Attente client",
  ATTENTE_PIECE: "Attente pièce",
  SANS_EVOLUTION: "Sans évolution",
  IMMOBILISATION_LONGUE: "Immobilisation longue",
  DOSSIER_INCOMPLET: "Dossier incomplet",
  TRANSFERT_A_ETUDIER: "Transfert à étudier",
};

// ─── Photos (faces du véhicule) ───────────────────────────────────────────────

export const PHOTO_CATEGORIES = [
  "AVANT",
  "ARRIERE",
  "COTE_GAUCHE",
  "COTE_DROIT",
  "INTERIEUR",
  "PLAQUE_IMMATRICULATION",
  "MOTEUR",
  "AUTRE",
] as const;

export const PHOTO_CATEGORIE_LABELS: Record<string, string> = {
  AVANT: "Avant",
  ARRIERE: "Arrière",
  COTE_GAUCHE: "Côté gauche",
  COTE_DROIT: "Côté droit",
  INTERIEUR: "Intérieur",
  PLAQUE_IMMATRICULATION: "Plaque",
  MOTEUR: "Moteur",
  AUTRE: "Autre",
};

export const PHOTO_MAX_TAILLE = 6;

export interface VehiculePhoto {
  url: string;
  categorie: string;
  date?: string | null;
  auteur?: string | null;
}

export const MOUVEMENT_LABELS: Record<string, string> = {
  ENTREE: "Entrée",
  SORTIE: "Sortie",
  DEPLACEMENT: "Déplacement",
  PLACEMENT: "Placement",
  TRANSFERT: "Transfert",
  ROTATION: "Rotation",
};

export const ZONE_TYPE_LABELS: Record<string, string> = {
  GRAND_PARKING: "Grand parking",
  HANGAR: "Hangar",
  PARKING_INTERMEDIAIRE: "Parking intermédiaire",
  PARKING_SECONDAIRE: "Parking secondaire",
  PONT_ELEVATEUR: "Pont élévateur",
  LAVAGE_GRAISSAGE: "Lavage / graissage",
  ZONE_TECHNIQUE: "Zone technique",
  BATIMENT: "Bâtiment",
  VOIE: "Voie",
  CIRCULATION: "Circulation",
  RESSOURCE_TRAVAIL: "Ressource de travail",
  AIRE_LIBRE: "Aire libre",
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
const dateHeureFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return dateFmt.format(typeof d === "string" ? new Date(d) : d);
}

export function formatDateHeure(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return dateHeureFmt.format(typeof d === "string" ? new Date(d) : d);
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR");
}

export function formatMeters(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} m`;
}