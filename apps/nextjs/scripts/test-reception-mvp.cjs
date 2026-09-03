const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";

(async () => {
  const c = new Client({ connectionString: DSN });
  await c.connect();
  const suffix = Date.now().toString(36).slice(-5);
  const immat = `RC-${suffix.toUpperCase()}-AB`;
  for (const p of [`RC-%-AB`, `RG-%-CD`, `RD-%-EF`, `RH-%-EF`]) {
    await c.query("DELETE FROM lignes_ordre_reparation WHERE ordre_id IN (SELECT id FROM ordres_reparation WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation LIKE $1))", [p]);
    await c.query("DELETE FROM ordres_reparation WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation LIKE $1)", [p]);
    await c.query("UPDATE vehicules SET is_active=false WHERE immatriculation LIKE $1", [p]);
  }
  const catFiltre = (await c.query("SELECT id FROM categories WHERE code='G010101'")).rows[0]?.id;
  const uniteBase = (await c.query("SELECT id FROM unites_mesure ORDER BY id LIMIT 1")).rows[0]?.id;
  const prodFiltre = (await c.query("SELECT id FROM produits WHERE categorie_id=$1 LIMIT 1", [catFiltre])).rows[0]?.id;
  const emp13 = 13;
  await c.end();

  const jar = new Map();
  async function http(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    const ck = [...jar.entries()].map(([k, v]) => k + "=" + v).join("; ");
    if (ck) headers.cookie = ck;
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

  // ── 1. Réception complète : nouveau client + nouveau véhicule + dossier ──
  const outillage = { cric: { present: true, observation: "" }, cle_de_roue: { present: true, observation: "" }, triangle: { present: false, observation: "manquant" }, autres: { present: true, observation: "1 gilet de sécurité" } };
  const rec = await trpcPost("or.receptionner", {
    client: { nom: `ClientTest${suffix}`, prenom: "Jean", telephone: "0612345678", email: `t${suffix}@t.com` },
    vehicule: { immatriculation: immat, numeroChassis: "VF3" + suffix + "123456", typeVehicule: "voiture", marque: "Peugeot", modele: "308", version: "Allure", annee: 2019, couleur: "Gris", carburant: "diesel", kilometrage: 87540 },
    chauffeur: { nom: "Martin", telephone: "0698765432" },
    reception: {
      kilometrageEntree: 87540,
      niveauCarburantEntree: "1/2",
      pannesDeclarees: "Voyant moteur allumé + bruit à l'accélération",
      observationsReception: "Client pressé, souhaite devis rapide",
      motEntree: "PANNE",
      typeIntervention: "ATELIER",
      outillage,
      photos: [],
      signatureDeposant: "Jean ClientTest",
      priorite: "P2",
    },
  });
  const orId = Number(rec[0]?.result?.data?.json?.id);
  const numero = rec[0]?.result?.data?.json?.numero;
  check("Réception : client+véhicule+dossier créés (OR généré)", !!orId && /^OR-\d{2}-\d{4}$/.test(numero ?? ""), JSON.stringify(rec[0]?.result?.data?.json));
  const c2 = new Client({ connectionString: DSN });
  await c2.connect();
  const orBd = (await c2.query("SELECT numero, kilometrage_entree, niveau_carburant_entree, pannes_declarees, observations_reception, signature_deposant, type_intervention, outillage, date_fermeture FROM ordres_reparation WHERE id=$1", [orId])).rows[0];
  check("Dossier complet : km, carburant, pannes, signature, type", Number(orBd.kilometrage_entree) === 87540 && orBd.niveau_carburant_entree === "1/2" && orBd.pannes_declarees?.includes("Voyant") && orBd.signature_deposant?.includes("ClientTest") && orBd.type_intervention === "ATELIER", JSON.stringify(orBd).slice(0, 200));
  check("Check-list outillage stockée (jsonb)", orBd.outillage?.cric?.present === true && orBd.outillage?.triangle?.present === false && orBd.outillage?.autres?.observation?.includes("gilet"), JSON.stringify(orBd.outillage).slice(0, 150));
  const vehBd = (await c2.query("SELECT id, client_id, chauffeur_nom, chauffeur_telephone, version FROM vehicules WHERE immatriculation=$1", [immat])).rows[0];
  check("Véhicule lié au client + chauffeur + version", !!vehBd?.client_id && vehBd.chauffeur_nom === "Martin" && vehBd.version === "Allure", JSON.stringify(vehBd));
  const cliBd = (await c2.query("SELECT id, telephone FROM clients WHERE nom LIKE $1", [`ClientTest${suffix}%`])).rows[0];
  check("Client créé avec téléphone", !!cliBd?.telephone, "client absent");

  // ── 2. Recherche unifiée : retrouver par immatriculation / nom ──
  const rech = await trpcGet("or.rechercherReception", { q: immat });
  check("Recherche unifiée : véhicule trouvé par plaque", (rech[0]?.result?.data?.json?.vehicules ?? []).some((v) => v.immatriculation === immat), "introuvable");
  const rechNom = await trpcGet("or.rechercherReception", { q: `ClientTest${suffix}` });
  check("Recherche unifiée : client trouvé par nom", (rechNom[0]?.result?.data?.json?.clients ?? []).some((cl) => String(cl.nom).includes(suffix)), "introuvable");

  // ── 3. Réception d'un véhicule EXISTANT → nouveau dossier, même véhicule ──
  const rec2 = await trpcPost("or.receptionner", {
    client: { id: cliBd.id, nom: `ClientTest${suffix}` },
    vehicule: { id: vehBd.id, immatriculation: immat, marque: "Peugeot", modele: "308" },
    reception: { kilometrageEntree: 87800, pannesDeclarees: "Révision complète", motEntree: "ENTRETIEN", typeIntervention: "ENTRETIEN", outillage: {}, signatureDeposant: "Jean" },
  });
  const or2Id = Number(rec2[0]?.result?.data?.json?.id);
  const cntVeh = (await c2.query("SELECT COUNT(*) n FROM vehicules WHERE immatriculation=$1 AND is_active=true", [immat])).rows[0];
  check("Véhicule existant réutilisé (2e dossier, pas de doublon)", !!or2Id && Number(cntVeh.n) === 1, "doublon créé");

  // ── 4. Sortie stricte : PIECE sans véhicule refusée ──
  await trpcPost("stock.ajouterStock", { produitId: prodFiltre, quantite: 5, emplacementId: 2, motif: "Approvisionnement test réception" });
  const sansVeh = await trpcPost("stock.sortirPourUsage", { produitId: prodFiltre, quantite: 1, motif: "Test sortie libre" });
  check("Sortie PIECE sans véhicule REFUSÉE (règle 1.1)", !!sansVeh[0]?.error && /véhicule/.test(sansVeh[0].error.json.message), sansVeh[0]?.error?.json?.message);
  const avecVeh = await trpcPost("stock.sortirPourUsage", { produitId: prodFiltre, quantite: 1, vehiculeId: vehBd.id, motif: "Sortie justifiée par véhicule" });
  check("Sortie PIECE avec véhicule acceptée", !avecVeh[0]?.error, avecVeh[0]?.error?.json?.message);

  // ── 5. Fermeture définitive ──
  const fermeTot = await trpcPost("or.fermerDefinitivement", { id: orId, motif: "Test trop tôt" });
  check("Fermeture refusée avant livraison", !!fermeTot[0]?.error, fermeTot[0]?.error?.json?.message);
  const seq = ["EN_ATTENTE_VALIDATION_DIAGNOSTIC", "EN_COURS", "CONTROLE_QUALITE", "PRET_A_LIVRER"];
  let okSeq = true;
  for (const st of seq) {
    const r = await trpcPost("or.changerStatut", { id: orId, nouveauStatut: st });
    if (r[0]?.error) okSeq = false;
  }
  check("Dossier avancé jusqu'à PRÊT À LIVRER", okSeq, "transition refusée");
  const fermeOk = await trpcPost("or.fermerDefinitivement", { id: orId, motif: "Clôture définitive" });
  check("Fermeture définitive acceptée (PRÊT À LIVRER)", !fermeOk[0]?.error, fermeOk[0]?.error?.json?.message);
  const orFerme = (await c2.query("SELECT statut, date_fermeture FROM ordres_reparation WHERE id=$1", [orId])).rows[0];
  check("Statut = ferme_definitif + date", orFerme.statut === "ferme_definitif" && !!orFerme.date_fermeture, JSON.stringify(orFerme));
  const addLigneApres = await trpcPost("or.addLigne", { ordreId: orId, type: "SERVICE", libelle: "Test après fermeture", quantite: 1, prixUnitaire: 1000 });
  check("addLigne REFUSÉE après fermeture", !!addLigneApres[0]?.error && /fermé définitivement/.test(addLigneApres[0].error.json.message), addLigneApres[0]?.error?.json?.message);
  const factureApres = await trpcPost("or.facturer", { id: orId, modePaiement: "especes" });
  check("Facturation REFUSÉE après fermeture", !!factureApres[0]?.error && /fermé définitivement/.test(factureApres[0].error.json.message), factureApres[0]?.error?.json?.message);

  // ── 6. Facture ajustable : 1re facture + complément après ajout de ligne ──
  await trpcPost("or.addLigne", { ordreId: or2Id, type: "SERVICE", libelle: "Vidange complète", quantite: 1, prixUnitaire: 15000 });
  await trpcPost("or.addLigne", { ordreId: or2Id, type: "PIECE", libelle: "Filtre à huile", quantite: 1, prixUnitaire: 5000 });
  for (const st of ["EN_ATTENTE_VALIDATION_DIAGNOSTIC", "EN_COURS", "CONTROLE_QUALITE", "PRET_A_LIVRER"]) await trpcPost("or.changerStatut", { id: or2Id, nouveauStatut: st });
  const f1 = await trpcPost("or.facturer", { id: or2Id, modePaiement: "especes" });
  check("1re facture (20000)", !f1[0]?.error && Number(f1[0]?.result?.data?.json?.montantTotal) === 20000, JSON.stringify(f1[0]?.result?.data?.json ?? f1[0]?.error?.json?.message));
  await trpcPost("or.addLigne", { ordreId: or2Id, type: "SERVICE", libelle: "Travail supplémentaire", quantite: 1, prixUnitaire: 8000 });
  const f2 = await trpcPost("or.facturer", { id: or2Id, modePaiement: "especes" });
  check("Facture du RESTANT après ajout de ligne (8000)", !f2[0]?.error && Number(f2[0]?.result?.data?.json?.montantTotal) === 8000, JSON.stringify(f2[0]?.result?.data?.json ?? f2[0]?.error?.json?.message));
  const or2Tot = (await c2.query("SELECT total_facture FROM ordres_reparation WHERE id=$1", [or2Id])).rows[0];
  check("Total facturé cumulé = 28000", Number(or2Tot.total_facture) === 28000, "t=" + or2Tot.total_facture);
  const f3 = await trpcPost("or.facturer", { id: or2Id, modePaiement: "especes" });
  check("Refacturation impossible si tout facturé", !!f3[0]?.error, f3[0]?.error?.json?.message);

  // ── 7. Facture groupée (cumulative multi-OR même client) ──
  const rec3 = await trpcPost("or.receptionner", {
    client: { id: cliBd.id, nom: `ClientTest${suffix}` },
    vehicule: { immatriculation: `RG-${suffix}-CD`, marque: "Renault", modele: "Clio" },
    reception: { kilometrageEntree: 50000, pannesDeclarees: "Freins", motEntree: "PANNE", typeIntervention: "ATELIER", outillage: {}, signatureDeposant: "Jean" },
  });
  const or3Id = Number(rec3[0]?.result?.data?.json?.id);
  await trpcPost("or.addLigne", { ordreId: or3Id, type: "PIECE", libelle: "Plaquettes avant", quantite: 1, prixUnitaire: 12000 });
  for (const st of ["EN_ATTENTE_VALIDATION_DIAGNOSTIC", "EN_COURS", "CONTROLE_QUALITE", "PRET_A_LIVRER"]) await trpcPost("or.changerStatut", { id: or3Id, nouveauStatut: st });
  const rec4 = await trpcPost("or.receptionner", {
    client: { id: cliBd.id, nom: `ClientTest${suffix}` },
    vehicule: { immatriculation: `RH-${suffix}-EF`, marque: "Toyota", modele: "Yaris" },
    reception: { kilometrageEntree: 60000, pannesDeclarees: "Amortisseurs", motEntree: "PANNE", typeIntervention: "ATELIER", outillage: {}, signatureDeposant: "Jean" },
  });
  const or4Id = Number(rec4[0]?.result?.data?.json?.id);
  await trpcPost("or.addLigne", { ordreId: or4Id, type: "PIECE", libelle: "Amortisseur arrière", quantite: 1, prixUnitaire: 8000 });
  for (const st of ["EN_ATTENTE_VALIDATION_DIAGNOSTIC", "EN_COURS", "CONTROLE_QUALITE", "PRET_A_LIVRER"]) await trpcPost("or.changerStatut", { id: or4Id, nouveauStatut: st });
  const grp = await trpcPost("or.facturerGroupe", { orIds: [or3Id, or4Id], modePaiement: "especes" });
  check("Facture groupée : 2 dossiers non facturés (12000+8000)", !grp[0]?.error && Number(grp[0]?.result?.data?.json?.montantTotal) === 20000, JSON.stringify(grp[0]?.result?.data?.json ?? grp[0]?.error?.json?.message));
  const grpVente = (await c2.query("SELECT id FROM ventes WHERE reference=$1", [grp[0]?.result?.data?.json?.reference])).rows[0];
  const grpLignes = grpVente ? (await c2.query("SELECT libelle, total_ligne FROM ventes_lignes WHERE vente_id=$1 ORDER BY id", [grpVente.id])).rows : [];
  check("Sous-totaux par OR dans la facture groupée", grpLignes.some((l) => String(l.libelle).includes("TOTAL INTERVENTION") && Number(l.total_ligne) === 12000) && grpLignes.some((l) => String(l.libelle).includes("TOTAL INTERVENTION") && Number(l.total_ligne) === 8000), JSON.stringify(grpLignes).slice(0, 250));
  const clientMulti = await trpcPost("or.facturerGroupe", { orIds: [orId, or2Id], modePaiement: "especes" });
  check("Groupe refusé si un dossier fermé", !!clientMulti[0]?.error, clientMulti[0]?.error?.json?.message);

  // ── 8. Dépannage : type + lieu ──
  const dep = await trpcPost("or.receptionner", {
    client: { id: cliBd.id, nom: `ClientTest${suffix}` },
    vehicule: { immatriculation: `RD-${suffix}-EF`, marque: "Toyota", modele: "Corolla" },
    reception: { kilometrageEntree: 100000, pannesDeclarees: "Panne sur route", motEntree: "PANNE", typeIntervention: "DEPANNAGE", lieuDepannage: "Carrefour Bastos", outillage: {}, signatureDeposant: "Jean" },
  });
  const depBd = (await c2.query("SELECT type_intervention, lieu_depannage FROM ordres_reparation WHERE id=$1", [Number(dep[0]?.result?.data?.json?.id)])).rows[0];
  check("Dépannage tracé (type + lieu)", depBd?.type_intervention === "DEPANNAGE" && depBd?.lieu_depannage === "Carrefour Bastos", JSON.stringify(depBd));

  // ── 9. Nettoyage (mouvements append-only → désactivation) ──
  for (const p of [`RC-%-AB`, `RG-%-CD`, `RD-%-EF`, `RH-%-EF`]) {
    await c2.query("DELETE FROM lignes_ordre_reparation WHERE ordre_id IN (SELECT id FROM ordres_reparation WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation LIKE $1))", [p]);
    await c2.query("DELETE FROM ordres_reparation WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation LIKE $1)", [p]);
    await c2.query("UPDATE vehicules SET is_active=false WHERE immatriculation LIKE $1", [p]);
  }
  await c2.query("DELETE FROM ventes_lignes WHERE vente_id IN (SELECT id FROM ventes WHERE client_id IN (SELECT id FROM clients WHERE nom LIKE $1))", [`ClientTest${suffix}%`]);
  await c2.query("DELETE FROM ventes WHERE client_id IN (SELECT id FROM clients WHERE nom LIKE $1)", [`ClientTest${suffix}%`]);
  await c2.query("UPDATE clients SET is_active=false WHERE nom LIKE $1", [`ClientTest${suffix}%`]);
  await c2.end();

  console.log(`\nRÉSULTAT RÉCEPTION MVP : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });