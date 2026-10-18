-- 0017 — La quarantaine : une quantité bloquée qui sait pourquoi elle l'est.
--
-- POURQUOI
--
--   `stocks.quantite_bloquee` existe depuis le schéma initial et n'a jamais
--   été écrite par le code. Quatre lectures, zéro écriture. Le relevé en
--   trouve 1 ligne non nulle — mise là à la main, ou par un script de test.
--
--   Une quantité bloquée sans motif est pire qu'une quantité non bloquée :
--   elle annonce « quelque chose est retenu » sans jamais dire quoi, et
--   personne ne peut lever le blocage. Le stock finit par êtreadjusté à la
--   main, ce qui est exactement ce qu'on voulait éviter.
--
--   La même idée s'applique au LOT, à une échelle différente : un
--   fournisseur peut demander le rappel d'un lot dont la date de
--   péremption n'est même pas dépassée. C'est un cas réel, et il n'existe
--   nulle part dans le modèle : rien ne distingue « périmé » de
--   « rappelé par le fournisseur ».
--
-- CE QUE CETTE MIGRATION NE FAIT PAS
--
--   Elle n'écrit aucune quantité. Elle ne pose aucun blocage. Elle ne
--   devine aucun motif.
--
--   Le relevé trouve une ligne avec `quantite_bloquee > 0` et aucune
--   trace de l'origine du blocage. Lui attribuer un motif serait inventer
--   une information, et une information inventée dans un système de stock
--   devient une vérité : dans six mois, quelqu'un lira ce motif et
--   croira qu'un contrôle qualité a eu lieu. La ligne reste donc sans
--   motif, et la page de quarantaine la signale comme telle — un blocage
--   sans motif est une anomalie à traiter, pas un blocage à taire.
--
-- ADDITIF ET IDEMPOTENT
--
--   `ADD COLUMN IF NOT EXISTS`, six fois. Rejouable sans effet, et sans
--   jamais écraser une valeur renseignée entre deux exécutions.

-- 1. Quarantine au niveau de la ligne de stock.
--    `quantite_bloquee` existe déjà : on ne la recrée pas, on l'explique.
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS motif_blocage      varchar(200);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS date_blocage       timestamp;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS bloque_par         integer;

COMMENT ON COLUMN stocks.quantite_bloquee IS
  'Quantité retenue (quarantaine, litige, contrôle qualité). Déduite du disponible par stock_agregat.';
COMMENT ON COLUMN stocks.motif_blocage IS
  'Pourquoi cette quantité est retenue. NULL sur une quantité bloquée = anomalie à traiter.';

-- 2. Quarantine au niveau du lot — le rappel fournisseur.
--    Séparée de `statut` : `statut` décrit le CYCLE DE VIE d'un lot
--    (disponible, périmé), ce blocage décrit une DÉCISION EXTERNE
--    (le fournisseur a demandé un rappel). Confondre les deux ferait
--    disappear la trace du rappel quand le lot finit par être consommé.
ALTER TABLE lots ADD COLUMN IF NOT EXISTS est_bloque      boolean NOT NULL DEFAULT false;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS motif_blocage   varchar(200);
ALTER TABLE lots ADD COLUMN IF NOT EXISTS date_blocage    timestamp;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS bloque_par      integer;

COMMENT ON COLUMN lots.est_bloque IS
  'Rappel fournisseur ou consignation. Indépendant du statut de péremption : '
  'un lot scellé peut être bloqué, un lot périmé ne l''est pas forcément.';

-- 3. Constat, pas correction : ce qui est bloqué sans raison.
--
--    `quantite_bloquee > 0` sans motif n'est pas un détail : c'est une
--    quantité que personne ne peut libérer. On le dit explicitement.
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n
      FROM stocks
     WHERE COALESCE(quantite_bloquee, 0) > 0
       AND (motif_blocage IS NULL OR btrim(motif_blocage) = '');

    IF n > 0 THEN
        RAISE NOTICE
            '0017 : % ligne(s) de stock sont bloquees SANS MOTIF. Anomalie a traiter : '
            'un blocage sans motif ne peut pas etre leve.', n;
    ELSE
        RAISE NOTICE '0017 : toutes les quantites bloquees portent un motif.';
    END IF;
END $$;