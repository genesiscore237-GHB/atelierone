/**
 * RH-07 — MOTEUR DISCIPLINAIRE (pur, sans DB).
 * Compteur d'avertissements sur période glissante, détection de récidive,
 * gravité, décisions.
 */

export interface DisciplinaryRecord {
  id: number;
  employeId: number;
  typeSanction: string; // code du type (RH-00 : AVERT_ORAL, AVERT_ECRIT, MISE_A_PIED_1, ...)
  severityLevel: number; // 1 (léger) → 5 (licenciement)
  dateSanction: string; // ISO yyyy-mm-dd
  decision: string; // notifiee | non_notifiee
  appliquee: boolean;
}

export interface WindowConfig {
  months: number; // période glissante (paramétrable RH-07)
  minCount: number; // nb d'avertissements déclenchant la récidive (défaut 2)
}

export interface RecidivismResult {
  warningsInWindow: number;
  isRecidivism: boolean;
  windowStart: string; // date ISO de début de fenêtre
  threshold: number;
}

/** Compte les sanctions « avertissement » (severity 1-2) dans la période glissante */
export function countWarningsInWindow(
  records: DisciplinaryRecord[],
  fromDate: string // ISO, début de fenêtre
): number {
  const from = new Date(fromDate + "T00:00:00");
  return records.filter((r) => {
    if (r.severityLevel < 1 || r.severityLevel > 2) return false;
    if (r.decision === "non_notifiee") return false;
    const d = new Date(r.dateSanction + "T00:00:00");
    return d >= from;
  }).length;
}

/** Début de la période glissante (aujourd'hui − N mois) */
export function windowStart(today: Date, months: number): string {
  const d = new Date(today);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** Détection de récidive : ≥ minCount avertissements dans la fenêtre */
export function detectRecidivism(
  records: DisciplinaryRecord[],
  today: Date,
  config: WindowConfig = { months: 12, minCount: 2 }
): RecidivismResult {
  const start = windowStart(today, config.months);
  const count = countWarningsInWindow(records, start);
  return {
    warningsInWindow: count,
    isRecidivism: count >= config.minCount,
    windowStart: start,
    threshold: config.minCount,
  };
}

/** Gravité d'une sanction par niveau (paramétrable RH-00) */
export function severityLabel(level: number): string {
  switch (level) {
    case 1: return "Léger";
    case 2: return "Moyen";
    case 3: return "Grave";
    case 4: return "Très grave";
    case 5: return "Licenciement";
    default: return "Inconnu";
  }
}

/** Récidive pour tous les employés d'un dossier (map employeId → résultat) */
export function detectAllRecidivism(
  recordsByEmployee: Record<number, DisciplinaryRecord[]>,
  today: Date,
  config: WindowConfig = { months: 12, minCount: 2 }
): Record<number, RecidivismResult> {
  const out: Record<number, RecidivismResult> = {};
  for (const [id, records] of Object.entries(recordsByEmployee)) {
    out[Number(id)] = detectRecidivism(records, today, config);
  }
  return out;
}
