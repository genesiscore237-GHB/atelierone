import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import { eq, and } from "drizzle-orm";
import {
  agences,
  departments,
  positions,
  employes,
  contrats,
  hrWorkCycles,
} from "./schema";

requireLocalOrForced("db:seed:employes (seed-employes-gpj.ts)");

/**
 * RH MVP — SEED DES 13 EMPLOYÉS RÉELS DU GARAGE POLYVALENT JUNIOR.
 * Source : Gestion_Personnel_Garage_Polyvalent_Junior_PRO.xlsx (01_Employes).
 * Idempotent : n'insère que les matricules absents (EMP001 → EMP013).
 *
 * Référentiels complétés (départements / postes du fichier client) puis fiches.
 * modePaie = "horaire" → la paie est calculée sur les heures réelles
 * (logique du fichier : HN × taux + HS × taux majoré + primes de tâche).
 */

const EMPLOYES: Array<{
  matricule: string;
  nom: string;
  prenom: string;
  poste: string;
  departement: string;
  telephone: string;
  telephone2?: string;
  email?: string;
  typeContrat: "CDI" | "CDD" | "Apprentissage";
  salaire: number;
}> = [
  { matricule: "EMP001", nom: "Tsafack Ndongmo", prenom: "Symphonien", poste: "Administrateur", departement: "Administration", telephone: "677 89 71 62", typeContrat: "CDI", salaire: 250000 },
  { matricule: "EMP002", nom: "Pandja Tchatchoua", prenom: "Syriane", poste: "Secrétaire", departement: "Administration", telephone: "656 04 71 31", typeContrat: "CDI", salaire: 150000 },
  { matricule: "EMP003", nom: "Takoueta", prenom: "Yvan", poste: "Chef des ateliers", departement: "Direction Atelier", telephone: "657 78 99 78", typeContrat: "CDI", salaire: 300000 },
  { matricule: "EMP004", nom: "Chekep", prenom: "Faustin", poste: "Mécanicien", departement: "Atelier Mécanique", telephone: "672 67 18 01", typeContrat: "CDI", salaire: 180000 },
  { matricule: "EMP005", nom: "Abdou", prenom: "", poste: "Tôlier", departement: "Carrosserie", telephone: "673 84 48 12", typeContrat: "Apprentissage", salaire: 80000 },
  { matricule: "EMP006", nom: "Nyontyen Si", prenom: "Jean Vinny", poste: "Mécanicien", departement: "Atelier Mécanique", telephone: "694 36 28 38", typeContrat: "Apprentissage", salaire: 80000 },
  { matricule: "EMP007", nom: "Holé", prenom: "Homsala", poste: "Magasinier", departement: "Magasin", telephone: "699 47 09 80", email: "holehomsala7@gmail.com", typeContrat: "Apprentissage", salaire: 80000 },
  { matricule: "EMP008", nom: "Ebene", prenom: "Ngono", poste: "Mécanicien", departement: "Atelier Mécanique", telephone: "653 04 86 11", typeContrat: "Apprentissage", salaire: 80000 },
  { matricule: "EMP009", nom: "Tineba", prenom: "Vital Eric", poste: "Mécanicien", departement: "Atelier Mécanique", telephone: "698 14 24 06", typeContrat: "Apprentissage", salaire: 80000 },
  { matricule: "EMP010", nom: "Deutchoua Tientcheu", prenom: "Christian", poste: "Mécanicien", departement: "Atelier Mécanique", telephone: "695 07 89 78", telephone2: "678 03 61 47", typeContrat: "Apprentissage", salaire: 80000 },
  { matricule: "EMP011", nom: "Fouakouet", prenom: "Youssoufa", poste: "Électronicien", departement: "Atelier Mécanique", telephone: "640 85 90 53", telephone2: "620 04 32 29", typeContrat: "Apprentissage", salaire: 80000 },
  { matricule: "EMP012", nom: "Ngouamera", prenom: "Adrien Gildas", poste: "Mécanicien", departement: "Atelier Mécanique", telephone: "680 09 48 64", typeContrat: "Apprentissage", salaire: 80000 },
  { matricule: "EMP013", nom: "Nague Zemdjui", prenom: "Arnaud", poste: "Assistant Administratif", departement: "Administration", telephone: "658 77 57 44", email: "arnaudstars@gmail.com", typeContrat: "CDD", salaire: 120000 },
];

// Départements du fichier client (ajoutés s'ils manquent)
const DEPT_FICHIER = [
  { code: "ADM", name: "Administration" },
  { code: "DIR_ATELIER", name: "Direction Atelier" },
  { code: "ATELIER_MECA", name: "Atelier Mécanique" },
  { code: "CARROSSERIE", name: "Carrosserie" },
  { code: "MAGASIN", name: "Magasin" },
  { code: "DIR_GEN", name: "Direction Générale" },
];

// Postes du fichier client (ajoutés s'ils manquent)
const POSTE_FICHIER = [
  { code: "ADMINISTRATEUR", name: "Administrateur", dept: "ADM" },
  { code: "SECRETAIRE", name: "Secrétaire", dept: "ADM" },
  { code: "CHEF_ATELIERS", name: "Chef des ateliers", dept: "DIR_ATELIER" },
  { code: "MECANICIEN", name: "Mécanicien", dept: "ATELIER_MECA" },
  { code: "TOLIER", name: "Tôlier", dept: "CARROSSERIE" },
  { code: "MAGASINIER", name: "Magasinier", dept: "MAGASIN" },
  { code: "ELECTRONICIEN", name: "Électronicien", dept: "ATELIER_MECA" },
  { code: "ASSIST_ADM", name: "Assistant Administratif", dept: "ADM" },
  { code: "APPRENTI", name: "Apprenti", dept: "ATELIER_MECA" },
  { code: "AUTRE", name: "Autre", dept: "ADM" },
];

async function main() {
  const [agence] = await db.select({ id: agences.id }).from(agences).limit(1);
  if (!agence) {
    console.error("Aucune agence : exécutez d'abord db:seed:rh / seed-install.");
    process.exit(1);
  }
  const agenceId = agence.id;

  // 1. Départements du fichier
  for (const d of DEPT_FICHIER) {
    const [exists] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.agenceId, agenceId), eq(departments.code, d.code)))
      .limit(1);
    if (!exists) {
      await db.insert(departments).values({ agenceId, code: d.code, name: d.name, active: true } as any);
    }
  }

  // 2. Postes du fichier (reliés aux départements)
  const deptMap = new Map<string, number>();
  const depts = await db
    .select({ id: departments.id, code: departments.code })
    .from(departments)
    .where(eq(departments.agenceId, agenceId));
  for (const d of depts) deptMap.set(d.code, d.id);

  const posMap = new Map<string, number>();
  for (const p of POSTE_FICHIER) {
    const deptId = deptMap.get(p.dept);
    const [exists] = await db
      .select({ id: positions.id })
      .from(positions)
      .where(and(eq(positions.agenceId, agenceId), eq(positions.code, p.code)))
      .limit(1);
    if (!exists) {
      const [row] = await db
        .insert(positions)
        .values({ agenceId, code: p.code, name: p.name, departmentId: deptId ?? null, active: true } as any)
        .returning();
      posMap.set(p.code, row.id);
    } else {
      posMap.set(p.code, exists.id);
    }
  }

  // Cycle par défaut (horaires du garage)
  const [cycle] = await db
    .select({ id: hrWorkCycles.id })
    .from(hrWorkCycles)
    .where(and(eq(hrWorkCycles.agenceId, agenceId), eq(hrWorkCycles.isDefault, true)))
    .limit(1);

  // 3. Les 13 employés
  let created = 0;
  for (const e of EMPLOYES) {
    const [existing] = await db
      .select({ id: employes.id })
      .from(employes)
      .where(eq(employes.matricule, e.matricule))
      .limit(1);
    if (existing) continue;

    const deptId = deptMap.get(e.departement) ?? null;
    const posId = posMap.get(e.poste) ?? null;
    const typeEmploye = e.typeContrat === "CDI" ? "permanent" : e.typeContrat === "CDD" ? "contractuel" : "apprenti";

    const [emp] = await db
      .insert(employes)
      .values({
        matricule: e.matricule,
        nom: e.nom,
        prenom: e.prenom,
        fonction: e.poste,
        departmentId: deptId,
        positionId: posId,
        workCycleId: cycle?.id ?? null,
        telephone: e.telephone,
        telephoneSecondaire: e.telephone2 ?? null,
        emailPersonnel: e.email ?? null,
        typeEmploye,
        modePaie: "horaire", // paie sur heures réelles (logique du fichier)
        salaireBase: String(e.salaire),
        devise: "XAF",
        statut: "actif",
        agenceId,
        dateEmbauche: null,
      } as any)
      .returning();

    await db.insert(contrats).values({
      employeId: emp.id,
      typeContrat: e.typeContrat,
      dateDebut: new Date().toISOString().slice(0, 10),
      salaireBase: String(e.salaire),
      poste: e.poste,
      statut: "actif",
    } as any);

    created++;
  }

  console.log(`Seed employés GPJ terminé : ${created} fiche(s) créée(s) (EMP001→EMP013).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});