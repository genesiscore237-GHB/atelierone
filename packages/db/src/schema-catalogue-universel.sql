-- ============================================================
-- SCHEMA CATALOGUE UNIVERSEL — P0 (fondations), ADDITIF et IDEMPOTENT.
--
-- Contenu :
--   1. categories            : + domaine, niveau_ontologie, renderer_hint
--   2. article_attributs / variante_attributs :
--      + 13 types d'attribut, contraintes (obligatoire, searchable,
--        filtrable, comparable, liste, precision, unite_id, aide)
--      + statut INCONNU / N_A / RENSEIGNE
--      + provenance / confiance / source / preuve
--   3. attribut_definitions  : ontologie des attributs par nœud catégorie
--   4. unites_domaines + unites_conversions : 1000 mm = 1 m exigible
--   5. seeds unités physiques + domaines + conversions (idempotents)
--
-- Règle stricte : AUCUN DROP / ALTER destructif. Exécutable plusieurs fois.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. CATEGORIES — colonnes d'ontologie (nullable ⇒ zéro impact)
-- ------------------------------------------------------------------
ALTER TABLE categories ADD COLUMN IF NOT EXISTS domaine varchar(50);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS niveau_ontologie varchar(20) DEFAULT 'CATEGORIE';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS renderer_hint varchar(40);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_categories_niveau_ontologie') THEN
    ALTER TABLE categories ADD CONSTRAINT ck_categories_niveau_ontologie
      CHECK (niveau_ontologie IN ('FAMILLE', 'CATEGORIE', 'SOUS', 'TYPE'));
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 2. EAV — colonnes étendues (article_attributs & variante_attributs)
-- ------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['article_attributs', 'variante_attributs']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS obligatoire boolean NOT NULL DEFAULT false;', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS searchable boolean NOT NULL DEFAULT false;', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS filtrable boolean NOT NULL DEFAULT false;', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS comparable boolean NOT NULL DEFAULT false;', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS liste jsonb NOT NULL DEFAULT ''[]''::jsonb;', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS precision numeric(8,4);', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS aide text;', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS unite_id uuid REFERENCES unites_mesure(id) ON DELETE SET NULL;', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS statut_valeur varchar(20) NOT NULL DEFAULT ''RENSEIGNE'';', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS provenance varchar(30);', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS source varchar(160);', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS niveau_confiance varchar(20);', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS source_date timestamp;', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS source_par integer REFERENCES utilisateurs(id) ON DELETE SET NULL;', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS preuve text;', tbl);

    -- types d'attribut élargis (13) + alias legacy BOOLEAN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = format('ck_%s_type_attribut', tbl)) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT ck_%s_type_attribut CHECK (type_attribut IN (''TEXTE'',''NOMBRE'',''BOOLEEN'',''BOOLEAN'',''ENUM'',''MULTI_ENUM'',''DATE'',''DUREE'',''POURCENTAGE'',''MONTANT'',''REFERENCE'',''CODE'',''LIEN'',''COULEUR''));', tbl, tbl);
    END IF;

    -- INCONNU / NON APPLICABLE / RENSEIGNE
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = format('ck_%s_statut_valeur', tbl)) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT ck_%s_statut_valeur CHECK (statut_valeur IN (''RENSEIGNE'',''INCONNU'',''N_A''));', tbl, tbl);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = format('ck_%s_provenance', tbl)) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT ck_%s_provenance CHECK (provenance IS NULL OR provenance IN (''MANUELLE'',''CATALOGUE_FABRICANT'',''CATALOGUE_FOURNISSEUR'',''IMPORT_BULK'',''MESURE'',''DOCUMENTATION'',''API'',''SYSTEME'',''AUTRE''));', tbl, tbl);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = format('ck_%s_niveau_confiance', tbl)) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT ck_%s_niveau_confiance CHECK (niveau_confiance IS NULL OR niveau_confiance IN (''OFFICIEL'',''HOMOLOGUE'',''TECHNIQUE'',''COMMERCIAL'',''MANUELLE''));', tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------------
-- 3. ATTRIBUT_DEFINITIONS — ontologie (gabarit par nœud catégorie)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attribut_definitions (
  id serial PRIMARY KEY,
  categorie_id integer REFERENCES categories(id) ON DELETE CASCADE,
  famille_id integer REFERENCES categories(id) ON DELETE CASCADE,
  type_produit varchar(20),
  portee varchar(20) NOT NULL DEFAULT 'ARTICLE',
  cle varchar(100) NOT NULL,
  libelle varchar(160) NOT NULL,
  type_attribut varchar(20) NOT NULL DEFAULT 'TEXTE',
  obligatoire boolean NOT NULL DEFAULT false,
  searchable boolean NOT NULL DEFAULT false,
  filtrable boolean NOT NULL DEFAULT false,
  comparable boolean NOT NULL DEFAULT false,
  min numeric(12,2),
  max numeric(12,2),
  precision numeric(8,4),
  liste jsonb NOT NULL DEFAULT '[]'::jsonb,
  unite_id uuid REFERENCES unites_mesure(id) ON DELETE SET NULL,
  aide text,
  ordre integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attribut_definitions_categorie ON attribut_definitions(categorie_id);
CREATE INDEX IF NOT EXISTS idx_attribut_definitions_famille ON attribut_definitions(famille_id);
CREATE INDEX IF NOT EXISTS idx_attribut_definitions_type_produit ON attribut_definitions(type_produit);

-- une définition unique par (categorie, famille, type_produit, cle), NULLs compris
CREATE UNIQUE INDEX IF NOT EXISTS unq_attribut_definition_scope
  ON attribut_definitions(COALESCE(categorie_id, 0), COALESCE(famille_id, 0), COALESCE(type_produit, '*'), cle);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_attribut_definitions_scope') THEN
    ALTER TABLE attribut_definitions ADD CONSTRAINT ck_attribut_definitions_scope
      CHECK (categorie_id IS NOT NULL OR famille_id IS NOT NULL OR type_produit IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_attribut_definitions_type_attribut') THEN
    ALTER TABLE attribut_definitions ADD CONSTRAINT ck_attribut_definitions_type_attribut
      CHECK (type_attribut IN ('TEXTE','NOMBRE','BOOLEEN','BOOLEAN','ENUM','MULTI_ENUM','DATE','DUREE','POURCENTAGE','MONTANT','REFERENCE','CODE','LIEN','COULEUR'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_attribut_definitions_portee') THEN
    ALTER TABLE attribut_definitions ADD CONSTRAINT ck_attribut_definitions_portee
      CHECK (portee IN ('ARTICLE','VARIANTE','EXEMPLAIRE','POSITION','VEHICULE','LOT','FOURNISSEUR'));
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 4. UNITES — domaines + conversions (inter-échelles)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unites_domaines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code varchar(20) NOT NULL UNIQUE,
  libelle varchar(50) NOT NULL,
  unite_base_id uuid NOT NULL REFERENCES unites_mesure(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS unites_conversions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domaine_id uuid NOT NULL REFERENCES unites_domaines(id) ON DELETE CASCADE,
  unite_id uuid NOT NULL REFERENCES unites_mesure(id) ON DELETE CASCADE,
  facteur_vers_base numeric(30,12),
  formule_derivee text,
  precision numeric(8,4),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unites_conversions_domaine ON unites_conversions(domaine_id);
CREATE INDEX IF NOT EXISTS idx_unites_conversions_unite ON unites_conversions(unite_id);
CREATE UNIQUE INDEX IF NOT EXISTS unq_unites_conversions_domaine_unite ON unites_conversions(domaine_id, unite_id);

-- ------------------------------------------------------------------
-- 5. SEEDS (idempotents) — unités physiques + domaines + conversions
-- ------------------------------------------------------------------
INSERT INTO unites_mesure (code, libelle, symbole, type) VALUES
  ('M', 'Mètre', 'm', 'PHYSIQUE'),
  ('CM', 'Centimètre', 'cm', 'PHYSIQUE'),
  ('MM', 'Millimètre', 'mm', 'PHYSIQUE'),
  ('KM', 'Kilomètre', 'km', 'PHYSIQUE'),
  ('KG', 'Kilogramme', 'kg', 'PHYSIQUE'),
  ('G', 'Gramme', 'g', 'PHYSIQUE'),
  ('T', 'Tonne', 't', 'PHYSIQUE'),
  ('L', 'Litre', 'L', 'PHYSIQUE'),
  ('ML', 'Millilitre', 'mL', 'PHYSIQUE'),
  ('C', 'Degré Celsius', '°C', 'PHYSIQUE'),
  ('F', 'Degré Fahrenheit', '°F', 'PHYSIQUE'),
  ('K', 'Kelvin', 'K', 'PHYSIQUE'),
  ('BAR', 'Bar', 'bar', 'PHYSIQUE'),
  ('PA', 'Pascal', 'Pa', 'PHYSIQUE'),
  ('PSI', 'PSI', 'psi', 'PHYSIQUE'),
  ('J', 'Joule', 'J', 'PHYSIQUE'),
  ('KJ', 'Kilojoule', 'kJ', 'PHYSIQUE'),
  ('M2', 'Mètre carré', 'm²', 'PHYSIQUE'),
  ('S', 'Seconde', 's', 'PHYSIQUE'),
  ('MIN', 'Minute', 'min', 'PHYSIQUE'),
  ('H', 'Heure', 'h', 'PHYSIQUE')
ON CONFLICT (code) DO NOTHING;

INSERT INTO unites_domaines (code, libelle, unite_base_id)
SELECT 'LONGUEUR', 'Longueur', id FROM unites_mesure WHERE code = 'M'
ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle, unite_base_id = EXCLUDED.unite_base_id;

INSERT INTO unites_domaines (code, libelle, unite_base_id)
SELECT 'MASSE', 'Masse', id FROM unites_mesure WHERE code = 'KG'
ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle, unite_base_id = EXCLUDED.unite_base_id;

INSERT INTO unites_domaines (code, libelle, unite_base_id)
SELECT 'VOLUME', 'Volume', id FROM unites_mesure WHERE code = 'L'
ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle, unite_base_id = EXCLUDED.unite_base_id;

INSERT INTO unites_domaines (code, libelle, unite_base_id)
SELECT 'TEMPERATURE', 'Température', id FROM unites_mesure WHERE code = 'C'
ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle, unite_base_id = EXCLUDED.unite_base_id;

INSERT INTO unites_domaines (code, libelle, unite_base_id)
SELECT 'PRESSION', 'Pression', id FROM unites_mesure WHERE code = 'BAR'
ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle, unite_base_id = EXCLUDED.unite_base_id;

INSERT INTO unites_domaines (code, libelle, unite_base_id)
SELECT 'ENERGIE', 'Énergie', id FROM unites_mesure WHERE code = 'J'
ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle, unite_base_id = EXCLUDED.unite_base_id;

INSERT INTO unites_domaines (code, libelle, unite_base_id)
SELECT 'SURFACE', 'Surface', id FROM unites_mesure WHERE code = 'M2'
ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle, unite_base_id = EXCLUDED.unite_base_id;

INSERT INTO unites_domaines (code, libelle, unite_base_id)
SELECT 'TEMPS', 'Temps', id FROM unites_mesure WHERE code = 'S'
ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle, unite_base_id = EXCLUDED.unite_base_id;

-- Conversions (linéaires) — l'unité de BASE de chaque domaine est incluse (facteur 1.0)
-- pour que les conversions inter-échelles (1000 mm = 1 m) soient évaluables via le moteur.
INSERT INTO unites_conversions (domaine_id, unite_id, facteur_vers_base, formule_derivee)
SELECT d.id, u.id, 1.0, NULL
FROM unites_domaines d
JOIN unites_mesure u ON u.id = d.unite_base_id
ON CONFLICT (domaine_id, unite_id)
DO UPDATE SET facteur_vers_base = EXCLUDED.facteur_vers_base, formule_derivee = EXCLUDED.formule_derivee;
INSERT INTO unites_conversions (domaine_id, unite_id, facteur_vers_base, formule_derivee)
SELECT d.id, u.id, c.facteur, NULL
FROM unites_domaines d
JOIN (VALUES
  ('LONGUEUR', 'MM', 0.001),
  ('LONGUEUR', 'CM', 0.01),
  ('LONGUEUR', 'KM', 1000.0),
  ('MASSE', 'G', 0.001),
  ('MASSE', 'T', 1000.0),
  ('VOLUME', 'ML', 0.001),
  ('PRESSION', 'PA', 0.00001),
  ('PRESSION', 'PSI', 0.0689476),
  ('ENERGIE', 'KJ', 1000.0),
  ('TEMPS', 'MIN', 60.0),
  ('TEMPS', 'H', 3600.0)
) AS c(domaine_code, u_code, facteur)
  ON c.domaine_code = d.code
JOIN unites_mesure u ON u.code = c.u_code
ON CONFLICT (domaine_id, unite_id)
DO UPDATE SET facteur_vers_base = EXCLUDED.facteur_vers_base, formule_derivee = EXCLUDED.formule_derivee;

-- Conversions non linéaires (température) : exprimées par formule
INSERT INTO unites_conversions (domaine_id, unite_id, facteur_vers_base, formule_derivee)
SELECT d.id, u.id, NULL, 'celsius = (fahrenheit - 32) * 5 / 9'
FROM unites_domaines d JOIN unites_mesure u ON u.code = 'F'
WHERE d.code = 'TEMPERATURE'
ON CONFLICT (domaine_id, unite_id)
DO UPDATE SET facteur_vers_base = EXCLUDED.facteur_vers_base, formule_derivee = EXCLUDED.formule_derivee;

INSERT INTO unites_conversions (domaine_id, unite_id, facteur_vers_base, formule_derivee)
SELECT d.id, u.id, NULL, 'celsius = kelvin - 273.15'
FROM unites_domaines d JOIN unites_mesure u ON u.code = 'K'
WHERE d.code = 'TEMPERATURE'
ON CONFLICT (domaine_id, unite_id)
DO UPDATE SET facteur_vers_base = EXCLUDED.facteur_vers_base, formule_derivee = EXCLUDED.formule_derivee;

-- ------------------------------------------------------------------
-- FIN — schéma catalogue universel P0 appliqué.
-- ------------------------------------------------------------------