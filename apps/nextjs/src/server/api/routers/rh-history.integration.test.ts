import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("@atelierone/auth", () => ({
  auth: async () => null,
  signIn: async () => null,
  signOut: async () => null,
  handlers: {},
}));

vi.mock("~/server/lib/rbac-service", () => ({
  RBACService: {
    isSuperAdmin: async (id: string) => id === "1",
    hasPermission: async () => false,
  },
}));

import { rhHistoryRouter } from "./rh-history";
import { rhRouter } from "./rh";
import { db } from "~/server/db";
import {
  employes,
  employeeStatusHistory,
  employeeSalaryHistory,
  contrats,
  contractVersions,
  rhAuditLogs,
} from "@atelierone/db";
import { eq, and } from "drizzle-orm";
import type { ExtendedUser } from "@atelierone/auth/types";

const AGENCE = 1;

function ctxDe(userId: string, role: ExtendedUser["role"]) {
  const user: ExtendedUser = {
    id: userId,
    email: `${role}@gpj.cm`,
    name: role,
    agenceId: AGENCE,
    agenceName: "GPJ",
    organizationId: String(AGENCE),
    role,
    permissions: [],
    isActive: true,
    status: "active",
  };
  return {
    headers: new Headers(),
    user,
    session: { user, expires: "2099-01-01T00:00:00.000Z" },
  };
}

const histCaller = () => rhHistoryRouter.createCaller(ctxDe("1", "superadmin") as never);
// rhRouter est un gros routeur combiné : son type Caller déborde sur
// `DecorateProcedure<any> | DecorateRouterRecord<any>` (quirk tRPC v11 d'inférence,
// sans impact runtime — les 16 tests passent). On réduit le type aux 2 procédures
// réellement appelées pour rétablir la sûreté des appels.
type ContratMutations = {
  createContrat: (args: {
    employeId: number;
    typeContrat: string;
    dateDebut: string;
    dateFin: string;
    dureeMois: number;
    salaireBase: string;
    poste: string;
  }) => Promise<{ id: string }>;
  renouvelerContrat: (args: { id: number }) => Promise<{ success: boolean }>;
  update: (args: { id: string; statut: string }) => Promise<{ success: boolean }>;
  sortir: (args: {
    id: string;
    dateSortie: string;
    motifSortie: string;
    detailMotif: string;
    reembauchable: boolean;
  }) => Promise<{ success: boolean }>;
  reembaucher: (args: { id: string; dateReembauche: string; motif: string }) => Promise<{ success: boolean }>;
};
const rhCaller = () =>
  rhRouter.createCaller(ctxDe("1", "superadmin") as never) as unknown as ContratMutations;

async function codeDe(promise: Promise<unknown>) {
  try {
    await promise;
    return "OK";
  } catch (e) {
    const x = e as { shape?: { data?: { code?: unknown } }; code?: unknown };
    return x.shape?.data?.code ?? x.code ?? "UNKNOWN";
  }
}

const MATRICULE = `TEST-R7-${Date.now()}`;
let empId = -1;
let contractId = -1;

describe("rhHistory (integration — DB locale, R7 historiques/tracabilite)", () => {
  beforeAll(async () => {
    const [emp] = (await db
      .insert(employes)
      .values({
        matricule: MATRICULE,
        civilite: "M.",
        nom: "HISTOIRE",
        prenom: "TestR7",
        fonction: "Technicien",
        statut: "actif",
        salaireBase: "150000",
        modePaie: "SALAIRE_MENSUEL",
        dateEmbauche: "2024-01-01",
        departmentId: 2,
        positionId: 3,
        agenceId: AGENCE,
      } as any)
      .returning()) as any;
    empId = emp.id;
    await db.insert(employeeStatusHistory).values({
      employeeId: empId,
      statut: "actif",
      startDate: "2024-01-01",
      changedBy: 1,
    } as any);
    await db.insert(employeeSalaryHistory).values({
      employeeId: empId,
      baseSalary: "150000",
      startDate: "2024-01-01",
      modePaie: "SALAIRE_MENSUEL",
      changedBy: 1,
    } as any);
  });

  afterAll(async () => {
    if (empId === -1) return;
    try {
      await db.delete(rhAuditLogs).where(
        and(eq(rhAuditLogs.agenceId, AGENCE), eq(rhAuditLogs.entityType, "employe"), eq(rhAuditLogs.entityId, empId))
      );
    } catch {}
    try {
      await db.delete(contractVersions).where(eq(contractVersions.employeId, empId));
    } catch {}
    try {
      await db.delete(contrats).where(eq(contrats.employeId, empId));
    } catch {}
    try {
      await db.delete(employeeSalaryHistory).where(eq(employeeSalaryHistory.employeeId, empId));
    } catch {}
    try {
      await db.delete(employeeStatusHistory).where(eq(employeeStatusHistory.employeeId, empId));
    } catch {}
    try {
      await db.delete(employes).where(eq(employes.id, empId));
    } catch {}
  });

  describe("lecture etat/etatDate/segments", () => {
    it("etat a une date mediane : statut historique, salaire historique, contrat ABSENT (aucune version)", async () => {
      const r = await histCaller().etat({ employeeId: empId, date: "2026-06-15" });
      expect(r.statut).toBe("actif");
      expect(r.sourceStatut).toBe("historique");
      expect(r.salaire).toMatchObject({ baseSalary: 150000, modePaie: "SALAIRE_MENSUEL", source: "historique" });
      expect(r.contrat).toBeNull();
      expect(r.etat.dateEmbauche).toBe("2024-01-01");
    });

    it("etat avant l'embauche : sourceStatut inexistant, anciennete nulle", async () => {
      const r = await histCaller().etat({ employeeId: empId, date: "2023-06-15" });
      expect(r.sourceStatut).toBe("inexistant");
      expect(r.ancienneteJours).toBeNull();
    });

    it("employe hors agence → NOT_FOUND", async () => {
      expect(await codeDe(histCaller().etat({ employeeId: 999999, date: "2026-06-15" }))).toBe("NOT_FOUND");
    });

    it("masquage salaire sans permission rh.salaire.consulter (TEST_SECURITE)", async () => {
      const rhSansDroit = rhHistoryRouter.createCaller(ctxDe("8", "rh") as never);
      const r = await rhSansDroit.etat({ employeeId: empId, date: "2026-06-15" });
      // RPT-05 : la structure reste lisible...
      expect(r.salaire?.source).toBe("historique");
      // ...mais la CLE doit DISPARAITRE. `toBeNull()` acceptait `null`, ce qui est
      // indiscernable d'un vrai salaire nul. `in` refuse les deux.
      expect(r.salaire).not.toHaveProperty("baseSalary");
      expect(r.salaire).not.toHaveProperty("forfaitHebdomadaire");
    });

    it("etatDate renvoie agregeats (conges, avances, presence, sanctions, bulletin) et etat paie", async () => {
      const r = await histCaller().etatDate({ employeeId: empId, date: "2026-08-15" });
      expect(r.statut).toBe("actif");
      expect(r.agregats).toBeDefined();
      expect(Array.isArray(r.agregats.soldeConges)).toBe(true);
      expect(Array.isArray(r.agregats.avances)).toBe(true);
      expect(Array.isArray(r.agregats.sanctions)).toBe(true);
    });

    it("segments sur une plage courte : au moins 1 segment de constance", async () => {
      const segs = await histCaller().segments({ employeeId: empId, from: "2026-03-01", to: "2026-06-30" });
      expect(segs.length).toBeGreaterThanOrEqual(1);
      expect(segs[0].salaire?.baseSalary).toBe(150000);
    });

    it("segments plage > 13 mois → BAD_REQUEST", async () => {
      expect(
        await codeDe(histCaller().segments({ employeeId: empId, from: "2025-01-01", to: "2026-06-30" }))
      ).toBe("BAD_REQUEST");
    });

    it("segments to < from → BAD_REQUEST", async () => {
      expect(
        await codeDe(histCaller().segments({ employeeId: empId, from: "2026-06-30", to: "2026-03-01" }))
      ).toBe("BAD_REQUEST");
    });
  });

  describe("ecriture : contrat → version 1 ; renouvellement → avant-image version 2", () => {
    it("createContrat cree la version 1 (CONTRAT_INITIAL) et etat.contrat la resout", async () => {
      const { id } = await rhCaller().createContrat({
        employeId: empId,
        typeContrat: "CDI",
        dateDebut: "2026-01-01",
        dateFin: "2026-12-31",
        dureeMois: 12,
        salaireBase: "150000",
        poste: "Technicien",
      });
      contractId = Number(id);
      expect(contractId).toBeGreaterThan(0);

      const versions = await histCaller().historiqueContrat({ employeId: empId });
      expect(versions.length).toBe(1);
      expect(versions[0].version).toBe(1);
      expect(versions[0].reason).toBe("CONTRAT_INITIAL");
      expect(versions[0].statut).toBe("actif");
      expect(versions[0].acteur).toBe("Super Admin");

      const etat = await histCaller().etat({ employeeId: empId, date: "2026-05-15" });
      expect(etat.contrat).toMatchObject({ version: 1, typeContrat: "CDI", dureeMois: 12, poste: "Technicien", statut: "actif" });
    });

    it("renouvelerContrat versionne l'avant-image (version 2) puis prolonge la fiche", async () => {
      const res = await rhCaller().renouvelerContrat({ id: contractId });
      expect(res.success).toBe(true);

      const versions = await histCaller().historiqueContrat({ employeId: empId });
      expect(versions.length).toBe(2);
      const v2 = versions.find((v) => v.version === 2);
      expect(v2).toBeDefined();
      expect(v2?.dateFin).toBe("2026-12-31");
      expect(v2?.reason).toContain("RENOUVELLEMENT");

      const etat = await histCaller().etat({ employeeId: empId, date: "2026-05-15" });
      expect(etat.contrat?.version).toBe(2);
      expect(etat.contrat?.dateDebut).toBe("2026-01-01");
    });
  });

  describe("journal avant/apres sur fiche (update) et cycle sortie/reembauche", () => {
    it("update statut → employee_status_history + rh_audit_logs UPDATE_EMPLOYE (avant/apres + motif)", async () => {
      const today = new Date().toISOString().slice(0, 10);
      await rhCaller().update({ id: String(empId), statut: "archive" });

      const audit = (await histCaller().auditEmploye({ employeeId: empId })).filter((a) => a.action === "UPDATE_EMPLOYE");
      expect(audit.length).toBeGreaterThanOrEqual(1);
      expect(audit[0].avantJson).toMatchObject({ statut: "actif" });
      expect(audit[0].apresJson).toMatchObject({ statut: "archive" });
      expect(audit[0].motif).toContain("statut/salaire/poste");
      expect(audit[0].acteur).toBe("Super Admin");

      const etat = await histCaller().etat({ employeeId: empId, date: today });
      expect(etat.statut).toBe("archive");
    });

    it("sortir → historique 'sorti' + audit SORTIE + fiche sortie (date/motif)", async () => {
      await rhCaller().sortir({
        id: String(empId),
        dateSortie: "2026-10-15",
        motifSortie: "demission",
        detailMotif: "Depart test R7",
        reembauchable: true,
      });

      const audit = (await histCaller().auditEmploye({ employeeId: empId })).filter((a) => a.action === "SORTIE");
      expect(audit.length).toBeGreaterThanOrEqual(1);
      expect(audit[0].apresJson).toMatchObject({ statut: "sorti", dateSortie: "2026-10-15" });

      const etat = await histCaller().etat({ employeeId: empId, date: "2026-10-20" });
      expect(etat.statut).toBe("sorti");
      expect(etat.sourceStatut).toBe("historique");
      expect(etat.etat.dateSortie).toBe("2026-10-15");
    });

    it("reembaucher → historique 'actif' re-ouvert, fiche active, audit REEMBAUCHE", async () => {
      await rhCaller().reembaucher({ id: String(empId), dateReembauche: "2026-10-20", motif: "Retour test R7" });

      const audit = (await histCaller().auditEmploye({ employeeId: empId })).filter((a) => a.action === "REEMBAUCHE");
      expect(audit.length).toBeGreaterThanOrEqual(1);
      expect(audit[0].apresJson).toMatchObject({ statut: "actif", dateEffet: "2026-10-20" });

      const etatA = await histCaller().etat({ employeeId: empId, date: "2026-10-18" });
      expect(etatA.statut).toBe("sorti");
      const etatB = await histCaller().etat({ employeeId: empId, date: "2026-10-25" });
      expect(etatB.statut).toBe("actif");
      expect(etatB.sourceStatut).toBe("historique");
    });
  });

  describe("correction salariale retroactive tracee", () => {
    it("INSERT date + fermeture du precedent + fiche projetee + audit + avertissements", async () => {
      const res = await histCaller().corrigerSalaireRetroactif({
        employeeId: empId,
        dateEffet: "2026-06-01",
        baseSalary: 200000,
        reason: "Reclassification test R7",
      });
      expect(res.success).toBe(true);
      expect(res.projectionsFiche).toBe(true);
      expect(Array.isArray(res.bulletinsCloturesImpactes)).toBe(true);

      const audit = (await histCaller().auditEmploye({ employeeId: empId })).filter(
        (a) => a.action === "CORRECTION_SALAIRE_RETROACTIVE"
      );
      expect(audit.length).toBeGreaterThanOrEqual(1);
      // AVEC le droit salaire : les montants sont bien presents dans l'audit.
      expect(audit[0].avantJson).toMatchObject({ salaireBase: "150000" });
      expect(audit[0].apresJson).toMatchObject({ salaireBase: "200000", dateEffet: "2026-06-01" });

      // RPT-05 : SANS le droit, `corrigerSalaireRetroactif` ecrit pourtant
      // salaireBase dans avant/apres. L'endpoint d'audit ne doit pas devenir un
      // canal de fuite qui contourne `rh.salaire.consulter`.
      const auditSansDroit = await rhHistoryRouter
        .createCaller(ctxDe("8", "rh") as never)
        .auditEmploye({ employeeId: empId });
      const ligne = auditSansDroit.filter(
        (a) => a.action === "CORRECTION_SALAIRE_RETROACTIVE"
      )[0];
      expect(ligne).toBeDefined();
      expect(ligne!.avantJson).not.toHaveProperty("salaireBase");
      expect(ligne!.apresJson).not.toHaveProperty("salaireBase");
      // Le reste de l'image reste lisible : on masque un montant, pas l'audit.
      expect(ligne!.apresJson).toMatchObject({ dateEffet: "2026-06-01" });

      const avant = await histCaller().etat({ employeeId: empId, date: "2026-05-15" });
      expect(avant.salaire?.baseSalary).toBe(150000);
      expect(avant.salaire?.source).toBe("historique");

      const apres = await histCaller().etat({ employeeId: empId, date: "2026-06-15" });
      expect(apres.salaire?.baseSalary).toBe(200000);
      expect(apres.salaire?.source).toBe("historique");
    });

    it("reason < 5 caracteres → refus (validation)", async () => {
      const code = await codeDe(
        histCaller().corrigerSalaireRetroactif({
          employeeId: empId,
          dateEffet: "2026-07-01",
          baseSalary: 210000,
          reason: "abc",
        })
      );
      expect(code).not.toBe("OK");
    });

    it("ni baseSalary ni forfait → BAD_REQUEST", async () => {
      expect(
        await codeDe(
          histCaller().corrigerSalaireRetroactif({
            employeeId: empId,
            dateEffet: "2026-07-01",
            reason: "Champ manquant test",
          })
        )
      ).toBe("BAD_REQUEST");
    });
  });
});