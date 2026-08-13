import { z } from "zod";
import * as schemas from "./schemas";

interface EntiteSpec {
  cle: string;
  fichier: string;
  libelle: string;
  description: string;
  schema: z.ZodType;
  cleUpsert: string;
  references: string[];
  regles: string[];
  exemple: Record<string, unknown>[];
}

const NOM_CHAMP: Record<string, string> = {
  codeBarre: "codeBarre",
  typeProduit: "typeProduit",
  categorieCode: "categorieCode",
  fournisseurCode: "fournisseurCode",
  uniteBaseCode: "uniteBaseCode",
  uniteCode: "uniteCode",
  parentCode: "parentCode",
  agenceCode: "agenceCode",
  editeurNom: "editeurNom",
  anneeImport: "anneeImport",
  code: "code",
  nom: "nom",
  titre: "titre",
  prixVente: "prixVente",
  prixAchat: "prixAchat",
  refSource: "refSource",
};

export const ENTITES: EntiteSpec[] = [
  {
    cle: "categories",
    fichier: "categories.jsonl",
    libelle: "Catégories",
    description: "Arborescence de catégories (branches racines + sous-catégories). Chaque catégorie porte un code stable unique, et les produits y référenceront via categorieCode.",
    schema: schemas.categoriesSchema,
    cleUpsert: "code",
    references: ["parentCode → code d'une autre catégorie (racine si absent)"],
    regles: [
      "RG-002 : typeBranche doit correspondre à la branche (MANUEL pour MAN-SCO*, FOURNITURE sinon par défaut).",
      "Les codes doivent être créés avant les produits qui les référencent.",
      "Un parentCode doit être fourni AVANT sa sous-catégorie (ordre d'import respecté).",
    ],
    exemple: [
      { code: "MAN-SCO", nom: "Manuels Scolaires", typeBranche: "MANUEL", description: "Livres et manuels" },
      { code: "MAN-SCO-PRI", nom: "Primaire", typeBranche: "MANUEL", parentCode: "MAN-SCO" },
      { code: "PAP-ECR-CAH", nom: "Cahiers & Copies Doubles", typeBranche: "FOURNITURE", parentCode: "PAP-ECR" },
    ],
  },
  {
    cle: "unites",
    fichier: "unites.jsonl",
    libelle: "Unités de mesure",
    description: "Unités de mesure (pièce, douzaine, carton, kg…). Chaque unité porte un code stable unique référencé par les produits.",
    schema: schemas.unitesSchema,
    cleUpsert: "code",
    references: [],
    regles: ["Chaque produit doit référencer une unité de base existante (RG-012)."],
    exemple: [
      { code: "PCE", libelle: "Pièce", symbole: "pce", type: "QUANTITE" },
      { code: "DOZ", libelle: "Douzaine", symbole: "dz", type: "QUANTITE" },
      { code: "CTN", libelle: "Carton", symbole: "ctn", type: "QUANTITE" },
    ],
  },
  {
    cle: "editeurs",
    fichier: "editeurs.jsonl",
    libelle: "Éditeurs",
    description: "Maisons d'édition. La clé d'upsert est le nom normalisé (insensible à la casse).",
    schema: schemas.editeursSchema,
    cleUpsert: "nom",
    references: [],
    regles: ["Pas de code imposé : le nom sert de clé ; évitez les doublons de noms."],
    exemple: [{ nom: "Hatier International", emailContact: "contact@hatier.fr", telephoneContact: "+33 1 44 15 50 00" }],
  },
  {
    cle: "fournisseurs",
    fichier: "fournisseurs.jsonl",
    libelle: "Fournisseurs",
    description: "Fournisseurs (grossistes, distributeurs). Chaque fournisseur porte un code stable unique référencé par les produits et produits_fournisseurs.",
    schema: schemas.fournisseursSchema,
    cleUpsert: "code",
    references: [],
    regles: [],
    exemple: [{ code: "FOU-HATIER", nom: "Hatier Distribution", contact: "M. Dupont", telephone: "+229 01 00 00 00", email: "commande@hatier.bj", pays: "Bénin" }],
  },
  {
    cle: "produits",
    fichier: "produits.jsonl",
    libelle: "Produits",
    description: "Catalogue produits. La clé d'upsert est codeBarre (unique, RG-010). Les références catégorie/unité/fournisseur se font par codes.",
    schema: schemas.produitsSchema,
    cleUpsert: "codeBarre",
    references: ["categorieCode → categories.code", "fournisseurCode → fournisseurs.code", "uniteBaseCode → unites.code"],
    regles: [
      "RG-010 : codeBarre unique dans toute la table produits.",
      "RG-016 : prixVente doit être > 0 (obligatoire).",
      "RG-001 : typeProduit fixé à la création (MANUEL ou FOURNITURE).",
      "RG-009/032 : détection de doublons par ISBN/codeBarre, puis similarité de titre ≥ 85 % — jamais de fusion automatique.",
      "Un produit MANUEL doit avoir sa ligne dans manuels_scolaire_detail (RG-004) : fournir aussi manuels.jsonl.",
      "Montants : chaînes décimales sans séparateurs (\"10000\", \"99.5\").",
    ],
    exemple: [
      {
        codeBarre: "AO-00001",
        typeProduit: "FOURNITURE",
        titre: "Additionneuse Casio 240D",
        categorieCode: "MUL-INF-CAL",
        uniteBaseCode: "PCE",
        prixVente: "10000",
        tva: "18",
        statut: "actif",
        statutCycleVie: "ACTIF",
        seuilAlerte: 5,
        seuilCritique: 2,
        refSource: "1234",
      },
      {
        codeBarre: "9782278089001",
        typeProduit: "MANUEL",
        titre: "Mathématiques 6e",
        auteur: "A. Kamdem",
        categorieCode: "MAN-SCO-PRI",
        uniteBaseCode: "PCE",
        prixVente: "6500",
        prixAchat: "3900",
        tva: "5.5",
        niveauScolaire: "6e",
        matiere: "Mathématiques",
        refSource: "5678",
      },
    ],
  },
  {
    cle: "manuels",
    fichier: "manuels.jsonl",
    libelle: "Détails manuels scolaires",
    description: "Lignes manuel_scolaire_detail, obligatoires pour tout produit typeProduit=MANUEL (RG-004). Clé : codeBarre du produit.",
    schema: schemas.manuelsSchema,
    cleUpsert: "codeBarre",
    references: ["codeBarre → produits.codeBarre", "editeurNom → editeurs.nom (optionnel)"],
    regles: ["RG-004 : tout produit MANUEL doit avoir une ligne ici."],
    exemple: [
      { codeBarre: "9782278089001", typeManuel: "OFFICIEL", editeurNom: "Hatier International", prixReglemente: true, prixReglementeValeur: "6500", anneeImport: "2025-2026" },
    ],
  },
  {
    cle: "produits_unites",
    fichier: "produits_unites.jsonl",
    libelle: "Unités de vente des produits",
    description: "Lignes produit_unites : unités de vente/achat par produit avec facteur de conversion vers l'unité de base.",
    schema: schemas.produitsUnitesSchema,
    cleUpsert: "codeBarre + uniteCode",
    references: ["codeBarre → produits.codeBarre", "uniteCode → unites.code"],
    regles: [
      "RG-012 : chaque produit doit avoir au minimum sa ligne d'unité de base avec facteurVersBase=1 (générée automatiquement si absente).",
      "RG-013/014 : un seul estUniteAchatDefaut / estUniteVenteDefaut par produit.",
      "RG-017 : facteurVersBase entier strictement positif.",
    ],
    exemple: [
      { codeBarre: "AO-00001", uniteCode: "PCE", facteurVersBase: "1", estUniteBase: true, estUniteAchatDefaut: true, estUniteVenteDefaut: true },
      { codeBarre: "AO-00001", uniteCode: "DOZ", facteurVersBase: "12", prixVente: "108000" },
    ],
  },
  {
    cle: "produits_fournisseurs",
    fichier: "produits_fournisseurs.jsonl",
    libelle: "Liens produit ↔ fournisseur (prix d'achat par fournisseur)",
    description: "Prix d'achat d'un produit chez chaque fournisseur.",
    schema: schemas.produitsFournisseursSchema,
    cleUpsert: "codeBarre + fournisseurCode",
    references: ["codeBarre → produits.codeBarre", "fournisseurCode → fournisseurs.code"],
    regles: ["estPrincipal : au plus un fournisseur principal par produit (sinon défaut = premier)."],
    exemple: [{ codeBarre: "9782278089001", fournisseurCode: "FOU-HATIER", prixAchat: "3900", delaiApprovisionnement: 7, estPrincipal: true }],
  },
  {
    cle: "tarifs",
    fichier: "tarifs.jsonl",
    libelle: "Tarifs",
    description: "Tarifs spéciaux par produit (écoles, grossistes, promos…).",
    schema: schemas.tarifsSchema,
    cleUpsert: "codeBarre + type",
    references: ["codeBarre → produits.codeBarre"],
    regles: ["types : PUBLIC, ECOLE, GROSSISTE, REVENDEUR, PROMO."],
    exemple: [{ codeBarre: "9782278089001", type: "ECOLE", prix: "6000", quantiteMin: 20 }],
  },
  {
    cle: "prix_historique",
    fichier: "prix_historique.jsonl",
    libelle: "Historique des prix",
    description: "Journal des changements de prix (append-only : chaque ligne est un événement).",
    schema: schemas.prixHistoriqueSchema,
    cleUpsert: "aucune (append-only)",
    references: ["codeBarre → produits.codeBarre", "fournisseurCode → fournisseurs.code", "uniteCode → unites.code"],
    regles: ["source recommandée : IMPORT-CATALOGUE, référence = refSource d'origine."],
    exemple: [{ codeBarre: "9782278089001", typePrix: "VENTE", nouveauPrix: "6500", source: "IMPORT-CATALOGUE", date: "2026-08-07" }],
  },
  {
    cle: "stocks",
    fichier: "stocks_initiaux.jsonl",
    libelle: "Stocks initiaux",
    description: "Stock d'ouverture par produit et agence (installation). Crée/maj la ligne de stock et enregistre un mouvement d'entrée initiale (traçabilité).",
    schema: schemas.stocksSchema,
    cleUpsert: "codeBarre + agenceCode",
    references: ["codeBarre → produits.codeBarre", "agenceCode → agences.code"],
    regles: ["À importer APRÈS les produits.", "Quantité entière positive ou nulle.", "Les produits absents de ce fichier démarrent à 0."],
    exemple: [
      { codeBarre: "32BA", agenceCode: "MVOG-ADA", quantite: "254", refSource: "atelierone_mvogada" },
      { codeBarre: "acance1", agenceCode: "MVOG-ADA", quantite: "13" },
    ],
  },
];

/** Génère le guide complet « comment structurer vos données » en Markdown (à donner à l'IA ou à un humain). */
export function genererGuideFormat(cles?: string[]): string {
  const liste = cles && cles.length > 0 ? ENTITES.filter((e) => cles.includes(e.cle)) : ENTITES;
  const lignes: string[] = [];

  lignes.push("# Guide d'import — Format imposé par le système", "");
  lignes.push(
    "Chaque entité s'importe via un fichier **JSONL** (1 objet JSON par ligne, UTF-8, extensions .jsonl) " +
      "ou un tableau JSON (.json). Les noms de champs sont EXACTEMENT ceux documentés ci-dessous ; " +
      "tout champ inconnu est rejeté (schéma strict). Les montants sont des chaînes décimales " +
      "sans séparateurs (\"10000\", \"99.5\"), les dates au format YYYY-MM-DD, les booléens true/false.",
    "",
    "## Ordre d'import recommandé (topologique)",
    "",
    "```text",
    "1. unites   →  2. categories   →  3. editeurs   →  4. fournisseurs",
    "   →  5. produits   →  6. manuels   →  7. produits_unites",
    "   →  8. produits_fournisseurs   →  9. tarifs   →  10. prix_historique",
    "   →  11. stocks_initiaux",
    "```",
    "",
  );

  for (const entite of liste) {
    lignes.push(`## ${entite.cle} — ${entite.libelle}`, "");
    lignes.push(`Fichier : \`${entite.fichier}\``, "");
    lignes.push(entite.description, "");
    lignes.push(`Clé d'upsert : **${entite.cleUpsert}**`, "");
    if (entite.references.length > 0) {
      lignes.push("", "Références (par codes stables) :");
      for (const r of entite.references) lignes.push(`- ${r}`);
    }
    lignes.push("", "Champs :", "");
    lignes.push("| Champ | Type | Requis | Description |");
    lignes.push("| --- | --- | --- | --- |");
    for (const ligne of decrireSchema(entite.schema)) lignes.push(`| ${ligne} |`);
    lignes.push("", "Règles :");
    for (const r of entite.regles) lignes.push(`- ${r}`);
    lignes.push("", "Exemple :", "", "```jsonl");
    for (const ex of entite.exemple) lignes.push(JSON.stringify(ex));
    lignes.push("```", "", "---", "");
  }

  return lignes.join("\n");
}

/** Décrit chaque champ d'un schéma Zod en ligne de tableau markdown. */
function decrireSchema(schema: z.ZodType): string[] {
  const shape = (schema as z.ZodObject<Record<string, z.ZodType>>).shape ?? {};
  const resultat: string[] = [];
  for (const [nom, champ] of Object.entries(shape)) {
    const requis = !estOptionnel(champ);
    const type = typeChamp(champ);
    const description = descriptionChamp(champ);
    resultat.push(`${nom} | ${type} | ${requis ? "OUI" : "non"} | ${description}`);
  }
  return resultat;
}

/** Un champ est optionnel s'il est ZodOptional/ZodDefault ou s'il admet null/undefined via une union. */
function estOptionnel(champ: z.ZodType): boolean {
  const tn = typeName(champ);
  if (["ZodOptional", "ZodDefault"].includes(tn)) return true;
  if (tn === "ZodNullable") return estOptionnel((champ as z.ZodNullable<z.ZodType>).unwrap());
  if (tn === "ZodEffects") return estOptionnel((champ as z.ZodEffects<z.ZodType>)._def.schema);
  if (tn === "ZodUnion") {
    return (champ as z.ZodUnion<[z.ZodType, z.ZodType]>).options.some((o) => {
      const t = typeName(o);
      return t === "ZodNull" || t === "ZodUndefined";
    });
  }
  return false;
}

function typeName(champ: z.ZodType): string {
  return (champ as { _def?: { typeName?: string } })._def?.typeName ?? "ZodType";
}

function typeChamp(champ: z.ZodType, requis = false): string {
  const tn = typeName(champ);
  if (tn === "ZodEnum") return (champ as z.ZodEnum<[string, ...string[]]>).options.join(" | ");
  if (tn === "ZodArray") return `${typeChamp((champ as z.ZodArray<z.ZodType>).element)}[]`;
  if (tn === "ZodDefault") return typeChamp((champ as z.ZodDefault<z.ZodType>)._def.innerType);
  if (tn === "ZodOptional") return typeChamp((champ as z.ZodOptional<z.ZodType>).unwrap());
  if (tn === "ZodNullable") return typeChamp((champ as z.ZodNullable<z.ZodType>).unwrap());
  if (tn === "ZodUnion") {
    const options = (champ as z.ZodUnion<[z.ZodType, z.ZodType]>).options
      .filter((o) => !["ZodNull", "ZodUndefined"].includes(typeName(o)))
      .map((o) => typeChamp(o));
    return [...new Set(options)].join(" | ");
  }
  if (tn === "ZodEffects") return typeChamp((champ as z.ZodEffects<z.ZodType>)._def.schema);
  return tn.replace("Zod", "").toLowerCase();
}

function descriptionChamp(champ: z.ZodType): string {
  const desc: string[] = [];
  const tn = typeName(champ);
  if (tn === "ZodDefault") {
    try {
      desc.push(`défaut : ${JSON.stringify((champ as z.ZodDefault<z.ZodType>)._def.defaultValue())}`);
    } catch {
      /* ignore */
    }
  }
  if (tn === "ZodEffects") {
    const inner = (champ as z.ZodEffects<z.ZodType>)._def?.schema;
    const effets = (inner?._def as { checks?: { message?: string }[] } | undefined)?.checks;
    const msg = effets?.map((c) => c.message).find(Boolean);
    if (msg) desc.push(String(msg));
  }
  return desc.join(" ; ");
}
