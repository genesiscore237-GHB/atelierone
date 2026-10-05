-- MIGRATION GUIDE DE SAISIE INTELLIGENT (PHASE 2, Module 1)
-- Application ADDITIVE et idempotente (IF NOT EXISTS).
-- Tables : guide_categories, guide_steps, guide_rules, guide_examples,
--          guide_common_errors, guide_search_aliases.
-- Colonnes nouvelles (nullable) : attribut_definitions.modele_valeur,
--                                 attribut_definitions.explication.

CREATE TABLE IF NOT EXISTS guide_categories (
  id serial PRIMARY KEY,
  categorie_id integer NULL REFERENCES categories(id),
  type_produit varchar(30) NULL,
  titre varchar(160) NOT NULL,
  contexte text,
  ordre integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unq_guide_cat ON guide_categories(categorie_id, type_produit);

CREATE TABLE IF NOT EXISTS guide_steps (
  id serial PRIMARY KEY,
  categorie_id integer NOT NULL REFERENCES categories(id),
  ordre integer NOT NULL,
  titre varchar(160) NOT NULL,
  texte text NOT NULL,
  portee varchar(20),
  champ_cle varchar(100),
  recommandation text
);

CREATE TABLE IF NOT EXISTS guide_rules (
  id serial PRIMARY KEY,
  categorie_id integer NOT NULL REFERENCES categories(id),
  type varchar(20) NOT NULL,
  condition text,
  conseil text NOT NULL,
  preuve text,
  exemple_id integer REFERENCES produits(id)
);

CREATE TABLE IF NOT EXISTS guide_examples (
  id serial PRIMARY KEY,
  categorie_id integer NOT NULL REFERENCES categories(id),
  produit_id integer REFERENCES produits(id),
  article_id integer REFERENCES produit_articles(id),
  libelle varchar(160) NOT NULL,
  motif varchar(255),
  est_reference boolean DEFAULT false,
  ordre integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS guide_common_errors (
  id serial PRIMARY KEY,
  categorie_id integer NOT NULL REFERENCES categories(id),
  code varchar(80) NOT NULL,
  message varchar(255) NOT NULL,
  actions text NOT NULL,
  severity varchar(10) DEFAULT 'warning'
);

CREATE TABLE IF NOT EXISTS guide_search_aliases (
  id serial PRIMARY KEY,
  alias varchar(160) NOT NULL,
  categorie_id integer NULL REFERENCES categories(id),
  definition_id integer NULL REFERENCES attribut_definitions(id),
  type varchar(20) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS unq_guide_alias_active ON guide_search_aliases(alias, type);

ALTER TABLE attribut_definitions
  ADD COLUMN IF NOT EXISTS modele_valeur jsonb,
  ADD COLUMN IF NOT EXISTS explication text;