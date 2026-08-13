import { z } from "zod";
import { createTRPCRouter, protectedProcedure, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db, employes, utilisateurs, absences, sanctions, contrats, documentsEmployes } from "@atelierone/db";
import { eq, and, or, ilike, desc, asc, count, inArray, sql, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const rhRouter = createTRPCRouter({
  list: rhProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(10).max(100).default(50),
        search: z.string().optional(),
        statut: z.enum(["actif", "conge", "suspendu", "archive"]).optional(),
        typeEmploye: z.enum(["permanent", "contractuel", "stagiaire", "temporaire", "apprenti", "prestataire"]).optional(),
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
          createdAt: employes.createdAt,
        })
        .from(employes)
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
        nom: z.string().min(1),
        prenom: z.string().min(1),
        dateNaissance: z.string().optional(),
        sexe: z.enum(["M", "F"]).optional(),
        emailPersonnel: z.string().email().optional().or(z.literal("")),
        telephone: z.string().optional(),
        telephoneSecondaire: z.string().optional(),
        adresse: z.string().optional(),
        ville: z.string().optional(),
        typeEmploye: z.enum(["permanent", "contractuel", "stagiaire", "temporaire", "apprenti", "prestataire"]).default("permanent"),
        fonction: z.string().min(1),
        dateEmbauche: z.string().default(() => { const d = new Date().toISOString().split("T")[0]; return d ?? "2000-01-01"; }),
        dateFinContrat: z.string().optional(),
        periodeEssaiFin: z.string().optional(),
        salaireBase: z.string().optional(),
        modePaie: z.enum(["mensuel", "horaire", "journalier", "commission"]).default("mensuel"),
        numCnss: z.string().optional(),
        numCompteBancaire: z.string().optional(),
        banque: z.string().optional(),
        typePieceIdentite: z.string().optional(),
        numPieceIdentite: z.string().optional(),
        pieceExpireLe: z.string().optional(),
        diplome: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [lastMatricule] = await db
        .select({ mat: employes.matricule })
        .from(employes)
        .orderBy(desc(employes.matricule))
        .limit(1);

      const year = new Date().getFullYear();
      const nextNum = lastMatricule
        ? parseInt(lastMatricule.mat.split("-")[2] ?? "0", 10) + 1
        : 1;
      const matricule = `GPJ-${year}-${String(nextNum).padStart(4, "0")}`;

      const [created] = await db.insert(employes).values({
        agenceId: ctx.user.agenceId,
        nom: input.nom,
        prenom: input.prenom,
        matricule,
        dateNaissance: input.dateNaissance || null,
        sexe: input.sexe || null,
        emailPersonnel: input.emailPersonnel || null,
        telephone: input.telephone || null,
        telephoneSecondaire: input.telephoneSecondaire || null,
        adresse: input.adresse || null,
        ville: input.ville || null,
        typeEmploye: input.typeEmploye,
        fonction: input.fonction,
        dateEmbauche: input.dateEmbauche,
        dateFinContrat: input.dateFinContrat || null,
        periodeEssaiFin: input.periodeEssaiFin || null,
        salaireBase: input.salaireBase || null,
        modePaie: input.modePaie,
        numCnss: input.numCnss || null,
        numCompteBancaire: input.numCompteBancaire || null,
        banque: input.banque || null,
        typePieceIdentite: input.typePieceIdentite || null,
        numPieceIdentite: input.numPieceIdentite || null,
        pieceExpireLe: input.pieceExpireLe || null,
        diplome: input.diplome || null,
      } as any).returning() as any;
      return { id: String(created.id) };
    }),

  update: requirePermissionProcedure("rh.utilisateur.modifier")
    .input(
      z.object({
        id: z.string(),
        nom: z.string().min(1).optional(),
        prenom: z.string().min(1).optional(),
        dateNaissance: z.string().optional().nullable(),
        sexe: z.enum(["M", "F"]).optional().nullable(),
        emailPersonnel: z.string().email().optional().nullable().or(z.literal("")),
        telephone: z.string().optional().nullable(),
        telephoneSecondaire: z.string().optional().nullable(),
        adresse: z.string().optional().nullable(),
        ville: z.string().optional().nullable(),
        typeEmploye: z.enum(["permanent", "contractuel", "stagiaire", "temporaire", "apprenti", "prestataire"]).optional(),
        fonction: z.string().min(1).optional(),
        dateEmbauche: z.string().optional(),
        dateFinContrat: z.string().optional().nullable(),
        periodeEssaiFin: z.string().optional().nullable(),
        salaireBase: z.string().optional().nullable(),
        modePaie: z.enum(["mensuel", "horaire", "journalier", "commission"]).optional(),
        statut: z.enum(["actif", "conge", "suspendu", "archive"]).optional(),
        numCnss: z.string().optional().nullable(),
        numCompteBancaire: z.string().optional().nullable(),
        banque: z.string().optional().nullable(),
        typePieceIdentite: z.string().optional().nullable(),
        numPieceIdentite: z.string().optional().nullable(),
        pieceExpireLe: z.string().optional().nullable(),
        diplome: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: Record<string, unknown> = {};
      const fields: (keyof typeof input)[] = [
        "nom", "prenom", "dateNaissance", "sexe", "emailPersonnel",
        "telephone", "telephoneSecondaire", "adresse", "ville",
        "typeEmploye", "fonction", "dateEmbauche", "dateFinContrat",
        "periodeEssaiFin", "salaireBase", "modePaie", "statut",
        "numCnss", "numCompteBancaire", "banque",
        "typePieceIdentite", "numPieceIdentite", "pieceExpireLe", "diplome",
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
            eq(employes.id, input.id),
            eq(employes.agenceId, ctx.user.agenceId),
          ),
        )
        .returning({ id: employes.id });

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employé non trouvé." });
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

  // ─── Absences ───
  listAbsences: rhProcedure
    .input(z.object({
      employeId: z.number().optional(),
      statut: z.string().optional(),
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(employes.agenceId, ctx.user.agenceId)];
      if (input.employeId) conditions.push(eq(absences.employeId, input.employeId));
      if (input.statut) conditions.push(eq(absences.statut, input.statut));
      if (input.dateDebut) conditions.push(gte(absences.dateDebut, input.dateDebut as any));
      if (input.dateFin) conditions.push(lte(absences.dateFin, input.dateFin as any));

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
    .input(z.object({ employeId: z.number().optional() }))
    .query(async ({ input }) => {
      const conditions: any[] = [];
      if (input.employeId) conditions.push(eq(sanctions.employeId, input.employeId));

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
    .input(z.object({ employeId: z.number().optional(), statut: z.string().optional() }))
    .query(async ({ input }) => {
      const conditions: any[] = [];
      if (input.employeId) conditions.push(eq(contrats.employeId, input.employeId));
      if (input.statut) conditions.push(eq(contrats.statut, input.statut));
      return db.select().from(contrats).where(and(...conditions)).orderBy(desc(contrats.dateDebut));
    }),

  createContrat: requirePermissionProcedure("rh.utilisateur.creer")
    .input(z.object({
      employeId: z.number(),
      typeContrat: z.string(),
      dateDebut: z.string(),
      dateFin: z.string().optional(),
      dureeMois: z.number().optional(),
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
        salaireBase: input.salaireBase || null,
        poste: input.poste || null,
        notes: input.notes || null,
      } as any).returning() as any;
      return { id: String(contrat.id) };
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

