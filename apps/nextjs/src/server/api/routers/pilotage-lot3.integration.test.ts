/**
 * LOT 3 — Pilotage (dashboard direction).
 *
 * Garanties testées contre la base de test :
 *
 *  1. `atelierKpi.tempsParStatut` : agrégation des durées par statut depuis
 *     `or_historique` (intervalles découpés aux transitions, fenêtre glissante).
 *  2. `or.getDashboard.chargeTechniciens` : charge par technicien actif via le
 *     helper partagé `chargeTechnicien` (capacité 5, dépassement > 80 %).
 *  3. `garage.vehicule` : bloc `atelier.ors` (OR en cours du canonique lié).
 *  4. `garage.vehiculeParCanonique` : fiche atelier → emplacement parking
 *     (lien croisé 360°) ; null si non suivi au parking.
 *  5. `atelierKpi.getSanteGarage` : score global (0-100 + verdict) — helper
 *     `scoreSante` désormais branché.
 *  6. `kpiCibles` : les 6 cibles par défaut sont présentes pour l'agence 1
 *     (data-migration `migrate-kpi-cibles` invoquée par `db:test-setup`).
 *
 * Fixtures RBAC réelles — namespace `lot3`, bande de registre 9300-9399,
 * numéros OR `LOT3-*` (uniques globalement — D4).
 */

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { atelierKpiRouter } from "~/server/api/routers/atelier-kpi-router";
import { orRouter } from "~/server/api/routers/or-router";
import { garageRouter } from "~/server/api/routers/garage-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "lot3";
const ROLE_CODE = `${NS}_pilotage`;
const USER_EMAIL = `${NS}.pilotage@gpj.cm`;
const NUM_MIN = 9300;
const NUM_MAX = 9399;
const I_VEH1 = "LOT3VEH01";
const I_VEH2 = "LOT3VEH02";
const OR_NUM = "LOT3-OR-001";

type Row = Record<string, unknown>;

const IN = (valeurs: readonly string[]) =>
  sql.join(
    valeurs.map((v) => sql`${v}`),
    sql`, `,
  );

let userId = 0;
let employeId = 0;
let parkingId = 0;
let canonId = 0;
let orId = 0;

function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "Lot3 superadmin",
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

async function retirer(): Promise<void> {
  // Une restitution porte une FK vers l'OR : elle doit partir AVANT lui.
  // Sinon le nettoyage échoue et un `LIVRE` de fixture survit d'une exécution
  // à l'autre, faisant échouer l'invariant global selon l'ordre des fichiers.
  await db.execute(sql`DELETE FROM or_restitutions WHERE or_id IN (SELECT id FROM ordres_reparation WHERE numero LIKE 'LOT3-%')`);
  await db.execute(sql`DELETE FROM or_historique WHERE or_id IN (SELECT id FROM ordres_reparation WHERE numero LIKE 'LOT3-%')`);
  await db.execute(sql`DELETE FROM ordres_reparation WHERE numero LIKE 'LOT3-%'`);
  await db.execute(
    sql`DELETE FROM parking_alerts WHERE vehicle_id IN (SELECT id FROM parking_vehicles WHERE num_registre BETWEEN ${NUM_MIN} AND ${NUM_MAX})`,
  );
  await db.execute(
    sql`DELETE FROM parking_movements WHERE vehicle_id IN (SELECT id FROM parking_vehicles WHERE num_registre BETWEEN ${NUM_MIN} AND ${NUM_MAX})`,
  );
  await db.execute(sql`DELETE FROM parking_vehicles WHERE num_registre BETWEEN ${NUM_MIN} AND ${NUM_MAX}`);
  await db.execute(
    sql`DELETE FROM vehicules WHERE upper(regexp_replace(btrim(immatriculation), '[[:space:]]+', '', 'g')) IN (${IN([I_VEH1, I_VEH2])})`,
  );
  await db.execute(sql`DELETE FROM employes WHERE nom = 'LOT3' AND prenom = 'Tech'`);
  await db.execute(sql`DELETE FROM hr_work_cycles WHERE name = 'LOT3 Cycle'`);
  await db.execute(
    sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL})`,
  );
  await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${USER_EMAIL}`);
  await db.execute(sql`DELETE FROM roles WHERE code = ${ROLE_CODE}`);
  userId = 0;
  employeId = 0;
  parkingId = 0;
  canonId = 0;
  orId = 0;
}

beforeAll(async () => {
  await retirer();

  await db.execute(
    sql`INSERT INTO roles (code, nom, description, niveau)
        VALUES (${ROLE_CODE}, 'Lot3 Pilotage', 'Fixture Lot3', 0)
        ON CONFLICT (code) DO NOTHING`,
  );
  const [role] = (await db.execute(sql`SELECT id FROM roles WHERE code = ${ROLE_CODE}`)) as unknown as Row[];
  const roleId = role?.id;
  if (!roleId) throw new Error(`Fixtures ${NS} : role introuvable.`);

  const insere = (await db.execute(
    sql`INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
        VALUES (${USER_EMAIL}, 'LOT3', 'Fixture', 1, ${roleId}::uuid, true, 'active')
        ON CONFLICT (email) DO NOTHING
        RETURNING id`,
  )) as unknown as Row[];
  userId = insere.length > 0
    ? Number(insere[0].id)
    : Number(
        ((await db.execute(sql`SELECT id FROM utilisateurs WHERE email = ${USER_EMAIL}`)) as unknown as Row[])[0]?.id,
      );
  if (!Number.isFinite(userId)) throw new Error(`Fixtures ${NS} : utilisateur introuvable.`);

  // Technicien actif.
  const [emp] = (await db.execute(
    sql`INSERT INTO employes (agence_id, nom, prenom, fonction, statut, matricule)
        VALUES (1, 'LOT3', 'Tech', 'technicien', 'actif', 'LOT3-EMP-01')
        RETURNING id`,
  )) as unknown as Row[];
  employeId = Number(emp.id);

  // Véhicule parking + canonique via le vrai endpoint de création.
  const caller = garageRouter.createCaller(ctxSuperadmin());
  const created = await caller.create({ numRegistre: 9301, immatriculation: I_VEH1, marque: "Lot3", modele: "Test" });
  parkingId = created.id;
  // Affecte un site pour que le join siteNom de vehiculeParCanonique soit renseigné.
  // Id du site réel du garage — jamais hard-codé : sur une base test constituée
  // après coup (-S1, -S2…), site 1 n'existe plus et la FK refuse l'affectation.
  const sites = (await db.execute(
    sql`SELECT id FROM parking_sites WHERE agence_id = 1 ORDER BY id LIMIT 1`,
  )) as unknown as Row[];
  let siteId = Number(sites[0]?.id);
  if (!Number.isFinite(siteId) || siteId <= 0) {
    const [s] = (await db.execute(
      sql`INSERT INTO parking_sites (agence_id, code, nom) VALUES (1, ${`${NS}-SITE`}, ${`${NS} Site`}) RETURNING id`,
    )) as unknown as Row[];
    siteId = Number(s.id);
  }
  await db.execute(sql`UPDATE parking_vehicles SET site_id = ${siteId} WHERE id = ${parkingId}`);
  const [p] = (await db.execute(
    sql`SELECT vehicule_id FROM parking_vehicles WHERE id = ${parkingId}`,
  )) as unknown as Row[];
  canonId = Number(p.vehicule_id);

  // OR actif ouvert il y a 3 jours, assigné au technicien fixture.
  const il3j = new Date(Date.now() - 3 * 86400000).toISOString();
  const [or] = (await db.execute(
    sql`INSERT INTO ordres_reparation (agence_id, numero, vehicule_id, statut, priorite, date_ouverture, responsable_technicien_id)
        VALUES (1, ${OR_NUM}, ${canonId}, 'EN_ATTENTE_PIECES', 'P3', ${il3j}, ${employeId})
        RETURNING id`,
  )) as unknown as Row[];
  orId = Number(or.id);

  // Transitions de statut dans or_historique : DIAG (J-3) → EN_COURS (J-2) → PIECES (J-1).
  const il2j = new Date(Date.now() - 2 * 86400000).toISOString();
  const il1j = new Date(Date.now() - 1 * 86400000).toISOString();
  await db.execute(
    sql`INSERT INTO or_historique (or_id, type, ancienne_valeur, nouvelle_valeur, change_le)
        VALUES (${orId}, 'STATUT', 'EN_ATTENTE_DIAGNOSTIC', 'EN_COURS', ${il2j}),
               (${orId}, 'STATUT', 'EN_COURS', 'EN_ATTENTE_PIECES', ${il1j}),
               (${orId}, 'VALIDATION_DEVIS', 'EN_ATTENTE_DIAGNOSTIC', 'EN_ATTENTE_VALIDATION', ${il2j}),
               (${orId}, 'VALIDATION_DEVIS', 'EN_ATTENTE_VALIDATION', 'EN_COURS', ${il1j})`,
  );

  // P3.3.3 — cycle de travail réel : sans horaires, le dénominateur serait
  // zéro et le SQL des heures vendues ne serait jamais exécuté.
  const [cycle] = (await db.execute(
    sql`INSERT INTO hr_work_cycles (name, description, is_default, active, agence_id)
        VALUES ('LOT3 Cycle', 'Fixture productivité', false, true, 1)
        RETURNING id`,
  )) as unknown as Row[];
  await db.execute(
    sql`INSERT INTO hr_work_schedules (cycle_id, day_of_week, start_time, end_time, expected_hours, is_working_day)
        SELECT ${Number(cycle.id)}, d, '08:00', '16:00',
               CASE WHEN d BETWEEN 1 AND 5 THEN 7 ELSE 0 END,
               d BETWEEN 1 AND 5
        FROM generate_series(0, 6) AS d`,
  );
  await db.execute(
    sql`UPDATE employes SET work_cycle_id = ${Number(cycle.id)}, date_embauche = '2020-01-01' WHERE id = ${employeId}`,
  );

  // OR livré la veille avec une heure de main-d'œuvre vendue pour ce technicien.
  const [orLivre] = (await db.execute(
    sql`INSERT INTO ordres_reparation (agence_id, numero, vehicule_id, statut, priorite, date_ouverture, date_cloture, responsable_technicien_id)
        VALUES (1, 'LOT3-OR-002', ${canonId}, 'LIVRE', 'P3', ${il2j}, ${il1j}, ${employeId})
        RETURNING id`,
  )) as unknown as Row[];
  // Preuve de restitution : `LIVRE` sans elle viole l'invariant métier global.
  await db.execute(
    sql`INSERT INTO or_restitutions (or_id, kilometrage_sortie, restitue_par, signature_client)
        VALUES (${Number(orLivre.id)}, 10000, ${userId}, 'Fixture LOT3')`,
  );
  await db.execute(
    sql`INSERT INTO lignes_ordre_reparation (ordre_id, type, libelle, duree_heures, technicien_id, statut, statut_autorisation)
        VALUES (${Number(orLivre.id)}, 'SERVICE', 'Main-d''œuvre fixture', 7, ${employeId}, 'valide', 'AUTORISE')`,
  );

  // Un OR annulé porte lui aussi une date_cloture : ses heures ne sont pas
  // vendues et ne doivent pas gonfler la productivité.
  const [orAnnule] = (await db.execute(
    sql`INSERT INTO ordres_reparation (agence_id, numero, vehicule_id, statut, priorite, date_ouverture, date_cloture, responsable_technicien_id)
        VALUES (1, 'LOT3-OR-003', ${canonId}, 'ANNULE', 'P3', ${il2j}, ${il1j}, ${employeId})
        RETURNING id`,
  )) as unknown as Row[];
  await db.execute(
    sql`INSERT INTO lignes_ordre_reparation (ordre_id, type, libelle, duree_heures, technicien_id, statut, statut_autorisation)
        VALUES (${Number(orAnnule.id)}, 'SERVICE', 'Heures annulées', 5, ${employeId}, 'valide', 'AUTORISE')`,
  );
});

afterAll(async () => {
  await retirer();
});

describe("Lot 3 — pilotage (dashboard direction)", () => {
  it("1. tempsParStatut agrège les durées depuis or_historique", async () => {
    const caller = atelierKpiRouter.createCaller(ctxSuperadmin());
    const r = await caller.tempsParStatut({ periode: "mois" });

    const parStatut = new Map(r.statuts.map((s) => [s.statut, s]));
    expect(parStatut.has("EN_ATTENTE_DIAGNOSTIC")).toBe(true);
    expect(parStatut.has("EN_COURS")).toBe(true);
    expect(parStatut.has("EN_ATTENTE_PIECES")).toBe(true);

    // Chaque segment dure ~1 jour (fenêtre sur 30 j, tolérance large).
    for (const code of ["EN_ATTENTE_DIAGNOSTIC", "EN_COURS", "EN_ATTENTE_PIECES"]) {
      expect(parStatut.get(code)!.totalJours).toBeGreaterThan(0.5);
      expect(parStatut.get(code)!.occurrences).toBeGreaterThanOrEqual(1);
      expect(parStatut.get(code)!.nbOrs).toBeGreaterThanOrEqual(1);
    }
    expect(r.totalOrsAvecHistorique).toBeGreaterThanOrEqual(1);
  });

  it("2. getDashboard expose chargeTechniciens (helper partagé)", async () => {
    const caller = orRouter.createCaller(ctxSuperadmin());
    const r = await caller.getDashboard();

    expect(Array.isArray(r.chargeTechniciens)).toBe(true);
    const tech = r.chargeTechniciens.find((c) => c.technicien.id === employeId);
    expect(tech).toBeDefined();
    expect(tech!.actifs).toBeGreaterThanOrEqual(1);
    expect(tech!.capacite).toBe(5);
    expect(typeof tech!.pourcent).toBe("number");
    expect(typeof tech!.depassement80).toBe("boolean");
  });

  it("3. garage.vehicule renvoie le bloc atelier (OR en cours du canonique)", async () => {
    const caller = garageRouter.createCaller(ctxSuperadmin());
    const r = await caller.vehicule({ id: parkingId });

    expect(r.atelier).not.toBeNull();
    expect(r.atelier!.ors.length).toBeGreaterThanOrEqual(1);
    expect(r.atelier!.ors[0]!.numero).toBe(OR_NUM);
    expect(r.atelier!.ors[0]!.statut).toBe("EN_ATTENTE_PIECES");
  });

  it("4. vehiculeParCanonique : emplacement parking depuis la fiche atelier", async () => {
    const caller = garageRouter.createCaller(ctxSuperadmin());

    const r = await caller.vehiculeParCanonique({ vehiculeId: canonId });
    expect(r).not.toBeNull();
    expect(r!.id).toBe(parkingId);
    expect(r!.siteNom).toBeTruthy();
    expect(r!.positionne).toBe(false); // non positionné sur le plan
    expect(typeof r!.alertesOuvertes).toBe("number");

    // Véhicule inconnu → null (aucune ligne parking).
    const manquant = await caller.vehiculeParCanonique({ vehiculeId: 99999999 });
    expect(manquant).toBeNull();
  });

  it("5. getSanteGarage retourne le score global (scoreSante branché)", async () => {
    const caller = atelierKpiRouter.createCaller(ctxSuperadmin());
    const r = await caller.getSanteGarage({ periode: "mois" });

    expect(r.score).toBeDefined();
    expect(typeof r.score!.score).toBe("number");
    expect(["BON", "MOYEN", "CRITIQUE"]).toContain(r.score!.verdict);
    // ÉTAPE 6 — le nombre seul ne suffit plus. Ce test affirmait « 6 », et
    // l'ajout du 7ᵉ KPI l'a fait échouer avec « expected 7 to be 6 » : le
    // nombre n'apprend rien sur CE QUI a changé. Une liste de codes, elle,
    // nomme le coupable — et un KPI retiré se voit aussi.
    expect(r.kpis.map((k: any) => k.code).sort()).toEqual(
      [
        "DELAI_PIECES_JOURS",
        "FIABILITE_APPRO",
        "FTQ", "MARGE_DOSSIER",
        "PONCTUALITE",
        "PRODUCTIVITE_TECHNICIEN",
        "RAPIDITE_DIAG_JOURS",
        "SATISFACTION_CLIENT",
        "TAUX_REACHAT",
        "TAUX_REPRISE",
        "TAUX_RETOUR_SAV",
        "TAUX_TRANSFORMATION_DEVIS",
      ].sort(),
    );
    // Et chacun annonce son dénominateur : une valeur sans « sur combien »
    // est une impression.
    for (const k of r.kpis as any[]) {
      expect(typeof k.n, `${k.code} sans dénominateur`).toBe("number");
    }
    // P3.3.7 : la série d'occupation est datée et complète, pas un instantané.
    expect(r.occupation).toHaveLength(12);
    expect(typeof r.occupation[0]!.moyenne).toBe("number");
    expect(r.occupation[0]!.debut < r.occupation[11]!.debut).toBe(true);
    // P3.3.4 : la rétention expose aussi sa liste d'action.
    expect(Array.isArray(r.clientsDormants)).toBe(true);
    // P3.3.6 : l'historique VALIDATION_DEVIS alimente le taux de transformation.
    const conversion = r.kpis.find((k: any) => k.code === "TAUX_TRANSFORMATION_DEVIS") as any;
    expect(conversion.n).toBeGreaterThanOrEqual(1);
    expect(typeof conversion.valeur).toBe("number");
    // P3.3.3 : cycle + ligne vendue réels, pas seulement les helpers purs.
    const productivite = r.kpis.find((k: any) => k.code === "PRODUCTIVITE_TECHNICIEN") as any;
    expect(productivite.n).toBeGreaterThanOrEqual(1);
    expect(typeof productivite.valeur).toBe("number");
    const detail = r.productivite.parTechnicien.find((p: any) => p.technicienId === employeId);
    expect(detail?.heuresVendues).toBe(7);
    expect(detail?.heuresDisponibles).toBeGreaterThan(0);
  });

  it("6. chaque KPI a SA cible — sans elle, il reste voué au SANS_DATA", async () => {
    const caller = atelierKpiRouter.createCaller(ctxSuperadmin());
    const cibles = await caller.getCibles();

    const codes = new Set(cibles.map((c) => c.code));
    // La liste est vérifiée PAR CODE, pas par nombre : un test qui compte
    // n'apprend rien sur ce qui a disparu.
    for (const code of [
      "PONCTUALITE",
      "FTQ",
      "TAUX_RETOUR_SAV",
      "RAPIDITE_DIAG_JOURS",
      "FIABILITE_APPRO",
      "SATISFACTION_CLIENT",
      "TAUX_REPRISE",
      "TAUX_TRANSFORMATION_DEVIS",
      "PRODUCTIVITE_TECHNICIEN",
    ]) {
      expect(codes.has(code), `la cible ${code} manque : le KPI resterait SANS_DATA`).toBe(true);
    }

    // ÉTAPE 6 — et pas de doublon. `kpi_cibles` n'a AUCUNE contrainte
    // d'unicité sur (agence_id, code) : l'invariant ne tient qu'à la garde
    // du script d'initialisation. Un jour où deux chemins insèrent le même
    // code, la table aurait deux cibles concurrentes pour un KPI, et le
    // tableau de bord en afficherait une au hasard — silencieusement.
    //
    // Ce test ne remplace pas la contrainte : il la rend VISIBLE en attendant
    // qu'une migration puisse l'ajouter (le journal des migrations est
    // partagé avec un autre chantier).
    const parCode = new Map<string, number>();
    for (const c of cibles) parCode.set(c.code, (parCode.get(c.code) ?? 0) + 1);
    for (const [code, n] of parCode) {
      expect(n, `la cible ${code} existe ${n} fois`).toBe(1);
    }
  });
});
