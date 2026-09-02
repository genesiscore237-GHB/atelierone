import { z } from "zod";
import { createTRPCRouter, protectedProcedure, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db, employes, utilisateurs, absences, sanctions, contrats, documentsEmployes, departments, positions, contractTypes, employeePositions, employeeSalaryHistory, hrGeneralSettings, hrWorkCycles } from "@atelierone/db";
import { eq, and, or, ilike, desc, asc, count, inArray, sql, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const rhRouter = createTRPCRouter({
  list: rhProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(10).max(300).default(100),
        search: z.string().optional(),
        statut: z.enum(["actif", "conge", "suspendu", "archive"]).optional(),
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
          salaireBase: r.salaireBase,
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

      return row;
    }),

  create: requirePermissionProcedure("rh.utilisateur.creer")
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

      // Règle métier : le manager doit être un employé actif
      if (input.managerId) {
        const [manager] = await db
          .select({ id: employes.id })
          .from(employes)
          .where(and(eq(employes.id, input.managerId), eq(employes.agenceId, agenceId), eq(employes.statut, "actif")))
          .limit(1);
        if (!manager) throw new TRPCError({ code: "BAD_REQUEST", message: "Le supérieur hiérarchique doit être un employé actif." });
      }

      // Matricule auto via RH-00 (préfixe + séquence paramétrables)
      const [gen] = await db
        .select()
        .from(hrGeneralSettings)
        .where(eq(hrGeneralSettings.agenceId, agenceId))
        .limit(1);
      const prefix = (gen?.employeeCodePrefix || "GPJ").trim();
      let seq = (gen?.employeeCodeSequence ?? 0) + 1;

      let matricule = `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
      const [existingMat] = await db
        .select({ id: employes.id })
        .from(employes)
        .where(eq(employes.matricule, matricule))
        .limit(1);
      if (existingMat) {
        // Séquence désynchronisée : repart du max réel
        const [last] = await db
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
        await db
          .update(hrGeneralSettings)
          .set({ employeeCodeSequence: seq, updatedAt: new Date() })
          .where(eq(hrGeneralSettings.agenceId, agenceId));
      }

      const [created] = await db.insert(employes).values({
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
      } as any).returning() as any;

      // Historiques initiaux (poste + salaire)
      if (input.positionId || input.departmentId) {
        await db.insert(employeePositions).values({
          employeeId: created.id,
          positionId: input.positionId ?? 0,
          departmentId: input.departmentId ?? null,
          startDate: input.dateEmbauche,
        } as any).catch(() => undefined);
      }
      if (input.salaireBase) {
        await db.insert(employeeSalaryHistory).values({
          employeeId: created.id,
          baseSalary: input.salaireBase,
          startDate: input.dateEmbauche,
          changedBy: Number(ctx.user.id),
        } as any).catch(() => undefined);
      }

      return { id: String(created.id), matricule };
    }),

  update: requirePermissionProcedure("rh.utilisateur.modifier")
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
      const fields: (keyof typeof input)[] = [
        "civilite", "nom", "prenom", "dateNaissance", "lieuNaissance", "sexe", "emailPersonnel",
        "telephone", "telephoneSecondaire", "adresse", "ville",
        "contactUrgenceNom", "contactUrgenceTelephone",
        "typeEmploye", "fonction", "departmentId", "positionId", "workCycleId", "managerId",
        "dateEmbauche", "dateFinContrat", "periodeEssaiFin", "salaireBase", "modePaie", "statut",
        "numCnss", "niu", "numCompteBancaire", "banque",
        "typePieceIdentite", "numPieceIdentite", "pieceExpireLe", "diplome",
        "langues", "logiciels", "pointsFort", "axesAmelioration", "notes",
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

      // Historique salaire : toute modification de salaire de base
      if (input.salaireBase !== undefined && input.salaireBase !== String(current.salaireBase ?? "")) {
        await db.insert(employeeSalaryHistory).values({
          employeeId: current.id,
          baseSalary: input.salaireBase || null,
          startDate: today,
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

      return { id: updated.id };
    }),

  search: protectedProcedure
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

      const [positionHistory, salaryHistory] = await Promise.all([
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
          .from(employeeSalaryHistory)
          .where(eq(employeeSalaryHistory.employeeId, employeeId))
          .orderBy(desc(employeeSalaryHistory.startDate)),
      ]);

      return {
        ...row,
        managerNom: manager ? `${manager.prenom} ${manager.nom}` : null,
        positionHistory,
        salaryHistory,
      };
    }),

  // ─── Référentiels RH-01 ───
  listDepartments: rhProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(departments)
      .where(eq(departments.agenceId, ctx.user.agenceId))
      .orderBy(asc(departments.name));
  }),

  createDepartment: requirePermissionProcedure("rh.utilisateur.modifier")
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

  createPosition: requirePermissionProcedure("rh.utilisateur.modifier")
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

  createContractType: requirePermissionProcedure("rh.utilisateur.modifier")
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

  createAbsence: requirePermissionProcedure("rh.utilisateur.creer")
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

  validerAbsence: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ id: z.number(), statut: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(absences).set({ statut: input.statut, validePar: ctx.user.id } as any).where(eq(absences.id, input.id));
      return { success: true };
    }) as any,

  // ─── Sanctions ───
  listSanctions: rhProcedure
    .input(z.object({ employeId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const safe = input ?? {};
      const conditions: any[] = [];
      if (safe.employeId) conditions.push(eq(sanctions.employeId, safe.employeId));

      return db.select().from(sanctions).where(and(...conditions)).orderBy(desc(sanctions.dateSanction));
    }),

  createSanction: requirePermissionProcedure("rh.utilisateur.creer")
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
    .mutation(async ({ input }) => {
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
    .query(async ({ input }) => {
      const safe = input ?? {};
      const conditions: any[] = [];
      if (safe.employeId) conditions.push(eq(contrats.employeId, safe.employeId));
      if (safe.statut) conditions.push(eq(contrats.statut, safe.statut));
      return db.select().from(contrats).where(and(...conditions)).orderBy(desc(contrats.dateDebut));
    }),

  createContrat: requirePermissionProcedure("rh.utilisateur.creer")
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
    .mutation(async ({ input }) => {
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
      return { id: String(contrat.id) };
    }) as any,

  /** specs MVP 05_Contrats — renouvellement en un clic : prolonge la fin de la même durée. */
  renouvelerContrat: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [contrat] = await db
        .select()
        .from(contrats)
        .where(eq(contrats.id, input.id))
        .limit(1);
      if (!contrat) throw new TRPCError({ code: "NOT_FOUND", message: "Contrat introuvable." });
      const duree = contrat.dureeMois ?? 12;
      const base = new Date(`${contrat.dateFin ?? contrat.dateDebut}T00:00:00`);
      const nouvelleFin = new Date(base.getFullYear(), base.getMonth() + duree, base.getDate()).toISOString().slice(0, 10);
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
    .query(async ({ input }) => {
      const conditions: any[] = [];
      if (input.employeId) conditions.push(eq(documentsEmployes.employeId, input.employeId));
      if (input.typeDocument) conditions.push(eq(documentsEmployes.typeDocument, input.typeDocument));
      return db.select().from(documentsEmployes).where(and(...conditions)).orderBy(desc(documentsEmployes.createdAt));
    }),

  createDocument: requirePermissionProcedure("rh.utilisateur.creer")
    .input(z.object({
      employeId: z.number(),
      typeDocument: z.string(),
      titre: z.string().optional(),
      fichierUrl: z.string().min(1),
      dateEmission: z.string().optional(),
      dateExpiration: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
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

  deleteDocument: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(documentsEmployes).where(eq(documentsEmployes.id, input.id)) as any;
      return { success: true };
    }) as any,
});

