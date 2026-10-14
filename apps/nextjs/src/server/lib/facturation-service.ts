/**
 * FACTURATION DU CYCLE — Client → Véhicule → OR → Pièces + MO → Facture.
 * Fonctions pures (testables) + transactions.
 */
import { sql, type SQL } from "drizzle-orm";

/** Montant d'une ligne d'OR (totalLigne sinon quantité × PU). */
export function montantLigne(ligne: { quantite: number | string; prixUnitaire: number | string; totalLigne?: number | string | null; tva?: number | string | null }): number {
  const qte = Number(ligne.quantite);
  const pu = Number(ligne.prixUnitaire);
  const tva = Number(ligne.tva ?? 0) / 100;
  if (ligne.totalLigne != null && Number(ligne.totalLigne) > 0) return Math.round(Number(ligne.totalLigne) * 100) / 100;
  return Math.round(qte * pu * (1 + tva) * 100) / 100;
}

/** Total d'une facture = Σ lignes − remise %. */
export function calculerTotalFacture(
  lignes: Array<{ quantite: number | string; prixUnitaire: number | string; totalLigne?: number | string | null; tva?: number | string | null }>,
  remisePourcent = 0,
): number {
  const brut = lignes.reduce((s, l) => s + montantLigne(l), 0);
  return Math.round(brut * (1 - remisePourcent / 100) * 100) / 100;
}

/** Échéance d'une facture à crédit = date du jour + délai (jours). */
export function calculerEcheance(delaiJours: number, date = new Date()): string {
  const d = new Date(date);
  d.setDate(d.getDate() + delaiJours);
  return d.toISOString().slice(0, 10);
}

/** Vérification du plafond de crédit : encours + nouveau montant ≤ plafond. */
export function respectePlafondCredit(encours: number, montantFacture: number, plafond: number | null): boolean {
  if (!plafond || plafond <= 0) return true; // pas de plafond défini → illimité
  return encours + montantFacture <= plafond;
}

/** Référence de facture : FAC-{année}-{séquence 5}. */
export function genererReferenceFacture(sequence: number, date = new Date()): string {
  return `FAC-${date.getFullYear()}-${String(sequence).padStart(5, "0")}`;
}

/**
 * Namespaces de séquence (T0.5, Lot 0).
 *
 * Les références `ventes.reference`, `achats.reference` et
 * `ordres_reparation.numero` sont UNIQUEMENT GLOBALES en base (contrainte
 * `unique()` sans agence) : la séquence et son verrou doivent donc être
 * globaux aussi. Une clé par (namespace, année) — jamais par agence, sinon
 * deux agences concurrentes génèrent la même référence (unique violation).
 */
export type NamespaceSequence = "FAC" | "OR" | "BC";

/**
 * VERROU ANTI-DOUBLON DE SÉQUENCE (T0.5).
 *
 * Le comptage / MAX par préfixe n'est pas transactionnel : deux créations
 * concurrentes peuvent générer la même référence. On sérialise avec un verrou
 * advisory transactionnel (`pg_advisory_xact_lock`), clé par (namespace,
 * année), relâché automatiquement au commit/rollback.
 * À appeler en tout début de transaction, AVANT le calcul de séquence.
 */
export function verrouillerSequence(
  exec: { execute(sql: SQL): Promise<unknown> },
  namespace: NamespaceSequence,
  annee = new Date().getFullYear(),
): Promise<unknown> {
  const ns = namespace === "FAC" ? 0n : namespace === "OR" ? 1n : 2n;
  const cle = ns * 100_000n + BigInt(annee);
  return exec.execute(sql`select pg_advisory_xact_lock(${cle})`);
}

/**
 * Prochaine valeur d'une séquence par préfixe (T0.5).
 *
 * MAX des suffixes numériques + 1, là où `count(*) + 1` réutilisait un numéro
 * déjà attribué dès qu'une ligne avait été supprimée (trou dans la suite).
 * Seules les références strictement conformes `{prefixe}{chiffres}` sont
 * candidates — un préfixe qui aurait glissé dans la colonne ne fait pas
 * tomber le cast.
 * À appeler APRÈS `verrouillerSequence`, dans la même transaction.
 */
export async function prochaineSequence(
  // `any` volontaire : drizzle `db` et `tx` partagent le shape select().from()
  // mais pas exactement le même type de builder.
  exec: any,
  table: any,
  colonne: any,
  prefixe: string,
): Promise<number> {
  const rows = (await exec
    .select({
      max: sql<number>`COALESCE(MAX(CASE WHEN ${colonne} ~ ${prefixe + "[0-9]+$"} THEN regexp_replace(${colonne}, ${prefixe}, '')::int END), 0)::int`,
    })
    .from(table)) as { max: number | string | null }[];
  const row = rows[0];
  return Number(row?.max ?? 0) + 1;
}

/** Statuts d'OR facturables. */
export const STATUTS_OR_FACTURABLES = ["termine"] as const;

export const MODES_PAIEMENT = ["especes", "om", "momo", "carte", "virement", "credit"] as const;
export type ModePaiement = (typeof MODES_PAIEMENT)[number];

/** Une facture à crédit est-elle comptant ? */
export function estComptant(mode: ModePaiement): boolean {
  return mode !== "credit";
}

/** Statut d'une créance dérivé des données financières réelles (montants + échéance). */
export function classerDette(
  montantTotal: number,
  montantPaye: number,
  echeanceLe?: Date | string | null,
  maintenant: Date = new Date(),
): "PAID" | "PARTIAL" | "UNPAID" | "OVERDUE" {
  const restant = Math.max(0, montantTotal - montantPaye);
  if (restant <= 0) return "PAID";
  const jour = new Date(maintenant);
  jour.setHours(0, 0, 0, 0);
  const echeance = echeanceLe ? new Date(echeanceLe) : null;
  if (echeance && echeance.getTime() < jour.getTime()) return "OVERDUE";
  return montantPaye <= 0 ? "UNPAID" : "PARTIAL";
}