-- LOT R1 — Unicité de l'immatriculation par agence (dédoublonnage plaque).
--
-- Objectif : empêcher qu'un même véhicule soit créé deux fois dans une agence
-- alors que sa plaque n'est saisie que différemment (espaces, casse, ponctuation).
--
-- On n'ajoute PAS de contrainte unique sur vehicules.immatriculation brute :
-- la même plaque peut légitimement exister dans deux agences distinctes (client
-- qui change d'agence), et surtout plusieurs lignes parking sans plaque
-- (immatriculation NULL) coexistent par conception (D3). L'unicité est donc
-- portée par une colonne dérivée `immat_norm` (plaque normalisée), NULL pour
-- les véhicules sans plaque — ce qui respecte le principe « pas d'invention ».
--
-- La normalisation imite parking-vehicule-service.ts:normaliserImmatriculation :
--   trim + suppression de tous les espaces + mise en majuscules.
-- La ponctuation (tirets, points) est CONSERVÉE : elle fait partie du libellé
-- officiel de la plaque et la retirer risquerait de fusionner à tort.

-- 1. Colonne dérivée (normalisée) — nullable : les véhicules sans plaque restent NULL.
ALTER TABLE "vehicules" ADD COLUMN IF NOT EXISTS "immat_norm" varchar(50);

-- 2. Index de lecture pour les recherches par plaque normalisée.
CREATE INDEX IF NOT EXISTS "idx_vehicules_immat_norm" ON "vehicules" ("immat_norm");

-- 3. Contrainte d'unicité PARTIELLE : uniquement sur les plaques réellement
--    renseignées (immat_norm NOT NULL). Les véhicules sans plaque (NULL) ne
--    sont PAS soumis à l'unicité — conformément au modèle actuel.
--
--    Le backfill de immat_norm et la fusion des doublons éventuels sont pris
--    en charge par le script dédié packages/db/src/dedup-vehicules-immat.ts,
--    invoqué PAR db:test-setup AVANT drizzle-kit migrate. Ce script doit donc
--    tourner avant l'application de cette migration sur une base existante.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_vehicules_agence_immat_norm"
  ON "vehicules" ("agence_id", "immat_norm")
  WHERE "immat_norm" IS NOT NULL;
