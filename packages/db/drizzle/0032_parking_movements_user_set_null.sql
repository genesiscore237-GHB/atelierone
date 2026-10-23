-- 0032 : L'AUTEUR D'UN MOUVEMENT PARKING NE BLOQUE PLUS LA PURGE D'UN COMPTE.
--
-- `parking_movements` est un journal : supprimer un utilisateur ne doit pas
-- effacer le mouvement, ni empêcher sa suppression. La clé étrangère passe en
-- `ON DELETE SET NULL` ; l'auteur devient NULL, le fait historique reste.
--
-- Idempotent : la contrainte est recréée avec la bonne action.

ALTER TABLE parking_movements
  DROP CONSTRAINT IF EXISTS parking_movements_user_id_utilisateurs_id_fk;

ALTER TABLE parking_movements
  ADD CONSTRAINT parking_movements_user_id_utilisateurs_id_fk
  FOREIGN KEY (user_id) REFERENCES utilisateurs(id)
  ON DELETE SET NULL;
