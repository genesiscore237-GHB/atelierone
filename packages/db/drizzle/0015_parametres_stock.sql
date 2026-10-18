-- 0015 — Les paramètres de gestion du stock, enfin en base.
--
-- POURQUOI
--
--   Aujourd'hui, les réglages qui devraient être configurables par garage
--   sont figés DANS LE CODE, en dur, à l'intérieur des paramètres d'appel
--   des procédures tRPC :
--
--     getStocksDormants({ jours: 90 })   ← écrit en dur dans la page
--     dlcAlertes({ seuilJours: 30 })     ← idem
--     lot-service.statutDlc(_, 30)       ← 30 jours, partout, pour tout
--     getPrevisionsAchat({ 30, 30, 100 })
--
--   Un garage qui consomme ses huiles en 3 mois au lieu de 6 ne peut pas
--   le dire. Un fournisseur qui livre en 10 jours au lieu de 4 n'est pas
--   modélisable. Chaque garage a des seuils de dormance et des délais DLC
--   qui ne sont pas ceux du voisin.
--
--   Ce n'est pas un défaut d'esthétique : c'est un calcul faux pour tous
--   les garages dont la réalité diffère de la moyenne codée en dur.
--
--   Le tableau est dit « par agence » parce que le stock lui-même l'est :
--   `stocks.agence_id`. Un réglage global serait incohérent avec lui.
--
-- CE QUE CE N'EST PAS
--
--   Ce tableau ne stocke pas de seuils par produit. Ceux-ci existent déjà
--   sur `produits` (seuil_alerte, seuil_critique, stock_maximum) et sont
--   correctement renseignés sur les 319 articles. Ici, on ne règle que ce
--   qui est une propriété du GESTIONNAIRE, pas de l'article.
--
-- ADDITIF ET IDEMPOTENT
--
--   Aucune ligne n'est supprimée ni modifiée ailleurs qu'un `INSERT …
--   ON CONFLICT DO NOTHING`, qui crée au plus une ligne par agence et
--   ne touche pas aux lignes existantes. Rejouable sans effet.

-- 1. La table. `IF NOT EXISTS` : la migration est rejouable telle quelle.
CREATE TABLE IF NOT EXISTS parametres_stock (
  id                                    serial        PRIMARY KEY,

  -- Le périmètre est celui du stock : une agence, un jeu de réglages.
  agence_id                             integer       NOT NULL REFERENCES agences(id) ON DELETE CASCADE,

  -- ── Prévision de consommation ────────────────────────────────────────
  -- Fenêtre d'analyse. 90 jours est le compromis habituel : 30 jours est
  -- trop court pour un garage saisonnier, 365 lisseraient trop et
  -- confondraient l'historique du stock avec celui de l'agencement.
  jours_historique_consommation         integer       NOT NULL DEFAULT 90,

  -- Délai fournisseur par DÉFAUT, en jours. Sert de repli tant que le
  -- délai réel n'a pas été MESURÉ sur les commandes du garage : c'est la
  -- donnée qui ment le plus souvent, donc celle qu'il faut deviner le
  -- moins possible.
  delai_approvisionnement_defaut_jours  integer       NOT NULL DEFAULT 7,

  -- Stock de sécurité exprimé en JOURS DE CONSOMMATION, et non en
  -- quantité. La quantité dépend de l'article — 3 filtres et 3 bidons
  -- d'huile n'ont rien à voir — alors que le délai de couverture, lui,
  -- se règle une fois pour toute l'agence.
  jours_stock_securite                  numeric(6,2)  NOT NULL DEFAULT 15,

  -- ── Périmption et dormance ────────────────────────────────────────────
  -- Alerte avant péremption. Un moteur peut avoir une DLC de 5 ans et
  -- un fluide de 18 mois : c'est `produits.dlc_jours` qui tranche, ce
  -- réglage ne sert que de filet quand le produit n'en porte pas.
  dlc_alerte_jours                      integer       NOT NULL DEFAULT 30,

  -- Sans mouvement depuis N jours, l'article est dormant. 90 par défaut :
  -- au-delà d'un trimestre sans rotation, la trésorerie est immobilisée.
  stock_dormant_jours                   integer       NOT NULL DEFAULT 90,

  -- ── Valorisation ──────────────────────────────────────────────────────
  -- `produits.methode_valorisation` existe depuis toujours et n'a
  -- JAMAIS été lu par le moteur de stock. Cette colonne est ici pour que
  -- la question se pose à un seul endroit, et le calcul reste en CUMP tant
  -- qu'aucune FIFO n'est écrite. On ne déclare pas une FIFO qu'on n'a pas.
  methode_valorisation                 varchar(10)   NOT NULL DEFAULT 'CUMP',

  -- ── Seuils appliqués à un article créé sans seuil explicite ───────────
  seuil_alerte_defaut                  integer       NOT NULL DEFAULT 5,
  seuil_critique_defaut                integer       NOT NULL DEFAULT 2,

  -- Le scan est un ACCÉLÉRATEUR, jamais une condition d'utilisation.
  -- Activé par défaut = faux : un garage qui n'a pas d'imprimante
  -- d'étiquettes doit pouvoir travailler intégralement à la frappe.
  scan_code_barres                      boolean       NOT NULL DEFAULT false,

  created_at                            timestamp     NOT NULL DEFAULT now(),
  updated_at                            timestamp     NOT NULL DEFAULT now(),

  CONSTRAINT unq_parametres_stock_agence           UNIQUE (agence_id),
  CONSTRAINT chk_parametres_stock_valorisation      CHECK (methode_valorisation IN ('CUMP', 'FIFO')),
  CONSTRAINT chk_parametres_stock_historique_pos    CHECK (jours_historique_consommation > 0),
  CONSTRAINT chk_parametres_stock_dlc_pos           CHECK (dlc_alerte_jours > 0),
  CONSTRAINT chk_parametres_stock_dormance_pos      CHECK (stock_dormant_jours > 0)
);

COMMENT ON TABLE parametres_stock IS
  'Réglages de gestion du stock par agence. Propriété du gestionnaire, pas de l''article. '
  'Alimente la prévision de consommation, la dormance, les alertes DLC et le seuil de rotation.';

-- 2. Une ligne par agence, sans écraser ce qui existe déjà.
--
--    `ON CONFLICT (agence_id) DO NOTHING` : une agence qui a déjà ses
--    réglages ne voit pas son seuil de sécurité remis à 15 par un rejeu
--    de la migration. C'est tout l'intérêt d'être idempotent.
INSERT INTO parametres_stock (agence_id)
SELECT a.id FROM agences a
ON CONFLICT (agence_id) DO NOTHING;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM parametres_stock;
  RAISE NOTICE '0015 : % agence(s) dispose(nt) de parametres_stock.', n;
END $$;