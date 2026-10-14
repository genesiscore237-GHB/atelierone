import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("audit orphelins parking (audit-orphelins-parking.ts)");

/**
 * LOT 4 — Rapport d'audit des orphelins parking (NON DESTRUCTIF).
 *
 * « Ophelin » = `parking_vehicles` sans `vehicule_id` (le backfill Lot 1 ne
 * lie que les lignes immatriculées ; les lignes sans immat restent NULL par
 * conception — D3 « pas d'invention »). Ce script ne supprime ni ne modifie
 * rien : il produit un rapport lisible pour arbitrage manuel (Lot 4).
 *
 * Catégories :
 *   A. Lignes sans immatriculation (orphelins « par conception », candidats
 *      à une saisie manuelle d'immat ou à une suppression arbitrée).
 *   B. Lignes immatriculées mais non liées (anomalie — le backfill devrait
 *      les avoir appariées ; à investiguer).
 *   C. Véhicules non positionnés (site/zone/spot absents — panneau « À placer »).
 *   D. Alertes ouvertes par site.
 *   E. Synthèse globale (liés / non liés / taux).
 *
 * Usage : pnpm -F @atelierone/db audit:parking-orphelins
 *         (FORCEDATABASE=1 pour outrepasser la garde locale, ex. dump)
 */

(async () => {
  const db = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  console.log("=== LOT 4 — audit orphelins parking (lecture seule) ===\n");
  try {
    // E. Synthèse.
    const [syn] = await db<{ total: number; lies: number; sans_immat: number; immat_non_lies: number }[]>`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE vehicule_id IS NOT NULL)::int AS lies,
        count(*) FILTER (WHERE vehicule_id IS NULL AND (immatriculation IS NULL OR btrim(immatriculation) = ''))::int AS sans_immat,
        count(*) FILTER (WHERE vehicule_id IS NULL AND immatriculation IS NOT NULL AND btrim(immatriculation) <> '')::int AS immat_non_lies
      FROM parking_vehicles`;
    console.log(`E. Synthèse : ${syn?.total ?? 0} ligne(s) parking`);
    console.log(`   liées au registre     : ${syn?.lies ?? 0}`);
    console.log(`   orphelins sans immat  : ${syn?.sans_immat ?? 0}  (catégorie A — par conception D3)`);
    console.log(`   immat non liées       : ${syn?.immat_non_lies ?? 0}  (catégorie B — anomalie ?)`);

    // A. Sans immatriculation.
    const a = await db<{ id: number; num_registre: number; statut: string; site: string | null }[]>`
      SELECT pv.id, pv.num_registre, pv.statut, ps.nom AS site
      FROM parking_vehicles pv
      LEFT JOIN parking_sites ps ON ps.id = pv.site_id
      WHERE pv.vehicule_id IS NULL AND (pv.immatriculation IS NULL OR btrim(pv.immatriculation) = '')
      ORDER BY pv.num_registre`;
    console.log(`\nA. Orphelins sans immatriculation (${a.length}) :`);
    for (const r of a) {
      console.log(`   #${r.num_registre} — statut ${r.statut}${r.site ? ` — ${r.site}` : ""}`);
    }

    // B. Immatriculées mais non liées.
    const bSafe = await db<{ id: number; num_registre: number; immatriculation: string }[]>`
      SELECT id, num_registre, immatriculation
      FROM parking_vehicles
      WHERE vehicule_id IS NULL AND immatriculation IS NOT NULL AND btrim(immatriculation) <> ''
      ORDER BY num_registre`;
    console.log(`\nB. Immatriculées non liées (${bSafe.length}) — devraient être apparées par le backfill :`);
    for (const r of bSafe) {
      console.log(`   #${r.num_registre} — ${r.immatriculation}`);
    }

    // C. Non positionnés.
    const c = await db<{ n: number }[]>`
      SELECT count(*)::int AS n FROM parking_vehicles
      WHERE site_id IS NULL OR zone_id IS NULL OR spot_id IS NULL OR centre_x IS NULL`;
    console.log(`\nC. Véhicules non positionnés sur le plan : ${c[0]?.n ?? 0}`);

    // D. Alertes ouvertes par site (via le véhicule — parking_alerts n'a pas de site_id).
    const d = await db<{ site: string | null; n: number }[]>`
      SELECT ps.nom AS site, count(*)::int AS n
      FROM parking_alerts pa
      JOIN parking_vehicles pv ON pv.id = pa.vehicle_id
      LEFT JOIN parking_sites ps ON ps.id = pv.site_id
      WHERE pa.statut = 'OUVERTE'
      GROUP BY ps.nom ORDER BY n DESC`;
    console.log(`\nD. Alertes ouvertes par site :`);
    if (d.length === 0) console.log("   (aucune)");
    for (const r of d) console.log(`   ${r.site ?? "(sans site)"} : ${r.n}`);

    console.log("\n=== Fin de rapport — aucune donnée modifiée ===");
  } finally {
    await db.end();
  }
})().catch((err) => {
  console.error("[audit-orphelins-parking] ECHEC :", err);
  process.exit(1);
});
