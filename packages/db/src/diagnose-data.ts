/**
 * DIAGNOSTIC DE DONNEES - LECTURE SEULE STRICTE
 * ==============================================
 *
 * Question a laquelle on veut repondre : « que contient la base de production,
 * et quelle part ressemble a des donnees de test ? »
 *
 * AUCUNE ECRITURE N'EST POSSIBLE AVEC CE SCRIPT.
 *
 * Deux verrous, independants l'un de l'autre :
 *
 *   1. `SET default_transaction_read_only = on` sur la session : PostgreSQL
 *      refuse tout INSERT/UPDATE/DELETE/CREATE sur cette connexion, meme si
 *      quelqu'un modifiait le script par erreur. Le garde-fou est dans la
 *      base, pas dans la bonne intention du code.
 *
 *   2. `requireLocalOrForced` : refuse toute base distante sans `FORCE=1`.
 *
 * Ce script ne supprime rien. Il produit un RAPPORT. Toute decision de purge
 * appartient a l'utilisateur, sur la base de ce rapport.
 *
 * USAGE
 *   pnpm diagnose:data
 *   DATABASE_URL=... pnpm diagnose:data -- --force-database
 */

import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import { sql } from "drizzle-orm";

type Row = Record<string, unknown>;

/** Volume des tables métier : ce qui dit si la base est vivante ou vide. */
const TABLES_METIER = [
  "clients",
  "vehicules",
  "ordres_reparation",
  "lignes_ordre_reparation",
  "or_restitutions",
  "or_photos",
  "or_historique",
  "or_demandes_pieces",
  "factures",
  "ventes",
  "ventes_lignes",
  "produits",
  "stocks",
  "mouvements_stock",
  "parking_vehicles",
  "parking_movements",
  "parking_alerts",
  "client_interactions",
  "paiements",
  "utilisateurs",
  "employes",
  "audit_logs",
  "rh_audit_logs",
  "alertes",
  "relances",
  "atelier_notifications",
];

/** Ce qui doit etre intact : le vider casse l'application ou le pilotage. */
const TABLES_SOCLE = [
  "permissions",
  "roles",
  "role_permissions",
  "kpi_cibles",
  "parking_configs",
  "atelier_parametres",
  "parking_sites",
  "parking_zones",
  "parking_spots",
  "agences",
];

/** Marqueurs de fixtures releves dans les tests d'integration du depot. */
const MARQUEURS_CLIENT = `nom ~* '^Client[[:space:]]+(s1restit|LotU1|LotU0a|U0a|U0c|U2km|U3check|S2alerte|LotR1|Lot[0-9])$' OR nom ~* '^Client[[:space:]]+Fixture'`;
const MARQUEURS_IMMAT = `^(U0A|S1RESTIT|S2ALERTE|U2KM|U3CHECK|U0C|LOTR1|LOT[0-9])[-_ ]`;

async function existe(table: string): Promise<boolean> {
  const r = (await db.execute(sql`SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS ok`)) as unknown as Row[];
  return !!r[0]?.ok;
}

/**
 * Une base en retard de migration n'a pas toutes les colonnes attendues.
 * Compter sur une colonne absente lève `42703` et interrompt tout le rapport
 * — on perdrait précisément l'information la plus importante : ce qui manque.
 */
async function colonneExiste(table: string, colonne: string): Promise<boolean> {
  const r = (await db.execute(
    sql`SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name = ${table} AND column_name = ${colonne}`,
  )) as unknown as Row[];
  return Number(r[0]?.n ?? 0) > 0;
}

async function compter(table: string, condition = "1=1"): Promise<number> {
  if (!(await existe(table))) return -1;
  try {
    const r = (await db.execute(
      sql`SELECT count(*)::int AS n FROM ${sql.raw(`"${table}"`)} WHERE ${sql.raw(condition)}`,
    )) as unknown as Row[];
    return Number(r[0]?.n ?? 0);
  } catch {
    return -1;
  }
}

async function main(): Promise<void> {
  requireLocalOrForced(process.env.FORCE === "1" ? "diagnose:data (FORCE=1)" : "diagnose:data");

  // Verrou 1 : la session devient incapable d'ecrire, quoi qu'il arrive.
  await db.execute(sql`SET default_transaction_read_only = on`);
  const verrou = (await db.execute(
    sql`SELECT current_setting('default_transaction_read_only') AS mode`,
  )) as unknown as Row[];

  const base = process.env.DATABASE_URL?.replace(/:\/\/[^@]*@/, "://***@") ?? "(non definie)";
  console.log("\n".repeat(1));
  console.log("=".repeat(72));
  console.log("DIAGNOSTIC DE DONNEES - LECTURE SEULE");
  console.log("=".repeat(72));
  console.log(`Base        : ${base}`);
  console.log(`Mode session: ${verrou[0]?.mode}  (1 = ecriture impossible)`);
  console.log("=".repeat(72));

  console.log("\n0. ECART ENTRE LE CODE ATTENDU ET LA BASE REELLE\n");
  const ecart = await ecartDeSchema();
  const manquants = ecart.filter((e) => !e.attendu);
  if (!manquants.length) {
    console.log("  Schema a jour : tout ce qu'attend le code existe dans la base.");
  } else {
    console.log(`  ${manquants.length} objet(s) MANQUANT(S). Tant qu'ils manquent :\n`);
    for (const m of manquants) console.log(`    MANQUE  ${m.objet}`);
    console.log("\n  Consequence : le code qui les utilise echouera a l'execution.");
    console.log("  Une migration est necessaire AVANT toute utilisation de ce module.");
  }
  console.log("\n1. VOLUME DES TABLES METIER\n");
  const peuplees: string[] = [];
  for (const t of TABLES_METIER) {
    const n = await compter(t);
    if (n === -1) continue;
    (n === 0 ? vides : peuplees).push(t);
    console.log(`  ${String(n).padStart(8)}  ${t}`);
  }
  console.log(`\n  Tables non vides : ${peuplees.length} / ${vides.length + peuplees.length}`);

  console.log("\n2. SOCLE ET CONFIGURATION (doivent etre intacts)\n");
  for (const t of TABLES_SOCLE) {
    const n = await compter(t);
    if (n === -1) continue;
    const marque = n === 0 ? "  <-- VIDE : a investiguer" : "";
    console.log(`  ${String(n).padStart(8)}  ${t}${marque}`);
  }

  console.log("\n3. SIGNATURES DE DONNEES DE TEST\n");
  const suspects: { label: string; n: number }[] = [
    { label: "clients fixtures (nom Client s1restit / LotU1 / U0a...)", n: await compter("clients", MARQUEURS_CLIENT) },
    { label: "vehicules fixtures (plaques U0A-, S1RESTIT-, S2ALERTE-)", n: await compter("vehicules", `immat_norm ~* '${MARQUEURS_IMMAT}' OR immatriculation ~* '${MARQUEURS_IMMAT}'`) },
    { label: "lignes parking fixtures", n: await compter("parking_vehicles", `immatriculation ~* '${MARQUEURS_IMMAT}' OR client_nom ~* '^Client[[:space:]]+(s1restit|LotU1)$'`) },
    { label: "roles de test RPT-05", n: await compter("roles", `code ~* '^rpt05'`) },
    { label: "comptes de test RPT-05", n: await compter("utilisateurs", `email ~* '^rpt05'`) },
    { label: "journal RH de test", n: await compter("rh_audit_logs", `motif ~* '^Test\\b' OR entity_type = 'rh_absence_justification'`) },
    { label: "sites S2ALERTE", n: await compter("parking_sites", `code ~* '^S2ALERTE'`) },
    { label: "zones S2ALERTE", n: await compter("parking_zones", `code ~* '^S2ALERTE'`) },
    { label: "spots S2ALERTE", n: await compter("parking_spots", `code ~* '^S2ALERTE'`) },
  ];
  for (const s of suspects) {
    if (s.n < 0) continue;
    const marque = s.n > 0 ? "  <-- a arbitrer" : "";
    console.log(`  ${String(s.n).padStart(8)}  ${s.label}${marque}`);
  }

  console.log("\n1. VOLUME DES TABLES METIER\n");
  const totalTest = suspects.reduce((a, s) => a + Math.max(0, s.n), 0);
  console.log(`\n  Total de signatures detectees : ${totalTest}`);

  console.log("\n4. DONNEES A QUALIFIER (origine ambigue, pas de decision ici)\n");
  const ambigus: { label: string; n: number }[] = [
    { label: "clients sans telephone ni email", n: await compter("clients", `(telephone IS NULL OR btrim(telephone) = '') AND (email IS NULL OR btrim(email) = '')`) },
    { label: "vehicules sans client rattache", n: await compter("vehicules", `client_id IS NULL`) },
    { label: "lignes parking sans immatriculation (registre GPJ)", n: await compter("parking_vehicles", `immatriculation IS NULL OR btrim(immatriculation) = ''`) },
    { label: "clients marques doublons", n: await compter("clients", `clients_doublonnes = true`) },
  ];
  for (const a of ambigus) {
    if (a.n < 0) continue;
    console.log(`  ${String(a.n).padStart(8)}  ${a.label}`);
  }

  console.log("\n5. ACTIVITE RECENTE\n");
  if (await existe("ordres_reparation")) {
    const recent = (await db.execute(
      sql`SELECT count(*)::int AS n FROM ordres_reparation WHERE date_ouverture > now() - interval '90 days'`,
    )) as unknown as Row[];
    console.log(`  ${String(recent[0]?.n ?? 0).padStart(8)}  dossiers ouverts sur 90 jours`);
  }

  console.log("\n" + "=".repeat(72));
  console.log("FIN DU DIAGNOSTIC. Aucune ecriture n'a ete possible ni effectuee.");
  console.log("Ce rapport ne decide rien : il fournit les chiffres a l'arbitrage.");
  console.log("=".repeat(72));
  process.exit(0);
}

/**
 * Ecart entre le schema attendu par le code et le schema reel de la base.
 *
 * C'est le controle le plus important du diagnostic : une base en retard de
 * migration ne se remarque pas, elle leve `column does not exist` au moment ou
 * un utilisateur clique sur "Enregistrer" - c'est-a-dire en production, au
 * moment ou quelqu'un travaille.
 */
async function ecartDeSchema(): Promise<{ objet: string; attendu: boolean }[]> {
  const attendu: [string, string, string][] = [
    ["vehicules", "immat_norm", "migration 0004 - unicite de plaque"],
    ["clients", "clients_doublonnes", "migration 0005 - dedoublonnage client"],
    ["or_photos", "categorie", "migration 0006 - etat des lieux par face"],
    ["or_photos", "visite", "migration 0006 - etat des lieux par visite"],
    ["or_photos", "reprise_de", "migration 0006 - reprise de visite"],
  ];
  const out: { objet: string; attendu: boolean }[] = [];
  for (const [table, colonne, why] of attendu) {
    if (!(await existe(table))) {
      out.push({ objet: `${table}.${colonne} (table absente) - ${why}`, attendu: false });
      continue;
    }
    const ok = await colonneExiste(table, colonne);
    out.push({ objet: `${table}.${colonne} - ${why}`, attendu: ok });
  }
  for (const t of ["parking_configs", "parking_sites", "parking_zones", "parking_spots"]) {
    const n = await compter(t);
    if (n === 0) out.push({ objet: `${t} : table vide - module parking non configure`, attendu: false });
  }
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
