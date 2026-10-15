/**
 * PURGE CIBLEE DES DONNEES DE TEST
 * ================================
 *
 * Repond a la demande « purger dans tout le systeme toutes les donnees de test ».
 *
 * DEUX GARDES, NON NEGOCIABLES
 *
 *   1. `--dry-run` PAR DEFAUT. Rien n'est supprime sans `--executer --oui`.
 *
 *   2. La purge se fait au niveau LIGNE, jamais par TRUNCATE.
 *      `reset-db.ts` ne doit PAS etre utilise pour cette tache : sa liste
 *      `KEEP` ne protege ni `kpi_cibles`, ni `parking_configs`, ni
 *      `atelier_parametres`, ni le plan du garage. Il casserait silencieusement
 *      les seuils d'alerte et les cibles KPI.
 *
 *      `PROTEGE` liste des TABLES entieres. Les fixtures qui restent dans
 *      `roles` / `utilisateurs` / `role_permissions` sont traitees par motif
 *      de ligne, avec exclusion explicite du socle (voir `ROLES_SOCLE`).
 *
 * USOAGE
 *   pnpm purge:test                    -> rapport seul (dry-run)
 *   pnpm purge:test -- --executer --oui -> purge effective
 *
 * SECURITE BASE
 *   Refuse toute base non locale via `requireLocalOrForced`.
 */

import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import { sql } from "drizzle-orm";

/** Tables entieres qui ne sont jamais touchees. */
const PROTEGE = new Set([
  // Socle : sans ces tables, aucune page ne s'affiche et aucun acces n'existe.
  "permissions",
  "agences",
  "organisations",
  "cles_api",
  "verification_tokens",
  "__drizzle_migrations",
  // Seuils et cibles : les purger vide silencieusement le pilotage.
  "kpi_cibles",
  "parking_configs",
  "atelier_parametres",
  "unites_mesure",
  "categories",
  "fournisseurs",
  "tarifs",
  "regles_tarification",
  "services_standards",
]);

/** Roles socles a conserver meme si un motif de test les touchait. */
const ROLES_SOCLE = [
  "superadmin",
  "directeur",
  "admin",
  "chef_atelier",
  "secretaire",
  "magasinier",
  "technicien",
  "comptable",
  "rh",
  "consultation",
];

type Cible = { table: string; label: string; condition: string };

/**
 * Motifs de fixture releves dans les tests d'integration du depot.
 *
 * Namespaces observes : lot0-4, lotr1, s1restit, s2alerte, u0aregles,
 * u0cphotos, u1types, u2km, u3check, a1scheduler, pilotage, rpt05*.
 *
 * ATTENTION : `OR-` n'est PAS un motif de test. C'est le prefixe metier
 * configure dans `agences.prefixe_or` ; matcher dessus selectionnerait des
 * dossiers parfaitement legitimes.
 */
const CIBLES: Cible[] = [
  {
    table: "rh_audit_logs",
    label: "Journal RH de test",
    condition: `motif ~* '^Test\\b' OR entity_type = 'rh_absence_justification'`,
  },
  {
    // AVANT `roles` : un utilisateur référence son rôle (FK RESTRICT), donc
    // supprimer les rôles d'abord échoue systématiquement. L'ordre n'est pas
    // cosmétique ici, il est structurel.
    table: "utilisateurs",
    label: "Comptes de test RPT-05",
    condition: `email ~* '^rpt05' OR nom ~* '^Fixture' OR prenom ~* '^Fixture'`,
  },
  {
    table: "user_roles",
    label: "Liaisons utilisateur/role de test",
    condition: `role_id IN (SELECT id FROM roles WHERE code ~* '^rpt05')`,
  },
  {
    table: "role_permissions",
    label: "Permissions des roles de test",
    condition: `role_id IN (SELECT id FROM roles WHERE code ~* '^rpt05')`,
  },
  {
    table: "roles",
    label: "Roles de test RPT-05",
    condition: `code ~* '^rpt05' AND code NOT IN (${ROLES_SOCLE.map((r) => `'${r}'`).join(",")})`,
  },
  {
    table: "attendance_monthly_summaries",
    label: "Synthesees de presence residuelles (employe temoin)",
    condition: `employee_id IN (SELECT id FROM employes WHERE matricule = 'SOCLE-001')`,
  },
  {
    table: "clients",
    label: "Clients fixtures (s1restit, LotU1, U0a...)",
    condition: `nom ~* '^Client[[:space:]]+(s1restit|LotU1|LotU0a|U0a|U0c|U2km|U3check|S2alerte|LotR1|Lot[0-9])$' OR nom ~* '^Client[[:space:]]+Fixture'`,
  },
  {
    table: "vehicules",
    label: "Vehicules fixtures (plaques U0A-, S1RESTIT-, S2ALERTE-...)",
    condition: `immat_norm ~* '^(U0A|S1RESTIT|S2ALERTE|U2KM|U3CHECK|U0C|LOTR1|LOT[0-9])[-_ ]' OR immatriculation ~* '^(U0A|S1RESTIT|S2ALERTE|U2KM|U3CHECK|U0C|LOTR1|LOT[0-9])[-_ ]'`,
  },
  {
    table: "parking_vehicles",
    label: "Lignes parking fixtures",
    condition: `immatriculation ~* '^(U0A|S1RESTIT|S2ALERTE|U2KM|U3CHECK|U0C|LOTR1|LOT[0-9])[-_ ]' OR client_nom ~* '^Client[[:space:]]+(s1restit|LotU1)$'`,
  },
  {
    table: "parking_spots",
    label: "Spots S2ALERTE (residu du test S2)",
    condition: `code ~* '^S2ALERTE'`,
  },
  {
    table: "parking_zones",
    label: "Zones S2ALERTE (residu du test S2)",
    condition: `code ~* '^S2ALERTE' OR nom = 'Zone S2'`,
  },
  {
    table: "parking_sites",
    label: "Sites S2ALERTE (residu du test S2)",
    condition: `code ~* '^S2ALERTE'`,
  },
];

/**
 * Lignes suspectes que le script signale mais NE purge PAS.
 *
 * Leur origine est ambigue : socle de demonstration ou fixture ? Les supprimer
 * sans arbitrage humain serait une prise de decision a la place de l'utilisateur.
 */
const SIGNALEES: Cible[] = [
  {
    table: "employes",
    label: "Employe temoin SOCLE-001 (origine ambigue)",
    condition: `matricule = 'SOCLE-001'`,
  },
  {
    table: "vehicules",
    label: "Vehicules sans client rattache (import GPJ ?)",
    condition: `client_id IS NULL`,
  },
  {
    table: "parking_vehicles",
    label: "Lignes parking sans immatriculation (registre GPJ)",
    condition: `immatriculation IS NULL OR btrim(immatriculation) = ''`,
  },
  {
    table: "clients",
    label: "Clients sans telephone ni email (doute sur leurfiabilite)",
    condition: `(telephone IS NULL OR btrim(telephone) = '') AND (email IS NULL OR btrim(email) = '')`,
  },
];

async function tableExiste(table: string): Promise<boolean> {
  const r = (await db.execute(
    sql`SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS ok`,
  )) as unknown as { ok: boolean }[];
  return !!r[0]?.ok;
}

async function compter(table: string, condition: string): Promise<number> {
  const lignes = (await db.execute(
    sql`SELECT count(*)::int AS n FROM ${sql.raw(`"${table}"`)} WHERE ${sql.raw(condition)}`,
  )) as unknown as { n: number }[];
  return Number(lignes[0]?.n ?? 0);
}

async function main(): Promise<void> {
  const executer = process.argv.includes("--executer");
  const confirmer = process.argv.includes("--oui");

  requireLocalOrForced(
    process.env.FORCE === "1" ? "purge:test (FORCE=1)" : "purge:test",
  );

  console.log(executer ? "\nMODE EXECUTION" : "\nMODE DRY-RUN (aucune suppression)");
  console.log("=".repeat(72));

  const plan: { table: string; label: string; n: number }[] = [];
  let total = 0;

  for (const cible of CIBLES) {
    if (PROTEGE.has(cible.table)) continue;
    if (!(await tableExiste(cible.table))) continue;
    const n = await compter(cible.table, cible.condition);
    if (n === 0) continue;
    total += n;
    plan.push({ table: cible.table, label: cible.label, n });
  }

  if (!plan.length) {
    console.log("\nAucune donnee de test detectee. Rien a faire.\n");
    process.exit(0);
  }

  console.log("\nLIGNES IDENTIFIEES COMME DONNEES DE TEST\n");
  for (const l of plan.sort((a, b) => b.n - a.n)) {
    console.log(`  ${String(l.n).padStart(6)}  ${l.table.padEnd(30)} ${l.label}`);
  }
  console.log(`  ${String(total).padStart(6)}  TOTAL`);
  console.log(`\n  Tables protegees (jamais purgees) : ${PROTEGE.size}`);
  console.log(`  Roles socles exclus ligne a ligne : ${ROLES_SOCLE.length}`);

  // Signalements : on montre, on ne supprime pas.
  const aValider: { table: string; label: string; n: number }[] = [];
  for (const cible of SIGNALEES) {
    if (PROTEGE.has(cible.table)) continue;
    if (!(await tableExiste(cible.table))) continue;
    const n = await compter(cible.table, cible.condition);
    if (n === 0) continue;
    aValider.push({ table: cible.table, label: cible.label, n });
  }
  if (aValider.length) {
    console.log("\nSIGNALEES MAIS NON PURGEES (decision humaine requise)\n");
    for (const l of aValider) {
      console.log(`  ${String(l.n).padStart(6)}  ${l.table.padEnd(30)} ${l.label}`);
    }
  }

  if (!executer) {
    console.log("\n" + "=".repeat(72));
    console.log("DRY-RUN termine. Aucune ligne supprimee.");
    console.log("Pour purger : pnpm purge:test -- --executer --oui");
    console.log("=".repeat(72));
    process.exit(0);
  }

  if (!confirmer) {
    console.error("\nRefus : --executer exige aussi --oui (suppression definitive).");
    process.exit(1);
  }

  console.log("\nPURGE EN COURS\n");
  for (const cible of CIBLES) {
    if (PROTEGE.has(cible.table)) continue;
    if (!(await tableExiste(cible.table))) continue;
    const avant = await compter(cible.table, cible.condition);
    if (avant === 0) continue;
    try {
      await db.execute(
        sql`DELETE FROM ${sql.raw(`"${cible.table}"`)} WHERE ${sql.raw(cible.condition)}`,
      );
      const apres = await compter(cible.table, cible.condition);
      console.log(
        `  ${cible.table.padEnd(30)} ${String(avant).padStart(6)} -> ${String(apres).padStart(6)} supprimee(s)`,
      );
    } catch (e) {
      console.error(`  ${cible.table.padEnd(30)} ECHEC : ${(e as Error).message}`);
      console.error(`    (contrainte FK probable : purger les tables enfants d'abord)`);
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log("Purge terminee.");
  console.log("Journal de migrations, seuils d'alerte, cibles KPI, socle RBAC");
  console.log("et plan du garage (hors motifs S2ALERTE) n'ont pas ete touches.");
  console.log("=".repeat(72));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});