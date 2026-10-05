import "dotenv/config";
import { attributDefinitions } from "./schema";
import { eq, and } from "drizzle-orm";
import { prepare } from "./seed-lib";

/**
 * SEED ONTOLOGIE — branche Filtres (G01 → G0101 → G010101..G010106).
 * Objectif P0#5 : "catégorie → gabarits d'attributs → formulaire" SANS code par catégorie.
 * Le wizard résout la chaîne d'ancêtres (feuille → racine) via getDefinitionsForCategory,
 * donc les définitions sont posées directement sur les feuilles G0101xx.
 * Idempotent : on ne ré-insère pas une définition déjà présente sur (catégorie, clé, portée).
 */
type Def = { cle: string; libelle: string; typeAttribut: string; portee: "ARTICLE" | "VARIANTE"; unite?: string; liste?: string[]; filtrable?: boolean; searchable?: boolean; aide?: string };

const FILTRE_HUILE: Def[] = [
  { cle: "type_filtre", libelle: "Type de montage", typeAttribut: "ENUM", portee: "ARTICLE", liste: ["SPIN_ON", "CARTOUCHE", "A_VISSER", "ENCART"], filtrable: true },
  { cle: "diametre_exterieur", libelle: "Diamètre extérieur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true },
  { cle: "hauteur", libelle: "Hauteur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true },
  { cle: "filetage", libelle: "Filetage", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true },
  { cle: "diametre_joint", libelle: "Diamètre joint d'étanchéité", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true },
  { cle: "clapet_anti_retour", libelle: "Clapet anti-retour", typeAttribut: "BOOLEAN", portee: "VARIANTE", filtrable: true },
  { cle: "soupape_derivation", libelle: "Soupape de dérivation", typeAttribut: "BOOLEAN", portee: "VARIANTE", filtrable: true },
  { cle: "pression_soupape", libelle: "Pression d'ouverture soupape", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "BAR", filtrable: true },
];

const FILTRE_AIR: Def[] = [
  { cle: "forme", libelle: "Forme", typeAttribut: "ENUM", portee: "ARTICLE", liste: ["PANEL", "CYLINDRIQUE", "CONIQUE"], filtrable: true },
  { cle: "longueur", libelle: "Longueur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true },
  { cle: "largeur", libelle: "Largeur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true },
  { cle: "hauteur", libelle: "Hauteur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true },
];

const FILTRE_CARBURANT: Def[] = [
  { cle: "type_filtre", libelle: "Type de montage", typeAttribut: "ENUM", portee: "ARTICLE", liste: ["A_VISSER", "ENCART", "LIGNE", "1_PIECE", "2_PIECES"], filtrable: true },
  { cle: "hauteur", libelle: "Hauteur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true },
  { cle: "diametre_exterieur", libelle: "Diamètre extérieur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true },
  { cle: "debit", libelle: "Débit nominal", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "L_MIN", filtrable: true },
];

const FILTRE_HABITACLE: Def[] = [
  { cle: "forme", libelle: "Forme", typeAttribut: "ENUM", portee: "ARTICLE", liste: ["PANEL", "CYLINDRIQUE"], filtrable: true },
  { cle: "type_carbone", libelle: "À charbon actif", typeAttribut: "BOOLEAN", portee: "VARIANTE", filtrable: true },
  { cle: "longueur", libelle: "Longueur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true },
  { cle: "largeur", libelle: "Largeur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true },
  { cle: "hauteur", libelle: "Hauteur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true },
];

const FILTRE_BOITE: Def[] = [
  { cle: "type_filtre", libelle: "Type de montage", typeAttribut: "ENUM", portee: "ARTICLE", liste: ["PANEL", "CYLINDRIQUE", "A_VISSER"], filtrable: true },
  { cle: "hauteur", libelle: "Hauteur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true },
  { cle: "longueur", libelle: "Longueur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true },
];

const FILTRE_HYDRAULIQUE: Def[] = [
  { cle: "type_filtre", libelle: "Type de montage", typeAttribut: "ENUM", portee: "ARTICLE", liste: ["SPIN_ON", "CARTOUCHE", "TANK", "RETOUR", "PNEUMATIQUE"], filtrable: true },
  { cle: "pouvoir_retention", libelle: "Pouvoir de rétention", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true, aide: "Microns (µm)" },
  { cle: "debit", libelle: "Débit nominal", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "L_MIN", filtrable: true },
  { cle: "pression", libelle: "Pression maximale", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "BAR", filtrable: true },
];

const BRANCHES: { code: string; defs: Def[] }[] = [
  { code: "G010101", defs: FILTRE_HUILE },
  { code: "G010102", defs: FILTRE_AIR },
  { code: "G010103", defs: FILTRE_CARBURANT },
  { code: "G010104", defs: FILTRE_HABITACLE },
  { code: "G010105", defs: FILTRE_BOITE },
  { code: "G010106", defs: FILTRE_HYDRAULIQUE },
];

async function main() {
  const ctx = await prepare("seed-ontologie-filtres");
  for (const code of ["MM", "BAR", "L_MIN"]) {
    if (!ctx.units.has(code)) await ctx.addUnite(code, code === "MM" ? "Millimètre" : code === "BAR" ? "Bar" : "Litre/minute", code === "MM" ? "mm" : code === "BAR" ? "bar" : "L/min", code === "L_MIN" ? "DEBIT" : code === "MM" ? "LONGUEUR" : "PRESSION");
  }
  let cibles = 0;
  let inseres = 0;
  for (const b of BRANCHES) {
    const catId = ctx.cats.get(b.code);
    if (!catId) {
      console.warn(`Catégorie ${b.code} introuvable — branche Filtres non présente.`);
      continue;
    }
    cibles++;
    for (const d of b.defs) {
      const [ex] = await ctx.db
        .select({ id: attributDefinitions.id })
        .from(attributDefinitions)
        .where(
          and(
            eq(attributDefinitions.categorieId, catId),
            eq(attributDefinitions.cle, d.cle),
            eq(attributDefinitions.portee, d.portee)
          )
        )
        .limit(1);
      if (ex) continue;
      await ctx.db.insert(attributDefinitions).values({
        categorieId: catId,
        portee: d.portee,
        cle: d.cle,
        libelle: d.libelle,
        typeAttribut: d.typeAttribut,
        obligatoire: false,
        searchable: d.searchable ?? false,
        filtrable: d.filtrable ?? false,
        comparable: true,
        liste: d.liste ?? [],
        uniteId: d.unite ? ctx.units.get(d.unite) ?? null : null,
        aide: d.aide ?? null,
        ordre: 0,
        isActive: true,
      } as any);
      inseres++;
    }
    await ctx.db.update(attributDefinitions).set({ isActive: true }).where(eq(attributDefinitions.categorieId, catId));
  }
  ctx.db.$client.end();
  console.log("=== SEED ONTOLOGIE FILTRES TERMINÉ ===");
  console.log(`Branches ciblées : ${cibles}/6 (G010101..G010106)`);
  console.log(`Définitions d'attributs insérées : ${inseres}`);
  console.log("────────────────────────────────────────────");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });