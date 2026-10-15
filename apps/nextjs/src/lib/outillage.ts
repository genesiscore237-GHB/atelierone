/**
 * LOT O1/O2 — CATALOGUE « OUTILLAGE & ACCESSOIRES », PARTIE PURE
 * =============================================================
 *
 * ⚠️ CE MODULE EST IMPORTÉ PAR DES COMPOSANTS CLIENT.
 *
 * Il ne doit importer NI la base, NI quoi que ce soit de serveur. C'est la
 * raison pour laquelle il est dans `src/lib` et non dans `src/server/lib` :
 *
 *   - `outillage-catalogue.ts` (serveur) lit `atelier_parametres` ;
 *   - or ce catalogue a besoin d'une valeur de repli côté client, pour que
 *     l'écran affiche quelque chose avant la réponse réseau.
 *
 * Résoudre ça en important le module serveur depuis le composant produit un
 * `Module not found: Can't resolve 'net'` au BUILD Vercel : le bundle client
 * embarque `postgres`, qui utilise `net`, `tls`, `fs` et `perf_hooks`. Le
 * `tsc` passe — il ne connaît pas la frontière client/serveur — seul
 * `next build` la voit.
 *
 * Même règle que `atelier-service.ts`, qui est importé par une dizaine de
 * composants client : **pur = importable par le client**.
 */

import { z } from "zod";

// ─── Nomenclature par défaut ────────────────────────────────────────────────
// Clés reproduites à l'identique de ce que les agents ont déjà coché.
// 8 dossiers de production portent des réponses d'outillage : normaliser
// ces clés en slug les aurait rendus orphelins.

export type ElementOutillage = { cle: string; libelle: string; ordre: number };

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

export const MAX_ELEMENTS_OUTILLAGE = 60;
export const MAX_OBSERVATION = 2000;

// ─── Validation ────────────────────────────────────────────────────────────

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
 */
export const zOutillage = z
  .record(z.string().min(1).max(120), zValeurOutillage)
  .refine((o) => Object.keys(o).length <= MAX_ELEMENTS_OUTILLAGE, {
    message: `Trop d'éléments d'outillage (max ${MAX_ELEMENTS_OUTILLAGE}).`,
  });

/**
 * Élément du catalogue.
 *
 * `cle` est une identité IMMUABLE : c'est elle qui relie le catalogue aux
 * réponses déjà enregistrées dans les dossiers. La renommer casserait ce
 * lien — seul `libelle` est modifiable.
 */
export const zElementOutillage = z.object({
  cle: z.string().trim().min(1).max(120),
  libelle: z.string().trim().min(1).max(120),
  ordre: z.number().int().min(0).max(100000),
});

export const zCatalogueOutillage = z.array(zElementOutillage).max(MAX_ELEMENTS_OUTILLAGE);

export type Outillage = z.infer<typeof zOutillage>;

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

// ─── Clés ───────────────────────────────────────────────────────────────────

/**
 * Transforme un libellé en clé lisible et unique.
 *
 * Volontairement lisible plutôt qu'opaque : une clé apparaît dans les exports
 * et dans les données. `TROUSSE_A_OUTILS` se relit, `a3f9c1` non.
 *
 * Utilisé côté client (ajout d'un élément dans l'UI) ET côté serveur
 * (validation) : une seule implémentation, sinon les deux finissent par
 * diverger et le serveur refuse ce que l'interface a produit.
 */
export function slugifierElement(libelle: string, prises: Set<string>): string {
  const base =
    libelle
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // diacritiques : "Cle" -> "CLE"
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
