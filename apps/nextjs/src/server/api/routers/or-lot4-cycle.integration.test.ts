/**
 * LOT 4 — Qualité : happy-path complet du cycle OR (réception → clôture).
 *
 * Scénario de bout en bout via les vrais endpoints tRPC (couche API —
 * pattern D8 rodé des Lots 0-3 ; Playwright UI reporté, voir CDC §3.5) :
 *
 *  1. `or.receptionner`            → OR EN_ATTENTE_DIAGNOSTIC (+ client/véhicule créés)
 *  2. `or.creerRapportDiagnostic`  → rapport SOUMIS, OR EN_ATTENTE_VALIDATION_DIAGNOSTIC
 *  3. `or.validerDiagnostic`       → rapport VALIDE, OR EN_COURS
 *  4. `or.soumettreDevis`          → OR EN_ATTENTE_VALIDATION
 *  5. `or.validerDevis` (accepté)  → OR EN_COURS, devisAccepte
 *  6. `or.changerStatut` (QC)      → OR CONTROLE_QUALITE
 *  7. `or.validerControleQualite`  → checklist conforme, OR PRET_A_LIVRER
 *  8. `or.facturer` (espèces)      → vente émise + soldée, or.venteId/totalFacture
 *  9. `or.restituerVehicule`       → OR LIVRE, véhicule « sorti » (projection Lot 1)
 * 10. `or.fermerDefinitivement`    → OR ferme_definitif (QC + restitution + solde)
 *
 * Garanties : transitions homologuées (atelier-service), verrous T0 (dossier
 * ouvert, statuts facturables), historique exhaustif, projection parking.
 *
 * Fixtures namespace `lot4`, immat `LOT4CYCLE01` (unicité globale des n° OR/FAC — D4).
 */

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { orRouter } from "~/server/api/routers/or-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "lot4";
const ROLE_CODE = `${NS}_cycle`;
const USER_EMAIL = `${NS}.cycle@gpj.cm`;
const IMAAT = "LOT4CYCLE01";
const CLIENT_NOM = "LOT4 Client Cycle";

type Row = Record<string, unknown>;

let userId = 0;
let orId = 0;
let orNumero = "";
let rapportId = 0;
let vehiculeId = 0;
let clientId = 0;
let venteId = 0;

function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "Lot4 superadmin",
    email: USER_EMAIL,
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

async function lireStatutOR(): Promise<string> {
  const [row] = (await db.execute(
    sql`SELECT statut, vente_id, total_facture FROM ordres_reparation WHERE id = ${orId}`,
  )) as unknown as Row[];
  return String(row?.statut ?? "");
}

async function retirer(): Promise<void> {
  // Ordre FK : journal → lignes → rapports → OR → ventes → véhicule → client → fixtures.
  await db.execute(sql`DELETE FROM atelier_notifications WHERE or_id = ${orId}`);
  await db.execute(sql`DELETE FROM or_photos WHERE or_id = ${orId}`);
  await db.execute(sql`DELETE FROM or_controles_qualite WHERE or_id = ${orId}`);
  await db.execute(sql`DELETE FROM or_restitutions WHERE or_id = ${orId}`);
  await db.execute(sql`DELETE FROM or_historique WHERE or_id = ${orId}`);
  await db.execute(sql`DELETE FROM lignes_ordre_reparation WHERE ordre_id = ${orId}`);
  await db.execute(sql`DELETE FROM or_rapports_diagnostic WHERE or_id = ${orId}`);
  await db.execute(sql`DELETE FROM ordres_reparation WHERE id = ${orId}`);
  if (venteId) {
    await db.execute(sql`DELETE FROM ventes_lignes WHERE vente_id = ${venteId}`);
    await db.execute(sql`DELETE FROM dettes_clients WHERE vente_id = ${venteId}`);
    await db.execute(sql`DELETE FROM ventes WHERE id = ${venteId}`);
  }
  if (vehiculeId) {
    await db.execute(sql`DELETE FROM parking_vehicles WHERE vehicule_id = ${vehiculeId}`);
    await db.execute(sql`DELETE FROM vehicules WHERE id = ${vehiculeId}`);
  }
  if (clientId) await db.execute(sql`DELETE FROM clients WHERE id = ${clientId}`);
  // Filet de sécurité (si ids non capturés) : marqueur LOT4.
  await db.execute(sql`DELETE FROM ordres_reparation WHERE numero LIKE 'OR-%' AND id IN (SELECT id FROM ordres_reparation WHERE pannes_declarees LIKE 'LOT4%')`);
  await db.execute(sql`DELETE FROM vehicules WHERE upper(regexp_replace(btrim(immatriculation), '[[:space:]]+', '', 'g')) = ${IMAAT}`);
  await db.execute(sql`DELETE FROM clients WHERE nom = ${CLIENT_NOM}`);
  await db.execute(
    sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL})`,
  );
  await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`);
  await db.execute(sql`DELETE FROM roles WHERE code = ${ROLE_CODE}`);
  userId = 0;
  orId = 0;
  orNumero = "";
  rapportId = 0;
  vehiculeId = 0;
  clientId = 0;
  venteId = 0;
}

beforeAll(async () => {
  await retirer();

  await db.execute(
    sql`INSERT INTO roles (code, nom, description, niveau)
        VALUES (${ROLE_CODE}, 'Lot4 Cycle', 'Fixture Lot4', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`)) as unknown as Row[];
  if (!role?.id) throw new Error(`Fixtures ${NS} : role introuvable.`);

  const insere = (await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'LOT4', 'Fixture', 1, ${role.id}::uuid, true, 'active')
        ON CONFLICT (email) DO NOTHING
        RETURNING id`,
  )) as unknown as Row[];
  userId = insere.length > 0
    ? Number(insere[0].id)
    : Number(
        ((await db.execute(sql`SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL}`)) as unknown as Row[])[0]?.id,
      );
  if (!Number.isFinite(userId)) throw new Error(`Fixtures ${NS} : utilisateur introuvable.`);
});

afterAll(async () => {
  await retirer();
});

describe("Lot 4 — cycle OR complet (réception → clôture définitive)", () => {
  it("1. réception : OR ouvert EN_ATTENTE_DIAGNOSTIC, client + véhicule créés", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const r = await caller.receptionner({
      client: { nom: CLIENT_NOM, telephone: "690000001" },
      vehicule: { immatriculation: IMAAT, marque: "Lot4", modele: "Cycle", typeVehicule: "voiture" },
      reception: { kilometrageEntree: 12000, pannesDeclarees: "LOT4 bruit roue avant", motEntree: "PANNE", priorite: "P3" },
    });

    orId = r.id;
    orNumero = r.numero;
    vehiculeId = r.vehiculeId;
    clientId = r.clientId;

    expect(orId).toBeGreaterThan(0);
    expect(orNumero).toMatch(/^OR-\d{2}-\d{4}$/);
    expect(await lireStatutOR()).toBe("EN_ATTENTE_DIAGNOSTIC");

    const [veh] = (await db.execute(
      sql`SELECT statut_immobilisation FROM vehicules WHERE id = ${vehiculeId}`,
    )) as unknown as Row[];

    // LOT P0.1. AVANT, ce test attendait « en réparation » — et c'était le
    // bug. `or.receptionner` écrivait `en_reception` à la création du
    // véhicule, puis `en_reparation` quarante lignes plus bas : deux statuts
    // écrits, un seul conservé, et celui qui restait n'était le statut
    // d'aucun fait réel. Le dossier venait d'être ouvert, il était en attente
    // de diagnostic ; dire « en réparation » sixty secondes après l'arrivée du
    // véhicule rendait le tableau de bord faux dès la première seconde.
    //
    // Le statut est maintenant dérivé du dossier : `EN_ATTENTE_DIAGNOSTIC`
    // → `en_reception`. Il passera à « en réparation » quand le dossier
    // passera en `EN_COURS` (étape 3), ce qui est le seul moment où c'est vrai.
    expect(veh?.statut_immobilisation).toBe("en_reception");
  });

  it("2. diagnostic soumis : rapport SOUMIS, OR en attente de validation", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const r = await caller.creerRapportDiagnostic({
      orId,
      constat: "LOT4 roulement de roue avant HS",
      lignes: [
        { type: "SERVICE", libelle: "LOT4 main d'oeuvre remplacement roulement", quantite: 1, prixUnitaire: 15000, tva: 0, dureeHeures: 1 },
        { type: "PIECE", libelle: "LOT4 roulement avant", quantite: 1, prixUnitaire: 25000, tva: 0 },
      ],
    });

    rapportId = r.rapportId;
    expect(rapportId).toBeGreaterThan(0);
    expect(await lireStatutOR()).toBe("EN_ATTENTE_VALIDATION_DIAGNOSTIC");
  });

  it("3. diagnostic validé : OR EN_COURS", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    await caller.validerDiagnostic({ rapportId, commentaire: "LOT4 conforme" });
    expect(await lireStatutOR()).toBe("EN_COURS");

    const [rap] = (await db.execute(
      sql`SELECT statut FROM or_rapports_diagnostic WHERE id = ${rapportId}`,
    )) as unknown as Row[];
    expect(rap?.statut).toBe("VALIDE");
  });

  it("4. devis soumis : EN_ATTENTE_VALIDATION, non accepté", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    await caller.soumettreDevis({ orId });
    expect(await lireStatutOR()).toBe("EN_ATTENTE_VALIDATION");

    const [or] = (await db.execute(
      sql`SELECT devis_accepte FROM ordres_reparation WHERE id = ${orId}`,
    )) as unknown as Row[];
    expect(or?.devis_accepte).toBe(false);
  });

  it("5. devis accepté : retour EN_COURS, devisAccepte", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const r = await caller.validerDevis({ orId, accepte: true });
    expect(r.accepte).toBe(true);
    expect(await lireStatutOR()).toBe("EN_COURS");

    const [or] = (await db.execute(
      sql`SELECT devis_accepte FROM ordres_reparation WHERE id = ${orId}`,
    )) as unknown as Row[];
    expect(or?.devis_accepte).toBe(true);
  });

  it("6. passage en contrôle qualité : CONTROLE_QUALITE", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    await caller.changerStatut({ id: orId, nouveauStatut: "CONTROLE_QUALITE", commentaire: "LOT4 travaux terminés" });
    expect(await lireStatutOR()).toBe("CONTROLE_QUALITE");
  });

  it("6b. les travaux sont terminés AVANT le contrôle qualité (LOT P0.3)", async () => {
    // Avant le lot P0.3, ce contrôle qualité passait avec des lignes en
    // `a_faire` : le contrôle n'en regardait aucune. Il suffisait donc à
    // valider la QC pour rendre un dossier avec du travail non fait
    // restituable. La garde `lignesNonReglees` referme ce chemin — et ce
    // test doit désormais terminer le travail avant de contrôler.
    const lignes = (await db.execute(
      sql`SELECT id, statut FROM lignes_ordre_reparation WHERE ordre_id = ${orId}`,
    )) as unknown as Row[];
    expect(lignes.length).toBeGreaterThan(0);

    // Tant que le travail n'est pas fait, le contrôle qualité est refusé.
    const caller = orRouter.createCaller(ctxSuperadmin());
    const refus = await caller
      .validerControleQualite({
        orId,
        checklist: [{ libelle: "LOT4 conformité", ok: true }],
        resultat: "VALIDE",
      })
      .then(() => "AUCUN")
      .catch((e: { code?: string }) => e.code ?? "AUTRE");
    expect(refus).toBe("BAD_REQUEST");

    // Une fois les travaux faits, il passe.
    for (const l of lignes) {
      await db.execute(
        sql`UPDATE lignes_ordre_reparation SET statut = 'fait' WHERE id = ${Number(l.id)}`,
      );
    }
  });

  it("7. QC validé : PRET_A_LIVRER", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const r = await caller.validerControleQualite({
      orId,
      checklist: [
        { libelle: "LOT4 essai routier bruit", ok: true },
        { libelle: "LOT4 serrures roues", ok: true },
      ],
      essaiRoutier: true,
      resultat: "VALIDE",
      observations: "LOT4 conforme",
    });
    expect(r.nouveauStatut).toBe("PRET_A_LIVRER");
    expect(await lireStatutOR()).toBe("PRET_A_LIVRER");
  });

  it("8. facturation espèces : vente émise + soldée, OR lié", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const r = await caller.facturer({ id: orId, modePaiement: "especes" });
    venteId = r.venteId;

    expect(venteId).toBeGreaterThan(0);
    expect(r.reference).toMatch(/^FAC-\d{4}-\d{4,5}$/);
    expect(r.montantTotal).toBe(40000); // 15000 + 25000

    const [or] = (await db.execute(
      sql`SELECT vente_id, total_facture FROM ordres_reparation WHERE id = ${orId}`,
    )) as unknown as Row[];
    expect(Number(or?.vente_id)).toBe(venteId);
    expect(Number(or?.total_facture)).toBe(40000);

    const [vente] = (await db.execute(
      sql`SELECT montant_total, montant_paye, statut FROM ventes WHERE id = ${venteId}`,
    )) as unknown as Row[];
    expect(Number(vente?.montant_paye)).toBe(Number(vente?.montant_total)); // soldée
    expect(vente?.statut).toBe("termine");
  });

  it("9. restitution : OR LIVRE, véhicule « sorti » (projection parking)", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const r = await caller.restituerVehicule({
      orId,
      kilometrageSortie: 12050,
      checklist: [{ libelle: "LOT4 état extérieur", ok: true }],
      recuperateurNom: "LOT4 Client",
      signatureClient: "LOT4 Client",
    });
    expect(r.success).toBe(true);
    expect(await lireStatutOR()).toBe("LIVRE");

    const [veh] = (await db.execute(
      sql`SELECT statut_immobilisation, kilometrage FROM vehicules WHERE id = ${vehiculeId}`,
    )) as unknown as Row[];
    expect(veh?.statut_immobilisation).toBe("sorti");
    expect(Number(veh?.kilometrage)).toBe(12050);

    // Historique RESTITUTION tracé.
    const [hist] = (await db.execute(
      sql`SELECT count(*)::int AS n FROM or_historique WHERE or_id = ${orId} AND type = 'RESTITUTION'`,
    )) as unknown as Row[];
    expect(Number(hist?.n)).toBeGreaterThanOrEqual(1);
  });

  it("10. clôture définitive : ferme_definitif (QC + restitution + solde)", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const r = await caller.fermerDefinitivement({ id: orId, motif: "LOT4 dossier complet" });
    expect(r.success).toBe(true);
    expect(r.numero).toBe(orNumero);
    expect(await lireStatutOR()).toBe("ferme_definitif");

    // T0.3 : un dossier fermé est figé — facturation refusée.
    await expect(caller.facturer({ id: orId, modePaiement: "especes" })).rejects.toThrow(/fermé définitivement/i);
  });
});
