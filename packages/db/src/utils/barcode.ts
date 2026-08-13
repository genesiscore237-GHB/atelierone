import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import { produits, codesBarres } from "../schema";

// ─────────────────────────────────────────────────────────────────────────────
// Politique de génération des références produits (SKU / code-barres internes)
//
// - Format : `AO-{CODE_AGENCE}-{séquence 5 chiffres}`, ex. "AO-YDE-00001".
//   Le préfixe est construit par l'appelant (create/update du catalogue) à
//   partir du code de l'agence de l'utilisateur : `AO-${agence.code}`.
// - La séquence est une séquence Postgres dédiée par agence
//   (`seq_lip_<agence>_barcode`), incrémentée de 1 à chaque génération. Elle
//   n'est jamais réutilisée et ne code ni le type (MANUEL/FOURNITURE) ni la
//   catégorie : seuls l'agence et l'ordre de création sont encodés.
// - Si l'utilisateur saisit un code-barres (EAN-13/EAN-8/ISBN/interne), il est
//   utilisé tel quel ; la génération automatique ne s'applique qu'aux produits
//   sans code saisi.
// - Le SKU généré est également enregistré dans `codes_barres`
//   (type "SYSTEME", est_defaut = true) et reporté dans `produits.code_barre`.
// ─────────────────────────────────────────────────────────────────────────────

// Le préfixe peut contenir des tirets (ex: "AO-YDE") : ils sont invalides dans
// un identifiant SQL de séquence → on les normalise en "_" (les deux fonctions
// doivent générer le même nom).
function seqNameFor(prefix: string): string {
  return `seq_${prefix.toLowerCase().replace(/[^a-z0-9]/g, "_")}_barcode`;
}

export async function generateBarcode(prefix = "LIP"): Promise<string> {
  const seqName = seqNameFor(prefix);
  const result = await db.execute(
    sql`SELECT nextval(${seqName}::regclass) AS seq`
  );
  // postgres.js renvoie les lignes directement ; node-postgres les enveloppe
  // dans { rows: [...] } → on gère les deux formes.
  const rows = (result as any).rows ?? (result as any[]);
  const seq = Number(rows[0]?.seq);
  if (!Number.isFinite(seq)) {
    throw new Error(`generateBarcode: séquence "${seqName}" introuvable ou vide`);
  }
  return `${prefix}-${String(seq).padStart(5, "0")}`;
}

export async function ensureBarcodeSequence(prefix = "LIP"): Promise<void> {
  const seqName = seqNameFor(prefix);
  await db.execute(
    sql`
      CREATE SEQUENCE IF NOT EXISTS ${sql.raw(seqName)}
      START WITH 1 INCREMENT BY 1
    `
  );
}

export async function autoGenerateBarcode(
  produitId: string,
  prefix = "LIP"
): Promise<string> {
  const valeur = await generateBarcode(prefix);
  await db.insert(codesBarres).values({
    produitId: Number(produitId),
    type: "SYSTEME",
    valeur,
    estDefaut: true,
  } as any);
  await db
    .update(produits)
    .set({ codeBarre: valeur })
    .where(eq(produits.id, Number(produitId)));
  return valeur;
}
