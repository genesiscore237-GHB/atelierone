const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";

(async () => {
  const c = new Client({ connectionString: DSN });
  await c.connect();
  const suffix = Date.now().toString(36);
  const code = `GAR-${suffix}`;
  await c.query("DELETE FROM stocks WHERE produit_id IN (SELECT id FROM produits WHERE code_article LIKE $1)", [`GAR-${suffix}`]);
  await c.query("DELETE FROM prets_outils WHERE outil_id IN (SELECT id FROM produits WHERE code_article LIKE $1)", [`GAR-${suffix}`]);
  await c.query("DELETE FROM demandes_commande WHERE designation LIKE $1", [`DEM-${suffix}%`]);
  await c.query("DELETE FROM produits WHERE code_article LIKE $1", [`GAR-${suffix}`]);
  const uniteBase = (await c.query("SELECT id FROM unites_mesure ORDER BY id LIMIT 1")).rows[0]?.id;
  const catPiece = (await c.query("SELECT id FROM categories WHERE type_branche='PIECE' LIMIT 1")).rows[0]?.id;
  const emp13 = 13;
  await c.end();
  const unites = [{ unite_id: String(uniteBase), facteur_conversion: 1, prix_achat: 1000, prix_vente: 2500, est_unite_achat_defaut: true, est_unite_vente_defaut: true, est_unite_base: true }];
  const demain = (new Date(Date.now() + 86400000)).toISOString().slice(0, 10);

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

  // ── 1. Création pièce avec QUANTITÉ INITIALE → directement en stock ──
  const ro = await trpcPost("catalog.create", {
    typeProduit: "PIECE",
    titre: `Pièce garage ${suffix}`,
    codeArticle: code,
    categorieId: String(catPiece),
    prixAchat: "1000",
    prixVente: "2500",
    stockInitial: 12,
    emplacementStockId: 2,
    uniteBaseId: String(uniteBase),
    unites,
  });
  const id = Number(ro[0]?.result?.data?.json?.id);
  check("Création avec quantité initiale (12)", !!id, ro[0]?.error?.json?.message);
  const cac = await trpcGet("stock.chercherAvantCommander", { q: `Pièce garage ${suffix}`, type: "TOUS" });
  const row = (cac[0]?.result?.data?.json ?? []).find((p) => Number(p.id) === id);
  check("Produit immédiatement en stock (12)", row && Number(row.stockTotal) === 12, "stock=" + row?.stockTotal);
  const c2 = new Client({ connectionString: DSN });
  await c2.connect();
  const mvt = (await c2.query("SELECT type, reference, motif, sens FROM mouvements_stock WHERE produit_id=$1 AND reference='STOCK-INITIAL' LIMIT 1", [id])).rows[0];
  check("Mouvement tracé (STOCK-INITIAL, entrée)", !!mvt && mvt.sens === "E", JSON.stringify(mvt));

  // ── 2. + Stock (anti-doublon / ajout rapide) ──
  const add = await trpcPost("stock.ajouterStock", { produitId: id, quantite: 5, emplacementId: 2, motif: "Pièces retrouvées au garage" });
  check("AjouterStock : 12 → 17", !add[0]?.error && add[0]?.result?.data?.json?.stockApres === 17, JSON.stringify(add[0]?.result?.data?.json));

  // ── 3. Outillage : date retour prévue OBLIGATOIRE ──
  const ro2 = await trpcPost("catalog.create", { typeProduit: "OUTIL", titre: `Outil garage ${suffix}`, codeArticle: `GAR-OUT-${suffix}`, uniteBaseId: String(uniteBase), unites: [{ unite_id: String(uniteBase), facteur_conversion: 1, prix_achat: 0, prix_vente: 0, est_unite_achat_defaut: true, est_unite_vente_defaut: true, est_unite_base: true }] });
  const outilId = Number(ro2[0]?.result?.data?.json?.id);
  check("Outil créé", !!outilId, ro2[0]?.error?.json?.message);
  await c2.query("INSERT INTO stocks (agence_id, produit_id, emplacement_id, quantite, quantite_reservee) VALUES (1, $1, 2, 3, 0)", [outilId]);
  const sansDate = await trpcPost("outillage.preter", { outilId, technicienId: emp13 });
  check("Prêt SANS date de retour prévue refusé (specs)", !!sansDate[0]?.error, sansDate[0]?.error?.json?.message);
  const pret = await trpcPost("outillage.preter", { outilId, technicienId: emp13, dateRetour: demain });
  const pretId = pret[0]?.result?.data?.json?.id;
  check("Prêt avec date de retour accepté", !!pretId, pret[0]?.error?.json?.message);
  const apresPret = (await c2.query("SELECT quantite FROM stocks WHERE produit_id=$1 AND agence_id=1", [outilId])).rows[0];
  check("Quantité disponible décrémentée au prêt (3 → 2)", Number(apresPret.quantite) === 2, "q=" + apresPret.quantite);

  // ── 4. Retour ENDOMMAGE : remarque obligatoire + statut CASSE ──
  const retSansRemarque = await trpcPost("outillage.retourner", { pretId, etatRetour: "ENDOMMAGE" });
  check("Retour ENDOMMAGE sans remarque refusé (specs)", !!retSansRemarque[0]?.error, retSansRemarque[0]?.error?.json?.message);
  const ret = await trpcPost("outillage.retourner", { pretId, etatRetour: "ENDOMMAGE", remarque: "Mâchoire faussée" });
  check("Retour ENDOMMAGE avec remarque accepté", !ret[0]?.error, ret[0]?.error?.json?.message);
  const statutApres = (await c2.query("SELECT statut_outil FROM produits WHERE id=$1", [outilId])).rows[0];
  check("Statut outil = CASSE (non re-prêtable)", statutApres.statut_outil === "CASSE", statutApres.statut_outil);
  const rePret = await trpcPost("outillage.preter", { outilId, technicienId: emp13, dateRetour: demain });
  check("Outil CASSÉ non prêtable", !!rePret[0]?.error, rePret[0]?.error?.json?.message);

  // ── 5. Déclaration PERDU depuis la fiche + lever statut ──
  const decl = await trpcPost("outillage.declarerStatut", { outilId, statut: "PERDU", motif: "Disparu du vestiaire" });
  check("Déclaration PERDU (justification) acceptée", !decl[0]?.error, decl[0]?.error?.json?.message);
  const statutPerdu = (await c2.query("SELECT statut_outil FROM produits WHERE id=$1", [outilId])).rows[0];
  check("Statut outil = PERDU", statutPerdu.statut_outil === "PERDU", statutPerdu.statut_outil);
  const qPerdu = (await c2.query("SELECT quantite FROM stocks WHERE produit_id=$1 AND agence_id=1", [outilId])).rows[0];
  check("Quantité déduite (2 → 1)", Number(qPerdu.quantite) === 1, "q=" + qPerdu.quantite);
  const lever = await trpcPost("outillage.leverStatut", { outilId, motif: "Retrouvé — réintégré" });
  check("Lever le statut → disponible", !lever[0]?.error, lever[0]?.error?.json?.message);

  // ── 6. Retour OK → quantité réintégrée ──
  const pret2 = await trpcPost("outillage.preter", { outilId, technicienId: emp13, dateRetour: demain });
  const ret2 = await trpcPost("outillage.retourner", { pretId: pret2[0]?.result?.data?.json?.id, etatRetour: "OK" });
  check("Retour OK accepté", !ret2[0]?.error, ret2[0]?.error?.json?.message);
  const qOK = (await c2.query("SELECT quantite FROM stocks WHERE produit_id=$1 AND agence_id=1", [outilId])).rows[0];
  check("Quantité cohérente après le cycle complet (3 − 1 prêt − 1 perdu − 1 prêt + 1 retour = 1)", Number(qOK.quantite) === 1, "q=" + qOK.quantite);

  // ── 7. Pièces : sortir pour réparation (avec OR) + demande de commande ──
  const orRow = (await c2.query("SELECT id FROM ordres_reparation WHERE statut IN ('EN_COURS','DIAGNOSTIC') LIMIT 1")).rows[0];
  if (orRow) {
    const sortieOr = await trpcPost("stock.sortirPourOR", { orId: orRow.id, produitId: id, quantite: 2, motif: "Sortie pour réparation" });
    check("Sortir pour réparation : stock 17 → 15", !sortieOr[0]?.error && sortieOr[0]?.result?.data?.json?.stockApres === 15, JSON.stringify(sortieOr[0]?.result?.data?.json));
  } else {
    console.log("  (pas d'OR en cours — check sortie réparation ignoré)");
  }
  const dem = await trpcPost("stock.creerDemandeCommande", { designation: `DEM-${suffix} plaquettes frein`, reference: "BP-1234", quantite: 4, notes: "Pour OR en cours" });
  check("Demande de commande créée (produit introuvable)", !!dem[0]?.result?.data?.json?.id, dem[0]?.error?.json?.message);
  const listDem = await trpcGet("stock.listDemandesCommande", {});
  check("Demande listée (EN_ATTENTE)", (listDem[0]?.result?.data?.json ?? []).some((d) => String(d.designation).startsWith(`DEM-${suffix}`)), "absente");

  // ── 8. Permission stock.utiliser en base (mécanicien) ──
  const perm = (await c2.query("SELECT COUNT(*) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id JOIN roles r ON r.id=rp.role_id WHERE p.code='stock.utiliser' AND r.code='technicien'")).rows[0];
  check("Permission stock.utiliser attribuée au mécanicien", Number(perm.count) === 1, "n=" + perm.count);

  // ── 9. Nettoyage (les mouvements sont append-only : on désactive les produits de test) ──
  await c2.query("DELETE FROM stocks WHERE produit_id IN (SELECT id FROM produits WHERE code_article LIKE $1)", [`GAR-${suffix}`]);
  await c2.query("DELETE FROM prets_outils WHERE outil_id IN (SELECT id FROM produits WHERE code_article LIKE $1)", [`GAR-${suffix}`]);
  await c2.query("DELETE FROM demandes_commande WHERE designation LIKE $1", [`DEM-${suffix}%`]);
  await c2.query("UPDATE produits SET is_active=false WHERE code_article LIKE $1", [`GAR-${suffix}`]);
  await c2.end();

  console.log(`\nRÉSULTAT GARAGE SPECS : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });