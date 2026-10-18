-- 0021 — Le déconditionnement traverse l'article, pas seulement l'unité.
--
-- POURQUOI
--
--   Un fût d'huile 5W30 et un bidon de 4 L ne sont pas le même article.
--   Ils n'ont ni le même conditionnement, ni le même prix de vente, ni le
--   même fournisseur — et surtout ils ne sont pas achetés au même moment.
--   Le catalogue les distingue déjà : le relevé trouve
--   « Huile moteur 5W30 — vrac » et « Huile moteur 5W30 — bidon 4 L ».
--
--   Le code aussi : `operationDouble` accepte un `produitCibleId`, prévu
--   pour le reconditionnement inter-articles. Mais la TABLE ne le peut pas :
--   `deconditionnements` n'a qu'un seul `produit_id`.
--
--   Conséquence aujourd'hui : impossible d'écrire « ce fût de produit A a
--   produit ces bidons de produit B ». Le déconditionnement ne peut donc
--   porter sa traçabilité que si source et cible sont le même article —
--   c'est-à-dire jamais pour un vrai fût de garage.
--
-- LE FACTEUR EST FIGÉ, PAS CALCULÉ À LA LECTURE
--
--   `facteur_conversion` enregistre le nombre d'unités produites par unité
--   source AU MOMENT de l'opération : 208 bidons pour un fût.
--
--   Le laisser se recalculer depuis les tables d'unités est une faute : les
--   unités évoluent (un bidon passe de 4 L à 5 L, une référence change),
--   et un historique de déconditionnement qui se réécrit avec les tables
--   n'est plus un historique. C'est une trace : elle dit ce qui s'est
--   passé, pas ce qui serait aujourd'hui cohérent.
--
-- ADDITIF ET IDEMPOTENT

ALTER TABLE deconditionnements ADD COLUMN IF NOT EXISTS produit_cible_id integer REFERENCES produits(id);

COMMENT ON COLUMN deconditionnements.produit_cible_id IS
  'Article produit par le déconditionnement. NULL = même article, unité différente (ex. carton → pièce). '
  'Renseigné quand le conditionnement change d''article (fût → bidon).';

ALTER TABLE deconditionnements ADD COLUMN IF NOT EXISTS facteur_conversion numeric(14,4);

COMMENT ON COLUMN deconditionnements.facteur_conversion IS
  'Unités cible par unité source, FIGÉES à l''opération (208 bidons pour un fût de 208 L). '
  'Ne pas recalculer depuis les tables d''unités : un historique qui se réécrit n''est plus une trace.';

-- Index : le tableau de bord des contenants ouverts cherche par article cible.
CREATE INDEX IF NOT EXISTS ix_deconditionnements_produit_cible
    ON deconditionnements (produit_id, produit_cible_id)
    WHERE produit_cible_id IS NOT NULL;

-- Constat : combien de déconditionnements ancienS ne savent pas ce qu'ils
-- ont produit. Leur traçabilité est irrécupérable sans comptage physique.
DO $$
DECLARE n_total int; n_orphelins int;
BEGIN
    SELECT count(*) INTO n_total FROM deconditionnements;
    -- Une opération est « orpheline » si elle sortait d'une unité mais n'a
    -- jamais été reliée à un lot : sa provenance est perdue.
    SELECT count(*) INTO n_orphelins FROM deconditionnements WHERE lot_id_source IS NULL;

    IF n_orphelins > 0 THEN
        RAISE NOTICE
            '0021 : % deconditionnement(s) sur % sans lot d''origine : provenance perdue, '
            'recuperable uniquement par un comptage physique.', n_orphelins, n_total;
    ELSE
        RAISE NOTICE '0021 : tous les deconditionnements sont relies a un lot.';
    END IF;
END $$;