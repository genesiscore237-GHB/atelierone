import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import { sql, eq } from "drizzle-orm";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as schema from "./schema";
import { ensureSecuritySocle } from "./security-socle";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

requireLocalOrForced("db:install (seed-install.ts)");

/**
 * INSTALLATION PROPRE ATELIERONE « chez le client ».
 * Purge TOTALE puis recrée :
 *  1. les deux sites (agences) : Site Principal – Atelier / Site Secondaire – Stockage
 *  2. le socle sécurité (10 rôles garage + permissions + matrice)
 *  3. l'administrateur + les comptes de démonstration (mot de passe : admin123)
 *  4. les objets SQL hors schéma drizzle (schema-extras : fonctions, vues, triggers, RLS)
 *
 * Le CATALOGUE (catégories, fournisseurs, produits, stocks) n'est PAS créé ici :
 * il est inséré par le pipeline d'import standard (import:catalogue) après
 * contrôle de conformité — voir scripts/deploy.mjs.
 */

const SITES = [
  {
    nom: "GPJ - Atelier (Site Principal)",
    code: "SITE-1",
    adresse: "Yaoundé",
    telephone: "+237 000 000 000",
    email: "contact@gpj.cm",
    ville: "Yaoundé",
    pays: "Cameroun",
    devise: "XAF",
    tvaDefaut: "19.25",
    prefixeFacture: "GPJ-FAC-",
    prefixeDevis: "GPJ-DEV-",
    prefixeOR: "GPJ-OR-",
    prefixeBC: "GPJ-BC-",
    isActive: true,
  },
  {
    nom: "GPJ - Stockage (Site Secondaire)",
    code: "SITE-2",
    adresse: "Yaoundé (zone de stockage longue durée)",
    telephone: "+237 000 000 000",
    email: "contact@gpj.cm",
    ville: "Yaoundé",
    pays: "Cameroun",
    devise: "XAF",
    tvaDefaut: "19.25",
    prefixeFacture: "GPJ-FAC-",
    prefixeDevis: "GPJ-DEV-",
    prefixeOR: "GPJ-OR-",
    prefixeBC: "GPJ-BC-",
    isActive: true,
  },
];

const DEMO_USERS = [
  { email: "directeur@gpj.cm", role: "directeur", nom: "Directeur", prenom: "Patron", fonction: "Directeur / Patron" },
  { email: "chef.atelier@gpj.cm", role: "chef_atelier", nom: "Chef", prenom: "Atelier", fonction: "Chef des ateliers" },
  { email: "secretaire@gpj.cm", role: "secretaire", nom: "Secretaire", prenom: "Accueil", fonction: "Secrétaire / Accueil" },
  { email: "magasinier@gpj.cm", role: "magasinier", nom: "Magasinier", prenom: "Stock", fonction: "Magasinier" },
  { email: "technicien@gpj.cm", role: "technicien", nom: "Technicien", prenom: "Atelier", fonction: "Technicien / Mécanicien" },
  { email: "comptable@gpj.cm", role: "comptable", nom: "Comptable", prenom: "Finance", fonction: "Comptable" },
  { email: "rh@gpj.cm", role: "rh", nom: "RH", prenom: "Personnel", fonction: "Responsable RH" },
  { email: "consultation@gpj.cm", role: "consultation", nom: "Consultation", prenom: "Lecture", fonction: "Consultation seule" },
];

(async () => {
  const raw = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false });
  console.log("=== INSTALL PROPRE ATELIERONE (purge totale + socle) ===");

  // 1. Purge totale : toutes les tables du schéma public
  const tables = await raw`
    select tablename from pg_tables
    where schemaname = 'public' and tablename not in ('__drizzle_migrations')
    order by tablename`;
  const list = tables.map((t: any) => t.tablename);
  await raw`TRUNCATE TABLE ${raw(list)} RESTART IDENTITY CASCADE`;
  console.log(`Purge totale: ${list.length} tables vidées.`);

  // 2. Sites (agences)
  const agencesInserees = [];
  for (const s of SITES) {
    const [agence] = await db.insert(schema.agences).values(s as any).returning();
    agencesInserees.push(agence);
    console.log(`Site: ${agence.nom} (${agence.code}) — ${agence.ville}, ${agence.pays}`);
  }
  const agence = agencesInserees[0];

  // 3. Socle sécurité (rôles + permissions + associations)
  const socle = await ensureSecuritySocle(db);
  console.log(`Socle: ${socle.roles.length} rôles, ${socle.permissions.length} permissions, ${socle.associationsCrees} associations.`);

  // 4. Objets SQL hors schéma drizzle (fonctions, vues, triggers, RLS,
  //     soft-delete, séquences) — idempotent, exécuté en une passe (simple
  //     query protocol) car le fichier contient des blocs DO $$ avec des ';'.
  const extrasSql = fs.readFileSync(path.resolve(__dirname, "schema-extras.sql"), "utf-8");
  await raw.unsafe(extrasSql);
  console.log("Schema-extras (fonctions, vues, triggers, RLS): OK");

  // 5. Administrateur + comptes de démonstration (liés aux fiches RH)
  const adminRole = socle.roles.find((r: any) => r.code === "superadmin");
  if (!adminRole) throw new Error("Rôle superadmin introuvable");
  const hashed = await bcrypt.hash("admin123", 10);

  await db.insert(schema.utilisateurs).values({
    email: "admin@gpj.cm",
    loginEmail: "admin@gpj.cm",
    motDePasse: hashed,
    nom: "Admin",
    prenom: "Super",
    telephone: "+237 000 000 000",
    agenceId: agence.id,
    roleId: adminRole.id,
    isActive: true,
    status: "active",
    emailVerified: new Date(),
  });
  console.log("Admin: admin@gpj.cm / admin123");

  let empNum = 9001;
  for (const u of DEMO_USERS) {
    const role = socle.roles.find((r: any) => r.code === u.role);
    if (!role) continue;
    const matricule = `GPJ-${new Date().getFullYear()}-${String(empNum).padStart(4, "0")}`;
    empNum++;
    const [emp] = await db.insert(schema.employes).values({
      matricule,
      nom: u.nom,
      prenom: u.prenom,
      emailPersonnel: u.email,
      telephone: "+237 600 000 000",
      fonction: u.fonction,
      typeEmploye: "permanent",
      agenceId: agence.id,
      dateEmbauche: "2026-01-01",
      statut: "actif",
    } as any).returning() as any;
    if (!emp) continue;
    const [user] = await db.insert(schema.utilisateurs).values({
      email: u.email,
      loginEmail: u.email,
      motDePasse: hashed,
      nom: u.nom,
      prenom: u.prenom,
      telephone: "+237 600 000 000",
      agenceId: agence.id,
      roleId: role.id,
      isActive: true,
      status: "active",
      emailVerified: new Date(),
      employeId: emp.id,
    }).onConflictDoNothing({ target: schema.utilisateurs.email }).returning() as any;
    if (user?.id) {
      await db.update(schema.employes).set({ userId: user.id } as any).where(eq(schema.employes.id, emp.id));
    }
  }
  console.log(`Comptes de démonstration: ${DEMO_USERS.length} (mot de passe: admin123)`);

  console.log("=== INSTALL TERMINÉE. Le catalogue se peuple via le pipeline d'import (deploy). ===");
  await raw.end();
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});
