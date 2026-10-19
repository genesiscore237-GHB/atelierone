-- 0029 : ZONES FONCTIONNELLES + CAPACITÉ des emplacements (Lot 1, étape 4).
--
-- Le garage classe ses lieux de rangement par FONCTION : stockage normal,
-- zone de réception (approche), quarantaine (sous contrôle qualité), rebuts
-- et périmés. Cette fonction est une PROPRIÉTÉ de l'emplacement, pas son
-- `type` physique (RAYON, BAC, CASIER…) : un bac peut être en quarantaine.
--
-- Additif uniquement : aucune suppression, aucune transformation de données.
-- `zone_stockage` défaut NORMAL : tout emplacement existant devient, par
-- défaut, une zone de stockage normal — l'hypothèse la plus prudente.
-- `capacite` nullable : NULL = pas de limite définie.

ALTER TABLE emplacements ADD COLUMN IF NOT EXISTS zone_stockage varchar(20) NOT NULL DEFAULT 'NORMAL';
ALTER TABLE emplacements ADD COLUMN IF NOT EXISTS capacite integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'emplacements_zone_stockage_check'
  ) THEN
    ALTER TABLE emplacements
      ADD CONSTRAINT emplacements_zone_stockage_check
      CHECK (zone_stockage IN ('NORMAL', 'RECEPTION', 'QUARANTAINE', 'REBUTS', 'PERIMES'));
  END IF;
END $$;
