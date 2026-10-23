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
  auditLogs,
  immatNormaleCondition,
  immatNormPreferenceSql,
} from "@atelierone/db";
import { eq, and, asc, desc, sql, or, ilike } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { dossierEstTermine } from "~/server/lib/atelier-service";
import { resoudreStatutVehicule, STATUTS_DERIVABLES } from "~/server/lib/statut-vehicule";
import { STATUT_LABELS } from "~/server/lib/vehicule-service";
import {
  transitionStatutVehiculeValide,
  STATUTS_IMMOBILISATION,
  CARBURANTS,
  TYPES_VEHICULE,
  libelleTypeVehicule,
} from "~/server/lib/vehicule-service";
import {
  synchroniserIdentiteParking,
  projeterParkingDepuisImmo,
  normaliserImmatriculation,
} from "~/server/lib/parking-vehicule-service";
import {
  resoudreOuCreerVehicule,
  completerVehiculeSansEcrasement,
} from "~/server/lib/vehicule-regles";
import { listeCanoniqueVehicules } from "~/server/lib/liste-canonique-vehicules";
import { journalVehicule } from "~/server/lib/journal-vehicule";

/** MODULE VÉHICULES & ATELIER — parc, fiche, statuts d'immobilisation, historique. */
export const vehiculesRouter = createTRPCRouter({
  /**
   * LOT U1 (E7) — Types de véhicule déjà utilisés par l'agence.
   *
   * Alimente le combobox « Type de véhicule » de la réception : la liste
   * cerrada n'est plus la seule source, les types réellement rencontrés le
   * sont aussi (saisie libre autorisée côté UI). Les valeurs en base restent
   * en snake_case ; `libelle` est purely affichage.
   */
  typesUtilises: requirePermissionProcedure("vehicules.consulter")
    .query(async ({ ctx }) => {
      const rows = await db
        .selectDistinct({ valeur: vehicules.typeVehicule })
        .from(vehicules)
        .where(and(eq(vehicules.agenceId, ctx.user.agenceId), sql`${vehicules.typeVehicule} IS NOT NULL`))
        .orderBy(vehicules.typeVehicule);
      const vus = rows
        .map((r) => (r.valeur ?? "").trim())
        .filter((v) => v.length > 0);
      // Liste de référence d'abord, puis les types rencontrés hors liste.
      const horsListe = vus.filter((v) => !(TYPES_VEHICULE as readonly string[]).includes(v));
      return {
        valeurs: [...TYPES_VEHICULE, ...horsListe],
        options: [...TYPES_VEHICULE, ...horsListe].map((v) => ({ valeur: v, libelle: libelleTypeVehicule(v) })),
      };
    }),

  // ─── Liste du parc ───

  /**
   * P1.1 — LISTE CANONIQUE.
   *
   * Point d'entrée unique du parc : une ligne = un véhicule, avec sa position
   * registre résolue en noms lisibles et son dossier en cours. Toutes les
   * autres listes de véhicules doivent venir d'ici.
   *
   * Ce qui est corrigé par rapport aux procédures préexistantes :
   *
   *   - `total` **réel** (`count(*)`) et non `rows.length`. La liste garage
   *     annonçait « N véhicule(s) affiché(s) » en plafonnant à la taille de
   *     sa page : le compteur mentait dès que le parc dépassait le `limit`.
   *   - pagination réelle (`limit` + `offset`), alors que `vehicules.list`
   *     proposait un `offset` qu'aucun écran n'utilisait.
   *   - compteurs par statut calculés sur le périmètre **filtré**, pas sur la
   *     page courante — le garage les calculait en JS sur 200 lignes.
   *   - position (site / zone / place) réellement présente dans la réponse.
   *     L'écran la lisait déjà, mais l'endpoint ne la renvoyait pas : la
   *     colonne affichait « Non défini » en permanence.
   *   - recherche par VIN, téléphone client et n° de registre, que les trois
   *     listes existantes traitaient différemment.
   */
  listeCanonique: requirePermissionProcedure("vehicules.consulter")
    .input(
      z.object({
        search: z.string().trim().max(120).optional(),
        statut: z.string().optional(),
        statutParking: z.string().optional(),
        clientId: z.number().int().positive().optional(),
        siteId: z.number().int().positive().optional(),
        orEnCours: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
        tri: z.enum(["immatriculation", "immatriculation_desc", "km", "km_asc", "recent"]).default("immatriculation"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { lignes, total, parStatut } = await listeCanoniqueVehicules(
        db,
        {
          agenceId: ctx.user.agenceId,
          search: input.search ?? null,
          statut: input.statut ?? null,
          statutParking: input.statutParking ?? null,
          clientId: input.clientId ?? null,
          siteId: input.siteId ?? null,
          orEnCours: input.orEnCours ?? false,
          // Les `.default()` zod garantissent la valeur ici : le spread
          // `...input` conservait le type *d'entrée*, où ils sont optionnels.
          limit: input.limit ?? 50,
          offset: input.offset ?? 0,
        },
        input.tri ?? "immatriculation",
      );
      return {
        vehicules: lignes,
        total,
        parStatut,
        // Le sélecteur de statut est servi par le serveur : l'UI ne recopie
        // plus une liste en dur, qui finit toujours par diverger.
        optionsStatut: STATUTS_DERIVABLES.map((s) => ({ valeur: s, libelle: STATUT_LABELS[s] ?? s })),
        page: {
          limit: input.limit,
          offset: input.offset,
          total,
          page: Math.floor(input.offset / input.limit) + 1,
          pages: Math.max(1, Math.ceil(total / input.limit)),
        },
      };
    }),

  /**
   * Photos d'un véhicule, par identifiant VÉHICULE.
   *
   * `garage.vehiculePhotos` existe déjà mais s'indexe sur l'identifiant de la
   * **ligne parking**. L'atelier connaît le véhicule, pas la ligne de registre :
   * lui demander de retrouver la ligne correspondiente l'obligerait à
   *.download les données du registre pour ouvrir une fiche technique. Le clic
   * sur un véhicule doit donc suffire.
   *
   * Résolution par la MÊME règle que la liste canonique : ligne de parking la
   * plus récente. Deux écrans, une seule source, un seul classement.
   */
  photos: requirePermissionProcedure("vehicules.consulter")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const r = await db.execute(sql`
        SELECT pv.photos
        FROM parking_vehicles pv
        WHERE pv.vehicule_id = ${input.id}
          AND pv.agence_id = ${ctx.user.agenceId}
          -- Une réception crée un nouveau passage avec une galerie vide. Sans
          -- ce filtre, elle masquait les photos du passage précédent.
          AND jsonb_array_length(coalesce(pv.photos, '[]'::jsonb)) > 0
        ORDER BY pv.id DESC
        LIMIT 1
      `);
      const photos = (r as unknown as { photos?: unknown }[])[0]?.photos;
      return {
        photos: Array.isArray(photos)
          ? (photos as { url?: string; categorie?: string; date?: string; auteur?: string }[])
              .filter((p) => typeof p?.url === "string" && p.url.length > 0)
          : [],
      };
    }),

  /**
 * Journal unifié du véhicule : diagnostic, devis, interventions, événements —
 * **datés et attribués**.
 *
 * C'est ce que l'agent doit voir au clic, et ce que la fiche 360 ne donnait
 * pas : `or_historique.change_par` existe en base mais n'était pas demandé,
 * donc l'historique était daté et **anonyme**.
 */
journal: requirePermissionProcedure("vehicules.consulter")
  .input(
    z.object({
      id: z.number().int().positive(),
      limite: z.number().int().min(1).max(500).default(200),
    }),
  )
  .query(async ({ ctx, input }) => journalVehicule(db, input.id, ctx.user.agenceId, input.limite)),

  /**
 * Techniciens de l'agence, pour le sélecteur « qui fait cette intervention ».
 *
 * Existait déjà sous le nom `employes`, mais depuis le module Employés : un
 * écran d'atelier qui devait ouvrir le module RH pour réattribuer une ligne de
 * travail n'aurait jamais été utilisé. Un sélecteur qui exige un détour n'est
 * pas un sélecteur.
 *
 * Renommé et replacé ici parce que la seule question posée est « qui travaille
 * sur ce dossier », pas « quelle est la fiche RH complète ».
 */
techniciens: requirePermissionProcedure("vehicules.consulter")
    .query(async ({ ctx }) => {
      const rows = await db
        .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom })
        .from(employes)
        .where(and(eq(employes.agenceId, ctx.user.agenceId), eq(employes.statut, "ACTIF")))
        .orderBy(asc(employes.nom));
      return { techniciens: rows };
    }),

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
          version: vehicules.version,
          annee: vehicules.annee,
          couleur: vehicules.couleur,
          numeroChassis: vehicules.numeroChassis,
          kilometrage: vehicules.kilometrage,
          carburant: vehicules.carburant,
          chauffeurNom: vehicules.chauffeurNom,
          chauffeurTelephone: vehicules.chauffeurTelephone,
          typeVehicule: vehicules.typeVehicule,
          longueur: vehicules.longueur,
          largeur: vehicules.largeur,
          hauteur: vehicules.hauteur,
          poids: vehicules.poids,
          dimensionsEstimees: vehicules.dimensionsEstimees,
          statutImmobilisation: vehicules.statutImmobilisation,
          siteId: vehicules.siteId,
          emplacementId: vehicules.emplacementId,
          notes: vehicules.notes,
          isActive: vehicules.isActive,
          createdAt: vehicules.createdAt,
          updatedAt: vehicules.updatedAt,
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
            .where(and(eq(clients.id, vehicule.clientId), eq(clients.agenceId, ctx.user.agenceId)))
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
    // ÉTAPE 4 — la restitution est désormais accessible depuis la 360, et le
    // formulaire compare le km de SORTIE au km d'ENTRÉE. Sans cette colonne,
    // le contrôle était inerte sur cet écran : le champ acceptait une valeur
    // inférieure, et c'était le serveur qui refusait — après que l'agent ait
    // rempli tout le formulaire.
    //
    // Le même défaut que la colonne « Non défini » du parking : un contrôle
    // qui a l'air d'exister et qui ne s'exerce pas.
    kilometrageEntree: ordresReparation.kilometrageEntree,
    // ÉTAPE 6 — la note de satisfaction se prend à la restitution, donc elle
    // s'affiche dans la 360. Sans ces deux colonnes, le bloc « Satisfaction »
    // disait « non noté » même après enregistrement — et disparaissait au
    // rechargement. Un enregistrement que l'écran nie est pire que pas
    // d'enregistrement : l'agent recommence, ou pire, ne sait pas que ça a été
    // fait.
    satisfactionNote: ordresReparation.satisfactionNote,
    satisfactionCommentaire: ordresReparation.satisfactionCommentaire,
    createdAt: ordresReparation.createdAt,
        })
        .from(ordresReparation)
        .where(eq(ordresReparation.vehiculeId, input.id))
        .orderBy(sql`CASE WHEN ${ordresReparation.statut} IN ('LIVRE','ANNULE','ferme_definitif') THEN 1 ELSE 0 END`, desc(ordresReparation.dateOuverture))
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
            type: lignesOrdreReparation.type,
            libelle: lignesOrdreReparation.libelle,
            quantite: lignesOrdreReparation.quantite,
            prixUnitaire: lignesOrdreReparation.prixUnitaire,
            tva: lignesOrdreReparation.tva,
            statut: lignesOrdreReparation.statut,
            statutAutorisation: lignesOrdreReparation.statutAutorisation,
            bloque: lignesOrdreReparation.bloque,
            raisonBlocageLigne: lignesOrdreReparation.raisonBlocageLigne,
            technicienId: lignesOrdreReparation.technicienId,
            dureeHeures: lignesOrdreReparation.dureeHeures,
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
          .select({
            id: orPhotos.id,
            url: orPhotos.url,
            type: orPhotos.type,
            categorie: orPhotos.categorie,
            visite: orPhotos.visite,
            createdAt: orPhotos.createdAt,
          })
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
            .where(and(eq(vehicules.clientId, vehicule.clientId), eq(vehicules.agenceId, ctx.user.agenceId), eq(vehicules.isActive, true), sql`${vehicules.id} != ${input.id}`))
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

      return { vehicule, client, orCourant, orTermine: orCourant ? dossierEstTermine(orCourant.statut) : false, responsable, rapportDiagnostic, lignesTravaux, demandesPieces, retours: retoursList, facture, factureLignes, photos, alertes, historiqueOR: historiqueEnrichi, autresVehicules, contrats: liaisonContrat };
    }),

  // ─── Création ───
  // IMPORT/TEST ONLY — la réception atelier est l'unique porte UI. Conservé pour les scripts d'import et les tests.
  create: requirePermissionProcedure("vehicules.creer")
    .input(
      z.object({
        immatriculation: z.string().min(1).max(50),
        clientId: z.number().int().optional(),
        marque: z.string().optional(),
        modele: z.string().optional(),
        // LOT U0a — parité de fiche avec la réception et le registre parking.
        version: z.string().max(100).optional(),
        annee: z.number().int().min(1900).max(2100).optional(),
        couleur: z.string().optional(),
        numeroChassis: z.string().optional(),
        kilometrage: z.number().int().min(0).optional(),
        carburant: z.enum(CARBURANTS).optional(),
        chauffeurNom: z.string().max(100).optional(),
        chauffeurTelephone: z.string().max(30).optional(),
        // LOT U0a/U1 — type OUVERT (saisie libre, 30 car. comme la colonne) :
        // un `z.enum` ici faisait refus���r par cet endpoint un type « benne »
        // pourtant accepté à la réception. Même règle partout.
        typeVehicule: z.string().trim().min(1).max(30).optional(),
        // LOT U0d — empreinte physique (registre parking).
        longueur: z.number().positive().optional(),
        largeur: z.number().positive().optional(),
        hauteur: z.number().positive().optional(),
        poids: z.number().positive().optional(),
        dimensionsEstimees: z.boolean().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // LOT U0a — RÈGLE UNIQUE, alignée sur `or.receptionner`.
      //
      // AVANT, cet écran REFUSAIT une immatriculation déjà connue : la même
      // plaque saisie à la réception était réutilisée, ici ellelevait une
      // erreur. L'agent obtenait deux comportements selon l'écran.
      // On applique désormais la règle unique : RÉCONCILIATION + informée
      // (le retour porte `vehiculeReconcilie`), jamais d'écrasement (RD4).

      if (input.clientId) {
        const [client] = await db
          .select({ id: clients.id, statut: clients.statut })
          .from(clients)
          .where(and(eq(clients.id, input.clientId), eq(clients.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client introuvable." });
      }

      const resolution = await resoudreOuCreerVehicule(db, {
        agenceId: ctx.user.agenceId,
        immatriculation: input.immatriculation,
        clientId: input.clientId ?? null,
        statutImmobilisation: "en_reception",
        notes: input.notes ?? null,
        fiche: {
          marque: input.marque ?? null,
          modele: input.modele ?? null,
          version: input.version ?? null,
          couleur: input.couleur ?? null,
          numeroChassis: input.numeroChassis ?? null,
          typeVehicule: input.typeVehicule ?? "voiture",
          carburant: input.carburant ?? null,
          annee: input.annee ?? null,
        },
        colonnesSup: {
          kilometrage: input.kilometrage ?? 0,
          chauffeurNom: input.chauffeurNom ?? null,
          chauffeurTelephone: input.chauffeurTelephone ?? null,
          isActive: true,
          // LOT U0d — empreinte physique.
          longueur: input.longueur ?? null,
          largeur: input.largeur ?? null,
          hauteur: input.hauteur ?? null,
          poids: input.poids ?? null,
          dimensionsEstimees: !!input.dimensionsEstimees,
        },
      });

      const [row] = await db.select().from(vehicules).where(eq(vehicules.id, resolution.vehiculeId)).limit(1);
      // `vehiculeReconcilie` permet à l'UI d'informer l'agent (R4 : aucune
      // information ne disparaît silencieusement).
      return { ...row, vehiculeReconcilie: !resolution.cree };
    }),

  // ─── Mise à jour ───
  update: requirePermissionProcedure("vehicules.modifier")
    .input(
      z.object({
        id: z.number().int(),
        marque: z.string().optional(),
        modele: z.string().optional(),
        annee: z.number().int().min(1900).max(2100).optional(),
        couleur: z.string().optional(),
        numeroChassis: z.string().optional(),
        kilometrage: z.number().int().min(0).optional(),
        carburant: z.enum(CARBURANTS).optional(),
        chauffeurNom: z.string().max(100).optional().nullable(),
        chauffeurTelephone: z.string().max(30).optional().nullable(),
        typeVehicule: z.string().trim().min(1).max(30).optional().nullable(),
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
      // LOT 1 — identité partagée canonique → registre parking (lignes liées).
      await synchroniserIdentiteParking(db, id, {
        marque: rest.marque,
        modele: rest.modele,
        couleur: rest.couleur,
        vin: rest.numeroChassis,
      });
      return { success: true };
    }),

  /**
   * CESSION DE PROPRIÉTAIRE — action métier explicite, jamais un effet de bord
   * de `update`. Le motif est obligatoire, l'ancien et le nouveau client sont
   * tracés, et le passage parking actif est synchronisé.
   */
  ceder: requirePermissionProcedure("vehicules.modifier")
    .input(z.object({
      id: z.number().int(),
      clientId: z.number().int(),
      motif: z.string().trim().min(3).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const [vehicule] = await db
        .select({ id: vehicules.id, clientId: vehicules.clientId, immatriculation: vehicules.immatriculation })
        .from(vehicules)
        .where(and(eq(vehicules.id, input.id), eq(vehicules.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!vehicule) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });
      if (vehicule.clientId === input.clientId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le véhicule appartient déjà à ce client." });
      }

      const [client] = await db
        .select({
          id: clients.id,
          nom: clients.nom,
          prenom: clients.prenom,
          raisonSociale: clients.raisonSociale,
          telephone: clients.telephone,
        })
        .from(clients)
        .where(and(eq(clients.id, input.clientId), eq(clients.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client cible introuvable." });

      const nom = String(client.raisonSociale ?? [client.prenom, client.nom].filter(Boolean).join(" ")).trim() || null;

      await db.transaction(async (tx) => {
        await tx
          .update(vehicules)
          .set({ clientId: input.clientId, updatedAt: new Date() } as any)
          .where(and(eq(vehicules.id, input.id), eq(vehicules.agenceId, ctx.user.agenceId)));

        // Le passage actif porte le nom/telephone du client pour le registre
        // parking. L'historique des passages reste intact.
        await tx.execute(sql`
          UPDATE parking_vehicles
          SET client_nom = ${nom}, client_telephone = ${client.telephone ?? null}, updated_at = now()
          WHERE id = (
            SELECT id FROM parking_vehicles
            WHERE vehicule_id = ${input.id} AND agence_id = ${ctx.user.agenceId} AND statut <> 'SORTI'
            ORDER BY id DESC LIMIT 1
          )`);

        await tx.insert(auditLogs).values({
          userId: Number(ctx.user.id),
          action: "VEHICULE_CESSION",
          entityType: "vehicule",
          entityId: input.id,
          details: `Cession ${vehicule.immatriculation ?? "sans plaque"} : client ${vehicule.clientId ?? "aucun"} → ${input.clientId}. Motif : ${input.motif}`,
        } as any);
      });

      return { success: true, clientId: input.clientId };
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

      // LOT P0.1 — cette mutation est une CORRECTION MANUELLE, et elle est
      // légitime : `transfere_site2`, `abandonne_contentieux` et
      // `terminee_client_non_venu` sont des états qu'aucun flux de l'atelier
      // ne produit. Personne d'autre ne les posera.
      //
      // En revanche elle ne doit pas contredire un dossier ouvert : un agent
      // qui passe « en atelier » un véhicule dont le dossier est en
      // `PRET_A_LIVRER` effacerait l'information la plus utile du dossier.
      //
      //   - statut que le DÉROULEMENT sait produire et qui diffère du statut
      //     dérivé → refusé, le dossier a raison ;
      //   - statut HORS flux → accepté, mais avec motif obligatoire : le
      //     véhicule y restera jusqu'à la prochaine action de l'atelier.
      const derive = await resoudreStatutVehicule(db, input.id, ctx.user.agenceId);
      const posableALaMain = !STATUTS_DERIVABLES.includes(input.nouveauStatut as never);
      if (derive.source === "dossier" && !posableALaMain && derive.statut !== input.nouveauStatut) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Un dossier d'atelier est ouvert : son statut implique « ${STATUT_LABELS[derive.statut] ?? derive.statut} ». Faites avancer le dossier, ou choisissez un état hors flux (transféré, contentieux, client non venu).`,
        });
      }
      if (derive.source === "dossier" && posableALaMain && (input.motif ?? "").trim().length < 3) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Mettre un véhicule en état hors flux pendant qu'un dossier est ouvert exige un motif : il y restera jusqu'à la prochaine action de l'atelier.",
        });
      }

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
      // LOT 1 — projection du statut atelier → registre parking lié.
      await projeterParkingDepuisImmo(db, input.id, input.nouveauStatut);
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
