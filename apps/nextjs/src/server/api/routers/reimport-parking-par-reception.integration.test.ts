/**
 * ÉTAPE 6 bis — RECONSTRUCTION DU PARKING PAR LE CHEMIN MÉTIER.
 *
 * Ce n'est pas un test de fond : c'est un CHANTIER, et il ne s'exécute que si
 * on le demande. Sans la variable d'environnement ci-dessous, il est ignoré
 * — il ne doit jamais tourner au fil de `vitest run`.
 *
 *   IMPORT_PARKING=1 pnpm --filter @atelierone/nextjs exec vitest run \
 *     src/server/api/routers/reimport-parking-par-reception.integration.test.ts
 *
 *
 * LE PROBLÈME
 *
 * Le premier import a créé les véhicules en `INSERT INTO vehicules` brut. Il a
 * sauté le chemin métier. Résultat, en local comme en production :
 *
 *     54 lignes de registre  ->  54 véhicules  ->  1 dossier  ->  0 ligne
 *
 * Un véhicule physiquement présent n'a ni réception, ni dossier, ni travail. Il
 * n'est ni « rentré », ni « pas rentré ». C'est l'incohérence qu'on supprime —
 * en repassant par la MÊME procédure que celle qu'un agent déclenche.
 *
 *
 * CE QUI FAIT LA COHÉRENCE, ET QU'ON NE PEUT PAS REPRODUIRE EN SQL
 *
 * La réception est une transaction de 334 lignes. Elle crée le dossier, écrit
 * l'historique, rattache le véhicule au parking, applique les invariants
 * dérivés, refuse les doublons. Recopier « l'essentiel » produirait un second
 * chemin — et deux chemins divergent, toujours.
 *
 * D'où l'appel par `createCaller` : c'est littéralement la procédure que
 * reçoit une requête HTTP.
 *
 *
 * CE QUE L'IMPORT NE FABRIQUE PAS
 *
 * Le registre ne contient aucun kilométrage. On ne met donc **pas** `0` —
 * « 0 km » se lit comme une mesure, et un véhicule à 180 000 km n'a pas
 * 0 km : il n'est pas relevé. `NULL` s'affiche « - » et se corrige plus tard
 * depuis la fiche. Un remplacement **marqué** comme tel n'est pas un problème ;
 * un remplacement qui **ressemble** à une mesure, si.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { orRouter } from "~/server/api/routers/or-router";

/** Sans cette variable, tout le fichier est ignoré. */
const ACTIF = process.env.IMPORT_PARKING === "1";

const FICHIER = resolve(process.cwd(), "../../DOC/donnees/registre-parking-source.json");

type Ligne = {
  num_registre: number | null;
  immatriculation: string | null;
  vin: string | null;
  marque: string | null;
  modele: string | null;
  version: string | null;
  couleur: string | null;
  client_nom: string | null;
  client_telephone: string | null;
  statut: string | null;
  motif: string | null;
  created_at: string | null;
};

type Row = Record<string, unknown>;

let lignes: Ligne[] = [];

function ctx() {
  const user = {
    id: "1",
    name: "Import registre",
    email: "import.registre@gpj.cm",
    agenceId: 1,
    agenceName: "GPJ",
    organizationId: "1",
    role: "superadmin",
    permissions: [],
    isActive: true,
    status: "active",
  };
  return {
    headers: new Headers(),
    user,
    session: { user, expires: "2099-01-01T00:00:00.000Z" },
  } as never;
}

/**
 * Purge de l'état DÉRIVÉ.
 *
 * `mouvements_stock` est un cas à part : la table contient de VRAIS mouvements
 * (354 en production), mais `mouvements_stock.or_id` référence
 * `ordres_reparation`. On ne supprime donc QUE ceux qui pointent vers un
 * dossier — les entrées, sorties et inventaires du stock ne sont pas de
 * l'état dérivé d'une reconstruction et ne doivent pas disparaître.
 *
 * C'est la seule façon de purger sans détruire : une clé étrangère ne
 * distingue pas ce qui dérive de ce qui est réel.
 */
async function purger() {
  await db.execute(sql`DELETE FROM or_restitutions`);
  await db.execute(sql`DELETE FROM relances`);
  await db.execute(sql`DELETE FROM or_historique`);
  await db.execute(sql`DELETE FROM lignes_ordre_reparation`);
  await db.execute(sql`DELETE FROM mouvements_stock WHERE or_id IS NOT NULL`);
  await db.execute(sql`DELETE FROM ordres_reparation`);
  await db.execute(sql`DELETE FROM parking_movements`);
  await db.execute(sql`DELETE FROM parking_vehicles`);
  await db.execute(sql`DELETE FROM vehicules`);
  await db.execute(sql`DELETE FROM clients`);
}

const sansPlaque = () => lignes.filter((l) => !l.immatriculation);
const avecPlaque = () => lignes.filter((l) => !!l.immatriculation);

describe.skipIf(!ACTIF)("ÉTAPE 6 bis — reconstruction par le chemin métier", () => {
  beforeAll(async () => {
    const brut = JSON.parse(readFileSync(FICHIER, "utf8")) as { lignes: Ligne[] };
    lignes = brut.lignes;
    expect(lignes.length, "le fichier source est vide ou introuvable").toBeGreaterThan(0);
  });

  afterAll(async () => {
    // Le chantier laisse la base dans l'état qu'il a produit : on ne purge
    // pas derrière soi, ce serait détruire le résultat à vérifier.
  });

  it("1. la source est exploitable et son manque est connu", () => {
    expect(lignes.length).toBe(54);
    // Les 12 véhicules sans plaque sont IDENTIFIÉS par leur numéro de
    // registre — que `vehicules` ne connaît pas encore. Ils sont donc hors
    // de portée de cet import, et c'est dit explicitement plutôt que
    // rattrapés par une immatriculation inventée.
    expect(sansPlaque().length).toBe(12);
    expect(avecPlaque().length).toBe(42);
  });

  it("2. purge puis reconstruction : chaque véhicule plaque obtient son dossier", async () => {
    await purger();

    const [apres] = (await db.execute(
      sql`SELECT count(*)::int AS n FROM ordres_reparation`,
    )) as unknown as Row[];
    expect(Number(apres.n), "la purge n'a pas vidé les dossiers").toBe(0);

    const caller = orRouter.createCaller(ctx());
    const clientsParNom = new Map<string, number>();
    const refuses: string[] = [];
    const erreurs: string[] = [];
    let reconstruits = 0;

    for (const l of avecPlaque()) {
      const nom = (l.client_nom ?? "").trim();
      const nomPropre = nom && nom !== "-" ? nom : null;
      const clientId = nomPropre ? clientsParNom.get(nomPropre) : undefined;

      // Le motif du registre EST la panne déclarée. S'il est vide, on le dit
      // au lieu de le remplir — une absence nommée reste une absence.
      const panne = (l.motif ?? "").trim() || "Non précisé au registre";

      const observations =
        `Registre garage — ligne n°${l.num_registre ?? "?"}. ` +
        `Kilométrage non relevé au registre : le garage note QUI et POURQUOI, pas COMBIEN. ` +
        `Statut au registre : ${l.statut ?? "non précisé"}.`;

      try {
        const r = await caller.receptionner({
          client: clientId ? { id: clientId } : { nom: nomPropre ?? undefined },
          vehicule: {
            immatriculation: l.immatriculation!,
            numeroChassis: l.vin ?? undefined,
            marque: l.marque ?? undefined,
            modele: l.modele ?? undefined,
            version: l.version ?? undefined,
            couleur: l.couleur ?? undefined,
          },
          reception: {
            pannesDeclarees: panne,
            observationsReception: observations,
          },
        });
        reconstruits++;

        // Mémorise la fiche créée pour les véhicules suivants du même
        // client — c'est ce que ferait un agent qui relirait le dossier au
        // lieu de créer un homonyme.
        if (nomPropre && !clientId) {
          const v = (await db.execute(
            sql`SELECT v.client_id FROM vehicules v WHERE v.immatriculation = ${l.immatriculation}`,
          )) as unknown as Row[];
          const cid = v[0]?.client_id;
          if (cid) clientsParNom.set(nomPropre, Number(cid));
        }
        expect(r.id).toBeGreaterThan(0);
      } catch (e) {
        erreurs.push(`#${l.num_registre} ${l.immatriculation} : ${(e as Error).message.slice(0, 90)}`);
      }
    }

    console.log(`  reconstruits : ${reconstruits} / ${avecPlaque().length}`);
    if (erreurs.length) console.log("  refus :\n    " + erreurs.join("\n    "));
    if (refuses.length) console.log("  exclus : " + refuses.join(", "));

    // Le chantier a réussi s'il n'a rien laissé de côté SANS LE DIRE.
    expect(erreurs, `${erreurs.length} véhicule(s) ont été refusés par la réception`).toEqual([]);
    expect(reconstruits).toBe(avecPlaque().length);
  });

  it("3. le résultat est INDISTINGUILLABLE d'une saisie manuelle", async () => {
    const q = async (_libelle: string, c: string) => {
      const r = (await db.execute(sql.raw(c))) as unknown as Row[];
      return Number(r[0]?.n ?? 0);
    };

    // Chaque dossier doit porter sa réception, son entrée parking, son
    // historique et son statut dérivé. C'est ÇA qui manquait.
    const dossiers = await q("dossiers", `SELECT count(*)::int n FROM ordres_reparation`);
    const avecParking = await q(
      "avec entrée parking",
      `SELECT count(*)::int n FROM ordres_reparation o
       WHERE EXISTS (SELECT 1 FROM parking_vehicles p WHERE p.vehicule_id = o.vehicule_id)`,
    );
    const avecReception = await q(
      "avec km d'entrée renseigné",
      `SELECT count(*)::int n FROM ordres_reparation WHERE kilometrage_entree IS NOT NULL`,
    );
    const avecHistorique = await q(
      "avec historique de réception",
      `SELECT count(*)::int n FROM ordres_reparation o
       WHERE EXISTS (SELECT 1 FROM or_historique h WHERE h.or_id = o.id)`,
    );
    const avecStatut = await q(
      "avec statut d'immobilisation",
      `SELECT count(*)::int n FROM ordres_reparation o
       WHERE EXISTS (SELECT 1 FROM vehicules v WHERE v.id = o.vehicule_id AND v.statut_immobilisation IS NOT NULL)`,
    );

    console.log(`  dossiers ${dossiers} | parking ${avecParking} | historique ${avecHistorique} | statut ${avecStatut}`);

    expect(dossiers).toBe(avecPlaque().length);
    expect(avecParking).toBe(dossiers);
    expect(avecHistorique).toBe(dossiers);
    expect(avecStatut).toBe(dossiers);

    // Le point de cohérence du chantier : le kilométrage est ABSENT, et
    // l'absence est visible — pas transformée en 0.
    expect(avecReception, "des km ont été inventés").toBe(0);
  });
});