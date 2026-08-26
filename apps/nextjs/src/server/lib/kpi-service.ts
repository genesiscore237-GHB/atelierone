/**
 * MODULE PERFORMANCE & QUALITÉ — MOTEUR D'INDICATEURS (pur, sans DB).
 * Croisement des expertises : chaque étape horodatée du cycle devient une mesure.
 *
 * Principe : aucune estimation manuelle — tout est calculé depuis les événements
 * horodatés enregistrés par les modules Clients/Véhicules/Stock au fil du cycle.
 */

export type Periode = "jour" | "semaine" | "mois" | "trimestre";

export const MOTIFS_SAV = [
  "CONSIGNE_NON_RESPECTEE",
  "MALFACON",
  "DIAGNOSTIC_ERRONE",
  "PIECE_DEFAILLANTE",
  "AUTRE",
] as const;

export const MOTIF_SAV_LABELS: Record<string, string> = {
  CONSIGNE_NON_RESPECTEE: "Consigne client non respectée",
  MALFACON: "Malfaçon / mauvaise intervention",
  DIAGNOSTIC_ERRONE: "Diagnostic erroné",
  PIECE_DEFAILLANTE: "Pièce défaillante",
  AUTRE: "Autre motif",
};

/** Enregistrement enrichi d'un OR pour le calcul (le router fournit les horodatages dérivés de l'historique). */
export interface OrKpiRecord {
  id: number;
  numero: string;
  statut: string;
  priorite?: string | null;
  familleService?: string | null;
  motEntree?: string | null;
  clientId?: number | null;
  vehiculeId?: number | null;
  immatriculation?: string | null;
  dateOuverture: string | Date;
  datePromesse?: string | null;
  dateCloture?: string | Date | null;
  savOrigineOrId?: number | null;
  motifRetourSAV?: string | null;
  responsableTechnicienId?: number | null;
  /** dérivés (router) : */
  dateDiagSoumis?: string | Date | null;
  dateDevisAccepte?: string | Date | null;
  retouche?: boolean;          // passage CONTRÔLE QUALITÉ → EN_COURS observé
  ecartPerimetre?: number;     // lignes ajoutées après acceptation du devis
}

const jour = (v: string | Date): Date => (typeof v === "string" ? new Date(`${v.slice(0, 10)}T00:00:00`) : new Date(v));
const joursEntre = (a: string | Date, b: string | Date): number =>
  Math.floor((jour(b).getTime() - jour(a).getTime()) / 86400000);
const round1 = (n: number): number => Math.round(n * 10) / 10;
const pct = (num: number, den: number): number | null => (den > 0 ? round1((num / den) * 100) : null);

/** Ponctualité : % d'OR LIVRÉS avec promesse tenue (clôture ≤ promesse). */
export function respectPromesse(ors: OrKpiRecord[]): { livreCount: number; avecPromesse: number; tenus: number; pourcent: number | null } {
  const livres = ors.filter((o) => o.statut === "LIVRE");
  const avecPromesse = livres.filter((o) => !!o.datePromesse);
  const tenus = avecPromesse.filter((o) => joursEntre(o.datePromesse!, o.dateCloture ?? new Date()) <= 0);
  return { livreCount: livres.length, avecPromesse: avecPromesse.length, tenus: tenus.length, pourcent: pct(tenus.length, avecPromesse.length) };
}

/** Lead time moyen (entrée → livraison), en jours. */
export function leadTimeMoyenJours(ors: OrKpiRecord[]): number | null {
  const livres = ors.filter((o) => o.statut === "LIVRE" && o.dateCloture);
  if (livres.length === 0) return null;
  const total = livres.reduce((s, o) => s + joursEntre(o.dateOuverture, o.dateCloture!), 0);
  return round1(total / livres.length);
}

/** Retard moyen des livrés en retard (j). */
export function retardMoyenJours(ors: OrKpiRecord[]): number | null {
  const enRetard = ors.filter((o) => o.statut === "LIVRE" && o.datePromesse && retard(o));
  if (enRetard.length === 0) return 0;
  const total = enRetard.reduce((s, o) => s + retard(o), 0);
  return round1(total / enRetard.length);
}

function retard(o: OrKpiRecord): number {
  if (!o.datePromesse || !o.dateCloture) return 0;
  return Math.max(0, joursEntre(o.datePromesse, o.dateCloture));
}

/** Rapidité du diagnostic : délai moyen ouverture → diagnostic soumis (jours décimaux). */
export function delaiDiagnosticMoyenJours(ors: OrKpiRecord[]): number | null {
  const withDiag = ors.filter((o) => o.dateDiagSoumis);
  if (withDiag.length === 0) return null;
  const total = withDiag.reduce((s, o) => {
    const d = new Date(o.dateDiagSoumis!).getTime() - new Date(jour(o.dateOuverture)).getTime();
    return s + Math.max(0, d / 86400000);
  }, 0);
  return Math.round((total / withDiag.length) * 100) / 100;
}

/** Précision diagnostic : % validés sans renvoi au technicien. */
export function precisionDiagnostic(rapports: Array<{ statut: string | null; renvoye?: boolean }>): number | null {
  if (rapports.length === 0) return null;
  const ok = rapports.filter((r) => r.statut === "VALIDE" && !r.renvoye).length;
  return pct(ok, rapports.length);
}

/** Taux de retouche interne : % d'OR passés de CONTRÔLE QUALITÉ vers EN COURS. */
export function tauxRetouche(ors: OrKpiRecord[]): number | null {
  const concernes = ors.filter((o) => o.statut !== "EN_ATTENTE_DIAGNOSTIC" && o.statut !== "ANNULE");
  if (concernes.length === 0) return null;
  const retouches = concernes.filter((o) => o.retouche).length;
  return pct(retouches, concernes.length);
}

/** Comebacks : OR SAV créés dans la fenêtre, par motif. */
export interface ComebacksResult {
  total: number;
  parMotif: Record<string, number>;
  malfaçonOuDiagnostic: number; // MALFAÇON + DIAGNOSTIC_ERRONÉ
  consigneNonRespectee: number;
  tauxSurLivres: number | null;
}

export function analyseComebacks(savOrs: OrKpiRecord[], orsLivres: OrKpiRecord[]): ComebacksResult {
  const parMotif: Record<string, number> = {};
  for (const s of savOrs) {
    const m = s.motifRetourSAV ?? "AUTRE";
    parMotif[m] = (parMotif[m] ?? 0) + 1;
  }
  const total = savOrs.length;
  const malfaçonOuDiagnostic = (parMotif["MALFACON"] ?? 0) + (parMotif["DIAGNOSTIC_ERRONE"] ?? 0);
  const consigneNonRespectee = parMotif["CONSIGNE_NON_RESPECTEE"] ?? 0;
  const livres = orsLivres.filter((o) => !o.savOrigineOrId).length; // ORs normaux (exclus SAV)
  return { total, parMotif, malfaçonOuDiagnostic, consigneNonRespectee, tauxSurLivres: pct(total, livres) };
}

/** FTQ (First Time Quality) : % de livrés sans retouche ET sans SAV lié. */
export function firstTimeQuality(ors: OrKpiRecord[]): number | null {
  const livres = ors.filter((o) => o.statut === "LIVRE");
  if (livres.length === 0) return null;
  const ok = livres.filter((o) => !o.retouche && !o.savOrigineOrId).length;
  return pct(ok, livres.length);
}

/** Ecart périmètre moyen : lignes ajoutées après acceptation du devis. */
export function ecartPerimetreMoyen(ors: OrKpiRecord[]): number | null {
  const withData = ors.filter((o) => o.nbLignesApresDevis != null);
  if (withData.length === 0) return null;
  return round1(withData.reduce((s, o) => s + (o.nbLignesApresDevis ?? 0), 0) / withData.length);
}

/** Fiabilité approvisionnement : % de demandes servies directement (non manquantes). */
export function fiabiliteAppro(demandes: Array<{ statut: string | null }>): number | null {
  if (demandes.length === 0) return null;
  const serviesDirect = demandes.filter((d) => d.statut === "SERVIE").length;
  return pct(serviesDirect, demandes.length);
}

/** Satisfaction client moyenne (/5). */
export function satisfactionMoyenne(ors: OrKpiRecord[]): { moyenne: number | null; noteCount: number } {
  withNotes(ors);
  const notes = ors.filter((o) => (o as any).satisfactionNote != null).map((o) => Number((o as any).satisfactionNote));
  return { moyenne: notes.length ? Math.round((notes.reduce((s, n) => s + n, 0) / notes.length) * 100) / 100 : null, noteCount: notes.length };
}

function withNotes(ors: OrKpiRecord[]): void { /* hook lisibilité */ }

/** Temps réel vs standard par famille : % dans le standard + écart moyen (jours). */
export function performanceVsStandard(
  orsLivrés: OrKpiRecord[],
  standards: Record<string, { delaiCibleJours: number }>,
): Array<{ famille: string; count: number; delaiMoyenJours: number | null; cibleJours: number | null; dansStandard: number | null }> {
  const familles = new Set(orsLivrés.map((o) => o.familleService ?? o.motEntree ?? "AUTRE"));
  const out: Array<{ famille: string; count: number; delaiMoyenJours: number | null; cibleJours: number | null; dansStandard: number | null }> = [];
  for (const f of familles) {
    const list = orsLivrés.filter((o) => (o.familleService ?? o.motEntree ?? "AUTRE") === f && o.dateCloture);
    if (list.length === 0) continue;
    const delais = list.map((o) => joursEntre(o.dateOuverture, o.dateCloture!));
    const moyen = round1(delais.reduce((s, d) => s + d, 0) / delais.length);
    const cible = standards[f]?.delaiCibleJours ?? null;
    const dansStd = cible != null ? pct(delais.filter((d) => d <= cible).length, delais.length) : null;
    out.push({ famille: f, count: list.length, delaiMoyenJours: moyen, cibleJours: cible, dansStandard: dansStd });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** Statut feu tricolore d'un KPI vs sa cible.
 *  HAUT : VERT ≥ cible · ROUGE < seuilRouge · sinon ORANGE
 *  BAS  : VERT ≤ cible · ROUGE > seuilRouge · sinon ORANGE */
export function statutKPI(valeur: number | null, cible: number, seuilOrange: number | null, seuilRouge: number | null, sens: "HAUT" | "BAS"): "VERT" | "ORANGE" | "ROUGE" | "SANS_DATA" {
  if (valeur === null) return "SANS_DATA";
  const rouge = seuilRouge;
  if (sens === "HAUT") {
    if (valeur >= cible) return "VERT";
    return rouge != null && valeur < rouge ? "ROUGE" : "ORANGE";
  }
  if (valeur <= cible) return "VERT";
  return rouge != null && valeur > rouge ? "ROUGE" : "ORANGE";
}

/** Score santé global pondéré (0-100) à partir des statuts. */
export function scoreSante(status: Array<{ code: string; statut: "VERT" | "ORANGE" | "ROUGE" | "SANS_DATA"; poids?: number }>): { score: number; verdict: "BON" | "MOYEN" | "CRITIQUE"; details: Array<{ code: string; points: number }> } {
  const poidsDefaut: Record<string, number> = { PONCTUALITE: 25, FTQ: 30, TAUX_RETOUR_SAV: 20, RAPIDITE_DIAG_JOURS: 15, FIABILITE_APPRO: 5, SATISFACTION_CLIENT: 5 };
  let totalPoids = 0;
  let totalPoints = 0;
  const details = status.map((k) => {
    const poids = k.poids ?? poidsDefaut[k.code] ?? 10;
    if (k.statut === "SANS_DATA") return { code: k.code, points: 0 };
    totalPoids += poids;
    const points = k.statut === "VERT" ? poids : k.statut === "ORANGE" ? poids / 2 : 0;
    totalPoints += points;
    return { code: k.code, points };
  });
  const score = totalPoids > 0 ? Math.round((totalPoints / totalPoids) * 100) : 0;
  const verdict = score >= 80 ? "BON" : score >= 55 ? "MOYEN" : "CRITIQUE";
  return { score, verdict, details };
}

/** Fiche de score technicien (imputation via responsableTechnicienId). */
export function scoreTechnicien(
  orsAgence: OrKpiRecord[],
  technicienId: number,
  savOrs: OrKpiRecord[],
): {
  orResponsabilises: number;
  livres: number;
  enCours: number;
  retoucheTaux: number | null;
  comebacksImputes: number;
  premierPassageTaux: number | null;
  recommandation: "RIEN_A_SIGNALER" | "A_SURVEILLER" | "FORMATION_REQUISE";
} {
  const miens = orsAgence.filter((o) => o.responsableTechnicienId === technicienId && o.statut !== "ANNULE");
  const mesLivres = miens.filter((o) => o.statut === "LIVRE");
  const retouches = miens.filter((o) => o.retouche).length;

  // Imputation des SAV : l'OR d'origine était assigné à ce technicien
  const savIds = new Set(savOrs.map((s) => s.savOrigineOrId).filter(Boolean) as number[]);
  const comebacksImputes = orsAgence.filter((o) => savIds.has(o.id) && o.responsableTechnicienId === technicienId).length;

  const retoucheTaux = miens.length ? pct(retouches, miens.length) : null;
  const premierPassageTaux = mesLivres.length ? pct(mesLivres.filter((o) => !o.retouche && !savIds.has(o.id)).length, mesLivres.length) : null;

  // Principe « former avant décider » : recommandation graduée
  let recommandation: "RIEN_A_SIGNALER" | "A_SURVEILLER" | "FORMATION_REQUISE" = "RIEN_A_SIGNALER";
  if (mesLivres.length >= 3 && comebacksImputes >= 2 && (premierPassageTaux ?? 100) < 70) recommandation = "A_SURVEILLER";
  if (mesLivres.length >= 3 && comebacksImputes >= 3 && (premierPassageTaux ?? 100) < 50) recommandation = "FORMATION_REQUISE";

  return {
    orResponsabilises: miens.length,
    livres: mesLivres.length,
    enCours: miens.filter((o) => o.statut !== "LIVRE").length,
    retoucheTaux,
    comebacksImputes,
    premierPassageTaux,
    recommandation,
  };
}