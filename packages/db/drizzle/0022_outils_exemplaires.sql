-- =============================================================================
-- 0022_outils_exemplaires.sql
--
-- L'OUTILLAGE SUIVI PIÈCE PAR PIÈCE
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LE PROBLÈME
--
-- Le stock ne sait qu'une chose : combien. Il dit « 4 clés dynamométriques ».
-- Il ne sait pas que la n° 3 est sur l'établi du Michelin, que la n° 1 est
-- passée en réparation, et que la n° 2 a été perdue à la suite d'une fuite de
-- liquide de frein.
--
-- `prets_outils` enregistre un prêt PAR PRODUIT, pas par exemplaire. Et
-- `produits.statut_outil` est UNE SEULE CHAÎNE pour tout le parc : impossible
-- d'exprimer « 3 disponibles, 1 en réparation ». Le modèle ne peut donc pas
-- représenter un parc d'outils, seulement une référence d'outil.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA RÈGLE : LE SUIVI EST UN CHOIX, PAS UNE DÉFAUT
--
-- Suivre chaque pièce est un coût : un numéro à saisir, un état à maintenir,
-- un inventaire à faire. Pour un jeu de tournevis interchangeables, ce coût
-- est absurde. Pour une clé dynamométrique étalonnée dont on doit rendre
-- compte au client, il est obligatoire.
--
-- D'où le drapeau `produits.suivi_serie`, qui EXISTE DÉJÀ dans le schéma et
-- n'était lu ni écrit nulle part dans l'application : une colonne morte. Ce
-- n'est donc pas une migration de plus qu'on ajoute, c'est un champ prévu et
-- jamais terminé qu'on réveille. Le suivi individuel est ACTIVÉ OUTIL PAR
-- OUTIL, ce qui laisse au gestionnaire le soin de le porter sur une catégorie
-- entière (un outil appartient à une catégorie : marquer les 12 clés, c'est
-- cocher 12 cases).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `etat` EST UN TEXTE, PAS UNE ENUM
--
-- Les états existent déjà dans `outillage-router.ts` (DISPONIBLE, PRETE,
-- REPARATION, USE, CASSE, PERDU, VOLE, REFORME). Les formaliser en ENUM
-- obligerait à ALTER TABLE dès le premier état oublié — et c'est exactement
-- ce qui arrive d'habitude : un garage découvre un état de plus tous les six
-- mois. Une chaîne, avec la liste surveillée par le serveur, se passe d'un
-- état sans migration.
--
-- `etat` est donc un varchar ; les valeurs autorisées sont vérifiées côté
-- serveur, et non par la base.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Les exemplaires physiques
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outils_exemplaires (
  id             serial PRIMARY KEY,

  -- Le produit dont c'est un exemplaire. CASCADE : sans référence, un
  -- exemplaire n'a pas de sens.
  produit_id     integer NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  agence_id      integer NOT NULL REFERENCES agences(id) ON DELETE CASCADE,

  -- Le numéro frappé / collé sur la pièce. C'est ce que l'on lit au scan et
  -- ce que l'on écrit sur l'étiquette du carton.
  numero         varchar(50) NOT NULL,

  -- DISPONIBLE | PRETE | REPARATION | USE | CASSE | PERDU | VOLE | REFORME
  etat           varchar(20) NOT NULL DEFAULT 'DISPONIBLE',

  -- Où se trouve la pièce. NULL quand elle est sortie : c'est le cas le plus
  -- fréquent, et un état « elle est ici » qui vaut « elle est au fond d'un
  -- bac chez un client » n'apprend rien.
  emplacement_id integer REFERENCES emplacements(id) ON DELETE SET NULL,

  -- Une pièce cassée ne disparaît pas du parc : elle reste inventable, sinon
  -- on rachète des tournevis en double parce qu'on ne les voit plus.
  actif          boolean NOT NULL DEFAULT true,

  note           text,
  date_creation  timestamp NOT NULL DEFAULT now(),

  -- Un numéro, une seule fois. Sans cette contrainte, un scan raté peut
  -- créer deux « n° 17 » et il devient impossible de dire laquelle est la
  -- vraie. ON CONFLICT DO NOTHING : la création en masse est idempotente.
  CONSTRAINT outils_exemplaires_produit_numero_key UNIQUE (produit_id, numero)
);

CREATE INDEX IF NOT EXISTS outils_exemplaires_produit_idx
  ON outils_exemplaires (produit_id, agence_id);
CREATE INDEX IF NOT EXISTS outils_exemplaires_emplacement_idx
  ON outils_exemplaires (emplacement_id);
CREATE INDEX IF NOT EXISTS outils_exemplaires_etat_idx
  ON outils_exemplaires (agence_id, etat);

-- -----------------------------------------------------------------------------
-- 2. Le prêt vise un exemplaire
--
-- Nullable : les prêts historiques portent NULL, et un outil NON suivi reste
-- prêtable au sens du produit — c'est tout l'intérêt du drapeau.
-- -----------------------------------------------------------------------------
ALTER TABLE prets_outils
  ADD COLUMN IF NOT EXISTS exemplaire_id integer
    REFERENCES outils_exemplaires(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS prets_outils_exemplaire_idx
  ON prets_outils (exemplaire_id);

-- -----------------------------------------------------------------------------
-- 3. Un exemplaire ne peut pas être prêté deux fois
--
-- Un index partiel : seule la ligne ACTIVE compte. Sans lui, deux techniciens
-- peuvent « prêter » la même clé à la même seconde, et l'inventaire ne
-- pourra plus dire qui a quoi. C'est une contrainte d'intégrité métier, pas
-- une règle d'application : elle doit tenir même en cas de bug, de script
-- lancé à la main, ou de deux écrans ouverts sur deux postes.
--
-- ON DELETE SET NULL / pas de CASCADE : garder l'historique compte plus que
-- supprimer la ligne qui l'a produit.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS prets_outils_exemplaire_actif_key
  ON prets_outils (exemplaire_id)
  WHERE exemplaire_id IS NOT NULL AND actif = true;

-- -----------------------------------------------------------------------------
-- 4. `produits.suivi_serie` doit exister pour que le drapeau soit lisible
--
-- Elle est dans le schéma Drizzle, mais une base ayant été créée par un script
-- avant sa declaration pourrait ne pas l'avoir. IF NOT EXISTS : idempotent,
-- et sans conséquence si elle est déjà là.
-- -----------------------------------------------------------------------------
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS suivi_serie boolean DEFAULT false;

-- -----------------------------------------------------------------------------
-- 5. Les emplacements créés par `outillage-router.bureauEmplacement`
--
-- Ce router crée son emplacement BUREAU à la volée, en code. Si deux agences
-- l'ont fait, la même. Pas de contrainte ici : c'est du ressort du router, et
-- M4 ne réécrit pas ce mécanisme.
-- -----------------------------------------------------------------------------