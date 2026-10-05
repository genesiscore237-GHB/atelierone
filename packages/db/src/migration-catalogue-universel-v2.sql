-- =============================================================================
-- MIGRATION : Moteur catalogue universel (V2)
-- Idempotente (exécutable plusieurs fois sans erreur).
--   1. Élargit le CHECK type_attribut des 3 tables EAV (article_attributs,
--      variante_attributs, attribut_definitions) aux nouveaux types :
--      INTEGER, DECIMAL, LONG_TEXT, DATETIME, UNIT_VALUE, RANGE, VEHICLE_REFERENCE
--      (BOOLEAN legacy conservé).
--   2. Ajoute produit_references.valeur_normalisee (indexé) pour la détection
--      de doublons déterministe, avec backfill des lignes existantes.
-- =============================================================================

-- 1) Élargissement des CHECK type_attribut -----------------------------------
DO $$
DECLARE
  types_ok TEXT[] := ARRAY['TEXTE','LONG_TEXT','NOMBRE','INTEGER','DECIMAL','BOOLEEN','BOOLEAN','ENUM','MULTI_ENUM','DATE','DATETIME','DUREE','POURCENTAGE','MONTANT','UNIT_VALUE','RANGE','REFERENCE','VEHICLE_REFERENCE','CODE','LIEN','COULEUR'];
  type_def TEXT := 'CHECK (type_attribut IN (''TEXTE'',''LONG_TEXT'',''NOMBRE'',''INTEGER'',''DECIMAL'',''BOOLEEN'',''BOOLEAN'',''ENUM'',''MULTI_ENUM'',''DATE'',''DATETIME'',''DUREE'',''POURCENTAGE'',''MONTANT'',''UNIT_VALUE'',''RANGE'',''REFERENCE'',''VEHICLE_REFERENCE'',''CODE'',''LIEN'',''COULEUR''))';
BEGIN
  -- article_attributs
  ALTER TABLE article_attributs DROP CONSTRAINT IF EXISTS ck_article_attributs_type_attribut;
  ALTER TABLE article_attributs ADD CONSTRAINT ck_article_attributs_type_attribut CHECK (type_attribut IN ('TEXTE','LONG_TEXT','NOMBRE','INTEGER','DECIMAL','BOOLEEN','BOOLEAN','ENUM','MULTI_ENUM','DATE','DATETIME','DUREE','POURCENTAGE','MONTANT','UNIT_VALUE','RANGE','REFERENCE','VEHICLE_REFERENCE','CODE','LIEN','COULEUR'));
  -- variante_attributs
  ALTER TABLE variante_attributs DROP CONSTRAINT IF EXISTS ck_variante_attributs_type_attribut;
  ALTER TABLE variante_attributs ADD CONSTRAINT ck_variante_attributs_type_attribut CHECK (type_attribut IN ('TEXTE','LONG_TEXT','NOMBRE','INTEGER','DECIMAL','BOOLEEN','BOOLEAN','ENUM','MULTI_ENUM','DATE','DATETIME','DUREE','POURCENTAGE','MONTANT','UNIT_VALUE','RANGE','REFERENCE','VEHICLE_REFERENCE','CODE','LIEN','COULEUR'));
  -- attribut_definitions (gabarits)
  ALTER TABLE attribut_definitions DROP CONSTRAINT IF EXISTS ck_attribut_definitions_type_attribut;
  ALTER TABLE attribut_definitions ADD CONSTRAINT ck_attribut_definitions_type_attribut CHECK (type_attribut IN ('TEXTE','LONG_TEXT','NOMBRE','INTEGER','DECIMAL','BOOLEEN','BOOLEAN','ENUM','MULTI_ENUM','DATE','DATETIME','DUREE','POURCENTAGE','MONTANT','UNIT_VALUE','RANGE','REFERENCE','VEHICLE_REFERENCE','CODE','LIEN','COULEUR'));
END $$
LANGUAGE plpgsql;

-- 2) produit_references.valeur_normalisee + backfill --------------------------
ALTER TABLE produit_references ADD COLUMN IF NOT EXISTS valeur_normalisee varchar(160);
UPDATE produit_references
   SET valeur_normalisee = lower(regexp_replace(valeur, '[^a-zA-Z0-9]', '', 'g'))
 WHERE valeur_normalisee IS NULL;
CREATE INDEX IF NOT EXISTS idx_produit_references_valeur_normalisee
  ON produit_references (valeur_normalisee);