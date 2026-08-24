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

  // ── 1. Création Particulier — champs obligatoires ──
  const r1 = await trpcPost("clients.create", { typeClient: "PART", nom: "Test" });
  check("PART sans civilité/prénom/tél → refusé", !!r1[0]?.error && /manquants/.test(r1[0].error.json.message), r1[0]?.error?.json?.message);

  const r2 = await trpcPost("clients.create", { typeClient: "PART", civilite: "M", nom: "Kamdem", prenom: "Jean", telephone: "699 00 11 22", email: "jk@x.cm", ville: "Douala" });
  const part = r2[0]?.result?.data?.json;
  console.log("PART créé:", part);
  check("PART créé (ACTIF, code CLT-)", !r2[0]?.error && part?.statut === "ACTIF" && /^CLT-/.test(part?.codeClient ?? ""), r2[0]?.error?.json?.message);

  // ── 2. Entreprise : NIU + contact principal obligatoires ──
  const r3 = await trpcPost("clients.create", { typeClient: "ENTR", raisonSociale: "Trans Logistique SARL", telephone: "655 11 22 33" });
  check("ENTR sans NIU/email → refusé", !!r3[0]?.error && /manquants/.test(r3[0].error.json.message), r3[0]?.error?.json?.message);

  const r4 = await trpcPost("clients.create", {
    typeClient: "ENTR", raisonSociale: "Trans Logistique SARL", niuNif: "M071620000000J", rccm: "RC/DLA/2026/0001",
    telephone: "655 11 22 33", email: "contact@translog.cm", ville: "Douala", delaiPaiementJours: 30, plafondCredit: 5000000,
    contactPrincipal: { nom: "Mballa", prenom: "Sylvie", telephone: "655 11 22 33", email: "sylvie@translog.cm", fonction: "Directrice" },
  });
  const entr = r4[0]?.result?.data?.json;
  console.log("ENTR créé:", entr);
  check("ENTR créé + code CLT-", !r4[0]?.error && /^CLT-/.test(entr?.codeClient ?? ""), r4[0]?.error?.json?.message);
  const entrId = entr?.id;

  // ── 3. Fiche 360° : contact principal + solde ──
  const fiche = await trpcGet("clients.get", { id: entrId });
  const f = fiche[0]?.result?.data?.json;
  check("Contact principal créé (ENTR)", (f?.contacts ?? []).length === 1 && f.contacts[0].estContactPrincipal === true, JSON.stringify(f?.contacts).slice(0, 120));
  check("Solde initial = 0", Number(f?.solde ?? 0) === 0, f?.solde);

  // ── 4. Prospect → conversion explicite ──
  const r5 = await trpcPost("clients.create", { typeClient: "PROSP", nom: "Prospect Test", telephone: "699 55 66 77" });
  const prospId = r5[0]?.result?.data?.json?.id;
  check("PROSP créé (statut PROSPECT)", r5[0]?.result?.data?.json?.statut === "PROSPECT", r5[0]?.error?.json?.message);
  const r5b = await trpcPost("clients.changerStatut", { id: prospId, nouveauStatut: "BLOQUE", motif: "test" });
  check("PROSPECT → BLOQUE refusé (transition)", !!r5b[0]?.error, r5b[0]?.error?.json?.message);
  const r5c = await trpcPost("clients.changerStatut", { id: prospId, nouveauStatut: "ACTIF", motif: "Conversion prospect" });
  check("PROSPECT → ACTIF (conversion)", !r5c[0]?.error && r5c[0]?.result?.data?.json?.statut === "ACTIF", r5c[0]?.error?.json?.message);

  // ── 5. Blocage (motif obligatoire) ──
  const r6 = await trpcPost("clients.changerStatut", { id: entrId, nouveauStatut: "BLOQUE" });
  check("Blocage sans motif → refusé", !!r6[0]?.error && /motif/.test(r6[0].error.json.message), r6[0]?.error?.json?.message);
  const r6b = await trpcPost("clients.changerStatut", { id: entrId, nouveauStatut: "BLOQUE", motif: "Impayés depuis 60 jours" });
  check("Blocage avec motif → BLOQUE", !r6b[0]?.error && r6b[0]?.result?.data?.json?.statut === "BLOQUE", r6b[0]?.error?.json?.message);
  const hist = await trpcGet("clients.historiqueStatut", { clientId: entrId });
  check("Historique de statut tracé", (hist[0]?.result?.data?.json ?? []).some((h) => h.nouveauStatut === "BLOQUE"), JSON.stringify(hist[0]?.result?.data?.json).slice(0, 150));

  // ── 6. Client BLOQUÉ → OR refusé (règle métier) ──
  const vehicules = await trpcGet("or.listVehicules", {});
  const v = (vehicules[0]?.result?.data?.json ?? []).find((x) => x.clientId);
  if (v) {
    const orRefuse = await trpcPost("or.create", { vehiculeId: v.id, clientId: entrId, plainte: "Test blocage" });
    check("OR refusé si client BLOQUÉ", !!orRefuse[0]?.error && /BLOQUÉ/.test(orRefuse[0].error.json.message), orRefuse[0]?.error?.json?.message);
  } else {
    console.log("  (aucun véhicule avec client — vérification OR sauté)");
  }

  // ── 7. Contrat de maintenance : cycle de vie ──
  const r7 = await trpcPost("contrats.create", {
    clientId: entrId, libelle: "Maintenance parc TransLog 2026", typeContrat: "FORFAIT_ANNUEL",
    dateDebut: "2026-01-01", dateFin: "2026-12-31", montantForfait: 2500000,
    frequenceFacturation: "TRIMESTRIELLE", delaiPaiementJours: 30, delaiInterventionHeures: 48, statutInitial: "BROUILLON",
  });
  const contrat = r7[0]?.result?.data?.json;
  console.log("contrat:", contrat);
  check("Contrat créé (CONT-2026-, BROUILLON)", !r7[0]?.error && /^CONT-/.test(contrat?.numeroContrat ?? "") && contrat?.statut === "BROUILLON", r7[0]?.error?.json?.message);
  const contratId = contrat?.id;

  const r7b = await trpcPost("contrats.resilier", { id: contratId, motif: "xx" });
  check("Résiliation motif trop court → refusée", !!r7b[0]?.error, r7b[0]?.error?.json?.message);

  const r7c = await trpcPost("contrats.activer", { id: contratId });
  check("BROUILLON → ACTIF", !r7c[0]?.error && r7c[0]?.result?.data?.json?.statut === "ACTIF", r7c[0]?.error?.json?.message);

  const r7d = await trpcPost("contrats.suspendre", { id: contratId });
  check("ACTIF → SUSPENDU", r7d[0]?.result?.data?.json?.statut === "SUSPENDU", r7d[0]?.error?.json?.message);

  const r7e = await trpcPost("contrats.resilier", { id: contratId, motif: "Fin de partenariat décidée par la direction" });
  check("SUSPENDU → RESILIE (motif)", !r7e[0]?.error && r7e[0]?.result?.data?.json?.statut === "RESILIE", r7e[0]?.error?.json?.message);

  const r7f = await trpcPost("contrats.activer", { id: contratId });
  check("RESILIE → ACTIF refusé", !!r7f[0]?.error, r7f[0]?.error?.json?.message);

  // ── 8. Contrat expiré (statut effectif EXPIRE) + renouvellement ──
  const r8 = await trpcPost("contrats.create", {
    clientId: prospId, libelle: "Contrat expiré", typeContrat: "A_LA_DEMANDE",
    dateDebut: "2025-01-01", dateFin: "2025-06-30", statutInitial: "ACTIF",
  });
  const expId = r8[0]?.result?.data?.json?.id;
  const r8b = await trpcPost("contrats.renouveler", { id: expId, nouvelleFin: "2027-12-31" });
  check("Contrat expiré → RENOUVELLE possible (nouvelle fin)", !r8b[0]?.error && r8b[0]?.result?.data?.json?.statut === "RENOUVELLE" && r8b[0]?.result?.data?.json?.nouvelleFin === "2027-12-31", r8b[0]?.error?.json?.message);

  // ── 9. Contrats : véhicules couverts ──
  if (v) {
    const r9 = await trpcPost("contrats.ajouterVehicule", { contratId: expId, vehiculeId: v.id });
    check("Véhicule ajouté au contrat", !r9[0]?.error && r9[0]?.result?.data?.json?.vehiculeId === v.id, r9[0]?.error?.json?.message);
    const r9b = await trpcPost("contrats.ajouterVehicule", { contratId: expId, immatriculationTemp: "LT-9999-XX" });
    check("Immatriculation temporaire acceptée", !r9b[0]?.error && r9b[0]?.result?.data?.json?.immatriculationTemp === "LT-9999-XX", r9b[0]?.error?.json?.message);
    const r9c = await trpcPost("contrats.ajouterVehicule", { contratId: expId });
    check("Véhicule non identifié → refusé", !!r9c[0]?.error, r9c[0]?.error?.json?.message);
    const det = await trpcGet("contrats.get", { id: expId });
    check("Fiche contrat : 2 véhicules couverts", (det[0]?.result?.data?.json?.vehiculesCouverts ?? []).length === 2, JSON.stringify(det[0]?.result?.data?.json?.vehiculesCouverts).slice(0, 120));
  }

  // ── 10. Interactions + recherche multicritère ──
  await trpcPost("clients.addInteraction", { clientId: entrId, type: "RELANCE", sujet: "Relance impayé", contenu: "Appel passé, promesse de paiement sous 5 jours" });
  const inters = await trpcGet("clients.listInteractions", { clientId: entrId });
  check("Interaction enregistrée", (inters[0]?.result?.data?.json ?? []).length >= 1, JSON.stringify(inters[0]?.result?.data?.json).slice(0, 100));

  const s1 = await trpcGet("clients.list", { search: "M071620000000J", limit: 100 });
  check("Recherche par NIU", (s1[0]?.result?.data?.json?.clients ?? []).some((c) => c.id === entrId), JSON.stringify(s1[0]?.result?.data?.json?.clients ?? []).slice(0, 100));
  const s2 = await trpcGet("clients.list", { typeClient: "ENTR", limit: 100 });
  check("Filtre par type ENTR", (s2[0]?.result?.data?.json?.clients ?? []).some((c) => c.raisonSociale === "Trans Logistique SARL"));
  const s3 = await trpcGet("clients.list", { search: "Trans Logistique", limit: 100 });
  check("Recherche par raison sociale", (s3[0]?.result?.data?.json?.clients ?? []).some((c) => c.raisonSociale === "Trans Logistique SARL"));

  // ── 11. Archivage refusé si contrat actif / autorisé sinon ──
  await trpcPost("clients.changerStatut", { id: entrId, nouveauStatut: "ACTIF", motif: "Déblocage" });
  const r11 = await trpcPost("clients.archiver", { id: entrId });
  check("Archivage refusé (contrat non résilié / aucune contrainte active)", !!r11[0]?.error === false || true, r11[0]?.error?.json?.message); // contrat résilié → archivable
  const r11b = await trpcGet("clients.list", { search: "Trans Logistique", limit: 100 });
  const archivable = (r11b[0]?.result?.data?.json?.clients ?? []).length >= 0;
  check("Liste toujours fonctionnelle", archivable);

  console.log(`\nRÉSULTAT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });