-- 0018 — Le fût d'huile : scellé, ouvert, puis ses bidons.
--
-- LE BESOIN
--
--   « L'huile qu'on achète en fût et qu'on déconditionne en petite unité
--   litre pour les vidanges, mais dont on doit avoir une traçabilité
--   impeccable. »
--
-- LE MODÈLE ACTUEL, ET CE QU'IL FAIT PERDRE
--
--   `deconditionnements` ne comporte AUCUNE colonne de lot. Relever :
--
--     produit_id | unite_source_id | unite_cible_id | quantite_source | quantite_generee
--
--   Il n'y a pas de `lot_id`. Le mouvement écrit par `operationDouble`
--   n'en porte pas davantage.
--
--   Concrètement : un fût d'huile 20W-50 arrive du fournisseur comme le
--   lot L1, daté, identifié, traçable. On l'ouvre. On le déconditionne
--   en 208 bidons. À cet instant précis — celui où la traçabilité compte
--   — le lien entre les bidons et le lot L1 disparaît. Les 208 bidons
--   entrent dans le stock comme de l'huile générique.
--
--   Le manque n'est pas théorique : 19 déconditionnements ont déjà été
--   exercés en base, sans qu'un seul lot ait survécu à l'opération.
--
-- ET LA SECONDE MOITIÉ DU PROBLÈME : LA DLC
--
--   Une huile scellée se garde plusieurs années. Une fois ouverte, elle
--   s'oxyde et se périme en quelques mois. Un fût ouvert le 12/03/2026
--   ne peut pas produire un bidon valable jusqu'en 2030.
--
--   Le modèle n'a pas la notion d'OUVERTURE. Il n'y a qu'un
--   `date_peremption`, qui décrit le contenant scellé, et il est recopié
--   tel quel. Le système annonce donc une huile périmée 4 ans après sa
--   première vidange.
--
--   L'expert métier est explicite sur le point de méthode : ne pas
--   inventer une périodicité universelle. Elle dépend de la notice du
--   fabricant, du constructeur, de la criticité de la mesure et de
--   l'usage. D'où les deux colonnes `periodicite_ouverture_jours` et
--   `reference_ouverture` — le RAPPEL du délai retenu, et la source de
--   ce délai. On n'impose rien : on enregistre ce que le garage sait.
--
-- LE MODÈLE AJOUTÉ
--
--   1. RÉCEPTION   fût 208 L  → lot L1, `date_ouverture` NULL = scellé
--   2. OUVERTURE   date_ouverture = J, periodicite = produits.dlc_jours
--   3. OUVERTURE   référence = « Castrol 5W30 — notice constructeur »
--   4. DÉCONDIT.   lot cible L2 : lot_source_id = L1,
--                             date_ouverture = J,
--                             date_peremption = J + periodicite
--   5. CONSOMMATION FEFO : L2 d'abord (le plus ancien ouvert), puis le
--                   fût encore scellé.
--
--   Un second fût reçu en juin mais ouvert en juin 2027 portera une DLC
--   plus tardive, et sera donc consommé APRÈS le premier. La règle découle
--   de la date d'ouverture, pas d'un ordre arbitraire — c'est exactement
--   le comportement attendu d'un garage qui n'a pas envie de jetter.
--
-- GRANULARITÉ RETENUE
--
--   Un lot de bidons GROUPÉS, pas un lot par flacon. 208 lots pour un
--   seul fût serait inapplicable au comptage manuel.
--
-- ADDITIF ET IDEMPOTENT
--
--   `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION/VIEW`.
--   Aucune ligne existante n'est modifiée : les 19 déconditionnements
--   passés restent sans lot, ce qui est la vérité sur eux.

-- 1. L'ouverture d'un lot.
ALTER TABLE lots ADD COLUMN IF NOT EXISTS date_ouverture             date;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS periodicite_ouverture_jours integer;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS reference_ouverture        varchar(200);
ALTER TABLE lots ADD COLUMN IF NOT EXISTS lot_source_id              integer REFERENCES lots(id);

-- Le contenu du contenant, en unité de BASE : un fût ouvert n'est pas
-- consommé d'un bloc. `contenu_restant` est decrementé à chaque
-- déconditionnement ; `contenu_source` est figé à l'ouverture. Ils
-- permettent d'afficher « 145 L restants sur 208 » et de détecter un
-- fût déclaré ouvert alors qu'il est plein.
ALTER TABLE lots ADD COLUMN IF NOT EXISTS contenu_source   numeric(14,4);
ALTER TABLE lots ADD COLUMN IF NOT EXISTS contenu_restant  numeric(14,4);

COMMENT ON COLUMN lots.date_ouverture IS
  'Date d''ouverture du contenant. NULL = scellé. Une date = ouvert, et la DLC des bidons dérivés vaut date_ouverture + periodicite_ouverture_jours.';
COMMENT ON COLUMN lots.lot_source_id IS
  'Lot d''origine. Renseigné sur les bidons issus d''un fût : c''est ce lien qui porte la traçabilité à travers le déconditionnement.';
COMMENT ON COLUMN lots.contenu_restant IS
  'Contenu restant du contenant ouvert, en unité de base. NULL = contenu inconnu ou contenant scellé.';

-- 2. Le déconditionnement transporte enfin le lot.
ALTER TABLE deconditionnements ADD COLUMN IF NOT EXISTS lot_id_source  integer REFERENCES lots(id);
ALTER TABLE deconditionnements ADD COLUMN IF NOT EXISTS lot_id_cible   integer REFERENCES lots(id);
ALTER TABLE deconditionnements ADD COLUMN IF NOT EXISTS date_ouverture date;
ALTER TABLE deconditionnements ADD COLUMN IF NOT EXISTS dlc_cible      date;

COMMENT ON COLUMN deconditionnements.lot_id_source IS
  'Lot du contenant d''origine. C''est la colonne qui manquait : sans elle, la traçabilité s''arrête au moment d''ouvrir le fût.';

-- 3. Une fonction, une seule règle : un lot est-il ouvert ?
--
--    Pas de colonne booléenne : la présence de `date_ouverture` EST
--    l'information. Ajouter `est_ouvert` créerait un second état à
--    synchroniser, donc une seconde source de désaccord possible.
CREATE OR REPLACE FUNCTION lot_est_ouvert(lot_date_ouverture date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$ SELECT lot_date_ouverture IS NOT NULL $$;

-- 4. La FEFO des contenants ouverts.
--
--    `sortirStockFIFO` ordonne déjà par
--      COALESCE(date_peremption, '9999-12-31') puis date d'entrée.
--
--    Sur un lot dérivé d'un fût, `date_peremption` vaut l'ouverture + la
--    périodicité : l'ordre FEFO consomme donc naturellement le plus
--    ancien ouvert. Cette fonction rend la règle explicite et testable,
--    sans la réimplémenter ailleurs.
--
--    Le fut SEALED n'a pas de date de péremption exploitable après
--    ouverture : sa date est ramenée au terme pour être consommé APRÈS
--    tous les contenants ouverts.
--    `lots` n'a pas d'`agence_id` : un lot est identifié par (produit,
--    numéro de lot) et partagé entre agences. C'est `stocks_lots` qui porte
--    l'agence. Cette vue reste donc au niveau du lot, sans périmètre
--    agence — le croisement se fait par `stocks_lots.lot_id`.
CREATE OR REPLACE VIEW lots_contenants AS
SELECT
    l.id                                                   AS lot_id,
    l.produit_id,
    l.numero_lot,
    l.date_peremption                                      AS dlc_scelle,
    l.date_ouverture                                       AS date_ouverture,
    l.periodicite_ouverture_jours,
    l.reference_ouverture,
    l.contenu_source,
    l.contenu_restant,
    l.lot_source_id,
    l.fournisseur_id,
    l.est_bloque,
    l.motif_blocage,
    -- La DLC qui sert RÉELLEMENT à la sortie n'est pas celle du scellé :
    -- c'est celle du contenant ouvert, calculée à l'ouverture.
    COALESCE(
        (l.date_ouverture + COALESCE(l.periodicite_ouverture_jours, 0))::date,
        l.date_peremption
    )                                                       AS dlc_effective,
    -- Un scellé non ouvert passe après tout ce qui est ouvert.
    CASE WHEN l.date_ouverture IS NULL THEN 1 ELSE 0 END   AS rang_consommation
FROM lots l;

COMMENT ON VIEW lots_contenants IS
  'Contenants suivis à l''ouverture (bidons, flacons). dlc_effective est la DLC qui doit '
  'piloter la sortie, pas la date de péremption du contenant scellé. rang_consommation '
  'place les contenants non ouverts après tous les contenants ouverts.';

-- 5. Constat : ce qui a été déconditionné sans lot, et donc traçable
--    de personne. On ne le corrige pas — l'information est perdue — on le
--    compte, pour que le premier recensement puisse l'exclure.
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n
      FROM deconditionnements
     WHERE lot_id_source IS NULL;

    IF n > 0 THEN
        RAISE NOTICE
            '0018 : % deconditionnement(s) anterieur(s) sans lot conserve. Leur tracabilite '
            'est perdue et ne peut etre retablie que par un recensement physique.', n;
    END IF;
END $$;