/**
 * LOT O1/O2 — CATALOGUE « OUTILLAGE & ACCESSOIRES », ACCÈS BASE
 * ==============================================================
 *
 * ⚠️ CE MODULE EST CÔTÉ SERVEUR UNIQUEMENT.
 *
 * Il touche `atelier_parametres` et donc `@atelierone/db`, qui tire
 * `postgres` — et donc `net`, `tls`, `fs`, `perf_hooks`. L'importer depuis un
 * composant client fait échouer le build Vercel sur
 * `Module not found: Can't resolve 'net'`, alors que `tsc` passe sans rien
 * signaler : le compilateur ne connaît pas la frontière client/serveur.
 *
 * Tout ce qui est PUR — nomenclature par défaut, types, schémas Zod,
 * slugification — vit dans `~/lib/outillage`, importable par les deux côtés.
 * Une seule implémentation, sinon le client produit une clé que le serveur
 * refuse.
 *
 * Décisions de conception
 * -----------------------
 *
 * **La clé est une identité, le libellé un affichage.** Renommer un outil ne
 * doit jamais rompre le lien avec les dossiers déjà remplis : 8 dossiers en
 * production portent des réponses d'outillage. `{ cle, libelle, ordre }`, et
 * seul `libelle` est modifiable.
 *
 * **Les clés d'origine sont conservées telles quelles** — `"CLÉ DE ROUE"`,
 * accents et espaces compris. Les normaliser en slug aurait rendu orphelines
 * les réponses déjà enregistrées par les agents.
 *
 * **Le libellé est recopié dans le dossier au moment de la saisie.** Un
 * dossier archivé doit afficher ce que l'agent a coché ce jour-là, pas ce que
 * le catalogue dira dans deux ans.
 *
 * **Supprimer un élément du catalogue ne détruit pas l'historique.**
 */

import { eq, sql } from "drizzle-orm";
import { atelierParametres } from "@atelierone/db";
import {
  OUTILLAGE_PAR_DEFAUT,
  controlerCatalogue,
  zCatalogueOutillage,
  type ElementOutillage,
  type Outillage,
} from "~/lib/outillage";
type Exec = any;

// Ré-export : le serveur et ses tests importent tout depuis ici.
export * from "~/lib/outillage";

/** Code PostgreSQL renvoyé lorsqu'une colonne n'existe pas. */
export const CODE_COLONNE_ABSENTE = "42703";

export type SourceCatalogue = "agence" | "defaut" | "indisponible";

/**
 * Le nom de la colonne existe-t-il ? Déduit UNE FOIS par processus.
 *
 * Pourquoi ne pas simplement attraper l'erreur de lecture : parce qu'un échec
 * **à l'intérieur d'une transaction PostgreSQL l'empoisonne**. Toutes les
 * requêtes suivantes échouent avec « current transaction is aborted », et la
 * réception entière est annulée — pour une liste de libellés facultative.
 *
 * C'est le comportement observé : `lireCatalogue` rendait bien la main avec
 * la nomenclature par défaut, puis l'enregistrement du dossier échouait quand
 * même. Détecter AVANT d'interroger la base est donc obligatoire ; un `catch`
 * ne suffit pas.
 *
 * `information_schema` existe quelle que soit la version du schéma : cette
 * requête-là ne peut pas échouer.
 */
let colonnePresente: boolean | null = null;

export async function colonneCatalogueDisponible(exec: Exec): Promise<boolean> {
  if (colonnePresente !== null) return colonnePresente;
  try {
    const r = (await exec.execute(sql`
      SELECT count(*)::int AS n
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'atelier_parametres'
        AND column_name = 'outillage_catalogue'`)) as unknown as { n: number }[];
    colonnePresente = Number(r[0]?.n ?? 0) > 0;
  } catch {
    colonnePresente = false;
  }
  if (!colonnePresente) {
    console.error(
      "[outillage] atelier_parametres.outillage_catalogue ABSENTE — migration 0008 non appliquée. Nomenclature par défaut utilisée.",
    );
  }
  return colonnePresente;
}

/** Remet le cache à zéro (tests : une base peut changer d'état en cours de run). */
export function oublierColonneCatalogue(): void {
  colonnePresente = null;
}

/**
 * Catalogue d'une agence, avec repli sur la nomenclature par défaut.
 *
 * Une agence qui n'a jamais touché à ses paramètres reçoit la liste d'origine :
 * configurer le catalogue ne doit pas être une étape obligatoire à l'usage.
 */
export async function lireCatalogue(
  exec: Exec,
  agenceId: number,
): Promise<{ items: ElementOutillage[]; source: SourceCatalogue }> {
  if (!(await colonneCatalogueDisponible(exec))) {
    return { items: OUTILLAGE_PAR_DEFAUT, source: "indisponible" };
  }

  try {
    const lignes = (await exec
      .select({ brut: atelierParametres.outillageCatalogue })
      .from(atelierParametres)
      .where(eq(atelierParametres.agenceId, agenceId))
      .limit(1)) as unknown as { brut: string | null }[];

    const brut = lignes[0]?.brut;
    if (!brut) return { items: OUTILLAGE_PAR_DEFAUT, source: "defaut" };

    const items = zCatalogueOutillage.parse(JSON.parse(brut)) as ElementOutillage[];
    controlerCatalogue(items);
    if (items.length) return { items: [...items].sort((a, b) => a.ordre - b.ordre), source: "agence" };
  } catch {
    // Donnée illisible : on ne casse pas la réception pour autant. Le repli
    // sur la liste par défaut est toujours utilisable, alors qu'un JSON
    // cassé qui fait échouer la page de réception ne l'est pas.
    console.error("[outillage] catalogue illisible, repli sur la nomenclature par défaut");
  }
  return { items: OUTILLAGE_PAR_DEFAUT, source: "defaut" };
}

export async function ecrireCatalogue(
  exec: Exec,
  agenceId: number,
  items: ElementOutillage[],
): Promise<void> {
  const propre = zCatalogueOutillage.parse(items) as ElementOutillage[];
  controlerCatalogue(propre);
  const trie = [...propre]
    .sort((a, b) => a.ordre - b.ordre)
    .map((i, idx) => ({ ...i, ordre: (idx + 1) * 10 }));
  const charge = JSON.stringify(trie);

  await exec
    .insert(atelierParametres)
    .values({ agenceId, outillageCatalogue: charge } as any)
    .onConflictDoUpdate({
      target: atelierParametres.agenceId,
      set: { outillageCatalogue: charge, updatedAt: new Date() } as any,
    });
}

/**
 * Reconstruit la réponse d'un dossier à partir du catalogue et de ce qui a
 * été enregistré.
 *
 * Trois cas, tous volontairement conservés :
 *  - clé au catalogue → affichée ;
 *  - clé enregistrée mais **absente du catalogue** → affichée quand même.
 *    C'est ce qui empêche qu'un élément retiré de la nomenclature fasse
 *    disparaître, a posteriori, une réponse déjà donnée par un agent ;
 *  - ni l'un ni l'autre → rien à afficher.
 */
export function normaliserOutillage(catalogue: ElementOutillage[], enregistre: unknown): Outillage {
  const brut = (enregistre ?? {}) as Record<string, unknown>;
  const sortie: Outillage = {};

  for (const item of catalogue) {
    const v = brut[item.cle];
    const valeur = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    sortie[item.cle] = {
      present: valeur?.present === true,
      observation: typeof valeur?.observation === "string" ? valeur.observation.slice(0, 2000) : "",
      libelle: item.libelle,
    };
  }

  for (const [cle, v] of Object.entries(brut)) {
    if (cle in sortie) continue;
    if (!v || typeof v !== "object") continue;
    const valeur = v as Record<string, unknown>;
    sortie[cle] = {
      present: valeur.present === true,
      observation: typeof valeur.observation === "string" ? valeur.observation.slice(0, 2000) : "",
      // On fige le libellé qu'on peut retrouver ; sinon on montre la clé.
      libelle: typeof valeur.libelle === "string" && valeur.libelle ? valeur.libelle : cle,
    };
  }

  return sortie;
}
