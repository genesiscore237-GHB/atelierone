export const STATUT_EMPLOYE_LABELS: Record<string, string> = {
  actif: "Actif",
  conge: "En congé",
  suspendu: "Suspendu",
  archive: "Archivé",
  sorti: "Sorti",
};

export const STATUT_EMPLOYE_COLORS: Record<string, string> = {
  actif: "text-success-foreground bg-success/10",
  conge: "text-warning-foreground bg-warning/10",
  suspendu: "text-destructive-foreground bg-destructive/10",
  archive: "text-muted-foreground bg-muted/10",
  sorti: "text-muted-foreground bg-muted/20",
};

export const STATUT_EMPLOYE_BADGE_COLORS: Record<string, string> = {
  actif: "bg-success/10 text-success-foreground",
  conge: "bg-warning/10 text-warning-foreground",
  suspendu: "bg-destructive/10 text-destructive-foreground",
  archive: "bg-muted text-muted-foreground",
  sorti: "bg-muted text-muted-foreground",
};

export const STATUT_EMPLOYE_OPTIONS = [
  { value: "actif", label: "Actif" },
  { value: "conge", label: "En congé" },
  { value: "suspendu", label: "Suspendu" },
  { value: "archive", label: "Archivé" },
  { value: "sorti", label: "Sorti" },
];

export const STATUT_EMPLOYE_OPTIONS_SANS_SORTI = STATUT_EMPLOYE_OPTIONS.filter((o) => o.value !== "sorti");

// R6 — statut administratif court piloté par le cycle de vie : conge/suspendu ne se saisissent
// plus manuellement (D-R6-01). La suspension est dérivée d'une situation ACTIF (impact contrat),
// le congé provient d'une demande approuvée.
export const STATUT_EMPLOYE_OPTIONS_SAISIE = STATUT_EMPLOYE_OPTIONS.filter((o) => o.value === "actif" || o.value === "archive");

export function statutLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return STATUT_EMPLOYE_LABELS[key] ?? key;
}

export function statutColor(key: string | null | undefined): string {
  if (!key) return "text-muted-foreground";
  return STATUT_EMPLOYE_COLORS[key] ?? "text-muted-foreground";
}

export function statutBadgeColor(key: string | null | undefined): string {
  if (!key) return "bg-muted text-muted-foreground";
  return STATUT_EMPLOYE_BADGE_COLORS[key] ?? "bg-muted text-muted-foreground";
}

export const TYPE_EMPLOYE_LABELS: Record<string, string> = {
  permanent: "CDI — Permanent",
  contractuel: "CDD — Contractuel",
  stagiaire: "Stagiaire",
  temporaire: "Temporaire / Saisonnier",
  apprenti: "Apprenti",
  prestataire: "Prestataire",
};

export function typeLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return TYPE_EMPLOYE_LABELS[key] ?? key;
}

export const TYPE_EMPLOYE_OPTIONS = Object.entries(TYPE_EMPLOYE_LABELS).map(([value, label]) => ({ value, label }));

export const MODE_PAIE_OPTIONS = [
  { value: "mensuel", label: "Mensuel" },
  { value: "horaire", label: "Horaire" },
  { value: "journalier", label: "Journalier" },
  { value: "commission", label: "Commission" },
];

export const RAISON_LABELS: Record<string, string> = {
  recalcul: "Recalcul",
  adjustment: "Ajustement manuel",
  decision: "Décision de congé",
};

export function raisonLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return RAISON_LABELS[key] ?? key;
}