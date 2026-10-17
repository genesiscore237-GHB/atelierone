-- 0014 — La relance existe en table, et n'a jamais servi.
--
-- POURQUOI
--
--   `relances` porte quatorze colonnes carefully designed : `client_id`,
--   `dette_id`, `canal`, `message`, `statut`, `envoyee_le`, `lu_le`,
--   `cree_par`. Le module Relances du cahier des charges est entièrement
--   écrit dans la table.
--
--   Aucun code n'y ecrit. Zéro ligne, en local comme en production.
--
--   Concrètement, un dossier en `EN_ATTENTE_VALIDATION` — devis envoyé, client
--   silencieux — n'a aucun souvenir d'une relance. Personne ne sait si l'appel
--   a eu lieu, qui l'a fait, quand, ni ce qui a été dit. Le dossier attend
--   dans le vide, et personne ne peut le savoir.
--
-- TROIS TROUS, DONT DEUX STRUCTURELS
--
--   1. `cree_par` est un `integer` SANS CLÉ ÉTRANGÈRE. La ligne peut donc
--      être écrite sans auteur, et l'historique d'une relance peut être
--      attribué à personne — ou à un numéro qui ne désigne plus personne.
--      C'est le même trou que la restitution sans auteur : une trace dont on
--      ne peut pas dire qui l'a produite n'est pas une trace.
--
--   2. Ni `or_id` ni `vehicule_id`. La table ne sait raccrocher une relance
--      qu'à un CLIENT ou une DETTE. Donc impossible d'écrire « ce véhicule a
--      été relancé » — ce qui est précisément la relance utile au garage.
--      On peut dire « ce client a été relancé », sans savoir sur quoi.
--
--   3. `type`, `canal` et `statut` sont des `varchar` libres, sans `CHECK`.
--      Trois listes qui n'en sont pas. Un `statut` à `'REPONSE'`, un `canal`
--      à `'SMS '` avec une espace en fin : rien ne le refuse. Le jour où un
--      tableau croise ces colonnes, il rencontre des valeurs qu'il ne sait
--      pas rendre, et les lignes disparaissent du filtre — silencieusement.
--
-- CE QUE CETTE MIGRATION FAIT
--
--   - rattache `cree_par` à `utilisateurs` ;
--   - ajoute `or_id` et `vehicule_id` ;
--   - contraint `type`, `canal` et `statut`.
--
-- L'ORDRE COMPTE, ET CE N'EST PAS UNE PRÉFÉRENCE
--
--   La contrainte doit EXISTER avant qu'on n'écrive les lignes qu'elle admet.
--   L'erreur du 0013 — écrire avant d'élargir — se reproduirait ici, et le refus
--   viendrait de la base, avec un message qui désigne la colonne et non la
--   cause.

-- ─── 1. L'auteur devient traçable ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'relances'::regclass AND conname = 'relances_cree_par_fkey'
  ) THEN
    -- Nettoyage préalable : une ligne sans auteur garderait un identifiant
    -- fantôme, et la contrainte échouerait dessus.
    UPDATE relances SET cree_par = NULL WHERE cree_par IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM utilisateurs u WHERE u.id = relances.cree_par);

    ALTER TABLE relances
      ADD CONSTRAINT relances_cree_par_fkey
      FOREIGN KEY (cree_par) REFERENCES public.utilisateurs(id);
  END IF;
END $$;

COMMENT ON COLUMN public.relances.cree_par IS
  'Auteur de la relance. NULL = relance automatique du système, jamais une relance humaine sans auteur.';

-- ─── 2. Rattacher la relance à CE QU'ELLE RELANCE ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'relances' AND column_name = 'or_id'
  ) THEN
    ALTER TABLE relances ADD COLUMN or_id integer;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'relances'::regclass AND conname = 'relances_or_id_fkey'
  ) THEN
    ALTER TABLE relances
      ADD CONSTRAINT relances_or_id_fkey
      FOREIGN KEY (or_id) REFERENCES public.ordres_reparation(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'relances' AND column_name = 'vehicule_id'
  ) THEN
    ALTER TABLE relances ADD COLUMN vehicule_id integer;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'relances'::regclass AND conname = 'relances_vehicule_id_fkey'
  ) THEN
    ALTER TABLE relances
      ADD CONSTRAINT relances_vehicule_id_fkey
      FOREIGN KEY (vehicule_id) REFERENCES public.vehicules(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN public.relances.or_id IS
  'Dossier concerné. Sans ce lien, on ne peut dire que « ce client a été relancé », jamais sur quoi.';
COMMENT ON COLUMN public.relances.vehicule_id IS
  'Véhicule concerné — un véhicule non restitué se relance par sa plaque, pas par un numéro de client.';

-- ─── 3. Trois listes qui devenaient des champs libres ───────────────────────
--
-- Les valeurs sont celles du service (`relance-service.ts`). Une seule
-- définition : la base la refuse, le TypeScript l'énumère. Deux listes
-- concurrentes pour la même règle ont déjà produit une dérive permanente
-- entre le local et la production.

ALTER TABLE relances DROP CONSTRAINT IF EXISTS relances_type_chk;
ALTER TABLE relances ADD CONSTRAINT relances_type_chk CHECK (
  type IN ('DEVIS', 'PAIEMENT', 'VEHICULE_NON_RESTITUE', 'RAPPEL_RECEPTION', 'AUTRE')
);

ALTER TABLE relances DROP CONSTRAINT IF EXISTS relances_canal_chk;
ALTER TABLE relances ADD CONSTRAINT relances_canal_chk CHECK (
  canal IN ('SYSTEME', 'SMS', 'WHATSAPP', 'EMAIL', 'APPEL', 'SMS_RECOU', 'EN_VISITE')
);

ALTER TABLE relances DROP CONSTRAINT IF EXISTS relances_statut_chk;
ALTER TABLE relances ADD CONSTRAINT relances_statut_chk CHECK (
  statut IN ('EN_ATTENTE', 'ENVOYEE', 'LUE', 'REPONDUE', 'SANS_REPONSE', 'ECHEC', 'CLOTUREE')
);

-- `canal` et `statut` ont un défaut SQL (`SYSTEME`, `EN_ATTENTE`) mais ne sont
-- pas `NOT NULL` : une relance peut être « preparee » sans encore partir.
-- Le vocabulaire, lui, s'applique quand meme — `NULL` n'est pas un canal.
ALTER TABLE relances ALTER COLUMN canal SET DEFAULT 'SYSTEME';
ALTER TABLE relances ALTER COLUMN statut SET DEFAULT 'EN_ATTENTE';