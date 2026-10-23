/**
 * COMPTES RENDUS TECHNICIENS — visibles dans l'OR, la fiche 360 et le journal.
 *
 * Ce test relie les trois lectures qui existaient séparément :
 *  - `or.getById` doit renvoyer les comptes rendus du dossier ;
 *  - `vehicules.get` doit renvoyer les champs de ligne nécessaires à la fiche ;
 *  - `interventions.fluxAtelier` doit retrouver le compte rendu par plaque.
 */
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { vehiculesRouter } from "~/server/api/routers/vehicules-router";
import { interventionsRouter } from "~/server/api/routers/interventions-router";
import { db } from "~/server/db";

const NS = "fluxcr";
const EMAIL = `${NS}.test@gpj.cm`;
const ROLE = `${NS}_role`;
const IMMAT = "FLUXCR-001";
let userId = 0;

function ctx() {
  const user = {
    id: String(userId), name: "Flux CR", email: EMAIL, agenceId: 1,
    agenceName: "GPJ", organizationId: "1", role: "superadmin",
    permissions: [], isActive: true, status: "active",
  };
  return { headers: new Headers(), user, session: { user, expires: "2099-01-01T00:00:00.000Z" } } as never;
}

const or = () => orRouter.createCaller(ctx());
const veh = () => vehiculesRouter.createCaller(ctx());
const inter = () => interventionsRouter.createCaller(ctx());

async function nettoyer(): Promise<void> {
  await db.execute(sql`
    DELETE FROM or_interventions
    WHERE or_id IN (SELECT id FROM ordres_reparation
      WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immat_norm LIKE ${`${NS.toUpperCase()}%`}))`);
  await db.execute(sql`
    DELETE FROM lignes_ordre_reparation
    WHERE ordre_id IN (SELECT id FROM ordres_reparation
      WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immat_norm LIKE ${`${NS.toUpperCase()}%`}))`);
  await db.execute(sql`
    DELETE FROM parking_movements
    WHERE vehicle_id IN (SELECT id FROM parking_vehicles
      WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immat_norm LIKE ${`${NS.toUpperCase()}%`}))`);
  await db.execute(sql`
    DELETE FROM parking_vehicles
    WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immat_norm LIKE ${`${NS.toUpperCase()}%`})`);
  await db.execute(sql`
    DELETE FROM ordres_reparation
    WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immat_norm LIKE ${`${NS.toUpperCase()}%`})`);
  await db.execute(sql`DELETE FROM vehicules WHERE immat_norm LIKE ${`${NS.toUpperCase()}%`}`);
  await db.execute(sql`DELETE FROM clients WHERE nom LIKE ${`Client ${NS}%`}`);
  await db.execute(sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM utilisateurs WHERE email = ${EMAIL})`);
}

beforeAll(async () => {
  await nettoyer();
  await db.execute(sql`
    INSERT INTO roles (code, nom, description, niveau)
    VALUES (${ROLE}, 'Flux CR', 'Fixture flux', 0)
    ON CONFLICT (code) DO NOTHING`);
  const [role] = (await db.execute(sql`SELECT id FROM roles WHERE code = ${ROLE}`)) as unknown as { id: string }[];
  await db.execute(sql`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
    VALUES (${EMAIL}, 'Flux', 'Test', 1, ${role!.id}::uuid, true, 'active')
    ON CONFLICT (email) DO NOTHING`);
  const [u] = (await db.execute(sql`SELECT id FROM utilisateurs WHERE email = ${EMAIL}`)) as unknown as { id: string }[];
  userId = Number(u!.id);
});

beforeEach(nettoyer);
afterAll(async () => {
  await nettoyer();
  await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${EMAIL}`);
  await db.execute(sql`DELETE FROM roles WHERE code = ${ROLE}`);
  userId = 0;
});

describe("Comptes rendus techniciens — trois lectures cohérentes", () => {
  it("le compte rendu est lisible dans l'OR, la fiche et le journal", async () => {
    const r = await or().receptionner({
      client: { nom: `Client ${NS}`, telephone: "699000202" },
      vehicule: { immatriculation: IMMAT, marque: "Flux", modele: "CR" },
      reception: { kilometrageEntree: 5000, pannesDeclarees: "Bruit" },
    });
    const ligne = await or().addLigne({
      ordreId: r.id,
      type: "SERVICE",
      libelle: "Contrôle train avant",
      quantite: 1,
      prixUnitaire: 10000,
    });
    await inter().ecrire({
      ligneId: ligne.id,
      constat: "Jeu dans la rotule",
      intervention: "Remplacement prévu",
      suite: "Attente pièce",
    });

    const detail = await or().getById({ id: r.id });
    expect((detail as any).interventions).toHaveLength(1);
    expect((detail as any).interventions[0].ligneLibelle).toBe("Contrôle train avant");

    const fiche = await veh().get({ id: r.vehiculeId });
    const ligneFiche = (fiche as any).lignesTravaux.find((l: any) => l.id === ligne.id);
    expect(ligneFiche).toBeDefined();
    expect(ligneFiche).toHaveProperty("statutAutorisation");
    expect(ligneFiche).toHaveProperty("technicienId");
    expect(ligneFiche).toHaveProperty("dureeHeures");

    const flux = await inter().fluxAtelier({ search: IMMAT });
    expect(flux).toHaveLength(1);
    expect(flux[0]!.constat).toBe("Jeu dans la rotule");
    expect(flux[0]!.numero).toBe((detail as any).numero);

    // Dashboard : deux OR sur le même véhicule = deux dossiers, un véhicule.
    const r2 = await or().receptionner({
      client: { id: r.clientId },
      vehicule: { id: r.vehiculeId, immatriculation: IMMAT },
      reception: { kilometrageEntree: 5100, pannesDeclarees: "Deuxième passage" },
    });
    const dash = await or().getDashboard();
    const dossiers = (dash as any).parc.filter((p: any) => p.vehiculeId === r.vehiculeId);
    expect(dossiers).toHaveLength(2);
    expect((dash as any).kpis.orOuverts).toBeGreaterThanOrEqual(2);
    expect(dossiers.find((p: any) => p.id === r.id).dernierCompteRendu.constat).toBe("Jeu dans la rotule");

    // Un dossier fermé définitivement ne doit plus compter dans le parc actif.
    await db.execute(sql`UPDATE ordres_reparation SET statut = 'ferme_definitif' WHERE id = ${r2.id}`);
    const dash2 = await or().getDashboard();
    const dossiers2 = (dash2 as any).parc.filter((p: any) => p.vehiculeId === r.vehiculeId);
    expect(dossiers2).toHaveLength(1);
    expect(dossiers2[0]!.id).toBe(r.id);
  });

  it("la cession de propriétaire est explicite et synchronise le passage actif", async () => {
    const r = await or().receptionner({
      client: { nom: `Client ${NS}`, telephone: "699000203" },
      vehicule: { immatriculation: "FLUXCR-002", marque: "Flux", modele: "Cession" },
      reception: { kilometrageEntree: 1000, pannesDeclarees: "Cession" },
    });
    const [client] = (await db.execute(sql`
      INSERT INTO clients (nom, telephone, agence_id, statut, type_client, is_active)
      VALUES (${`Client ${NS} cession`}, '699000204', 1, 'ACTIF', 'PART', true)
      RETURNING id`)) as unknown as { id: number }[];

    await veh().ceder({ id: r.vehiculeId, clientId: Number(client!.id), motif: "Vente au client cession" });

    const [v] = (await db.execute(sql`SELECT client_id FROM vehicules WHERE id = ${r.vehiculeId}`)) as unknown as { client_id: number }[];
    const [p] = (await db.execute(sql`
      SELECT client_nom FROM parking_vehicles
      WHERE vehicule_id = ${r.vehiculeId} AND statut <> 'SORTI'
      ORDER BY id DESC LIMIT 1`)) as unknown as { client_nom: string }[];
    expect(Number(v!.client_id)).toBe(Number(client!.id));
    expect(p!.client_nom).toBe(`Client ${NS} cession`);
  });
});
