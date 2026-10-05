/**
 * RPT-05 — Tests d'ATTAQUE sur l'API centrale du Centre RH/Paie.
 *
 * Ces tests utilisent de VRAIS roles et de VRAIS utilisateurs (fixtures
 * `rbac-fixtures-rpt05`), jamais un mock de RBAC. Chaque cas est une tentative
 * concrete :.payload bricole, identifiant d'une autre agence, borne de
 * pagination abusee, lecture seule.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({
  auth: async () => null,
  signIn: async () => null,
  signOut: async () => null,
  handlers: {},
}));

import { rhCentreRapportsRouter } from "~/server/api/routers/rh-centre-rapports";
import { rhJournalRouter } from "~/server/api/routers/rh-journal";
import { rhRouter } from "~/server/api/routers/rh";
import { rhPostureRouter } from "~/server/api/routers/rh-posture";
import { rhHistoryRouter } from "~/server/api/routers/rh-history";
import { db } from "~/server/db";
import {
  installerFixturesRbac,
  retirerFixturesRbac,
  type FixturesRbac,
} from "~/test/rbac-fixtures-rpt05";
import { sql } from "drizzle-orm";

/** Namespace PROPRE a ce fichier : cohabite avec la suite de securite. */
const NS = "rpt05atk";

let fx: FixturesRbac;

/** Periode ou il existe reellement des donnees d'absence dans la base. */
const FROM = "2026-09-01";
const TO = "2026-09-30";

function ctx(userId: number, agenceId = 1) {
  const user = {
    id: String(userId),
    email: "rpt05@gpj.cm",
    name: "RPT05",
    agenceId,
    agenceName: "GPJ",
    organizationId: String(agenceId),
    role: "rh",
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

/** Empreinte des lignes metier avant/apres : preuve de lecture seule. */
async function empreinteMetier(): Promise<string> {
  const rows = (await db.execute(sql`
    SELECT
      (SELECT count(*) FROM attendance_entries)        AS entrees,
      (SELECT count(*) FROM absences)                   AS absences,
      (SELECT count(*) FROM attendance_calculations)    AS calculs,
      (SELECT count(*) FROM attendance_monthly_summaries) AS resumes,
      (SELECT coalesce(sum(worked_minutes), 0) FROM attendance_calculations) AS minutes
  `)) as unknown as Record<string, unknown>[];
  return JSON.stringify(rows[0]);
}

/** Identifiants des employes d'une agence : reference pour le cloisonnement. */
async function idsEmployesAgence(agenceId: number): Promise<number[]> {
  const rows = (await db.execute(
    sql`SELECT id FROM employes WHERE agence_id = ${agenceId}`
  )) as unknown as Array<{ id: number }>;
  return rows.map((r) => Number(r.id));
}

beforeAll(async () => {
  fx = await installerFixturesRbac(NS);
});
afterAll(async () => {
  await retirerFixturesRbac(NS);
});

describe("RPT-05 attaques : periode", () => {
  const caller = () => rhCentreRapportsRouter.createCaller(ctx(fx.users.payroll));

  it("refuse une date qui n'existe pas au lieu de renvoyer un rapport vide", async () => {
    await expect(caller().rapport({ from: "2026-02-31", to: "2026-03-31" })).rejects.toThrow(
      /Dates invalides/
    );
    await expect(caller().rapport({ from: "2026-13-01", to: "2026-13-31" })).rejects.toThrow(
      /Dates invalides/
    );
  });

  it("refuse une periode inversee", async () => {
    await expect(caller().rapport({ from: TO, to: FROM })).rejects.toThrow(/Periode incoherente/);
  });

  it("refuse une periode enorme", async () => {
    await expect(caller().rapport({ from: "2020-01-01", to: "2026-09-30" })).rejects.toThrow(
      /trop longue/
    );
  });

  it("refuse un format de date non ISO", async () => {
    await expect(caller().rapport({ from: "01/09/2026", to: "30/09/2026" })).rejects.toThrow(
      /Dates invalides/
    );
  });
});

describe("RPT-05 attaques : pagination et tri", () => {
  const reader = () => rhCentreRapportsRouter.createCaller(ctx(fx.users.read));
  const payroll = () => rhCentreRapportsRouter.createCaller(ctx(fx.users.payroll));

  it("refuse une page negative ou nulle", async () => {
    await expect(reader().rapport({ from: FROM, to: TO, page: 0 })).rejects.toThrow(/Page invalide/);
    await expect(reader().rapport({ from: FROM, to: TO, page: -5 })).rejects.toThrow(/Page invalide/);
  });

  it("refuse une pageSize hors plafond", async () => {
    await expect(
      reader().rapport({ from: FROM, to: TO, pageSize: 100_000 })
    ).rejects.toThrow(/Taille de page invalide/);
    await expect(
      reader().rapport({ from: FROM, to: TO, eventPageSize: 100_000 })
    ).rejects.toThrow(/Taille de page invalide/);
  });

  it("refuse un tri sur une colonne salariale sans le droit salaire", async () => {
    for (const col of ["totalNet", "masseAcquise", "avancePeriode", "soldeActuel"]) {
      await expect(
        reader().rapport({ from: FROM, to: TO, sort: col as never }),
        col
      ).rejects.toThrow(/rh.salaire.consulter/);
    }
  });

  it("accepte le meme tri pour un utilisateur paie", async () => {
    const res = await payroll().rapport({ from: FROM, to: TO, sort: "totalNet", dir: "desc" });
    expect(res.permissions.canConsultSalary).toBe(true);
  });

  it("une page au-dela du total ne renvoie pas d'erreur ni de donnee fantome", async () => {
    const res = await reader().rapport({ from: FROM, to: TO, page: 9999, pageSize: 10 });
    expect(res.rows).toHaveLength(0);
    expect(res.rowPagination.page).toBe(9999);
    expect(res.rowPagination.total).toBeGreaterThan(0);
  });

  it("au-dela de 200 evenements, la pagination fournit la suite", async () => {
    const res = await reader().rapport({ from: FROM, to: TO, eventPageSize: 200 });
    if (res.eventPagination.total > 200) {
      const page2 = await reader().rapport({ from: FROM, to: TO, eventPageSize: 200, eventPage: 2 });
      const ids1 = new Set(res.events.map((e) => e.id));
      expect(page2.events.some((e) => ids1.has(e.id))).toBe(false);
    } else {
      expect(res.eventPagination.total).toBeLessThanOrEqual(200);
    }
  });
});

describe("RPT-05 attaques : population d'employes", () => {
  const reader = () => rhCentreRapportsRouter.createCaller(ctx(fx.users.read));

  it("refuse des identifiants d'employes aberrants", async () => {
    await expect(reader().rapport({ from: FROM, to: TO, employeIds: [0] })).rejects.toThrow(
      /invalide/
    );
    await expect(reader().rapport({ from: FROM, to: TO, employeIds: [-12] })).rejects.toThrow(
      /invalide/
    );
  });

  it("refuse une selection trop volumineuse", async () => {
    await expect(
      reader().rapport({
        from: FROM,
        to: TO,
        employeIds: Array.from({ length: 501 }, (_, i) => i + 1),
      })
    ).rejects.toThrow(/trop volumineuse/);
  });

  it("un employeId d'une AUTRE agence ne ramene aucune ligne", async () => {
    const res = await reader().rapport({ from: FROM, to: TO, employeId: fx.employeEtranger });
    expect(res.rows).toHaveLength(0);
    expect(res.events).toHaveLength(0);
  });

  it("un employeId inexistant ne fuit pas l'existence d'un tiers", async () => {
    const res = await reader().rapport({ from: FROM, to: TO, employeId: 999_999_999 });
    expect(res.rows).toHaveLength(0);
  });

  it("une liste vide d'employes ne contourne pas le tenant", async () => {
    const res = await reader().rapport({ from: FROM, to: TO, employeIds: [] });
    const employes = new Set(res.rows.map((r) => r.employeeId));
    expect(employes.has(fx.employeEtranger)).toBe(false);
  });

  it("melanger un employe d'une autre agence a une selection ne le fait pas sortir", async () => {
    const res = await reader().rapport({
      from: FROM,
      to: TO,
      employeIds: [fx.employeAgence1, fx.employeEtranger],
    });
    expect(res.rows.map((r) => r.employeeId)).not.toContain(fx.employeEtranger);
  });
});

describe("RPT-05 attaques : cloisonnement inter-agence", () => {
  it("un utilisateur d'agence 2 ne voit que son agence", async () => {
    const a1 = rhJournalRouter.createCaller(ctx(fx.users.read));
    const a2 = rhJournalRouter.createCaller(ctx(fx.users.etranger, fx.agenceEtrangere));
    const res1 = await a1.liste({ from: FROM, to: TO });
    const res2 = await a2.liste({ from: FROM, to: TO });

    const employes1 = new Set(res1.lignes.map((l) => l.employeeId));
    for (const l of res2.lignes) {
      expect(employes1.has(l.employeeId), `employe ${l.employeeId} visible des deux cotes`).toBe(
        false
      );
    }
  });

  it("le rapport d'une autre agence ne contient aucun employe de la premiere", async () => {
    const employesA1 = await idsEmployesAgence(1);
    const res = await rhCentreRapportsRouter
      .createCaller(ctx(fx.users.etranger, fx.agenceEtrangere))
      .rapport({ from: FROM, to: TO });

    // L'utilisateur d'agence 2 voit les employes de SON agence (la fixture en
    // contient un), mais aucun de ceux de l'agence 1.
    const vus = res.rows.map((r) => r.employeeId);
    expect(vus.filter((id) => employesA1.includes(id))).toHaveLength(0);
    for (const e of res.events) {
      expect(employesA1, `event ${e.id} porte un employe d'agence 1`).not.toContain(e.employeeId);
    }
  });
});

describe("RPT-05 attaques : masquage", () => {
  it("aucun montant dans le JSON sérialisé d'un utilisateur sans droit salaire", async () => {
    const res = await rhCentreRapportsRouter
      .createCaller(ctx(fx.users.read))
      .rapport({ from: FROM, to: TO });
    const json = JSON.stringify(res);

    for (const champ of [
      "payrollImpact",
      "masseAcquise",
      "baseContractuelle",
      "totalNet",
      "tauxHoraire",
      "avancePeriode",
      "soldeActuel",
      "salaireBase",
      "numCompteBancaire",
    ]) {
      expect(json.includes(`"${champ}"`), `le champ ${champ} apparait dans le payload`).toBe(false);
    }
  });

  it("aucun montant sérialise dans le journal sans droit salaire", async () => {
    const res = await rhJournalRouter.createCaller(ctx(fx.users.read)).liste({ from: FROM, to: TO });
    const json = JSON.stringify(res);
    for (const champ of ["payrollImpact", "payrollImpactAbsence", "payrollImpactRetard"]) {
      expect(json.includes(`"${champ}"`), champ).toBe(false);
    }
  });

  it("un profil sans permission de presence est refuse, pas renvoye vide", async () => {
    // `rpt05_read` a `rh.presence.consulter` ; on verifie qu'un role valide mais
    // sans CE droit la refused.
    const sansPresence = await db.execute(sql`
      INSERT INTO roles (code, nom, description, niveau)
      VALUES ('rpt05_sans_presence', 'RPT-05 sans presence', 'Fixture', 0)
      RETURNING id
    `);
    const roleId = (sansPresence as unknown as Array<{ id: string }>)[0].id;
    const u = await db.execute(sql`
      INSERT INTO utilisateurs (email, nom, prenom, agence_id, role_id, is_active, status)
      VALUES ('rpt05.sans.presence@gpj.cm', 'RPT05', 'Fixture', 1, ${roleId}::uuid, true, 'active')
      RETURNING id
    `);
    const userId = Number((u as unknown as Array<{ id: number }>)[0].id);

    try {
      await expect(
        rhCentreRapportsRouter.createCaller(ctx(userId)).rapport({ from: FROM, to: TO })
      ).rejects.toThrow(/Permission manquante/);
    } finally {
      await db.execute(
        sql`DELETE FROM utilisateurs WHERE email = 'rpt05.sans.presence@gpj.cm'`
      );
      await db.execute(sql`DELETE FROM roles WHERE code = 'rpt05_sans_presence'`);
    }
  });
});

describe("RPT-05 : endpoints RH voisins", () => {
  // Ces endpoints n'etaient pas dans le perimetre du rapport, mais ils
  // renvoyaient les memes donnees par d'autres chemins. Un attaquant n'a pas
  // besoin du rapport centre si `rh.getFiche` lui donne le salaire, le RIB et
  // l'historique complet.

  /** Aucune de ces cles ne doit apparaitre dans la charge utile. */
  const CHAMPS_FICHE = [
    "salaireBase",
    "numCnss",
    "niu",
    "numCompteBancaire",
    "banque",
    "numPieceIdentite",
    "salaryHistory",
  ];

  it("rh.getFiche ne divulgue ni identite bancaire ni salaire historique", async () => {
    const res = await rhRouter
      .createCaller(ctx(fx.users.read))
      .getFiche({ id: String(fx.employeAgence1) });
    const json = JSON.stringify(res);
    for (const champ of CHAMPS_FICHE) {
      expect(json.includes(`"${champ}"`), `rh.getFiche a expose ${champ}`).toBe(false);
    }
    // La fiche reste utile : ce n'est pas un 403 deguise.
    expect(res.nom).toBeTruthy();
    expect(res).toHaveProperty("positionHistory");
  });

  it("rh.get ne divulgue pas le salaireBase sans le droit", async () => {
    const json = JSON.stringify(
      await rhRouter.createCaller(ctx(fx.users.read)).get({ id: String(fx.employeAgence1) })
    );
    expect(json.includes('"salaireBase"')).toBe(false);
    expect(json.includes('"numCompteBancaire"')).toBe(false);
  });

  it("rh.list ne sérialise pas salaireBase sans le droit", async () => {
    const res = await rhRouter.createCaller(ctx(fx.users.read)).list({ page: 1, limit: 50 });
    const json = JSON.stringify(res);
    expect(json.includes('"salaireBase"'), "rh.list a expose salaireBase").toBe(false);
  });

  it("rh.listContrats ne divulgue pas salaireBase du contrat", async () => {
    const res = await rhRouter.createCaller(ctx(fx.users.read)).listContrats();
    const json = JSON.stringify(res);
    expect(json.includes('"salaireBase"'), "rh.listContrats a expose salaireBase").toBe(false);
  });

  it("rh.listSanctions ne divulgue ni detailsFinanciers ni RIB du joint", async () => {
    const res = await rhRouter.createCaller(ctx(fx.users.read)).listSanctions();
    const json = JSON.stringify(res);
    // `detailsFinanciers` = prelevement sur salaire.
    expect(json.includes('"detailsFinanciers"')).toBe(false);
    // La jointure `innerJoin(employes)` debordait TOUTES les colonnes employe.
    expect(json.includes('"numCompteBancaire"'), "la jointure a fuite le RIB").toBe(false);
    expect(json.includes('"salaireBase"')).toBe(false);
  });

  it("rhPosture.now ne derive aucun taux horaire sans le droit", async () => {
    const res = await rhPostureRouter.createCaller(ctx(fx.users.read)).now();
    const json = JSON.stringify(res);
    // Le taux horaire se deduit du salaire mensuel : le divulguer, c'est le
    // divulguer.
    expect(json.includes('"tauxHoraire"'), "rhPosture.now a expose tauxHoraire").toBe(false);
    expect(json.includes('"gainJour"')).toBe(false);
    expect(Array.isArray(res.employes)).toBe(true);
  });

  it("rhPosture.salaireIntervalle est refuse sans le droit salaire", async () => {
    await expect(
      rhPostureRouter
        .createCaller(ctx(fx.users.read))
        .salaireIntervalle({ employeId: fx.employeAgence1, dateDebut: FROM, dateFin: TO })
    ).rejects.toThrow(/Permission manquante/);
  });

  it("rhHistory.auditEmploye ne divulgue pas le montant d'une correction salariale", async () => {
    const res = await rhHistoryRouter
      .createCaller(ctx(fx.users.read))
      .auditEmploye({ employeeId: fx.employeAgence1 });
    const json = JSON.stringify(res);
    // L'image d'AUDIT contient l'etat complet avant/apres, montant compris.
    expect(json.includes('"salaireBase"'), "l'audit a fuite un montant").toBe(false);
  });
});

describe("RPT-05 : lecture seule", () => {
  it("consulter le rapport n'ecrit rien en base", async () => {
    const avant = await empreinteMetier();
    await rhCentreRapportsRouter
      .createCaller(ctx(fx.users.payroll))
      .rapport({ from: FROM, to: TO, eventPageSize: 1000 });
    await rhJournalRouter.createCaller(ctx(fx.users.payroll)).liste({ from: FROM, to: TO });
    const apres = await empreinteMetier();
    expect(apres).toBe(avant);
  });

  it("la pagination repetee ne duplique ni ne perd d'evenement", async () => {
    const caller = rhCentreRapportsRouter.createCaller(ctx(fx.users.read));
    const premiere = await caller.rapport({ from: FROM, to: TO, eventPageSize: 200 });
    if (premiere.eventPagination.total <= 200) return;

    const vus = new Set<string>();
    let doublons = 0;
    for (let page = 1; page <= premiere.eventPagination.totalPages; page += 1) {
      const res = await caller.rapport({ from: FROM, to: TO, eventPageSize: 200, eventPage: page });
      for (const e of res.events) {
        if (vus.has(e.id)) doublons += 1;
        vus.add(e.id);
      }
    }
    expect(doublons).toBe(0);
    expect(vus.size).toBe(premiere.eventPagination.total);
  });
});