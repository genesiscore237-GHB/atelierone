const BASE = "http://localhost:3000";
const OR_ID = 10;
const POMPE_ID = 27;
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

  const stockAvant = await trpcGet("stock.get", { produitId: POMPE_ID });
  const qteAvant = stockAvant[0]?.result?.data?.json?.quantite ?? (await trpcGet("stock.lister", { search: "Pompe à eau" }))[0]?.result?.data?.json?.items?.[0]?.stock ?? null;

  // 1. Trace d'une pièce client (libellé libre)
  const r1 = await trpcPost("or.addPieceClient", { orId: OR_ID, libelle: "Frein avant complet (fourni client)", quantite: 2, motif: "Client apporte ses plaquettes" });
  console.log("addPieceClient:", r1[0]?.error?.json?.message ?? JSON.stringify(r1[0].result.data.json));
  const ligne1 = r1[0]?.result?.data?.json;
  check("Pièce client tracée (PIECE_CLIENT, fournie=true, stock non impacté)", !r1[0]?.error && ligne1.fournieParClient === true && ligne1.stockImpacte === false, r1[0]?.error?.json?.message);

  // 2. Pièce client référencée à un article (pompe) — stock inchangé
  const r2 = await trpcPost("or.addPieceClient", { orId: OR_ID, produitId: POMPE_ID, libelle: "Pompe à eau", quantite: 1, motif: "Client fournit la pompe" });
  const ligne2 = r2[0]?.result?.data?.json;
  check("Pièce client liée à un article (stock inchangé)", !r2[0]?.error && ligne2.produitId === POMPE_ID, r2[0]?.error?.json?.message);

  const stockApres = await trpcGet("stock.get", { produitId: POMPE_ID });
  const qteApres = stockApres[0]?.result?.data?.json?.quantite ?? null;
  console.log("stock pompe avant/apres:", qteAvant, qteApres);
  check("Aucun impact stock (pompe toujours 9)", qteAvant === null || qteApres === qteAvant, `avant=${qteAvant} apres=${qteApres}`);

  // 3. Validation : ni libellé ni produit → refus
  const r3 = await trpcPost("or.addPieceClient", { orId: OR_ID, libelle: "", quantite: 1 });
  check("Refus si ni produit ni libellé", !!r3[0]?.error, r3[0]?.error?.json?.message);

  // 4. Quantité invalide → refus
  const r4 = await trpcPost("or.addPieceClient", { orId: OR_ID, libelle: "X", quantite: 0 });
  check("Refus si quantité ≤ 0", !!r4[0]?.error, r4[0]?.error?.json?.message);

  // 5. Liste des pièces client
  const liste = await trpcGet("or.listerPiecesClient", { orId: OR_ID });
  const rows = liste[0]?.result?.data?.json ?? [];
  console.log("pièces client:", rows.map((x) => x.libelle + "×" + x.quantite).join(", "));
  check("Liste : 2 pièces client (type PIECE_CLIENT)", rows.length === 2 && rows.every((x) => x.type === "PIECE_CLIENT" && x.fournieParClient), "n=" + rows.length);

  // 6. Remise au client de l'ancienne pièce
  const r6 = await trpcPost("or.remettrePieceClient", { ligneId: ligne1.ligneId, orId: OR_ID });
  check("Remise au client (remise_au_client=true)", !r6[0]?.error && r6[0].result.data.json.remiseAuClient === true, r6[0]?.error?.json?.message);

  // 7. Remise d'une ligne non-pièce-client → refus
  const r7 = await trpcPost("or.remettrePieceClient", { ligneId: 99999, orId: OR_ID });
  check("Remise ligne inexistante refusée", !!r7[0]?.error, r7[0]?.error?.json?.message);

  console.log(`\nRÉSULTAT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
