/**
 * MODULE VÉHICULES & ATELIER V2 — MOTEUR DE PILOTAGE DU PARC (pur, sans DB).
 * Conforme au fichier client Gestion_Parc_Vehicules_Priorites_PRO.xlsx :
 * priorités P1-P4, 9 statuts, alertes automatiques, seuils, jours/retard.
 */

export const PRIORITES = ["P1", "P2", "P3", "P4"] as const;
export type Priorite = (typeof PRIORITES)[number];

export const PRIORITE_META: Record<Priorite, { libelle: string; couleur: string; badge: string; peutInterrompre: string }> = {
  P1: { libelle: "Critique / Engagement ferme", couleur: "#dc2626", badge: "bg-destructive/15 text-destructive", peutInterrompre: "P2/P3/P4" },
  P2: { libelle: "Haute priorité", couleur: "#f59e0b", badge: "bg-warning/15 text-warning-foreground", peutInterrompre: "P3/P4" },
  P3: { libelle: "Normale", couleur: "#16a34a", badge: "bg-success/15 text-success-foreground", peutInterrompre: "—" },
  P4: { libelle: "Basse / En attente", couleur: "#6b7280", badge: "bg-muted text-muted-foreground", peutInterrompre: "—" },
};

export const STATUTS_ATELIER = [
  "EN_ATTENTE_DIAGNOSTIC",
  "EN_COURS",
  "EN_ATTENTE_PIECES",
  "EN_ATTENTE_VALIDATION",
  "CONTROLE_QUALITE",
  "PRET_A_LIVRER",
  "BLOQUE",
  "LIVRE",
  "ANNULE",
] as const;

export const STATUT_LABELS: Record<string, string> = {
  EN_ATTENTE_DIAGNOSTIC: "En attente diagnostic",
  EN_COURS: "En cours",
  EN_ATTENTE_PIECES: "En attente pièces",
  EN_ATTENTE_VALIDATION: "En attente validation",
  CONTROLE_QUALITE: "Contrôle qualité",
  PRET_A_LIVRER: "Prêt à livrer",
  BLOQUE: "Bloqué",
  LIVRE: "Livré",
  ANNULE: "Annulé",
};

export const STATUT_BADGE: Record<string, string> = {
  EN_ATTENTE_DIAGNOSTIC: "bg-muted text-muted-foreground",
  EN_COURS: "bg-primary/15 text-primary",
  EN_ATTENTE_PIECES: "bg-warning/15 text-warning-foreground",
  EN_ATTENTE_VALIDATION: "bg-warning/15 text-warning-foreground",
  CONTROLE_QUALITE: "bg-sky-500/15 text-sky-400",
  PRET_A_LIVRER: "bg-success/15 text-success-foreground",
  BLOQUE: "bg-destructive/15 text-destructive",
  LIVRE: "bg-muted text-muted-foreground",
  ANNULE: "bg-destructive/10 text-destructive line-through",
};

export const RAISONS_BLOCAGE = [
  "Pièces manquantes",
  "Validation client",
  "Diagnostic incomplet",
  "Attente expertise",
  "Manque technicien",
  "Outillage",
  "Autre",
] as const;

export const MOTIFS_ENTREE = ["PANNE", "ENTRETIEN", "DIAGNOSTIC", "CARROSSERIE", "CONTROLE", "AUTRE"] as const;
export const MOTIF_ENTREE_LABELS: Record<string, string> = {
  PANNE: "Panne",
  ENTRETIEN: "Entretien / Révision",
  DIAGNOSTIC: "Diagnostic",
  CARROSSERIE: "Carrosserie / Sinistre",
  CONTROLE: "Contrôle",
  AUTRE: "Autre",
};

export const EMPLACEMENTS_DEFAUT = ["Réception", "Parc A", "Parc B", "Pont 1", "Pont 2", "Carrosserie", "Diagnostic"];

export const ALERTES = ["RETARD", "BLOQUE", "P1", "PROCHE", "LONG", "OK"] as const;
export type Alerte = (typeof ALERTES)[number];

export const ALERTE_META: Record<Alerte, { libelle: string; badge: string }> = {
  RETARD: { libelle: "RETARD", badge: "bg-destructive/15 text-destructive" },
  BLOQUE: { libelle: "BLOQUÉ", badge: "bg-destructive/15 text-destructive" },
  P1: { libelle: "P1", badge: "bg-destructive/15 text-destructive" },
  PROCHE: { libelle: "PROCHE", badge: "bg-warning/15 text-warning-foreground" },
  LONG: { libelle: "LONG", badge: "bg-warning/15 text-warning-foreground" },
  OK: { libelle: "OK", badge: "bg-success/15 text-success-foreground" },
};

/** Suggestion de priorité (validation manuelle par le Chef d'atelier). */
export function suggererPriorite(criteres: {
  clientAttend?: boolean;
  promesseJourJ?: boolean;
  securite?: boolean;
  slaFlotte?: boolean;
  comeback?: boolean;
  courtoisie?: boolean;
  promesseJ1?: boolean;
  clientImportant?: boolean;
  piecesDispo?: boolean;
  diagnosticTermine?: boolean;
  attentePieces?: boolean;
  attenteValidation?: boolean;
}): Priorite {
  if (criteres.clientAttend || criteres.promesseJourJ || criteres.securite || criteres.slaFlotte || criteres.comeback || criteres.courtoisie) return "P1";
  if (criteres.promesseJ1 || criteres.clientImportant || criteres.piecesDispo || criteres.diagnosticTermine) return "P2";
  if (criteres.attentePieces || criteres.attenteValidation) return "P4";
  return "P3";
}

export function joursImmobilisation(dateEntree: string | Date, aujourdhui: string | Date = new Date()): number {
  const debut = typeof dateEntree === "string" ? new Date(`${dateEntree.slice(0, 10)}T00:00:00`) : new Date(dateEntree);
  const fin = typeof aujourdhui === "string" ? new Date(`${aujourdhui.slice(0, 10)}T00:00:00`) : new Date(aujourdhui);
  const ms = fin.getTime() - debut.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export function retardJours(datePromesse: string | null | undefined, aujourdhui: string | Date = new Date()): number {
  if (!datePromesse) return 0;
  const promesse = new Date(`${datePromesse.slice(0, 10)}T00:00:00`);
  const fin = typeof aujourdhui === "string" ? new Date(`${aujourdhui.slice(0, 10)}T00:00:00`) : new Date(aujourdhui);
  return Math.max(0, Math.floor((fin.getTime() - promesse.getTime()) / 86400000));
}

export interface SeuilsAlerte {
  seuilPromesseJours: number;
  seuilImmobilisationJours: number;
  seuilBloqueJours: number;
}

/** Alerte(s) calculée(s) d'un véhicule du parc (priorité d'affichage : RETARD > BLOQUE > P1 > PROCHE > LONG > OK). */
export function calculerAlertes(params: {
  statut: string | null;
  priorite: string | null;
  datePromesse: string | null;
  dateEntree: string | Date;
  joursBloque?: number;
  seuils?: Partial<SeuilsAlerte>;
  aujourdhui?: string | Date;
}): { alertes: Alerte[]; principale: Alerte } {
  const seuils: SeuilsAlerte = {
    seuilPromesseJours: params.seuils?.seuilPromesseJours ?? 1,
    seuilImmobilisationJours: params.seuils?.seuilImmobilisationJours ?? 5,
    seuilBloqueJours: params.seuils?.seuilBloqueJours ?? 3,
  };
  const today = params.aujourdhui ?? new Date();
  const statut = params.statut ?? "EN_ATTENTE_DIAGNOSTIC";
  const priorite = (params.priorite ?? "P3") as Priorite;
  const jours = joursImmobilisation(params.dateEntree, today);
  const retard = retardJours(params.datePromesse, today);
  const termine = statut === "LIVRE" || statut === "ANNULE";

  const alertes: Alerte[] = [];
  if (!termine && retard > 0) alertes.push("RETARD");
  if (statut === "BLOQUE") alertes.push("BLOQUE");
  if (!termine && priorite === "P1") alertes.push("P1");
  if (!termine && params.datePromesse && !retard) {
    const restants = joursRestantsPromesse(params.datePromesse, today);
    if (restants <= seuils.seuilPromesseJours) alertes.push("PROCHE");
  }
  if (!termine && jours >= seuils.seuilImmobilisationJours) alertes.push("LONG");
  if (alertes.length === 0) alertes.push("OK");

  const ordre: Record<Alerte, number> = { RETARD: 0, BLOQUE: 1, P1: 2, PROCHE: 3, LONG: 4, OK: 5 };
  const principale = [...alertes].sort((a, b) => ordre[a] - ordre[b])[0];
  return { alertes, principale };
}

function joursRestantsPromesse(datePromesse: string, aujourdhui: string | Date): number {
  const promesse = new Date(`${datePromesse.slice(0, 10)}T00:00:00`);
  const fin = typeof aujourdhui === "string" ? new Date(`${aujourdhui.slice(0, 10)}T00:00:00`) : new Date(aujourdhui);
  return Math.ceil((promesse.getTime() - fin.getTime()) / 86400000);
}

const TRANSITIONS_ATELIER: Record<string, string[]> = {
  EN_ATTENTE_DIAGNOSTIC: ["EN_COURS", "EN_ATTENTE_PIECES", "EN_ATTENTE_VALIDATION", "BLOQUE", "ANNULE"],
  EN_COURS: ["EN_ATTENTE_PIECES", "EN_ATTENTE_VALIDATION", "CONTROLE_QUALITE", "BLOQUE", "ANNULE"],
  EN_ATTENTE_PIECES: ["EN_COURS", "BLOQUE", "ANNULE"],
  EN_ATTENTE_VALIDATION: ["EN_COURS", "BLOQUE", "ANNULE"],
  CONTROLE_QUALITE: ["PRET_A_LIVRER", "EN_COURS", "BLOQUE", "ANNULE"],
  PRET_A_LIVRER: ["LIVRE", "BLOQUE", "ANNULE"],
  BLOQUE: ["EN_COURS", "EN_ATTENTE_PIECES", "EN_ATTENTE_VALIDATION", "ANNULE"],
  LIVRE: [],
  ANNULE: [],
};

export function transitionStatutAtelierValide(de: string | null | undefined, vers: string, raison?: string | null): { ok: boolean; raison?: string } {
  if (!de) return { ok: true };
  const autorisees = TRANSITIONS_ATELIER[de] ?? [];
  if (!autorisees.includes(vers)) {
    return { ok: false, raison: `Transition « ${STATUT_LABELS[de] ?? de} → ${STATUT_LABELS[vers] ?? vers} » non autorisée.` };
  }
  if (vers === "BLOQUE" && !raison?.trim()) {
    return { ok: false, raison: "Le passage à BLOQUÉ exige une raison de blocage." };
  }
  if (vers === "ANNULE" && !raison?.trim()) {
    return { ok: false, raison: "L'annulation exige un motif." };
  }
  return { ok: true };
}

/** Mapping des anciens statuts vers les statuts du parc V2. */
export function migrerStatutLegacy(statut: string | null): string {
  const map: Record<string, string> = {
    ouvert: "EN_ATTENTE_DIAGNOSTIC",
    en_attente_diagnostic: "EN_ATTENTE_DIAGNOSTIC",
    en_cours: "EN_COURS",
    attente_piece: "EN_ATTENTE_PIECES",
    termine: "PRET_A_LIVRER",
    facture: "LIVRE",
    annule: "ANNULE",
  };
  return map[statut ?? ""] ?? statut ?? "EN_ATTENTE_DIAGNOSTIC";
}

/** Statuts facturables (un OR livré / prêt à livrer peut générer une facture). */
export const STATUTS_FACTURABLES = ["PRET_A_LIVRER", "LIVRE", "CONTROLE_QUALITE"] as const;

/** Charge d'un technicien : % de sa capacité (règle : ne pas dépasser 80 %). */
export function chargeTechnicien(vehiculesActifs: number, capacite = 5): { actifs: number; capacite: number; pourcent: number; depassement80: boolean } {
  const pourcent = capacite > 0 ? Math.round((vehiculesActifs / capacite) * 100) : 100;
  return { actifs: vehiculesActifs, capacite, pourcent, depassement80: pourcent > 80 };
}