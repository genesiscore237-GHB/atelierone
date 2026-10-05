import { z } from "zod";
import { createTRPCRouter, protectedProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  ordresReparation,
  lignesOrdreReparation,
  interventionsTechniciens,
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
  orInspections,
  orInspectionPoints,
  orDevisVersions,
  orAutorisations,
  orControlesQualite,
  orRestitutions,
  retoursFournisseur,
  retoursFournisseurLignes,
  achats,
  achatsLignes,
  fournisseurs,
  atelierNotifications,
  stocks,
} from "@atelierone/db";
import { eq, and, desc, sql, gte, lte, asc, inArray, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { tracerPieceClient, remettrePieceClient, listerPiecesClient as listerPiecesClientService } from "~/server/lib/piece-client-service";
import { calculerTotalFacture, calculerEcheance, respectePlafondCredit, genererReferenceFacture, verrouillerSequenceFacture, MODES_PAIEMENT, montantLigne } from "~/server/lib/facturation-service";
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
import { genererCodeClient } from "~/server/lib/client-service";
import { sortirPourOR, enregistrerMouvement } from "~/server/lib/stock-engine";

/** E1 — notification atelier (helper interne). */
async function notifierAtelier(
  client: typeof db | any,
  params: { agenceId: number; orId?: number | null; type: string; titre: string; message?: string },
) {
  await client.insert(atelierNotifications).values({
    agenceId: params.agenceId,
    orId: params.orId ?? null,
    type: params.type,
    titre: params.titre,
    message: params.message ?? null,
    lu: false,
  } as any);
}

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

/** MVP : dossier fermé définitivement → plus aucune modification (diagnostic, devis, pièces, travaux, facture). */
const verifierDossierOuvert = async (orId: number, agenceId: number): Promise<void> => {
  const [or] = await db
    .select({ statut: ordresReparation.statut })
    .from(ordresReparation)
    .where(and(eq(ordresReparation.id, orId), eq(ordresReparation.agenceId, agenceId)))
    .limit(1);
  if (!or) throw new TRPCError({ code: "BAD_REQUEST", message: "Dossier introuvable." });
  if (or.statut === "ferme_definitif") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Dossier fermé définitivement : plus aucune modification n'est possible." });
  }
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

  // ─── Recherche de véhicules pour un nouvel OR ───
  // Recherche sur tous les véhicules actifs de l'agence (y compris sortis /
  // contentieux) : chaque résultat est qualifié côté serveur
  // (eligible + raison de refus + OR en cours éventuel).
  rechercheVehicules: requirePermissionProcedure("or.consulter")
    .input(
      z.object({
        search: z.string().optional(),
        typeVehicule: z.string().optional(),
        statutImmobilisation: z.string().optional(),
        limit: z.number().int().min(5).max(50).default(20),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [
        eq(vehicules.agenceId, ctx.user.agenceId),
        eq(vehicules.isActive, true),
      ];
      if (safe.typeVehicule) conditions.push(eq(vehicules.typeVehicule, safe.typeVehicule));
      if (safe.statutImmobilisation) conditions.push(eq(vehicules.statutImmobilisation, safe.statutImmobilisation));
      if (safe.search?.trim()) {
        const q = `%${safe.search.trim()}%`;
        conditions.push(
          or(
            ilike(vehicules.immatriculation, q),
            ilike(vehicules.marque, q),
            ilike(vehicules.modele, q),
            ilike(vehicules.numeroChassis, q),
            ilike(clients.nom, q),
            ilike(clients.prenom, q),
            ilike(clients.raisonSociale, q),
            ilike(clients.telephone, q),
          )!
        );
      }
      const rows = await db
        .select({
          id: vehicules.id,
          immatriculation: vehicules.immatriculation,
          marque: vehicules.marque,
          modele: vehicules.modele,
          annee: vehicules.annee,
          couleur: vehicules.couleur,
          kilometrage: vehicules.kilometrage,
          typeVehicule: vehicules.typeVehicule,
          statutImmobilisation: vehicules.statutImmobilisation,
          clientId: vehicules.clientId,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientRaisonSociale: clients.raisonSociale,
          clientTelephone: clients.telephone,
        })
        .from(vehicules)
        .leftJoin(clients, eq(vehicules.clientId, clients.id))
        .where(and(...conditions))
        .orderBy(asc(vehicules.immatriculation))
        .limit(safe.limit);

      // OR en cours (non clôturé) par véhicule : le plus récent si plusieurs
      const ids = rows.map((r) => r.id);
      const orsEnCours: Record<number, { id: number; numero: string; statut: string }> = {};
      if (ids.length > 0) {
        const orRows = await db
          .select({
            id: ordresReparation.id,
            numero: ordresReparation.numero,
            statut: ordresReparation.statut,
            vehiculeId: ordresReparation.vehiculeId,
            dateOuverture: ordresReparation.dateOuverture,
          })
          .from(ordresReparation)
          .where(and(
            inArray(ordresReparation.vehiculeId, ids),
            sql`${ordresReparation.statut} NOT IN ('LIVRE', 'ANNULE', 'CLOTURE')`,
          ))
          .orderBy(desc(ordresReparation.dateOuverture));
        for (const o of orRows) {
          if (!orsEnCours[o.vehiculeId]) {
            orsEnCours[o.vehiculeId] = { id: o.id, numero: o.numero, statut: o.statut };
          }
        }
      }

      const resultats = rows.map((r) => {
        const orEnCours = orsEnCours[r.id] ?? null;
        let eligible = true;
        let raison: string | null = null;
        if (r.statutImmobilisation === "sorti") {
          eligible = false;
          raison = "Ce véhicule a été rendu au client (statut « sorti ») — il ne peut pas être réceptionné.";
        } else if (r.statutImmobilisation === "abandonne_contentieux") {
          eligible = false;
          raison = "Ce véhicule est abandonné / en contentieux — il ne peut pas être réceptionné.";
        }
        return { ...r, orEnCours, eligible, raison };
      });
      // Tri : véhicules libres d'abord, puis avec OR en cours, puis non éligibles
      resultats.sort((a, b) => {
        const rankA = !a.eligible ? 2 : a.orEnCours ? 1 : 0;
        const rankB = !b.eligible ? 2 : b.orEnCours ? 1 : 0;
        return rankA - rankB || a.immatriculation.localeCompare(b.immatriculation, "fr");
      });
      return resultats;
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
          // Données de réception (fiche de réception + cycle de vie)
          typeIntervention: ordresReparation.typeIntervention,
          lieuDepannage: ordresReparation.lieuDepannage,
          dateReception: ordresReparation.dateReception,
          kilometrageEntree: ordresReparation.kilometrageEntree,
          kilometrageSortie: ordresReparation.kilometrageSortie,
          niveauCarburantEntree: ordresReparation.niveauCarburantEntree,
          pannesDeclarees: ordresReparation.pannesDeclarees,
          observationsReception: ordresReparation.observationsReception,
          receptionnisteId: ordresReparation.receptionnisteId,
          outillage: ordresReparation.outillage,
          signatureDeposant: ordresReparation.signatureDeposant,
          validationVerbale: ordresReparation.validationVerbale,
          totalFacture: ordresReparation.totalFacture,
          dateFermeture: ordresReparation.dateFermeture,
        })
        .from(ordresReparation)
        .innerJoin(vehicules, eq(ordresReparation.vehiculeId, vehicules.id))
        .leftJoin(clients, eq(ordresReparation.clientId, clients.id))
        .leftJoin(employes, eq(ordresReparation.responsableTechnicienId, employes.id))
        .where(and(eq(ordresReparation.id, input.id), eq(ordresReparation.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "Ordre de réparation introuvable." });

      // Référence FAC- de la vente liée (affichage sans ID numérique — P2-11)
      let venteReference: string | null = null;
      if (or.venteId) {
        const [vente] = await db.select({ reference: ventes.reference }).from(ventes).where(eq(ventes.id, or.venteId)).limit(1);
        venteReference = vente?.reference ?? null;
      }

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
          statutAutorisation: lignesOrdreReparation.statutAutorisation,
          origine: lignesOrdreReparation.origine,
          bloque: lignesOrdreReparation.bloque,
          raisonBlocageLigne: lignesOrdreReparation.raisonBlocageLigne,
          technicienId: lignesOrdreReparation.technicienId,
          dureeHeures: lignesOrdreReparation.dureeHeures,
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
        venteReference,
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
      // Performance & Qualité (specs V2)
      familleService: z.string().optional(),
      savOrigineOrId: z.number().int().optional(),
      motifRetourSAV: z.enum(["CONSIGNE_NON_RESPECTEE", "MALFACON", "DIAGNOSTIC_ERRONE", "PIECE_DEFAILLANTE", "AUTRE"]).optional(),
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
          familleService: input.familleService ?? null,
          savOrigineOrId: input.savOrigineOrId ?? null,
          motifRetourSAV: input.motifRetourSAV ?? null,
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
      const creationCommentaire = [
        `Réception ${input.motEntree} — ${input.plainte ?? "sans consigne"}`,
        input.savOrigineOrId ? `RETOUR SAV lié à l'OR #${input.savOrigineOrId} (${input.motifRetourSAV})` : null,
        input.datePromesse ? `promesse ${input.datePromesse}` : null,
      ].filter(Boolean).join(" · ");
      await db.insert(orHistorique).values({
        orId: row.id,
        type: "CREATION",
        nouvelleValeur: "EN_ATTENTE_DIAGNOSTIC",
        commentaire: creationCommentaire,
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

  // ─── Recherche unifiée réception (plaque, châssis, client, téléphone) ───
  rechercherReception: requirePermissionProcedure("or.consulter")
    .input(z.object({ q: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const q = input.q.trim();
      const like = `%${q}%`;
      const [vehs, clis] = await Promise.all([
        db
          .select({
            id: vehicules.id,
            immatriculation: vehicules.immatriculation,
            numeroChassis: vehicules.numeroChassis,
            marque: vehicules.marque,
            modele: vehicules.modele,
            version: vehicules.version,
            annee: vehicules.annee,
            couleur: vehicules.couleur,
            carburant: vehicules.carburant,
            typeVehicule: vehicules.typeVehicule,
            kilometrage: vehicules.kilometrage,
            clientId: vehicules.clientId,
            clientNom: clients.nom,
            clientPrenom: clients.prenom,
            clientTelephone: clients.telephone,
            chauffeurNom: vehicules.chauffeurNom,
            chauffeurTelephone: vehicules.chauffeurTelephone,
          })
          .from(vehicules)
          .leftJoin(clients, eq(vehicules.clientId, clients.id))
          .where(and(eq(vehicules.agenceId, ctx.user.agenceId), sql`(${vehicules.immatriculation} ILIKE ${like} OR ${vehicules.numeroChassis} ILIKE ${like} OR ${vehicules.marque} ILIKE ${like} OR ${vehicules.modele} ILIKE ${like} OR ${clients.nom} ILIKE ${like} OR ${clients.telephone} ILIKE ${like})`))
          .orderBy(vehicules.immatriculation)
          .limit(10),
        db
          .select({ id: clients.id, nom: clients.nom, prenom: clients.prenom, telephone: clients.telephone, email: clients.email, adresse: clients.adresse, ville: clients.ville })
          .from(clients)
          .where(and(eq(clients.agenceId, ctx.user.agenceId), sql`(${clients.nom} ILIKE ${like} OR ${clients.telephone} ILIKE ${like} OR ${clients.email} ILIKE ${like} OR ${clients.codeClient} ILIKE ${like})`))
          .orderBy(clients.nom)
          .limit(10),
      ]);
      return { vehicules: vehs, clients: clis };
    }),

  // ─── RÉCEPTION COMPLÈTE (MVP) : client + véhicule + dossier + check-list + photos en un flux ───
  receptionner: requirePermissionProcedure("or.modifier")
    .input(z.object({
      client: z.object({
        id: z.number().int().optional(),
        nom: z.string().min(1),
        prenom: z.string().optional(),
        telephone: z.string().optional(),
        email: z.string().optional(),
        adresse: z.string().optional(),
        ville: z.string().optional(),
      }),
      vehicule: z.object({
        id: z.number().int().optional(),
        immatriculation: z.string().min(1),
        numeroChassis: z.string().optional(),
        typeVehicule: z.string().default("voiture"),
        marque: z.string().optional(),
        modele: z.string().optional(),
        version: z.string().optional(),
        annee: z.number().int().optional(),
        couleur: z.string().optional(),
        carburant: z.string().optional(),
        kilometrage: z.number().int().optional(),
      }),
      chauffeur: z.object({ nom: z.string().optional(), telephone: z.string().optional() }).optional(),
      reception: z.object({
        dateReception: z.string().optional(),
        kilometrageEntree: z.number().int().min(0),
        niveauCarburantEntree: z.string().optional(),
        pannesDeclarees: z.string().min(1),
        observationsReception: z.string().optional(),
        motEntree: z.string().default("PANNE"),
        plainte: z.string().optional(),
        outillage: z.record(z.any()).optional(),
        photos: z.array(z.string()).optional(),
        signatureDeposant: z.string().optional(),
        validationVerbale: z.boolean().default(false),
        typeIntervention: z.string().default("ATELIER"),
        lieuDepannage: z.string().optional(),
        emplacement: z.string().optional(),
        clientAttendSurPlace: z.boolean().default(false),
        courtoisieDemandee: z.boolean().default(false),
        datePromesse: z.string().optional(),
        priorite: z.string().default("P3"),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const agenceId = ctx.user.agenceId;

        // 1. Client (existant ou créé à la volée)
        let clientId = input.client.id ?? null;
        if (clientId) {
          const [cli] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.agenceId, agenceId))).limit(1);
          if (!cli) throw new TRPCError({ code: "BAD_REQUEST", message: "Client introuvable." });
        } else {
          // Code client auto aligné sur la convention app (CLT-année-séquence) — P2-11
          const [lastCli] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(clients)
            .where(and(eq(clients.agenceId, agenceId), sql`${clients.codeClient} LIKE ${`CLT-${new Date().getFullYear()}-%`}`));
          const codeClient = genererCodeClient((lastCli?.n ?? 0) + 1);
          const [cli] = await tx.insert(clients).values({
            agenceId,
            nom: input.client.nom.trim(),
            prenom: input.client.prenom?.trim() || null,
            telephone: input.client.telephone?.trim() || null,
            email: input.client.email?.trim() || null,
            adresse: input.client.adresse?.trim() || null,
            ville: input.client.ville?.trim() || null,
            codeClient,
            typeClient: "PART",
            statut: "ACTIF",
          } as any).returning();
          clientId = cli.id;
        }

        // 2. Véhicule (existant → complété ; sinon créé) — toujours lié à un client
        let vehiculeId = input.vehicule.id ?? null;
        if (vehiculeId) {
          await tx.update(vehicules).set({
            clientId,
            chauffeurNom: input.chauffeur?.nom?.trim() ?? null,
            chauffeurTelephone: input.chauffeur?.telephone?.trim() ?? null,
            kilometrage: input.vehicule.kilometrage ?? undefined,
            updatedAt: new Date(),
          } as any).where(eq(vehicules.id, vehiculeId));
        } else {
          const [veh] = await tx.insert(vehicules).values({
            agenceId,
            clientId,
            immatriculation: input.vehicule.immatriculation.trim().toUpperCase(),
            numeroChassis: input.vehicule.numeroChassis?.trim() || null,
            typeVehicule: input.vehicule.typeVehicule,
            marque: input.vehicule.marque?.trim() || null,
            modele: input.vehicule.modele?.trim() || null,
            version: input.vehicule.version?.trim() || null,
            annee: input.vehicule.annee ?? null,
            couleur: input.vehicule.couleur?.trim() || null,
            carburant: input.vehicule.carburant || null,
            kilometrage: input.vehicule.kilometrage ?? null,
            chauffeurNom: input.chauffeur?.nom?.trim() || null,
            chauffeurTelephone: input.chauffeur?.telephone?.trim() || null,
            statutImmobilisation: "en_reception",
          } as any).returning();
          vehiculeId = veh.id;
        }

        // 3. Dossier d'intervention (OR) complet
        const numero = await genNumero(agenceId);
        const [or] = await tx.insert(ordresReparation).values({
          agenceId,
          numero,
          vehiculeId,
          clientId,
          plainte: input.reception.plainte ?? input.reception.pannesDeclarees,
          diagnostic: null,
          motEntree: input.reception.motEntree,
          priorite: input.reception.priorite,
          dateOuverture: new Date(),
          dateReception: input.reception.dateReception ? new Date(input.reception.dateReception) : new Date(),
          datePromesse: input.reception.datePromesse ?? null,
          emplacement: input.reception.emplacement ?? "Réception",
          kilometrageEntree: input.reception.kilometrageEntree,
          kilometrageSortie: null,
          niveauCarburantEntree: input.reception.niveauCarburantEntree ?? null,
          pannesDeclarees: input.reception.pannesDeclarees,
          observationsReception: input.reception.observationsReception ?? null,
          receptionnisteId: Number(ctx.user.id),
          outillage: input.reception.outillage ?? null,
          typeIntervention: input.reception.typeIntervention,
          lieuDepannage: input.reception.lieuDepannage ?? null,
          signatureDeposant: input.reception.signatureDeposant ?? null,
          validationVerbale: input.reception.validationVerbale,
          clientAttendSurPlace: input.reception.clientAttendSurPlace,
          courtoisieDemandee: input.reception.courtoisieDemandee,
          creePar: Number(ctx.user.id),
          statut: "EN_ATTENTE_DIAGNOSTIC",
        } as any).returning();

        // 4. Photos de réception
        if (input.reception.photos && input.reception.photos.length > 0) {
          for (const photo of input.reception.photos) {
            await tx.insert(orPhotos).values({ orId: or.id, photo, uploaderId: Number(ctx.user.id) } as any);
          }
        }

        // 5. Historique de réception (traçabilité)
        await tx.insert(orHistorique).values({
          orId: or.id,
          type: "RECEPTION",
          nouvelleValeur: "EN_ATTENTE_DIAGNOSTIC",
          commentaire: `Réception ${input.reception.typeIntervention}${input.reception.lieuDepannage ? ` (${input.reception.lieuDepannage})` : ""} — ${input.reception.pannesDeclarees}`,
          changePar: Number(ctx.user.id),
        } as any);

        // 6. Le véhicule entre en réparation
        await tx.update(vehicules).set({ statutImmobilisation: "en_reparation", updatedAt: new Date() } as any).where(eq(vehicules.id, vehiculeId));

        return { id: or.id, numero, vehiculeId, clientId };
      }) as any;
    }),

  // ─── FERMETURE DÉFINITIVE : gèle diagnostic, devis, pièces, travaux, facture ───
  fermerDefinitivement: requirePermissionProcedure("or.modifier")
    .input(z.object({ id: z.number().int(), motif: z.string().min(3).optional() }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [or] = await tx
          .select({ id: ordresReparation.id, numero: ordresReparation.numero, statut: ordresReparation.statut, vehiculeId: ordresReparation.vehiculeId, clientId: ordresReparation.clientId, totalTTC: ordresReparation.totalTTC, venteId: ordresReparation.venteId, totalFacture: ordresReparation.totalFacture, notes: ordresReparation.notes })
          .from(ordresReparation)
          .where(and(eq(ordresReparation.id, input.id), eq(ordresReparation.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "Dossier introuvable." });
        if (or.statut === "ferme_definitif") throw new TRPCError({ code: "BAD_REQUEST", message: "Ce dossier est déjà fermé définitivement." });

        // Aucune clôture d'un dossier incomplet : les contrôles reflètent l'état réel du dossier.
        // 1. Contrôle qualité validé (dernier contrôle)
        const [qc] = await tx
          .select({ resultat: orControlesQualite.resultat })
          .from(orControlesQualite)
          .where(eq(orControlesQualite.orId, input.id))
          .orderBy(desc(orControlesQualite.dateControle))
          .limit(1);
        const qcValide = qc?.resultat === "VALIDE";

        // 2. Restitution enregistrée (sortie physique réelle)
        const [restitution] = await tx
          .select({ id: orRestitutions.id, observations: orRestitutions.observations, motifNonRepare: orRestitutions.motifNonRepare })
          .from(orRestitutions)
          .where(eq(orRestitutions.orId, input.id))
          .orderBy(desc(orRestitutions.dateRestitution))
          .limit(1);
        if (!restitution) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune restitution enregistrée : la sortie physique du véhicule doit précéder la clôture définitive." });
        }
        const sortieExceptionnelle = !!(restitution.observations?.includes?.("Sortie exceptionnelle") ?? false);

        // 3. Facture émise
        const factureEmise = !!or.venteId || Number(or.totalFacture ?? 0) > 0;
        if (!factureEmise) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Intervention non facturée : facturez avant la clôture définitive." });
        }

        // 4. Situation financière réelle : solde = total facturé − payé
        let restantOR = 0;
        if (or.venteId) {
          const [vente] = await tx
            .select({ montantTotal: ventes.montantTotal, montantPaye: ventes.montantPaye })
            .from(ventes)
            .where(eq(ventes.id, or.venteId))
            .limit(1);
          if (vente) restantOR = Math.max(0, Number(vente.montantTotal ?? 0) - Number(vente.montantPaye ?? 0));
        }

        if (!sortieExceptionnelle && !qcValide) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Contrôle qualité non validé : la clôture définitive exige un QC validé (sauf sortie exceptionnelle tracée sur le dossier)." });
        }
        if (!sortieExceptionnelle && restantOR > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Facture non soldée (reste ${restantOR.toLocaleString("fr-FR")} F) : la clôture exige un solde réglé (sauf sortie exceptionnelle tracée).` });
        }

        await tx.update(ordresReparation).set({
          statut: "ferme_definitif",
          dateFermeture: new Date(),
          fermeDefinitivementPar: Number(ctx.user.id),
          notes: or.notes ? `${or.notes}\n[FERMETURE] ${input.motif ?? ""}` : `[FERMETURE] ${input.motif ?? ""}`,
          updatedAt: new Date(),
        } as any).where(eq(ordresReparation.id, or.id));
        await tx.insert(orHistorique).values({
          orId: or.id,
          type: "FERMETURE_DEFINITIVE",
          ancienneValeur: or.statut,
          nouvelleValeur: "ferme_definitif",
          commentaire: `${input.motif ?? "Fermeture définitive du dossier"}${sortieExceptionnelle ? ` — SORTIE EXCEPTIONNELLE ${restantOR > 0 ? `(reste dû ${restantOR.toLocaleString("fr-FR")} F, créance conservée active)` : ""}` : ""}`,
          changePar: Number(ctx.user.id),
        } as any);
        return { success: true, numero: or.numero };
      }) as any;
    }),

  // ─── DVI — Digital Vehicle Inspection (inspection multi-points, preuve visuelle) ───
  sauvegarderInspection: requirePermissionProcedure("or.modifier")
    .input(z.object({
      orId: z.number().int(),
      template: z.string().default("MULTI_POINTS"),
      titre: z.string().optional(),
      points: z.array(z.object({
        groupe: z.string().min(1),
        libelle: z.string().min(1),
        statut: z.enum(["OK", "SURVEILLER", "DEFECTUEUX", "URGENT", "NON_INSPECTE"]).default("NON_INSPECTE"),
        mesure: z.string().optional(),
        notes: z.string().optional(),
        photo: z.string().optional(),
        annotation: z.string().optional(),
        recommandation: z.string().optional(),
        priorite: z.enum(["IMMEDIATE", "PROCHE_VISITE", "CONSEIL"]).default("CONSEIL"),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        await verifierDossierOuvert(input.orId, ctx.user.agenceId);
        const [inspection] = await tx.insert(orInspections).values({
          orId: input.orId,
          template: input.template,
          titre: input.titre ?? "Inspection multi-points",
          statut: "BROUILLON",
          technicienId: Number(ctx.user.id),
        } as any).returning();
        for (const p of input.points) {
          await tx.insert(orInspectionPoints).values({
            inspectionId: inspection.id,
            groupe: p.groupe,
            libelle: p.libelle,
            statut: p.statut,
            mesure: p.mesure ?? null,
            notes: p.notes ?? null,
            photo: p.photo ?? null,
            annotation: p.annotation ?? null,
            recommandation: p.recommandation ?? null,
            priorite: p.priorite,
          } as any);
        }
        return { inspectionId: inspection.id };
      }) as any;
    }),

  envoyerInspection: requirePermissionProcedure("or.modifier")
    .input(z.object({ inspectionId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [inspection] = await db.select().from(orInspections).where(eq(orInspections.id, input.inspectionId)).limit(1);
      if (!inspection) throw new TRPCError({ code: "NOT_FOUND", message: "Inspection introuvable." });
      if (inspection.statut === "ENVOYE") throw new TRPCError({ code: "BAD_REQUEST", message: "Cette inspection est déjà envoyée (figée)." });
      await db.update(orInspections).set({ statut: "ENVOYE", envoyeeLe: new Date(), envoyeePar: Number(ctx.user.id) } as any).where(eq(orInspections.id, input.inspectionId));
      await db.insert(orHistorique).values({
        orId: inspection.orId,
        type: "DVI",
        nouvelleValeur: "ENVOYE",
        commentaire: `Inspection DVI envoyée (${inspection.titre})`,
        changePar: Number(ctx.user.id),
      } as any);
      return { success: true };
    }),

  listerInspections: requirePermissionProcedure("or.consulter")
    .input(z.object({ orId: z.number().int() }))
    .query(async ({ input }) => {
      const inspections = await db.select().from(orInspections).where(eq(orInspections.orId, input.orId)).orderBy(sql`${orInspections.id} DESC`);
      const ids = inspections.map((i) => i.id);
      const points = ids.length
        ? await db.select().from(orInspectionPoints).where(sql`${orInspectionPoints.inspectionId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`).orderBy(orInspectionPoints.id)
        : [];
      const parInspection = new Map<number, any[]>();
      for (const p of points) {
        const cur = parInspection.get(p.inspectionId) ?? [];
        cur.push(p);
        parInspection.set(p.inspectionId, cur);
      }
      return inspections.map((i) => ({ ...i, points: parInspection.get(i.id) ?? [] }));
    }),

  convertirPointsEnLignes: requirePermissionProcedure("or.modifier")
    .input(z.object({
      orId: z.number().int(),
      pointIds: z.array(z.number().int()).min(1),
      prixUnitaire: z.number().min(0).default(0),
      type: z.enum(["PIECE", "SERVICE", "FORFAIT", "SOUS_TRAITANCE", "CONSOMMABLE"]).default("SERVICE"),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        await verifierDossierOuvert(input.orId, ctx.user.agenceId);
        const points = await tx.select().from(orInspectionPoints).where(sql`${orInspectionPoints.id} IN (${sql.join(input.pointIds.map((i) => sql`${i}`), sql`, `)})`);
        for (const p of points) {
          await tx.insert(lignesOrdreReparation).values({
            ordreId: input.orId,
            type: input.type,
            libelle: `[DVI ${p.groupe}] ${p.libelle}`,
            quantite: "1",
            prixUnitaire: String(input.prixUnitaire),
            tva: "0",
            totalLigne: String(input.prixUnitaire),
            statut: "a_faire",
            statutAutorisation: "PROPOSE",
            origine: "DVI",
          } as any);
        }
        await tx.insert(orHistorique).values({
          orId: input.orId,
          type: "DVI",
          nouvelleValeur: "LIGNES",
          commentaire: `Conversion de ${points.length} point(s) DVI en lignes de devis`,
          changePar: Number(ctx.user.id),
        } as any);
        return { lignes: points.length };
      }) as any;
    }),

  // ─── Devis versionné + autorisation LIGNE PAR LIGNE (normes DMS) ───
  creerVersionDevis: requirePermissionProcedure("or.modifier")
    .input(z.object({ orId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        await verifierDossierOuvert(input.orId, ctx.user.agenceId);
        const lignes = await tx.select().from(lignesOrdreReparation).where(eq(lignesOrdreReparation.ordreId, input.orId));
        if (lignes.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune ligne à deviser." });
        const [dernier] = await tx.select({ v: sql<number>`COALESCE(MAX(${orDevisVersions.version}), 0)::int` }).from(orDevisVersions).where(eq(orDevisVersions.orId, input.orId));
        const version = (dernier?.v ?? 0) + 1;
        const total = calculerTotalFacture(lignes as any[], 0);
        const snapshot = lignes.map((l) => ({
          id: l.id,
          type: l.type,
          produitId: l.produitId ?? null,
          libelle: l.libelle,
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
          tva: l.tva,
          totalLigne: l.totalLigne ?? null,
          statutAutorisation: l.statutAutorisation,
          origine: l.origine ?? null,
          dureeHeures: l.dureeHeures ?? null,
        }));
        await tx.insert(orDevisVersions).values({
          orId: input.orId,
          version,
          montantHT: String(total),
          montantTTC: String(total),
          lignesSnapshot: snapshot,
          statut: "BROUILLON",
          creePar: Number(ctx.user.id),
        } as any);
        await tx.insert(orHistorique).values({
          orId: input.orId,
          type: "VALIDATION_DEVIS",
          nouvelleValeur: `v${version}`,
          commentaire: `Devis v${version} créé (${total} F)`,
          changePar: Number(ctx.user.id),
        } as any);
        return { version };
      }) as any;
    }),

  envoyerVersionDevis: requirePermissionProcedure("or.valider")
    .input(z.object({ devisVersionId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [v] = await db.select().from(orDevisVersions).where(eq(orDevisVersions.id, input.devisVersionId)).limit(1);
      if (!v) throw new TRPCError({ code: "NOT_FOUND", message: "Version introuvable." });
      if (v.statut === "ENVOYE") throw new TRPCError({ code: "BAD_REQUEST", message: "Cette version est déjà envoyée." });
      await db.update(orDevisVersions).set({ statut: "ENVOYE", envoyeLe: new Date(), envoyePar: Number(ctx.user.id) } as any).where(eq(orDevisVersions.id, input.devisVersionId));
      await db.update(ordresReparation).set({ statut: "EN_ATTENTE_VALIDATION", devisAccepte: false, updatedAt: new Date() } as any).where(eq(ordresReparation.id, v.orId));
      await db.insert(orHistorique).values({
        orId: v.orId,
        type: "VALIDATION_DEVIS",
        nouvelleValeur: "EN_ATTENTE_VALIDATION",
        commentaire: `Devis v${v.version} envoyé au client`,
        changePar: Number(ctx.user.id),
      } as any);
      return { success: true };
    }),

  autoriserLignes: requirePermissionProcedure("or.valider")
    .input(z.object({
      orId: z.number().int(),
      devisVersionId: z.number().int().optional(),
      lignes: z.array(z.object({
        ligneId: z.number().int(),
        statut: z.enum(["AUTORISE", "DECLINE", "REPORTE"]),
      })).min(1),
      methode: z.enum(["WEB", "SMS", "SIGNATURE", "ORAL", "EMAIL"]).default("ORAL"),
      qui: z.string().optional(),
      commentaire: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [or] = await tx.select({ id: ordresReparation.id, statut: ordresReparation.statut }).from(ordresReparation).where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId))).limit(1);
        if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });
        if (or.statut === "ferme_definitif") throw new TRPCError({ code: "BAD_REQUEST", message: "Dossier fermé définitivement." });

        let autorises = 0, declines = 0, reportes = 0;
        for (const l of input.lignes) {
          await tx.insert(orAutorisations).values({
            orId: input.orId,
            devisVersionId: input.devisVersionId ?? null,
            ligneId: l.ligneId,
            statut: l.statut,
            methode: input.methode,
            qui: input.qui ?? null,
            commentaire: input.commentaire ?? null,
            dateAutorisation: new Date(),
          } as any);
          const statutLigne = l.statut === "AUTORISE" ? "AUTORISE" : l.statut === "DECLINE" ? "DECLINE" : "REPORTE";
          await tx.update(lignesOrdreReparation).set({ statutAutorisation: statutLigne } as any).where(eq(lignesOrdreReparation.id, l.ligneId));
          if (l.statut === "AUTORISE") autorises++;
          if (l.statut === "DECLINE") declines++;
          if (l.statut === "REPORTE") reportes++;
        }

        // Statut de la version de devis
        if (input.devisVersionId) {
          const versionStatut = autorises > 0 && declines === 0 && reportes === 0 ? "AUTORISE_TOTAL" : autorises > 0 ? "AUTORISE_PARTIEL" : "REFUSE";
          await tx.update(orDevisVersions).set({ statut: versionStatut, dateAutorisation: new Date(), methodeAutorisation: input.methode } as any).where(eq(orDevisVersions.id, input.devisVersionId));
        }

        // Transition : au moins une ligne autorisée → EN_COURS ; sinon EN_ATTENTE_VALIDATION (refus)
        if (autorises > 0) {
          await tx.update(ordresReparation).set({ statut: "EN_COURS", devisAccepte: true, updatedAt: new Date() } as any).where(eq(ordresReparation.id, input.orId));
        }
        await tx.insert(orHistorique).values({
          orId: input.orId,
          type: "VALIDATION_DEVIS",
          ancienneValeur: or.statut ?? null,
          nouvelleValeur: autorises > 0 ? "EN_COURS" : "EN_ATTENTE_VALIDATION",
          commentaire: `Autorisation client (${input.methode}) : ${autorises} autorisée(s), ${declines} déclinée(s), ${reportes} reportée(s)${input.qui ? ` — ${input.qui}` : ""}`,
          changePar: Number(ctx.user.id),
        } as any);
        return { autorises, declines, reportes };
      }) as any;
    }),

  listerDevisVersions: requirePermissionProcedure("or.consulter")
    .input(z.object({ orId: z.number().int() }))
    .query(async ({ input }) => {
      return db.select().from(orDevisVersions).where(eq(orDevisVersions.orId, input.orId)).orderBy(desc(orDevisVersions.version));
    }),

  listerAutorisations: requirePermissionProcedure("or.consulter")
    .input(z.object({ orId: z.number().int() }))
    .query(async ({ input }) => {
      return db
        .select({
          id: orAutorisations.id,
          ligneId: orAutorisations.ligneId,
          libelle: lignesOrdreReparation.libelle,
          statut: orAutorisations.statut,
          methode: orAutorisations.methode,
          qui: orAutorisations.qui,
          commentaire: orAutorisations.commentaire,
          dateAutorisation: orAutorisations.dateAutorisation,
          devisVersionId: orAutorisations.devisVersionId,
          version: orDevisVersions.version,
        })
        .from(orAutorisations)
        .leftJoin(lignesOrdreReparation, eq(orAutorisations.ligneId, lignesOrdreReparation.id))
        .leftJoin(orDevisVersions, eq(orAutorisations.devisVersionId, orDevisVersions.id))
        .where(eq(orAutorisations.orId, input.orId))
        .orderBy(desc(orAutorisations.dateAutorisation));
    }),

  // ─── Contrôle qualité (checklist + essai routier) — normes DMS ───
  validerControleQualite: requirePermissionProcedure("or.modifier")
    .input(z.object({
      orId: z.number().int(),
      checklist: z.array(z.object({ libelle: z.string().min(1), ok: z.boolean() })).min(1),
      essaiRoutier: z.boolean().default(false),
      distanceEssai: z.string().optional(),
      observations: z.string().optional(),
      resultat: z.enum(["VALIDE", "REJETE"]),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        await verifierDossierOuvert(input.orId, ctx.user.agenceId);
        const [or] = await tx.select({ id: ordresReparation.id, statut: ordresReparation.statut }).from(ordresReparation).where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId))).limit(1);
        if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });
        const nonConformes = input.checklist.filter((c) => !c.ok);
        if (input.resultat === "VALIDE" && nonConformes.length > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Impossible de valider : ${nonConformes.length} point(s) non conforme(s).` });
        }
        await tx.insert(orControlesQualite).values({
          orId: input.orId,
          checklist: input.checklist,
          essaiRoutier: input.essaiRoutier,
          distanceEssai: input.distanceEssai ?? null,
          observations: input.observations ?? null,
          resultat: input.resultat,
          controlePar: Number(ctx.user.id),
          dateControle: new Date(),
        } as any);
        const nouveauStatut = input.resultat === "VALIDE" ? "PRET_A_LIVRER" : "EN_COURS";
        await tx.update(ordresReparation).set({ statut: nouveauStatut, updatedAt: new Date() } as any).where(eq(ordresReparation.id, input.orId));
        await tx.insert(orHistorique).values({
          orId: input.orId,
          type: "CONTROLE_QUALITE",
          ancienneValeur: or.statut ?? null,
          nouvelleValeur: nouveauStatut,
          commentaire: `Contrôle qualité ${input.resultat === "VALIDE" ? "validé" : "REJETÉ"}${input.essaiRoutier ? " (essai routier)" : ""}${input.observations ? ` — ${input.observations}` : ""}`,
          changePar: Number(ctx.user.id),
        } as any);
        return { success: true, nouveauStatut };
      }) as any;
    }),

  listerControlesQualite: requirePermissionProcedure("or.consulter")
    .input(z.object({ orId: z.number().int() }))
    .query(async ({ input }) => {
      return db.select().from(orControlesQualite).where(eq(orControlesQualite.orId, input.orId)).orderBy(desc(orControlesQualite.dateControle));
    }),

  // ─── Restitution (handover) — check-list de sortie + signature, y compris véhicule non réparé ───
  restituerVehicule: requirePermissionProcedure("or.modifier")
    .input(z.object({
      orId: z.number().int(),
      kilometrageSortie: z.number().int().min(0),
      niveauCarburantSortie: z.string().optional(),
      checklist: z.array(z.object({ libelle: z.string().min(1), ok: z.boolean(), observation: z.string().optional() })).min(1),
      recuperateurNom: z.string().min(2),
      signatureClient: z.string().min(2),
      observations: z.string().optional(),
      motifNonRepare: z.string().optional(), // REFUS_CLIENT | PIECES_INDISPONIBLES | ABANDON | AUTRE — si non/partiellement réparé
      travauxNonRealises: z.string().optional(),
      // Sortie exceptionnelle : véhicule qui sort malgré QC non validé, travaux non terminés ou facture non soldée.
      sortieExceptionnelle: z.boolean().optional(),
      motifException: z.string().optional(),
      commentaireException: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        await verifierDossierOuvert(input.orId, ctx.user.agenceId);
        const [or] = await tx
          .select({ id: ordresReparation.id, numero: ordresReparation.numero, statut: ordresReparation.statut, vehiculeId: ordresReparation.vehiculeId, clientId: ordresReparation.clientId, dateCloture: ordresReparation.dateCloture, totalFacture: ordresReparation.totalFacture, venteId: ordresReparation.venteId })
          .from(ordresReparation)
          .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });

        // (1) Véhicule identifié
        if (!or.vehiculeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucun véhicule associé à cet OR : restitution impossible." });

        // (2) Intervention identifiée : l'OR existe et est numéroté (contrôle implicite via numero).

        // Sortie exceptionnelle : véhicule non/partiellement réparé (motif réel) ou contrainte opérationnelle explicite.
        // Le motif "AUTRE" par défaut du formulaire n'est pas considéré comme une vraie exception.
        const motifExceptionTexte = (input.motifException ?? "").trim()
          || (input.motifNonRepare && input.motifNonRepare !== "AUTRE" ? input.motifNonRepare : "");
        const exceptionnelle = !!input.sortieExceptionnelle || !!motifExceptionTexte;

        // (6) Situation financière réelle : reste dû = total facturé − payé
        let restantOR = 0;
        if (or.venteId) {
          const [vente] = await tx
            .select({ montantTotal: ventes.montantTotal, montantPaye: ventes.montantPaye })
            .from(ventes)
            .where(eq(ventes.id, or.venteId))
            .limit(1);
          if (vente) restantOR = Math.max(0, Number(vente.montantTotal ?? 0) - Number(vente.montantPaye ?? 0));
        }

        if (exceptionnelle) {
          // Motif + commentaire obligatoires pour tracer la sortie exceptionnelle
          if (!motifExceptionTexte) throw new TRPCError({ code: "BAD_REQUEST", message: "Motif de sortie exceptionnelle obligatoire." });
          const commentaire = (input.commentaireException ?? input.observations ?? "").trim();
          if (commentaire.length < 3) throw new TRPCError({ code: "BAD_REQUEST", message: "Commentaire obligatoire pour justifier la sortie exceptionnelle." });
        } else {
          // Sortie ordinaire : travaux terminés + QC validé + facture émise + facture soldée
          if (or.statut !== "PRET_A_LIVRER") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Travaux non terminés (statut : ${STATUT_LABELS[or.statut ?? ""] ?? or.statut}). Passez par la sortie exceptionnelle (motif obligatoire) si le véhicule doit sortir ainsi.`,
            });
          }
          const [qc] = await tx
            .select({ resultat: orControlesQualite.resultat })
            .from(orControlesQualite)
            .where(eq(orControlesQualite.orId, input.orId))
            .orderBy(desc(orControlesQualite.dateControle))
            .limit(1);
          if ((qc?.resultat) !== "VALIDE") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Contrôle qualité non validé : sortie refusée (ou utilisez la sortie exceptionnelle tracée)." });
          }
          if (!or.venteId && Number(or.totalFacture ?? 0) <= 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Intervention non facturée : facturez d'abord (ou utilisez la sortie exceptionnelle tracée)." });
          }
          if (restantOR > 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Facture non soldée (reste ${restantOR.toLocaleString("fr-FR")} F) : encaissez le solde ou utilisez la sortie exceptionnelle tracée.` });
          }
        }

        // (9) signature récupérateur + (10) kilométrage + (11) carburant : vérifiés au niveau de l'input (champs requis).
        // (8) restitution enregistrée ci-dessous ; (7) documents : l'accusé de réception / dossier reste consultable.

        const infosException = exceptionnelle
          ? ` — SORTIE EXCEPTIONNELLE (motif : ${motifExceptionTexte}${restantOR > 0 ? ` — reste dû ${restantOR.toLocaleString("fr-FR")} F` : ""}${input.commentaireException ? ` — ${input.commentaireException}` : ""})`
          : "";

        await tx.insert(orRestitutions).values({
          orId: input.orId,
          kilometrageSortie: input.kilometrageSortie,
          niveauCarburantSortie: input.niveauCarburantSortie ?? null,
          checklist: input.checklist,
          recuperateurNom: input.recuperateurNom,
          signatureClient: input.signatureClient,
          observations: [input.observations ?? null, exceptionnelle ? `Sortie exceptionnelle — motif : ${motifExceptionTexte}${restantOR > 0 ? ` — reste dû ${restantOR.toLocaleString("fr-FR")} F` : ""}` : null].filter(Boolean).join(" — ") || null,
          motifNonRepare: input.motifNonRepare ?? null,
          travauxNonRealises: input.travauxNonRealises ?? null,
          restituePar: Number(ctx.user.id),
          dateRestitution: new Date(),
        } as any);
        await tx.update(ordresReparation).set({
          statut: "LIVRE",
          kilometrageSortie: input.kilometrageSortie,
          dateCloture: or.dateCloture ?? new Date(),
          updatedAt: new Date(),
        } as any).where(eq(ordresReparation.id, input.orId));
        await tx.update(vehicules).set({ statutImmobilisation: "sorti", kilometrage: input.kilometrageSortie, updatedAt: new Date() } as any).where(eq(vehicules.id, or.vehiculeId));
        await tx.insert(orHistorique).values({
          orId: input.orId,
          type: "RESTITUTION",
          ancienneValeur: or.statut ?? null,
          nouvelleValeur: "LIVRE",
          commentaire: `Véhicule restitué à ${input.recuperateurNom}${input.motifNonRepare ? ` — NON RÉPARÉ (${input.motifNonRepare})` : ""} — km sortie ${input.kilometrageSortie}${infosException}`,
          changePar: Number(ctx.user.id),
        } as any);
        return { success: true, exceptionnelle: exceptionnelle ? true : undefined };
      }) as any;
    }),

  listerRestitutions: requirePermissionProcedure("or.consulter")
    .input(z.object({ orId: z.number().int() }))
    .query(async ({ input }) => {
      return db.select().from(orRestitutions).where(eq(orRestitutions.orId, input.orId)).orderBy(desc(orRestitutions.dateRestitution));
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
      // ─── Réception (onglet 1) ───
      kilometrageEntree: z.number().int().min(0).optional(),
      niveauCarburantEntree: z.string().optional(),
      pannesDeclarees: z.string().optional(),
      observationsReception: z.string().optional(),
      outillage: z.record(z.any()).optional(),
      typeIntervention: z.string().optional(),
      lieuDepannage: z.string().nullable().optional(),
      clientAttendSurPlace: z.boolean().optional(),
      courtoisieDemandee: z.boolean().optional(),
      dateReception: z.string().optional(),
      signatureDeposant: z.string().nullable().optional(),
      validationVerbale: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, dateReception, ...rest } = input;
      const values: any = { ...rest, updatedAt: new Date() };
      if (dateReception) values.dateReception = new Date(dateReception);
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
      type: z.enum(["PIECE", "SERVICE", "FORFAIT", "SOUS_TRAITANCE", "CONSOMMABLE"]).default("PIECE"),
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
      await verifierDossierOuvert(input.ordreId, ctx.user.agenceId);

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
      bloque: z.boolean().optional(),
      raisonBlocageLigne: z.string().optional(),
      statutAutorisation: z.enum(["PROPOSE", "AUTORISE", "DECLINE", "REPORTE"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [ligne] = await db
        .select({ ordreId: lignesOrdreReparation.ordreId, libelle: lignesOrdreReparation.libelle })
        .from(lignesOrdreReparation)
        .where(eq(lignesOrdreReparation.id, id))
        .limit(1);
      if (!ligne) throw new TRPCError({ code: "BAD_REQUEST", message: "Ligne introuvable." });
      await verifierDossierOuvert(ligne.ordreId, ctx.user.agenceId);
      await db.update(lignesOrdreReparation).set(rest as any).where(eq(lignesOrdreReparation.id, id));
      // Audit : modification de ligne tracée (qui, quand, quoi)
      await db.insert(orHistorique).values({
        orId: ligne.ordreId,
        type: "LIGNE",
        commentaire: `Ligne modifiée : ${ligne.libelle} (${Object.keys(rest).join(", ")})`,
        changePar: Number(ctx.user.id),
      } as any);
      await recalculerTotaux(ctx.user.agenceId, ligne.ordreId);
      return { success: true };
    }),

  deleteLigne: requirePermissionProcedure("or.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [ligne] = await db
        .select({ ordreId: lignesOrdreReparation.ordreId, libelle: lignesOrdreReparation.libelle })
        .from(lignesOrdreReparation)
        .where(eq(lignesOrdreReparation.id, input.id))
        .limit(1);
      if (!ligne) throw new TRPCError({ code: "BAD_REQUEST", message: "Ligne introuvable." });
      await verifierDossierOuvert(ligne.ordreId, ctx.user.agenceId);
      await db.insert(orHistorique).values({
        orId: ligne.ordreId,
        type: "LIGNE",
        commentaire: `Ligne supprimée : ${ligne.libelle}`,
        changePar: Number(ctx.user.id),
      } as any);
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
      codesDTC: z.string().optional(),
      tests: z.string().optional(),
      lignes: z.array(z.object({
        type: z.enum(["PIECE", "SERVICE", "FORFAIT", "SOUS_TRAITANCE", "CONSOMMABLE"]).default("PIECE"),
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
          .values({ orId: input.orId, technicienId: Number(ctx.user.id) ?? null, constat: input.constat, cause: input.cause ?? null, codesDTC: input.codesDTC ?? null, tests: input.tests ?? null, statut: "SOUMIS", dateSoumission: new Date() } as any)
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
            origine: "DIAGNOSTIC",
            statutAutorisation: "PROPOSE",
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
        // E1 — notification : diagnostic à valider par le chef d'atelier
        await notifierAtelier(tx, {
          agenceId: ctx.user.agenceId,
          orId: input.orId,
          type: "DIAGNOSTIC_A_VALIDER",
          titre: `Diagnostic à valider — OR ${or.numero}`,
          message: `Constat : ${input.constat}`,
        });
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
        // E1 — notification si pièces manquantes (à commander)
        if (statut === "MANQUANTE") {
          await notifierAtelier(tx, {
            agenceId: ctx.user.agenceId,
            orId: demande.orId,
            type: "PIECE_MANQUANTE",
            titre: `Pièces manquantes — OR ${or?.numero ?? demande.orId}`,
            message: `Demande #${demande.id} en rupture : à commander auprès du fournisseur.`,
          });
        }
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
      demandeId: z.number().int().optional(),
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
            demandeId: input.demandeId ?? null,
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
        // E3 — la demande liée passe en attente d'approvisionnement (traçabilité commande ↔ demande)
        if (input.demandeId) {
          await tx.update(orDemandesPieces).set({ motif: `Commande ${reference} passée`, traitePar: Number(ctx.user.id), traiteLe: new Date() } as any).where(eq(orDemandesPieces.id, input.demandeId));
        }
        await tx.insert(orHistorique).values({
          orId: input.orId,
          type: "COMMANDE_FOURNISSEUR",
          nouvelleValeur: reference,
          commentaire: `Commande fournisseur ${fournisseur.nom} (${reference}) — ${input.lignes.length} ligne(s)`,
          changePar: Number(ctx.user.id),
        } as any);
        // E1 — notification : commande passée
        await notifierAtelier(tx, {
          agenceId: ctx.user.agenceId,
          orId: input.orId,
          type: "COMMANDE_PASSEE",
          titre: `Commande passée — ${reference}`,
          message: `${fournisseur.nom} · ${input.lignes.length} ligne(s)${input.livraisonAttendue ? ` · livraison attendue le ${input.livraisonAttendue}` : ""}`,
        });
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
      // E2 — la pièce défaillante est encore en stock (reçue non montée) : on la sort
      impacteStock: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [or] = await tx
          .select({ id: ordresReparation.id, numero: ordresReparation.numero, vehiculeId: ordresReparation.vehiculeId })
          .from(ordresReparation)
          .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });
        if (input.impacteStock) {
          for (const l of input.lignes) {
            if (!l.produitId) continue;
            // Type dédié RETOUR_FOURNISSEUR (annexe Statuts — specs V2)
            await enregistrerMouvement(tx as any, {
              type: "RETOUR_FOURNISSEUR" as any,
              sens: "S",
              produitId: l.produitId,
              agenceId: ctx.user.agenceId,
              quantite: l.quantite,
              orId: input.orId,
              vehiculeId: or.vehiculeId ?? 0,
              documentLie: `OR-${or.numero}`,
              motif: `Retour fournisseur (${input.motif})`,
              effectuePar: Number(ctx.user.id),
            });
          }
        }
        const [row] = await tx
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
          await tx.insert(retoursFournisseurLignes).values({
            retourId: row.id,
            produitId: l.produitId ?? null,
            libelle: l.libelle ?? null,
            quantite: String(l.quantite),
            note: l.note ?? null,
          } as any);
        }
        await tx.insert(orHistorique).values({
          orId: input.orId,
          type: "RETOUR_FOURNISSEUR",
          nouvelleValeur: "RETOURNE",
          commentaire: `Retour fournisseur #${row.id} — ${input.motif}${input.commentaire ? ` : ${input.commentaire}` : ""}`,
          changePar: Number(ctx.user.id),
        } as any);
        return { retourId: row.id };
      }) as any;
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
          vehiculeId: ordresReparation.vehiculeId,
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
          factureTransmiseLe: ordresReparation.factureTransmiseLe,
          attenteBonCommande: ordresReparation.attenteBonCommande,
          devisAccepte: ordresReparation.devisAccepte,
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

      const orIds = rows.map((r) => r.id);
      const orIdSet = orIds.length ? orIds : [-1];

      // Diagnostics (dernier rapport par OR)
      const rapports = await db
        .select({ orId: orRapportsDiagnostic.orId, id: orRapportsDiagnostic.id, statut: orRapportsDiagnostic.statut, constat: orRapportsDiagnostic.constat })
        .from(orRapportsDiagnostic)
        .where(inArray(orRapportsDiagnostic.orId, orIdSet))
        .orderBy(desc(orRapportsDiagnostic.id));
      const diagParOr = new Map<number, { statut: string; constat: string | null }>();
      for (const r of rapports) if (!diagParOr.has(r.orId)) diagParOr.set(r.orId, { statut: r.statut, constat: r.constat });

      // Interventions (techniciens + nb + heures)
      const interv = await db
        .select({
          ordreId: interventionsTechniciens.ordreId,
          technicienNom: employes.nom,
          technicienPrenom: employes.prenom,
          duree: interventionsTechniciens.dureeHeures,
        })
        .from(interventionsTechniciens)
        .leftJoin(employes, eq(interventionsTechniciens.technicienId, employes.id))
        .where(inArray(interventionsTechniciens.ordreId, orIdSet));
      const interParOr = new Map<number, { techniciens: string[]; nb: number; heures: number }>();
      for (const i of interv) {
        const cur = interParOr.get(i.ordreId) ?? { techniciens: [], nb: 0, heures: 0 };
        const nom = `${i.technicienPrenom ?? ""} ${i.technicienNom ?? ""}`.trim();
        if (nom && !cur.techniciens.includes(nom)) cur.techniciens.push(nom);
        cur.nb++;
        cur.heures += Number(i.duree ?? 0);
        interParOr.set(i.ordreId, cur);
      }

      // Demandes de pièces (statuts + lignes par OR)
      const demandes = await db
        .select({ id: orDemandesPieces.id, orId: orDemandesPieces.orId, statut: orDemandesPieces.statut })
        .from(orDemandesPieces)
        .where(inArray(orDemandesPieces.orId, orIdSet));
      const piecesParOr = new Map<number, { statuts: string[]; nbDemandes: number; enAttente: number; manquantes: number; servies: number }>();
      for (const d of demandes) {
        const cur = piecesParOr.get(d.orId) ?? { statuts: [], nbDemandes: 0, enAttente: 0, manquantes: 0, servies: 0 };
        cur.nbDemandes++;
        cur.statuts.push(d.statut);
        if (d.statut === "EN_ATTENTE" || d.statut === "PARTIELLE") cur.enAttente++;
        if (d.statut === "MANQUANTE") cur.manquantes++;
        if (d.statut === "SERVIE") cur.servies++;
        piecesParOr.set(d.orId, cur);
      }

      // Commandes fournisseur liées (BC)
      const cmds = await db
        .select({ orId: achats.orId, reference: achats.reference, statut: achats.statut })
        .from(achats)
        .where(and(sql`${achats.orId} IS NOT NULL`, inArray(achats.orId, orIdSet)));
      const bcParOr = new Map<number, string[]>();
      for (const c of cmds) {
        const cur = bcParOr.get(c.orId ?? 0) ?? [];
        cur.push(c.reference);
        bcParOr.set(c.orId ?? 0, cur);
      }

      // Factures des OR
      const venteIds = [...new Set(rows.map((r) => r.venteId).filter(Boolean))] as number[];
      const ventesMap = new Map<number, { reference: string; montantTotal: number; montantPaye: number }>();
      if (venteIds.length) {
        const vRows = await db
          .select({ id: ventes.id, reference: ventes.reference, montantTotal: ventes.montantTotal, montantPaye: ventes.montantPaye })
          .from(ventes)
          .where(inArray(ventes.id, venteIds));
        for (const v of vRows) ventesMap.set(v.id, { reference: v.reference, montantTotal: Number(v.montantTotal ?? 0), montantPaye: Number(v.montantPaye ?? 0) });
      }

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
          // État de facturation (logique alignée clients.getActivite)
          let factureEtat: string | null = null;
          let factureMontant: number | null = null;
          let factureReference: string | null = null;
          if (r.venteId && ventesMap.has(r.venteId)) {
            const v = ventesMap.get(r.venteId)!;
            factureMontant = v.montantTotal;
            factureReference = v.reference;
            if (v.montantPaye >= v.montantTotal && v.montantTotal > 0) factureEtat = "PAYEE";
            else if (v.montantPaye > 0) factureEtat = "AVANCE";
            else if (r.attenteBonCommande) factureEtat = "ATTENTE_BON_COMMANDE";
            else if (r.factureTransmiseLe) factureEtat = "ATTENTE_PAIEMENT";
            else factureEtat = "NON_TRANSMISE";
          } else if (r.statut === "PRET_A_LIVRER") {
            factureEtat = "A_FACTURER";
          }
          const diag = diagParOr.get(r.id);
          const inter = interParOr.get(r.id);
          const pieces = piecesParOr.get(r.id);
          return {
            ...r,
            joursImmobilisation: joursImmobilisation(r.dateOuverture ?? new Date()),
            retardJours: retardJours(r.datePromesse),
            alerte: alerte.principale,
            alertes: alerte.alertes,
            clientDisplay: r.clientRaisonSociale ?? `${r.clientPrenom ?? ""} ${r.clientNom ?? ""}`.trim(),
            diagnostic: diag ? { statut: diag.statut, constat: diag.constat ?? null } : null,
            devis: r.devisAccepte ? "ACCEPTE" : r.statut === "EN_ATTENTE_VALIDATION" ? "EN_ATTENTE" : null,
            techniciens: inter?.techniciens ?? [],
            interventions: inter ? { nb: inter.nb, heures: Math.round(inter.heures * 100) / 100 } : null,
            pieces: pieces
              ? { nbDemandes: pieces.nbDemandes, enAttente: pieces.enAttente, manquantes: pieces.manquantes, servies: pieces.servies, bc: bcParOr.get(r.id) ?? [] }
              : null,
            facture: factureEtat ? { etat: factureEtat, montant: factureMontant, reference: factureReference } : null,
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

  // ─── Pointages des interventions d'un OR ───
  listerPointages: requirePermissionProcedure("or.consulter")
    .input(z.object({ orId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: interventionsTechniciens.id,
          ordreId: interventionsTechniciens.ordreId,
          ligneId: interventionsTechniciens.ligneId,
          technicienId: interventionsTechniciens.technicienId,
          technicienNom: employes.nom,
          technicienPrenom: employes.prenom,
          dateIntervention: interventionsTechniciens.dateIntervention,
          heureDebut: interventionsTechniciens.heureDebut,
          heureFin: interventionsTechniciens.heureFin,
          dureeHeures: interventionsTechniciens.dureeHeures,
          description: interventionsTechniciens.description,
          ligneLibelle: lignesOrdreReparation.libelle,
        })
        .from(interventionsTechniciens)
        .leftJoin(employes, eq(interventionsTechniciens.technicienId, employes.id))
        .leftJoin(lignesOrdreReparation, eq(interventionsTechniciens.ligneId, lignesOrdreReparation.id))
        .where(and(eq(interventionsTechniciens.ordreId, input.orId), eq(interventionsTechniciens.agenceId, ctx.user.agenceId)))
        .orderBy(desc(interventionsTechniciens.heureDebut));
      return rows.map((r) => ({
        ...r,
        enCours: r.heureDebut != null && r.heureFin == null,
        duree: r.dureeHeures != null ? Number(r.dureeHeures) : r.heureDebut && r.heureFin ? Math.max(0.1, (new Date(r.heureFin).getTime() - new Date(r.heureDebut).getTime()) / 3600000) : null,
      }));
    }),

  // ─── Pointage d'une intervention technicien sur un OR ───
  pointageIntervention: requirePermissionProcedure("or.modifier")
    .input(z.object({
      orId: z.number().int(),
      technicienId: z.number().int(),
      dateIntervention: z.string(),
      dureeHeures: z.number().min(0).max(24).optional(),
      description: z.string().optional(),
      ligneId: z.number().int().optional(),
      heureFin: z.boolean().optional(), // timer : terminer le pointage en cours
    }))
    .mutation(async ({ ctx, input }) => {
      const [or] = await db
        .select({ id: ordresReparation.id })
        .from(ordresReparation)
        .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });
      if (input.heureFin) {
        // Timer : terminer le pointage en cours (heureFin = maintenant, durée calculée)
        const [open] = await db
          .select({ id: interventionsTechniciens.id, heureDebut: interventionsTechniciens.heureDebut })
          .from(interventionsTechniciens)
          .where(and(eq(interventionsTechniciens.ordreId, input.orId), eq(interventionsTechniciens.technicienId, input.technicienId), sql`${interventionsTechniciens.heureFin} IS NULL`))
          .orderBy(desc(interventionsTechniciens.id))
          .limit(1);
        if (!open) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucun pointage en cours pour ce technicien." });
        const duree = Math.max(0.1, (new Date().getTime() - new Date(open.heureDebut).getTime()) / 3600000);
        await db.update(interventionsTechniciens).set({ heureFin: new Date(), dureeHeures: String(Math.round(duree * 100) / 100) } as any).where(eq(interventionsTechniciens.id, open.id));
        await db.insert(orHistorique).values({
          orId: input.orId,
          type: "TEMPS",
          commentaire: `Pointage terminé — technicien ${input.technicienId} (${Math.round(duree * 100) / 100} h)`,
          changePar: Number(ctx.user.id),
        } as any);
        return { id: open.id, dureeHeures: Math.round(duree * 100) / 100 };
      }
      const [row] = await db
        .insert(interventionsTechniciens)
        .values({
          agenceId: ctx.user.agenceId,
          ordreId: input.orId,
          ligneId: input.ligneId ?? null,
          technicienId: input.technicienId,
          dateIntervention: input.dateIntervention,
          dureeHeures: input.dureeHeures != null ? String(input.dureeHeures) : null,
          description: input.description ?? null,
          heureDebut: new Date(),
        } as any)
        .returning();
      await db.insert(orHistorique).values({
        orId: input.orId,
        type: "TEMPS",
        commentaire: `Pointage démarré — technicien ${input.technicienId}${input.ligneId ? ` (ligne #${input.ligneId})` : ""}${input.description ? ` — ${input.description}` : ""}`,
        changePar: Number(ctx.user.id),
      } as any);
      return row;
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
        if (or.statut === "ferme_definitif") throw new TRPCError({ code: "BAD_REQUEST", message: "Dossier fermé définitivement : la facturation est figée (un avoir serait nécessaire)." });
        if (!STATUTS_FACTURABLES.includes(or.statut as any)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Seul un OR PRÊT À LIVRER / LIVRÉ / CONTRÔLE QUALITÉ peut être facturé (statut actuel : ${STATUT_LABELS[or.statut ?? ""] ?? or.statut}).` });
        }

        const lignes = await tx
          .select()
          .from(lignesOrdreReparation)
          .where(eq(lignesOrdreReparation.ordreId, input.id));
        if (lignes.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune ligne à facturer sur cet OR." });

        // Facturation cumulative : on facture le RESTANT (total actuel − déjà facturé)
        const dejaFacture = Number(or.totalFacture ?? 0);

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

        const totalComplet = calculerTotalFacture(lignes as any[], remisePourcent);
        const restant = totalComplet - dejaFacture;
        if (restant <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Cet OR est déjà entièrement facturé." });

        // Crédit : vérification du plafond (sur le montant à facturer)
        if (input.modePaiement === "credit" && client) {
          const [encoursRow] = await tx
            .select({ n: sql<number>`COALESCE(SUM(${dettesClients.montantRestant}), 0)::int` })
            .from(dettesClients)
            .where(eq(dettesClients.clientId, or.clientId));
          if (!respectePlafondCredit(Number(encoursRow?.n ?? 0), restant, client.plafondCredit ? Number(client.plafondCredit) : null)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Plafond de crédit dépassé pour ce client." });
          }
        }

        // Verrou anti-doublon FAC- : sérialise le comptage dans la transaction (P2-11).
        await verrouillerSequenceFacture(tx, ctx.user.agenceId);

        const [last] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(ventes)
          .where(sql`${ventes.reference} LIKE ${`FAC-${new Date().getFullYear()}-%`}`);
        const reference = genererReferenceFacture((last?.n ?? 0) + 1);
        const montantPaye = input.modePaiement === "credit" ? (input.montantPaye ?? 0) : (input.montantPaye ?? restant);

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
            montantTotal: String(restant),
            montantPaye: String(montantPaye),
            statut: "termine",
            notes: input.notes ?? `Facturation OR ${or.numero}${dejaFacture > 0 ? ` (complément — reste à facturer ${restant} F)` : ""}`,
          } as any)
          .returning();

        if (dejaFacture === 0) {
          // Première facture : toutes les lignes
          for (const ligne of lignes) {
            let coutUnitaire: string | null = null;
            if (ligne.produitId) {
              const [cmpRow] = await tx
                .select({ cmup: stocks.coutUnitaireMoyen })
                .from(stocks)
                .where(and(eq(stocks.produitId, ligne.produitId), eq(stocks.agenceId, ctx.user.agenceId)))
                .limit(1);
              coutUnitaire = cmpRow?.cmup != null ? String(Number(cmpRow.cmup)) : null;
            }
            await tx.insert(ventesLignes).values({
              venteId: vente.id,
              produitId: ligne.produitId ?? null,
              libelle: ligne.libelle,
              quantite: Number(ligne.quantite),
              prixUnitaire: String(Number(ligne.prixUnitaire) * (1 + Number(ligne.tva ?? 0) / 100)),
              totalLigne: String(montantLigne(ligne)),
              coutUnitaire,
            } as any);
          }
        } else {
          // Complément de facturation : ligne synthétique du restant
          await tx.insert(ventesLignes).values({
            venteId: vente.id,
            produitId: null,
            libelle: `Complément de facturation OR ${or.numero} (lignes ajoutées / ajustées)`,
            quantite: 1,
            prixUnitaire: String(restant),
            totalLigne: String(restant),
            coutUnitaire: null,
          } as any);
        }

        await tx
          .update(ordresReparation)
          .set({
            venteId: or.venteId ?? vente.id,
            totalFacture: String(dejaFacture + restant),
            updatedAt: new Date(),
          } as any)
          .where(eq(ordresReparation.id, input.id));

        // Crédit → dette client (encaissable via Finance → Créances)
        if (input.modePaiement === "credit" && montantPaye < restant) {
          await tx.insert(dettesClients).values({
            venteId: vente.id,
            clientId: or.clientId ?? null,
            agenceId: ctx.user.agenceId,
            montantTotal: String(restant),
            montantPaye: String(montantPaye),
            montantRestant: String(restant - montantPaye),
            statut: montantPaye > 0 ? "partiel" : "impaye",
            echeanceLe: new Date(`${calculerEcheance(delaiJours)}T00:00:00`),
          } as any);
        }

        return { venteId: vente.id, reference, montantTotal: restant, statut: or.statut, resteAFacturer: totalComplet - (dejaFacture + restant) };
      }) as any;
    }),

  // ─── Facturation CUMULATIVE (MVP) : plusieurs OR du même client sur une facture ───
  facturerGroupe: requirePermissionProcedure("or.facturer")
    .input(z.object({
      orIds: z.array(z.number().int()).min(1),
      modePaiement: z.enum(MODES_PAIEMENT).default("especes"),
      montantPaye: z.number().min(0).optional(),
      remisePourcent: z.number().min(0).max(100).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const ors = await tx
          .select()
          .from(ordresReparation)
          .where(and(inArray(ordresReparation.id, input.orIds), eq(ordresReparation.agenceId, ctx.user.agenceId)));
        if (ors.length !== input.orIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Un des dossiers est introuvable." });
        const clientsIds = new Set(ors.map((o) => o.clientId).filter(Boolean));
        if (clientsIds.size > 1) throw new TRPCError({ code: "BAD_REQUEST", message: "La facture groupée exige des dossiers du MÊME client." });
        for (const o of ors) {
          if (o.statut === "ferme_definitif") throw new TRPCError({ code: "BAD_REQUEST", message: `Le dossier ${o.numero} est fermé définitivement.` });
          if (!STATUTS_FACTURABLES.includes(o.statut as any)) throw new TRPCError({ code: "BAD_REQUEST", message: `Le dossier ${o.numero} n'est pas facturable (${o.statut}).` });
        }

        const clientId = ors[0]?.clientId ?? null;
        let remisePourcent = input.remisePourcent ?? 0;
        let delaiJours = 0;
        const [client] = clientId ? await tx.select({ remiseDefautPct: clients.remiseDefautPct, delaiPaiementJours: clients.delaiPaiementJours, plafondCredit: clients.plafondCredit }).from(clients).where(eq(clients.id, clientId)).limit(1) : [];
        if (client && remisePourcent === 0) remisePourcent = Number(client.remiseDefautPct ?? 0);
        if (client) delaiJours = Number(client.delaiPaiementJours ?? 0);

        // Lignes groupées avec sous-total par OR (facturation cumulative et distinguée)
        const lignesGroupes: { orId: number; numero: string; lignes: any[]; total: number }[] = [];
        let totalGroupe = 0;
        for (const o of ors) {
          if (Number(o.totalFacture ?? 0) > 0) continue; // déjà facturé → exclu du groupe
          const lignes = await tx.select().from(lignesOrdreReparation).where(eq(lignesOrdreReparation.ordreId, o.id));
          const totalOr = calculerTotalFacture(lignes as any[], 0);
          if (totalOr <= 0) continue;
          lignesGroupes.push({ orId: o.id, numero: o.numero, lignes, total: totalOr });
          totalGroupe += totalOr;
        }
        if (totalGroupe <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Aucun montant à facturer (dossiers déjà facturés)." });
        const totalAvecRemise = Math.round(totalGroupe * (1 - remisePourcent / 100));

        // Verrou anti-doublon FAC- : sérialise le comptage dans la transaction (P2-11).
        await verrouillerSequenceFacture(tx, ctx.user.agenceId);

        const [last] = await tx.select({ n: sql<number>`count(*)::int` }).from(ventes).where(sql`${ventes.reference} LIKE ${`FAC-${new Date().getFullYear()}-%`}`);
        const reference = genererReferenceFacture((last?.n ?? 0) + 1);
        const montantPaye = input.modePaiement === "credit" ? (input.montantPaye ?? 0) : (input.montantPaye ?? totalAvecRemise);

        if (input.modePaiement === "credit" && client) {
          const [encoursRow] = await tx.select({ n: sql<number>`COALESCE(SUM(${dettesClients.montantRestant}), 0)::int` }).from(dettesClients).where(eq(dettesClients.clientId, clientId));
          if (!respectePlafondCredit(Number(encoursRow?.n ?? 0), totalAvecRemise, client.plafondCredit ? Number(client.plafondCredit) : null)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Plafond de crédit dépassé pour ce client." });
          }
        }

        const [vente] = await tx.insert(ventes).values({
          agenceId: ctx.user.agenceId,
          reference,
          operateurId: Number(ctx.user.id),
          clientId,
          sessionCaisseId: null,
          modePaiement: input.modePaiement,
          remise: String(remisePourcent > 0 ? Math.round(totalGroupe * remisePourcent / 100) : 0),
          montantTotal: String(totalAvecRemise),
          montantPaye: String(montantPaye),
          statut: "termine",
          notes: input.notes ?? `Facture groupée — ${ors.map((o) => o.numero).join(", ")}`,
        } as any).returning();

        for (const g of lignesGroupes) {
          // Sous-total par OR dans les lignes (facturation cumulative et distinguée)
          await tx.insert(ventesLignes).values({
            venteId: vente.id,
            produitId: null,
            libelle: `═ ${g.numero} — TOTAL INTERVENTION`,
            quantite: 1,
            prixUnitaire: String(g.total),
            totalLigne: String(g.total),
            coutUnitaire: null,
          } as any);
          for (const ligne of g.lignes) {
            await tx.insert(ventesLignes).values({
              venteId: vente.id,
              produitId: ligne.produitId ?? null,
              libelle: `${g.numero} · ${ligne.libelle}`,
              quantite: Number(ligne.quantite),
              prixUnitaire: String(Number(ligne.prixUnitaire) * (1 + Number(ligne.tva ?? 0) / 100)),
              totalLigne: String(montantLigne(ligne)),
              coutUnitaire: null,
            } as any);
          }
          await tx.update(ordresReparation).set({
            venteId: vente.id,
            totalFacture: String(g.total),
            updatedAt: new Date(),
          } as any).where(eq(ordresReparation.id, g.orId));
        }

        if (input.modePaiement === "credit" && montantPaye < totalAvecRemise) {
          await tx.insert(dettesClients).values({
            venteId: vente.id,
            clientId,
            agenceId: ctx.user.agenceId,
            montantTotal: String(totalAvecRemise),
            montantPaye: String(montantPaye),
            montantRestant: String(totalAvecRemise - montantPaye),
            statut: montantPaye > 0 ? "partiel" : "impaye",
            echeanceLe: new Date(`${calculerEcheance(delaiJours)}T00:00:00`),
          } as any);
        }

        return { venteId: vente.id, reference, montantTotal: totalAvecRemise, ors: ors.length };
      }) as any;
    }),

  // ─── E4 — Marge par OR : revenu facturé − coût des pièces (CMP) ───
  getMargeOr: requirePermissionProcedure("or.consulter")
    .input(z.object({ orId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [or] = await db
        .select({ id: ordresReparation.id, venteId: ordresReparation.venteId, numero: ordresReparation.numero })
        .from(ordresReparation)
        .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });
      if (!or.venteId) return { facture: false as const };

      const lignes = await db
        .select({
          libelle: ventesLignes.libelle,
          produitId: ventesLignes.produitId,
          quantite: ventesLignes.quantite,
          totalLigne: ventesLignes.totalLigne,
          coutUnitaire: ventesLignes.coutUnitaire,
        })
        .from(ventesLignes)
        .where(eq(ventesLignes.venteId, or.venteId));

      let revenu = 0;
      let coutPieces = 0;
      const details = lignes.map((l) => {
        const total = Number(l.totalLigne ?? 0);
        const cout = l.coutUnitaire != null ? Number(l.coutUnitaire) * Number(l.quantite) : null;
        revenu += total;
        if (cout != null) coutPieces += cout;
        return { libelle: l.libelle ?? `#${l.produitId}`, revenu: total, coutPieces: cout ?? 0, marge: cout != null ? Math.round((total - cout) * 100) / 100 : null };
      });
      const marge = Math.round((revenu - coutPieces) * 100) / 100;
      const pourcentMarge = revenu > 0 ? Math.round((marge / revenu) * 1000) / 10 : null;
      return { facture: true as const, revenu: Math.round(revenu * 100) / 100, coutPieces: Math.round(coutPieces * 100) / 100, marge, pourcentMarge, lignes: details };
    }),

  // ─── E5 — Accusé de réception client (texte rempli + lien WhatsApp cliquable) ───
  accuseReception: requirePermissionProcedure("or.consulter")
    .input(z.object({ orId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [or] = await db
        .select({
          numero: ordresReparation.numero,
          datePromesse: ordresReparation.datePromesse,
          immatriculation: vehicules.immatriculation,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientTelephone: clients.telephone,
        })
        .from(ordresReparation)
        .innerJoin(vehicules, eq(ordresReparation.vehiculeId, vehicules.id))
        .leftJoin(clients, eq(ordresReparation.clientId, clients.id))
        .where(and(eq(ordresReparation.id, input.orId), eq(ordresReparation.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!or) throw new TRPCError({ code: "NOT_FOUND", message: "OR introuvable." });

      const [p] = await db.select().from(atelierParametres).where(eq(atelierParametres.agenceId, ctx.user.agenceId)).limit(1);
      const modele = p?.texteAccuseReception ?? "Nous accusons réception de votre véhicule {IMMATRICULATION} sous l'ordre {OR}. Restitution promise : {PROMESSE}.";
      const promesse = or.datePromesse ? new Date(or.datePromesse).toLocaleDateString("fr-FR") : "à convenir";
      const texte = modele
        .replace("{IMMATRICULATION}", or.immatriculation)
        .replace("{OR}", or.numero)
        .replace("{PROMESSE}", promesse);

      const tel = (or.clientTelephone ?? "").replace(/\D/g, "");
      const whatsappUrl = tel ? `https://wa.me/${tel.length > 8 ? tel : `237${tel}`}?text=${encodeURIComponent(texte)}` : null;

      // Événement métier : l'accusé de réception est un document remis au client.
      // Trace or_historique (type ACCUSE_RECEPTION, une seule entrée par OR) :
      // OR, véhicule, client, utilisateur (changePar), date/heure (changeLe), contenu et canal.
      const [trace] = await db
        .select({ id: orHistorique.id })
        .from(orHistorique)
        .where(and(eq(orHistorique.orId, input.orId), eq(orHistorique.type, "ACCUSE_RECEPTION")))
        .limit(1);
      if (!trace) {
        await db.insert(orHistorique).values({
          orId: input.orId,
          type: "ACCUSE_RECEPTION",
          nouvelleValeur: or.numero,
          commentaire: `Accusé de réception remis — véhicule ${or.immatriculation}${or.clientNom ? ` (client : ${(or.clientPrenom ?? "").trim()} ${or.clientNom})` : ""} — ${texte} — canal ${whatsappUrl ? "WHATSAPP" : "ECRAN"}`,
          changePar: Number(ctx.user.id),
        } as any);
      }

      return { texte, whatsappUrl, numeroOR: or.numero, immatriculation: or.immatriculation, promesse, dejaTrace: !!trace };
    }),

  // ─── E1 — Notifications atelier ───
  listNotifsAtelier: requirePermissionProcedure("or.consulter")
    .input(z.object({ lu: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [eq(atelierNotifications.agenceId, ctx.user.agenceId)];
      if (input?.lu !== undefined) conditions.push(eq(atelierNotifications.lu, input.lu));
      return db
        .select({
          id: atelierNotifications.id,
          orId: atelierNotifications.orId,
          type: atelierNotifications.type,
          titre: atelierNotifications.titre,
          message: atelierNotifications.message,
          lu: atelierNotifications.lu,
          createdAt: atelierNotifications.createdAt,
          numeroOR: ordresReparation.numero,
        })
        .from(atelierNotifications)
        .leftJoin(ordresReparation, eq(atelierNotifications.orId, ordresReparation.id))
        .where(and(...conditions))
        .orderBy(desc(atelierNotifications.createdAt))
        .limit(50);
    }),

  marquerNotifLu: requirePermissionProcedure("or.modifier")
    .input(z.object({ id: z.number().int(), tout: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.tout) {
        await db.update(atelierNotifications).set({ lu: true, luePar: Number(ctx.user.id), lueLe: new Date() } as any)
          .where(and(eq(atelierNotifications.agenceId, ctx.user.agenceId), eq(atelierNotifications.lu, false)));
      } else {
        await db.update(atelierNotifications).set({ lu: true, luePar: Number(ctx.user.id), lueLe: new Date() } as any)
          .where(and(eq(atelierNotifications.id, input.id), eq(atelierNotifications.agenceId, ctx.user.agenceId)));
      }
      return { success: true };
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
