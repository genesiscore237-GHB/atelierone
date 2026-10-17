/**
 * RELANCES — le vocabulaire, et ce qui mérite d'être relancé.
 *
 * ÉTAPE 5. La table `relances` existe depuis le début, avec quatorze colonnes
 * soigneusement pensées (canal, message, statut, `envoyee_le`, `lu_le`,
 * `cree_par`). Le module Relances du cahier des charges est écrit.
 *
 * Aucun code n'y écrivait. Zéro ligne, en local comme en production.
 *
 *
 * LE TROU, PRÉCISÉMENT
 *
 * Un dossier en `EN_ATTENTE_VALIDATION` — devis envoyé, client silencieux —
 * n'a aucun souvenir d'une relance. Personne ne sait si l'appel a eu lieu, qui
 * l'a fait, quand, ni ce qui a été dit.
 *
 * Ce n'est pas un manque de fonctionnalité. C'est un état d'attente **sans
 * observateur** : le dossier ne signale pas qu'il attend, et rien ne signale
 * qu'on l'a attendu. Un dossier peut rester là six mois sans que personne ne
 * pose la question, et la seule trace sera l'ancienneté du dossier — qu'on ne
 * sait pas lire parce qu'aucun écran ne la met en avant.
 *
 *
 * POURQUOI UN VOCABULAIRE À PART
 *
 * `type`, `canal` et `statut` étaient des `varchar` libres. Trois listes qui
 * n'en sont pas : rien n'en refusait une valeur inattendue.
 *
 * La migration `0014` les contraint. Elles sont définies ICI, et nulle part
 * ailleurs — deux listes concurrentes pour la même règle ont déjà produit une
 * dérive permanente entre le local et la production.
 */

/** Ce qu'on relance. */
export const TYPES_RELANCE = [
  "DEVIS",
  "PAIEMENT",
  "VEHICULE_NON_RESTITUE",
  "RAPPEL_RECEPTION",
  "AUTRE",
] as const;
export type TypeRelance = (typeof TYPES_RELANCE)[number];

export const TYPE_RELANCE_LABELS: Record<TypeRelance, string> = {
  DEVIS: "Devis en attente de réponse",
  PAIEMENT: "Paiement en attente",
  VEHICULE_NON_RESTITUE: "Véhicule non restitué",
  RAPPEL_RECEPTION: "Rappel de réception",
  AUTRE: "Autre",
};

/**
 * Par quel canal.
 *
 * `SYSTEME` signifie « produite par une règle automatique, pas par un humain ».
 * C'est ce qui distingue une relance que quelqu'un a décidée d'une relance
 * qu'un seuil a déclenchée — et la question « qui a appelé ? » n'a pas la même
 * réponse dans les deux cas.
 */
export const CANAUX_RELANCE = [
  "SYSTEME",
  "SMS",
  "WHATSAPP",
  "EMAIL",
  "APPEL",
  "SMS_RECOU",
  "EN_VISITE",
] as const;
export type CanalRelance = (typeof CANAUX_RELANCE)[number];

export const CANAL_RELANCE_LABELS: Record<CanalRelance, string> = {
  SYSTEME: "Automatique",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  APPEL: "Appel",
  SMS_RECOU: "SMS de relance",
  EN_VISITE: "En visite",
};

/** Où en est la relance. */
export const STATUTS_RELANCE = [
  "EN_ATTENTE",
  "ENVOYEE",
  "LUE",
  "REPONDUE",
  "SANS_REPONSE",
  "ECHEC",
  "CLOTUREE",
] as const;
export type StatutRelance = (typeof STATUTS_RELANCE)[number];

export const STATUT_RELANCE_LABELS: Record<StatutRelance, string> = {
  EN_ATTENTE: "Préparée, pas encore partie",
  ENVOYEE: "Envoyée",
  LUE: "Lue",
  REPONDUE: "Le client a répondu",
  SANS_REPONSE: "Sans réponse",
  ECHEC: "Échec d'envoi",
  CLOTUREE: "Clôturée",
};

/**
 * Un statut est-il définitif ?
 *
 * `REPONDUE` et `CLOTUREE` ferment la boucle : relancer un client qui a
 * répondu est du travail inutile, et fait disparaître de l'écran la seule
 * information qui compte — que le client a répondu, mais pas à quoi.
 */
export function relanceFermee(statut: string | null | undefined): boolean {
  return statut === "REPONDUE" || statut === "CLOTUREE";
}

export function estTypeRelance(v: string): v is TypeRelance {
  return (TYPES_RELANCE as readonly string[]).includes(v);
}
export function estCanalRelance(v: string): v is CanalRelance {
  return (CANAUX_RELANCE as readonly string[]).includes(v);
}
export function estStatutRelance(v: string): v is StatutRelance {
  return (STATUTS_RELANCE as readonly string[]).includes(v);
}

/* ──────────────────────────────────────────────────────────────────────────
 * CE QUI MÉRITE D'ÊTRE RELANCÉ
 * ────────────────────────────────────────────────────────────────────────── */

/** Un dossier attend une réponse : le devis est parti, le client se tait. */
export function attendReponseDevis(statut: string | null | undefined, devisAccepte: boolean | null): boolean {
  return statut === "EN_ATTENTE_VALIDATION" && devisAccepte !== true;
}

/** Un dossier est facturé et soldé : l'argent est entré. */
export function solde(dette: number | string | null | undefined): boolean {
  return Number(dette ?? 0) <= 0;
}

/** Un véhicule immobilisé depuis plus de `jours`. */
export function immobiliseDepuis(jours: number | null | undefined, seuil: number): boolean {
  return jours != null && jours > seuil;
}

/**
 * Seuil par défaut avant qu'une relance soit justifiée.
 *
 * Ce n'est pas un réglage arbitraire caché : un dossier qui attend depuis deux
 * jours n'a pas besoin d'un appel, et un agent qui voit « relance » au bout de
 * deux jours apprend à ne plus regarder l'écran.
 */
export const SEUIL_RELANCE_DEVIS_JOURS = 3;
export const SEUIL_RELANCE_IMMOBILISATION_JOURS = 21;

/** Une relance à faire maintenant, ou `null` si rien ne presse. */
export interface RelanceAttendue {
  type: TypeRelance;
  raison: string;
  /** Priorité d'affichage : 1 d'abord. */
  poids: number;
}

/**
 * Ce qu'il faut relancer sur ce dossier, dans l'ordre d'urgence.
 *
 * Fonction pure : elle ne touche pas la base. Ce qui est déjà relancé est un
 * PARAMÈTRE, pas une lecture — c'est ce qui la rend testable sans fixture, et
 * surtout ce qui permet à l'appelant de décider si une relance déjà partie
 * mérite d'en déclencher une autre.
 *
 * Le principe retenu : on ne signale que ce qui a un ÉCHÉANCIER. « Relancer
 * parce que le dossier existe » n'est pas une relance, c'est du bruit.
 */
export function relancesAttendues(
  or: { statut?: string | null; devisAccepte?: boolean | null; resteDu?: number | string | null } | null | undefined,
  vehicule: { joursImmobilisation?: number | null; statutImmobilisation?: string | null } | null | undefined,
  seuilDevis = SEUIL_RELANCE_DEVIS_JOURS,
  seuilImmo = SEUIL_RELANCE_IMMOBILISATION_JOURS,
): RelanceAttendue[] {
  const out: RelanceAttendue[] = [];

  if (or && !solde(or.resteDu)) {
    out.push({
      type: "PAIEMENT",
      raison: `Reste ${Number(or.resteDu).toLocaleString("fr-FR")} F à encaisser`,
      poids: 1,
    });
  }

  if (or && attendReponseDevis(or.statut, or.devisAccepte)) {
    out.push({
      type: "DEVIS",
      raison: `Devis en attente de réponse depuis ${seuilDevis} j ou plus`,
      poids: 2,
    });
  }

  // Un véhicule immobilisé sans dossier actif est le cas le plus inquiétant :
  // personne n'a rien à faire dessus, donc personne ne le verra.
  if (
    vehicule &&
    vehicule.statutImmobilisation &&
    vehicule.statutImmobilisation !== "sorti" &&
    immobiliseDepuis(vehicule.joursImmobilisation, seuilImmo)
  ) {
    out.push({
      type: "VEHICULE_NON_RESTITUE",
      raison: `Immobilisé depuis ${vehicule.joursImmobilisation} j (seuil ${seuilImmo} j)`,
      poids: 3,
    });
  }

  return out.sort((a, b) => a.poids - b.poids);
}