// ─── Moteur d'alertes Parking & Véhicules Immobilisés (GPJ) ───────────────────
// Pur (aucune dépendance DB) → testable ; applicatif (routers tRPC + tâche cron).
// Principe d'explicabilité : chaque alerte porte les critères ayant déclenché la règle.
// Tolérance aux dates NULL : si la règle n'a aucun ancrage temporel fiable, elle est ignorée
// (jamais de date inventée). Les règles statutaires (DOSSIER_INCOMPLET, TRANSFERT_A_ETUDIER) restent déclenchables.

export type ParkingAlertCodeName =
  | "PRET_POUR_SORTIE"
  | "ATTENTE_CLIENT"
  | "ATTENTE_PIECE"
  | "SANS_EVOLUTION"
  | "IMMOBILISATION_LONGUE"
  | "DOSSIER_INCOMPLET"
  | "TRANSFERT_A_ETUDIER";

export const NIVEAUX_ALERTE: Record<ParkingAlertCodeName, string> = {
  PRET_POUR_SORTIE: "HAUTE",
  ATTENTE_CLIENT: "MOYENNE",
  ATTENTE_PIECE: "HAUTE",
  SANS_EVOLUTION: "MOYENNE",
  IMMOBILISATION_LONGUE: "CRITIQUE",
  DOSSIER_INCOMPLET: "BASSE",
  TRANSFERT_A_ETUDIER: "MOYENNE",
};

export interface VehiculeAlertable {
  id: number;
  numRegistre: number;
  statut: string;
  marque?: string | null;
  modele?: string | null;
  immatriculation?: string | null;
  clientNom?: string | null;
  dateEntree: Date | string | null;
  dateDerniereAction: Date | string | null;
  dateDevis: Date | string | null;
  dateCommande: Date | string | null;
  dateFinTravaux: Date | string | null;
  dateDerniereRelance: Date | string | null;
  createdAt: Date | string | null;
}

export interface ParkingRuleConfig {
  seuilSansEvolutionJours: number;
  seuilImmobilisationLongueJours: number;
  seuilAttenteClientJours: number;
  seuilAttentePieceJours: number;
  seuilPretSortieJour: number;
  seuilTransfertJours: number;
}

export interface ParkingAlertDraft {
  code: ParkingAlertCodeName;
  niveau: string;
  message: string;
  criteres: Record<string, unknown>;
}

const JOUR = 86_400_000;

function toDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function joursDepuis(now: Date, date: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / JOUR);
}

function libelle(v: VehiculeAlertable): string {
  const nom = [v.marque, v.modele].filter(Boolean).join(" ") || `#${v.numRegistre}`;
  return `Véhicule n°${v.numRegistre} (${nom})`;
}

// ─── Règles individuelles ─────────────────────────────────────────────────────

function reglePretPourSortie(v: VehiculeAlertable, cfg: ParkingRuleConfig, now: Date): ParkingAlertDraft | null {
  if (v.statut !== "TERMINE_A_RECUPERER") return null;
  const fin = toDate(v.dateFinTravaux);
  const entree = toDate(v.dateEntree);
  const base = [fin, entree].sort((a, b) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0))[0];
  if (!base) return null;
  const jours = joursDepuis(now, base);
  if (jours < cfg.seuilPretSortieJour) return null;
  return {
    code: "PRET_POUR_SORTIE",
    niveau: NIVEAUX_ALERTE.PRET_POUR_SORTIE,
    message: `${libelle(v)} est prêt à sortir depuis ${jours} jour(s) : contacter le client.`,
    criteres: { statut: v.statut, depuisJours: jours, seuilJours: cfg.seuilPretSortieJour, base: base.toISOString(), dateFinTravaux: fin?.toISOString() ?? null },
  };
}

function regleAttenteClient(v: VehiculeAlertable, cfg: ParkingRuleConfig, now: Date): ParkingAlertDraft | null {
  if (v.statut !== "EN_ATTENTE_DEVIS") return null;
  const base = toDate(v.dateDevis) ?? toDate(v.dateEntree);
  if (!base) return null;
  const jours = joursDepuis(now, base);
  if (jours < cfg.seuilAttenteClientJours) return null;
  return {
    code: "ATTENTE_CLIENT",
    niveau: NIVEAUX_ALERTE.ATTENTE_CLIENT,
    message: `${libelle(v)} attend une décision client depuis ${jours} jour(s).`,
    criteres: { statut: v.statut, depuisJours: jours, seuilJours: cfg.seuilAttenteClientJours, base: base.toISOString(), dateDevis: toDate(v.dateDevis)?.toISOString() ?? null },
  };
}

function regleAttentePiece(v: VehiculeAlertable, cfg: ParkingRuleConfig, now: Date): ParkingAlertDraft | null {
  if (v.statut !== "EN_ATTENTE_PIECE") return null;
  const base = toDate(v.dateCommande) ?? toDate(v.dateDerniereAction) ?? toDate(v.dateEntree);
  if (!base) return null;
  const jours = joursDepuis(now, base);
  if (jours < cfg.seuilAttentePieceJours) return null;
  return {
    code: "ATTENTE_PIECE",
    niveau: NIVEAUX_ALERTE.ATTENTE_PIECE,
    message: `${libelle(v)} attend une pièce depuis ${jours} jour(s) (commande/action ${base.toISOString()}).`,
    criteres: { statut: v.statut, depuisJours: jours, seuilJours: cfg.seuilAttentePieceJours, base: base.toISOString(), dateCommande: toDate(v.dateCommande)?.toISOString() ?? null },
  };
}

function regleSansEvolution(v: VehiculeAlertable, cfg: ParkingRuleConfig, now: Date): ParkingAlertDraft | null {
  if (v.statut === "SORTI") return null;
  const base = toDate(v.dateDerniereAction) ?? toDate(v.createdAt) ?? toDate(v.dateEntree);
  if (!base) return null;
  const jours = joursDepuis(now, base);
  if (jours < cfg.seuilSansEvolutionJours) return null;
  return {
    code: "SANS_EVOLUTION",
    niveau: NIVEAUX_ALERTE.SANS_EVOLUTION,
    message: `${libelle(v)} sans évolution depuis ${jours} jour(s).`,
    criteres: { statut: v.statut, depuisJours: jours, seuilJours: cfg.seuilSansEvolutionJours, base: base.toISOString(), dateDerniereAction: toDate(v.dateDerniereAction)?.toISOString() ?? null },
  };
}

function regleImmobilisationLongue(v: VehiculeAlertable, cfg: ParkingRuleConfig, now: Date): ParkingAlertDraft | null {
  if (v.statut === "SORTI") return null;
  const base = toDate(v.dateEntree) ?? toDate(v.createdAt);
  if (!base) return null;
  const jours = joursDepuis(now, base);
  if (jours < cfg.seuilImmobilisationLongueJours) return null;
  return {
    code: "IMMOBILISATION_LONGUE",
    niveau: NIVEAUX_ALERTE.IMMOBILISATION_LONGUE,
    message: `${libelle(v)} immobilisé depuis ${jours} jour(s) (seuil ${cfg.seuilImmobilisationLongueJours}j).`,
    criteres: { statut: v.statut, depuisJours: jours, seuilJours: cfg.seuilImmobilisationLongueJours, base: base.toISOString() },
  };
}

function regleDossierIncomplet(v: VehiculeAlertable, _cfg: ParkingRuleConfig, _now: Date): ParkingAlertDraft | null {
  if (v.statut !== "DONNEES_INCOMPLETES") return null;
  return {
    code: "DOSSIER_INCOMPLET",
    niveau: NIVEAUX_ALERTE.DOSSIER_INCOMPLET,
    message: `${libelle(v)} : dossier incomplet (informations client/immatriculation manquantes à compléter).`,
    criteres: { statut: v.statut },
  };
}

function regleTransfert(v: VehiculeAlertable, cfg: ParkingRuleConfig, now: Date): ParkingAlertDraft | null {
  if (v.statut !== "A_TRANSFERER") return null;
  return {
    code: "TRANSFERT_A_ETUDIER",
    niveau: NIVEAUX_ALERTE.TRANSFERT_A_ETUDIER,
    message: `${libelle(v)} marqué à transférer : étudier la destination (${cfg.seuilTransfertJours}j seuil de lassitude).`,
    criteres: { statut: v.statut, seuilTransfertJours: cfg.seuilTransfertJours, joursImmobilisation: toDate(v.dateEntree) ? joursDepuis(now, toDate(v.dateEntree)!) : null },
  };
}

const REGLES: ((v: VehiculeAlertable, c: ParkingRuleConfig, n: Date) => ParkingAlertDraft | null)[] = [
  reglePretPourSortie,
  regleAttenteClient,
  regleAttentePiece,
  regleSansEvolution,
  regleImmobilisationLongue,
  regleDossierIncomplet,
  regleTransfert,
];

// ─── API ──────────────────────────────────────────────────────────────────────

export function computeParkingAlerts(vehicle: VehiculeAlertable, config: ParkingRuleConfig, now = new Date()): ParkingAlertDraft[] {
  const drafts: ParkingAlertDraft[] = [];
  for (const regele of REGLES) {
    const draft = regele(vehicle, config, now);
    if (draft) drafts.push(draft);
  }
  return drafts;
}

export const DEFAULT_PARKING_CONFIG_SEUILS: ParkingRuleConfig = {
  seuilSansEvolutionJours: 15,
  seuilImmobilisationLongueJours: 90,
  seuilAttenteClientJours: 15,
  seuilAttentePieceJours: 15,
  seuilPretSortieJour: 3,
  seuilTransfertJours: 60,
};