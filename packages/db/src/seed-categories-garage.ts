import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import { categories } from "./schema";
import { eq } from "drizzle-orm";

requireLocalOrForced("seed-categories-garage");

/**
 * SEED — Référentiel des catégories de garage (13 grandes familles + sous-catégories).
 * Idempotent : insère uniquement les familles/sous-catégories absentes.
 */

type Cat = { code: string; nom: string; typeBranche: string; description?: string; sous?: { code: string; nom: string }[] };

const FAMILLES: Cat[] = [
  { code: "PIECE_MECA", nom: "Pièces mécaniques", typeBranche: "PIECE", description: "Filtres, freinage, suspension, transmission, refroidissement",
    sous: [
      { code: "FILTRATION", nom: "Filtration" },
      { code: "FREINAGE", nom: "Freinage" },
      { code: "SUSPENSION_DIRECTION", nom: "Suspension & Direction" },
      { code: "TRANSMISSION", nom: "Transmission" },
      { code: "COURROIES_GALETS", nom: "Courroies & Galets" },
      { code: "ROULEMENTS", nom: "Roulements" },
      { code: "REFROIDISSEMENT", nom: "Refroidissement" },
    ] },
  { code: "PIECE_MOTEUR", nom: "Pièces moteur", typeBranche: "PIECE", description: "Distribution, culasse, injection, pompes, joints",
    sous: [
      { code: "DISTRIBUTION", nom: "Distribution (pistons, bielles)" },
      { code: "CULASSE_SOUPAPES", nom: "Culasse & Soupapes" },
      { code: "INJECTION_ALLUMAGE", nom: "Injection & Allumage" },
      { code: "POMPES", nom: "Pompes (eau, huile)" },
      { code: "JOINTS", nom: "Joints moteur" },
    ] },
  { code: "ELEC_ELECTRONIQUE", nom: "Électricité & Électronique", typeBranche: "PIECE", description: "Batteries, alternateur, capteurs, calculateurs",
    sous: [
      { code: "BATTERIES", nom: "Batteries" },
      { code: "ALTERNATEURS_DEMARREURS", nom: "Alternateurs & Démarreurs" },
      { code: "ALLUMAGE_ELECTRIQUE", nom: "Allumage (fusibles, relais)" },
      { code: "ECLAIRAGE", nom: "Éclairage (ampoules, phares)" },
      { code: "CAPTEURS_CALCULATEURS", nom: "Capteurs & Calculateurs" },
      { code: "FAISCEAUX_CONNECTEURS", nom: "Faisceaux & Connecteurs" },
    ] },
  { code: "CARROSSERIE", nom: "Carrosserie & Tôlerie", typeBranche: "PIECE", description: "Pare-chocs, ailes, capots, optiques",
    sous: [
      { code: "ELEMENTS_EXTERIEURS", nom: "Éléments extérieurs" },
      { code: "RETROVISEURS", nom: "Rétroviseurs" },
      { code: "OPTIQUES", nom: "Optiques (phares, feux)" },
      { code: "CALANDRES_GRILLES", nom: "Calandres & Grilles" },
    ] },
  { code: "PEINTURE", nom: "Peinture & Préparation", typeBranche: "CONSOMMABLE", description: "Peintures, apprêts, vernis, diluants, abrasifs",
    sous: [
      { code: "PEINTURES_VERNIS", nom: "Peintures & Vernis" },
      { code: "APPRETS", nom: "Apprêts" },
      { code: "DILUANTS_DURCISSEURS", nom: "Diluants & Durcisseurs" },
      { code: "MASTICS_ABRASIFS", nom: "Mastics & Abrasifs" },
      { code: "POLISH", nom: "Polish & Polissage" },
    ] },
  { code: "FLUIDES", nom: "Lubrifiants & Fluides", typeBranche: "CONSOMMABLE", description: "Huiles, liquides, graisses, adBlue",
    sous: [
      { code: "HUILES_MOTEUR", nom: "Huiles moteur" },
      { code: "HUILES_TRANSMISSION", nom: "Huiles transmission" },
      { code: "LIQUIDES", nom: "Liquides (frein, refroidissement…)" },
      { code: "CLIMATISATION_FLUIDE", nom: "Fluide climatisation" },
      { code: "ADBLUE", nom: "AdBlue" },
      { code: "GRAISSES", nom: "Graisses" },
      { code: "NETTOYANTS", nom: "Nettoyants & Dégraissants" },
    ] },
  { code: "PNEUMATIQUES", nom: "Pneumatiques", typeBranche: "PIECE", description: "Pneus, chambres à air, valves",
    sous: [
      { code: "PNEUS_TOURISME", nom: "Pneus tourisme" },
      { code: "PNEUS_4X4_SUV", nom: "Pneus 4x4 & SUV" },
      { code: "PNEUS_UTILITAIRES", nom: "Pneus utilitaires" },
      { code: "PNEUS_POIDS_LOURDS", nom: "Pneus poids lourds" },
      { code: "CHAMBRES_VALVES", nom: "Chambres à air & Valves" },
      { code: "KITS_REPARATION_PNEU", nom: "Kits de réparation" },
    ] },
  { code: "JANTES", nom: "Jantes & Accessoires", typeBranche: "PIECE", description: "Jantes, enjoliveurs, écrous",
    sous: [
      { code: "JANTES_ALUMINIUM", nom: "Jantes" },
      { code: "ENJOLIVEURS", nom: "Enjoliveurs" },
      { code: "ECROUS_BOULONS", nom: "Écrous & Boulons" },
      { code: "ENTRETOISES", nom: "Entretoises" },
    ] },
  { code: "CONSO_ATELIER", nom: "Consommables d'atelier", typeBranche: "CONSOMMABLE", description: "Fixations, abrasifs, textiles",
    sous: [
      { code: "FIXATIONS", nom: "Fixations (vis, écrous, colliers)" },
      { code: "JOINTS_GAINES", nom: "Joints & Gaines" },
      { code: "ABRASIFS_ATELIER", nom: "Abrasifs & Électrodes" },
      { code: "TEXTILES", nom: "Chiffons, gants, papiers" },
    ] },
  { code: "OUTILLAGE", nom: "Outillage", typeBranche: "OUTIL", description: "Outils à main, électroportatif, levage, mesure",
    sous: [
      { code: "OUTIL_MANuel", nom: "Outillage à main" },
      { code: "OUTIL_SPECIALISE", nom: "Outillage spécialisé automobile" },
      { code: "OUTIL_ELECTROPORTATIF", nom: "Outillage électroportatif" },
      { code: "OUTIL_PNEUMATIQUE", nom: "Outillage pneumatique" },
      { code: "OUTIL_LEVAGE", nom: "Levage & Manutention" },
      { code: "OUTIL_MESURE", nom: "Mesure & Contrôle" },
      { code: "OUTIL_DIAGNOSTIC", nom: "Diagnostic électronique" },
      { code: "OUTIL_SOUDAGE", nom: "Soudage & Découpe" },
    ] },
  { code: "EQUIPEMENT_GARAGE", nom: "Équipements de garage", typeBranche: "EQUIPEMENT", description: "Ponts, machines, installations",
    sous: [
      { code: "EQUIP_LEVAGE", nom: "Levage (pont, équilibreuse…)" },
      { code: "EQUIP_DIAGNOSTIC", nom: "Diagnostic & Mesure" },
      { code: "EQUIP_AIR_ENERGIE", nom: "Air & Énergie (compresseur…)" },
      { code: "EQUIP_NETTOYAGE", nom: "Nettoyage (haute pression)" },
    ] },
  { code: "SECURITE", nom: "Équipements de sécurité", typeBranche: "EQUIPEMENT", description: "EPI, incendie, premiers secours",
    sous: [
      { code: "EPI", nom: "Équipements de protection (EPI)" },
      { code: "PROTECTION_INCENDIE", nom: "Protection incendie" },
      { code: "PREMIERS_SECOURS", nom: "Premiers secours" },
    ] },
  { code: "ACCESSOIRES", nom: "Accessoires automobiles", typeBranche: "PIECE", description: "Essuie-glaces, intérieur, électronique",
    sous: [
      { code: "ESSUIE_GLACES", nom: "Essuie-glaces" },
      { code: "INTERIEUR", nom: "Intérieur (tapis, accessoires)" },
      { code: "ELECTRONIQUE_EMBARQUEE", nom: "Électronique (audio, caméras)" },
      { code: "ECLAIRAGE_LED", nom: "Éclairage LED" },
    ] },
  { code: "SERVICES", nom: "Services & Main d'œuvre", typeBranche: "SERVICE", description: "Prestations vendues sans stock : main d'œuvre, diagnostics, forfaits",
    sous: [
      { code: "SERVICE_MAIN_OEUVRE", nom: "Main d'œuvre (heure)" },
      { code: "SERVICE_DIAGNOSTIC", nom: "Diagnostics & contrôles" },
      { code: "SERVICE_REPARATION", nom: "Réparations & entretien (forfait)" },
      { code: "SERVICE_DEPANNAGE", nom: "Dépannage & remorquage" },
      { code: "SERVICE_LAVAGE", nom: "Lavage & intérieur" },
    ] },
];

async function main() {
  let famillesCrees = 0;
  let sousCrees = 0;
  for (const f of FAMILLES) {
    const [famille] = await db
      .insert(categories)
      .values({ code: f.code, nom: f.nom, typeBranche: f.typeBranche, description: f.description ?? null } as any)
      .onConflictDoNothing({ target: categories.code })
      .returning({ id: categories.id });
    const famId = famille?.id;
    if (famId) famillesCrees++;
    if (!famId) {
      const [ex] = await db.select({ id: categories.id }).from(categories).where(eq(categories.code, f.code)).limit(1);
      if (!ex) throw new Error(`Famille ${f.code} introuvable après seed`);
    }
    for (const s of f.sous ?? []) {
      const [sous] = await db
        .insert(categories)
        .values({ code: s.code, nom: s.nom, typeBranche: f.typeBranche, parentId: famId ?? (await db.select({ id: categories.id }).from(categories).where(eq(categories.code, f.code)).limit(1))[0]?.id } as any)
        .onConflictDoNothing({ target: categories.code })
        .returning({ id: categories.id });
      if (sous) sousCrees++;
    }
  }
  console.log(`Seed catégories OK : ${famillesCrees} famille(s) créée(s), ${sousCrees} sous-catégorie(s) créée(s).`);
  process.exit(0);
}

main().catch((e) => { console.error("ERR", e); process.exit(1); });