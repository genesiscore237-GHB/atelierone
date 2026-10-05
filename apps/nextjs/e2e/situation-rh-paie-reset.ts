import { execFileSync } from "node:child_process";

export const SIT_FIXTURES = [801, 802, 803, 804] as const;
export const SIT_PERIOD = { from: "2026-09-01", to: "2026-09-30" } as const;

const PSQL_BIN = "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";
const PSQL_ARGS = [
  "-U",
  "postgres",
  "-h",
  "localhost",
  "-d",
  "atelierone_erp",
  "-X",
  "-t",
  "-A",
  "-q",
  "-v",
  "ON_ERROR_STOP=1",
];

export function psqlSituation(sql: string): string {
  const clean = sql.replace(/\s+/g, " ");
  try {
    return execFileSync(PSQL_BIN, PSQL_ARGS, {
      input: clean,
      env: { ...process.env, PGPASSWORD: "postgres" },
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
    }).trim();
  } catch (e) {
    throw new Error(`psql échoué: ${(e as Error).message}`);
  }
}

const DEPS = `(SELECT id FROM departments WHERE agence_id = 1 ORDER BY id LIMIT 1)`;

const INSERT_EMPLOYES = `
INSERT INTO employes (id, matricule, nom, prenom, type_employe, fonction, date_embauche, salaire_base, devise, mode_paie, statut, agence_id, work_cycle_id, department_id, date_sortie, motif_sortie, reembauchable, created_at, updated_at) VALUES
 (801, 'GPJ-SIT-801', 'Salou',   'Vieux',   'permanent', 'Mécanicien atelier',  '2025-01-01', 200000, 'XAF', 'SALAIRE_MENSUEL', 'actif', 1, 1, ${DEPS}, NULL, NULL,       true,  now(), now()),
 (802, 'GPJ-SIT-802', 'Mballet', 'Sophie',  'permanent', 'Assistante RH',       '2025-01-01', 200000, 'XAF', 'SALAIRE_MENSUEL', 'actif', 1, 1, ${DEPS}, NULL, NULL,       true,  now(), now()),
 (803, 'GPJ-SIT-803', 'Ndong',   'Charles', 'permanent', 'Carrossier',          '2025-01-01', 150000, 'XAF', 'SALAIRE_MENSUEL', 'actif', 1, 1, ${DEPS}, NULL, NULL,       true,  now(), now()),
 (804, 'GPJ-SIT-804', 'Etoa',    'Pierre',  'contractuel','Technicien peinture', '2025-01-01', 200000, 'XAF', 'SALAIRE_MENSUEL', 'sorti', 1, 1, ${DEPS}, '2026-09-20', 'demission', false, now(), now());
`;

const INSERT_HISTORIQUE = `
INSERT INTO employee_salary_history (employee_id, base_salary, start_date, end_date, mode_paie, reason, changed_by, created_at) VALUES
 (801, 200000, '2025-01-01', '2026-09-15', 'SALAIRE_MENSUEL', 'Engagement',    1, now()),
 (801, 250000, '2026-09-16', NULL,         'SALAIRE_MENSUEL', 'Augmentation',  1, now()),
 (802, 200000, '2025-01-01', NULL,         'SALAIRE_MENSUEL', 'Engagement',    1, now()),
 (803, 150000, '2025-01-01', NULL,         'SALAIRE_MENSUEL', 'Engagement',    1, now()),
 (804, 200000, '2025-01-01', NULL,         'SALAIRE_MENSUEL', 'Engagement',    1, now());
`;

const INSERT_CONTRATS = `
INSERT INTO contrats (employe_id, type_contrat, date_debut, date_fin, statut, salaire_base, poste) VALUES
 (801, 'CDI', '2025-01-01', NULL,          'actif',   200000, 'Mécanicien'),
 (802, 'CDI', '2025-01-01', NULL,          'actif',   200000, 'Assistante RH'),
 (803, 'CDI', '2025-01-01', NULL,          'actif',   150000, 'Carrossier'),
 (804, 'CDD', '2025-01-01', '2026-09-19',  'résilié', 200000, 'Technicien peinture');
`;

const INSERT_STATUTS = `
INSERT INTO employee_status_history (employee_id, statut, reembauchable, start_date, end_date, reason, changed_by, created_at) VALUES
 (801, 'actif', true,  '2025-01-01', NULL,         NULL,        1, now()),
 (802, 'actif', true,  '2025-01-01', NULL,         NULL,        1, now()),
 (803, 'actif', true,  '2025-01-01', NULL,         NULL,        1, now()),
 (804, 'actif', true,  '2025-01-01', '2026-09-19', NULL,        1, now()),
 (804, 'sorti', false, '2026-09-20', NULL,         'demission', 1, now());
`;

const INSERT_PRESENCES_PRESENT = `
INSERT INTO attendance_entries (employee_id, date, time_in, time_out, source, status, validated, created_at, updated_at)
SELECT v.employee_id, g.d, '08:00:00', '17:00:00', 'manual', 'PRESENT', true, now(), now()
FROM (VALUES (801), (802)) AS v(employee_id)
CROSS JOIN LATERAL generate_series('2026-09-01'::date, '2026-09-30'::date, '1 day') AS g(d)
WHERE extract(isodow FROM g.d) BETWEEN 1 AND 6;
`;

const INSERT_PRESENCES_803_PRESENT = `
INSERT INTO attendance_entries (employee_id, date, time_in, time_out, source, status, validated, created_at, updated_at)
SELECT 803, g.d, '08:00:00', '17:00:00', 'manual', 'PRESENT', true, now(), now()
FROM generate_series('2026-09-01'::date, '2026-09-10'::date, '1 day') AS g(d)
WHERE extract(isodow FROM g.d) BETWEEN 1 AND 6;
`;

const INSERT_PRESENCES_803_ABSENT = `
INSERT INTO attendance_entries (employee_id, date, source, status, validated, absence_type, absence_motif, created_at, updated_at)
SELECT 803, g.d, 'manual', 'ABSENCE_INJUSTIFIEE', true, 'INJUSTIFIEE', 'Absence non justifiée', now(), now()
FROM generate_series('2026-09-11'::date, '2026-09-30'::date, '1 day') AS g(d)
WHERE extract(isodow FROM g.d) BETWEEN 1 AND 6;
`;

const INSERT_PRESENCES_804_PRESENT = `
INSERT INTO attendance_entries (employee_id, date, time_in, time_out, source, status, validated, created_at, updated_at)
SELECT 804, g.d, '08:00:00', '17:00:00', 'manual', 'PRESENT', true, now(), now()
FROM generate_series('2026-09-01'::date, '2026-09-19'::date, '1 day') AS g(d)
WHERE extract(isodow FROM g.d) BETWEEN 1 AND 6;
`;

const INSERT_PRESENCES_804_ABSENT = `
INSERT INTO attendance_entries (employee_id, date, source, status, validated, absence_type, absence_motif, created_at, updated_at)
SELECT 804, g.d, 'manual', 'ABSENCE_INJUSTIFIEE', true, 'INJUSTIFIEE', 'Sortie, non pointé', now(), now()
FROM generate_series('2026-09-21'::date, '2026-09-30'::date, '1 day') AS g(d)
WHERE extract(isodow FROM g.d) BETWEEN 1 AND 6;
`;

const INSERT_CALCS_PRESENT = `
INSERT INTO attendance_calculations (attendance_entry_id, employee_id, date, raw_minutes, break_minutes, worked_minutes, normal_minutes, overtime_minutes, late_minutes, late_deductible_minutes, early_departure_minutes, is_absent, code_presence, absence_financial_impact, calculation_details, calculated_at)
SELECT e.id, e.employee_id, e.date, 520, 60, 480, 480, 0, 0, 0, 0, false, 'P', '0', '{}', now()
FROM attendance_entries e
WHERE e.status = 'PRESENT' AND e.employee_id IN (801, 802, 803, 804);
`;

const INSERT_CALCS_ABSENT = `
INSERT INTO attendance_calculations (attendance_entry_id, employee_id, date, raw_minutes, break_minutes, worked_minutes, normal_minutes, overtime_minutes, late_minutes, late_deductible_minutes, early_departure_minutes, is_absent, code_presence, absence_financial_impact, calculation_details, calculated_at)
SELECT e.id, e.employee_id, e.date, 0, 0, 0, 0, 0, 0, 0, 0, true, 'A', '0', '{}', now()
FROM attendance_entries e
WHERE e.status = 'ABSENCE_INJUSTIFIEE' AND e.employee_id IN (803, 804);
`;

const UPDATE_RETARDS_803 = `
UPDATE attendance_calculations
SET late_minutes = 20, late_deductible_minutes = 20, late_deduction_amount = '0'
WHERE employee_id = 803 AND date IN ('2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05');
`;

const INSERT_AVANCES_802 = `
INSERT INTO employee_advances (reference, employee_id, date_demande, date_approbation, date_versement, montant, motif, moyen_paiement, periode_concernee_debut, periode_concernee_fin, periode_recuperation_debut, periode_recuperation_fin, montant_recupe, solde_restant, statut, responsable_id, created_at, updated_at) VALUES
 ('SIT-802-A1', 802, '2026-08-28', '2026-09-01', '2026-09-01', 100000, 'Avance rentrée scolaire', 'especes', '2026-09-01', '2026-09-30', '2026-09-01', '2026-09-30', 30000, 70000, 'PARTIELLEMENT_RÉCUPÉRÉE', 1, now(), now()),
 ('SIT-802-A2', 802, '2026-08-10', '2026-08-19', '2026-08-20',  50000, 'Avance antérieure',      'especes', '2026-08-20', '2026-09-20', '2026-08-20', '2026-08-31', 50000,     0, 'RÉCUPÉRÉE',               1, now(), now()),
 ('SIT-802-A3', 802, '2026-09-05', '2026-09-09', '2026-09-10',  30000, 'Avance urgence',         'especes', '2026-09-10', '2026-09-30', NULL,         NULL,             0,     30000, 'VERSÉE',                  1, now(), now()),
 ('SIT-802-A4', 802, '2026-09-01', '2026-09-04', '2026-09-05',  20000, 'Petite avance',          'especes', '2026-09-05', '2026-09-30', NULL,         NULL,             0,     20000, 'VERSÉE',                  1, now(), now());
`;

const INSERT_AVANCE_804 = `
INSERT INTO employee_advances (reference, employee_id, date_demande, date_approbation, date_versement, montant, motif, moyen_paiement, periode_concernee_debut, periode_concernee_fin, montant_recupe, solde_restant, statut, responsable_id, created_at, updated_at) VALUES
 ('SIT-804-A1', 804, '2026-09-02', '2026-09-04', '2026-09-05', 250000, 'Avance départ', 'virement', '2026-09-05', '2026-10-31', 0, 250000, 'VERSÉE', 1, now(), now());
`;

const INSERT_RECUPERATIONS = `
INSERT INTO advance_recoveries (advance_id, date_recuperation, montant, periode_concernee_debut, periode_concernee_fin, created_by, created_at)
SELECT a.id, '2026-09-15', 30000, '2026-09-01', '2026-09-30', 1, now() FROM employee_advances a WHERE a.reference = 'SIT-802-A1';
INSERT INTO advance_recoveries (advance_id, date_recuperation, montant, periode_concernee_debut, periode_concernee_fin, created_by, created_at)
SELECT a.id, '2026-08-25', 50000, '2026-08-20', '2026-08-31', 1, now() FROM employee_advances a WHERE a.reference = 'SIT-802-A2';
INSERT INTO advance_recoveries (advance_id, date_recuperation, montant, periode_concernee_debut, periode_concernee_fin, created_by, created_at)
SELECT a.id, '2026-10-05', 20000, '2026-09-01', '2026-09-30', 1, now() FROM employee_advances a WHERE a.reference = 'SIT-802-A4';
`;

// Période 5 : mois civil JUILLET 2026 entièrement couvert et clôturé (idempotent).
// Utilisée par SIT-11 : une période 15/07→20/09 traversant cette clôture → MIXTE.
const UPSERT_PERIODE5 = `
INSERT INTO payroll_periods (id, start_date, end_date, status, closed_at, agence_id)
VALUES (5, '2026-07-01', '2026-07-31', 'closed', '2026-08-05', 1)
ON CONFLICT (id) DO UPDATE SET
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  status = EXCLUDED.status,
  closed_at = EXCLUDED.closed_at,
  agence_id = EXCLUDED.agence_id;
`;

const Nettoyage = (ids: readonly number[]) => {
  const inList = ids.join(",");
  return `
BEGIN;
DELETE FROM advance_recoveries WHERE advance_id IN (SELECT id FROM employee_advances WHERE employee_id IN (${inList}));
DELETE FROM advance_transitions WHERE advance_id IN (SELECT id FROM employee_advances WHERE employee_id IN (${inList}));
DELETE FROM employee_advances WHERE employee_id IN (${inList});
DELETE FROM payroll_entry_lines WHERE payroll_entry_id IN (SELECT id FROM payroll_entries WHERE employee_id IN (${inList}));
DELETE FROM payroll_entry_snapshots WHERE payroll_entry_id IN (SELECT id FROM payroll_entries WHERE employee_id IN (${inList}));
DELETE FROM advance_recoveries WHERE payroll_entry_id IN (SELECT id FROM payroll_entries WHERE employee_id IN (${inList}));
DELETE FROM payroll_entries WHERE employee_id IN (${inList});
DELETE FROM employee_situations WHERE employee_id IN (${inList});
DELETE FROM attendance_calculations WHERE employee_id IN (${inList});
DELETE FROM attendance_entries WHERE employee_id IN (${inList});
DELETE FROM attendance_monthly_summaries WHERE employee_id IN (${inList});
DELETE FROM employee_salary_history WHERE employee_id IN (${inList});
DELETE FROM employee_status_history WHERE employee_id IN (${inList});
DELETE FROM employee_positions WHERE employee_id IN (${inList});
DELETE FROM contrats WHERE employe_id IN (${inList});
DELETE FROM employes WHERE id IN (${inList});
COMMIT;
`;
};

function chaine(...sql: string[]): string {
  return sql.join("");
}

export function resetSituationRH(): string {
  const sql = chaine(
    Nettoyage(SIT_FIXTURES),
    "BEGIN;",
    INSERT_EMPLOYES,
    INSERT_HISTORIQUE,
    INSERT_CONTRATS,
    INSERT_STATUTS,
    INSERT_PRESENCES_PRESENT,
    INSERT_PRESENCES_803_PRESENT,
    INSERT_PRESENCES_803_ABSENT,
    INSERT_PRESENCES_804_PRESENT,
    INSERT_PRESENCES_804_ABSENT,
    INSERT_CALCS_PRESENT,
    INSERT_CALCS_ABSENT,
    UPDATE_RETARDS_803,
    INSERT_AVANCES_802,
    INSERT_AVANCE_804,
    INSERT_RECUPERATIONS,
    UPSERT_PERIODE5,
    "COMMIT;"
  );
  return psqlSituation(sql);
}

export function verifierFixture(employeeId: number): string {
  return psqlSituation(
    `SELECT id, matricule, nom, statut, salaire_base, mode_paie FROM employes WHERE id = ${employeeId};`
  );
}