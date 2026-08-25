const BASE = "http://localhost:3000";
const TS = Date.now();
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

  console.log("=== T4 — CLIENT BLOQUÉ (impayés) → OR REFUSÉ → DÉBLOCAGE → OR OK ===");

  const c = await trpcPost("clients.create", { typeClient: "PART", civilite: "M", nom: `Test Bloque ${TS}`, prenom: "Client", telephone: "699 44 44 44" });
  const clientId = c[0]?.result?.data?.json?.id;
  const v = await trpcPost("vehicules.create", { immatriculation: `LT-BLOQ-${TS}`, clientId, marque: "Nissan", modele: "Almera", typeVehicule: "voiture" });
  const vehId = v[0]?.result?.data?.json?.id;

  // 1. Blocage : sans motif refusé, avec motif OK
  const rb1 = await trpcPost("clients.changerStatut", { id: clientId, nouveauStatut: "BLOQUE" });
  check("Blocage sans motif → refusé", !!rb1[0]?.error && /motif/.test(rb1[0].error.json.message), rb1[0]?.error?.json?.message);
  const rb2 = await trpcPost("clients.changerStatut", { id: clientId, nouveauStatut: "BLOQUE", motif: "Impayés depuis 60 jours" });
  check("Blocage avec motif → BLOQUE", rb2[0]?.result?.data?.json?.statut === "BLOQUE", rb2[0]?.error?.json?.message);

  // 2. OR refusé sur véhicule du client bloqué
  const ro = await trpcPost("or.create", { vehiculeId: vehId, clientId, plainte: "Révision" });
  check("OR refusé si client BLOQUÉ (message clair)", !!ro[0]?.error && /BLOQUÉ/.test(ro[0].error.json.message), ro[0]?.error?.json?.message);

  // 3. Déblocage → OR possible
  const rd = await trpcPost("clients.changerStatut", { id: clientId, nouveauStatut: "ACTIF", motif: "Régularisation de la dette" });
  check("Déblocage → ACTIF", rd[0]?.result?.data?.json?.statut === "ACTIF", rd[0]?.error?.json?.message);
  const ro2 = await trpcPost("or.create", { vehiculeId: vehId, clientId, plainte: "Révision 30 000 km", priorite: "P3" });
  check("OR ouvert après déblocage", !!ro2[0]?.result?.data?.json?.id, ro2[0]?.error?.json?.message);

  // 4. Historique de statut tracé (blocage + déblocage)
  const hist = await trpcGet("clients.historiqueStatut", { clientId });
  const h = hist[0]?.result?.data?.json ?? [];
  check("Historique : BLOQUE puis ACTIF tracés", h.some((x) => x.nouveauStatut === "BLOQUE") && h.some((x) => x.nouveauStatut === "ACTIF" && /Régularisation/.test(x.motif ?? "")), JSON.stringify(h.slice(0, 3)).slice(0, 160));

  console.log(`\nRÉSULTAT T4: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });