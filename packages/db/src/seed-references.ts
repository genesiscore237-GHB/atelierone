import "dotenv/config";
import {
  attributDefinitions,
  unitesDomaines,
  unitesConversions,
} from "./schema";
import { eq } from "drizzle-orm";
import { prepare } from "./seed-lib";

/**
 * SEED DE RÉFÉRENTIELS (stable — idempotent, à exécuter avant demo/scenarios).
 * Porte ce qui est "le produit tel qu'il est défini" :
 *  - unités (comptage + physiques)
 *  - domaines d'unités + conversions
 *  - catégories/familles racines canoniques
 *  - définitions d'attributs transverses par famille (pages Ontologie)
 * NB : marques, états, positions, types de relations, types d'outils/équipements
 *      sont des ENUMS du modèle (packages/validators) — pas de tables dédiées ;
 *      le manifest en fin de fichier les récapitule pour l'audit ACES/PIES.
 */
async function main() {
  const ctx = await prepare("seed-references");

  // ── 1. Unités canonicales (comptage + physiques) ─────────────────────
  const UNITS: [string, string, string, string][] = [
    ["PCE", "Pièce", "pc", "COMPTAGE"],
    ["KIT", "Kit", "kit", "COMPTAGE"],
    ["JEU", "Jeu", "jeu", "COMPTAGE"],
    ["PAIRE", "Paire", "paire", "COMPTAGE"],
    ["ROULEAU", "Rouleau", "rouleau", "COMPTAGE"],
    ["LOT", "Lot", "lot", "COMPTAGE"],
    ["H", "Heure", "h", "DUREE"],
    ["MIN", "Minute", "min", "DUREE"],
    ["JOUR", "Jour", "j", "DUREE"],
    ["MOIS", "Mois", "mois", "DUREE"],
    ["M", "Mètre", "m", "LONGUEUR"],
    ["MM", "Millimètre", "mm", "LONGUEUR"],
    ["CM", "Centimètre", "cm", "LONGUEUR"],
    ["DM", "Décimètre", "dm", "LONGUEUR"],
    ["KM", "Kilomètre", "km", "LONGUEUR"],
    ["POUCE", "Pouce", "\"", "LONGUEUR"],
    ["G", "Gramme", "g", "MASSE"],
    ["KG", "Kilogramme", "kg", "MASSE"],
    ["TONNE", "Tonne", "t", "MASSE"],
    ["ML", "Millilitre", "ml", "VOLUME"],
    ["L", "Litre", "L", "VOLUME"],
    ["DECIMETRE", "Décimètre cube", "dm3", "VOLUME"],
    ["M3", "Mètre cube", "m3", "VOLUME"],
    ["BAR", "Bar", "bar", "PRESSION"],
    ["NM", "Newton-mètre", "Nm", "COUPLE"],
    ["W", "Watt", "W", "PUISSANCE"],
    ["KW", "Kilowatt", "kW", "PUISSANCE"],
    ["V", "Volt", "V", "TENSION"],
    ["KV", "Kilovolt", "kV", "TENSION"],
    ["A", "Ampère", "A", "INTENSITE"],
    ["AH", "Ampère-heure", "Ah", "CAPACITE"],
    ["L_MIN", "Litre/minute", "L/min", "DEBIT"],
    ["CELSIUS", "Degré Celsius", "°C", "TEMPERATURE"],
    ["WH", "Watt-heure", "Wh", "ENERGIE"],
    ["KWH", "Kilowatt-heure", "kWh", "ENERGIE"],
    ["POURCENT", "Pourcent", "%", "RATIO"],
  ];
  for (const [code, libelle, symbole, type] of UNITS) await ctx.addUnite(code, libelle, symbole, type);

  // ── 2. Domaines d'unités + conversions vers la base ───────────────────
  const DOMAINE_DEFS: { code: string; libelle: string; base: string; conversions: [string, string][] }[] = [
    { code: "LONGUEUR", libelle: "Longueur", base: "MM", conversions: [["MM", "1"], ["CM", "10"], ["DM", "100"], ["M", "1000"], ["KM", "1000000"], ["POUCE", "25.4"]] },
    { code: "MASSE", libelle: "Masse", base: "KG", conversions: [["G", "0.001"], ["KG", "1"], ["TONNE", "1000"]] },
    { code: "VOLUME", libelle: "Volume", base: "L", conversions: [["ML", "0.001"], ["L", "1"], ["DECIMETRE", "1"], ["M3", "1000"]] },
    { code: "TEMPERATURE", libelle: "Température", base: "CELSIUS", conversions: [["CELSIUS", "1"]] },
    { code: "PRESSION", libelle: "Pression", base: "BAR", conversions: [["BAR", "1"]] },
    { code: "COUPLE", libelle: "Couple", base: "NM", conversions: [["NM", "1"]] },
    { code: "PUISSANCE", libelle: "Puissance", base: "KW", conversions: [["W", "0.001"], ["KW", "1"]] },
    { code: "TENSION", libelle: "Tension", base: "V", conversions: [["V", "1"], ["KV", "1000"]] },
    { code: "INTENSITE", libelle: "Intensité", base: "A", conversions: [["A", "1"]] },
    { code: "CAPACITE", libelle: "Capacité", base: "AH", conversions: [["AH", "1"]] },
    { code: "DEBIT", libelle: "Débit", base: "L_MIN", conversions: [["L_MIN", "1"]] },
    { code: "DUREE", libelle: "Durée", base: "H", conversions: [["H", "1"], ["MIN", "0.0166666667"], ["JOUR", "24"]] },
    { code: "ENERGIE", libelle: "Énergie", base: "WH", conversions: [["WH", "1"], ["KWH", "1000"]] },
    { code: "RATIO", libelle: "Pourcentage", base: "POURCENT", conversions: [["POURCENT", "1"]] },
  ];
let domainsCreated = 0;
  const state: Record<string, unknown> = {};
  for (let di = 0; di < DOMAINE_DEFS.length; di++) {
    const d = DOMAINE_DEFS[di];
    const baseId = ctx.units.get(d.base) ?? "";
    if (!baseId) throw new Error(`Unité base ${d.base} introuvable pour domaine ${d.code}`);
    const found = await ctx.db.select({ id: unitesDomaines.id }).from(unitesDomaines).where(eq(unitesDomaines.code, d.code)).limit(1);
    let domainId = found[0]?.id;
    if (!domainId) {
      const inserted = await ctx.db
        .insert(unitesDomaines)
        .values({ code: d.code, libelle: d.libelle, uniteBaseId: baseId, isActive: true })
        .onConflictDoNothing()
        .returning({ id: unitesDomaines.id });
      domainId = inserted[0]?.id;
    }
    if (!domainId) {
      const sel = await ctx.db.select({ id: unitesDomaines.id }).from(unitesDomaines).where(eq(unitesDomaines.code, d.code)).limit(1);
      domainId = sel[0]?.id;
    }
    if (!domainId) throw new Error(`Domaine ${d.code} introuvable après création`);
    domainsCreated++;
    state.domainId = domainId;
    for (let i = 0; i < d.conversions.length; i++) {
      const conv = d.conversions[i];
      const uniteId = ctx.units.get(conv[0]);
      if (!uniteId) continue;
      await ctx.db
        .insert(unitesConversions)
        .values({ domaineId: state.domainId ?? "", uniteId, facteurVersBase: conv[1], formuleDerivee: null, precision: "0.000000000001" })
        .onConflictDoNothing();
    }
  }

  // ── 3. Familles / catégories racines canoniques ───────────────────────
  const ROOTS: { code: string; nom: string; typeBranche: string }[] = [
    { code: "PIECE_MECA", nom: "Pièces automobiles & mécaniques", typeBranche: "PIECE" },
    { code: "FILTRATION", nom: "Filtration & filtres", typeBranche: "PIECE" },
    { code: "FLUIDES", nom: "Lubrifiants & fluides", typeBranche: "CONSOMMABLE" },
    { code: "PNEUS_TOURISME", nom: "Pneumatiques & jantes", typeBranche: "PIECE" },
    { code: "OUTILLAGE", nom: "Outillage & outillage de mesure", typeBranche: "OUTIL" },
    { code: "EQUIPEMENT_GARAGE", nom: "Équipements & machines d'atelier", typeBranche: "EQUIPEMENT" },
    { code: "SERVICES", nom: "Services & main d'œuvre", typeBranche: "SERVICE" },
  ];
  for (const r of ROOTS) await ctx.ensureCategory({ code: r.code, nom: r.nom, niveau: "FAMILLE", typeBranche: r.typeBranche });

  // ── 4. Définitions d'attributs transverses par famille (Ontologie) ────
  const DEFS: { parent: string; cle: string; libelle: string; typeAttribut: string; portee: string; unite?: string; liste?: string[]; filtrable?: boolean; searchable?: boolean }[] = [
    { parent: "PIECE_MECA", cle: "tension_nominale", libelle: "Tension nominale", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "V", filtrable: true },
    { parent: "PIECE_MECA", cle: "capacite", libelle: "Capacité", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "AH", filtrable: true },
    { parent: "PIECE_MECA", cle: "technologie", libelle: "Technologie", typeAttribut: "ENUM", portee: "VARIANTE", liste: ["AGM", "EFB", "Ca-Ca", "LITHIUM", "PLOMB_OUVERT"], filtrable: true },
    { parent: "PIECE_MECA", cle: "puissance_watts", libelle: "Puissance (W)", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "W" },
    { parent: "FLUIDES", cle: "viscosite", libelle: "Viscosité (grade SAE)", typeAttribut: "TEXTE", portee: "VARIANTE", filtrable: true },
    { parent: "FLUIDES", cle: "norme", libelle: "Norme / homologation", typeAttribut: "TEXTE", portee: "VARIANTE", searchable: true },
    { parent: "FLUIDES", cle: "volume_nominal", libelle: "Volume nominal", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "L" },
    { parent: "PNEUS_TOURISME", cle: "largeur_section", libelle: "Largeur de section (mm)", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", filtrable: true },
    { parent: "PNEUS_TOURISME", cle: "profile", libelle: "Profil (%)", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "POURCENT", filtrable: true },
    { parent: "PNEUS_TOURISME", cle: "diametre_jante", libelle: "Diamètre de jante", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "POUCE", filtrable: true },
    { parent: "OUTILLAGE", cle: "plage_couple", libelle: "Plage de couple", typeAttribut: "TEXTE", portee: "EXEMPLAIRE", filtrable: true },
    { parent: "OUTILLAGE", cle: "carre_transmission", libelle: "Carré d'entraînement", typeAttribut: "TEXTE", portee: "EXEMPLAIRE", filtrable: true },
    { parent: "OUTILLAGE", cle: "precision", libelle: "Précision", typeAttribut: "TEXTE", portee: "EXEMPLAIRE" },
    { parent: "OUTILLAGE", cle: "calibrable", libelle: "Soumis à calibration", typeAttribut: "BOOLEAN", portee: "EXEMPLAIRE", filtrable: true },
    { parent: "EQUIPEMENT_GARAGE", cle: "puissance", libelle: "Puissance", typeAttribut: "NOMBRE", portee: "EXEMPLAIRE", unite: "KW", filtrable: true },
    { parent: "EQUIPEMENT_GARAGE", cle: "capacite_charge", libelle: "Capacité de charge", typeAttribut: "NOMBRE", portee: "EXEMPLAIRE" },
    { parent: "SERVICES", cle: "duree", libelle: "Durée", typeAttribut: "DUREE", portee: "VARIANTE", searchable: true },
    { parent: "SERVICES", cle: "garantie_prestation", libelle: "Garantie prestation (mois)", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MOIS" },
  ];
  let defsAdded = 0;
  for (const d of DEFS) {
    const catId = ctx.cats.get(d.parent);
    if (!catId) continue;
    const [row] = await ctx.db
      .insert(attributDefinitions)
      .values({
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
        ordre: 0,
        isActive: true,
      } as any)
      .onConflictDoNothing()
      .returning({ id: attributDefinitions.id });
    if (row) defsAdded++;
  }

  ctx.db.$client.end();

  console.log("=== SEED RÉFÉRENTIELS TERMINÉ ===");
  console.log(`Unités garanties : ${ctx.units.size}`);
  console.log(`Domaines d'unités : ${DOMAINE_DEFS.length} (${domainsCreated} créés), conversions idempotentes`);
  console.log(`Familles racines : ${ROOTS.length}`);
  console.log(`Définitions d'attributs : ${DEFS.length} (${defsAdded} ajoutées)`);
  console.log("────────────────────────────────────────────");
  console.log("Manifest des référentiels portés par le MODÈLE (enums — pas de tables) :");
  console.log(" - produits.typeProduit      : PIECE | CONSOMMABLE | OUTIL | EQUIPEMENT | SERVICE");
  console.log(" - produits.niveau           : VARIANTE (SKU) | EXEMPLAIRE (outillage/équipement)");
  console.log(" - produits.statutCycleVie   : BROUILLON | ACTIF | …  (statut : actif | inactif | suspendu …)");
  console.log(" - produits.statutOutil      : REPARATION | USE | CASSE | PERDU | VOLE | REFORME  (NULL = dispo)");
  console.log(" - produits.etatEquipement   : NEUF | TRES_BON | BON | MOYEN | USE | ENDOMMAGE | HORS_SERVICE | EN_REPARATION");
  console.log(" - produits.positionCote/Essieu/Zone/Emplacement : GAUCHE/DROITE/CENTRAL/LES_DEUX · AVANT/ARRIERE · INT/EXT/SUP/INF · MOTEUR/BOITE/ROUE/… · N_A");
  console.log(" - produits.origineProduit   : CONSTRUCTEUR | OEM | AFTERMARKET | ADAPTABLE");
  console.log(" - produits.etatProduit      : NEUF | OCCASION | RECONDITIONNE | REMANUFACTURE");
  console.log(" - produits.relationProduit  : EQUIVALENT | SUBSTITUT | ECHANGE_STANDARD");
  console.log(" - produits.typeOutil        : INDIVIDUEL | KIT | JEU | MACHINE");
  console.log(" - produit_references.typeRef : FABRICANT | OEM | CONSTRUCTEUR | FOURNISSEUR | EAN | UPC | GTIN | ANCIENNE | AUTRE");
  console.log(" - article_equivalences.type : SUPERSESSION | INTERCHANGEABLE | KIT_COMPOSANT");
  console.log(" - produit_substitutions.niveauConfiance : OFFICIEL | HOMOLOGUE | TECHNIQUE | COMMERCIAL | MANUELLE");
  console.log(" - lots.statut               : disponible | perime | bloque | epuise | retour_fournisseur … (voir specs V2 §02)");
  console.log(" - mouvements_stock.type     : voir TYPES_MOUVEMENT (packages/nextjs/src/server/lib/stock-engine.ts)");
  console.log(" - emplacements.type         : ZONE | RAYON | ETAGERE | BAC | CASIER | ATELIER | BUREAU …");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });