const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await c.connect();
  const u = await c.query(`SELECT id, email, role_id, agence_id FROM utilisateurs WHERE email='admin@gpj.cm'`);
  if (!u.rows.length) throw new Error("admin not found");
  const a = u.rows[0];
  const perms = await c.query(
    `SELECT p.code FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = $1 ORDER BY p.code`,
    [a.role_id]
  );
  const codes = perms.rows.map((x) => x.code);
  const wanted = ["achats.commander", "stock.modifier", "stock.consulter", "stock.utiliser", "stock.gerer", "references.consulter", "references.modifier"];
  console.log("role_id:", a.role_id, "agence:", a.agence_id);
  console.log("TOTAL PERMS:", codes.length);
  for (const w of wanted) console.log("  " + w + ":", codes.includes(w));
  console.log("SAMPLE:", codes.slice(0, 40).join(", "));
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });