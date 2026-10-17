/**
 * EXPORT DU REGISTRE PARKING — la source brute, avant toute reconstruction.
 *
 * ÉTAPE 6 bis. Le registre du garage est le seul état réel : c'est lui qui dit
 * quels véhicules sont réellement au parc. Tout le reste — fiches véhicules,
 * clients, dossiers — en est DÉDUIT.
 *
 * Pourquoi cet export, et pourquoi maintenant
 *
 * L'import qui a été fait (`migrate-parking-vehicules`) a créé les véhicules
 * en `INSERT` brut : il a sauté le chemin métier. Résultat, en production :
 *
 *     54 lignes de registre  ->  54 véhicules  ->  1 dossier
 *
 * Un véhicule physiquement présent n'a ni réception, ni dossier, ni travail.
 * Il n'est ni « rentré », ni « pas rentré ». C'est l'incohérence qu'on
 * supprime — en repassant par le MÊME chemin qu'un agent.
 *
 * Mais avant de refaire quoi que ce soit, il faut que la source soit
 * RÉCUPÉRABLE. On va supprimer l'état dérivé. Si le registre ne vit que
 * dans la base, on Supprime la source en croyant supprimer une duplication.
 *
 * Donc : export d'abord, vérifié, versionné. Ce fichier est le point de
 * départ ET la preuve.
 *
 *
 * CE QUE L'EXPORT NE FAIT PAS
 *
 * Il n'invente rien. Une date d'entrée absente reste absente. Un téléphone
 * absent reste absent. Ce n'est pas un script de remplissage, c'est une
 * photographie.
 */

import "dotenv/config";
import postgres from "postgres";
import { sslPourUrl } from "./env-guard";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Colonnes du registre, dans l'ordre du SELECT, avec leur type attendu. */
const COLONNES = [
  "num_registre", "immatriculation", "vin", "marque", "modele", "version",
  "couleur", "client_nom", "client_telephone", "statut", "motif",
  "date_entree", "date_derniere_action", "date_devis", "date_commande",
  "date_fin_travaux", "notes", "created_at", "updated_at",
  "longueur", "largeur", "hauteur", "poids", "dimensions_estimees",
  "provenance", "photo_presente", "photo_categorie", "photo_date",
] as const;

// Chemin ancré sur le DÉPÔT, pas sur le répertoire courant : le script est
// lancé depuis `packages/db` comme depuis la racine, et le fichier doit atterrir
// au même endroit dans les deux cas.
const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SORTIE = resolve(RACINE, "DOC/donnees/registre-parking-source.json");

(async () => {
  const url = process.env.DATABASE_URL!;
  const cible = (() => {
    try {
      const u = new URL(url);
      return `${u.host}/${u.pathname.slice(1)}`;
    } catch {
      return "(URL illisible)";
    }
  })();

  console.log("=".repeat(66));
  console.log(`EXPORT DU REGISTRE PARKING — ${cible}`);
  console.log("=".repeat(66));

  const ssl = url.includes(".neon.tech") ? "require" : false;
  const sql = postgres(url, { ssl, prepare: false, max: 1 });

  try {
    const lignes = await sql.unsafe(`
      SELECT ${COLONNES.map((c) => `"${c}"`).join(", ")}
      FROM public.parking_vehicles
      ORDER BY num_registre NULLS LAST, id
    `) as unknown as Record<string, unknown>[];

    const avecPlaque = lignes.filter((l) => l.immatriculation).length;
    const avecDate = lignes.filter((l) => l.date_entree).length;
    const avecTel = lignes.filter((l) => l.client_telephone).length;

    console.log(`  ${lignes.length} ligne(s) exportée(s).`);
    console.log(`  avec immatriculation : ${avecPlaque}   sans : ${lignes.length - avecPlaque}`);
    console.log(`  avec date d'entrée   : ${avecDate}       ← aucune : on n'invente pas de date`);
    console.log(`  avec téléphone       : ${avecTel}         ← aucun : un nom ne fabrique pas un numéro`);

    const export_ = {
      _avertissement:
        "SOURCE BRUTE du registre parking. Ne jamais modifier à la main : " +
        "c'est l'état réel du garage. Toute correction passe par le registre, " +
        "puis par un nouvel export.",
      _genere_le: new Date().toISOString(),
      _source: cible,
      _colonnes: COLONNES,
      _qualite: {
        lignes: lignes.length,
        avecImmatriculation: avecPlaque,
        avecDateEntree: avecDate,
        avecTelephone: avecTel,
      },
      lignes: lignes.map((l) => {
        const o: Record<string, unknown> = {};
        for (const c of COLONNES) {
          let v = l[c];
          if (v instanceof Date) v = v.toISOString();
          if (typeof v === "string" && v.trim() === "") v = null;
          o[c] = v ?? null;
        }
        return o;
      }),
    };

    mkdirSync(dirname(SORTIE), { recursive: true });
    writeFileSync(SORTIE, JSON.stringify(export_, null, 2), "utf8");
    console.log(`\n  Écrit : ${SORTIE}`);
    console.log("  Ce fichier est la source. Le supprimer, c'est perdre le garage.");
  } finally {
    await sql.end();
  }
})().catch((err) => {
  console.error("[export-parking] ECHEC :", err);
  process.exit(1);
});