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
 * INSTALLATION PROPRE « chez le client ».
 * Purge TOTALE de la base (opérations, produits, comptes, socle, référentiel),
 * puis recrée :
 *  1. l'agence Mvog-Ada (Yaoundé, Cameroun, XAF)
 *  2. le socle sécurité (rôles + permissions)
 *  3. l'administrateur + les comptes de démonstration (mot de passe : admin123)
 *  4. le référentiel éducatif camerounais (sous-systèmes, ministères, niveaux,
 *     classes, matières, filières, années scolaires, unités de mesure)
 *
 * Le CATALOGUE (catégories, éditeurs, fournisseurs, produits, stocks) n'est PAS
 * créé ici : il est inséré par le pipeline d'import standard (import:catalogue)
 * après contrôle de conformité — voir scripts/deploy.mjs.
 */

const AGENCE = {
  nom: "Mvog-Ada",
  code: "MVOG-ADA",
  adresse: "Mvog-Ada, Yaoundé",
  telephone: "+237 000 000 000",
  email: "contact@atelierone.cm",
  ville: "Yaoundé",
  pays: "Cameroun",
  devise: "XAF",
  tvaDefaut: "18",
  prefixeFacture: "LIP",
  isActive: true,
};

const DEMO_USERS = [
  { email: "operateur@atelierone.cm", role: "operateur_pos", nom: "Operateur", prenom: "Test", fonction: "Opérateur POS" },
  { email: "caissier@atelierone.cm", role: "caissier", nom: "Caissier", prenom: "Test", fonction: "Caissier" },
  { email: "magasinier@atelierone.cm", role: "magasinier", nom: "Magasinier", prenom: "Test", fonction: "Magasinier" },
  { email: "comptable@atelierone.cm", role: "comptable", nom: "Comptable", prenom: "Test", fonction: "Comptable" },
  { email: "rh@atelierone.cm", role: "rh", nom: "RH", prenom: "Test", fonction: "Gestionnaire RH" },
  { email: "consultation@atelierone.cm", role: "consultation", nom: "Consultation", prenom: "Test", fonction: "Consultant" },
  { email: "responsable@atelierone.cm", role: "responsable_agence", nom: "Responsable", prenom: "Agence", fonction: "Responsable d'Agence" },
  { email: "achats@atelierone.cm", role: "gestionnaire_achats", nom: "Achats", prenom: "Test", fonction: "Gestionnaire Achats" },
];

(async () => {
  const raw = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false });
  console.log("=== INSTALL PROPRE (purge totale + socle + référentiel) ===");

  // 1. Purge totale : toutes les tables du schéma public
  const tables = await raw`
    select tablename from pg_tables
    where schemaname = 'public' and tablename not in ('__drizzle_migrations')
    order by tablename`;
  const list = tables.map((t: any) => t.tablename);
  await raw`TRUNCATE TABLE ${raw(list)} RESTART IDENTITY CASCADE`;
  console.log(`Purge totale: ${list.length} tables vidées.`);

  // 2. Agence
  const [agence] = await db.insert(schema.agences).values(AGENCE as any).returning();
  console.log(`Agence: ${agence.nom} (${agence.code}) — ${agence.ville}, ${agence.pays}`);

  // 3. Socle sécurité (rôles + permissions + associations)
  const socle = await ensureSecuritySocle(db);
  console.log(`Socle: ${socle.roles.length} rôles, ${socle.permissions.length} permissions, ${socle.associationsCrees} associations.`);

  // 4. Référentiel éducatif camerounais (idempotent)
  const educationSql = fs.readFileSync(path.resolve(__dirname, "seed-education.sql"), "utf-8");
  const statements = educationSql.split(";").filter(s => s.trim());
  for (const stmt of statements) {
    // Retirer les lignes de commentaires (sinon une statement précédée d'un
    // commentaire serait rejetée à tort par un filtre startsWith("--")).
    const stmtClean = stmt
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("--"))
      .join("\n")
      .trim();
    // Section "VERIFICATION" du fichier : sans intérêt pour l'installation.
    if (!stmtClean || stmtClean.startsWith("SELECT")) continue;
    try {
      await db.execute(sql.raw(stmtClean));
    } catch (e: any) {
      if (e?.message && (e.message.includes("already exists") || e.message.includes("duplicate"))) continue;
      console.error("STATEMENT EN ERREUR:\n", stmtClean.slice(0, 500));
      throw e;
    }
  }
  const [nbUnites] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.unitesMesure);
  console.log(`Référentiel éducatif: OK (${nbUnites.n} unités de mesure).`);

  // 4b. Objets SQL hors schéma drizzle (fonctions, vues, triggers, RLS,
  //     soft-delete, séquences) — idempotent. Exécuté en une passe via le
  //     client postgres-js (simple query protocol) car le fichier contient
  //     des blocs DO $$ avec des ';' internes (un découpage les casserait).
  const extrasSql = fs.readFileSync(path.resolve(__dirname, "schema-extras.sql"), "utf-8");
  await raw.unsafe(extrasSql);
  console.log("Schema-extras (fonctions, vues, triggers, RLS): OK");

  // 5. Administrateur + comptes de démonstration (liés aux fiches RH)
  const adminRole = socle.roles.find((r: any) => r.code === "admin_reseau");
  if (!adminRole) throw new Error("Rôle admin_reseau introuvable");
  const hashed = await bcrypt.hash("admin123", 10);

  await db.insert(schema.utilisateurs).values({
    email: "admin@atelierone.cm",
    loginEmail: "admin@atelierone.cm",
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
  console.log("Admin: admin@atelierone.cm / admin123");

  let empNum = 9001;
  for (const u of DEMO_USERS) {
    const role = socle.roles.find((r: any) => r.code === u.role);
    if (!role) continue;
    const matricule = `AO-${new Date().getFullYear()}-${String(empNum).padStart(4, "0")}`;
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
