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

  // Récupérer le client ENTR créé au module Clients
  const clients = await trpcGet("clients.list", { search: "Trans Logistique", limit: 100 });
  let entrId = (clients[0]?.result?.data?.json?.clients ?? []).find((c) => c.raisonSociale === "Trans Logistique SARL")?.id;
  if (!entrId) {
    const r = await trpcPost("clients.create", {
      typeClient: "ENTR", raisonSociale: "Trans Logistique SARL", niuNif: "M071620000000J",
      telephone: "655 11 22 33", email: "contact@translog.cm",
      contactPrincipal: { nom: "Mballa", telephone: "655 11 22 33" },
    });
    entrId = r[0]?.result?.data?.json?.id;
  }
  check("Client entreprise disponible", !!entrId, "id=" + entrId);

  // ── 1. Création véhicule + doublon refusé (idempotent) ──
  const existing = await trpcGet("vehicules.list", { search: "LT-2026-AT", limit: 10 });
  let v = (existing[0]?.result?.data?.json?.vehicules ?? []).find((x) => x.immatriculation === "LT-2026-AT");
  if (!v) {
    const r1 = await trpcPost("vehicules.create", { immatriculation: "LT-2026-AT", clientId: entrId, marque: "Toyota", modele: "Hilux", annee: 2020, kilometrage: 45000, carburant: "diesel", typeVehicule: "utilitaire", numeroChassis: "JTMDF3FV5P000001" });
    v = r1[0]?.result?.data?.json;
    check("Véhicule créé (en_reception)", !r1[0]?.error && v?.statutImmobilisation === "en_reception" && v?.immatriculation === "LT-2026-AT", r1[0]?.error?.json?.message);
  } else {
    check("Véhicule déjà existant (réutilisé)", v?.immatriculation === "LT-2026-AT");
    if (v?.statutImmobilisation !== "en_reception") {
      await trpcPost("vehicules.changerStatut", { id: v.id, nouveauStatut: "sorti", motif: "Reset test" }).catch(() => {});
      await trpcPost("vehicules.changerStatut", { id: v.id, nouveauStatut: "en_reception", motif: "Reset test" }).catch(() => {});
    }
  }
  const vId = v?.id;

  const r1b = await trpcPost("vehicules.create", { immatriculation: "LT-2026-AT", marque: "Nissan" });
  check("Immatriculation doublon → refusée", !!r1b[0]?.error && /existe déjà/.test(r1b[0].error.json.message), r1b[0]?.error?.json?.message);

  // ── 2. Cycle d'immobilisation ──
  const setStatut = (s) => trpcPost("vehicules.changerStatut", { id: vId, nouveauStatut: s, motif: "Test atelier" });
  const r2a = await setStatut("en_diagnostic");
  check("en_reception → en_diagnostic", r2a[0]?.result?.data?.json?.statut === "en_diagnostic", r2a[0]?.error?.json?.message);
  const r2b = await setStatut("en_reparation");
  check("en_diagnostic → en_reparation", r2b[0]?.result?.data?.json?.statut === "en_reparation", r2b[0]?.error?.json?.message);
  const r2c = await setStatut("attente_piece_locale");
  check("en_reparation → attente_piece_locale", r2c[0]?.result?.data?.json?.statut === "attente_piece_locale", r2c[0]?.error?.json?.message);
  const r2d = await setStatut("en_reparation");
  check("attente_piece_locale → en_reparation (pièce arrivée)", r2d[0]?.result?.data?.json?.statut === "en_reparation", r2d[0]?.error?.json?.message);
  const r2e = await setStatut("terminee_attente_paiement");
  check("en_reparation → terminee_attente_paiement", r2e[0]?.result?.data?.json?.statut === "terminee_attente_paiement", r2e[0]?.error?.json?.message);

  const r2f = await setStatut("en_diagnostic");
  check("terminee → en_diagnostic refusé (transition)", !!r2f[0]?.error, r2f[0]?.error?.json?.message);

  const r2g = await setStatut("sorti");
  check("terminee_attente_paiement → sorti", r2g[0]?.result?.data?.json?.statut === "sorti", r2g[0]?.error?.json?.message);

  // ── 3. Véhicule SORTI → OR refusé ; ré-entrée → OR OK avec statut auto ──
  const orRefuse = await trpcPost("or.create", { vehiculeId: vId, clientId: entrId, plainte: "Test" });
  check("OR refusé si véhicule SORTI", !!orRefuse[0]?.error && /SORTI/.test(orRefuse[0].error.json.message), orRefuse[0]?.error?.json?.message);

  const r3 = await setStatut("en_reception");
  check("sorti → en_reception (ré-entrée)", r3[0]?.result?.data?.json?.statut === "en_reception", r3[0]?.error?.json?.message);

  const orOk = await trpcPost("or.create", { vehiculeId: vId, clientId: entrId, plainte: "Bruit moteur" });
  console.log("OR:", JSON.stringify(orOk[0]?.result?.data?.json ?? orOk[0]?.error?.json).slice(0, 120));
  check("OR ouvert sur le véhicule", !orOk[0]?.error && /^OR-/.test(orOk[0]?.result?.data?.json?.numero ?? ""), orOk[0]?.error?.json?.message);

  const fiche = await trpcGet("vehicules.get", { id: vId });
  const f = fiche[0]?.result?.data?.json;
  check("Statut véhicule passé en_reparation (auto à l'ouverture d'OR)", f?.vehicule?.statutImmobilisation === "en_reparation", f?.vehicule?.statutImmobilisation);
  check("Historique OR : 1 OR listé", (f?.historiqueOR ?? []).length >= 1, JSON.stringify(f?.historiqueOR).slice(0, 120));
  check("Propriétaire = Trans Logistique", f?.client?.raisonSociale === "Trans Logistique SARL", f?.client?.raisonSociale);

  // ── 4. Contrat : lier le véhicule ──
  const c1 = await trpcPost("contrats.create", {
    clientId: entrId, libelle: "Contrat flotte TransLog", typeContrat: "FORFAIT_ANNUEL",
    dateDebut: "2026-01-01", dateFin: "2026-12-31", statutInitial: "ACTIF",
  });
  const contratId = c1[0]?.result?.data?.json?.id;
  check("Contrat ACTIF créé pour liaison", !!contratId, c1[0]?.error?.json?.message);

  const l1 = await trpcPost("vehicules.lierContrat", { vehiculeId: vId, contratId });
  check("Véhicule lié au contrat", !l1[0]?.error && l1[0]?.result?.data?.json?.vehiculeId === vId, l1[0]?.error?.json?.message);
  const l2 = await trpcPost("vehicules.lierContrat", { vehiculeId: vId, contratId });
  check("Double liaison refusée", !!l2[0]?.error && /déjà couvert/.test(l2[0].error.json.message), l2[0]?.error?.json?.message);

  const fiche2 = await trpcGet("vehicules.get", { id: vId });
  check("Fiche : contrat visible", (fiche2[0]?.result?.data?.json?.contrats ?? []).some((c) => c.contratId === contratId), JSON.stringify(fiche2[0]?.result?.data?.json?.contrats).slice(0, 120));

  // ── 5. Recherche parc ──
  const s1 = await trpcGet("vehicules.list", { search: "LT-2026-AT", limit: 100 });
  check("Recherche par immatriculation", (s1[0]?.result?.data?.json?.vehicules ?? []).some((x) => x.id === vId));
  const s2 = await trpcGet("vehicules.list", { search: "Trans Logistique", limit: 100 });
  check("Recherche par propriétaire", (s2[0]?.result?.data?.json?.vehicules ?? []).some((x) => x.id === vId));
  const s3 = await trpcGet("vehicules.list", { statut: "en_reparation", limit: 100 });
  check("Filtre par statut immobilisation", (s3[0]?.result?.data?.json?.vehicules ?? []).some((x) => x.id === vId));

  // ── 6. Retirer le contrat ──
  const liaisonId = (fiche2[0]?.result?.data?.json?.contrats ?? [])[0]?.id;
  const r6 = await trpcPost("vehicules.retirerContrat", { id: liaisonId });
  check("Véhicule retiré du contrat", !r6[0]?.error, r6[0]?.error?.json?.message);

  console.log(`\nRÉSULTAT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });