-- =============================================================================
-- 0023_pieces_qualification_et_offres.sql
--
-- CE QUE LE CAHIER DES CHARGES DEMANDE, ET CE QUE LA BASE NE POUVAIT PAS DIRE
--
-- 1. « Confirmer une compatibilité ne doit jamais être confondu avec une
--     compatibilité saisie au doigt par un utilisateur. »
-- 2. « Une équivalence non vérifiée ne doit jamais être affichée comme une
--     compatibilité garantie. »
-- 3. « Si le contenu d'un kit est inconnu, tu ne dois pas inventer sa
--     composition. Enregistre le kit comme une unité commerciale distincte. »
-- 4. « Ne transforme pas automatiquement une pièce d'occasion en pièce neuve. »
--
-- Aucune de ces quatre phrases n'était exprimable dans le schéma. Une
-- compatibilité saisie à la main s'affichait exactement comme une équivalence
-- de catalogue, faute de colonne pour les distinguer. Un facteur de
-- conditionnement ne disait pas s'il venait d'un bon du fournisseur ou d'une
-- supposition. Et « occasion » existait comme mot, sans aucun champ pour dire de
-- quelle occasion il s'agissait.
--
-- Cette migration ajoute les colonnes QUI MANQUENT. Elle n'invente aucune
-- donnée : tout ce qu'elle crée est vide, non vérifié, et le reste est un
-- backfill de valeurs déjà présentes ailleurs.
--
-- Idempotente, comme l'exige le dépôt (AGENTS.md § « Toute nouvelle migration
-- doit être idempotente »).
-- =============================================================================


-- =============================================================================
-- 1. QUALIFIER UNE RÉFÉRENCE
--
-- `produit_references` sait dire QUELLE référence (typeRef) et QUELLE valeur.
-- Elle ne sait pas d'où elle vient, ni si on l'a vérifiée. C'est ce qui rend
-- une référence « non vérifiée » indiscernable d'une référence de catalogue.
--
-- La valeur par défaut est VOLONTAIREMENT LA PLUS PRUDENTE : une référence
-- importée ce jour est `NON_VERIFIE` tant que personne ne l'a qualifiée. Une
-- donnée qui n'a pas de statut ne doit pas être présentée comme confirmée.
-- =============================================================================

ALTER TABLE produit_references
  ADD COLUMN IF NOT EXISTS source varchar(60);
ALTER TABLE produit_references
  ADD COLUMN IF NOT EXISTS reference_source varchar(160);
ALTER TABLE produit_references
  ADD COLUMN IF NOT EXISTS niveau_verification varchar(20);
ALTER TABLE produit_references
  ADD COLUMN IF NOT EXISTS note text;

-- Backfill : tout ce qui existait est « non vérifié ». On ne promeut rien
-- automatiquement — une référence existante n'a jamais été vérifiée contre une
-- source, donc elle ne l'est toujours pas.
UPDATE produit_references
   SET niveau_verification = 'NON_VERIFIE'
 WHERE niveau_verification IS NULL;

-- Contrainte : la liste est fermée côté serveur (Zod) ; ici on garantit au
-- minimum qu'une valeur libre ne puisse pas s'introduire par un script SQL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_produit_references_niveau_verif'
  ) THEN
    ALTER TABLE produit_references
      ADD CONSTRAINT ck_produit_references_niveau_verif
      CHECK (
        niveau_verification IS NULL
        OR niveau_verification IN ('CONFIRME', 'CONDITIONNEL', 'NON_VERIFIE')
      );
  END IF;
END $$;

-- Recherche par référence normalisée : c'est la stratégie 2 du moteur de
-- doublons, et elle était structurellement vide parce que rien n'indexait la
-- colonne qu'elle interroge.
CREATE INDEX IF NOT EXISTS produit_references_normalisee_idx
  ON produit_references (lower(valeur_normalisee));

-- La même qualification, sur les références ÉQUIVALENTES au niveau article.
-- Sans elle, on aurait deux tables de références dont une seule sait dire si
-- elle a été vérifiée — et celle qu'on utilise dans le wizard était justement
-- celle-ci.
ALTER TABLE produit_references_equiv
  ADD COLUMN IF NOT EXISTS source varchar(60);
ALTER TABLE produit_references_equiv
  ADD COLUMN IF NOT EXISTS niveau_verification varchar(20);

UPDATE produit_references_equiv
   SET niveau_verification = 'NON_VERIFIE'
 WHERE niveau_verification IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_produit_ref_equiv_niveau_verif'
  ) THEN
    ALTER TABLE produit_references_equiv
      ADD CONSTRAINT ck_produit_ref_equiv_niveau_verif
      CHECK (
        niveau_verification IS NULL
        OR niveau_verification IN ('CONFIRME', 'CONDITIONNEL', 'NON_VERIFIE')
      );
  END IF;
END $$;


-- =============================================================================
-- 2. QUALIFIER UNE COMPATIBILITÉ
--
-- `compatibilites_produits` est la table la plus riche du dépôt (35 colonnes)
-- et la moins honnête : aucune source, aucun niveau de vérification, et
-- AUCUNE HORODATAGE. On ne savait pas quand elle avait été remplie, ni par qui.
-- Une compatibilité « Toyota Corolla 2015 » saisie en 2026 par le magasinier
-- s'affichait comme une équivalence de catalogue, parce que rien ne distinguait
-- les deux.
--
-- La table n'est pas horodatée : on ne peut donc pas calculer un « depuis
-- quand ». On commence aujourd'hui.
-- =============================================================================

ALTER TABLE compatibilites_produits
  ADD COLUMN IF NOT EXISTS source varchar(60);
ALTER TABLE compatibilites_produits
  ADD COLUMN IF NOT EXISTS niveau_verification varchar(20);
ALTER TABLE compatibilites_produits
  ADD COLUMN IF NOT EXISTS date_creation timestamp NOT NULL DEFAULT now();
ALTER TABLE compatibilites_produits
  ADD COLUMN IF NOT EXISTS cree_par integer;

-- Backfill : idem. Une compatibilité existante n'a pas de source : elle est
-- donc `MANUELLE` et `NON_VERIFIE`, pas « constructeur ».
UPDATE compatibilites_produits
   SET source = COALESCE(source, 'MANUELLE'),
       niveau_verification = COALESCE(niveau_verification, 'NON_VERIFIE');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_compatibilites_niveau_verif'
  ) THEN
    ALTER TABLE compatibilites_produits
      ADD CONSTRAINT ck_compatibilites_niveau_verif
      CHECK (
        niveau_verification IS NULL
        OR niveau_verification IN ('CONFIRME', 'CONDITIONNEL', 'NON_VERIFIE')
      );
  END IF;
END $$;

-- Recherche d'une compatibilité par véhicule : sans index, chaque recherche de
-- pièces compatibles pour un modèle donné fait un parcours de table.
CREATE INDEX IF NOT EXISTS compatibilites_produits_vehicule_idx
  ON compatibilites_produits (lower(marque), lower(modele));
CREATE INDEX IF NOT EXISTS compatibilites_produits_produit_idx
  ON compatibilites_produits (produit_id);


-- =============================================================================
-- 3. DIRE DE QUELLE OCCASION IL S'AGIT
--
-- `etat_produit` sait dire OCCASION. Aucun champ ne disait ce qui la
-- caractériseisait — or une pièce d'occasion se juge sur ses défauts, sa
-- provenance et sa garantie, pas sur son seul état.
--
-- Tous les champs sont NULL par défaut : on ne devine ni un kilométrage, ni un
-- véhicule donneur, ni une garantie. Une occasion sans défaut connu se dit
-- « occasion sans défaut constaté » — pas « occasion en bon état » par défaut.
-- =============================================================================

ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS occasion_etat_constate varchar(60);
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS occasion_defauts text;
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS occasion_provenance varchar(200);
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS occasion_vehicule_id integer
    REFERENCES vehicules(id) ON DELETE SET NULL;
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS occasion_kilometrage integer;
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS occasion_garantie_mois integer;

-- Le véhicule donneur ne s'invente pas, et le kilométrage ne se déduit pas du
-- véhicule donneur : ce sont deux informations distinctes, et les deux doivent
-- être saisies (ou laissées nulles) par quelqu'un qui les connaît.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_produits_occasion_kilometrage'
  ) THEN
    ALTER TABLE produits
      ADD CONSTRAINT ck_produits_occasion_kilometrage
      CHECK (occasion_kilometrage IS NULL OR occasion_kilometrage >= 0);
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 3 bis. LE DOUBLON « neuf / occasion » — ET CE QU'IL NE FAUT PAS FAIRE
--
-- `produits.etat` (minuscule, défaut 'neuf') et `produits.etat_produit`
-- (majuscules) disent la même chose dans deux nomenclatures. Le flux catalogue
-- V3 n'écrit que le second : la première n'est lue que par `catalog.ts`, un
-- chemin de création antérieur.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ON NE RECOPIE PAS. VOLONTAIREMENT.
--
-- Le relevé : 319 produits, `etat = 'neuf'` pour TOUS, et `etat_produit` NULL
-- pour 243 d'entre eux.
--
-- Recopier `etat` vers `etat_produit` ferait passer 243 « inconnu » à
-- « neuf » — le cahier des charges dit : « Toute information non connue doit
-- rester explicitement inconnue. » Un champ qui n'a jamais été rempli ne doit
-- pas être rempli sous prétexte qu'un autre champ vaut « neuf » par défaut.
--
-- Donc : `etat_produit` reste NULL là où il est NULL. NULL se lit « état
-- commercial non renseigné », ce qui est la vérité. Le vrai correctif est
-- ailleurs — le flux catalogue n'écrit plus `etat` (voir articles-router), ce
-- qui empêche la divergence de s'agrandir.
-- -----------------------------------------------------------------------------

-- La colonne `etat` reste en place (elle a de nombreuses lectures), mais elle
-- n'est plus écrite par le flux catalogue : voir articles-router.


-- =============================================================================
-- 4. UNE OFFRE FOURNISSEUR EST UNIQUE
--
-- `produits_fournisseurs` n'a AUCUNE contrainte d'unicité. Le code fait
-- `onConflictDoNothing` — sur une table sans contrainte, cela ne déduplique
-- rien et ne signale rien : ajouter un deuxième fournisseur « ne fait rien »
-- en silence. Le cahier des charges exige plusieurs fournisseurs par pièce,
-- donc la contrainte doit exister.
--
-- On ne peut pas poser un UNIQUE (produit_id, fournisseur_id) : la même paire
-- peut légitimement avoir deux lignes (deux références d'achat chez le même
-- fournisseur, deux conditionnements). L'unicité porte sur ce qui IDENTIFIE une
-- offre : le trio produit / fournisseur / référence fournisseur.
--
-- AVANT de poser la contrainte, on dédoublonne — sinon la migration échoue sur
-- une base qui a déjà des doublons, et « idempotent » veut dire « rejouable sur
-- une base déjà alignée », pas « échoue si elle ne l'est pas ».
--
-- La ligne conservée est la plus récente : c'est celle qui a été corrigée en
-- dernier, donc celle qui a le plus de chances d'être la bonne.
-- -----------------------------------------------------------------------------
DELETE FROM produits_fournisseurs pf
 WHERE pf.id NOT IN (
   SELECT DISTINCT ON (produit_id, fournisseur_id, COALESCE(reference_fournisseur, ''))
          id
     FROM produits_fournisseurs
    ORDER BY produit_id, fournisseur_id, COALESCE(reference_fournisseur, ''), updated_at DESC, id DESC
 );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unq_produits_fournisseurs_offre'
  ) THEN
    ALTER TABLE produits_fournisseurs
      ADD CONSTRAINT unq_produits_fournisseurs_offre
      UNIQUE (produit_id, fournisseur_id, reference_fournisseur);
  END IF;
END $$;


-- =============================================================================
-- 5. DIRE SI LE CONTENU D'UN CONDITIONNEMENT EST CONFIRMÉ
--
-- C'est l'exigence la plus facile à contourner et la plus coûteuse quand on la
-- contourne : `facteur_conditionnement = 10` ne dit pas si la boîte contient
-- réellement 10 filtres ou si quelqu'un a supposé qu'il y en avait 10.
--
-- Le cahier des charges est explicite : « Si le contenu d'un kit est inconnu,
-- tu ne dois pas inventer sa composition. Enregistre le kit comme une unité
-- commerciale distincte jusqu'à ce que son contenu soit documenté. »
--
-- `contenu_confirme` porte exactement cette information. Il ne vaut PAS true
-- par défaut : un fournisseur ajouté aujourd'hui n'a pas encore été vérifié.
-- =============================================================================

ALTER TABLE produits_fournisseurs
  ADD COLUMN IF NOT EXISTS contenu_confirme boolean NOT NULL DEFAULT false;
ALTER TABLE produits_fournisseurs
  ADD COLUMN IF NOT EXISTS devise varchar(10);
ALTER TABLE produits_fournisseurs
  ADD COLUMN IF NOT EXISTS quantite_min_commande numeric(12,2);

-- ─────────────────────────────────────────────────────────────────────────────
-- LE DÉFAUT MANQUAIT DANS LA MIGRATION, ET C'ÉTAIT UN VRAI DÉFAUT
--
-- Le schéma Drizzle déclare `devise` avec `DEFAULT 'XAF'`. La colonne SQL, elle,
-- na l'avait pas : une offre créée APRÈS le backfill se serait retrouvée avec
-- une devise NULLE. Autrement dit, le backfill aurait marché une fois, puis
-- silencieusement arrêté de fonctionner — le pire défaut possible, celui qui
-- semble corrects au premier jour.
ALTER TABLE produits_fournisseurs
  ALTER COLUMN devise SET DEFAULT 'XAF';

UPDATE produits_fournisseurs SET devise = COALESCE(
         (SELECT a.devise FROM agences a WHERE a.id = produits_fournisseurs.fournisseur_id),
         'XAF')
 WHERE devise IS NULL OR devise = '';

-- Une quantité minimum de commande n'est pas négative.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_produits_fournisseurs_qte_min'
  ) THEN
    ALTER TABLE produits_fournisseurs
      ADD CONSTRAINT ck_produits_fournisseurs_qte_min
      CHECK (quantite_min_commande IS NULL OR quantite_min_commande >= 0);
  END IF;
END $$;

-- Un facteur de conditionnement négatif ou nul rendrait une conversion absurde
-- (diviser par zéro) : on l'interdit à la base, pas seulement dans le formulaire.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_produits_fournisseurs_facteur'
  ) THEN
    ALTER TABLE produits_fournisseurs
      ADD CONSTRAINT ck_produits_fournisseurs_facteur
      CHECK (facteur_conditionnement IS NULL OR facteur_conditionnement > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS produits_fournisseurs_produit_idx
  ON produits_fournisseurs (produit_id, fournisseur_id);