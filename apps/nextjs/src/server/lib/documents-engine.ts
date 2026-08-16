/**
 * RH-08 — MOTEUR DOCUMENTS (pur, sans DB).
 * Statut d'expiration d'un document, alertes, versioning.
 */

export interface EmployeeDocument {
  id: number;
  documentTypeId: number | null;
  titre: string | null;
  dateExpiration: string | null; // ISO yyyy-mm-dd
  hasExpiration: boolean; // le type requiert une expiration
  statut: string; // actif | archive
}

export type ExpiryStatus = "expire" | "expire_bientot" | "valide" | "sans_expiration";

export interface ExpiryAlert {
  documentId: number;
  titre: string | null;
  dateExpiration: string | null;
  status: ExpiryStatus;
  daysLeft: number | null; // négatif = expiré depuis N jours
}

/** Jours restants avant expiration (négatif si expiré) — calcul en jours calendaires */
export function daysUntilExpiry(dateExpiration: string, today: Date): number {
  const [y, m, d] = dateExpiration.split("-").map(Number);
  if (!y || !m || !d) return 0;
  const expiryUtc = Date.UTC(y, m - 1, d);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((expiryUtc - todayUtc) / 86400000);
}

/** Statut d'expiration d'un document */
export function expiryStatus(
  dateExpiration: string | null,
  hasExpiration: boolean,
  today: Date,
  alertDays = 30
): ExpiryStatus {
  if (!dateExpiration || !hasExpiration) return "sans_expiration";
  const days = daysUntilExpiry(dateExpiration, today);
  if (days < 0) return "expire";
  if (days <= alertDays) return "expire_bientot";
  return "valide";
}

/** Alertes d'expiration : documents expirés ou expirant sous N jours */
export function expiryAlerts(
  documents: EmployeeDocument[],
  today: Date,
  alertDays = 30
): ExpiryAlert[] {
  return documents
    .filter((d) => d.statut === "actif" && d.dateExpiration)
    .map((d) => {
      const days = daysUntilExpiry(d.dateExpiration!, today);
      const status = expiryStatus(d.dateExpiration, d.hasExpiration, today, alertDays);
      return {
        documentId: d.id,
        titre: d.titre,
        dateExpiration: d.dateExpiration,
        status,
        daysLeft: days,
      };
    })
    .filter((a) => a.status === "expire" || a.status === "expire_bientot")
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
}

/** Versioning simple : le dernier document valide d'un type pour un employé */
export function latestValid(
  documents: EmployeeDocument[],
  today: Date
): EmployeeDocument | null {
  const valid = documents
    .filter((d) => d.statut === "actif")
    .filter((d) => !d.hasExpiration || (d.dateExpiration && daysUntilExpiry(d.dateExpiration, today) >= 0))
    .sort((a, b) => String(b.dateExpiration ?? "").localeCompare(String(a.dateExpiration ?? "")));
  return valid[0] ?? null;
}
