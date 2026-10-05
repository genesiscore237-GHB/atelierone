const dotenv = require("dotenv");
dotenv.config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");
const c = new PrismaClient();
(async () => {
  const rows = await c.produitVariantes.findMany({ take: 6, select: { id: true, libelle: true }, orderBy: { id: "asc" } });
  console.log(rows.map((x) => x.id + ":" + (x.libelle || "").slice(0, 40)).join("\n"));
  const arts = await c.produits.findMany({ take: 5, select: { id: true, designation: true }, orderBy: { id: "asc" } });
  console.log("ARTICLES");
  console.log(arts.map((x) => x.id + ":" + (x.designation || "").slice(0, 40)).join("\n"));
  await c.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });