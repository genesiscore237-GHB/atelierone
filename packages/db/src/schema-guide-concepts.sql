-- MIGRATION OUTIL D'AIDE À LA SAISIE — CONCEPT ARTICLE (Guide v2)
-- Application ADDITIVE et idempotente (IF NOT EXISTS).
-- Tables : guide_variant_types, guide_variant_differentiators,
--          guide_procedures, guide_procedure_steps,
--          guide_field_mappings, guide_modeling_rules, guide_relations.

CREATE TABLE IF NOT EXISTS guide_variant_types (
  id serial PRIMARY KEY,
  categorie_id integer NOT NULL REFERENCES categories(id),
  nom varchar(160) NOT NULL,
  description text,
  diff_principale varchar(255),
  est_reference boolean DEFAULT false,
  ordre integer DEFAULT 0,
  is_active boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_guide_variant_types_cat ON guide_variant_types(categorie_id);

CREATE TABLE IF NOT EXISTS guide_variant_differentiators (
  id serial PRIMARY KEY,
  variant_type_id integer NOT NULL REFERENCES guide_variant_types(id),
  cle varchar(100) NOT NULL,
  libelle varchar(160) NOT NULL,
  portee varchar(20) DEFAULT 'VARIANTE',
  unite_exemple varchar(80),
  statut varchar(20) DEFAULT 'OPTIONNEL',
  exemple varchar(160),
  ordre integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_guide_diff_vt ON guide_variant_differentiators(variant_type_id);

CREATE TABLE IF NOT EXISTS guide_procedures (
  id serial PRIMARY KEY,
  categorie_id integer NOT NULL REFERENCES categories(id),
  scenario varchar(20) DEFAULT 'NOM_SEUL',
  titre varchar(200) NOT NULL,
  contexte text,
  ordre integer DEFAULT 0,
  is_active boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_guide_procedures_cat ON guide_procedures(categorie_id);

CREATE TABLE IF NOT EXISTS guide_procedure_steps (
  id serial PRIMARY KEY,
  procedure_id integer NOT NULL REFERENCES guide_procedures(id),
  ordre integer NOT NULL,
  titre varchar(160) NOT NULL,
  ecran varchar(160),
  action text NOT NULL,
  champs text,
  verification varchar(255)
);

CREATE INDEX IF NOT EXISTS idx_guide_proc_steps ON guide_procedure_steps(procedure_id);

CREATE TABLE IF NOT EXISTS guide_field_mappings (
  id serial PRIMARY KEY,
  categorie_id integer NOT NULL REFERENCES categories(id),
  variant_type_id integer NULL REFERENCES guide_variant_types(id),
  information_metier varchar(200) NOT NULL,
  portee varchar(20) DEFAULT 'VARIANTE',
  champ_atelier_one varchar(160),
  ecran varchar(160),
  etape varchar(160),
  statut varchar(20) DEFAULT 'OPTIONNEL',
  unite_exemple varchar(80),
  ordre integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_guide_fm_cat ON guide_field_mappings(categorie_id);

CREATE TABLE IF NOT EXISTS guide_modeling_rules (
  id serial PRIMARY KEY,
  categorie_id integer NOT NULL REFERENCES categories(id),
  titre varchar(200) NOT NULL,
  enonce text NOT NULL,
  cas_exemple varchar(255),
  ordre integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_guide_mr_cat ON guide_modeling_rules(categorie_id);

CREATE TABLE IF NOT EXISTS guide_relations (
  id serial PRIMARY KEY,
  categorie_id integer NOT NULL REFERENCES categories(id),
  type_relation varchar(20) NOT NULL,
  definition text NOT NULL,
  exemple varchar(255),
  ordre integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_guide_relations_cat ON guide_relations(categorie_id);