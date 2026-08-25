import { z } from "zod";
import { createTRPCRouter, protectedProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  ordresReparation,
  lignesOrdreReparation,
  vehicules,
  clients,
  produits,
  employes,
  ventes,
  ventesLignes,
  dettesClients,
  contratsMaintenance,
  contratsMaintenanceVehicules,
  orHistorique,
  orPhotos,
  atelierParametres,
  orRapportsDiagnostic,
  orDemandesPieces,
  orDemandesPiecesLignes,
  retoursFournisseur,
  retoursFournisseurLignes,
  achats,
  achatsLignes,
  fournisseurs,
} from "@atelierone/db";
import { eq, and, desc, sql, gte, lte, asc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { tracerPieceClient, remettrePieceClient, listerPiecesClient as listerPiecesClientService } from "~/server/lib/piece-client-service";
import { calculerTotalFacture, calculerEcheance, respectePlafondCredit, genererReferenceFacture, MODES_PAIEMENT, montantLigne } from "~/server/lib/facturation-service";
import {
  migrerStatutLegacy,
  transitionStatutAtelierValide,
  calculerAlertes,
  joursImmobilisation,
  retardJours,
  PRIORITES,
  STATUTS_ATELIER,
  MOTIFS_ENTREE,
  STATUT_LABELS,
  STATUTS_FACTURABLES,
  transitionRapportDiagnosticValide,
  diagnosticSoumissible,
  devisSoumissible,
  statutDemandePieces,
  transitionRetourFournisseurValide,
} from "~/server/lib/atelier-service";
import { sortirPourOR } from "~/server/lib/stock-engine";

/**
 * MODULE ORDRE DE RÉPARATION (OR) — specs GPJ / Architecture §3.2.
 * Cycle : réception → diagnostic → devis → validation → travaux → clôture.
 * Les sorties/retours de pièces liées à l'OR sont gérées dans le router stock
 * (stock.sortirPourOR / stock.retourAtelier).
 */

export const STATUTS_OR = STATUTS_ATELIER;

const genNumero = async (agenceId: number): Promise<string> => {
  const now = new Date();
  const prefix = `OR-${String(now.getFullYear()).slice(2)}-`;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ordresReparation)
    .where(and(eq(ordresReparation.agenceId, agenceId), sql`numero LIKE ${prefix + "%"}`));
  return `${prefix}${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
};

export const orRouter = createTRPCRouter({
  // ─── Véhicules (liés aux OR) ───
  listVehicules: requirePermissionProcedure("or.consulter")
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [eq(vehicules.agenceId, ctx.user.agenceId)];
      const rows = await db
        .select({
          id: vehicules.id,
          immatriculation: vehicules.immatriculation,
          marque: vehicules.marque,
          modele: vehicules.modele,
          annee: vehicules.annee,
          clientId: vehicules.clientId,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
        })
        .from(vehicules)
        .leftJoin(clients, eq(vehicules.clientId, clients.id))
        .where(and(...conditions))
        .orderBy(vehicules.immatriculation);
      const safe = input ?? {};
      return safe.search
        ? rows.filter((r) =>
            (r.immatriculation ?? "").toLowerCase().includes(safe.search!.toLowerCase()) ||
            (r.marque ?? "").toLowerCase().includes(safe.search!.toLowerCase())
          )
        : rows;
    }),

  createVehicule: requirePermissionProcedure("or.creer")
    .input(z.object({
      immatriculation: z.string().min(1),
      marque: z.string().optional(),
      modele: z.string().optional(),
      annee: z.number().int().optional(),
      couleur: z.string().optional(),
      numeroChassis: z.string().optional(),
      kilometrage: z.number().int().optional(),
      clientId: z.number().int().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select({ id: vehicules.id })
        .from(vehicules)
        .where(and(eq(vehicules.agenceId, ctx.user.agenceId), eq(vehicules.immatriculation, input.immatriculation)))
        .limit(1);
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette immatriculation existe déjà." });
      const [row] = await db.insert(vehicules).values({
        agenceId: ctx.user.agenceId,
        immatriculation: input.immatriculation,
        marque: input.marque ?? null,
        modele: input.modele ?? null,
        annee: input.annee ?? null,
        couleur: input.couleur ?? null,
        numeroChassis: input.numeroChassis ?? null,
        kilometrage: input.kilometrage ?? null,
        clientId: input.clientId ?? null,
        notes: input.notes ?? null,
        statutImmobilisation: "en_reception",
      } as any).returning();
      return row;
    }),

  // ─── CRUD OR ───
  list: requirePermissionProcedure("or.consulter")
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(10).max(200).default(50),
      search: z.string().optional(),
      statut: z.string().optional(),
      priorite: z.string().optional(),
      responsableTechnicienId: z.number().int().optional(),
      emplacement: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(ordresReparation.agenceId, ctx.user.agenceId)];
      if (safe.statut) conditions.push(eq(ordresReparation.statut, migrerStatutLegacy(safe.statut)));
      if (safe.priorite) conditions.push(eq(ordresReparation.priorite, safe.priorite));
      if (safe.responsableTechnicienId) conditions.push(eq(ordresReparation.responsableTechnicienId, safe.responsableTechnicienId));
      if (safe.emplacement) conditions.push(eq(ordresReparation.emplacement, safe.emplacement));

      const rows = await db
        .select({
          id: ordresReparation.id,
          numero: ordresReparation.numero,
          statut: ordresReparation.statut,
          priorite: ordresReparation.priorite,
          plainte: ordresReparation.plainte,
          motEntree: ordresReparation.motEntree,
          dateOuverture: ordresReparation.dateOuverture,
          datePromesse: ordresReparation.datePromesse,
          emplacement: ordresReparation.emplacement,
          raisonBlocage: ordresReparation.raisonBlocage,
          bloquePar: ordresReparation.bloquePar,
          responsableTechnicienId: ordresReparation.responsableTechnicienId,
          responsableNom: employes.nom,
          responsablePrenom: employes.prenom,
          clientAttendSurPlace: ordresReparation.clientAttendSurPlace,
          totalPieces: ordresReparation.totalPieces,
          totalMainOeuvre: ordresReparation.totalMainOeuvre,
          totalTTC: ordresReparation.totalTTC,
          immatriculation: vehicules.immatriculation,
          marque: vehicules.marque,
          modele: vehicules.modele,
          clientId: clients.id,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientTelephone: clients.telephone,
          clientRaisonSociale: clients.raisonSociale,
          clientType: clients.typeClient,
        })
        .from(ordresReparation)
        .innerJoin(vehicules, eq(ordresReparation.vehiculeId, vehicules.id))
        .leftJoin(clients, eq(ordresReparation.clientId, clients.id))
        .leftJoin(employes, eq(ordresReparation.responsableTechnicienId, employes.id))
        .where(and(...conditions))
        .orderBy(
          sql`CASE ${ordresReparation.priorite} WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END`,
          desc(ordresReparation.dateOuverture),
        )
        .limit(safe.limit)
        .offset((safe.page - 1) * safe.limit);

      const [totalRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(ordresReparation)
        .where(and(...conditions));
      const total = totalRow?.count ?? 0;

      const filtered = safe.search
        ? rows.filter(
            (r) =>
              r.numero.toLowerCase().includes(safe.search!.toLowerCase()) ||
              (r.immatriculation ?? "").toLowerCase().includes(safe.search!.toLowerCase()) ||
              `${r.clientPrenom ?? ""} ${r.clientNom ?? ""}`.toLowerCase().includes(safe.search!.toLowerCase()) ||
              (r.clientRaisonSociale ?? "").toLowerCase().includes(safe.search!.toLowerCase())
          )
        : rows;

      return { items: filtered, total, page: safe.page, totalPages: Math.ceil(total / safe.limit) };
    }),

  getById: requirePermissionProcedure("or.consulter")
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [or] = await db
        .select({
          id: ordresReparation.id,
          numero: ordresReparation.numero,
          vehiculeId: ordresReparation.vehiculeId,
          clientId: ordresReparation.clientId,
          contratId: ordresReparation.contratId,
          venteId: ordresReparation.venteId,
          statut: ordresReparation.statut,
          priorite: ordresReparation.priorite,
          motEntree: ordresReparation.motEntree,
          plainte: ordresReparation.plainte,
          diagnostic: ordresReparation.diagnostic,
          devisAccepte: ordresReparation.devisAccepte,
          dateOuverture: ordresReparation.dateOuverture,
          datePromesse: ordresReparation.datePromesse,
          dateFinPrevue: ordresReparation.dateFinPrevue,
          dateCloture: ordresReparation.dateCloture,
          emplacement: ordresReparation.emplacement,
          raisonBlocage: ordresReparation.raisonBlocage,
          bloquePar: ordresReparation.bloquePar,
          clientAttendSurPlace: ordresReparation.clientAttendSurPlace,
          courtoisieDemandee: ordresReparation.courtoisieDemandee,
          responsableTechnicienId: ordresReparation.responsableTechnicienId,
          responsableNom: employes.nom,
          responsablePrenom: employes.prenom,
          totalPieces: ordresReparation.totalPieces,
          totalMainOeuvre: ordresReparation.totalMainOeuvre,
          totalTTC: ordresReparation.totalTTC,
          notes: ordresReparation.notes,
          immatriculation: vehicules.immatriculation,
          marque: vehicules.marque,
          modele: vehicules.modele,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientTelephone: clients.telephone,
        })
        .from(ordresReparation)
        .innerJoin(vehicules, eq(ordresReparation.vehiculeId, vehicules.id))
        .leftJoin(clients, eq(ordresReparation.clientId, clients.id))
        .leftJoin(employes, eq(ordresReparation.responsableTechnicienId, employes.id))
        .where(and(eq(ordresReparation.id, input.id), eq(ordresReparation.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "Ordre de réparation introuvable." });

      const lignes = await db
        .select({
          id: lignesOrdreReparation.id,
          type: lignesOrdreReparation.type,
          produitId: lignesOrdreReparation.produitId,
          libelle: lignesOrdreReparation.libelle,
          quantite: lignesOrdreReparation.quantite,
          prixUnitaire: lignesOrdreReparation.prixUnitaire,
          tva: lignesOrdreReparation.tva,
          totalLigne: lignesOrdreReparation.totalLigne,
          statut: lignesOrdreReparation.statut,
          produitTitre: produits.titre,
          produitCode: produits.codeArticle,
        })
        .from(lignesOrdreReparation)
        .leftJoin(produits, eq(lignesOrdreReparation.produitId, produits.id))
        .where(eq(lignesOrdreReparation.ordreId, input.id))
        .orderBy(lignesOrdreReparation.id);

      const [historique, photos, parametres, rapports] = await Promise.all([
        db.select().from(orHistorique).where(eq(orHistorique.orId, input.id)).orderBy(asc(orHistorique.changeLe)),
        db.select().from(orPhotos).where(eq(orPhotos.orId, input.id)).orderBy(asc(orPhotos.createdAt)),
        db.select().from(atelierParametres).where(eq(atelierParametres.agenceId, ctx.user.agenceId)).limit(1),
        db.select().from(orRapportsDiagnostic).where(eq(orRapportsDiagnostic.orId, input.id)).orderBy(desc(orRapportsDiagnostic.id)).limit(1),
      ]);
      const seuils = parametres?.[0]
        ? { seuilPromesseJours: parametres[0].seuilPromesseJours ?? 1, seuilImmobilisationJours: parametres[0].seuilImmobilisationJours ?? 5, seuilBloqueJours: parametres[0].seuilBloqueJours ?? 3 }
        : undefined;
      const dateEntree = or.dateOuverture ?? new Date();
      const alerte = calculerAlertes({
        statut: or.statut,
        priorite: or.priorite,
        datePromesse: or.datePromesse,
        dateEntree,
        seuils,
      });
      return {
        ...or,
        lignes,
        historique,
        photos,
        rapportDiagnostic: rapports?.[0] ?? null,
        joursImmobilisation: joursImmobilisation(dateEntree),
        retardJours: retardJours(or.datePromesse),
        alerte: alerte.principale,
        alertes: alerte.alertes,
      };
    }),

  create: requirePermissionProcedure("or.creer")
    .input(z.object({
      vehiculeId: z.number().int(),
      clientId: z.number().int().optional(),
      plainte: z.string().optional(),
      diagnostic: z.string().optional(),
      priorite: z.enum(PRIORITES).default("P3"),
      motEntree: z.enum(MOTIFS_ENTREE).default("AUTRE"),
      datePromesse: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      dateFinPrevue: z.string().optional(),
      emplacement: z.string().optional(),
      responsableTechnicienId: z.number().int().optional(),
      clientAttendSurPlace: z.boolean().optional(),
      courtoisieDemandee: z.boolean().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [vehicule] = await db
        .select({ id: vehicules.id, clientId: vehicules.clientId, statutImmobilisation: vehicules.statutImmobilisation })
        .from(vehicules)
        .where(and(eq(vehicules.id, input.vehiculeId), eq(vehicules.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!vehicule) throw new TRPCError({ code: "BAD_REQUEST", message: "Véhicule introuvable." });

      // Règle métier (module Véhicules & Atelier) : un véhicule SORTI ne peut pas ouvrir d'OR
      if (vehicule.statutImmobilisation === "sorti") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce véhicule est SORTI de l'atelier : ré-entrez-le (statut « En réception ») avant d'ouvrir un OR." });
      }

      // Règle métier (module Clients & Contrats) : un client BLOQUÉ ne peut plus avoir de nouvel OR
      const clientId = input.clientId ?? vehicule.clientId ?? null;
      if (clientId) {
        const [client] = await db
          .select({ statut: clients.statut })
          .from(clients)
          .where(eq(clients.id, clientId))
          .limit(1);
        if (client && client.statut === "BLOQUE") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ce client est BLOQUÉ (impayés / litige) : ouverture d'ordre de réparation refusée. Débloquez le client depuis sa fiche." });
        }
      }

      // Règle métier (module Contrats) : un OR ouvert sur un véhicule couvert est rattaché au contrat actif
      const [contratCouvert] = await db
        .select({ id: contratsMaintenance.id })
        .from(contratsMaintenance)
        .innerJoin(contratsMaintenanceVehicules, and(
          eq(contratsMaintenanceVehicules.contratId, contratsMaintenance.id),
          eq(contratsMaintenanceVehicules.vehiculeId, input.vehiculeId),
          eq(contratsMaintenanceVehicules.actif, true),
        ))
        .where(and(eq(contratsMaintenance.statut, "ACTIF"), lte(contratsMaintenance.dateDebut, new Date().toISOString().slice(0, 10))))
        .limit(1);

      const numero = await genNumero(ctx.user.agenceId);
      const [row] = await db
        .insert(ordresReparation)
        .values({
          agenceId: ctx.user.agenceId,
          numero,
          vehiculeId: input.vehiculeId,
          clientId,
          contratId: contratCouvert?.id ?? null,
          plainte: input.plainte ?? null,
          diagnostic: input.diagnostic ?? null,
          priorite: input.priorite,
          motEntree: input.motEntree,
          datePromesse: input.datePromesse ?? null,
          dateFinPrevue: input.dateFinPrevue ?? null,
          emplacement: input.emplacement ?? "Réception",
          responsableTechnicienId: input.responsableTechnicienId ?? null,
          clientAttendSurPlace: input.clientAttendSurPlace ?? false,
          courtoisieDemandee: input.courtoisieDemandee ?? false,
          notes: input.notes ?? null,
          creePar: Number(ctx.user.id),
          statut: "EN_ATTENTE_DIAGNOSTIC",
        } as any)
        .returning();

      // Historique de création (traçabilité complète)
      await db.insert(orHistorique).values({
        orId: row.id,
        type: "CREATION",
        nouvelleValeur: "EN_ATTENTE_DIAGNOSTIC",
        commentaire: `Réception ${input.motEntree} — ${input.plainte ?? "sans consigne"}${input.datePromesse ? `, promesse ${input.datePromesse}` : ""}`,
        changePar: Number(ctx.user.id),
      } as any);

      // Le véhicule entre en réparation
      if (vehicule.statutImmobilisation !== "en_reparation") {
        await db
          .update(vehicules)
          .set({ statutImmobilisation: "en_reparation", updatedAt: new Date() } as any)
          .where(eq(vehicules.id, input.vehiculeId));
      }
      return row;
    }),

  // ─── Cycle de vie : changement de statut (règles + historique + véhicule) ───
  changerStatut: requirePermissionProcedure("or.modifier")
    .input(z.object({
      id: z.number().int(),
      nouveauStatut: z.enum(STATUTS_ATELIER),
      raison: z.string().optional(),
      commentaire: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [or] = await db
        .select()
        .from(ordresReparation)
        .where(and(eq(ordresReparation.id, input.id), eq(ordresReparation.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });
      const t = transitionStatutAtelierValide(or.statut, input.nouveauStatut, input.raison);
      if (!t.ok) throw new TRPCError({ code: "BAD_REQUEST", message: t.raison ?? "Transition refusée." });

      const updateData: Record<string, unknown> = { statut: input.nouveauStatut, updatedAt: new Date() };
      if (input.nouveauStatut === "BLOQUE") {
        updateData.raisonBlocage = input.raison;
        updateData.bloquePar = input.raison ?? null;
        updateData.dateCloture = null;
      } else if (input.nouveauStatut === "LIVRE" || input.nouveauStatut === "PRET_A_LIVRER") {
        updateData.dateCloture = new Date();
      } else if (input.nouveauStatut === "ANNULE") {
        updateData.dateCloture = new Date();
        updateData.raisonBlocage = input.raison ?? null;
      } else {
        updateData.raisonBlocage = null;
        updateData.bloquePar = null;
      }
      await db.update(ordresReparation).set(updateData as any).where(eq(ordresReparation.id, input.id));

      await db.insert(orHistorique).values({
        orId: input.id,
        type: "STATUT",
        ancienneValeur: or.statut ?? null,
        nouvelleValeur: input.nouveauStatut,
        commentaire: input.commentaire ?? (input.raison ?? null),
        changePar: Number(ctx.user.id),
      } as any);

      // Cohérence véhicule
      if (input.nouveauStatut === "LIVRE") {
        await db.update(vehicules).set({ statutImmobilisation: "sorti", updatedAt: new Date() } as any).where(eq(vehicules.id, or.vehiculeId));
      } else if (input.nouveauStatut === "EN_COURS" || input.nouveauStatut === "CONTROLE_QUALITE") {
        await db.update(vehicules).set({ statutImmobilisation: "en_reparation", updatedAt: new Date() } as any).where(eq(vehicules.id, or.vehiculeId));
      }

      return { success: true, statut: input.nouveauStatut };
    }),

  // ─── Changement de priorité (historisation obligatoire) ───
  changerPriorite: requirePermissionProcedure("or.modifier")
    .input(z.object({ id: z.number().int(), priorite: z.enum(PRIORITES), motif: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [or] = await db
        .select({ id: ordresReparation.id, priorite: ordresReparation.priorite })
        .from(ordresReparation)
        .where(and(eq(ordresReparation.id, input.id), eq(ordresReparation.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });
      if (or.priorite === input.priorite) return { success: true, priorite: input.priorite };
      await db.update(ordresReparation).set({ priorite: input.priorite, updatedAt: new Date() } as any).where(eq(ordresReparation.id, input.id));
      await db.insert(orHistorique).values({
        orId: input.id,
        type: "PRIORITE",
        ancienneValeur: or.priorite ?? null,
        nouvelleValeur: input.priorite,
        commentaire: input.motif ?? null,
        changePar: Number(ctx.user.id),
      } as any);
      return { success: true, priorite: input.priorite };
    }),

  // ─── Assignation d'un responsable technique ───
  assignerTechnicien: requirePermissionProcedure("or.modifier")
    .input(z.object({ id: z.number().int(), technicienId: z.number().int().nullable(), commentaire: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [or] = await db
        .select({ id: ordresReparation.id, responsableTechnicienId: ordresReparation.responsableTechnicienId })
        .from(ordresReparation)
        .where(and(eq(ordresReparation.id, input.id), eq(ordresReparation.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });
      if (or.responsableTechnicienId === input.technicienId) return { success: true };
      await db.update(ordresReparation).set({ responsableTechnicienId: input.technicienId, updatedAt: new Date() } as any).where(eq(ordresReparation.id, input.id));
      await db.insert(orHistorique).values({
        orId: input.id,
        type: "RESPONSABLE",
        ancienneValeur: or.responsableTechnicienId ? String(or.responsableTechnicienId) : null,
        nouvelleValeur: input.technicienId ? String(input.technicienId) : null,
        commentaire: input.commentaire ?? null,
        changePar: Number(ctx.user.id),
      } as any);
      return { success: true };
    }),

  // ─── Photos / vidéos ───
  ajouterPhoto: requirePermissionProcedure("or.modifier")
    .input(z.object({ id: z.number().int(), url: z.string().min(1), type: z.enum(["PHOTO", "VIDEO"]).default("PHOTO") }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .insert(orPhotos)
        .values({ orId: input.id, url: input.url, type: input.type, creePar: Number(ctx.user.id) } as any)
        .returning();
      return row;
    }),

  listerPhotos: requirePermissionProcedure("or.consulter")
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      return db.select().from(orPhotos).where(eq(orPhotos.orId, input.id)).orderBy(asc(orPhotos.createdAt));
    }),

  // ─── Historique du cycle de vie ───
  historique: requirePermissionProcedure("or.consulter")
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      return db.select().from(orHistorique).where(eq(orHistorique.orId, input.id)).orderBy(asc(orHistorique.changeLe));
    }),

  update: requirePermissionProcedure("or.modifier")
    .input(z.object({
      id: z.number().int(),
      plainte: z.string().optional(),
      diagnostic: z.string().optional(),
      devisAccepte: z.boolean().optional(),
      statut: z.enum(STATUTS_OR).optional(),
      priorite: z.enum(PRIORITES).optional(),
      datePromesse: z.string().nullable().optional(),
      dateFinPrevue: z.string().nullable().optional(),
      emplacement: z.string().optional(),
      motEntree: z.enum(MOTIFS_ENTREE).optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const values: any = { ...rest, updatedAt: new Date() };
      if (rest.statut) values.statut = migrerStatutLegacy(rest.statut);
      if (rest.statut === "LIVRE" || rest.statut === "PRET_A_LIVRER") values.dateCloture = new Date();
      if (rest.datePromesse === null) values.datePromesse = null;
      if (rest.dateFinPrevue === null) values.dateFinPrevue = null;
      await db.update(ordresReparation).set(values).where(and(eq(ordresReparation.id, id), eq(ordresReparation.agenceId, ctx.user.agenceId)));
      return { success: true };
    }),

  // ─── Lignes (pièces & main d'œuvre) ───
  addLigne: requirePermissionProcedure("or.modifier")
    .input(z.object({
      ordreId: z.number().int(),
      type: z.enum(["PIECE", "SERVICE"]).default("PIECE"),
      produitId: z.number().int().optional(),
      libelle: z.string().min(1),
      quantite: z.number().min(0.01).default(1),
      prixUnitaire: z.number().min(0).default(0),
      tva: z.number().min(0).default(0),
      technicienId: z.number().int().optional(),
      dureeHeures: z.number().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [or] = await db
        .select({ id: ordresReparation.id })
        .from(ordresReparation)
        .where(and(eq(ordresReparation.id, input.ordreId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!or) throw new TRPCError({ code: "BAD_REQUEST", message: "OR introuvable." });

      const totalLigne = input.quantite * input.prixUnitaire * (1 + input.tva / 100);
      const [row] = await db
        .insert(lignesOrdreReparation)
        .values({
          ordreId: input.ordreId,
          type: input.type,
          produitId: input.produitId ?? null,
          libelle: input.libelle,
          quantite: String(input.quantite),
          prixUnitaire: String(input.prixUnitaire),
          tva: String(input.tva),
          totalLigne: String(totalLigne),
          technicienId: input.technicienId ?? null,
          dureeHeures: input.dureeHeures ? String(input.dureeHeures) : null,
          statut: "a_faire",
        } as any)
        .returning();
      await recalculerTotaux(ctx.user.agenceId, input.ordreId);
      return row;
    }),

  updateLigne: requirePermissionProcedure("or.modifier")
    .input(z.object({
      id: z.number().int(),
      quantite: z.number().min(0.01).optional(),
      prixUnitaire: z.number().min(0).optional(),
      statut: z.string().optional(),
      technicienId: z.number().int().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await db.update(lignesOrdreReparation).set(rest as any).where(eq(lignesOrdreReparation.id, id));
      const [ligne] = await db
        .select({ ordreId: lignesOrdreReparation.ordreId })
        .from(lignesOrdreReparation)
        .where(eq(lignesOrdreReparation.id, id))
        .limit(1);
      if (ligne) await recalculerTotaux(ctx.user.agenceId, ligne.ordreId);
      return { success: true };
    }),

  deleteLigne: requirePermissionProcedure("or.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [ligne] = await db
        .select({ ordreId: lignesOrdreReparation.ordreId })
        .from(lignesOrdreReparation)
        .where(eq(lignesOrdreReparation.id, input.id))
        .limit(1);
      await db.delete(lignesOrdreReparation).where(eq(lignesOrdreReparation.id, input.id));
      if (ligne) await recalculerTotaux(ctx.user.agenceId, ligne.ordreId);
      return { success: true };
    }),

  // ─── Pièces fournies par le client (specs V2 §04 processus 8, §05 règle 10) ───
  addPieceClient: requirePermissionProcedure("or.modifier")
    .input(z.object({
      orId: z.number().int(),
      produitId: z.number().int().optional(),
      libelle: z.string().max(255).optional(),
      quantite: z.number().positive(),
      motif: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const libelle = input.libelle?.trim();
      if (!input.produitId && !libelle) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choisissez un article ou saisissez un libellé." });
      }
      return db.transaction(async (tx) => {
        return tracerPieceClient(tx as any, {
          orId: input.orId,
          agenceId: ctx.user.agenceId,
          produitId: input.produitId,
          libelle: libelle ?? "",
          quantite: input.quantite,
          motif: input.motif ?? "Pièce fournie par le client",
          effectuePar: Number(ctx.user.id),
        });
      }) as any;
    }),

  remettrePieceClient: requirePermissionProcedure("or.modifier")
    .input(z.object({ ligneId: z.number().int(), orId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        return remettrePieceClient(tx as any, {
          ligneId: input.ligneId,
          orId: input.orId,
          agenceId: ctx.user.agenceId,
          effectuePar: Number(ctx.user.id),
        });
      }) as any;
    }),

  listerPiecesClient: requirePermissionProcedure("or.consulter")
    .input(z.object({ orId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      return listerPiecesClientService(input.orId, ctx.user.agenceId);
    }),

  // ─── Rapport de diagnostic structuré + validation (P1) ───
  creerRapportDiagnostic: requirePermissionProcedure("or.modifier")
    .input(z.object({
      orId: z.number().int(),
      constat: z.string().min(3),
      cause: z.string().optional(),
      lignes: z.array(z.object({
        type: z.enum(["PIECE", "SERVICE"]).default("PIECE"),
        produitId: z.number().int().optional(),
        libelle: z.string().min(1),
        quantite: z.number().min(0.01).default(1),
        prixUnitaire: z.number().min(0).default(0),
        tva: z.number().min(0).default(0),
        dureeHeures: z.number().min(0).optional(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [or] = await tx
          .select({ id: ordresReparation.id, numero: ordresReparation.numero, statut: ordresReparation.statut })
          .from(ordresReparation)
          .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });
        if (!diagnosticSoumissible({ constat: input.constat }, input.lignes)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Le rapport doit avoir un constat et au moins une préconisation." });
        }
        const [rapport] = await tx
          .insert(orRapportsDiagnostic)
          .values({ orId: input.orId, technicienId: Number(ctx.user.id) ?? null, constat: input.constat, cause: input.cause ?? null, statut: "SOUMIS", dateSoumission: new Date() } as any)
          .returning();
        let order = 0;
        for (const l of input.lignes) {
          await tx.insert(lignesOrdreReparation).values({
            ordreId: input.orId,
            type: l.type,
            produitId: l.produitId ?? null,
            libelle: l.libelle,
            quantite: String(l.quantite),
            prixUnitaire: String(l.prixUnitaire),
            tva: String(l.tva),
            totalLigne: String(l.quantite * l.prixUnitaire * (1 + l.tva / 100)),
            rapportId: rapport.id,
            statut: "a_faire",
          } as any);
        }
        await tx.update(ordresReparation).set({ statut: "EN_ATTENTE_VALIDATION_DIAGNOSTIC", updatedAt: new Date() } as any).where(eq(ordresReparation.id, input.orId));
        await tx.insert(orHistorique).values({
          orId: input.orId,
          type: "VALIDATION_DIAGNOSTIC",
          ancienneValeur: or.statut ?? null,
          nouvelleValeur: "EN_ATTENTE_VALIDATION_DIAGNOSTIC",
          commentaire: `Diagnostic soumis — ${input.constat}`,
          changePar: Number(ctx.user.id),
        } as any);
        return { rapportId: rapport.id };
      }) as any;
    }),

  validerDiagnostic: requirePermissionProcedure("or.valider")
    .input(z.object({ rapportId: z.number().int(), commentaire: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [rapport] = await db.select().from(orRapportsDiagnostic).where(eq(orRapportsDiagnostic.id, input.rapportId)).limit(1);
      if (!rapport) throw new TRPCError({ code: "NOT_FOUND", message: "Rapport introuvable." });
      if (!transitionRapportDiagnosticValide(rapport.statut, "VALIDE")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Impossible de valider un rapport en statut ${rapport.statut}.` });
      }
      await db.update(orRapportsDiagnostic).set({ statut: "VALIDE", validePar: Number(ctx.user.id), valideLe: new Date(), commentaireValidateur: input.commentaire ?? null, updatedAt: new Date() } as any).where(eq(orRapportsDiagnostic.id, input.rapportId));
      await db.update(ordresReparation).set({ statut: "EN_COURS", diagnostic: rapport.constat, updatedAt: new Date() } as any).where(eq(ordresReparation.id, rapport.orId));
      await db.insert(orHistorique).values({
        orId: rapport.orId,
        type: "VALIDATION_DIAGNOSTIC",
        ancienneValeur: "EN_ATTENTE_VALIDATION_DIAGNOSTIC",
        nouvelleValeur: "EN_COURS",
        commentaire: `Diagnostic validé par le chef d'atelier${input.commentaire ? ` — ${input.commentaire}` : ""}`,
        changePar: Number(ctx.user.id),
      } as any);
      return { success: true };
    }),

  retournerDiagnostic: requirePermissionProcedure("or.valider")
    .input(z.object({ rapportId: z.number().int(), commentaire: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      const [rapport] = await db.select().from(orRapportsDiagnostic).where(eq(orRapportsDiagnostic.id, input.rapportId)).limit(1);
      if (!rapport) throw new TRPCError({ code: "NOT_FOUND", message: "Rapport introuvable." });
      if (!transitionRapportDiagnosticValide(rapport.statut, "RETOURNE")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Seul un rapport SOUMIS peut être renvoyé." });
      }
      await db.update(orRapportsDiagnostic).set({ statut: "RETOURNE", commentaireValidateur: input.commentaire, updatedAt: new Date() } as any).where(eq(orRapportsDiagnostic.id, input.rapportId));
      await db.update(ordresReparation).set({ statut: "EN_ATTENTE_DIAGNOSTIC", updatedAt: new Date() } as any).where(eq(ordresReparation.id, rapport.orId));
      await db.insert(orHistorique).values({
        orId: rapport.orId,
        type: "VALIDATION_DIAGNOSTIC",
        ancienneValeur: "EN_ATTENTE_VALIDATION_DIAGNOSTIC",
        nouvelleValeur: "EN_ATTENTE_DIAGNOSTIC",
        commentaire: `Diagnostic renvoyé : ${input.commentaire}`,
        changePar: Number(ctx.user.id),
      } as any);
      return { success: true };
    }),

  // ─── Devis : soumission + validation client (P2) ───
  soumettreDevis: requirePermissionProcedure("or.valider")
    .input(z.object({ orId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [or] = await db
        .select({ id: ordresReparation.id, statut: ordresReparation.statut })
        .from(ordresReparation)
        .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });
      const [rapport] = await db
        .select({ statut: orRapportsDiagnostic.statut })
        .from(orRapportsDiagnostic)
        .where(eq(orRapportsDiagnostic.orId, input.orId))
        .orderBy(sql`${orRapportsDiagnostic.id} DESC`)
        .limit(1);
      const lignes = await db.select().from(lignesOrdreReparation).where(eq(lignesOrdreReparation.ordreId, input.orId));
      if (!devisSoumissible(rapport?.statut ?? null, lignes)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le devis exige un diagnostic validé avec des lignes de préconisation." });
      }
      await db.update(ordresReparation).set({ statut: "EN_ATTENTE_VALIDATION", devisAccepte: false, updatedAt: new Date() } as any).where(eq(ordresReparation.id, input.orId));
      await db.insert(orHistorique).values({
        orId: input.orId,
        type: "VALIDATION_DEVIS",
        ancienneValeur: or.statut ?? null,
        nouvelleValeur: "EN_ATTENTE_VALIDATION",
        commentaire: "Devis soumis au client",
        changePar: Number(ctx.user.id),
      } as any);
      return { success: true };
    }),

  validerDevis: requirePermissionProcedure("or.valider")
    .input(z.object({ orId: z.number().int(), accepte: z.boolean(), motif: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [or] = await db
        .select({ id: ordresReparation.id, statut: ordresReparation.statut })
        .from(ordresReparation)
        .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });
      if (or.statut !== "EN_ATTENTE_VALIDATION") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le devis doit d'abord être soumis (statut EN_ATTENTE_VALIDATION)." });
      }
      if (input.accepte) {
        await db.update(ordresReparation).set({ devisAccepte: true, statut: "EN_COURS", updatedAt: new Date() } as any).where(eq(ordresReparation.id, input.orId));
        await db.insert(orHistorique).values({
          orId: input.orId,
          type: "VALIDATION_DEVIS",
          ancienneValeur: "EN_ATTENTE_VALIDATION",
          nouvelleValeur: "EN_COURS",
          commentaire: "Devis accepté par le client",
          changePar: Number(ctx.user.id),
        } as any);
      } else {
        if (!input.motif?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Le refus du devis exige un motif." });
        await db.insert(orHistorique).values({
          orId: input.orId,
          type: "VALIDATION_DEVIS",
          ancienneValeur: "EN_ATTENTE_VALIDATION",
          nouvelleValeur: "EN_ATTENTE_VALIDATION",
          commentaire: `Devis refusé par le client : ${input.motif}`,
          changePar: Number(ctx.user.id),
        } as any);
      }
      return { success: true, accepte: input.accepte };
    }),

  // ─── Demandes de pièces au magasin (P3) ───
  creerDemandePieces: requirePermissionProcedure("or.modifier")
    .input(z.object({
      orId: z.number().int(),
      lignes: z.array(z.object({ produitId: z.number().int(), quantite: z.number().positive(), prixEstime: z.number().optional(), note: z.string().optional() })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [or] = await tx
          .select({ id: ordresReparation.id, vehiculeId: ordresReparation.vehiculeId, numero: ordresReparation.numero })
          .from(ordresReparation)
          .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });
        const [active] = await tx
          .select({ id: orDemandesPieces.id })
          .from(orDemandesPieces)
          .where(and(eq(orDemandesPieces.orId, input.orId), sql`${orDemandesPieces.statut} IN ('EN_ATTENTE','PARTIELLE')`))
          .limit(1);
        if (active) throw new TRPCError({ code: "BAD_REQUEST", message: "Une demande est déjà en cours sur cet OR." });
        const [demande] = await tx
          .insert(orDemandesPieces)
          .values({ orId: input.orId, vehiculeId: or.vehiculeId, demandeurId: Number(ctx.user.id) ?? null, statut: "EN_ATTENTE" } as any)
          .returning();
        for (const l of input.lignes) {
          await tx.insert(orDemandesPiecesLignes).values({
            demandeId: demande.id,
            produitId: l.produitId,
            quantite: String(l.quantite),
            prixEstime: l.prixEstime != null ? String(l.prixEstime) : null,
            note: l.note ?? null,
          } as any);
        }
        await tx.insert(orHistorique).values({
          orId: input.orId,
          type: "DEMANDE_PIECES",
          nouvelleValeur: "EN_ATTENTE",
          commentaire: `Demande de pièces au magasin (${input.lignes.length} ligne(s))`,
          changePar: Number(ctx.user.id),
        } as any);
        return { demandeId: demande.id };
      }) as any;
    }),

  traiterDemandePieces: requirePermissionProcedure("or.pieces.servir")
    .input(z.object({
      demandeId: z.number().int(),
      actions: z.array(z.object({
        ligneId: z.number().int(),
        servir: z.boolean(),
        quantiteServie: z.number().positive().optional(),
        motifManquant: z.string().optional(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [demande] = await tx
          .select()
          .from(orDemandesPieces)
          .where(eq(orDemandesPieces.id, input.demandeId))
          .limit(1);
        if (!demande) throw new TRPCError({ code: "NOT_FOUND", message: "Demande introuvable." });
        if (demande.statut === "SERVIE" || demande.statut === "ANNULEE") {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Demande déjà ${demande.statut}.` });
        }
        const [or] = await tx
          .select({ id: ordresReparation.id, numero: ordresReparation.numero, vehiculeId: ordresReparation.vehiculeId })
          .from(ordresReparation)
          .where(eq(ordresReparation.id, demande.orId))
          .limit(1);

        const lignes = await tx.select().from(orDemandesPiecesLignes).where(eq(orDemandesPiecesLignes.demandeId, input.demandeId));
        for (const action of input.actions) {
          const ligne = lignes.find((l) => l.id === action.ligneId);
          if (!ligne) throw new TRPCError({ code: "BAD_REQUEST", message: "Ligne de demande introuvable." });
          if (action.servir) {
            const qte = action.quantiteServie ?? Number(ligne.quantite);
            if (qte > Number(ligne.quantite) - Number(ligne.quantiteServie)) {
              throw new TRPCError({ code: "BAD_REQUEST", message: `Quantité servie (${qte}) supérieure au restant demandé pour la ligne ${ligne.id}.` });
            }
            await sortirPourOR(tx as any, {
              produitId: ligne.produitId,
              agenceId: ctx.user.agenceId,
              quantite: qte,
              orId: demande.orId,
              vehiculeId: or?.vehiculeId ?? 0,
              numeroOR: or?.numero ?? String(demande.orId),
              motif: `Service demande #${demande.id}`,
              effectuePar: Number(ctx.user.id),
            });
            await tx.update(orDemandesPiecesLignes).set({ quantiteServie: String(Number(ligne.quantiteServie) + qte) } as any).where(eq(orDemandesPiecesLignes.id, ligne.id));
          } else {
            await tx.update(orDemandesPiecesLignes).set({ manquant: true, motifManquant: action.motifManquant ?? "Indisponible en stock" } as any).where(eq(orDemandesPiecesLignes.id, ligne.id));
          }
        }
        const maj = await tx.select().from(orDemandesPiecesLignes).where(eq(orDemandesPiecesLignes.demandeId, input.demandeId));
        const statut = statutDemandePieces(maj.map((l) => ({ quantite: Number(l.quantite), quantiteServie: Number(l.quantiteServie), manquant: !!l.manquant })));
        await tx.update(orDemandesPieces).set({ statut, traitePar: Number(ctx.user.id), traiteLe: new Date() } as any).where(eq(orDemandesPieces.id, input.demandeId));
        await tx.insert(orHistorique).values({
          orId: demande.orId,
          type: "DEMANDE_PIECES",
          ancienneValeur: demande.statut ?? null,
          nouvelleValeur: statut,
          commentaire: `Demande #${demande.id} traitée par le magasin → ${statut}`,
          changePar: Number(ctx.user.id),
        } as any);
        return { statut };
      }) as any;
    }),

  listerDemandesPieces: requirePermissionProcedure("or.consulter")
    .input(z.object({ orId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const demandes = await db
        .select({
          id: orDemandesPieces.id,
          orId: orDemandesPieces.orId,
          statut: orDemandesPieces.statut,
          demandeurId: orDemandesPieces.demandeurId,
          traiteLe: orDemandesPieces.traiteLe,
          motif: orDemandesPieces.motif,
          createdAt: orDemandesPieces.createdAt,
          demandeurNom: employes.nom,
          demandeurPrenom: employes.prenom,
        })
        .from(orDemandesPieces)
        .leftJoin(employes, eq(orDemandesPieces.demandeurId, employes.id))
        .where(eq(orDemandesPieces.orId, input.orId))
        .orderBy(desc(orDemandesPieces.createdAt));
      const lignes = await db
        .select({
          id: orDemandesPiecesLignes.id,
          demandeId: orDemandesPiecesLignes.demandeId,
          produitId: orDemandesPiecesLignes.produitId,
          quantite: orDemandesPiecesLignes.quantite,
          quantiteServie: orDemandesPiecesLignes.quantiteServie,
          prixEstime: orDemandesPiecesLignes.prixEstime,
          note: orDemandesPiecesLignes.note,
          manquant: orDemandesPiecesLignes.manquant,
          motifManquant: orDemandesPiecesLignes.motifManquant,
          titre: produits.titre,
          codeArticle: produits.codeArticle,
        })
        .from(orDemandesPiecesLignes)
        .leftJoin(produits, eq(orDemandesPiecesLignes.produitId, produits.id))
        .where(inArray(orDemandesPiecesLignes.demandeId, demandes.map((d) => d.id)));
      return demandes.map((d) => ({ ...d, lignes: lignes.filter((l) => l.demandeId === d.id) }));
    }),

  // ─── Commande fournisseur liée à l'OR (P4) ───
  creerCommandeFournisseur: requirePermissionProcedure("or.modifier")
    .input(z.object({
      orId: z.number().int(),
      fournisseurId: z.number().int(),
      lignes: z.array(z.object({ produitId: z.number().int(), quantite: z.number().positive(), prixUnitaire: z.number().min(0) })).min(1),
      livraisonAttendue: z.string().optional(),
      motif: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [or] = await tx
          .select({ id: ordresReparation.id, vehiculeId: ordresReparation.vehiculeId, numero: ordresReparation.numero })
          .from(ordresReparation)
          .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });
        const [fournisseur] = await tx.select({ id: fournisseurs.id, nom: fournisseurs.nom }).from(fournisseurs).where(eq(fournisseurs.id, input.fournisseurId)).limit(1);
        if (!fournisseur) throw new TRPCError({ code: "NOT_FOUND", message: "Fournisseur introuvable." });
        const [last] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(achats)
          .where(sql`${achats.reference} LIKE ${`BC-${new Date().getFullYear()}-%`}`);
        const reference = `BC-${new Date().getFullYear()}-${String((last?.n ?? 0) + 1).padStart(5, "0")}`;
        const [achat] = await tx
          .insert(achats)
          .values({
            fournisseurId: input.fournisseurId,
            agenceId: ctx.user.agenceId,
            reference,
            statut: "commande",
            orId: input.orId,
            vehiculeId: or.vehiculeId,
            demandeur: `OR ${or.numero}`,
            demandeurId: Number(ctx.user.id),
            livraisonAttendue: input.livraisonAttendue ?? null,
            motif: input.motif ?? `Pièces pour ${or.numero}`,
            priorite: "haute",
            creePar: Number(ctx.user.id),
          } as any)
          .returning();
        let total = 0;
        for (const l of input.lignes) {
          await tx.insert(achatsLignes).values({
            achatId: achat.id,
            produitId: l.produitId,
            orId: input.orId,
            quantite: l.quantite,
            prixUnitaire: String(l.prixUnitaire),
            totalLigne: String(l.quantite * l.prixUnitaire),
          } as any);
          total += l.quantite * l.prixUnitaire;
        }
        await tx.update(achats).set({ totalHT: String(total), totalTTC: String(total) } as any).where(eq(achats.id, achat.id));
        await tx.insert(orHistorique).values({
          orId: input.orId,
          type: "COMMANDE_FOURNISSEUR",
          nouvelleValeur: reference,
          commentaire: `Commande fournisseur ${fournisseur.nom} (${reference}) — ${input.lignes.length} ligne(s)`,
          changePar: Number(ctx.user.id),
        } as any);
        return { achatId: achat.id, reference };
      }) as any;
    }),

  listerCommandesFournisseur: requirePermissionProcedure("or.consulter")
    .input(z.object({ orId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: achats.id,
          reference: achats.reference,
          statut: achats.statut,
          livraisonAttendue: achats.livraisonAttendue,
          totalTTC: achats.totalTTC,
          createdAt: achats.createdAt,
          fournisseurNom: fournisseurs.nom,
        })
        .from(achats)
        .leftJoin(fournisseurs, eq(achats.fournisseurId, fournisseurs.id))
        .where(eq(achats.orId, input.orId))
        .orderBy(desc(achats.createdAt));
      return rows;
    }),

  // ─── Retour fournisseur (pièce défaillante / non conforme) (P5) ───
  creerRetourFournisseur: requirePermissionProcedure("or.pieces.servir")
    .input(z.object({
      orId: z.number().int(),
      achatId: z.number().int().optional(),
      fournisseurId: z.number().int().optional(),
      motif: z.enum(["DEFAILLANTE", "NON_CONFORME", "ERREUR_COMMANDE"]).default("DEFAILLANTE"),
      lignes: z.array(z.object({ produitId: z.number().int().optional(), libelle: z.string().optional(), quantite: z.number().positive(), note: z.string().optional() })).min(1),
      commentaire: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [or] = await db
        .select({ id: ordresReparation.id, numero: ordresReparation.numero })
        .from(ordresReparation)
        .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });
      const [row] = await db
        .insert(retoursFournisseur)
        .values({
          agenceId: ctx.user.agenceId,
          achatId: input.achatId ?? null,
          fournisseurId: input.fournisseurId ?? null,
          orId: input.orId,
          motif: input.motif,
          statut: "RETOURNE",
          dateRetour: new Date().toISOString().slice(0, 10),
          commentaire: input.commentaire ?? null,
          creePar: Number(ctx.user.id),
        } as any)
        .returning();
      for (const l of input.lignes) {
        await db.insert(retoursFournisseurLignes).values({
          retourId: row.id,
          produitId: l.produitId ?? null,
          libelle: l.libelle ?? null,
          quantite: String(l.quantite),
          note: l.note ?? null,
        } as any);
      }
      await db.insert(orHistorique).values({
        orId: input.orId,
        type: "RETOUR_FOURNISSEUR",
        nouvelleValeur: "RETOURNE",
        commentaire: `Retour fournisseur #${row.id} — ${input.motif}${input.commentaire ? ` : ${input.commentaire}` : ""}`,
        changePar: Number(ctx.user.id),
      } as any);
      return { retourId: row.id };
    }),

  enregistrerRemplacement: requirePermissionProcedure("or.pieces.servir")
    .input(z.object({ retourId: z.number().int(), commentaire: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [retour] = await db.select().from(retoursFournisseur).where(eq(retoursFournisseur.id, input.retourId)).limit(1);
      if (!retour) throw new TRPCError({ code: "NOT_FOUND", message: "Retour introuvable." });
      if (!transitionRetourFournisseurValide(retour.statut, "REMPLACE")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Impossible de remplacer un retour en statut ${retour.statut}.` });
      }
      await db.update(retoursFournisseur).set({ statut: "REMPLACE", commentaire: input.commentaire ?? retour.commentaire } as any).where(eq(retoursFournisseur.id, input.retourId));
      if (retour.orId) {
        await db.insert(orHistorique).values({
          orId: retour.orId,
          type: "RETOUR_FOURNISSEUR",
          ancienneValeur: "RETOURNE",
          nouvelleValeur: "REMPLACE",
          commentaire: `Pièce de remplacement reçue (retour #${retour.id})${input.commentaire ? ` — ${input.commentaire}` : ""}`,
          changePar: Number(ctx.user.id),
        } as any);
      }
      return { success: true, statut: "REMPLACE" };
    }),

  cloturerRetour: requirePermissionProcedure("or.pieces.servir")
    .input(z.object({ retourId: z.number().int(), commentaire: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [retour] = await db.select().from(retoursFournisseur).where(eq(retoursFournisseur.id, input.retourId)).limit(1);
      if (!retour) throw new TRPCError({ code: "NOT_FOUND", message: "Retour introuvable." });
      if (!transitionRetourFournisseurValide(retour.statut, "CLOTURE")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Impossible de clôturer un retour en statut ${retour.statut}.` });
      }
      await db.update(retoursFournisseur).set({ statut: "CLOTURE", commentaire: input.commentaire ?? retour.commentaire } as any).where(eq(retoursFournisseur.id, input.retourId));
      if (retour.orId) {
        await db.insert(orHistorique).values({
          orId: retour.orId,
          type: "RETOUR_FOURNISSEUR",
          ancienneValeur: retour.statut ?? null,
          nouvelleValeur: "CLOTURE",
          commentaire: `Retour fournisseur #${retour.id} clôturé`,
          changePar: Number(ctx.user.id),
        } as any);
      }
      return { success: true, statut: "CLOTURE" };
    }),

  listerRetoursFournisseur: requirePermissionProcedure("or.consulter")
    .input(z.object({ orId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const retours = await db
        .select({
          id: retoursFournisseur.id,
          achatId: retoursFournisseur.achatId,
          fournisseurId: retoursFournisseur.fournisseurId,
          motif: retoursFournisseur.motif,
          statut: retoursFournisseur.statut,
          dateRetour: retoursFournisseur.dateRetour,
          commentaire: retoursFournisseur.commentaire,
          createdAt: retoursFournisseur.createdAt,
          fournisseurNom: fournisseurs.nom,
        })
        .from(retoursFournisseur)
        .leftJoin(fournisseurs, eq(retoursFournisseur.fournisseurId, fournisseurs.id))
        .where(eq(retoursFournisseur.orId, input.orId))
        .orderBy(desc(retoursFournisseur.createdAt));
      const lignes = await db
        .select({
          id: retoursFournisseurLignes.id,
          retourId: retoursFournisseurLignes.retourId,
          produitId: retoursFournisseurLignes.produitId,
          libelle: retoursFournisseurLignes.libelle,
          quantite: retoursFournisseurLignes.quantite,
          note: retoursFournisseurLignes.note,
          titre: produits.titre,
        })
        .from(retoursFournisseurLignes)
        .leftJoin(produits, eq(retoursFournisseurLignes.produitId, produits.id))
        .where(inArray(retoursFournisseurLignes.retourId, retours.map((r) => r.id)));
      return retours.map((r) => ({ ...r, lignes: lignes.filter((l) => l.retourId === r.id) }));
    }),

  // ─── Paramètres du module (seuils, listes, texte accusé) ───
  getParametresAtelier: requirePermissionProcedure("or.consulter")
    .query(async ({ ctx }) => {
      const [p] = await db.select().from(atelierParametres).where(eq(atelierParametres.agenceId, ctx.user.agenceId)).limit(1);
      if (!p) return null;
      return {
        seuilPromesseJours: p.seuilPromesseJours ?? 1,
        seuilImmobilisationJours: p.seuilImmobilisationJours ?? 5,
        seuilBloqueJours: p.seuilBloqueJours ?? 3,
        emplacements: JSON.parse(p.emplacements ?? "[]") as string[],
        raisonsBlocage: JSON.parse(p.raisonsBlocage ?? "[]") as string[],
        texteAccuseReception: p.texteAccuseReception ?? "",
      };
    }),

  updateParametresAtelier: requirePermissionProcedure("or.modifier")
    .input(z.object({
      seuilPromesseJours: z.number().int().min(0).max(30).optional(),
      seuilImmobilisationJours: z.number().int().min(1).max(60).optional(),
      seuilBloqueJours: z.number().int().min(1).max(30).optional(),
      emplacements: z.array(z.string()).optional(),
      raisonsBlocage: z.array(z.string()).optional(),
      texteAccuseReception: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const values: Record<string, unknown> = { updatedAt: new Date() };
      if (input.seuilPromesseJours !== undefined) values.seuilPromesseJours = input.seuilPromesseJours;
      if (input.seuilImmobilisationJours !== undefined) values.seuilImmobilisationJours = input.seuilImmobilisationJours;
      if (input.seuilBloqueJours !== undefined) values.seuilBloqueJours = input.seuilBloqueJours;
      if (input.emplacements) values.emplacements = JSON.stringify(input.emplacements);
      if (input.raisonsBlocage) values.raisonsBlocage = JSON.stringify(input.raisonsBlocage);
      if (input.texteAccuseReception !== undefined) values.texteAccuseReception = input.texteAccuseReception;
      const [existing] = await db.select({ id: atelierParametres.id }).from(atelierParametres).where(eq(atelierParametres.agenceId, ctx.user.agenceId)).limit(1);
      if (existing) {
        await db.update(atelierParametres).set(values as any).where(eq(atelierParametres.id, existing.id));
      } else {
        await db.insert(atelierParametres).values({ agenceId: ctx.user.agenceId, ...values } as any);
      }
      return { success: true };
    }),

  // ─── Dashboard de pilotage du parc (KPIs + répartitions + alertes) ───
  getDashboard: requirePermissionProcedure("or.consulter")
    .query(async ({ ctx }) => {
      const [params] = await db.select().from(atelierParametres).where(eq(atelierParametres.agenceId, ctx.user.agenceId)).limit(1);
      const seuils = {
        seuilPromesseJours: params?.seuilPromesseJours ?? 1,
        seuilImmobilisationJours: params?.seuilImmobilisationJours ?? 5,
        seuilBloqueJours: params?.seuilBloqueJours ?? 3,
      };

      const rows = await db
        .select({
          id: ordresReparation.id,
          numero: ordresReparation.numero,
          statut: ordresReparation.statut,
          priorite: ordresReparation.priorite,
          plainte: ordresReparation.plainte,
          dateOuverture: ordresReparation.dateOuverture,
          datePromesse: ordresReparation.datePromesse,
          emplacement: ordresReparation.emplacement,
          raisonBlocage: ordresReparation.raisonBlocage,
          bloquePar: ordresReparation.bloquePar,
          responsableTechnicienId: ordresReparation.responsableTechnicienId,
          responsableNom: employes.nom,
          responsablePrenom: employes.prenom,
          venteId: ordresReparation.venteId,
          immatriculation: vehicules.immatriculation,
          marque: vehicules.marque,
          modele: vehicules.modele,
          clientId: clients.id,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientTelephone: clients.telephone,
          clientRaisonSociale: clients.raisonSociale,
          clientType: clients.typeClient,
          updatedAt: ordresReparation.updatedAt,
        })
        .from(ordresReparation)
        .innerJoin(vehicules, eq(ordresReparation.vehiculeId, vehicules.id))
        .leftJoin(clients, eq(ordresReparation.clientId, clients.id))
        .leftJoin(employes, eq(ordresReparation.responsableTechnicienId, employes.id))
        .where(eq(ordresReparation.agenceId, ctx.user.agenceId))
        .orderBy(desc(ordresReparation.dateOuverture));

      const parc = rows
        .filter((r) => r.statut !== "LIVRE" && r.statut !== "ANNULE")
        .map((r) => {
          const alerte = calculerAlertes({
            statut: r.statut,
            priorite: r.priorite,
            datePromesse: r.datePromesse,
            dateEntree: r.dateOuverture ?? new Date(),
            seuils,
          });
          return {
            ...r,
            joursImmobilisation: joursImmobilisation(r.dateOuverture ?? new Date()),
            retardJours: retardJours(r.datePromesse),
            alerte: alerte.principale,
            alertes: alerte.alertes,
            clientDisplay: r.clientRaisonSociale ?? `${r.clientPrenom ?? ""} ${r.clientNom ?? ""}`.trim(),
          };
        });

      const kpis = {
        totalParc: parc.length,
        p1Ouverts: parc.filter((p) => p.priorite === "P1").length,
        enRetard: parc.filter((p) => p.alerte === "RETARD").length,
        bloques: parc.filter((p) => p.statut === "BLOQUE").length,
        pretALivrer: parc.filter((p) => p.statut === "PRET_A_LIVRER").length,
      };

      const repPriorite = PRIORITES.map((p) => ({
        priorite: p,
        nombre: parc.filter((x) => x.priorite === p).length,
        pourcent: parc.length ? Math.round((parc.filter((x) => x.priorite === p).length / parc.length) * 1000) / 10 : 0,
      }));
      const repStatut = STATUTS_ATELIER.map((s) => ({
        statut: s,
        libelle: STATUT_LABELS[s],
        nombre: parc.filter((x) => x.statut === s).length,
      })).filter((s) => s.nombre > 0);
      const topAnciens = [...parc].sort((a, b) => b.joursImmobilisation - a.joursImmobilisation).slice(0, 5);

      return { kpis, repPriorite, repStatut, topAnciens, parc, seuils };
    }),

  // ─── Vue Alertes actives (retard, bloqués, P1, proches) ───
  getAlertes: requirePermissionProcedure("or.consulter")
    .query(async ({ ctx }) => {
      const [params] = await db.select().from(atelierParametres).where(eq(atelierParametres.agenceId, ctx.user.agenceId)).limit(1);
      const seuils = {
        seuilPromesseJours: params?.seuilPromesseJours ?? 1,
        seuilImmobilisationJours: params?.seuilImmobilisationJours ?? 5,
        seuilBloqueJours: params?.seuilBloqueJours ?? 3,
      };
      const rows = await db
        .select({
          id: ordresReparation.id,
          numero: ordresReparation.numero,
          statut: ordresReparation.statut,
          priorite: ordresReparation.priorite,
          dateOuverture: ordresReparation.dateOuverture,
          datePromesse: ordresReparation.datePromesse,
          raisonBlocage: ordresReparation.raisonBlocage,
          responsableNom: employes.nom,
          responsablePrenom: employes.prenom,
          immatriculation: vehicules.immatriculation,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientRaisonSociale: clients.raisonSociale,
          plainte: ordresReparation.plainte,
        })
        .from(ordresReparation)
        .innerJoin(vehicules, eq(ordresReparation.vehiculeId, vehicules.id))
        .leftJoin(clients, eq(ordresReparation.clientId, clients.id))
        .leftJoin(employes, eq(ordresReparation.responsableTechnicienId, employes.id))
        .where(and(eq(ordresReparation.agenceId, ctx.user.agenceId), sql`${ordresReparation.statut} NOT IN ('LIVRE','ANNULE')`));

      const enrichis = rows.map((r) => {
        const a = calculerAlertes({ statut: r.statut, priorite: r.priorite, datePromesse: r.datePromesse, dateEntree: r.dateOuverture ?? new Date(), seuils });
        return {
          ...r,
          joursImmobilisation: joursImmobilisation(r.dateOuverture ?? new Date()),
          retardJours: retardJours(r.datePromesse),
          alertes: a.alertes,
          principale: a.principale,
          clientDisplay: r.clientRaisonSociale ?? `${r.clientPrenom ?? ""} ${r.clientNom ?? ""}`.trim(),
        };
      });
      return {
        enRetard: enrichis.filter((x) => x.principale === "RETARD" || x.alertes.includes("RETARD")),
        bloques: enrichis.filter((x) => x.statut === "BLOQUE"),
        p1NonTermines: enrichis.filter((x) => x.priorite === "P1"),
        proches: enrichis.filter((x) => x.alertes.includes("PROCHE")),
      };
    }),

  // ─── Planning journalier (par technicien + charge 80 %) ───
  getPlanning: requirePermissionProcedure("or.consulter")
    .query(async ({ ctx }) => {
      const techniciens = await db
        .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom, fonction: employes.fonction })
        .from(employes)
        .where(and(eq(employes.agenceId, ctx.user.agenceId), eq(employes.statut, "actif")))
        .orderBy(employes.prenom);

      const ors = await db
        .select({
          id: ordresReparation.id,
          numero: ordresReparation.numero,
          statut: ordresReparation.statut,
          priorite: ordresReparation.priorite,
          datePromesse: ordresReparation.datePromesse,
          dateOuverture: ordresReparation.dateOuverture,
          raisonBlocage: ordresReparation.raisonBlocage,
          responsableTechnicienId: ordresReparation.responsableTechnicienId,
          immatriculation: vehicules.immatriculation,
          marque: vehicules.marque,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientRaisonSociale: clients.raisonSociale,
          plainte: ordresReparation.plainte,
        })
        .from(ordresReparation)
        .innerJoin(vehicules, eq(ordresReparation.vehiculeId, vehicules.id))
        .leftJoin(clients, eq(ordresReparation.clientId, clients.id))
        .where(and(eq(ordresReparation.agenceId, ctx.user.agenceId), sql`${ordresReparation.statut} NOT IN ('LIVRE','ANNULE')`))
        .orderBy(sql`CASE ${ordresReparation.priorite} WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END`);

      const parTechnicien = techniciens.map((t) => {
        const assignes = ors.filter((o) => o.responsableTechnicienId === t.id);
        return {
          technicien: t,
          vehicules: assignes,
          charge: { actifs: assignes.length, capacite: 5, pourcent: Math.round((assignes.length / 5) * 100), depassement80: assignes.length > 4 },
        };
      });
      const nonAssignes = ors.filter((o) => !o.responsableTechnicienId);
      return { parTechnicien, nonAssignes, totalParc: ors.length };
    }),

  // ─── Facturation du cycle : OR → Facture (vente liée + dette si crédit) ───
  facturer: requirePermissionProcedure("or.facturer")
    .input(z.object({
      id: z.number().int(),
      modePaiement: z.enum(MODES_PAIEMENT).default("especes"),
      montantPaye: z.number().min(0).optional(),
      remisePourcent: z.number().min(0).max(100).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [or] = await tx
          .select()
          .from(ordresReparation)
          .where(and(eq(ordresReparation.id, input.id), eq(ordresReparation.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "Ordre de réparation introuvable." });
        if (or.venteId) throw new TRPCError({ code: "BAD_REQUEST", message: "Cet OR est déjà facturé." });
        if (!STATUTS_FACTURABLES.includes(or.statut as any)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Seul un OR PRÊT À LIVRER / LIVRÉ / CONTRÔLE QUALITÉ peut être facturé (statut actuel : ${STATUT_LABELS[or.statut ?? ""] ?? or.statut}).` });
        }

        const lignes = await tx
          .select()
          .from(lignesOrdreReparation)
          .where(eq(lignesOrdreReparation.ordreId, input.id));
        if (lignes.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune ligne à facturer sur cet OR." });

        // Remise : contrat couvrant → remise du contrat ; sinon remise par défaut du client
        let remisePourcent = input.remisePourcent ?? 0;
        let delaiJours = 0;
        const [client] = or.clientId ? await tx.select({ remiseDefautPct: clients.remiseDefautPct, delaiPaiementJours: clients.delaiPaiementJours, plafondCredit: clients.plafondCredit }).from(clients).where(eq(clients.id, or.clientId)).limit(1) : [];
        if (or.contratId) {
          const [contrat] = await tx
            .select({ remisePourcent: contratsMaintenance.remisePourcent, delaiPaiementJours: contratsMaintenance.delaiPaiementJours })
            .from(contratsMaintenance)
            .where(eq(contratsMaintenance.id, or.contratId))
            .limit(1);
          if (contrat && remisePourcent === 0) remisePourcent = Number(contrat.remisePourcent ?? 0);
          if (contrat) delaiJours = Number(contrat.delaiPaiementJours ?? 0);
        } else if (client) {
          if (remisePourcent === 0) remisePourcent = Number(client.remiseDefautPct ?? 0);
          delaiJours = Number(client.delaiPaiementJours ?? 0);
        }

        const total = calculerTotalFacture(lignes as any[], remisePourcent);
        if (total <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Le montant de la facture est nul." });

        // Crédit : vérification du plafond
        if (input.modePaiement === "credit" && client) {
          const [encoursRow] = await tx
            .select({ n: sql<number>`COALESCE(SUM(${dettesClients.montantRestant}), 0)::int` })
            .from(dettesClients)
            .where(eq(dettesClients.clientId, or.clientId));
          if (!respectePlafondCredit(Number(encoursRow?.n ?? 0), total, client.plafondCredit ? Number(client.plafondCredit) : null)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Plafond de crédit dépassé pour ce client." });
          }
        }

        const [last] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(ventes)
          .where(sql`${ventes.reference} LIKE ${`FAC-${new Date().getFullYear()}-%`}`);
        const reference = genererReferenceFacture((last?.n ?? 0) + 1);
        const montantPaye = input.modePaiement === "credit" ? (input.montantPaye ?? 0) : (input.montantPaye ?? total);

        const [vente] = await tx
          .insert(ventes)
          .values({
            agenceId: ctx.user.agenceId,
            reference,
            operateurId: Number(ctx.user.id),
            clientId: or.clientId ?? null,
            sessionCaisseId: null,
            modePaiement: input.modePaiement,
            remise: String(remisePourcent > 0 ? Math.round((calculerTotalFacture(lignes as any[], 0) * remisePourcent) / 100) : 0),
            montantTotal: String(total),
            montantPaye: String(montantPaye),
            statut: "termine",
            notes: input.notes ?? `Facturation OR ${or.numero}`,
          } as any)
          .returning();

        for (const ligne of lignes) {
          await tx.insert(ventesLignes).values({
            venteId: vente.id,
            produitId: ligne.produitId ?? null,
            libelle: ligne.libelle,
            quantite: Number(ligne.quantite),
            prixUnitaire: String(Number(ligne.prixUnitaire) * (1 + Number(ligne.tva ?? 0) / 100)),
            totalLigne: String(montantLigne(ligne)),
          } as any);
        }

await tx
        .update(ordresReparation)
        .set({ venteId: vente.id, statut: "LIVRE", dateCloture: new Date(), updatedAt: new Date() } as any)
        .where(eq(ordresReparation.id, input.id));
      await tx.update(vehicules).set({ statutImmobilisation: "sorti", updatedAt: new Date() } as any).where(eq(vehicules.id, or.vehiculeId));

        // Crédit → dette client (encaissable via Finance → Créances)
        if (input.modePaiement === "credit" && montantPaye < total) {
          await tx.insert(dettesClients).values({
            venteId: vente.id,
            clientId: or.clientId ?? null,
            agenceId: ctx.user.agenceId,
            montantTotal: String(total),
            montantPaye: String(montantPaye),
            montantRestant: String(total - montantPaye),
            statut: montantPaye > 0 ? "partiel" : "impaye",
            echeanceLe: new Date(`${calculerEcheance(delaiJours)}T00:00:00`),
          } as any);
        }

        return { venteId: vente.id, reference, montantTotal: total, statut: "LIVRE" };
      }) as any;
    }),
});

async function recalculerTotaux(agenceId: number, ordreId: number) {
  const [or] = await db
    .select({
      totalPieces: sql<number>`COALESCE(SUM(CASE WHEN type='PIECE' THEN quantite*prix_unitaire*(1+tva/100) ELSE 0 END),0)`,
      totalMO: sql<number>`COALESCE(SUM(CASE WHEN type='SERVICE' THEN quantite*prix_unitaire*(1+tva/100) ELSE 0 END),0)`,
    })
    .from(lignesOrdreReparation)
    .where(eq(lignesOrdreReparation.ordreId, ordreId));
  const totalPieces = Number(or?.totalPieces ?? 0);
  const totalMO = Number(or?.totalMO ?? 0);
  await db
    .update(ordresReparation)
    .set({ totalPieces: String(totalPieces), totalMainOeuvre: String(totalMO), totalTTC: String(totalPieces + totalMO) } as any)
    .where(eq(ordresReparation.id, ordreId));
}
