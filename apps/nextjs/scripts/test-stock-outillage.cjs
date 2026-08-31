const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";

(async () => {
  // ── 0. Nettoyage + unités litre/bidon ──
  const c = new Client({ connectionString: DSN });
  await c.connect();
  await c.query("DELETE FROM prets_outils WHERE outil_id IN (SELECT id FROM produits WHERE code_article LIKE 'OUT-%' OR code_article LIKE 'CONS-%');");
  await c.query("DELETE FROM stocks_unites WHERE produit_id IN (SELECT id FROM produits WHERE code_article LIKE 'OUT-%' OR code_article LIKE 'CONS-%');");
  await c.query("DELETE FROM stocks WHERE produit_id IN (SELECT id FROM produits WHERE code_article LIKE 'OUT-%' OR code_article LIKE 'CONS-%');");
  await c.query("DELETE FROM produit_unites WHERE produit_id IN (SELECT id FROM produits WHERE code_article LIKE 'OUT-%' OR code_article LIKE 'CONS-%');");
  await c.query("DELETE FROM mouvements_stock WHERE produit_id IN (SELECT id FROM produits WHERE code_article LIKE 'OUT-%' OR code_article LIKE 'CONS-%');").catch(() => {});
  await c.query("DELETE FROM produits WHERE code_article LIKE 'OUT-%' OR code_article LIKE 'CONS-%' OR code_article LIKE 'PCE-%';").catch(() => {});
  await c.query("DELETE FROM unites_mesure WHERE code IN ('LITRE','BIDON20');").catch(() => {});
  await c.query("INSERT INTO unites_mesure (code, libelle, symbole, type) VALUES ('LITRE','Litre','L','VOLUME'), ('BIDON20','Bidon 20L','B20','VOLUME') ON CONFLICT (code) DO NOTHING;");

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

  // ── 1. Création outil + consommable (type OUTIL / CONSOMMABLE) ──
  const suffix = Date.now().toString().slice(-4);
  const uniteBase = (await c.query("SELECT id FROM unites_mesure WHERE code='PCE' LIMIT 1")).rows[0]?.id;
  check("Unité de base disponible", !!uniteBase, "id=" + uniteBase);
  const unites = [{ unite_id: uniteBase, facteur_conversion: 1, est_unite_base: true, est_unite_vente_defaut: true, est_unite_achat_defaut: true }];
  const ro = await trpcPost("catalog.create", { titre: `Clé dynamométrique ${suffix}`, typeProduit: "OUTIL", codeArticle: `OUT-${suffix}`, designationCourte: "Clé à cliquet 1/2 pouce 20-200 Nm", categorieId: String((await c.query("SELECT id FROM categories WHERE code='OUTILLAGE'")).rows[0]?.id), description: "Outillage mécanique", statut: "actif", unites });
  const outilId = ro[0]?.result?.data?.json?.id;
  check("Outil créé (type OUTIL, sans prix)", !!outilId, ro[0]?.error?.json?.message);
  const rh = await trpcPost("catalog.create", { titre: `Huile moteur 10W40 ${suffix}`, typeProduit: "CONSOMMABLE", codeArticle: `CONS-${suffix}`, designationCourte: "Huile moteur API SN", categorieId: String((await c.query("SELECT id FROM categories WHERE code='CONSOMMABLE'")).rows[0]?.id), description: "Consommable vidange", statut: "actif", unites });
  const huileId = rh[0]?.result?.data?.json?.id;
  check("Consommable huile créé (type CONSOMMABLE)", !!huileId, rh[0]?.error?.json?.message);
  const rp = await trpcPost("catalog.create", { titre: `Pièce de contrôle ${suffix}`, typeProduit: "PIECE", codeArticle: `PCE-${suffix}`, prixVente: "1000", statut: "actif", unites });
  check("Produit PIECE toujours créable (non-régression)", !!rp[0]?.result?.data?.json?.id, rp[0]?.error?.json?.message);

  // ── 2. Approvisionnement + recherche ──
  await c.query("INSERT INTO stocks (agence_id, produit_id, emplacement_id, quantite, quantite_reservee) VALUES (1, $1, 2, 3, 0)", [Number(outilId)]);
  const l1 = await trpcGet("outillage.list", { q: `Clé dynamométrique ${suffix}` });
  const out = (l1[0]?.result?.data?.json ?? []).find((x) => x.id === Number(outilId));
  check("Recherche outil par nom", !!out && Number(out.stockTotal) === 3, JSON.stringify(out));
  const l2 = await trpcGet("outillage.list", { type: "OUTIL" });
  check("Filtre type OUTIL", (l2[0]?.result?.data?.json ?? []).every((x) => x.typeProduit === "OUTIL"), "n=" + l2[0]?.result?.data?.json?.length);
  const l3 = await trpcGet("outillage.list", { q: `10W40 ${suffix}` });
  check("Recherche consommable", (l3[0]?.result?.data?.json ?? []).some((x) => x.id === Number(huileId)), "n=" + l3[0]?.result?.data?.json?.length);
  const l4 = await trpcGet("outillage.list", { statut: "DISPONIBLE" });
  check("Statut DISPONIBLE (outil en stock, non prêté)", (l4[0]?.result?.data?.json ?? []).some((x) => x.id === Number(outilId) && x.statut === "DISPONIBLE"));

  // ── 3. Prêt / double prêt / retour ──
  const emps = await trpcGet("rh.list", { limit: 100, statut: "actif" });
  const techId = Number((emps[0]?.result?.data?.json?.employees ?? []).find((e) => e.matricule === "EMP003")?.id ?? 0);
  check("Technicien EMP003 trouvé", !!techId, "id=" + techId);
  const p1 = await trpcPost("outillage.preter", { outilId: Number(outilId), technicienId: techId, motif: "Remplacement freins" });
  check("Outil prêté", !p1[0]?.error && !!p1[0]?.result?.data?.json?.id, p1[0]?.error?.json?.message);
  const pretId = p1[0]?.result?.data?.json?.id;
  const l5 = await trpcGet("outillage.list", { q: `Clé dynamométrique ${suffix}` });
  const out2 = (l5[0]?.result?.data?.json ?? []).find((x) => x.id === Number(outilId));
  check("Statut PRETE + technicien affiché", out2?.statut === "PRETE" && out2?.prets?.[0]?.technicien, JSON.stringify(out2?.prets?.[0]));
  const p2 = await trpcPost("outillage.preter", { outilId: Number(outilId), technicienId: techId });
  check("Double prêt refusé", !!p2[0]?.error && /déjà prêté/.test(p2[0].error.json.message), p2[0]?.error?.json?.message);
  const r1 = await trpcPost("outillage.retourner", { pretId, etatRetour: "OK", remarque: "Rendu propre" });
  check("Outil rendu", !r1[0]?.error, r1[0]?.error?.json?.message);
  const l6 = await trpcGet("outillage.list", { q: `Clé dynamométrique ${suffix}` });
  check("Statut DISPONIBLE après retour", (l6[0]?.result?.data?.json ?? []).find((x) => x.id === Number(outilId))?.statut === "DISPONIBLE");
  const hist = await trpcGet("outillage.historiquePrets", {});
  check("Historique des prêts tracé", (hist[0]?.result?.data?.json ?? []).some((x) => x.id === pretId && x.etatRetour === "OK"), "n=" + hist[0]?.result?.data?.json?.length);

  // ── 4. Huile : unités litre/bidon + stock en litres + déconditionnement + sortie OR ──
  const [uLitre, uBidon] = (await c.query("SELECT id FROM unites_mesure WHERE code IN ('LITRE','BIDON20') ORDER BY code")).rows;
  await c.query("INSERT INTO produit_unites (produit_id, unite_id, facteur_vers_base, est_unite_base, est_unite_vente_defaut, est_unite_achat_defaut, statut) VALUES ($1,$2,'1',true,true,false,'ACTIF'), ($1,$3,'20',false,false,true,'ACTIF')", [Number(huileId), uLitre.id, uBidon.id]);
  await c.query("INSERT INTO stocks (agence_id, produit_id, emplacement_id, quantite, quantite_reservee) VALUES (1, $1, 2, 40, 0)", [Number(huileId)]); // 40 litres en base
  await c.query("INSERT INTO stocks_unites (agence_id, produit_id, unite_id, quantite) VALUES (1, $1, $2, 40), (1, $1, $3, 2)", [Number(huileId), uLitre.id, uBidon.id]);
  const dc = await trpcPost("stock.createDeconditionnement", { produitId: String(huileId), uniteSourceId: uBidon.id, quantiteSource: 1, uniteCibleId: uLitre.id, quantiteGeneree: 20, motif: "Ouverture d'un bidon" });
  check("Déconditionnement bidon → 20 litres", !dc[0]?.error, dc[0]?.error?.json?.message);
  const mvts = await trpcGet("stock.getMouvements", { produitId: String(huileId) });
  const types = new Set((mvts[0]?.result?.data?.json ?? []).map((m) => m.type));
  check("Mouvements DECONDITIONNEMENT tracés (sortie+entrée)", types.has("DECONDITIONNEMENT_SORTIE") && types.has("DECONDITIONNEMENT_ENTREE"), [...types].join(","));

  // OR actif pour la sortie
  const cl = await trpcGet("clients.list", { limit: 10 });
  const clientId = (cl[0]?.result?.data?.json?.clients ?? [])[0]?.id;
  const rv = await trpcPost("vehicules.create", { immatriculation: `HUILE-${suffix}`, marque: "Toyota", modele: "Corolla", clientId });
  const vehId = rv[0]?.result?.data?.json?.id;
  const ro2 = await trpcPost("or.create", { vehiculeId: vehId, clientId, plainte: "Vidange moteur", priorite: "P3", motEntree: "ENTRETIEN" });
  const orId = ro2[0]?.result?.data?.json?.id;
  check("OR vidange créé", !!orId, ro2[0]?.error?.json?.message);

  const so = await trpcPost("stock.sortirPourOR", { orId, produitId: Number(huileId), quantite: 5, uniteId: uLitre.id, motif: "Vidange moteur" });
  check("Sortie d'huile pour OR en litres (5 L)", !so[0]?.error, so[0]?.error?.json?.message);
  const [stockHuile] = (await c.query("SELECT quantite FROM stocks WHERE produit_id=$1 AND agence_id=1", [Number(huileId)])).rows;
  const [stockLitre] = (await c.query("SELECT quantite FROM stocks_unites WHERE produit_id=$1 AND agence_id=1 AND unite_id=$2", [Number(huileId), uLitre.id])).rows;
  check("Stock base exact (40 - 5 = 35 L) + conversion litre (40 - 5 + 20 = 55 L)", Number(stockHuile.quantite) === 35 && Number(stockLitre.quantite) === 55, `base=${stockHuile.quantite} litre=${stockLitre.quantite}`);
  const mvts2 = await trpcGet("stock.getMouvements", { produitId: String(huileId) });
  check("Mouvement SORTIE_OR tracé (5 L)", (mvts2[0]?.result?.data?.json ?? []).some((m) => m.type === "SORTIE_OR" && Number(m.quantite) === 5), JSON.stringify((mvts2[0]?.result?.data?.json ?? []).map((m) => [m.type, m.quantite])));

  // ── 5. Fiche outil : stock + prêts + mouvements ──
  const f = await trpcGet("outillage.get", { id: Number(outilId) });
  const fd = f[0]?.result?.data?.json;
  check("Fiche outil : stock + prêts historisés + mouvements", fd?.outil?.id === Number(outilId) && fd?.stockTotal === 3 && fd?.historiquePrets?.length >= 1 && Array.isArray(fd?.mouvements), JSON.stringify({ s: fd?.stockTotal, p: fd?.historiquePrets?.length }));

  // ── 6. Page servie ──
  const page = await http("/dashboard/stock/outillage");
  check("Page /dashboard/stock/outillage (200)", page.status === 200, "status=" + page.status);

  await c.end();
  console.log(`\nRÉSULTAT OUTILLAGE : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });