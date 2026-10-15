import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";
import { normaliserImmat } from "./immat-utils";

requireLocalOrForced("fusion des doublons d'immatriculation (dedup-vehicules-immat.ts)");

/**
 * LOT R1 — Fusion des véhicules en double pour une même plaque (même agence).
 *
 * Une même plaque peut exister en plusieurs lignes `vehicules` quand elle a
 * été saisie différemment (« AB-123-CD » vs « ab 123 cd »). Ce script fusionne
 * ces doublons en conservant la fiche la plus ancienne (id le plus petit, la
 * « source de vérité » historique) et en répercutant les références des
 * doublons supprimés vers le survivant :
 *   - ordres_reparation.vehicule_id
 *   - parking_vehicles.vehicule_id
 *   - contrats_flottes.vehicule_id
 *   - contrats_maintenance.vehicule_id
 *   - mouvements_stock.vehicule_id
 *   - achats.vehicule_id
 * Les doublons n'ont jamais de client propre (on ne réassigne pas de client
 * pour éviter d'écraser la propriété) : la clause de fusion ne touche pas à
 * `client_id` du survivant.
 *
 * Idempotent.
 *
 * ORDRE D'EXECUTION REAL, corrige le 2026-10-15.
 *
 * Ce fichier disait « a executer AVANT la migration 0004 ». C'est faux et
 * impossible a suivre : le backfill ecrit dans `immat_norm`, colonne que la
 * migration 0004 est censee creer. Sur une base ou 0004 n'a pas encore ete
 * appliquee, le script echoue sur `la colonne immat_norm n'existe pas` —
 * ce qui est exactement ce qui s'est produit sur la base de travail.
 *
 * L'ordre correct est :
 *   1. `0004_vehicule_immat_unique.sql`  (cree `immat_norm` + index)
 *   2. ce script                        (backfill + fusion des doublons)
 *
 * L'index unique est alors cree sur des valeurs toutes-NULL — donc inerte —
 * et le backfill vient le remplir juste apres, sous la protection de la
 * contrainte. Sans le backfill, la protection n'existerait pas : c'est lui
 * qui donne toute sa valeur a l'unicite.
 *
 * Usage : pnpm -F @atelierone/db dedup:vehicules-immat
 */

const COLONNES_REFERENCES: Array<{ table: string; colonne: string }> = [
  { table: "ordres_reparation", colonne: "vehicule_id" },
  { table: "parking_vehicles", colonne: "vehicule_id" },
  { table: "contrats_flottes", colonne: "vehicule_id" },
  { table: "contrats_maintenance", colonne: "vehicule_id" },
  { table: "mouvements_stock", colonne: "vehicule_id" },
  { table: "achats", colonne: "vehicule_id" },
];

type Groupe = { agenceId: number; immatNorm: string; ids: number[] };

(async () => {
  const db = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  console.log("=== LOT R1 — fusion des doublons d'immatriculation ===");
  try {
    // 1. Remplit immat_norm pour toutes les plaques renseignées (backfill).
    await db`
      UPDATE vehicules
      SET immat_norm = upper(regexp_replace(btrim(immatriculation), '\s+', '', 'g'))
      WHERE immatriculation IS NOT NULL
        AND btrim(immatriculation) <> ''
        AND (immat_norm IS NULL
             OR immat_norm <> upper(regexp_replace(btrim(immatriculation), '\s+', '', 'g')))`;
    console.log("Backfill immat_norm effectué.");

    // 2. Regroupe les doublons (même agence + même plaque normalisée, >1 ligne).
    const groupes = await db<Groupe[]>`
      SELECT agence_id AS "agenceId",
             immat_norm AS "immatNorm",
             array_agg(id ORDER BY id) AS ids
      FROM vehicules
      WHERE immat_norm IS NOT NULL
      GROUP BY agence_id, immat_norm
      HAVING count(*) > 1
      ORDER BY agence_id, immat_norm`;

    if (!groupes.length) {
      console.log("OK — aucun doublon d'immatriculation détecté.");
      return;
    }

    let totalFusions = 0;
    for (const g of groupes) {
      const [survivant, ...doublons] = g.ids;
      for (const d of doublons) {
        // Répercute les références vers le survivant, une table à la fois.
        for (const { table, colonne } of COLONNES_REFERENCES) {
          await db.unsafe(
            `UPDATE ${table} SET ${colonne} = ${survivant} WHERE ${colonne} = ${d}`,
          );
        }
        await db`DELETE FROM vehicules WHERE id = ${d}`;
        totalFusions++;
      }
      console.log(`  agence ${g.agenceId} / ${g.immatNorm} : ${doublons.length} doublon(s) fusionné(s) vers #${survivant}`);
    }
    console.log(`OK — ${groupes.length} groupe(s), ${totalFusions} ligne(s) fusionnée(s).`);
  } finally {
    await db.end();
  }
})().catch((err) => {
  console.error("[dedup-vehicules-immat] ECHEC :", err);
  process.exit(1);
});
