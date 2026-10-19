-- ============================================================================
-- 0028 — RÉPARATION DES DONNÉES DÉRIVÉES DU STOCK
--
-- Depuis le Lot C (cmd f80cc95), `enregistrerMouvement` (journal + miroirs) est
-- le SEUL écrivain du stock. Cette migration aligne l'état dérivé — ce que le
-- code écrivait comme il le pouvait avant le moteur — sur ce que le journal
-- `mouvements_stock` dit déjà, et comble les trous de propagation.
--
-- Règles :
--   1. LE JOURNAL FAIT FOI : le dernier `stock_apres` par clé (produit, agence,
--      emplacement, lot) EST l'état du stock.
--   2. ARGENT : remplissage des VIDES uniquement — jamais surécriture d'un
--      prix manuel ni d'un CMUP déjà valable.
--   3. AUCUNE SUPPRESSION : la seule écriture "destructrice" est quantite = 0
--      pour une ligne de miroir sans AUCUN mouvement.
--   4. IDEMPOTENCE : tout déclencheur ne touche que ce qui diffère — un rejeu
--      est un no-op.
--
-- Ce que la migration NE fait PAS :
--   - stocks_unites pour les produits dont les unités valent facteur != 1
--     (historique écrit en cartesons de 12 par l'ancien code : pas de
--     reconstruction fiable → écart visible, réparator de Lot 1 étape 5) ;
--   - les 22 PIECE classées sous une branche CONSOMMABLE (rangement manuel) ;
--   - les codes_barres pointant des produits inactifs (ils restent utiles
--     pour une réactivation).
-- ============================================================================

-- ============================================================================
-- A. STOCKS — dernier stock_apres par clé
-- ============================================================================

-- A.1 — Mise à jour des lignes existantes dont la quantité diffère de l'état
-- du journal. Les colonnes d'exploitation (réservé, bloqué, seuil local) sont
-- préservées : seule `quantite` est alignée.
WITH etat AS (
  SELECT DISTINCT ON (
    m.produit_id, m.agence_id, COALESCE(m.emplacement_id, 0), COALESCE(m.lot_id, 0)
  )
    m.produit_id,
    m.agence_id,
    COALESCE(m.emplacement_id, 0) AS emp_cle,
    COALESCE(m.lot_id, 0)          AS lot_cle,
    m.stock_apres                  AS quantite_etat
  FROM mouvements_stock m
  WHERE m.stock_apres IS NOT NULL
  ORDER BY m.produit_id, m.agence_id, COALESCE(m.emplacement_id, 0), COALESCE(m.lot_id, 0), m.id DESC
)
UPDATE stocks st
SET quantite   = e.quantite_etat,
    updated_at = now()
FROM etat e
WHERE st.produit_id = e.produit_id
  AND st.agence_id = e.agence_id
  AND st.emplacement_id IS NOT DISTINCT FROM (CASE WHEN e.emp_cle = 0 THEN NULL ELSE e.emp_cle END)
  AND st.lot_id IS NOT DISTINCT FROM (CASE WHEN e.lot_cle = 0 THEN NULL ELSE e.lot_cle END)
  AND st.quantite IS DISTINCT FROM e.quantite_etat;

-- A.2 — Création des lignes manquantes (mouvements journalisés dont le miroir
-- n'a jamais été écrit — ex. chaîne cassée par une écriture en deux temps).
WITH etat AS (
  SELECT DISTINCT ON (
    m.produit_id, m.agence_id, COALESCE(m.emplacement_id, 0), COALESCE(m.lot_id, 0)
  )
    m.produit_id,
    m.agence_id,
    COALESCE(m.emplacement_id, 0) AS emp_cle,
    COALESCE(m.lot_id, 0)          AS lot_cle,
    m.stock_apres                  AS quantite_etat,
    m.unite_id                     AS unite_ref
  FROM mouvements_stock m
  WHERE m.stock_apres IS NOT NULL
  ORDER BY m.produit_id, m.agence_id, COALESCE(m.emplacement_id, 0), COALESCE(m.lot_id, 0), m.id DESC
)
INSERT INTO stocks (produit_id, agence_id, emplacement_id, lot_id, quantite, unite_reference_id)
SELECT e.produit_id,
       e.agence_id,
       CASE WHEN e.emp_cle = 0 THEN NULL ELSE e.emp_cle END,
       CASE WHEN e.lot_cle = 0 THEN NULL ELSE e.lot_cle END,
       e.quantite_etat,
       e.unite_ref
FROM etat e
WHERE NOT EXISTS (
  SELECT 1 FROM stocks st
  WHERE st.produit_id = e.produit_id
    AND st.agence_id = e.agence_id
    AND st.emplacement_id IS NOT DISTINCT FROM (CASE WHEN e.emp_cle = 0 THEN NULL ELSE e.emp_cle END)
    AND st.lot_id IS NOT DISTINCT FROM (CASE WHEN e.lot_cle = 0 THEN NULL ELSE e.lot_cle END)
);

-- A.3 — Remise à zéro des lignes sans AUCUN mouvement : un stock que le
-- journal ne connaît pas n'existe pas.
WITH etat AS (
  SELECT DISTINCT ON (
    m.produit_id, m.agence_id, COALESCE(m.emplacement_id, 0), COALESCE(m.lot_id, 0)
  )
    m.produit_id,
    m.agence_id,
    COALESCE(m.emplacement_id, 0) AS emp_cle,
    COALESCE(m.lot_id, 0)          AS lot_cle
  FROM mouvements_stock m
  WHERE m.stock_apres IS NOT NULL
  ORDER BY m.produit_id, m.agence_id, COALESCE(m.emplacement_id, 0), COALESCE(m.lot_id, 0), m.id DESC
)
UPDATE stocks st
SET quantite = '0',
    updated_at = now()
WHERE st.quantite <> '0'
  AND NOT EXISTS (
    SELECT 1 FROM etat e
    WHERE e.produit_id = st.produit_id
      AND e.agence_id = st.agence_id
      AND (CASE WHEN e.emp_cle = 0 THEN NULL ELSE e.emp_cle END) IS NOT DISTINCT FROM st.emplacement_id
      AND (CASE WHEN e.lot_cle = 0 THEN NULL ELSE e.lot_cle END) IS NOT DISTINCT FROM st.lot_id
  );

-- ============================================================================
-- B. CMUP — remplissage des vides depuis la dernière entrée valorisée
-- ============================================================================

-- B.1 — Un stock positif sans coût unitaire moyen est invisible dans la
-- valorisation. On prend le dernier coût d'entrée valorisée connue
-- (ACHAT_RECEPTION ou INITIAL_RECEIPT). Jamais de surécriture d'un CMUP
-- existant : la pondération du moteur reste la seule validée.
UPDATE stocks st
SET cout_unitaire_moyen = j.cub
FROM (
  SELECT DISTINCT ON (m.produit_id, m.agence_id)
    m.produit_id,
    m.agence_id,
    m.cout_unitaire_base AS cub
  FROM mouvements_stock m
  WHERE m.sens = 'E'
    AND m.cout_unitaire_base IS NOT NULL
    AND m.cout_unitaire_base::numeric > 0
    AND m.type IN ('ACHAT_RECEPTION', 'INITIAL_RECEIPT')
  ORDER BY m.produit_id, m.agence_id, m.id DESC
) j
WHERE st.produit_id = j.produit_id
  AND st.agence_id = j.agence_id
  AND st.quantite::numeric > 0
  AND (st.cout_unitaire_moyen IS NULL OR st.cout_unitaire_moyen::numeric = 0);

-- ============================================================================
-- C. STOCKS_UNITES — solde net du journal, portée facteur 1 uniquement
-- ============================================================================

-- C.1 — L'historique a écrit des quantités d'unités d'achat (cartons de 12)
-- à côté de quantités de base : reconstruction impossible pour un produit dont
-- les unités ne valent pas toutes facteur 1. Pour la portée facteur 1, les
-- deux conventions coïncident : net du journal É / S par (produit, agence,
-- unité).
WITH portee AS (
  SELECT pu.produit_id
  FROM produit_unites pu
  WHERE pu.produit_id IN (
    SELECT DISTINCT produit_id FROM mouvements_stock WHERE unite_id IS NOT NULL
  )
  GROUP BY pu.produit_id
  HAVING COALESCE(BOOL_AND(COALESCE(pu.facteur_vers_base, 1) = '1'), TRUE)
     AND COALESCE(BOOL_AND(COALESCE(pu.facteur_vers_parent, 1) = '1'), TRUE)
),
net AS (
  SELECT m.produit_id,
         m.agence_id,
         m.unite_id,
         SUM(CASE WHEN m.sens = 'E' THEN m.quantite::numeric ELSE - m.quantite::numeric END) AS qte
  FROM mouvements_stock m
  WHERE m.unite_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM portee p WHERE p.produit_id = m.produit_id)
  GROUP BY m.produit_id, m.agence_id, m.unite_id
)
INSERT INTO stocks_unites (produit_id, agence_id, unite_id, quantite)
SELECT produit_id, agence_id, unite_id, qte
FROM net
ON CONFLICT (produit_id, agence_id, unite_id)
DO UPDATE SET quantite = EXCLUDED.quantite;

-- C.2 — Lignes de portée facteur 1 sans AUCUN mouvement sur leur (produit,
-- agence, unité) : remises à zéro.
WITH portee AS (
  SELECT pu.produit_id
  FROM produit_unites pu
  WHERE pu.produit_id IN (
    SELECT DISTINCT produit_id FROM mouvements_stock WHERE unite_id IS NOT NULL
  )
  GROUP BY pu.produit_id
  HAVING COALESCE(BOOL_AND(COALESCE(pu.facteur_vers_base, 1) = '1'), TRUE)
     AND COALESCE(BOOL_AND(COALESCE(pu.facteur_vers_parent, 1) = '1'), TRUE)
)
UPDATE stocks_unites su
SET quantite = '0'
FROM portee p
WHERE su.produit_id = p.produit_id
  AND su.quantite::numeric <> 0
  AND NOT EXISTS (
    SELECT 1 FROM mouvements_stock m
    WHERE m.produit_id = su.produit_id
      AND m.agence_id = su.agence_id
      AND m.unite_id = su.unite_id
  );

-- ============================================================================
-- D. STOCKS_LOTS — solde net par lot
-- ============================================================================

-- D.1 — Chaque écriture miroir d'un lot (création, ré-entrée, sortie) est
-- doublée d'un mouvement journalisé portant le lotId : le net É/S par lot est
-- dons l'oracle du miroir.
WITH net AS (
  SELECT m.produit_id,
         m.agence_id,
         m.lot_id,
         SUM(CASE WHEN m.sens = 'E' THEN m.quantite::numeric ELSE - m.quantite::numeric END) AS qte
  FROM mouvements_stock m
  WHERE m.lot_id IS NOT NULL
  GROUP BY m.produit_id, m.agence_id, m.lot_id
)
INSERT INTO stocks_lots (produit_id, agence_id, lot_id, quantite)
SELECT produit_id, agence_id, lot_id, qte
FROM net
ON CONFLICT (produit_id, agence_id, lot_id)
DO UPDATE SET quantite = EXCLUDED.quantite,
              updated_at = now();

-- D.2 — Lignes de lot sans AUCUN mouvement : remises à zéro.
UPDATE stocks_lots sl
SET quantite = '0',
    updated_at = now()
WHERE sl.quantite::numeric <> 0
  AND NOT EXISTS (
    SELECT 1 FROM mouvements_stock m
    WHERE m.produit_id = sl.produit_id
      AND m.agence_id = sl.agence_id
      AND m.lot_id = sl.lot_id
  );

-- ============================================================================
-- E. PRIX D'ACHAT — propagation des dernières réceptions valorisées
-- ============================================================================

-- E.1 — Les réceptions du parking (18 000–20 000 F/board) n'ont jamais été
-- propagées vers la fiche article. `prix_achat` : uniquement si vide ou nul
-- (un prix manuel fait foi) ; `dernier_prix_achat` : uniquement si encore
-- jamais renseigné.
UPDATE produits p
SET prix_achat = CASE
      WHEN p.prix_achat IS NULL OR p.prix_achat::numeric = 0 THEN j.cub
      ELSE p.prix_achat
    END,
    dernier_prix_achat = COALESCE(p.dernier_prix_achat, j.cub),
    updated_at = now()
FROM (
  SELECT DISTINCT ON (m.produit_id)
    m.produit_id,
    m.cout_unitaire_base AS cub
  FROM mouvements_stock m
  WHERE m.sens = 'E'
    AND m.cout_unitaire_base IS NOT NULL
    AND m.cout_unitaire_base::numeric > 0
    AND m.type = 'ACHAT_RECEPTION'
  ORDER BY m.produit_id, m.id DESC
) j
WHERE p.id = j.produit_id
  AND p.is_active = TRUE;

-- E.2 — Repli CMUP : après la propagation E.1, les stocks dont le journal
-- n'a jamais valorisé l'entrée (aucune réception ni stock initial valorisé)
-- reprennent le prix d'achat de la fiche. Sans cela, la valorisation globale
-- du garage sous-compte ces lignes comme si elles étaient gratuites.
UPDATE stocks st
SET cout_unitaire_moyen = p.prix_achat
FROM produits p
WHERE p.id = st.produit_id
  AND st.quantite::numeric > 0
  AND (st.cout_unitaire_moyen IS NULL OR st.cout_unitaire_moyen::numeric = 0)
  AND p.prix_achat IS NOT NULL
  AND p.prix_achat::numeric > 0;

-- ============================================================================
-- F. VARIANTES ORPHELINES — rattachement au règle de gestion de l'arbre
-- ============================================================================

-- F.1 — Un article associatif « Divers — à classer » pour les variantes sans
-- article. Le bibliothécaire les reclassera une par une depuis la fiche ;
-- ce qui compte est la cohérence de l'arbre : une VARIANTE a TOUJOURS
-- un article, sinon elle est invisible des vues catalogue.
INSERT INTO produit_articles (designation, designation_courte, categorie_id, type_produit, description, is_active)
SELECT 'Divers — à classer automatiquement (0028)',
       'À classer',
       (SELECT id FROM categories WHERE code = 'CAT-DIV'),
       'PIECE',
       'Article associatif cree par la migration 0028 pour rattacher les variantes orphelines. A reclasser a la main dans l''arbre.',
       TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM produit_articles a
  WHERE a.designation LIKE 'Divers — à classer automatiquement%'
    AND a.description LIKE 'Article associatif cree par la migration 0028%'
);

-- F.2 — Rattachement de toutes les variantes orphelines.
UPDATE produits v
SET article_id = (
      SELECT a.id
      FROM produit_articles a
      WHERE a.designation LIKE 'Divers — à classer automatiquement%'
        AND a.description LIKE 'Article associatif cree par la migration 0028%'
      LIMIT 1
    ),
    updated_at = now()
WHERE v.niveau = 'VARIANTE'
  AND v.article_id IS NULL;

-- ============================================================================
-- G. CATÉGORISATION — niveau de rangement minimal (Divers)
-- ============================================================================

-- G.1 — Produits actifs sans catégorie : ils restent invisibles dans la vue
-- catalogue par catégorie. Ils passent dans « Divers » (CAT-DIV), la niche de
-- classement manuel que la scène catalogue connaît déjà.
UPDATE produits p
SET categorie_id = cd.id,
    updated_at = now()
FROM categories cd
WHERE cd.code = 'CAT-DIV'
  AND p.categorie_id IS NULL
  AND p.is_active = TRUE;

-- G.2 — Articles eux-mêmes sans catégorie.
UPDATE produit_articles a
SET categorie_id = cd.id
FROM categories cd
WHERE cd.code = 'CAT-DIV'
  AND a.categorie_id IS NULL;

-- ============================================================================
-- H. CODES BARRES — le miroir reflète la fiche
-- ============================================================================

-- H.1 — 127 produits absents de codes_barres : la fiche avait bien un code,
-- le scanner ne le proposait pas. Le miroir est complété depuis la fiche
-- (aucun code inventé).
INSERT INTO codes_barres (produit_id, type, valeur, est_defaut)
SELECT p.id, 'PRODUIT', p.code_barre, TRUE
FROM produits p
WHERE p.code_barre IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM codes_barres cb
    WHERE cb.produit_id = p.id
      AND cb.valeur = p.code_barre
  );
