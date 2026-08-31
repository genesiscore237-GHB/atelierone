import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  vehicules,
  clients,
  ordresReparation,
  lignesOrdreReparation,
  contratsMaintenance,
  contratsMaintenanceVehicules,
  employes,
  orRapportsDiagnostic,
  orDemandesPieces,
  orDemandesPiecesLignes,
  retoursFournisseur,
  retoursFournisseurLignes,
  fournisseurs,
  ventes,
  ventesLignes,
  orPhotos,
  orHistorique,
  atelierNotifications,
  produits,
} from "@atelierone/db";
import { eq, and, desc, sql, or, ilike } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  transitionStatutVehiculeValide,
  STATUTS_IMMOBILISATION,
  CARBURANTS,
  TYPES_VEHICULE,
} from "~/server/lib/vehicule-service";

/** MODULE VÉHICULES & ATELIER — parc, fiche, statuts d'immobilisation, historique. */
export const vehiculesRouter = createTRPCRouter({
  // ─── Liste du parc ───
  list: requirePermissionProcedure("vehicules.consulter")
    .input(
      z.object({
        search: z.string().optional(),
        statut: z.string().optional(),
        clientId: z.number().int().optional(),
        typeVehicule: z.string().optional(),
        limit: z.number().int().min(10).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const safe = input ?? {};
      const conditions: any[] = [eq(vehicules.agenceId, ctx.user.agenceId), eq(vehicules.isActive, true)];
      if (safe.statut) conditions.push(eq(vehicules.statutImmobilisation, safe.statut));
      if (safe.clientId) conditions.push(eq(vehicules.clientId, safe.clientId));
      if (safe.typeVehicule) conditions.push(eq(vehicules.typeVehicule, safe.typeVehicule));
      if (safe.search?.trim()) {
        const q = `%${safe.search.trim()}%`;
        conditions.push(
          or(
            ilike(vehicules.immatriculation, q),
            ilike(vehicules.marque, q),
            ilike(vehicules.modele, q),
            ilike(clients.nom, q),
            ilike(clients.raisonSociale, q),
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
          typeVehicule: vehicules.typeVehicule,
          carburant: vehicules.carburant,
          kilometrage: vehicules.kilometrage,
          statutImmobilisation: vehicules.statutImmobilisation,
          clientId: vehicules.clientId,
          clientNom: clients.nom,
          clientPrenom: clients.prenom,
          clientRaisonSociale: clients.raisonSociale,
          createdAt: vehicules.createdAt,
        })
        .from(vehicules)
        .leftJoin(clients, eq(vehicules.clientId, clients.id))
        .where(and(...conditions))
        .orderBy(desc(vehicules.createdAt))
        .limit(safe.limit)
        .offset(safe.offset);
      const [count] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(vehicules)
        .leftJoin(clients, eq(vehicules.clientId, clients.id))
        .where(and(...conditions));
      return { vehicules: rows, total: count?.n ?? 0 };
    }),

// ─── Fiche véhicule 360° (OR courant, diagnostic, devis, travaux, pièces, facture, photos, alertes) ───
  get: requirePermissionProcedure("vehicules.consulter")
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [vehicule] = await db
        .select({
          id: vehicules.id,
          agenceId: vehicules.agenceId,
          clientId: vehicules.clientId,
          immatriculation: vehicules.immatriculation,
          marque: vehicules.marque,
          modele: vehicules.modele,
          annee: vehicules.annee,
          couleur: vehicules.couleur,
          numeroChassis: vehicules.numeroChassis,
          kilometrage: vehicules.kilometrage,
          carburant: vehicules.carburant,
          chauffeurNom: vehicules.chauffeurNom,
          chauffeurTelephone: vehicules.chauffeurTelephone,
          typeVehicule: vehicules.typeVehicule,
          statutImmobilisation: vehicules.statutImmobilisation,
          siteId: vehicules.siteId,
          emplacementId: vehicules.emplacementId,
          notes: vehicules.notes,
          createdAt: vehicules.createdAt,
        })
        .from(vehicules)
        .where(and(eq(vehicules.id, input.id), eq(vehicules.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!vehicule) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });

      const [client] = vehicule.clientId
        ? await db
            .select({
              id: clients.id,
              nom: clients.nom,
              prenom: clients.prenom,
              raisonSociale: clients.raisonSociale,
              codeClient: clients.codeClient,
              typeClient: clients.typeClient,
              statut: clients.statut,
              telephone: clients.telephone,
              telephoneSecondaire: clients.telephoneSecondaire,
            })
            .from(clients)
            .where(eq(clients.id, vehicule.clientId))
            .limit(1)
        : [null];

      // ── OR courant : dernier OR non clos, sinon dernier OR (terminé) ──
      const [orCourant] = await db
        .select({
          id: ordresReparation.id,
          numero: ordresReparation.numero,
          statut: ordresReparation.statut,
          priorite: ordresReparation.priorite,
          motEntree: ordresReparation.motEntree,
          plainte: ordresReparation.plainte,
          dateOuverture: ordresReparation.dateOuverture,
          dateCloture: ordresReparation.dateCloture,
          datePromesse: ordresReparation.datePromesse,
          responsableTechnicienId: ordresReparation.responsableTechnicienId,
          raisonBlocage: ordresReparation.raisonBlocage,
          clientAttendSurPlace: ordresReparation.clientAttendSurPlace,
          devisAccepte: ordresReparation.devisAccepte,
          factureTransmiseLe: ordresReparation.factureTransmiseLe,
          attenteBonCommande: ordresReparation.attenteBonCommande,
          venteId: ordresReparation.venteId,
          totalTTC: ordresReparation.totalTTC,
          createdAt: ordresReparation.createdAt,
        })
        .from(ordresReparation)
        .where(eq(ordresReparation.vehiculeId, input.id))
        .orderBy(sql`CASE WHEN ${ordresReparation.statut} IN ('LIVRE','ANNULE','CLOTURE') THEN 1 ELSE 0 END`, desc(ordresReparation.dateOuverture))
        .limit(1);

      let responsable: { id: number; nom: string; prenom: string | null } | null = null;
      let rapportDiagnostic: Record<string, unknown> | null = null;
      let lignesTravaux: Record<string, unknown>[] = [];
      let demandesPieces: Record<string, unknown>[] = [];
      let retoursList: Record<string, unknown>[] = [];
      let facture: Record<string, unknown> | null = null;
      let factureLignes: Record<string, unknown>[] = [];
      let photos: Record<string, unknown>[] = [];
      let alertes: Record<string, unknown>[] = [];
      let timeline: Record<string, unknown>[] = [];

      if (orCourant) {
        if (orCourant.responsableTechnicienId) {
          const [emp] = await db
            .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom })
            .from(employes)
            .where(eq(employes.id, orCourant.responsableTechnicienId))
            .limit(1);
          responsable = emp ?? null;
        }

        const [rapport] = await db
          .select({
            id: orRapportsDiagnostic.id,
            constat: orRapportsDiagnostic.constat,
            cause: orRapportsDiagnostic.cause,
            statut: orRapportsDiagnostic.statut,
            dateSoumission: orRapportsDiagnostic.dateSoumission,
            valideLe: orRapportsDiagnostic.valideLe,
            commentaireValidateur: orRapportsDiagnostic.commentaireValidateur,
            technicienId: orRapportsDiagnostic.technicienId,
            validePar: orRapportsDiagnostic.validePar,
          })
          .from(orRapportsDiagnostic)
          .where(eq(orRapportsDiagnostic.orId, orCourant.id))
          .orderBy(sql`${orRapportsDiagnostic.id} DESC`)
          .limit(1);
        if (rapport) {
          rapportDiagnostic = { ...rapport, technicien: null as unknown, validateur: null as unknown };
          if (rapport.technicienId) {
            const [t] = await db.select({ nom: employes.nom, prenom: employes.prenom }).from(employes).where(eq(employes.id, rapport.technicienId)).limit(1);
            (rapportDiagnostic as any).technicien = t ?? null;
          }
          if (rapport.validePar) {
            const [vp] = await db.select({ nom: employes.nom, prenom: employes.prenom }).from(employes).where(eq(employes.id, rapport.validePar)).limit(1);
            (rapportDiagnostic as any).validateur = vp ?? null;
          }
        }

        lignesTravaux = await db
          .select({
            id: lignesOrdreReparation.id,
            libelle: lignesOrdreReparation.libelle,
            quantite: lignesOrdreReparation.quantite,
            prixUnitaire: lignesOrdreReparation.prixUnitaire,
            statut: lignesOrdreReparation.statut,
            produitId: lignesOrdreReparation.produitId,
          })
          .from(lignesOrdreReparation)
          .where(eq(lignesOrdreReparation.ordreId, orCourant.id))
          .orderBy(desc(lignesOrdreReparation.id))
          .limit(100);

        // Demandes de pièces + retours fournisseur pour l'OR courant
        const demandes = await db
          .select({
            id: orDemandesPieces.id,
            statut: orDemandesPieces.statut,
            motif: orDemandesPieces.motif,
            traiteLe: orDemandesPieces.traiteLe,
            createdAt: orDemandesPieces.createdAt,
          })
          .from(orDemandesPieces)
          .where(eq(orDemandesPieces.orId, orCourant.id))
          .orderBy(desc(orDemandesPieces.id))
          .limit(20);
        demandesPieces = await Promise.all(
          demandes.map(async (d) => {
            const lignes = await db
              .select({
                id: orDemandesPiecesLignes.id,
                quantite: orDemandesPiecesLignes.quantite,
                quantiteServie: orDemandesPiecesLignes.quantiteServie,
                prixEstime: orDemandesPiecesLignes.prixEstime,
                note: orDemandesPiecesLignes.note,
                produitId: orDemandesPiecesLignes.produitId,
                produitLibelle: produits.titre,
                produitRef: produits.codeArticle,
              })
              .from(orDemandesPiecesLignes)
              .leftJoin(produits, eq(orDemandesPiecesLignes.produitId, produits.id))
              .where(eq(orDemandesPiecesLignes.demandeId, d.id));
            return { ...d, lignes };
          })
        );

        // Retours fournisseur liés à l'OR
        retoursList = await db
          .select({
            id: retoursFournisseur.id,
            statut: retoursFournisseur.statut,
            motif: retoursFournisseur.motif,
            createdAt: retoursFournisseur.createdAt,
            fournisseurId: retoursFournisseur.fournisseurId,
            fournisseurNom: fournisseurs.nom,
          })
          .from(retoursFournisseur)
          .leftJoin(fournisseurs, eq(retoursFournisseur.fournisseurId, fournisseurs.id))
          .where(eq(retoursFournisseur.orId, orCourant.id))
          .orderBy(desc(retoursFournisseur.id))
          .limit(10);

        if (orCourant.venteId) {
          const [v] = await db
            .select({
              id: ventes.id,
              reference: ventes.reference,
              montantTotal: ventes.montantTotal,
              montantPaye: ventes.montantPaye,
              statut: ventes.statut,
              createdAt: ventes.createdAt,
            })
            .from(ventes)
            .where(eq(ventes.id, orCourant.venteId))
            .limit(1);
          if (v) {
            const paye = Number(v.montantPaye ?? 0);
            const total = Number(v.montantTotal ?? 0);
            const etat = paye >= total && total > 0 ? "PAYEE" : paye > 0 ? "AVANCE" : orCourant.attenteBonCommande ? "ATTENTE_BON_COMMANDE" : orCourant.factureTransmiseLe ? "ATTENTE_PAIEMENT" : "NON_TRANSMISE";
            facture = { ...v, etat, montant: v.montantTotal, transmiseLe: orCourant.factureTransmiseLe, attenteBonCommande: orCourant.attenteBonCommande };
            factureLignes = await db
              .select({
                id: ventesLignes.id,
                libelle: ventesLignes.libelle,
                quantite: ventesLignes.quantite,
                prixUnitaire: ventesLignes.prixUnitaire,
                totalLigne: ventesLignes.totalLigne,
              })
              .from(ventesLignes)
              .where(eq(ventesLignes.venteId, v.id))
              .limit(200);
          }
        }

        photos = await db
          .select({ id: orPhotos.id, url: orPhotos.url, type: orPhotos.type, createdAt: orPhotos.createdAt })
          .from(orPhotos)
          .where(eq(orPhotos.orId, orCourant.id))
          .orderBy(desc(orPhotos.id))
          .limit(30);

        alertes = await db
          .select({ id: atelierNotifications.id, type: atelierNotifications.type, titre: atelierNotifications.titre, message: atelierNotifications.message, lu: atelierNotifications.lu, createdAt: atelierNotifications.createdAt })
          .from(atelierNotifications)
          .where(and(eq(atelierNotifications.orId, orCourant.id), eq(atelierNotifications.lu, false)))
          .orderBy(desc(atelierNotifications.createdAt))
          .limit(20);

        timeline = await db
          .select({
            id: orHistorique.id,
            type: orHistorique.type,
            ancienneValeur: orHistorique.ancienneValeur,
            nouvelleValeur: orHistorique.nouvelleValeur,
            commentaire: orHistorique.commentaire,
            changeLe: orHistorique.changeLe,
          })
          .from(orHistorique)
          .where(eq(orHistorique.orId, orCourant.id))
          .orderBy(desc(orHistorique.changeLe))
          .limit(100);
      }

      // ── Historique complet des OR ──
      const historiqueOR = await db
        .select({
          id: ordresReparation.id,
          numero: ordresReparation.numero,
          statut: ordresReparation.statut,
          priorite: ordresReparation.priorite,
          plainte: ordresReparation.plainte,
          motEntree: ordresReparation.motEntree,
          dateOuverture: ordresReparation.dateOuverture,
          dateCloture: ordresReparation.dateCloture,
          datePromesse: ordresReparation.datePromesse,
          raisonBlocage: ordresReparation.raisonBlocage,
          totalTTC: ordresReparation.totalTTC,
          venteId: ordresReparation.venteId,
          responsableTechnicienId: ordresReparation.responsableTechnicienId,
        })
        .from(ordresReparation)
        .where(eq(ordresReparation.vehiculeId, input.id))
        .orderBy(desc(ordresReparation.dateOuverture))
        .limit(50);

      // Responsables de l'historique (1 requête groupée)
      const empIds = [...new Set(historiqueOR.map((h) => h.responsableTechnicienId).filter(Boolean))] as number[];
      const emps = empIds.length
        ? await db.select({ id: employes.id, nom: employes.nom, prenom: employes.prenom }).from(employes).where(sql`${employes.id} IN (${sql.join(empIds.map((i) => sql`${i}`), sql`, `)})`)
        : [];
      const empMap = new Map(emps.map((e) => [e.id, e]));
      const historiqueEnrichi = historiqueOR.map((h) => ({
        ...h,
        responsable: h.responsableTechnicienId ? (empMap.get(h.responsableTechnicienId) ?? null) : null,
      }));

      // ── Autres véhicules du même client ──
      const autresVehicules = vehicule.clientId
        ? await db
            .select({ id: vehicules.id, immatriculation: vehicules.immatriculation, marque: vehicules.marque, modele: vehicules.modele, statutImmobilisation: vehicules.statutImmobilisation })
            .from(vehicules)
            .where(and(eq(vehicules.clientId, vehicule.clientId), eq(vehicules.isActive, true), sql`${vehicules.id} != ${input.id}`))
            .orderBy(desc(vehicules.createdAt))
            .limit(10)
        : [];

      const liaisonContrat = await db
        .select({
          id: contratsMaintenanceVehicules.id,
          contratId: contratsMaintenanceVehicules.contratId,
          immatriculationTemp: contratsMaintenanceVehicules.immatriculationTemp,
          actif: contratsMaintenanceVehicules.actif,
          numeroContrat: contratsMaintenance.numeroContrat,
          libelle: contratsMaintenance.libelle,
          statutContrat: contratsMaintenance.statut,
          typeContrat: contratsMaintenance.typeContrat,
          dateFin: contratsMaintenance.dateFin,
        })
        .from(contratsMaintenanceVehicules)
        .leftJoin(contratsMaintenance, eq(contratsMaintenanceVehicules.contratId, contratsMaintenance.id))
        .where(and(eq(contratsMaintenanceVehicules.vehiculeId, input.id), eq(contratsMaintenanceVehicules.actif, true)))
        .limit(5);

      return { vehicule, client, orCourant, orTermine: orCourant ? ["LIVRE", "ANNULE", "CLOTURE"].includes(orCourant.statut) : false, responsable, rapportDiagnostic, lignesTravaux, demandesPieces, retours: retoursList, facture, factureLignes, photos, alertes, timeline, historiqueOR: historiqueEnrichi, autresVehicules, contrats: liaisonContrat };
    }),

  // ─── Création ───
  create: requirePermissionProcedure("vehicules.creer")
    .input(
      z.object({
        immatriculation: z.string().min(1).max(50),
        clientId: z.number().int().optional(),
        marque: z.string().optional(),
        modele: z.string().optional(),
        annee: z.number().int().min(1900).max(2100).optional(),
        couleur: z.string().optional(),
        numeroChassis: z.string().optional(),
        kilometrage: z.number().int().min(0).optional(),
        carburant: z.enum(CARBURANTS).optional(),
        chauffeurNom: z.string().max(100).optional(),
        chauffeurTelephone: z.string().max(30).optional(),
        typeVehicule: z.enum(TYPES_VEHICULE).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [dup] = await db
        .select({ id: vehicules.id })
        .from(vehicules)
        .where(and(eq(vehicules.immatriculation, input.immatriculation.trim()), eq(vehicules.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (dup) throw new TRPCError({ code: "BAD_REQUEST", message: "Cette immatriculation existe déjà dans votre agence." });

      if (input.clientId) {
        const [client] = await db
          .select({ id: clients.id, statut: clients.statut })
          .from(clients)
          .where(and(eq(clients.id, input.clientId), eq(clients.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable." });
      }

      const [row] = await db
        .insert(vehicules)
        .values({
          agenceId: ctx.user.agenceId,
          immatriculation: input.immatriculation.trim(),
          clientId: input.clientId ?? null,
          marque: input.marque ?? null,
          modele: input.modele ?? null,
          annee: input.annee ?? null,
          couleur: input.couleur ?? null,
          numeroChassis: input.numeroChassis ?? null,
          kilometrage: input.kilometrage ?? 0,
          carburant: input.carburant ?? null,
          chauffeurNom: input.chauffeurNom ?? null,
          chauffeurTelephone: input.chauffeurTelephone ?? null,
          typeVehicule: input.typeVehicule ?? "voiture",
          statutImmobilisation: "en_reception",
          notes: input.notes ?? null,
          isActive: true,
        } as any)
        .returning();
      return row;
    }),

  // ─── Mise à jour ───
  update: requirePermissionProcedure("vehicules.modifier")
    .input(
      z.object({
        id: z.number().int(),
        clientId: z.number().int().optional().nullable(),
        marque: z.string().optional(),
        modele: z.string().optional(),
        annee: z.number().int().min(1900).max(2100).optional(),
        couleur: z.string().optional(),
        numeroChassis: z.string().optional(),
        kilometrage: z.number().int().min(0).optional(),
        carburant: z.enum(CARBURANTS).optional(),
        chauffeurNom: z.string().max(100).optional().nullable(),
        chauffeurTelephone: z.string().max(30).optional().nullable(),
        typeVehicule: z.enum(TYPES_VEHICULE).optional(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const [existing] = await db
        .select({ id: vehicules.id })
        .from(vehicules)
        .where(and(eq(vehicules.id, id), eq(vehicules.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });
      const updateData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) updateData[k] = v;
      }
      updateData.updatedAt = new Date();
      await db.update(vehicules).set(updateData as any).where(eq(vehicules.id, id));
      return { success: true };
    }),

  // ─── Changement de statut d'immobilisation (workflow atelier) ───
  changerStatut: requirePermissionProcedure("vehicules.modifier")
    .input(z.object({ id: z.number().int(), nouveauStatut: z.enum(STATUTS_IMMOBILISATION), motif: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [vehicule] = await db
        .select({ id: vehicules.id, statutImmobilisation: vehicules.statutImmobilisation, notes: vehicules.notes })
        .from(vehicules)
        .where(and(eq(vehicules.id, input.id), eq(vehicules.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!vehicule) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });
      if (!transitionStatutVehiculeValide(vehicule.statutImmobilisation, input.nouveauStatut)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Transition « ${vehicule.statutImmobilisation} → ${input.nouveauStatut} » non autorisée.` });
      }
      await db
        .update(vehicules)
        .set({
          statutImmobilisation: input.nouveauStatut,
          notes: input.motif ? `${vehicule.notes ? vehicule.notes + "\n" : ""}[${new Date().toISOString().slice(0, 10)}] ${input.motif}` : vehicule.notes,
          updatedAt: new Date(),
        } as any)
        .where(eq(vehicules.id, input.id));
      return { success: true, statut: input.nouveauStatut };
    }),

  // ─── Lier à un contrat de maintenance ───
  lierContrat: requirePermissionProcedure("vehicules.modifier")
    .input(z.object({ vehiculeId: z.number().int(), contratId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [contrat] = await db
        .select({ id: contratsMaintenance.id, statut: contratsMaintenance.statut })
        .from(contratsMaintenance)
        .where(and(eq(contratsMaintenance.id, input.contratId), eq(contratsMaintenance.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!contrat) throw new TRPCError({ code: "NOT_FOUND", message: "Contrat introuvable." });
      if (contrat.statut !== "ACTIF" && contrat.statut !== "RENOUVELLE") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Seul un contrat ACTIF peut couvrir un véhicule." });
      }
      const [dup] = await db
        .select({ id: contratsMaintenanceVehicules.id })
        .from(contratsMaintenanceVehicules)
        .where(and(eq(contratsMaintenanceVehicules.contratId, input.contratId), eq(contratsMaintenanceVehicules.vehiculeId, input.vehiculeId), eq(contratsMaintenanceVehicules.actif, true)))
        .limit(1);
      if (dup) throw new TRPCError({ code: "BAD_REQUEST", message: "Ce véhicule est déjà couvert par ce contrat." });
      const [row] = await db
        .insert(contratsMaintenanceVehicules)
        .values({ contratId: input.contratId, vehiculeId: input.vehiculeId, dateAjout: new Date().toISOString().slice(0, 10), actif: true } as any)
        .returning();
      return row;
    }),

  retirerContrat: requirePermissionProcedure("vehicules.modifier")
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(contratsMaintenanceVehicules)
        .set({ actif: false, dateRetrait: new Date().toISOString().slice(0, 10) } as any)
        .where(eq(contratsMaintenanceVehicules.id, input.id));
      return { success: true };
    }),

  // ─── Contrats actifs disponibles pour la liaison ───
  listContratsActifs: requirePermissionProcedure("vehicules.consulter")
    .query(async ({ ctx }) => {
      return db
        .select({
          id: contratsMaintenance.id,
          numeroContrat: contratsMaintenance.numeroContrat,
          libelle: contratsMaintenance.libelle,
          clientId: contratsMaintenance.clientId,
          clientNom: clients.nom,
          clientRaisonSociale: clients.raisonSociale,
          typeContrat: contratsMaintenance.typeContrat,
        })
        .from(contratsMaintenance)
        .leftJoin(clients, eq(contratsMaintenance.clientId, clients.id))
        .where(and(eq(contratsMaintenance.agenceId, ctx.user.agenceId), eq(contratsMaintenance.statut, "ACTIF")))
        .orderBy(desc(contratsMaintenance.dateDebut))
        .limit(100);
    }),
});