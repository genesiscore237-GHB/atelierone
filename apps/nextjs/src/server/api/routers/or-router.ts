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
} from "@atelierone/db";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { tracerPieceClient, remettrePieceClient, listerPiecesClient as listerPiecesClientService } from "~/server/lib/piece-client-service";
import { calculerTotalFacture, calculerEcheance, respectePlafondCredit, genererReferenceFacture, MODES_PAIEMENT, montantLigne } from "~/server/lib/facturation-service";

/**
 * MODULE ORDRE DE RÉPARATION (OR) — specs GPJ / Architecture §3.2.
 * Cycle : réception → diagnostic → devis → validation → travaux → clôture.
 * Les sorties/retours de pièces liées à l'OR sont gérées dans le router stock
 * (stock.sortirPourOR / stock.retourAtelier).
 */

export const STATUTS_OR = ["ouvert", "en_cours", "attente_piece", "termine", "facture", "annule"] as const;

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
    }).optional())
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(ordresReparation.agenceId, ctx.user.agenceId)];
      if (safe.statut) conditions.push(eq(ordresReparation.statut, safe.statut));

      const rows = await db
        .select({
          id: ordresReparation.id,
          numero: ordresReparation.numero,
          statut: ordresReparation.statut,
          plainte: ordresReparation.plainte,
          dateOuverture: ordresReparation.dateOuverture,
          totalPieces: ordresReparation.totalPieces,
          totalMainOeuvre: ordresReparation.totalMainOeuvre,
          totalTTC: ordresReparation.totalTTC,
          immatriculation: vehicules.immatriculation,
          marque: vehicules.marque,
          modele: vehicules.modele,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
        })
        .from(ordresReparation)
        .innerJoin(vehicules, eq(ordresReparation.vehiculeId, vehicules.id))
        .leftJoin(clients, eq(ordresReparation.clientId, clients.id))
        .where(and(...conditions))
        .orderBy(desc(ordresReparation.dateOuverture))
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
              `${r.clientPrenom ?? ""} ${r.clientNom ?? ""}`.toLowerCase().includes(safe.search!.toLowerCase())
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
          plainte: ordresReparation.plainte,
          diagnostic: ordresReparation.diagnostic,
          devisAccepte: ordresReparation.devisAccepte,
          dateOuverture: ordresReparation.dateOuverture,
          dateFinPrevue: ordresReparation.dateFinPrevue,
          dateCloture: ordresReparation.dateCloture,
          totalPieces: ordresReparation.totalPieces,
          totalMainOeuvre: ordresReparation.totalMainOeuvre,
          totalTTC: ordresReparation.totalTTC,
          notes: ordresReparation.notes,
          immatriculation: vehicules.immatriculation,
          marque: vehicules.marque,
          modele: vehicules.modele,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
        })
        .from(ordresReparation)
        .innerJoin(vehicules, eq(ordresReparation.vehiculeId, vehicules.id))
        .leftJoin(clients, eq(ordresReparation.clientId, clients.id))
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
      return { ...or, lignes };
    }),

  create: requirePermissionProcedure("or.creer")
    .input(z.object({
      vehiculeId: z.number().int(),
      clientId: z.number().int().optional(),
      plainte: z.string().optional(),
      diagnostic: z.string().optional(),
      dateFinPrevue: z.string().optional(),
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
          dateFinPrevue: input.dateFinPrevue ?? null,
          notes: input.notes ?? null,
          creePar: Number(ctx.user.id),
          statut: "ouvert",
        } as any)
        .returning();

      // Le véhicule entre en réparation
      if (vehicule.statutImmobilisation !== "en_reparation") {
        await db
          .update(vehicules)
          .set({ statutImmobilisation: "en_reparation", updatedAt: new Date() } as any)
          .where(eq(vehicules.id, input.vehiculeId));
      }
      return row;
    }),

  update: requirePermissionProcedure("or.modifier")
    .input(z.object({
      id: z.number().int(),
      plainte: z.string().optional(),
      diagnostic: z.string().optional(),
      devisAccepte: z.boolean().optional(),
      statut: z.enum(STATUTS_OR).optional(),
      dateFinPrevue: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const values: any = { ...rest, updatedAt: new Date() };
      if (rest.statut === "termine") values.dateCloture = new Date();
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
        if (or.statut !== "termine") {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Seul un OR TERMINÉ peut être facturé (statut actuel : ${or.statut}).` });
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
          .set({ venteId: vente.id, statut: "facture", dateCloture: new Date(), updatedAt: new Date() } as any)
          .where(eq(ordresReparation.id, input.id));

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

        return { venteId: vente.id, reference, montantTotal: total, statut: "facture" };
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
