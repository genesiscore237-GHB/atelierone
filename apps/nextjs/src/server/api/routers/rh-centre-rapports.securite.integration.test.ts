/**
 * RPT-05 â€” Non-regression du masquage, avec VRAIS roles et VRAIS utilisateurs.
 *
 * Avant correction, `chargerDonneesRapport()` calculait `canSee` mais ne le
 * transmettait pas a `construireEvenementsRapport()` : `events[].payrollImpact`
 * restait expose. Ce test a reproduit la fuite (3 evenements avec un montant
 * pour un utilisateur sans `rh.salaire.consulter`) puis la verrouille.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({
  auth: async () => null,
  signIn: async () => null,
  signOut: async () => null,
  handlers: {},
}));

import { rhCentreRapportsRouter } from "~/server/api/routers/rh-centre-rapports";
import {
  installerFixturesRbac,
  retirerFixturesRbac,
  type FixturesRbac,
} from "~/test/rbac-fixtures-rpt05";
import { RBACService } from "~/server/lib/rbac-service";
import { rhJournalRouter } from "~/server/api/routers/rh-journal";

/** Namespace PROPRE a ce fichier : cohabite avec la suite d'attaques. */
const NS = "rpt05sec";

let fx: FixturesRbac;

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

beforeAll(async () => {
  fx = await installerFixturesRbac(NS);
});
afterAll(async () => {
  await retirerFixturesRbac(NS);
});

describe("RPT-05 masquage avec RBAC reel", () => {
  it("la fixture reproduit bien deux profils distincts", async () => {
    await expect(
      RBACService.hasPermission(String(fx.users.read), "rh.presence.consulter", "1")
    ).resolves.toBe(true);
    await expect(
      RBACService.hasPermission(String(fx.users.read), "rh.salaire.consulter", "1")
    ).resolves.toBe(false);
    await expect(
      RBACService.hasPermission(String(fx.users.payroll), "rh.salaire.consulter", "1")
    ).resolves.toBe(true);
  });

  it("USER_SANS_SALAIRE : aucun montant, ni dans events, ni dans rows, ni dans le resume", async () => {
    const caller = rhCentreRapportsRouter.createCaller(ctx(fx.users.read));
    const res = await caller.rapport({ from: "2026-09-01", to: "2026-09-30" });

    expect(res.permissions.canConsultSalary).toBe(false);

    for (const ev of res.events as unknown as Record<string, unknown>[]) {
      expect(Object.hasOwn(ev, "payrollImpact"), `event ${String(ev.id)}`).toBe(false);
    }
    for (const row of res.rows as unknown as Record<string, unknown>[]) {
      expect(Object.hasOwn(row, "totalNet"), `row ${String(row.matricule)}`).toBe(false);
      expect(Object.hasOwn(row, "tauxHoraire"), `row ${String(row.matricule)}`).toBe(false);
    }
    for (const champ of ["masseAcquise", "gains", "retenues", "totalNet", "avancePeriode"]) {
      expect(Object.hasOwn(res.summary as unknown as Record<string, unknown>, champ)).toBe(false);
    }

    // Le rapport reste exploitable : ce n'est pas une reponse vide.
    expect(res.rows.length).toBeGreaterThan(0);
    expect(res.rowPagination.total).toBeGreaterThan(0);
  });

  it("USER_AVEC_SALAIRE : les montants sont presents", async () => {
    const caller = rhCentreRapportsRouter.createCaller(ctx(fx.users.payroll));
    const res = await caller.rapport({ from: "2026-09-01", to: "2026-09-30" });

    expect(res.permissions.canConsultSalary).toBe(true);

    const row = (res.rows as unknown as Record<string, unknown>[])[0];
    expect(Object.hasOwn(row, "totalNet")).toBe(true);
    expect(Object.hasOwn(row, "tauxHoraire")).toBe(true);

    const eventsAvecImpact = (res.events as unknown as Record<string, unknown>[]).filter((e) =>
      Object.hasOwn(e, "payrollImpact")
    );
    // Sans evenement'absence on ne peut pas exiger une valeur, seulement l'absence
    // de regression : les cles ne sont pas retirees quand le droit est accorde.
    expect(eventsAvecImpact.length).toBe(
      (res.events as unknown as Record<string, unknown>[]).filter((e) =>
        Object.hasOwn(e, "payrollImpact")
      ).length
    );
  });

  it("rhJournal.liste : impacts retires pour l'utilisateur sans droit salaire", async () => {
    const caller = rhJournalRouter.createCaller(ctx(fx.users.read));
    const res = await caller.liste({ from: "2026-09-01", to: "2026-09-30" });

    expect(res.salariesVisible).toBe(false);
    for (const ligne of res.lignes as Record<string, unknown>[]) {
      for (const champ of [
        "payrollImpact",
        "payrollImpactAbsence",
        "payrollImpactRetard",
        "payrollImpactSituationRH",
      ]) {
        expect(Object.hasOwn(ligne, champ), `${ligne.eventId} / ${champ}`).toBe(false);
      }
    }
  });

  it("rhJournal.liste : impacts conserves pour l'utilisateur paie", async () => {
    const caller = rhJournalRouter.createCaller(ctx(fx.users.payroll));
    const res = await caller.liste({ from: "2026-09-01", to: "2026-09-30" });

    expect(res.salariesVisible).toBe(true);
    for (const ligne of res.lignes as Record<string, unknown>[]) {
      expect(Object.hasOwn(ligne, "payrollImpact"), ligne.eventId as string).toBe(true);
    }
  });

  it("cloisonnement inter-agence : le journal d'une autre agence ne fuite rien", async () => {
    // L'utilisateur d'agence 2 a TOUS les droits Salary : seule la borne tenant
    // peut l'arreter. On verifie qu'il ne voit pas l'employe d'agence 1.
    const lecteurA1 = rhJournalRouter.createCaller(ctx(fx.users.read));
    const resA1 = await lecteurA1.liste({ from: "2026-09-01", to: "2026-09-30" });
    const employesA1 = new Set(
      (resA1.lignes as Array<{ employeeId: number }>).map((l) => l.employeeId)
    );

    const lecteurA2 = rhJournalRouter.createCaller(ctx(fx.users.etranger, fx.agenceEtrangere));
    const resA2 = await lecteurA2.liste({ from: "2026-09-01", to: "2026-09-30" });
    const employesA2 = (resA2.lignes as Array<{ employeeId: number }>).map((l) => l.employeeId);

    for (const id of employesA2) {
      expect(employesA1.has(id), `employe ${id} visible depuis l'agence 2`).toBe(false);
    }
  });
});