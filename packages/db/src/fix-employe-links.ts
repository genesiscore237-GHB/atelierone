import "dotenv/config";
import { db } from "./client";
import * as schema from "./schema";
import { eq, desc, isNull, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function fixEmployeLinks() {
  console.log("=== FIX: Création des employés manquants pour les utilisateurs existants ===\n");

  const users = await db.select().from(schema.utilisateurs);
  console.log(`Total utilisateurs trouvés: ${users.length}\n`);

  const [lastMat] = await db
    .select({ mat: schema.employes.matricule })
    .from(schema.employes)
    .orderBy(desc(schema.employes.matricule))
    .limit(1);

  const year = new Date().getFullYear();
  let nextNum = lastMat
    ? parseInt(lastMat.mat.split("-")[2] ?? "0", 10) + 1
    : 9001;

  let created = 0;
  let linked = 0;
  let passwordSet = 0;
  let alreadyOk = 0;

  for (const user of users) {
    let employee: any = null;

    if (user.employeId) {
      const [emp] = await db
        .select()
        .from(schema.employes)
        .where(eq(schema.employes.id, user.employeId))
        .limit(1);
      employee = emp;
    }

    if (!employee) {
      const matricule = `AO-${year}-${String(nextNum).padStart(4, "0")}`;
      nextNum++;

      const [emp] = await db.insert(schema.employes).values({
        matricule,
        nom: user.nom || "Inconnu",
        prenom: user.prenom || "",
        emailPersonnel: user.email,
        telephone: user.telephone || "",
        fonction: "Employé",
        typeEmploye: "permanent",
        agenceId: user.agenceId,
        dateEmbauche: new Date(user.createdAt ?? new Date()).toISOString(),
        statut: "actif",
      } as any).returning() as any;

      employee = emp;

      await db.update(schema.utilisateurs)
        .set({ employeId: employee.id } as any)
        .where(eq(schema.utilisateurs.id, user.id));

      created++;
      console.log(`  + Employé créé: ${matricule} → ${user.email}`);
    }

    if (employee && !employee.userId) {
      await db.update(schema.employes)
        .set({ userId: user.id } as any)
        .where(eq(schema.employes.id, employee.id));
      linked++;
      console.log(`  ↕ Lien employe.userId: ${employee.matricule} ↔ ${user.email}`);
    }

    if (!user.motDePasse) {
      const pw = await bcrypt.hash("admin123", 10);
      await db.update(schema.utilisateurs)
        .set({
          motDePasse: pw,
          status: "active",
          emailVerified: new Date(),
        } as any)
        .where(eq(schema.utilisateurs.id, user.id));
      passwordSet++;
      console.log(`  🔑 Mot de passe réinitialisé: ${user.email} → admin123`);
    }

    if (user.employeId && employee?.userId) {
      alreadyOk++;
    }
  }

  console.log(`\n=== RÉSULTAT ===`);
  console.log(`  Déjà cohérents:       ${alreadyOk}`);
  console.log(`  Employés créés:        ${created}`);
  console.log(`  Liens userId ajoutés:  ${linked}`);
  console.log(`  Mots de passe définis: ${passwordSet}`);
  console.log(`  Total traités:         ${users.length}`);
}

fixEmployeLinks()
  .catch((e) => {
    console.error("Fix failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
