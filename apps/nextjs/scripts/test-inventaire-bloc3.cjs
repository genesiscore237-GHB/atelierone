const BASE = "http://localhost:3000";
const { Client } = require("pg");
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
(async () => {
  const jar = new Map();
  async function http(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    const c = [...jar.entries()].map(([k, v]) => k + "=" + v).join("; ");
    if (c) headers.cookie = c;
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

  // Pré-condition : stock du produit 26 = 10 (auto-suffisant quel que soit l'ordre des tests)
  const pre = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await pre.connect();
  await pre.query("UPDATE stocks SET quantite=10, quantite_reservee=0 WHERE produit_id=26 AND agence_id=1;");
  await pre.end();

  // 1. Création → BROUILLON
  const c = await trpcPost("stock.createSessionInventaire", { libelle: "Session bloc3 test", notes: "Test cycle complet" });
  const sid = c[0]?.result?.data?.json?.id;
  console.log("session:", c[0]?.result?.data?.json);
  check("Session créée en BROUILLON", !c[0]?.error && c[0].result.data.json.statut === "brouillon", c[0]?.error?.json?.message);

  // 2. Comptage sur brouillon → refusé
  const r2 = await trpcPost("stock.compterProduit", { sessionId: sid, produitId: "26", quantiteReelle: 7, commentaire: "comptage avant démarrage" });
  check("Comptage refusé en BROUILLON", !!r2[0]?.error && /en cours/.test(r2[0].error.json.message), r2[0]?.error?.json?.message);

  // 3. Démarrage → EN_COURS
  const r3 = await trpcPost("stock.demarrerSessionInventaire", { id: sid });
  check("Démarrage → EN_COURS", !r3[0]?.error && r3[0].result.data.json.statut === "en_cours", r3[0]?.error?.json?.message);

  // 4. Comptage OK
  const r4 = await trpcPost("stock.compterProduit", { sessionId: sid, produitId: "26", quantiteReelle: 7, commentaire: "comptage réel" });
  console.log("comptage:", JSON.stringify(r4[0]?.result?.data?.json ?? r4[0]?.error?.json));
  check("Comptage accepté en EN_COURS (écart -3)", !r4[0]?.error && r4[0].result.data.json.ecart === -3, r4[0]?.error?.json?.message);

  // 5. Démarrage double → refusé
  const r5 = await trpcPost("stock.demarrerSessionInventaire", { id: sid });
  check("Double démarrage refusé", !!r5[0]?.error, r5[0]?.error?.json?.message);

  // 6. Validation → VALIDE (écarts appliqués au stock)
  const r6 = await trpcPost("stock.validerSession", { id: sid });
  check("Validation → VALIDE", !r6[0]?.error, r6[0]?.error?.json?.message);
  const det = await trpcGet("stock.getSessionInventaire", { id: sid });
  check("Statut lu = valide", det[0]?.result?.data?.json?.statut === "valide", det[0]?.result?.data?.json?.statut);

  // 7. Comptage sur valide → refusé
  const r7 = await trpcPost("stock.compterProduit", { sessionId: sid, produitId: "26", quantiteReelle: 8 });
  check("Comptage refusé en VALIDE", !!r7[0]?.error, r7[0]?.error?.json?.message);

  // 8. Clôture → CLOTURE
  const r8 = await trpcPost("stock.cloturerSessionInventaire", { id: sid });
  check("Clôture → CLOTURE", !r8[0]?.error && r8[0].result.data.json.statut === "cloture", r8[0]?.error?.json?.message);

  // 9. Double clôture → refusée
  const r9 = await trpcPost("stock.cloturerSessionInventaire", { id: sid });
  check("Double clôture refusée", !!r9[0]?.error && /validée/.test(r9[0].error.json.message), r9[0]?.error?.json?.message);

  // 10. Comptage sur cloture → refusé
  const r10 = await trpcPost("stock.compterProduit", { sessionId: sid, produitId: "26", quantiteReelle: 9 });
  check("Comptage refusé en CLOTURE", !!r10[0]?.error, r10[0]?.error?.json?.message);

  // 11. Validation d'une session cloturée → refusée
  const r11 = await trpcPost("stock.validerSession", { id: sid });
  check("Validation d'une session clôturée refusée", !!r11[0]?.error, r11[0]?.error?.json?.message);

  // 12. Liste : la session apparaît avec son statut final
  const liste = await trpcGet("stock.listSessionsInventaire", {});
  const s = liste[0]?.result?.data?.json?.find((x) => x.id === sid);
  check("Session listée en CLOTURE", !!s && s.statut === "cloture", s?.statut);

  console.log(`\nRÉSULTAT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });