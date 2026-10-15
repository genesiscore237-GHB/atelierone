-- LOT P0.4 — CONTRAINTES DE NOMENCLATURE SUR LES STATUTS
--
-- Trois colonnes de statut étaient des `varchar` libres : PostgreSQL
-- n'interdisait pas d'y écrire une valeur hors nomenclature, et le code ne
-- validait qu'une écriture sur dix. Une faute de frappe ('fait_ou_pas',
-- 'EN_COURS ' avec une espace) se retrouvait en base, invisible pour tout le
-- reste de l'application.
--
-- Ces contraintes sont le filet de sécurité sous les validations applicatives.
-- Elles ne les remplacent pas : une contrainte SQL dit « non », elle ne dit
-- pas pourquoi. Elles garantissent qu'aucun chemin — script de maintenance,
-- import, requête manuelle, contournement du serveur — ne puisse introduire
-- un statut que le code ne saura pas interpréter.
--
-- Volontairement `NOT VALID` sur les contraintes ajoutées : la migration
-- s'applique sans bloquer sur des données existantes hors nomenclature, et le
-- `VALIDATE CONSTRAINT` quand le nettoyage est fait.
-- `VALIDATE CONSTRAINT` quand le nettoyage est fait.

DO $$
DECLARE
  v_lignes_invalides bigint;
BEGIN
  -- ─── vehicules.statut_immobilisation ───────────────────────────────────────
  SELECT count(*) INTO v_lignes_invalides FROM vehicules
  WHERE statut_immobilisation IS NOT NULL
    AND statut_immobilisation NOT IN (
      'en_reception','en_diagnostic','en_reception',
      'attente_validation_client','attente_piece_locale','piece_commandee_import',
      'en_reparation','terminee_attente_paiement','terminee_client_non_venu',
      'transfere_site2','abandonne_contentieux','sorti');

  RAISE NOTICE 'vehicules.statut_immobilisation : % ligne(s) hors nomenclature', v_lignes_invalides;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_vehicules_statut_immobilisation') THEN
    ALTER TABLE vehicules ADD CONSTRAINT chk_vehicules_statut_immobilisation
      CHECK (
        statut_immobilisation IS NULL OR statut_immobilisation IN (
          'en_reception','en_diagnostic','en_reception',
          'attente_validation_client','attente_piece_locale','piece_commandee_import',
          'en_reparation','terminee_attente_paiement','terminee_client_non_venu',
          'transfere_site2','abandonne_contentieux','sorti')
      ) NOT VALID;
    COMMENT ON CONSTRAINT chk_vehicules_statut_immobilisation ON vehicules IS
      'Nomenclature des statuts d''immobilisation (atelier-service.STATUTS_IMMOBILISATION).';
  END IF;

  -- ─── lignes_ordre_reparation.statut ────────────────────────────────────────
  SELECT count(*) INTO v_lignes_invalides FROM lignes_ordre_reparation
  WHERE statut IS NOT NULL AND statut NOT IN ('a_faire','en_cours','fait','valide');

  RAISE NOTICE 'lignes_ordre_reparation.statut : % ligne(s) hors nomenclature', v_lignes_invalides;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_lignes_or_statut') THEN
    ALTER TABLE lignes_ordre_reparation ADD CONSTRAINT chk_lignes_or_statut
      CHECK (statut IS NULL OR statut IN ('a_faire','en_cours','fait','valide')) NOT VALID;
    COMMENT ON CONSTRAINT chk_lignes_or_statut ON lignes_ordre_reparation IS
      'Nomenclature des statuts de ligne de travaux (atelier-service.STATUTS_LIGNE).';
  END IF;

  -- ─── ordres_reparation.statut ─────────────────────────────────────────────
  SELECT count(*) INTO v_lignes_invalides FROM ordres_reparation
  WHERE statut IS NOT NULL AND statut NOT IN (
    'EN_ATTENTE_DIAGNOSTIC','EN_ATTENTE_VALIDATION_DIAGNOSTIC','EN_COURS',
    'EN_ATTENTE_PIECES','EN_ATTENTE_VALIDATION','CONTROLE_QUALITE',
    'PRET_A_LIVRER','BLOQUE','LIVRE','ANNULE','ferme_definitif');

  RAISE NOTICE 'ordres_reparation.statut : % ligne(s) hors nomenclature', v_lignes_invalides;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ordres_reparation_statut') THEN
    ALTER TABLE ordres_reparation ADD CONSTRAINT chk_ordres_reparation_statut
      CHECK (
        statut IS NULL OR statut IN (
          'EN_ATTENTE_DIAGNOSTIC','EN_ATTENTE_VALIDATION_DIAGNOSTIC','EN_COURS',
          'EN_ATTENTE_PIECES','EN_ATTENTE_VALIDATION','CONTROLE_QUALITE',
          'PRET_A_LIVRER','BLOQUE','LIVRE','ANNULE','ferme_definitif')
      ) NOT VALID;
    COMMENT ON CONSTRAINT chk_ordres_reparation_statut ON ordres_reparation IS
      'Nomenclature des statuts de dossier (atelier-service.STATUTS_ATELIER).';
  END IF;
END $$;
