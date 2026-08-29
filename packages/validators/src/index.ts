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
