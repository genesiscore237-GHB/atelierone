-- 0012 — Fiches parking : statut PROVISOIRE, type dans la nomenclature, et
--         contraintes SQL qui rendent ces deux fautes impossibles à réintroduire.
--
-- CONTEXTE
--   `migrate-parking-clients.ts` a créé 31 fiches en écrivant :
--       statut      = 'PROSPECT'
--       type_client = 'PARTICULIER'
--   Les deux valeurs sont hors nomenclature du code :
--       STATUTS_CLIENT  = PROSPECT, ACTIF, INACTIF, BLOQUE, ARCHIVE
--       TYPES_CLIENT    = PART, ENTR, ADMIN, ASSUR, FLOTTE, PROSP
--   'PARTICULIER' n'y figure pas : la fiche décrivait un type que rien ne sait
--   interpréter. Le faute n'a rien vu venir — aucune contrainte SQL ne couvre
--   ces deux colonnes. C'est le même angle mort que les statuts de véhicules,
--   déjà traité par 0009.
--
-- POURQUOI UN NOUVEAU STATUT ET NON PROSPECT
--   `PROSPECT` est un TYPE commercial (`type_client = 'PROSP'`), pas un degré
--   de vérification. Une fiche parking est de type particulier mais connu :
--   le nom a été recopié d'un registre, le téléphone est inconnu. La confondre
--   avec un prospect la fait entrer dans les classements commerciaux et le
--   recouvrement — exactement ce que la décision D4 refuse.
--   D4 disait « PROVISOIRE, promote à la réception ». On applique D4.
--
-- QUI EST CONCERNÉ
--   Uniquement les fiches non commerciales : `type_client <> 'PROSP'`. Un vrai
--   prospect est créé avec le type PROSP par le routeur clients ; le laisser
--   PROSPECT est correct pour lui et ce filtre le préserve.

-- 1. Historique avant écrasement : la trace doit survivre au correctif.
DO $$
DECLARE n int;
BEGIN
  INSERT INTO client_statut_historique (client_id, ancien_statut, nouveau_statut, motif)
  SELECT c.id, c.statut, 'PROVISOIRE',
         'Correctif 0012 : fiche parking confondue avec un prospect commercial.'
  FROM clients c
  WHERE c.statut = 'PROSPECT' AND COALESCE(c.type_client, '') <> 'PROSP'
    AND NOT EXISTS (
      SELECT 1 FROM client_statut_historique h
      WHERE h.client_id = c.id AND h.nouveau_statut = 'PROVISOIRE'
    );
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '0012 : % fiches passées de PROSPECT à PROVISOIRE.', n;
END $$;

UPDATE clients SET statut = 'PROVISOIRE'
WHERE statut = 'PROSPECT' AND COALESCE(type_client, '') <> 'PROSP';

-- 2. Type ramené dans la nomenclature.
UPDATE clients SET type_client = 'PART'
WHERE type_client = 'PARTICULIER';

-- 3. Contraintes : c'est la partie qui compte.
--    Elles ne corrigent rien à elles seules — sans elles, la même faute
--    revient au prochain script, et rien ne la signalera.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_clients_statut') THEN
    ALTER TABLE clients
      ADD CONSTRAINT chk_clients_statut
      CHECK (statut IN ('PROVISOIRE','PROSPECT','ACTIF','INACTIF','BLOQUE','ARCHIVE'))
      NOT VALID;
    RAISE NOTICE '0012 : chk_clients_statut ajoutée (NOT VALID).';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_clients_type_client') THEN
    ALTER TABLE clients
      ADD CONSTRAINT chk_clients_type_client
      CHECK (type_client IS NULL OR type_client IN ('PART','ENTR','ADMIN','ASSUR','FLOTTE','PROSP'))
      NOT VALID;
    RAISE NOTICE '0012 : chk_clients_type_client ajoutée (NOT VALID).';
  END IF;
END $$;

-- 4. Validation des deux contraintes : la base est censée être propre.
DO $$
DECLARE
  n_statut int;
  n_type int;
BEGIN
  SELECT count(*) INTO n_statut FROM clients
   WHERE statut IS NOT NULL
     AND statut NOT IN ('PROVISOIRE','PROSPECT','ACTIF','INACTIF','BLOQUE','ARCHIVE');
  SELECT count(*) INTO n_type FROM clients
   WHERE type_client IS NOT NULL
     AND type_client NOT IN ('PART','ENTR','ADMIN','ASSUR','FLOTTE','PROSP');

  IF n_statut > 0 OR n_type > 0 THEN
    RAISE EXCEPTION '0012 : % statut(s) et % type(s) hors nomenclature — non validable.',
      n_statut, n_type;
  END IF;

  ALTER TABLE clients VALIDATE CONSTRAINT chk_clients_statut;
  ALTER TABLE clients VALIDATE CONSTRAINT chk_clients_type_client;
  RAISE NOTICE '0012 : les 2 contraintes sont VALIDATE.';
END $$;