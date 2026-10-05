-- ─── atelierone — module PARKING (GPJ), adapté sans PostGIS ──────────────────
-- Idempotent : CREATE TABLE IF NOT EXISTS / CREATE VIEW OR REPLACE / DO $$ ...
-- Tables physiques alignées sur packages/db/src/schema/parking.ts.
-- Pas de PostGIS : pas de colonnes geometry(), pas d'EXCLUDE GiST (collision
-- détectée côté applicatif via packages/geo + server/lib/parking-spatial).
-- La vue parking_spots_v sert aux requêtes brutes du router garage.

BEGIN;

SET search_path TO public;

-- ───────────────────────────── parking_sites ─────────────────────────────
CREATE TABLE IF NOT EXISTS parking_sites (
  id serial PRIMARY KEY,
  agence_id integer NOT NULL REFERENCES agences(id),
  code varchar(50) NOT NULL,
  nom varchar(255) NOT NULL,
  description text,
  plan_largeur double precision DEFAULT 100,
  plan_hauteur double precision DEFAULT 75,
  is_primary boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- ───────────────────────────── parking_zones ─────────────────────────────
CREATE TABLE IF NOT EXISTS parking_zones (
  id serial PRIMARY KEY,
  agence_id integer NOT NULL REFERENCES agences(id),
  site_id integer NOT NULL REFERENCES parking_sites(id),
  code varchar(50) NOT NULL,
  nom varchar(255) NOT NULL,
  type varchar(40) NOT NULL DEFAULT 'AIRE_LIBRE',
  geometrie jsonb NOT NULL,
  capacite_theorique integer DEFAULT 0,
  surface_stationnable double precision DEFAULT 0,
  orientation_autorisee double precision,
  marge_securite double precision DEFAULT 0.3,
  stationnable boolean DEFAULT true,
  place_parking boolean DEFAULT false,
  ressource_travail boolean DEFAULT false,
  config jsonb DEFAULT '{}',
  ordre integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- ───────────────────────────── parking_spots ─────────────────────────────
CREATE TABLE IF NOT EXISTS parking_spots (
  id serial PRIMARY KEY,
  agence_id integer NOT NULL REFERENCES agences(id),
  site_id integer NOT NULL REFERENCES parking_sites(id),
  zone_id integer NOT NULL REFERENCES parking_zones(id),
  code varchar(50) NOT NULL,
  geometrie jsonb NOT NULL,
  statut varchar(20) NOT NULL DEFAULT 'LIBRE',
  bloque boolean NOT NULL DEFAULT false,
  reserve_pour integer,
  longueur double precision,
  largeur double precision,
  rotation double precision DEFAULT 0,
  ordre integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- ──────────────────────────── parking_vehicles ───────────────────────────
CREATE TABLE IF NOT EXISTS parking_vehicles (
  id serial PRIMARY KEY,
  agence_id integer NOT NULL REFERENCES agences(id),
  num_registre integer NOT NULL,
  marque varchar(100),
  modele varchar(255),
  version varchar(255),
  couleur varchar(50),
  immatriculation varchar(50),
  vin varchar(100),
  client_nom varchar(255),
  client_telephone varchar(50),
  statut varchar(40) NOT NULL DEFAULT 'EN_PARKING',
  motif text,
  date_entree timestamp,
  date_derniere_action timestamp,
  date_devis timestamp,
  date_commande timestamp,
  date_fin_travaux timestamp,
  date_derniere_relance timestamp,
  site_id integer REFERENCES parking_sites(id),
  zone_id integer REFERENCES parking_zones(id),
  spot_id integer REFERENCES parking_spots(id),
  centre_x double precision,
  centre_y double precision,
  rotation double precision DEFAULT 0,
  marge_appliquee double precision NOT NULL DEFAULT 0.3,
  longueur double precision,
  largeur double precision,
  hauteur double precision,
  poids double precision,
  dimensions_estimees boolean DEFAULT false,
  provenance text,
  photos jsonb DEFAULT '[]',
  -- Métadonnées photos dénormalisées : évite de detoaster le jsonb (18 Mo) pour lister.
  photo_presente boolean NOT NULL DEFAULT false,
  photo_categorie varchar(50),
  photo_date varchar(50),
  notes text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- ────────────────────────── parking_movements ────────────────────────────
CREATE TABLE IF NOT EXISTS parking_movements (
  id serial PRIMARY KEY,
  agence_id integer NOT NULL REFERENCES agences(id),
  vehicle_id integer NOT NULL REFERENCES parking_vehicles(id),
  horodatage timestamp NOT NULL DEFAULT now(),
  user_id integer REFERENCES utilisateurs(id),
  type varchar(30) NOT NULL,
  site_origine_id integer REFERENCES parking_sites(id),
  zone_origine_id integer REFERENCES parking_zones(id),
  position_origine_x double precision,
  position_origine_y double precision,
  site_destination_id integer REFERENCES parking_sites(id),
  zone_destination_id integer REFERENCES parking_zones(id),
  position_destination_x double precision,
  position_destination_y double precision,
  rotation double precision,
  motif text,
  commentaire text,
  created_at timestamp DEFAULT now()
);

-- ──────────────────────────── parking_alerts ─────────────────────────────
CREATE TABLE IF NOT EXISTS parking_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agence_id integer NOT NULL REFERENCES agences(id),
  vehicle_id integer NOT NULL REFERENCES parking_vehicles(id),
  code varchar(50) NOT NULL,
  niveau varchar(20) DEFAULT 'INFO',
  message text NOT NULL,
  criteres jsonb DEFAULT '{}',
  statut varchar(20) DEFAULT 'OUVERTE',
  declenchee_le timestamp DEFAULT now(),
  cloturee_le timestamp,
  cloturee_par integer REFERENCES utilisateurs(id),
  created_at timestamp DEFAULT now()
);

-- ──────────────────────────── parking_tasks ──────────────────────────────
CREATE TABLE IF NOT EXISTS parking_tasks (
  id serial PRIMARY KEY,
  agence_id integer NOT NULL REFERENCES agences(id),
  vehicle_id integer REFERENCES parking_vehicles(id),
  type varchar(30) DEFAULT 'ACTIONS',
  titre varchar(255) NOT NULL,
  description text,
  responsable varchar(255),
  echeance timestamp,
  statut varchar(20) DEFAULT 'A_FAIRE',
  cree_par integer REFERENCES utilisateurs(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- ─────────────────────────── parking_configs ─────────────────────────────
CREATE TABLE IF NOT EXISTS parking_configs (
  id serial PRIMARY KEY,
  agence_id integer NOT NULL UNIQUE REFERENCES agences(id),
  seuil_sans_evolution_jours integer DEFAULT 15,
  seuil_immobilisation_longue_jours integer DEFAULT 90,
  seuil_attente_client_jours integer DEFAULT 15,
  seuil_attente_piece_jours integer DEFAULT 15,
  seuil_pret_sortie_jour integer DEFAULT 3,
  seuil_transfert_jours integer DEFAULT 60,
  marge_securite_defaut double precision DEFAULT 0.3,
  updated_at timestamp DEFAULT now()
);

-- ──────────────────────── parking_vehicle_photos ─────────────────────────
CREATE TABLE IF NOT EXISTS parking_vehicle_photos (
  id serial PRIMARY KEY,
  vehicle_id integer NOT NULL REFERENCES parking_vehicles(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  categorie varchar(50) NOT NULL,
  prise_le timestamp NOT NULL DEFAULT now(),
  auteur_id integer REFERENCES utilisateurs(id),
  created_at timestamp DEFAULT now()
);

-- ─── Vue parking_spots_v (statut dérivé : BLOQUE/OCCUPE/RESERVE/LIBRE) ───────
-- Colonnes listées explicitement : parking_spots conserve la colonne historique
-- `statut` (le DROP est resté commenté) → `s.*` créerait un doublon.
DROP VIEW IF EXISTS parking_spots_v;
CREATE VIEW parking_spots_v AS
SELECT s.id,
       s.agence_id,
       s.site_id,
       s.zone_id,
       s.code,
       s.geometrie,
       s.longueur,
       s.largeur,
       s.rotation,
       s.ordre,
       s.is_active,
       s.bloque,
       s.reserve_pour,
       s.created_at,
       s.updated_at,
       v.id AS vehicule_id,
       CASE
         WHEN s.bloque THEN 'BLOQUE'
         WHEN v.id IS NOT NULL THEN 'OCCUPE'
         WHEN s.reserve_pour IS NOT NULL THEN 'RESERVE'
         ELSE 'LIBRE'
       END AS statut
FROM parking_spots s
LEFT JOIN parking_vehicles v
  ON v.spot_id = s.id AND v.statut <> 'SORTI';

-- ─── Index de performance (btree uniquement — pas de GiST sans PostGIS) ─────
CREATE INDEX IF NOT EXISTS parking_vehicle_photos_vehicle_idx
  ON parking_vehicle_photos (vehicle_id);

CREATE INDEX IF NOT EXISTS parking_vehicles_site_statut_idx
  ON parking_vehicles (site_id, statut) WHERE statut <> 'SORTI';

CREATE INDEX IF NOT EXISTS parking_vehicles_agence_idx
  ON parking_vehicles (agence_id);

CREATE INDEX IF NOT EXISTS parking_zones_site_idx
  ON parking_zones (site_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS parking_spots_zone_idx
  ON parking_spots (zone_id);

CREATE INDEX IF NOT EXISTS parking_movements_vehicle_idx
  ON parking_movements (vehicle_id, horodatage DESC);

CREATE INDEX IF NOT EXISTS parking_alerts_ouvertes_idx
  ON parking_alerts (agence_id, vehicle_id) WHERE statut = 'OUVERTE';

-- ─── Colonnes photos dénormalisées (backfill idempotent, base existante) ────
ALTER TABLE parking_vehicles ADD COLUMN IF NOT EXISTS photo_presente boolean NOT NULL DEFAULT false;
ALTER TABLE parking_vehicles ADD COLUMN IF NOT EXISTS photo_categorie varchar(50);
ALTER TABLE parking_vehicles ADD COLUMN IF NOT EXISTS photo_date varchar(50);

UPDATE parking_vehicles SET
  photo_presente = (jsonb_typeof(photos) = 'array' AND jsonb_array_length(photos) > 0),
  photo_categorie = photos->0->>'categorie',
  photo_date = photos->0->>'date'
WHERE photo_presente = false
  AND jsonb_typeof(photos) = 'array'
  AND jsonb_array_length(photos) > 0;

CREATE INDEX IF NOT EXISTS parking_vehicles_photo_idx
  ON parking_vehicles (agence_id) WHERE photo_presente;

-- ─── Intégrité référentielle composite ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parking_zones_site_unique') THEN
    ALTER TABLE parking_zones ADD CONSTRAINT parking_zones_site_unique UNIQUE (id, site_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parking_spots_zone_site_fk') THEN
    ALTER TABLE parking_spots
      ADD CONSTRAINT parking_spots_zone_site_fk
      FOREIGN KEY (zone_id, site_id) REFERENCES parking_zones (id, site_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parking_vehicles_registre_unique') THEN
    ALTER TABLE parking_vehicles
      ADD CONSTRAINT parking_vehicles_registre_unique UNIQUE (agence_id, num_registre);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parking_zones_code_unique') THEN
    ALTER TABLE parking_zones
      ADD CONSTRAINT parking_zones_code_unique UNIQUE (site_id, code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parking_spots_code_unique') THEN
    ALTER TABLE parking_spots
      ADD CONSTRAINT parking_spots_code_unique UNIQUE (site_id, code);
  END IF;
END $$;

COMMIT;