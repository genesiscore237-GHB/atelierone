const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";

(async () => {
  const c = new Client({ connectionString: DSN });
  await c.connect();
  const suffix = Date.now().toString(36);
  const code = `CAT-${suffix}`;
  await c.query("DELETE FROM stocks WHERE produit_id IN (SELECT id FROM produits WHERE code_article=$1)", [code]);
  await c.query("DELETE FROM produits WHERE code_article=$1", [code]);
  const uniteBase = (await c.query("SELECT id, code FROM unites_mesure ORDER BY id LIMIT 1")).rows[0];
  const catPiece = (await c.query("SELECT id FROM categories WHERE type_branche='PIECE' LIMIT 1")).rows[0];
  await c.end();

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
  const csrf = await (await http("/api/auth/csrf")).json();
  await http("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: BASE + "/dashboard" }),
  });

  // 1. Pages du catalogue (200)
  for (const p of ["/dashboard/catalog", "/dashboard/catalog/produits/nouveau", "/dashboard/catalog/dashboard", "/dashboard/catalog/categories"]) {
    const r = await http(p);
    check(`Page ${p} (200)`, r.status === 200, "status=" + r.status);
  }

  // 2. Sous-nav du catalogue : vérifiée côté client par test-catalogue-ui.cjs (Playwright)

  // 3. Ajout rapide : payload type wizard (unité auto = première unité, sans saisie utilisateur)
  const ro = await trpcPost("catalog.create", {
    typeProduit: "PIECE",
    titre: `Création rapide ${suffix}`,
    codeArticle: code,
    categorieId: String(catPiece.id),
    prixVente: "2500",
    prixAchat: "1500",
    uniteBaseId: String(uniteBase.id),
    unites: [{ unite_id: String(uniteBase.id), facteur_conversion: 1, prix_achat: 1500, prix_vente: 2500, est_unite_achat_defaut: true, est_unite_vente_defaut: true, est_unite_base: true }],
  });
  const id = ro[0]?.result?.data?.json?.id;
  check("Création rapide pièce (unité auto) OK", !!id, ro[0]?.error?.json?.message);

  // 4. Création d'un OUTIL via le nouveau formulaire (type maintenant disponible)
  const ro2 = await trpcPost("catalog.create", {
    typeProduit: "OUTIL",
    titre: `Outil rapide ${suffix}`,
    codeArticle: `OUT-CAT-${suffix}`,
    uniteBaseId: String(uniteBase.id),
    unites: [{ unite_id: String(uniteBase.id), facteur_conversion: 1, prix_achat: 0, prix_vente: 0, est_unite_achat_defaut: true, est_unite_vente_defaut: true, est_unite_base: true }],
  });
  check("Création OUTIL via le formulaire (prix 0 forcé)", !!ro2[0]?.result?.data?.json?.id, ro2[0]?.error?.json?.message);

  // 5. Création SERVICE (main d'œuvre) avec prix
  const ro3 = await trpcPost("catalog.create", {
    typeProduit: "SERVICE",
    titre: `Heure atelier ${suffix}`,
    codeArticle: `SVC-CAT-${suffix}`,
    prixVente: "5000",
    unites: [{ unite_id: String(uniteBase.id), facteur_conversion: 1, prix_achat: 0, prix_vente: 5000, est_unite_achat_defaut: true, est_unite_vente_defaut: true, est_unite_base: true }],
  });
  check("Création SERVICE (main d'œuvre) OK", !!ro3[0]?.result?.data?.json?.id, ro3[0]?.error?.json?.message);

  // 6. Nettoyage
  const c2 = new Client({ connectionString: DSN });
  await c2.connect();
  await c2.query("DELETE FROM stocks WHERE produit_id IN (SELECT id FROM produits WHERE code_article LIKE $1)", [`CAT-${suffix}`]);
  await c2.query("DELETE FROM produits WHERE code_article LIKE $1", [`CAT-${suffix}`]);
  await c2.end();

  console.log(`\nRÉSULTAT CATALOGUE SIMPLIFIÉ : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });