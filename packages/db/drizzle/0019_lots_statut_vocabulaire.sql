-- 0019 — Un seul vocabulaire pour le statut d'un lot.
--
-- POURQUOI
--
--   `lots.statut` est un `varchar(50)` sans contrainte, et le relevé
--   trouve TROIS vocabulaires coexistant sur 23 lots :
--
--     'disponible'  14 lignes
--     'ACTIF'        8 lignes
--     'perime'       1 ligne
--
--   Trois choses strictement fausses :
--
--     · deux écritures de casse pour ce qui semble être le même état ;
--     · aucun état pour un lot RAPPELÉ par le fournisseur, qui est un cas
--       réel et que la migration 0017 distingue désormais par
--       `lots.est_bloque` ;
--     · aucun état pour un lot dont le contenu est épuisé.
--
--   Tant qu'un seul état s'écrit "ACTIF" et un autre "disponible", une
--   requête doit écrire `statut IN ('ACTIF','disponible')` et s'attendre à
--   en manquer un à chaque nouveau script.
--
-- POURQUOI C'EST SÛR NORMALISER MAINTENANT
--
--   `lots.statut` n'est écrit qu'à UN endroit dans tout le code :
--   `lot-service.ts:54`, qui écrit la constante `"disponible"`. Aucune
--   autre écriture, dans aucun router, dans aucun script. Les deux autres
--   lectures (`outillage-router.ts:267`) se contentent de l'afficher.
--   Normaliser ne peut donc pas casser un comportement existant : il n'y a
--   pas de logique qui en dépend.
--
-- ET POURQUOI ON NE FABRIQUE PAS DE STATUT AU LOT OUVERT
--
--   La migration 0018 ajoute `date_ouverture`, dont la présence EST
--   l'information « ce contenant est ouvert ». Ajouter un statut 'ouvert'
--   créerait un DEUXIÈME état à synchroniser avec cette date, donc une
--   seconde occasion de désaccord — exactement le défaut qu'on combat.
--   Le statut décrit le cycle de vie ; l'ouverture est un fait daté.
--
-- ADDITIF ET IDEMPOTENT
--
--   L'`UPDATE` de normalisation est idempotent : une seconde exécution
--   ne trouve plus rien à changer. La contrainte est recréée en
--   `DO $$` avec `DROP … IF EXISTS` préalable, ce qui reste rejouable.

-- 1. Recalage avant contrainte — sinon 'ACTIF' violerait la CHECK et
--    l'ADD CONSTRAINT échouerait. L'ordre est structurant, pas décoratif.
DO $$
DECLARE n int;
BEGIN
    UPDATE lots
       SET statut = lower(btrim(statut))
     WHERE statut <> lower(btrim(statut));

    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '0019 : % lot(s) recale(s) en minuscule.', n;

    -- 'ACTIF' et 'DISPONIBLE' désignent le même état : un lot vivant,
    -- non périmé, non bloqué. Retiré plus bas, on le remplace ici.
    UPDATE lots SET statut = 'disponible' WHERE statut = 'actif';

    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '0019 : % lot(s) ACTIF recale(s) sur « disponible ».', n;
END $$;

-- 2. La contrainte de vocabulaire.
--
--    `NOT VALID` puis `VALIDATE` : si une base avait déjà une valeur
--    hors vocabulaire, le ADD échouerait immédiatement. Ici on veut le
--    savoir — mais la validation explicite documente l'intention et
--    permet de distinguer « ajouté » de « vérifié ».
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_lots_statut') THEN
        ALTER TABLE lots DROP CONSTRAINT chk_lots_statut;
    END IF;

    ALTER TABLE lots ADD CONSTRAINT chk_lots_statut
        CHECK (
            statut IS NULL OR statut IN (
                'disponible',         -- vivant, ni périmé ni rappelé
                'perime',             -- date de péremption dépassée
                'bloque',             -- consignation ou rappel (cf. est_bloque)
                'rappel_fournisseur', -- demande du fournisseur, même avant péremption
                'epuise',             -- contenant ouvert, contenu nul
                'rejete',             -- refus à réception
                'retour_fournisseur'  -- renvoyé
            )
        ) NOT VALID;

    ALTER TABLE lots VALIDATE CONSTRAINT chk_lots_statut;
    RAISE NOTICE '0019 : vocabulaire des statuts de lot borne et valide.';
END $$;

COMMENT ON COLUMN lots.statut IS
  'Cycle de vie du lot : disponible | perime | bloque | rappel_fournisseur | epuise | rejete | retour_fournisseur. '
  'Ne décrit PAS l''ouverture du contenant : c''est `date_ouverture` (NULL = scellé).';

-- 3. Constat final : l'état réel des lots après normalisation.
DO $$
DECLARE n_total int; n_vides int;
BEGIN
    SELECT count(*) INTO n_total FROM lots;

    SELECT count(*) INTO n_vides
      FROM lots
     WHERE COALESCE(contenu_restant, quantite_initiale, 0) <= 0;

    RAISE NOTICE '0019 : % lot(s) au total, % sans contenu restant.', n_total, n_vides;
END $$;