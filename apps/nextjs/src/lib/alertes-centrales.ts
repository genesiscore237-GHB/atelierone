/**
 * CENTRE D'ALERTES — le vocabulaire commun aux cinq sources.
 *
 * Atelier, parking, stock, finance et système ne parlent pas la même langue :
 * `RETARD`, `IMMOBILISATION_LONGUE`, `rupture`, `OVERDUE`, `HIGH`. Une vue
 * centrale qui afficherait ces codes côte à côte ne serait pas une vue
 * centrale : ce serait cinq écrans empilés, avec cinq échelles de gravité.
 *
 * Ce module est PUR (aucun import serveur, aucun import base) : il peut être
 * importé par un composant client et testé sans fixture. La règle de tri est
 * la seule décision métier ici — une alerte critique passe avant une alerte
 * haute, quel que soit son écran d'origine.
 */

export type SourceAlerte = "atelier" | "parking" | "stock" | "finance" | "systeme";
export type GraviteAlerte = "CRITIQUE" | "HAUTE" | "MOYENNE" | "BASSE";

export const ORDRE_GRAVITE: Record<GraviteAlerte, number> = {
  CRITIQUE: 0,
  HAUTE: 1,
  MOYENNE: 2,
  BASSE: 3,
};

export const GRAVITE_META: Record<GraviteAlerte, { label: string; badge: string }> = {
  CRITIQUE: { label: "Critique", badge: "bg-red-500/10 text-red-600 dark:text-red-400" },
  HAUTE: { label: "Haute", badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  MOYENNE: { label: "Moyenne", badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  BASSE: { label: "Basse", badge: "bg-muted text-muted-foreground" },
};

export const SOURCE_META: Record<SourceAlerte, { label: string; badge: string }> = {
  atelier: { label: "Atelier", badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  parking: { label: "Parking", badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  stock: { label: "Stock", badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  finance: { label: "Finance", badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  systeme: { label: "Système", badge: "bg-muted text-muted-foreground" },
};

/** L'atelier renvoie plusieurs codes pour un même dossier : le plus grave gagne. */
export function graviteAtelier(alertes: readonly string[] | null | undefined): GraviteAlerte {
  const codes = new Set(alertes ?? []);
  if (codes.has("RETARD") || codes.has("BLOQUE")) return "CRITIQUE";
  if (codes.has("P1")) return "HAUTE";
  if (codes.has("LONG")) return "MOYENNE";
  if (codes.has("PROCHE")) return "BASSE";
  return "MOYENNE";
}

/** Le parking utilise HAUTE / MOYENNE / BASSE, l'ancien écran INFO / WARNING / CRITIQUE. */
export function graviteParking(niveau: string | null | undefined): GraviteAlerte {
  switch ((niveau ?? "").toUpperCase()) {
    case "CRITIQUE":
      return "CRITIQUE";
    case "HAUTE":
      return "HAUTE";
    case "MOYENNE":
    case "WARNING":
      return "MOYENNE";
    case "BASSE":
    case "INFO":
      return "BASSE";
    default:
      return "MOYENNE";
  }
}

export function graviteStock(niveau: string | null | undefined): GraviteAlerte {
  switch ((niveau ?? "").toLowerCase()) {
    case "rupture":
      return "CRITIQUE";
    case "critique":
      return "HAUTE";
    case "faible":
      return "MOYENNE";
    default:
      return "MOYENNE";
  }
}

export function graviteSysteme(severite: string | null | undefined): GraviteAlerte {
  switch ((severite ?? "").toUpperCase()) {
    case "CRITICAL":
    case "CRITIQUE":
      return "CRITIQUE";
    case "HIGH":
    case "HAUTE":
      return "HAUTE";
    case "LOW":
    case "BASSE":
      return "BASSE";
    case "MEDIUM":
    case "MOYENNE":
    default:
      return "MOYENNE";
  }
}

function temps(date: Date | string | null | undefined): number {
  if (!date) return 0;
  const t = new Date(date).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Tri de lecture : gravité d'abord, puis la plus récente.
 *
 * À gravité égale, une alerte d'hier passe avant une alerte de la semaine
 * dernière. Sans ce second critère, l'ordre dépendrait de l'ordre de
 * concaténation des sources — c'est-à-dire de rien.
 */
export function trierAlertes<T extends { gravite: GraviteAlerte; date?: Date | string | null }>(
  alertes: readonly T[],
): T[] {
  return [...alertes].sort((a, b) => {
    const g = ORDRE_GRAVITE[a.gravite] - ORDRE_GRAVITE[b.gravite];
    if (g !== 0) return g;
    return temps(b.date) - temps(a.date);
  });
}
