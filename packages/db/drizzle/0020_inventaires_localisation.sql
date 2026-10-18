-- 0020 — Le recensement sait OÙ, pas seulement COMBIEN.
--
-- POURQUOI
--
--   `inventaires` — la ligne de comptage — ne porte que trois chose :
--   produit, quantité théorique, quantité réelle. Pas d'emplacement, pas
--   de lot.
--
--   C'est cohérent pour un inventaire général d'entrepôt, où l'on demande
--   « combien de filtres à huile avez-vous ? ». C'est incompatible avec le
--   besoin réel du garage, qui est spatial :
--
--     « 12 filtres dans le magasin, 3 dans le bureau du chef, 1 dans le
--      rayon du camion »
--
--   Sans `emplacement_id`, la ligne de comptage ne peut pas dire où, donc :
--   · le théorique ne peut pas être comparé à l'emplacement concerné ;
--   · le même article ne peut pas être réparti sur plusieurs lignes ;
--   · l'écart calculé mélange ce qui manque ici et ce qui est en trop là.
--
--   C'est aussi ce qui bloque le modèle du cadrage § 4 : un bidon d'huile
--   doit pouvoir dire de quel fût il sort, et le fût est précisément un
--   lot. Sans `lot_id`, un recensement de bidons perdrait la traçabilité
--   que la migration 0018 vient d'établir.
--
-- ET POURQUOI PAS UNE TABLE NEUVE
--
--   Une session de recensement EST un inventaire : mêmes colonnes, même
--   écart, même validation. Douter `inventaires` d'où et de quel lot coûte
--   deux colonnes ; créer une table séparée coûterait deux moteurs à
--   maintenir et deux écrans qui divergent. On complète l'existant.
--
-- ADDITIF ET IDEMPOTENT
--
--   `ADD COLUMN IF NOT EXISTS`, index `CREATE … IF NOT EXISTS`.
--   Aucune ligne existante n'est touchée : les 17 lignes d'inventaire déjà
--   présentes ne sauront simplement pas où leur comptage a eu lieu — ce qui
--   est exact.

-- 1. Où.
ALTER TABLE inventaires ADD COLUMN IF NOT EXISTS emplacement_id integer REFERENCES emplacements(id);

COMMENT ON COLUMN inventaires.emplacement_id IS
  'Où le comptage a été fait. NULL = comptage global, non localisé.';

-- 2. De quel lot.
ALTER TABLE inventaires ADD COLUMN IF NOT EXISTS lot_id integer REFERENCES lots(id);

COMMENT ON COLUMN inventaires.lot_id IS
  'Lot compté. Renseigné pour les contenants traçables (bidons d''un fût).';

-- 3. Index de lecture du comptage en cours.
--
--    Une session compte typiquement plusieurs centaines de lignes et l'écran
--    les recharge en boucle pendant la saisie. Sans index, chaque rafraîchissement
--    rescane la table entière.
CREATE INDEX IF NOT EXISTS ix_inventaires_session_produit
    ON inventaires (session_id, produit_id, emplacement_id);

-- 4. Index des lignes d'un emplacement, pour le comptage par rayon.
CREATE INDEX IF NOT EXISTS ix_inventaires_emplacement
    ON inventaires (agence_id, emplacement_id)
    WHERE emplacement_id IS NOT NULL;

-- 5. Constat : ce que la base permet aujourd'hui.
DO $$
DECLARE n_total int; n_localisees int;
BEGIN
    SELECT count(*) INTO n_total FROM inventaires;
    SELECT count(*) INTO n_localisees FROM inventaires WHERE emplacement_id IS NOT NULL;

    IF n_total = 0 THEN
        RAISE NOTICE '0020 : aucun inventaire enregistre — le module n''a jamais servi.';
    ELSIF n_localisees = 0 THEN
        RAISE NOTICE
            '0020 : % ligne(s) d''inventaire, aucune localisee. Leur lieu de comptage '
            'est inconnu et ne peut pas etre retrouve ; seul un nouveau comptage le donnera.',
            n_total;
    ELSE
        RAISE NOTICE '0020 : % ligne(s) d''inventaire, dont % localisee(s).', n_total, n_localisees;
    END IF;
END $$;