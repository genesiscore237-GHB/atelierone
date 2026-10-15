import "dotenv/config";
import { requireLocalOrForced, sslPourUrl } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("creation des clients depuis le registre parking (migrate-parking-clients.ts)");

/**
 * CRÉATION DES CLIENTS DEPUIS LE REGISTRE PARKING
 *
 * `parking_vehicles.client_nom` est du texte libre : le garage y note le client
 * tel qu'il se présente (« M. Longchamp », « Personnel SUDCAM », « Pour le
 * garage GPJ »). Ces noms n'existaient **dans aucune table** : la fiche client
 * de l'atelier était absente, donc le véhicule remained orphelin et la
 * recherche atelier ne pouvait pas le remonter.
 *
 * Ce script crée la fiche client à partir du registre, SANS rien inventer :
 *   - `nom` repris tel quel de la première occurrence (casse d'origine) ;
 *   - aucun téléphone, e-mail, adresse ou NIU ne sont devinés — la colonne
 *     reste NULL et l'écran de fiche les demande ;
 *   - `statut = 'PROSPECT'` : c'est une valeur de la nomenclature existante
 *     (`STATUTS_CLIENT`) qui dit exactement « connu, pas encore confirmé ».
 *     Un statut « PROVISOIRE » serait un mot neuf que rien d'autre ne
 *     connaîtrait, et que le code refuserait ensuite.
 *
 * La fiche n'est pas marquée doublon : on ne crée que s'il n'existe aucun
 * homonyme dans l'agence, le marqueur serait donc toujours faux ici. Les
 * quasi-doublons réels (« PRC » vs « Mr Ngoh Ngoh / PRC », « SUDCAM » vs
 * « Personnel SUDCAM ») portent des noms différents : aucun automate ne peut
 * les fusionner sans risque, la fusion reste une décision humaine.
 *
 * Deux temps, tous deux idempotents (rejouables) :
 *   1. créer les clients manquants ;
 *   2. rattacher les véhicules canoniques déjà créés (par
 *      `migrate-parking-vehicules.ts`) à leur client.
 *
 * Usage : pnpm -F @atelierone/db migrate:parking-clients
 */
(async () => {
  const db = postgres(process.env.DATABASE_URL!, {
    ssl: sslPourUrl(process.env.DATABASE_URL!),
    prepare: false,
    max: 1,
  });
  console.log("=== Clients créés depuis le registre parking ===");

  const norm = (c: string) => `lower(regexp_replace(btrim(${c}), '\\s+', ' ', 'g'))`;

  // 1. Création. Une fiche par (agence, nom normalisé) : « Yvan » et « YVAN »
  //    sont la même personne écrite différemment, pas deux clients.
  const crees = await db.unsafe(`
    WITH source AS (
      SELECT DISTINCT ON (p.agence_id, ${norm("p.client_nom")})
             p.agence_id,
             btrim(p.client_nom) AS nom,
             p.client_telephone
      FROM parking_vehicles p
      WHERE p.client_nom IS NOT NULL AND btrim(p.client_nom) <> ''
      ORDER BY p.agence_id, ${norm("p.client_nom")}, p.id
    )
    INSERT INTO clients (nom, telephone, agence_id, statut, type_client, is_active, notes, clients_doublonnes)
    SELECT s.nom,
           NULLIF(btrim(s.client_telephone), ''),
           s.agence_id,
           'PROSPECT',
           'PARTICULIER',
           true,
           'Créé depuis le registre parking — fiche à compléter (nom seul, aucune donnée inventée).',
           false
    FROM source s
    WHERE NOT EXISTS (
      SELECT 1 FROM clients c
      WHERE c.agence_id = s.agence_id AND ${norm("c.nom")} = ${norm("s.nom")}
    )
    RETURNING id, nom
  `);
  console.log(`Clients créés : ${crees.length}.`);

  // 2. Rattachement véhicule -> client, en passant par le registre parking.
  const lies = await db.unsafe(`
    UPDATE vehicules v
    SET client_id = c.id, updated_at = now()
    FROM parking_vehicles p
    JOIN clients c
      ON c.agence_id = p.agence_id
     AND ${norm("c.nom")} = ${norm("p.client_nom")}
    WHERE p.vehicule_id = v.id
      AND v.client_id IS DISTINCT FROM c.id
      AND p.client_nom IS NOT NULL AND btrim(p.client_nom) <> ''
  `);
  console.log(`Véhicules rattachés à un client : ${lies.count}.`);

  const stats = await db.unsafe(`
    SELECT
      (SELECT count(*) FROM clients)                                        AS clients,
      (SELECT count(*) FROM clients WHERE statut = 'PROSPECT')             AS prospects,
      (SELECT count(*) FROM vehicules)                                     AS vehicules,
      (SELECT count(*) FROM vehicules WHERE client_id IS NOT NULL)         AS vehicules_avec_client,
      (SELECT count(*) FROM parking_vehicles WHERE vehicule_id IS NOT NULL) AS parking_lies,
      (SELECT count(*) FROM parking_vehicles)                              AS parking_total
  `);
  console.log("\n--- État ---");
  console.log(`  clients                 : ${stats[0].clients} (dont ${stats[0].prospects} PROSPECT)`);
  console.log(`  véhicules               : ${stats[0].vehicules}, avec client : ${stats[0].vehicules_avec_client}`);
  console.log(`  parking lié / total     : ${stats[0].parking_lies}/${stats[0].parking_total}`);

  await db.end({ timeout: 5 });
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});