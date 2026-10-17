-- 0013 — Deux statuts d'immobilisation qui manquaient, et la contrainte qui les admet.
--
-- POURQUOI
--
--   Le registre parking connaissait quatre états que le vocabulaire
--   d'immobilisation ne savait pas nommer : EN_VENTE, ACCIDENTE,
--   A_TRANSFERER et DONNEES_INCOMPLETES. La projection renvoyait `null` pour
--   les quatre, avec ce commentaire : « pas d'équivalent franc ».
--
--   Ce refus d'inventer était prudent. Mais `null` ne veut pas dire
--   « n'invente rien » : il veut dire « n'écris rien ». Le véhicule conservait
--   alors son DERNIER statut connu. Un véhicule passé en ACCIDENTE gardait
--   `en_reception`, et l'agent lisait :
--
--       parking    → « accidenté »
--       atelier    → « en réception »
--
--   Deux vérités contradictoires, sur le même véhicule, au même instant, et
--   rien ne le signalait. C'est le pire genre de défaut : invisible par
--   construction, donc jamais corrigé.
--
-- LES DEUX ÉTATS AJOUTÉS
--
--   accident   le véhicule est immobilisé PAR SON ÉTAT. Ne pas le nommer
--              revenait à dire qu'un accident n'immobilise pas.
--   en_vente    hors flux atelier, mais présent au parc. Ce n'est pas une
--              absence : c'est une situation, avec ses propres seuils.
--
--   `transfere_site2` existait déjà côté code et n'était relié à rien : c'est
--   lui qu'on rattache à A_TRANSFERER.
--   `DONNEES_INCOMPLETES` se projette vers `en_reception` : la voiture EST
--   reçue, c'est la FICHE qui est incomplète. Traiter une information
--   manquante comme une absence de véhicule inventait un problème inexistant.
--
-- ADDITIF ET IDEMPOTENT
--
--   Aucune ligne n'est supprimée ni modifiée : on élargit une contrainte et on
--   recale les véhicules qui portaient un statut devenu nommable. Rejouable
--   sans effet.

-- 1. Élargissement de la contrainte de nomenclature — EN PREMIER.
--
--    L'ordre est structurant, pas décoratif : écrire `accidente` dans une
--    colonne avant d'avoir autorisé `accidente` viole la contrainte — ce que
--    fait précisément cette migration, dans l'autre sens, au premier essai.
--    Recréée plutôt que modifiée : `DROP CONSTRAINT IF EXISTS` puis `ADD`
--    reste idempotent et marche sur toutes les versions.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_vehicules_statut_immobilisation') THEN
    ALTER TABLE vehicules DROP CONSTRAINT chk_vehicules_statut_immobilisation;
  END IF;

  ALTER TABLE vehicules ADD CONSTRAINT chk_vehicules_statut_immobilisation
    CHECK (
      statut_immobilisation IS NULL OR statut_immobilisation IN (
        'en_reception','en_diagnostic','en_reparation',
        'attente_validation_client','attente_piece_locale','piece_commandee_import',
        'terminee_attente_paiement','terminee_client_non_venu',
        'transfere_site2','abandonne_contentieux',
        'accidente','en_vente',
        'sorti'
      )
    ) NOT VALID;

  ALTER TABLE vehicules VALIDATE CONSTRAINT chk_vehicules_statut_immobilisation;
  RAISE NOTICE '0013 : contrainte de nomenclature elargie et validee.';
END $$;

-- 2. Recalage des véhicules qui sont réellement dans ces situations.
--    On ne devine pas : seuls ceux dont la ligne parking porte explicitement
--    le statut concerné sont concernés. Un véhicule sans ligne parking reste
--    tel quel — on n'invente pas son état à partir d'une absence.
DO $$
DECLARE n int;
BEGIN
  UPDATE vehicules v
     SET statut_immobilisation = CASE p.statut
           WHEN 'ACCIDENTE' THEN 'accidente'
           WHEN 'EN_VENTE'  THEN 'en_vente'
           ELSE 'en_reception'
         END
    FROM parking_vehicles p
   WHERE p.vehicule_id = v.id
     AND p.id = (SELECT max(id) FROM parking_vehicles WHERE vehicule_id = v.id)
     AND p.statut IN ('ACCIDENTE', 'EN_VENTE', 'A_TRANSFERER', 'DONNEES_INCOMPLETES')
     AND (v.statut_immobilisation IS NULL
          OR v.statut_immobilisation NOT IN ('accidente', 'en_vente', 'transfere_site2'));
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '0013 : % vehicule(s) recale(s) sur un etat enfin nomme.', n;
END $$;