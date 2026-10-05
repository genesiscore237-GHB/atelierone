import { PSQL } from "./r6-psql";

// Réinitialise l'état R6 : employés tests 949 (sorti pour B1) et 950 (actif pour
// B2/B3/B5/B7/B8), plus les données satellitaires associées. Idempotent, exécutable
// dans n'importe quel ordre (workers=1).
export function resetDonneesR6() {
  const guarded =
    "DELETE FROM advance_transitions WHERE advance_id IN (SELECT id FROM employee_advances WHERE employee_id IN (949,950));\n" +
    "DELETE FROM advance_recoveries WHERE advance_id IN (SELECT id FROM employee_advances WHERE employee_id IN (949,950));\n" +
    "DELETE FROM attendance_calculations WHERE employee_id IN (949,950);\n" +
    "DELETE FROM attendance_entries WHERE employee_id IN (949,950);\n" +
    "DELETE FROM attendance_monthly_summaries WHERE employee_id IN (949,950);\n" +
    "DELETE FROM leave_balance_adjustments WHERE leave_balance_id IN (SELECT id FROM leave_balances WHERE employee_id IN (949,950));\n" +
    "DELETE FROM leave_balance_snapshots WHERE leave_balance_id IN (SELECT id FROM leave_balances WHERE employee_id IN (949,950));\n" +
    "DELETE FROM leave_balances WHERE employee_id IN (949,950);\n" +
    "DELETE FROM leave_requests WHERE employee_id IN (949,950);\n" +
    "DELETE FROM employee_advances WHERE employee_id IN (949,950);\n" +
    "DELETE FROM employee_positions WHERE employee_id IN (949,950);\n" +
    "DELETE FROM employee_salary_history WHERE employee_id IN (949,950);\n" +
    "DELETE FROM employee_status_history WHERE employee_id IN (949,950);\n" +
    "DELETE FROM contrats WHERE employe_id IN (949,950);\n" +
    "DELETE FROM payroll_entry_snapshots WHERE payroll_entry_id IN (SELECT id FROM payroll_entries WHERE employee_id IN (949,950));\n" +
    "DELETE FROM payroll_entry_lines WHERE payroll_entry_id IN (SELECT id FROM payroll_entries WHERE employee_id IN (949,950));\n" +
    "DELETE FROM payroll_entries WHERE employee_id IN (949,950);\n" +
    "DELETE FROM payroll_entry_lines WHERE payroll_entry_id IN (SELECT id FROM payroll_entries WHERE period_id IN (SELECT id FROM payroll_periods WHERE agence_id=1 AND start_date >= '2026-09-01'));\n" +
    "DELETE FROM payroll_entry_snapshots WHERE payroll_entry_id IN (SELECT id FROM payroll_entries WHERE period_id IN (SELECT id FROM payroll_periods WHERE agence_id=1 AND start_date >= '2026-09-01'));\n" +
    "DELETE FROM payroll_entries WHERE period_id IN (SELECT id FROM payroll_periods WHERE agence_id=1 AND start_date >= '2026-09-01');\n" +
    "DELETE FROM payroll_periods WHERE agence_id=1 AND start_date >= '2026-09-01' AND created_at > now() - interval '10 minutes';\n" +
    "DELETE FROM payroll_item_config_history WHERE item_id=1;\n" +
    // R6-D4 (B5) : le reset ne restaure pas les params modifiés par la UI → rétablir la baseline
    // (idempotence : le test B5 modifie PRIME_PRESENCE à 12 %, on revient à 10 %).
    "UPDATE payroll_items_config SET params='{\"percent\":10,\"minAttendancePct\":95}'::jsonb WHERE id=1 AND agence_id=1;\n" +
    "DELETE FROM employes WHERE id IN (949,950);";

  PSQL(`
    BEGIN;
    ${guarded}
    COMMIT;
  `);

  // Employé 950 : actif, agence 1, cycle 1, salaire 200 000 (compatible plafond avance)
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

  // Employé 949 : sorti avec motif + détail + traçabilité (pour B1 réembauchage)
  PSQL(`
    INSERT INTO employes (id, matricule, nom, prenom, type_employe, fonction, date_embauche, salaire_base, devise, mode_paie, statut, agence_id, work_cycle_id, date_sortie, motif_sortie, detail_motif_sortie, reembauchable, sortie_changed_by, sortie_changed_at, created_at, updated_at)
    VALUES (949, 'GPJ-R6TEST-949', 'R6TestSorti', 'Employe', 'contractuel', 'Testeur R6', '2025-01-06', 150000, 'XAF', 'virement', 'sorti', 1, 1, '2026-03-15', 'demission', 'Demission volontaire fin de mission', true, 1, now(), now(), now());
    INSERT INTO employee_status_history (employee_id, statut, start_date, end_date, changed_by, created_at)
    VALUES (949, 'actif', '2025-01-06', '2026-03-15', 1, now()),
           (949, 'sorti', '2026-03-15', NULL, 1, now());
    INSERT INTO employee_salary_history (employee_id, base_salary, start_date, changed_by, created_at)
    VALUES (949, 150000, '2025-01-06', 1, now());
  `);

  // Pointage réel (B2/B3) : entrée journalière réelle pour 950 le 19/05 (mardi),
  // veille du férié 20/05 — le congé approuvé 18→22 mai ne doit pas l'écraser.
  PSQL(`
    INSERT INTO attendance_entries (employee_id, date, time_in, time_out, source, status, validated)
    VALUES (950, '2026-05-19', '08:00:00', '17:00:00', 'manual', 'PRESENT', true);
  `);

  // B6 : masquage de la colonne Salaire SANS rh.salaire.consulter.
  // Le rôle « rh » (rh@gpj.cm) passe la procédure rh.* (enforceRole rh/superadmin/directeur),
  // contrairement au rôle « consultation » (bloqué au niveau routeur, R6-08 note).
  // Le retrait/restauration de rh.salaire.consulter se fait DANS le test B6 (idempotent).
  // Ici on conserve les grants « consultation » historiques (inoffensifs, documentés R6-08).
  PSQL(`
    DELETE FROM role_permissions
    WHERE role_id=(SELECT id FROM roles WHERE code='consultation')
      AND permission_id IN (
        SELECT id FROM permissions WHERE code IN ('rh.employe.consulter','rh.historique.consulter','rh.salaire.consulter')
      );
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM roles r, permissions p
    WHERE r.code='consultation' AND p.code IN ('rh.employe.consulter','rh.historique.consulter');
  `);
}

// Vérification SQL réutilisable pour les assertions DB du spec
export const psqlR6 = (sql: string) => PSQL(sql);