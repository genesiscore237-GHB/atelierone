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

  console.log("=== ÉVOLUTIONS E1-E5 : notifications, traçabilité commande↔demande, retour stock, marge, accusé ===");

  // Préparation : client + véhicule + OR
  const c = await trpcPost("clients.create", { typeClient: "PART", civilite: "M", nom: `Test Evo ${TS}`, prenom: "Notifs", telephone: `699${String(TS).slice(-7)}` });
  const clientId = c[0]?.result?.data?.json?.id;
  const v = await trpcPost("vehicules.create", { immatriculation: `LT-EVO-${TS}`, clientId, marque: "Mazda", modele: "CX-5", typeVehicule: "voiture" });
  const vehId = v[0]?.result?.data?.json?.id;
  const ro = await trpcPost("or.create", { vehiculeId: vehId, clientId, plainte: "Climatisation HS", priorite: "P2", motEntree: "DIAGNOSTIC" });
  const orId = ro[0]?.result?.data?.json?.id;

  // ── E1 : notification DIAGNOSTIC_A_VALIDER au diagnostic soumis ──
  const prod = await trpcGet("catalog.list", { query: "Plaquettes atelier", limit: 10 });
  const prodId = Number((prod[0]?.result?.data?.json?.items ?? []).find((p) => p.titre === "Plaquettes atelier test")?.id);
  const rd = await trpcPost("or.creerRapportDiagnostic", {
    orId, constat: "Compresseur climatisation HS",
    lignes: [{ type: "PIECE", produitId: prodId, libelle: "Kit climatisation", quantite: 1, prixUnitaire: 45000 }],
  });
  const rapportId = rd[0]?.result?.data?.json?.rapportId;
  const n1 = await trpcGet("or.listNotifsAtelier", { lu: false });
  const notifDiag = (n1[0]?.result?.data?.json ?? []).find((n) => n.orId === orId && n.type === "DIAGNOSTIC_A_VALIDER");
  check("E1 — Notification DIAGNOSTIC_A_VALIDER générée", !!notifDiag, JSON.stringify(n1[0]?.result?.data?.json ?? []).slice(0, 120));

  // Validation chef → la notif reste (traitée manuellement), devis accepté
  await trpcPost("or.validerDiagnostic", { rapportId });
  await trpcPost("or.soumettreDevis", { orId });
  await trpcPost("or.validerDevis", { orId, accepte: true });

  // ── E3+E1 : demande MANQUANTE → notification → commande LIÉE à la demande ──
  const rdm = await trpcPost("or.creerDemandePieces", { orId, lignes: [{ produitId: prodId, quantite: 1 }] });
  const demandeId = rdm[0]?.result?.data?.json?.demandeId;
  const demListe = await trpcGet("or.listerDemandesPieces", { orId });
  const ligneId = (demListe[0]?.result?.data?.json ?? []).find((d) => d.id === demandeId)?.lignes?.[0]?.id;
  await trpcPost("or.traiterDemandePieces", { demandeId, actions: [{ ligneId, servir: false, motifManquant: "Rupture" }] });
  const n2 = await trpcGet("or.listNotifsAtelier", { lu: false });
  check("E1 — Notification PIECE_MANQUANTE générée", (n2[0]?.result?.data?.json ?? []).some((n) => n.orId === orId && n.type === "PIECE_MANQUANTE"), JSON.stringify(n2[0]?.result?.data?.json ?? []).slice(0, 150));

  const fournisseurs = await trpcGet("reference.listFournisseurs", {});
  let fournisseurId = (fournisseurs[0]?.result?.data?.json ?? [])[0]?.id;
  if (!fournisseurId) {
    const rf = await trpcPost("procurement.createFournisseur", { nom: "Fournisseur Evo", telephone: "677 00 00 00" });
    fournisseurId = rf[0]?.result?.data?.json?.id;
  }
  const rcmd = await trpcPost("or.creerCommandeFournisseur", { orId, demandeId, fournisseurId, lignes: [{ produitId: prodId, quantite: 2, prixUnitaire: 20000 }] });
  const achatId = rcmd[0]?.result?.data?.json?.achatId;
  check("E3 — Commande liée à la DEMANDE (traçabilité complète)", !!achatId, rcmd[0]?.error?.json?.message);
  const cmds = await trpcGet("or.listerCommandesFournisseur", { orId });
  const cmdLiee = (cmds[0]?.result?.data?.json ?? [])[0];
  check("E3 — Commande visible dans la fiche OR", !!cmdLiee, JSON.stringify(cmds[0]?.result?.data?.json).slice(0, 100));
  const n3 = await trpcGet("or.listNotifsAtelier", { lu: false });
  check("E1 — Notification COMMANDE_PASSEE générée", (n3[0]?.result?.data?.json ?? []).some((n) => n.orId === orId && n.type === "COMMANDE_PASSEE"), JSON.stringify(n3[0]?.result?.data?.json ?? []).slice(0, 120));

  // ── E1 : réception fournisseur → notification PIECE_ARRIVEE sur l'OR ──
  await trpcPost("procurement.receivePurchaseOrder", { id: String(achatId), lignes: [{ produitId: String(prodId), quantiteRecue: 2, prixUnitaire: 20000 }] });
  const n4 = await trpcGet("or.listNotifsAtelier", { lu: false });
  check("E1 — Notification PIECE_ARRIVEE générée à la réception", (n4[0]?.result?.data?.json ?? []).some((n) => n.orId === orId && n.type === "PIECE_ARRIVEE"), JSON.stringify(n4[0]?.result?.data?.json ?? []).slice(0, 150));

  // ── E1 : marquer lu / tout marquer lu ──
  const firstNotif = (n4[0]?.result?.data?.json ?? [])[0];
  const rl = await trpcPost("or.marquerNotifLu", { id: Number(firstNotif.id) });
  check("E1 — Notification marquée lue", !rl[0]?.error, rl[0]?.error?.json?.message);

  // ── E2 : pièce défaillante EN STOCK → retour avec impact stock ──
  // Stock actuel du produit après réception : seed 10 − service test ? On lit via mouvement
  const mvtsAvant = await trpcGet("stock.getMouvements", { produitId: String(prodId), limit: 3 });
  const dernierStock = Number((mvtsAvant[0]?.result?.data?.json ?? [])[0]?.stockApres ?? 0);
  const rr = await trpcPost("or.creerRetourFournisseur", { orId, achatId, fournisseurId, motif: "DEFAILLANTE", impacteStock: true, commentaire: "Pièce défectueuse renvoyée", lignes: [{ produitId: prodId, quantite: 1, note: "Défaut usine" }] });
  const retourId = rr[0]?.result?.data?.json?.retourId;
  check("E2 — Retour fournisseur avec impact stock créé", !!retourId, rr[0]?.error?.json?.message);
  const mvtsApres = await trpcGet("stock.getMouvements", { produitId: String(prodId), limit: 3 });
  const mvtRetour = (mvtsApres[0]?.result?.data?.json ?? []).find((m) => m.type === "RETOUR_FOURNISSEUR");
  check("E2 — Mouvement RETOUR_FOURNISSEUR tracé (sortie de stock)", !!mvtRetour && Number(mvtRetour.stockApres) === dernierStock - 1, JSON.stringify(mvtsApres[0]?.result?.data?.json ?? []).slice(0, 140));

  // ── Fin du cycle pour la marge : servir la pièce restante, livrer, facturer ──
  const rdm2 = await trpcPost("or.creerDemandePieces", { orId, lignes: [{ produitId: prodId, quantite: 1 }] });
  const dem2 = await trpcGet("or.listerDemandesPieces", { orId });
  const ligne2Id = (dem2[0]?.result?.data?.json ?? []).find((d) => d.id === rdm2[0]?.result?.data?.json?.demandeId)?.lignes?.[0]?.id;
  await trpcPost("or.traiterDemandePieces", { demandeId: rdm2[0]?.result?.data?.json?.demandeId, actions: [{ ligneId: ligne2Id, servir: true, quantiteServie: 1 }] });
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "CONTROLE_QUALITE" });
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "PRET_A_LIVRER" });
  const fact = await trpcPost("or.facturer", { id: orId, modePaiement: "especes" });
  check("Cycle terminé + facturé", !fact[0]?.error && /^FAC-/.test(fact[0]?.result?.data?.json?.reference ?? ""), fact[0]?.error?.json?.message);

  // ── E4 : marge par OR (revenu − coût pièces CMP) ──
  const marge = await trpcGet("or.getMargeOr", { orId });
  const m = marge[0]?.result?.data?.json;
  console.log("marge:", JSON.stringify(m).slice(0, 200));
  check("E4 — Marge calculée (revenu − coût CMP)", m?.facture === true && typeof m.marge === "number" && m.revenu > 0, JSON.stringify(m).slice(0, 160));
  check("E4 — Coût pièces basé sur le CMP (> 0)", Number(m?.coutPieces ?? 0) > 0, `cout=${m?.coutPieces}`);

  // ── E5 : accusé de réception (texte rempli + WhatsApp) ──
  const ar = await trpcGet("or.accuseReception", { orId });
  const arData = ar[0]?.result?.data?.json;
  console.log("accusé:", JSON.stringify(arData).slice(0, 220));
  check("E5 — Texte accusé rempli (immat + OR + promesse)", !!arData?.texte && arData.texte.includes(`LT-EVO-${TS}`) && arData.texte.includes(arData.numeroOR), arData?.texte);
  check("Lien WhatsApp cliquable généré", !!arData?.whatsappUrl && arData.whatsappUrl.startsWith("https://wa.me/"), arData?.whatsappUrl);

  console.log(`\nRÉSULTAT ÉVOLUTIONS: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });