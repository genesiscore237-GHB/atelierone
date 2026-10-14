-- LOT R5 - Dédoublonnage client (exigence E6).
--
-- Objectif : permettre de repérer et de fusionner les clients en double
-- (même téléphone normalisé ou même couple nom+téléphone) créés par la
-- réception quand un client existant n'était pas sélectionné.
--
-- On n'ajoute PAS de contrainte unique sur clients : deux clients distincts
-- peuvent légitimement partager un même téléphone (entreprise multi-lignes,
-- famille, etc.). Le dédoublonnage reste donc OPÉRATIONNEL (suggestion +
-- fusion explicite par l'utilisateur), jamais automatique — conformément au
-- principe « pas d'invention » (D3).
--
-- `clients_doublonnes` est un marquage DÉRIVÉ, recalculé par le script
-- packages/db/src/dedup-clients.ts (backfill) et maintenu à la création via
-- `or.receptionner`. Il sert uniquement à SURFACER les doublons dans l'UI
-- (pastille « Doublon potentiel ») : la fusion se fait ensuite par
-- `clients.fusionner`, qui est la seule voie de suppression.

-- 1. Colonne de marquage dérivé - nullable/booléen, défaut faux.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "clients_doublonnes" boolean DEFAULT false;

-- 2. Index de lecture pour lister rapidement les clients marqués doublons.
CREATE INDEX IF NOT EXISTS "idx_clients_doublonnes"
  ON "clients" ("agence_id")
  WHERE "clients_doublonnes" = true;
