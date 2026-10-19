/**
 * REVUE DE PARC — la règle métier, en un seul endroit.
 *
 * ÉTAPE 7. Ce fichier ne fait aucune requête : il décide **ce qui bloque un
 * véhicule**. Les écrans et le serveur l'appellent, personne ne recalcule.
 *
 *
 * POURQUOI UN SEUL ENDROIT
 *
 * La question « pourquoi ce véhicule ne bouge pas ? » se pose deux fois par
 * jour — en réunion, et dans la liste. Si chaque écran la recomposait à sa
 * façon, les deux réponses divergeraient, et l'agent qui compare la réunion à
 * l'écran ne saurait plus laquelle croire.
 *
 * C'est le même motif que la reception, la restitution et les deux
 * vocabulaires de statut : une règle, une définition, un test.
 *
 *
 * CE QUE « BLOQUÉ » SIGNIFIE — ET CE QUE ÇA NE SIGNIFIE PAS
 *
 * Un blocage est un **verdict** : quelque chose empêche le travail d'avancer,
 * et ce quelque chose se nomme. « La pièce manque » n'est pas un blocage :
 * c'est un fait. « La pièce X manque, commandée chez Y » en est un.
 *
 * Le système ne devine pas : il ne signale que ce qui est ÉCRIT quelque part.
 * Un dossier sans pièce demandée n'est pas « bloqué » — il n'est peut-être pas
 * encore arrivé là, et annoncer « en attente de pièces » sur un véhicule dont on
 * n'a pas encore fait le diagnostic serait un mensonge de plus.
 */

import type { TypeRelance } from "./relance-service";

/** Un blocage, nommé. */
export interface Blocage {
  /** `piece` | `diagnostic` | `devis` | `paiement` | `sous_traitance` | `immobilise` */
  code: string;
  /** La phrase qu'on lit en réunion. */
  libelle: string;
  /** 1 = ça bloque aujourd'hui. L'ordre de la réunion s'en sert. */
  poids: number;
}

export interface ContexteBlocage {
  /** Le dossier ouvert, s'il y en a un. */
  or?: {
    statut?: string | null;
    devisAccepte?: boolean | null;
    sousTraitanceStatut?: string | null;
    sousTraitanceFournisseur?: string | null;
    sousTraitanceRetourPrevu?: string | null;
  } | null;
  /** Les pièces demandées, avec leur libellé et le motif du manque. */
  piecesManquantes?: Array<{ libelle: string; motif?: string | null }>;
  /** Le diagnostic : est-il fait, soumis, validé ? */
  diagnostic?: { statut?: string | null } | null;
  /** Le reste à encaisser sur le dossier. */
  resteDu?: number | null;
  /** Jours d'immobilisation — sert au seuil de patience. */
  joursImmobilisation?: number | null;
}

/** Nombre de jours au-delà duquel une immobilisation devient une alerte. */
export const SEUIL_IMMOBILISATION_ALERTE_JOURS = 30;

/**
 * Ce qui bloque, dans l'ordre où la réunion en parle.
 *
 * La fonction est PURE et ne suppose que ce qu'on lui donne. Un test peut
 * l'appeler avec un contexte vide et vérifier qu'elle ne fabrique rien : c'est
 * la seule garantie qu'un dossier sans blocage ne soit pas annoncé bloqué.
 */
export function blocages(c: ContexteBlocage): Blocage[] {
  const out: Blocage[] = [];

  // 1. La pièce manquante NOMMÉE.
  //
  // `EN_ATTENTE_PIECE` sur un dossier ne dit rien : 17 véhicules du registre
  // portaient ce statut générique. C'est la demande de pièce qui sait laquelle.
  for (const p of c.piecesManquantes ?? []) {
    if (!p?.libelle) continue;
    out.push({
      code: "piece",
      libelle: `Pièce manquante : ${p.libelle}${p.motif ? ` — ${p.motif}` : ""}`,
      poids: 1,
    });
  }

  // 2. La sous-traitance en cours.
  //
  // Une décision prise en réunion doit se lire le lendemain. Tant qu'elle
  // n'était pas consignée, elle ne se lisait qu'en mémoire — et les véhicules
  // « partis chez le Porsche » n'étaient visible nulle part.
  if (c.or?.sousTraitanceStatut && c.or.sousTraitanceStatut !== "ANNULE") {
    const chez = c.or.sousTraitanceFournisseur ? ` chez ${c.or.sousTraitanceFournisseur}` : "";
    out.push({
      code: "sous_traitance",
      libelle: `Sous-traitance${chez} — ${LIBELLES_SOUS_TRAITANCE[c.or.sousTraitanceStatut] ?? c.or.sousTraitanceStatut}`,
      poids: 2,
    });
  }

  // 3. Le diagnostic bloqué.
  if (c.diagnostic?.statut === "REJETE") {
    out.push({ code: "diagnostic", libelle: "Diagnostic rejeté, à refaire", poids: 3 });
  }

  // 4. Le devis sans réponse.
  //
  // `EN_ATTENTE_VALIDATION` est l'état ; « le client n'a pas répondu depuis N
  // jours » est le fait. On ne signale que le second s'il est connu — sinon
  // on afficherait un retard qu'on n'a pas mesuré.
  if (c.or?.statut === "EN_ATTENTE_VALIDATION" && c.or?.devisAccepte !== true) {
    out.push({ code: "devis", libelle: "Devis en attente de réponse du client", poids: 4 });
  }

  // 5. L'encours.
  if (c.resteDu != null && Number(c.resteDu) > 0) {
    out.push({
      code: "paiement",
      libelle: `Reste ${Number(c.resteDu).toLocaleString("fr-FR")} F à encaisser`,
      poids: 5,
    });
  }

  // 6. L'immobilisation sans raison connue.
  //
  // Le dernier parce qu'il est le moins informatif : « ça traîne » ne dit pas
  // POURQUOI. Il ne sert qu'à déclencher une QUESTION en réunion.
  if (
    c.joursImmobilisation != null &&
    c.joursImmobilisation > SEUIL_IMMOBILISATION_ALERTE_JOURS &&
    out.length === 0
  ) {
    out.push({
      code: "immobilise",
      libelle: `Immobilisé depuis ${c.joursImmobilisation} j sans blocage identifié`,
      poids: 6,
    });
  }

  return out.sort((a, b) => a.poids - b.poids);
}

export const LIBELLES_SOUS_TRAITANCE: Record<string, string> = {
  A_ENVOYER: "à envoyer",
  EN_ATTENTE_FOURNISSEUR: "en attente du prestataire",
  REPARTI: "réparti",
  RECU: "reçu",
  ANNULE: "annulé",
};

/** Le dossier est-il « à rendre » — prêt à partir chez le client ? */
export function pretARendre(statut: string | null | undefined): boolean {
  return statut === "PRET_A_LIVRER" || statut === "LIVRE";
}

/**
 * Le dossier est-il en retard ?
 *
 * On compare à la PROMESSE, pas à une durée fixe. Un moteur immobilisé depuis
 * vingt jours sans promesse n'est pas « en retard » : personne n'avait promis de
 * date. Une durée fixe produirait une alerte que l'agent ne peut pas défendre
 * en réunion.
 */
export function enRetard(datePromesse: string | null | undefined, aujourdhui = new Date()): boolean {
  if (!datePromesse) return false;
  const p = new Date(datePromesse);
  if (Number.isNaN(p.getTime())) return false;
  return p.getTime() < aujourdhui.getTime();
}

/** Combien de jours depuis la promesse de restitution — négatif si en avance. */
export function joursDeRetard(datePromesse: string | null | undefined, aujourdhui = new Date()): number | null {
  if (!datePromesse) return null;
  const p = new Date(datePromesse);
  if (Number.isNaN(p.getTime())) return null;
  return Math.floor((aujourdhui.getTime() - p.getTime()) / 86_400_000);
}

/**
 * La vue permanente du parc : des compteurs, pas des pourcentages.
 *
 * Un compteur se discute (« 4 en attente de pièces »), un pourcentage non.
 */
export interface CompteursParc {
  total: number;
  aRendre: number;
  enDiagnostic: number;
  enReparation: number;
  enAttentePiece: number;
  enSousTraitance: number;
  enRetard: number;
  traines: number;
}

export function compteursParc(
  lignes: Array<{
    orStatut?: string | null;
    sousTraitanceStatut?: string | null;
    datePromesse?: string | null;
    joursImmobilisation?: number | null;
    aDesBlocages?: boolean;
  }>,
  aujourdhui = new Date(),
): CompteursParc {
  const c: CompteursParc = {
    total: lignes.length,
    aRendre: 0, enDiagnostic: 0, enReparation: 0,
    enAttentePiece: 0, enSousTraitance: 0, enRetard: 0, traines: 0,
  };
  for (const l of lignes) {
    const s = l.orStatut ?? null;
    if (pretARendre(s)) c.aRendre++;
    if (s === "EN_ATTENTE_DIAGNOSTIC" || s === "EN_ATTENTE_VALIDATION_DIAGNOSTIC") c.enDiagnostic++;
    if (s === "EN_COURS" || s === "CONTROLE_QUALITE") c.enReparation++;
    if (s === "EN_ATTENTE_PIECES") c.enAttentePiece++;
    if (l.sousTraitanceStatut && l.sousTraitanceStatut !== "ANNULE") c.enSousTraitance++;
    if (enRetard(l.datePromesse, aujourdhui)) c.enRetard++;
    if (
      l.joursImmobilisation != null &&
      l.joursImmobilisation > SEUIL_IMMOBILISATION_ALERTE_JOURS
    ) {
      c.traines++;
    }
  }
  return c;
}