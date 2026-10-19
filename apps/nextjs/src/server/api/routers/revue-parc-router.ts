/**
 * ÉTAPE 7 — LA REVUE DE PARC.
 *
 * L'ordre du jour de la réunion du matin, servi en une requête.
 *
 *
 * POURQUOI UNE REQUÊTE DÉDIÉE ET NON UN ÉLARGISSEMENT DE `garage.vehicles`
 *
 * `garage.vehicles` ne joint que des tables parking : site, zone, place. Il ne
 * connaît ni le véhicule canonique, ni le dossier, ni les pièces, ni les
 * interventions. Ajouter tout cela à cette requête la rendrait illisible et la
 * chargerait pour les usages qui n'en ont pas besoin (la carte, l'export).
 *
 * Et surtout : ce fichier est partagé avec le module stock, en cours. Le
 * modifier, c'est risquer une collision. Une requête à part ne gêne personne.
 *
 *
 * CE QUE LA REVUE RÉPOND
 *
 * Dans l'ordre où l'agent pose les questions en réunion :
 *   plaque · client · phase · panne déclarée · diagnostic · devis
 *   · CE QUI BLOQUE · dernière intervention · technicien · priorité
 *   · jours au garage / promesse
 *
 * La colonne « ce qui bloque » vient de `revue-parc-service.ts` — la règle est
 * ailleurs, ici on ne fait que l'appliquer. Deux écrans qui recalculeraient
 * leurs blocages divergeraient, et l'agent ne saurait plus lequel croire.
 */

import { z } from "zod";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  parkingVehicles,
  vehicules,
  clients,
  ordresReparation,
  orDemandesPieces,
  orDemandesPiecesLignes,
  orRapportsDiagnostic,
  orInterventions,
  produits,
} from "@atelierone/db";
import { eq, and, desc, asc, sql, isNull, inArray } from "drizzle-orm";
import {
  blocages,
  enRetard,
  joursDeRetard,
  pretARendre,
  SEUIL_IMMOBILISATION_ALERTE_JOURS,
  type Blocage,
} from "~/server/lib/revue-parc-service";

/** Les statuts d'un dossier qui ne sont plus « en cours d'exploitation ». */
const OR_TERMINES = ["LIVRE", "ANNULE", "ferme_definitif"] as const;

/** Un dossier non terminal : c'est celui qui immobilise le véhicule. */
const OR_COURANT_SQL = sql`o.statut IS NOT NULL AND o.statut <> ALL(${sql.raw(`ARRAY[${OR_TERMINES.map((s) => `'${s}'`).join(",")}]::text[]`)})`;

export const revueParcRouter = createTRPCRouter({
  /**
   * La file de revue.
   *
   * `q` filtre comme la liste garage (une seule recherche, celle de
   * l'agent) ; `traines` isole ce qui traîne — la question du matin.
   */
  file: requirePermissionProcedure("parking.consulter")
    .input(
      z.object({
        q: z.string().max(100).optional(),
        traines: z.boolean().optional(),
        limite: z.number().int().max(300).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const aujourdhui = new Date();

      // ── Le dossier courant de chaque véhicule du registre ──
      const dossiers = await db
        .select({
          vehiculeId: ordresReparation.vehiculeId,
          orId: ordresReparation.id,
          numero: ordresReparation.numero,
          statut: ordresReparation.statut,
          priorite: ordresReparation.priorite,
          motEntree: ordresReparation.motEntree,
          pannesDeclarees: ordresReparation.pannesDeclarees,
          devisAccepte: ordresReparation.devisAccepte,
          datePromesse: ordresReparation.datePromesse,
          dateOuverture: ordresReparation.dateOuverture,
          totalTTC: ordresReparation.totalTTC,
          sousTraitanceStatut: ordresReparation.sousTraitanceStatut,
          sousTraitanceRetourPrevu: ordresReparation.sousTraitanceRetourPrevu,
          responsable: sql<{ nom: string | null } | null>`(
            (SELECT e.nom FROM employes e WHERE e.id = ${ordresReparation.responsableTechnicienId})
          )`,
        })
        .from(ordresReparation)
        .where(and(eq(ordresReparation.agenceId, ctx.user.agenceId), OR_COURANT_SQL))
        .orderBy(desc(ordresReparation.id))
        .then((rows) => {
          // Un dossier courant par véhicule : le plus récent gagne. Un véhicule
          // avec deux dossiers ouverts n'a pas deux statuts à afficher.
          const par = new Map<number, (typeof rows)[number]>();
          for (const r of rows) if (!par.has(r.vehiculeId)) par.set(r.vehiculeId, r);
          return par;
        });

      const orIds = [...dossiers.values()].map((d) => d.orId);

      // ── Les pièces manquantes, NOMMÉES ──
      //
      // Le statut parking disait « en attente de pièce » : treize lettres qui
      // ne disent rien. La revue demande « laquelle ? » — donc c'est le nom
      // de la pièce qui voyage, pas le statut.
      const pieces = orIds.length
        ? await db
            .select({
              orId: orDemandesPiecesLignes.demandeId,
              demandeOr: orDemandesPieces.orId,
              libelle: produits.designationCourte,
              motif: orDemandesPiecesLignes.motifManquant,
              statutDemande: orDemandesPieces.statut,
            })
            .from(orDemandesPiecesLignes)
            .innerJoin(orDemandesPieces, eq(orDemandesPieces.id, orDemandesPiecesLignes.demandeId))
            .leftJoin(produits, eq(produits.id, orDemandesPiecesLignes.produitId))
            .where(and(inArray(orDemandesPieces.orId, orIds), sql`${orDemandesPiecesLignes.manquant} = true`))
        : [];

      // ── Le diagnostic en cours ──
      const diagnostics = orIds.length
        ? await db
            .select({
              orId: orRapportsDiagnostic.orId,
              statut: orRapportsDiagnostic.statut,
              constat: orRapportsDiagnostic.constat,
            })
            .from(orRapportsDiagnostic)
            .where(inArray(orRapportsDiagnostic.orId, orIds))
        : [];

      // ── Le dernier constat, tous dossiers confondus ──
      const derniers = await db
        .select({
          vehiculeId: orInterventions.vehiculeId,
          constat: orInterventions.constat,
          intervention: orInterventions.intervention,
          suite: orInterventions.suite,
          createdAt: orInterventions.createdAt,
          libelle: sql<string>`(
            (SELECT l.libelle FROM lignes_ordre_reparation l WHERE l.id = ${orInterventions.ligneId})
          )`,
          technicien: sql<{ nom: string | null } | null>`(
            (SELECT e.nom FROM employes e WHERE e.id = ${orInterventions.technicienId})
          )`,
        })
        .from(orInterventions)
        .where(sql`${orInterventions.vehiculeId} IS NOT NULL`)
        .orderBy(desc(orInterventions.createdAt))
        .then((rows) => {
          const par = new Map<number, (typeof rows)[number]>();
          for (const r of rows) if (!par.has(r.vehiculeId)) par.set(r.vehiculeId, r);
          return par;
        });

      // ── Le registre ──
      const conditions = [eq(parkingVehicles.agenceId, ctx.user.agenceId)];
      if (input.q?.trim()) {
        const q = `%${input.q.trim()}%`;
        conditions.push(
          sql`(${parkingVehicles.immatriculation} ILIKE ${q}
                OR ${parkingVehicles.clientNom} ILIKE ${q}
                OR ${parkingVehicles.marque} ILIKE ${q}
                OR ${parkingVehicles.motif} ILIKE ${q}
                OR ${parkingVehicles.numRegistre}::text ILIKE ${q})`,
        );
      }

      const base = await db
        .select({
          id: parkingVehicles.id,
          numRegistre: parkingVehicles.numRegistre,
          immatriculation: parkingVehicles.immatriculation,
          marque: parkingVehicles.marque,
          modele: parkingVehicles.modele,
          statutParking: parkingVehicles.statut,
          motif: parkingVehicles.motif,
          dateEntree: parkingVehicles.dateEntree,
          vehiculeId: parkingVehicles.vehiculeId,
          clientNomParking: parkingVehicles.clientNom,
        })
        .from(parkingVehicles)
        .where(and(...conditions))
        .orderBy(asc(parkingVehicles.numRegistre))
        .limit(input.limite ?? 200);

      // Le nom du client vient de la FICHE, pas du registre : c'est le même
      // véhicule qui peut avoir une fiche client et un nom recopié, et les
      // deux divergent.
      const ids = base.map((b) => b.vehiculeId).filter((v): v is number => v != null);
      const fiches = ids.length
        ? await db
            .select({ id: vehicules.id, clientId: vehicules.clientId, statutImmobilisation: vehicules.statutImmobilisation })
            .from(vehicules)
            .where(inArray(vehicules.id, ids))
        : [];
      const nomsClients = fiches.length
        ? await db
            .select({ id: clients.id, nom: clients.nom })
            .from(clients)
            .where(inArray(clients.id, fiches.map((f) => f.clientId).filter((c): c is number => c != null)))
        : [];
      const nomParClient = new Map(nomsClients.map((c) => [c.id, c.nom]));
      const ficheParId = new Map(fiches.map((f) => [f.id, f]));

      const lignes = base.map((b) => {
        const vid = b.vehiculeId ?? -1;
        const d = dossiers.get(vid) ?? null;
        const fiche = b.vehiculeId != null ? ficheParId.get(b.vehiculeId) : undefined;
        const dernier = derniers.get(vid) ?? null;

        const jours = d?.dateOuverture
          ? Math.floor((aujourdhui.getTime() - new Date(d.dateOuverture).getTime()) / 86_400_000)
          : b.dateEntree
            ? Math.floor((aujourdhui.getTime() - new Date(b.dateEntree).getTime()) / 86_400_000)
            : null;

        const manquant = pieces.filter((p) => d && p.demandeOr === d.orId);
        const diag = diagnostics.find((x) => d && x.orId === d.orId) ?? null;

        const blocagesCalcules: Blocage[] = blocages({
          or: d
            ? {
                statut: d.statut,
                devisAccepte: d.devisAccepte,
                sousTraitanceStatut: d.sousTraitanceStatut,
                sousTraitanceRetourPrevu: d.sousTraitanceRetourPrevu,
              }
            : null,
          piecesManquantes: manquant.map((p) => ({ libelle: p.libelle ?? "pièce inconnue", motif: p.motif })),
          diagnostic: diag ? { statut: diag.statut } : null,
          resteDu: null,
          joursImmobilisation: jours,
        });

        return {
          id: b.id,
          vehiculeId: b.vehiculeId,
          numRegistre: b.numRegistre,
          immatriculation: b.immatriculation,
          marque: b.marque,
          modele: b.modele,
          // La PHASE se dit par le dossier quand il y en a un, et par le
          // registre sinon. Sans dossier, dire « EN_PARKING » ne renseignerait
          // personne : ça veut dire « pas encore reçu », pas « au repos ».
          phase: d?.statut ?? b.statutParking,
          enDossier: Boolean(d),
          aRendre: pretARendre(d?.statut),
          priorite: d?.priorite ?? null,
          pannesDeclarees: d?.pannesDeclarees ?? b.motif ?? null,
          diagnosticStatut: diag?.statut ?? null,
          diagnosticConstat: diag?.constat ?? null,
          devisAccepte: d?.devisAccepte ?? null,
          blocages: blocagesCalcules,
          // LA COLONNE DU MATIN : une phrase, ou « — » quand rien ne bloque.
          bloquePar: blocagesCalcules[0]?.libelle ?? null,
          dernierConstat: dernier,
          technicien: d?.responsable?.nom ?? null,
          datePromesse: d?.datePromesse ?? null,
          retardJours: joursDeRetard(d?.datePromesse ?? null, aujourdhui),
          enRetard: enRetard(d?.datePromesse ?? null, aujourdhui),
          jours,
          sousTraitance: d?.sousTraitanceStatut ?? null,
          clientNom:
            (fiche?.clientId != null ? nomParClient.get(fiche.clientId) : null) ??
            b.clientNomParking,
          dateEntree: b.dateEntree,
        };
      });

      // Le tri par défaut est l'ordre de la réunion : ce qui bloque, puis ce
      // qui est en retard, puis la priorité, puis le registre.
      const poids = (l: (typeof lignes)[number]) =>
        l.blocages[0]?.poids ?? (l.enRetard ? 0.5 : 9);
      const triees = lignes.sort((a, b) => {
        const pa = poids(a);
        const pb = poids(b);
        if (pa !== pb) return pa - pb;
        if (a.priorite !== b.priorite) return Number(a.priorite ?? 99) - Number(b.priorite ?? 99);
        return Number(a.numRegistre ?? 999) - Number(b.numRegistre ?? 999);
      });

      return input.traines
        ? triees.filter(
            (l) => l.enRetard || (l.jours != null && l.jours > SEUIL_IMMOBILISATION_ALERTE_JOURS),
          )
        : triees;
    }),
});