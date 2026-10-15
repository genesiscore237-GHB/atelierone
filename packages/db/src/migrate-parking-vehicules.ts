import "dotenv/config";
import { requireLocalOrForced, sslPourUrl } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("lien parking_vehicles -> vehicules (migrate-parking-vehicules.ts)");

/**
 * LOT 1 — Dé-duplication du registre parking (patch 5).
 *
 * `parking_vehicles` cesse d'être un second registre de véhicules :
 *   1. liaison vers le véhicule canonique EXISTANT (appariement par
 *      immatriculation normalisée, même agence — le plus ancien gagne) ;
 *   2. création du véhicule canonique pour chaque ligne immatriculée encore
 *      non liée (un par (agence, immat normalisée) ;
 *   3. second passage de liaison (les canons créés au 2 relient leurs lignes) ;
 *   4. lignes SANS immatriculation : depuis la migration 0011
 *      (`immatriculation` nullable), elles reçoivent elles aussi une fiche —
 *      elles sont physiquement au garage, les laisser hors de l'atelier les
 *      rendait invisibles. Aucun numéro de plaque n'est inventé : le lien
 *      passe par un marqueur `parking_id=<id>` dans les notes.
 *
 * Idempotent — réexécutable à volonté. La projection des statuts (CASE des
 * points 2 et 4) est la copie SQL de `PARKING_VERS_IMMOBILISATION` dans
 * apps/nextjs/src/server/lib/parking-statuts.ts : les deux doivent rester
 * alignées. Les statuts sans équivalent exact (EN_VENTE, ACCIDENTE,
 * A_TRANSFERER, DONNEES_INCOMPLETES) projettent NULL — aucun état inventé.
 *
 * Usage : pnpm -F @atelierone/db migrate:parking-vehicules
 *         (invoqué par db:test-setup après le seed parking)
 */
(async () => {
  const db = postgres(process.env.DATABASE_URL!, { ssl: sslPourUrl(process.env.DATABASE_URL!), prepare: false, max: 1 });
  console.log("=== LOT 1 — parking_vehicles.vehicule_id -> vehicules ===");

  const NORM = (col: string) =>
    `upper(regexp_replace(btrim(${col}), '[[:space:]]+', '', 'g'))`;

  const lier = async (libelle: string): Promise<number> => {
    const r = await db.unsafe(`
      UPDATE parking_vehicles p
      SET vehicule_id = v.id, updated_at = now()
      FROM (
        SELECT DISTINCT ON (agence_id, immat_norm) id, agence_id, immat_norm
        FROM (
          SELECT id, agence_id, ${NORM("immatriculation")} AS immat_norm
          FROM vehicules
          WHERE immatriculation IS NOT NULL AND btrim(immatriculation) <> ''
        ) x
        ORDER BY agence_id, immat_norm, id
      ) v
      WHERE p.vehicule_id IS NULL
        AND p.immatriculation IS NOT NULL
        AND btrim(p.immatriculation) <> ''
        AND v.agence_id = p.agence_id
        AND v.immat_norm = ${NORM("p.immatriculation")}
    `);
    console.log(`${libelle} : ${r.count} ligne(s).`);
    return r.count;
  };

  // 1. Lier aux véhicules canoniques déjà présents.
  await lier("Lien vers vehicules existants");

  // 2. Créer les canons manquants — un par (agence, immat normalisée).
  const crees = await db.unsafe(`
    WITH candidats AS (
      SELECT p.*,
             ${NORM("p.immatriculation")} AS immat_norm
      FROM parking_vehicles p
      WHERE p.vehicule_id IS NULL
        AND p.immatriculation IS NOT NULL
        AND btrim(p.immatriculation) <> ''
    )
    INSERT INTO vehicules (agence_id, immatriculation, marque, modele, version, couleur,
                           numero_chassis, statut_immobilisation, notes)
    SELECT DISTINCT ON (c.agence_id, c.immat_norm)
           c.agence_id, btrim(c.immatriculation), c.marque, c.modele, c.version, c.couleur,
           c.vin,
           CASE c.statut
             WHEN 'EN_PARKING' THEN 'en_reception'
             WHEN 'EN_ATTENTE_DEVIS' THEN 'attente_validation_client'
             WHEN 'EN_ATTENTE_DIAGNOSTIC' THEN 'en_diagnostic'
             WHEN 'EN_ATTENTE_PIECE' THEN 'attente_piece_locale'
             WHEN 'EN_TRAVAUX' THEN 'en_reparation'
             WHEN 'TERMINE_A_RECUPERER' THEN 'terminee_client_non_venu'
             WHEN 'SORTI' THEN 'sorti'
             ELSE NULL
           END,
           'Créé depuis le registre parking (Lot 1) — n° ' || c.num_registre
    FROM candidats c
    ORDER BY c.agence_id, c.immat_norm, c.num_registre
    RETURNING id
  `);
  console.log(`Véhicules canoniques créés : ${crees.length}.`);

  // 3. Relier : les canons créés au 2 existent maintenant.
  await lier("Lien après création");

  // 4. Véhicules SANS plaque (migration 0011 rend la colonne nullable).
  //
  //    La plaque ne peut plus servir de clé d'appariement : on grave donc dans
  //    les notes un marqueur `parking_id=<id>`, stable et relisible. Il sert
  //    à la fois d'clé d'IDEMPOTENCE (on ne recrée pas si le marqueur existe)
  //    et de clé de LIAISON (on retrouve le véhicule depuis la ligne parking).
  //    Aucun identifiant de plaque n'est inventé.
  const sansPlaque = await db.unsafe(`
    WITH candidats AS (
      SELECT p.*
      FROM parking_vehicles p
      WHERE p.vehicule_id IS NULL
        AND (p.immatriculation IS NULL OR btrim(p.immatriculation) = '')
        AND NOT EXISTS (
          SELECT 1 FROM vehicules v
          WHERE v.notes LIKE '%parking_id=' || p.id || '%'
        )
    )
    INSERT INTO vehicules (agence_id, immatriculation, marque, modele, version, couleur,
                           numero_chassis, statut_immobilisation, notes)
    SELECT c.agence_id, NULL, c.marque, c.modele, c.version, c.couleur,
           c.vin,
           CASE c.statut
             WHEN 'EN_PARKING' THEN 'en_reception'
             WHEN 'EN_ATTENTE_DEVIS' THEN 'attente_validation_client'
             WHEN 'EN_ATTENTE_DIAGNOSTIC' THEN 'en_diagnostic'
             WHEN 'EN_ATTENTE_PIECE' THEN 'attente_piece_locale'
             WHEN 'EN_TRAVAUX' THEN 'en_reparation'
             WHEN 'TERMINE_A_RECUPERER' THEN 'terminee_client_non_venu'
             WHEN 'SORTI' THEN 'sorti'
             ELSE NULL
           END,
           'Créé depuis le registre parking (Lot 1) — n° ' || c.num_registre
           || ' — sans immatriculation relevée [parking_id=' || c.id || ']'
    FROM candidats c
    RETURNING id
  `);
  console.log(`Véhicules sans immatriculation créés : ${sansPlaque.length}.`);

  const liesSansPlaque = await db.unsafe(`
    UPDATE parking_vehicles p
    SET vehicule_id = v.id, updated_at = now()
    FROM vehicules v
    WHERE p.vehicule_id IS NULL
      AND (p.immatriculation IS NULL OR btrim(p.immatriculation) = '')
      AND v.agence_id = p.agence_id
      AND v.notes LIKE '%parking_id=' || p.id || '%'
  `);
  console.log(`Lignes parking sans plaque liées : ${liesSansPlaque.count}.`);

  const stats = await db`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE vehicule_id IS NOT NULL)::int AS lies,
           count(*) FILTER (WHERE vehicule_id IS NULL)::int AS orphelines
    FROM parking_vehicles
  `;
  const s = stats[0];
  console.log(
    `Résultat : ${s.lies}/${s.total} ligne(s) liées${s.orphelines ? ` (${s.orphelines} encore orpheline(s))` : " — toutes liées"}.`,
  );
  await db.end({ timeout: 5 });
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});
