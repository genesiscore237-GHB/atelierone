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
  dateDevisEnvoye?: string | Date | null;
  dateDevisAccepte?: string | Date | null;
  retouche?: boolean;          // passage CONTRÔLE QUALITÉ → EN_COURS observé
  ecartPerimetre?: number;     // lignes ajoutées après acceptation du devis
  nbLignesApresDevis?: number | null;
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

export interface TransformationDevisResult {
  taux: number | null;
  envoyes: number;
  acceptes: number;
}

export function tauxTransformationDevis(ors: OrKpiRecord[]): TransformationDevisResult {
  const envoyes = ors.filter((o) => o.dateDevisEnvoye != null);
  const acceptes = envoyes.filter((o) => {
    if (o.dateDevisAccepte == null) return false;
    return new Date(o.dateDevisAccepte).getTime() >= new Date(o.dateDevisEnvoye!).getTime();
  });
  return { taux: pct(acceptes.length, envoyes.length), envoyes: envoyes.length, acceptes: acceptes.length };
}

export interface TechnicienHoraire {
  id: number;
  nom: string;
  prenom?: string | null;
  workCycleId: number;
  dateEmbauche?: string | null;
  dateFinContrat?: string | null;
  dateSortie?: string | null;
}

export interface HoraireCycle {
  cycleId: number;
  dayOfWeek: number;
  expectedHours: string | number | null;
  isWorkingDay?: boolean | null;
}

export interface DisponibiliteTechnicien {
  technicienId: number;
  nom: string;
  heuresDisponibles: number;
}

export function heuresDisponiblesParTechnicien(
  techniciens: TechnicienHoraire[],
  horaires: HoraireCycle[],
  debut: string,
  fin: string,
): DisponibiliteTechnicien[] {
  const debutDate = jour(debut);
  const finDate = jour(fin);
  if (finDate < debutDate) return [];

  const parCycleJour = new Map<string, number>();
  for (const h of horaires) {
    if (h.isWorkingDay === false) continue;
    const heures = Number(h.expectedHours);
    if (!Number.isFinite(heures) || heures <= 0) continue;
    const cle = `${h.cycleId}:${h.dayOfWeek}`;
    parCycleJour.set(cle, (parCycleJour.get(cle) ?? 0) + heures);
  }

  return techniciens.map((t) => {
    let total = 0;
    const embauche = t.dateEmbauche ? jour(t.dateEmbauche) : null;
    const finContrat = t.dateFinContrat ? jour(t.dateFinContrat) : t.dateSortie ? jour(t.dateSortie) : null;
    for (const d = new Date(debutDate); d <= finDate; d.setDate(d.getDate() + 1)) {
      if (embauche && d < embauche) continue;
      if (finContrat && d > finContrat) continue;
      total += parCycleJour.get(`${t.workCycleId}:${d.getDay()}`) ?? 0;
    }
    return {
      technicienId: t.id,
      nom: `${t.prenom ?? ""} ${t.nom}`.trim(),
      heuresDisponibles: round1(total),
    };
  });
}

export interface ProductiviteLigne {
  technicienId: number;
  nom: string;
  heuresVendues: number;
  heuresDisponibles: number;
}

export interface ProductiviteTechnicien {
  technicienId: number;
  nom: string;
  heuresVendues: number;
  heuresDisponibles: number;
  taux: number | null;
}

export interface ProductiviteResult {
  taux: number | null;
  totalVendues: number;
  totalDisponibles: number;
  parTechnicien: ProductiviteTechnicien[];
}

export function productiviteTechnicien(lignes: ProductiviteLigne[]): ProductiviteResult {
  const parTechnicien = lignes
    .filter((l) => l.heuresDisponibles > 0)
    .map((l) => {
      const heuresVendues = round1(Math.max(0, l.heuresVendues));
      const heuresDisponibles = round1(l.heuresDisponibles);
      return {
        technicienId: l.technicienId,
        nom: l.nom,
        heuresVendues,
        heuresDisponibles,
        taux: pct(heuresVendues, heuresDisponibles),
      };
    })
    .sort((a, b) => (b.taux ?? 0) - (a.taux ?? 0) || a.nom.localeCompare(b.nom));
  const totalVendues = round1(parTechnicien.reduce((s, l) => s + l.heuresVendues, 0));
  const totalDisponibles = round1(parTechnicien.reduce((s, l) => s + l.heuresDisponibles, 0));
  return { taux: pct(totalVendues, totalDisponibles), totalVendues, totalDisponibles, parTechnicien };
}

/** Fiabilité approvisionnement : % de demandes servies directement (non manquantes). */
export function fiabiliteAppro(demandes: Array<{ statut: string | null }>): number | null {
  if (demandes.length === 0) return null;
  const serviesDirect = demandes.filter((d) => d.statut === "SERVIE").length;
  return pct(serviesDirect, demandes.length);
}

export interface DemandePieceKpi {
  statut: string | null;
  createdAt: Date | string | null;
  traiteLe: Date | string | null;
}

/**
 * Délai moyen de livraison des pièces : demande créée → demande traitée.
 *
 * Seules les demandes réellement servies comptent (`SERVIE` ou `PARTIELLE`).
 * Une demande `MANQUANTE` a bien un `traite_le`, mais elle n'a pas livré de
 * pièce : la compter comme « livrée en 2 jours » serait un chiffre faux.
 * Les demandes sans date de traitement restent ouvertes et sont exclues.
 */
export function delaiLivraisonPieces(demandes: DemandePieceKpi[]): number | null {
  const livrees = demandes.filter(
    (d) =>
      (d.statut === "SERVIE" || d.statut === "PARTIELLE") &&
      d.createdAt != null &&
      d.traiteLe != null,
  );
  if (livrees.length === 0) return null;
  const total = livrees.reduce(
    (s, d) => s + Math.max(0, joursEntre(d.createdAt!, d.traiteLe!)),
    0,
  );
  return round1(total / livrees.length);
}

export interface OrOccupationRecord {
  statut?: string | null;
  dateOuverture: Date | string | null;
  dateCloture?: Date | string | null;
}

export interface OccupationSemaine {
  debut: string;
  fin: string;
  /** Moyenne de dossiers ouverts par jour sur la semaine complète. */
  moyenne: number;
}

const isoJourLocal = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Série d'occupation de l'atelier, en semaines complètes.
 *
 * Un dossier occupe l'atelier de `dateOuverture` à `dateCloture` incluses ;
 * sans clôture, il occupe encore. On exclut les dossiers `ANNULE` : un dossier
 * annulé n'a jamais immobilisé un pont. La semaine en cours est volontairement
 * absente : une moyenne calculée sur trois jours serait lue comme une chute
 * d'activité alors que la semaine n'est pas finie.
 */
export function occupationParSemaine(
  ors: OrOccupationRecord[],
  semaines = 12,
  maintenant: Date = new Date(),
): OccupationSemaine[] {
  if (semaines <= 0) return [];

  const lundiCourant = new Date(maintenant);
  lundiCourant.setHours(0, 0, 0, 0);
  lundiCourant.setDate(lundiCourant.getDate() - ((lundiCourant.getDay() + 6) % 7));

  const intervalles = ors
    // Un LIVRE sans date de clôture est une donnée incomplète, pas un véhicule
    // encore sur le pont : le compter indéfiniment gonflerait l'occupation.
    .filter((o) => o.statut !== "ANNULE" && !(o.statut === "LIVRE" && o.dateCloture == null) && o.dateOuverture != null)
    .map((o) => ({
      debut: jour(o.dateOuverture!),
      fin: o.dateCloture != null ? jour(o.dateCloture) : null,
    }));

  const points: OccupationSemaine[] = [];
  for (let i = semaines - 1; i >= 0; i--) {
    const debut = new Date(lundiCourant);
    debut.setDate(debut.getDate() - 7 * (i + 1));
    const fin = new Date(debut);
    fin.setDate(fin.getDate() + 6);

    let total = 0;
    for (let d = 0; d < 7; d++) {
      const jourCourant = new Date(debut);
      jourCourant.setDate(jourCourant.getDate() + d);
      total += intervalles.filter(
        (iv) => iv.debut <= jourCourant && (iv.fin == null || iv.fin >= jourCourant),
      ).length;
    }

    points.push({
      debut: isoJourLocal(debut),
      fin: isoJourLocal(fin),
      moyenne: round1(total / 7),
    });
  }
  return points;
}

export interface OrRetentionRecord {
  clientId: number | null;
  statut?: string | null;
  dateCloture: Date | string | null;
  savOrigineOrId?: number | null;
  clientDisplay?: string | null;
  clientTelephone?: string | null;
}

export interface ClientDormant {
  clientId: number;
  nom: string;
  telephone: string | null;
  derniereVisite: string;
  joursDepuis: number;
}

export interface RetentionResult {
  taux: number | null;
  clientsActifs: number;
  clientsRevenus: number;
  dormants: ClientDormant[];
}

/**
 * Rétention client — deux dossiers clos séparés d'au moins 30 jours.
 *
 * Un retour 10 jours après la livraison n'est pas un réachat : c'est souvent
 * une reprise SAV, et la compter comme de la fidélité récompenserait un défaut
 * qualité. Les dossiers SAV sont donc exclus des deux côtés du calcul. La
 * fenêtre est de 24 mois glissants, indépendante de la période du tableau de
 * bord : un taux de rétention calculé sur un mois ne mesure que du bruit.
 *
 * `dormants` liste les clients dont la dernière visite date de 12 à 24 mois :
 * assez ancienne pour être oubliée, assez récente pour qu'un rappel soit utile.
 */
export function analyserRetention(
  ors: OrRetentionRecord[],
  options: { maintenant?: Date; moisFenetre?: number; moisDormant?: number; limite?: number } = {},
): RetentionResult {
  const maintenant = options.maintenant ?? new Date();
  const moisFenetre = options.moisFenetre ?? 24;
  const moisDormant = options.moisDormant ?? 12;
  const limite = options.limite ?? 6;

  const debutFenetre = new Date(maintenant);
  debutFenetre.setMonth(debutFenetre.getMonth() - moisFenetre);
  debutFenetre.setHours(0, 0, 0, 0);
  const seuilDormant = new Date(maintenant);
  seuilDormant.setMonth(seuilDormant.getMonth() - moisDormant);
  seuilDormant.setHours(0, 0, 0, 0);

  // Un client dont un véhicule est encore à l'atelier n'est pas dormant, même
  // si son dernier dossier clos date de treize mois : l'appeler pour le faire
  // revenir alors qu'il est déjà là serait le pire des rappels.
  const clientsAvecDossierOuvert = new Set<number>();
  for (const o of ors) {
    if (o.clientId != null && o.statut !== "ANNULE" && o.statut !== "LIVRE" && o.dateCloture == null) {
      clientsAvecDossierOuvert.add(o.clientId);
    }
  }

  const parClient = new Map<number, {
    dates: Date[];
    nom: string;
    telephone: string | null;
  }>();

  for (const o of ors) {
    if (o.clientId == null || o.statut !== "LIVRE" || o.dateCloture == null || o.savOrigineOrId != null) continue;
    const date = jour(o.dateCloture);
    if (date < debutFenetre) continue;
    const entree = parClient.get(o.clientId) ?? {
      dates: [],
      nom: o.clientDisplay?.trim() || `Client #${o.clientId}`,
      telephone: o.clientTelephone ?? null,
    };
    entree.dates.push(date);
    entree.telephone = entree.telephone ?? o.clientTelephone ?? null;
    parClient.set(o.clientId, entree);
  }

  let clientsRevenus = 0;
  const dormants: ClientDormant[] = [];
  for (const [clientId, entree] of parClient) {
    const dates = [...new Set(entree.dates.map((d) => d.getTime()))]
      .sort((a, b) => a - b)
      .map((t) => new Date(t));
    if (dates.length >= 2 && joursEntre(dates[0]!, dates[dates.length - 1]!) >= 30) {
      clientsRevenus += 1;
    }
    const derniere = dates[dates.length - 1]!;
    if (derniere <= seuilDormant && !clientsAvecDossierOuvert.has(clientId)) {
      dormants.push({
        clientId,
        nom: entree.nom,
        telephone: entree.telephone,
        derniereVisite: isoJourLocal(derniere),
        joursDepuis: Math.max(0, joursEntre(derniere, maintenant)),
      });
    }
  }

  dormants.sort((a, b) => a.joursDepuis - b.joursDepuis);
  const clientsActifs = parClient.size;

  return {
    taux: clientsActifs > 0 ? round1((clientsRevenus / clientsActifs) * 100) : null,
    clientsActifs,
    clientsRevenus,
    dormants: dormants.slice(0, limite),
  };
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