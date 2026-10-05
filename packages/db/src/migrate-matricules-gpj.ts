import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("RH-02 conformité matricules GPJ-YYYY-NNNN (migrate-matricules-gpj.ts)");

/**
 * RH-02 — Conformité des matricules « GPJ-YYYY-NNNN ».
 *
 * Contexte : certains employés ont été créés avant la mise en place du
 * système d'immatriculation et portent des matricules non conformes
 * (ex. EMP001, GPJ-1, matricule vide…).
 *
 * Règle de format appliquée (identique à la logique serveur rh.ts → create) :
 *   GPJ-YYYY-NNNN
 *     GPJ  = préfixe paramétrable (hr_general_settings.employee_code_prefix, défaut "GPJ")
 *     YYYY = année d'attribution (année de la date_embauche, sinon année en cours)
 *     NNNN = séquence annuelle sur 4 chiffres (zéro-padding), unique par agence
 *
 * Principes de la migration (additif, idempotent, immutable) :
 *   - Un matricule déjà conforme (greedy ^GPJ-\d{4}-\d{4}$) est CONSERVÉ tel quel.
 *   - Un matricule non conforme ou manquant est RÉGÉNÉRÉ selon le format ci-dessus.
 *   - Le numéro séquentiel repart du max réel par (agence, année) → jamais de doublon,
 *     jamais de matricule réutilisé.
 *   - Le matricule est immutable : après migration il n'est plus modifié.
 *
 * Rapport final : nombre d'employés vus / conservés / régénérés + détail par agence.
 */
(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL absent. Abandon.");
    process.exit(1);
  }
  const raw = postgres(process.env.DATABASE_URL, { ssl: false, prepare: false, max: 1 });
  console.log("=== RH-02 — Conformité des matricules (GPJ-YYYY-NNNN) ===");

  // 1. Paramètres par agence (préfixe matricule paramétrable)
  const settings = await raw.unsafe(`
    SELECT agence_id, employee_code_prefix
    FROM hr_general_settings
  `);
  const prefixByAgence = new Map<number, string>();
  for (const s of settings) prefixByAgence.set(s.agence_id, (s.employee_code_prefix || "GPJ").trim());

  // 2. Tous les employés existants (id, agence, matricule, date d'embauche, créé le)
  const employes = await raw.unsafe(`
    SELECT id, agence_id, matricule, date_embauche, created_at
    FROM employes
    ORDER BY agence_id, id
  `);

  let conserve = 0;
  let regenere = 0;
  const parAgence = new Map<number, { conserve: number; regenere: number }>();
  const parAnnee = new Map<string, number>(); // key `${agenceId}|${annee}` → dernière séquence

  for (const emp of employes) {
    const agenceId = emp.agence_id;
    const prefix = prefixByAgence.get(agenceId) || "GPJ";
    const annee = emp.date_embauche ? Number(String(emp.date_embauche).slice(0, 4)) : new Date().getFullYear();
    const regexp = new RegExp(`^${prefix}-\\d{4}-\\d{4}$`);

    const stats = parAgence.get(agenceId) ?? { conserve: 0, regenere: 0 };

    // Matricule conforme → conservation (immutable)
    if (emp.matricule && regexp.test(emp.matricule)) {
      conserve++;
      stats.conserve++;
      parAgence.set(agenceId, stats);
      continue;
    }

    // Régénération : séquence annuelle par agence, à partir du max réel
    const key = `${agenceId}|${annee}`;
    let seq = parAnnee.get(key) ?? 0;
    if (seq === 0) {
      // Initialise à partir du max réel existant pour cette agence/année
      const [maxRow] = await raw.unsafe(
        `SELECT MAX(CAST(split_part(matricule, '-', 3) AS INTEGER)) AS maxn
         FROM employes
         WHERE agence_id = $1 AND matricule ~ '^${prefix}-${annee}-\\d{4}$'`,
        [agenceId],
      );
      seq = maxRow?.maxn ?? 0;
    }
    seq++;
    let matricule = `${prefix}-${annee}-${String(seq).padStart(4, "0")}`;
    parAnnee.set(key, seq);

    // Sécurité anti-doublon sur l'unicité exacte de la colonne
    let guard = 0;
    for (;;) {
      const [dup] = await raw.unsafe(
        `SELECT id FROM employes WHERE matricule = $1 AND id <> $2 LIMIT 1`,
        [matricule, emp.id],
      );
      if (!dup) break;
      seq++;
      matricule = `${prefix}-${annee}-${String(seq).padStart(4, "0")}`;
      parAnnee.set(key, seq);
      if (++guard > 1000) throw new Error("Boucle anti-doublon dépassée.");
    }

    await raw.unsafe(`UPDATE employes SET matricule = $1 WHERE id = $2`, [matricule, emp.id]);

    regenere++;
    stats.regenere++;
    parAgence.set(agenceId, stats);
    console.log(`  #${emp.id} ${emp.matricule || "(vide)"} → ${matricule} (année ${annee})`);
  }

  await raw.end();

  console.log("\n=== RAPPORT RH-02 — Conformité des matricules ===");
  console.log(`  Employés vus      : ${conserve + regenere}`);
  console.log(`  Matricules conformes conservés : ${conserve}`);
  console.log(`  Matricules régénérés           : ${regenere}`);
  for (const [agenceId, st] of parAgence) {
    console.log(`  Agence #${agenceId} → conservés ${st.conserve} / régénérés ${st.regenere}`);
  }
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});
