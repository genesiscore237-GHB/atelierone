import { db } from "~/server/db";
import { employes, departments, positions, contrats } from "@atelierone/db";
import { eq, and, inArray, ne, ilike, or, type SQL } from "drizzle-orm";
import { RBACService } from "~/server/lib/rbac-service";

/**
 * R9 — Moteur de rapports RH.
 * Sous-couche partagée : UNE SEULE source de population pour
 *   - `rhDashboard.exportEmployes` (CSV existant, inchangé)
 *   - `rhReports.personnel`           (rapport structuré, colonnes configurables)
 * Les filtres, le périmètre agence et le masquage salaire sont IDENTIQUES entre les deux.
 * Aucune règle métier nouvelle : ce fichier lit uniquement la source de vérité employés/contrats.
 */

export interface PersonnelReportRow {
  id: number;
  matricule: string | null;
  nom: string;
  prenom: string | null;
  fonction: string | null;
  poste: string | null;
  departement: string | null;
  statut: string | null;
  telephone: string | null;
  adresse: string | null;
  dateNaissance: string | null;
  dateEmbauche: string | null;
  modePaie: string | null;
  typeContrat: string | null;
  /** Toujours masqué (null) si l'utilisateur n'a pas rh.salaire.consulter. Jamais exposé côté client. */
  salaireBase: number | null;
}

export interface PersonnelRowsParams {
  search?: string;
  statut?: string;
  departmentId?: string;
  employeIds?: number[];
  exclureArchives?: boolean;
  /** Rôle du demandeur : short-circuite la vérification RBAC pour superadmin (même logique que requirePermissionProcedure). */
  role?: string;
}

export async function buildPersonnelRows(
  userId: string | number,
  agenceId: string | number,
  f: PersonnelRowsParams
): Promise<{ rows: PersonnelReportRow[]; canSeeSalary: boolean }> {
  const agenceNum = Number(agenceId);
  const conds: SQL[] = [eq(employes.agenceId, agenceNum)];
  if (f.exclureArchives) conds.push(ne(employes.statut, "archive"));
  if (f.employeIds?.length) conds.push(inArray(employes.id, f.employeIds));
  else {
    if (f.search) {
      const s = or(
        ilike(employes.nom, `%${f.search}%`),
        ilike(employes.prenom, `%${f.search}%`),
        ilike(employes.matricule, `%${f.search}%`)
      );
      if (s) conds.push(s);
    }
    if (f.statut) conds.push(eq(employes.statut, f.statut));
    if (f.departmentId) conds.push(eq(employes.departmentId, Number(f.departmentId)));
  }

  const found = await db
    .select({
      id: employes.id,
      matricule: employes.matricule,
      nom: employes.nom,
      prenom: employes.prenom,
      fonction: employes.fonction,
      statut: employes.statut,
      salaireBase: employes.salaireBase,
      departmentId: employes.departmentId,
      positionId: employes.positionId,
      telephone: employes.telephone,
      adresse: employes.adresse,
      dateNaissance: employes.dateNaissance,
      dateEmbauche: employes.dateEmbauche,
      modePaie: employes.modePaie,
    })
    .from(employes)
    .where(and(...conds));

  const canSeeSalary =
    f.role === "superadmin" ||
    (await RBACService.hasPermission(String(userId), "rh.salaire.consulter", String(agenceNum)));

  const deptIds = [...new Set(found.map((r) => r.departmentId).filter((v): v is number => v !== null))];
  const posIds = [...new Set(found.map((r) => r.positionId).filter((v): v is number => v !== null))];
  const empIds = found.map((r) => r.id);

  const [depts, pos, ctrs] = await Promise.all([
    deptIds.length
      ? db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, deptIds))
      : Promise.resolve([]),
    posIds.length
      ? db.select({ id: positions.id, name: positions.name }).from(positions).where(inArray(positions.id, posIds))
      : Promise.resolve([]),
    empIds.length
      ? db
          .select({ employeId: contrats.employeId, typeContrat: contrats.typeContrat, dateDebut: contrats.dateDebut })
          .from(contrats)
          .where(inArray(contrats.employeId, empIds))
          .orderBy(contrats.dateDebut)
      : Promise.resolve([]),
  ]);

  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  const posName = new Map(pos.map((p) => [p.id, p.name]));
  const contratParEmploye = new Map<number, string | null>();
  for (const c of ctrs) {
    if (!contratParEmploye.has(c.employeId)) contratParEmploye.set(c.employeId, c.typeContrat);
  }

  const rows: PersonnelReportRow[] = found.map((r) => ({
    id: r.id,
    matricule: r.matricule,
    nom: r.nom,
    prenom: r.prenom,
    fonction: r.fonction ?? null,
    poste: posName.get(r.positionId ?? -1) ?? null,
    departement: deptName.get(r.departmentId ?? -1) ?? null,
    statut: r.statut,
    telephone: r.telephone ?? null,
    adresse: r.adresse ?? null,
    dateNaissance: r.dateNaissance ? String(r.dateNaissance) : null,
    dateEmbauche: r.dateEmbauche ? String(r.dateEmbauche) : null,
    modePaie: r.modePaie ?? null,
    typeContrat: contratParEmploye.get(r.id) ?? null,
    salaireBase: canSeeSalary ? Number(r.salaireBase ?? 0) : null,
  }));

  return { rows, canSeeSalary };
}