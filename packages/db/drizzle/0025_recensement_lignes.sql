-- 0025_recensement_lignes.sql
-- Étape 1 du Lot 1 : une ligne saisie au recensement survit à l'écran fermé.
--
-- Le recensement gardait ses lignes en mémoire de réact : la page fermée,
-- le comptage fait sur site disparaissait. `recensement_lignes` persiste
-- chaque ligne AU MOMENT de la saisie ; `valider` les consomme (elles
-- migrent alors dans `inventaires`, comme aujourd'hui).
--
-- Pas d'index unique sur (session, produit, emplacement, lot) : l'upsert se
-- fait en code — PG traite les NULL comme distincts dans un index unique,
-- ce qui contournerait silencieusement la règle « une ligne par clé ».

CREATE TABLE IF NOT EXISTS public.recensement_lignes (
  id              SERIAL PRIMARY KEY,
  session_id      INTEGER          NOT NULL
                  REFERENCES public.inventaires_sessions(id) ON DELETE CASCADE,
  produit_id      INTEGER          NOT NULL
                  REFERENCES public.produits(id),
  agence_id       INTEGER          NOT NULL,
  emplacement_id  INTEGER          REFERENCES public.emplacements(id),
  lot_id          INTEGER          REFERENCES public.lots(id),
  quantite        NUMERIC(12,2)    NOT NULL,
  unite_id        UUID             REFERENCES public.unites_mesure(id),
  prix_achat      NUMERIC(14,2),
  note            VARCHAR(500),
  cree_par        INTEGER          REFERENCES public.utilisateurs(id),
  cree_at         TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recensement_lignes_session
  ON public.recensement_lignes(session_id);
CREATE INDEX IF NOT EXISTS idx_recensement_lignes_produit
  ON public.recensement_lignes(produit_id);

-- Les sessions validées ne doivent plus avoir de lignes en attente
-- (elles vivent dans inventaires) — garde-fou si l'état dérive.
DELETE FROM public.recensement_lignes
 WHERE session_id IN (
       SELECT id FROM public.inventaires_sessions WHERE statut = 'valide');
