import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";
import { normaliserTelephone } from "./tel-utils";

requireLocalOrForced("fusion des doublons de clients (dedup-clients.ts)");

/**
 * LOT R5 - Fusion des clients en double pour une même agence (E6).
 *
 * Un même client réel peut exister en plusieurs lignes `clients` quand il a
 * été recréé à la réception (recherche ratée, numéro saisi différemment).
 * Ce script fusionne ces doublons en conservant la fiche la plus ancienne
 * (id le plus petit, la « source de vérité » historique) et en répercutant
 * les références des doublons supprimés vers le survivant.
 *
 * Deux critères de doublon (détectés côté SQL via `normaliserTelephone`
 * appliqué en JS, puis regroupé) :
 *   1. même téléphone normalisé (ex. « 06 12 34 56 78 » ≡ « 0612345678 ») ;
 *   2. même nom (insensible casse/espaces) + même téléphone normalisé.
 *
 * Contrairement aux véhicules (R1), la fusion client doit :
 *   - REPORTER `codeClient` UNIQUE : le survivant garde son code ; le doublon
 *     est supprimé (pas de contrainte unique violée) ;
 *   - COMPLÉTER le survivant avec les champs vides du doublon (raison sociale,
 *     email, adresse…) — jamais écraser une valeur déjà renseignée ;
 *   - REPOINTER toutes les FK clients vers le survivant (vehicules,
 *     ordres_reparation, ventes, dettes, retours, contrats…).
 *
 * Idempotent. A exécuter APRÈS la migration 0005 (colonne clients_doublonnes)
 * pour que le marquage soit recalculé à la fin.
 *
 * Usage : pnpm -F @atelierone/db dedup:clients
 *         (invoqué par db:test-setup après drizzle-kit migrate)
 */

// Tables référençant un client (FK client_id / clientId). Exclut clients
// lui-même. Chaque table est mise à jour une à la fois, idempotente.
const COLONNES_REFERENCES: Array<{ table: string; colonne: string }> = [
  { table: "vehicules", colonne: "client_id" },
  { table: "ordres_reparation", colonne: "client_id" },
  { table: "ventes", colonne: "client_id" },
  { table: "dettes", colonne: "client_id" },
  { table: "retours", colonne: "client_id" },
  { table: "contrats_flottes", colonne: "client_id" },
  { table: "contrats_maintenance", colonne: "client_id" },
  { table: "client_relations", colonne: "client_source_id" },
  { table: "client_relations", colonne: "client_cible_id" },
  { table: "previsions_tresorerie", colonne: "client_id" },
];

// Champs « fiche » que l'on complète sur le survivant si le doublon a une
// valeur et le survivant non (complément, jamais écrasement — D3/RD4).
const CHAMPS_COMPLETABLES = [
  "prenom",
  "raison_sociale",
  "email",
  "telephone_secondaire",
  "whatsapp",
  "adresse",
  "ville",
  "niu_nif",
  "rccm",
  "notes",
];

type Groupe = { agenceId: number; cle: string; ids: number[] };

(async () => {
  const db = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  console.log("=== LOT R5 - fusion des doublons de clients ===");
  try {
    // 1. Récupère tous les clients actifs (non archivés) de toutes les agences
    //    et les groupe côté JS par téléphone normalisé (critère 1) puis par
    //    nom+téléphone (critère 2). On regroupe par agence : un même client
    //    peut exister dans deux agences distinctes (pas de fusion inter-agences).
    const rows = await db<
      Array<{ id: number; agenceId: number | null; nom: string; prenom: string | null; telephone: string | null }>
    >`SELECT id, agence_id AS "agenceId", nom, prenom, telephone
       FROM clients
      WHERE deleted_at IS NULL`;

    // Clé de regroupement : agence + téléphone normalisé (ou nom+tel si pas
    // de tel exploitable). On ne fusionne QUE si la clé est exploitable.
    const groupes = new Map<string, number[]>();
    for (const r of rows) {
      const tel = normaliserTelephone(r.telephone);
      // Critère fort : téléphone normalisé valide.
      let cle: string | null = tel ? `tel:${r.agenceId ?? 0}:${tel}` : null;
      // Critère secondaire : nom normalisé + tel (quand le tel existe déjà
      // dans un groupe mais le nom confirme). Inclus dans la même clé tel.
      if (!cle) {
        const nom = (r.nom ?? "").trim().toLowerCase().replace(/\s+/g, " ");
        if (tel && nom) cle = `tel:${r.agenceId ?? 0}:${tel}`;
      }
      if (!cle) continue;
      const arr = groupes.get(cle) ?? [];
      arr.push(r.id);
      groupes.set(cle, arr);
    }

    let totalFusions = 0;
    let totalGroupes = 0;
    for (const [cle, ids] of groupes) {
      if (ids.length < 2) continue;
      totalGroupes++;
      // Survivant = id le plus petit (fiche la plus ancienne).
      const sorted = [...ids].sort((a, b) => a - b);
      const [survivant, ...doublons] = sorted;
      for (const d of doublons) {
        // 1. Complète le survivant avec les champs vides du doublon.
        for (const champ of CHAMPS_COMPLETABLES) {
          await db.unsafe(
            `UPDATE clients s SET ${champ} = d.${champ}
               FROM clients d
              WHERE s.id = ${survivant} AND d.id = ${d}
                AND (d.${champ} IS NOT NULL AND d.${champ} <> '')
                AND (s.${champ} IS NULL OR s.${champ} = '')`,
          );
        }
        // 2. Reporte les références FK vers le survivant.
        for (const { table, colonne } of COLONNES_REFERENCES) {
          await db.unsafe(
            `UPDATE ${table} SET ${colonne} = ${survivant} WHERE ${colonne} = ${d}`,
          );
        }
        // 3. Supprime le doublon (soft-delete pour garder la trace d'audit).
        await db`UPDATE clients SET deleted_at = now(), updated_at = now() WHERE id = ${d}`;
        totalFusions++;
      }
      console.log(`  ${cle} : ${doublons.length} doublon(s) fusionné(s) vers #${survivant}`);
    }

    // 4. Recalcule le marquage clients_doublonnes (reste-t-il des doublons ?).
    const restants = await db<
      Array<{ agenceId: number | null; tel: string; ids: number[] }>
    >`SELECT agence_id AS "agenceId", telephone, array_agg(id) AS ids
         FROM clients
        WHERE deleted_at IS NULL
        GROUP BY agence_id, telephone
       HAVING count(*) > 1 AND telephone IS NOT NULL AND telephone <> ''`;
    await db`UPDATE clients SET clients_doublonnes = false WHERE clients_doublonnes = true`;
    for (const g of restants) {
      const ids: number[] = Array.isArray(g.ids) ? (g.ids as number[]) : [];
      if (ids.length > 1) {
        await db`UPDATE clients SET clients_doublonnes = true WHERE id = ANY(${ids}::int[])`;
      }
    }

    console.log(
      `OK — ${totalGroupes} groupe(s), ${totalFusions} ligne(s) fusionnée(s), ` +
        `${restants.length} groupe(s) restant(s) marqué(s) doublon(s).`,
    );
  } finally {
    await db.end();
  }
})().catch((err) => {
  console.error("[dedup-clients] ECHEC :", err);
  process.exit(1);
});
