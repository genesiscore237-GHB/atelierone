const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
(async () => {
  // ── 0. Remettre le stock du produit de test (consommé par les runs précédents) ──
  const { Client } = require("pg");
  const seed = new Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp" });
  await seed.connect();
  await seed.query("DELETE FROM stocks WHERE produit_id=28; INSERT INTO stocks (agence_id, produit_id, emplacement_id, quantite, quantite_reservee) VALUES (1, 28, 2, 10, 0);");
  await seed.end();

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

  // ── 1. Préparer un véhicule avec cycle complet ──
  const cl = await trpcGet("clients.list", { limit: 10 });
  const clientId = (cl[0]?.result?.data?.json?.clients ?? [])[0]?.id;
  check("Client réel trouvé", !!clientId, "id=" + clientId);
  const suffix = Date.now().toString().slice(-4);
  const rv = await trpcPost("vehicules.create", { immatriculation: `TR-${suffix}`, marque: "Toyota", modele: "Corolla", clientId });
  const vehId = rv[0]?.result?.data?.json?.id;
  check("Véhicule créé", !!vehId, rv[0]?.error?.json?.message);
  const ro = await trpcPost("or.create", { vehiculeId: vehId, clientId, plainte: "Bruit au freinage avant", priorite: "P2", motEntree: "PANNE" });
  const orId = ro[0]?.result?.data?.json?.id;
  check("OR créé (P2)", !!orId, ro[0]?.error?.json?.message);

  const prod = await trpcGet("catalog.list", { query: "Plaquettes atelier", limit: 10 });
  const prodId = Number((prod[0]?.result?.data?.json?.items ?? []).find((p) => p.titre === "Plaquettes atelier test")?.id);
  const rd = await trpcPost("or.creerRapportDiagnostic", { orId, constat: "Plaquettes AV usées à 90%", cause: "Usure", lignes: [{ type: "PIECE", produitId: prodId, libelle: "Plaquettes", quantite: 2, prixUnitaire: 25000 }, { type: "SERVICE", libelle: "MO", quantite: 1, prixUnitaire: 10000 }] });
  const rapportId = rd[0]?.result?.data?.json?.rapportId;
  await trpcPost("or.validerDiagnostic", { rapportId, commentaire: "OK" });
  await trpcPost("or.soumettreDevis", { orId });
  await trpcPost("or.validerDevis", { orId, accepte: true });

  // Technicien pointé sur une intervention
  const emps = await trpcGet("rh.list", { limit: 100, statut: "actif" });
  const techId = Number((emps[0]?.result?.data?.json?.employees ?? []).find((e) => e.matricule === "EMP002")?.id ?? 0);
  const ri = await trpcPost("or.pointageIntervention", { orId, technicienId: techId, dateIntervention: new Date().toISOString().slice(0, 10), description: "Remplacement plaquettes", dureeHeures: 2 });
  check("Intervention pointée (EMP002, 2h)", !ri[0]?.error && !!ri[0]?.result?.data?.json?.id, ri[0]?.error?.json?.message);

  // Demandes pièces : 1 servie (2 pièces) + 1 manquante
  const dp = await trpcPost("or.creerDemandePieces", { orId, lignes: [{ produitId: prodId, quantite: 2, prixEstime: 25000 }] });
  const demandeId = dp[0]?.result?.data?.json?.demandeId;
  const demListe = await trpcGet("or.listerDemandesPieces", { orId });
  const ligne1 = (demListe[0]?.result?.data?.json ?? []).find((d) => d.id === demandeId)?.lignes?.[0]?.id;
  await trpcPost("or.traiterDemandePieces", { demandeId, actions: [{ ligneId: ligne1, servir: true, quantiteServie: 2 }] });

  const dp2 = await trpcPost("or.creerDemandePieces", { orId, lignes: [{ produitId: prodId, quantite: 1, note: "Stock épuisé" }] });
  const demande2 = dp2[0]?.result?.data?.json?.demandeId;
  const demListe2 = await trpcGet("or.listerDemandesPieces", { orId });
  const ligne2 = (demListe2[0]?.result?.data?.json ?? []).find((d) => d.id === demande2)?.lignes?.[0]?.id;
  await trpcPost("or.traiterDemandePieces", { demandeId: demande2, actions: [{ ligneId: ligne2, servir: false, motifManquant: "Indisponible en stock" }] });

  // ── 2. Le dashboard retourne tout ──
  const d = await trpcGet("or.getDashboard", {});
  const dd = d[0]?.result?.data?.json;
  const p = (dd?.parc ?? []).find((x) => x.id === orId);
  check("Dashboard : véhicule présent dans le parc", !!p, JSON.stringify(dd?.parc?.map((x) => x.numero)));
  check("Date d'entrée + plainte", !!p?.dateOuverture && p?.plainte?.includes("Bruit"), JSON.stringify({ d: p?.dateOuverture, p: p?.plainte }));
  check("Priorité P2 + statut", p?.priorite === "P2" && p?.statut === "EN_COURS", `${p?.priorite}/${p?.statut}`);
  check("Diagnostic VALIDE remonté", p?.diagnostic?.statut === "VALIDE" && p?.diagnostic?.constat?.includes("Plaquettes"), JSON.stringify(p?.diagnostic));
  check("Devis ACCEPTE remonté", p?.devis === "ACCEPTE", p?.devis);
  check("Techniciens pointés remontés", Array.isArray(p?.techniciens) && (p?.techniciens?.length ?? 0) >= 1, JSON.stringify(p?.techniciens));
  check("Interventions (nb) remontées", p?.interventions && p?.interventions?.nb >= 1, JSON.stringify(p?.interventions));
  check("Pièces : 1 demande servie + 1 manquante", p?.pieces?.servies >= 1 && p?.pieces?.manquantes >= 1 && p?.pieces?.nbDemandes === 2, JSON.stringify(p?.pieces));

  // ── 4. Facturation : PRET_A_LIVRER → facturer → LIVRE (sorti du parc) ──
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "CONTROLE_QUALITE" });
  await trpcPost("or.changerStatut", { id: orId, nouveauStatut: "PRET_A_LIVRER" });
  const d2 = await trpcGet("or.getDashboard", {});
  const p2 = (d2[0]?.result?.data?.json?.parc ?? []).find((x) => x.id === orId);
  check("Prêt à livrer → facture A_FACTURER", p2?.facture?.etat === "A_FACTURER", JSON.stringify(p2?.facture));

  const fac = await trpcPost("or.facturer", { id: orId, modePaiement: "credit" });
  const venteId = fac[0]?.result?.data?.json?.venteId;
  check("OR facturé (crédit)", !!venteId, fac[0]?.error?.json?.message);
  const total = Number(fac[0]?.result?.data?.json?.montantTotal ?? 0);

  // Après LIVRE : plus au parc, mais la fiche véhicule montre la facture NON_TRANSMISE
  const d3 = await trpcGet("or.getDashboard", {});
  check("Véhicule LIVRE sorti du parc", !(d3[0]?.result?.data?.json?.parc ?? []).some((x) => x.id === orId));
  const g = await trpcGet("vehicules.get", { id: vehId });
  const fv = g[0]?.result?.data?.json;
  check("Fiche : facture NON_TRANSMISE + montant + référence", fv?.facture?.etat === "NON_TRANSMISE" && Number(fv?.facture?.montant) > 0 && /^FAC-/.test(fv?.facture?.reference ?? ""), JSON.stringify(fv?.facture));

  const tr = await trpcPost("clients.marquerFactureTransmise", { orId });
  check("Transmission enregistrée", !tr[0]?.error, tr[0]?.error?.json?.message);
  await new Promise((r) => setTimeout(r, 1200));
  const g2 = await trpcGet("vehicules.get", { id: vehId });
  check("Fiche : facture ATTENTE_PAIEMENT après transmission", g2[0]?.result?.data?.json?.facture?.etat === "ATTENTE_PAIEMENT", g2[0]?.result?.data?.json?.facture?.etat);

  await trpcPost("finance.payDebt", { venteId: String(venteId), montant: total, modePaiement: "especes" });
  const g3 = await trpcGet("vehicules.get", { id: vehId });
  check("Fiche : facture PAYEE après encaissement", g3[0]?.result?.data?.json?.facture?.etat === "PAYEE", g3[0]?.result?.data?.json?.facture?.etat);

  console.log(`\nRÉSULTAT PARC TEMPS RÉEL : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });