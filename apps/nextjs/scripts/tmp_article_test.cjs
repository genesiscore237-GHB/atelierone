const jar = [];
const capture = (r) => {
  for (const c of r.headers.getSetCookie()) {
    const n = c.split("=")[0];
    const v = c.split(";")[0];
    const i = jar.findIndex((e) => e.startsWith(n + "="));
    if (i >= 0) jar[i] = v;
    else jar.push(v);
  }
};
const get = async (path, input) => {
  const url = "http://localhost:3000/api/trpc/" + path + "?batch=1&input=" + encodeURIComponent(JSON.stringify({ 0: { json: input ?? {}, meta: { values: {} } } }));
  const r = await fetch(url, { headers: { cookie: jar.join("; ") } });
  const j = await r.json();
  if (j?.[0]?.error) throw new Error(JSON.stringify(j[0].error.message ?? j[0].error));
  return j?.[0]?.result?.data?.json;
};
const post = async (path, input) => {
  const url = "http://localhost:3000/api/trpc/" + path + "?batch=1";
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", cookie: jar.join("; ") }, body: JSON.stringify({ 0: { json: input ?? {}, meta: { values: {} } } }) });
  const j = await r.json();
  if (j?.[0]?.error) throw new Error(JSON.stringify(j[0].error.message ?? j[0].error));
  return j?.[0]?.result?.data?.json;
};
(async () => {
  const csrf = await fetch("http://localhost:3000/api/auth/csrf", { redirect: "manual" });
  capture(csrf);
  const { csrfToken } = await csrf.json();
  const body = new URLSearchParams({ csrfToken, email: "admin@gpj.cm", password: "admin123", totp: "", redirect: "false" });
  const cb = await fetch("http://localhost:3000/api/auth/callback/credentials", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.join("; ") }, body: body.toString(), redirect: "manual" });
  capture(cb);
  console.log("login:", jar.some((c) => c.startsWith("authjs.session-token=")) ? "OK" : "ECHEC");
  if (!jar.some((c) => c.startsWith("authjs.session-token="))) return;

  const unites = await get("catalog.listUnites", {});
  const unite = unites?.[0]?.id;
  const emplacements = await get("stock.listEmplacements", {});
  const emp = emplacements?.find((e) => e.code !== "BUREAU")?.id;

  const cree = await post("articles.createArticle", {
    designation: "TEST Plaquette de frein avant",
    typeProduit: "PIECE",
    variantes: [
      { marque: "Bosch", referenceFabricant: "BP1234", conditionnement: "jeu de 4", prixAchat: 30000, prixVente: 45000, uniteStockId: unite, stockInitial: 10, emplacementStockId: emp },
      { marque: "Brembo", referenceFabricant: "P85001", conditionnement: "jeu de 4", prixAchat: 34000, prixVente: 52000, uniteStockId: unite, stockInitial: 5, emplacementStockId: emp },
    ],
  });
  console.log("createArticle:", JSON.stringify(cree));
  const articleId = cree.articleId;

  const fiche = await get("articles.getArticle", { id: articleId });
  console.log("article:", fiche.article.designation, "| variantes:", fiche.variantes.length, "| stocks:", fiche.variantes.map((v) => v.stockTotal).join(","));

  const att = await post("articles.setAttributs", { articleId, attributs: [{ cle: "largeur", valeur: "140", unite: "mm" }, { cle: "epaisseur", valeur: "18", unite: "mm" }] });
  console.log("setAttributs:", JSON.stringify(att));

  const ref = await post("articles.addReferenceEquiv", { articleId, marque: "OEM Toyota", reference: "90915-YZZD2" });
  console.log("addReferenceEquiv:", JSON.stringify(ref));

  const comp = await post("articles.addCompatibilite", { articleId, compat: { marque: "Toyota", modele: "RAV4", anneeDe: 2016, anneeA: 2018, motorisation: "2.0 essence", position: "Essieu avant" } });
  console.log("addCompatibilite:", JSON.stringify(comp));

  const doc = await post("articles.addDocument", { articleId, type: "FICHE_TECHNIQUE", titre: "Fiche Bosch BP1234", url: "https://example.com/bp1234.pdf" });
  console.log("addDocument:", JSON.stringify(doc));

  const fiche2 = await get("articles.getArticle", { id: articleId });
  console.log("récap final — attributs:", fiche2.attributs.length, "| équivalences:", fiche2.referencesEquiv.length, "| compat:", fiche2.compatibilites.length, "| docs:", fiche2.documents.length);
  console.log("compat:", JSON.stringify(fiche2.compatibilites[0]));

  const liste = await get("articles.listArticles", { q: "TEST Plaquette" });
  console.log("listArticles:", liste.total, "résultat(s) —", liste.articles[0]?.designation, "| variantes:", liste.articles[0]?.nVariantes, "| stock:", liste.articles[0]?.stockTotal);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });