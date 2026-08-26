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

  // ── 1. Réception complète : véhicule + client + priorité + promesse (idempotent) ──
  const exV = await trpcGet("vehicules.list", { search: "LT-PARC-01", limit: 10 });
  const ex = (exV[0]?.result?.data?.json?.vehicules ?? []).find((x) => x.immatriculation === "LT-PARC-01");
  let vehId = ex?.id;
  if (!vehId) {
    const rv = await trpcPost("vehicules.create", { immatriculation: "LT-PARC-01", marque: "Toyota", modele: "Corolla", typeVehicule: "voiture" });
    vehId = rv[0]?.result?.data?.json?.id;
  }
  const rc = await trpcPost("clients.create", { typeClient: "PART", civilite: "M", nom: "Parc", prenom: "Test", telephone: "699 00 00 01" });
  const clientId = rc[0]?.result?.data?.json?.id;

  const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10); // promesse passée → RETARD
  const ro = await trpcPost("or.create", {
    vehiculeId: vehId, clientId, plainte: "Bruit au freinage", priorite: "P1",
    motEntree: "PANNE", datePromesse: hier, emplacement: "Pont 1",
    clientAttendSurPlace: true, notes: "Client attend",
  });
  const or = ro[0]?.result?.data?.json;
  console.log("réception:", JSON.stringify(or).slice(0, 140));
  check("Réception : OR créé (EN_ATTENTE_DIAGNOSTIC, P1)", !ro[0]?.error && or?.statut === "EN_ATTENTE_DIAGNOSTIC" && or?.priorite === "P1" && or?.emplacement === "Pont 1" && or?.datePromesse === hier, ro[0]?.error?.json?.message);
  const orId = or?.id;

  const d1 = await trpcGet("or.getById", { id: orId });
  const f1 = d1[0]?.result?.data?.json;
  check("Historique CREATION tracé", (f1?.historique ?? []).some((h) => h.type === "CREATION" && h.nouvelleValeur === "EN_ATTENTE_DIAGNOSTIC"), JSON.stringify(f1?.historique).slice(0, 150));
  check("Alerte RETARD (promesse dépassée)", f1?.alerte === "RETARD", `alerte=${f1?.alerte} retard=${f1?.retardJours}`);

  // ── 2. Statuts : BLOQUE exige une raison ──
  const r2a = await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "BLOQUE" });
  check("BLOQUE sans raison → refusé", !!r2a[0]?.error && /raison/.test(r2a[0].error.json.message), r2a[0]?.error?.json?.message);
  const r2b = await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "BLOQUE", raison: "Validation client", commentaire: "Devis envoyé" });
  check("BLOQUE avec raison → OK", !r2b[0]?.error && r2b[0]?.result?.data?.json?.statut === "BLOQUE", r2b[0]?.error?.json?.message);
  const d2 = await trpcGet("or.getById", { id: orId });
  check("Raison de blocage persistée", d2[0]?.result?.data?.json?.raisonBlocage === "Validation client", d2[0]?.result?.data?.json?.raisonBlocage);
  check("Historique STATUT tracé (→ BLOQUE)", (d2[0]?.result?.data?.json?.historique ?? []).some((h) => h.type === "STATUT" && h.nouvelleValeur === "BLOQUE" && h.ancienneValeur === "EN_ATTENTE_DIAGNOSTIC"));

  // ── 3. Priorité : changement historisé ──
  const r3 = await trpcPost("or.changerPriorite", { id: orId, priorite: "P2", motif: "Client accepte le report" });
  check("Priorité changée (P1 → P2)", !r3[0]?.error && r3[0]?.result?.data?.json?.priorite === "P2", r3[0]?.error?.json?.message);
  const d3 = await trpcGet("or.getById", { id: orId });
  check("Historique PRIORITE tracé", (d3[0]?.result?.data?.json?.historique ?? []).some((h) => h.type === "PRIORITE" && h.ancienneValeur === "P1" && h.nouvelleValeur === "P2"));

  // ── 4. Assignation technicien + planning ──
  const rh = await trpcGet("rh.list", { limit: 50, statut: "actif" });
  const tech = (rh[0]?.result?.data?.json?.employees ?? []).find((e) => e.fonction?.toLowerCase().includes("méc") || e.fonction?.toLowerCase().includes("techn"));
  const techId = tech?.id ?? (rh[0]?.result?.data?.json?.employees ?? [])[0]?.id;
  const r4 = await trpcPost("or.assignerTechnicien", { id: orId, technicienId: techId, commentaire: "Affectation du jour" });
  check("Technicien assigné", !r4[0]?.error, r4[0]?.error?.json?.message);
  const d4 = await trpcGet("or.getById", { id: orId });
  check("Historique RESPONSABLE tracé", (d4[0]?.result?.data?.json?.historique ?? []).some((h) => h.type === "RESPONSABLE"));
  const plan = await trpcGet("or.getPlanning", {});
  const pl = plan[0]?.result?.data?.json;
  check("Planning : véhicule assigné au technicien", (pl?.parTechnicien ?? []).some((t) => t.technicien.id === techId && t.vehicules.some((v) => v.id === orId)), JSON.stringify(pl?.parTechnicien?.map((t) => [t.technicien.id, t.vehicules.length])).slice(0, 150));
  check("Planning : charge affichée (80 % max)", (pl?.parTechnicien ?? []).every((t) => typeof t.charge.pourcent === "number"));

  // ── 5. Cycle complet jusqu'à la livraison ──
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "EN_COURS" });
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "CONTROLE_QUALITE" });
  const r5 = await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "PRET_A_LIVRER" });
  check("CONTROLE_QUALITE → PRET_A_LIVRER", r5[0]?.result?.data?.json?.statut === "PRET_A_LIVRER", r5[0]?.error?.json?.message);
  const r5b = await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "LIVRE" });
  check("PRET_A_LIVRER → LIVRE", r5b[0]?.result?.data?.json?.statut === "LIVRE", r5b[0]?.error?.json?.message);
  const ficheV = await trpcGet("vehicules.get", { id: vehId });
  check("Véhicule passé SORTI après livraison", ficheV[0]?.result?.data?.json?.vehicule?.statutImmobilisation === "sorti", ficheV[0]?.result?.data?.json?.vehicule?.statutImmobilisation);
  const r5c = await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "EN_COURS" });
  check("LIVRE → EN_COURS refusé (terminal)", !!r5c[0]?.error, r5c[0]?.error?.json?.message);

  // ── 6. Dashboard : KPIs + répartitions (OR livré exclu, ré-entrée véhicule) ──
  // Ré-entrée du véhicule (sorti après livraison) puis nouveau OR
  await trpcPost("vehicules.changerStatut", { id: vehId, nouveauStatut: "en_reception", motif: "Ré-entrée" });
  const ro2 = await trpcPost("or.create", { vehiculeId: vehId, clientId, plainte: "Révision", priorite: "P3", motEntree: "ENTRETIEN", datePromesse: new Date(Date.now() + 86400000).toISOString().slice(0, 10) });
  const or2Id = ro2[0]?.result?.data?.json?.id;
  check("2e OR ouvert (véhicule ré-entré)", !!or2Id, ro2[0]?.error?.json?.message);
  const dash = await trpcGet("or.getDashboard", {});
  const d = dash[0]?.result?.data?.json;
  console.log("KPIs:", JSON.stringify(d?.kpis));
  check("OR livré exclu du parc", !(d?.parc ?? []).some((p) => p.id === orId), `orId=${orId} présent`);
  check("Nouvel OR actif présent dans le parc", (d?.parc ?? []).some((p) => p.id === or2Id));
  check("Répartition par priorité : P3 ≥ 1", ((d?.repPriorite ?? []).find((r) => r.priorite === "P3")?.nombre ?? 0) >= 1, JSON.stringify(d?.repPriorite).slice(0, 120));
  check("Répartition par statut", (d?.repStatut ?? []).some((s) => s.statut === "EN_ATTENTE_DIAGNOSTIC"), JSON.stringify(d?.repStatut).slice(0, 120));
  check("Parc : alertes calculées sur chaque ligne", (d?.parc ?? []).every((p) => typeof p.joursImmobilisation === "number" && typeof p.alerte === "string"), JSON.stringify(d?.parc ?? []).slice(0, 150));

  // ── 7. Alertes actives ──
  const alertes = await trpcGet("or.getAlertes", {});
  const al = alertes[0]?.result?.data?.json;
  check("Vue alertes : structures présentes", !!al && Array.isArray(al.enRetard) && Array.isArray(al.bloques) && Array.isArray(al.p1NonTermines), JSON.stringify(al).slice(0, 80));

  // ── 8. Paramètres : seuils modifiables ──
  const p1 = await trpcGet("or.getParametresAtelier", {});
  check("Paramètres atelier accessibles (seuils + listes)", !!p1[0]?.result?.data?.json?.seuilPromesseJours && Array.isArray(p1[0]?.result?.data?.json?.emplacements) && Array.isArray(p1[0]?.result?.data?.json?.raisonsBlocage), JSON.stringify(p1[0]?.result?.data?.json).slice(0, 100));
  const p2 = await trpcPost("or.updateParametresAtelier", { seuilPromesseJours: 2, seuilImmobilisationJours: 7, seuilBloqueJours: 4 });
  check("Paramètres mis à jour", !p2[0]?.error, p2[0]?.error?.json?.message);
  const p3 = await trpcGet("or.getParametresAtelier", {});
  check("Nouveaux seuils relus", p3[0]?.result?.data?.json?.seuilPromesseJours === 2 && p3[0]?.result?.data?.json?.seuilImmobilisationJours === 7, JSON.stringify(p3[0]?.result?.data?.json).slice(0, 100));

  // ── 9. Photo + liste ──
  const r9 = await trpcPost("or.ajouterPhoto", { id: or2Id, url: "/photos/test-car.jpg" });
  check("Photo ajoutée", !r9[0]?.error && r9[0]?.result?.data?.json?.url === "/photos/test-car.jpg", r9[0]?.error?.json?.message);
  const d9 = await trpcGet("or.getById", { id: or2Id });
  check("Photo visible dans la fiche", (d9[0]?.result?.data?.json?.photos ?? []).length >= 1);

  console.log(`\nRÉSULTAT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });