import { PSQL } from "../e2e-r6/r6-psql";

// Réinitialise l'état des avances/bulletins de l'employé TEST-R5A (501) et
// RECRÉE le salarié de test s'il a disparu (fixture R5 canonique, audit/r5/
// r5-repro-inject.sql — prenom « Avance Mensuel » : l'en-tête de fiche l'affiche).
// Idempotent, exécutable dans n'importe quel ordre (workers=1).
export function resetDonneesR5() {
  const cleanup = [
    "DELETE FROM advance_transitions WHERE advance_id IN (SELECT id FROM employee_advances WHERE employee_id=501);",
    "DELETE FROM advance_recoveries WHERE advance_id IN (SELECT id FROM employee_advances WHERE employee_id=501);",
    "DELETE FROM employee_advances WHERE employee_id=501;",
    "DELETE FROM payroll_entry_snapshots WHERE payroll_entry_id IN (SELECT id FROM payroll_entries WHERE employee_id=501);",
    "DELETE FROM payroll_entry_lines WHERE payroll_entry_id IN (SELECT id FROM payroll_entries WHERE employee_id=501);",
    "DELETE FROM payroll_entries WHERE employee_id=501;",
    "DELETE FROM payroll_entry_lines WHERE payroll_entry_id IN (SELECT id FROM payroll_entries WHERE employee_id=501);",
    "DELETE FROM advance_recoveries WHERE payroll_entry_id IN (SELECT id FROM payroll_entries WHERE employee_id=501);",
    "DELETE FROM payroll_entries WHERE employee_id=501;",
    "DELETE FROM attendance_calculations WHERE employee_id=501;",
    "DELETE FROM attendance_entries WHERE employee_id=501;",
    "DELETE FROM attendance_monthly_summaries WHERE employee_id=501;",
    "DELETE FROM employee_salary_history WHERE employee_id=501;",
    "DELETE FROM contrats WHERE employe_id=501;",
    "DELETE FROM employes WHERE id=501;",
  ].join("\n");

  const fixture = [
    `INSERT INTO employes (id, matricule, nom, prenom, type_employe, fonction,
       date_embauche, salaire_base, devise, mode_paie, forfait_hebdomadaire, statut,
       agence_id, notes) VALUES
      (501, 'TEST-R5A-001', 'Test R5', 'Avance Mensuel', 'permanent',
       'Test avance sur salaire R5',
       '2026-01-02', 200000, 'XOF', 'SALAIRE_MENSUEL', NULL, 'actif', 1,
       'R5 : avance 100000, recuperation 40000, solde 60000 reporte sur P4');`,
    `INSERT INTO contrats (employe_id, type_contrat, date_debut, salaire_base, poste, statut) VALUES
      (501, 'CDI', '2026-01-02', 200000, 'Test avance R5', 'actif');`,
    `INSERT INTO employee_salary_history (employee_id, base_salary, start_date, reason, changed_by, mode_paie, forfait_hebdomadaire) VALUES
      (501, 200000, '2026-01-02', 'R5 reset fixture', 1, 'SALAIRE_MENSUEL', NULL);`,
    `INSERT INTO attendance_entries (employee_id, date, time_in, time_out, source, status, validated, created_by, task_bonus)
      SELECT e.id, d::date, '08:00', '17:00', 'manual', 'PRESENT', true, 1, 0
      FROM generate_series('2026-09-01'::date, '2026-09-29'::date, '1 day') d
      CROSS JOIN (VALUES (501)) AS e(id)
      WHERE EXTRACT(ISODOW FROM d) <> 7;`,
    `INSERT INTO attendance_calculations (attendance_entry_id, employee_id, date,
       raw_minutes, break_minutes, worked_minutes, normal_minutes, overtime_minutes,
       late_minutes, early_departure_minutes, is_absent, code_presence, calculated_at)
      SELECT ae.id, ae.employee_id, ae.date, 540, 60, 480, 480, 0, 0, 0, false, 'P', now()
      FROM attendance_entries ae WHERE ae.employee_id = 501;`,
  ].join("\n");

  PSQL(`${cleanup}\n\n${fixture}\n`);
}