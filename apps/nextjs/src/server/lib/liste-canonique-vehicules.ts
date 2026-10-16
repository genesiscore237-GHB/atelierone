/**
 * P1.1 — LISTE CANONIQUE DE VÉHICULES.
 *
 * ## Pourquoi ce fichier existe
 *
 * L'inventaire a dénombré **onze** procédures qui renvoient des véhicules, avec
 * onze jeux de filtres, quatre implémentations de barre de recherche et quatre
 * copies de la liste des statuts. Conséquences mesurées, pas théoriques :
 *
 *   - `garage.vehicles` renvoie `total = rows.length` : le compteur « N
 *     véhicule(s) affiché(s) » ment dès que le parc dépasse le `limit` ;
 *   - la colonne « Emplacement » du registre lit `v.site`/`v.zone`/`v.spot`,
 *     **absents de la réponse** — elle affiche donc « Non défini » en
 *     permanence ;
 *   - `vehicules.list` accepte un `offset` que **aucun écran n'utilise**, et
 *     plafonne à 100 en dur ;
 *   - `or.listVehicules` n'a ni `LIMIT`, ni `ORDER BY`, ni filtre `isActive`.
 *
 * Ce n'est pas un problème de style : c'est un problème de **vérité**. Deux
 * écrans qui listent le même véhicule doivent afficher le même statut, le même
 * client et le même nombre de lignes — sinon l'agent ne sait plus lequel
 * écran croire.
 *
 * ## La règle
 *
 * **Une ligne = un véhicule.** La table `vehicules` est l'unique source. Le
 * registre parking n'apparaît QUE comme une position jointe, résolue en noms
 * lisibles (site / zone / place) — jamais comme une deuxième liste.
 *
 * `parking_vehicles` porte une ligne par **passage**, pas par véhicule : on
 * prend donc la ligne la plus récente (`id` décroissant), la même règle que
 * `garage.vehiculeParCanonique`. Sans cela, un véhicule entré trois fois
 * apparaîtrait trois fois — c'est-à-dire un parc de 54 véhicules affichant
 * 160 lignes.
 *
 * ## Ce que l'endpoint garantit
 *
 *   - un `total` réel (`count(*)` sur le même `WHERE`), jamais la taille d'une
 *     page ;
 *   - une pagination réelle (`limit` + `offset`) ;
 *   - des positions lisibles, résolues par jointure ;
 *   - les compteurs par statut calculés **sur le périmètre filtré**, pas sur
 *     la page courante ;
 *   - le statut immobilisation venant de la colonne canonique (dérivée, cf.
 *     P0.1), jamais recalculé ici.
 *
 * ## Règle d'or
 *
 * Ce service ne doit jamais devenir un second `vehicules.list`. S'il faut une
 * colonne de plus, on l'ajoute ICI, et les écrans se mettent à jour. Le jour où
 * quelqu'un écrit un `select` vehicle ailleurs, la garantie tient encore — et
 * le jour où ce fichier est dupliqué, elle est morte.
 */

import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";

/** Ligne de parking la plus récente d'un véhicule, résolue en noms lisibles. */
const POSITION_PARKING_RECENT = sql`
  LEFT JOIN LATERAL (
    SELECT pv.id, pv.num_registre, pv.statut, pv.centre_x, pv.centre_y,
           pv.date_entree, pv.immatriculation,
           ps.nom  AS site_nom,
           pz.nom  AS zone_nom,
           psp.code AS spot_code
    FROM parking_vehicles pv
    LEFT JOIN parking_sites  ps  ON ps.id  = pv.site_id
    LEFT JOIN parking_zones  pz  ON pz.id  = pv.zone_id
    LEFT JOIN parking_spots  psp ON psp.id = pv.spot_id
    WHERE pv.vehicule_id = v.id
    ORDER BY pv.id DESC
    LIMIT 1
  ) pos ON TRUE`;

/** Un dossier d'atelier non clôturé, le plus avancé en priorité. */
const OR_EN_COURS = sql`
  LEFT JOIN LATERAL (
    SELECT o.id, o.numero, o.statut, o.priorite, o.date_ouverture
    FROM ordres_reparation o
    WHERE o.vehicule_id = v.id
      AND o.statut NOT IN ('ANNULE','ferme_definitif','LIVRE','CLOTURE')
    ORDER BY o.date_ouverture DESC
    LIMIT 1
  ) orc ON TRUE`;

export type LigneCanonique = {
  id: number;
  immatriculation: string | null;
  immatNorm: string | null;
  marque: string | null;
  modele: string | null;
  annee: number | null;
  couleur: string | null;
  version: string | null;
  numeroChassis: string | null;
  typeVehicule: string | null;
  kilometrage: number | null;
  statutImmobilisation: string | null;

  clientId: number | null;
  clientNom: string | null;
  clientTelephone: string | null;

  position: {
    numRegistre: number | null;
    statutParking: string | null;
    siteNom: string | null;
    zoneNom: string | null;
    spotCode: string | null;
    dateEntree: Date | null;
  } | null;

  orEnCours: {
    id: number;
    numero: string | null;
    statut: string | null;
    priorite: string | null;
    dateOuverture: Date | null;
  } | null;
};

export type FiltresCanonique = {
  agenceId: number;
  search?: string | null;
  /** Statut d'immobilisation (snake_case, cf. `STATUTS_DERIVABLES`). */
  statut?: string | null;
  /** Statut du registre parking (MAJUSCULES, cf. `ParkingVehicleStatus`). */
  statutParking?: string | null;
  clientId?: number | null;
  siteId?: number | null;
  /** `true` = uniquement les véhicules ayant un dossier ouvert. */
  orEnCours?: boolean | null;
  limit: number;
  offset: number;
};

/**
 * Tris, en SQL explicite.
 *
 * Un tri déclaré en table JavaScript serait reconstruit à chaque appel et
 *łowalenze pasnecessarily valide : ici la chaîne est écrite une fois, lisible,
 * et testable. `NULLS LAST` parce qu'un véhicule sans plaque (cas réel :
 * 12 véhicules du parking) ne doit pas remonter en tête d'une liste de parc.
 */
const TRIS = {
  immatriculation: "v.immatriculation ASC NULLS LAST",
  immatriculation_desc: "v.immatriculation DESC NULLS LAST",
  km: "v.kilometrage DESC NULLS LAST",
  km_asc: "v.kilometrage ASC NULLS LAST",
  recent: "v.id DESC",
} as const;

export type TriCanonique = keyof typeof TRIS;

/**
 * Condition de recherche, partagée par la liste ET par le `total`.
 *
 * Les deux doivent utiliser **la même expression** : c'est la condition canon.
 * Un `total` calculé sur un filtre différent du `WHERE` des lignes est
 * précisément le mensonge qu'on vient corriger.
 *
 * Six critères, parce que l'agent ne sait pas sous quelle clé il a le
 * véhicule : il peut connaître la plaque, le châssis, le modèle, le n° de
 * registre du parking, ou seulement le téléphone du client.
 */
function conditionSearch(search: string): SQL | undefined {
  const q = search.trim();
  if (!q) return undefined;
  const motif = `%${q}%`;
  const tel = q.replace(/[^\d]/g, "");
  return or(
    ilike(sql`v.immatriculation`, motif),
    ilike(sql`v.numero_chassis`, motif),
    ilike(sql`v.marque`, motif),
    ilike(sql`v.modele`, motif),
    ilike(sql`v.version`, motif),
    ilike(sql`c.nom`, motif),
    ilike(sql`c.raison_sociale`, motif),
    ilike(sql`pos.num_registre::text`, motif),
    ilike(sql`pos.immatriculation`, motif),
    // Numéro de téléphone : comparable CHIFFRES SEULS, des deux côtés.
    //
    // Stocker « 677 00 11 22 » et chercher « 677001122 » — ou l'inverse — est
    // le cas le plus fréquent en atelier : l'agent lit un numéro sur un carton,
    // le recopie avec ou sans espaces. Comparer la colonne telle quelle échoue
    // dans les deux sens, et l'agent conclut que le véhicule est introuvable
    // alors qu'il est là. D'où `regexp_replace` sur la colonne : c'est ce qui
    // rend la recherche par téléphone réellement utilisable au comptoir.
    ...(tel.length >= 4
      ? [sql`regexp_replace(COALESCE(c.telephone, ''), '[^0-9]', '', 'g') LIKE ${`%${tel}%`}`]
      : []),
  )!;
}

/**
 * Construit le `FROM` commun. `pos` et `orc` sont des LATERAL d'au plus une
 * ligne : garantir « une ligne = un véhicule » au niveau SQL, pas seulement
 * dans une boucle JS.
 */
function fromCanonique() {
  return sql`
    FROM vehicules v
    LEFT JOIN clients c ON c.id = v.client_id
    ${POSITION_PARKING_RECENT}
    ${OR_EN_COURS}`;
}

/**
 * Assemblage d'une ligne SQL en objet.
 *
 * `vehicule_id` peut être `NULL` côté parking : la position est alors
 * simplement absente, pas « Non défini » — deux choses différentes qui
 * displays mixed and mislead.
 */
function versLigne(r: Record<string, unknown>): LigneCanonique {
  const numRegistre = (r.num_registre ?? null) as number | null;
  const aUnePosition = r.pos_id != null;
  return {
    id: r.id as number,
    immatriculation: (r.immatriculation ?? null) as string | null,
    immatNorm: (r.immat_norm ?? null) as string | null,
    marque: (r.marque ?? null) as string | null,
    modele: (r.modele ?? null) as string | null,
    annee: (r.annee ?? null) as number | null,
    couleur: (r.couleur ?? null) as string | null,
    version: (r.version ?? null) as string | null,
    numeroChassis: (r.numero_chassis ?? null) as string | null,
    typeVehicule: (r.type_vehicule ?? null) as string | null,
    kilometrage: (r.kilometrage ?? null) as number | null,
    statutImmobilisation: (r.statut_immobilisation ?? null) as string | null,
    clientId: (r.client_id ?? null) as number | null,
    clientNom: (r.client_nom ?? null) as string | null,
    clientTelephone: (r.client_telephone ?? null) as string | null,
    position: aUnePosition
      ? {
          numRegistre,
          statutParking: (r.statut_parking ?? null) as string | null,
          siteNom: (r.site_nom ?? null) as string | null,
          zoneNom: (r.zone_nom ?? null) as string | null,
          spotCode: (r.spot_code ?? null) as string | null,
          dateEntree: (r.date_entree ?? null) as Date | null,
        }
      : null,
    orEnCours:
      r.orc_id != null
        ? {
            id: r.orc_id as number,
            numero: (r.orc_numero ?? null) as string | null,
            statut: (r.orc_statut ?? null) as string | null,
            priorite: (r.orc_priorite ?? null) as string | null,
            dateOuverture: (r.orc_date_ouverture ?? null) as Date | null,
          }
        : null,
  };
}

const SELECT_COLONNES = sql`
  v.id, v.immatriculation, v.immat_norm, v.marque, v.modele, v.annee,
  v.couleur, v.version, v.numero_chassis, v.type_vehicule, v.kilometrage,
  v.statut_immobilisation, v.client_id,
  c.nom AS client_nom, c.telephone AS client_telephone,
  pos.id AS pos_id, pos.num_registre, pos.statut AS statut_parking,
  pos.site_nom, pos.zone_nom, pos.spot_code, pos.date_entree,
  orc.id AS orc_id, orc.numero AS orc_numero, orc.statut AS orc_statut,
  orc.priorite AS orc_priorite, orc.date_ouverture AS orc_date_ouverture`;

/**
 * `WHERE` partagé, aligné sur `FiltresCanonique`.
 *
 * Exporté pour que les tests puissent affirmer que le `total` et les
 * compteurs portent le même filtre que les lignes — c'est le cœur de la
 * correction : un `total` calculé ailleurs affiche un nombre que rien ne
 * corrobore.
 */
export function whereCanonique(f: FiltresCanonique): SQL {
  const clauses: (SQL | undefined)[] = [
    eq(sql`v.agence_id`, f.agenceId),
    eq(sql`v.is_active`, true),
  ];
  const s = conditionSearch(f.search ?? "");
  if (s) clauses.push(s);
  if (f.statut) clauses.push(eq(sql`v.statut_immobilisation`, f.statut));
  if (f.clientId != null) clauses.push(eq(sql`v.client_id`, f.clientId));
  if (f.siteId != null) clauses.push(eq(sql`pos.site_id`, f.siteId));
  if (f.statutParking) clauses.push(eq(sql`pos.statut`, f.statutParking));
  if (f.orEnCours) clauses.push(sql`orc.id IS NOT NULL`);
  return and(...clauses)!;
}

/**
 * Liste canonique + `total` réel + compteurs par statut.
 *
 * Les trois partagent le MÊME `WHERE`. C'est le point : un compteur calculé
 * sur un autre filtre affiche un nombre que rien ne corrobore.
 */
export async function listeCanoniqueVehicules(
  exec: any,
  f: FiltresCanonique,
  tri: TriCanonique = "immatriculation",
): Promise<{ lignes: LigneCanonique[]; total: number; parStatut: Record<string, number> }> {
  const where = whereCanonique(f);
  const ordre = TRIS[tri] ?? TRIS.immatriculation;

  // `exec.execute(sql\`…\`)` plutôt qu'une chaîne concaténée : les valeurs
  // passent en paramètres, donc un `search` contenant une apostrophe ne peut
  // pas casser la requête — ni devenir une injection.
  const lignes = await exec.execute(sql`
    SELECT ${SELECT_COLONNES}
    ${fromCanonique()}
    WHERE ${where}
    ORDER BY ${sql.raw(ordre)}
    LIMIT ${f.limit} OFFSET ${f.offset}
  `);

  const total = await exec.execute(sql`
    SELECT count(*)::int AS n
    ${fromCanonique()}
    WHERE ${where}
  `);

  const compteurs = await exec.execute(sql`
    SELECT COALESCE(v.statut_immobilisation, 'non_defini') AS statut, count(*)::int AS n
    ${fromCanonique()}
    WHERE ${where}
    GROUP BY 1
  `);

  const parStatut: Record<string, number> = {};
  for (const c of compteurs) parStatut[String((c as Record<string, unknown>).statut)] = Number((c as Record<string, unknown>).n);

  return {
    lignes: lignes.map((r) => versLigne(r)),
    total: Number(total[0]?.n ?? 0),
    parStatut,
  };
}