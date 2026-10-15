-- LOT O2 — Nomenclature « Outillage & accessoires » par agence
--
-- La liste des outils proposés à la réception était une constante codée en dur
-- dans le composant React : aucune agence ne pouvait l'adapter à sa fiche
-- papier, et aucun agent ne pouvait y ajouter un élément.
--
-- La colonne est volontairement NULLABLE : une agence qui n'a pas personnalise sa
-- liste reçoit la nomenclature par défaut côté serveur. Configurer le
-- catalogue ne doit pas être une étape obligatoire pour faire tourner
-- l'atelier — sinon un garage qui n'a pas eu le temps de paramétrer se
-- retrouve sans check-list.
--
-- Format : JSON = [{ "cle": "CRIC", "libelle": "CRIC", "ordre": 10 }, ...]
--   - `cle` est une identité IMMUABLE. Renommer un outil ne change que
--     `libelle` : 8 dossiers de production portent déjà des réponses
--     d'outillage, et les clés d'origine sont conservées à l'identique
--     (accents et espaces compris) pour ne pas les rendre orphelines.
--   - `ordre` est un entier explicite, jamais déduit d'un tri implicite.
--
-- IF NOT EXISTS : la migration doit être rejouable sans erreur sur un
-- environnement déjà à jour.

ALTER TABLE atelier_parametres
  ADD COLUMN IF NOT EXISTS outillage_catalogue text;

COMMENT ON COLUMN atelier_parametres.outillage_catalogue IS
  'Nomenclature outillage de l''agence : [{cle, libelle, ordre}]. NULL = nomenclature par defaut.';