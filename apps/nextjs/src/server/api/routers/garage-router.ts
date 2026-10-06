// ─── MODULE PARKING & VÉHICULES IMMOBILISÉS (GPJ) — router tRPC ───────────────
// Lecture gated par parking.consulter ; mutations par permissions dédiées
// (parking.vehicule.creer/modifier, parking.alertes.gerer).
// Les placements passent par le moteur spatial (parking-spatial) : jamais de
// collision ni de véhicule hors zone. Les mouvements sont immuables (insert-only).
import { z } from "zod";
import { and, eq, isNull, isNotNull, inArray, asc, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, requirePermissionProcedure } from "~/server/api/trpc";
import {
  db,
  parkingSites,
  parkingZones,
  parkingSpots,
  parkingVehicles,
  parkingMovements,
  parkingAlerts,
  parkingTasks,
  parkingConfigs,
  auditLogs,
  type ParkingGeometry,
} from "@atelierone/db";
import {
  computeZoneOccupation,
  collisionsDansZone,
  DEFAULT_VEHICULE,
  type ZoneSpatial,
  type VehicleFootprintInput,
  type SpotSpatial,
  type RectGeom,
} from "~/server/lib/parking-spatial";
  import {
  MAX_CHAMPS_EXPORT,
  MAX_LIGNES_EXPORT,
  normaliserChampsExport,
} from "~/app/(dashboard)/dashboard/garage/_components/export-champs";
import {
  validerPlacement,
  empreinteVehicule,
  normaliserAngle,
  suggererPlacement,
  calculerCheminSortie,
  type Empreinte,
  type EchecPlacement,
  type ResultatPlacement,
  type Voisin,
  type ZonePlacement,
  type EmplacementOptionnel,
  type Polygone,
} from "@atelierone/geo";
import {
  computeParkingAlerts,
  DEFAULT_PARKING_CONFIG_SEUILS,
  type ParkingRuleConfig,
  type VehiculeAlertable,
} from "~/server/lib/parking-alerts";

export const STATUTS_VEHICULE = [
  "EN_PARKING",
  "EN_ATTENTE_DEVIS",
  "EN_ATTENTE_DIAGNOSTIC",
  "EN_ATTENTE_PIECE",
  "EN_TRAVAUX",
  "TERMINE_A_RECUPERER",
  "EN_VENTE",
  "ACCIDENTE",
  "A_TRANSFERER",
  "SORTI",
  "DONNEES_INCOMPLETES",
] as const;

const idSchema = z.object({ id: z.number() });
const dateInput = z.coerce.date().nullable().optional();

// Une photo = data URL base64 (même pattern que les produits / logo) + face.
// La date et l'auteur sont renseignés côté serveur à l'écriture.
const photoSchema = z.object({
  url: z.string().min(1).max(6_000_000),
  categorie: z.string().trim().max(50),
});

type VehiculeAlertableRow = Pick<
  typeof parkingVehicles.$inferSelect,
  | "id" | "numRegistre" | "statut" | "marque" | "modele" | "immatriculation"
  | "clientNom" | "dateEntree" | "dateDerniereAction" | "dateDevis"
  | "dateCommande" | "dateFinTravaux" | "dateDerniereRelance" | "createdAt"
>;

function vehiculeAlertable(v: VehiculeAlertableRow): VehiculeAlertable {
  return {
    id: v.id,
    numRegistre: v.numRegistre,
    statut: v.statut,
    marque: v.marque,
    modele: v.modele,
    immatriculation: v.immatriculation,
    clientNom: v.clientNom,
    dateEntree: v.dateEntree,
    dateDerniereAction: v.dateDerniereAction,
    dateDevis: v.dateDevis,
    dateCommande: v.dateCommande,
    dateFinTravaux: v.dateFinTravaux,
    dateDerniereRelance: v.dateDerniereRelance,
    createdAt: v.createdAt,
  };
}

async function chargerConfig(agenceId: number): Promise<ParkingRuleConfig> {
  const [cfg] = await db
    .select()
    .from(parkingConfigs)
    .where(eq(parkingConfigs.agenceId, agenceId))
    .limit(1);
  if (!cfg) return { ...DEFAULT_PARKING_CONFIG_SEUILS };
  return {
    seuilSansEvolutionJours: cfg.seuilSansEvolutionJours ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilSansEvolutionJours,
    seuilImmobilisationLongueJours: cfg.seuilImmobilisationLongueJours ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilImmobilisationLongueJours,
    seuilAttenteClientJours: cfg.seuilAttenteClientJours ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilAttenteClientJours,
    seuilAttentePieceJours: cfg.seuilAttentePieceJours ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilAttentePieceJours,
    seuilPretSortieJour: cfg.seuilPretSortieJour ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilPretSortieJour,
    seuilTransfertJours: cfg.seuilTransfertJours ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilTransfertJours,
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Complète les photos fournies par le client avec date + auteur (résolus serveur).
// Les champs sont typés optionnels car le input zod les infère ainsi.
function auteurPhotos(
  photos: { url?: string | null; categorie?: string | null }[] | undefined,
  user: { name?: string | null; email?: string | null },
): { url: string; categorie: string; date: string; auteur: string }[] {
  if (!photos || photos.length === 0) return [];
  const now = new Date().toISOString();
  const auteur = user.name ?? user.email ?? "Utilisateur";
  return photos.map((p) => ({ url: p.url ?? "", categorie: p.categorie ?? "AUTRE", date: now, auteur }));
}

// Colonnes dénormalisées miroir de `photos[0]` — évitent tout detoast jsonb au listing.
function photoMeta(
  photos: { categorie: string; date: string }[] | null | undefined,
): { photoPresente: boolean; photoCategorie: string | null; photoDate: string | null } {
  const first = photos?.[0];
  return {
    photoPresente: first != null,
    photoCategorie: first?.categorie ?? null,
    photoDate: first?.date ?? null,
  };
}

// ─── Géométries ───────────────────────────────────────────────────────────────
// Le moteur spatial ne manipule que des rectangles (RectGeom) ; le schéma stocke
// un union (ParkingGeometry). Le plan GPJ seedé est en rectangles uniquement.
function rectDeGeometrie(g: ParkingGeometry, label?: string): RectGeom {
  if (g.type === "polygon") {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${label ?? "Géométrie"} polygone non prise en charge pour le positionnement.` });
  }
  return g;
}
function rectSiPossible(g: ParkingGeometry): RectGeom | null {
  return g.type === "polygon" ? null : g;
}

/** Convertit une ParkingGeometry en polygone convexe (Vec2[]) pour @atelierone/geo. */
function zoneAPolygone(g: ParkingGeometry): Polygone {
  if (g.type === "rectangle") {
    return {
      points: [
        [g.x, g.y],
        [g.x + g.w, g.y],
        [g.x + g.w, g.y + g.h],
        [g.x, g.y + g.h],
      ],
    };
  }
  // Polygone stocké : `points` au format {x, y} ou [x, y].
  const points = (g.points as unknown[]).map((p) => {
    if (Array.isArray(p)) return [p[0] as number, p[1] as number] as [number, number];
    const o = p as { x: number; y: number };
    return [o.x, o.y] as [number, number];
  });
  return { points };
}

async function libererSpot(tx: Tx, spotId: number | null | undefined): Promise<void> {
  if (spotId == null) return;
  await tx
    .update(parkingSpots)
    .set({ bloque: false, reservePour: null, updatedAt: new Date() } as any)
    .where(eq(parkingSpots.id, spotId));
}

export const garageRouter = createTRPCRouter({
  // ── Vue d'ensemble (dashboard) ────────────────────────────────────────────
  overview: requirePermissionProcedure("parking.consulter").query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;

const [parStatut, nonPositionnes, alertes, sites, spots, vehParSite, zonesParSite, spotsParSite] = await Promise.all([
      // `statut` doit être dans le SELECT : la page tableau de bord groupe l'affichage par ce champ.
      db
        .select({ statut: parkingVehicles.statut, c: sql<number>`count(*)::int` })
        .from(parkingVehicles)
        .where(and(eq(parkingVehicles.agenceId, agenceId), sql`${parkingVehicles.statut} <> 'SORTI'`))
        .groupBy(parkingVehicles.statut),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(parkingVehicles)
        .where(and(eq(parkingVehicles.agenceId, agenceId), isNull(parkingVehicles.centreX), sql`${parkingVehicles.statut} <> 'SORTI'`)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(parkingAlerts)
        .where(and(eq(parkingAlerts.agenceId, agenceId), eq(parkingAlerts.statut, "OUVERTE"))),
      db.select().from(parkingSites).where(and(eq(parkingSites.agenceId, agenceId), eq(parkingSites.isActive, true))),
      // spotsParStatut : via la vue parking_spots_v (statut dérivé côté vue ;
      // la colonne parking_spots.statut du plan seedé n'est pas toujours fiable).
      (await db.execute(sql`
        SELECT statut, count(*)::int AS c FROM parking_spots_v
        WHERE agence_id = ${agenceId} GROUP BY statut
      `)) as unknown as { statut: string; c: number }[],
      db
        .select({ siteId: parkingVehicles.siteId, c: sql<number>`count(*)::int` })
        .from(parkingVehicles)
        .where(and(eq(parkingVehicles.agenceId, agenceId), sql`${parkingVehicles.statut} <> 'SORTI'`))
        .groupBy(parkingVehicles.siteId),
      db
        .select({ siteId: parkingZones.siteId, c: sql<number>`count(*)::int` })
        .from(parkingZones)
        .where(and(eq(parkingZones.agenceId, agenceId), eq(parkingZones.isActive, true)))
        .groupBy(parkingZones.siteId),
      db
        .select({
          siteId: parkingSpots.siteId,
          total: sql<number>`count(*)::int`,
          occupes: sql<number>`count(*) FILTER (WHERE ${parkingSpots.bloque} OR ${parkingSpots.reservePour} IS NOT NULL OR EXISTS (SELECT 1 FROM parking_vehicles v WHERE v.spot_id = parking_spots.id AND v.statut <> 'SORTI'))::int`,
        })
        .from(parkingSpots)
        .where(eq(parkingSpots.agenceId, agenceId))
        .groupBy(parkingSpots.siteId),
    ]);

    const vehParSiteMap: Record<string, number> = {};
    for (const r of vehParSite) if (r.siteId != null) vehParSiteMap[String(r.siteId)] = r.c;
    const zonesParSiteMap: Record<string, number> = {};
    for (const r of zonesParSite) if (r.siteId != null) zonesParSiteMap[String(r.siteId)] = r.c;
    const spotsParSiteMap: Record<string, { total: number; occupes: number }> = {};
    for (const r of spotsParSite) if (r.siteId != null) spotsParSiteMap[String(r.siteId)] = { total: r.total, occupes: r.occupes };

    const sitesDetail = sites.map((site) => {
      const o = spotsParSiteMap[String(site.id)];
      const total = o?.total ?? 0;
      return {
        id: site.id,
        code: site.code,
        nom: site.nom,
        isPrimary: site.isPrimary ?? false,
        nbVehicules: vehParSiteMap[String(site.id)] ?? 0,
        nbZones: zonesParSiteMap[String(site.id)] ?? 0,
        nbSpots: total,
        spotsOccupes: o?.occupes ?? 0,
        tauxOccupation: total > 0 ? Math.round(((o?.occupes ?? 0) / total) * 1000) / 10 : 0,
      };
    });

    const totalVehicules = parStatut.reduce((a, r) => a + r.c, 0);
    const spotsParStatut: Record<string, number> = {};
    for (const s of spots) spotsParStatut[s.statut] = (spotsParStatut[s.statut] ?? 0) + s.c;

    return {
      totalVehicules,
      nonPositionnes: nonPositionnes[0]?.c ?? 0,
      alertesOuvertes: alertes[0]?.c ?? 0,
      parStatut,
      spots: spotsParStatut,
      sites: sitesDetail,
    };
  }),

  // ── Sites & plan (carte) ──────────────────────────────────────────────────
  sites: requirePermissionProcedure("parking.consulter").query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;
    const rows = await db
      .select()
      .from(parkingSites)
      .where(and(eq(parkingSites.agenceId, agenceId), eq(parkingSites.isActive, true)))
      .orderBy(desc(parkingSites.isPrimary));
    return rows.map((s) => ({
      id: s.id,
      code: s.code,
      nom: s.nom,
      description: s.description,
      planLargeur: s.planLargeur ?? 100,
      planHauteur: s.planHauteur ?? 75,
      isPrimary: s.isPrimary ?? false,
    }));
  }),

  plan: requirePermissionProcedure("parking.consulter")
    .input(idSchema)
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const [site] = await db
        .select()
        .from(parkingSites)
        .where(and(eq(parkingSites.id, input.id), eq(parkingSites.agenceId, agenceId)))
        .limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site introuvable." });

      const [zones, spots, vehicles] = await Promise.all([
        db
          .select()
          .from(parkingZones)
          .where(and(eq(parkingZones.siteId, input.id), eq(parkingZones.isActive, true)))
          .orderBy(asc(parkingZones.ordre)),
        db.select().from(parkingSpots).where(eq(parkingSpots.siteId, input.id)).orderBy(asc(parkingSpots.ordre)),
        // Colonnes ciblees : le plan n'affiche jamais `photos` (jsonb base64).
        db
          .select({
            id: parkingVehicles.id,
            numRegistre: parkingVehicles.numRegistre,
            marque: parkingVehicles.marque,
            modele: parkingVehicles.modele,
            version: parkingVehicles.version,
            couleur: parkingVehicles.couleur,
            immatriculation: parkingVehicles.immatriculation,
            statut: parkingVehicles.statut,
            clientNom: parkingVehicles.clientNom,
            siteId: parkingVehicles.siteId,
            zoneId: parkingVehicles.zoneId,
            spotId: parkingVehicles.spotId,
            centreX: parkingVehicles.centreX,
            centreY: parkingVehicles.centreY,
            rotation: parkingVehicles.rotation,
            longueur: parkingVehicles.longueur,
            largeur: parkingVehicles.largeur,
            dimensionsEstimees: parkingVehicles.dimensionsEstimees,
          })
          .from(parkingVehicles)
          .where(and(eq(parkingVehicles.agenceId, agenceId), eq(parkingVehicles.siteId, input.id), sql`${parkingVehicles.statut} <> 'SORTI'`))
          .orderBy(asc(parkingVehicles.numRegistre)),
      ]);

      const zoneSpatialMap = new Map<number, ZoneSpatial>();
      for (const z of zones) {
        const r = rectSiPossible(z.geometrie);
        if (!r) continue;
        zoneSpatialMap.set(z.id, {
          id: z.id,
          geometrie: r,
          capaciteTheorique: z.capaciteTheorique ?? 0,
          surfaceStationnable: z.surfaceStationnable ?? 0,
          orientationAutorisee: z.orientationAutorisee,
          margeSecurite: z.margeSecurite ?? 0.3,
          stationnable: z.stationnable ?? true,
          placeParking: z.placeParking ?? false,
        });
      }

      const vehiclesJson = vehicles.map((v) => ({
        id: v.id,
        numRegistre: v.numRegistre,
        marque: v.marque,
        modele: v.modele,
        version: v.version,
        couleur: v.couleur,
        immatriculation: v.immatriculation,
        statut: v.statut,
        clientNom: v.clientNom,
        siteId: v.siteId,
        zoneId: v.zoneId,
        spotId: v.spotId,
        centreX: v.centreX,
        centreY: v.centreY,
        rotation: v.rotation ?? 0,
        longueur: v.longueur,
        largeur: v.largeur,
        dimensionsEstimees: v.dimensionsEstimees ?? false,
      }));

      const occupations = new Map<number, unknown>();
      const collisions = new Set<string>();
      for (const zone of zones) {
        const zs = zoneSpatialMap.get(zone.id)!;
        const vehiculesZone: VehicleFootprintInput[] = vehicles
          .filter((v) => v.zoneId === zone.id && v.centreX != null && v.centreY != null)
          .map((v) => ({
            id: v.id,
            longueur: v.longueur,
            largeur: v.largeur,
            centreX: v.centreX,
            centreY: v.centreY,
            rotation: v.rotation ?? 0,
            dimensionsEstimees: v.dimensionsEstimees ?? true,
          }));
        occupations.set(zone.id, computeZoneOccupation(zs, vehiculesZone));
        for (const col of collisionsDansZone(zs, vehiculesZone, 0)) {
          collisions.add(`${col.a}:${col.b}`);
        }
      }

      return {
        site: {
          id: site.id,
          code: site.code,
          nom: site.nom,
          planLargeur: site.planLargeur ?? 100,
          planHauteur: site.planHauteur ?? 75,
        },
        zones: zones.map((z) => ({
          id: z.id,
          code: z.code,
          nom: z.nom,
          type: z.type,
          geometrie: z.geometrie,
          capaciteTheorique: z.capaciteTheorique ?? 0,
          surfaceStationnable: z.surfaceStationnable ?? 0,
          orientationAutorisee: z.orientationAutorisee,
          margeSecurite: z.margeSecurite ?? 0.3,
          stationnable: z.stationnable ?? true,
          placeParking: z.placeParking ?? false,
          ressourceTravail: z.ressourceTravail ?? false,
          occupation: occupations.get(z.id) ?? null,
        })),
spots: spots.map((s) => {
            // Use the parking_spots_v view logic for statut
            // Since we're selecting from parkingSpots table directly, we need to compute statut
            // For now, we'll compute it based on the presence of a vehicle
            // In production, you'd want to use the parking_spots_v view
            const isOccupe = s.statut === "OCCUPE" || s.statut === "RESERVE" || s.statut === "BLOQUE"; // fallback for old data
            return {
              id: s.id,
              code: s.code,
              zoneId: s.zoneId,
              geometrie: s.geometrie,
              statut: s.bloque ? "BLOQUE" : (s.reservePour != null ? "RESERVE" : (isOccupe ? "OCCUPE" : "LIBRE")),
              rotation: s.rotation ?? 0,
              ordre: s.ordre ?? 0,
            };
          }),
        vehicules: vehiclesJson,
        vehiculesNonPositionnes: vehicles
          .filter((v) => v.centreX == null || v.centreY == null)
          .map((v) => ({ id: v.id, numRegistre: v.numRegistre, marque: v.marque, modele: v.modele, statut: v.statut })),
        collisions: Array.from(collisions).map((c) => c.split(":")),
      };
    }),

  prochainNumero: requirePermissionProcedure("parking.vehicule.creer").query(async ({ ctx }) => {
    const [row] = await db
      .select({ max: sql<number>`coalesce(max(${parkingVehicles.numRegistre}), 0)` })
      .from(parkingVehicles)
      .where(eq(parkingVehicles.agenceId, ctx.user.agenceId));
    return { prochain: (row?.max ?? 0) + 1 };
  }),

  // ── Véhicules ─────────────────────────────────────────────────────────────
  vehicles: requirePermissionProcedure("parking.consulter")
    .input(
      z.object({
        search: z.string().max(100).optional(),
        statut: z.string().optional(),
        siteId: z.number().optional(),
        nonPositionnes: z.boolean().optional(),
        limit: z.number().min(1).max(200).default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const conditions = [eq(parkingVehicles.agenceId, agenceId)];
      if (input.statut && STATUTS_VEHICULE.includes(input.statut as (typeof STATUTS_VEHICULE)[number])) {
        conditions.push(eq(parkingVehicles.statut, input.statut));
      } else if (!input.statut) {
        conditions.push(sql`${parkingVehicles.statut} <> 'SORTI'`);
      }
      if (input.siteId) conditions.push(eq(parkingVehicles.siteId, input.siteId));
      if (input.nonPositionnes && input.nonPositionnes === true) {
        conditions.push(isNull(parkingVehicles.centreX));
      }
      if (input.search && input.search.trim().length > 0) {
        const q = `%${input.search.trim().toLowerCase()}%`;
        conditions.push(
          sql`(lower(${parkingVehicles.marque}) like ${q} or lower(${parkingVehicles.modele}) like ${q}
            or lower(${parkingVehicles.immatriculation}) like ${q} or lower(${parkingVehicles.clientNom}) like ${q}
            or ${parkingVehicles.numRegistre}::text like ${q} or ${parkingVehicles.numRegistre}::text = ${input.search.trim()})`,
        );
      }

      // Ne jamais charger la colonne `photos` (jsonb base64, jusqu'a ~11 Mo au
      // total) ici : la liste n'affiche qu'une vignette servie par
      // /api/parking/photo. Les metadonnees sont denormalisees dans des colonnes
      // (photo_presente/photo_categorie/photo_date) pour eviter tout detoast jsonb.
      const rows = await db
        .select({
          id: parkingVehicles.id,
          numRegistre: parkingVehicles.numRegistre,
          marque: parkingVehicles.marque,
          modele: parkingVehicles.modele,
          version: parkingVehicles.version,
          couleur: parkingVehicles.couleur,
          immatriculation: parkingVehicles.immatriculation,
          clientNom: parkingVehicles.clientNom,
          clientTelephone: parkingVehicles.clientTelephone,
          statut: parkingVehicles.statut,
          motif: parkingVehicles.motif,
          siteId: parkingVehicles.siteId,
          zoneId: parkingVehicles.zoneId,
          spotId: parkingVehicles.spotId,
          centreX: parkingVehicles.centreX,
          centreY: parkingVehicles.centreY,
          dateEntree: parkingVehicles.dateEntree,
          dateDerniereAction: parkingVehicles.dateDerniereAction,
          dateDerniereRelance: parkingVehicles.dateDerniereRelance,
          photoPresente: parkingVehicles.photoPresente,
          photoCategorie: parkingVehicles.photoCategorie,
          photoDate: parkingVehicles.photoDate,
        })
        .from(parkingVehicles)
        .where(and(...conditions))
        .orderBy(asc(parkingVehicles.numRegistre))
        .limit(input.limit);

      const [alertes] = await Promise.all([
        db
          .select({
            vehicleId: parkingAlerts.vehicleId,
            code: parkingAlerts.code,
            niveau: parkingAlerts.niveau,
            statut: parkingAlerts.statut,
          })
          .from(parkingAlerts)
          .where(and(
            eq(parkingAlerts.agenceId, agenceId),
            eq(parkingAlerts.statut, "OUVERTE"),
            rows.length > 0 ? inArray(parkingAlerts.vehicleId, rows.map((r) => r.id)) : sql`false`,
          )),
      ]);

      const alertesParVehicle = new Map<number, { code: string; niveau: string }[]>();
      for (const a of alertes) {
        const liste = alertesParVehicle.get(a.vehicleId) ?? [];
        liste.push({ code: a.code, niveau: a.niveau ?? "INFO" });
        alertesParVehicle.set(a.vehicleId, liste);
      }

      return {
        total: rows.length,
        vehicules: rows.map((v) => ({
          id: v.id,
          numRegistre: v.numRegistre,
          marque: v.marque,
          modele: v.modele,
          version: v.version,
          couleur: v.couleur,
          immatriculation: v.immatriculation,
          clientNom: v.clientNom,
          clientTelephone: v.clientTelephone,
          statut: v.statut,
          motif: v.motif,
          siteId: v.siteId,
          zoneId: v.zoneId,
          spotId: v.spotId,
          centreX: v.centreX,
          centreY: v.centreY,
          dateEntree: v.dateEntree,
          dateDerniereAction: v.dateDerniereAction,
          dateDerniereRelance: v.dateDerniereRelance,
          photo: v.photoPresente
            ? {
                url: `/api/parking/photo/${v.id}/0?w=160${v.photoDate ? `&v=${encodeURIComponent(v.photoDate)}` : ""}`,
                categorie: v.photoCategorie ?? "AUTRE",
              }
            : null,
          alertes: alertesParVehicle.get(v.id) ?? [],
        })),
      };
    }),

  vehicule: requirePermissionProcedure("parking.consulter")
    .input(idSchema)
    .query(async ({ ctx, input }) => {
      const [v] = await db
        .select()
        .from(parkingVehicles)
        .where(and(eq(parkingVehicles.id, input.id), eq(parkingVehicles.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!v) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });

      const [mouvements, alertes, taches] = await Promise.all([
        db
          .select()
          .from(parkingMovements)
          .where(eq(parkingMovements.vehicleId, input.id))
          .orderBy(desc(parkingMovements.horodatage))
          .limit(100),
        db
          .select()
          .from(parkingAlerts)
          .where(and(eq(parkingAlerts.vehicleId, input.id), eq(parkingAlerts.agenceId, ctx.user.agenceId)))
          .orderBy(desc(parkingAlerts.declencheeLe))
          .limit(50),
        db
          .select()
          .from(parkingTasks)
          .where(eq(parkingTasks.vehicleId, input.id))
          .orderBy(desc(parkingTasks.createdAt))
          .limit(50),
      ]);

      return {
        vehicule: {
          ...v,
          alertes,
          hasAlertes: alertes.length > 0,
        },
        mouvements,
        taches,
      };
    }),

  /**
   * Photos d'un seul vehicule, sans le reste de la fiche (alertes, mouvements,
   * taches). La liste n'embarque qu'une vignette par vehicule : on ne charge le
   * tableau complet qu'a l'ouverture de la visionneuse, et seulement pour la
   * ligne demandee.
   */
  /**
   * Donnees d'export du registre vehicules.
   *
   * Volontairement distincte de `vehicles` : ici on ne joint QUE les champs
   * reellement demandes (projection ecrite en dur, jamais un nom de colonne venu
   * du client), et les photos sont traitees a part pour ne pas peser sur le
   * transfert quand l'utilisateur n'en veut pas.
   */
  exportVehicules: requirePermissionProcedure("parking.vehicule.exporter")
    .input(
      z.object({
        champs: z.array(z.string()).max(MAX_CHAMPS_EXPORT).default([]),
        search: z.string().max(100).optional(),
        statut: z.string().optional(),
        siteId: z.number().optional(),
        nonPositionnes: z.boolean().optional(),
        includeSortis: z.boolean().default(false),
        withPhotos: z.boolean().default(false),
        limit: z.number().min(1).max(MAX_LIGNES_EXPORT).default(MAX_LIGNES_EXPORT),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const champs = normaliserChampsExport(input.champs);
      if (champs.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune colonne valide sélectionnée." });
      }

      const conditions = [eq(parkingVehicles.agenceId, agenceId)];
      if (input.statut && STATUTS_VEHICULE.includes(input.statut as (typeof STATUTS_VEHICULE)[number])) {
        conditions.push(eq(parkingVehicles.statut, input.statut));
      } else if (!input.includeSortis) {
        conditions.push(sql`${parkingVehicles.statut} <> 'SORTI'`);
      }
      if (input.siteId) conditions.push(eq(parkingVehicles.siteId, input.siteId));
      if (input.nonPositionnes) conditions.push(isNull(parkingVehicles.centreX));
      if (input.search && input.search.trim().length > 0) {
        const q = `%${input.search.trim().toLowerCase()}%`;
        conditions.push(
          sql`(lower(${parkingVehicles.marque}) like ${q} or lower(${parkingVehicles.modele}) like ${q}
            or lower(${parkingVehicles.immatriculation}) like ${q} or lower(${parkingVehicles.clientNom}) like ${q}
            or ${parkingVehicles.numRegistre}::text like ${q} or ${parkingVehicles.numRegistre}::text = ${input.search.trim()})`,
        );
      }

      // Les noms de site / zone / emplacement sont resolus par jointure : le
      // fichier doit etre lisible, pas un tableau d'identifiants.
      const rows = await db
        .select({
          id: parkingVehicles.id,
          numRegistre: parkingVehicles.numRegistre,
          immatriculation: parkingVehicles.immatriculation,
          marque: parkingVehicles.marque,
          modele: parkingVehicles.modele,
          version: parkingVehicles.version,
          couleur: parkingVehicles.couleur,
          vin: parkingVehicles.vin,
          clientNom: parkingVehicles.clientNom,
          clientTelephone: parkingVehicles.clientTelephone,
          statut: parkingVehicles.statut,
          motif: parkingVehicles.motif,
          provenance: parkingVehicles.provenance,
          centreX: parkingVehicles.centreX,
          centreY: parkingVehicles.centreY,
          rotation: parkingVehicles.rotation,
          longueur: parkingVehicles.longueur,
          largeur: parkingVehicles.largeur,
          hauteur: parkingVehicles.hauteur,
          poids: parkingVehicles.poids,
          dimensionsEstimees: parkingVehicles.dimensionsEstimees,
          dateEntree: parkingVehicles.dateEntree,
          dateDerniereAction: parkingVehicles.dateDerniereAction,
          dateDevis: parkingVehicles.dateDevis,
          dateCommande: parkingVehicles.dateCommande,
          dateFinTravaux: parkingVehicles.dateFinTravaux,
          dateDerniereRelance: parkingVehicles.dateDerniereRelance,
          notes: parkingVehicles.notes,
          nbPhotos: sql<number>`COALESCE(jsonb_array_length(${parkingVehicles.photos}), 0)::int`,
          site: parkingSites.nom,
          zone: parkingZones.nom,
          spot: parkingSpots.code,
        })
        .from(parkingVehicles)
        .leftJoin(parkingSites, eq(parkingSites.id, parkingVehicles.siteId))
        .leftJoin(parkingZones, eq(parkingZones.id, parkingVehicles.zoneId))
        .leftJoin(parkingSpots, eq(parkingSpots.id, parkingVehicles.spotId))
        .where(and(...conditions))
        .orderBy(asc(parkingVehicles.numRegistre))
        .limit(input.limit);

      // Photos : chargees seulement si demandees, et seulement pour les lignes
      // effectivement renvoyees.
      let photosParId = new Map<number, { url: string; categorie: string; date?: string; auteur?: string }[]>();
      if (input.withPhotos && rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const lot = 100;
        for (let i = 0; i < ids.length; i += lot) {
          const tranche = ids.slice(i, i + lot);
          const avecPhotos = await db
            .select({ id: parkingVehicles.id, photos: parkingVehicles.photos })
            .from(parkingVehicles)
            .where(and(eq(parkingVehicles.agenceId, agenceId), inArray(parkingVehicles.id, tranche)));
          for (const v of avecPhotos) {
            if (v.photos && v.photos.length > 0) photosParId.set(v.id, v.photos);
          }
        }
        console.info("[ATELIERONE_EXPORT_PHOTOS_SERVER]", {
          requested: rows.length,
          withPhotosLoaded: photosParId.size,
          totalPhotos: Array.from(photosParId.values()).reduce((a, b) => a + b.length, 0),
          sampleVehicleIds: Array.from(photosParId.keys()).slice(0, 5),
        });
      }

      // Un export de donnees personnelles est trace dans le journal d'audit.
      // Volontairement non bloquant : l'utilisateur a deja la permission requise,
      // un journal indisponible ne doit pas le priver de son export.
      try {
        await db.insert(auditLogs).values({
          // `ExtendedUser.id` est un string alors que `audit_logs.user_id` est un
      // entier : on convertit plutot que de laisser Postgres deviner.
          userId: ctx.user?.id != null ? Number(ctx.user.id) : null,
          action: "parking.vehicules.export",
          entityType: "parking_vehicule",
          details: JSON.stringify({
            champs,
            lignes: rows.length,
            filtres: { statut: input.statut ?? null, siteId: input.siteId ?? null, recherche: input.search ?? null },
            includeSortis: input.includeSortis,
            withPhotos: input.withPhotos,
          }),
        } as any);
      } catch {
        // Journal indisponible : on n'annule pas l'export pour autant.
      }

      return {
        champs,
        tronque: rows.length >= input.limit,
        total: rows.length,
        vehicules: rows.map((r) => ({
          ...r,
          photos: input.withPhotos ? (photosParId.get(r.id) ?? []) : [],
        })),
      };
    }),

  vehiculePhotos: requirePermissionProcedure("parking.consulter")
    .input(idSchema)
    .query(async ({ ctx, input }) => {
      const [v] = await db
        .select({ photos: parkingVehicles.photos })
        .from(parkingVehicles)
        .where(and(eq(parkingVehicles.id, input.id), eq(parkingVehicles.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!v) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });
      return { photos: v.photos ?? [] };
    }),

  create: requirePermissionProcedure("parking.vehicule.creer")
    .input(
      z.object({
        numRegistre: z.number().int().min(1).optional(),
        marque: z.string().trim().max(100).optional(),
        modele: z.string().trim().max(255).optional(),
        version: z.string().trim().max(255).optional(),
        couleur: z.string().trim().max(50).optional(),
        immatriculation: z.string().trim().max(50).optional(),
        vin: z.string().trim().max(100).optional(),
        clientNom: z.string().trim().max(255).optional(),
        clientTelephone: z.string().trim().max(50).optional(),
        statut: z.enum(STATUTS_VEHICULE).optional(),
        motif: z.string().trim().max(2000).optional(),
        longueur: z.number().positive().optional(),
        largeur: z.number().positive().optional(),
        hauteur: z.number().positive().optional(),
        poids: z.number().positive().optional(),
        dimensionsEstimees: z.boolean().optional(),
        provenance: z.string().trim().max(5000).optional(),
        notes: z.string().trim().max(5000).optional(),
        photos: z.array(photoSchema).max(6).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;

      let numRegistre = input.numRegistre;
      if (numRegistre == null) {
        const [row] = await db
          .select({ max: sql<number>`coalesce(max(${parkingVehicles.numRegistre}), 0)` })
          .from(parkingVehicles)
          .where(eq(parkingVehicles.agenceId, agenceId));
        numRegistre = (row?.max ?? 0) + 1;
        if (numRegistre === 33) numRegistre = 34;
      }
      if (numRegistre === 33) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Le numéro 33 n'existe pas dans le registre GPJ." });
      }
      const [dup] = await db
        .select({ id: parkingVehicles.id })
        .from(parkingVehicles)
        .where(and(eq(parkingVehicles.agenceId, agenceId), eq(parkingVehicles.numRegistre, numRegistre)))
        .limit(1);
      if (dup) throw new TRPCError({ code: "CONFLICT", message: `Numéro de registre déjà utilisé : ${numRegistre}.` });

      const photos = auteurPhotos(input.photos, ctx.user);
      const [created] = await db
        .insert(parkingVehicles)
        .values({
          agenceId,
          numRegistre,
          marque: input.marque ?? null,
          modele: input.modele ?? null,
          version: input.version ?? null,
          couleur: input.couleur ?? null,
          immatriculation: input.immatriculation ?? null,
          vin: input.vin ?? null,
          clientNom: input.clientNom ?? null,
          clientTelephone: input.clientTelephone ?? null,
          statut: input.statut ?? "EN_PARKING",
          motif: input.motif ?? null,
          longueur: input.longueur ?? null,
          largeur: input.largeur ?? null,
          hauteur: input.hauteur ?? null,
          poids: input.poids ?? null,
          dimensionsEstimees: input.dimensionsEstimees ?? (input.longueur != null || input.largeur != null),
          provenance: input.provenance ?? null,
          notes: input.notes ?? null,
          photos,
          ...photoMeta(photos),
        } as any)
        .returning();

      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Échec de création du véhicule : aucune ligne retournée.",
        });
      }

      await db.insert(parkingMovements).values({
        agenceId,
        vehicleId: created.id,
        userId: Number(ctx.user.id),
        type: "ENTREE",
        motif: input.motif ?? input.provenance ?? null,
          commentaire: "Entrée au registre des véhicules immobilisés",
        } as any);

      return { id: created.id, numRegistre: created.numRegistre };
    }),

  update: requirePermissionProcedure("parking.vehicule.modifier")
    .input(
      z.object({
        id: z.number(),
        marque: z.string().trim().max(100).nullish(),
        modele: z.string().trim().max(255).nullish(),
        version: z.string().trim().max(255).nullish(),
        couleur: z.string().trim().max(50).nullish(),
        immatriculation: z.string().trim().max(50).nullish(),
        vin: z.string().trim().max(100).nullish(),
        clientNom: z.string().trim().max(255).nullish(),
        clientTelephone: z.string().trim().max(50).nullish(),
        statut: z.enum(STATUTS_VEHICULE).optional(),
        motif: z.string().trim().max(2000).nullish(),
        notes: z.string().trim().max(5000).nullish(),
        longueur: z.number().positive().nullish(),
        largeur: z.number().positive().nullish(),
        hauteur: z.number().positive().nullish(),
        poids: z.number().positive().nullish(),
        provenance: z.string().trim().max(5000).nullish(),
        dateEntree: dateInput,
        dateDevis: dateInput,
        dateCommande: dateInput,
        dateFinTravaux: dateInput,
        dateDerniereRelance: dateInput,
        dateDerniereAction: dateInput,
        photos: z.array(photoSchema).max(6).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select()
        .from(parkingVehicles)
        .where(and(eq(parkingVehicles.id, input.id), eq(parkingVehicles.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });

      const statutChange = input.statut !== undefined && input.statut !== existing.statut;
      const dateDerniereAction = input.dateDerniereAction !== undefined
        ? input.dateDerniereAction
        : statutChange
          ? new Date()
          : existing.dateDerniereAction;

      const photos = input.photos !== undefined ? auteurPhotos(input.photos, ctx.user) : existing.photos;
      const [updated] = await db
        .update(parkingVehicles)
        .set({
          marque: input.marque !== undefined ? input.marque : existing.marque,
          modele: input.modele !== undefined ? input.modele : existing.modele,
          version: input.version !== undefined ? input.version : existing.version,
          couleur: input.couleur !== undefined ? input.couleur : existing.couleur,
          immatriculation: input.immatriculation !== undefined ? input.immatriculation : existing.immatriculation,
          vin: input.vin !== undefined ? input.vin : existing.vin,
          clientNom: input.clientNom !== undefined ? input.clientNom : existing.clientNom,
          clientTelephone: input.clientTelephone !== undefined ? input.clientTelephone : existing.clientTelephone,
          statut: input.statut ?? existing.statut,
          motif: input.motif !== undefined ? input.motif : existing.motif,
          notes: input.notes !== undefined ? input.notes : existing.notes,
          longueur: input.longueur !== undefined ? input.longueur : existing.longueur,
          largeur: input.largeur !== undefined ? input.largeur : existing.largeur,
          hauteur: input.hauteur !== undefined ? input.hauteur : existing.hauteur,
          poids: input.poids !== undefined ? input.poids : existing.poids,
          provenance: input.provenance !== undefined ? input.provenance : existing.provenance,
          dateEntree: input.dateEntree !== undefined ? input.dateEntree : existing.dateEntree,
          dateDevis: input.dateDevis !== undefined ? input.dateDevis : existing.dateDevis,
          dateCommande: input.dateCommande !== undefined ? input.dateCommande : existing.dateCommande,
          dateFinTravaux: input.dateFinTravaux !== undefined ? input.dateFinTravaux : existing.dateFinTravaux,
          dateDerniereRelance: input.dateDerniereRelance !== undefined ? input.dateDerniereRelance : existing.dateDerniereRelance,
          dateDerniereAction,
          photos,
          ...photoMeta(photos),
          updatedAt: new Date(),
        } as any)
        .where(eq(parkingVehicles.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Échec de mise à jour du véhicule #${input.id} : aucune ligne retournée.`,
        });
      }

      return { id: updated.id, statutChange };
    }),

  place: requirePermissionProcedure("parking.vehicule.modifier")
    .input(
      z.object({
        vehicleId: z.number(),
        zoneId: z.number(),
        spotId: z.number().optional(),
        centreX: z.number().optional(),
        centreY: z.number().optional(),
        rotation: z.number().optional(),
        motif: z.string().trim().max(2000).optional(),
        margin: z.number().nonnegative().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;

      const [vehicle] = await db
        .select()
        .from(parkingVehicles)
        .where(and(eq(parkingVehicles.id, input.vehicleId), eq(parkingVehicles.agenceId, agenceId)))
        .limit(1);
      if (!vehicle) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });

      const [zone] = await db
        .select()
        .from(parkingZones)
        .where(and(eq(parkingZones.id, input.zoneId), eq(parkingZones.agenceId, agenceId)))
        .limit(1);
      if (!zone) throw new TRPCError({ code: "NOT_FOUND", message: "Zone introuvable." });

      const zoneSpatial: ZoneSpatial = {
        id: zone.id,
        geometrie: rectDeGeometrie(zone.geometrie, `Zone ${zone.code}`),
        capaciteTheorique: zone.capaciteTheorique ?? 0,
        surfaceStationnable: zone.surfaceStationnable ?? 0,
        orientationAutorisee: zone.orientationAutorisee,
        margeSecurite: zone.margeSecurite ?? 0.3,
        stationnable: zone.stationnable ?? true,
        placeParking: zone.placeParking ?? false,
      };

      let x = input.centreX;
      let y = input.centreY;
      let rotation = input.rotation ?? 0;
      const autreVehicules: VehicleFootprintInput[] = [];

      const vehiculesZone = await db
        .select({
          id: parkingVehicles.id,
          longueur: parkingVehicles.longueur,
          largeur: parkingVehicles.largeur,
          centreX: parkingVehicles.centreX,
          centreY: parkingVehicles.centreY,
          rotation: parkingVehicles.rotation,
          dimensionsEstimees: parkingVehicles.dimensionsEstimees,
        })
        .from(parkingVehicles)
        .where(and(
          eq(parkingVehicles.agenceId, agenceId),
          eq(parkingVehicles.zoneId, zone.id),
          sql`${parkingVehicles.statut} <> 'SORTI'`,
          isNotNull(parkingVehicles.centreX),
        ));
      for (const o of vehiculesZone) {
        if (o.id === vehicle.id) continue;
        autreVehicules.push({
          id: o.id,
          longueur: o.longueur,
          largeur: o.largeur,
          centreX: o.centreX,
          centreY: o.centreY,
          rotation: o.rotation ?? 0,
          dimensionsEstimees: o.dimensionsEstimees ?? true,
        });
      }

      let spotSpatial: SpotSpatial | null = null;
      if (input.spotId) {
        const [spot] = await db
          .select()
          .from(parkingSpots)
          .where(and(eq(parkingSpots.id, input.spotId), eq(parkingSpots.zoneId, zone.id)))
          .limit(1);
        if (!spot) throw new TRPCError({ code: "NOT_FOUND", message: "Emplacement introuvable dans cette zone." });
        if (vehicle.spotId !== spot.id && spot.statut !== "LIBRE") {
          throw new TRPCError({ code: "CONFLICT", message: `Emplacement ${spot.code} non disponible (${spot.statut}).` });
        }
        const rectSpot = rectDeGeometrie(spot.geometrie, `Emplacement ${spot.code}`);
        spotSpatial = {
          id: spot.id,
          zoneId: spot.zoneId,
          geometrie: rectSpot,
          statut: spot.statut,
          rotation: spot.rotation ?? 0,
        };
        x = rectSpot.x + (input.margin ?? zoneSpatial.margeSecurite ?? 0);
        y = rectSpot.y + (input.margin ?? zoneSpatial.margeSecurite ?? 0);
        rotation = spot.rotation ?? rotation;
      }
      if (x == null || y == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Position (x, y) requise." });
      }

      // Conversion coin -> centre (ancienne convention -> nouvelle convention centre)
      const cx = x + (vehicle.largeur ?? 0) / 2;
      const cy = y + (vehicle.longueur ?? 0) / 2;

      // Construction des voisins au format nouveau (centre)
      const voisins: Voisin[] = autreVehicules.map((v) => ({
        id: v.id!,
        empreinte: empreinteVehicule({
          centreX: (v.centreX ?? 0) + (v.largeur ?? 0) / 2,
          centreY: (v.centreY ?? 0) + (v.longueur ?? 0) / 2,
          rotation: v.rotation ?? 0,
          longueur: v.longueur,
          largeur: v.largeur,
        }),
      }));

      // Emplacement optionnel
      let emplacementOpt: EmplacementOptionnel | null = null;
      if (spotSpatial) {
        const rectSpot = spotSpatial.geometrie;
        emplacementOpt = {
          polygone: { points: [
            [rectSpot.x, rectSpot.y],
            [rectSpot.x + rectSpot.w, rectSpot.y],
            [rectSpot.x + rectSpot.w, rectSpot.y + rectSpot.h],
            [rectSpot.x, rectSpot.y + rectSpot.h],
          ]},
          rotation: spotSpatial.rotation ?? 0,
        };
      }

      const zonePolygone: Polygone = zoneSpatial.geometrie.type === "rectangle"
        ? { points: [
            [zoneSpatial.geometrie.x, zoneSpatial.geometrie.y],
            [zoneSpatial.geometrie.x + zoneSpatial.geometrie.w, zoneSpatial.geometrie.y],
            [zoneSpatial.geometrie.x + zoneSpatial.geometrie.w, zoneSpatial.geometrie.y + zoneSpatial.geometrie.h],
            [zoneSpatial.geometrie.x, zoneSpatial.geometrie.y + zoneSpatial.geometrie.h],
          ]}
        : (zoneSpatial.geometrie as unknown as Polygone);

      const validation = validerPlacement({
        vehicule: { id: vehicle.id, longueur: vehicle.longueur, largeur: vehicle.largeur },
        cx,
        cy,
        rotation: normaliserAngle(rotation),
        zone: {
          polygone: zonePolygone,
          stationnable: zoneSpatial.stationnable,
          orientationAutorisee: zoneSpatial.orientationAutorisee,
          marge: input.margin ?? zoneSpatial.margeSecurite ?? 0,
        },
        emplacement: emplacementOpt,
        voisins,
      });

      if (validation.ok === false) {
        const messages: Record<string, string> = {
          ZONE_NON_STATIONNABLE: "Cette zone n'est pas stationnable.",
          ORIENTATION_NON_AUTORISEE: "Orientation non autorisée dans cette zone.",
          HORS_ZONE: `L'empreinte du véhicule sort de la zone (dépassement ${validation.echecs.find(e => e.code === 'HORS_ZONE')?.depassementM?.toFixed(2) ?? ''} m).`,
          COLLISION: `Collision avec le(s) véhicule(s) ${validation.echecs.find(e => e.code === 'COLLISION')?.vehicules?.join(', ') ?? ''}.`,
          EMPLACEMENT_TROP_PETIT: "L'emplacement est trop petit pour ce véhicule.",
        };
        const firstEchec = validation.echecs[0];
        if (!firstEchec) throw new TRPCError({ code: "CONFLICT", message: "Placement impossible." });
        throw new TRPCError({ code: "CONFLICT", message: messages[firstEchec.code] ?? "Placement impossible." });
      }

      // Conversion centre -> coin pour stockage (compatibilité BDD actuelle)
      const newX = validation.empreinte.cx - (vehicle.largeur ?? 0) / 2;
      const newY = validation.empreinte.cy - (vehicle.longueur ?? 0) / 2;
      const newRotation = validation.empreinte.rotation;

      const ancienSpotId = vehicle.spotId;
      await db.transaction(async (tx) => {
        await tx
          .update(parkingVehicles)
          .set({
            siteId: zone.siteId,
            zoneId: zone.id,
            spotId: spotSpatial ? spotSpatial.id : null,
            centreX: newX,
            centreY: newY,
            rotation: newRotation,
            updatedAt: new Date(),
            dateDerniereAction: new Date(),
          } as any)
          .where(eq(parkingVehicles.id, vehicle.id));

        if (spotSpatial) {
          await tx
            .update(parkingSpots)
            .set({ reservePour: vehicle.id, updatedAt: new Date() } as any)
            .where(eq(parkingSpots.id, spotSpatial.id));
        }
        if (ancienSpotId && ancienSpotId !== spotSpatial?.id) {
          await tx
            .update(parkingSpots)
            .set({ reservePour: null, bloque: false, updatedAt: new Date() } as any)
            .where(eq(parkingSpots.id, ancienSpotId));
        }

        await tx.insert(parkingMovements).values({
          agenceId,
          vehicleId: vehicle.id,
          userId: Number(ctx.user.id),
          type: vehicle.centreX == null ? "PLACEMENT" : "DEPLACEMENT",
          siteOrigineId: vehicle.siteId,
          zoneOrigineId: vehicle.zoneId,
          positionOrigineX: vehicle.centreX,
          positionOrigineY: vehicle.centreY,
          siteDestinationId: zone.siteId,
          zoneDestinationId: zone.id,
          positionDestinationX: x,
          positionDestinationY: y,
          rotation,
          motif: input.motif ?? null,
          commentaire: spotSpatial ? `Emplacement ${spotSpatial.id}` : `Position libre (${x.toFixed(2)}, ${y.toFixed(2)})`,
        } as any);
      });

      return { id: vehicle.id, x, y, rotation, spotId: spotSpatial?.id ?? null, ok: true };
    }),

  // Suggestion multi-critères (remplace suggererSpot)
  suggererPlacement: requirePermissionProcedure("parking.vehicule.modifier")
    .input(z.object({ vehicleId: z.number(), zoneId: z.number() }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const [vehicle] = await db
        .select()
        .from(parkingVehicles)
        .where(and(eq(parkingVehicles.id, input.vehicleId), eq(parkingVehicles.agenceId, agenceId)))
        .limit(1);
      if (!vehicle) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });
      const [zone] = await db
        .select()
        .from(parkingZones)
        .where(and(eq(parkingZones.id, input.zoneId), eq(parkingZones.agenceId, agenceId)))
        .limit(1);
      if (!zone) throw new TRPCError({ code: "NOT_FOUND", message: "Zone introuvable." });

      const spots = await db.select().from(parkingSpots).where(eq(parkingSpots.zoneId, zone.id));

      const zoneSpatial: ZonePlacement = {
        polygone: zoneAPolygone(zone.geometrie),
        stationnable: zone.stationnable ?? true,
        orientationAutorisee: zone.orientationAutorisee,
        marge: zone.margeSecurite ?? 0.3,
      };

      const spotsDisponibles = spots.filter(s => !s.statut || s.statut === "LIBRE");
      const premierSpot = spotsDisponibles[0];
      const emplacementOptionnel: EmplacementOptionnel | null = premierSpot
        ? { polygone: zoneAPolygone(premierSpot.geometrie), rotation: premierSpot.rotation ?? 0 }
        : null;

      const result = suggererPlacement({
        vehicule: { id: vehicle.id, longueur: vehicle.longueur, largeur: vehicle.largeur, statut: vehicle.statut },
        zone: zoneSpatial,
        emplacement: emplacementOptionnel,
        voisins: [],
        fromX: vehicle.centreX ?? 0,
        fromY: vehicle.centreY ?? 0,
      });

      if (!result.meilleur) throw new TRPCError({ code: "NOT_FOUND", message: "Aucun emplacement libre exploitable dans cette zone." });
      return { candidats: result.candidats, meilleur: result.meilleur };
    }),

  // Vérification de placement sans écriture (pour aperçu temps réel pendant le drag)
  verifierPlacement: requirePermissionProcedure("parking.vehicule.modifier")
    .input(z.object({
      vehicleId: z.number(),
      zoneId: z.number(),
      spotId: z.number().nullish(),
      centreX: z.number(),
      centreY: z.number(),
      rotation: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;

      const [vehicle] = await db
        .select()
        .from(parkingVehicles)
        .where(and(eq(parkingVehicles.id, input.vehicleId), eq(parkingVehicles.agenceId, agenceId)))
        .limit(1);
      if (!vehicle) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });

      const [zone] = await db
        .select()
        .from(parkingZones)
        .where(and(eq(parkingZones.id, input.zoneId), eq(parkingZones.agenceId, agenceId)))
        .limit(1);
      if (!zone) throw new TRPCError({ code: "NOT_FOUND", message: "Zone introuvable." });

      const zoneSpatial: ZoneSpatial = {
        id: zone.id,
        geometrie: rectDeGeometrie(zone.geometrie, `Zone ${zone.code}`),
        capaciteTheorique: zone.capaciteTheorique ?? 0,
        surfaceStationnable: zone.surfaceStationnable ?? 0,
        orientationAutorisee: zone.orientationAutorisee,
        margeSecurite: zone.margeSecurite ?? 0.3,
        stationnable: zone.stationnable ?? true,
        placeParking: zone.placeParking ?? false,
      };

      const vehiculesZone = await db
        .select({
          id: parkingVehicles.id,
          centreX: parkingVehicles.centreX,
          centreY: parkingVehicles.centreY,
          rotation: parkingVehicles.rotation,
          longueur: parkingVehicles.longueur,
          largeur: parkingVehicles.largeur,
        })
        .from(parkingVehicles)
        .where(and(
          eq(parkingVehicles.agenceId, agenceId),
          eq(parkingVehicles.zoneId, zone.id),
          sql`${parkingVehicles.statut} <> 'SORTI'`,
          isNotNull(parkingVehicles.centreX),
        ));
      const voisins: Voisin[] = [];
      for (const o of vehiculesZone) {
        if (o.id === vehicle.id) continue;
        voisins.push({
          id: o.id!,
          empreinte: empreinteVehicule({
            centreX: (o.centreX ?? 0) + (o.largeur ?? 0) / 2,
            centreY: (o.centreY ?? 0) + (o.longueur ?? 0) / 2,
            rotation: o.rotation ?? 0,
            longueur: o.longueur,
            largeur: o.largeur,
          }),
        });
      }

      const zonePolygone: Polygone = zoneSpatial.geometrie.type === "rectangle"
        ? { points: [
            [zoneSpatial.geometrie.x, zoneSpatial.geometrie.y],
            [zoneSpatial.geometrie.x + zoneSpatial.geometrie.w, zoneSpatial.geometrie.y],
            [zoneSpatial.geometrie.x + zoneSpatial.geometrie.w, zoneSpatial.geometrie.y + zoneSpatial.geometrie.h],
            [zoneSpatial.geometrie.x, zoneSpatial.geometrie.y + zoneSpatial.geometrie.h],
          ]}
        : (zoneSpatial.geometrie as unknown as Polygone);

      let emplacementOpt: EmplacementOptionnel | null = null;
      if (input.spotId) {
        const [spot] = await db
          .select()
          .from(parkingSpots)
          .where(and(eq(parkingSpots.id, input.spotId), eq(parkingSpots.zoneId, zone.id)))
          .limit(1);
        if (spot) {
          const rectSpot = rectDeGeometrie(spot.geometrie, `Emplacement ${spot.code}`);
          emplacementOpt = {
            polygone: { points: [
              [rectSpot.x, rectSpot.y],
              [rectSpot.x + rectSpot.w, rectSpot.y],
              [rectSpot.x + rectSpot.w, rectSpot.y + rectSpot.h],
              [rectSpot.x, rectSpot.y + rectSpot.h],
            ]},
            rotation: spot.rotation ?? 0,
          };
        }
      }

      // Les inputs centreX/centreY sont déjà en coordonnées centre (convention centre)
      const cx = input.centreX;
      const cy = input.centreY;

      return validerPlacement({
        vehicule: { id: vehicle.id, longueur: vehicle.longueur, largeur: vehicle.largeur },
        cx,
        cy,
        rotation: normaliserAngle(input.rotation),
        zone: {
          polygone: zonePolygone,
          stationnable: zoneSpatial.stationnable,
          orientationAutorisee: zoneSpatial.orientationAutorisee,
          marge: zoneSpatial.margeSecurite ?? 0.3,
        },
        emplacement: emplacementOpt,
        voisins,
      });
    }),

  detacher: requirePermissionProcedure("parking.vehicule.modifier")
    .input(z.object({ vehicleId: z.number(), motif: z.string().trim().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const [vehicle] = await db
        .select()
        .from(parkingVehicles)
        .where(and(eq(parkingVehicles.id, input.vehicleId), eq(parkingVehicles.agenceId, agenceId)))
        .limit(1);
      if (!vehicle) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });

      const restaitPosition = vehicle.centreX != null || vehicle.centreY != null;
      await db.transaction(async (tx) => {
        await libererSpot(tx, vehicle.spotId);
        await tx
          .update(parkingVehicles)
          .set({
            siteId: null,
            zoneId: null,
            spotId: null,
            centreX: null,
            centreY: null,
            rotation: 0,
            updatedAt: new Date(),
            dateDerniereAction: new Date(),
          } as any)
          .where(eq(parkingVehicles.id, vehicle.id));
        if (restaitPosition) {
          await tx.insert(parkingMovements).values({
            agenceId,
            vehicleId: vehicle.id,
            userId: Number(ctx.user.id),
            type: "DEPLACEMENT",
            siteOrigineId: vehicle.siteId,
            zoneOrigineId: vehicle.zoneId,
            positionOrigineX: vehicle.centreX,
            positionOrigineY: vehicle.centreY,
            motif: input.motif ?? null,
            commentaire: "Retiré de la carte (à replacer)",
          } as any);
        }
      });
      return { id: vehicle.id, ok: true };
    }),

  sortie: requirePermissionProcedure("parking.vehicule.modifier")
    .input(z.object({ vehicleId: z.number(), motif: z.string().trim().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const [vehicle] = await db
        .select()
        .from(parkingVehicles)
        .where(and(eq(parkingVehicles.id, input.vehicleId), eq(parkingVehicles.agenceId, agenceId)))
        .limit(1);
      if (!vehicle) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });
      if (vehicle.statut === "SORTI") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ce véhicule est déjà sorti." });
      }

      await db.transaction(async (tx) => {
        await libererSpot(tx, vehicle.spotId);
        await tx
          .update(parkingVehicles)
          .set({
            statut: "SORTI",
            siteId: null,
            zoneId: null,
            spotId: null,
            centreX: null,
            centreY: null,
            rotation: 0,
            updatedAt: new Date(),
            dateDerniereAction: new Date(),
          } as any)
          .where(eq(parkingVehicles.id, vehicle.id));
        await tx.insert(parkingMovements).values({
          agenceId,
          vehicleId: vehicle.id,
          userId: Number(ctx.user.id),
          type: "SORTIE",
          siteOrigineId: vehicle.siteId,
          zoneOrigineId: vehicle.zoneId,
          positionOrigineX: vehicle.centreX,
          positionOrigineY: vehicle.centreY,
          motif: input.motif ?? null,
          commentaire: "Sortie du parking",
        } as any);
      });
      return { id: vehicle.id, ok: true };
    }),

  // ── Emplacements (spots) ──────────────────────────────────────────────────
  setSpotStatut: requirePermissionProcedure("parking.vehicule.modifier")
    .input(z.object({ 
      spotId: z.number(), 
      bloque: z.boolean().optional(),
      reservePour: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [spot] = await db
        .select()
        .from(parkingSpots)
        .where(and(eq(parkingSpots.id, input.spotId), eq(parkingSpots.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!spot) throw new TRPCError({ code: "NOT_FOUND", message: "Emplacement introuvable." });

      // Vérifier si l'emplacement est occupé par un véhicule
      if (input.bloque === false && input.reservePour === null) {
        const [occupe] = await db
          .select({ id: parkingVehicles.id })
          .from(parkingVehicles)
          .where(and(
            eq(parkingVehicles.agenceId, ctx.user.agenceId),
            eq(parkingVehicles.spotId, input.spotId),
            sql`${parkingVehicles.statut} <> 'SORTI'`,
          ))
          .limit(1);
        if (occupe) {
          throw new TRPCError({ code: "CONFLICT", message: "Un véhicule est positionné sur cet emplacement." });
        }
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.bloque !== undefined) updates.bloque = input.bloque;
      if (input.reservePour !== undefined) updates.reservePour = input.reservePour;

      await db
        .update(parkingSpots)
        .set(updates)
        .where(eq(parkingSpots.id, input.spotId));
      return { id: input.spotId, ...input };
    }),

  // ── Alertes ───────────────────────────────────────────────────────────────
  alertes: requirePermissionProcedure("parking.consulter")
    .input(
      z.object({
        statut: z.enum(["OUVERTE", "CLOTUREE"]).optional(),
        vehiculeId: z.number().optional(),
        limit: z.number().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(parkingAlerts.agenceId, ctx.user.agenceId)];
      if (input.statut) conditions.push(eq(parkingAlerts.statut, input.statut));
      if (input.vehiculeId) conditions.push(eq(parkingAlerts.vehicleId, input.vehiculeId));

      const rows = await db
        .select({
          id: parkingAlerts.id,
          vehicleId: parkingAlerts.vehicleId,
          code: parkingAlerts.code,
          niveau: parkingAlerts.niveau,
          message: parkingAlerts.message,
          criteres: parkingAlerts.criteres,
          statut: parkingAlerts.statut,
          declencheeLe: parkingAlerts.declencheeLe,
          clotureeLe: parkingAlerts.clotureeLe,
          clotureePar: parkingAlerts.clotureePar,
          numRegistre: parkingVehicles.numRegistre,
          marque: parkingVehicles.marque,
          modele: parkingVehicles.modele,
          immatriculation: parkingVehicles.immatriculation,
        })
        .from(parkingAlerts)
        .innerJoin(parkingVehicles, eq(parkingAlerts.vehicleId, parkingVehicles.id))
        .where(and(...conditions))
        .orderBy(desc(parkingAlerts.declencheeLe))
        .limit(input.limit);

      return {
        total: rows.length,
        alertes: rows.map((r) => ({
          id: r.id,
          vehicleId: r.vehicleId,
          code: r.code,
          niveau: r.niveau ?? "INFO",
          message: r.message,
          criteres: r.criteres,
          statut: r.statut ?? "OUVERTE",
          declencheeLe: r.declencheeLe,
          clotureeLe: r.clotureeLe,
          vehicule: {
            numRegistre: r.numRegistre,
            marque: r.marque,
            modele: r.modele,
            immatriculation: r.immatriculation,
          },
        })),
      };
    }),

  analyser: requirePermissionProcedure("parking.alertes.gerer")
    .input(z.object({ vehicleId: z.number().optional() }).default({}))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const cfg = await chargerConfig(agenceId);

      const conditions = [eq(parkingVehicles.agenceId, agenceId)];
      if (input.vehicleId) conditions.push(eq(parkingVehicles.id, input.vehicleId));
      // Colonnes ciblees : computeParkingAlerts ne lit que VehiculeAlertableRow.
      const vehicules = await db
        .select({
          id: parkingVehicles.id,
          numRegistre: parkingVehicles.numRegistre,
          statut: parkingVehicles.statut,
          marque: parkingVehicles.marque,
          modele: parkingVehicles.modele,
          immatriculation: parkingVehicles.immatriculation,
          clientNom: parkingVehicles.clientNom,
          dateEntree: parkingVehicles.dateEntree,
          dateDerniereAction: parkingVehicles.dateDerniereAction,
          dateDevis: parkingVehicles.dateDevis,
          dateCommande: parkingVehicles.dateCommande,
          dateFinTravaux: parkingVehicles.dateFinTravaux,
          dateDerniereRelance: parkingVehicles.dateDerniereRelance,
          createdAt: parkingVehicles.createdAt,
        })
        .from(parkingVehicles)
        .where(and(...conditions));

      const now = new Date();
      const vehiculeIds = vehicules.map((v) => v.id);
      const ouvertes = vehiculeIds.length > 0
        ? await db
            .select()
            .from(parkingAlerts)
            .where(and(
              eq(parkingAlerts.agenceId, agenceId),
              eq(parkingAlerts.statut, "OUVERTE"),
              inArray(parkingAlerts.vehicleId, vehiculeIds),
            ))
        : [];

      const ouvertesKey = new Set(ouvertes.map((a) => `${a.vehicleId}:${a.code}`));
      const activesParVehicle = new Map<number, Set<string>>();
      let crees = 0;

      for (const v of vehicules) {
        let actifs = activesParVehicle.get(v.id) ?? new Set<string>();
        const drafts = computeParkingAlerts(vehiculeAlertable(v), cfg, now);
        for (const draft of drafts) {
          actifs.add(draft.code);
          if (ouvertesKey.has(`${v.id}:${draft.code}`)) continue;
          await db.insert(parkingAlerts).values({
            agenceId,
            vehicleId: v.id,
            code: draft.code,
            niveau: draft.niveau,
            message: draft.message,
            criteres: draft.criteres,
            statut: "OUVERTE",
            declencheeLe: now,
          } as any);
          crees++;
        }
        activesParVehicle.set(v.id, actifs);
      }

      let cloturees = 0;
      for (const a of ouvertes) {
        const actifs = activesParVehicle.get(a.vehicleId);
        if (!actifs) continue;
        if (actifs.has(a.code)) continue;
        await db
          .update(parkingAlerts)
          .set({ statut: "CLOTUREE", clotureeLe: now, clotureePar: Number(ctx.user.id) } as any)
          .where(eq(parkingAlerts.id, a.id));
        cloturees++;
      }

      return { vehiculesAnalyses: vehicules.length, creees: crees, cloturees };
    }),

  fermerAlerte: requirePermissionProcedure("parking.alertes.gerer")
    .input(z.object({ alertId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [alerte] = await db
        .select()
        .from(parkingAlerts)
        .where(and(eq(parkingAlerts.id, input.alertId), eq(parkingAlerts.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!alerte) throw new TRPCError({ code: "NOT_FOUND", message: "Alerte introuvable." });
      if (alerte.statut === "CLOTUREE") return { id: alerte.id, ok: true };
      await db
        .update(parkingAlerts)
        .set({ statut: "CLOTUREE", clotureeLe: new Date(), clotureePar: Number(ctx.user.id) } as any)
        .where(eq(parkingAlerts.id, alerte.id));
      return { id: alerte.id, ok: true };
    }),

  // ── Configuration ─────────────────────────────────────────────────────────
  config: requirePermissionProcedure("parking.consulter").query(async ({ ctx }) => {
    const agenceId = ctx.user.agenceId;
    const [cfg] = await db
      .select()
      .from(parkingConfigs)
      .where(eq(parkingConfigs.agenceId, agenceId))
      .limit(1);
    if (!cfg) return { ...DEFAULT_PARKING_CONFIG_SEUILS, margeSecuriteDefaut: 0.3 };
    return {
      seuilSansEvolutionJours: cfg.seuilSansEvolutionJours ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilSansEvolutionJours,
      seuilImmobilisationLongueJours: cfg.seuilImmobilisationLongueJours ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilImmobilisationLongueJours,
      seuilAttenteClientJours: cfg.seuilAttenteClientJours ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilAttenteClientJours,
      seuilAttentePieceJours: cfg.seuilAttentePieceJours ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilAttentePieceJours,
      seuilPretSortieJour: cfg.seuilPretSortieJour ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilPretSortieJour,
      seuilTransfertJours: cfg.seuilTransfertJours ?? DEFAULT_PARKING_CONFIG_SEUILS.seuilTransfertJours,
      margeSecuriteDefaut: cfg.margeSecuriteDefaut ?? 0.3,
    };
  }),

  saveConfig: requirePermissionProcedure("parking.alertes.gerer")
    .input(
      z.object({
        seuilSansEvolutionJours: z.number().int().min(1).max(365).optional(),
        seuilImmobilisationLongueJours: z.number().int().min(1).max(3650).optional(),
        seuilAttenteClientJours: z.number().int().min(1).max(365).optional(),
        seuilAttentePieceJours: z.number().int().min(1).max(365).optional(),
        seuilPretSortieJour: z.number().int().min(1).max(365).optional(),
        seuilTransfertJours: z.number().int().min(1).max(3650).optional(),
        margeSecuriteDefaut: z.number().min(0).max(5).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const current = await chargerConfig(agenceId);
      const values = {
        agenceId,
        seuilSansEvolutionJours: input.seuilSansEvolutionJours ?? current.seuilSansEvolutionJours,
        seuilImmobilisationLongueJours: input.seuilImmobilisationLongueJours ?? current.seuilImmobilisationLongueJours,
        seuilAttenteClientJours: input.seuilAttenteClientJours ?? current.seuilAttenteClientJours,
        seuilAttentePieceJours: input.seuilAttentePieceJours ?? current.seuilAttentePieceJours,
        seuilPretSortieJour: input.seuilPretSortieJour ?? current.seuilPretSortieJour,
        seuilTransfertJours: input.seuilTransfertJours ?? current.seuilTransfertJours,
        margeSecuriteDefaut: input.margeSecuriteDefaut ?? 0.3,
        updatedAt: new Date(),
      };
      await db
        .insert(parkingConfigs)
        .values(values)
        .onConflictDoUpdate({ target: parkingConfigs.agenceId, set: values });
      return { ok: true };
    }),

  // Chemin de sortie (Lot 6) - graphe de blocage orienté + cascade
  cheminDeSortie: requirePermissionProcedure("parking.vehicule.modifier")
    .input(z.object({ vehicleId: z.number() }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;

      const [vehicle] = await db
        .select()
        .from(parkingVehicles)
        .where(and(eq(parkingVehicles.id, input.vehicleId), eq(parkingVehicles.agenceId, agenceId)))
        .limit(1);
      if (!vehicle) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });

      // Récupère le site du véhicule
      if (!vehicle.siteId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Véhicule non positionné sur un site." });
      }
      const [site] = await db
        .select()
        .from(parkingSites)
        .where(and(eq(parkingSites.id, vehicle.siteId), eq(parkingSites.agenceId, agenceId)))
        .limit(1);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site introuvable." });

      const [zone] = await db
        .select()
        .from(parkingZones)
        .where(and(eq(parkingZones.siteId, site.id), eq(parkingZones.isActive, true)))
        .orderBy(asc(parkingZones.ordre));
      if (!zone) throw new TRPCError({ code: "NOT_FOUND", message: "Zone introuvable pour ce site." });

      // Récupère tous les véhicules positionnés sur ce site
      const vehiculesSite = await db
        .select({
          id: parkingVehicles.id,
          numRegistre: parkingVehicles.numRegistre,
          centreX: parkingVehicles.centreX,
          centreY: parkingVehicles.centreY,
          rotation: parkingVehicles.rotation,
          longueur: parkingVehicles.longueur,
          largeur: parkingVehicles.largeur,
        })
        .from(parkingVehicles)
        .where(and(
          eq(parkingVehicles.agenceId, agenceId),
          eq(parkingVehicles.siteId, site.id),
          sql`${parkingVehicles.statut} <> 'SORTI'`,
          isNotNull(parkingVehicles.centreX),
          isNotNull(parkingVehicles.centreY),
        ));

      // Prépare les données pour le moteur géométrique
      const vehiculesVoisins = vehiculesSite
        .filter(v => v.id !== input.vehicleId && v.centreX != null && v.centreY != null)
        .map(v => ({
          id: v.id,
          numRegistre: v.numRegistre,
          empreinte: {
            cx: v.centreX! + (v.largeur ?? 0) / 2,
            cy: v.centreY! + (v.longueur ?? 0) / 2,
            w: v.largeur ?? 1.8,
            h: v.longueur ?? 4.5,
            rotation: v.rotation ?? 0,
          },
        }));

      const zoneSpatial = {
        id: zone.id,
        geometrie: zone.geometrie,
        zones: [zone], // Pour simplifier, on passe la zone actuelle comme seule zone
        polygone: zone.geometrie.type === "rectangle"
          ? { points: [
              [zone.geometrie.x, zone.geometrie.y],
              [zone.geometrie.x + zone.geometrie.w, zone.geometrie.y],
              [zone.geometrie.x + zone.geometrie.w, zone.geometrie.y + zone.geometrie.h],
              [zone.geometrie.x, zone.geometrie.y + zone.geometrie.h],
            ]}
          : zone.geometrie,
      };

      const vehicleCible = await db
        .select()
        .from(parkingVehicles)
        .where(and(eq(parkingVehicles.id, input.vehicleId), eq(parkingVehicles.agenceId, agenceId)))
        .limit(1);
      if (!vehicleCible) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });
      const cible = vehicleCible[0];
      if (!cible) throw new TRPCError({ code: "NOT_FOUND", message: "Véhicule introuvable." });

      const result = calculerCheminSortie({
        vehicule: {
          id: cible.id,
          numRegistre: cible.numRegistre,
          longueur: cible.longueur,
          largeur: cible.largeur,
          rotation: cible.rotation,
          centreX: cible.centreX,
          centreY: cible.centreY,
          statut: cible.statut,
        },
        zone: {
          polygone: zoneAPolygone(zone.geometrie),
          marge: zone.margeSecurite ?? 0,
          stationnable: zone.stationnable ?? true,
          orientationAutorisee: zone.orientationAutorisee,
          zones: [
            {
              polygone: zoneAPolygone(zone.geometrie),
              marge: zone.margeSecurite ?? 0,
              stationnable: zone.stationnable ?? true,
              orientationAutorisee: zone.orientationAutorisee,
              estSortie: zone.type === "VOIE" || zone.type === "CIRCULATION",
            },
          ],
        },
        voisins: vehiculesVoisins,
      });

      return {
        sortieDirecte: result.sortieDirecte,
        aDeplacer: result.aDeplacer,
        coutEstimeMinutes: result.coutEstimeMinutes,
      };
    }),
});