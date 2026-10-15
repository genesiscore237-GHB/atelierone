-- LOT R1bis — Protection des pièces à conviction (photos d'état des lieux)
--
-- `or_photos.or_id` était en ON DELETE CASCADE : un simple
-- DELETE FROM ordres_reparation effaçait les photos d'état des lieux sans
-- laisser de trace et sans lever d'erreur. Le dossier disparaissait, la preuve
-- avec — ces photos sont l'élément de comparaison entrée/sortie en cas de litige.
--
-- Passage en ON DELETE RESTRICT : la base refuse la suppression tant qu'une
-- photo existe. C'est le seul point qui protège tous les accès, y compris le
-- SQL direct et les scripts de maintenance — aucune route applicative ne
-- supprime d'OR aujourd'hui, mais rien ne l'interdisait.
--
-- Pour supprimer un dossier ayant des photos, il faut désormais les supprimer
-- explicitement : geste visible et volontaire, pas un effet de bord.
--
-- IF NOT EXISTS : si la contrainte existe déjà avec le nom généré par Drizzle
-- (`or_photos_or_id_ordres_reparation_id_fk`), on la remplace pour aligner son
-- comportement ; sinon on la crée. Le repli évite qu'un environnement ayant déjà
-- une contrainte plus courte ne fasse échouer le déploiement.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'or_photos_or_id_fkey'
  ) THEN
    ALTER TABLE or_photos DROP CONSTRAINT or_photos_or_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'or_photos_or_id_ordres_reparation_id_fk'
  ) THEN
    ALTER TABLE or_photos DROP CONSTRAINT or_photos_or_id_ordres_reparation_id_fk;
  END IF;

  ALTER TABLE or_photos
    ADD CONSTRAINT or_photos_or_id_ordres_reparation_id_fk
    FOREIGN KEY (or_id) REFERENCES ordres_reparation(id)
    ON DELETE RESTRICT;
END $$;