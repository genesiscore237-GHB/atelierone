-- LOT U0c — État des lieux photographique VERSIONNÉ PAR VISITE + dimensions véhicule.
--
-- 1. `or_photos.categorie` : l'état des lieux est photographié par face
--    (AVANT, ARRIERE, COTE_GAUCHE, COTE_DROIT, INTERIEUR,
--    PLAQUE_IMMATRICULATION, MOTEUR, AUTRE). Le modèle parking écrase (une
--    photo par catégorie sur le véhicule) : ici chaque intervention doit
--    conserver SON propre jeu, ce que `or_id` garantit déjà.
--
-- 2. `or_photos.visite` : 'ENTREE' | 'SORTIE' — distingue l'état des lieux à
--    l'entrée de celui de la restitution (comparaison, pièce à conviction).
--
-- 3. `or_photos.reprise_de` : si la photo a été recopiée depuis l'état des
--    lieux d'une visite antérieure (et non prise à cette visite), on le trace.
--    Une reprise ne doit JAMAIS se substituer à une prise réelle.
--
-- 4. `photo_presente` : colonne dénormalisée (comme parking_vehicles) pour
--    lister un dossier sans détoaster le base64.
--
-- 5. Dimensions physiques sur `vehicules` : l'atelier ignore aujourd'hui
--    l'empreinte d'un véhicule. `dimensions_estimees` distingue une mesure
--    d'une estimation — la qualité de la donnée doit rester visible.

ALTER TABLE or_photos
  ADD COLUMN IF NOT EXISTS categorie varchar(50) NOT NULL DEFAULT 'AUTRE';
ALTER TABLE or_photos
  ADD COLUMN IF NOT EXISTS visite varchar(10) NOT NULL DEFAULT 'ENTREE';
ALTER TABLE or_photos
  ADD COLUMN IF NOT EXISTS reprise_de integer;
ALTER TABLE or_photos
  ADD COLUMN IF NOT EXISTS photo_presente boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN or_photos.categorie IS 'Face du véhicule photographiée (LOT U0c)';
COMMENT ON COLUMN or_photos.visite IS 'ENTREE ou SORTIE : état des lieux à la réception ou à la restitution';
COMMENT ON COLUMN or_photos.reprise_de IS 'or_photos.id de la photo reprise d''une visite antérieure (null = prise réelle)';

CREATE INDEX IF NOT EXISTS idx_or_photos_or_visite ON or_photos (or_id, visite, categorie);
CREATE INDEX IF NOT EXISTS idx_or_photos_reprise_de ON or_photos (reprise_de);

-- Les lignes existantes sont des états des lieux d'entrée sans face précisée.
UPDATE or_photos SET photo_presente = true WHERE url IS NOT NULL AND length(url) > 0;

-- Dimensions physiques (LOT U0d/U0c) — reprennent la nomenclature du parking.
ALTER TABLE vehicules
  ADD COLUMN IF NOT EXISTS longueur double precision;
ALTER TABLE vehicules
  ADD COLUMN IF NOT EXISTS largeur double precision;
ALTER TABLE vehicules
  ADD COLUMN IF NOT EXISTS hauteur double precision;
ALTER TABLE vehicules
  ADD COLUMN IF NOT EXISTS poids double precision;
ALTER TABLE vehicules
  ADD COLUMN IF NOT EXISTS dimensions_estimees boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN vehicules.dimensions_estimees IS 'Dimensions estimées et non mesurées (qualité de donnée)';
