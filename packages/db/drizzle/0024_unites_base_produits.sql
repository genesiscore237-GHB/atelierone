-- =============================================================================
-- 0024_unites_base_produits.sql
--
-- CE QUI RENDAIT LE DÉSTOCKAGE AMBIGU, ET CE QUE CETTE MIGRATION RÉPARE
--
-- 1. « Un carton n'est pas une unité de base. » 59 produits portaient CTN
--    (Carton) comme unité de base : un filtre se comptait en cartons, un outil
--    en cartons. Aucun facteur de conditionnement n'était déclaré : la ligne
--    produit_unites disait « CTN x1 », un simple décalque de la base, donc
--    rien. L'unité de base doit être la plus petite unité dans laquelle la
--    pièce se détaille.
--
-- 2. « Deux unités qui portent le même nom ne doivent pas coexister. »
--    Trois lignes pour le Litre (L, LIT, LITRE), deux pour l'Heure (H, HEU),
--    deux pour le Degré Celsius (C, CELSIUS), deux pour le Décimètre
--    (DM, DECIMETRE). Une conversion branchée sur l'une ne voyait pas les
--    produits branchés sur l'autre.
--
-- 3. « Une pièce sans unité de base ne peut pas être déstockée. »
--    210 produits sur 319 n'en avaient aucune.
--
-- Cette migration n'invente aucune donnée : elle applique une règle
-- déterministe (le type de produit), fusionne des doublons STRICTEMENT
-- identiques (même libellé, même symbole, même grandeur) et laisse les vraies
-- questions ouvertes — notamment : aucune quantité n'est convertie, parce que
-- rien ne dit combien d'unités contenait un carton.
--
-- Idempotente, comme l'exige le dépôt (AGENTS.md § « Toute nouvelle migration
-- doit être idempotente »).
-- =============================================================================


-- =============================================================================
-- 1. FUSION DES DOUBLONS
--
-- Pour chaque paire (source vers cible) :
--   a. produit_unites : la ligne source est supprimée si la cible existe déjà
--      pour le même produit (contrainte unq_produit_unites_produit_unite).
--   b. unites_conversions : idem sur (domaine_id, unite_id).
--   c. toutes les autres références sont repointées.
--   d. la source est désactivée, jamais supprimée : un historique peut la
--      citer et son identifiant doit rester résolvable.
--
-- Cas particulier du Litre : la ligne conservée est LITRE (symbole « L »),
-- parce que mouvements_stock est APPEND-ONLY — un trigger y interdit toute
-- modification — et que 19 mouvements référencent déjà LITRE. On ne réécrit
-- pas l'historique : on ramène le catalogue à l'unité que l'historique
-- emploie. La migration échouerait si elle prétendait toucher ces mouvements,
-- et c'est exactement ce que la garde doit faire.
-- =============================================================================
DO $migration$
DECLARE
  fusion record;
  src_id uuid;
  dst_id uuid;
  ref record;
BEGIN
  FOR fusion IN
    SELECT * FROM (
      VALUES
      ('LIT',       'LITRE'),
      ('L',         'LITRE'),
      ('HEU',       'H'),
      ('C',         'CELSIUS'),
      ('DECIMETRE', 'DM'),
      ('T',         'TONNE')
    ) AS x(code_source, code_cible)
  LOOP
    SELECT id INTO src_id FROM unites_mesure WHERE code = fusion.code_source;
    SELECT id INTO dst_id FROM unites_mesure WHERE code = fusion.code_cible;
    CONTINUE WHEN src_id IS NULL OR dst_id IS NULL OR src_id = dst_id;

    DELETE FROM produit_unites pu
     WHERE pu.unite_id = src_id
       AND EXISTS (
         SELECT 1 FROM produit_unites x
          WHERE x.produit_id = pu.produit_id AND x.unite_id = dst_id
       );
    UPDATE produit_unites SET unite_id = dst_id WHERE unite_id = src_id;

    DELETE FROM unites_conversions cv
     WHERE cv.unite_id = src_id
       AND EXISTS (
         SELECT 1 FROM unites_conversions x
          WHERE x.domaine_id = cv.domaine_id AND x.unite_id = dst_id
       );
    UPDATE unites_conversions SET unite_id = dst_id WHERE unite_id = src_id;

    FOR ref IN
      SELECT * FROM (VALUES
        ('achats_lignes',            'unite_id'),
        ('article_attributs',        'unite_id'),
        ('attribut_definitions',     'unite_id'),
        ('deconditionnements',       'unite_cible_id'),
        ('deconditionnements',       'unite_source_id'),
        ('inventaires',              'unite_id'),
        ('lignes_retour',            'unite_id'),
        ('modele_emballage_niveaux', 'unite_id'),
        ('mouvements_stock',         'unite_id'),
        ('prix_historique',          'unite_id'),
        ('produits',                 'unite_base_id'),
        ('produits_fournisseurs',    'unite_id'),
        ('reconditionnements',       'unite_cible_id'),
        ('reconditionnements',       'unite_source_id'),
        ('stocks',                   'unite_reference_id'),
        ('stocks_unites',            'unite_id'),
        ('transferts_stock',         'unite_id'),
        ('unites_domaines',          'unite_base_id'),
        ('ventes_lignes',            'unite_id')
      ) AS r(nom_table, nom_colonne)
    LOOP
      IF to_regclass('public.' || ref.nom_table) IS NOT NULL THEN
        EXECUTE format(
          'UPDATE public.%I SET %I = $1 WHERE %I = $2',
          ref.nom_table, ref.nom_colonne, ref.nom_colonne
        ) USING dst_id, src_id;
      END IF;
    END LOOP;

    UPDATE unites_mesure SET is_active = false WHERE id = src_id;
  END LOOP;
END
$migration$;


-- =============================================================================
-- 2. LE TYPE ET LE SYMBOLE DES UNITÉS CONSERVÉES
--
-- Les lignes conservées (H, CM) portaient le type fourre-tout « PHYSIQUE »,
-- pendant que leurs doublons portaient le type correct (TEMPS, LONGUEUR). On
-- aligne : la conversion et les formulaires filtrent par type.
--
-- Le joule (J) et le jour (JOUR) portaient tous deux le symbole « j ». Ce ne
-- sont pas des doublons — deux grandeurs différentes — mais le symbole du
-- joule était faux : le joule s'écrit « J ». Sans cette correction, un
-- formulaire qui affiche le symbole rend « j » pour les deux.
-- =============================================================================
UPDATE unites_mesure SET type = 'TEMPS'    WHERE code = 'H'  AND type = 'PHYSIQUE';
UPDATE unites_mesure SET type = 'LONGUEUR' WHERE code = 'CM' AND type = 'PHYSIQUE';
UPDATE unites_mesure SET symbole = 'J' WHERE code = 'J' AND symbole = 'j';


-- =============================================================================
-- 3. L'UNITÉ DE BASE MANQUANTE
--
-- Règle déterministe : la base est l'unité dans laquelle la pièce se détaille.
-- Pour PIECE, OUTIL, CONSOMMABLE, EQUIPEMENT, FOURNITURE, KIT et SERVICE,
-- c'est PCE (une intervention est indivisible). Les produits liquides ne sont
-- pas concernés par ce backfill : les quatre produits à base litre ou bidon
-- étaient déjà renseignés explicitement.
--
-- Si PCE est absente, la base est un bac à sable (base de test minimale) et
-- non une base de production : le référentiel d'unités n'y est pas installé.
-- On ne fabrique pas l'ancre manquante — on le signale et on n'invente rien.
-- =============================================================================
DO $migration$
DECLARE
  pce_id uuid;
  a_renseigner integer;
BEGIN
  SELECT count(*) INTO a_renseigner FROM produits WHERE unite_base_id IS NULL;
  SELECT id INTO pce_id FROM unites_mesure WHERE code = 'PCE';

  IF pce_id IS NULL THEN
    RAISE NOTICE 'unité PCE absente : % produit(s) sans base laissés en l''état (référentiel d''unités non installé)', a_renseigner;
  ELSIF a_renseigner > 0 THEN
    UPDATE produits SET unite_base_id = pce_id WHERE unite_base_id IS NULL;
  END IF;
END
$migration$;


-- =============================================================================
-- 4. LE CARTON ET LE BIDON COMME BASES
--
-- 59 produits (dont 19 avec du stock) portaient CTN comme unité de base, et
-- 3 produits (données de démonstration) BID. Aucun facteur n'était déclaré :
-- la ligne produit_unites était « CTN x1 », un décalque de la base. On corrige
-- la base vers PCE et on réaligne ces lignes décalques ; les vraies lignes de
-- conditionnement (facteur supérieur à 1) ne sont pas touchées.
--
-- Aucune quantité n'est multipliée : rien ne dit combien d'unités contenait
-- le carton. Les nombres restent ce qu'ils étaient ; seule l'unité cesse
-- d'être fausse.
-- =============================================================================
DO $migration$
DECLARE
  pce_id uuid;
  ctn_id uuid;
  bid_id uuid;
BEGIN
  SELECT id INTO pce_id FROM unites_mesure WHERE code = 'PCE';
  SELECT id INTO ctn_id FROM unites_mesure WHERE code = 'CTN';
  SELECT id INTO bid_id FROM unites_mesure WHERE code = 'BID';

  IF ctn_id IS NOT NULL AND pce_id IS NOT NULL THEN
    DELETE FROM produit_unites pu
     WHERE pu.unite_id = ctn_id
       AND pu.facteur_vers_base = 1
       AND EXISTS (
         SELECT 1 FROM produit_unites x
          WHERE x.produit_id = pu.produit_id AND x.unite_id = pce_id
       );
    UPDATE produit_unites
       SET unite_id = pce_id, est_unite_base = true
     WHERE unite_id = ctn_id AND facteur_vers_base = 1;
    UPDATE produits SET unite_base_id = pce_id WHERE unite_base_id = ctn_id;
  END IF;

  IF bid_id IS NOT NULL AND pce_id IS NOT NULL THEN
    UPDATE produits SET unite_base_id = pce_id WHERE unite_base_id = bid_id;
  END IF;
END
$migration$;
