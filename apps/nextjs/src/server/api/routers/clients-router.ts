import { z } from "zod";
import { createTRPCRouter, rhProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  clients,
  clientContacts,
  clientAdresses,
  clientInteractions,
  clientStatutHistorique,
  contratsMaintenance,
  contratsMaintenanceVehicules,
  vehicules,
  ventes,
} from "@atelierone/db";
import { eq, and, or, ilike, desc, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  validerFicheClient,
  transitionStatutClientValide,
  genererCodeClient,
  peutOuvrirOrdre,
  type TypeClient,
} from "~/server/lib/client-service";

/** MODULE CLIENTS — fiche 360°, types, statuts, contacts, adresses, interactions. */
export const clientsRouter = createTRPCRouter({
  // ─── Liste (filtres : recherche multicritère, type, statut) ───
  list: requirePermissionProcedure("clients.consulter")
    .input(
      z.object({
        search: z.string().optional(),
        typeClient: z.string().optional(),
        statut: z.string().optional(),
        limit: z.number().int().min(10).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(clients.agenceId, ctx.user.agenceId), sql`${clients.deletedAt} IS NULL`];
      if (safe.typeClient) conditions.push(eq(clients.typeClient, safe.typeClient));
      if (safe.statut) conditions.push(eq(clients.statut, safe.statut));
      if (safe.search?.trim()) {
        const q = `%${safe.search.trim()}%`;
        conditions.push(
          or(
            ilike(clients.nom, q),
            ilike(clients.prenom, q),
            ilike(clients.telephone, q),
            ilike(clients.email, q),
            ilike(clients.codeClient, q),
            ilike(clients.raisonSociale, q),
            ilike(clients.niuNif, q),
            ilike(clients.rccm, q),
          )!
        );
      }
      const rows = await db
        .select()
        .from(clients)
        .where(and(...conditions))
        .orderBy(desc(clients.createdAt))
        .limit(safe.limit)
        .offset(safe.offset);
      const [count] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(clients)
        .where(and(...conditions));
      return { clients: rows, total: count?.n ?? 0 };
    }),

  // ─── Fiche 360° ───
  get: requirePermissionProcedure("clients.consulter")
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, input.id), eq(clients.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable." });

      const [contacts, adresses, interactions, historique, contrats, vehiculesClient, factures] = await Promise.all([
        db.select().from(clientContacts).where(eq(clientContacts.clientId, input.id)).orderBy(desc(clientContacts.estContactPrincipal)),
        db.select().from(clientAdresses).where(eq(clientAdresses.clientId, input.id)).orderBy(desc(clientAdresses.estPrincipale)),
        db.select().from(clientInteractions).where(eq(clientInteractions.clientId, input.id)).orderBy(desc(clientInteractions.dateHeure)),
        db.select().from(clientStatutHistorique).where(eq(clientStatutHistorique.clientId, input.id)).orderBy(desc(clientStatutHistorique.changeLe)),
        db.select().from(contratsMaintenance).where(eq(contratsMaintenance.clientId, input.id)).orderBy(desc(contratsMaintenance.dateDebut)),
        db.select().from(vehicules).where(and(eq(vehicules.clientId, input.id), eq(vehicules.agenceId, ctx.user.agenceId))),
        db
          .select({ montantTotal: ventes.montantTotal, montantPaye: ventes.montantPaye })
          .from(ventes)
          .where(and(eq(ventes.clientId, input.id), eq(ventes.agenceId, ctx.user.agenceId), sql`${ventes.montantPaye} < ${ventes.montantTotal}`)),
      ]);

      const solde = Math.round(factures.reduce((s, v) => s + (Number(v.montantTotal) - Number(v.montantPaye ?? 0)), 0) * 100) / 100;

      return { client, contacts, adresses, interactions, historique, contrats, vehiculesClient, solde };
    }),

  // ─── Création (champs dynamiques selon le type) ───
  create: requirePermissionProcedure("clients.creer")
    .input(
      z.object({
        typeClient: z.enum(["PART", "ENTR", "ADMIN", "ASSUR", "FLOTTE", "PROSP"]),
        civilite: z.string().optional(),
        nom: z.string().optional(),
        prenom: z.string().optional(),
        raisonSociale: z.string().optional(),
        sigle: z.string().optional(),
        niuNif: z.string().optional(),
        rccm: z.string().optional(),
        compagnieAssurance: z.string().optional(),
        numeroPolice: z.string().optional(),
        numeroSinistre: z.string().optional(),
        expertAssurance: z.string().optional(),
        montantPriseEnCharge: z.number().optional(),
        franchiseClient: z.number().optional(),
        telephone: z.string().optional(),
        telephoneSecondaire: z.string().optional(),
        whatsapp: z.string().optional(),
        email: z.string().optional(),
        adresse: z.string().optional(),
        ville: z.string().optional(),
        modePaiementPrefere: z.string().optional(),
        delaiPaiementJours: z.number().optional(),
        plafondCredit: z.number().optional(),
        remiseDefautPct: z.number().optional(),
        exigeBonDeCommande: z.boolean().optional(),
        notes: z.string().optional(),
        notesInternes: z.string().optional(),
        codeClient: z.string().optional(),
        contactPrincipal: z.object({ nom: z.string(), prenom: z.string().optional(), telephone: z.string().optional(), email: z.string().optional(), fonction: z.string().optional() }).optional(),
        contactFacturation: z.object({ nom: z.string(), prenom: z.string().optional(), telephone: z.string().optional(), email: z.string().optional(), fonction: z.string().optional() }).optional(),
        adressePrincipale: z.object({ ligne1: z.string().optional(), quartier: z.string().optional(), ville: z.string().optional(), pays: z.string().optional() }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const manquants = validerFicheClient({
        type: input.typeClient as TypeClient,
        civilite: input.civilite,
        nom: input.nom,
        prenom: input.prenom,
        raisonSociale: input.raisonSociale,
        niuNif: input.niuNif,
        email: input.email,
        telephone: input.telephone,
        compagnieAssurance: input.compagnieAssurance,
      });
      if (manquants.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Champs obligatoires manquants (${input.typeClient}) : ${manquants.join(", ")}.` });
      }

      // Code client : manuel (immuable) ou auto CLT-année-séquence
      let codeClient = input.codeClient?.trim();
      if (!codeClient) {
        const [last] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(clients)
          .where(and(eq(clients.agenceId, ctx.user.agenceId), sql`${clients.codeClient} LIKE ${`CLT-${new Date().getFullYear()}-%`}`));
        codeClient = genererCodeClient((last?.n ?? 0) + 1);
      } else {
        const [dup] = await db.select({ id: clients.id }).from(clients).where(eq(clients.codeClient, codeClient)).limit(1);
        if (dup) throw new TRPCError({ code: "BAD_REQUEST", message: "Ce code client existe déjà." });
      }

      const statut = input.typeClient === "PROSP" ? "PROSPECT" : "ACTIF";

      const [client] = await db
        .insert(clients)
        .values({
          typeClient: input.typeClient,
          statut,
          civilite: input.civilite ?? null,
          nom: input.nom ?? input.raisonSociale ?? "",
          prenom: input.prenom ?? null,
          raisonSociale: input.raisonSociale ?? null,
          sigle: input.sigle ?? null,
          niuNif: input.niuNif ?? null,
          rccm: input.rccm ?? null,
          compagnieAssurance: input.compagnieAssurance ?? null,
          numeroPolice: input.numeroPolice ?? null,
          numeroSinistre: input.numeroSinistre ?? null,
          expertAssurance: input.expertAssurance ?? null,
          montantPriseEnCharge: input.montantPriseEnCharge != null ? String(input.montantPriseEnCharge) : null,
          franchiseClient: input.franchiseClient != null ? String(input.franchiseClient) : null,
          telephone: input.telephone ?? null,
          telephoneSecondaire: input.telephoneSecondaire ?? null,
          whatsapp: input.whatsapp ?? null,
          email: input.email ?? null,
          adresse: input.adresse ?? null,
          ville: input.ville ?? null,
          modePaiementPrefere: input.modePaiementPrefere ?? "especes",
          delaiPaiementJours: input.delaiPaiementJours ?? 0,
          plafondCredit: input.plafondCredit != null ? String(input.plafondCredit) : "0",
          remiseDefautPct: input.remiseDefautPct != null ? String(input.remiseDefautPct) : "0",
          exigeBonDeCommande: input.exigeBonDeCommande ?? false,
          notes: input.notes ?? null,
          notesInternes: input.notesInternes ?? null,
          codeClient,
          isActive: true,
          createdBy: Number(ctx.user.id),
          agenceId: ctx.user.agenceId,
        } as any)
        .returning();

      // Contact principal (obligatoire ENTR/ADMIN/FLOTTE)
      if (input.contactPrincipal) {
        await db.insert(clientContacts).values({
          clientId: client.id,
          nom: input.contactPrincipal.nom,
          prenom: input.contactPrincipal.prenom ?? null,
          telephone: input.contactPrincipal.telephone ?? null,
          email: input.contactPrincipal.email ?? null,
          fonction: input.contactPrincipal.fonction ?? null,
          estContactPrincipal: true,
          estContactFacturation: !!input.contactFacturation,
        } as any);
      }
      if (input.contactFacturation && (!input.contactPrincipal || input.contactFacturation.nom !== input.contactPrincipal.nom)) {
        await db.insert(clientContacts).values({
          clientId: client.id,
          nom: input.contactFacturation.nom,
          prenom: input.contactFacturation.prenom ?? null,
          telephone: input.contactFacturation.telephone ?? null,
          email: input.contactFacturation.email ?? null,
          fonction: input.contactFacturation.fonction ?? null,
          estContactPrincipal: false,
          estContactFacturation: true,
        } as any);
      }
      if (input.adressePrincipale) {
        await db.insert(clientAdresses).values({
          clientId: client.id,
          type: "FACTURATION",
          ligne1: input.adressePrincipale.ligne1 ?? null,
          quartier: input.adressePrincipale.quartier ?? null,
          ville: input.adressePrincipale.ville ?? null,
          pays: input.adressePrincipale.pays ?? "Cameroun",
          estPrincipale: true,
        } as any);
      }

      // Audit de création
      await db.insert(clientStatutHistorique).values({
        clientId: client.id,
        ancienStatut: null,
        nouveauStatut: statut,
        motif: "Création du client",
        changePar: Number(ctx.user.id),
      } as any);

      return { id: client.id, codeClient, statut };
    }),

  // ─── Mise à jour de la fiche ───
  update: requirePermissionProcedure("clients.modifier")
    .input(
      z.object({
        id: z.number().int(),
        civilite: z.string().optional(),
        nom: z.string().optional(),
        prenom: z.string().optional(),
        raisonSociale: z.string().optional(),
        sigle: z.string().optional(),
        niuNif: z.string().optional(),
        rccm: z.string().optional(),
        compagnieAssurance: z.string().optional(),
        numeroPolice: z.string().optional(),
        numeroSinistre: z.string().optional(),
        expertAssurance: z.string().optional(),
        montantPriseEnCharge: z.number().optional(),
        franchiseClient: z.number().optional(),
        telephone: z.string().optional(),
        telephoneSecondaire: z.string().optional(),
        whatsapp: z.string().optional(),
        email: z.string().optional(),
        adresse: z.string().optional(),
        ville: z.string().optional(),
        modePaiementPrefere: z.string().optional(),
        delaiPaiementJours: z.number().optional(),
        plafondCredit: z.number().optional(),
        remiseDefautPct: z.number().optional(),
        exigeBonDeCommande: z.boolean().optional(),
        notes: z.string().optional(),
        notesInternes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [existing] = await db
        .select({ id: clients.id, agenceId: clients.agenceId })
        .from(clients)
        .where(and(eq(clients.id, id), eq(clients.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable." });
      const updateData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) updateData[k] = v;
      }
      if (updateData.plafondCredit !== undefined) updateData.plafondCredit = String(updateData.plafondCredit);
      if (updateData.remiseDefautPct !== undefined) updateData.remiseDefautPct = String(updateData.remiseDefautPct);
      if (updateData.montantPriseEnCharge !== undefined) updateData.montantPriseEnCharge = String(updateData.montantPriseEnCharge);
      if (updateData.franchiseClient !== undefined) updateData.franchiseClient = String(updateData.franchiseClient);
      updateData.updatedAt = new Date();
      await db.update(clients).set(updateData as any).where(eq(clients.id, id));
      return { success: true };
    }),

  // ─── Changement de statut (transitions + audit, motif obligatoire pour certains) ───
  changerStatut: requirePermissionProcedure("clients.modifier")
    .input(z.object({ id: z.number().int(), nouveauStatut: z.enum(["PROSPECT", "ACTIF", "INACTIF", "BLOQUE", "ARCHIVE"]), motif: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, input.id), eq(clients.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable." });
      if (!transitionStatutClientValide(client.statut as any, input.nouveauStatut)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Transition « ${client.statut} → ${input.nouveauStatut} » non autorisée.` });
      }
      if (input.nouveauStatut === "BLOQUE" && !input.motif?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le blocage exige un motif." });
      }
      await db
        .update(clients)
        .set({ statut: input.nouveauStatut, isActive: input.nouveauStatut !== "ARCHIVE" && input.nouveauStatut !== "INACTIF", updatedAt: new Date() } as any)
        .where(eq(clients.id, input.id));
      await db.insert(clientStatutHistorique).values({
        clientId: input.id,
        ancienStatut: client.statut ?? null,
        nouveauStatut: input.nouveauStatut,
        motif: input.motif?.trim() ?? null,
        changePar: Number(ctx.user.id),
      } as any);
      return { success: true, statut: input.nouveauStatut };
    }),

  // ─── Soft delete (refusé si contrat actif) ───
  archiver: requirePermissionProcedure("clients.modifier")
    .input(z.object({ id: z.number().int(), motif: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, input.id), eq(clients.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable." });
      const [contratActif] = await db
        .select({ id: contratsMaintenance.id })
        .from(contratsMaintenance)
        .where(and(eq(contratsMaintenance.clientId, input.id), eq(contratsMaintenance.statut, "ACTIF")))
        .limit(1);
      if (contratActif) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Impossible d'archiver un client ayant un contrat actif. Résiliez d'abord ses contrats." });
      }
      await db
        .update(clients)
        .set({ statut: "ARCHIVE", isActive: false, deletedAt: new Date(), updatedAt: new Date() } as any)
        .where(eq(clients.id, input.id));
      await db.insert(clientStatutHistorique).values({
        clientId: input.id,
        ancienStatut: client.statut ?? null,
        nouveauStatut: "ARCHIVE",
        motif: input.motif?.trim() ?? "Archivage manuel",
        changePar: Number(ctx.user.id),
      } as any);
      return { success: true };
    }),

  // ─── Contacts ───
  addContact: requirePermissionProcedure("clients.modifier")
    .input(z.object({
      clientId: z.number().int(),
      nom: z.string().min(1),
      prenom: z.string().optional(),
      fonction: z.string().optional(),
      telephone: z.string().optional(),
      email: z.string().optional(),
      estContactPrincipal: z.boolean().optional(),
      estContactFacturation: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { clientId } = input;
      const [client] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.agenceId, ctx.user.agenceId))).limit(1);
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable." });
      const [existing] = await db.select({ id: clientContacts.id }).from(clientContacts).where(eq(clientContacts.clientId, clientId)).limit(1);
      const isFirst = !existing;
      if (input.estContactPrincipal || isFirst) {
        await db.update(clientContacts).set({ estContactPrincipal: false } as any).where(eq(clientContacts.clientId, clientId));
      }
      const [row] = await db
        .insert(clientContacts)
        .values({
          clientId,
          nom: input.nom,
          prenom: input.prenom ?? null,
          fonction: input.fonction ?? null,
          telephone: input.telephone ?? null,
          email: input.email ?? null,
          estContactPrincipal: isFirst || input.estContactPrincipal,
          estContactFacturation: input.estContactFacturation ?? false,
        } as any)
        .returning();
      return row;
    }),

  updateContact: requirePermissionProcedure("clients.modifier")
    .input(z.object({ id: z.number().int(), nom: z.string().optional(), prenom: z.string().optional(), fonction: z.string().optional(), telephone: z.string().optional(), email: z.string().optional(), estContactPrincipal: z.boolean().optional(), estContactFacturation: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [contact] = await db
        .select({ id: clientContacts.id, clientId: clientContacts.clientId })
        .from(clientContacts)
        .where(eq(clientContacts.id, id))
        .limit(1);
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact introuvable." });
      if (rest.estContactPrincipal) {
        await db.update(clientContacts).set({ estContactPrincipal: false } as any).where(eq(clientContacts.clientId, contact.clientId));
      }
      await db.update(clientContacts).set({ ...rest, updatedAt: new Date() } as any).where(eq(clientContacts.id, id));
      return { success: true };
    }),

  deleteContact: requirePermissionProcedure("clients.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(clientContacts).where(eq(clientContacts.id, input.id));
      return { success: true };
    }),

  // ─── Adresses ───
  addAdresse: requirePermissionProcedure("clients.modifier")
    .input(z.object({
      clientId: z.number().int(),
      type: z.enum(["FACTURATION", "LIVRAISON", "SIEGE", "AUTRE"]).default("AUTRE"),
      ligne1: z.string().optional(),
      ligne2: z.string().optional(),
      quartier: z.string().optional(),
      ville: z.string().optional(),
      pays: z.string().optional(),
      estPrincipale: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { clientId } = input;
      const [client] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.agenceId, ctx.user.agenceId))).limit(1);
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable." });
      if (input.estPrincipale) {
        await db.update(clientAdresses).set({ estPrincipale: false } as any).where(eq(clientAdresses.clientId, clientId));
      }
      const [row] = await db
        .insert(clientAdresses)
        .values({ clientId, type: input.type, ligne1: input.ligne1 ?? null, ligne2: input.ligne2 ?? null, quartier: input.quartier ?? null, ville: input.ville ?? null, pays: input.pays ?? "Cameroun", estPrincipale: input.estPrincipale ?? false } as any)
        .returning();
      return row;
    }),

  updateAdresse: requirePermissionProcedure("clients.modifier")
    .input(z.object({ id: z.number().int(), type: z.string().optional(), ligne1: z.string().optional(), ligne2: z.string().optional(), quartier: z.string().optional(), ville: z.string().optional(), pays: z.string().optional(), estPrincipale: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [adresse] = await db.select({ id: clientAdresses.id, clientId: clientAdresses.clientId }).from(clientAdresses).where(eq(clientAdresses.id, id)).limit(1);
      if (!adresse) throw new TRPCError({ code: "NOT_FOUND", message: "Adresse introuvable." });
      if (rest.estPrincipale) {
        await db.update(clientAdresses).set({ estPrincipale: false } as any).where(eq(clientAdresses.clientId, adresse.clientId));
      }
      await db.update(clientAdresses).set(rest as any).where(eq(clientAdresses.id, id));
      return { success: true };
    }),

  deleteAdresse: requirePermissionProcedure("clients.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(clientAdresses).where(eq(clientAdresses.id, input.id));
      return { success: true };
    }),

  // ─── Interactions (historique 360°) ───
  addInteraction: requirePermissionProcedure("clients.modifier")
    .input(z.object({
      clientId: z.number().int(),
      type: z.enum(["APPEL", "VISITE", "EMAIL", "RELANCE", "RECLAMATION", "AUTRE"]).default("AUTRE"),
      sujet: z.string().optional(),
      contenu: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(clientInteractions)
        .values({ clientId: input.clientId, type: input.type, sujet: input.sujet ?? null, contenu: input.contenu ?? null, createdBy: Number(ctx.user.id) } as any)
        .returning();
      return row;
    }),

  listInteractions: requirePermissionProcedure("clients.consulter")
    .input(z.object({ clientId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      return db
        .select()
        .from(clientInteractions)
        .where(eq(clientInteractions.clientId, input.clientId))
        .orderBy(desc(clientInteractions.dateHeure))
        .limit(100);
    }),

  // ─── Historique des statuts (audit) ───
  historiqueStatut: requirePermissionProcedure("clients.consulter")
    .input(z.object({ clientId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      return db
        .select()
        .from(clientStatutHistorique)
        .where(eq(clientStatutHistorique.clientId, input.clientId))
        .orderBy(desc(clientStatutHistorique.changeLe));
    }),
});