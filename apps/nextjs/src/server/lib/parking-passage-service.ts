import { sql, type SQL } from "drizzle-orm";

/**
 * OUVERTURE D'UN PASSAGE PARKING DEPUIS LA RÉCEPTION ATELIER
 *
 * Le registre parking est un registre **par passage** : un véhicule qui revient
 * doit avoir une nouvelle ligne, et l'ancienne doit rester `SORTI`. Avant ce
 * service, `or.receptionner` ne créait aucune ligne : un véhicule reçu pour la
 * première fois n'existait pas au parking, et un véhicule déjà passé voyait
 * toutes ses anciennes lignes réécrites par la projection de statut.
 *
 * Ce service est volontairement transactionnel : il est appelé dans la
 * transaction de `or.receptionner`, avec le même `tx` que l'OR. Si l'insertion
 * du passage échoue, l'OR n'est pas créé non plus.
 */

type Exec = { execute(query: SQL): Promise<unknown> };
type Row = Record<string, unknown>;

const NUMERO_REGISTRE_INTERDIT = 33;

/**
 * Réserve le prochain numéro de registre de l'agence.
 *
 * Le verrou consultatif est nécessaire : `max(num_registre) + 1` seul laisse
 * deux réceptions concurrentes choisir le même numéro. Le verrou est
 * transactionnel et se libère au commit/rollback.
 */
export async function prochainNumeroRegistre(exec: Exec, agenceId: number): Promise<number> {
  await exec.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`parking_num_registre_${agenceId}`})::bigint)`,
  );
  const rows = (await exec.execute(
    sql`SELECT coalesce(max(num_registre), 0)::int AS max
        FROM parking_vehicles
        WHERE agence_id = ${agenceId}`,
  )) as unknown as Row[];
  let numero = Number(rows[0]?.max ?? 0) + 1;
  if (numero === NUMERO_REGISTRE_INTERDIT) numero += 1;
  return numero;
}

export type PassageReception = {
  agenceId: number;
  vehiculeId: number;
  orId: number;
  motif?: string | null;
};

/**
 * Crée — ou réutilise — le passage parking actif du véhicule.
 *
 * - Si un passage actif existe déjà, il est réutilisé : deux réceptions
 *   successives sans sortie ne doivent pas créer deux places occupées.
 * - Sinon, une nouvelle ligne est créée avec un nouveau numéro de registre.
 * - Le lien `or_id` est posé dans les deux cas.
 *
 * Le passage actif est verrouillé `FOR UPDATE` pour éviter deux créations
 * concurrentes sur le même véhicule.
 */
export async function ouvrirPassageReception(
  exec: Exec,
  params: PassageReception,
): Promise<number | null> {
  const { agenceId, vehiculeId, orId, motif } = params;
  if (!vehiculeId || !orId) return null;

  const actifs = (await exec.execute(
    sql`SELECT id
        FROM parking_vehicles
        WHERE agence_id = ${agenceId}
          AND vehicule_id = ${vehiculeId}
          AND statut <> 'SORTI'
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
  )) as unknown as Row[];

  const actif = actifs[0];
  if (actif?.id) {
    const parkingId = Number(actif.id);
    await exec.execute(
      sql`UPDATE parking_vehicles
          SET or_id = ${orId},
              date_derniere_action = now(),
              updated_at = now()
          WHERE id = ${parkingId}
            AND agence_id = ${agenceId}`,
    );
    return parkingId;
  }

  const [vehicule] = (await exec.execute(
    sql`SELECT marque, modele, version, couleur, immatriculation, numero_chassis
        FROM vehicules
        WHERE id = ${vehiculeId} AND agence_id = ${agenceId}
        LIMIT 1`,
  )) as unknown as Row[];

  if (!vehicule) return null;

  const [client] = (await exec.execute(
    sql`SELECT c.nom, c.prenom, c.raison_sociale, c.telephone
        FROM ordres_reparation o
        LEFT JOIN clients c ON c.id = o.client_id
        WHERE o.id = ${orId} AND o.agence_id = ${agenceId}
        LIMIT 1`,
  )) as unknown as Row[];

  const clientNom = client
    ? String(client.raison_sociale ?? [client.prenom, client.nom].filter(Boolean).join(" ")).trim() || null
    : null;
  const clientTelephone = client?.telephone ? String(client.telephone) : null;

  const numRegistre = await prochainNumeroRegistre(exec, agenceId);

  const [created] = (await exec.execute(
    sql`INSERT INTO parking_vehicles
          (agence_id, vehicule_id, or_id, num_registre, marque, modele, version,
           couleur, immatriculation, vin, client_nom, client_telephone,
           statut, motif, date_entree, date_derniere_action, photos, photo_presente)
        VALUES
          (${agenceId}, ${vehiculeId}, ${orId}, ${numRegistre},
           ${vehicule.marque ?? null}, ${vehicule.modele ?? null}, ${vehicule.version ?? null},
           ${vehicule.couleur ?? null}, ${vehicule.immatriculation ?? null}, ${vehicule.numero_chassis ?? null},
           ${clientNom}, ${clientTelephone}, 'EN_PARKING', ${motif ?? null},
           now(), now(), '[]'::jsonb, false)
        RETURNING id`,
  )) as unknown as Row[];

  const parkingId = created?.id ? Number(created.id) : null;
  return parkingId;
}
