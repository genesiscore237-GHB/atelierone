-- 0027 — La raison de l'immobilisation, nommée.
--
-- ÉTAPE 7 (revue de parc). Trois trou§ que la réunion du matin révèle.
--
--
-- 1. UN VÉHICULE IMMOBILISÉ N'EST PAS NOMMÉ
--
--    `vehicule.statut_immobilisation` disait QUEL état (« en attente de
--    pièce »), jamais POURQUOI. Les deux ne sont pas la même information : un
--    état se constate, une raison s'explique. Et une raison non nommée ne se
--    défend pas en réunion — l'agent la rebâtit de mémoire, et le lendemain
--    elle a changé.
--
--    D'où `immobilisation_motif` + `immobilisation_detail` : ce QUI bloque,
--    en clair.
--
--
-- 2. LE DÉLAI D'UNE PIÈCE
--
--    Une pièce commandée il y a trois semaines et une pièce commandée hier
--    portent le même statut. L'une est un retard, l'autre non. La demande de
--    pièce porte désormais la date de la demande — sans elle, « ça traîne »
--    n'a pas de sens pour les pièces.
--
--
-- 3. `updated_at` SUR LES LIGNES DE TRAVAIL
--
--    Les lignes n'avaient que `created_at` : le système savait QUAND une ligne
--    avait été créée, jamais QUAND elle avait été touchée. Or la revue du matin
--    demande « la dernière intervention » — qui est par définition la dernière
--    modification, pas la création.
--
--
-- L'ORDRE COMPTE, ET CE N'EST PAS UNE PRÉFÉRENCE
--
--   Les contraintes doivent EXISTER avant qu'on n'écrive ce qu'elles admettent.
--   L'erreur du 0013 — écrire avant d'élargir — se reproduirait ici, et le
--   refus viendrait de la base avec un message qui désigne la colonne fautive.

-- ─── 1. La raison de l'immobilisation, nommée ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicules' AND column_name = 'immobilisation_motif'
  ) THEN
    ALTER TABLE public.vehicules ADD COLUMN immobilisation_motif varchar(60);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicules' AND column_name = 'immobilisation_detail'
  ) THEN
    ALTER TABLE public.vehicules ADD COLUMN immobilisation_detail text;
  END IF;
END $$;

ALTER TABLE public.vehicules DROP CONSTRAINT IF EXISTS vehicules_immobilisation_motif_chk;
ALTER TABLE public.vehicules ADD CONSTRAINT vehicules_immobilisation_motif_chk CHECK (
  immobilisation_motif IS NULL
  OR immobilisation_motif IN (
    'EN_ATTENTE_PIECE', 'EN_ATTENTE_DEVIS', 'EN_ATTENTE_DIAGNOSTIC',
    'EN_TRAVAUX', 'SOUS_TRAITANCE', 'BLOQUE', 'AUTRE'
  )
);

COMMENT ON COLUMN public.vehicules.immobilisation_motif IS
  'CE QUI bloque, pas QUEL etat. Un etat se constate, une raison s''explique.';
COMMENT ON COLUMN public.vehicules.immobilisation_detail IS
  'Le detail en clair : "disque d''embrayage, commande chez Y". C''est la colonne que la revue lit.';

-- ─── 2. La date de demande d'une pièce ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'or_demandes_pieces' AND column_name = 'date_demande'
  ) THEN
    -- Une piece demandee il y a trois semaines et une piece demandee hier
    -- portent le meme statut : l'une est un retard, l'autre non. Sans la date,
    -- "ca trainee" n'a pas de sens pour les pieces.
    ALTER TABLE public.or_demandes_pieces ADD COLUMN date_demande timestamp NOT NULL DEFAULT now();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS or_demandes_pieces_manquant_idx
  ON public.or_demandes_pieces (or_id, date_demande)
  WHERE statut <> 'RESOLUE';

-- ─── 3. `updated_at` sur les lignes de travail ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lignes_ordre_reparation' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.lignes_ordre_reparation
      ADD COLUMN updated_at timestamp NOT NULL DEFAULT now();
  END IF;
END $$;

-- ─── 4. Le déclencheur : `updated_at` doit suivre, pas rester fige ──────────
--
-- Une colonne `updated_at NOT NULL DEFAULT now()` ne se met jamais à jour
-- toute seule : elle vaut la date de création, indéfiniment. C'est exactement
-- le piège qu'on vient de corriger, recréé ailleurs.
--
-- La colonne seule donnerait l'illusion d'un suivi temporel : le champ
-- existerait, serait affiché, et serait faux.
CREATE OR REPLACE FUNCTION public.tg_lignes_or_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lignes_or_updated_at ON public.lignes_ordre_reparation;
CREATE TRIGGER trg_lignes_or_updated_at
  BEFORE UPDATE ON public.lignes_ordre_reparation
  FOR EACH ROW EXECUTE FUNCTION public.tg_lignes_or_updated_at();