import "dotenv/config";
import { client } from "./client";

void (async () => {
  const rows = await client.unsafe<{ k: string; n: number }[]>(`
    SELECT 'sites' AS k, count(*)::int AS n FROM parking_sites
    UNION ALL SELECT 'zones', count(*)::int FROM parking_zones
    UNION ALL SELECT 'spots', count(*)::int FROM parking_spots
    UNION ALL SELECT 'vehicules', count(*)::int FROM parking_vehicles
    UNION ALL SELECT 'vehicules_positionnes', count(*)::int FROM parking_vehicles WHERE centre_x IS NOT NULL
    UNION ALL SELECT 'vehicules_dims_connues', count(*)::int FROM parking_vehicles WHERE longueur IS NOT NULL
  `);
  console.table(rows);
  const registres = await client.unsafe<{ num_registre: number }[]>(`SELECT num_registre FROM parking_vehicles ORDER BY num_registre`);
  console.log("registres insérés:", registres.map((x) => x.num_registre).join(","));
  const spotsParZone = await client.unsafe<{ zone: string; n: number }[]>(`
    SELECT z.code AS zone, count(*)::int AS n FROM parking_spots s JOIN parking_zones z ON z.id = s.zone_id GROUP BY z.code ORDER BY z.code
  `);
  console.log("spots par zone:");
  console.table(spotsParZone);
  await client.end().catch(() => {});
  process.exit(0);
})().catch(async (err) => {
  console.error(err);
  await client.end().catch(() => {});
  process.exit(1);
});