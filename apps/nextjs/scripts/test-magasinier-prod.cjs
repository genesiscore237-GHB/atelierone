const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";

(async () => {
  const c = new Client({ connectionString: DSN });
  await c.connect();
  const suffix = Date.now().toString(36);
  const outilCode = `OUT-MAG-${suffix}`;
  const outilTitre = `Clé dynamométrique mag ${suffix}`;
  const consTitre = `Huile vidange mag ${suffix}`;
  const consCode = `CON-MAG-${suffix}`;
  await c.query("DELETE FROM stocks WHERE produit_id IN (SELECT id FROM produits WHERE code_article LIKE $1)", [`OUT-MAG-%`]);
  await c.query("DELETE FROM prets_outils WHERE outil_id IN (SELECT id FROM produits WHERE code_article LIKE $1)", [`OUT-MAG-%`]);
  await c.query("DELETE FROM mouvements_stock WHERE produit_id IN (SELECT id FROM produits WHERE code_article LIKE $1)", [`OUT-MAG-%`]);
  await c.query("DELETE FROM produits WHERE code_article LIKE $1", ["OUT-MAG-%"]);
  const uniteBase = (await c.query("SELECT id FROM unites_mesure LIMIT 1")).rows[0]?.id;
  const unites = [{ unite_id: String(uniteBase), facteur_conversion: 1, est_unite_base: true, est_unite_vente_defaut: true, est_unite_achat_defaut: true }];
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
  const EMP003 = 13; // Tôlier apprenti

  // ── 1. Enregistrement outil + consommable (type OUTIL / CONSOMMABLE) ──
  const ro = await trpcPost("catalog.create", { titre: outilTitre, typeProduit: "OUTIL", codeArticle: outilCode, designationCourte: outilTitre, statut: "actif", unites });
  const outilId = Number(ro[0]?.result?.data?.json?.id);
  check("Outil enregistré (bonnes pratiques : code + titre)", !!outilId, ro[0]?.error?.json?.message);
  const rc = await trpcPost("catalog.create", { titre: consTitre, typeProduit: "CONSOMMABLE", codeArticle: consCode, designationCourte: consTitre, statut: "actif", unites });
  const consId = Number(rc[0]?.result?.data?.json?.id);
  check("Consommable huile enregistré", !!consId, rc[0]?.error?.json?.message);
  const c2 = new Client({ connectionString: DSN });
  await c2.connect();
  await c2.query("INSERT INTO stocks (agence_id, produit_id, emplacement_id, quantite, quantite_reservee) VALUES (1, $1, 2, 3, 0)", [outilId]);
  await c2.query("INSERT INTO stocks (agence_id, produit_id, emplacement_id, quantite, quantite_reservee) VALUES (1, $1, 2, 10, 0)", [consId]);
  await c2.end();

  // ── 2. L2 — recherche produit serveur (catalog.listProducts avec query) ──
  const lp = await trpcGet("catalog.listProducts", { query: outilTitre, limit: 500 });
  const found = (lp[0]?.result?.data?.json?.items ?? []).filter((p) => String(p.id) === String(outilId));
  check("Recherche produit serveur : l'outil est trouvé par query", found.length === 1, "n=" + found.length);

  // ── 3. C — chercherAvantCommander : stock + niveau ──
  const cac = await trpcGet("stock.chercherAvantCommander", { q: outilTitre, type: "TOUS" });
  const row = (cac[0]?.result?.data?.json ?? []).find((p) => String(p.id) === String(outilId));
  check("Chercher avant commander : produit trouvé avec stock 3", !!row && Number(row.stockTotal) === 3 && row.disponible === 3, JSON.stringify(row));
  check("Niveau stock correct (faible : 3 < seuil 5)", row?.niveau === "faible", row?.niveau);

  // ── 4. Prêt avec date de retour prévue + détection du retard ──
  const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const pret = await trpcPost("outillage.preter", { outilId, technicienId: EMP003, motif: "Vidange camion", dateRetour: hier });
  const pretId = pret[0]?.result?.data?.json?.id;
  check("Prêt avec date de retour prévue (hier)", !!pretId, pret[0]?.error?.json?.message);
  const pretsEnCours = await trpcGet("outillage.pretsEnCours", {});
  const pretRow = (pretsEnCours[0]?.result?.data?.json ?? []).find((p) => p.id === pretId);
  check("Prêt détecté EN RETARD (retour prévu dépassé)", !!pretRow?.enRetard && pretRow?.joursEcoules >= 0, JSON.stringify(pretRow));

  // ── 5. Retour avec état ENDOMMAGE (contrôle du retour) ──
  const ret1 = await trpcPost("outillage.retourner", { pretId, etatRetour: "ENDOMMAGE", remarque: "Mâchoire faussée" });
  check("Retour avec état ENDOMMAGE accepté", !ret1[0]?.error, ret1[0]?.error?.json?.message);
  const histo = await trpcGet("outillage.historiquePrets", { limit: 5 });
  const h1 = (histo[0]?.result?.data?.json ?? []).find((p) => p.id === pretId);
  check("Historique : ENDOMMAGE + remarque tracés", h1?.etatRetour === "ENDOMMAGE" && h1?.remarque === "Mâchoire faussée" && !h1?.actif, JSON.stringify(h1));

  // ── 6. Retour PERDU (perte enregistrée) ──
  const pret2 = await trpcPost("outillage.preter", { outilId, technicienId: EMP003 });
  const pret2Id = pret2[0]?.result?.data?.json?.id;
  const ret2 = await trpcPost("outillage.retourner", { pretId: pret2Id, etatRetour: "PERDU", remarque: "Non rapporté" });
  check("Retour PERDU accepté (perte d'outil)", !ret2[0]?.error, ret2[0]?.error?.json?.message);
  const histo2 = await trpcGet("outillage.historiquePrets", { limit: 5 });
  check("Historique : PERDU tracé", (histo2[0]?.result?.data?.json ?? []).some((p) => p.id === pret2Id && p.etatRetour === "PERDU"), "PERDU absent");

  // ── 7. C — sortirPourUsage : « Utiliser » décrèmente + mouvement tracé ──
  const sortie = await trpcPost("stock.sortirPourUsage", { produitId: consId, quantite: 4, motif: "Utilisation sur vidange — matériel du garage" });
  check("Sortie pour usage OK (10 → 6)", !sortie[0]?.error && sortie[0]?.result?.data?.json?.stockApres === 6, JSON.stringify(sortie[0]?.result?.data?.json));
  const cac2 = await trpcGet("stock.chercherAvantCommander", { q: consTitre, type: "TOUS" });
  const consRow = (cac2[0]?.result?.data?.json ?? []).find((p) => String(p.id) === String(consId));
  check("Stock mis à jour immédiatement (6)", Number(consRow?.stockTotal) === 6, "stock=" + consRow?.stockTotal);
  const mvts = await trpcGet("stock.getMouvements", { produitId: consId, limit: 5 });
  const cMvt = new Client({ connectionString: DSN });
  await cMvt.connect();
  const mvtRow = (await cMvt.query("SELECT type, sens, quantite, document_lie, motif FROM mouvements_stock WHERE produit_id=$1 ORDER BY id DESC LIMIT 1", [consId])).rows[0];
  await cMvt.end();
  check("Mouvement tracé (SORTIE_OR hors OR, référence UTILISATION_INTERNE)", !!mvtRow && mvtRow.sens === "S" && Number(mvtRow.quantite) === 4 && (mvtRow.document_lie ?? "") === "UTILISATION_INTERNE", JSON.stringify(mvtRow));

  // ── 8. Sortie impossible si stock insuffisant ──
  const trop = await trpcPost("stock.sortirPourUsage", { produitId: consId, quantite: 100, motif: "Test stock insuffisant" });
  check("Sortie refusée si stock insuffisant", !!trop[0]?.error, trop[0]?.error?.json?.message);

  // ── 9. Pages 200 ──
  for (const p of ["/dashboard/stock/chercher-avant-commander", "/dashboard/stock/alertes", "/dashboard/stock/outillage"]) {
    const r = await http(p);
    check(`Page ${p} (200)`, r.status === 200, "status=" + r.status);
  }

  // ── 10. Nettoyage ──
  const c3 = new Client({ connectionString: DSN });
  await c3.connect();
  await c3.query("DELETE FROM stocks WHERE produit_id IN (SELECT id FROM produits WHERE code_article LIKE $1)", [`OUT-MAG-%`]);
  await c3.query("DELETE FROM prets_outils WHERE outil_id IN (SELECT id FROM produits WHERE code_article LIKE $1)", [`OUT-MAG-%`]);
  await c3.query("DELETE FROM mouvements_stock WHERE produit_id IN (SELECT id FROM produits WHERE code_article LIKE $1)", [`OUT-MAG-%`]);
  await c3.query("DELETE FROM produits WHERE code_article LIKE $1", ["OUT-MAG-%"]);
  await c3.end();

  console.log(`\nRÉSULTAT MAGASINIER PROD : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });