import { z } from "zod";
import { sql, type SQL } from "drizzle-orm";
import {
  ventes,
  ventesLignes,
  produits,
  clients,
  utilisateurs,
  agences,
  categories,
  fournisseurs,
  niveaux,
  filieres,
  classes,
  sousSystemes,
  caisses,
  sessionsCaisse,
} from "@atelierone/db";

export const coutLigne = sql`${ventesLignes.quantite} * COALESCE(${ventesLignes.coutUnitaire}, ${produits.prixAchat} * ${ventesLignes.facteurConversion}, 0)`;
export const margeLigne = sql`${ventesLignes.totalLigne} - ${coutLigne}`;

export const REPORT_DIMENSIONS = {
  produit: {
    key: "produit",
    label: "Produit",
    group: "produit",
    groupBy: () => [produits.id, produits.titre, produits.codeBarre],
    select: () => ({
      dimId: sql`${produits.id}`,
      dimLabel: sql`${produits.titre}`,
    }),
    joins: () => [] as SQL[],
  },
  codeBarre: {
    key: "codeBarre",
    label: "Code-barres",
    group: "produit",
    groupBy: () => [produits.codeBarre, produits.titre],
    select: () => ({
      dimId: sql`${produits.codeBarre}`,
      dimLabel: sql`${produits.codeBarre}`,
    }),
    joins: () => [] as SQL[],
  },
  categorie: {
    key: "categorie",
    label: "Catégorie",
    group: "produit",
    groupBy: () => [produits.categorieId, categories.nom],
    select: () => ({
      dimId: sql`${produits.categorieId}`,
      dimLabel: sql`${categories.nom}`,
    }),
    joins: () => [sql`left join ${categories} on ${categories.id} = ${produits.categorieId}`] as SQL[],
  },
  typeProduit: {
    key: "typeProduit",
    label: "Type de produit",
    group: "produit",
    groupBy: () => [produits.typeProduit],
    select: () => ({
      dimId: sql`${produits.typeProduit}`,
      dimLabel: sql`${produits.typeProduit}`,
    }),
    joins: () => [] as SQL[],
  },
  niveau: {
    key: "niveau",
    label: "Niveau scolaire",
    group: "scolaire",
    groupBy: () => [produits.niveauId, niveaux.libelle],
    select: () => ({
      dimId: sql`${produits.niveauId}`,
      dimLabel: sql`${niveaux.libelle}`,
    }),
    joins: () => [sql`left join ${niveaux} on ${niveaux.id} = ${produits.niveauId}`] as SQL[],
  },
  classe: {
    key: "classe",
    label: "Classe",
    group: "scolaire",
    groupBy: () => [produits.classeId, classes.libelle],
    select: () => ({
      dimId: sql`${produits.classeId}`,
      dimLabel: sql`${classes.libelle}`,
    }),
    joins: () => [sql`left join ${classes} on ${classes.id} = ${produits.classeId}`] as SQL[],
  },
  filiere: {
    key: "filiere",
    label: "Filière",
    group: "scolaire",
    groupBy: () => [produits.filiereId, filieres.libelle],
    select: () => ({
      dimId: sql`${produits.filiereId}`,
      dimLabel: sql`${filieres.libelle}`,
    }),
    joins: () => [sql`left join ${filieres} on ${filieres.id} = ${produits.filiereId}`] as SQL[],
  },
  sousSysteme: {
    key: "sousSysteme",
    label: "Sous-système",
    group: "scolaire",
    groupBy: () => [produits.sousSystemeId, sousSystemes.libelle],
    select: () => ({
      dimId: sql`${produits.sousSystemeId}`,
      dimLabel: sql`${sousSystemes.libelle}`,
    }),
    joins: () => [sql`left join ${sousSystemes} on ${sousSystemes.id} = ${produits.sousSystemeId}`] as SQL[],
  },
  editeur: {
    key: "editeur",
    label: "Éditeur",
    group: "produit",
    groupBy: () => [produits.editeur],
    select: () => ({
      dimId: sql`${produits.editeur}`,
      dimLabel: sql`${produits.editeur}`,
    }),
    joins: () => [] as SQL[],
  },
  fournisseur: {
    key: "fournisseur",
    label: "Fournisseur",
    group: "produit",
    groupBy: () => [produits.fournisseurId, fournisseurs.nom],
    select: () => ({
      dimId: sql`${produits.fournisseurId}`,
      dimLabel: sql`${fournisseurs.nom}`,
    }),
    joins: () => [sql`left join ${fournisseurs} on ${fournisseurs.id} = ${produits.fournisseurId}`] as SQL[],
  },
  client: {
    key: "client",
    label: "Client",
    group: "vente",
    groupBy: () => [ventes.clientId, clients.nom, clients.prenom],
    select: () => ({
      dimId: sql`${ventes.clientId}`,
      dimLabel: sql`trim(concat(coalesce(${clients.prenom}, ''), ' ', ${clients.nom}))`,
    }),
    joins: () => [sql`left join ${clients} on ${clients.id} = ${ventes.clientId}`] as SQL[],
  },
  vendeur: {
    key: "vendeur",
    label: "Vendeur",
    group: "vente",
    groupBy: () => [ventes.operateurId, utilisateurs.nom, utilisateurs.prenom],
    select: () => ({
      dimId: sql`${ventes.operateurId}`,
      dimLabel: sql`trim(concat(coalesce(${utilisateurs.prenom}, ''), ' ', ${utilisateurs.nom}))`,
    }),
    joins: () => [sql`left join ${utilisateurs} on ${utilisateurs.id} = ${ventes.operateurId}`] as SQL[],
  },
  caisse: {
    key: "caisse",
    label: "Caisse",
    group: "vente",
    groupBy: () => [sessionsCaisse.caisseId, caisses.libelle],
    select: () => ({
      dimId: sql`${sessionsCaisse.caisseId}`,
      dimLabel: sql`${caisses.libelle}`,
    }),
    joins: () => [
      sql`left join ${sessionsCaisse} on ${sessionsCaisse.id} = ${ventes.sessionCaisseId}`,
      sql`left join ${caisses} on ${caisses.id} = ${sessionsCaisse.caisseId}`,
    ] as SQL[],
  },
  modePaiement: {
    key: "modePaiement",
    label: "Mode de paiement",
    group: "vente",
    groupBy: () => [ventes.modePaiement],
    select: () => ({
      dimId: sql`${ventes.modePaiement}`,
      dimLabel: sql`${ventes.modePaiement}`,
    }),
    joins: () => [] as SQL[],
  },
  agence: {
    key: "agence",
    label: "Agence",
    group: "vente",
    groupBy: () => [ventes.agenceId, agences.nom],
    select: () => ({
      dimId: sql`${ventes.agenceId}`,
      dimLabel: sql`${agences.nom}`,
    }),
    joins: () => [sql`left join ${agences} on ${agences.id} = ${ventes.agenceId}`] as SQL[],
  },
  periode: {
    key: "periode",
    label: "Période",
    group: "temps",
    groupBy: () => [] as SQL[],
    select: () => ({
      dimId: sql`''`,
      dimLabel: sql`''`,
    }),
    joins: () => [] as SQL[],
  },
} as const;

export const REPORT_MEASURES = {
  ca: { key: "ca", label: "Chiffre d'affaires", type: "currency", expr: sql`sum(${ventesLignes.totalLigne})` },
  quantite: { key: "quantite", label: "Quantité vendue", type: "quantity", expr: sql`sum(${ventesLignes.quantite})` },
  cout: { key: "cout", label: "Coût", type: "currency", expr: sql`sum(${coutLigne})` },
  margeBrute: { key: "margeBrute", label: "Marge brute", type: "currency", expr: sql`sum(${margeLigne})` },
  remises: { key: "remises", label: "Remises", type: "currency", expr: sql`sum(${ventes.remise})` },
  pertes: { key: "pertes", label: "Pertes (ventes sous coût)", type: "currency", expr: sql`sum(case when ${ventesLignes.coutUnitaire} > ${ventesLignes.prixUnitaire} then ${ventesLignes.quantite} * (${ventesLignes.coutUnitaire} - ${ventesLignes.prixUnitaire}) else 0 end)` },
  nbTickets: { key: "nbTickets", label: "Nombre de tickets", type: "count", expr: sql`count(distinct ${ventes.id})` },
  nbClientsDistincts: { key: "nbClientsDistincts", label: "Clients distincts", type: "count", expr: sql`count(distinct ${ventes.clientId})` },
  nbProduitsDistincts: { key: "nbProduitsDistincts", label: "Produits distincts", type: "count", expr: sql`count(distinct ${ventesLignes.produitId})` },
} as const;

export const REPORT_RATIOS = {
  tauxMarge: { key: "tauxMarge", label: "Taux de marge", type: "ratio" },
  panierMoyen: { key: "panierMoyen", label: "Panier moyen", type: "currency" },
  tauxRemise: { key: "tauxRemise", label: "Taux de remise", type: "ratio" },
} as const;

export const PERIOD_FORMATS: Record<PeriodeUnite, string> = {
  jour: "YYYY-MM-DD",
  semaine: "YYYY-\"S\"WW",
  mois: "YYYY-MM",
  trimestre: "YYYY-\"T\"Q",
  annee: "YYYY",
};

export type ReportDimensionKey = keyof typeof REPORT_DIMENSIONS;
export type ReportMeasureKey = keyof typeof REPORT_MEASURES;
export type ReportRatioKey = keyof typeof REPORT_RATIOS;
export type PeriodeUnite = "jour" | "semaine" | "mois" | "trimestre" | "annee";

export const OPTION_RESOURCES = [
  "produits",
  "categories",
  "typesProduit",
  "niveaux",
  "classes",
  "filieres",
  "sousSystemes",
  "editeurs",
  "fournisseurs",
  "clients",
  "vendeurs",
  "caisses",
  "agences",
  "modesPaiement",
] as const;
export type OptionResource = (typeof OPTION_RESOURCES)[number];

export const reportFiltersSchema = z.object({
  agences: z.array(z.number().int()).max(200).optional(),
  produits: z.array(z.number().int()).max(1000).optional(),
  codesBarres: z.array(z.string().min(1).max(100)).max(1000).optional(),
  categories: z.array(z.number().int()).max(200).optional(),
  typesProduit: z.array(z.string().min(1).max(50)).max(50).optional(),
  niveaux: z.array(z.string().uuid()).max(200).optional(),
  classes: z.array(z.string().uuid()).max(200).optional(),
  filieres: z.array(z.string().uuid()).max(200).optional(),
  sousSystemes: z.array(z.string().uuid()).max(200).optional(),
  editeurs: z.array(z.string().min(1).max(255)).max(200).optional(),
  fournisseurs: z.array(z.number().int()).max(200).optional(),
  clients: z.array(z.number().int()).max(500).optional(),
  vendeurs: z.array(z.number().int()).max(500).optional(),
  caisses: z.array(z.number().int()).max(200).optional(),
  modesPaiement: z.array(z.string().min(1).max(50)).max(20).optional(),
  dateDebut: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Date invalide").optional(),
  dateFin: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Date invalide").optional(),
});

export const reportInputSchema = z.object({
  dimension: z.enum(Object.keys(REPORT_DIMENSIONS) as [ReportDimensionKey, ...ReportDimensionKey[]]),
  periodeUnite: z.enum(["jour", "semaine", "mois", "trimestre", "annee"]).optional(),
  measures: z.array(z.enum(Object.keys(REPORT_MEASURES) as [ReportMeasureKey, ...ReportMeasureKey[]])).min(1).max(10),
  ratios: z.array(z.enum(Object.keys(REPORT_RATIOS) as [ReportRatioKey, ...ReportRatioKey[]])).max(5).optional(),
  filters: reportFiltersSchema.optional(),
  comparePrevious: z.boolean().default(false),
  sortBy: z.string().max(40).default("measure:ca"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).max(100000).default(0),
}).superRefine((val, ctx) => {
  if (val.dimension === "periode" && !val.periodeUnite) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["periodeUnite"], message: "L'unité de période est requise." });
  }
  if (
    val.filters?.dateDebut &&
    val.filters?.dateFin &&
    Date.parse(val.filters.dateFin) < Date.parse(val.filters.dateDebut)
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["filters", "dateFin"], message: "La date de fin doit être postérieure à la date de début." });
  }
});

export type ReportFilters = z.infer<typeof reportFiltersSchema>;
export type ReportInput = z.infer<typeof reportInputSchema>;
