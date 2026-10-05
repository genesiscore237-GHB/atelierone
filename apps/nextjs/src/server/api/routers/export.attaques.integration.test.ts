/**
 * RPT-05 — Tests d'ATTAQUE sur l'ownership des exports.
 *
 * Constat audite : `export.ts` ne stockait que l'identifiant du job, et
 * `getExportStatus` / `downloadExport` faisaient `exportQueue.get(jobId)` sans
 * aucune verification. Consequences :
 *
 *  1. INTER-AGENCE : un utilisateur de l'agence 2 pouvait telecharger un export
 *     de l'agence 1. Le tenant etait rompu, pas seulement l'ownership.
 *  2. INTER-UTILISATEUR : deux utilisateurs de la meme agence se lisaient
 *     mutuellement, parce qu'un export contient les ventes et le stock.
 *  3. `jobId` devinable (`export_${Date.now()}_${random}`) : l'absence de
 *     controle n'etait pas attenuée par le secret de l'identifiant.
 *  4. `requestExport` n'exigeait aucune permission.
 *
 * Ces tests attackent le comportement, pas l'implementation : ils appellent les
 * procedures publiques avec des contextes forges et attendent un refus.
 */

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

// `next-auth` n'est pas resolvable hors de Next (il importe `next/server`).
// On ne mocke QUE le transport d'authentification ; le RBAC reste reel.
vi.mock("@atelierone/auth", () => ({}));

import { exportRouter } from "~/server/api/routers/export";
import { sql } from "drizzle-orm";

import { db } from "~/server/db";
import {
  installerFixturesRbac,
  retirerFixturesRbac,
  type FixturesRbac,
} from "~/test/rbac-fixtures-rpt05";

const NS = "rpt05exp";

let fx: FixturesRbac;

/**
 * Forge un contexte authentifie. Les procedures d'export ne sont pas liees au
 * RBAC de la chaine RH : seule l'identite et l'agence comptent ici, ce que
 * reproduit exactement `ctx` dans les autres suites RPT-05.
 */
function ctx(userId: number, agenceId: number) {
  const user = {
    id: String(userId),
    name: "RPT05 export",
    email: "rpt05.export@gpj.cm",
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

/** Recupere le code TRPC d'une rejection, ou `null` si la mutation a reussi. */
async function codeDe(promesse: Promise<unknown>): Promise<string | null> {
  try {
    await promesse;
    return null;
  } catch (e) {
    const code = (e as { code?: string }).code;
    return code ?? "UNKNOWN";
  }
}

beforeAll(async () => {
  fx = await installerFixturesRbac(NS);
});

afterAll(async () => {
  await retirerFixturesRbac(NS);
});

describe("RPT-05 : exports — ownership et tenant", () => {
  // Le job est cree par l'utilisateur "payroll" de l'AGENCE 1. Toutes les
  // tentatives ci-dessous viennent d'autres contextes.
  let jobId: string;

  it("un proprietaire peut creer puis lire son propre job", async () => {
    // `fx.users.export` dispose de `export.consulter` et de RIEN d'autre. Si la
  // procedure demandait un droit salarial, ce test le prouverait.
  const proprietaire = ctx(fx.users.export, 1);
    const create = await exportRouter
      .createCaller(proprietaire)
      .requestExport({ type: "analytics", format: "csv" });
    expect(create.jobId).toBeTruthy();
    jobId = create.jobId;

    // Lecture par le proprietaire : doit passer (le job peut etre "pending" ou
    // "completed", les deux sont des statuts valides).
    const status = await exportRouter
      .createCaller(proprietaire)
      .getExportStatus({ jobId });
    expect(status.jobId).toBe(jobId);
  });

  it("un autre utilisateur de la MEME agence ne peut pas lire le job", async () => {
    // Meme agence, droits salariaux identiques : seule l'identite differe.
    // Un export contient ventes + stock, ce n'est pas une donnee personnelle.
    const autre = ctx(fx.users.read, 1);
    expect(await codeDe(exportRouter.createCaller(autre).getExportStatus({ jobId }))).toBe(
      "NOT_FOUND"
    );
    expect(await codeDe(exportRouter.createCaller(autre).downloadExport({ jobId }))).toBe(
      "NOT_FOUND"
    );
  });

  it("un utilisateur d'une AUTRE agence ne peut pas telecharger le fichier", async () => {
    // La borne la plus grave : fuite inter-tenant. `fx.users.etranger` est en
    // agence `fx.agenceEtrangere` et dispose pourtant de tous les droits RH.
    const etranger = ctx(fx.users.etranger, fx.agenceEtrangere);
    expect(await codeDe(exportRouter.createCaller(etranger).getExportStatus({ jobId }))).toBe(
      "NOT_FOUND"
    );
    expect(await codeDe(exportRouter.createCaller(etranger).downloadExport({ jobId }))).toBe(
      "NOT_FOUND"
    );
  });

  it("le refus est NOT_FOUND et non FORBIDDEN (pas d'oracle d'existence)", async () => {
    // Un `FORBIDDEN` confirmerait au attaquant que CE jobId existe. On doit
    // repondre exactement comme pour un identifiant bidon.
    const inexistant = "export_1234567890_abcdefghi";
    const codeJobInconnu = await codeDe(
      exportRouter.createCaller(ctx(fx.users.read, 1)).getExportStatus({ jobId: inexistant })
    );
    const codeJobDautrui = await codeDe(
      exportRouter.createCaller(ctx(fx.users.read, 1)).getExportStatus({ jobId })
    );
    expect(codeJobDautrui).toBe(codeJobInconnu);
  });

  it("un job inexistant reste introuvable pour tout le monde", async () => {
    expect(
      await codeDe(
        exportRouter
          .createCaller(ctx(fx.users.payroll, 1))
          .getExportStatus({ jobId: "export_0_bidonc" })
      )
    ).toBe("NOT_FOUND");
  });

it("la file est en memoire : le cloisonnement des exports est purement applicatif", async () => {
    // A documenter : la file vit dans un `Map`, pas en base. Il n'existe donc
    // AUCUNE contrainte SQL qui rattache un job a son proprietaire — la garantie
    // tient entierement de `exigerJobProprietaire`. Le jour ou les jobs sont
    // persistes, ce controle devra etre reecrit en SQL (index sur
    // `(job_id, user_id, organization_id)`).
    const tables = (await db.execute(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename ILIKE '%export%'`
    )) as unknown as Array<{ tablename: string }>;
    // La file est en memoire (`Map`), donc AUCUNE table ne doit porter ce nom.
    // `travaux_export` est le tableau des travaux de l'atelier : sans rapport.
    expect(tables.map((t) => t.tablename)).not.toContain("export_jobs");
  });
});
