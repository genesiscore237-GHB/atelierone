-- LOT R1 (complément) — MAINTENANCE AUTOMATIQUE de `vehicules.immat_norm`
--
-- `0004` a créé la colonne dérivée et l'index unique partiel, mais **rien ne la
-- remplissait** : ni valeur par défaut, ni colonne générée, ni déclencheur.
-- Seuls le backfill `dedup-vehicules-immat` et les rares écritures qui
-- calculaient la colonne à la main le faisaient. Conséquence directe et
-- silencieuse : un véhicule inséré par un chemin quelconque se retrouvait avec
-- `immat_norm = NULL`, donc **hors couverture de l'index unique** — deux
-- could've deux fiches pour la même plaque — et **invisible des recherches
-- normalisées**. C'est ce qui rendait le rapprochement parking ↔ atelier
-- aléatoire : `migrate-parking-vehicules.ts` apparie sur `immat_norm`, il ne
-- trouvait donc rien à lier.
--
-- Un invariant dérivé doit être maintenu par la base, pas par la discipline de
-- chaque appelant : on ne peut pas avoir forgotten un INSERT.
--
-- Normalisation : STRICTEMENT celle de `immat-utils.ts` (`normaliserImmat` /
-- `immatNormaleSql`) — trim, suppression de tous les espaces, majuscules, et
-- ponctuation CONSERVÉE (au Cameroun, « AB-123-CD » et « AB123CD » peuvent être
-- deux plaques distinctes). Modifier cette expression ici impose de modifier
-- `immat-utils.ts` dans le même commit.
--
-- Idempotent : IF NOT EXISTS / DROP IF EXISTS avant CREATE.
DROP TRIGGER IF EXISTS trg_vehicules_immat_norm ON vehicules;

CREATE OR REPLACE FUNCTION public.fn_vehicules_immat_norm() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  -- Plaque absente ou vide -> NULL (et non '') : l'index unique est PARTIEL
  -- sur `immat_norm IS NOT NULL`, plusieurs véhicules sans plaque coexistent
  -- donc sans conflit, conformément au modèle parking (D3).
  IF NEW.immatriculation IS NULL OR btrim(NEW.immatriculation) = '' THEN
    NEW.immat_norm := NULL;
  ELSE
    NEW.immat_norm := upper(regexp_replace(btrim(NEW.immatriculation), '\s+', '', 'g'));
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_vehicules_immat_norm
  BEFORE INSERT OR UPDATE OF immatriculation ON vehicules
  FOR EACH ROW EXECUTE FUNCTION public.fn_vehicules_immat_norm();

COMMENT ON FUNCTION public.fn_vehicules_immat_norm() IS
  'Maintient vehicules.immat_norm = upper(regexp_replace(btrim(immatriculation),''\s+'','''',''g'')). Aligne sur immat-utils.ts.';

-- Rattrapage des lignes existantes dont la normalisation diverge (saisie
-- antérieure au backfill, ou backfill réalisé avec une expression plus
-- laxiste). Sans ce passage, deux plaques ne différant que par un caractère
-- de contrôle pourraient se retrouver dans deux normalisations concurrentes.
UPDATE vehicules
SET immat_norm = upper(regexp_replace(btrim(immatriculation), '\s+', '', 'g'))
WHERE immatriculation IS NOT NULL
  AND btrim(immatriculation) <> ''
  AND immat_norm IS DISTINCT FROM upper(regexp_replace(btrim(immatriculation), '\s+', '', 'g'));