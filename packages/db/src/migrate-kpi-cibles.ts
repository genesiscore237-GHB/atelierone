import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("cibles KPI atelier par défaut (migrate-kpi-cibles.ts)");

/**
 * LOT 3 — Cibles KPI (kpi_cibles) par défaut pour chaque agence.
 *
 * Sans cibles, tous les KPI de `atelierKpi.getSanteGarage` affichent
 * SANS_DATA (feu tricolore inutilisable). Ce script insère, pour chaque
 * agence, les 6 codes de cibles manquantes avec des valeurs de démarrage
 * raisonnables — modifiables ensuite par la Direction (`atelierKpi.updateCible`).
 *
 * Idempotent : ne touche jamais à une cible déjà existante.
 *
 * Usage : pnpm -F @atelierone/db migrate:kpi-cibles
 *         (invoqué par db:test-setup)
 */

const DEFAUTS: Array<{ code: string; cible: string; seuilOrange: string | null; seuilRouge: string | null; unite: string; sens: "HAUT" | "BAS" }> = [
  { code: "PONCTUALITE", cible: "90", seuilOrange: "75", seuilRouge: "60", unite: "%", sens: "HAUT" },
  { code: "FTQ", cible: "85", seuilOrange: "70", seuilRouge: "55", unite: "%", sens: "HAUT" },
  { code: "TAUX_RETOUR_SAV", cible: "5", seuilOrange: "10", seuilRouge: "15", unite: "%", sens: "BAS" },
  { code: "RAPIDITE_DIAG_JOURS", cible: "1", seuilOrange: "2", seuilRouge: "3", unite: "j", sens: "BAS" },
  { code: "FIABILITE_APPRO", cible: "90", seuilOrange: "75", seuilRouge: "60", unite: "%", sens: "HAUT" },
  { code: "SATISFACTION_CLIENT", cible: "4", seuilOrange: "3", seuilRouge: "2", unite: "/5", sens: "HAUT" },
];

(async () => {
  const db = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  console.log("=== LOT 3 — cibles KPI par défaut ===");
  try {
    const agences = await db<{ id: number }[]>`SELECT id FROM agences ORDER BY id`;
    let inserees = 0;
    for (const a of agences) {
      for (const d of DEFAUTS) {
        const existentes = await db<{ n: number }[]>`
          SELECT count(*)::int AS n FROM kpi_cibles WHERE agence_id = ${a.id} AND code = ${d.code}`;
        if ((existentes[0]?.n ?? 0) > 0) continue;
        await db`
          INSERT INTO kpi_cibles (agence_id, code, cible, seuil_orange, seuil_rouge, unite, sens)
          VALUES (${a.id}, ${d.code}, ${d.cible}, ${d.seuilOrange}, ${d.seuilRouge}, ${d.unite}, ${d.sens})`;
        inserees++;
      }
    }
    console.log(`OK — ${agences.length} agence(s), ${inserees} cible(s) insérée(s).`);
  } finally {
    await db.end();
  }
})().catch((err) => {
  console.error("[migrate-kpi-cibles] ECHEC :", err);
  process.exit(1);
});
