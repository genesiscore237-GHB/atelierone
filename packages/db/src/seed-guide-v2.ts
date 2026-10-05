import "dotenv/config";
import { requireLocalOrForced } from "./env-guard";
import { db } from "./client";
import {
  categories,
  guideSearchAliases,
  guideVariantTypes,
  guideVariantDifferentiators,
  guideProcedures,
  guideProcedureSteps,
  guideFieldMappings,
  guideModelingRules,
  guideRelations,
} from "./schema";
import { eq, inArray, sql } from "drizzle-orm";

requireLocalOrForced("seed-guide-v2 (Concept Article / Guide v2)");

const BRANCHES_PRODUIT = ["PIECE", "CONSOMMABLE", "OUTIL", "EQUIPEMENT", "SERVICE"];
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// ─────────────────────────────────────────────────────────────────────────────
// Contenu riche (variantes types, différenciateurs, procédures spécifiques,
// mapping, règles, relations) pour les familles démonstratrices + aliases.
// ─────────────────────────────────────────────────────────────────────────────

interface Rich {
  aliases: string[];
  variantTypes?: { nom: string; description?: string; diffPrincipale?: string; estReference?: boolean; differentiators?: { cle: string; libelle: string; portee?: string; statut?: string; exemple?: string; uniteExemple?: string }[] }[];
  procedureSteps?: { scenario: string; titre?: string; contexte?: string; steps: { titre: string; ecran?: string; action: string; champs?: string; verification?: string }[] }[];
  fieldMappings?: { informationMetier: string; portee?: string; champAtelierOne?: string; ecran?: string; etape?: string; statut?: string }[];
  modelingRules?: { titre: string; enonce: string; casExemple?: string }[];
  relations?: { typeRelation: string; definition: string; exemple?: string }[];
}

const RICH_BY_NOM: Record<string, Rich> = {
  "Filtre à huile": {
    aliases: ["oil filter", "filtre huile", "cartouche filtre huile", "filtre a huile", "filter huile"],
    variantTypes: [
      {
        nom: "Spin-on (vissé)",
        description: "Le filtre se visse directement sur le bloc moteur. Le plus courant.",
        diffPrincipale: "Fixation vissée 3/4-16 ou équivalent",
        estReference: true,
        differentiators: [
          { cle: "filetage", libelle: "Filetage", statut: "OBLIGATOIRE", exemple: "3/4-16" },
          { cle: "diametre_exterieur", libelle: "Diamètre extérieur", statut: "RECOMMANDE", exemple: "76", uniteExemple: "mm" },
        ],
      },
      {
        nom: "Cartouche",
        description: "Élément filtrant nu inséré dans un porte-filtre réutilisable.",
        diffPrincipale: "Aucune fixation vissée (élément nu)",
        differentiators: [
          { cle: "diametre_exterieur", libelle: "Diamètre extérieur", statut: "OBLIGATOIRE", exemple: "93", uniteExemple: "mm" },
          { cle: "hauteur", libelle: "Hauteur", statut: "RECOMMANDE", exemple: "130", uniteExemple: "mm" },
        ],
      },
      { nom: "Bolt-on", description: "Filtre monté sous un boulon central traversant.", diffPrincipale: "Boulon central" },
    ],
    procedureSteps: [
      {
        scenario: "NOM_SEUL",
        titre: "Saisir un filtre à huile depuis le nom seul",
        contexte: "Deux variantes possibles : spin-on ou cartouche. Le filetage ou le diamètre les distingue.",
        steps: [
          { titre: "Identifier le type de fixation", action: "Demandez ou vérifiez : le filtre se visse (spin-on) ou s'emboîte nu (cartouche) ?", verification: "Type = SPIN_ON, CARTRIDGE ou BOLT_ON" },
          { titre: "Créer l'article", ecran: "Article — Identification", action: "Saisissez la désignation (ex : Filtre à huile Mann). Ne mettez JAMAIS la référence dans la désignation.", champs: "designation_courte=filtre à huile (marque)" },
          { titre: "Créer la variante", ecran: "Variante — Caractéristiques", action: "Renseignez marque + filetage (ou diamètre) + référence fabricant.", champs: "marque=ex Mann\r\ncaractéristique.filetage=3/4-16\r\nreference_fabricant=W712/92" },
          { titre: "Ajouter l'OEM", ecran: "Variante — Références", action: "Saisissez la ou les références OEM constructeur (ex 90915-YZZD1).", verification: "Une variante = une référence commerciale unique" },
          { titre: "Valider", action: "Enregistrez puis ouvrez la fiche : prix, seuils, unités." },
        ],
      },
      {
        scenario: "NOM_REF",
        titre: "Saisir avec la référence en main",
        contexte: "La référence détermine la variante (ex : Mann W712/92).",
        steps: [
          { titre: "Rechercher la référence", ecran: "Recherche", action: "Tapez la référence : si un article existe déjà, enrichissez-le. Sinon créez l'article.", verification: "Éviter le doublon OEM" },
          { titre: "Créer l'article + variante", ecran: "Variante — Caractéristiques", action: "Renseignez marque, filetage, référence fabricant conforme à l'étiquette.", champs: "reference_fabricant=W712/92\r\ncaractéristique.filetage=3/4-16" },
          { titre: "Compatibilité véhicule", ecran: "Variante — Compatibilités", action: "Ajoutez les modèles compatibles connus (fabricant / modèle / motorisation)." },
        ],
      },
      {
        scenario: "EXISTANT",
        titre: "Le produit existe déjà",
        contexte: "La ref OEM 90915-… appartient déjà à une variante : enrichir, ne pas recréer.",
        steps: [
          { titre: "Chercher par OEM", action: "Tapez la réf OEM : le résultat affiche la variante existante.", verification: "Zéro doublon" },
          { titre: "Enrichir", ecran: "Variante — Fiche", action: "Ajoutez la compatibilité véhicule ou une référence équivalente manquante." },
        ],
      },
    ],
    fieldMappings: [
      { informationMetier: "Type de fixation", champAtelierOne: "caractéristique.type_filtre", ecran: "Variante — Caractéristiques", statut: "OBLIGATOIRE" },
      { informationMetier: "Filetage", champAtelierOne: "caractéristique.filetage", ecran: "Variante — Caractéristiques", statut: "OBLIGATOIRE" },
      { informationMetier: "Référence fabricant", champAtelierOne: "reference_fabricant", ecran: "Variante — Identification", statut: "OBLIGATOIRE" },
      { informationMetier: "Référence OEM constructeur", champAtelierOne: "ref_oem", ecran: "Variante — Références", statut: "RECOMMANDE" },
      { informationMetier: "Compatibilité véhicule", champAtelierOne: "compatibilites[]", ecran: "Variante — Compatibilités", statut: "RECOMMANDE" },
    ],
    modelingRules: [
      { titre: "1 variante = 1 référence commerciale", enonce: "Chaque différence technique (filetage, diamètre) qui change la référence doit être une variante distincte.", casExemple: "W712/92 (spin-on) et W712/93 : variantes ≠" },
      { titre: "La désignation reste générique", enonce: "Ne pas injecter la référence dans la désignation courte : la référence vit dans ses champs dédiés." },
    ],
    relations: [
      { typeRelation: "EQUIVALENT", definition: "Référence échangeable à l'identique (même filetage/dimensions), marque différente.", exemple: "Mann W712/92 ≃ Bosch 0451103316" },
      { typeRelation: "SUBSTITUT", definition: "Pièce fonctionnellement équivalente mais dimensions légèrement différentes (peut dépasser du carter)." },
      { typeRelation: "COMPATIBLE", definition: "Proposée pour un véhicule donné (annuaire constructeur)." },
    ],
  },

  Batterie: {
    aliases: ["battery", "battery 12v", "batterie auto", "batterie 12v"],
    variantTypes: [
      {
        nom: "Démarrrage (SLI)",
        description: "Batterie de démarrage classique (plomb ou AGM/EFB).",
        estReference: true,
        differentiators: [
          { cle: "capacite", libelle: "Capacité nominale", portee: "VARIANTE", statut: "OBLIGATOIRE", exemple: "70", uniteExemple: "Ah" },
          { cle: "courant_ca", libelle: "Courant de démarrage (CCA)", statut: "OBLIGATOIRE", exemple: "720", uniteExemple: "A" },
          { cle: "norme", libelle: "Norme / dimensions", statut: "RECOMMANDE", exemple: "LN3 / 278x175x175", uniteExemple: "mm" },
        ],
      },
      { nom: "Technologie AGM / EFB", description: "Start & Stop. L'AGM se règle du côté positif ; l'EFB est plus économique.", diffPrincipale: "Start & Stop" },
    ],
    fieldMappings: [
      { informationMetier: "Capacité nominale", champAtelierOne: "caractéristique.capacite", ecran: "Variante — Caractéristiques", statut: "OBLIGATOIRE" },
      { informationMetier: "Courant de démarrage CCA", champAtelierOne: "caractéristique.courant_ca", ecran: "Variante — Caractéristiques", statut: "OBLIGATOIRE" },
      { informationMetier: "Polarité / positions", champAtelierOne: "caractéristique.polarite", ecran: "Variante — Caractéristiques", statut: "RECOMMANDE" },
      { informationMetier: "Dimensions LxHxP", champAtelierOne: "caractéristique.dimensions", ecran: "Variante — Caractéristiques", statut: "RECOMMANDE" },
    ],
    modelingRules: [
      { titre: "La capacité et le CCA font la variante", enonce: "Deux batteries de même marque mais 60Ah vs 70Ah sont DEUX variantes d'un même article." },
      { titre: "Respecter la norme du véhicule", enonce: "Si le véhicule requiert AGM, une batterie standard est le plus souvent incompatible.", casExemple: "Start & Stop → AGM/EFB" },
    ],
    relations: [
      { typeRelation: "SUBSTITUT", definition: "Batterie de capacité supérieure dans la même boîte (mêmes dimensions), à condition que CCA ≥ spec.", exemple: "70Ah remplace 60Ah si les dimensions le permettent" },
      { typeRelation: "COMPATIBLE", definition: "Prévue pour un modèle de véhicule précis (annuaire constructeur)." },
    ],
  },

  "Plaquettes de frein avant": {
    aliases: ["brake pads", "plaquettes", "plaquettes avant", "pads", "frein pads"],
    variantTypes: [
      {
        nom: "Pack 4 pastilles (1 axe)",
        description: "Plaquettes vendues par jeu pour un essieu.",
        estReference: true,
        differentiators: [
          { cle: "epaisseur_pastille", libelle: "Épaisseur pastille neuve", statut: "RECOMMANDE", exemple: "17.5", uniteExemple: "mm" },
          { cle: "type_capteur", libelle: "Capteur d'usure intégré", statut: "OPTIONNEL", exemple: "Oui / Non" },
          { cle: "epaisseur_disque_min", libelle: "Épaisseur disque min (réf à associer)", statut: "RECOMMANDE" },
        ],
      },
      { nom: "Avec capteur d'usure", description: "Pastille équipée d'un témoin d'usure connecté.", diffPrincipale: "Témoin d'usure filaire" },
    ],
    modelingRules: [
      { titre: "Plaquettes AV et AR sont des articles distincts", enonce: "Ne regroupez jamais avant/arrière dans un même article.", casExemple: "Plaquettes avant ≠ plaquettes arrière" },
      { titre: "Le capteur d'usure est une option de variante", enonce: "Présence du témoin = variante, pas article." },
    ],
    relations: [
      { typeRelation: "COMPATIBLE", definition: "Proposé pour une liste de véhicules avec épaisseur de disque minimale." },
      { typeRelation: "KIT", definition: "Kit plaquettes + disques vendu ensemble." },
    ],
  },

  "Plaquettes de frein arrière": {
    aliases: ["brake pads rear", "plaquettes arriere"],
    modelingRules: [
      { titre: "Plaquettes AV et AR sont des articles distincts", enonce: "Ne regroupez jamais avant/arrière dans un même article." },
    ],
  },

  "Pneu tourisme": {
    aliases: ["tire", "tyre", "pneu", "pneumatique"],
    variantTypes: [
      {
        nom: "Dimension standard",
        description: "Dimensionnement par code pneu (ex 205/55 R16 91V).",
        estReference: true,
        differentiators: [
          { cle: "dimension", libelle: "Dimension (L/H R jante)", portee: "VARIANTE", statut: "OBLIGATOIRE", exemple: "205/55 R16" },
          { cle: "indice_charge", libelle: "Indice de charge", statut: "RECOMMANDE", exemple: "91" },
          { cle: "indice_vitesse", libelle: "Indice de vitesse", statut: "RECOMMANDE", exemple: "V" },
        ],
      },
      { nom: "Run Flat / renforcé", description: "Pneu utilisable à plat (marques ZP, RF, SSR).", diffPrincipale: "Capacité roulage à plat" },
    ],
    modelingRules: [
      { titre: "Respecter l'indice de vitesse", enonce: "Ne jamais proposer un pneu d'indice inférieur à la spécification véhicule." },
    ],
  },

  "Bougie d'allumage": {
    aliases: ["spark plug", "bougie", "bougie d'allumage"],
    variantTypes: [
      { nom: "Anti-parasites (résistive)", estReference: true, differentiators: [{ cle: "entraxe", libelle: "Pas de vis", statut: "OBLIGATOIRE", exemple: "M14x1.25" }, { cle: "indice_thermique", libelle: "Indice thermique", statut: "RECOMMANDE", exemple: "6 UG" }] },
      { nom: "Iridium / Platine", description: "Électrode précieuse, longévité supérieure.", diffPrincipale: "Matériau d'électrode" },
    ],
  },

  "Courroie de distribution": {
    aliases: ["timing belt", "courroie"],
    variantTypes: [
      { nom: "Kit complet (courroie + galets + tendeur)", estReference: true, differentiators: [{ cle: "nb_dents", libelle: "Nombre de dents", statut: "OBLIGATOIRE", exemple: "152" }, { cle: "largeur", libelle: "Largeur", statut: "RECOMMANDE", exemple: "25", uniteExemple: "mm" }] },
    ],
    modelingRules: [
      { titre: "Privilégier le kit", enonce: "Vendre la courroie seule se solde souvent par un retour : le kit inclut galets et tendeur." },
    ],
  },

  "Clé à chocs": {
    aliases: ["impact wrench", "cle a choc", "clé à choc", "impact gun"],
    variantTypes: [
      { nom: "Pneumatique", estReference: true, differentiators: [{ cle: "carre_transmission", libelle: "Carré d'entraînement", statut: "OBLIGATOIRE", exemple: "1/2\"" }, { cle: "couple_max", libelle: "Couple max", statut: "OBLIGATOIRE", exemple: "650", uniteExemple: "Nm" }] },
      { nom: "Électrique sans fil", description: "Sur batterie 18/20 V.", diffPrincipale: "Alimentation", differentiators: [{ cle: "couple_max", libelle: "Couple max", statut: "OBLIGATOIRE", exemple: "400", uniteExemple: "Nm" }, { cle: "capacite_batterie", libelle: "Tension batterie", statut: "RECOMMANDE", exemple: "18", uniteExemple: "V" }] },
    ],
  },
};

/** Aliases pour familles sans contenu riche (résolution catégorie par nom). */
const EXTRA_ALIASES: { alias: string; cibleNom: string }[] = [
  { alias: "air filter", cibleNom: "Filtre à air" },
  { alias: "fuel filter", cibleNom: "Filtre à carburant" },
  { alias: "brake disc", cibleNom: "Disques de frein avant" },
  { alias: "disque frein", cibleNom: "Disques de frein avant" },
  { alias: "engine oil", cibleNom: "Huiles moteur" },
  { alias: "oil", cibleNom: "Huiles moteur" },
  { alias: "brake fluid", cibleNom: "Liquide de frein" },
  { alias: "shock absorber", cibleNom: "Amortisseur avant" },
  { alias: "bearing", cibleNom: "Roulement de roue" },
  { alias: "clutch", cibleNom: "Embrayage" },
  { alias: "kit embrayage", cibleNom: "Embrayage" },
  { alias: "alternator", cibleNom: "Alternateur" },
  { alias: "starter", cibleNom: "Démarreur" },
  { alias: "demarreur", cibleNom: "Démarreur" },
  { alias: "radiator", cibleNom: "Radiateur" },
  { alias: "water pump", cibleNom: "Pompe à eau" },
  { alias: "compressor", cibleNom: "Compresseur d'air" },
];

// ─────────────────────────────────────────────────────────────────────────────

const procStepsNomiSeul = (nom: string) => [
  { titre: "Identifier la catégorie", action: `Vérifiez que « ${nom} » est bien la catégorie cible affichée.`, verification: "La catégorie contient exactement votre pièce" },
  { titre: "Créer l'article", ecran: "Article — Identification", action: "Saisissez la désignation commerciale générique (marque + produit, sans référence).", champs: "designation_courte=désignation générique" },
  { titre: "Créer la variante", ecran: "Variante — Caractéristiques", action: "Une variante par référence commerciale distincte : marque, référence fabricant + caractéristiques techniques.", champs: "marque=obligatoire\r\nreference_fabricant=référence exacte de l'étiquette" },
  { titre: "Ajouter les références secondaires", ecran: "Variante — Références", action: "Saisissez les OEM / références interchangeables pour la recherche.", verification: "Une variante = une référence unique" },
  { titre: "Valider puis vérifier", action: "Enregistrez puis contrôlez prix, seuils, unités et compatibilités." },
];

const procStepsExistant = [
  { titre: "Chercher par référence", ecran: "Recherche", action: "Tapez la référence : si un article existe déjà, enrichissez-le. Ne créez qu'en l'absence de résultat.", verification: "Zéro doublon" },
  { titre: "Enrichir la variante", ecran: "Variante — Fiche", action: "Ajoutez la marque, la variante manquante ou la compatibilité véhicule manquante." },
  { titre: "Rattacher les compatibilités", ecran: "Variante — Compatibilités", action: "Renseignez fabricant / modèle / motorisation si applicable." },
];

const procStepsNomRef = [
  { titre: "Rechercher la référence", ecran: "Recherche", action: "La référence détermine l'existence : enrichir si trouvé, sinon créer l'article.", verification: "Éviter le doublon de référence" },
  { titre: "Créer article + variante", ecran: "Variante — Caractéristiques", action: "Renseignez marque, référence fabricant et caractéristiques propres à la famille.", champs: "reference_fabricant=référence en main" },
  { titre: "Compatibilité véhicule", ecran: "Variante — Compatibilités", action: "Ajoutez les modèles compatibles connus." },
];

const GENERIC_PROCEDURES = (catNom: string) => [
  { scenario: "NOM_SEUL", titre: `Saisir « ${catNom} » à partir du nom seul`, contexte: "La désignation reste générique ; chaque référence commerciale devient une variante.", steps: procStepsNomiSeul(catNom) },
  { scenario: "NOM_REF", titre: "Saisir avec la référence en main", contexte: "La référence détermine la variante et évite les doublons.", steps: procStepsNomRef },
  { scenario: "EXISTANT", titre: "Le produit existe déjà", contexte: "Principe : enrichir, ne pas recréer.", steps: procStepsExistant },
];

(async () => {
  await db.transaction(async (tx) => {
    const cats = await tx.select({ id: categories.id, nom: categories.nom, typeBranche: categories.typeBranche, niveauOntologie: categories.niveauOntologie }).from(categories);
    const idByName = new Map<string, number>();
    for (const c of cats) {
      const key = norm(c.nom);
      if (!idByName.has(key)) idByName.set(key, c.id);
    }
    const catId = (nom: string): number | null => idByName.get(norm(nom)) ?? null;

    // ---- 1. Alias de recherche ----
    const aliasEntries: { alias: string; categorieId: number }[] = [];
    for (const [nom, rich] of Object.entries(RICH_BY_NOM)) {
      const id = catId(nom);
      if (id == null) {
        console.warn(`  ⚠ alias skip (catégorie introuvable) : « ${nom} »`);
        continue;
      }
      for (const a of rich.aliases) aliasEntries.push({ alias: a, categorieId: id });
    }
    for (const extra of EXTRA_ALIASES) {
      const id = catId(extra.cibleNom);
      if (id != null) aliasEntries.push({ alias: extra.alias, categorieId: id });
    }
    if (aliasEntries.length) {
      await tx.delete(guideSearchAliases).where(inArray(guideSearchAliases.alias, aliasEntries.map((a) => a.alias)));
      await tx.insert(guideSearchAliases).values(aliasEntries.map((e) => ({ alias: e.alias, categorieId: e.categorieId, type: "categorie" })));
      console.log(`Alias : ${aliasEntries.length} entrées (${Object.keys(RICH_BY_NOM).length} familles + extra).`);
    }

    // ---- 2. Contenu par catégorie produit (toutes branches produit) ----
    const productCategories = cats.filter(
      (c) => c.typeBranche && BRANCHES_PRODUIT.includes(c.typeBranche) && c.niveauOntologie &&
        ["CATEGORIE", "TYPE"].includes(c.niveauOntologie) && catId(c.nom) === c.id
    ).sort((a, b) => a.id - b.id);

    let nVT = 0, nDiff = 0, nProc = 0, nSteps = 0, nFM = 0, nMR = 0, nRel = 0;

    for (const cat of productCategories) {
      const richTop = Object.entries(RICH_BY_NOM).find(([k]) => norm(k) === norm(cat.nom))?.[1];

      // reset v2 de la catégorie (ordre FK : diff → variant_types → steps → procédures → mappings → règles → relations)
      const vtIds = await tx.select({ id: guideVariantTypes.id }).from(guideVariantTypes).where(eq(guideVariantTypes.categorieId, cat.id));
      if (vtIds.length) {
        await tx.delete(guideVariantDifferentiators).where(inArray(guideVariantDifferentiators.variantTypeId, vtIds.map((v) => v.id)));
        await tx.delete(guideVariantTypes).where(eq(guideVariantTypes.categorieId, cat.id));
      }
      const procIds = await tx.select({ id: guideProcedures.id }).from(guideProcedures).where(eq(guideProcedures.categorieId, cat.id));
      if (procIds.length) {
        await tx.delete(guideProcedureSteps).where(inArray(guideProcedureSteps.procedureId, procIds.map((p) => p.id)));
        await tx.delete(guideProcedures).where(eq(guideProcedures.categorieId, cat.id));
      }
      await tx.delete(guideFieldMappings).where(eq(guideFieldMappings.categorieId, cat.id));
      await tx.delete(guideModelingRules).where(eq(guideModelingRules.categorieId, cat.id));
      await tx.delete(guideRelations).where(eq(guideRelations.categorieId, cat.id));

      // ---- Variantes types + différenciateurs ----
      if (richTop?.variantTypes?.length) {
        for (const [i, v] of richTop.variantTypes.entries()) {
          const ins = await tx.insert(guideVariantTypes).values({
            categorieId: cat.id,
            nom: v.nom,
            description: v.description ?? null,
            diffPrincipale: v.diffPrincipale ?? null,
            estReference: v.estReference ?? false,
            ordre: i,
          }).returning({ id: guideVariantTypes.id });
          nVT += 1;
          const vId = ins[0].id;
          if (v.differentiators?.length) {
            await tx.insert(guideVariantDifferentiators).values(
              v.differentiators.map((d, j) => ({
                variantTypeId: vId,
                cle: d.cle,
                libelle: d.libelle,
                portee: d.portee ?? "VARIANTE",
                statut: d.statut ?? "OPTIONNEL",
                exemple: d.exemple ?? null,
                uniteExemple: d.uniteExemple ?? null,
                ordre: j,
              }))
            );
            nDiff += v.differentiators.length;
          }
        }
      }

      // ---- Procédures (spécifiques puis génériques en complément) ----
      const specific = richTop?.procedureSteps ?? [];
      const specificScenarios = new Set(specific.map((p) => p.scenario));
      const procedures = [
        ...specific,
        ...GENERIC_PROCEDURES(cat.nom).filter((p) => !specificScenarios.has(p.scenario)),
      ].sort((a, b) => a.scenario.localeCompare(b.scenario));
      for (const [i, p] of procedures.entries()) {
        const ins = await tx.insert(guideProcedures).values({
          categorieId: cat.id,
          scenario: p.scenario,
          titre: p.titre ?? `Saisir « ${cat.nom} »`,
          contexte: p.contexte ?? null,
          ordre: i,
        }).returning({ id: guideProcedures.id });
        nProc += 1;
        const pId = ins[0].id;
        await tx.insert(guideProcedureSteps).values(
          p.steps.map((s, j) => ({
            procedureId: pId,
            ordre: j,
            titre: s.titre,
            ecran: s.ecran ?? null,
            action: s.action,
            champs: s.champs ?? null,
            verification: s.verification ?? null,
          }))
        );
        nSteps += p.steps.length;
      }

      // ---- Mapping champ → wizard ----
      if (richTop?.fieldMappings?.length) {
        await tx.insert(guideFieldMappings).values(
          richTop.fieldMappings.map((m, j) => ({
            categorieId: cat.id,
            informationMetier: m.informationMetier,
            portee: m.portee ?? "VARIANTE",
            champAtelierOne: m.champAtelierOne ?? null,
            ecran: m.ecran ?? null,
            etape: m.etape ?? null,
            statut: m.statut ?? "OPTIONNEL",
            ordre: j,
          }))
        );
        nFM += richTop.fieldMappings.length;
      }

      // ---- Règles de modélisation ----
      if (richTop?.modelingRules?.length) {
        await tx.insert(guideModelingRules).values(
          richTop.modelingRules.map((r, j) => ({
            categorieId: cat.id,
            titre: r.titre,
            enonce: r.enonce,
            casExemple: r.casExemple ?? null,
            ordre: j,
          }))
        );
        nMR += richTop.modelingRules.length;
      }

      // ---- Relations métier ----
      if (richTop?.relations?.length) {
        await tx.insert(guideRelations).values(
          richTop.relations.map((r, j) => ({
            categorieId: cat.id,
            typeRelation: r.typeRelation,
            definition: r.definition,
            exemple: r.exemple ?? null,
            ordre: j,
          }))
        );
        nRel += richTop.relations.length;
      }
    }

    console.log(`Guide v2 : ${productCategories.length} catégories produit couvertes.`);
    console.log(`  Variantes types : ${nVT}  ·  Différenciateurs : ${nDiff}`);
    console.log(`  Procédures : ${nProc}  ·  Étapes : ${nSteps}`);
    console.log(`  Field mappings : ${nFM}  ·  Règles de modélisation : ${nMR}  ·  Relations : ${nRel}`);
  });

  console.log("SEED GUIDE V2 : OK (idempotent).");
  process.exit(0);
})().catch((e) => {
  console.error("ERREUR:", e?.message ?? e);
  process.exit(1);
});