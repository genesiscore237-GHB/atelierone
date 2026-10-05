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

  console.log("=== TEST — FICHE EMPLOYÉ (RH-01) : getFiche + historiques poste/salaire ===");

  // Référentiels
  const deps = await trpcGet("rh.listDepartments", {});
  const depsArr = deps[0]?.result?.data?.json ?? [];
  const posts = await trpcGet("rh.listPositions", {});
  const postsArr = posts[0]?.result?.data?.json ?? [];
  check("Référentiels disponibles (départements + postes)", depsArr.length > 0 && postsArr.length > 0,
    `deps=${depsArr.length} posts=${postsArr.length}`);

  // Création d'un employé de test (matricule auto)
  const stamp = Date.now() % 100000;
  const create = await trpcPost("rh.create", {
    civilite: "M.", nom: `TestFiche${stamp}`, prenom: "App",
    telephone: "666 00 00 00", ville: "Douala",
    typeEmploye: "permanent", fonction: "Technicien Test",
    departmentId: depsArr[0]?.id, positionId: postsArr[0]?.id,
    dateEmbauche: "2024-01-15", salaireBase: "150000", modePaie: "mensuel",
  });
  const emp = create[0]?.result?.data?.json;
  check("Employé créé (matricule auto)", !!emp?.id && /-/.test(emp?.matricule ?? ""), JSON.stringify(create[0]?.error?.json?.message ?? create[0]?.result?.data?.json).slice(0, 140));
  const id = String(emp?.id);

  // Historiques initiaux
  let fiche = (await trpcGet("rh.getFiche", { id }))[0]?.result?.data?.json;
  check("getFiche après création : 1 historique poste + 1 historique salaire",
    (fiche?.positionHistory ?? []).length === 1 && (fiche?.salaryHistory ?? []).length === 1,
    `histPoste=${(fiche?.positionHistory ?? []).length} histSalaire=${(fiche?.salaryHistory ?? []).length}`);
  check("getFiche : identité/emploi remplis",
    fiche?.nom === `TestFiche${stamp}` && fiche?.fonction === "Technicien Test" && fiche?.salaireBase === "150000",
    JSON.stringify({ nom: fiche?.nom, fonction: fiche?.fonction, salaire: fiche?.salaireBase }));
  check("getFiche : champs fiche consultables présents",
    fiche?.matricule && fiche?.statut === "actif" && fiche?.civilite === "M." && fiche?.ville === "Douala" && fiche?.dateEmbauche === "2024-01-15");
  check("getFiche : 1 historique statut « actif » à la création",
    (fiche?.statusHistory ?? []).length === 1 && fiche?.statusHistory?.[0]?.statut === "actif" && !fiche?.statusHistory?.[0]?.endDate,
    JSON.stringify(fiche?.statusHistory).slice(0, 160));

  // Mutation : salaire + poste → nouveaux historiques, anciens refermés
  const altPoste = postsArr.length >= 2 ? postsArr[1].id : null;
  await trpcPost("rh.update", { id, salaireBase: "160000", positionId: altPoste ?? undefined });
  fiche = (await trpcGet("rh.getFiche", { id }))[0]?.result?.data?.json;
  check("getFiche après update : 2 historiques poste (ancien refermé)",
    (fiche?.positionHistory ?? []).length === 2 &&
    fiche.positionHistory.some((p) => p.endDate && p.reason === "Changement de poste"),
    JSON.stringify((fiche?.positionHistory ?? []).map((p) => ({ s: p.startDate, e: p.endDate, r: p.reason }))).slice(0, 160));
  check("getFiche après update : 2 historiques salaire",
    (fiche?.salaryHistory ?? []).length === 2 && fiche?.salaireBase === "160000",
    `histSalaire=${(fiche?.salaryHistory ?? []).length}`);
  check("getFiche : historique n°1 parior → startDate = ancienne date d'embauche",
    fiche?.positionHistory?.length === 2 && fiche.positionHistory[1]?.startDate === "2024-01-15");

  // Nettoyage doux : archiver (pas de delete RH)
  await trpcPost("rh.update", { id, statut: "archive" });
  const archived = (await trpcGet("rh.getFiche", { id }))[0]?.result?.data?.json;
  check("Nettoyage : employé passé en « archive »", archived?.statut === "archive");
  check("getFiche : historique statut tracé (2 lignes, ancienne refermée)",
    (archived?.statusHistory ?? []).length === 2 &&
    archived.statusHistory.some((s) => s.statut === "archive" && !s.endDate) &&
    archived.statusHistory.some((s) => s.statut === "actif" && s.endDate),
    JSON.stringify(archived?.statusHistory).slice(0, 200));

  console.log(`\nRÉSULTAT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });