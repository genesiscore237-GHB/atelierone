-- 0031 : LIAISON PASSAGE PARKING ↔ OR, ET UNICITÉ DE PLAQUE PAR AGENCE.
--
-- 1. `parking_vehicles.or_id` relie le passage au dernier OR qui l'a ouvert
--    ou réutilisé. La colonne est nullable : les passages historiques et les
--    véhicules parking-only n'ont pas d'OR. Plusieurs OR peuvent se succéder
--    sur un même passage physique, donc la colonne n'est PAS unique.
--
-- 2. L'index global `idx_vehicules_immat_norm` était unique alors que la règle
--    métier est une plaque unique PAR AGENCE. Il est remplacé par un index non
--    unique : l'unicité par agence reste portée par
--    `uq_vehicules_agence_immat_norm`.
--
-- Migration additive et idempotente : aucune ligne existante n'est supprimée.

ALTER TABLE parking_vehicles
  ADD COLUMN IF NOT EXISTS or_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'parking_vehicles_or_id_fkey'
  ) THEN
    ALTER TABLE parking_vehicles
      ADD CONSTRAINT parking_vehicles_or_id_fkey
      FOREIGN KEY (or_id) REFERENCES ordres_reparation(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_parking_vehicles_or_id
  ON parking_vehicles (or_id);

DROP INDEX IF EXISTS idx_vehicules_immat_norm;

CREATE INDEX IF NOT EXISTS idx_vehicules_immat_norm
  ON vehicules (immat_norm);

COMMENT ON COLUMN parking_vehicles.or_id IS
  'Passage parking lié à un OR. NULL pour les passages historiques ou parking-only.';
