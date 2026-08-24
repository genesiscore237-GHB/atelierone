/**
 * MODULE CLIENTS & CONTRATS — MOTEUR DE RÈGLES MÉTIER (pur, sans DB).
 * Règles issues des specs : types de clients, statuts, transitions, contrats de maintenance.
 */

export const TYPES_CLIENT = ["PART", "ENTR", "ADMIN", "ASSUR", "FLOTTE", "PROSP"] as const;
export type TypeClient = (typeof TYPES_CLIENT)[number];

export const STATUTS_CLIENT = ["PROSPECT", "ACTIF", "INACTIF", "BLOQUE", "ARCHIVE"] as const;
export type StatutClient = (typeof STATUTS_CLIENT)[number];

export const TYPES_CONTRAT = ["FORFAIT_MENSUEL", "FORFAIT_ANNUEL", "A_LA_DEMANDE", "PREVENTIF_PROGRAMME", "MIXTE"] as const;
export const STATUTS_CONTRAT = ["BROUILLON", "ACTIF", "SUSPENDU", "RESILIE", "EXPIRE", "RENOUVELLE"] as const;

/** Champs obligatoires selon le type de client (specs DOCUMENT 2 §2-3). */
export function champsObligatoires(type: TypeClient): string[] {
  switch (type) {
    case "PART":
      return ["civilite", "nom", "prenom", "telephone"];
    case "ENTR":
    case "FLOTTE":
      return ["raisonSociale", "niuNif", "telephone", "email"];
    case "ADMIN":
      return ["raisonSociale", "niuNif", "telephone", "email"];
    case "ASSUR":
      return ["raisonSociale", "compagnieAssurance", "telephone"];
    case "PROSP":
      return ["nom"];
    default:
      return ["nom"];
  }
}

export interface FicheClientInput {
  type: TypeClient;
  civilite?: string | null;
  nom?: string | null;
  prenom?: string | null;
  raisonSociale?: string | null;
  niuNif?: string | null;
  email?: string | null;
  telephone?: string | null;
  compagnieAssurance?: string | null;
}

/** Validation des champs obligatoires par type — retourne la liste des manquants. */
export function validerFicheClient(data: FicheClientInput): string[] {
  const manquants: string[] = [];
  const record = data as unknown as Record<string, unknown>;
  for (const champ of champsObligatoires(data.type)) {
    const value = record[champ];
    if (!value || String(value).trim() === "") {
      manquants.push(champ);
    }
  }
  return manquants;
}

/** Contact principal obligatoire pour ENTR / ADMIN / FLOTTE (règle §5). */
export function contactPrincipalObligatoire(type: TypeClient): boolean {
  return type === "ENTR" || type === "ADMIN" || type === "FLOTTE";
}

/** Code client : CLT-{année}-{séquence 4 chiffres}. */
export function genererCodeClient(sequence: number, date = new Date()): string {
  return `CLT-${date.getFullYear()}-${String(sequence).padStart(4, "0")}`;
}

/** Numéro de contrat : CONT-{année}-{séquence 5 chiffres}. */
export function genererNumeroContrat(sequence: number, date = new Date()): string {
  return `CONT-${date.getFullYear()}-${String(sequence).padStart(5, "0")}`;
}

/** Transitions de statut client autorisées (règle §5 : PROSPECT→ACTIF explicite, etc.). */
export function transitionStatutClientValide(de: StatutClient | null | undefined, vers: StatutClient): boolean {
  switch (de) {
    case "PROSPECT": return vers === "ACTIF" || vers === "ARCHIVE";
    case "ACTIF": return vers === "INACTIF" || vers === "BLOQUE" || vers === "ARCHIVE";
    case "BLOQUE": return vers === "ACTIF" || vers === "ARCHIVE";
    case "INACTIF": return vers === "ACTIF" || vers === "ARCHIVE";
    case "ARCHIVE": return false;
    default: return vers === "ACTIF"; // création → ACTIF
  }
}

/** Un client BLOQUÉ ne peut plus avoir de nouvel OR (règle §5, appliquée par le module OR). */
export function peutOuvrirOrdre(statut: string | null | undefined): boolean {
  return statut !== "BLOQUE" && statut !== "ARCHIVE";
}

/** Transitions de statut contrat autorisées (règle §5 : résiliation motivée, etc.). */
export function transitionStatutContratValide(
  de: string | null | undefined,
  vers: string,
  motif?: string | null,
): { ok: boolean; raison?: string } {
  switch (de) {
    case "BROUILLON":
      if (vers === "ACTIF") return { ok: true };
      if (vers === "RESILIE") return motif ? { ok: true } : { ok: false, raison: "La résiliation exige un motif." };
      return { ok: false, raison: "Un contrat brouillon ne peut que devenir ACTIF ou être résilié." };
    case "ACTIF":
      if (vers === "SUSPENDU") return { ok: true };
      if (vers === "RESILIE") return motif ? { ok: true } : { ok: false, raison: "La résiliation exige un motif." };
      if (vers === "RENOUVELLE") return { ok: true };
      return { ok: false, raison: "Transition non autorisée depuis ACTIF." };
    case "SUSPENDU":
      if (vers === "ACTIF" || vers === "RESILIE") return motif || vers === "ACTIF" ? { ok: true } : { ok: false, raison: "La résiliation exige un motif." };
      return { ok: false, raison: "Un contrat suspendu ne peut que reprendre (ACTIF) ou être résilié." };
    case "RENOUVELLE":
      if (vers === "ACTIF" || vers === "RESILIE") return motif || vers === "ACTIF" ? { ok: true } : { ok: false, raison: "La résiliation exige un motif." };
      return { ok: false, raison: "Transition non autorisée depuis RENOUVELLE." };
    default:
      return { ok: false, raison: `Statut de départ inconnu : ${de}` };
  }
}

/** Contrat ACTIF : date_debut ≤ aujourd'hui ET (date_fin nulle OU ≥ aujourd'hui). */
export function verifierContratActif(dateDebut: string, dateFin: string | null | undefined, aujourdhui = new Date().toISOString().slice(0, 10)): boolean {
  if (dateDebut > aujourdhui) return false;
  if (dateFin && dateFin < aujourdhui) return false;
  return true;
}

/** Statut effectif d'un contrat à une date donnée (EXPIRE automatique si date fin dépassée). */
export function statutContratEffectif(statut: string, dateDebut: string, dateFin: string | null | undefined, aujourdhui = new Date().toISOString().slice(0, 10)): string {
  if (statut === "ACTIF" && dateFin && dateFin < aujourdhui) return "EXPIRE";
  if (statut === "ACTIF" && dateDebut > aujourdhui) return "BROUILLON";
  return statut;
}

/** Solde client = Σ (montant total − montant payé) des factures non soldées (calcul pur sur agrégats). */
export function calculerSolde(ventes: Array<{ montantTotal: number | string; montantPaye: number | string | null }>): number {
  return Math.round(
    ventes.reduce((s, v) => s + (Number(v.montantTotal) - Number(v.montantPaye ?? 0)), 0) * 100,
  ) / 100;
}

/** Délai de paiement autorisés (0 = comptant). */
export const DELAIS_PAIEMENT = [0, 7, 15, 30, 45, 60] as const;