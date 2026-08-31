const BASE = "http://localhost:3000";
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
  // Dernier OR
  const d = await trpcGet("or.getDashboard", {});
  const parc = d[0]?.result?.data?.json?.parc ?? [];
  const last = parc[0];
  console.log("Dernier OR au parc:", last?.numero, "id=", last?.id);
  // Transmettre et relire immédiatement + après délai
  const t = await trpcPost("clients.marquerFactureTransmise", { orId: last?.id });
  console.log("transmettre:", JSON.stringify(t[0]?.result?.data?.json ?? t[0]?.error?.json).slice(0, 120));
  const g1 = await trpcGet("vehicules.get", { id: last?.vehiculeId });
  console.log("fiche immédiate:", g1[0]?.result?.data?.json?.facture?.etat, "| transmiseLe:", g1[0]?.result?.data?.json?.facture?.transmiseLe);
  await new Promise((r) => setTimeout(r, 1500));
  const g2 = await trpcGet("vehicules.get", { id: last?.vehiculeId });
  console.log("fiche après 1,5s:", g2[0]?.result?.data?.json?.facture?.etat, "| transmiseLe:", g2[0]?.result?.data?.json?.facture?.transmiseLe);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });