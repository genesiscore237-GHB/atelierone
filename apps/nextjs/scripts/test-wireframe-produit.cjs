const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";

(async () => {
  const c = new Client({ connectionString: DSN });
  await c.connect();
  const suffix = Date.now().toString(36);
  const code = `WF-${suffix}`;
  await c.query("DELETE FROM stocks WHERE produit_id IN (SELECT id FROM produits WHERE code_article LIKE $1)", [`WF-${suffix}`]);
  await c.query("DELETE FROM compatibilites_produits WHERE produit_id IN (SELECT id FROM produits WHERE code_article LIKE $1)", [`WF-${suffix}`]);
  await c.query("UPDATE produits SET is_active=false WHERE code_article LIKE $1", [`WF-${suffix}`]);
  const uniteBase = (await c.query("SELECT id FROM unites_mesure ORDER BY id LIMIT 1")).rows[0]?.id;
  const catArticle = (await c.query("SELECT id FROM categories WHERE code='G010101'")).rows[0]?.id; // Filtre à huile
  const fourn = (await c.query("SELECT id FROM fournisseurs ORDER BY id LIMIT 1")).rows[0]?.id;
  await c.end();
  const unites = [{ unite_id: String(uniteBase), facteur_conversion: 1, prix_achat: 1200, prix_vente: 3000, est_unite_achat_defaut: true, est_unite_vente_defaut: true, est_unite_base: true }];

  const jar = new Map();
  async function http(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    const ck = [...jar.entries()].map(([k, v]) => k + "=" + v).join("; ");
    if (ck) headers.cookie = ck;
    const res = await fetch(BASE + path, { ...opts, headers, redirect: "manual" });
    const scs = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
    for (const sc of scs) { const pair = sc.split(";")[0]; const i = pair.indexOf("="); if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1)); }
    return res;
  }
  async function trpcPost(path, body) {
    const r = await http("/api/trpc/" + path + "?batch=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ "0": { json: body } }) });
    return r.json();
  }
  async function trpcGet(path, body) {
    const enc = encodeURIComponent(JSON.stringify({ "0": { json: body } }));
    const r = await http("/api/trpc/" + path + "?batch=1&input=" + enc);
    return r.json();
  }
  const csrf = await (await http("/api/auth/csrf")).json();
  await http("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: BASE + "/dashboard" }),
  });

  // ── 1. Création complète conforme wireframe (référentiel 3 niveaux) ──
  const ro = await trpcPost("catalog.create", {
    typeProduit: "PIECE",
    titre: `Filtre à huile test ${suffix}`,
    codeArticle: code,
    codeBarre: `WFB-${suffix}`,
    designationCourte: `Filtre ${suffix}`,
    categorieId: String(catArticle), // G010101 = Filtre à huile (référentiel)
    marque: "Mann",
    referenceFabricant: "W712/92",
    refOem: "90915-YZZD1",
    classeAbc: "A",
    etat: "neuf",
    origineQualite: "AFTERMARKET",
    estCore: false,
    prixAchat: "1200",
    prixVente: "3000",
    tva: "19.25",
    fournisseurId: fourn ? String(fourn) : undefined,
    referenceFournisseur: "REF-FOURN-TEST",
    delaiFournisseur: 3,
    poidsKg: 0.25,
    dimensions: "15 x 10 x 10",
    garantieMois: 12,
    suiviSerie: true,
    suiviLot: true,
    seuilAlerte: 5,
    stockMaximum: 50,
    stockInitial: 20,
    emplacementStockId: 2,
    uniteBaseId: String(uniteBase),
    unites,
    compatibilites: [
      { marque: "Toyota", modele: "Corolla", anneeDe: 2015, anneeA: 2020, motorisation: "1.8 VVT-i" },
      { marque: "Toyota", modele: "Yaris", anneeDe: 2016, anneeA: 2021, motorisation: "1.5" },
    ],
  });
  const id = Number(ro[0]?.result?.data?.json?.id);
  check("Création wireframe complète (référentiel G010101)", !!id, ro[0]?.error?.json?.message);

  // ── 2. getById renvoie tout (compat, stock, champs wireframe) ──
  const g = await trpcGet("catalog.getById", { id: String(id) });
  const p = g[0]?.result?.data?.json;
  check("getById : classeAbc + poids + garantie + suivi", p?.classeAbc === "A" && Number(p?.poidsKg) === 0.25 && p?.garantieMois === 12 && p?.suiviSerie === true && p?.suiviLot === true, JSON.stringify(p).slice(0, 200));
  check("getById : 2 compatibilités véhicule", (p?.compatibilites ?? []).length === 2, "n=" + p?.compatibilites?.length);
  check("getById : stock total 20", Number(p?.stockTotal) === 20, "stock=" + p?.stockTotal);
  const c2 = new Client({ connectionString: DSN });
  await c2.connect();
  const mvt = (await c2.query("SELECT reference FROM mouvements_stock WHERE produit_id=$1 AND reference='STOCK-INITIAL' LIMIT 1", [id])).rows[0];
  check("Quantité initiale tracée (STOCK-INITIAL)", !!mvt, "mvt absent");
  const compatBd = (await c2.query("SELECT marque, modele FROM compatibilites_produits WHERE produit_id=$1 ORDER BY id", [id])).rows;
  check("Compatibilités persistées en base", compatBd.length === 2 && compatBd[0].marque === "Toyota", JSON.stringify(compatBd));

  // ── 3. RG-002 assoupli : huile CONSOMMABLE dans une famille PIECE acceptée ? (inverse : PIECE dans CONSOMMABLE) ──
  const catHuile = (await c2.query("SELECT id FROM categories WHERE code='G0301'")).rows[0]?.id; // Huiles moteur (CONSOMMABLE)
  const ro2 = await trpcPost("catalog.create", {
    typeProduit: "PIECE",
    titre: `Filtre dans famille huiles ${suffix}`,
    codeArticle: `WF2-${suffix}`,
    categorieId: String(catHuile), // famille CONSOMMABLE + produit PIECE → autorisé (assoupli)
    prixAchat: "500",
    prixVente: "1000",
    uniteBaseId: String(uniteBase),
    unites,
  });
  check("RG-002 assoupli : PIECE accepté dans famille CONSOMMABLE", !!ro2[0]?.result?.data?.json?.id, ro2[0]?.error?.json?.message);

  // ── 4. Prix obligatoires (validation UI) : le serveur accepte mais le wizard bloque — vérifions la création OUTIL prix 0 (serveur) ──
  const ro3 = await trpcPost("catalog.create", {
    typeProduit: "OUTIL",
    titre: `Outil wireframe ${suffix}`,
    codeArticle: `WF3-${suffix}`,
    categorieId: String((await c2.query("SELECT id FROM categories WHERE code='G13'")).rows[0]?.id),
    uniteBaseId: String(uniteBase),
    unites: [{ unite_id: String(uniteBase), facteur_conversion: 1, prix_achat: 0, prix_vente: 0, est_unite_achat_defaut: true, est_unite_vente_defaut: true, est_unite_base: true }],
  });
  check("Outil OUTIL prix 0 accepté (serveur, non vendu)", !!ro3[0]?.result?.data?.json?.id, ro3[0]?.error?.json?.message);

  // ── 5. Nettoyage (mouvements append-only → désactivation) ──
  await c2.query("DELETE FROM stocks WHERE produit_id IN (SELECT id FROM produits WHERE code_article LIKE $1)", [`WF-${suffix}`]);
  await c2.query("DELETE FROM compatibilites_produits WHERE produit_id IN (SELECT id FROM produits WHERE code_article LIKE $1)", [`WF-${suffix}`]);
  await c2.query("UPDATE produits SET is_active=false WHERE code_article LIKE $1", [`WF-${suffix}`]);
  await c2.end();

  console.log(`\nRÉSULTAT WIREFRAME PRODUIT : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });