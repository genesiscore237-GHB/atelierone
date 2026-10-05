import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import postgres from "postgres";

requireLocalOrForced("RPT-03 — sensibilisation RH (migrate-rh-sensibilisation-rules.ts)");

/**
 * RPT-03 §18/§19 — RÈGLES DE SENSIBILISATION RH
 *
 * La sensibilisation ESTIME un coût. Elle ne le RETIENT pas. Les règles sont
 * donc stockées dans une table DÉDIÉE, distincte de `late_deduction_rules`
 * (retenues de paie) : aucun réglage de sensibilisation ne peut, par construction,
 * atteindre `netImposable` / `netPay`.
 *
 * La migration ne crée QUE la structure et les règles initiales. Elle ne touche
 * à aucune donnée métier de présence, de paie, d'avance, de salaire ou d'historique.
 *
 * Usage :
 *   DRY_RUN=1  npx tsx src/migrate-rh-sensibilisation-rules.ts   (rapport seul)
 *              npx tsx src/migrate-rh-sensibilisation-rules.ts   (application)
 *   ROLLBACK=1 npx tsx src/migrate-rh-sensibilisation-rules.ts   (suppression)
 *
 * Garanti : idempotent, transactionnel, sans perte (les règles existantes ne
 * sont jamais écrasées : ON CONFLICT DO NOTHING).
 */

const TABLE = "hr_sensibilisation_rules";

/**
 * §19 — Règles initiales. Les seuils sont des VALEURS PAR DÉFAUT MODIFIABLES,
 * pas une vérité métier : le classeur GPJ ne contient aucune formule
 * d'impact financier (12 feuilles, aucune feuille « sensibilisation »).
 *
 * `SALAIRE_REFERENCE_INCOHERENT` observe `salaireReferenceManquant` (0/1) et
 * non `salaireBaseReference` : un `impactPercent` à `null` ne déclenche aucune
 * règle, la métrique binaire est donc la seule qui puisse signaler l'absence de
 * salaire de référence sans inventer un salaire de 0.
 */
interface RegleInitiale {
  code: string;
  label: string;
  niveau: "INFO" | "WARNING" | "CRITICAL";
  priorite: number;
  condition: "GE" | "GT" | "LE" | "LT" | "EQ";
  metrique: string;
  seuil: string;
  message: string;
  actionRecommandee: string;
}

const REGLES: RegleInitiale[] = [
  {
    code: "PRESENCE_SATISFAISANTE_RETARDS_ELEVES",
    label: "Présence satisfaisante mais retards élevés",
    niveau: "WARNING",
    priorite: 40,
    condition: "GE",
    metrique: "retardMinutes",
    seuil: "120",
    message:
      "Présence satisfaisante, mais les retards cumulés de la période dépassent le seuil de sensibilisation.",
    actionRecommandee: "Planifier un rappel horaires ou revoir l'organisation des vacations.",
  },
  {
    code: "ABSENCES_RETARDS_SIGNIFICATIFS",
    label: "Absences et retards significatifs",
    niveau: "WARNING",
    priorite: 30,
    condition: "GE",
    metrique: "totalNotWorkedHours",
    seuil: "8",
    message: "Absences et retards cumulés significatifs sur la période.",
    actionRecommandee: "Faire un point avec l'employé et vérifier la couverture des absences.",
  },
  {
    code: "IMPACT_IMPORTANT",
    label: "Impact estimé important",
    niveau: "WARNING",
    priorite: 20,
    condition: "GE",
    metrique: "impactPercent",
    seuil: "5",
    message: "L'impact estimé de la période dépasse le seuil « important » du salaire de référence.",
    actionRecommandee: "Analyser les causes récurrentes avant la prochaine période.",
  },
  {
    code: "IMPACT_TRES_ELEVE",
    label: "Impact estimé très élevé",
    niveau: "CRITICAL",
    priorite: 10,
    condition: "GE",
    metrique: "impactPercent",
    seuil: "10",
    message: "L'impact estimé de la période dépasse le seuil « très élevé » du salaire de référence.",
    actionRecommandee: "Escalade RH : revoir la planning etposer des mesures de suivi.",
  },
  {
    code: "RETARDS_CHRONIQUES",
    label: "Retards chroniques",
    niveau: "WARNING",
    priorite: 50,
    condition: "GE",
    metrique: "joursAvecRetard",
    seuil: "5",
    message: "Retards présents sur plusieurs jours de la période : le caractère est chronique, pas ponctuel.",
    actionRecommandee: "Traitement RH formel et suivi individuel.",
  },
  {
    code: "SALAIRE_REFERENCE_INCOHERENT",
    label: "Salaire de référence absent ou incohérent",
    niveau: "WARNING",
    priorite: 5,
    condition: "GE",
    metrique: "salaireReferenceManquant",
    seuil: "1",
    message:
      "Salaire de référence absent, nul ou négatif : le pourcentage d'impact ne peut pas être calculé (N/A).",
    actionRecommandee: "Vérifier l'historique salarial et le paramétrage avant de diffuser un pourcentage.",
  },
  {
    code: "ABSENCE_NON_JUSTIFIEE",
    label: "Absence non justifiée",
    niveau: "CRITICAL",
    priorite: 15,
    condition: "GE",
    metrique: "joursAbsenceNonJustifiee",
    seuil: "1",
    message: "Au moins un jour d'absence sans justificatif validé dans la période.",
    actionRecommandee: "Demander le justificatif manquant puis appliquer la procédure RH prévue.",
  },
];

const DDL = `
CREATE TABLE IF NOT EXISTS ${TABLE} (
  id serial PRIMARY KEY,
  agence_id integer NOT NULL REFERENCES agences(id),
  code varchar(60) NOT NULL,
  label varchar(160) NOT NULL,
  niveau varchar(10) NOT NULL,
  priorite integer NOT NULL DEFAULT 100,
  condition varchar(4) NOT NULL,
  metrique varchar(40) NOT NULL,
  seuil numeric(12,2) NOT NULL,
  message text NOT NULL,
  action_recommandee text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ${TABLE}_agence_code_key UNIQUE (agence_id, code)
)`;

(async () => {
  const raw = postgres(process.env.DATABASE_URL!, {
    ssl: false,
    prepare: false,
    max: 1,
    onnotice: () => {},
  });
  const DRY = process.env.DRY_RUN === "1";
  const ROLLBACK = process.env.ROLLBACK === "1";

  console.log("=== RPT-03 — Migration regles de sensibilisation RH ===");
  console.log(`mode : ${ROLLBACK ? "ROLLBACK" : DRY ? "DRY-RUN" : "APPLY"}`);
  console.log(`cible: ${TABLE} (${REGLES.length} regles initiales, multi-tenant)`);

  const existe = await raw.unsafe(`select to_regclass($1) as t`, [`public.${TABLE}`]);
  const dejaLLa = Boolean(existe[0]?.t);

  const agences = (await raw.unsafe(
    `select id from agences order by id`
  )) as unknown as Array<{ id: number }>;
  console.log(`agences detectees : ${agences.map((a) => a.id).join(", ")}`);

  const comptees = dejaLLa
    ? ((await raw.unsafe(`select count(*)::int as n from ${TABLE}`)) as unknown as Array<{ n: number }>)[0].n
    : 0;

  console.log(`\n--- AUDIT ---`);
  console.log(`  table ${dejaLLa ? "EXISTE" : "a creer"} ; ${comptees} regle(s) deja enregistree(s)`);
  console.log(`  ${REGLES.length} regle(s) x ${agences.length} agence(s) = ${REGLES.length * agences.length} insertion(s) prevues`);
  for (const r of REGLES) {
    console.log(`  ${r.condition.padEnd(2)} ${String(r.seuil).padStart(6)}  ${r.metrique.padEnd(26)} ${r.code} (${r.niveau})`);
  }

  if (ROLLBACK) {
    if (!dejaLLa) {
      console.log("ROLLBACK : rien a faire (table absente).");
      await raw.end();
      process.exit(0);
    }
    await raw.unsafe(`DROP TABLE ${TABLE}`);
    console.log(`ROLLBACK applique : ${TABLE} supprimee. Aucune autre table touchee.`);
    await raw.end();
    process.exit(0);
  }

  if (DRY) {
    console.log(`\nDRY-RUN : aucune ecriture. Table ${dejaLLa ? "conforme" : "a creer"}.`);
    await raw.end();
    process.exit(0);
  }

  let inserees = 0;
  await raw.begin(async (tx) => {
    await tx.unsafe(DDL);
    for (const a of agences) {
      for (const r of REGLES) {
        // ON CONFLICT DO NOTHING : une regle deja reglee par l'agence n'est
        // jamais ecrasee par un rejeu de la migration.
        const res = await tx.unsafe(
          `INSERT INTO ${TABLE} (agence_id, code, label, niveau, priorite, condition, metrique, seuil, message, action_recommandee, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
           ON CONFLICT (agence_id, code) DO NOTHING`,
          [a.id, r.code, r.label, r.niveau, r.priorite, r.condition, r.metrique, r.seuil, r.message, r.actionRecommandee]
        );
        inserees += res.count ?? 0;
      }
    }
  });

  const total = (await raw.unsafe(`select count(*)::int as n from ${TABLE}`))[0] as unknown as { n: number };
  const parAgence = await raw.unsafe(
    `select agence_id, count(*)::int as n, count(*) filter (where active)::int as actives
     from ${TABLE} group by agence_id order by agence_id`
  );
  console.log(`\n--- APRES ---`);
  console.log(`  ${inserees} insertion(s), ${total.n} regle(s) au total`);
  for (const p of parAgence) {
    console.log(`  agence ${p.agence_id} : ${p.n} regle(s), ${p.actives} active(s)`);
  }
  console.log(`\nOK : table dediee aux seuils de sensibilisation, aucune retenue de paie introduite.`);
  console.log(`Rollback : ROLLBACK=1 npx tsx src/migrate-rh-sensibilisation-rules.ts`);

  await raw.end();
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});
