import sys

filepath = r"C:\Users\FAYA COMPUTER\Desktop\MES PROJETS\SAAS\atelierone\apps\nextjs\src\server\api\routers\garage-router.ts"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# The export mutation to add, right before the final closing "});"
export_mutation = '''  // ── Export vehicules ───────────────────────────────────────────────────────
  exportVehicules: requirePermissionProcedure("parking.vehicule.exporter")
    .input(
      z.object({
        format: z.enum(["xlsx", "pdf", "csv"]).default("xlsx"),
        photosParVehicule: z.number().int().min(0).max(3).default(1),
        contexte: z.string().optional(),
        champs: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      // Récupère TOUS les vehicules de l'agence (meme ceux avec statut SORTI
      // si l'utilisateur a la permission d'exporter) ; on filtre ensuite côté client.
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
          nbPhotos: parkingVehicles.nbPhotos,
          site: parkingVehicles.site,
          zone: parkingVehicles.zone,
          spot: parkingVehicles.spot,
          photos: parkingVehicles.photos,
        })
        .from(parkingVehicles)
        .where(eq(parkingVehicles.agenceId, agenceId));

      const vehicules: LigneExportVehicule[] = rows.map((r) => ({
        id: r.id,
        numRegistre: r.numRegistre,
        immatriculation: r.immatriculation,
        marque: r.marque,
        modele: r.modele,
        version: r.version,
        couleur: r.couleur,
        vin: r.vin,
        clientNom: r.clientNom,
        clientTelephone: r.clientTelephone,
        statut: r.statut,
        motif: r.motif,
        provenance: r.provenance,
        centreX: r.centreX,
        centreY: r.centreY,
        rotation: r.rotation,
        longueur: r.longueur,
        largeur: r.largeur,
        hauteur: r.hauteur,
        poids: r.poids,
        dimensionsEstimees: r.dimensionsEstimees,
        dateEntree: r.dateEntree,
        dateDerniereAction: r.dateDerniereAction,
        dateDevis: r.dateDevis,
        dateCommande: r.dateCommande,
        dateFinTravaux: r.dateFinTravaux,
        dateDerniereRelance: r.dateDerniereRelance,
        notes: r.notes,
        nbPhotos: r.nbPhotos,
        site: r.site,
        zone: r.zone,
        spot: r.spot,
        photos: r.photos ?? [],
      }));

      const options: OptionsGenerationExport = {
        format: input.format,
        champs: input.champs.length > 0 ? input.champs : ["numRegistre", "immatriculation", "marque", "modele", "version", "couleur", "vin", "clientNom", "clientTelephone", "statut", "motif", "provenance", "centreX", "centreY", "rotation", "longueur", "largeur", "hauteur", "poids", "dimensionsEstimees", "dateEntree", "dateDerniereAction", "dateDevis", "dateCommande", "dateFinTravaux", "dateDerniereRelance", "nbPhotos", "notes", "site", "zone", "spot", "photos"],
      };

      return genererEtTelechargerExport(vehicules, options, "registre-vehicules", () => {});
    }),

'''

# Find the position right before the final "});" that closes the router
# The file ends with: "    }),\n}");  based on reading

# Let's find the last "});" and insert before it
# Look for the pattern: the last "});" that closes createTRPCRouter

# We need to insert before the final closing "});" of the router object
# The file has multiple "});" - we want the very last one

# Find the last occurrence of "});" 
last_pos = content.rfind("});")
if last_pos == -1:
    print("ERROR: Could not find '});' in file")
    sys.exit(1)

# Content before the last "});"
before = content[:last_pos]
# Content after (should just be the closing "});")
after = content[last_pos:]

# New content = before + mutation + "});"
new_content = before + export_mutation + "});"

with open(filepath, "w", encoding="utf-8") as f:
    f.write(new_content)

print(f"Successfully added exportVehicules mutation at position {last_pos}")
print(f"New file length: {len(new_content)} chars")