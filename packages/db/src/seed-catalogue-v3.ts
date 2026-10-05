import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import { unitesMesure, emplacements, attributTemplates, attributDefinitions, categories } from "./schema";
import { eq } from "drizzle-orm";

requireLocalOrForced("seed-catalogue-v3");

/**
 * SEED V3 — référentiel catalogue :
 * 1. Unités complémentaires (Kg, g, ml, Mètre, Rouleau, Jeu, Kit, Paire, Lot)
 * 2. Emplacements d'exemple (Magasin 1-4 + rayon/étagère/casier)
 * 3. Templates techniques (attribut_templates) — définitions en données
 */

const UNITES = [
  { code: "KG", libelle: "Kilogramme", symbole: "kg", type: "MASSE" },
  { code: "G", libelle: "Gramme", symbole: "g", type: "MASSE" },
  { code: "ML", libelle: "Millilitre", symbole: "ml", type: "VOLUME" },
  { code: "M", libelle: "Mètre", symbole: "m", type: "LONGUEUR" },
  { code: "MM", libelle: "Millimètre", symbole: "mm", type: "LONGUEUR" },
  { code: "ROULEAU", libelle: "Rouleau", symbole: "roul.", type: "QUANTITE" },
  { code: "JEU", libelle: "Jeu", symbole: "jeu", type: "QUANTITE" },
  { code: "KIT", libelle: "Kit", symbole: "kit", type: "QUANTITE" },
  { code: "PAIRE", libelle: "Paire", symbole: "paire", type: "QUANTITE" },
  { code: "LOT", libelle: "Lot", symbole: "lot", type: "QUANTITE" },
];

const EMPLACEMENTS: { code: string; libelle: string; type: string; parentId?: string | null; profondeur: number; ordre: number }[] = [
  { code: "MAG1", libelle: "Magasin 1 — Pièces mécaniques", type: "RAYON", profondeur: 0, ordre: 1 },
  { code: "MAG2", libelle: "Magasin 2 — Consommables", type: "RAYON", profondeur: 0, ordre: 2 },
  { code: "MAG3", libelle: "Magasin 3 — Outillage", type: "RAYON", profondeur: 0, ordre: 3 },
  { code: "MAG4", libelle: "Magasin 4 — Divers", type: "RAYON", profondeur: 0, ordre: 4 },
  { code: "MAG1-R03", libelle: "Rayon R03", type: "RAYON", parentId: "MAG1", profondeur: 1, ordre: 1 },
  { code: "MAG1-R03-E02", libelle: "Étagère E02", type: "RAYON", parentId: "MAG1-R03", profondeur: 2, ordre: 1 },
  { code: "MAG1-R03-E02-C14", libelle: "Casier C14", type: "RAYON", parentId: "MAG1-R03-E02", profondeur: 3, ordre: 1 },
];

const TPL = (code: string, libelle: string, defs: Record<string, unknown>[]) => ({ code, libelle, defs });

const TEMPLATES = [
  TPL("PLAQUETTE_FREIN", "Plaquette de frein", [
    { cle: "epaisseur", label: "Épaisseur", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "largeur", label: "Largeur", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "hauteur", label: "Hauteur", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "materiau", label: "Matériau (céramique, semi-métallique…)", typeAttribut: "TEXTE" },
    { cle: "capteur_usure", label: "Capteur d'usure", typeAttribut: "BOOLEEN" },
  ]),
  TPL("DISQUE_FREIN", "Disque de frein", [
    { cle: "diametre_exterieur", label: "Diamètre extérieur", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "diametre_interieur", label: "Diamètre intérieur", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "epaisseur", label: "Épaisseur", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "nb_trous", label: "Nombre de trous", typeAttribut: "NOMBRE" },
    { cle: "ventile", label: "Ventilé", typeAttribut: "BOOLEEN" },
  ]),
  TPL("FILTRE_HUILE", "Filtre à huile", [
    { cle: "hauteur", label: "Hauteur", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "diametre_exterieur", label: "Diamètre extérieur", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "filetage", label: "Filetage", typeAttribut: "TEXTE" },
    { cle: "clapet_anti_retour", label: "Clapet anti-retour", typeAttribut: "BOOLEEN" },
  ]),
  TPL("FILTRE_AIR", "Filtre à air", [
    { cle: "longueur", label: "Longueur", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "largeur", label: "Largeur", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "hauteur", label: "Hauteur", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "forme", label: "Forme (panneau, cylindrique…)", typeAttribut: "TEXTE" },
  ]),
  TPL("HUILE", "Huile / lubrifiant", [
    { cle: "grade_sae", label: "Grade SAE", typeAttribut: "TEXTE" },
    { cle: "type_huile", label: "Type (synthétique, semi-synthétique, minérale)", typeAttribut: "ENUM", enum: ["synthétique", "semi-synthétique", "minérale"] },
    { cle: "norme_api", label: "Norme API", typeAttribut: "TEXTE" },
    { cle: "norme_acea", label: "Norme ACEA", typeAttribut: "TEXTE" },
    { cle: "homologations", label: "Homologations constructeur", typeAttribut: "TEXTE" },
  ]),
  TPL("PNEU", "Pneumatique", [
    { cle: "largeur", label: "Largeur", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "serie", label: "Hauteur (série)", typeAttribut: "NOMBRE" },
    { cle: "diametre", label: "Diamètre", unite: "\"", typeAttribut: "NOMBRE" },
    { cle: "indice_charge", label: "Indice de charge", typeAttribut: "NOMBRE" },
    { cle: "indice_vitesse", label: "Indice de vitesse", typeAttribut: "TEXTE" },
    { cle: "saison", label: "Saison", typeAttribut: "ENUM", enum: ["été", "hiver", "4 saisons"] },
    { cle: "runflat", label: "Runflat", typeAttribut: "BOOLEEN" },
  ]),
  TPL("BATTERIE", "Batterie", [
    { cle: "tension", label: "Tension", unite: "V", typeAttribut: "NOMBRE" },
    { cle: "capacite_ah", label: "Capacité", unite: "Ah", typeAttribut: "NOMBRE" },
    { cle: "cca", label: "Courant de démarrage", unite: "A", typeAttribut: "NOMBRE" },
    { cle: "polarite", label: "Polarité", typeAttribut: "TEXTE" },
    { cle: "technologie", label: "Technologie", typeAttribut: "TEXTE" },
  ]),
  TPL("BOUGIE", "Bougie d'allumage", [
    { cle: "filetage", label: "Filetage", typeAttribut: "TEXTE" },
    { cle: "longueur_filetee", label: "Longueur filetée", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "taille_cle", label: "Taille clé", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "ecartement_electrodes", label: "Écartement électrodes", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "indice_thermique", label: "Indice thermique", typeAttribut: "TEXTE" },
    { cle: "nb_electrodes", label: "Nombre d'électrodes", typeAttribut: "NOMBRE" },
  ]),
  TPL("AMORTISSEUR", "Amortisseur", [
    { cle: "type", label: "Type (gaz, hydraulique)", typeAttribut: "TEXTE" },
    { cle: "course", label: "Course", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "longueur", label: "Longueur", unite: "mm", typeAttribut: "NOMBRE" },
  ]),
  TPL("EMBRAYAGE", "Kit embrayage", [
    { cle: "diametre_disque", label: "Diamètre disque", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "nb_canaux", label: "Nombre de canaux", typeAttribut: "NOMBRE" },
    { cle: "avec_volant", label: "Avec volant moteur", typeAttribut: "BOOLEEN" },
  ]),
  TPL("COURROIE", "Courroie de distribution", [
    { cle: "nb_dents", label: "Nombre de dents", typeAttribut: "NOMBRE" },
    { cle: "longueur", label: "Longueur", unite: "mm", typeAttribut: "NOMBRE" },
    { cle: "largeur", label: "Largeur", unite: "mm", typeAttribut: "NOMBRE" },
  ]),
  TPL("CAPTEUR", "Capteur", [
    { cle: "type_signal", label: "Type de signal", typeAttribut: "TEXTE" },
    { cle: "tension", label: "Tension", unite: "V", typeAttribut: "NOMBRE" },
    { cle: "type_connecteur", label: "Type de connecteur", typeAttribut: "TEXTE" },
  ]),
  TPL("RETROVISEUR", "Rétroviseur", [
    { cle: "type", label: "Type (intérieur, extérieur)", typeAttribut: "TEXTE" },
    { cle: "chauffant", label: "Chauffant", typeAttribut: "BOOLEEN" },
    { cle: "electrique", label: "Réglage électrique", typeAttribut: "BOOLEEN" },
    { cle: "rabattable", label: "Rabattable", typeAttribut: "BOOLEEN" },
  ]),
  TPL("CLE_DYNAMO", "Clé dynamométrique", [
    { cle: "plage_min", label: "Plage minimale", unite: "Nm", typeAttribut: "NOMBRE" },
    { cle: "plage_max", label: "Plage maximale", unite: "Nm", typeAttribut: "NOMBRE" },
    { cle: "entrainement", label: "Entraînement", typeAttribut: "ENUM", enum: ["1/4\"", "3/8\"", "1/2\"", "3/4\""] },
    { cle: "precision", label: "Précision", unite: "%", typeAttribut: "NOMBRE" },
    { cle: "type_cle", label: "Type", typeAttribut: "ENUM", enum: ["mécanique", "électronique", "à déclenchement", "à lecture directe"] },
  ]),
  TPL("PONT", "Pont élévateur", [
    { cle: "capacite", label: "Capacité", unite: "t", typeAttribut: "NOMBRE" },
    { cle: "hauteur_levage", label: "Hauteur de levage", unite: "m", typeAttribut: "NOMBRE" },
    { cle: "nb_colonnes", label: "Nombre de colonnes", typeAttribut: "NOMBRE" },
    { cle: "alimentation", label: "Alimentation", typeAttribut: "TEXTE" },
  ]),
  TPL("COMPRESSEUR", "Compresseur", [
    { cle: "puissance", label: "Puissance", unite: "kW", typeAttribut: "NOMBRE" },
    { cle: "reservoir", label: "Réservoir", unite: "L", typeAttribut: "NOMBRE" },
    { cle: "debit", label: "Débit", unite: "L/min", typeAttribut: "NOMBRE" },
    { cle: "pression_max", label: "Pression max", unite: "bar", typeAttribut: "NOMBRE" },
  ]),
  TPL("CLIM_STATION", "Station climatisation", [
    { cle: "type_gaz", label: "Type de gaz", typeAttribut: "TEXTE" },
    { cle: "pompe_vide", label: "Pompe à vide", typeAttribut: "BOOLEEN" },
    { cle: "balance", label: "Balance électronique", typeAttribut: "BOOLEEN" },
  ]),
  TPL("CONSOMMABLE_ATELIER", "Consommable atelier", [
    { cle: "type", label: "Type", typeAttribut: "TEXTE" },
    { cle: "usage", label: "Usage", typeAttribut: "TEXTE" },
  ]),
  TPL("MAIN_DOEUVRE", "Main d'œuvre (service)", [
    { cle: "duree", label: "Durée moyenne", typeAttribut: "DUREE" },
    { cle: "expertise", label: "Expertise requise", typeAttribut: "TEXTE" },
    { cle: "garantie", label: "Garantie prestation", unite: "mois", typeAttribut: "NOMBRE" },
  ]),
  TPL("DIAGNOSTIC", "Diagnostic (service)", [
    { cle: "type_diag", label: "Type de diagnostic", typeAttribut: "ENUM", enum: ["électronique", "mécanique", "carrosserie", "climatisation"] },
    { cle: "duree", label: "Durée moyenne", typeAttribut: "DUREE" },
    { cle: "rapport", label: "Rapport écrit inclus", typeAttribut: "BOOLEEN" },
  ]),
];

async function main() {
  let n = 0;
  for (const u of UNITES) {
    await db.insert(unitesMesure).values(u).onConflictDoNothing({ target: unitesMesure.code });
    n++;
  }
  console.log(`Unités : ${n} tentées (idempotent).`);

  const ids = new Map<string, number>();
  const ex = await db.select({ id: emplacements.id, code: emplacements.code }).from(emplacements);
  for (const e of ex) ids.set(e.code, e.id);
  const [agence] = await db.select({ id: emplacements.agenceId }).from(emplacements).limit(1).catch(async () => {
    const { agences } = await import("./schema");
    const r = await db.select({ id: agences.id }).from(agences).limit(1);
    return r;
  });
  const agenceId = (agence as any)?.id ?? 1;
  let empCrees = 0;
  for (const e of EMPLACEMENTS) {
    if (ids.has(e.code)) continue;
    const parentId = e.parentId ? ids.get(e.parentId) ?? null : null;
    const [row] = await db
      .insert(emplacements)
      .values({ agenceId, code: e.code, libelle: e.libelle, type: e.type, parentId: parentId as any, profondeur: e.profondeur, ordre: e.ordre } as any)
      .returning({ id: emplacements.id });
    if (row) { ids.set(e.code, row.id); empCrees++; }
  }
  console.log(`Emplacements : ${empCrees} créé(s) (agence ${agenceId}).`);

  let tplCrees = 0;
  for (const t of TEMPLATES) {
    const [row] = await db
      .insert(attributTemplates)
      .values({ code: t.code, libelle: t.libelle, defs: t.defs as any, isActive: true })
      .onConflictDoNothing({ target: attributTemplates.code })
      .returning({ id: attributTemplates.id });
    if (row) tplCrees++;
  }
  console.log(`Templates techniques : ${tplCrees} créé(s).`);

  // ─── Ontologie attribut_definitions (par famille, idempotent) ───
  const catIds = new Map<string, number>();
  const cats = await db.select({ id: categories.id, code: categories.code }).from(categories);
  for (const c of cats) catIds.set(c.code, c.id);
  const DEFS_PAR_FAMILLE: Record<string, { cle: string; libelle: string; typeAttribut: string; portee: "ARTICLE" | "VARIANTE"; obligatoire?: boolean; searchable?: boolean; filtrable?: boolean; comparable?: boolean; unite?: string; liste?: string[] }[]> = {
    FILTRATION: [
      { cle: "diametre_exterieur", libelle: "Diamètre extérieur", typeAttribut: "NOMBRE", portee: "VARIANTE", searchable: true, filtrable: true, comparable: true, unite: "MM" },
      { cle: "filetage", libelle: "Filetage", typeAttribut: "TEXTE", portee: "VARIANTE", searchable: true, filtrable: true, comparable: true },
      { cle: "type_filtre", libelle: "Type de filtre", typeAttribut: "ENUM", portee: "ARTICLE", liste: ["huile", "air", "carburant", "habitacle", "hydraulique"], filtrable: true },
    ],
    FREINAGE: [
      { cle: "materiau", libelle: "Matériau (céramique, semi-métallique)", typeAttribut: "TEXTE", portee: "VARIANTE", comparable: true },
      { cle: "capteur_usure", libelle: "Capteur d'usure", typeAttribut: "BOOLEEN", portee: "VARIANTE", filtrable: true },
    ],
    PNEUS_TOURISME: [
      { cle: "dimension", libelle: "Dimension (ex. 205/55 R16)", typeAttribut: "TEXTE", portee: "VARIANTE", searchable: true, filtrable: true, comparable: true, obligatoire: true },
      { cle: "indice_charge", libelle: "Indice de charge", typeAttribut: "NOMBRE", portee: "VARIANTE", filtrable: true },
      { cle: "indice_vitesse", libelle: "Indice de vitesse", typeAttribut: "TEXTE", portee: "VARIANTE", filtrable: true },
      { cle: "saison", libelle: "Saison", typeAttribut: "ENUM", portee: "VARIANTE", liste: ["été", "hiver", "4 saisons"], filtrable: true },
    ],
    HUILES_MOTEUR: [
      { cle: "grade_sae", libelle: "Grade SAE", typeAttribut: "TEXTE", portee: "VARIANTE", searchable: true, filtrable: true, comparable: true, obligatoire: true },
      { cle: "norme_api", libelle: "Norme API", typeAttribut: "TEXTE", portee: "VARIANTE", comparable: true },
      { cle: "norme_acea", libelle: "Norme ACEA", typeAttribut: "TEXTE", portee: "VARIANTE", comparable: true },
      { cle: "type_huile", libelle: "Type", typeAttribut: "ENUM", portee: "VARIANTE", liste: ["synthétique", "semi-synthétique", "minérale"], filtrable: true },
      { cle: "contenance", libelle: "Contenance", typeAttribut: "NOMBRE", portee: "VARIANTE", filtrable: true, unite: "L" },
    ],
    OUTIL_MESURE: [
      { cle: "plage_min", libelle: "Plage min", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM" },
      { cle: "certification", libelle: "Certification / calibration", typeAttribut: "BOOLEEN", portee: "VARIANTE", filtrable: true },
    ],
    SERVICE_MAIN_OEUVRE: [
      { cle: "duree", libelle: "Durée moyenne", typeAttribut: "DUREE", portee: "VARIANTE" },
      { cle: "expertise", libelle: "Expertise requise", typeAttribut: "TEXTE", portee: "VARIANTE", comparable: true },
      { cle: "garantie", libelle: "Garantie prestation", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MOIS" },
    ],
    SERVICE_DIAGNOSTIC: [
      { cle: "type_diag", libelle: "Type de diagnostic", typeAttribut: "ENUM", portee: "VARIANTE", liste: ["électronique", "mécanique", "carrosserie", "climatisation"], filtrable: true },
      { cle: "duree", libelle: "Durée moyenne", typeAttribut: "DUREE", portee: "VARIANTE" },
      { cle: "rapport", libelle: "Rapport écrit inclus", typeAttribut: "BOOLEEN", portee: "VARIANTE", filtrable: true },
    ],
  };
  let defsCrees = 0;
  for (const [familleCode, defs] of Object.entries(DEFS_PAR_FAMILLE)) {
    const famId = catIds.get(familleCode);
    if (!famId) continue;
    for (const d of defs) {
      const uniteId = d.unite ? (await db.select({ id: unitesMesure.id }).from(unitesMesure).where(eq(unitesMesure.code, d.unite)).limit(1))[0]?.id ?? null : null;
      const [row] = await db
        .insert(attributDefinitions)
        .values({
          categorieId: famId,
          portee: d.portee,
          cle: d.cle,
          libelle: d.libelle,
          typeAttribut: d.typeAttribut,
          obligatoire: d.obligatoire ?? false,
          searchable: d.searchable ?? false,
          filtrable: d.filtrable ?? false,
          comparable: d.comparable ?? false,
          liste: d.liste ?? [],
          uniteId,
          isActive: true,
        } as any)
        .onConflictDoNothing()
        .returning({ id: attributDefinitions.id });
      if (row) defsCrees++;
    }
  }
  console.log(`Définitions d'ontologie : ${defsCrees} créées.`);
  process.exit(0);
}

main().catch((e) => { console.error("ERR", e); process.exit(1); });