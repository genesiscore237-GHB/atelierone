import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure, protectedProcedure } from "~/server/api/trpc";
import { db, employes, utilisateurs, absences, sanctions, contrats, documentsEmployes, departments, positions, contractTypes, employeePositions, employeeSalaryHistory, employeeStatusHistory, hrGeneralSettings, hrWorkCycles, employeeAdvances, advanceTransitions, payrollEntries, payrollPeriods, attendanceMonthlySummaries, employeeSituations, employeeSituationTransitions, hrSituationTypes, contractVersions } from "@atelierone/db";
import { eq, and, or, ilike, desc, asc, count, sql, gte, lte, ne, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { RBACService } from "~/server/lib/rbac-service";
import { selectionRoster, verifierReembauche } from "~/server/lib/rh-recherche";
import { normaliserModePaie, veilleDe } from "~/server/lib/payroll-engine";
import { assertEmployeEnAgence } from "~/server/lib/rh-scope";
import {
  canSeeSalary as canVoirSalairesRH,
  sansChampsStrict,
  CHAMPS_SENSIBLES_FICHE,
  CHAMPS_SENSIBLES_CONTACT,
} from "~/server/lib/rh-secrets";
import { moisCloture } from "~/server/lib/rh-projection";
import { journaliserAvantApres } from "~/server/lib/rh-audit";
import { prochaineVersionContrat } from "~/server/lib/rh-history-engine";

const motifSortieLabels: Record<"demission" | "licenciement" | "fin_cdd" | "retraite" | "rupture_conventionnelle" | "autre_vie_pro", string> = {
  demission: "Démission",
  licenciement: "Licenciement",
  fin_cdd: "Fin de CDD",
  retraite: "Retraite",
  rupture_conventionnelle: "Rupture conventionnelle",
  autre_vie_pro: "Autre motif de vie professionnelle",
};

/** Événement agrégé du parcours d'un employé (R6 : historique lisible et complet) */
interface HistoriqueEventRow {
  id: string;
  type: "statut" | "poste" | "salaire" | "avance" | "bulletin" | "presence";
  date: Date | null;
  titre: string;
  detail: string | null;
  motif: string | null;
  acteur: string | null;
}

export const rhRouter = createTRPCRouter({
  list: rhProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(10).max(300).default(100),
        search: z.string().optional(),
        statut: z.enum(["actif", "conge", "suspendu", "archive", "sorti"]).optional(),
        exclureArchives: z.boolean().optional(),
        typeEmploye: z.enum(["permanent", "contractuel", "stagiaire", "temporaire", "apprenti", "prestataire"]).optional(),
        departmentId: z.number().int().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(employes.agenceId, ctx.user.agenceId)];

      if (input.search) {
        conditions.push(
          sql`(${employes.nom} ILIKE ${`%${input.search}%`} OR ${employes.prenom} ILIKE ${`%${input.search}%`} OR ${employes.matricule} ILIKE ${`%${input.search}%`})`,
        );
      }
      if (input.statut) conditions.push(eq(employes.statut, input.statut));
      else if (input.exclureArchives) conditions.push(ne(employes.statut, "archive"));
      if (input.typeEmploye) conditions.push(eq(employes.typeEmploye, input.typeEmploye));
      if (input.departmentId) conditions.push(eq(employes.departmentId, input.departmentId));

      const offset = (input.page - 1) * input.limit;

      const rows = await db
        .select({
          id: employes.id,
          matricule: employes.matricule,
          nom: employes.nom,
          prenom: employes.prenom,
          emailPersonnel: employes.emailPersonnel,
          telephone: employes.telephone,
          fonction: employes.fonction,
          typeEmploye: employes.typeEmploye,
          statut: employes.statut,
          dateEmbauche: employes.dateEmbauche,
          dateSortie: employes.dateSortie,
          motifSortie: employes.motifSortie,
          reembauchable: employes.reembauchable,
          salaireBase: employes.salaireBase,
          photoUrl: employes.photoUrl,
          userId: employes.userId,
          departmentId: employes.departmentId,
          departmentName: departments.name,
          createdAt: employes.createdAt,
        })
        .from(employes)
        .leftJoin(departments, eq(employes.departmentId, departments.id))
        .where(and(...conditions))
        .orderBy(desc(employes.createdAt))
        .limit(input.limit)
        .offset(offset);

      const total = await db
        .select({ count: count() })
        .from(employes)
        .where(and(...conditions));

      const canSeeSalary = await RBACService.hasPermission(
        ctx.user.id,
        "rh.salaire.consulter",
        String(ctx.user.agenceId ?? "")
      );

      return {
        employees: rows.map((r) => ({
          id: r.id,
          matricule: r.matricule ?? "",
          nom: r.nom,
          prenom: r.prenom,
          emailPersonnel: r.emailPersonnel,
          telephone: r.telephone,
          fonction: r.fonction,
          typeEmploye: r.typeEmploye,
          statut: r.statut ?? "actif",
          dateEmbauche: r.dateEmbauche,
          dateSortie: r.dateSortie,
          motifSortie: r.motifSortie,
          reembauchable: r.reembauchable,
          // RPT-05 : la cle doit DISPARAITRE sans le droit. `{ salaireBase: null }`
          // est indiscernable d'un salaire reellement nul.
          ...(canSeeSalary ? { salaireBase: r.salaireBase } : {}),
          photoUrl: r.photoUrl,
          userId: r.userId,
          departmentId: r.departmentId,
          departmentName: r.departmentName,
          hasAccount: r.userId !== null,
          createdAt: r.createdAt?.toISOString() ?? "",
        })),
        total: total[0]?.count ?? 0,
        page: input.page,
        limit: input.limit,
      };
    }),

  // N02 — lecture réduite pour les rôles opérationnels (Outillage, Planning atelier,
  // Travaux, listes OR) : profil annuaire minimal, aucune donnée de contact ni salaire.
  // `rh.list` reste réservé RH/Direction (rhProcedure) — aucun `rh.*` n'est accordé
  // aux rôles opérationnels dans la matrice, le module RH ne s'ouvre pas pour eux.
  roster: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        statut: z.enum(["actif", "conge", "suspendu", "archive", "sorti"]).default("actif"),
        limit: z.number().min(1).max(500).default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(employes.agenceId, ctx.user.agenceId)];
      if (input.search) {
        conditions.push(
          sql`(${employes.nom} ILIKE ${`%${input.search}%`} OR ${employes.prenom} ILIKE ${`%${input.search}%`} OR ${employes.matricule} ILIKE ${`%${input.search}%`})`,
        );
      }
      conditions.push(eq(employes.statut, input.statut));

      return db
        .select(selectionRoster() as any)
        .from(employes)
        .leftJoin(departments, eq(employes.departmentId, departments.id))
        .where(and(...conditions))
        .orderBy(desc(employes.createdAt))
        .limit(input.limit);
    }),

  get: rhProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [row] = await db
        .select()
        .from(employes)
        .where(
          and(
            eq(employes.id, input.id),
            eq(employes.agenceId, ctx.user.agenceId),
          ),
        )
        .limit(1);

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employé non trouvé." });
      }

      // RPT-05 : le masquage SUPPRIME les cles. `{ ...row, salaireBase: null }`
      // laissait bancaire, CNSS, NIU et piece d'identite en clair, et `null`
      // est indiscernable d'une valeur reelle.
      const salaireOk = await canVoirSalairesRH(ctx);
      return salaireOk ? row : sansChampsStrict(row, [...CHAMPS_SENSIBLES_FICHE]);
    }),

  create: requirePermissionProcedure("rh.employe.modifier")
    .input(
      z.object({
        civilite: z.string().optional(),
        nom: z.string().min(1),
        prenom: z.string().min(1),
        dateNaissance: z.string().optional(),
        lieuNaissance: z.string().optional(),
        sexe: z.enum(["M", "F"]).optional(),
        emailPersonnel: z.string().email().optional().or(z.literal("")),
        telephone: z.string().optional(),
        telephoneSecondaire: z.string().optional(),
        adresse: z.string().optional(),
        ville: z.string().optional(),
        contactUrgenceNom: z.string().optional(),
        contactUrgenceTelephone: z.string().optional(),
        typeEmploye: z.enum(["permanent", "contractuel", "stagiaire", "temporaire", "apprenti", "prestataire"]).default("permanent"),
        fonction: z.string().min(1),
        departmentId: z.number().int().optional(),
        positionId: z.number().int().optional(),
        workCycleId: z.number().int().optional(),
        managerId: z.number().int().optional(),
        dateEmbauche: z.string().default(() => { const d = new Date().toISOString().split("T")[0]; return d ?? "2000-01-01"; }),
        dateFinContrat: z.string().optional(),
        periodeEssaiFin: z.string().optional(),
        salaireBase: z.string().optional(),
        modePaie: z.enum(["mensuel", "horaire", "journalier", "commission"]).default("mensuel"),
        numCnss: z.string().optional(),
        niu: z.string().optional(),
        numCompteBancaire: z.string().optional(),
        banque: z.string().optional(),
        typePieceIdentite: z.string().optional(),
        numPieceIdentite: z.string().optional(),
        pieceExpireLe: z.string().optional(),
        diplome: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const year = new Date().getFullYear();

      return db.transaction(async (tx) => {
      // Règle métier : le manager doit être un employé actif
      if (input.managerId) {
        const [manager] = await tx
          .select({ id: employes.id })
          .from(employes)
          .where(and(eq(employes.id, input.managerId), eq(employes.agenceId, agenceId), eq(employes.statut, "actif")))
          .limit(1);
        if (!manager) throw new TRPCError({ code: "BAD_REQUEST", message: "Le supérieur hiérarchique doit être un employé actif." });
      }

      // Matricule auto via RH-00 (préfixe + séquence paramétrables)
      const [gen] = await tx
        .select()
        .from(hrGeneralSettings)
        .where(eq(hrGeneralSettings.agenceId, agenceId))
        .limit(1);
      const prefix = (gen?.employeeCodePrefix || "GPJ").trim();
      let seq = (gen?.employeeCodeSequence ?? 0) + 1;

      let matricule = `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
      const [existingMat] = await tx
        .select({ id: employes.id })
        .from(employes)
        .where(eq(employes.matricule, matricule))
        .limit(1);
      if (existingMat) {
        // Séquence désynchronisée : repart du max réel
        const [last] = await tx
          .select({ mat: employes.matricule })
          .from(employes)
          .where(ilike(employes.matricule, `${prefix}-${year}-%`))
          .orderBy(desc(employes.matricule))
          .limit(1);
        const lastNum = last ? parseInt(last.mat.split("-")[2] ?? "0", 10) : 0;
        seq = lastNum + 1;
        matricule = `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
      }

      if (gen) {
        await tx
          .update(hrGeneralSettings)
          .set({ employeeCodeSequence: seq, updatedAt: new Date() })
          .where(eq(hrGeneralSettings.agenceId, agenceId));
      }

      const [created] = await tx.insert(employes).values({
        agenceId,
        matricule,
        civilite: input.civilite || null,
        nom: input.nom,
        prenom: input.prenom,
        dateNaissance: input.dateNaissance || null,
        lieuNaissance: input.lieuNaissance || null,
        sexe: input.sexe || null,
        emailPersonnel: input.emailPersonnel || null,
        telephone: input.telephone || null,
        telephoneSecondaire: input.telephoneSecondaire || null,
        adresse: input.adresse || null,
        ville: input.ville || null,
        contactUrgenceNom: input.contactUrgenceNom || null,
        contactUrgenceTelephone: input.contactUrgenceTelephone || null,
        typeEmploye: input.typeEmploye,
        fonction: input.fonction,
        departmentId: input.departmentId ?? null,
        positionId: input.positionId ?? null,
        workCycleId: input.workCycleId ?? null,
        managerId: input.managerId ?? null,
        dateEmbauche: input.dateEmbauche,
        dateFinContrat: input.dateFinContrat || null,
        periodeEssaiFin: input.periodeEssaiFin || null,
        salaireBase: input.salaireBase || null,
        modePaie: input.modePaie,
        numCnss: input.numCnss || null,
        niu: input.niu || null,
        numCompteBancaire: input.numCompteBancaire || null,
        banque: input.banque || null,
        typePieceIdentite: input.typePieceIdentite || null,
        numPieceIdentite: input.numPieceIdentite || null,
        pieceExpireLe: input.pieceExpireLe || null,
        diplome: input.diplome || null,
        notes: input.notes || null,
        photoUrl: input.photoUrl || null,
      } as any).returning() as any;

      // Historiques initiaux (poste + salaire) — échecs remontés, pas avalés
      if (input.positionId) {
        await tx.insert(employeePositions).values({
          employeeId: created.id,
          positionId: input.positionId,
          departmentId: input.departmentId ?? null,
          startDate: input.dateEmbauche,
        } as any);
      }
      if (input.salaireBase) {
        await tx.insert(employeeSalaryHistory).values({
          employeeId: created.id,
          baseSalary: input.salaireBase,
          startDate: input.dateEmbauche,
          changedBy: Number(ctx.user.id),
        } as any);
      }

      // Historique des statuts : entrée initiale (actif à l'embauche)
      await tx.insert(employeeStatusHistory).values({
        employeeId: created.id,
        statut: "actif",
        startDate: input.dateEmbauche,
        changedBy: Number(ctx.user.id),
      } as any);

      return { id: String(created.id), matricule };
      });
    }),

  update: requirePermissionProcedure("rh.employe.modifier")
    .input(
      z.object({
        id: z.string(),
        civilite: z.string().optional().nullable(),
        nom: z.string().min(1).optional(),
        prenom: z.string().min(1).optional(),
        dateNaissance: z.string().optional().nullable(),
        lieuNaissance: z.string().optional().nullable(),
        sexe: z.enum(["M", "F"]).optional().nullable(),
        emailPersonnel: z.string().email().optional().nullable().or(z.literal("")),
        telephone: z.string().optional().nullable(),
        telephoneSecondaire: z.string().optional().nullable(),
        adresse: z.string().optional().nullable(),
        ville: z.string().optional().nullable(),
        contactUrgenceNom: z.string().optional().nullable(),
        contactUrgenceTelephone: z.string().optional().nullable(),
        typeEmploye: z.enum(["permanent", "contractuel", "stagiaire", "temporaire", "apprenti", "prestataire"]).optional(),
        fonction: z.string().min(1).optional(),
        departmentId: z.number().int().optional().nullable(),
        positionId: z.number().int().optional().nullable(),
        workCycleId: z.number().int().optional().nullable(),
        managerId: z.number().int().optional().nullable(),
        dateEmbauche: z.string().optional(),
        dateFinContrat: z.string().optional().nullable(),
        periodeEssaiFin: z.string().optional().nullable(),
        salaireBase: z.string().optional().nullable(),
        modePaie: z.enum(["mensuel", "horaire", "journalier", "commission"]).optional(),
        statut: z.enum(["actif", "conge", "suspendu", "archive"]).optional(),
        numCnss: z.string().optional().nullable(),
        niu: z.string().optional().nullable(),
        numCompteBancaire: z.string().optional().nullable(),
        banque: z.string().optional().nullable(),
        typePieceIdentite: z.string().optional().nullable(),
        numPieceIdentite: z.string().optional().nullable(),
        pieceExpireLe: z.string().optional().nullable(),
        diplome: z.string().optional().nullable(),
        photoUrl: z.string().optional().nullable(),
        // specs MVP 06_Competences — profil libre
        langues: z.string().optional().nullable(),
        logiciels: z.string().optional().nullable(),
        pointsFort: z.string().optional().nullable(),
        axesAmelioration: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const [current] = await db
        .select()
        .from(employes)
        .where(and(eq(employes.id, Number(input.id)), eq(employes.agenceId, agenceId)))
        .limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Employé non trouvé." });

      // Règle métier : manager = employé actif
      if (input.managerId !== undefined && input.managerId !== null) {
        const [manager] = await db
          .select({ id: employes.id })
          .from(employes)
          .where(and(eq(employes.id, input.managerId), eq(employes.agenceId, agenceId), eq(employes.statut, "actif")))
          .limit(1);
        if (!manager) throw new TRPCError({ code: "BAD_REQUEST", message: "Le supérieur hiérarchique doit être un employé actif." });
      }

      const updateData: Record<string, unknown> = {};

      // R6 — statut administratif court piloté par les situations : conge/suspendu ne se
      // saisissent plus manuellement (D-R6-01). La sortie passe par rh.sortir et la
      // réactivation par rh.reembaucher ; suspendu est dérivé d'une situation ACTIF.
      // Un statut hérité (antérieur à R6) peut être conservé tel quel lors d'une édition.
      if (
        input.statut !== undefined &&
        input.statut !== current.statut &&
        (input.statut === "conge" || input.statut === "suspendu")
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Ce statut est géré par le cycle de vie RH (situations). Utilisez une demande de congé ou une mise à pied/suspension.",
        });
      }

      const fields: (keyof typeof input)[] = [
        "civilite", "nom", "prenom", "dateNaissance", "lieuNaissance", "sexe", "emailPersonnel",
        "telephone", "telephoneSecondaire", "adresse", "ville",
        "contactUrgenceNom", "contactUrgenceTelephone",
        "typeEmploye", "fonction", "departmentId", "positionId", "workCycleId", "managerId",
        "dateEmbauche", "dateFinContrat", "periodeEssaiFin", "salaireBase", "modePaie", "statut",
        "numCnss", "niu", "numCompteBancaire", "banque",
        "typePieceIdentite", "numPieceIdentite", "pieceExpireLe", "diplome", "photoUrl",
"langues", "logiciels", "pointsFort", "axesAmelioration", "notes",
        "photoUrl",
      ];

      for (const field of fields) {
        if (input[field] !== undefined) {
          const val = input[field];
          if (field === "emailPersonnel" && val === "") {
            updateData[field] = null;
          } else {
            updateData[field] = val;
          }
        }
      }
      updateData.updatedAt = new Date();

      const [updated] = await db
        .update(employes)
        .set(updateData as any)
        .where(
          and(
            eq(employes.id, Number(input.id)),
            eq(employes.agenceId, agenceId),
          ),
        )
        .returning({ id: employes.id });

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employé non trouvé." });
      }

      const today = new Date().toISOString().split("T")[0];

      // Historique salaire : toute modification de salaire de base (G10 : intervalle daté)
      if (input.salaireBase !== undefined && input.salaireBase !== String(current.salaireBase ?? "")) {
        // Ferme l'intervalle précédent encore ouvert (reconstructibilité par date d'effet)
        const hier = new Date();
        hier.setDate(hier.getDate() - 1);
        const hierIso = hier.toISOString().split("T")[0];
        await db
          .update(employeeSalaryHistory)
          .set({ endDate: hierIso } as any)
          .where(and(eq(employeeSalaryHistory.employeeId, current.id), sql`${employeeSalaryHistory.endDate} IS NULL`));
        // P14/N20 : table canonique unique (journalier → JOURNALIER, commission → COMMISSION, sinon alias → mode dédié)
        const newMode = normaliserModePaie(input.modePaie ?? current.modePaie ?? "");
        await db.insert(employeeSalaryHistory).values({
          employeeId: current.id,
          baseSalary: input.salaireBase || null,
          startDate: today,
          modePaie: newMode,
          reason: input.modePaie !== undefined ? "MISE_A_JOUR_SALAIRE_MODE" : "MISE_A_JOUR_SALAIRE",
          changedBy: Number(ctx.user.id),
        } as any);
      }

      // Historique poste : changement de poste ou de département
      const posteChange =
        (input.positionId !== undefined && input.positionId !== current.positionId) ||
        (input.departmentId !== undefined && input.departmentId !== current.departmentId);
      if (posteChange && input.positionId) {
        const [openPosition] = await db
          .select({ id: employeePositions.id })
          .from(employeePositions)
          .where(and(eq(employeePositions.employeeId, current.id), sql`${employeePositions.endDate} IS NULL`))
          .limit(1);
        if (openPosition) {
          await db
            .update(employeePositions)
            .set({ endDate: today, reason: "Changement de poste" })
            .where(eq(employeePositions.id, openPosition.id));
        }
        await db.insert(employeePositions).values({
          employeeId: current.id,
          positionId: input.positionId,
          departmentId: input.departmentId ?? current.departmentId,
          startDate: today,
          reason: input.positionId !== current.positionId ? "Changement de poste" : null,
        } as any);
      }

      // Historique statut : tout changement de statut est tracé
      if (input.statut !== undefined && input.statut !== current.statut) {
        const [openStatus] = await db
          .select({ id: employeeStatusHistory.id })
          .from(employeeStatusHistory)
          .where(and(eq(employeeStatusHistory.employeeId, current.id), sql`${employeeStatusHistory.endDate} IS NULL`))
          .limit(1);
        if (openStatus) {
          await db
            .update(employeeStatusHistory)
            .set({ endDate: today, reason: "Changement de statut" })
            .where(eq(employeeStatusHistory.id, openStatus.id));
        }
        await db.insert(employeeStatusHistory).values({
          employeeId: current.id,
          statut: input.statut,
          startDate: today,
          changedBy: Number(ctx.user.id),
        } as any);
      }

      // R7 — trace avant/après de la mise à jour fiche (statut / salaire / poste), motif obligatoire
      const champSensibleDiffere =
        (input.statut !== undefined && input.statut !== current.statut) ||
        (input.salaireBase !== undefined && input.salaireBase !== String(current.salaireBase ?? "")) ||
        (input.modePaie !== undefined && input.modePaie !== current.modePaie) ||
        (input.positionId !== undefined && input.positionId !== current.positionId) ||
        (input.departmentId !== undefined && input.departmentId !== current.departmentId);
      if (champSensibleDiffere) {
        await journaliserAvantApres(db, {
          agenceId,
          entityType: "employe",
          entityId: current.id,
          action: "UPDATE_EMPLOYE",
          avant: {
            statut: current.statut,
            salaireBase: current.salaireBase,
            modePaie: current.modePaie,
            positionId: current.positionId,
            departmentId: current.departmentId,
          },
          apres: {
            statut: input.statut ?? current.statut,
            salaireBase: input.salaireBase ?? String(current.salaireBase ?? ""),
            modePaie: input.modePaie ?? current.modePaie,
            positionId: input.positionId ?? current.positionId,
            departmentId: input.departmentId ?? current.departmentId,
          },
          motif: "Mise à jour fiche employé (statut/salaire/poste)",
          userId: Number(ctx.user.id),
        });
      }

      // N11 — compte utilisateur : suspendu/archive = accès coupé, congé = accès maintenu
      if (input.statut !== undefined && input.statut !== current.statut && current.userId) {
        const accesMaintenu = input.statut === "actif" || input.statut === "conge";
        await db
          .update(utilisateurs)
          .set({ isActive: accesMaintenu } as any)
          .where(eq(utilisateurs.id, current.userId));
      }

      return { id: updated.id };
    }),

  // ─── Sortie définitive (T6 — CDC §11 Statut de sortie) ───
  // Traçage complet dans l'historique de statut : chaque sortie ferme le statut
  // actif en cours et crée une entrée « sorti » avec date + motif obligatoires.
  sortir: requirePermissionProcedure("rh.employe.sortie")
    .input(
      z.object({
        id: z.string(),
        dateSortie: z.string().min(1, "La date de sortie est obligatoire."),
        motifSortie: z
          .enum(["demission", "licenciement", "fin_cdd", "retraite", "rupture_conventionnelle", "autre_vie_pro"])
          .refine((v) => v.length > 0, { message: "Le motif de sortie est obligatoire." }),
        detailMotif: z.string().optional().nullable(),
        reembauchable: z.boolean().optional().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const dateEffet = input.dateSortie.slice(0, 10);

      if (await moisCloture(agenceId, dateEffet)) {
        throw new TRPCError({ code: "CONFLICT", message: "Ce mois de présence est déjà clôturé : sortie impossible sur cette période sans procédure corrective." });
      }

      const [current] = await db
        .select({ id: employes.id, matricule: employes.matricule, statut: employes.statut, userId: employes.userId, positionId: employes.positionId, fonction: employes.fonction })
        .from(employes)
        .where(and(eq(employes.id, Number(input.id)), eq(employes.agenceId, agenceId)))
        .limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Employé non trouvé." });
      if (current.statut === "sorti") throw new TRPCError({ code: "BAD_REQUEST", message: "Cet employé est déjà sorti." });

      // Ferme le poste/production en cours (si ouvert) à la veille de la sortie
      if (current.positionId) {
        const [openPosition] = await db
          .select({ id: employeePositions.id })
          .from(employeePositions)
          .where(and(eq(employeePositions.employeeId, current.id), sql`${employeePositions.endDate} IS NULL`))
          .limit(1);
        if (openPosition) {
          await db
            .update(employeePositions)
            .set({ endDate: veilleDe(dateEffet), reason: "Sortie définitive" })
            .where(eq(employeePositions.id, openPosition.id));
        }
      }

      // R6 — borne réelle de l'intervalle = veille de la date de sortie (jamais « today » arbitraire)
      const [openStatus] = await db
        .select({ id: employeeStatusHistory.id })
        .from(employeeStatusHistory)
        .where(and(eq(employeeStatusHistory.employeeId, current.id), sql`${employeeStatusHistory.endDate} IS NULL`))
        .limit(1);
      if (openStatus) {
        await db
          .update(employeeStatusHistory)
          .set({ endDate: veilleDe(dateEffet), reason: "Sortie définitive" })
          .where(eq(employeeStatusHistory.id, openStatus.id));
      }

      await db.insert(employeeStatusHistory).values({
        employeeId: current.id,
        statut: "sorti",
        reembauchable: input.reembauchable ?? true,
        startDate: dateEffet,
        reason: input.detailMotif
          ? `${motifSortieLabels[input.motifSortie]} — ${input.detailMotif}`
          : motifSortieLabels[input.motifSortie],
        changedBy: Number(ctx.user.id),
      } as any);

      await db
        .update(employes)
        .set({
          statut: "sorti",
          dateSortie: dateEffet,
          motifSortie: input.motifSortie,
          detailMotifSortie: input.detailMotif ?? null,
          reembauchable: input.reembauchable ?? true,
          sortieChangedBy: Number(ctx.user.id),
          sortieChangedAt: new Date(),
        } as any)
        .where(and(eq(employes.id, current.id), eq(employes.agenceId, agenceId)));

      // R7 — trace avant/après de la sortie (motif obligatoire porté par le moteur RH)
      await journaliserAvantApres(db, {
        agenceId,
        entityType: "employe",
        entityId: current.id,
        action: "SORTIE",
        avant: { statut: current.statut, dateSortie: null },
        apres: { statut: "sorti", dateSortie: dateEffet, motif: input.motifSortie },
        motif: input.detailMotif ?? motifSortieLabels[input.motifSortie],
        userId: Number(ctx.user.id),
      });

      // Sortie = fin du compte : l'utilisateur lié ne peut plus se connecter (E14/E17 CDC §11)
      if (current.userId) {
        await db
          .update(utilisateurs)
          .set({ isActive: false } as any)
          .where(eq(utilisateurs.id, current.userId));
      }

      // R6 — situation SORTIE (source de vérité §11) : impacts dérivés du catalogue paramétré
      const [sortieType] = await db
        .select()
        .from(hrSituationTypes)
        .where(and(eq(hrSituationTypes.agenceId, agenceId), eq(hrSituationTypes.category, "SORTIE")))
        .limit(1);
      const [situation] = await db
        .insert(employeeSituations)
        .values({
          agenceId,
          employeeId: current.id,
          situationTypeId: sortieType?.id ?? null,
          category: "SORTIE",
          type: sortieType?.type ?? "DEPART_DEFINITIF",
          name: sortieType?.name ?? "Départ définitif",
          dateDebut: dateEffet,
          dateFin: null,
          dateEffet,
          motif: input.detailMotif ?? motifSortieLabels[input.motifSortie],
          impactContrat: sortieType?.impactContrat ?? "TERMINE",
          impactPresence: sortieType?.impactPresence ?? "NON_COMPTABLE",
          impactPlanning: sortieType?.impactPlanning ?? "NON_PLANIFIABLE",
          impactPaie: sortieType?.impactPaie ?? "NON_REMUNERE",
          modeCalculPaie: sortieType?.modeCalculPaie ?? "SANS",
          validationRequise: sortieType?.validationRequise ?? true,
          approbationRequise: sortieType?.approbationRequise ?? false,
          statutWorkflow: "ACTIF",
          provenanceTable: "employes",
          provenanceId: current.id,
          createdBy: Number(ctx.user.id),
        } as any)
        .returning();

      // R6 — le départ clôt les situations suspensives / disciplinaires encore en cours (SORTIE_PRIORITAIRE §14)
      const aCloturer = await db
        .select({ id: employeeSituations.id, statutWorkflow: employeeSituations.statutWorkflow })
        .from(employeeSituations)
        .where(
          and(
            eq(employeeSituations.agenceId, agenceId),
            eq(employeeSituations.employeeId, current.id),
            inArray(employeeSituations.statutWorkflow, ["ACTIF", "APPROUVE", "SOUMIS", "EN_ATTENTE"]),
            or(eq(employeeSituations.impactContrat, "SUSPENDU"), eq(employeeSituations.category, "DISCIPLINAIRE")),
            or(sql`${employeeSituations.dateFin} IS NULL`, gte(employeeSituations.dateFin, dateEffet)),
          ),
        );
      for (const s of aCloturer) {
        const cible = s.statutWorkflow === "ACTIF" ? "TERMINE" : "ANNULE";
        await db
          .update(employeeSituations)
          .set({ statutWorkflow: cible, dateFin: veilleDe(dateEffet), updatedAt: new Date() } as any)
          .where(eq(employeeSituations.id, s.id));
        await db.insert(employeeSituationTransitions).values({
          situationId: s.id,
          fromStatus: s.statutWorkflow,
          toStatus: cible,
          acteurId: Number(ctx.user.id),
          justification: "Sortie définitive (prioritaire)",
        } as any);
      }

      return { id: String(current.id), matricule: current.matricule, statut: "sorti" };
    }),

  // N12/F04 — réembauche d'un sorti : le flag `reembauchable` posé à la sortie
  // conditionne la réactivation. Statut actif, sortie effacée de la fiche,
  // historique tracé (l'intervalle « sorti » est fermé à la veille), compte rétabli.
  reembaucher: requirePermissionProcedure("rh.employe.reembauche")
    .input(
      z.object({
        id: z.string(),
        dateReembauche: z.string().min(1, "La date de réembauche est obligatoire."),
        motif: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const dateEffet = input.dateReembauche.slice(0, 10);

      if (await moisCloture(agenceId, dateEffet)) {
        throw new TRPCError({ code: "CONFLICT", message: "Ce mois de présence est déjà clôturé : réembauche impossible sur cette période sans procédure corrective." });
      }

      const [current] = await db
        .select({
          id: employes.id,
          statut: employes.statut,
          reembauchable: employes.reembauchable,
          userId: employes.userId,
        })
        .from(employes)
        .where(and(eq(employes.id, Number(input.id)), eq(employes.agenceId, agenceId)))
        .limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Employé non trouvé." });
      const refusReembauche = verifierReembauche(current);
      if (refusReembauche) {
        throw new TRPCError({ code: "BAD_REQUEST", message: refusReembauche });
      }

      // Ferme l'intervalle « sorti » encore ouvert (endDate = veille de la réembauche)
      const [openStatus] = await db
        .select({ id: employeeStatusHistory.id })
        .from(employeeStatusHistory)
        .where(and(eq(employeeStatusHistory.employeeId, current.id), sql`${employeeStatusHistory.endDate} IS NULL`))
        .limit(1);
      if (openStatus) {
        await db
          .update(employeeStatusHistory)
          .set({ endDate: veilleDe(dateEffet), reason: "Réembauche" } as any)
          .where(eq(employeeStatusHistory.id, openStatus.id));
      }
      await db.insert(employeeStatusHistory).values({
        employeeId: current.id,
        statut: "actif",
        startDate: dateEffet,
        reason: input.motif ?? "Réembauche",
        changedBy: Number(ctx.user.id),
      } as any);

      await db
        .update(employes)
        .set({
          statut: "actif",
          dateSortie: null,
          reembauchable: null,
          updatedAt: new Date(),
        } as any)
        .where(and(eq(employes.id, current.id), eq(employes.agenceId, agenceId)));

      // R7 — trace avant/après de la réembauche (l'intervalle « sorti » est fermé à la veille)
      await journaliserAvantApres(db, {
        agenceId,
        entityType: "employe",
        entityId: current.id,
        action: "REEMBAUCHE",
        avant: { statut: current.statut },
        apres: { statut: "actif", dateSortie: null, dateEffet },
        motif: input.motif ?? "Réembauche",
        userId: Number(ctx.user.id),
      });

      // N11 — actif = accès maintenu : le compte coupé à la sortie est rouvert
      if (current.userId) {
        await db
          .update(utilisateurs)
          .set({ isActive: true } as any)
          .where(eq(utilisateurs.id, current.userId));
      }

      // R6 — la réembauche clôt la situation SORTIE encore ouverte (l'employé redevient « actif »)
      const [sitSortie] = await db
        .select({ id: employeeSituations.id, statutWorkflow: employeeSituations.statutWorkflow })
        .from(employeeSituations)
        .where(
          and(
            eq(employeeSituations.agenceId, agenceId),
            eq(employeeSituations.employeeId, current.id),
            eq(employeeSituations.category, "SORTIE"),
            sql`${employeeSituations.dateFin} IS NULL`,
          ),
        )
        .limit(1);
      if (sitSortie && sitSortie.statutWorkflow === "ACTIF") {
        await db
          .update(employeeSituations)
          .set({ statutWorkflow: "TERMINE", dateFin: veilleDe(dateEffet), updatedAt: new Date() } as any)
          .where(eq(employeeSituations.id, sitSortie.id));
        await db.insert(employeeSituationTransitions).values({
          situationId: sitSortie.id,
          fromStatus: "ACTIF",
          toStatus: "TERMINE",
          acteurId: Number(ctx.user.id),
          justification: `Réembauche au ${dateEffet}`,
        } as any);
      }

      return { id: String(current.id), statut: "actif" };
    }),

  search: requirePermissionProcedure("rh.utilisateur.lire")
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(50).default(20),
        sansCompte: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const pattern = `%${input.query}%`;
      const conditions = [
        eq(employes.agenceId, ctx.user.agenceId),
        or(
          ilike(employes.nom, pattern),
          ilike(employes.prenom, pattern),
          ilike(employes.matricule, pattern),
        ),
      ];

      if (input.sansCompte) {
        conditions.push(sql`${employes.userId} IS NULL`);
      }

      const rows = await db
        .select({
          id: employes.id,
          matricule: employes.matricule,
          nom: employes.nom,
          prenom: employes.prenom,
          emailPersonnel: employes.emailPersonnel,
          telephone: employes.telephone,
          fonction: employes.fonction,
          typeEmploye: employes.typeEmploye,
          statut: employes.statut,
          photoUrl: employes.photoUrl,
          userId: employes.userId,
        })
        .from(employes)
        .where(and(...conditions))
        .limit(input.limit);

      return rows.map((r) => ({
        id: r.id,
        matricule: r.matricule ?? "",
        nom: r.nom,
        prenom: r.prenom,
        emailPersonnel: r.emailPersonnel ?? "",
        telephone: r.telephone ?? "",
        fonction: r.fonction,
        typeEmploye: r.typeEmploye,
        statut: r.statut ?? "actif",
        photoUrl: r.photoUrl,
        userId: r.userId,
        hasAccount: r.userId !== null,
        fullName: `${r.prenom} ${r.nom}`,
      }));
    }),

  stats: rhProcedure.query(async ({ ctx }) => {
    const base = eq(employes.agenceId, ctx.user.agenceId);

    const countAll = await db.select({ value: count() }).from(employes).where(base).then(r => r[0]?.value ?? 0);
    const countActif = await db.select({ value: count() }).from(employes).where(and(base, eq(employes.statut, "actif"))).then(r => r[0]?.value ?? 0);
    const countConge = await db.select({ value: count() }).from(employes).where(and(base, eq(employes.statut, "conge"))).then(r => r[0]?.value ?? 0);
    const countSuspendu = await db.select({ value: count() }).from(employes).where(and(base, eq(employes.statut, "suspendu"))).then(r => r[0]?.value ?? 0);
    const countArchive = await db.select({ value: count() }).from(employes).where(and(base, eq(employes.statut, "archive"))).then(r => r[0]?.value ?? 0);
    const countSorti = await db.select({ value: count() }).from(employes).where(and(base, eq(employes.statut, "sorti"))).then(r => r[0]?.value ?? 0);

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const absencesEnCours = await db.select({ value: count() }).from(absences)
      .innerJoin(employes, eq(absences.employeId, employes.id))
      .where(and(eq(employes.agenceId, ctx.user.agenceId), eq(absences.statut, "en_attente"), gte(absences.dateFin, todayStr))).then(r => r[0]?.value ?? 0);

    return {
      total: countAll,
      actif: countActif,
      conge: countConge,
      suspendu: countSuspendu,
      archive: countArchive,
      sorti: countSorti,
      absencesEnCours,
    };
  }),

  // ─── Fiche complète (RH-01) ───
  getFiche: rhProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const employeeId = Number(input.id);
      const [row] = await db
        .select({
          id: employes.id,
          matricule: employes.matricule,
          civilite: employes.civilite,
          nom: employes.nom,
          prenom: employes.prenom,
          dateNaissance: employes.dateNaissance,
          lieuNaissance: employes.lieuNaissance,
          sexe: employes.sexe,
          emailPersonnel: employes.emailPersonnel,
          telephone: employes.telephone,
          telephoneSecondaire: employes.telephoneSecondaire,
          adresse: employes.adresse,
          ville: employes.ville,
          contactUrgenceNom: employes.contactUrgenceNom,
          contactUrgenceTelephone: employes.contactUrgenceTelephone,
          typeEmploye: employes.typeEmploye,
          fonction: employes.fonction,
          departmentId: employes.departmentId,
          departmentName: departments.name,
          positionId: employes.positionId,
          positionName: positions.name,
          workCycleId: employes.workCycleId,
          workCycleName: hrWorkCycles.name,
          managerId: employes.managerId,
          dateEmbauche: employes.dateEmbauche,
          dateFinContrat: employes.dateFinContrat,
          periodeEssaiFin: employes.periodeEssaiFin,
          salaireBase: employes.salaireBase,
          devise: employes.devise,
          modePaie: employes.modePaie,
          numCnss: employes.numCnss,
          niu: employes.niu,
          numCompteBancaire: employes.numCompteBancaire,
          banque: employes.banque,
          typePieceIdentite: employes.typePieceIdentite,
          numPieceIdentite: employes.numPieceIdentite,
          pieceExpireLe: employes.pieceExpireLe,
          diplome: employes.diplome,
          notes: employes.notes,
          statut: employes.statut,
          photoUrl: employes.photoUrl,
          dateSortie: employes.dateSortie,
          motifSortie: employes.motifSortie,
          detailMotifSortie: employes.detailMotifSortie,
          reembauchable: employes.reembauchable,
          createdAt: employes.createdAt,
        })
        .from(employes)
        .leftJoin(departments, eq(employes.departmentId, departments.id))
        .leftJoin(positions, eq(employes.positionId, positions.id))
        .leftJoin(hrWorkCycles, eq(employes.workCycleId, hrWorkCycles.id))
        .where(and(eq(employes.id, employeeId), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);

      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Employé non trouvé." });

      const [manager] = row.managerId
        ? await db
            .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom, fonction: employes.fonction })
            .from(employes)
            .where(eq(employes.id, row.managerId))
            .limit(1)
        : [];

      // RPT-05 : `getFiche` exigeait seulement le role RH. RIB, CNSS, NIU,
      // piece d'identite ET l'historique salarial complet sortaient en clair
      // pour tout profil RH, sans aucun appel a `rh.salaire.consulter`.
      const salaireOk = await canVoirSalairesRH(ctx);
      // L'historique salarial EST le salaire : il ne peut pas sortir si la
      // competence n'est pas accordee. `[]` resterait un mensonge silencieux
      // (« cet employe n'a jamais ete_PAYE »), la cle doit disparaitre.
      const salaryHistoryVisible = salaireOk
        ? await db
            .select()
            .from(employeeSalaryHistory)
            .where(eq(employeeSalaryHistory.employeeId, employeeId))
            .orderBy(desc(employeeSalaryHistory.startDate))
        : null;

      const [positionHistory, statusHistory] = await Promise.all([
        db
          .select({
            id: employeePositions.id,
            positionId: employeePositions.positionId,
            positionName: positions.name,
            departmentId: employeePositions.departmentId,
            departmentName: departments.name,
            startDate: employeePositions.startDate,
            endDate: employeePositions.endDate,
            reason: employeePositions.reason,
          })
          .from(employeePositions)
          .leftJoin(positions, eq(employeePositions.positionId, positions.id))
          .leftJoin(departments, eq(employeePositions.departmentId, departments.id))
          .where(eq(employeePositions.employeeId, employeeId))
          .orderBy(desc(employeePositions.startDate)),
        db
          .select()
          .from(employeeStatusHistory)
          .where(eq(employeeStatusHistory.employeeId, employeeId))
          .orderBy(desc(employeeStatusHistory.startDate)),
      ]);

      // STRICT : la cle part meme si elle porte une valeur. Un salaire reellement
      // renseigne ne doit pas survivre, et `sansChamps` (qui ne nettoie que les
      // valeurs vides) laissait passer exactement le cas qui compte.
      const fiche = salaireOk
        ? row
        : sansChampsStrict(row, [...CHAMPS_SENSIBLES_FICHE, ...CHAMPS_SENSIBLES_CONTACT]);

      return {
        ...fiche,
        managerNom: manager ? `${manager.prenom} ${manager.nom}` : null,
        positionHistory,
        // La CLE disparait quand le droit manque : c'est ce que dit le contrat
        // de projection. Un `salaryHistory: []` affirmerait au client que
        // l'employe n'a jamais vu de revision de salaire.
        ...(salaryHistoryVisible ? { salaryHistory: salaryHistoryVisible } : {}),
        statusHistory,
      };
    }),

  // R6-D8 — Historique lisible et complet : agrège le parcours de l'employé
  // (statuts, postes, salaires, avances + transitions, bulletins payés, congés,
  // clôtures de présences) avec QUI (acteur nommé) et MOTIF, trié par date desc.
  // Permissions : lecture RH (rhProcedure). Les MONTANTS (salaire, avances,
  // bulletins) sont masqués serveur si l'utilisateur n'a pas rh.salaire.consulter.
  getHistorique: rhProcedure
    .input(z.object({ employeeId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      await assertEmployeEnAgence(input.employeeId, agenceId);
      const canSeeSalary = await RBACService.hasPermission(
        ctx.user.id,
        "rh.salaire.consulter",
        String(agenceId ?? "")
      );

      const setEvent = (e: Omit<HistoriqueEventRow, "date"> & { date: string | Date | null; acteur?: string | null }): HistoriqueEventRow => ({
        id: e.id,
        type: e.type,
        date: e.date ? new Date(`${String(e.date).slice(0, 10)}T12:00:00`) : null,
        titre: e.titre,
        detail: e.detail,
        motif: e.motif,
        acteur: e.acteur ?? null,
      });

      const [statuses, positionsHist, salaries, advances, transitions, paidBulletins, clôturePresences] = await Promise.all([
        db
          .select({
            id: employeeStatusHistory.id,
            statut: employeeStatusHistory.statut,
            startDate: employeeStatusHistory.startDate,
            endDate: employeeStatusHistory.endDate,
            reason: employeeStatusHistory.reason,
            acteurNom: utilisateurs.nom,
            acteurPrenom: utilisateurs.prenom,
          })
          .from(employeeStatusHistory)
          .leftJoin(utilisateurs, eq(employeeStatusHistory.changedBy, utilisateurs.id))
          .where(eq(employeeStatusHistory.employeeId, input.employeeId)),
        db
          .select({
            id: employeePositions.id,
            positionName: positions.name,
            departmentName: departments.name,
            startDate: employeePositions.startDate,
            endDate: employeePositions.endDate,
            reason: employeePositions.reason,
          })
          .from(employeePositions)
          .leftJoin(positions, eq(employeePositions.positionId, positions.id))
          .leftJoin(departments, eq(employeePositions.departmentId, departments.id))
          .where(eq(employeePositions.employeeId, input.employeeId)),
        db
          .select({
            id: employeeSalaryHistory.id,
            baseSalary: employeeSalaryHistory.baseSalary,
            startDate: employeeSalaryHistory.startDate,
            endDate: employeeSalaryHistory.endDate,
            reason: employeeSalaryHistory.reason,
            acteurNom: utilisateurs.nom,
            acteurPrenom: utilisateurs.prenom,
          })
          .from(employeeSalaryHistory)
          .leftJoin(utilisateurs, eq(employeeSalaryHistory.changedBy, utilisateurs.id))
          .where(eq(employeeSalaryHistory.employeeId, input.employeeId)),
        db
          .select({
            id: employeeAdvances.id,
            reference: employeeAdvances.reference,
            montant: employeeAdvances.montant,
            statut: employeeAdvances.statut,
            motif: employeeAdvances.motif,
            dateVersement: employeeAdvances.dateVersement,
            acteurNom: utilisateurs.nom,
            acteurPrenom: utilisateurs.prenom,
          })
          .from(employeeAdvances)
          .leftJoin(utilisateurs, eq(employeeAdvances.responsableId, utilisateurs.id))
          .where(eq(employeeAdvances.employeeId, input.employeeId)),
        db
          .select({
            id: advanceTransitions.id,
            advanceId: advanceTransitions.advanceId,
            fromStatus: advanceTransitions.fromStatus,
            toStatus: advanceTransitions.toStatus,
            justification: advanceTransitions.justification,
            createdAt: advanceTransitions.createdAt,
            acteurNom: utilisateurs.nom,
            acteurPrenom: utilisateurs.prenom,
          })
          .from(advanceTransitions)
          .leftJoin(utilisateurs, eq(advanceTransitions.acteurId, utilisateurs.id))
          .where(eq(advanceTransitions.advanceId, sql`ANY(SELECT id FROM employee_advances WHERE employee_id = ${input.employeeId})`)),
        db
          .select({
            id: payrollEntries.id,
            periodStart: payrollPeriods.startDate,
            periodEnd: payrollPeriods.endDate,
            netPay: payrollEntries.netPay,
            status: payrollEntries.status,
            createdAt: payrollEntries.createdAt,
          })
          .from(payrollEntries)
          .innerJoin(payrollPeriods, eq(payrollEntries.periodId, payrollPeriods.id))
          .where(eq(payrollEntries.employeeId, input.employeeId)),
        db
          .select({
            id: attendanceMonthlySummaries.id,
            year: attendanceMonthlySummaries.year,
            month: attendanceMonthlySummaries.month,
            locked: attendanceMonthlySummaries.locked,
            lockedAt: attendanceMonthlySummaries.lockedAt,
            acteurNom: utilisateurs.nom,
            acteurPrenom: utilisateurs.prenom,
          })
          .from(attendanceMonthlySummaries)
          .leftJoin(utilisateurs, eq(attendanceMonthlySummaries.lockedBy, utilisateurs.id))
          .where(eq(attendanceMonthlySummaries.employeeId, input.employeeId)),
      ]);

      const acteur = (n: string | null, p: string | null) => (n ? `${p ?? ""} ${n}`.trim() : null);
      const events: HistoriqueEventRow[] = [
        ...statuses.map((s) =>
          setEvent({
            id: `statut-${s.id}`,
            type: "statut",
            date: s.startDate,
            titre: `Statut : ${s.statut}`,
            detail: s.endDate ? `Jusqu'au ${s.endDate}` : "Statut actuel",
            motif: s.reason ?? null,
            acteur: acteur(s.acteurNom, s.acteurPrenom),
          })
        ),
        ...positionsHist.map((p) =>
          setEvent({
            id: `poste-${p.id}`,
            type: "poste",
            date: p.startDate,
            titre: p.endDate ? `Fin de poste : ${p.positionName ?? "—"}` : `Poste : ${p.positionName ?? "—"}`,
            detail: p.departmentName ?? null,
            motif: p.reason ?? null,
            acteur: null,
          })
        ),
        ...salaries.map((s) =>
          setEvent({
            id: `salaire-${s.id}`,
            type: "salaire",
            date: s.startDate,
            titre: canSeeSalary && s.baseSalary ? `Salaire : ${s.baseSalary}` : "Salaire",
            detail: s.endDate ? `Jusqu'au ${s.endDate}` : "Salaire actuel",
            motif: s.reason ?? null,
            acteur: acteur(s.acteurNom, s.acteurPrenom),
          })
        ),
        ...advances.map((a) =>
          setEvent({
            id: `avance-${a.id}`,
            type: "avance",
            date: a.dateVersement,
            titre: a.reference ? `Avance ${a.reference} : ${a.statut}` : `Avance : ${a.statut}`,
            detail: canSeeSalary && a.montant ? `Montant : ${a.montant}` : null,
            motif: a.motif ?? null,
            acteur: acteur(a.acteurNom, a.acteurPrenom),
          })
        ),
        ...transitions.map((t) =>
          setEvent({
            id: `transition-${t.id}`,
            type: "avance",
            date: t.createdAt,
            titre: `Transition avance #${t.advanceId} : ${t.fromStatus ?? "—"} → ${t.toStatus}`,
            detail: null,
            motif: t.justification ?? null,
            acteur: acteur(t.acteurNom, t.acteurPrenom),
          })
        ),
        ...(canSeeSalary
          ? paidBulletins.map((b) =>
              setEvent({
                id: `bulletin-${b.id}`,
                type: "bulletin",
                date: b.createdAt,
                titre: `Bulletin de paie (${b.periodStart} → ${b.periodEnd})`,
                detail: `Net : ${b.netPay} · Statut : ${b.status}`,
                motif: null,
                acteur: null,
              })
            )
          : paidBulletins.map((b) =>
              setEvent({
                id: `bulletin-${b.id}`,
                type: "bulletin",
                date: b.createdAt,
                titre: `Bulletin de paie (${b.periodStart} → ${b.periodEnd})`,
                detail: `Statut : ${b.status}`,
                motif: null,
                acteur: null,
              })
            )),
        ...clôturePresences.map((c) =>
          setEvent({
            id: `cloture-${c.id}`,
            type: "presence",
            date: c.lockedAt,
            titre: `Clôture présences : ${String(c.month).padStart(2, "0")}/${c.year}`,
            detail: c.locked ? "Mois verrouillé" : "Mois non verrouillé",
            motif: null,
            acteur: acteur(c.acteurNom, c.acteurPrenom),
          })
        ),
      ];

      return events
        .filter((e) => e.date !== null)
        .sort((a, b) => (a.date! < b.date! ? 1 : -1));
    }),

  // ─── Référentiels RH-01 ───
  listDepartments: rhProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(departments)
      .where(eq(departments.agenceId, ctx.user.agenceId))
      .orderBy(asc(departments.name));
  }),

  createDepartment: requirePermissionProcedure("rh.parametrage.modifier")
    .input(z.object({ name: z.string().min(1), code: z.string().min(1), parentId: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(departments)
        .values({ ...input, parentId: input.parentId ?? null, agenceId: ctx.user.agenceId } as any)
        .returning();
      return row;
    }),

  listPositions: rhProcedure.query(async ({ ctx }) => {
    return db
      .select({
        id: positions.id,
        name: positions.name,
        code: positions.code,
        departmentId: positions.departmentId,
        departmentName: departments.name,
        active: positions.active,
      })
      .from(positions)
      .leftJoin(departments, eq(positions.departmentId, departments.id))
      .where(eq(positions.agenceId, ctx.user.agenceId))
      .orderBy(asc(positions.name));
  }),

  createPosition: requirePermissionProcedure("rh.parametrage.modifier")
    .input(z.object({ name: z.string().min(1), code: z.string().min(1), departmentId: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(positions)
        .values({ ...input, departmentId: input.departmentId ?? null, agenceId: ctx.user.agenceId } as any)
        .returning();
      return row;
    }),

  listContractTypes: rhProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(contractTypes)
      .where(eq(contractTypes.agenceId, ctx.user.agenceId))
      .orderBy(asc(contractTypes.name));
  }),

  createContractType: requirePermissionProcedure("rh.parametrage.modifier")
    .input(z.object({ code: z.string().min(1), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(contractTypes)
        .values({ ...input, agenceId: ctx.user.agenceId } as any)
        .returning();
      return row;
    }),

  // ─── Absences ───
  listAbsences: rhProcedure
    .input(z.object({
      employeId: z.number().optional(),
      statut: z.string().optional(),
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.employeId) conditions.push(eq(absences.employeId, safe.employeId));
      if (safe.statut) conditions.push(eq(absences.statut, safe.statut));
      if (safe.dateDebut) conditions.push(gte(absences.dateDebut, safe.dateDebut as any));
      if (safe.dateFin) conditions.push(lte(absences.dateFin, safe.dateFin as any));

      const rows = await db.select({
        id: absences.id,
        employeId: absences.employeId,
        employeNom: employes.nom,
        employePrenom: employes.prenom,
        typeAbsence: absences.typeAbsence,
        dateDebut: absences.dateDebut,
        dateFin: absences.dateFin,
        dureeJours: absences.dureeJours,
        motif: absences.motif,
        justifie: absences.justifie,
        statut: absences.statut,
        createdAt: absences.createdAt,
      }).from(absences)
        .innerJoin(employes, eq(absences.employeId, employes.id))
        .where(and(...conditions))
        .orderBy(desc(absences.dateDebut));
      return rows;
    }),

  // N17 (décision produit, Phase 4) : le CONGÉ est la SEULE voie de saisie d'une
  // absence en RH (demandes approuvées → marquage présences, ou statut posé en
  // grille de présence). createAbsence/validerAbsence sont conservés (durcis en
  // Phase 3) uniquement pour la compatibilité/scripts, mais NON exposés à l'UI.
  // Purge prévue en Phase 9 (N05).
  createAbsence: requirePermissionProcedure("rh.conge.modifier")
    .input(z.object({
      employeId: z.number(),
      typeAbsence: z.string(),
      dateDebut: z.string(),
      dateFin: z.string().optional(),
      dureeJours: z.number().optional(),
      motif: z.string().optional(),
      justifie: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertEmployeEnAgence(input.employeId, ctx.user.agenceId);
      const [absence] = await db.insert(absences).values({
        employeId: input.employeId,
        typeAbsence: input.typeAbsence,
        dateDebut: input.dateDebut,
        dateFin: input.dateFin || null,
        dureeJours: input.dureeJours ? String(input.dureeJours) : null,
        motif: input.motif || null,
        justifie: input.justifie,
      } as any).returning() as any;
      return { id: String(absence.id) };
    }) as any,

  validerAbsence: requirePermissionProcedure("rh.conge.modifier")
    .input(z.object({ id: z.number(), statut: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [absence] = await db
        .select({ id: absences.id })
        .from(absences)
        .innerJoin(employes, eq(absences.employeId, employes.id))
        .where(and(eq(absences.id, input.id), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!absence) throw new TRPCError({ code: "NOT_FOUND", message: "Absence introuvable." });
      await db.update(absences).set({ statut: input.statut, validePar: ctx.user.id } as any).where(eq(absences.id, input.id));
      return { success: true };
    }) as any,

  // ─── Sanctions ───
  listSanctions: rhProcedure
    .input(z.object({ employeId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.employeId) conditions.push(eq(sanctions.employeId, safe.employeId));

      // RPT-05 : deux fuites dans un seul `select()` nu.
      //  1. La jointure `innerJoin(employes)` deborde TOUTES les colonnes de
      //     `employes`, dont salaireBase / RIB / CNSS, alors qu'on ne demande
      //     qu'une liste de sanctions.
      //  2. `detailsFinanciers` est un montant (prelevement sur salaire).
      // On projette explicitement : ce qui n'est pas demande ne sort pas.
      const salaireOk = await canVoirSalairesRH(ctx);
      return db
        .select({
          id: sanctions.id,
          employeId: sanctions.employeId,
          typeSanction: sanctions.typeSanction,
          motif: sanctions.motif,
          gravite: sanctions.gravite,
          dateSanction: sanctions.dateSanction,
          dateDebutEffet: sanctions.dateDebutEffet,
          dateFinEffet: sanctions.dateFinEffet,
          dureeJours: sanctions.dureeJours,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          ...(salaireOk ? { detailsFinanciers: sanctions.detailsFinanciers } : {}),
        })
        .from(sanctions)
        .innerJoin(employes, eq(sanctions.employeId, employes.id))
        .where(and(...conditions))
        .orderBy(desc(sanctions.dateSanction));
    }),

  createSanction: requirePermissionProcedure("rh.discipline.modifier")
    .input(z.object({
      employeId: z.number(),
      typeSanction: z.string(),
      motif: z.string().min(1),
      gravite: z.string().default("MOYENNE"),
      dateSanction: z.string(),
      dateDebutEffet: z.string().optional(),
      dateFinEffet: z.string().optional(),
      dureeJours: z.number().optional(),
      detailsFinanciers: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertEmployeEnAgence(input.employeId, ctx.user.agenceId);
      const [sanction] = await db.insert(sanctions).values({
        employeId: input.employeId,
        typeSanction: input.typeSanction,
        motif: input.motif,
        gravite: input.gravite,
        dateSanction: input.dateSanction,
        dateDebutEffet: input.dateDebutEffet || null,
        dateFinEffet: input.dateFinEffet || null,
        dureeJours: input.dureeJours ? String(input.dureeJours) : null,
        detailsFinanciers: input.detailsFinanciers ? String(input.detailsFinanciers) : null,
      } as any).returning() as any;
      return { id: String(sanction.id) };
    }) as any,

  // ─── Contrats ───
  listContrats: rhProcedure
    .input(z.object({ employeId: z.number().optional(), statut: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(employes.agenceId, ctx.user.agenceId)];
      if (safe.employeId) conditions.push(eq(contrats.employeId, safe.employeId));
      if (safe.statut) conditions.push(eq(contrats.statut, safe.statut));
      // RPT-05 : meme defaut que `listSanctions` — `select()` nu + jointure qui
      // deborde les colonnes de l'employe. Et `salaireBase` du contrat est un
      // montant : il ne sort pas sans `rh.salaire.consulter`.
      const salaireOk = await canVoirSalairesRH(ctx);
      return db
        .select({
          id: contrats.id,
          employeId: contrats.employeId,
          typeContrat: contrats.typeContrat,
          dateDebut: contrats.dateDebut,
          dateFin: contrats.dateFin,
          dureeMois: contrats.dureeMois,
          finPeriodeEssai: contrats.finPeriodeEssai,
          renouvellement: contrats.renouvellement,
          poste: contrats.poste,
          statut: contrats.statut,
          fichierUrl: contrats.fichierUrl,
          employeNom: employes.nom,
          employePrenom: employes.prenom,
          ...(salaireOk
            ? {
                salaireBase: contrats.salaireBase,
                avantages: contrats.avantages,
                notes: contrats.notes,
              }
            : {}),
        })
        .from(contrats)
        .innerJoin(employes, eq(contrats.employeId, employes.id))
        .where(and(...conditions))
        .orderBy(desc(contrats.dateDebut));
    }),

  createContrat: requirePermissionProcedure("rh.employe.modifier")
    .input(z.object({
      employeId: z.number(),
      typeContrat: z.string(),
      dateDebut: z.string(),
      dateFin: z.string().optional(),
      dureeMois: z.number().optional(),
      // specs MVP 05_Contrats
      finPeriodeEssai: z.string().optional(),
      avantages: z.string().optional(),
      renouvellement: z.boolean().optional(),
      salaireBase: z.string().optional(),
      poste: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertEmployeEnAgence(input.employeId, ctx.user.agenceId);
      const [contrat] = await db.insert(contrats).values({
        employeId: input.employeId,
        typeContrat: input.typeContrat,
        dateDebut: input.dateDebut,
        dateFin: input.dateFin || null,
        dureeMois: input.dureeMois || null,
        finPeriodeEssai: input.finPeriodeEssai || null,
        avantages: input.avantages || null,
        renouvellement: input.renouvellement ?? false,
        salaireBase: input.salaireBase || null,
        poste: input.poste || null,
        notes: input.notes || null,
      } as any).returning() as any;

      // R7 — version initiale du contrat (historique immuable) : version 1 = état de création
      await db.insert(contractVersions).values({
        contractId: contrat.id,
        employeId: input.employeId,
        version: 1,
        typeContrat: input.typeContrat,
        poste: input.poste || null,
        dateDebut: input.dateDebut,
        dateFin: input.dateFin || null,
        dureeMois: input.dureeMois || null,
        salaireBase: input.salaireBase || null,
        statut: "actif",
        finPeriodeEssai: input.finPeriodeEssai || null,
        avantages: input.avantages || null,
        renouvellement: input.renouvellement ? "OUI" : null,
        notes: input.notes || null,
        reason: "CONTRAT_INITIAL",
        changedBy: Number(ctx.user.id),
      } as any);

      return { id: String(contrat.id) };
    }) as any,

  /** specs MVP 05_Contrats — renouvellement en un clic : prolonge la fin de la même durée. */
  renouvelerContrat: requirePermissionProcedure("rh.employe.modifier")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [contrat] = await db
        .select({ id: contrats.id, dureeMois: contrats.dureeMois, dateFin: contrats.dateFin, dateDebut: contrats.dateDebut })
        .from(contrats)
        .innerJoin(employes, eq(contrats.employeId, employes.id))
        .where(and(eq(contrats.id, input.id), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!contrat) throw new TRPCError({ code: "NOT_FOUND", message: "Contrat introuvable." });
      const duree = contrat.dureeMois ?? 12;
      const base = new Date(`${contrat.dateFin ?? contrat.dateDebut}T00:00:00`);
      const nouvelleFin = new Date(base.getFullYear(), base.getMonth() + duree, base.getDate()).toISOString().slice(0, 10);

      // R7 — avant-image versionnée avant mutation (le renouvellement ne dégrade jamais l'historique)
      const [pleinContrat] = await db
        .select()
        .from(contrats)
        .where(eq(contrats.id, input.id));
      const versionsExistantes = await db
        .select({ v: contractVersions.version })
        .from(contractVersions)
        .where(eq(contractVersions.contractId, input.id));
      await db.insert(contractVersions).values({
        contractId: input.id,
        employeId: pleinContrat.employeId,
        version: prochaineVersionContrat(versionsExistantes.map((r) => ({ version: r.v } as any))),
        typeContrat: pleinContrat.typeContrat,
        poste: pleinContrat.poste,
        dateDebut: pleinContrat.dateDebut,
        dateFin: pleinContrat.dateFin,
        dureeMois: pleinContrat.dureeMois,
        salaireBase: pleinContrat.salaireBase,
        statut: pleinContrat.statut,
        finPeriodeEssai: pleinContrat.finPeriodeEssai,
        avantages: pleinContrat.avantages,
        renouvellement: String(pleinContrat.renouvellement ?? false) === "true" ? "OUI" : null,
        notes: pleinContrat.notes,
        reason: `RENOUVELLEMENT ${duree} mois — nouvelle échéance ${nouvelleFin}`,
        changedBy: Number(ctx.user.id),
      } as any);

      await db
        .update(contrats)
        .set({ dateFin: nouvelleFin, renouvellement: true, statut: "actif", updatedAt: new Date() } as any)
        .where(eq(contrats.id, input.id));
      return { success: true, nouvelleFin };
    }) as any,

  // ─── Documents employés ───
  listDocuments: rhProcedure
    .input(z.object({
      employeId: z.number().optional(),
      typeDocument: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [eq(employes.agenceId, ctx.user.agenceId)];
      if (input.employeId) conditions.push(eq(documentsEmployes.employeId, input.employeId));
      if (input.typeDocument) conditions.push(eq(documentsEmployes.typeDocument, input.typeDocument));
      return db.select().from(documentsEmployes)
        .innerJoin(employes, eq(documentsEmployes.employeId, employes.id))
        .where(and(...conditions)).orderBy(desc(documentsEmployes.createdAt));
    }),

  createDocument: requirePermissionProcedure("rh.document.modifier")
    .input(z.object({
      employeId: z.number(),
      typeDocument: z.string(),
      titre: z.string().optional(),
      fichierUrl: z.string().min(1),
      dateEmission: z.string().optional(),
      dateExpiration: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertEmployeEnAgence(input.employeId, ctx.user.agenceId);
      const [doc] = await db.insert(documentsEmployes).values({
        employeId: input.employeId,
        typeDocument: input.typeDocument,
        titre: input.titre || null,
        fichierUrl: input.fichierUrl,
        dateEmission: input.dateEmission || null,
        dateExpiration: input.dateExpiration || null,
      } as any).returning() as any;
      return { id: String(doc.id) };
    }) as any,

  deleteDocument: requirePermissionProcedure("rh.document.modifier")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [doc] = await db
        .select({ id: documentsEmployes.id })
        .from(documentsEmployes)
        .innerJoin(employes, eq(documentsEmployes.employeId, employes.id))
        .where(and(eq(documentsEmployes.id, input.id), eq(employes.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document introuvable." });
      await db.delete(documentsEmployes).where(eq(documentsEmployes.id, input.id)) as any;
      return { success: true };
    }) as any,
});

