import { describe, it, expect, vi, afterAll } from "vitest";

vi.mock("@atelierone/auth", () => ({
  auth: async () => null,
  signIn: async () => null,
  signOut: async () => null,
  handlers: {},
}));

import { rhSettingsRouter } from "./rh-settings";
import type { ExtendedUser } from "@atelierone/auth/types";

/**
 * RPT-02 - Procedure d'ecriture des jours feries.
 *
 * Unique test MUTANT du dossier RPT-02 : il ecrit une date hors de toute
 * periode de paie (2027), puis la supprime dans afterAll. Il prouve que la
 * validation et la contrainte UNIQUE (agence_id, date) sont reellement posees,
 * et non seulement declarees.
 */

const AGENCE = 1;
const DATE_ESSAI = "2027-06-07"; // lundi 2027, hors de tous les mois de paie

function ctxDe(userId: string, role: ExtendedUser["role"], perms: string[]) {
  const user: ExtendedUser = {
    id: userId,
    email: `${role}@gpj.cm`,
    name: role,
    agenceId: AGENCE,
    agenceName: "GPJ",
    organizationId: String(AGENCE),
    role,
    permissions: perms,
    isActive: true,
    status: "active",
  };
  return {
    headers: new Headers(),
    user,
    session: { user, expires: "2099-01-01T00:00:00.000Z" },
  };
}

const set = (userId = "1", role: ExtendedUser["role"] = "superadmin") =>
  rhSettingsRouter.createCaller(ctxDe(userId, role, ["rh.parametrage.modifier"]) as never);

const setSansPermission = () =>
  rhSettingsRouter.createCaller(ctxDe("999999", "employe", []) as never);

async function codeDe(promise: Promise<unknown>) {
  try {
    await promise;
    return "OK";
  } catch (e) {
    const x = e as { shape?: { data?: { code?: unknown } }; code?: unknown };
    return x.shape?.data?.code ?? x.code ?? "UNKNOWN";
  }
}

describe("RPT-02 terrain - addHoliday", () => {
  afterAll(async () => {
    // nettoyage garanti, meme si un test a echoue
    for (const f of await set().listHolidays()) {
      if (String(f.date) === DATE_ESSAI) await set().deleteHoliday({ id: f.id });
    }
  });

  it("une date impossible est refusee avant toute ecriture", async () => {
    expect(await codeDe(set().addHoliday({ date: "2027-02-30", name: "Faux ferie" }))).toBe(
      "BAD_REQUEST"
    );
    expect(await codeDe(set().addHoliday({ date: "2027-13-01", name: "Faux ferie" }))).toBe(
      "BAD_REQUEST"
    );
    expect(await codeDe(set().addHoliday({ date: "07/06/2027", name: "Faux ferie" }))).toBe(
      "BAD_REQUEST"
    );
    const feries = await set().listHolidays();
    expect(feries.some((f) => String(f.date).includes("2027-02-30"))).toBe(false);
  });

  it("une date reelle est ecrite, puis visible, puis refusee en doublon", async () => {
    const cree = await set().addHoliday({ date: DATE_ESSAI, name: "Ferie RPT-02" });
    expect(cree.id).toBeGreaterThan(0);

    const feries = await set().listHolidays();
    const trouve = feries.filter((f) => String(f.date) === DATE_ESSAI);
    expect(trouve.length).toBe(1);
    expect(trouve[0].agenceId).toBe(AGENCE);

    // doublon : refus metier explicite, pas une erreur PostgreSQL 23505
    expect(await codeDe(set().addHoliday({ date: DATE_ESSAI, name: "Ferie RPT-02 bis" }))).toBe(
      "CONFLICT"
    );
    const apres = await set().listHolidays();
    expect(apres.filter((f) => String(f.date) === DATE_ESSAI).length).toBe(1);

    const supprime = await set().deleteHoliday({ id: cree.id });
    expect(supprime.success).toBe(true);
    expect((await set().listHolidays()).some((f) => String(f.date) === DATE_ESSAI)).toBe(false);
  });

  it("sans la permission de modification, l'ecriture est refusee", async () => {
    expect(await codeDe(setSansPermission().addHoliday({ date: DATE_ESSAI, name: "Ferie RPT-02" }))).toBe(
      "FORBIDDEN"
    );
    expect((await set().listHolidays()).some((f) => String(f.date) === DATE_ESSAI)).toBe(false);
  });
});
