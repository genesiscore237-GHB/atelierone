const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (l, o, e = "") => { if (o) { pass++; console.log("  [PASS]", l); } else { fail++; console.log("  [FAIL]", l, e); } };
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";

(async () => {
  const c = new Client({ connectionString: DSN });
  await c.connect();
  const suffix = Date.now().toString(36).slice(-5).toUpperCase();
  const immat = `AN-${suffix}-AB`;
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
  const csrf = await (await http("/api/auth/csrf")).json();
  await http("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: BASE + "/dashboard" }) });

  // 1. Réception avec annee (le bug : string → number)
  const rec = await trpcPost("or.receptionner", {
    client: { nom: `AnneeTest${suffix}`, telephone: "690000000" },
    vehicule: { immatriculation: immat, marque: "Toyota", modele: "Corolla", annee: 2019, kilometrage: 45000, couleur: "noir" },
    reception: { kilometrageEntree: 45000, pannesDeclarees: "Bruit moteur", motEntree: "PANNE", signatureDeposant: "Test", outillage: {} },
  });
  check("Réception avec annee (number) acceptée", !rec[0]?.error && rec[0]?.result?.data?.json?.id, JSON.stringify(rec[0]?.error?.json ?? rec[0]?.error));

  // 2. Réception avec annee vide (le cas "" → le client convertit en undefined) : acceptée
  const immat2 = `AN2-${suffix.slice(0,3)}-CD`;
  const rec2 = await trpcPost("or.receptionner", {
    client: { nom: `AnneeTest2${suffix}` },
    vehicule: { immatriculation: immat2, marque: "Toyota", modele: "Yaris", annee: undefined, kilometrage: undefined },
    reception: { kilometrageEntree: 10000, pannesDeclarees: "Test", motEntree: "PANNE", signatureDeposant: "T", outillage: {} },
  });
  check("Réception avec annee vide OK (undefined)", !rec2[0]?.error && rec2[0]?.result?.data?.json?.id, JSON.stringify(rec2[0]?.error?.json));

  // 3. Page Parc + Lien vers la vraie page de réception (client-gated par permission)
  const parc = await http("/dashboard/atelier/parc", {});
  check("Page Pilotage du parc 200", parc.status === 200, "status=" + parc.status);
  const recPage = await http("/dashboard/atelier/reception", {});
  check("Page Réception véhicule 200", recPage.status === 200, "status=" + recPage.status);
  const fs = require("fs");
  const parcSrc = fs.readFileSync("apps/nextjs/src/app/(dashboard)/dashboard/atelier/parc/_components/ParcDashboard.tsx", "utf8");
  check("Bouton 'Nouvelle réception' → Link /dashboard/atelier/reception (source)", parcSrc.includes('Link href="/dashboard/atelier/reception"'), "lien absent dans le source");
  check("Modale de réception rapide SUPPRIMÉE du parc", !parcSrc.includes("ReceptionModal"), "modale encore présente");

  // Nettoyage
  const c2 = new Client({ connectionString: DSN });
  await c2.connect();
  await c2.query("DELETE FROM lignes_ordre_reparation WHERE ordre_id IN (SELECT id FROM ordres_reparation WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation LIKE $1))", [`AN-%`]);
  await c2.query("DELETE FROM ordres_reparation WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation LIKE $1)", [`AN-%`]);
  await c2.query("UPDATE vehicules SET is_active=false WHERE immatriculation LIKE $1", [`AN-%`]);
  await c2.query("UPDATE clients SET is_active=false WHERE nom LIKE $1", [`AnneeTest%`]);
  await c2.end();

  console.log(`\nRÉSULTAT FIX RÉCEPTION : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });