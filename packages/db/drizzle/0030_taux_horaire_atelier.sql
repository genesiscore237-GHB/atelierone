-- 0030 : TAUX HORAIRE ATELIER (P3.3.1).
--
-- La marge par dossier exige trois données : le chiffre d'affaires, le coût
-- des pièces et le coût de la main-d'œuvre. Les deux premières existent déjà
-- dans les ventes ; la troisième n'avait aucun support : le taux horaire est
-- une décision de Direction, variable d'une agence à l'autre.
--
-- La colonne est NULLABLE et SANS DÉFAUT. C'est volontaire : aucune valeur
-- métier ne doit être inventée par une migration. Tant qu'elle est NULL, le
-- KPI `MARGE_DOSSIER` reste `SANS_DATA` ; le renseigner dans Paramètres atelier
-- suffit à l'activer, sans redéploiement.
--
-- Additif et idempotent : aucune ligne existante n'est modifiée.

ALTER TABLE atelier_parametres
  ADD COLUMN IF NOT EXISTS taux_horaire_atelier numeric(12, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'atelier_parametres_taux_horaire_non_negatif'
  ) THEN
    ALTER TABLE atelier_parametres
      ADD CONSTRAINT atelier_parametres_taux_horaire_non_negatif
      CHECK (taux_horaire_atelier IS NULL OR taux_horaire_atelier >= 0);
  END IF;
END $$;

COMMENT ON COLUMN atelier_parametres.taux_horaire_atelier IS
  'P3.3.1 — taux horaire main-d''œuvre atelier en FCFA/heure. NULL = non renseigné : la marge par dossier reste SANS_DATA.';
