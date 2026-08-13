import postgres from "postgres";
const s = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/atelierone_erp";
const sql = postgres(s, { ssl: false, prepare: false });
(async () => {
  try {
    for (const t of ["categories", "niveaux", "classes", "matieres", "sous_systemes", "annees_scolaires", "ministeres", "fournisseurs", "unites_mesure_produits", "produits", "utilisateurs", "employes", "roles"]) {
      try {
        const r = await sql`select count(*) as n from ${sql(t)}`;
        console.log(t.padEnd(26), r[0].n);
      } catch (e) {
        console.log(t.padEnd(26), "ERR:", e.message.slice(0, 60));
      }
    }
  } catch (e) {
    console.log("ERR:", e.message);
  } finally {
    await sql.end();
  }
})();
