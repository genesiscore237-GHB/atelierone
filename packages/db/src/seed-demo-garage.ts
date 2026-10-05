/**
 * DEPRECATED — monolithe historique du jeu de démonstration.
 * Remplacé par 3 seeds séparés (exécution séquentielle) :
 *   1. `src/seed-references.ts`   — référentiels (unités, domaines, catégories, définitions)
 *   2. `src/seed-demo.ts`         — vitrine métier (article → variantes → stock/lots/prêts…)
 *   3. `src/seed-scenarios.ts`    — 10 scénarios de diagnostic SCENARIO-*
 * Ne pas utiliser. Conservé à titre d'historique ; nettoyé par cleanup-demo3.sql.
 */
import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import {
  unitesMesure,
  categories,
  fournisseurs,
  employes,
  vehicules,
  emplacements,
  produitArticles,
  produits,
  produitReferences,
  produitReferencesEquiv,
  produitSupersessions,
  produitSubstitutions,
  compatibilitesProduits,
  codesBarres,
  produitUnites,
  produitsFournisseurs,
  lots,
  stocks,
  stocksLots,
  mouvementsStock,
  attributTemplates,
  attributDefinitions,
  articleAttributs,
  varianteAttributs,
  articleDocuments,
  outillageMaintenance,
  outillageCalibration,
  pretsOutils,
  kitsLignes,
  tarifs,
  utilisateurs,
} from "./schema";
import { eq, and, like } from "drizzle-orm";

requireLocalOrForced("seed-demo-garage");

const AGENCE_ID = 1;
const dt = (s: string) => new Date(s);

async function main() {
  const existing = await db.select({ cb: produits.codeBarre }).from(produits).where(like(produits.codeBarre, "DEMO-%"));
  if (existing.length > 0) {
    console.log(`Dataset DEMO déjà présent (${existing.length} produits). Rien à faire.`);
    process.exit(0);
  }

  const adminUser = (await db.select({ id: utilisateurs.id }).from(utilisateurs).where(eq(utilisateurs.email, "admin@gpj.cm")).limit(1).catch(() => []))[0]?.id ?? null;

  const unites = new Map<string, string>();
  const rowsU = await db.select({ id: unitesMesure.id, code: unitesMesure.code }).from(unitesMesure);
  for (const r of rowsU) unites.set(r.code, r.id);

  const addUnite = async (code: string, libelle: string, symbole: string, type: string) => {
    if (unites.has(code)) return unites.get(code)!;
    await db.insert(unitesMesure).values({ code, libelle, symbole, type }).onConflictDoNothing({ target: unitesMesure.code });
    const [r] = await db.select({ id: unitesMesure.id }).from(unitesMesure).where(eq(unitesMesure.code, code)).limit(1);
    if (r) unites.set(code, r.id);
    return r?.id ?? "";
  };

  const U = await Promise.all([
    addUnite("V", "Volt", "V", "ENERGIE"),
    addUnite("A", "Ampère", "A", "ENERGIE"),
    addUnite("AH", "Ampère-heure", "Ah", "ENERGIE"),
    addUnite("W", "Watt", "W", "ENERGIE"),
    addUnite("KW", "Kilowatt", "kW", "ENERGIE"),
    addUnite("NM", "Newton-mètre", "Nm", "ENERGIE"),
    addUnite("CELSIUS", "Degré Celsius", "°C", "TEMPERATURE"),
    addUnite("L_MIN", "Litre/minute", "L/min", "DEBIT"),
    addUnite("POURCENT", "Pourcent", "%", "RATIO"),
    addUnite("MOIS", "Mois", "mois", "DUREE"),
    addUnite("POUCE", "Pouce", "\"", "LONGUEUR"),
    addUnite("TONNE", "Tonne", "t", "MASSE"),
    addUnite("DECIMETRE", "Décimètre", "dm", "LONGUEUR"),
  ]);
  const UNI = { H: unites.get("H"), MIN: unites.get("MIN"), L: unites.get("L"), ML: unites.get("ML"), KG: unites.get("KG"), G: unites.get("G"), M: unites.get("M"), MM: unites.get("MM"), ROULEAU: unites.get("ROULEAU"), JEU: unites.get("JEU"), KIT: unites.get("KIT"), PAIRE: unites.get("PAIRE"), LOT: unites.get("LOT"), PCE: unites.get("PCE"), V: unites.get("V"), A: unites.get("A"), AH: unites.get("AH"), W: unites.get("W"), KW: unites.get("KW"), NM: unites.get("NM"), CELSIUS: unites.get("CELSIUS"), L_MIN: unites.get("L_MIN"), POURCENT: unites.get("POURCENT"), MOIS: unites.get("MOIS"), POUCE: unites.get("POUCE"), TONNE: unites.get("TONNE") };

  const catMap = new Map<string, number>();
  const allCats = await db.select({ id: categories.id, code: categories.code }).from(categories);
  for (const c of allCats) catMap.set(c.code, c.id);

  const ensureCategory = async (o: { code: string; nom: string; parentCode?: string; typeBranche?: string; niveau?: string; domaine?: string; description?: string }) => {
    const found = catMap.get(o.code);
    if (found) return found;
    const parentId = o.parentCode ? catMap.get(o.parentCode) ?? null : null;
    const [row] = await db
      .insert(categories)
      .values({
        code: o.code,
        nom: o.nom,
        parentId: parentId as number | null,
        typeBranche: o.typeBranche ?? null,
        niveauOntologie: o.niveau ?? "CATEGORIE",
        domaine: o.domaine ?? null,
        description: o.description ?? null,
        isActive: true,
      } as any)
      .onConflictDoNothing({ target: categories.code })
      .returning({ id: categories.id });
    const id = row?.id ?? (await db.select({ id: categories.id }).from(categories).where(eq(categories.code, o.code)).limit(1))[0]!.id;
    catMap.set(o.code, id);
    return id;
  };

  const DOMAINES: { code: string; nom: string }[] = [
    { code: "DEMO-DOM-PIECES", nom: ">>> Pièces automobiles & mécaniques" },
    { code: "DEMO-DOM-FLUIDES", nom: ">>> Lubrifiants & fluides" },
    { code: "DEMO-DOM-PNEUS", nom: ">>> Pneumatiques & jantes" },
    { code: "DEMO-DOM-OUTILLAGE", nom: ">>> Outillage & outillage de mesure" },
    { code: "DEMO-DOM-EQUIPEMENTS", nom: ">>> Équipements & machines d'atelier" },
    { code: "DEMO-DOM-KITS", nom: ">>> Kits & coffrets" },
    { code: "DEMO-DOM-SERVICES", nom: ">>> Services & main d'œuvre" },
  ];

  for (const d of DOMAINES) {
    await db.insert(categories).values({ code: d.code, nom: d.nom, niveauOntologie: "FAMILLE", isActive: true } as any).onConflictDoNothing({ target: categories.code });
    catMap.set(d.code, (await db.select({ id: categories.id }).from(categories).where(eq(categories.code, d.code)).limit(1))[0]!.id);
  }

  const CATEGORIES_ADD: Parameters<typeof ensureCategory>[0][] = [
    { code: "DEMO-BATTERIES", nom: "Batteries & accessoires", parentCode: "PIECE_MECA", niveau: "CATEGORIE", domaine: "DEMO-DOM-PIECES", typeBranche: "PIECE" },
    { code: "DEMO-ALLUMAGE", nom: "Allumage & bougies", parentCode: "PIECE_MECA", niveau: "CATEGORIE", domaine: "DEMO-DOM-PIECES", typeBranche: "PIECE" },
    { code: "DEMO-COURROIES", nom: "Courroies & transmission", parentCode: "PIECE_MECA", niveau: "CATEGORIE", domaine: "DEMO-DOM-PIECES", typeBranche: "PIECE" },
    { code: "DEMO-SUSPENSION", nom: "Suspension & amortisseurs", parentCode: "PIECE_MECA", niveau: "CATEGORIE", domaine: "DEMO-DOM-PIECES", typeBranche: "PIECE" },
    { code: "DEMO-FREIN-PLAQUETTES", nom: "Plaquettes de frein", parentCode: "PIECE_MECA", niveau: "SOUS", domaine: "DEMO-DOM-PIECES", typeBranche: "PIECE" },
    { code: "DEMO-FREIN-DISQUES", nom: "Disques de frein", parentCode: "PIECE_MECA", niveau: "SOUS", domaine: "DEMO-DOM-PIECES", typeBranche: "PIECE" },
    { code: "DEMO-FILTRATION-HUILE", nom: "Filtres à huile", parentCode: "FILTRATION", niveau: "SOUS", domaine: "DEMO-DOM-PIECES", typeBranche: "PIECE" },
    { code: "DEMO-FILTRATION-AIR", nom: "Filtres à air", parentCode: "FILTRATION", niveau: "SOUS", domaine: "DEMO-DOM-PIECES", typeBranche: "PIECE" },
    { code: "DEMO-FILTRATION-CARBURANT", nom: "Filtres à carburant", parentCode: "FILTRATION", niveau: "SOUS", domaine: "DEMO-DOM-PIECES", typeBranche: "PIECE" },
    { code: "DEMO-ELEC", nom: "Électricité & éclairage", parentCode: "PIECE_MECA", niveau: "CATEGORIE", domaine: "DEMO-DOM-PIECES", typeBranche: "PIECE" },
    { code: "DEMO-MOTEUR", nom: "Moteur & injection", parentCode: "PIECE_MECA", niveau: "CATEGORIE", domaine: "DEMO-DOM-PIECES", typeBranche: "PIECE" },
    { code: "DEMO-CARROSSERIE", nom: "Carrosserie & rétroviseurs", parentCode: "PIECE_MECA", niveau: "CATEGORIE", domaine: "DEMO-DOM-PIECES", typeBranche: "PIECE" },
    { code: "DEMO-HUILES", nom: "Huiles moteur", parentCode: "FLUIDES", niveau: "SOUS", domaine: "DEMO-DOM-FLUIDES", typeBranche: "CONSOMMABLE" },
    { code: "DEMO-FLUIDES-FREIN", nom: "Liquides de frein", parentCode: "FLUIDES", niveau: "SOUS", domaine: "DEMO-DOM-FLUIDES", typeBranche: "CONSOMMABLE" },
    { code: "DEMO-REFROIDISSEMENT", nom: "Liquides de refroidissement", parentCode: "FLUIDES", niveau: "SOUS", domaine: "DEMO-DOM-FLUIDES", typeBranche: "CONSOMMABLE" },
    { code: "DEMO-CHIMIE", nom: "Chimie & pâtes d'atelier", parentCode: "FLUIDES", niveau: "SOUS", domaine: "DEMO-DOM-FLUIDES", typeBranche: "CONSOMMABLE" },
    { code: "DEMO-PNEUS", nom: "Pneumatiques", parentCode: "PNEUS_TOURISME", niveau: "SOUS", domaine: "DEMO-DOM-PNEUS", typeBranche: "PIECE" },
    { code: "DEMO-MARGELLE", nom: "Valves & chambres à air", parentCode: "PNEUS_TOURISME", niveau: "SOUS", domaine: "DEMO-DOM-PNEUS", typeBranche: "PIECE" },
    { code: "DEMO-OUTCLES", nom: "Clés & clés dynamométriques", parentCode: "OUTILLAGE", niveau: "SOUS", domaine: "DEMO-DOM-OUTILLAGE", typeBranche: "OUTIL" },
    { code: "DEMO-OUTMESURE", nom: "Outils de mesure & diag", parentCode: "OUTILLAGE", niveau: "SOUS", domaine: "DEMO-DOM-OUTILLAGE", typeBranche: "OUTIL" },
    { code: "DEMO-OUTELEC", nom: "Électroportatif", parentCode: "OUTILLAGE", niveau: "SOUS", domaine: "DEMO-DOM-OUTILLAGE", typeBranche: "OUTIL" },
    { code: "DEMO-OUTPNEU", nom: "Outillage pneumatique", parentCode: "OUTILLAGE", niveau: "SOUS", domaine: "DEMO-DOM-OUTILLAGE", typeBranche: "OUTIL" },
    { code: "DEMO-OULEVAGE", nom: "Levage & manutention", parentCode: "OUTILLAGE", niveau: "SOUS", domaine: "DEMO-DOM-OUTILLAGE", typeBranche: "OUTIL" },
    { code: "DEMO-EQP-PONT", nom: "Ponts élévateurs", parentCode: "EQUIPEMENT_GARAGE", niveau: "SOUS", domaine: "DEMO-DOM-EQUIPEMENTS", typeBranche: "EQUIPEMENT" },
    { code: "DEMO-EQP-PNEU", nom: "Équipements pneumatiques", parentCode: "EQUIPEMENT_GARAGE", niveau: "SOUS", domaine: "DEMO-DOM-EQUIPEMENTS", typeBranche: "EQUIPEMENT" },
    { code: "DEMO-EQP-DIAG", nom: "Diagnostic & bancs d'essai", parentCode: "EQUIPEMENT_GARAGE", niveau: "SOUS", domaine: "DEMO-DOM-EQUIPEMENTS", typeBranche: "EQUIPEMENT" },
    { code: "DEMO-EQP-SOUDE", nom: "Soudure & métallurgie", parentCode: "EQUIPEMENT_GARAGE", niveau: "SOUS", domaine: "DEMO-DOM-EQUIPEMENTS", typeBranche: "EQUIPEMENT" },
    { code: "DEMO-KITS-COFFRETS", nom: "Coffrets & jeux de douilles", parentCode: "DEMO-DOM-KITS", niveau: "FAMILLE", domaine: "DEMO-DOM-KITS", typeBranche: "OUTIL" },
    { code: "DEMO-KITS-DISTRI", nom: "Kits distribution & embrayage", parentCode: "DEMO-DOM-KITS", niveau: "FAMILLE", domaine: "DEMO-DOM-KITS", typeBranche: "PIECE" },
    { code: "DEMO-SRV-ENTRETIEN", nom: "Entretien courant", parentCode: "SERVICES", niveau: "SOUS", domaine: "DEMO-DOM-SERVICES", typeBranche: "SERVICE" },
    { code: "DEMO-SRV-REPARATION", nom: "Réparations mécaniques", parentCode: "SERVICES", niveau: "SOUS", domaine: "DEMO-DOM-SERVICES", typeBranche: "SERVICE" },
    { code: "DEMO-SRV-SPECIAL", nom: "Prestations expertes", parentCode: "SERVICES", niveau: "SOUS", domaine: "DEMO-DOM-SERVICES", typeBranche: "SERVICE" },
  ];
  for (const c of CATEGORIES_ADD) await ensureCategory(c);

  const TEMPLATES_ADD = [
    { code: "DEMO_BATTERIE", libelle: "Batterie de démarrage", defs: [
      { cle: "tension", label: "Tension", unite: "V", typeAttribut: "NOMBRE" },
      { cle: "capacite_ah", label: "Capacité", unite: "Ah", typeAttribut: "NOMBRE" },
      { cle: "cca", label: "Courant de démarrage à froid", unite: "A", typeAttribut: "NOMBRE" },
      { cle: "polarite", label: "Polarité (borne +)", typeAttribut: "ENUM", enum: ["droite", "gauche"] },
      { cle: "technologie", label: "Technologie", typeAttribut: "TEXTE" },
    ]},
    { code: "DEMO_BOUGIE", libelle: "Bougie d'allumage", defs: [
      { cle: "filetage", label: "Filetage", typeAttribut: "TEXTE" },
      { cle: "longueur_filetee", label: "Longueur filetée", unite: "mm", typeAttribut: "NOMBRE" },
      { cle: "taille_cle", label: "Taille de clé", unite: "mm", typeAttribut: "NOMBRE" },
      { cle: "ecartement_electrodes", label: "Écartement électrodes", unite: "mm", typeAttribut: "NOMBRE" },
    ]},
    { code: "DEMO_COURROIE_DISTRI", libelle: "Courroie de distribution", defs: [
      { cle: "nb_dents", label: "Nombre de dents", typeAttribut: "NOMBRE" },
      { cle: "largeur", label: "Largeur", unite: "mm", typeAttribut: "NOMBRE" },
      { cle: "longueur_eff", label: "Longueur effective", unite: "mm", typeAttribut: "NOMBRE" },
    ]},
    { code: "DEMO_AMORTISSEUR", libelle: "Amortisseur", defs: [
      { cle: "type", label: "Type", typeAttribut: "ENUM", enum: ["gaz", "hydraulique", "oléopneumatique"] },
      { cle: "position", label: "Position", typeAttribut: "ENUM", enum: ["avant", "arrière"] },
    ]},
    { code: "DEMO_INJECTEUR", libelle: "Injecteur", defs: [
      { cle: "debit", label: "Débit", unite: "Cc/min", typeAttribut: "NOMBRE" },
      { cle: "resistance", label: "Résistance", unite: "Ohm", typeAttribut: "NOMBRE" },
    ]},
    { code: "DEMO_ALTERNATEUR", libelle: "Alternateur", defs: [
      { cle: "puissance", label: "Puissance", unite: "A", typeAttribut: "NOMBRE" },
      { cle: "tension", label: "Tension", unite: "V", typeAttribut: "NOMBRE" },
    ]},
    { code: "DEMO_LIQFREIN", libelle: "Liquide de frein", defs: [
      { cle: "norme_dot", label: "Norme DOT", typeAttribut: "ENUM", enum: ["DOT3", "DOT4", "DOT5.1"] },
      { cle: "point_ebullition", label: "Point d'ébullition sec", unite: "°C", typeAttribut: "NOMBRE" },
      { cle: "contenance", label: "Contenance", unite: "L", typeAttribut: "NOMBRE" },
    ]},
    { code: "DEMO_CLE", libelle: "Clé dynamométrique", defs: [
      { cle: "plage_min", label: "Couple min", unite: "Nm", typeAttribut: "NOMBRE" },
      { cle: "plage_max", label: "Couple max", unite: "Nm", typeAttribut: "NOMBRE" },
      { cle: "carre_entrainement", label: "Carré d'entraînement", unite: "\"", typeAttribut: "NOMBRE" },
      { cle: "certification", label: "Certification ISO 6789", typeAttribut: "BOOLEEN" },
    ]},
  ];
  for (const t of TEMPLATES_ADD) {
    await db.insert(attributTemplates).values({ code: t.code, libelle: t.libelle, defs: t.defs as any, isActive: true }).onConflictDoNothing({ target: attributTemplates.code });
  }

  const DEFS_BY_CAT: Record<string, { cle: string; libelle: string; typeAttribut: string; portee?: "ARTICLE" | "VARIANTE"; unite?: string; obligatoire?: boolean; searchable?: boolean; filtrable?: boolean; comparable?: boolean; liste?: string[] }[]> = {
    "DEMO-BATTERIES": [
      { cle: "tension", libelle: "Tension", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "V", searchable: true, filtrable: true, comparable: true },
      { cle: "capacite_ah", libelle: "Capacité", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "AH", searchable: true, filtrable: true, comparable: true },
      { cle: "cca", libelle: "Courant de démarrage", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "A", filtrable: true, comparable: true },
      { cle: "technologie", libelle: "Technologie", typeAttribut: "ENUM", portee: "VARIANTE", liste: ["AGM", "EFB", "CALCIUM", "GEL"], filtrable: true },
      { cle: "polarite", libelle: "Polarité", typeAttribut: "ENUM", portee: "VARIANTE", liste: ["droite", "gauche"], filtrable: true },
    ],
    "DEMO-FREIN-PLAQUETTES": [
      { cle: "materiau", libelle: "Matériau", typeAttribut: "ENUM", portee: "VARIANTE", liste: ["céramique", "semi-métallique", "organique"], filtrable: true, comparable: true },
      { cle: "capteur_usure", libelle: "Capteur d'usure", typeAttribut: "BOOLEEN", portee: "VARIANTE", filtrable: true },
      { cle: "epaisseur", libelle: "Épaisseur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", comparable: true },
    ],
    "DEMO-FREIN-DISQUES": [
      { cle: "diametre_exterieur", libelle: "Diamètre extérieur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", searchable: true, filtrable: true, comparable: true },
      { cle: "epaisseur", libelle: "Épaisseur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", comparable: true },
      { cle: "ventile", libelle: "Ventilé", typeAttribut: "BOOLEEN", portee: "VARIANTE", filtrable: true },
    ],
    "DEMO-FILTRATION-HUILE": [
      { cle: "diametre_exterieur", libelle: "Diamètre extérieur", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MM", searchable: true, filtrable: true, comparable: true },
      { cle: "filetage", libelle: "Filetage", typeAttribut: "TEXTE", portee: "VARIANTE", searchable: true, filtrable: true },
      { cle: "clapet_anti_retour", libelle: "Clapet anti-retour", typeAttribut: "BOOLEEN", portee: "VARIANTE", filtrable: true },
    ],
    "DEMO-HUILES": [
      { cle: "grade_sae", libelle: "Grade SAE", typeAttribut: "TEXTE", portee: "VARIANTE", searchable: true, filtrable: true, comparable: true, obligatoire: true },
      { cle: "norme_api", libelle: "Norme API", typeAttribut: "TEXTE", portee: "VARIANTE", comparable: true },
      { cle: "type_huile", libelle: "Type", typeAttribut: "ENUM", portee: "VARIANTE", liste: ["synthétique", "semi-synthétique", "minérale"], filtrable: true },
      { cle: "contenance", libelle: "Contenance", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "L", filtrable: true },
    ],
    "DEMO-FLUIDES-FREIN": [
      { cle: "norme_dot", libelle: "Norme DOT", typeAttribut: "ENUM", portee: "VARIANTE", liste: ["DOT3", "DOT4", "DOT5.1"], searchable: true, filtrable: true },
      { cle: "point_ebullition", libelle: "Point d'ébullition sec", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "CELSIUS", comparable: true },
      { cle: "contenance", libelle: "Contenance", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "L", filtrable: true },
    ],
    "DEMO-REFROIDISSEMENT": [
      { cle: "compatibilite_anticorrosion", libelle: "Anticorrosion", typeAttribut: "TEXTE", portee: "VARIANTE", comparable: true },
      { cle: "temperature", libelle: "Température de protection", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "CELSIUS", filtrable: true, comparable: true },
      { cle: "contenance", libelle: "Contenance", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "L", filtrable: true },
    ],
    "DEMO-PNEUS": [
      { cle: "dimension", libelle: "Dimension (ex. 225/45 R17)", typeAttribut: "TEXTE", portee: "VARIANTE", searchable: true, filtrable: true, comparable: true, obligatoire: true },
      { cle: "indice_charge", libelle: "Indice de charge", typeAttribut: "NOMBRE", portee: "VARIANTE", filtrable: true },
      { cle: "indice_vitesse", libelle: "Indice de vitesse", typeAttribut: "TEXTE", portee: "VARIANTE", filtrable: true },
      { cle: "saison", libelle: "Saison", typeAttribut: "ENUM", portee: "VARIANTE", liste: ["été", "hiver", "4 saisons"], filtrable: true },
      { cle: "runflat", libelle: "Runflat", typeAttribut: "BOOLEEN", portee: "VARIANTE", filtrable: true },
    ],
    "DEMO-OUTCLES": [
      { cle: "plage_min", libelle: "Couple min", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "NM", searchable: true, filtrable: true, comparable: true },
      { cle: "plage_max", libelle: "Couple max", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "NM", searchable: true, filtrable: true, comparable: true },
      { cle: "certification", libelle: "Certification ISO 6789", typeAttribut: "BOOLEEN", portee: "VARIANTE", filtrable: true },
    ],
    "DEMO-OUTMESURE": [
      { cle: "portee", libelle: "Portée de mesure", typeAttribut: "TEXTE", portee: "VARIANTE", searchable: true, filtrable: true },
      { cle: "certification", libelle: "Calibration requise", typeAttribut: "BOOLEEN", portee: "VARIANTE", filtrable: true },
    ],
    "DEMO-EQP-DIAG": [
      { cle: "protocoles", libelle: "Protocoles supportés", typeAttribut: "TEXTE", portee: "VARIANTE", searchable: true, filtrable: true, comparable: true },
      { cle: "calibration", libelle: "Calibration ADAS", typeAttribut: "BOOLEEN", portee: "VARIANTE", filtrable: true },
    ],
    "DEMO-KITS-COFFRETS": [
      { cle: "nb_pieces", libelle: "Nombre de pièces", typeAttribut: "NOMBRE", portee: "VARIANTE", filtrable: true, comparable: true },
      { cle: "carre_entrainement", libelle: "Carré d'entraînement", typeAttribut: "TEXTE", portee: "VARIANTE", filtrable: true },
    ],
    "DEMO-SRV-ENTRETIEN": [
      { cle: "duree", libelle: "Durée moyenne", typeAttribut: "DUREE", portee: "VARIANTE" },
      { cle: "garantie_prestation", libelle: "Garantie prestation", typeAttribut: "NOMBRE", portee: "VARIANTE", unite: "MOIS" },
    ],
    "DEMO-SRV-REPARATION": [
      { cle: "duree", libelle: "Durée moyenne", typeAttribut: "DUREE", portee: "VARIANTE" },
      { cle: "expertise", libelle: "Expertise requise", typeAttribut: "TEXTE", portee: "VARIANTE", comparable: true },
    ],
  };
  for (const [code, defs] of Object.entries(DEFS_BY_CAT)) {
    const catId = catMap.get(code);
    if (!catId) continue;
    for (const d of defs) {
      const uniteId = d.unite ? UNI[d.unite as keyof typeof UNI] ?? null : null;
      await db
        .insert(attributDefinitions)
        .values({
          categorieId: catId,
          portee: d.portee ?? "ARTICLE",
          cle: d.cle,
          libelle: d.libelle,
          typeAttribut: d.typeAttribut,
          obligatoire: d.obligatoire ?? false,
          searchable: d.searchable ?? false,
          filtrable: d.filtrable ?? false,
          comparable: d.comparable ?? false,
          liste: d.liste ?? [],
          uniteId: uniteId as string | null,
          isActive: true,
        } as any)
        .onConflictDoNothing();
    }
  }

  const FOURNISSEURS = [
    { nom: "JP Auto Pièces", code: "SUP-001", typeService: "PIECES_AUTO", circuit: "PIECES", telephone: "+229 01 12 34 56 78", email: "commandes@jpautopieces.bj", ville: "Cotonou", pays: "Bénin", conditionsPaiement: "30 jours fin de mois" },
    { nom: "Auto-Solex Distribution", code: "SUP-002", typeService: "PIECES_AUTO", circuit: "PIECES", telephone: "+229 01 98 76 54 32", email: "vente@autosolex.bj", ville: "Abomey-Calavi", pays: "Bénin", conditionsPaiement: "Comptant" },
    { nom: "Rubber & Pneu Ouest-Afrique", code: "SUP-003", typeService: "PIECES_AUTO", circuit: "PIECES", telephone: "+229 01 23 45 67 89", email: "pro@rubberpneuao.com", ville: "Cotonou", pays: "Bénin", conditionsPaiement: "15 jours" },
    { nom: "Outillage Pro SARL", code: "SUP-004", typeService: "OUTILLAGE", circuit: "PIECES", telephone: "+229 01 11 22 33 44", email: "shop@outillagepro.bj", ville: "Cotonou", pays: "Bénin", conditionsPaiement: "30 jours" },
    { nom: "Fluides & Chimie Atelier", code: "SUP-005", typeService: "AUTRE", circuit: "PIECES", telephone: "+229 01 55 66 77 88", email: "contact@fluides-atelier.com", ville: "Porto-Novo", pays: "Bénin", conditionsPaiement: "Comptant" },
    { nom: "MecaDiag Expertises", code: "SUP-006", typeService: "EXPERTISE", circuit: "CHARGES", telephone: "+229 01 44 55 66 77", email: "calibrage@mecadiag.com", ville: "Cotonou", pays: "Bénin", conditionsPaiement: "Comptant" },
  ];
  for (const f of FOURNISSEURS) {
    await db.insert(fournisseurs).values({ ...f, agenceId: AGENCE_ID, isActive: true } as any).onConflictDoNothing({ target: fournisseurs.code });
  }
  const fourIds = new Map<string, number>();
  const fr = await db.select({ id: fournisseurs.id, code: fournisseurs.code }).from(fournisseurs);
  for (const x of fr) fourIds.set(x.code, x.id);

  const EMPLOYES = [
    { matricule: "MEC-001", nom: "HOUNSOU", prenom: "Sébastien", fonction: "Technicien polyvalent", typeEmploye: "permanent", agenceId: AGENCE_ID, statut: "actif" },
    { matricule: "MEC-002", nom: "AGOSSOU", prenom: "Yannick", fonction: "Technicien mécanique", typeEmploye: "permanent", agenceId: AGENCE_ID, statut: "actif" },
    { matricule: "MEC-003", nom: "BOSSOU", prenom: "Maëva", fonction: "Technicienne diagnostic", typeEmploye: "permanent", agenceId: AGENCE_ID, statut: "actif" },
    { matricule: "MEC-004", nom: "KOUAMI", prenom: "Jules", fonction: "Technicien carrosserie", typeEmploye: "permanent", agenceId: AGENCE_ID, statut: "actif" },
    { matricule: "MAG-001", nom: "AVLESSI", prenom: "Patrick", fonction: "Magasinier", typeEmploye: "permanent", agenceId: AGENCE_ID, statut: "actif" },
    { matricule: "GES-001", nom: "DOSSOU", prenom: "Isabelle", fonction: "Responsable atelier", typeEmploye: "permanent", agenceId: AGENCE_ID, statut: "actif" },
  ];
  for (const e of EMPLOYES) {
    await db.insert(employes).values(e as any).onConflictDoNothing({ target: employes.matricule });
  }
  const empIds = new Map<string, number>();
  const em = await db.select({ id: employes.id, matricule: employes.matricule }).from(employes);
  for (const x of em) empIds.set(x.matricule, x.id);

  const VEHICULES = [
    { immatriculation: "CM-1011-AB", marque: "Toyota", modele: "Corolla", version: "1.8 VVT-i Comfort", annee: 2017, carburant: "essence", typeVehicule: "voiture", kilometrage: 98400, statutImmobilisation: "en_reparation", couleur: "Gris platine" },
    { immatriculation: "CM-2044-BC", marque: "Toyota", modele: "Hilux", version: "2.8 D-4D Double Cab", annee: 2019, carburant: "diesel", typeVehicule: "utilitaire", kilometrage: 142500, statutImmobilisation: "en_diagnostic", couleur: "Blanc" },
    { immatriculation: "CM-3088-CD", marque: "Honda", modele: "CR-V", version: "2.0 i-VTEC EX", annee: 2015, carburant: "essence", typeVehicule: "voiture", kilometrage: 121300, statutImmobilisation: "attente_piece_locale", couleur: "Noir" },
    { immatriculation: "CM-4156-DE", marque: "Mercedes", modele: "Classe C", version: "C200 Progressive", annee: 2018, carburant: "essence", typeVehicule: "voiture", kilometrage: 76300, statutImmobilisation: "en_recreation", couleur: "Bleu nuit" },
    { immatriculation: "CM-5210-EF", marque: "Ford", modele: "Ranger", version: "2.2 TDCi Double Cab", annee: 2020, carburant: "diesel", typeVehicule: "utilitaire", kilometrage: 88900, statutImmobilisation: "en_reparation", couleur: "Rouge" },
    { immatriculation: "CM-6341-FG", marque: "Hyundai", modele: "Tucson", version: "1.6 T-GDi Premium", annee: 2019, carburant: "essence", typeVehicule: "voiture", kilometrage: 65700, statutImmobilisation: "sorti", couleur: "Blanc nacré" },
    { immatriculation: "CM-7402-GH", marque: "Kia", modele: "Sportage", version: "1.6 CRDi Active", annee: 2016, carburant: "diesel", typeVehicule: "voiture", kilometrage: 110800, statutImmobilisation: "en_reparation", couleur: "Brun" },
    { immatriculation: "CM-8533-HI", marque: "Nissan", modele: "X-Trail", version: "2.0 dCi Tekna", annee: 2021, carburant: "diesel", typeVehicule: "voiture", kilometrage: 54700, statutImmobilisation: "en_diagnostic", couleur: "Gris anthracite" },
    { immatriculation: "CM-9664-IJ", marque: "Volkswagen", modele: "Golf", version: "1.4 TSI Carat", annee: 2014, carburant: "essence", typeVehicule: "voiture", kilometrage: 167200, statutImmobilisation: "sorti", couleur: "Noir" },
    { immatriculation: "CM-1075-JK", marque: "Peugeot", modele: "3008", version: "1.5 BlueHDi Allure", annee: 2022, carburant: "diesel", typeVehicule: "voiture", kilometrage: 41200, statutImmobilisation: "en_reception", couleur: "Vert" },
    { immatriculation: "CM-1186-KL", marque: "Toyota", modele: "RAV4", version: "2.5 Hybride AWD", annee: 2023, carburant: "hybride", typeVehicule: "voiture", kilometrage: 23900, statutImmobilisation: "en_reparation", couleur: "Bleu" },
    { immatriculation: "CM-1297-LM", marque: "Honda", modele: "Civic", version: "1.8 VTi Sedan", annee: 2012, carburant: "essence", typeVehicule: "voiture", kilometrage: 189400, statutImmobilisation: "sorti", couleur: "Argent" },
  ];
  const vehIds = new Map<string, number>();
  for (const v of VEHICULES) {
    const dup = await db.select({ id: vehicules.id }).from(vehicules).where(eq(vehicules.immatriculation, v.immatriculation)).limit(1);
    if (dup.length) { vehIds.set(v.immatriculation, dup[0].id); continue; }
    const [r] = await db.insert(vehicules).values({ agenceId: AGENCE_ID, ...v, isActive: true }).returning({ id: vehicules.id });
    if (r) vehIds.set(v.immatriculation, r.id);
  }

  const EMPLACEMENTS: { code: string; libelle: string; type: string; parentCode?: string; profondeur: number; ordre: number }[] = [
    { code: "LOC-MAG-A", libelle: "Magasin Pièces Auto", type: "RAYON", profondeur: 0, ordre: 1 },
    { code: "LOC-MAG-A-R01", libelle: "Rayon R01 — Freinage", type: "RAYON", parentCode: "LOC-MAG-A", profondeur: 1, ordre: 1 },
    { code: "LOC-MAG-A-R01-E01", libelle: "Étagère E01", type: "RAYON", parentCode: "LOC-MAG-A-R01", profondeur: 2, ordre: 1 },
    { code: "LOC-MAG-A-R01-E01-C01", libelle: "Casier C01", type: "RAYON", parentCode: "LOC-MAG-A-R01-E01", profondeur: 3, ordre: 1 },
    { code: "LOC-MAG-A-R01-E01-C02", libelle: "Casier C02", type: "RAYON", parentCode: "LOC-MAG-A-R01-E01", profondeur: 3, ordre: 2 },
    { code: "LOC-MAG-A-R01-E01-C03", libelle: "Casier C03", type: "RAYON", parentCode: "LOC-MAG-A-R01-E01", profondeur: 3, ordre: 3 },
    { code: "LOC-MAG-A-R02", libelle: "Rayon R02 — Filtration", type: "RAYON", parentCode: "LOC-MAG-A", profondeur: 1, ordre: 2 },
    { code: "LOC-MAG-A-R02-E01", libelle: "Étagère E01", type: "RAYON", parentCode: "LOC-MAG-A-R02", profondeur: 2, ordre: 1 },
    { code: "LOC-MAG-A-R02-E01-C01", libelle: "Casier C01", type: "RAYON", parentCode: "LOC-MAG-A-R02-E01", profondeur: 3, ordre: 1 },
    { code: "LOC-MAG-A-R02-E02", libelle: "Étagère E02", type: "RAYON", parentCode: "LOC-MAG-A-R02", profondeur: 2, ordre: 2 },
    { code: "LOC-MAG-A-R02-E02-C01", libelle: "Casier C01", type: "RAYON", parentCode: "LOC-MAG-A-R02-E02", profondeur: 3, ordre: 1 },
    { code: "LOC-MAG-A-R03", libelle: "Rayon R03 — Allumage & moteur", type: "RAYON", parentCode: "LOC-MAG-A", profondeur: 1, ordre: 3 },
    { code: "LOC-MAG-A-R03-E01", libelle: "Étagère E01", type: "RAYON", parentCode: "LOC-MAG-A-R03", profondeur: 2, ordre: 1 },
    { code: "LOC-MAG-A-R03-E01-C01", libelle: "Casier C01", type: "RAYON", parentCode: "LOC-MAG-A-R03-E01", profondeur: 3, ordre: 1 },
    { code: "LOC-MAG-A-R04", libelle: "Rayon R04 — Suspension & élec", type: "RAYON", parentCode: "LOC-MAG-A", profondeur: 1, ordre: 4 },
    { code: "LOC-MAG-A-R04-E01", libelle: "Étagère E01", type: "RAYON", parentCode: "LOC-MAG-A-R04", profondeur: 2, ordre: 1 },
    { code: "LOC-MAG-A-R04-E01-C01", libelle: "Casier C01", type: "RAYON", parentCode: "LOC-MAG-A-R04-E01", profondeur: 3, ordre: 1 },
    { code: "LOC-MAG-B", libelle: "Magasin Fluides & Chimie", type: "RAYON", profondeur: 0, ordre: 2 },
    { code: "LOC-MAG-B-R01", libelle: "Rayon R01 — Huiles", type: "RAYON", parentCode: "LOC-MAG-B", profondeur: 1, ordre: 1 },
    { code: "LOC-MAG-B-R01-E01", libelle: "Étagère E01 (bidons 5L)", type: "RAYON", parentCode: "LOC-MAG-B-R01", profondeur: 2, ordre: 1 },
    { code: "LOC-MAG-B-R01-E01-C01", libelle: "Casier C01", type: "RAYON", parentCode: "LOC-MAG-B-R01-E01", profondeur: 3, ordre: 1 },
    { code: "LOC-MAG-B-R02", libelle: "Rayon R02 — Liquides DLC", type: "RAYON", parentCode: "LOC-MAG-B", profondeur: 1, ordre: 2 },
    { code: "LOC-MAG-B-R02-E01", libelle: "Étagère E01", type: "RAYON", parentCode: "LOC-MAG-B-R02", profondeur: 2, ordre: 1 },
    { code: "LOC-MAG-B-R02-E01-C01", libelle: "Casier C01", type: "RAYON", parentCode: "LOC-MAG-B-R02-E01", profondeur: 3, ordre: 1 },
    { code: "LOC-MAG-B-R03", libelle: "Rayon R03 — Chimie", type: "RAYON", parentCode: "LOC-MAG-B", profondeur: 1, ordre: 3 },
    { code: "LOC-MAG-B-R03-E01", libelle: "Étagère E01", type: "RAYON", parentCode: "LOC-MAG-B-R03", profondeur: 2, ordre: 1 },
    { code: "LOC-MAG-B-R03-E01-C01", libelle: "Casier C01", type: "RAYON", parentCode: "LOC-MAG-B-R03-E01", profondeur: 3, ordre: 1 },
    { code: "LOC-MAG-C", libelle: "Zone Pneumatiques", type: "RAYON", profondeur: 0, ordre: 3 },
    { code: "LOC-MAG-C-R01", libelle: "Râtelier pneus R01", type: "RAYON", parentCode: "LOC-MAG-C", profondeur: 1, ordre: 1 },
    { code: "LOC-OUT", libelle: "Local Outillage", type: "RAYON", profondeur: 0, ordre: 4 },
    { code: "LOC-OUT-R01", libelle: "Râtelier clés R01", type: "RAYON", parentCode: "LOC-OUT", profondeur: 1, ordre: 1 },
    { code: "LOC-OUT-R02", libelle: "Râtelier mesure R02", type: "RAYON", parentCode: "LOC-OUT", profondeur: 1, ordre: 2 },
    { code: "LOC-OUT-R03", libelle: "Râtelier électroportatif R03", type: "RAYON", parentCode: "LOC-OUT", profondeur: 1, ordre: 3 },
    { code: "LOC-KIT", libelle: "Coffrets & kits", type: "RAYON", profondeur: 0, ordre: 5 },
    { code: "LOC-KIT-R01", libelle: "Étagère coffrets R01", type: "RAYON", parentCode: "LOC-KIT", profondeur: 1, ordre: 1 },
    { code: "LOC-AT1", libelle: "Zone Atelier 1 (pont A)", type: "RAYON", profondeur: 0, ordre: 6 },
    { code: "LOC-AT2", libelle: "Zone Atelier 2 (pont B)", type: "RAYON", profondeur: 0, ordre: 7 },
    { code: "LOC-AT3", libelle: "Zone Atelier 3 (pneumatique)", type: "RAYON", profondeur: 0, ordre: 8 },
    { code: "LOC-AT-DIAG", libelle: "Banc Diagnostic & ADAS", type: "RAYON", profondeur: 0, ordre: 9 },
    { code: "LOC-QUAI", libelle: "Quai de réception", type: "RAYON", profondeur: 0, ordre: 10 },
    { code: "LOC-EPHEMERE", libelle: "Zone pièces prélevées", type: "RAYON", profondeur: 0, ordre: 11 },
    { code: "LOC-DEFECT", libelle: "Zone rebut / pièces hors service", type: "RAYON", profondeur: 0, ordre: 12 },
    { code: "LOC-ALERTE", libelle: "Zone litiges / contrôle qualité", type: "RAYON", profondeur: 0, ordre: 13 },
  ];
  const locIds = new Map<string, number>();
  for (const e of EMPLACEMENTS) {
    const dup = await db.select({ id: emplacements.id }).from(emplacements).where(eq(emplacements.code, e.code)).limit(1);
    if (dup.length) { locIds.set(e.code, dup[0].id); continue; }
    const parentId = e.parentCode ? locIds.get(e.parentCode)! : null;
    const [r] = await db.insert(emplacements).values({ agenceId: AGENCE_ID, code: e.code, libelle: e.libelle, type: e.type, parentId: parentId as number | null, profondeur: e.profondeur, ordre: e.ordre, isActive: true } as any).returning({ id: emplacements.id });
    if (r) locIds.set(e.code, r.id);
  }

  interface VarianteDef {
    sku: string;
    titre: string;
    marque?: string;
    refFab?: string;
    refOem?: string;
    ean?: string;
    fournisseur?: string;
    refFournisseur?: string;
    prixVente?: string;
    prixPro?: string;
    prixParticulier?: string;
    prixAchat?: string;
    tva?: string;
    seuil?: number;
    seuilCritique?: number;
    stockMax?: number;
    stock?: number;
    quantiteReservee?: number;
    quantiteBloquee?: number;
    uniteBase?: string;
    conditionnement?: string;
    emplacement?: string;
    positionCote?: string;
    positionEssieu?: string;
    positionZone?: string;
    positionEmplacement?: string;
    origineProduit?: string;
    etatProduit?: string;
    lot?: { numero: string; dlc: string; qte: number; provenance?: string; qualite?: string; fabricant?: string; dateFabrication?: string };
    refs?: { typeRef: string; valeur: string; isPrincipale?: boolean }[];
    attr?: { cle: string; valeur: string; unite?: string; typeAttribut?: string }[];
    complet?: boolean;
  }
  interface ArticleDef {
    code: string;
    designation: string;
    designationCourte?: string;
    categorie: string;
    typeProduit?: string;
    articleAttr?: { cle: string; valeur: string; unite?: string; typeAttribut?: string }[];
    docs?: { type: string; titre: string; url: string }[];
    equivalents?: { marque: string; reference: string; note?: string }[];
    compat?: { typeCompat?: string; marque: string; modele: string; generation?: string; anneeDe?: number; anneeA?: number; motorisation?: string; codeMoteur?: string; carburant?: string; cylindree?: string; puissanceKw?: string; boite?: string; transmission?: string; position?: string; refOem?: string; typeFreinage?: string; restrictions?: string; notes?: string; produitId?: boolean }[];
    variantes: VarianteDef[];
  }

  const ARTICLES: ArticleDef[] = [
    {
      code: "ART-FIL-HUI-001", designation: "Filtre à huile", categorie: "DEMO-FILTRATION-HUILE",
      articleAttr: [{ cle: "type_filtre", valeur: "huile", typeAttribut: "ENUM" }],
      docs: [{ type: "FICHE_TECHNIQUE", titre: "Fiche technique filtration", url: "/docs/fiches/filtre-huile.pdf" }],
      equivalents: [{ marque: "MANN-FILTER", reference: "W 712/95" }, { marque: "BOSCH", reference: "0 986 452 107" }, { marque: "TOYOTA", reference: "90915-YZZD2" }],
      compat: [
        { marque: "Toyota", modele: "Corolla", generation: "E180", anneeDe: 2013, anneeA: 2019, motorisation: "1ZZ-FE / 2ZR-FE", carburant: "essence", cylindree: "1.8", refOem: "90915-YZZD2" },
        { marque: "Toyota", modele: "Hilux", generation: "AN120", anneeDe: 2015, anneeA: 2023, motorisation: "1GD-FTV", codeMoteur: "1GD-FTV", carburant: "diesel", cylindree: "2.8", refOem: "90915-YZZE3" },
        { marque: "Toyota", modele: "RAV4", anneeDe: 2019, anneeA: 2023, motorisation: "A25A-FXS", carburant: "hybride", refOem: "90915-YZZD2" },
      ],
      variantes: [
        { sku: "DEMO-FIL-TOY-01", titre: "Filtre à huile Toyota 90915-YZZD2", marque: "Toyota", refFab: "90915-YZZD2", refOem: "90915-YZZD2", ean: "DEMO-EAN-4902530311204", fournisseur: "SUP-001", refFournisseur: "JP-FIL-TOY001", prixVente: "4500", prixPro: "4000", prixParticulier: "4500", prixAchat: "2800", tva: "19.25", seuil: 10, seuilCritique: 4, stockMax: 40, stock: 6, uniteBase: "PCE", emplacement: "LOC-MAG-A-R02-E01-C01", positionEmplacement: "MOTEUR", origineProduit: "CONSTRUCTEUR" },
        { sku: "DEMO-FIL-MANN-01", titre: "Filtre à huile MANN W 712/95", marque: "MANN-FILTER", refFab: "W 712/95", ean: "DEMO-EAN-4011558010401", fournisseur: "SUP-002", refFournisseur: "AS-FIL-M094", prixVente: "3900", prixPro: "3600", prixParticulier: "3900", prixAchat: "2400", tva: "19.25", seuil: 8, seuilCritique: 3, stockMax: 30, stock: 4, uniteBase: "PCE", emplacement: "LOC-MAG-A-R02-E01-C01", positionEmplacement: "MOTEUR", origineProduit: "OEM", positionCote: "LES_DEUX", attr: [{ cle: "diametre_exterieur", valeur: "65.5", unite: "MM", typeAttribut: "NOMBRE" }, { cle: "filetage", valeur: "3/4-16", typeAttribut: "TEXTE" }] },
      ],
    },
    {
      code: "ART-FIL-AIR-001", designation: "Filtre à air", categorie: "DEMO-FILTRATION-AIR",
      articleAttr: [{ cle: "type_filtre", valeur: "air", typeAttribut: "ENUM" }],
      equivalents: [{ marque: "TOYOTA", reference: "17801-0T030" }, { marque: "MANN-FILTER", reference: "C 23012" }],
      compat: [{ marque: "Toyota", modele: "Corolla", generation: "E180", anneeDe: 2013, anneeA: 2019, motorisation: "2ZR-FE", carburant: "essence", cylindree: "1.8", refOem: "17801-0T030" }],
      variantes: [
        { sku: "DEMO-FILAIR-01", titre: "Filtre à air Toyota 17801-0T030", marque: "Toyota", refFab: "17801-0T030", ean: "DEMO-EAN-4902530455601", fournisseur: "SUP-001", refFournisseur: "JP-FAI-23", prixVente: "6900", prixPro: "6200", prixParticulier: "6900", prixAchat: "4100", tva: "19.25", seuil: 6, seuilCritique: 2, stockMax: 20, stock: 3, uniteBase: "PCE", emplacement: "LOC-MAG-A-R02-E02-C01", positionEmplacement: "MOTEUR" },
      ],
    },
    {
      code: "ART-FIL-CARB-001", designation: "Filtre à carburant", categorie: "DEMO-FILTRATION-CARBURANT",
      articleAttr: [{ cle: "type_filtre", valeur: "carburant", typeAttribut: "ENUM" }],
      equivalents: [{ marque: "TOYOTA", reference: "23390-0L040" }],
      compat: [{ marque: "Toyota", modele: "Hilux", anneeDe: 2015, anneeA: 2023, motorisation: "1GD-FTV", carburant: "diesel", refOem: "23390-0L040" }],
      variantes: [{ sku: "DEMO-FILCAR-01", titre: "Filtre à carburant Toyota 23390-0L040", marque: "Toyota", refFab: "23390-0L040", ean: "DEMO-EAN-4902530991001", fournisseur: "SUP-001", refFournisseur: "JP-FCAR-77", prixVente: "8900", prixAchat: "5400", seuil: 5, seuilCritique: 2, stockMax: 15, stock: 2, uniteBase: "PCE", emplacement: "LOC-MAG-A-R02-E02-C01", positionEmplacement: "MOTEUR" }],
    },
    {
      code: "ART-PLAQ-AV-001", designation: "Plaquettes de frein avant", categorie: "DEMO-FREIN-PLAQUETTES",
      articleAttr: [{ cle: "position", valeur: "avant", typeAttribut: "TEXTE" }],
      equivalents: [{ marque: "BOSCH", reference: "0 986 494 561" }, { marque: "TOYOTA", reference: "04465-02190" }, { marque: "TRW", reference: "GDB1629" }],
      compat: [
        { marque: "Toyota", modele: "Corolla", generation: "E180", anneeDe: 2013, anneeA: 2019, position: "AVANT", typeFreinage: "1.8 essence (278 mm)", refOem: "04465-02190" },
        { marque: "Toyota", modele: "RAV4", anneeDe: 2019, anneeA: 2023, position: "AVANT", typeFreinage: "2.5 hybride (305 mm)", refOem: "04465-48170" },
        { marque: "Honda", modele: "CR-V", anneeDe: 2015, anneeA: 2018, position: "AVANT", typeFreinage: "2.0 i-VTEC", refOem: "45022-T1A-N00" },
      ],
      variantes: [
        { sku: "DEMO-PLAQ-BOS-01", titre: "Plaquettes avant Bosch 0 986 494 561", marque: "BOSCH", refFab: "0 986 494 561", refOem: "04465-02190", ean: "DEMO-EAN-3165143545601", fournisseur: "SUP-001", refFournisseur: "JP-PLAV-12", prixVente: "18500", prixPro: "16600", prixParticulier: "18500", prixAchat: "11200", seuil: 6, seuilCritique: 2, stockMax: 20, stock: 8, uniteBase: "JEU", conditionnement: "Jeu de 4", emplacement: "LOC-MAG-A-R01-E01-C01", positionCote: "LES_DEUX", positionEssieu: "AVANT", positionEmplacement: "FREINAGE", origineProduit: "AFTERMARKET", attr: [{ cle: "materiau", valeur: "semi-métallique", typeAttribut: "ENUM" }, { cle: "capteur_usure", valeur: "true", typeAttribut: "BOOLEEN" }, { cle: "epaisseur", valeur: "18", unite: "MM", typeAttribut: "NOMBRE" }] },
        { sku: "DEMO-PLAQ-TRW-01", titre: "Plaquettes avant TRW GDB1629", marque: "TRW Automotive", refFab: "GDB1629", ean: "DEMO-EAN-8033281001001", fournisseur: "SUP-002", refFournisseur: "AS-PLAQ-TRW01", prixVente: "16200", prixAchat: "9800", seuil: 5, seuilCritique: 2, stockMax: 15, stock: 4, uniteBase: "JEU", conditionnement: "Jeu de 4", emplacement: "LOC-MAG-A-R01-E01-C01", positionCote: "LES_DEUX", positionEssieu: "AVANT", positionEmplacement: "FREINAGE", attr: [{ cle: "materiau", valeur: "céramique", typeAttribut: "ENUM" }, { cle: "capteur_usure", valeur: "false", typeAttribut: "BOOLEEN" }] },
      ],
    },
    {
      code: "ART-PLAQ-AR-001", designation: "Plaquettes de frein arrière", categorie: "DEMO-FREIN-PLAQUETTES",
      articleAttr: [{ cle: "position", valeur: "arrière", typeAttribut: "TEXTE" }],
      equivalents: [{ marque: "TOYOTA", reference: "04466-02180" }, { marque: "BREMBO", reference: "P68042" }],
      compat: [{ marque: "Toyota", modele: "Hilux", anneeDe: 2015, anneeA: 2023, position: "ARRIERE", refOem: "04466-02180" }],
      variantes: [{ sku: "DEMO-PLAQR-BOS-01", titre: "Plaquettes arrière Bosch 0 986 462 133", marque: "BOSCH", refFab: "0 986 462 133", refOem: "04466-02180", ean: "DEMO-EAN-3165143599701", fournisseur: "SUP-001", refFournisseur: "JP-PLAR-33", prixVente: "15400", prixPro: "13800", prixParticulier: "15400", prixAchat: "9300", seuil: 5, seuilCritique: 2, stockMax: 15, stock: 5, uniteBase: "JEU", conditionnement: "Jeu de 4", emplacement: "LOC-MAG-A-R01-E01-C02", positionEssieu: "ARRIERE", positionEmplacement: "FREINAGE" }],
    },
    {
      code: "ART-DISQ-AV-001", designation: "Disque de frein avant ventilé", categorie: "DEMO-FREIN-DISQUES",
      articleAttr: [{ cle: "position", valeur: "avant", typeAttribut: "TEXTE" }],
      equivalents: [{ marque: "BREMBO", reference: "09.6690.11" }, { marque: "TOYOTA", reference: "43512-0D060" }],
      compat: [
        { marque: "Toyota", modele: "Corolla", anneeDe: 2013, anneeA: 2019, position: "AVANT", diametreFrein: "278", typeFreinage: "ventilé", refOem: "43512-0D060" },
        { marque: "Honda", modele: "CR-V", anneeDe: 2015, anneeA: 2018, position: "AVANT", diametreFrein: "320", typeFreinage: "ventilé", refOem: "45251-T1A-A50" },
      ],
      variantes: [
        { sku: "DEMO-DISQ-BR-01", titre: "Disque avant ventilé Brembo 09.6690.11", marque: "BREMBO", refFab: "09.6690.11", ean: "DEMO-EAN-8020698310001", fournisseur: "SUP-001", refFournisseur: "JP-DISQ-09", prixVente: "27800", prixAchat: "16800", seuil: 4, seuilCritique: 2, stockMax: 12, stock: 6, uniteBase: "PAIRE", conditionnement: "Paire", emplacement: "LOC-MAG-A-R01-E01-C03", positionCote: "LES_DEUX", positionEssieu: "AVANT", positionEmplacement: "FREINAGE", attr: [{ cle: "diametre_exterieur", valeur: "278", unite: "MM", typeAttribut: "NOMBRE" }, { cle: "ventile", valeur: "true", typeAttribut: "BOOLEEN" }] },
        { sku: "DEMO-DISQ-HON-01", titre: "Disque avant Honda 45251-T1A-A50", marque: "Honda", refFab: "45251-T1A-A50", ean: "DEMO-EAN-4547054610001", fournisseur: "SUP-001", refFournisseur: "JP-DISQ-H01", prixVente: "32400", prixAchat: "19600", seuil: 3, seuilCritique: 1, stockMax: 10, stock: 3, uniteBase: "PAIRE", conditionnement: "Paire", emplacement: "LOC-MAG-A-R01-E01-C03", positionEssieu: "AVANT", positionEmplacement: "FREINAGE", attr: [{ cle: "diametre_exterieur", valeur: "320", unite: "MM", typeAttribut: "NOMBRE" }, { cle: "ventile", valeur: "true", typeAttribut: "BOOLEEN" }] },
      ],
    },
    {
      code: "ART-BATT-001", designation: "Batterie de démarrage", categorie: "DEMO-BATTERIES",
      equivalents: [{ marque: "VARTA", reference: "E39 0 802 045 585" }, { marque: "EXIDE", reference: "EA770" }],
      docs: [{ type: "FICHE_TECHNIQUE", titre: "Fiche technique batterie AGM", url: "/docs/fiches/batterie-agm.pdf" }],
      compat: [
        { marque: "Mercedes", modele: "Classe C", generation: "W205", anneeDe: 2015, anneeA: 2021, motorisation: "M264", carburant: "essence", position: "MOTEUR", refOem: "000 982 31 08" },
        { marque: "Volkswagen", modele: "Golf", anneeDe: 2013, anneeA: 2019, carburant: "essence", position: "MOTEUR", refOem: "000 915 105 DC" },
        { marque: "Peugeot", modele: "3008", anneeDe: 2017, anneeA: 2023, motorisation: "DW5", carburant: "diesel", position: "MOTEUR", refOem: "000 962 110 EC" },
      ],
      variantes: [
        { sku: "DEMO-BATT-AGM-70", titre: "Batterie AGM 12V 70Ah 760A", marque: "VARTA", refFab: "E39", refOem: "000 982 31 08", ean: "DEMO-EAN-4030763050001", fournisseur: "SUP-001", refFournisseur: "JP-BATT-AGM70", prixVente: "185000", prixPro: "176000", prixParticulier: "185000", prixAchat: "138000", tva: "19.25", seuil: 2, seuilCritique: 1, stockMax: 8, stock: 5, quantiteReservee: 1, uniteBase: "PCE", conditionnement: "Unité", emplacement: "LOC-MAG-A-R04-E01-C01", positionEmplacement: "MOTEUR", origineProduit: "AFTERMARKET", attr: [{ cle: "tension", valeur: "12", unite: "V", typeAttribut: "NOMBRE" }, { cle: "capacite_ah", valeur: "70", unite: "AH", typeAttribut: "NOMBRE" }, { cle: "cca", valeur: "760", unite: "A", typeAttribut: "NOMBRE" }, { cle: "technologie", valeur: "AGM", typeAttribut: "TEXTE" }, { cle: "polarite", valeur: "droite", typeAttribut: "TEXTE" }] },
        { sku: "DEMO-BATT-EFB-60", titre: "Batterie EFB 12V 60Ah 640A", marque: "EXIDE", refFab: "EA770", ean: "DEMO-EAN-8711843476001", fournisseur: "SUP-002", refFournisseur: "AS-BATT-EFB60", prixVente: "142000", prixAchat: "106000", seuil: 2, seuilCritique: 1, stockMax: 6, stock: 2, quantiteBloquee: 1, uniteBase: "PCE", conditionnement: "Unité", emplacement: "LOC-MAG-A-R04-E01-C01", positionEmplacement: "MOTEUR", attr: [{ cle: "tension", valeur: "12", unite: "V", typeAttribut: "NOMBRE" }, { cle: "capacite_ah", valeur: "60", unite: "AH", typeAttribut: "NOMBRE" }, { cle: "cca", valeur: "640", unite: "A", typeAttribut: "NOMBRE" }, { cle: "technologie", valeur: "EFB", typeAttribut: "TEXTE" }] },
      ],
    },
    {
      code: "ART-BOUGIE-001", designation: "Bougies d'allumage", categorie: "DEMO-ALLUMAGE",
      equivalents: [{ marque: "NGK", reference: "BKR6E-11" }, { marque: "DENSO", reference: "K20PR-U11" }],
      compat: [{ marque: "Toyota", modele: "Corolla", anneeDe: 2013, anneeA: 2019, motorisation: "2ZR-FE", carburant: "essence", refOem: "90919-01257" }],
      variantes: [
        { sku: "DEMO-BOUG-NGK-01", titre: "Bougie NGK BKR6E-11 (jeu de 4)", marque: "NGK", refFab: "BKR6E-11", ean: "DEMO-EAN-8718291260001", fournisseur: "SUP-002", refFournisseur: "AS-BOU-NGK", prixVente: "9800", prixPro: "8900", prixParticulier: "9800", prixAchat: "5900", seuil: 6, seuilCritique: 2, stockMax: 24, stock: 10, quantiteReservee: 4, uniteBase: "JEU", conditionnement: "Jeu de 4", emplacement: "LOC-MAG-A-R03-E01-C01", positionEmplacement: "MOTEUR" },
      ],
    },
    {
      code: "ART-CRO-DIST-001", designation: "Courroie de distribution (kit)", categorie: "DEMO-COURROIES",
      equivalents: [{ marque: "GATES", reference: "K015665XS" }],
      compat: [{ marque: "Honda", modele: "CR-V", anneeDe: 2015, anneeA: 2018, motorisation: "R20A", carburant: "essence", refOem: "06110-R1A-A00" }],
      variantes: [{ sku: "DEMO-KITDIST-HON-01", titre: "Kit distribution Honda R20A (courroie + 2 galets)", marque: "GATES", refFab: "K015665XS", ean: "DEMO-EAN-5400144000001", fournisseur: "SUP-001", refFournisseur: "JP-KD-HON01", prixVente: "56000", prixAchat: "38200", seuil: 2, seuilCritique: 1, stockMax: 6, stock: 3, uniteBase: "KIT", conditionnement: "Kit courroie + galets", emplacement: "LOC-MAG-A-R03-E01-C01", positionEmplacement: "MOTEUR" }],
    },
    {
      code: "ART-AMORT-AV-001", designation: "Amortisseur avant", categorie: "DEMO-SUSPENSION",
      equivalents: [{ marque: "KYB", reference: "334574" }, { marque: "TOYOTA", reference: "48510-09R10" }],
      compat: [
        { marque: "Toyota", modele: "Corolla", anneeDe: 2013, anneeA: 2019, position: "AVANT", refOem: "48510-09R10" },
        { marque: "Kia", modele: "Sportage", anneeDe: 2016, anneeA: 2020, position: "AVANT", refOem: "54650-D4000" },
      ],
      variantes: [
        { sku: "DEMO-AMORT-KYB-01", titre: "Amortisseur avant KYB 334574", marque: "KYB", refFab: "334574", refOem: "48510-09R10", ean: "DEMO-EAN-4902120345601", fournisseur: "SUP-002", refFournisseur: "AS-AMORT-KYB", prixVente: "38500", prixAchat: "24100", seuil: 3, seuilCritique: 1, stockMax: 10, stock: 4, uniteBase: "PCE", conditionnement: "Unité", emplacement: "LOC-MAG-A-R04-E01-C01", positionCote: "GAUCHE", positionEssieu: "AVANT", positionEmplacement: "CHASSIS", attr: [{ cle: "type", valeur: "gaz", typeAttribut: "ENUM" }] },
        { sku: "DEMO-AMORT-KYB-02", titre: "Amortisseur avant KYB 334573", marque: "KYB", refFab: "334573", refOem: "48510-09R10", ean: "DEMO-EAN-4902120345602", fournisseur: "SUP-002", refFournisseur: "AS-AMORT-KYB-D", prixVente: "38500", prixAchat: "24100", seuil: 3, seuilCritique: 1, stockMax: 10, stock: 3, uniteBase: "PCE", conditionnement: "Unité", emplacement: "LOC-MAG-A-R04-E01-C01", positionCote: "DROITE", positionEssieu: "AVANT", positionEmplacement: "CHASSIS", attr: [{ cle: "type", valeur: "gaz", typeAttribut: "ENUM" }] },
      ],
    },
    {
      code: "ART-INJ-001", designation: "Injecteur diesel", categorie: "DEMO-MOTEUR",
      equivalents: [{ marque: "DENSO", reference: "295050-1530" }],
      compat: [{ marque: "Toyota", modele: "Hilux", anneeDe: 2015, anneeA: 2023, motorisation: "1GD-FTV", carburant: "diesel", refOem: "23670-0E110" }],
      variantes: [{ sku: "DEMO-INJ-DEN-01", titre: "Injecteur DENSO 295050-1530", marque: "DENSO", refFab: "295050-1530", ean: "DEMO-EAN-8700000000001", fournisseur: "SUP-001", refFournisseur: "JP-INJ-DEN", prixVente: "265000", prixAchat: "189000", seuil: 1, seuilCritique: 1, stockMax: 4, stock: 1, uniteBase: "PCE", conditionnement: "Unité", emplacement: "LOC-MAG-A-R03-E01-C01", positionEmplacement: "MOTEUR" }],
    },
    {
      code: "ART-ALT-001", designation: "Alternateur", categorie: "DEMO-ELEC",
      equivalents: [{ marque: "VALEO", reference: "437925" }],
      compat: [{ marque: "Ford", modele: "Ranger", anneeDe: 2020, anneeA: 2023, motorisation: "2.2 TDCi", carburant: "diesel", refOem: "AB39-10300-BB" }],
      variantes: [{ sku: "DEMO-ALT-VAL-01", titre: "Alternateur VALEO 437925 (150A)", marque: "VALEO", refFab: "437925", ean: "DEMO-EAN-3262900000001", fournisseur: "SUP-002", refFournisseur: "AS-ALT-VAL", prixVente: "245000", prixAchat: "171000", seuil: 1, seuilCritique: 1, stockMax: 3, stock: 1, uniteBase: "PCE", emplacement: "LOC-MAG-A-R04-E01-C01", positionEmplacement: "MOTEUR", attr: [{ cle: "puissance", valeur: "150", unite: "A", typeAttribut: "NOMBRE" }, { cle: "tension", valeur: "12", unite: "V", typeAttribut: "NOMBRE" }] }],
    },
    {
      code: "ART-PHARE-001", designation: "Projecteur avant", categorie: "DEMO-CARROSSERIE",
      equivalents: [{ marque: "TOYOTA", reference: "81070-02Q80" }],
      compat: [{ marque: "Toyota", modele: "Corolla", anneeDe: 2013, anneeA: 2019, position: "AVANT GAUCHE", refOem: "81070-02Q80" }],
      variantes: [
        { sku: "DEMO-PHARE-TGY-01", titre: "Projecteur avant gauche Toyota Corolla", marque: "Toyota", refFab: "81070-02Q80", ean: "DEMO-EAN-4902535000001", fournisseur: "SUP-001", refFournisseur: "JP-PHARG", prixVente: "148000", prixAchat: "98000", seuil: 1, seuilCritique: 1, stockMax: 4, stock: 1, uniteBase: "PCE", emplacement: "LOC-MAG-A-R04-E01-C01", positionCote: "GAUCHE", positionEssieu: "AVANT", positionEmplacement: "CARROSSERIE" },
        { sku: "DEMO-PHARE-TGY-02", titre: "Projecteur avant droit Toyota Corolla", marque: "Toyota", refFab: "81080-02Q80", ean: "DEMO-EAN-4902535000002", fournisseur: "SUP-001", refFournisseur: "JP-PHARD", prixVente: "148000", prixAchat: "98000", seuil: 1, seuilCritique: 1, stockMax: 4, stock: 0, uniteBase: "PCE", emplacement: "LOC-MAG-A-R04-E01-C01", positionCote: "DROITE", positionEssieu: "AVANT", positionEmplacement: "CARROSSERIE" },
      ],
    },
    {
      code: "ART-HUILE-5W30-001", designation: "Huile moteur 5W30 synthétique", categorie: "DEMO-HUILES",
      articleAttr: [{ cle: "grade_sae", valeur: "5W30", typeAttribut: "TEXTE" }],
      equivalents: [{ marque: "TOTAL QUARTZ", reference: "9000 Energy 5W30" }, { marque: "MOBIL", reference: "1 ESP 5W30" }],
      docs: [{ type: "FICHE_TECHNIQUE", titre: "Fiche technique huile 5W30", url: "/docs/fiches/huile-5w30.pdf" }],
      variantes: [
        { sku: "DEMO-HUILE-5W30-5L", titre: "Huile moteur 5W30 synthétique — bidon 5L", marque: "TOTAL QUARTZ", refFab: "9000 Energy 5W30", ean: "DEMO-EAN-3346002100001", fournisseur: "SUP-005", refFournisseur: "FC-HUILE-5W30", prixVente: "24500", prixPro: "22800", prixParticulier: "24500", prixAchat: "17900", tva: "19.25", seuil: 12, seuilCritique: 5, stockMax: 48, stock: 18, uniteBase: "L", conditionnement: "Bidon 5L", emplacement: "LOC-MAG-B-R01-E01-C01", origineProduit: "OEM", complet: true, lot: { numero: "LOT-5W30-2027A", dlc: "2027-08-31", qte: 12, provenance: "TOTAL RU", qualite: "certifiée API SP ILSAC GF-6", fabricant: "TOTAL Energies", dateFabrication: "2025-11-12" }, attr: [{ cle: "grade_sae", valeur: "5W30", typeAttribut: "TEXTE" }, { cle: "norme_api", valeur: "SP", typeAttribut: "TEXTE" }, { cle: "type_huile", valeur: "synthétique", typeAttribut: "ENUM" }, { cle: "contenance", valeur: "5", unite: "L", typeAttribut: "NOMBRE" }] },
        { sku: "DEMO-HUILE-5W30-VRAC", titre: "Huile moteur 5W30 — vrac (après déconditionnement)", marque: "TOTAL QUARTZ", refFab: "9000 Energy 5W30", ean: "DEMO-EAN-3346002100002", fournisseur: "SUP-005", refFournisseur: "FC-HUILE-5W30", prixVente: "4900", prixAchat: "3580", seuil: 20, seuilCritique: 8, stockMax: 100, stock: 14, uniteBase: "L", conditionnement: "1L", emplacement: "LOC-MAG-B-R01-E01-C01", estReconditionnableBidon: true, origLot: "LOT-5W30-2027B", lot: { numero: "LOT-5W30-2027B", dlc: "2028-03-31", qte: 14, provenance: "TOTAL RU", qualite: "certifiée API SP", fabricant: "TOTAL Energies", dateFabrication: "2026-01-20" }, attr: [{ cle: "grade_sae", valeur: "5W30", typeAttribut: "TEXTE" }] },
      ],
    },
    {
      code: "ART-HUILE-BOITE-001", designation: "Huile de boîte 75W90", categorie: "DEMO-HUILES",
      variantes: [{ sku: "DEMO-HUILE-75W90-1L", titre: "Huile de boîte 75W90 — 1L", marque: "ELF", refFab: "Tranself NFJ 75W90", ean: "DEMO-EAN-3346003000001", fournisseur: "SUP-005", refFournisseur: "FC-75W90", prixVente: "6900", prixAchat: "4700", seuil: 8, seuilCritique: 3, stockMax: 24, stock: 9, uniteBase: "L", conditionnement: "1L", emplacement: "LOC-MAG-B-R01-E01-C01", lot: { numero: "LOT-75W90-2028A", dlc: "2028-11-30", qte: 9, provenance: "ELF FR", qualite: "API GL-5", fabricant: "ELF Lubrifiants" }, attr: [{ cle: "grade_sae", valeur: "75W90", typeAttribut: "TEXTE" }] }],
    },
    {
      code: "ART-LIQFREIN-001", designation: "Liquide de frein DOT4", categorie: "DEMO-FLUIDES-FREIN",
      articleAttr: [{ cle: "norme_dot", valeur: "DOT4", typeAttribut: "ENUM" }],
      equivalents: [{ marque: "TRW", reference: "PFB401" }, { marque: "ATE", reference: "SBLA70045" }],
      variantes: [
        { sku: "DEMO-LQF-DOT4-1L", titre: "Liquide de frein DOT4 — 1L", marque: "ATE", refFab: "SL.6", ean: "DEMO-EAN-4006186000001", fournisseur: "SUP-005", refFournisseur: "FC-DOT4", prixVente: "7800", prixPro: "7100", prixParticulier: "7800", prixAchat: "5300", seuil: 6, seuilCritique: 2, stockMax: 20, stock: 8, uniteBase: "L", conditionnement: "Bidon 1L", emplacement: "LOC-MAG-B-R02-E01-C01", lot: { numero: "LOT-DOT4-2027A", dlc: "2027-06-30", qte: 8, provenance: "ATE DE", qualite: "FMVSS 116 DOT4", fabricant: "Continental" }, attr: [{ cle: "norme_dot", valeur: "DOT4", typeAttribut: "ENUM" }, { cle: "point_ebullition", valeur: "265", unite: "CELSIUS", typeAttribut: "NOMBRE" }, { cle: "contenance", valeur: "1", unite: "L", typeAttribut: "NOMBRE" }] },
      ],
    },
    {
      code: "ART-LIQREFROID-001", designation: "Liquide de refroidissement", categorie: "DEMO-REFROIDISSEMENT",
      equivalents: [{ marque: "TOTAL", reference: "GLACEOL RX (Type D)" }],
      variantes: [{ sku: "DEMO-REFROID-5L", titre: "Liquide refroidissement prêt à l'emploi — 5L", marque: "TOTAL", refFab: "GLACEOL RX", ean: "DEMO-EAN-3346004000001", fournisseur: "SUP-005", refFournisseur: "FC-REFROID", prixVente: "11900", prixAchat: "8200", seuil: 6, seuilCritique: 2, stockMax: 20, stock: 7, uniteBase: "L", conditionnement: "Bidon 5L", emplacement: "LOC-MAG-B-R02-E01-C01", lot: { numero: "LOT-REFROID-2028A", dlc: "2028-05-31", qte: 7, provenance: "TOTAL FR", qualite: "G12/G13 compatible", fabricant: "TOTAL Energies" }, attr: [{ cle: "temperature", valeur: "-35", unite: "CELSIUS", typeAttribut: "NOMBRE" }, { cle: "contenance", valeur: "5", unite: "L", typeAttribut: "NOMBRE" }] }],
    },
    {
      code: "ART-DEGRAIS-001", designation: "Dégraissant atelier", categorie: "DEMO-CHIMIE",
      variantes: [{ sku: "DEMO-DEGRAIS-5L", titre: "Dégraissant moteur — 5L", marque: "SONAX", refFab: "Dégraissant nettoyant", ean: "DEMO-EAN-4024333000001", fournisseur: "SUP-005", refFournisseur: "FC-DEGRAIS", prixVente: "18500", prixAchat: "12400", seuil: 4, seuilCritique: 2, stockMax: 12, stock: 5, uniteBase: "L", conditionnement: "Bidon 5L", emplacement: "LOC-MAG-B-R03-E01-C01", lot: { numero: "LOT-DEGRAIS-2029A", dlc: "2029-02-28", qte: 5, provenance: "SONAX DE", qualite: "biodégradable", fabricant: "SONAX GmbH" } }],
    },
    {
      code: "ART-PNEU-001", designation: "Pneumatique 225/45 R17", categorie: "DEMO-PNEUS",
      articleAttr: [{ cle: "dimension", valeur: "225/45 R17", typeAttribut: "TEXTE" }],
      equivalents: [{ marque: "MICHELIN", reference: "Pilot Sport 4" }, { marque: "CONTINENTAL", reference: "PremiumContact 6" }],
      docs: [{ type: "FICHE_TECHNIQUE", titre: "Étiquette énergie pneu 225/45 R17", url: "/docs/fiches/pneu-225-45-r17.pdf" }],
      compat: [
        { marque: "Mercedes", modele: "Classe C", anneeDe: 2015, anneeA: 2021, position: "ROUE", restriction: "tailles 225/45 R17 91Y homologuées W205" },
        { marque: "Volkswagen", modele: "Golf", anneeDe: 2013, anneeA: 2019, position: "ROUE", restriction: "225/45 R17 91W" },
        { marque: "Ford", modele: "Focus", anneeDe: 2015, anneeA: 2021, position: "ROUE", restriction: "non homologué pour 1.0 EcoBoost (pneus 215)" },
      ],
      variantes: [
        { sku: "DEMO-PNEU-225-BRID-01", titre: "Pneu 225/45 R17 91W Bridgestone Turanza", marque: "BRIDGESTONE", refFab: "Turanza T005", ean: "DEMO-EAN-4975285000001", fournisseur: "SUP-003", refFournisseur: "RPN-2254517", prixVente: "125000", prixPro: "118000", prixParticulier: "125000", prixAchat: "98000", tva: "19.25", seuil: 4, seuilCritique: 2, stockMax: 16, stock: 6, uniteBase: "PCE", conditionnement: "Unité", emplacement: "LOC-MAG-C-R01", attr: [{ cle: "dimension", valeur: "225/45 R17", typeAttribut: "TEXTE" }, { cle: "indice_charge", valeur: "91", typeAttribut: "NOMBRE" }, { cle: "indice_vitesse", valeur: "W", typeAttribut: "TEXTE" }, { cle: "saison", valeur: "été", typeAttribut: "ENUM" }, { cle: "runflat", valeur: "true", typeAttribut: "BOOLEEN" }] },
        { sku: "DEMO-PNEU-225-MICH-01", titre: "Pneu 225/45 R17 94Y Michelin Pilot Sport 4", marque: "MICHELIN", refFab: "Pilot Sport 4", ean: "DEMO-EAN-3528700000001", fournisseur: "SUP-003", refFournisseur: "RPN-2254517-M", prixVente: "142000", prixAchat: "111000", seuil: 3, seuilCritique: 2, stockMax: 12, stock: 4, uniteBase: "PCE", emplacement: "LOC-MAG-C-R01", attr: [{ cle: "dimension", valeur: "225/45 R17", typeAttribut: "TEXTE" }, { cle: "indice_charge", valeur: "94", typeAttribut: "NOMBRE" }, { cle: "indice_vitesse", valeur: "Y", typeAttribut: "TEXTE" }, { cle: "saison", valeur: "été", typeAttribut: "ENUM" }] },
      ],
    },
    {
      code: "ART-PNEU-265-001", designation: "Pneumatique 265/65 R17", categorie: "DEMO-PNEUS",
      articleAttr: [{ cle: "dimension", valeur: "265/65 R17", typeAttribut: "TEXTE" }],
      compat: [{ marque: "Toyota", modele: "Hilux", anneeDe: 2015, anneeA: 2023, position: "ROUE", refOem: "265/65 R17 112S" }],
      variantes: [{ sku: "DEMO-PNEU-265-ATR-01", titre: "Pneu 265/65 R17 112S A/T Cooper Discoverer", marque: "COOPER", refFab: "Discoverer A/T3", ean: "DEMO-EAN-8713800000001", fournisseur: "SUP-003", refFournisseur: "RPN-2656517", prixVente: "158000", prixAchat: "126000", seuil: 4, seuilCritique: 2, stockMax: 12, stock: 8, quantiteReservee: 4, uniteBase: "PCE", conditionnement: "Unité", emplacement: "LOC-MAG-C-R01", attr: [{ cle: "dimension", valeur: "265/65 R17", typeAttribut: "TEXTE" }, { cle: "indice_charge", valeur: "112", typeAttribut: "NOMBRE" }, { cle: "indice_vitesse", valeur: "S", typeAttribut: "TEXTE" }, { cle: "saison", valeur: "4 saisons", typeAttribut: "ENUM" }] }],
    },
    {
      code: "ART-VALVE-001", designation: "Valve de gonflage TPMS", categorie: "DEMO-MARGELLE",
      variantes: [{ sku: "DEMO-VALVE-01", titre: "Valve avec capteur TPMS (lot de 4)", marque: "SCHRADER", refFab: "EPDM TPMS", ean: "DEMO-EAN-5050000000001", fournisseur: "SUP-003", refFournisseur: "RPN-VALVE4", prixVente: "24000", prixAchat: "16800", seuil: 3, seuilCritique: 1, stockMax: 12, stock: 5, uniteBase: "LOT", conditionnement: "Lot de 4", emplacement: "LOC-MAG-C-R01" }],
    },
    {
      code: "ART-CLE-DYNAMO-001", designation: "Clé dynamométrique", categorie: "DEMO-OUTCLES",
      articleAttr: [{ cle: "type_outil", valeur: "clé dynamométrique", typeAttribut: "TEXTE" }],
      docs: [{ type: "CERTIFICAT", titre: "Certificat d'étalonnage d'origine", url: "/docs/certificats/cle-dynamo-20-110.pdf" }],
      variantes: [
        { sku: "DEMO-CLEDYN-20110-EX1", titre: "Clé dynamométrique 20-110 Nm — n°1", marque: "FACOM", refFab: "K.201", ean: "DEMO-EAN-3161711000001", fournisseur: "SUP-004", refFournisseur: "OP-CLEDYN-01", prixAchat: "156000", uniteBase: "PCE", emplacement: "LOC-OUT-R02", positionEmplacement: "N_A", attr: [{ cle: "plage_min", valeur: "20", unite: "NM", typeAttribut: "NOMBRE" }, { cle: "plage_max", valeur: "110", unite: "NM", typeAttribut: "NOMBRE" }, { cle: "certification", valeur: "true", typeAttribut: "BOOLEEN" }] },
        { sku: "DEMO-CLEDYN-20110-EX2", titre: "Clé dynamométrique 20-110 Nm — n°2", marque: "FACOM", refFab: "K.201", ean: "DEMO-EAN-3161711000002", fournisseur: "SUP-004", refFournisseur: "OP-CLEDYN-01", prixAchat: "156000", uniteBase: "PCE", emplacement: "LOC-OUT-R02", positionEmplacement: "N_A", attr: [{ cle: "plage_min", valeur: "20", unite: "NM", typeAttribut: "NOMBRE" }, { cle: "plage_max", valeur: "110", unite: "NM", typeAttribut: "NOMBRE" }, { cle: "certification", valeur: "true", typeAttribut: "BOOLEEN" }] },
        { sku: "DEMO-CLEDYN-4015-EX1", titre: "Clé dynamométrique 40-200 Nm", marque: "SAM OUTILLAGE", refFab: "SO-4015", ean: "DEMO-EAN-3161712000001", fournisseur: "SUP-004", refFournisseur: "OP-CLEDYN-40", prixAchat: "188000", uniteBase: "PCE", emplacement: "LOC-OUT-R02", positionEmplacement: "N_A", attr: [{ cle: "plage_min", valeur: "40", unite: "NM", typeAttribut: "NOMBRE" }, { cle: "plage_max", valeur: "200", unite: "NM", typeAttribut: "NOMBRE" }, { cle: "certification", valeur: "true", typeAttribut: "BOOLEEN" }] },
      ],
    },
  ];

  const prodIds = new Map<string, number>();
  const prodBySku = new Map<string, number>();

  for (const a of ARTICLES) {
    const catId = catMap.get(a.categorie);
    const [ar] = await db
      .insert(produitArticles)
      .values({ code: a.code, designation: a.designation, designationCourte: a.designationCourte ?? null, categorieId: catId ?? null, typeProduit: a.typeProduit ?? "PIECE", isActive: true } as any)
      .onConflictDoNothing({ target: produitArticles.code })
      .returning({ id: produitArticles.id });
    const articleId = ar?.id ?? (await db.select({ id: produitArticles.id }).from(produitArticles).where(eq(produitArticles.code, a.code)).limit(1))[0]!.id;
    prodIds.set(a.code, articleId);

    if (a.articleAttr) {
      for (const [i, at] of a.articleAttr.entries()) {
        await db.insert(articleAttributs).values({ articleId, cle: at.cle, valeur: at.valeur, unite: at.unite ?? null, ordre: i, typeAttribut: at.typeAttribut ?? "TEXTE", portee: "ARTICLE", statutValeur: "RENSEIGNE" } as any).onConflictDoNothing({ target: [articleAttributs.articleId, articleAttributs.cle] });
      }
    }
    if (a.docs) {
      for (const d of a.docs) {
        const dup = await db.select({ id: articleDocuments.id }).from(articleDocuments).where(and(eq(articleDocuments.articleId, articleId), eq(articleDocuments.url, d.url))).limit(1);
        if (!dup.length) await db.insert(articleDocuments).values({ articleId, type: d.type, titre: d.titre, url: d.url }).onConflictDoNothing();
      }
    }
    if (a.equivalents) {
      for (const eqv of a.equivalents) {
        await db.insert(produitReferencesEquiv).values({ articleId, marque: eqv.marque, reference: eqv.reference, note: eqv.note ?? null }).onConflictDoNothing({ target: [produitReferencesEquiv.articleId, produitReferencesEquiv.reference] });
      }
    }
    if (a.compat) {
      for (const c of a.compat) {
        const dup = await db.select({ id: compatibilitesProduits.id }).from(compatibilitesProduits).where(and(eq(compatibilitesProduits.articleId, articleId), eq(compatibilitesProduits.marque, c.marque), eq(compatibilitesProduits.modele, c.modele))).limit(10);
        let exists = false;
        for (const d of dup) {
          const row = (await db.select().from(compatibilitesProduits).where(eq(compatibilitesProduits.id, d.id)).limit(1))[0];
          if (row && (row.position ?? "") === (c.position ?? "")) { exists = true; break; }
        }
        if (exists) continue;
        await db.insert(compatibilitesProduits).values({
          articleId, typeCompat: c.typeCompat ?? "POSITIVE", marque: c.marque, modele: c.modele,
          generation: c.generation ?? null, anneeDe: c.anneeDe ?? null, anneeA: c.anneeA ?? null,
          motorisation: c.motorisation ?? null, codeMoteur: c.codeMoteur ?? null, carburant: c.carburant ?? null,
          cylindree: c.cylindree ?? null, puissanceKw: c.puissanceKw ?? null, boite: c.boite ?? null,
          transmission: c.transmission ?? null, position: c.position ?? null, refOem: c.refOem ?? null,
          typeFreinage: c.typeFreinage ?? null, restrictions: (c as any).restriction ?? null, notes: c.notes ?? null,
        } as any);
      }
    }

    for (const v of a.variantes) {
      const catIdv = catMap.get(a.categorie);
      const fourId = v.fournisseur ? fourIds.get(v.fournisseur) : null;
      const ub = v.uniteBase ? UNI[v.uniteBase as keyof typeof UNI] : UNI.PCE;
      let lotId: number | null = null;
      const existe = await db.select({ id: produits.id }).from(produits).where(eq(produits.codeBarre, v.sku)).limit(1);
      if (existe.length) { prodBySku.set(v.sku, existe[0].id); continue; }
      const [row] = await db
        .insert(produits)
        .values({
          articleId, typeProduit: a.typeProduit ?? "PIECE", codeBarre: v.sku, codeArticle: v.sku,
          titre: v.titre, designationCourte: v.titre.length > 150 ? v.titre.slice(0, 150) : v.titre,
          categorieId: catIdv ?? null, fournisseurId: fourId, uniteBaseId: ub as string | null,
          marque: v.marque ?? null, referenceFabricant: v.refFab ?? null, refOem: v.refOem ?? null,
          referencePrincipale: v.refFab ?? v.refOem ?? null,
          prixVente: v.prixVente ?? null, prixPro: v.prixPro ?? null, prixParticulier: v.prixParticulier ?? null,
          prixAchat: v.prixAchat ?? null, tva: v.tva ?? "19.25", seuilAlerte: v.seuil ?? 5, seuilCritique: v.seuilCritique ?? 2,
          stockMaximum: v.stockMax ?? null, conditionnement: v.conditionnement ?? null, statut: "actif",
          statutCycleVie: "ACTIF", niveau: a.typeProduit === "OUTIL" || a.typeProduit === "EQUIPEMENT" ? "EXEMPLAIRE" : "VARIANTE",
          emplacementPrincipalId: v.emplacement ? locIds.get(v.emplacement) ?? null : null,
          origineProduit: v.origineProduit ?? "AFTERMARKET", etatProduit: v.etatProduit ?? "NEUF", relationProduit: "EQUIVALENT",
          positionCote: v.positionCote ?? null, positionEssieu: v.positionEssieu ?? null, positionZone: v.positionZone ?? null, positionEmplacement: v.positionEmplacement ?? null,
          stockSecurite: Math.max(0, (v.seuil ?? 5) - 2), pointCommande: v.seuil ?? 5, qteMinCommande: "1",
          prixMinimumVente: v.prixAchat ? String(Math.round(Number(v.prixAchat) * 1.05)) : null,
          suiviLot: !!v.lot, isActive: true,
        } as any)
        .returning({ id: produits.id });
      if (!row) { continue; }
      const pid = row.id;
      prodBySku.set(v.sku, pid);

      if (v.refs) {
        for (const r of v.refs) {
          await db.insert(produitReferences).values({ varianteId: pid, typeRef: r.typeRef, valeur: r.valeur, isPrincipale: r.isPrincipale ?? false }).onConflictDoNothing({ target: [produitReferences.varianteId, produitReferences.valeur] });
        }
      }

      const cbType = v.ean ? "EAN" : "REFERENCE";
      const cbValeur = v.ean ?? v.refFab ?? v.sku;
      await db.insert(codesBarres).values({ produitId: pid, type: cbType, valeur: cbValeur, estDefaut: true }).onConflictDoNothing({ target: codesBarres.valeur });

      await db.insert(produitUnites).values({ produitId: pid, uniteId: ub as string, facteurVersParent: "1", facteurVersBase: "1", estUniteBase: true, estUniteAchatDefaut: true, estUniteVenteDefaut: true } as any).onConflictDoNothing({ target: [produitUnites.produitId, produitUnites.uniteId] });

      if (fourId && v.refFournisseur) {
        await db.insert(produitsFournisseurs).values({ produitId: pid, fournisseurId: fourId, referenceFournisseur: v.refFournisseur, prixAchat: v.prixAchat ?? null, delaiApprovisionnement: 3, estPrincipal: true, uniteId: ub as string | null, isActive: true } as any).onConflictDoNothing();
      }

      if (v.attr) {
        for (const [i, at] of v.attr.entries()) {
          await db.insert(varianteAttributs).values({ varianteId: pid, cle: at.cle, valeur: at.valeur, unite: at.unite ?? null, ordre: i, typeAttribut: at.typeAttribut ?? "TEXTE", portee: "VARIANTE", statutValeur: "RENSEIGNE" } as any).onConflictDoNothing({ target: [varianteAttributs.varianteId, varianteAttributs.cle] });
        }
      }

      if (v.lot) {
        const lotDup = await db.select({ id: lots.id }).from(lots).where(and(eq(lots.produitId, pid), eq(lots.numeroLot, v.lot.numero))).limit(1);
        if (!lotDup.length) {
          const [lo] = await db.insert(lots).values({
            produitId: pid, numeroLot: v.lot.numero, fournisseurId: fourId, statut: "disponible",
            quantiteInitiale: v.lot.qte, datePeremption: v.lot.dlc, provenance: v.lot.provenance ?? null,
            qualite: v.lot.qualite ?? null, fabricant: v.lot.fabricant ?? null, dateFabrication: v.lot.dateFabrication ?? null, isActive: true,
          } as any).returning({ id: lots.id });
          if (lo) lotId = lo.id;
        }
      }
      if ((v as any).estReconditionnableBidon) {
        await db.update(produits).set({ estReconditionnable: true }).where(eq(produits.id, pid));
      }
      if (v.lot && !lotId) {
        lotId = (await db.select({ id: lots.id }).from(lots).where(and(eq(lots.produitId, pid), eq(lots.numeroLot, v.lot.numero))).limit(1))[0]?.id ?? null;
      }
      if (v.lot && lotId) {
        const q = v.lot.qte;
        await db.insert(stocksLots).values({ produitId: pid, agenceId: AGENCE_ID, lotId, quantite: String(q) }).onConflictDoNothing({ target: [stocksLots.produitId, stocksLots.agenceId, stocksLots.lotId] });
        if (v.complet) {
          await db.insert(stocks).values({ produitId: pid, agenceId: AGENCE_ID, emplacementId: v.emplacement ? locIds.get(v.emplacement) ?? null : null, lotId, quantite: String(q), quantiteReservee: "0", quantiteBloquee: "0", quantiteRayon: "0", seuilAlerteLocal: v.seuil ?? null, uniteReferenceId: ub as string | null } as any).onConflictDoNothing({ target: [stocks.produitId, stocks.agenceId, stocks.emplacementId, stocks.lotId] });
        }
      } else if (typeof v.stock === "number") {
        await db.insert(stocks).values({ produitId: pid, agenceId: AGENCE_ID, emplacementId: v.emplacement ? locIds.get(v.emplacement) ?? null : null, lotId: null, quantite: String(v.stock), quantiteReservee: String(v.quantiteReservee ?? 0), quantiteBloquee: String(v.quantiteBloquee ?? 0), quantiteRayon: "0", seuilAlerteLocal: v.seuil ?? null, uniteReferenceId: ub as string | null } as any).onConflictDoNothing({ target: [stocks.produitId, stocks.agenceId, stocks.emplacementId, stocks.lotId] });
      }
    }
  }

  const SUBSTITUTIONS: { a: string; b: string; niveau: string; motif: string }[] = [
    { a: "DEMO-PLAQ-TRW-01", b: "DEMO-PLAQ-BOS-01", niveau: "TECHNIQUE", motif: "Diamètre 278 mm — compatible Corolla E180" },
    { a: "DEMO-DISQ-HON-01", b: "DEMO-DISQ-BR-01", niveau: "COMMERCIAL", motif: "Équivalent dimensionnel 320 mm" },
    { a: "DEMO-PNEU-225-MICH-01", b: "DEMO-PNEU-225-BRID-01", niveau: "OFFICIEL", motif: "Même taille et indices 225/45 R17 91Y minimum" },
    { a: "DEMO-BATT-EFB-60", b: "DEMO-BATT-AGM-70", niveau: "TECHNIQUE", motif: "EFB → AGM acceptable si batteries compatible chimie" },
    { a: "DEMO-FIL-MANN-01", b: "DEMO-FIL-TOY-01", niveau: "HOMOLOGUE", motif: "MANN W 712/95 ≡ OEM 90915-YZZD2" },
  ];
  for (const s of SUBSTITUTIONS) {
    const aId = prodBySku.get(s.a); const bId = prodBySku.get(s.b);
    if (!aId || !bId) continue;
    const dup = await db.select({ id: produitSubstitutions.id }).from(produitSubstitutions).where(and(eq(produitSubstitutions.varianteAId, aId), eq(produitSubstitutions.varianteBId, bId))).limit(1);
    if (!dup.length) await db.insert(produitSubstitutions).values({ varianteAId: aId, varianteBId: bId, niveauConfiance: s.niveau, motif: s.motif, actif: true }).onConflictDoNothing();
  }

  const SUPERSSESSIONS: { ancienne: string; nouvelle: string; fabricant: string; motif: string }[] = [
    { ancienne: "90915-YZZD1", nouvelle: "DEMO-FIL-TOY-01", fabricant: "Toyota", motif: "Révision technique du corps de filtre" },
    { ancienne: "04465-02191", nouvelle: "DEMO-PLAQ-BOS-01", fabricant: "Bosch", motif: "Matériau semi-métallique remplacé par céramique" },
    { ancienne: "43512-0D050", nouvelle: "DEMO-DISQ-BR-01", fabricant: "Brembo", motif: "Épaisseur passe à 24 mm" },
    { ancienne: "90919-01256", nouvelle: "DEMO-BOUG-NGK-01", fabricant: "NGK", motif: "Électrode iridium remplace platine" },
    { ancienne: "48510-09R00", nouvelle: "DEMO-AMORT-KYB-01", fabricant: "KYB", motif: "Génération 2 amortisseur à gaz" },
  ];
  for (const s of SUPERSSESSIONS) {
    const refNouvelle = prodBySku.get(s.nouvelle);
    if (!refNouvelle) continue;
    const dup = await db.select({ id: produitSupersessions.id }).from(produitSupersessions).where(and(eq(produitSupersessions.ancienneReference, s.ancienne), eq(produitSupersessions.nouvelleReference, s.nouvelle))).limit(1);
    if (!dup.length) {
      const [p] = await db.select({ id: produits.id, referencePrincipale: produits.referencePrincipale }).from(produits).where(eq(produits.id, refNouvelle)).limit(1);
      await db.insert(produitSupersessions).values({ ancienneVarianteId: null, ancienneReference: s.ancienne, nouvelleVarianteId: refNouvelle, nouvelleReference: p.referencePrincipale ?? s.nouvelle, fabricant: s.fabricant, motif: s.motif, commandeAutorisee: true } as any).onConflictDoNothing();
    }
  }

  const OUTILS: { code: string; designation: string; categorie: string; typeOutil: string; modele: string; exemplaires: { sku: string; titre: string; numeroSerie?: string; statutOutil?: string; emplacement?: string; prixAchat?: string; calibrable?: boolean; cert?: { organisme: string; certificat: string; date: string; prochaine: string; resultat: string; tolerance?: string }[]; maint?: { type: string; date: string; prestataire: string; cout: string; prochaine: string }[] }[] }[] = [
    {
      code: "ART-OUT-CLEDYN-002", designation: "Clé dynamométrique 40-200 Nm", categorie: "DEMO-OUTCLES", typeOutil: "INDIVIDUEL", modele: "SAM OUTILLAGE SO-4015",
      exemplaires: [
        { sku: "OUT-0001", titre: "Clé dynamo 40-200 Nm — exemplaire n°1", numeroSerie: "SN-CD-4015-0001", emplacement: "LOC-OUT-R02", prixAchat: "188000", calibrable: true,
          cert: [{ organisme: "MecaDiag Expertises", certificat: "CAL-2024-0142", date: "2024-06-15", prochaine: "2026-06-15", resultat: "CONFORME", tolerance: "±4 % ISO 6789" }] },
        { sku: "OUT-0002", titre: "Clé dynamo 40-200 Nm — exemplaire n°2", numeroSerie: "SN-CD-4015-0002", emplacement: "LOC-OUT-R02", prixAchat: "188000", calibrable: true,
          cert: [{ organisme: "MecaDiag Expertises", certificat: "CAL-2025-0311", date: "2025-03-02", prochaine: "2025-09-02", resultat: "AVEC_RESERVES", tolerance: "±5 %" }] },
      ],
    },
    {
      code: "ART-OUT-CLEDYN-001", designation: "Clé dynamométrique 10-60 Nm", categorie: "DEMO-OUTCLES", typeOutil: "INDIVIDUEL", modele: "FACOM K.101",
      exemplaires: [
        { sku: "OUT-0003", titre: "Clé dynamo 10-60 Nm — exemplaire n°1", numeroSerie: "SN-FK-101-0901", emplacement: "LOC-OUT-R02", prixAchat: "154000", calibrable: true,
          cert: [{ organisme: "MecaDiag Expertises", certificat: "CAL-2026-0017", date: "2026-01-20", prochaine: "2027-01-20", resultat: "CONFORME" }] },
      ],
    },
    {
      code: "ART-OUT-MULTIMETRE", designation: "Multimètre numérique", categorie: "DEMO-OUTMESURE", typeOutil: "INDIVIDUEL", modele: "FLUKE 87V",
      exemplaires: [
        { sku: "OUT-0004", titre: "Multimètre FLUKE 87V — exemplaire n°1", numeroSerie: "SN-FL-87V-7712", emplacement: "LOC-OUT-R02", prixAchat: "312000", calibrable: true,
          cert: [{ organisme: "MecaDiag Expertises", certificat: "CAL-2025-0517", date: "2025-07-11", prochaine: "2026-07-11", resultat: "CONFORME" }],
          maint: [{ type: "CONTROLE", date: "2025-07-11", prestataire: "MecaDiag Expertises", cout: "0", prochaine: "2026-07-11" }] },
        { sku: "OUT-0005", titre: "Multimètre FLUKE 87V — exemplaire n°2", numeroSerie: "SN-FL-87V-7713", emplacement: "LOC-OUT-R02", prixAchat: "312000", calibrable: true,
          cert: [{ organisme: "MecaDiag Expertises", certificat: "CAL-2026-0021", date: "2026-02-01", prochaine: "2027-02-01", resultat: "CONFORME" }] },
      ],
    },
    {
      code: "ART-OUT-TESTEUR-BATT", designation: "Testeur de batterie", categorie: "DEMO-OUTMESURE", typeOutil: "INDIVIDUEL", modele: "MIDTRONICS MDX-650",
      exemplaires: [
        { sku: "OUT-0006", titre: "Testeur batterie MDX-650 — exemplaire n°1", numeroSerie: "SN-MDX-650-1120", emplacement: "LOC-OUT-R02", prixAchat: "410000", calibrable: true,
          cert: [{ organisme: "MecaDiag Expertises", certificat: "CAL-2025-0890", date: "2025-09-14", prochaine: "2026-09-14", resultat: "CONFORME" }] },
      ],
    },
    {
      code: "ART-OUT-SCAN-OBD", designation: "Scanner diagnostic OBD2", categorie: "DEMO-OUTMESURE", typeOutil: "INDIVIDUEL", modele: "LAUNCH X431 PAD VII",
      exemplaires: [
        { sku: "OUT-0007", titre: "Scanner X431 PAD VII — exemplaire n°1", numeroSerie: "SN-LX-P7-4451", emplacement: "LOC-AT-DIAG", prixAchat: "2250000", calibrable: false,
          maint: [{ type: "PREVENTIVE", date: "2026-01-05", prestataire: "Servelec Dif.", cout: "35000", prochaine: "2026-10-05" }] },
      ],
    },
    {
      code: "ART-OUT-TOURNEVIS", designation: "Tournevis isolateur", categorie: "DEMO-OUTELEC", typeOutil: "JEU", modele: "BJOUX DE 6",
      exemplaires: [
        { sku: "OUT-0008", titre: "Jeu de 6 tournevis isolateurs — exemplaire n°1", numeroSerie: "SN-BJ-6-3310", emplacement: "LOC-OUT-R03", prixAchat: "34000", calibrable: false },
      ],
    },
    {
      code: "ART-OUT-DOUILLES-12", designation: "Casier de 12 douilles 1/2\"", categorie: "DEMO-OUTELEC", typeOutil: "JEU", modele: "FACOM X12",
      exemplaires: [
        { sku: "OUT-0009", titre: "Casier douilles 1/2\" — exemplaire n°1", numeroSerie: "SN-FX-X12-8801", emplacement: "LOC-OUT-R03", prixAchat: "98000", calibrable: false },
      ],
    },
    {
      code: "ART-OUT-ÇLE-CHOC", designation: "Clé à choc pneumatique 1/2\"", categorie: "DEMO-OUTPNEU", typeOutil: "INDIVIDUEL", modele: "INGERSOLL-RAND 231C",
      exemplaires: [
        { sku: "OUT-0010", titre: "Clé à choc pneumatique 231C — exemplaire n°1", numeroSerie: "SN-IR-231C-5091", emplacement: "LOC-OUT-R01", prixAchat: "265000", calibrable: false,
          maint: [{ type: "CURATIVE", date: "2025-11-03", prestataire: "Outillage Pro SARL", cout: "22000", prochaine: "2026-05-03" }] },
        { sku: "OUT-0011", titre: "Clé à choc pneumatique 231C — exemplaire n°2", numeroSerie: "SN-IR-231C-5092", emplacement: "LOC-AT3", prixAchat: "265000", calibrable: false },
      ],
    },
    {
      code: "ART-OUT-PERCEUSE", designation: "Perceuse-visseuse 18V", categorie: "DEMO-OUTELEC", typeOutil: "INDIVIDUEL", modele: "DEWALT DCD796",
      exemplaires: [
        { sku: "OUT-0012", titre: "Perceuse DCD796 — exemplaire n°1", numeroSerie: "SN-DW-796-2214", emplacement: "LOC-OUT-R03", prixAchat: "184000", calibrable: false,
          maint: [{ type: "PREVENTIVE", date: "2025-12-01", prestataire: "Outillage Pro SARL", cout: "12000", prochaine: "2026-06-01" }] },
      ],
    },
    {
      code: "ART-OUT-MEULEUSE", designation: "Meuleuse d'angle 125mm", categorie: "DEMO-OUTELEC", typeOutil: "INDIVIDUEL", modele: "MAKITA GA5030",
      exemplaires: [
        { sku: "OUT-0013", titre: "Meuleuse GA5030 — exemplaire n°1", numeroSerie: "SN-MK-5030-7711", emplacement: "LOC-OUT-R03", prixAchat: "96000", calibrable: false },
        { sku: "OUT-0014", titre: "Meuleuse GA5030 — exemplaire n°2", numeroSerie: "SN-MK-5030-7712", emplacement: "LOC-OUT-R03", prixAchat: "96000", calibrable: false, statutOutil: "REPARATION" },
      ],
    },
    {
      code: "ART-OUT-CRIC", designation: "Cric roulant 3t", categorie: "DEMO-OULEVAGE", typeOutil: "INDIVIDUEL", modele: "LINCOLN W-93672",
      exemplaires: [
        { sku: "OUT-0015", titre: "Cric roulant 3t — exemplaire n°1", numeroSerie: "SN-LN-93672-001", emplacement: "LOC-AT1", prixAchat: "185000", calibrable: false },
        { sku: "OUT-0016", titre: "Cric roulant 3t — exemplaire n°2", numeroSerie: "SN-LN-93672-002", emplacement: "LOC-AT2", prixAchat: "185000", calibrable: false },
      ],
    },
    {
      code: "ART-OUT-BERCEAU", designation: "Berceau support moteur", categorie: "DEMO-OULEVAGE", typeOutil: "INDIVIDUEL", modele: "GYS 380",
      exemplaires: [
        { sku: "OUT-0017", titre: "Berceau 3t — exemplaire n°1", numeroSerie: "SN-GYS-380-12", emplacement: "LOC-OUT-R01", prixAchat: "98000", calibrable: false, statutOutil: "CASSE" },
      ],
    },
    {
      code: "ART-OUT-PANNEAU-OUTIL", designation: "Panneau à outils suspendu", categorie: "DEMO-OUTELEC", typeOutil: "KIT", modele: "DEVASH 40 crochets",
      exemplaires: [
        { sku: "OUT-0018", titre: "Panneau à outils — exemplaire n°1", numeroSerie: "SN-DV-40-221", emplacement: "LOC-OUT-R03", prixAchat: "45000", calibrable: false },
      ],
    },
    {
      code: "ART-OUT-AMPERE", designation: "Pince ampèremétrique 600A", categorie: "DEMO-OUTMESURE", typeOutil: "INDIVIDUEL", modele: "FLUKE 376",
      exemplaires: [
        { sku: "OUT-0019", titre: "Pince ampèremétrique — exemplaire n°1", numeroSerie: "SN-FL-376-0901", emplacement: "LOC-OUT-R02", prixAchat: "247000", calibrable: true,
          cert: [{ organisme: "MecaDiag Expertises", certificat: "CAL-2025-0990", date: "2025-10-12", prochaine: "2026-10-12", resultat: "CONFORME" }] },
      ],
    },
    {
      code: "ART-OUT-MANOMETRE", designation: "Manomètre pression huile", categorie: "DEMO-OUTMESURE", typeOutil: "INDIVIDUEL", modele: "BOSCH FSA 050",
      exemplaires: [
        { sku: "OUT-0020", titre: "Manomètre BOSCH — exemplaire n°1", numeroSerie: "SN-BS-050-114", emplacement: "LOC-OUT-R02", prixAchat: "98000", calibrable: true,
          cert: [{ organisme: "MecaDiag Expertises", certificat: "CAL-2026-0030", date: "2026-01-14", prochaine: "2027-01-14", resultat: "CONFORME" }] },
      ],
    },
  ];

  for (const o of OUTILS) {
    const catId = catMap.get(o.categorie);
    const [ar] = await db
      .insert(produitArticles)
      .values({ code: o.code, designation: o.designation, categorieId: catId ?? null, typeProduit: "OUTIL", isActive: true } as any)
      .onConflictDoNothing({ target: produitArticles.code })
      .returning({ id: produitArticles.id });
    const articleId = ar?.id ?? (await db.select({ id: produitArticles.id }).from(produitArticles).where(eq(produitArticles.code, o.code)).limit(1))[0]!.id;
    for (const ex of o.exemplaires) {
      const existsP = await db.select({ id: produits.id }).from(produits).where(eq(produits.codeBarre, ex.sku)).limit(1);
      if (existsP.length) continue;
      const fourId = fourIds.get("SUP-004");
      const emplacementId = ex.emplacement ? locIds.get(ex.emplacement) ?? null : null;
      const [row] = await db
        .insert(produits)
        .values({
          articleId, typeProduit: "OUTIL", codeBarre: ex.sku, codeArticle: ex.sku, titre: ex.titre,
          designationCourte: ex.titre.length > 150 ? ex.titre.slice(0, 150) : ex.titre, categorieId: catId ?? null,
          fournisseurId: fourId, uniteBaseId: UNI.PCE ?? null, marque: o.modele.split(" ")[0] ?? null,
          referenceFabricant: o.modele, referencePrincipale: o.modele, prixAchat: ex.prixAchat ?? null,
          tva: "19.25", statut: "actif", statutCycleVie: "ACTIF", niveau: "EXEMPLAIRE", typeOutil: o.typeOutil,
          statutOutil: ex.statutOutil ?? null, numeroSerie: ex.numeroSerie ?? null, calibrable: ex.calibrable ?? false,
          emplacementPrincipalId: emplacementId, positionEmplacement: "N_A", positionCote: "N_A", positionEssieu: "N_A",
          origineProduit: "AFTERMARKET", etatProduit: "NEUF", suiviLot: false, isActive: true,
        } as any)
        .returning({ id: produits.id });
      if (!row) continue;
      const pid = row.id;
      prodBySku.set(ex.sku, pid);
      await db.insert(codesBarres).values({ produitId: pid, type: "REFERENCE", valeur: ex.sku, estDefaut: true }).onConflictDoNothing({ target: codesBarres.valeur });
      await db.insert(produitUnites).values({ produitId: pid, uniteId: UNI.PCE as string, facteurVersParent: "1", facteurVersBase: "1", estUniteBase: true, estUniteAchatDefaut: true, estUniteVenteDefaut: true } as any).onConflictDoNothing({ target: [produitUnites.produitId, produitUnites.uniteId] });
      if (ex.cert) {
        for (const c of ex.cert) {
          await db.insert(outillageCalibration).values({ outilId: pid, dateCalibration: dt(c.date), organisme: c.organisme, certificat: c.certificat, resultat: c.resultat, tolerance: c.tolerance ?? null, prochaineCalibration: dt(c.prochaine), effectuePar: adminUser } as any).onConflictDoNothing();
        }
      }
      if (ex.maint) {
        for (const m of ex.maint) {
          await db.insert(outillageMaintenance).values({ outilId: pid, type: m.type, dateMaintenance: dt(m.date), prestataire: m.prestataire, cout: m.cout, prochaineMaintenance: dt(m.prochaine), observations: null, effectuePar: adminUser } as any).onConflictDoNothing();
        }
      }
    }
  }

  const PRETS: { outil: string; technicien: string; motif: string; dateSortie: string; dateRetour?: string; etatRetour?: string; remarque?: string; actif: boolean }[] = [
    { outil: "OUT-0001", technicien: "MEC-001", motif: "Support étalonnage disques Corolla", dateSortie: "2026-08-28", dateRetour: null, actif: true },
    { outil: "OUT-0004", technicien: "MEC-003", motif: "Diagnostic électrique Tucson", dateSortie: "2026-09-02", dateRetour: null, actif: true },
    { outil: "OUT-0008", technicien: "MEC-002", motif: "Reprise moteur Hilux", dateSortie: "2026-08-20", dateRetour: "2026-08-22", etatRetour: "OK", actif: false },
    { outil: "OUT-0010", technicien: "MEC-002", motif: "Dépose roues Ford Ranger", dateSortie: "2026-08-15", dateRetour: "2026-08-15", etatRetour: "OK", actif: false },
    { outil: "OUT-0012", technicien: "MEC-004", motif: "Pose pochette porte", dateSortie: "2026-09-01", dateRetour: null, actif: true },
    { outil: "OUT-0010", technicien: "MEC-001", motif: "Prêt antérieur non rendu conforme", dateSortie: "2026-03-11", dateRetour: "2026-03-12", etatRetour: "ENDOMMAGE", remarque: "Carré d'entraînement voilé, maintenance curative", actif: false },
    { outil: "OUT-0015", technicien: "MEC-001", motif: "Maintenance Hilux — cric", dateSortie: "2026-08-27", dateRetour: "2026-08-27", etatRetour: "OK", actif: false },
  ];
  for (const p of PRETS) {
    const outilId = prodBySku.get(p.outil);
    const techId = empIds.get(p.technicien);
    if (!outilId || !techId) continue;
    const exists = await db.select({ id: pretsOutils.id }).from(pretsOutils).where(and(eq(pretsOutils.outilId, outilId), eq(pretsOutils.motif, p.motif))).limit(1);
    if (exists.length) continue;
    await db.insert(pretsOutils).values({
      agenceId: AGENCE_ID, outilId, technicienId: techId, motif: p.motif, dateSortie: dt(p.dateSortie),
      sortiePar: empIds.get("MAG-001") ?? null, dateRetour: p.dateRetour ? dt(p.dateRetour) : null, retourneLe: p.dateRetour ? dt(p.dateRetour) : null,
      retournePar: p.dateRetour ? empIds.get("MAG-001") ?? null : null, etatRetour: p.etatRetour ?? null,
      remarque: p.remarque ?? null, actif: p.actif,
    } as any).onConflictDoNothing();
  }

  const EQUIPEMENTS: { code: string; designation: string; categorie: string; numeroImmobilisation: string; marque: string; numeroSerie: string; dateAchat: string; valeurAcquisition: string; responsable: string; emplacement: string; etat: string; garantieMois: number; calibrable?: boolean; maint?: { type: string; date: string; prestataire: string; cout: string; prochaine: string }[]; cert?: { organisme: string; certificat: string; date: string; prochaine: string; resultat: string }[] }[] = [
    { code: "ART-EQP-PONT-001", designation: "Pont élévateur 2 colonnes 4t", categorie: "DEMO-EQP-PONT", numeroImmobilisation: "EQP-001", marque: "SIVERTEC", numeroSerie: "SN-SV-P42-001", dateAchat: "2019-03-15", valeurAcquisition: "4850000", responsable: "GES-001", emplacement: "LOC-AT1", etat: "TRES_BON", garantieMois: 0,
      maint: [{ type: "PREVENTIVE", date: "2026-06-10", prestataire: "SIVERTEC SA", cout: "85000", prochaine: "2026-12-10" }, { type: "CONTROLE", date: "2026-03-20", prestataire: "API-VERT", cout: "0", prochaine: "2027-03-20" }] },
    { code: "ART-EQP-PONT-002", designation: "Pont élévateur 2 colonnes 4t — zone B", categorie: "DEMO-EQP-PONT", numeroImmobilisation: "EQP-002", marque: "SIVERTEC", numeroSerie: "SN-SV-P42-002", dateAchat: "2021-09-30", valeurAcquisition: "5100000", responsable: "GES-001", emplacement: "LOC-AT2", etat: "BON", garantieMois: 0 },
    { code: "ART-EQP-COMPRESSEUR", designation: "Compresseur 2 cylindres 500L", categorie: "DEMO-EQP-PNEU", numeroImmobilisation: "EQP-003", marque: "FUBAG", numeroSerie: "SN-FB-500-0301", dateAchat: "2020-01-12", valeurAcquisition: "1650000", responsable: "MEC-002", emplacement: "LOC-AT3", etat: "BON", garantieMois: 24,
      maint: [{ type: "PREVENTIVE", date: "2026-05-18", prestataire: "FUBAG Afrique", cout: "42000", prochaine: "2026-11-18" }] },
    { code: "ART-EQP-DEMONTE", designation: "Démonte-pneu automatique", categorie: "DEMO-EQP-PNEU", numeroImmobilisation: "EQP-004", marque: "CORGHI", numeroSerie: "SN-CG-EM458-002", dateAchat: "2022-05-05", valeurAcquisition: "3200000", responsable: "MEC-002", emplacement: "LOC-AT3", etat: "TRES_BON", garantieMois: 36 },
    { code: "ART-EQP-EQUILIBRE", designation: "Équilibreuse 20\"", categorie: "DEMO-EQP-PNEU", numeroImmobilisation: "EQP-005", marque: "HOFMANN", numeroSerie: "SN-HF-1000-007", dateAchat: "2022-05-05", valeurAcquisition: "1900000", responsable: "MEC-002", emplacement: "LOC-AT3", etat: "BON", garantieMois: 36,
      cert: [{ organisme: "HOFMANN", certificat: "CAL-EQB-2026-01", date: "2026-02-10", prochaine: "2028-02-10", resultat: "CONFORME" }] },
    { code: "ART-EQP-CLIM", designation: "Station recharge climatisation", categorie: "DEMO-EQP-PNEU", numeroImmobilisation: "EQP-006", marque: "ROBINAIR", numeroSerie: "SN-RB-AC1234-019", dateAchat: "2023-04-18", valeurAcquisition: "2750000", responsable: "MEC-003", emplacement: "LOC-AT2", etat: "TRES_BON", garantieMois: 24 },
    { code: "ART-EQP-MACHINE-GEOM", designation: "Machine géométrie 3D", categorie: "DEMO-EQP-DIAG", numeroImmobilisation: "EQP-007", marque: "BEISSEBOUTH", numeroSerie: "SN-BS-3D-001", dateAchat: "2024-01-10", valeurAcquisition: "8700000", responsable: "MEC-003", emplacement: "LOC-AT-DIAG", etat: "NEUF", garantieMois: 36,
      cert: [{ organisme: "BEISSEBOUTH", certificat: "CAL-GEO-2026-01", date: "2026-01-25", prochaine: "2027-01-25", resultat: "CONFORME" }] },
    { code: "ART-EQP-CAMERA-ADAS", designation: "Caméra calibration ADAS", categorie: "DEMO-EQP-DIAG", numeroImmobilisation: "EQP-008", marque: "BOSCH", numeroSerie: "SN-BS-ADAS-0302", dateAchat: "2025-06-08", valeurAcquisition: "4200000", responsable: "MEC-003", emplacement: "LOC-AT-DIAG", etat: "NEUF", garantieMois: 24, calibrable: true,
      cert: [{ organisme: "BOSCH", certificat: "CAL-ADAS-2026-01", date: "2026-03-02", prochaine: "2026-09-02", resultat: "CONFORME" }] },
    { code: "ART-EQP-SOUDE", designation: "Poste à souder TIG 200A", categorie: "DEMO-EQP-SOUDE", numeroImmobilisation: "EQP-009", marque: "LINCOLN", numeroSerie: "SN-LN-TIG200-047", dateAchat: "2021-11-22", valeurAcquisition: "1350000", responsable: "MEC-004", emplacement: "LOC-AT2", etat: "MOYEN", garantieMois: 0,
      maint: [{ type: "CURATIVE", date: "2026-04-02", prestataire: "LINCOLN Service", cout: "65000", prochaine: "2026-10-02" }] },
    { code: "ART-EQP-CHARGEUR", designation: "Chargeur batterie 12/24V 30A", categorie: "DEMO-EQP-PNEU", numeroImmobilisation: "EQP-010", marque: "GYS", numeroSerie: "SN-GYS-3100-021", dateAchat: "2022-02-14", valeurAcquisition: "420000", responsable: "MAG-001", emplacement: "LOC-QUAI", etat: "BON", garantieMois: 24 },
  ];
  for (const e of EQUIPEMENTS) {
    const catId = catMap.get(e.categorie);
    const [ar] = await db
      .insert(produitArticles)
      .values({ code: e.code, designation: e.designation, categorieId: catId ?? null, typeProduit: "EQUIPEMENT", isActive: true } as any)
      .onConflictDoNothing({ target: produitArticles.code })
      .returning({ id: produitArticles.id });
    const articleId = ar?.id ?? (await db.select({ id: produitArticles.id }).from(produitArticles).where(eq(produitArticles.code, e.code)).limit(1))[0]!.id;
    const sku = e.numeroImmobilisation;
    const existsP = await db.select({ id: produits.id }).from(produits).where(eq(produits.codeBarre, sku)).limit(1);
    if (existsP.length) continue;
    const respId = empIds.get(e.responsable);
    const emplacementId = locIds.get(e.emplacement) ?? null;
    const [row] = await db
      .insert(produits)
      .values({
        articleId, typeProduit: "EQUIPEMENT", codeBarre: sku, codeArticle: sku, titre: e.designation,
        designationCourte: e.designation.length > 150 ? e.designation.slice(0, 150) : e.designation, categorieId: catId ?? null,
        fournisseurId: fourIds.get("SUP-006") ?? null, uniteBaseId: UNI.PCE ?? null, marque: e.marque,
        referenceFabricant: e.marque + " " + e.numeroSerie, referencePrincipale: e.numeroSerie, tva: "19.25", statut: "actif",
        statutCycleVie: "ACTIF", niveau: "EXEMPLAIRE", typeOutil: "MACHINE", numeroImmobilisation: e.numeroImmobilisation,
        numeroSerie: e.numeroSerie, dateAchat: dt(e.dateAchat), valeurAcquisition: e.valeurAcquisition, responsableId: respId ?? null,
        etatEquipement: e.etat, calibrable: e.calibrable ?? false, garantieMois: e.garantieMois,
        emplacementPrincipalId: emplacementId, positionEmplacement: "N_A", positionCote: "N_A", positionEssieu: "N_A",
        origineProduit: "CONSTRUCTEUR", etatProduit: "NEUF", isActive: true,
      } as any)
      .returning({ id: produits.id });
    if (!row) continue;
    const pid = row.id;
    prodBySku.set(sku, pid);
    await db.insert(codesBarres).values({ produitId: pid, type: "REFERENCE", valeur: sku, estDefaut: true }).onConflictDoNothing({ target: codesBarres.valeur });
    await db.insert(produitUnites).values({ produitId: pid, uniteId: UNI.PCE as string, facteurVersParent: "1", facteurVersBase: "1", estUniteBase: true, estUniteAchatDefaut: true, estUniteVenteDefaut: true } as any).onConflictDoNothing({ target: [produitUnites.produitId, produitUnites.uniteId] });
    if (e.maint) {
      for (const m of e.maint) {
        await db.insert(outillageMaintenance).values({ outilId: pid, type: m.type, dateMaintenance: dt(m.date), prestataire: m.prestataire, cout: m.cout, prochaineMaintenance: dt(m.prochaine), effectuePar: adminUser } as any).onConflictDoNothing();
      }
    }
    if (e.cert) {
      for (const c of e.cert) {
        await db.insert(outillageCalibration).values({ outilId: pid, dateCalibration: dt(c.date), organisme: c.organisme, certificat: c.certificat, resultat: c.resultat, prochaineCalibration: dt(c.prochaine), effectuePar: adminUser } as any).onConflictDoNothing();
      }
    }
  }

  const KIT_COFFRET = { code: "ART-KIT-COFFRET108", designation: "Coffret à 108 pièces (douilles + embouts)", categorie: "DEMO-KITS-COFFRETS", typeOutil: "KIT", sku: "OUT-0100", titre: "Coffret 108 pièces 1/2 et 1/4 — statut complet", statutOutil: null, composants: [
    ["Cliquet 1/2 72 dents", 1], ["Cliquet 1/4 72 dents", 1], ["Rallonge 1/2 125 mm", 1], ["Rallonge 1/2 250 mm", 1], ["Rallonge 1/4 150 mm", 1],
    ["Cardan 1/2", 1], ["Cardan 1/4", 1], ["Douilles 1/2 métriques 10-24", 15], ["Douilles 1/2 Torx E10-E24", 9], ["Douilles 1/4 métriques 4-14", 11],
    ["Douilles 1/4 Torx T10-T40", 9], ["Douilles longues 1/4", 6], ["Douilles alvéole 1/2", 6], ["Embouts hex 5-12 mm", 8], ["Embouts PH1-PH4", 4],
    ["Embouts PZ1-PZ4", 4], ["Embouts Torx T8-T40", 9], ["Embouts plat 1/4", 5], ["Adaptateur 1/2 vers 1/4", 1], ["Adaptateur 1/4 vers 1/2", 1],
    ["Cliquet rapide 1/4 pour embouts", 1], ["Poignée T 1/4", 1], ["Tournevis porte-embouts", 1], ["Six pans alu 1,5-10", 8], ["Boussole de serrage", 1], ["Boîte de rangement métallique", 1],
  ] };
  let totalPieces = 0;
  for (const c of KIT_COFFRET.composants) totalPieces += c[1];

  const [kitAr] = await db
    .insert(produitArticles)
    .values({ code: KIT_COFFRET.code, designation: KIT_COFFRET.designation, categorieId: catMap.get(KIT_COFFRET.categorie) ?? null, typeProduit: "OUTIL", isActive: true } as any)
    .onConflictDoNothing({ target: produitArticles.code })
    .returning({ id: produitArticles.id });
  const kitArticleId = kitAr?.id ?? (await db.select({ id: produitArticles.id }).from(produitArticles).where(eq(produitArticles.code, KIT_COFFRET.code)).limit(1))[0]!.id;
  let kitPid = prodBySku.get(KIT_COFFRET.sku);
  if (!kitPid) {
    const [kr] = await db
      .insert(produits)
      .values({
        articleId: kitArticleId, typeProduit: "OUTIL", codeBarre: KIT_COFFRET.sku, codeArticle: KIT_COFFRET.sku,
        titre: KIT_COFFRET.titre, designationCourte: KIT_COFFRET.titre, categorieId: catMap.get(KIT_COFFRET.categorie) ?? null,
        uniteBaseId: UNI.PCE ?? null, referencePrincipale: "COFFRET-108", tva: "19.25", statut: "actif", statutCycleVie: "ACTIF",
        niveau: "EXEMPLAIRE", typeOutil: "KIT", emplacementPrincipalId: locIds.get("LOC-KIT-R01") ?? null,
        positionEmplacement: "N_A", positionCote: "N_A", positionEssieu: "N_A", origineProduit: "AFTERMARKET", etatProduit: "NEUF", isActive: true, prixAchat: "325000",
      } as any)
      .returning({ id: produits.id });
    kitPid = kr?.id;
  }
  if (kitPid) {
    prodBySku.set(KIT_COFFRET.sku, kitPid);
    await db.insert(codesBarres).values({ produitId: kitPid, type: "REFERENCE", valeur: KIT_COFFRET.sku, estDefaut: true }).onConflictDoNothing({ target: codesBarres.valeur });
    await db.insert(varianteAttributs).values({ varianteId: kitPid, cle: "nb_pieces", valeur: String(totalPieces), ordre: 0, typeAttribut: "NOMBRE", portee: "VARIANTE", statutValeur: "RENSEIGNE" } as any).onConflictDoNothing({ target: [varianteAttributs.varianteId, varianteAttributs.cle] });
    let n = 0;
    let created = 0;
    for (let ci = 0; ci < KIT_COFFRET.composants.length; ci++) {
      const [nom, qte] = KIT_COFFRET.composants[ci];
      for (let q = 0; q < qte; q++) {
        n++;
        const skuComp = `OUT-${String(200 + n).padStart(4, "0")}`;
        const missing = (n === 7 || n === 52);
        const existsC = await db.select({ id: produits.id }).from(produits).where(eq(produits.codeBarre, skuComp)).limit(1);
        let compId = existsC[0]?.id;
        if (!compId) {
          const [cr] = await db
            .insert(produits)
            .values({
              typeProduit: "OUTIL", codeBarre: skuComp, codeArticle: skuComp, titre: `${nom} #${n}`,
              designationCourte: `${nom} #${n}`, categorieId: catMap.get("DEMO-KITS-COFFRETS") ?? null, uniteBaseId: UNI.PCE ?? null,
              referencePrincipale: nom, tva: "19.25", statut: "actif", statutCycleVie: "ACTIF", niveau: "EXEMPLAIRE",
              typeOutil: "INDIVIDUEL", statutOutil: missing ? "PERDU" : null, emplacementPrincipalId: locIds.get("LOC-KIT-R01") ?? null,
              positionEmplacement: "N_A", positionCote: "N_A", positionEssieu: "N_A", nomCode: nom, origineProduit: "AFTERMARKET", etatProduit: "NEUF", isActive: true,
            } as any)
            .returning({ id: produits.id });
          compId = cr?.id;
        }
        if (compId) {
          created++;
          prodBySku.set(skuComp, compId);
          await db.insert(kitsLignes).values({ kitId: kitPid, composantId: compId, quantite: "1" }).onConflictDoNothing({ target: [kitsLignes.kitId, kitsLignes.composantId] });
          if (!existsC[0]) await db.insert(codesBarres).values({ produitId: compId, type: "REFERENCE", valeur: skuComp, estDefaut: true }).onConflictDoNothing({ target: codesBarres.valeur });
        }
      }
    }
    console.log(`Coffret 108 pièces : ${created} composants rattachés (dont 2 PERDUS/absents), ${totalPieces} référencés.`);
  }

  const SERVICES: { code: string; designation: string; categorie: string; duree: string; prixPro: string; prixParticulier: string; expertise?: string; garantie?: string; typeDiag?: string }[] = [
    { code: "SRV-VIDANGE", designation: "Vidange simple (huile + filtre avec huile liq)", categorie: "DEMO-SRV-ENTRETIEN", duree: "0h45", prixPro: "4500", prixParticulier: "6000", expertise: "Technicien 1", garantie: "3" },
    { code: "SRV-VIDANGE-COMPL", designation: "Vidange complète (huile moteur + filtre)", categorie: "DEMO-SRV-ENTRETIEN", duree: "1h00", prixPro: "8500", prixParticulier: "11000", expertise: "Technicien 1", garantie: "3" },
    { code: "SRV-CHG-PLAQUETTES", designation: "Remplacement plaquettes de frein avant", categorie: "DEMO-SRV-ENTRETIEN", duree: "1h30", prixPro: "12000", prixParticulier: "15000", expertise: "Technicien 2" },
    { code: "SRV-CHG-DISQUES", designation: "Remplacement disques + plaquettes avant", categorie: "DEMO-SRV-ENTRETIEN", duree: "2h00", prixPro: "22000", prixParticulier: "28000", expertise: "Technicien 2" },
    { code: "SRV-EQUILIBRAGE", designation: "Équilibrage 4 roues", categorie: "DEMO-SRV-ENTRETIEN", duree: "0h30", prixPro: "4000", prixParticulier: "5000", expertise: "Technicien 1" },
    { code: "SRV-PARALLELISME", designation: "Parallélisme / géométrie 3D", categorie: "DEMO-SRV-ENTRETIEN", duree: "0h45", prixPro: "8000", prixParticulier: "10000", expertise: "Technicien 3" },
    { code: "SRV-MONTAGE-PNEU", designation: "Montage + équilibrage 1 pneumatique", categorie: "DEMO-SRV-ENTRETIEN", duree: "0h25", prixPro: "3000", prixParticulier: "4000", expertise: "Technicien 1" },
    { code: "SRV-PERMUTATION", designation: "Permutation des 4 roues + pression", categorie: "DEMO-SRV-ENTRETIEN", duree: "0h30", prixPro: "3500", prixParticulier: "4500", expertise: "Technicien 1" },
    { code: "SRV-RECHARGE-CLIM", designation: "Recharge climatisation (avec fluide)", categorie: "DEMO-SRV-ENTRETIEN", duree: "1h00", prixPro: "28000", prixParticulier: "35000", expertise: "Technicien 3" },
    { code: "SRV-DIAG-ELECTRO", designation: "Diagnostic électronique", categorie: "DEMO-SRV-REPARATION", duree: "1h00", prixPro: "15000", prixParticulier: "20000", expertise: "Technicien 3", typeDiag: "électronique" },
    { code: "SRV-DIAG-MOTEU", designation: "Diagnostic moteur (banc + essai)", categorie: "DEMO-SRV-REPARATION", duree: "1h30", prixPro: "18000", prixParticulier: "24000", expertise: "Technicien 3", typeDiag: "mécanique" },
    { code: "SRV-RPI-PANNE-ELEC", designation: "Recherche panne électrique", categorie: "DEMO-SRV-REPARATION", duree: "2h00", prixPro: "25000", prixParticulier: "32000", expertise: "Technicien 3" },
    { code: "SRV-CHG-AMORT", designation: "Remplacement amortisseurs avant (paire)", categorie: "DEMO-SRV-REPARATION", duree: "2h30", prixPro: "26000", prixParticulier: "32000", expertise: "Technicien 2" },
    { code: "SRV-CHG-ROTULE", designation: "Remplacement rotules de suspension", categorie: "DEMO-SRV-REPARATION", duree: "1h30", prixPro: "14000", prixParticulier: "18000", expertise: "Technicien 2" },
    { code: "SRV-KIT-EMBRAYAGE", designation: "Remplacement kit d'embrayage", categorie: "DEMO-SRV-REPARATION", duree: "5h00", prixPro: "78000", prixParticulier: "95000", expertise: "Technicien 2" },
    { code: "SRV-COURROIE-DISTRI", designation: "Remplacement courroie distribution", categorie: "DEMO-SRV-REPARATION", duree: "3h30", prixPro: "48000", prixParticulier: "60000", expertise: "Technicien 2" },
    { code: "SRV-REMPLACE-FILTRE", designation: "Remplacement filtre à air + carburant", categorie: "DEMO-SRV-ENTRETIEN", duree: "0h30", prixPro: "3000", prixParticulier: "4500", expertise: "Technicien 1" },
    { code: "SRV-CALIBRAGE-ADAS", designation: "Calibrage caméra ADAS (pare-brise / volant)", categorie: "DEMO-SRV-SPECIAL", duree: "2h00", prixPro: "65000", prixParticulier: "80000", expertise: "Technicien 3" },
    { code: "SRV-DEPANNAGE", designation: "Dépannage sur route", categorie: "DEMO-SRV-SPECIAL", duree: "2h00", prixPro: "45000", prixParticulier: "55000", expertise: "Technicien 2" },
    { code: "SRV-MO", designation: "Main d'œuvre atelier (heure)", categorie: "DEMO-SRV-REPARATION", duree: "1h00", prixPro: "9500", prixParticulier: "13000", expertise: "Technicien 1" },
  ];
  const srvCats: Record<string, string> = {};
  for (const s of SERVICES) {
    const catId = catMap.get(s.categorie)!;
    const [ar] = await db
      .insert(produitArticles)
      .values({ code: s.code, designation: s.designation, categorieId: catId, typeProduit: "SERVICE", isActive: true } as any)
      .onConflictDoNothing({ target: produitArticles.code })
      .returning({ id: produitArticles.id });
    const articleId = ar?.id ?? (await db.select({ id: produitArticles.id }).from(produitArticles).where(eq(produitArticles.code, s.code)).limit(1))[0]!.id;
    const sku = `DEMO-${s.code}`;
    const existsP = await db.select({ id: produits.id }).from(produits).where(eq(produits.codeBarre, sku)).limit(1);
    if (!existsP.length) {
      const [row] = await db
        .insert(produits)
        .values({
          articleId, typeProduit: "SERVICE", codeBarre: sku, codeArticle: sku, titre: s.designation,
          designationCourte: s.designation.length > 150 ? s.designation.slice(0, 150) : s.designation, categorieId: catId,
          uniteBaseId: UNI.H ?? UNI.PCE ?? null, tva: "19.25", statut: "actif", statutCycleVie: "ACTIF", niveau: "VARIANTE",
          prixVente: s.prixParticulier, prixPro: s.prixPro, prixParticulier: s.prixParticulier, prixMinimumVente: s.prixPro,
          conditionnement: s.duree, etatProduit: "NEUF", origineProduit: "CONSTRUCTEUR", isActive: true,
        } as any)
        .returning({ id: produits.id });
      if (row) {
        prodBySku.set(sku, row.id);
        await db.insert(codesBarres).values({ produitId: row.id, type: "REFERENCE", valeur: sku, estDefaut: true }).onConflictDoNothing({ target: codesBarres.valeur });
        await db.insert(produitUnites).values({ produitId: row.id, uniteId: UNI.H ?? UNI.PCE as string, facteurVersParent: "1", facteurVersBase: "1", estUniteBase: true, estUniteAchatDefaut: true, estUniteVenteDefaut: true } as any).onConflictDoNothing({ target: [produitUnites.produitId, produitUnites.uniteId] });
        await db.insert(tarifs).values({ produitId: row.id, type: "PRO", prix: s.prixPro, label: "Tarif professionnel", quantiteMin: 1, isActive: true } as any).onConflictDoNothing();
        await db.insert(tarifs).values({ produitId: row.id, type: "PARTICULIER", prix: s.prixParticulier, label: "Tarif particulier", quantiteMin: 1, isActive: true } as any).onConflictDoNothing();
        const attrs: { cle: string; valeur: string; typeAttribut?: string }[] = [{ cle: "duree", valeur: s.duree, typeAttribut: "DUREE" }];
        if (s.expertise) attrs.push({ cle: "expertise", valeur: s.expertise, typeAttribut: "TEXTE" });
        if (s.garantie) attrs.push({ cle: "garantie_prestation", valeur: s.garantie, typeAttribut: "NOMBRE" });
        if (s.typeDiag) attrs.push({ cle: "type_diag", valeur: s.typeDiag, typeAttribut: "ENUM" });
        for (const [i, at] of attrs.entries()) {
          await db.insert(varianteAttributs).values({ varianteId: row.id, cle: at.cle, valeur: at.valeur, ordre: i, typeAttribut: at.typeAttribut ?? "TEXTE", portee: "VARIANTE", statutValeur: "RENSEIGNE" } as any).onConflictDoNothing({ target: [varianteAttributs.varianteId, varianteAttributs.cle] });
        }
      }
    }
  }

  const stockRows = await db.select({ produitId: stocks.produitId, emplacementId: stocks.emplacementId, lotId: stocks.lotId, quantite: stocks.quantite }).from(stocks).where(eq(stocks.agenceId, AGENCE_ID));
  let mvt = 0;
  for (const s of stockRows) {
    const q = Number(s.quantite);
    if (q <= 0) continue;
    const produit = await db.select({ id: produits.id, titre: produits.titre }).from(produits).where(eq(produits.id, s.produitId)).limit(1);
    if (!produit.length) continue;
    const isOutillage = produit[0].id === kitPid;
    const reception = Math.round((q + 3 + (s.produitId % 5)) * 100) / 100;
    await db.insert(mouvementsStock).values({
      produitId: s.produitId, agenceId: AGENCE_ID, type: "RECEPTION", sens: "E", quantite: String(reception),
      uniteId: null, emplacementId: s.emplacementId, lotId: s.lotId, stockAvant: "0", stockApres: String(reception),
      reference: "SEED-DEMO-RCEPT", referenceType: "SEED", documentLie: "BL-DEMO-2026", motif: "Réception initiale dataset démo", dateMouvement: dt("2026-06-01 09:00:00"), effectuePar: adminUser,
    } as any).onConflictDoNothing();
    mvt++;
    if (!isOutillage) {
      const sortie = Math.round((reception - q) * 100) / 100;
      if (sortie > 0) {
        await db.insert(mouvementsStock).values({
          produitId: s.produitId, agenceId: AGENCE_ID, type: "SORTIE_OR", sens: "S", quantite: String(sortie),
          uniteId: null, emplacementId: s.emplacementId, lotId: s.lotId, stockAvant: String(reception), stockApres: String(q),
          reference: "SEED-DEMO-SORTIE", referenceType: "SEED", documentLie: "OR-DEMO-001", motif: "Sortie démo vers ordre de réparation", dateMouvement: dt("2026-08-15 14:00:00"), effectuePar: adminUser,
        } as any).onConflictDoNothing();
        mvt++;
      }
    }
  }
  console.log(`Mouvements de stock : ${mvt} insérés.`);

  const totals = {
    unites: 13,
    domaines: DOMAINES.length,
    categories: CATEGORIES_ADD.length,
    fournisseurs: FOURNISSEURS.length,
    employes: EMPLOYES.length,
    vehicules: VEHICULES.length,
    emplacements: EMPLACEMENTS.length,
    articles: ARTICLES.length + OUTILS.length + EQUIPEMENTS.length + 1 + SERVICES.length,
    variantes: [...prodBySku.values()].length,
    equipements: EQUIPEMENTS.length,
    services: SERVICES.length,
  };
  console.log("SEED DEMO TERMINÉ");
  console.table(totals);
  process.exit(0);
}

main().catch((e) => { console.error("ERR", e); process.exit(1); });