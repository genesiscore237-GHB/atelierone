-- 0026 — Le journal d'intervention, et la sous-traitance.
--
-- ÉTAPE 7 (revue de parc). Deux notions métier qui n'existaient nulle part.
--
--
-- 1. LE JOURNAL D'INTERVENTION
--
--   `lignes_ordre_reparation` portait `technicien_id` et `statut`, mais aucun
--   champ libre. Un technicien pouvait changer l'état d'un travail, mais pas
--   écrire ce qu'il avait constaté ni ce qu'il fallait ensuite.
--
--   En réunion du matin, la question posée au chef de garage est : « qu'a-t-il
--   fait, qu'a-t-il vu, qu'est-ce qui manque ? ». Répondre supposait de le
--   savoir de mémoire — et le lendemain, plus personne.
--
--   La table est en AJOUT SEUL. Elle ne remplace rien : elle s'ajoute, datée
--   et signée. Le dernier enregistrement est « le dernier constat » ; toute
--   la série est « l'évolution des travaux ».
--
--   Trois champs, pas un pavé : en revue on lit en diagonale.
--
--
-- 2. LA SOUS-TRAITANCE
--
--   Aucune table, aucune colonne, aucun statut. Le module fournisseurs existe
--   pour les achats, mais rien ne disait « ce dossier part chez quelquun ».
--
--   Or c'est une décision prise régulièrement : le véhicule part, on chez qui,
--   pour quoi, et on l'attend à quelle date. Sans cela, la revue ne peut pas
--   consigner une décision qui est prise — elle est seulement répétée de
--   mémoire.
--
--
-- L'ORDRE COMPTE, ET CE N'EST PAS UNE PRÉFÉRENCE
--
--   La contrainte d'unicité sur l'historique doit EXISTER avant qu'on ne
--   commence à y écrire. L'erreur du 0013 — écrire avant d'élargir — se
--   reproduirait ici, et le refus viendrait de la base.

-- ─── 1. Journal d'intervention ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.or_interventions (
  id           serial PRIMARY KEY,
  ligne_id     integer NOT NULL REFERENCES public.lignes_ordre_reparation(id) ON DELETE CASCADE,
  or_id        integer NOT NULL REFERENCES public.ordres_reparation(id)        ON DELETE CASCADE,
  vehicule_id  integer          REFERENCES public.vehicules(id)                 ON DELETE CASCADE,
  technicien_id integer         REFERENCES public.employes(id),
  intervention text,
  constat      text,
  suite        text,
  created_at   timestamp       NOT NULL DEFAULT now()
);

-- La revue du matin lit « le dernier constat » : l'index doit servir cet accès
-- plutôt que de le faire au tri du client.
CREATE INDEX IF NOT EXISTS or_interventions_ligne_idx
  ON public.or_interventions (ligne_id, created_at DESC);
CREATE INDEX IF NOT EXISTS or_interventions_or_idx
  ON public.or_interventions (or_id, created_at DESC);

COMMENT ON TABLE public.or_interventions IS
  'Comptes rendus d''intervention, en AJOUT SEUL. Un enregistrement ne remplace jamais le précédent.';
COMMENT ON COLUMN public.or_interventions.constat IS
  'Ce que le technicien a vu. Champ lu en premier par la revue de parc.';
COMMENT ON COLUMN public.or_interventions.suite IS
  'Ce qu''il faut pour la suite : la suite du dossier commence ici.';

-- ─── 2. Sous-traitance ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ordres_reparation' AND column_name = 'sous_traitance_statut'
  ) THEN
    ALTER TABLE public.ordres_reparation ADD COLUMN sous_traitance_statut varchar(30);
  END IF;
END $$;

ALTER TABLE public.ordres_reparation DROP CONSTRAINT IF EXISTS ordres_reparation_sous_traitance_statut_chk;
ALTER TABLE public.ordres_reparation ADD CONSTRAINT ordres_reparation_sous_traitance_statut_chk CHECK (
  sous_traitance_statut IS NULL
  OR sous_traitance_statut IN ('A_ENVOYER', 'EN_ATTENTE_FOURNISSEUR', 'REPARTI', 'RECU', 'ANNULE')
);

-- La date de retour attendue est ce qui rend une sous-traitance pilotable :
-- sans elle, « en attente » n'a pas de fin et l'alerte ne peut pas se déclencher.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ordres_reparation' AND column_name = 'sous_traitance_retour_prevu'
  ) THEN
    ALTER TABLE public.ordres_reparation ADD COLUMN sous_traitance_retour_prevu date;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ordres_reparation' AND column_name = 'sous_traitance_note'
  ) THEN
    ALTER TABLE public.ordres_reparation ADD COLUMN sous_traitance_note text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ordres_reparation' AND column_name = 'sous_traitance_fournisseur_id'
  ) THEN
    ALTER TABLE public.ordres_reparation
      ADD COLUMN sous_traitance_fournisseur_id integer REFERENCES public.fournisseurs(id);
  END IF;
END $$;

-- ─── 3. L'historique des lignes s'écrivait sans les valeurs ────────────────
--
-- `updateLigne` écrivait « Ligne modifiée : Embrayage (statut, quantite) » :
-- les CHAMMS qui ont bougé, pas DE QUELLES VALEURS À QUELLES, et sans motif.
--
-- La table a pourtant `ancienne_valeur` et `nouvelle_valeur`, vides pour ce
-- type. Une trace qui dit qu'un événement a eu lieu n'est pas une histoire :
-- c'est un journal. Et « pourquoi » n'était demandé nulle part.

ALTER TABLE public.or_historique DROP CONSTRAINT IF EXISTS or_historique_type_chk;
ALTER TABLE public.ordres_reparation DROP CONSTRAINT IF EXISTS ordres_reparation_sous_traitance_fk;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ordres_reparation' AND column_name = 'sous_traitance_fournisseur_id'
  ) THEN
    ALTER TABLE public.ordres_reparation
      ADD COLUMN sous_traitance_fournisseur_id integer REFERENCES public.fournisseurs(id);
  END IF;
END $$;