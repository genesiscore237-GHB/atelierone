const BASE = "http://localhost:3000";
const KIT_ID = 25, C1 = 26, C2 = 27, OR_ID = 8;
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

  // 1. Composition du kit : courroie (2) + pompe (1)
  const k1 = await trpcPost("catalog.addKitLigne", { kitId: KIT_ID, composantId: C1, quantite: 2 });
  const k2 = await trpcPost("catalog.addKitLigne", { kitId: KIT_ID, composantId: C2, quantite: 1 });
  check("Ajout 2 lignes de composition", !k1[0]?.error && !k2[0]?.error, k1[0]?.error?.json?.message + " / " + k2[0]?.error?.json?.message);

  // 2. Doublon refusé
  const d = await trpcPost("catalog.addKitLigne", { kitId: KIT_ID, composantId: C1, quantite: 1 });
  check("Doublon refusé", !!d[0]?.error && /déjà/.test(d[0].error.json.message), d[0]?.error?.json?.message);

  // 3. Auto-composition refusée
  const s = await trpcPost("catalog.addKitLigne", { kitId: KIT_ID, composantId: KIT_ID, quantite: 1 });
  check("Kit ne peut pas être son propre composant", !!s[0]?.error && /lui-même/.test(s[0].error.json.message), s[0]?.error?.json?.message);

  // 4. Sortie du kit : kit 10→9, courroie 10→8, pompe 10→9
  const out = await trpcPost("stock.sortirKit", { orId: OR_ID, kitId: KIT_ID, quantite: 1, motif: "Test sortie kit" });
  console.log("sortie kit:", out[0]?.error?.json?.message ?? JSON.stringify(out[0].result.data.json));
  const o = out[0]?.result?.data?.json;
  check("Kit sorti (stock 10→9)", !out[0]?.error && o.stockApres === 9, out[0]?.error?.json?.message);
  check("Composants décrémentés (courroie 10→8, pompe 10→9)", o && o.composants.length === 2 && o.composants[0].stockApres === 8 && o.composants[1].stockApres === 9, JSON.stringify(o?.composants));

  // 5. Mouvements tracés : 3 SORTIE_OR liés à l'OR, même groupe d'opération
  const mvts = await trpcGet("stock.listMouvementsParOR", { orId: OR_ID });
  const m = mvts[0]?.result?.data?.json ?? [];
  const sorties = m.filter((x) => x.type === "SORTIE_OR");
  const groupes = new Set(sorties.map((x) => x.groupeOperationId).filter(Boolean));
  check("3 mouvements SORTIE_OR (kit + 2 composants)", sorties.length === 3, "trouvés=" + sorties.length);
  check("Mêmes groupeOperationId (traçabilité complète)", groupes.size === 1, "groupes=" + [...groupes].join(","));

  // 6. Sortie insuffisante → rollback total (aucun nouveau mouvement)
  const avant = (await trpcGet("stock.listMouvementsParOR", { orId: OR_ID }))[0].result.data.json.length;
  const echec = await trpcPost("stock.sortirKit", { orId: OR_ID, kitId: KIT_ID, quantite: 100, motif: "Doit échouer (composant insuffisant)" });
  console.log("échec sortie 100:", echec[0]?.error?.json?.message ?? "ACCEPTÉ (anormal)");
  const apres = (await trpcGet("stock.listMouvementsParOR", { orId: OR_ID }))[0].result.data.json.length;
  check("Sortie impossible (composant insuffisant) → erreur", !!echec[0]?.error && /insuffisant|disponible|négatif/.test(echec[0].error.json.message), echec[0]?.error?.json?.message);
  check("Rollback : aucun mouvement ajouté", apres === avant, `avant=${avant} apres=${apres}`);

  // 7. Suppression d'une ligne
  const lignes = await trpcGet("catalog.listKitLignes", { kitId: KIT_ID });
  const liste = lignes[0]?.result?.data?.json ?? [];
  check("Liste lignes (2 lignes)", liste.length === 2, "n=" + liste.length);

  console.log(`\nRÉSULTAT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });