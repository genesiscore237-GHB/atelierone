const BASE = "http://localhost:3000";
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

  // Données de test : client, véhicule, OR
  const client = await trpcPost("customers.create", { nom: "Test Res", prenom: "A", telephone: "611111111", email: "res@x.cm" });
  const clientId = client[0]?.result?.data?.json?.id;
  const veh = await trpcPost("or.createVehicule", { immatriculation: "LT-RES-01", marque: "Toyota", modele: "Rav4", annee: 2021, clientId: Number(clientId) });
  const vehId = veh[0]?.result?.data?.json?.id;
  const or = await trpcPost("or.create", { vehiculeId: Number(vehId), plainte: "Test réservation" });
  const orId = or[0]?.result?.data?.json?.id;
  const orNum = or[0]?.result?.data?.json?.numero;
  console.log("données: client=" + clientId + " veh=" + vehId + " or=" + orId + " num=" + orNum);

  const prodId = 1; // produit avec stock (24)

  // 1. Réservation de 5 unités
  const res = await trpcPost("stock.reserverStock", { orId: Number(orId), produitId: prodId, quantite: 5, motif: "Réservation pour OR" });
  console.log("réservation:", res[0]?.error?.json?.message ?? ("OK dispo=" + res[0].result.data.json.disponible + " réservé=" + res[0].result.data.json.reservee));
  check("Réservation acceptée (dispo 24→19)", !res[0]?.error && res[0].result.data.json.disponible === 19, JSON.stringify(res[0]?.error?.json?.message));
  check("Réservé = 5", res[0]?.result?.data?.json?.reservee === 5, "");

  // 2. Sortie de 8 → dispo 19 → OK (19 >= 8)
  const sortie = await trpcPost("stock.sortirPourOR", { orId: Number(orId), produitId: prodId, quantite: 8, motif: "Sortie pièce réservée" });
  console.log("sortie 8 après réservation 5:", sortie[0]?.error?.json?.message ?? ("OK stock=" + sortie[0].result.data.json.stockApres));
  check("Sortie 8 OK (dispo 19 >= 8)", !sortie[0]?.error, sortie[0]?.error?.json?.message);

  // 3. Sortie excessive (dispo restant = 11) → 15 refusé
  const excessif = await trpcPost("stock.sortirPourOR", { orId: Number(orId), produitId: prodId, quantite: 15, motif: "Test trop" });
  console.log("sortie 15:", excessif[0]?.error?.json?.message ?? "ACCEPTÉ (anormal)");
  check("Sortie 15 refusée (dispo 11 < 15)", !!excessif[0]?.error, excessif[0]?.error?.json?.message);

  // 4. Réservation excessive (dispo 11) → 20 refusé
  const resExcess = await trpcPost("stock.reserverStock", { orId: Number(orId), produitId: prodId, quantite: 20, motif: "Test réservation trop" });
  console.log("réservation 20:", resExcess[0]?.error?.json?.message ?? "ACCEPTÉ (anormal)");
  check("Réservation 20 refusée (dispo 11 < 20)", !!resExcess[0]?.error, resExcess[0]?.error?.json?.message);

  // 5. Libération de 5 (réservé)
  const lib = await trpcPost("stock.libererStock", { orId: Number(orId), produitId: prodId, quantite: 5, motif: "OR annulé libération" });
  console.log("libération 5:", lib[0]?.error?.json?.message ?? ("OK dispo=" + lib[0].result.data.json.disponible + " réservé=" + lib[0].result.data.json.reservee));
  check("Libération acceptée (réservé 5→0)", !lib[0]?.error && lib[0].result.data.json.reservee === 0, lib[0]?.error?.json?.message);

  // 6. Mouvements tracés
  const mvts = await trpcGet("stock.listMouvementsParOR", { orId: Number(orId) });
  const m = mvts[0]?.result?.data?.json ?? [];
  console.log("mouvements OR:", m.map((x) => x.type).join(", "));
  check("Mouvement RESERVATION tracé", m.some((x) => x.type === "RESERVATION"));
  check("Mouvement LIBERATION_RESERVATION tracé", m.some((x) => x.type === "LIBERATION_RESERVATION"));

  // 7. Équivalences (specs V2 §02)
  const eq = await trpcPost("catalog.addEquivalence", { articleId: prodId, articleEquivalentId: 2, type: "SUPERSESSION", priorite: 1, notes: "Nouvelle réf" });
  console.log("équivalence:", eq[0]?.error?.json?.message ?? ("OK id=" + eq[0].result.data.json.id));
  check("Ajout équivalence (supersession)", !eq[0]?.error, eq[0]?.error?.json?.message);
  const eqList = await trpcGet("catalog.listEquivalences", { produitId: prodId });
  const eqs = eqList[0]?.result?.data?.json ?? [];
  check("Liste équivalences (1)", eqs.length === 1 && eqs[0].type === "SUPERSESSION", JSON.stringify(eqs).slice(0, 100));
  // doublon refusé
  const eqDup = await trpcPost("catalog.addEquivalence", { articleId: prodId, articleEquivalentId: 2 });
  check("Doublon équivalence refusé", !!eqDup[0]?.error, eqDup[0]?.error?.json?.message);
  // auto-équivalence refusée
  const eqSelf = await trpcPost("catalog.addEquivalence", { articleId: prodId, articleEquivalentId: prodId });
  check("Auto-équivalence refusée", !!eqSelf[0]?.error, eqSelf[0]?.error?.json?.message);

  console.log(`\nRÉSULTAT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
