/**
 * RH-09 — MOTEUR STATISTIQUES RH (pur, sans DB).
 * KPI agrégés, taux de présence, répartitions, exports CSV.
 */

export interface PresenceStat {
  presentDays: number;
  paidDays: number; // jours ouvrés du mois (hors fériés)
  rate: number; // 0-100
}

/** Taux de présence d'un mois (jours présents / jours ouvrés) */
export function presenceRate(
  presentDays: number,
  workingDays: number
): PresenceStat {
  if (workingDays <= 0) return { presentDays, paidDays: workingDays, rate: 0 };
  return {
    presentDays,
    paidDays: workingDays,
    rate: Math.round((presentDays / workingDays) * 1000) / 10,
  };
}

export interface RepartitionItem {
  label: string;
  count: number;
}

/** Répartition des effectifs par critère (département, poste, statut) */
export function repartition(
  items: Array<{ key: string | null; label: string | null }>
): RepartitionItem[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    const label = i.label ?? "Non défini";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/** Masse salariale mensuelle (somme des salaires de base) */
export function payrollMass(salaries: Array<number | string | null>): number {
  return salaries.reduce((s, v) => s + (Number(v) || 0), 0);
}

/** Export CSV générique (échappement RFC 4180) */
export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const esc = (v: string | number | null) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(";"), ...rows.map((r) => r.map(esc).join(";"))].join("\r\n");
}

/** Nombre de jours ouvrés (lun-sam, hors fériés) d'un mois — cohérent RH-02 */
export function workingDaysInMonth(year: number, month: number, holidays: string[] = []): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0) continue; // dimanche
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (holidays.includes(iso)) continue;
    count++;
  }
  return count;
}
