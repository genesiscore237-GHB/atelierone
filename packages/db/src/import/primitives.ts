import { z } from "zod";

/**
 * Primitives partagées par tous les formats d'import.
 * Le système IMPOSE ces conventions : toute donnée fournie en dehors de ces règles est rejetée.
 */

/** Montant monétaire : chaîne décimale sans séparateurs de milliers, point décimal. */
export const montant = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Montant invalide : entier ou décimal avec point (ex. \"10000\" ou \"99.5\"), sans séparateurs ni symboles")
  .refine((v) => Number(v) > 0, "Montant doit être strictement positif");

/** Montant optionnel (null/absent/vide acceptés, → null). */
export const montantOptionnel = z
  .union([z.string().trim(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return null;
    const s = typeof v === "number" ? String(v) : v;
    if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Montant invalide : ex. \"10000\" ou \"99.5\"");
    return s;
  });

/** Code stable : majuscules, chiffres, tirets (ex. MAN-SCO-PRI). */
export const code = z
  .string()
  .trim()
  .min(1, "Code requis")
  .max(50, "Code trop long (max 50)")
  .regex(/^[A-Z0-9][A-Z0-9_.-]*$/, "Code invalide : lettres majuscules, chiffres, tirets, points, underscores");

/** Texte libre non vide. */
export const texteRequis = z.string().trim().min(1, "Champ requis");

/** Texte optionnel : absent/vide → null. */
export const texteOptionnel = z
  .union([z.string().trim(), z.null(), z.undefined()])
  .transform((v) => (v === "" || v == null ? null : v));

/** Texte optionnel avec longueur max : absent/vide → null. */
export function texteOptionnelMax(max: number) {
  return z
    .union([z.string().trim().max(max, `Texte trop long (max ${max})`), z.null(), z.undefined()])
    .transform((v) => (v === "" || v == null ? null : v));
}

/** Booléen acceptant 1/0/true/false/oui/non. */
export const booleen = z
  .union([z.boolean(), z.string(), z.number(), z.null(), z.undefined()])
  .transform((v): boolean | null => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    const s = String(v).trim().toLowerCase();
    if (["1", "true", "oui", "o", "yes", "y", "actif"].includes(s)) return true;
    if (["0", "false", "non", "n", "no", "inactif"].includes(s)) return false;
    throw new Error(`Booléen invalide : "${v}" (accepté : true/false, 1/0, oui/non)`);
  })
  .nullable();

/** Entier optionnel : absent/vide → null. */
export const entierOptionnel = z
  .union([z.string().trim(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error("Entier invalide (positif ou nul)");
    return n;
  })
  .nullable();

/** Date ISO YYYY-MM-DD (absente ou vide → null). */
export const dateOptionnelle = z
  .union([z.string().trim(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`Date invalide : "${v}" (format attendu YYYY-MM-DD)`);
    return v;
  })
  .nullable();

/** Identifiant source libre (pour traçabilité/audit, jamais imposé). */
export const refSource = texteOptionnel;

/** Slug de nom → code pour les entités sans code stable fourni. */
export function slugifierCode(nom: string, suffixe = ""): string {
  const base = nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  const code = base || "X";
  return suffixe ? `${code}-${suffixe}` : code;
}
