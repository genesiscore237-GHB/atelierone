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

  console.log("=== T6 — COHÉRENCE RH ↔ ATELIER (technicien → planning → pointage → paie) ===");

  // 1. Le technicien EMP003 (Chef des ateliers, 300 000 F, horaire) existe dans RH
  const rh = await trpcGet("rh.list", { search: "Takoueta", limit: 10 });
  const tech = (rh[0]?.result?.data?.json?.employees ?? []).find((e) => e.matricule === "EMP003");
  check("Technicien EMP003 présent (RH)", !!tech, JSON.stringify(rh[0]?.result?.data?.json?.employees ?? []).slice(0, 120));
  const techId = tech?.id;

  // 2. Un OR lui est assigné → le planning atelier le montre
  const c = await trpcPost("clients.create", { typeClient: "PART", civilite: "M", nom: "Test RH Atelier", prenom: "Technicien", telephone: "699 66 66 66" });
  const clientId = c[0]?.result?.data?.json?.id;
  const v = await trpcPost("vehicules.create", { immatriculation: `LT-RHA-${Date.now()}`, clientId, marque: "Hyundai", modele: "i10", typeVehicule: "voiture" });
  const vehId = v[0]?.result?.data?.json?.id;
  const ro = await trpcPost("or.create", { vehiculeId: vehId, clientId, plainte: "Vidange", priorite: "P2", motEntree: "ENTRETIEN", responsableTechnicienId: techId });
  const orId = ro[0]?.result?.data?.json?.id;
  check("OR créé et assigné au technicien EMP003", !!orId, ro[0]?.error?.json?.message);
  const plan = await trpcGet("or.getPlanning", {});
  const pl = plan[0]?.result?.data?.json;
  const ligneTech = (pl?.parTechnicien ?? []).find((t) => t.technicien.id === techId);
  check("Planning atelier : OR visible chez EMP003 (charge %)",
    !!ligneTech && ligneTech.vehicules.some((x) => x.id === orId) && typeof ligneTech.charge.pourcent === "number",
    JSON.stringify(ligneTech).slice(0, 140));

  // 3. Le technicien pointe sa journée (RH-02) → calcul heures réelles
  const now = new Date();
  const day = new Date();
  while (day.getDay() === 0) day.setDate(day.getDate() + 1);
  const d = day.toISOString().slice(0, 10);
  const point = await trpcPost("rhPresence.saveBatch", { date: d, rows: [{ employeeId: techId, timeIn: "07:30", timeOut: "18:00", status: "present" }] });
  check("Pointage du technicien enregistré", (point[0]?.result?.data?.json ?? [])[0]?.ok === true, JSON.stringify(point[0]?.result?.data?.json).slice(0, 100));
  const entries = await trpcGet("rhPresence.listEntries", { from: d, to: d, limit: 10 });
  const entry = (entries[0]?.result?.data?.json ?? []).find((e) => e.employeeId === techId);
  check("Pointage calculé : 9,5h normales (code P)", entry?.calculation?.normalMinutes === 570 && entry?.calculation?.codePresence === "P", JSON.stringify(entry?.calculation).slice(0, 120));

  // 4. Paie heures réelles : brut = HN(9,5h) × taux(300 000/225,3)
  const y = now.getFullYear(), m = now.getMonth() + 1;
  await trpcPost("rhPresence.closeMonth", { year: y, month: m });
  const pStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const pEnd = new Date(y, m, 0).toISOString().slice(0, 10);
  const period = await trpcPost("rhPayroll.openPeriod", { startDate: pStart, endDate: pEnd });
  const periodId = period[0]?.result?.data?.json?.id ?? (period[0]?.result?.data?.json ?? {});
  const prep = await trpcPost("rhPayroll.prepareMonth", { periodId });
  check("Paie préparée (période courante)", !prep[0]?.error && (prep[0]?.result?.data?.json?.created ?? 0) > 0, prep[0]?.error?.json?.message ?? prep[0]?.result?.data?.json);
  const bullets = await trpcGet("rhPayroll.listEntries", { periodId });
  const bulletin = (bullets[0]?.result?.data?.json ?? []).find((b) => b.employeeId === techId);
  if (bulletin) {
    const taux = 300000 / 225.3;
    const hn = Number(bulletin.normalHours ?? 0);
    const hs = Number(bulletin.overtimeHours ?? 0);
    const attendu = taux * (hn + hs * 1.5);
    check(`Bulletin EMP003 : brut ≈ HN×taux + HS×taux×1,5 (HN=${hn}h, HS=${hs}h)`, hn > 0 && Math.abs(Number(bulletin.totalEarnings) - attendu) < 5, `attendu=${attendu.toFixed(2)} reçu=${bulletin.totalEarnings}`);
  } else {
    check("Bulletin EMP003 présent", false, "non trouvé");
  }

  // 5. Cohérence : le même employé est technicien atelier ET salarié RH
  const ficheRH = await trpcGet("rh.get", { id: String(techId) });
  check("Fiche RH EMP003 cohérente (fonction + salaire)", ficheRH[0]?.result?.data?.json?.fonction && ficheRH[0]?.result?.data?.json?.salaireBase === "300000", JSON.stringify(ficheRH[0]?.result?.data?.json).slice(0, 120));

  console.log(`\nRÉSULTAT T6: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });