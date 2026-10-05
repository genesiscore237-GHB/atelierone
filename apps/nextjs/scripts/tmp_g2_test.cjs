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

  // 1. Création d'un article PIECE avec attributs + 2 variantes (GF1 : niveaux)
  const cree = await post("articles.createArticle", {
    designation: "TEST Plaquette avant RAV4",
    typeProduit: "PIECE",
    etatProduitDefaut: "NEUF",
    origineProduitDefaut: "AFTERMARKET",
    attributs: [{ cle: "epaisseur", valeur: "18", unite: "mm", typeAttribut: "NOMBRE" }],
    variantes: [
      { marque: "Bosch", referencePrincipale: "0986AF1234", referenceFabricant: "0986AF1234", conditionnement: "jeu de 4", prixAchat: 30000, prixVente: 45000, stockInitial: 5, positionEssieu: "AVANT", positionCote: "LES_DEUX" },
      { marque: "Brembo", referencePrincipale: "P85001", referenceFabricant: "P85001", conditionnement: "jeu de 4", prixAchat: 34000, prixVente: 52000, stockInitial: 3, positionEssieu: "AVANT" },
    ],
  });
  console.log("1. createArticle PIECE:", JSON.stringify(cree));

  // 2. GF1 : tentative de créer un "exemplaire" de pièce → doit échouer 400
  try {
    await post("articles.addVariante", { articleId: cree.articleId, variante: { marque: "Test", typeOutil: "INDIVIDUEL", etatEquipement: "NEUF" } });
    console.log("2. GF1 PIÈCE+exemplaire: NON BLOQUÉ ❌");
  } catch (e) {
    console.log("2. GF1 PIÈCE+exemplaire bloqué ✅:", e.message);
  }

  // 3. Création d'un article OUTIL avec 2 exemplaires
  const outil = await post("articles.createArticle", {
    designation: "TEST Clé dynamométrique 40-200",
    typeProduit: "OUTIL",
    variantes: [
      { marque: "FACOM", referencePrincipale: "S.208-200", referenceFabricant: "S.208-200", typeOutil: "INDIVIDUEL", numeroSerie: "SN-12345", etatEquipement: "NEUF" },
      { marque: "FACOM", referencePrincipale: "S.208-200B", referenceFabricant: "S.208-200B", typeOutil: "INDIVIDUEL", numeroSerie: "SN-12346", etatEquipement: "BON" },
    ],
  });
  console.log("3. createArticle OUTIL:", JSON.stringify(outil));

  // 4. GF1 : tentative de vendre un outil (prixVente) → doit échouer 400
  try {
    await post("articles.addVariante", { articleId: outil.articleId, variante: { marque: "X", referenceFabricant: "Y", typeOutil: "JEU", prixVente: 1000 } });
    console.log("4. GF1 OUTIL+prixVente: NON BLOQUÉ ❌");
  } catch (e) {
    console.log("4. GF1 OUTIL+prixVente bloqué ✅:", e.message);
  }

  // 5. addCompatibilite POSITIVE + NEGATIVE
  await post("articles.addCompatibilite", { articleId: cree.articleId, compat: { typeCompat: "POSITIVE", marque: "Toyota", modele: "RAV4", anneeDe: 2016, anneeA: 2018, motorisation: "2.0 essence", position: "Essieu avant" } });
  await post("articles.addCompatibilite", { articleId: cree.articleId, compat: { typeCompat: "NEGATIVE", marque: "Toyota", modele: "RAV4", version: "XA50", restriction: undefined } });
  console.log("5. Compat POSITIVE + NEGATIVE ajoutées ✅");

  // 6. addReference secondaire (EAN) sur la variante Bosch
  const variantes = (await get("articles.getArticle", { id: cree.articleId })).variantes;
  const bosch = variantes.find((v) => v.referencePrincipale === "0986AF1234");
  await post("articles.addReference", { varianteId: bosch.id, typeRef: "EAN", valeur: "4001234567890" });
  console.log("6. Référence EAN ajoutée ✅");

  // 7. Supersession : ancienne réf → nouvelle
  await post("articles.addSupersession", { ancienneReference: "0986AF9999", nouvelleVarianteId: bosch.id, nouvelleReference: "0986AF1234", fabricant: "Bosch", motif: "Nouvelle génération" });
  const sups = await get("articles.detecterDoublons", { reference: "0986AF9999" });
  console.log("7. Supersession détectée ✅:", JSON.stringify(sups.supersessions[0]?.message ?? "AUCUNE"));

  // 8. Substitution Bosch → Brembo
  const brembo = variantes.find((v) => v.referencePrincipale === "P85001");
  await post("articles.addSubstitution", { varianteAId: bosch.id, varianteBId: brembo.id, niveauConfiance: "TECHNIQUE", motif: "Équivalent technique" });
  console.log("8. Substitution ajoutée ✅");

  // 9. detecterDoublons sur la référence exacte
  const dbl = await get("articles.detecterDoublons", { reference: "0986af1234" });
  console.log("9. detecterDoublons exact:", dbl.exacts.length, "exact(s) —", dbl.exacts[0]?.titre ?? "aucun");

  // 10. stockEtats (physique 5, disponible)
  const etats = await get("articles.stockEtats", { varianteId: bosch.id, besoin: 2 });
  console.log("10. stockEtats:", JSON.stringify({ physique: etats.physique, disponible: etats.disponible, enCommande: etats.enCommande, suggestion: etats.suggestion }));

  // 11. verifierAvantCommande (besoin 2 ≤ dispo 5 → commande inutile)
  const vac = await get("articles.verifierAvantCommande", { reference: "0986AF1234", besoin: 2 });
  console.log("11. verifierAvantCommande:", vac.decision, "| candidats:", vac.candidats.length);

  // 12. recherche par véhicule
  const rech = await get("articles.recherche", { marqueVehicule: "Toyota", modeleVehicule: "RAV4" });
  console.log("12. recherche Toyota RAV4:", rech.length, "résultat(s) —", rech[0]?.titre, "| justification compat:", rech[0]?.justification?.compat);

  // 13. templates
  const tpls = await get("articles.listTemplates", {});
  console.log("13. templates:", tpls.length, "disponibles");
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });