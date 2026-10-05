import { PSQL } from "./r6-psql";

// Réinitialise l'état R6 V2 « Cycle de vie » — situations/transitions + employés fixtures 960 & 950.
// Idempotent ; exécutable dans n'importe quel ordre (workers=1).
export function resetDonneesR6Cycle() {
  PSQL(`
    BEGIN;
    DELETE FROM employee_situation_transitions WHERE situation_id IN
      (SELECT id FROM employee_situations WHERE employee_id IN (960, 950, 949));
    DELETE FROM employee_situations WHERE employee_id IN (960, 950, 949);
    DELETE FROM advance_transitions WHERE advance_id IN (SELECT id FROM employee_advances WHERE employee_id IN (960,950,949));
    DELETE FROM advance_recoveries WHERE advance_id IN (SELECT id FROM employee_advances WHERE employee_id IN (960,950,949));
    DELETE FROM payroll_entry_snapshots WHERE payroll_entry_id IN (SELECT id FROM payroll_entries WHERE employee_id IN (960,950,949));
    DELETE FROM payroll_entry_lines WHERE payroll_entry_id IN (SELECT id FROM payroll_entries WHERE employee_id IN (960,950,949));
    DELETE FROM payroll_entries WHERE employee_id IN (960,950,949);
    DELETE FROM attendance_entries WHERE employee_id IN (960,950,949);
    DELETE FROM attendance_calculations WHERE employee_id IN (960,950,949);
    DELETE FROM attendance_monthly_summaries WHERE employee_id IN (960,950,949);
    DELETE FROM leave_balance_adjustments WHERE leave_balance_id IN (SELECT id FROM leave_balances WHERE employee_id IN (960,950,949));
    DELETE FROM leave_balance_snapshots WHERE leave_balance_id IN (SELECT id FROM leave_balances WHERE employee_id IN (960,950,949));
    DELETE FROM leave_balances WHERE employee_id IN (960,950,949);
    DELETE FROM leave_requests WHERE employee_id IN (960,950,949);
    DELETE FROM contrats WHERE employe_id IN (960,950,949);
    DELETE FROM employee_positions WHERE employee_id IN (960,950,949);
    DELETE FROM employee_salary_history WHERE employee_id IN (960,950,949);
    DELETE FROM employee_status_history WHERE employee_id IN (960,950,949);
    DELETE FROM employes WHERE id IN (960,950,949);
    DELETE FROM payroll_periods WHERE agence_id=1 AND status='closed' AND start_date='2026-10-05';
    DELETE FROM role_permissions rp USING roles r, permissions p
      WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='rh' AND p.code='rh.situation.modifier'
        AND EXISTS (SELECT 1 FROM role_permissions rp2 JOIN roles r2 ON r2.id=rp2.role_id JOIN permissions p2 ON p2.id=rp2.permission_id
                    WHERE r2.code='rh' AND p2.code='rh.situation.modifier' AND rp2.id < rp.id);
    INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r, permissions p
      WHERE r.code='rh' AND p.code='rh.situation.modifier'
        AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id);
    COMMIT;
  `);

  // Employé 960 : actif, agence 1, cycle 1, salaire — cobaye du cycle de vie.
  PSQL(`
    INSERT INTO employes (id, matricule, nom, prenom, type_employe, fonction, date_embauche, salaire_base, devise, mode_paie, statut, agence_id, work_cycle_id, created_at, updated_at)
    VALUES (960, 'GPJ-R6TEST-960', 'R6Cycle', 'Employe', 'contractuel', 'Testeur cycle vie', '2026-01-05', 200000, 'XAF', 'virement', 'actif', 1, 1, now(), now());
    INSERT INTO employee_status_history (employee_id, statut, start_date, end_date, changed_by, created_at)
    VALUES (960, 'actif', '2026-01-05', NULL, 1, now());
    INSERT INTO employee_salary_history (employee_id, base_salary, start_date, changed_by, created_at)
    VALUES (960, 200000, '2026-01-05', 1, now());
    INSERT INTO contrats (employe_id, type_contrat, date_debut, statut, salaire_base)
    VALUES (960, 'CDD', '2026-01-05', 'actif', 200000);
  `);

  // Employé 950 : actif — cobaye des flows congé (approbation) et sortie/réembauche.
  PSQL(`
    INSERT INTO employes (id, matricule, nom, prenom, type_employe, fonction, date_embauche, salaire_base, devise, mode_paie, statut, agence_id, work_cycle_id, created_at, updated_at)
    VALUES (950, 'GPJ-R6TEST-950', 'R6Test', 'Employe', 'contractuel', 'Testeur R6', '2026-01-05', 200000, 'XAF', 'virement', 'actif', 1, 1, now(), now());
    INSERT INTO employee_status_history (employee_id, statut, start_date, end_date, changed_by, created_at)
    VALUES (950, 'actif', '2026-01-05', NULL, 1, now());
    INSERT INTO employee_salary_history (employee_id, base_salary, start_date, changed_by, created_at)
    VALUES (950, 200000, '2026-01-05', 1, now());
    INSERT INTO contrats (employe_id, type_contrat, date_debut, statut, salaire_base)
    VALUES (950, 'CDD', '2026-01-05', 'actif', 200000);
  `);
}

export const psqlR6Cycle = (sql: string) => PSQL(sql);