/**
 * Relation client d'un dossier atelier : première réponse et réclamation.
 *
 * Ces deux informations sont des ÉVÉNEMENTS, pas des colonnes d'état. Un dossier
 * peut recevoir une réponse puis une réclamation, être résolu, puis rouvrir une
 * nouvelle réclamation : écraser un champ `statut` effacerait l'histoire. On lit
 * donc `or_historique`, qui est déjà append-only, et on reconstruit le dernier
 * cycle de réclamation.
 *
 * Module pur : importable par le serveur et par un composant client.
 */

export const CANAUX_REPONSE = ["APPEL", "SMS", "WHATSAPP", "EMAIL", "EN_PERSONNE", "DEVIS"] as const;
export type CanalReponse = (typeof CANAUX_REPONSE)[number];

export const CANAUX_REPONSE_SAISIE = ["APPEL", "SMS", "WHATSAPP", "EMAIL", "EN_PERSONNE"] as const;
export type CanalReponseSaisie = (typeof CANAUX_REPONSE_SAISIE)[number];

export const CANAL_LABELS: Record<CanalReponse, string> = {
  APPEL: "Appel téléphonique",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  EN_PERSONNE: "En personne",
  DEVIS: "Devis envoyé",
};

export const RECLAMATION_LABELS: Record<ReclamationStatut, string> = {
  OUVERTE: "Ouverte",
  EN_COURS: "En cours",
  RESOLUE: "Résolue",
};

export type ReclamationStatut = "OUVERTE" | "EN_COURS" | "RESOLUE";

export type EvenementRelation = {
  type: string;
  nouvelleValeur?: string | null;
  commentaire?: string | null;
  changeLe: Date | string;
};

export type SuiviRelation = {
  reponse: {
    canal: string;
    canalLabel: string;
    le: string;
    delaiHeures: number | null;
    commentaire: string | null;
  } | null;
  reclamation: {
    statut: ReclamationStatut;
    ouverteLe: string;
    motif: string | null;
    resolueLe: string | null;
    resolution: string | null;
  } | null;
};

export type SyntheseRelationClient = {
  reponses: number;
  delaiReponseMoyenHeures: number | null;
  reclamationsOuvertes: number;
};

function enDate(v: Date | string): Date | null {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function iso(v: Date | string): string {
  return (enDate(v) ?? new Date(0)).toISOString();
}

function heuresEntre(debut: Date | string | null | undefined, fin: Date | string): number | null {
  if (!debut) return null;
  const a = enDate(debut);
  const b = enDate(fin);
  if (!a || !b) return null;
  return Math.max(0, Math.round(((b.getTime() - a.getTime()) / 3600000) * 10) / 10);
}

/**
 * Reconstruit la première réponse et le DERNIER cycle de réclamation.
 *
 * Une réclamation est un cycle : `OUVERTE` -> éventuellement `EN_COURS` ->
 * `RESOLUE`. Une nouvelle `OUVERTE` après une résolution commence un nouveau
 * cycle ; le précédent reste dans l'historique mais n'est plus le statut courant.
 */
export function analyserSuiviRelation(
  dateOuverture: Date | string | null | undefined,
  historique: EvenementRelation[] = [],
): SuiviRelation {
  const tries = [...historique]
    .filter((e) => e && typeof e.type === "string")
    .sort((a, b) => (enDate(a.changeLe)?.getTime() ?? 0) - (enDate(b.changeLe)?.getTime() ?? 0));

  const reponseEvent = tries.find((e) => e.type === "REPONSE_CLIENT");
  const reponse = reponseEvent
    ? {
        canal: reponseEvent.nouvelleValeur ?? "AUTRE",
        canalLabel: CANAL_LABELS[reponseEvent.nouvelleValeur as CanalReponse] ?? reponseEvent.nouvelleValeur ?? "Autre",
        le: iso(reponseEvent.changeLe),
        delaiHeures: heuresEntre(dateOuverture, reponseEvent.changeLe),
        commentaire: reponseEvent.commentaire ?? null,
      }
    : null;

  const reclamations = tries.filter((e) => e.type === "RECLAMATION");
  let reclamation: SuiviRelation["reclamation"] = null;
  if (reclamations.length > 0) {
    // Le dernier cycle commence à la dernière ouverture. Si les anciennes
    // données n'ont pas d'événement OUVERTE, on garde tout : mieux vaut un
    // statut approximatif qu'une réclamation invisible.
    let debut = 0;
    for (let i = 1; i < reclamations.length; i++) {
      if (reclamations[i]!.nouvelleValeur === "OUVERTE") debut = i;
    }
    const cycle = reclamations.slice(debut);
    const premiere = cycle[0]!;
    const derniere = cycle[cycle.length - 1]!;
    const statut: ReclamationStatut =
      derniere.nouvelleValeur === "RESOLUE"
        ? "RESOLUE"
        : derniere.nouvelleValeur === "EN_COURS"
          ? "EN_COURS"
          : "OUVERTE";
    reclamation = {
      statut,
      ouverteLe: iso(premiere.changeLe),
      motif: premiere.commentaire ?? null,
      resolueLe: statut === "RESOLUE" ? iso(derniere.changeLe) : null,
      resolution: statut === "RESOLUE" ? (derniere.commentaire ?? null) : null,
    };
  }

  return { reponse, reclamation };
}

/** Durée lisible sans inventer de seuil : minutes, heures, puis jours. */
export function formatDelaiHeures(heures: number | null | undefined): string {
  if (heures == null || !Number.isFinite(heures)) return "—";
  if (heures < 1) return `${Math.max(1, Math.round(heures * 60))} min`;
  if (heures < 24) return `${heures.toFixed(1).replace(".", ",")} h`;
  const jours = Math.floor(heures / 24);
  const reste = Math.round(heures % 24);
  return reste > 0 ? `${jours} j ${reste} h` : `${jours} j`;
}
