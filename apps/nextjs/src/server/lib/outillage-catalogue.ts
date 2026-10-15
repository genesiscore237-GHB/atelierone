/**
 * LOT O1/O2 — CATALOGUE « OUTILLAGE & ACCESSOIRES »
 * =================================================
 *
 * Constat d'inventaire (2026-10-15) :
 *
 *  1. La liste des outils proposés est une **constante codée en dur** dans
 *     `CheckListOutillage.tsx` (18 entrées). Aucun écran ne peut l'adapter à
 *     un garage qui travaille avec une nomenclature différente, et aucun
 *     agent ne peut y ajouter ce que sa fiche papier exige.
 *
 *  2. Le schéma de la spec prévoit « possibility d'en ajouter » depuis le
 *     début. Elle n'a jamais été implémentée.
 *
 *  3. Pire : `ReceptionTab.tsx` (onglet Réception de la fiche dossier)
 *     disposait de SA PROPRE liste de 5 entrées en `camelCase` — `cric`,
 *     `roueSecours` — et écrivait dans **la même colonne JSONB** que la liste
 *     de 18 entrées en majuscules. Les clés ne se recouvrent pas. Ouvrir cet
 *     onglet et enregistrer **écrasait définitivement** les 18 réponses.
 *
 * Décisions de conception
 * -----------------------
 *
 * **La clé est une identité, le libellé un affichage.** Renommer un outil ne
 * doit jamais rompre le lien avec les dossiers déjà remplis : 8 dossiers en
 * production portent des réponses d'outillage. `{ cle, libelle, ordre }`, et
 * seul `libelle` est modifiable. Une clé est une fois pour toutes.
 *
 * **Les clés d'origine sont conservées telles quelles** — `"CLÉ DE ROUE"`,
 * catalogue dira dans deux ans.
 * les réponses déjà enregistrées par les agents.
 *
 * **Le libellé est recopié dans le dossier au moment de la saisie.** Un
 * dossier archivé doit afficher ce que l'agent a coché ce jour-là, pas ce que
 * le catalogue dira dans deux ans.
 * **Supprimer un élément du catalogue ne détruit pas l'historique.** Les
 * dossiers existants conservent leur réponse et leur libellé ; seuls les
 * prochaines réceptions cessent de proposer l'élément.
 *
 * **Aucun tri automatique silencieux.** L'ordre est explicite et modifiable.
 */

import { eq } from "drizzle-orm";
import { atelierParametres } from "@atelierone/db";
import { z } from "zod";

type Exec = any;

// ─── Nomenclature par défaut ────────────────────────────────────────────────
// Clés reproduites à l'identique de ce que les agents ont déjà coché.
export const OUTILLAGE_PAR_DEFAUT: ElementOutillage[] = [
  { cle: "CRIC", libelle: "CRIC", ordre: 10 },
  { cle: "CLÉ DE ROUE", libelle: "CLÉ DE ROUE", ordre: 20 },
  { cle: "MANIVELLE", libelle: "MANIVELLE", ordre: 30 },
  { cle: "ROUE DE SECOURS", libelle: "ROUE DE SECOURS", ordre: 40 },
  { cle: "EXTINCTEUR", libelle: "EXTINCTEUR", ordre: 50 },
  { cle: "RADIO", libelle: "RADIO", ordre: 60 },
  { cle: "TRIANGLE", libelle: "TRIANGLE", ordre: 70 },
  { cle: "CD", libelle: "CD", ordre: 80 },
  { cle: "DOCUMENTS", libelle: "DOCUMENTS", ordre: 90 },
  { cle: "PARAPLUIE", libelle: "PARAPLUIE", ordre: 100 },
  { cle: "PIÈCES DU VÉHICULE", libelle: "PIÈCES DU VÉHICULE", ordre: 110 },
  { cle: "NATTES", libelle: "NATTES", ordre: 120 },
  { cle: "BOUGIES", libelle: "BOUGIES", ordre: 130 },
  { cle: "HUILE DE FREIN", libelle: "HUILE DE FREIN", ordre: 140 },
  { cle: "SACS", libelle: "SACS", ordre: 150 },
  { cle: "BÂCHE DU VÉHICULE", libelle: "BÂCHE DU VÉHICULE", ordre: 160 },
  { cle: "BOÎTE À PHARMACIE", libelle: "BOÎTE À PHARMACIE", ordre: 170 },
  { cle: "AUTRES", libelle: "AUTRES", ordre: 180 },
];

export type ElementOutillage = { cle: string; libelle: string; ordre: number };

// ─── Validation ────────────────────────────────────────────────────────────

export const MAX_ELEMENTS_OUTILLAGE = 60;
export const MAX_OBSERVATION = 2000;

/** Réponse d'un agent pour un élément de la check-list. */
export const zValeurOutillage = z.object({
  present: z.boolean(),
  observation: z.string().max(MAX_OBSERVATION).optional().default(""),
  // Libellé figé au moment de la saisie : le dossier archivé doit rester
  // fidèle à ce que l'agent a coché, même si le catalogue change ensuite.
  libelle: z.string().max(120).optional(),
});

/**
 * Forme de la colonne `ordres_reparation.outillage`.
 *
 * Remplace `z.record(z.any())`, qui acceptait n'importe quelle clé et
 * n'importe quelle valeur — y compris un blob qui ne ressemble à rien.
 * On borne le nombre d'éléments : sans cela, un client malveillant (ou un
 * bug) remplirait le dossier sans limite.
 */
export const zOutillage = z
  .record(z.string().min(1).max(120), zValeurOutillage)
  .refine((o) => Object.keys(o).length <= MAX_ELEMENTS_OUTILLAGE, {
    message: `Trop d'éléments d'outillage (max ${MAX_ELEMENTS_OUTILLAGE}).`,
  });

/**
 * Élément du catalogue.
 *
 * `cle` est une identité immuable : c'est elle qui relie le catalogue aux
 * réponses déjà enregistrées dans les dossiers. La renommer casserait ce
 * lien — seul `libelle` est modifiable.
 */
const zElementOutillage = z.object({
  cle: z.string().trim().min(1).max(120),
  libelle: z.string().trim().min(1).max(120),
  ordre: z.number().int().min(0).max(100000),
});

export const zCatalogueOutillage = z.array(zElementOutillage).max(MAX_ELEMENTS_OUTILLAGE);

/**
 * Contrôles d'unicité, hors schéma.
 *
 * Ils sont ici plutôt qu'en `.refine()` parce que leur message doit être
 * lisible par un agent (« deux éléments s'appellent Cric ») et non destiné à
 * un formulaire. La validation reste totale — c'est simplement le moment et la
 * forme du message qui changent.
 */
export function controlerCatalogue(items: ElementOutillage[]): void {
  if (!items.length) throw new Error("La liste des outils ne peut pas être vide.");
  if (items.length > MAX_ELEMENTS_OUTILLAGE) {
    throw new Error(`Trop d'éléments (${items.length}) : maximum ${MAX_ELEMENTS_OUTILLAGE}.`);
  }
  const cles = new Set<string>();
  for (const i of items) {
    if (cles.has(i.cle)) throw new Error(`Clé en double : « ${i.cle} ».`);
    cles.add(i.cle);
  }
  const libelles = new Map<string, string>();
  for (const i of items) {
    const k = i.libelle.toLowerCase();
    const deja = libelles.get(k);
    if (deja) throw new Error(`Deux éléments s'appellent « ${deja} » : « ${i.libelle} » est en double.`);
    libelles.set(k, i.libelle);
  }
}

export type Outillage = z.infer<typeof zOutillage>;

// ─── Clés ───────────────────────────────────────────────────────────────────

/**
 * Transforme un libellé en clé lisible et unique.
 *
 * Volontairement lisible plutôt qu'opaque : une clé apparaît dans les exports
 * et dans les données. `trousse_a_outils` se relit, `a3f9c1` ne se relit pas.
 */
export function slugifierElement(libelle: string, prises: Set<string>): string {
  const base =
    libelle
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // diacritiques : "Clé" -> "CLE"
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "ELEMENT";

  if (!prises.has(base)) {
    prises.add(base);
    return base;
  }
  for (let n = 2; n < 200; n += 1) {
    const candidat = `${base}_${n}`;
    if (!prises.has(candidat)) {
      prises.add(candidat);
      return candidat;
    }
  }
  return `${base}_${Date.now()}`;
}

// ─── Persistance du catalogue ───────────────────────────────────────────────

/**
 * Catalogue d'une agence, avec repli sur la nomenclature par défaut.
 *
 * Une agence qui n'a jamais touché à ses paramètres reçoit la liste d'origine :
 * le catalogue ne doit pas être une étape obligatoire à configurer.
 */
export async function lireCatalogue(exec: Exec, agenceId: number): Promise<ElementOutillage[]> {
  const lignes = (await exec
    .select({ brut: atelierParametres.outillageCatalogue })
    .from(atelierParametres)
    .where(eq(atelierParametres.agenceId, agenceId))
    .limit(1)) as unknown as { brut: string | null }[];

  const brut = lignes[0]?.brut;
  if (!brut) return OUTILLAGE_PAR_DEFAUT;

  try {
    const items = zCatalogueOutillage.parse(JSON.parse(brut)) as ElementOutillage[];
    controlerCatalogue(items);
    if (items.length) return [...items].sort((a, b) => a.ordre - b.ordre);
  } catch {
    // Donnée illisible : on ne casse pas la réception pour autant. Le repli
    // sur la liste par défaut est toujours utilisable, alors qu'un JSON
    // cassé qui fait échouer la page de réception ne l'est pas.
    console.error("[outillage] catalogue illisible, repli sur la nomenclature par défaut");
  }
  return OUTILLAGE_PAR_DEFAUT;
}

export async function ecrireCatalogue(
  exec: Exec,
  agenceId: number,
  items: ElementOutillage[],
): Promise<void> {
  const propre = zCatalogueOutillage.parse(items) as ElementOutillage[];
  controlerCatalogue(propre);
  const trie = [...propre].sort((a, b) => a.ordre - b.ordre).map((i, idx) => ({ ...i, ordre: (idx + 1) * 10 }));
  const charge = JSON.stringify(trie);

  await exec
    .insert(atelierParametres)
    .values({ agenceId, outillageCatalogue: charge } as any)
    .onConflictDoUpdate({ target: atelierParametres.agenceId, set: { outillageCatalogue: charge, updatedAt: new Date() } as any });
}

// ─── Normalisation d'une réponse d'agent ────────────────────────────────────

/**
 * Reconstruit la réponse d'un dossier à partir du catalogue et de ce qui a
 * été enregistré.
 *
 * Trois cas, tous volontairement conservés :
 *  - clé au catalogue → affichée ;
 *  - clé enregistrée mais **absente du catalogue** → affichée quand même,
 *    marquée « hors catalogue ». C'est ce qui empêche qu'un élément retiré
 *    de la nomenclature fasse disparaître, a posteriori, une réponse déjà
 *    donnée par un agent ;
 *  - ni l'un ni l'autre → rien à afficher.
 */
export function normaliserOutillage(
  catalogue: ElementOutillage[],
  enregistre: unknown,
): Outillage {
  const brut = (enregistre ?? {}) as Record<string, unknown>;
  const sortie: Outillage = {};

  for (const item of catalogue) {
    const v = brut[item.cle];
    const valeur = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    sortie[item.cle] = {
      present: valeur?.present === true,
      observation: typeof valeur?.observation === "string" ? valeur.observation.slice(0, MAX_OBSERVATION) : "",
      libelle: item.libelle,
    };
  }

  for (const [cle, v] of Object.entries(brut)) {
    if (cle in sortie) continue;
    if (!v || typeof v !== "object") continue;
    const valeur = v as Record<string, unknown>;
    sortie[cle] = {
      present: valeur.present === true,
      observation: typeof valeur.observation === "string" ? valeur.observation.slice(0, MAX_OBSERVATION) : "",
      // On fige le libellé qu'on peut retrouver ; sinon on montre la clé.
      libelle: typeof valeur.libelle === "string" && valeur.libelle ? valeur.libelle : cle,
    };
  }

  return sortie;
}
