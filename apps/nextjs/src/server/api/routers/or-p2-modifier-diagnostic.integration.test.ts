/**
 * ÉTAPE 2c — reprendre un constat de diagnostic après coup.
 *
 * ## Ce qui manquait
 *
 * Le constat se posait UNE fois, à la création du rapport. Ensuite : figé. Un
 * technicien qui se trompe de formulation, ou qui complète après avoir vu la
 * voiture sur le pont, devait rouvrir un dossier — ce qu'il ne fait pas, et le
 * diagnostic reste faux en silence.
 *
 * ## La règle qu'il ne fallait pas contourner
 *
 * La machine d'états ne permet AUCUNE transition depuis `VALIDE`. Valider
 * engage la responsabilité du validateur : un constat validé doit pouvoir être
 * cité comme un engagement, sinon il ne vaut rien.
 *
 * Une interface qui aurait su modifier un rapport validé aurait rendu cette
 * règle décorative — et c'est le piège dans lequel on est déjà tombés deux
 * fois sur d'autres règles (l'écran « Réassigner », le statut parking).
 *
 * ## Les garanties
 *
 *  1. Un rapport BROUILLON / SOUMIS / RETOURNE se modifie.
 *  2. Un rapport VALIDE est REFUSÉ, et le message explique pourquoi.
 *  3. Une modification est journalisée avec son auteur.
 *  4. Une « sauvegarde » sans aucun champ modifié n'écrit RIEN : sans cela la
 *     date de modification avance et le rapport semble avoir bougé.
 *  5. Un dossier fermé refuse.
 *  6. Un constat trop court est refusé par le schéma (min 3).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import postgres from "postgres";
import { orRouter } from "~/server/api/routers/or-router";

const NS = "p2diag";
const AGENCE = 1;
const USER_EMAIL = "p2diag@x.test";
let userId = 0;
let roleId = 0;
let client: ReturnType<typeof postgres>;

function ctx() {
  const user = {
    id: String(userId), name: "P2Diag", email: USER_EMAIL,
    agenceId: AGENCE, agenceName: "TEST", organizationId: "1",
    role: "superadmin", permissions: [], isActive: true, status: "active",
  };
  return { headers: new Headers(), user, session: { user, expires: "2099-01-01T00:00:00.000Z" } } as never;
}

const caller = () => orRouter.createCaller(ctx());

async function nettoyerMetier(): Promise<void> {
  await client`DELETE FROM or_rapports_diagnostic WHERE constat LIKE ${`%${NS}%`}`;
  await client`DELETE FROM ordres_reparation WHERE numero LIKE ${`%${NS}%`}`;
  await client`DELETE FROM vehicules WHERE marque LIKE ${`%${NS}%`}`;
}

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { ssl: false, prepare: false, max: 1 });
  await nettoyerMetier();
  const [role] = await client`
    INSERT INTO roles (code, nom, description, niveau)
    VALUES (${`${NS}_modif`}, 'P2Diag', 'Fixture', 0)
    ON CONFLICT (code) DO NOTHING RETURNING id`;
  roleId = role?.id ?? (await client`SELECT id FROM roles WHERE code = ${`${NS}_modif`}`)[0]!.id;
  await client`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
    VALUES (${USER_EMAIL}, 'P2Diag', 'Nora', ${AGENCE}, ${roleId}::uuid, true, 'active')
    ON CONFLICT (email) DO NOTHING`;
  userId = (await client`SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL}`)[0]!.id;
}, 30000);

afterAll(async () => {
  await nettoyerMetier();
  await client.end();
});

/** Rapport de diagnostic dans l'état demandé. */
async function rapport(statut: "BROUILLON" | "SOUMIS" | "VALIDE", statutDossier = "EN_COURS") {
  await nettoyerMetier();
  const [v] = await client`
    INSERT INTO vehicules (agence_id, immatriculation, marque, modele, statut_immobilisation, is_active)
    VALUES (${AGENCE}, ${`DG-${NS}-1`}, ${`${NS}-M`}, 'Mod', 'en_reception', true) RETURNING id`;
  const [o] = await client`
    INSERT INTO ordres_reparation (vehicule_id, agence_id, numero, statut, date_ouverture)
    VALUES (${v!.id}, ${AGENCE}, ${`${NS}-OR-${Date.now()}`}, ${statutDossier}, now()) RETURNING id`;
  const [r] = await client`
    INSERT INTO or_rapports_diagnostic (or_id, constat, cause, statut, date_soumission)
    VALUES (${o!.id}, ${`${NS}-constat initial`}, 'cause initiale', ${statut}, now()) RETURNING id`;
  return { orId: o!.id as number, rapportId: r!.id as number };
}

describe("Reprendre un constat de diagnostic", () => {
  it("1. un rapport BROUILLON se modifie", async () => {
    const { rapportId } = await rapport("BROUILLON");
    const r = await caller().modifierDiagnostic({ id: rapportId, constat: `${NS}-constat corrige` });
    expect(r.modifie).toBe(true);
    const [l] = await client`SELECT constat FROM or_rapports_diagnostic WHERE id = ${rapportId}`;
    expect(l!.constat).toContain("corrige");
  }, 30000);

  it("2. un rapport VALIDE est REFUSÉ, et le message dit pourquoi", async () => {
    const { rapportId } = await rapport("VALIDE");
    let message = "";
    try {
      await caller().modifierDiagnostic({ id: rapportId, constat: `${NS}-tentative` });
    } catch (e: any) {
      message = e?.message ?? String(e);
    }
    expect(message, "un rapport validé doit être gelé").not.toBe("");
    expect(message).toContain("VALIDÉ");
  }, 30000);

  it("3. une modification est journalisée avec son auteur", async () => {
    const { orId, rapportId } = await rapport("SOUMIS");
    await caller().modifierDiagnostic({ id: rapportId, constat: `${NS}-avec trace` });
    const [h] = await client`
      SELECT type, change_par FROM or_historique
      WHERE or_id = ${orId} AND type = 'DIAGNOSTIC' ORDER BY id DESC LIMIT 1`;
    expect(h, "la modification doit être journalisée").toBeDefined();
    expect(h!.change_par).toBe(userId);
  }, 30000);

  it("4. une sauvegarde sans changement n'écrit RIEN", async () => {
    const { rapportId } = await rapport("SOUMIS");
    const avant = (await client`SELECT updated_at FROM or_rapports_diagnostic WHERE id = ${rapportId}`)[0]!.updated_at;
    const r = await caller().modifierDiagnostic({ id: rapportId });
    const apres = (await client`SELECT updated_at FROM or_rapports_diagnostic WHERE id = ${rapportId}`)[0]!.updated_at;
    expect(r.modifie).toBe(false);
    // La date ne doit pas bouger : sinon le rapport « a changé » sans rien changer.
    expect(String(apres)).toBe(String(avant));
  }, 30000);

  it("5. un dossier fermé refuse la modification", async () => {
    const { rapportId } = await rapport("SOUMIS", "ferme_definitif");
    let refuse = false;
    try {
      await caller().modifierDiagnostic({ id: rapportId, constat: `${NS}-tente` });
    } catch {
      refuse = true;
    }
    expect(refuse).toBe(true);
  }, 30000);

  it("6. un constat trop court est refusé", async () => {
    const { rapportId } = await rapport("BROUILLON");
    let refuse = false;
    try {
      await caller().modifierDiagnostic({ id: rapportId, constat: "x" });
    } catch {
      refuse = true;
    }
    expect(refuse).toBe(true);
  }, 30000);
});