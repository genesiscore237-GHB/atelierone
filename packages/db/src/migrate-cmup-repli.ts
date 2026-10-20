import "dotenv/config";
import postgres from "postgres";
import { requireLocalOrForced, sslPourUrl } from "./env-guard";

/**
 * VALORISER LES STOCKS SANS COÛT RÉEL
 *
 * Doctrine stock (journal fait foi) : `stocks.cout_unitaire_moyen` est écrit
 * par le MOTEUR UNIQUE à chaque entrée valorisée. Les lignes nées avant cette
 * règle (saisie directe, import, migration) portent NULL et l'écran les
 * valorise par repli au prix de la fiche.
 *
 * Ce script reprend, pour chaque ligne de stock sans coût (NULL), le dernier
 * mouvement ENTRANT (sens = 'E') du journal portant un coût strictement
 * positif, et l'écrit comme coût réel. Sinon la ligne est laissée au repli
 * prix fiche — plutôt qu'inventer un coût.
 *
 * IDEMPOTENT PAR CONSTRUCTION :
 *   - ne touche QUE les lignes `cout_unitaire_moyen IS NULL` ;
 *   - ne réécrit jamais une valeur existante (aucun écrasement silencieux) ;
 *   - relancé, un second passage retombe sur 0 mise à jour (ou sur les seules
 *     lignes nées depuis).
 *
 *   pnpm -F @atelierone/db exec tsx src/migrate-cmup-repli.ts
 *   FORCE=1 pnpm -F @atelierone/db exec tsx src/migrate-cmup-repli.ts   (distant)
 */

requireLocalOrForced("migrate-cmup-repli");

const url = process.env.DATABASE_URL!;
const sql = postgres(url, { ssl: sslPourUrl(url), prepare: false, max: 1 });

try {
  const resultat = await sql.begin(async (tx) => {
    // Arbre de décision strictement identique au moteur : entrant + coût > 0.
    const mises = await tx`
      UPDATE public.stocks s
      SET cout_unitaire_moyen = dernier.cout
      FROM (
        SELECT DISTINCT ON (produit_id, agence_id)
               produit_id, agence_id, cout_unitaire_base AS cout
        FROM public.mouvements_stock
        WHERE sens = 'E'
          AND cout_unitaire_base IS NOT NULL
          AND cout_unitaire_base > 0
        ORDER BY produit_id, agence_id, date_mouvement DESC, id DESC
      ) dernier
      WHERE s.produit_id = dernier.produit_id
        AND s.agence_id  = dernier.agence_id
        AND s.cout_unitaire_moyen IS NULL
      RETURNING s.id
    `;
    const sansCout = await tx`
      SELECT count(*)::int AS nb FROM public.stocks
      WHERE cout_unitaire_moyen IS NULL AND quantite > 0
    `;
    const avecCout = await tx`
      SELECT count(*)::int AS nb FROM public.stocks WHERE cout_unitaire_moyen IS NOT NULL
    `;
    return {
      mises: mises.length,
      sansCout: (sansCout[0] as { nb: number }).nb,
      avecCout: (avecCout[0] as { nb: number }).nb,
    };
  });

  console.log(`migrate-cmup-repli : ${resultat.mises} lignes de stock valorisées depuis le journal.`);
  console.log(`Restant sans coût réel (aucun mouvement valorisé) : ${resultat.sansCout} lignes — repli prix fiche conservé.`);
  console.log(`Total lignes désormais valorisées : ${resultat.avecCout}.`);
} finally {
  await sql.end();
}
