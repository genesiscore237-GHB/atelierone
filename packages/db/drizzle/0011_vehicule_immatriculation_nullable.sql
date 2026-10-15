-- LOT R1 (complément) — `vehicules.immatriculation` devient NULLABLE
--
-- 12 véhicules du registre parking sont réellement au garage SANS plaque
-- relevée (Toyota Land Cruiser « Nations Unies », Suzuki « sans client »,
-- Renault Mégane « Pasto »…). Tant que `vehicules.immatriculation` était
-- `NOT NULL`, ces véhicules ne pouvaient exister que comme lignes de
-- registre : l'Atelier ne pouvait ni les lister, ni les recevoir, alors
-- qu'ils sont physiquement présents. Le garage les gérait dans un module,
-- l'atelier ne les voyait pas.
--
-- Le modèle parking (`parking_vehicles.immatriculation`) était déjà
-- `varchar` nullable depuis le début, et `0004` documente explicitement que
-- « plusieurs lignes parking sans plaque coexistent par conception ». Seul
-- `vehicules` fit de la plaque une obligation : le défaut était dans la
-- était dans la table, pas dans le métier.
--
-- Deux defence restent intactes et c'est ce qui rend cette migration sûre :
--   1. `immat_norm` reste alimenté par le déclencheur `0010`, et passe à
--      NULL quand la plaque est absente. L'index unique
--      `uq_vehicules_agence_immat_norm` est PARTIEL sur `immat_norm IS NOT
--      NULL` : plusieurs véhicules sans plaque coexistent donc sans conflit,
--      et une plaque qui arrive plus tard est toujours contrôlée.
--   2. Aucune donnée n'est écrite par cette migration. Elle change ce qui est
--      PERMIS, pas ce qui existe. Créer les 12 fiches est une opération
--      distincte, explicite et traçable (`migrate-parking-vehicules.ts`).
--
-- IF EXISTS : rejouable sans erreur.
ALTER TABLE vehicules
  ALTER COLUMN immatriculation DROP NOT NULL;

COMMENT ON COLUMN vehicules.immatriculation IS
  'Plaque. NULLABLE : un vehicule reel peut etre au garage sans plaque relevee ; aucune immatriculation n est inventee.';