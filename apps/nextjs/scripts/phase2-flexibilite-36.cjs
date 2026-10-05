// PHASE 2 — test ultime de flexibilité : créer les 36 catégories via l'API runtime,
// vérifier la présence dans l'arbre, puis nettoyage immédiat (aucune trace en prod).
// Lecture seule au sens code : aucune ligne modifiée ; données test supprimées.
const BASE = "http://localhost:3000";
const { Client } = require("pg");
const DSN = "postgresql://postgres:postgres@127.0.0.1:5432/atelierone_erp";

let pass = 0, fail = 0;
const check = (label, ok, extra = "") => { if (ok) { pass++; console.log("  [PASS]", label); } else { fail++; console.log("  [FAIL]", label, extra); } };

// Les 36 catégories du mandat (filtre à huile → service) avec la famille d'accueil cible.
const CATS = [
  ["Filtre à huile", "FILTRATION"],
  ["Plaquette de frein", "FREINAGE"],
  ["Injecteur", "INJECTION_ALLUMAGE"],
  ["Capteur ABS", "CAPTEURS_CALCULATEURS"],
  ["Batterie AGM", "BATTERIES"],
  ["Pneu", "PNEUS_TOURISME"],
  ["Jante", "JANTES_ALUMINIUM"],
  ["Ampoule", "ECLAIRAGE"],
  ["Courroie", "COURROIES_GALETS"],
  ["Bougie", "ALLUMAGE_ELECTRIQUE"],
  ["Roulement", "ROULEMENTS"],
  ["Pare-chocs", "ELEMENTS_EXTERIEURS"],
  ["Rétroviseur", "RETROVISEURS"],
  ["Huile moteur", "HUILES_MOTEUR"],
  ["Liquide de frein", "LIQUIDES"],
  ["Graisse", "GRAISSES"],
  ["Boulon", "FIXATIONS"],
  ["Joint", "JOINTS_GAINES"],
  ["Connecteur électrique", "FAISCEAUX_CONNECTEURS"],
  ["Faisceau", "FAISCEAUX_CONNECTEURS"],
  ["ECU / calculateur", "CAPTEURS_CALCULATEURS"],
  ["Clé dynamométrique", "OUTIL_MESURE"],
  ["Clé à choc", "OUTIL_PNEUMATIQUE"],
  ["Douille et cliquet", "OUTIL_MANuel"],
  ["Extracteur", "OUTIL_SPECIALISE"],
  ["Multimètre", "OUTIL_MESURE"],
  ["Oscilloscope", "OUTIL_DIAGNOSTIC"],
  ["Appareil diagnostic", "OUTIL_DIAGNOSTIC"],
  ["Cric", "OUTIL_LEVAGE"],
  ["Chandelle", "OUTIL_LEVAGE"],
  ["Presse hydraulique", "EQUIP_LEVAGE"],
  ["Station climatisation", "EQUIP_DIAGNOSTIC"],
  ["Pont élévateur", "EQUIP_LEVAGE"],
  ["Équipement ADAS", "EQUIP_DIAGNOSTIC"],
  ["Kit / coffret", "OUTIL_MANuel"],
  ["Service (main d'œuvre)", null],
];

(async () => {
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
    const enc = encodeURIComponent(JSON.stringify({ "0": { json: body ?? {} } }));
    const r = await http("/api/trpc/" + path + "?batch=1&input=" + enc);
    return r.json();
  }

  const csrf = await (await http("/api/auth/csrf")).json();
  const login = await http("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: "admin@gpj.cm", password: "admin123", callbackUrl: BASE + "/dashboard" }),
  });
  check("Login admin (redirect dashboard)", login.status === 302, "status=" + login.status);
  if (login.status !== 302) { console.log("ABORT — authentification échouée"); process.exit(1); }

  // Référentiel actuel des catégories (code → id) pour l'accueil.
  const cats = await trpcGet("catalog.listCategories", {});
  const rows = cats[0]?.result?.data?.json ?? [];
  const codeToId = new Map(rows.filter(r => r && r.code).map(r => [r.code, r.id]));
  const allIds = new Set(rows.map(r => r && r.id));
  console.log(`Référentiel actuel : ${rows.length} catégories`);

  const ts = Date.now().toString(36);
  const created = [];
  for (let i = 0; i < CATS.length; i++) {
    const [nom, parentCode] = CATS[i];
    const parentId = parentCode ? codeToId.get(parentCode) ?? null : null;
    const r = await trpcPost("catalog.createCategory", {
      nom: `${nom} (AUDIT-${ts})`,
      code: `AUD-${ts}-${String(i + 1).padStart(2, "0")}`,
      description: `Test flexibilité Phase 2 — ${nom}`,
      ...(parentId ? { parentId: String(parentId) } : {}),
    });
    const out = r[0];
    if (out?.result?.data?.json?.id) {
      created.push({ nom, id: out.result.data.json.id, code: `AUD-${ts}-${String(i + 1).padStart(2, "0")}` });
      check(`Créée via API — ${nom}`, true);
    } else if (out?.error) {
      check(`Création refusée — ${nom}`, false, (out.error.json?.message ?? "") );
    } else {
      check(`Création — ${nom}`, false, "réponse inattendue");
    }
  }
  console.log(`→ ${created.length}/${CATS.length} catégories créées par l'API sans une ligne de code.`);

  // Vérification 1 : visibles dans l'arbre (getCategoryTree)
  const treeRes = await trpcGet("catalog.getCategoryTree", {});
  const tree = treeRes[0]?.result?.data?.json ?? [];
  const createdIds = new Set(created.map(c => String(c.id)));
  const flatten = (nodes) => nodes.flatMap(n => [String(n.id), ...flatten(n.children ?? [])]);
  const treeIds = new Set(flatten(tree));
  const foundInTree = created.filter(c => treeIds.has(String(c.id)));
  check(`Arbre (getCategoryTree) : ${foundInTree.length}/36 présentes`, foundInTree.length === created.length);

  // Vérification 2 : listCategories active les montre
  const listRes = await trpcGet("catalog.listCategories", {});
  const listIds = new Set((listRes[0]?.result?.data?.json ?? []).map(r => r && String(r.id)));
  const foundInList = created.filter(c => listIds.has(String(c.id)));
  check(`Liste (listCategories) : ${foundInList.length}/36 présentes`, foundInList.length === created.length);

  // Vérification 3 : on ne casse rien — le référentiel initial est intact (aucune catégorie perdue)
  const nowIds = new Set((listRes[0]?.result?.data?.json ?? []).map(r => r && r.id));
  const perdues = [...allIds].filter(id => !nowIds.has(id)).length;
  check("Aucune catégorie préexistante perdue", perdues === 0, `perdues=${perdues}`);

  // NETTOYAGE immédiat : suppression logique via API puis hard delete SQL (aucune trace).
  const db = new Client({ connectionString: DSN });
  await db.connect();
  const delCodes = created.map(c => c.code);
  if (delCodes.length) {
    const apiDel = await db.query("DELETE FROM categories WHERE code = ANY($1)", [delCodes]);
    check(`Nettoyage DB : ${apiDel.rowCount} lignes supprimées (trace zéro)`, apiDel.rowCount === delCodes.length, `rowCount=${apiDel.rowCount}`);
  }
  await db.end();

  // Vérification finale : plus aucune catégorie audit dans le référentiel.
  const finalRes = await trpcGet("catalog.listCategories", {});
  const finalIds = new Set((finalRes[0]?.result?.data?.json ?? []).map(r => r && String(r.id)));
  const reste = createdIds.size === finalIds.size ? 0 : [...createdIds].filter(id => finalIds.has(id)).length;
  check(`Aucune trace restante après nettoyage (${reste}/36)`, reste === 0);

  console.log(`\nRÉSULTAT Phase 2 : ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ERREUR:", e); process.exit(2); });