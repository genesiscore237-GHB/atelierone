import { sql, and, or, eq, ne, ilike, inArray } from "drizzle-orm";
import { produits, produitReferences, produitsFournisseurs } from "@atelierone/db";
import { TRPCError } from "@trpc/server";

/**
 * LE GARDE ANTI-DOUBLONS — CÔTÉ SERVEUR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME QU'IL RÉGLÉ
 *
 * Le dépôt contient le moteur de doublons le plus avancé qui soit : 10
 * stratégies, un score de similarité, trois niveaux de probabilité
 * (`articles.detecterDoublons`). C'est aussi un moteur qui **ne bloque rien** :
 *
 *   · `createArticle` ne lisait jamais l'existant avant d'insérer ;
 *   · `addVariante` n'avait aucun contrôle du tout ;
 *   · le seul blocage, côté écran, se désactivait d'une case à cocher ;
 *   · `produits.reference_principale` — la clé métier d'identification — n'a
 *     AUCUNE contrainte SQL.
 *
 * Résultat : on pouvait créer dix fois la même pièce en dix secondes, et le
 * stock se répartissait ensuite sur dix SKU concurrents. Le magasinier ne
 * pouvait plus répondre à « combien de filtres à huile ? ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET ELLE EST VOLONTAIREMENT STRICTE
 *
 *   · correspondance CERTAINE  → on refuse, sauf réemploi explicite et motivé ;
 *   · correspondance PROBABLE  → on n refuse PAS, on signale.
 *
 * Ce n'est pas la même severité, et la raison est métier : deux filtres qui
 * n'ont qu'un nom voisin sont peut-être deux choses différentes (un spin-on et
 * une cartouche s'appellent tous deux « filtre à huile »), alors que deux
 * variantes qui partagent la même référence fabricant sont, elles, la même
 * chose.
 *
 * Une simple similarité de nom ne bloque JAMAIS. Une fusion automatique n'existe
 * pas et n'est pas ajoutée ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE SORTIE EXPLICITE PLUTÔT QU'UN SI/ON
 *
 * Le garde doit ingérer deux corrélations que l'écran ne voit pas : le même
 * appel répété (hors transaction), et le cas où la référence est déjà portée
 * par une variante produit stockable. Une fonction pure serait plus courte ;
 * elle serait fausse dans les deux cas.
 */

/** Normalise une référence : casse, accents, ponctuation, espaces. */
export function normaliserReference(brut: string | null | undefined): string {
  if (!brut) return "";
  return brut
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Une correspondance certaine : la même référence, au caractère près. */
export type DoublonExact = {
  produitId: number;
  titre: string;
  motif: string;
  reference: string;
};

/** Une correspondance probable : à comparer, pas à bloquer. */
export type DoublonProbable = {
  produitId: number;
  articleId: number | null;
  titre: string;
  score: number;
  raison: string;
};

export type VerdictDoublons = {
  exacts: DoublonExact[];
  probables: DoublonProbable[];
};

export type EnteteVariante = {
  titre?: string | null;
  designationCourte?: string | null;
  marque?: string | null;
  referencePrincipale?: string | null;
  referenceFabricant?: string | null;
  refOem?: string | null;
  codeArticle?: string | null;
  codeBarre?: string | null;
  referenceFournisseur?: string | null;
};

/** Le minimum à longueur d'un mot avant d'en chercher un voisin. */
const MOT_MIN = 4;

function motsSignificatifs(t: string): string[] {
  const interdits = new Set([
    "pour", "avec", "sans", "des", "les", "une", "de", "du", "la", "le",
    "et", "ou", "par", "sur", "en", "au", "aux", "ce", "cet", "cette", "type",
  ]);
  return [...new Set(
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((m) => m.length >= MOT_MIN && !interdits.has(m)),
  )];
}

/** Proportion de mots partagés — un nom voisin, pas une égalité. */
function chevauchement(a: string, b: string): number {
  const ma = motsSignificatifs(a);
  const mb = motsSignificatifs(b);
  if (!ma.length || !mb.length) return 0;
  const commun = ma.filter((m) => mb.includes(m)).length;
  return commun / Math.min(ma.length, mb.length);
}

/**
 * Cherche les correspondances d'une variante SANS L'INSÉRER.
 *
 * `exclureProduitId` sert à l'update : une variante ne doit pas se détecter
 * elle-même.
 */
export async function chercherDoublons(
  tx: any,
  entete: EnteteVariante,
  options: { exclureProduitId?: number } = {},
): Promise<VerdictDoublons> {
  const refs = {
    principale: normaliserReference(entete.referencePrincipale),
    fabricant: normaliserReference(entete.referenceFabricant),
    oem: normaliserReference(entete.refOem),
    article: normaliserReference(entete.codeArticle),
    barre: normaliserReference(entete.codeBarre),
    fournisseur: normaliserReference(entete.referenceFournisseur),
  };

  const exacts: DoublonExact[] = [];
  const vus = new Set<number>();
  const ajouter = (d: DoublonExact) => {
    if (vus.has(d.produitId)) return;
    vus.add(d.produitId);
    exacts.push(d);
  };

  // ── Critère 1 : une référence d'identification déjà portée par un SKU ──────
  // On ne compare que les références NON VIDES : une référence absente ne peut
  // pas être un doublon, et l'ignorer évite de ramener 300 articles sans nom.
  const criteres: { col: any; valeur: string; motif: string }[] = [];
  if (refs.principale) criteres.push({ col: produits.referencePrincipale, valeur: refs.principale, motif: "Référence principale identique" });
  if (refs.article) criteres.push({ col: produits.codeArticle, valeur: refs.article, motif: "Code article identique" });
  if (refs.barre) criteres.push({ col: produits.codeBarre, valeur: refs.barre, motif: "Code-barres identique" });
  if (refs.oem) criteres.push({ col: produits.refOem, valeur: refs.oem, motif: "Référence OEM identique" });

  if (criteres.length) {
    const filtres = criteres.map((c) =>
      sql`lower(regexp_replace(coalesce(${c.col}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${c.valeur}`,
    );
    const lignes = await tx
      .select({
        id: produits.id,
        titre: produits.titre,
        referencePrincipale: produits.referencePrincipale,
        codeArticle: produits.codeArticle,
        codeBarre: produits.codeBarre,
        refOem: produits.refOem,
      })
      .from(produits)
      .where(
        and(
          sql`(${filtres.reduce((a, b) => sql`(${a} OR ${b})`)})`,
          options.exclureProduitId ? ne(produits.id, options.exclureProduitId) : undefined,
        ),
      )
      .limit(20);

    // On réassocie chaque ligne au critère qu'elle satisfait réellement. La
    // requête peut ramener une ligne pour plusieurs critères à la fois ; on
    // n'annonce que celui qui est vrai, pas celui qui a matché en premier.
    for (const l of lignes) {
      const trouve = criteres.find((c) => {
        if (!c.valeur) return false;
        const champ =
          c.col === produits.referencePrincipale ? l.referencePrincipale
          : c.col === produits.codeArticle ? l.codeArticle
          : c.col === produits.codeBarre ? l.codeBarre
          : l.refOem;
        return normaliserReference(champ) === c.valeur;
      });
      if (!trouve) continue;
      ajouter({
        produitId: l.id,
        titre: l.titre,
        motif: trouve.motif,
        reference: l.referencePrincipale ?? l.codeArticle ?? l.codeBarre ?? "",
      });
    }
  }

  // ── Critère 2 : marque + référence fabricant ─────────────────────────────
  // Le couple, jamais la référence seule : deux concurrents(Event) de marques
  // différentes portent la même référence OEM (Numéo 03C 115 562 B).
  // C'est exactement le piège du cahier des charges.
  const marque = (entete.marque ?? "").trim();
  if (refs.fabricant && marque) {
    const lignes = await tx
      .select({ id: produits.id, titre: produits.titre, marque: produits.marque })
      .from(produits)
      .where(
        and(
          eq(produits.isActive, true),
          sql`lower(regexp_replace(coalesce(${produits.referenceFabricant}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${refs.fabricant}`,
          sql`lower(coalesce(${produits.marque}, '')) = ${marque.toLowerCase()}`,
          options.exclureProduitId ? ne(produits.id, options.exclureProduitId) : undefined,
        ),
      )
      .limit(20);

    for (const l of lignes) {
      ajouter({
        produitId: l.id,
        titre: l.titre,
        motif: `Même marque et même référence fabricant`,
        reference: entete.referenceFabricant ?? "",
      });
    }
  }

  // ── Critère 3 : la référence est déjà portée par une AUTRE table ──────────
  // `produit_references` n'était alimentée que par `addReference`, jamais par la
  // création : la stratégie 2 du moteur de doublons était structurellement
  // vide pour tout ce que le wizard produisait. On la consulte maintenant.
  const toutesRefs = [refs.principale, refs.fabricant, refs.oem, refs.fournisseur].filter(Boolean);
  if (toutesRefs.length) {
    const lignes = await tx
      .select({
        varianteId: produitReferences.varianteId,
        valeur: produitReferences.valeur,
        typeRef: produitReferences.typeRef,
      })
      .from(produitReferences)
      .where(
        and(
          inArray(sql`lower(coalesce(${produitReferences.valeurNormalisee}, ''))`, toutesRefs),
          options.exclureProduitId ? ne(produitReferences.varianteId, options.exclureProduitId) : undefined,
        ),
      )
      .limit(20);

    for (const r of lignes) {
      const titres = await tx
        .select({ titre: produits.titre })
        .from(produits)
        .where(eq(produits.id, r.varianteId))
        .limit(1);
      ajouter({
        produitId: r.varianteId,
        titre: titres[0]?.titre ?? `Variante ${r.varianteId}`,
        motif: `Référence déjà enregistrée (${r.typeRef})`,
        reference: r.valeur,
      });
    }
  }

  // ── Critère 4 : la référence est celle d'un fournisseur, pour CE produit ──
  if (refs.fournisseur) {
    const lignes = await tx
      .select({ produitId: produitsFournisseurs.produitId, reference: produitsFournisseurs.referenceFournisseur })
      .from(produitsFournisseurs)
      .where(
        sql`lower(regexp_replace(coalesce(${produitsFournisseurs.referenceFournisseur}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${refs.fournisseur}`,
      )
      .limit(20);
    for (const l of lignes) {
      if (l.produitId === options.exclureProduitId) continue;
      const titres = await tx.select({ titre: produits.titre }).from(produits).where(eq(produits.id, l.produitId)).limit(1);
      ajouter({
        produitId: l.produitId,
        titre: titres[0]?.titre ?? `Produit ${l.produitId}`,
        motif: "Référence déjà connue chez un fournisseur",
        reference: l.reference ?? "",
      });
    }
  }

  // ── Probables : nom voisin. NE BLOQUE PAS. ────────────────────────────────
  const nom = entete.designationCourte || entete.titre || "";
  const probables: DoublonProbable[] = [];
  if (motsSignificatifs(nom).length) {
    const motif = `%${nom.trim().split(/\s+/)[0]}%`;
    const voisins = await tx
      .select({
        id: produits.id,
        articleId: produits.articleId,
        titre: produits.titre,
        designationCourte: produits.designationCourte,
      })
      .from(produits)
      .where(
        and(
          eq(produits.isActive, true),
          options.exclureProduitId ? ne(produits.id, options.exclureProduitId) : undefined,
          or(
            ilike(produits.titre, motif),
            ilike(produits.designationCourte, motif),
          ),
        ),
      )
      .limit(20);

    for (const v of voisins) {
      if (vus.has(v.id)) continue;
      const score = chevauchement(nom, v.designationCourte || v.titre);
      if (score >= 0.5) {
        probables.push({
          produitId: v.id,
          articleId: v.articleId ?? null,
          titre: v.titre,
          score: Math.round(score * 100),
          raison: "Désignation proche — à comparer, pas à confondre",
        });
      }
    }
    probables.sort((a, b) => b.score - a.score);
  }

  return { exacts, probables: probables.slice(0, 10) };
}

/**
 * Le garde appelé par TOUT chemin de création.
 *
 * Lève si une correspondance certaine existe ET que le réemploi n'a pas été
 * demandé explicitement. Ne lève JAMAIS sur une correspondance probable.
 */
export async function exigerPasDeDoublon(
  tx: any,
  entete: EnteteVariante,
  options: {
    exclureProduitId?: number;
    /** Réemploi assumé. Oblige `motifReemploi`. */
    accepterDoublon?: boolean;
    motifReemploi?: string;
    /** Désignation de l'article, pour un message lisible. */
    designationArticle?: string;
  } = {},
) {
  const verdict = await chercherDoublons(tx, entete, {
    exclureProduitId: options.exclureProduitId,
  });

  if (verdict.exacts.length === 0) return verdict;

  if (options.accepterDoublon) {
    const motif = (options.motifReemploi ?? "").trim();
    if (motif.length < 10) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Réemploi accepté, mais le motif est obligatoire (10 caractères minimum) : il explique pourquoi cette variante est distincte de la pièce existante.",
      });
    }
    return verdict;
  }

  const detail = verdict.exacts
    .slice(0, 3)
    .map((d) => `« ${d.titre} » — ${d.motif}${d.reference ? ` (${d.reference})` : ""}`)
    .join(" ; ");

  throw new TRPCError({
    code: "CONFLICT",
    message:
      `Cette pièce semble déjà exister : ${detail}. ` +
      `Utilisez la fiche existante, ou déclarez explicitement qu'il s'agit d'une variante ` +
      `distincte et dites pourquoi.`,
  });
}