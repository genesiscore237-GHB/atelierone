import { sql } from "drizzle-orm";
import { and, eq, or } from "drizzle-orm";
import { db, produits } from "@atelierone/db";

/**
 * RECHERCHE D'ARTICLES — partagée par le recensement et la réception.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SERVICE ET PAS DEUX COPIES
 *
 * Le recensement (M1) et la réception (M3) font la même chose : chercher un
 * article, et prévenir avant de créer un doublon. Dupliquer ce code ferait
 * exactement ce que ce chantier combat — deux listes de mots vides, deux
 * scores de similarité, qui divergent au premier correctif. Le modèle a déjà
 * souffert de cette maladie : `stockDisponible` existait en deux versions, et
 * celle qui manquait le terme « bloqué » était celle utilisée par la garde de
 * disponibilité.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RECHERCHE TOLÉRANTE, PAS RECHERCHE PHRASE
 *
 * `ILIKE '%Filtre a huile 15W40%'` ne trouve pas « Filtre huile 15W40
 * Castrol » : le « a » de la saisie casse le mot. Or un magasinier ne tape
 * pas une désignation exacte — il tape ce dont il se souvient, et la fiche
 * catalogue a été saisie par quelqu'un d'autre, six mois plus tôt, dans
 * d'autres termes.
 *
 * On décompose donc la saisie en mots significatifs et on retient ce qui
 * contient AU MOINS UN de ces mots — puis on classe en tête ce qui en
 * contient le plus. Un article qui contient les quatre mots passe devant
 * celui qui n'en contient qu'un.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GARDE-FOU ANTI-DOUBLON SUGGÈRE, IL NE TRANCHE JAMAIS
 *
 * Deux pièces peuvent porter la même désignation et être incompatibles. Le
 * score est une invitation à regarder ; fusionner deux articles sur
 * similarité textuelle destroys the catalog.
 */

/** Mots VIDES FRANÇAIS — ceux qu'un magasinier tape par réflexe. */
const MOTS_VIDES = new Set([
  "a", "au", "aux", "de", "du", "des", "le", "la", "les", "un", "une", "et",
  "ou", "d", "l", "pour", "par", "en", "the", "of",
]);

/** Minuscules, sans accent, sans ponctuation : pour comparer des désignations. */
export function normaliser(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Décompose une saisie en mots qui portent du sens. */
export function motsSignificatifs(q: string): string[] {
  return normaliser(q)
    .split(" ")
    .filter((m) => m.length > 1 && !MOTS_VIDES.has(m));
}

/**
 * Combien de mots de la saisie cette fiche contient — c'est le CLASSEMENT.
 *
 * On ne peut pas se contenter de « la requête contient-il ce mot » : quatre
 * résultats qui contiennent tous « filtre » se distinguent par le nombre de
 * mots qu'ils partagent avec la saisie.
 *
 * Le `s` final est toléré parce qu'un magasinier écrit « filtre » et que la
 * fiche porte « filtres ».
 */
function pertinence(mots: string[], titreNormalise: string): number {
  if (!mots.length) return 0;
  const set = new Set(titreNormalise.split(" ").filter(Boolean));
  let found = 0;
  for (const m of mots) if (set.has(m) || set.has(m.replace(/s$/, ""))) found++;
  return found / mots.length;
}

/**
 * Similarité Jaccard sur les mots — explicable et stable.
 *
 * « Filtre a huile 15w40 » vs « Filtre huile 15W40 Castrol » : les mots
 * communs sont filtre, huile, 15w40 ; l'union vaut 5. Score 0,6 → signalé.
 *
 * Un score opaque (distance d'édition, tolérance aux fautes) serait aussi
 * difficile à contester qu'à accepter devant un magasinier qui connaît sa
 * pièce. Le score est une invitation à regarder, pas une décision.
 */
export function similarite(a: string, b: string): number {
  const motsA = new Set(normaliser(a).split(" ").filter(Boolean));
  const motsB = new Set(normaliser(b).split(" ").filter(Boolean));
  if (!motsA.size || !motsB.size) return 0;
  let communs = 0;
  for (const m of motsA) if (motsB.has(m)) communs++;
  return communs / (motsA.size + motsB.size - communs);
}

export type ArticleTrouve = {
  id: number;
  titre: string;
  codeBarre: string;
  codeArticle: string | null;
  referenceFabricant: string | null;
  typeProduit: string;
  categorieId: number | null;
  uniteBaseId: string | null;
  seuilAlerte: number | null;
  prixAchat: string | null;
  dlcJours: number | null;
  quantiteStock: number;
  disponibleStock: number;
  nbLignesStock: number;
  nbEmplacements: number;
  /** Un article dont le stock est réparti : le lieu compte. */
  estReparti: boolean;
  pertinence: number;
};

export type DoublonPossible = {
  id: number;
  titre: string;
  codeArticle: string | null;
  codeBarre: string | null;
  /** 0-100. Présenté comme une indication, pas comme une vérité. */
  score: number;
};

/**
 * RECHERCHE + GARDE-FOU ANTI-DOUBLON.
 *
 * Le stock est lu dans la VUE `stock_agregat`, jamais ligne à ligne : un
 * article sur trois emplacements doit afficher la somme, pas une ligne tirée
 * au hasard. C'est la règle du cadrage § 6.3 appliquée ici.
 */
export async function rechercherArticles(
  agenceId: number,
  query: string,
  limit = 12,
): Promise<{ resultats: ArticleTrouve[]; doublonsPossibles: DoublonPossible[] }> {
  const q = query.trim();
  if (!q) return { resultats: [], doublonsPossibles: [] };

  const mots = motsSignificatifs(q);
  // Un seul mot (un code-barres, une référence) : recherche exacte, qui doit
  // rester capable de trouver un article par son code.
  if (!mots.length) mots.push(q.toLowerCase());

  const colonnes = [
    produits.titre,
    produits.codeBarre,
    produits.codeArticle,
    produits.referenceFabricant,
    produits.nomCode,
    produits.marque,
  ];
  const motifs: ReturnType<typeof sql>[] = [];
  for (const m of mots) {
    for (const colonne of colonnes) motifs.push(sql`${colonne} ILIKE ${`%${m}%`}`);
  }

  const rows = await db
    .select({
      id: produits.id,
      titre: produits.titre,
      codeBarre: produits.codeBarre,
      codeArticle: produits.codeArticle,
      referenceFabricant: produits.referenceFabricant,
      typeProduit: produits.typeProduit,
      categorieId: produits.categorieId,
      uniteBaseId: produits.uniteBaseId,
      seuilAlerte: produits.seuilAlerte,
      prixAchat: produits.prixAchat,
      dlcJours: produits.dlcJours,
    })
    .from(produits)
    .where(and(eq(produits.isActive, true), or(...motifs)))
    .limit(limit * 3);

  const stockParProduit = rows.length
    ? ((await db.execute(sql`
          SELECT produit_id, quantite, disponible, nb_lignes, nb_emplacements
            FROM stock_agregat
           WHERE agence_id = ${agenceId}
             AND produit_id IN (${sql.join(rows.map((r) => r.id), sql`, `)})
         `)) as unknown as {
        produit_id: number;
        quantite: string;
        disponible: string;
        nb_lignes: number;
        nb_emplacements: number;
      }[])
    : [];
  const indexStock = new Map(stockParProduit.map((s) => [s.produit_id, s]));

  const resultats: ArticleTrouve[] = rows
    .map((r) => {
      const s = indexStock.get(r.id);
      return {
        ...r,
        quantiteStock: s ? Number(s.quantite) : 0,
        disponibleStock: s ? Number(s.disponible) : 0,
        nbLignesStock: s?.nb_lignes ?? 0,
        nbEmplacements: s?.nb_emplacements ?? 0,
        estReparti: (s?.nb_emplacements ?? 0) > 1,
        pertinence: pertinence(mots, normaliser(r.titre)),
      };
    })
    .sort((a, b) => b.pertinence - a.pertinence)
    .slice(0, limit);

  // Similarité textuelle sur les articles qui portent les mêmes mots.
  const candidats = await db
    .select({
      id: produits.id,
      titre: produits.titre,
      codeArticle: produits.codeArticle,
      codeBarre: produits.codeBarre,
    })
    .from(produits)
    .where(and(eq(produits.isActive, true), sql`${produits.titre} ILIKE ${`%${mots[0]}%`}`))
    .limit(40);

  const base = normaliser(q);
  const doublonsPossibles: DoublonPossible[] = candidats
    .map((p) => ({ ...p, score: similarite(base, normaliser(p.titre)) }))
    .filter((p) => p.score >= 0.5 && !resultats.some((e) => e.id === p.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((p) => ({ ...p, score: Math.round(p.score * 100) }));

  return { resultats, doublonsPossibles };
}

/**
 * Articles d'une liste d'identifiants, avec leur stock — pour rafraîchir une
 * ligne déjà saisie sans refaire une recherche.
 */
export async function articlesParIds(agenceId: number, ids: number[]) {
  if (!ids.length) return new Map<number, ArticleTrouve>();
  const rows = await db
    .select({
      id: produits.id,
      titre: produits.titre,
      codeBarre: produits.codeBarre,
      typeProduit: produits.typeProduit,
      uniteBaseId: produits.uniteBaseId,
      dlcJours: produits.dlcJours,
      prixAchat: produits.prixAchat,
    })
    .from(produits)
    .where(and(eq(produits.isActive, true), or(...ids.map((id) => eq(produits.id, id)))));
  const stock = ((await db.execute(sql`
        SELECT produit_id, quantite, disponible, nb_lignes, nb_emplacements
          FROM stock_agregat
         WHERE agence_id = ${agenceId}
           AND produit_id IN (${sql.join(ids, sql`, `)})
       `)) as unknown as {
        produit_id: number;
        quantite: string;
        disponible: string;
        nb_lignes: number;
        nb_emplacements: number;
      }[])
    .map((s) => [s.produit_id, s] as const);
  const indexStock = new Map(stock);
  return new Map(
    rows.map((r) => {
      const s = indexStock.get(r.id);
      return [
        r.id,
        {
          ...r,
          quantiteStock: Number(s?.quantite ?? 0),
          disponibleStock: Number(s?.disponible ?? 0),
          nbLignesStock: s?.nb_lignes ?? 0,
          nbEmplacements: s?.nb_emplacements ?? 0,
          estReparti: (s?.nb_emplacements ?? 0) > 1,
          pertinence: 1,
        } as ArticleTrouve,
      ];
    }),
  );
}