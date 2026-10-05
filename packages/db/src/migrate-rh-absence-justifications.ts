/**
 * RPT-04 — Workflow du justificatif d'absence / retard.
 *
 *   DRY_RUN=1  node packages/db/src/migrate-rh-absence-justifications.ts   (lecture seule)
 *              node packages/db/src/migrate-rh-absence-justifications.ts   (applique)
 *   ROLLBACK=1 node packages/db/src/migrate-rh-absence-justifications.ts
 *
 * Idempotent. Ne touche JAMAIS `attendance_entries` ni `absences` : ces tables
 * restent les sources canoniques RPT-01 et portent des données historiques
 * qu'il n'est pas permis d'écraser (R7).
 */
import { Client } from "pg";

const APPLY = !process.env.DRY_RUN && !process.env.ROLLBACK;
const ROLLBACK = !!process.env.ROLLBACK;

const CREATE_JUSTIFICATIONS = `
CREATE TABLE IF NOT EXISTS rh_absence_justifications (
  id                     SERIAL PRIMARY KEY,
  agence_id              INTEGER NOT NULL REFERENCES agences(id),
  employee_id            INTEGER NOT NULL REFERENCES employes(id),
  date                   DATE NOT NULL,
  statut                 VARCHAR(20) NOT NULL DEFAULT 'FOURNI',
  motif_code             VARCHAR(40),
  motif_libelle          VARCHAR(120),
  justificatif_url       TEXT,
  justificatif_reference VARCHAR(120),
  justificatif_type      VARCHAR(40),
  depose_par             INTEGER REFERENCES utilisateurs(id),
  depose_at              TIMESTAMP NOT NULL DEFAULT now(),
  decision_par           INTEGER REFERENCES utilisateurs(id),
  decision_at            TIMESTAMP,
  refus_motif            TEXT,
  created_at             TIMESTAMP NOT NULL DEFAULT now(),
  updated_at             TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT rh_absence_justifications_statut_check
    CHECK (statut IN ('AUCUN','FOURNI','VALIDE','REFUSE'))
);

-- Clé de réconciliation RPT-01 : une seule ligne de justification par (employé, jour).
CREATE UNIQUE INDEX IF NOT EXISTS rh_absence_justifications_employe_date_uidx
  ON rh_absence_justifications (employee_id, date);

CREATE INDEX IF NOT EXISTS rh_absence_justifications_agence_date_idx
  ON rh_absence_justifications (agence_id, date);

-- Un VALIDE exige forcément un validateur et une date : pas de validation fantôme.
ALTER TABLE rh_absence_justifications
  DROP CONSTRAINT IF EXISTS rh_absence_justifications_validation_coherente;
ALTER TABLE rh_absence_justifications
  ADD CONSTRAINT rh_absence_justifications_validation_coherente
  CHECK (
    statut <> 'VALIDE'
    OR (decision_par IS NOT NULL AND decision_at IS NOT NULL)
  );

-- Un REFUSE exige forcément un motif : un refus sans raison n'est pas exploitable.
ALTER TABLE rh_absence_justifications
  DROP CONSTRAINT IF EXISTS rh_absence_justifications_refus_motif_check;
ALTER TABLE rh_absence_justifications
  ADD CONSTRAINT rh_absence_justifications_refus_motif_check
  CHECK (statut <> 'REFUSE' OR (refus_motif IS NOT NULL AND length(trim(refus_motif)) > 0));
`;

const CREATE_DECISIONS = `
CREATE TABLE IF NOT EXISTS rh_absence_justification_decisions (
  id                SERIAL PRIMARY KEY,
  justification_id  INTEGER NOT NULL,
  agence_id         INTEGER NOT NULL,
  ancien_statut     VARCHAR(20),
  nouveau_statut    VARCHAR(20) NOT NULL,
  action            VARCHAR(30) NOT NULL,
  acteur_id         INTEGER REFERENCES utilisateurs(id),
  motif             TEXT NOT NULL,
  document_url      TEXT,
  metadata          JSONB,
  created_at        TIMESTAMP NOT NULL DEFAULT now(),
  -- restrict : l'historique est une preuve, il ne peut pas disparaître (§32/§33)
  CONSTRAINT rh_absence_justification_decisions_justification_fk
    FOREIGN KEY (justification_id) REFERENCES rh_absence_justifications(id) ON DELETE RESTRICT,
  CONSTRAINT rh_absence_justification_decisions_action_check
    CHECK (action IN ('DEPOT','VALIDATION','REFUS','CORRECTION')),
  CONSTRAINT rh_absence_justification_decisions_statut_check
    CHECK (nouveau_statut IN ('FOURNI','VALIDE','REFUSE'))
);

CREATE INDEX IF NOT EXISTS rh_absence_justification_decisions_justification_idx
  ON rh_absence_justification_decisions (justification_id);

CREATE INDEX IF NOT EXISTS rh_absence_justification_decisions_agence_created_idx
  ON rh_absence_justification_decisions (agence_id, created_at);
`;

const DROP_ALL = `
DROP TABLE IF EXISTS rh_absence_justification_decisions;
DROP TABLE IF EXISTS rh_absence_justifications;
`;

(async () => {
  const url =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/atelierone_erp";

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL absent. Migration volontairement bloquée (pas de repli silencieux sur une base par défaut)."
    );
    process.exit(1);
  }

  const c = new Client({ connectionString: url });
  await c.connect();
  // Les NOTICE de création d'index sont attendues : on les neutralise pour
  // garder une sortie lisible.
  await c.query(`SET client_min_messages = warning`);

  try {
    if (ROLLBACK) {
      await c.query("BEGIN");
      await c.query(DROP_ALL);
      await c.query("COMMIT");
      console.log("ROLLBACK — rh_absence_justifications + decisions supprimees");
    } else if (APPLY) {
      await c.query("BEGIN");
      await c.query(CREATE_JUSTIFICATIONS);
      await c.query(CREATE_DECISIONS);
      await c.query("COMMIT");
      console.log("APPLY — tables rh_absence_justifications + rh_absence_justification_decisions pretes");
    } else {
      const t = await c.query(
        `SELECT to_regclass('rh_absence_justifications') AS j, to_regclass('rh_absence_justification_decisions') AS d`
      );
      console.log(`DRY_RUN — justifications: ${t.rows[0].j ?? "absente"} | decisions: ${t.rows[0].d ?? "absente"}`);
    }

    const compte = await c.query(
      `SELECT
         (SELECT count(*)::int FROM rh_absence_justifications)              AS justifications,
         (SELECT count(*)::int FROM rh_absence_justification_decisions)    AS decisions`
    );
    console.log(`lignes — justifications: ${compte.rows[0].justifications} | decisions: ${compte.rows[0].decisions}`);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error("ECHEC —", (e as Error).message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
