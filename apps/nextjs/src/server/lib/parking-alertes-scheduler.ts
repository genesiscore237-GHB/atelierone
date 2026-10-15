/**
 * LOT A1 (E14, RD9) — Analyse périodique des alertes parking.
 *
 * P1-3 : les alertes parking étaient 100 % manuelles (bouton « analyser »).
 * Une alerte de retard qui dépend d'une action humaine est une alerte qui
 * arrive trop tard — c'est tout l'intérêt d'une détection périodique.
 *
 * Deux contraintes de conception ont guidé l'implémentation :
 *
 *  1. **Aucune dépendance à un contexte utilisateur.** L'analyse d'alertes
 *     est déclenchée par `garage.analyser` (bouton, avec un `ctx` tRPC) ET par
 *     le scheduler (sans utilisateur). Le cœur du calcul est donc factorisé
 *     ici, et ne prend qu'un `agenceId` : le même code sert les deux, donc
 *     ils ne peuvent pas diverger (leçon de U0a).
 *
 *  2. **Le scheduler ne doit jamais faire tomber le serveur.** Une erreur de
 *     base, un réseau instable, une agence sans configuration : le tour est
 *     journalisé et le cycle continue. Une exception remontée depuis un
 *     `setInterval` non surveiller ferait tomber le process Node.
 *
 * Choix d'infrastructure assumé : `setInterval` dans le process (pas de cron
 * OS, pas de dépendance externe). En déploiement **serverless**, ce process
 * peut être tué entre deux requêtes : le bouton manuel reste alors le filet de
 * sécurité, et le scheduler n'est jamais bloquant pour la disponibilité.
 */

import { and, eq, inArray } from "drizzle-orm";
import {
  parkingVehicles,
  parkingAlerts,
  parkingConfigs,
} from "@atelierone/db";
import {
  computeParkingAlerts,
  DEFAULT_PARKING_CONFIG_SEUILS,
  type ParkingRuleConfig,
  type VehiculeAlertable,
} from "./parking-alerts";
import { db } from "~/server/db";

type Db = any;

/** Colonnes lues par `computeParkingAlerts` (contrat `VehiculeAlertableRow`). */
const COLONNES_ALERTABLE = {
  id: parkingVehicles.id,
  numRegistre: parkingVehicles.numRegistre,
  statut: parkingVehicles.statut,
  marque: parkingVehicles.marque,
  modele: parkingVehicles.modele,
  immatriculation: parkingVehicles.immatriculation,
  clientNom: parkingVehicles.clientNom,
  dateEntree: parkingVehicles.dateEntree,
  dateDerniereAction: parkingVehicles.dateDerniereAction,
  dateDevis: parkingVehicles.dateDevis,
  dateCommande: parkingVehicles.dateCommande,
  dateFinTravaux: parkingVehicles.dateFinTravaux,
  dateDerniereRelance: parkingVehicles.dateDerniereRelance,
  createdAt: parkingVehicles.createdAt,
} as const;

const versAlertable = (v: any): VehiculeAlertable => ({
  id: v.id,
  numRegistre: v.numRegistre,
  statut: v.statut,
  marque: v.marque,
  modele: v.modele,
  immatriculation: v.immatriculation,
  clientNom: v.clientNom,
  dateEntree: v.dateEntree,
  dateDerniereAction: v.dateDerniereAction,
  dateDevis: v.dateDevis,
  dateCommande: v.dateCommande,
  dateFinTravaux: v.dateFinTravaux,
  dateDerniereRelance: v.dateDerniereRelance,
  createdAt: v.createdAt,
});

/**
 * Seuils d'alertes d'une agence. Exporté car la procédure `garage.config`
 * s'en sert pour n'écrire que les champs réellement fournis.
 */
export async function chargerConfig(exec: Db, agenceId: number): Promise<ParkingRuleConfig> {
  const [cfg] = await exec
    .select()
    .from(parkingConfigs)
    .where(eq(parkingConfigs.agenceId, agenceId))
    .limit(1);
  if (!cfg) return { ...DEFAULT_PARKING_CONFIG_SEUILS };
  return {
    seuilSansEvolutionJours: cfg.seuilSansEvolutionJours ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilSansEvolutionJours,
    seuilImmobilisationLongueJours:
      cfg.seuilImmobilisationLongueJours ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilImmobilisationLongueJours,
    seuilAttenteClientJours: cfg.seuilAttenteClientJours ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilAttenteClientJours,
    seuilAttentePieceJours: cfg.seuilAttentePieceJours ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilAttentePieceJours,
    seuilPretSortieJour: cfg.seuilPretSortieJour ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilPretSortieJour,
    seuilTransfertJours: cfg.seuilTransfertJours ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilTransfertJours,
  };
}

export type ResultatAnalyse = {
  vehiculesAnalyses: number;
  creees: number;
  cloturees: number;
};

/**
 * Cœur de l'analyse d'alertes d'une agence — sans contexte utilisateur.
 *
 * Ouvre les alertes dont les critères sont désormais remplis et clôture celles
 * qui ne le sont plus. Idempotent : une alerte déjà OUVERTE pour le même
 * couple (véhicule, code) n'est pas recréée, donc un scheduler qui repasse
 * toutes les heures ne gonfle pas la table.
 */
export async function analyserParkingAlertes(
  exec: Db,
  agenceId: number,
  options: { vehicleId?: number; clotureePar?: number | null } = {},
): Promise<ResultatAnalyse> {
  const now = new Date();
  const cfg = await chargerConfig(exec, agenceId);

  const conditions = [eq(parkingVehicles.agenceId, agenceId)];
  if (options.vehicleId) conditions.push(eq(parkingVehicles.id, options.vehicleId));
  const vehicules = await exec
    .select(COLONNES_ALERTABLE)
    .from(parkingVehicles)
    .where(and(...conditions));

  const vehiculeIds = vehicules.map((v: any) => v.id);
  const ouvertes = vehiculeIds.length
    ? await exec
        .select()
        .from(parkingAlerts)
        .where(
          and(
            eq(parkingAlerts.agenceId, agenceId),
            eq(parkingAlerts.statut, "OUVERTE"),
            inArray(parkingAlerts.vehicleId, vehiculeIds),
          ),
        )
    : [];

  const ouvertesKey = new Set(ouvertes.map((a: any) => `${a.vehicleId}:${a.code}`));
  const activesParVehicle = new Map<number, Set<string>>();
  let creees = 0;

  for (const v of vehicules) {
    const actifs = activesParVehicle.get(v.id) ?? new Set<string>();
    const drafts = computeParkingAlerts(versAlertable(v), cfg, now);
    for (const draft of drafts) {
      actifs.add(draft.code);
      if (ouvertesKey.has(`${v.id}:${draft.code}`)) continue;
      await exec.insert(parkingAlerts).values({
        agenceId,
        vehicleId: v.id,
        code: draft.code,
        niveau: draft.niveau,
        message: draft.message,
        criteres: draft.criteres,
        statut: "OUVERTE",
        declencheeLe: now,
      } as any);
      creees++;
    }
    activesParVehicle.set(v.id, actifs);
  }

  let cloturees = 0;
  for (const a of ouvertes) {
    const actifs = activesParVehicle.get(a.vehicleId);
    if (!actifs || actifs.has(a.code)) continue;
    await exec
      .update(parkingAlerts)
      .set({ statut: "CLOTUREE", clotureeLe: now, clotureePar: options.clotureePar ?? null } as any)
      .where(eq(parkingAlerts.id, a.id));
    cloturees++;
  }

  return { vehiculesAnalyses: vehicules.length, creees, cloturees };
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

/** Période par défaut : 60 min (RD9). */
export const PERIODE_DEFAUT_MIN = 60;

/** Intervalle plancher : 1 minute. En dessous, c'est une boucle de charge. */
export const PERIODE_MIN_MIN = 1;

type TimerNode = { unref?: () => void };

let minuteur: ReturnType<typeof setInterval> | null = null;
let enCours = false;
let dernierTour: { at: Date; resultats: { agenceId: number; creees: number; cloturees: number }[] } | null = null;

export type OptionsScheduler = {
  /** Injectable pour les tests : sinon l'ensemble des agences en base. */
  agences?: number[];
  periodeMin?: number;
  /** En production, on ne veut pas de `unref` (le process doit vivre). */
  garderLeProcessus?: boolean;
};

/**
 * Démarre le scheduler UNE SEULE FOIS par process.
 *
 * Lazy : rien ne tourne tant qu'aucun appel n'a été fait (le routeur garage
 * l'appelle au premier usage). Sur un serveur qui n'utilise jamais le parking,
 * aucun timer n'est créé — un `setInterval` orphelin garderait un process en
 * vie pour rien.
 */
export async function ensureAlertesScheduler(options: OptionsScheduler = {}): Promise<boolean> {
  // Garde-fou : déjà démarré dans ce process.
  if (minuteur) return false;

  const periode = Math.max(PERIODE_MIN_MIN, options.periodeMin ?? PERIODE_DEFAUT_MIN);

  const agences =
    options.agences ??
    (await db
      .selectDistinct({ id: parkingVehicles.agenceId })
      .from(parkingVehicles)
      .then((rows: any[]) => rows.map((r: any) => Number(r.id)))
      .catch(() => [] as number[]));

  // Ne démarre pas si on ne connaît aucune agence : un timer qui tourne pour
  // rien est un timer à maintenir.
  if (!agences.length) return false;

  const tour = async () => {
// Un tour lent (base saturée, gros parc) ne doit pas faire empiler le
      // suivant : on saute ce cycle plutôt que de multiplier la charge.
      if (enCours) return;
    enCours = true;
    try {
      const resultats: { agenceId: number; creees: number; cloturees: number }[] = [];
      for (const agenceId of agences) {
        try {
          const r = await analyserParkingAlertes(db, agenceId);
          if (r.creees || r.cloturees) resultats.push({ agenceId, creees: r.creees, cloturees: r.cloturees });
        } catch (e) {
          // Une agence en échec ne doit pas empêcher les autres d'être analysées.
          console.error(`[scheduler-alertes] analyse échouée pour l'agence ${agenceId} :`, e);
        }
      }
      dernierTour = { at: new Date(), resultats };
      if (resultats.length) {
        console.log(
          `[scheduler-alertes] ${resultats.length} agence(s) mise(s) à jour : ` +
            resultats.map((r) => `#${r.agenceId} +${r.creees}/-${r.cloturees}`).join(", "),
        );
      }
    } catch (e) {
      // Jamais de remontée : une exception dans un setInterval non surveillé
      // tuerait le process Node.
      console.error("[scheduler-alertes] tour échoué :", e);
    } finally {
      enCours = false;
    }
  };

  minuteur = setInterval(() => void tour(), periode * 60_000);
  if (options.garderLeProcessus === false) (minuteur as unknown as TimerNode).unref?.();
  console.log(`[scheduler-alertes] scheduler démarré — toutes les ${periode} min (${agences.length} agence(s)).`);
  return true;
}

/** État du scheduler (diagnostic / tests). */
export function etatSchedulerAlertes() {
  return {
    actif: minuteur != null,
    enCours,
    dernierTour,
  };
}

/** Arrête le scheduler (tests, et fermeture propre). */
export function arreterAlertesScheduler(): void {
  if (minuteur) clearInterval(minuteur);
  minuteur = null;
  enCours = false;
  dernierTour = null;
}

/** Exécute un tour immédiat (bouton manuel ou test), hors timer. */
export async function executerTourAlertes(agences: number[]): Promise<{ agenceId: number; creees: number; cloturees: number }[]> {
  const out: { agenceId: number; creees: number; cloturees: number }[] = [];
  for (const agenceId of agences) {
    const r = await analyserParkingAlertes(db, agenceId);
    if (r.creees || r.cloturees) out.push({ agenceId, creees: r.creees, cloturees: r.cloturees });
  }
  return out;
}