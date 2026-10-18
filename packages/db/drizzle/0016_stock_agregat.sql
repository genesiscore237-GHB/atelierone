-- 0016 — Une seule façon de lire le stock : la vue `stock_agregat`.
--
-- POURQUOI
--
--   `stocks` porte le stock par (produit × agence × emplacement × lot).
--   Une pièce rangée dans trois rayons a donc trois lignes. C'est la
--   granularité du rangement, pas trois fois la même pièce.
--
--   Or le module lit `stocks` ligne par ligne, partout. Le pire cas est
--   dans `stock-engine.ts`, la garde de TOUTES les sorties et de TOUTES
--   les réservations :
--
--     const [row] = await tx.select(…).from(stocks).where(where).for("update");
--
--   Il n'y a pas de `.limit(1)` : la requête renvoie TOUTES les lignes du
--   produit, verrouillées, et `[row]` prend la première dans un ordre que
--   PostgreSQL ne garantit pas. Selon le plan d'exécution choisi ce
--   jour-là, une sortie peut être refusée ou autorisée au hasard.
--
--   Le même motif, quinze fois dans le module, dont deux cas graves :
--     · `compterProduit`  — la quantité affichée pendant un comptage ;
--     · `validerSession`  — la quantité THÉORIQUE d'un écart d'inventaire.
--
--   Sur la base relevée, 7 produits ont plus d'une ligne de stock. Ce ne
--   sont donc pas des cas théoriques : ce sont des produits qui existent,
--   et pour eux l'inventaire calcule un écart FAUX, puis applique un
--   ajustement sur cette base.
--
-- CE QUE LA VUE GARANTIT
--
--   Le disponible est calculé selon la règle du cadrage §7.7 :
--
--     disponible = quantité − réservée − bloquée
--
--   Pas la quantité seule. Pas « quantité − réservée » comme le fait
--   aujourd'hui `stockDisponible()`, qui ignore `quantite_bloquee` — la
--   colonne de quarantaine que la migration 0017 va enfin ecrire. Sans
--   cette correction, une pièce mise en quarantaine resterait annoncée
--   comme disponible.
--
--   Le CMUP est pondéré par les quantités, pas moyenné : un article dont
--   la moitié du stock est à 1 000 F et l'autre moitié à 5 000 F vaut
--   3 000 F, pas 2 500 F. Le KPI « Valeur du stock » affichait la
--   moyenne des CMUP de lignes, qui n'a aucun sens économique.
--
--   `quantite_rayon` est exposée mais n'est PAS retranchée : elle décrit
--   la part d'une ligne globale qui se trouve sur les étagères, donc un
--   sous-ensemble de `quantite`. La soustraire compterait deux fois le
--   stock en rayon.
--
-- NE PAS RÉPARER LES DONNÉES ICI
--
--   Cette vue ne modifie rien : elle rend les erreurs visibles au lieu de
--   les masquer. Les 113 groupes (produit, agence) sur 128 qui n'ont
--   aucune ligne dans `stocks_lots` apparaîtront ici comme du stock sans
--   traçabilité — ce qui est la vérité. La correction se fait par le
--   recensement M1, qui connaît la quantité physique réelle, pas par un
--   calcul qui devinerait.
--
-- IDEMPOTENT
--
--   `CREATE OR REPLACE VIEW`. Aucune écriture, aucune suppression.

CREATE OR REPLACE VIEW stock_agregat AS
SELECT
    s.produit_id                                              AS produit_id,
    s.agence_id                                               AS agence_id,

    -- Quantité physique totale, toutes unités de rangement confondues.
    SUM(s.quantite)::numeric(14,2)                            AS quantite,

    -- Engagements pris sur cette quantité.
    SUM(COALESCE(s.quantite_reservee, 0))::numeric(14,2)      AS quantite_reservee,
    SUM(COALESCE(s.quantite_bloquee,  0))::numeric(14,2)      AS quantite_bloquee,

    -- Sous-ensemble de `quantite` : la part posée en rayon.
    SUM(COALESCE(s.quantite_rayon, 0))::numeric(14,2)        AS quantite_rayon,

    -- Règle unique de disponibilité (cadrage §7.7). C'est CETTE colonne
    -- que toute l'application doit lire, jamais un calcul refait à la main.
    (
        SUM(s.quantite)
        - SUM(COALESCE(s.quantite_reservee, 0))
        - SUM(COALESCE(s.quantite_bloquee, 0))
    )::numeric(14,2)                                          AS disponible,

    -- CMUP pondéré par les quantités. NULL quand aucune ligne n'a de coût :
    -- c'est le cas de 106 lignes sur 135, et c'est pourquoi le KPI
    -- « Valeur du stock » ne veut aujourd'hui rien dire.
    --
    -- Le NULL distingue « coût INCONNU » de « coût NUL ». Les confondre est
    -- une faute de lecture : un article sans prix d'achat saisi ne vaut pas
    -- zéro franc, il vaut « on ne sait pas ». Le calcul ne renvoie donc un
    -- nombre que si au moins UNE ligne porte un coût non nul — sinon la
    -- moyenne de zéros serait un fait faux sur un vide.
    CASE
        WHEN SUM(s.quantite) > 0
         AND SUM(CASE WHEN COALESCE(s.cout_unitaire_moyen, 0) > 0
                      THEN s.quantite ELSE 0 END) > 0
        THEN SUM(s.quantite * COALESCE(s.cout_unitaire_moyen, 0))
             / SUM(s.quantite)
        ELSE NULL
    END::numeric(14,4)                                        AS cmup_pondere,

    -- Valeur du stock : Σ (quantité × CMUP de la ligne).
    -- Volontairement COALESCE à 0 et non à NULL : une valeur affichée
    -- comme « 0 » se lit ; une valeur absente se conteste.
    SUM(s.quantite * COALESCE(s.cout_unitaire_moyen, 0))::numeric(14,2) AS valeur_stock,

    -- Nombre de lignes de rangement : le signal d'alerte du défaut §3.1.
    -- Un produit à 3 lignes est un produit que le code lisait au hasard.
    COUNT(*)::integer                                         AS nb_lignes,

    -- Lignes réellement valorisées. À comparer avec `nb_lignes` : un écart
    -- signale un stock dont la moitié n'a pas de coût d'achat.
    COUNT(*) FILTER (WHERE COALESCE(s.cout_unitaire_moyen, 0) > 0)::integer AS nb_lignes_cout,

    -- Emplacements distincts réellement occupés.
    COUNT(DISTINCT s.emplacement_id) FILTER (WHERE s.emplacement_id IS NOT NULL)::integer
                                                               AS nb_emplacements,

    -- Lots distincts : 0 signifie « aucune traçabilité par lot possible ».
    COUNT(DISTINCT s.lot_id) FILTER (WHERE s.lot_id IS NOT NULL)::integer
                                                               AS nb_lots,

    max(s.updated_at)                                         AS updated_at
FROM stocks s
GROUP BY s.produit_id, s.agence_id;

COMMENT ON VIEW stock_agregat IS
  'Quantités de stock par produit et par agence — le seul point de lecture autorisé. '
  'disponible = quantite − quantite_reservee − quantite_bloquee (cadrage §7.7). '
  'Remplace les lectures ligne à ligne par `.limit(1)`, non déterministes.';

-- Contrôle de non-régression : ce que la vue expose dépend de ce que la
-- base contient déjà, on se contente donc de le constater.
DO $$
DECLARE n_produits int; n_sans_cout int;
BEGIN
    SELECT count(*) INTO n_produits FROM stock_agregat;
    SELECT count(*) INTO n_sans_cout FROM stock_agregat WHERE nb_lignes_cout = 0;
    RAISE NOTICE '0016 : stock_agregat expose % produit(s) ; % sans aucun CMUP valorise.', n_produits, n_sans_cout;
END $$;