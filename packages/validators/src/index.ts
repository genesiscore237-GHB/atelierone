import { z } from "zod";

export const emailSchema = z.string().email("Email invalide").min(1, "Email requis").max(255);

export const passwordSchema = z.string().min(6, "Minimum 6 caractères").max(100);

export const passwordPolicySchema = z
  .string()
  .min(8, "Minimum 8 caractères")
  .max(100)
  .regex(/[A-Z]/, "Doit contenir une majuscule")
  .regex(/[a-z]/, "Doit contenir une minuscule")
  .regex(/[0-9]/, "Doit contenir un chiffre");

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  totp: z.string().optional(),
});

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  nom: z.string().min(1, "Nom requis").max(255),
  prenom: z.string().max(255).optional(),
  telephone: z.string().max(50).optional(),
  agenceId: z.string(),
  roleId: z.string(),
});

export const inviteUserSchema = z.object({
  nom: z.string().min(1, "Nom requis").max(255),
  prenom: z.string().max(255).optional(),
  email: emailSchema,
  telephone: z.string().max(50).optional(),
  roleId: z.string().min(1, "Rôle requis"),
});

export const setupPasswordSchema = z.object({
  token: z.string().min(1, "Token requis"),
  email: emailSchema,
  password: passwordPolicySchema,
});

export const checkEmailSchema = z.object({
  email: emailSchema,
  token: z.string().min(1, "Token requis"),
});

export const updateUserSchema = createUserSchema.partial().omit({ password: true }).extend({
  password: passwordSchema.optional(),
});

const productBaseSchema = z.object({
  codeBarre: z.string().max(100).optional(),
  titre: z.string().min(1, "Titre requis").max(500),
  etat: z.enum(["neuf", "occasion", "vieux"]).default("neuf"),
  description: z.string().optional(),
  categorieId: z.number().positive().optional(),
  fournisseurId: z.number().positive().optional(),
  prixVente: z.number().positive("Prix de vente requis"),
  prixAchat: z.number().positive().optional(),
  tva: z.number().min(0).max(100).default(0),
  seuilAlerte: z.number().int().min(0).default(5),
  statut: z.enum(["actif", "archive", "rupture", "a_commander", "bloque"]).default("actif"),
  uniteVente: z.enum(["unite", "pack", "carton", "douzaine"]).default("unite"),
  uniteAchat: z.enum(["unite", "pack", "carton", "douzaine"]).default("unite"),
});

export const createProductSchema = productBaseSchema.refine(
  (data) => data.prixAchat === undefined || data.prixVente >= data.prixAchat,
  { message: "Le prix de vente doit être supérieur ou égal au prix d'achat", path: ["prixVente"] },
);

export const updateProductSchema = productBaseSchema.partial().refine(
  (data) => data.prixVente === undefined || data.prixAchat === undefined || data.prixVente >= data.prixAchat,
  { message: "Le prix de vente doit être supérieur ou égal au prix d'achat", path: ["prixVente"] },
);

export const codeBarreTypes = ["EAN13", "EAN8", "ISBN", "QR", "FOURNISSEUR", "SYSTEME"] as const;

export const addCodeBarreSchema = z.object({
  produitId: z.number().positive(),
  type: z.enum(codeBarreTypes),
  valeur: z.string().min(1).max(100),
  estDefaut: z.boolean().default(false),
});

export const createVenteSchema = z.object({
  clientId: z.number().positive().optional(),
  modePaiement: z.enum(["especes", "mobile-money", "carte", "transfert"]),
  lignes: z.array(z.object({
    produitId: z.number().positive(),
    quantite: z.number().int().positive(),
    prixUnitaire: z.number().positive(),
  })).min(1, "Au moins un produit requis"),
});

export const createAchatSchema = z.object({
  fournisseurId: z.number().positive(),
  lignes: z.array(z.object({
    produitId: z.number().positive(),
    quantite: z.number().int().positive(),
    prixUnitaire: z.number().positive(),
  })).min(1),
  notes: z.string().optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
});

export const searchSchema = paginationSchema.extend({
  query: z.string().optional(),
});

// ─── Catalogue universel (P0) : ontologie des attributs ───

/**
 * Les types d'attribut canoniques (catalogue universel P2).
 * BOOLEAN = alias legacy → BOOLEEN à l'écriture.
 * Extensions « moteur universel » : INTEGER, DECIMAL (NOMBRE couvre déjà le numérique),
 * LONG_TEXT, DATETIME, UNIT_VALUE (valeur + unité), RANGE (min;max), VEHICLE_REFERENCE.
 */
export const TYPE_ATTRIBUTS = [
  "TEXTE",
  "LONG_TEXT",
  "NOMBRE",
  "INTEGER",
  "DECIMAL",
  "BOOLEEN",
  "ENUM",
  "MULTI_ENUM",
  "DATE",
  "DATETIME",
  "DUREE",
  "POURCENTAGE",
  "MONTANT",
  "UNIT_VALUE",
  "RANGE",
  "REFERENCE",
  "VEHICLE_REFERENCE",
  "CODE",
  "LIEN",
  "COULEUR",
] as const;
export type TypeAttribut = (typeof TYPE_ATTRIBUTS)[number];

export const typeAttributsSchema = z.enum(TYPE_ATTRIBUTS);
export const typeAttributsSchemaLegacy = z.union([typeAttributsSchema, z.literal("BOOLEAN")]);

/** Normalise un type vers le canonique (BOOLEAN → BOOLEEN). */
export function normalizeTypeAttribut(t: string): TypeAttribut {
  return (TYPE_ATTRIBUTS as readonly string[]).includes(t) ? (t as TypeAttribut) : t === "BOOLEAN" ? "BOOLEEN" : "TEXTE";
}

/** Métadonnées d'affichage / rendu pour chaque type (utilisé par l'UI adaptative P2). */
export const TYPE_ATTRIBUT_INFO: Record<TypeAttribut, { libelle: string; renderer: string; famille: string }> = {
  TEXTE: { libelle: "Texte libre", renderer: "text", famille: "texte" },
  LONG_TEXT: { libelle: "Texte long", renderer: "textarea", famille: "texte" },
  NOMBRE: { libelle: "Nombre (décimal)", renderer: "number", famille: "nombre" },
  INTEGER: { libelle: "Nombre entier", renderer: "number", famille: "nombre" },
  DECIMAL: { libelle: "Décimal (précision)", renderer: "number", famille: "nombre" },
  BOOLEEN: { libelle: "Oui / Non", renderer: "switch", famille: "booleen" },
  ENUM: { libelle: "Liste à choix unique", renderer: "select", famille: "enum" },
  MULTI_ENUM: { libelle: "Liste à choix multiples", renderer: "multi-select", famille: "enum" },
  DATE: { libelle: "Date", renderer: "date", famille: "date" },
  DATETIME: { libelle: "Date et heure", renderer: "datetime", famille: "date" },
  DUREE: { libelle: "Durée", renderer: "duration", famille: "nombre" },
  POURCENTAGE: { libelle: "Pourcentage", renderer: "percent", famille: "nombre" },
  MONTANT: { libelle: "Montant", renderer: "money", famille: "nombre" },
  UNIT_VALUE: { libelle: "Valeur + unité", renderer: "unit-value", famille: "nombre" },
  RANGE: { libelle: "Intervalle (min;max)", renderer: "range", famille: "nombre" },
  REFERENCE: { libelle: "Référence", renderer: "reference", famille: "texte" },
  VEHICLE_REFERENCE: { libelle: "Référence véhicule", renderer: "reference", famille: "texte" },
  CODE: { libelle: "Code", renderer: "code", famille: "texte" },
  LIEN: { libelle: "Lien / URL", renderer: "url", famille: "texte" },
  COULEUR: { libelle: "Couleur", renderer: "color", famille: "texte" },
};

export const PROVENANCES = [
  "MANUELLE",
  "CATALOGUE_FABRICANT",
  "CATALOGUE_FOURNISSEUR",
  "IMPORT_BULK",
  "MESURE",
  "DOCUMENTATION",
  "API",
  "SYSTEME",
  "AUTRE",
] as const;
export const provenanceSchema = z.enum(PROVENANCES);

export const STATUTS_VALEUR = ["RENSEIGNE", "INCONNU", "N_A"] as const;
export const statutValeurSchema = z.enum(STATUTS_VALEUR);

export const NIVEAUX_CONFIANCE = ["OFFICIEL", "HOMOLOGUE", "TECHNIQUE", "COMMERCIAL", "MANUELLE"] as const;
export const niveauConfianceSchema = z.enum(NIVEAUX_CONFIANCE);

export const PORTERS_ATTRIBUT = ["ARTICLE", "VARIANTE", "EXEMPLAIRE", "POSITION", "VEHICULE", "LOT", "FOURNISSEUR"] as const;
export const porteeAttributSchema = z.enum(PORTERS_ATTRIBUT);

export const NIVEAUX_ONTOLOGIE = ["FAMILLE", "CATEGORIE", "SOUS", "TYPE"] as const;
export const niveauOntologieSchema = z.enum(NIVEAUX_ONTOLOGIE);

export const idParamSchema = z.object({
  id: z.coerce.number().positive(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type AddCodeBarreInput = z.infer<typeof addCodeBarreSchema>;
export type CreateVenteInput = z.infer<typeof createVenteSchema>;
export type CreateAchatInput = z.infer<typeof createAchatSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
