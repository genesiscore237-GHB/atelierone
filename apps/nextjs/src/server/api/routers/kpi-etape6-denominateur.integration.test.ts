/**
 * ÉTAPE 6 — LE DÉNOMINATEUR.
 *
 * Une moyenne sans dénominateur n'est pas une mesure, c'est une impression.
 *
 *
 * LE DÉFAUT
 *
 * Le tableau de bord affichait « Satisfaction client 4,5 / 5 » en grand, avec
 * un badge d'état vert calculé sur cette valeur. Rien n'indiquait sur quoi
 * elle reposait.
 *
 * Si la seule personne ayant répondu a mis 5, ce 4,5 est la moyenne d'UNE
 * personne. Le tableau le présentait comme une vérité établie, avec un code
 * couleur qui strengthen l'illusion.
 *
 * Et le pire : `statutKPI(valeur, ...)` était appelé même quand `valeur` était
 * `null`. Un KPI sans aucune mesure recevait donc un badge d'évaluation —
 * donc une alerte sur une absence de donnée. Exactement l'inverse de ce qu'un
 * tableau de bord doit prévenir.
 *
 *
 * CE QUE CES TESTS PROUVENT
 *
 * 1. Sans mesure, le statut est `SANS_DATA` — même si une cible existe.
 * 2. Le dénominateur `n` accompagne la valeur, et il vient du SERVEUR :
 *    un écran qui le recalcule finit par diverger.
 * 3. Sous trois mesures, la moyenne est marquée comme non significative —
 *    la donnée existe, elle n'est pas encore une tendance.
 */

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@atelierone/auth", () => ({}));

import { atelierKpiRouter } from "~/server/api/routers/atelier-kpi-router";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

const NS = "e6kpi";
const USER_EMAIL = `${NS}.or@gpj.cm`;
const IMMAT = `${NS}-001`;

type Row = Record<string, unknown>;
let userId = 0;
let orId = 0;

function ctxSuperadmin() {
  const user = {
    id: String(userId),
    name: "E6 KPI",
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

async function retirer() {
  await db.execute(
    sql`DELETE FROM or_restitutions
        WHERE or_id IN (SELECT o.id FROM ordres_reparation o
          JOIN vehicules v ON v.id = o.vehicule_id
          WHERE v.immatriculation LIKE ${`${NS}%`})`,
  );
  await db.execute(
    sql`DELETE FROM or_historique
        WHERE or_id IN (SELECT o.id FROM ordres_reparation o
          JOIN vehicules v ON v.id = o.vehicule_id
          WHERE v.immatriculation LIKE ${`${NS}%`})`,
  );
  await db.execute(
    sql`DELETE FROM ordres_reparation
        WHERE vehicule_id IN (SELECT id FROM vehicules WHERE immatriculation LIKE ${`${NS}%`})`,
  );
  await db.execute(sql`DELETE FROM vehicules WHERE immatriculation LIKE ${`${NS}%`}`);
  await db.execute(sql`DELETE FROM clients WHERE telephone = '690600960'`);
}

beforeAll(async () => {
  await retirer();
  const [u] = (await db.execute(
    sql`INSERT INTO utilisateurs (email, login_email, mot_de_passe, nom, agence_id, status)
        VALUES (${USER_EMAIL}, ${USER_EMAIL}, 'x', 'E6 KPI', 1, 'active')
        ON CONFLICT (email) DO UPDATE SET nom = 'E6 KPI'
        RETURNING id`,
  )) as unknown as Row[];
  userId = Number(u.id);

  const [v] = (await db.execute(
    sql`INSERT INTO vehicules (immatriculation, marque, modele, agence_id)
        VALUES (${IMMAT}, 'KPI', 'Test', 1) RETURNING id`,
  )) as unknown as Row[];

  const orRouter = (await import("~/server/api/routers/or-router")).orRouter;
  const r = await orRouter.createCaller(ctxSuperadmin()).receptionner({
    client: { nom: `Client ${NS}`, telephone: "690600960" },
    vehicule: { id: Number(v.id), immatriculation: IMMAT },
    reception: { kilometrageEntree: 10000, pannesDeclarees: "Freins" },
  });
  orId = r.id as number;
});

afterAll(async () => {
  await retirer();
});

describe("ÉTAPE 6 — un KPI sans dénominateur n'est pas une mesure", () => {
  it("1. chaque KPI annonce le nombre de dossiers sur lesquels il repose", async () => {
    const caller = atelierKpiRouter.createCaller(ctxSuperadmin());
    const r = await caller.getSanteGarage({ periode: "trimestre" });

    expect(r.kpis.length).toBeGreaterThan(0);
    for (const k of r.kpis as any[]) {
      // `n` est-il présent et UN NOMBRE ? Une moyenne affichée sans
      // dénominateur est une impression ; un dénominateur à `undefined`
      // n'est pas mieux.
      expect(typeof k.n, `${k.code} n'a pas de dénominateur`).toBe("number");
      expect(k.n, `${k.code} a un dénominateur négatif`).toBeGreaterThanOrEqual(0);
      expect(typeof k.significatif, `${k.code} ne dit pas si sa mesure est fiable`).toBe("boolean");
    }
  });

  it("2. sans aucune mesure, le statut est SANS_DATA — pas une alerte", async () => {
    const caller = atelierKpiRouter.createCaller(ctxSuperadmin());
    const r = await caller.getSanteGarage({ periode: "trimestre" });

    const satisf = (r.kpis as any[]).find((k) => k.code === "SATISFACTION_CLIENT");
    expect(satisf).toBeDefined();

    // Notre dossier n'est pas LIVRE et n'a aucune note : aucune mesure.
    expect(satisf!.n).toBe(0);
    expect(satisf!.valeur).toBeNull();
    // Le point central : pas d'évaluation sur une absence de donnée.
    expect(satisf!.statut).toBe("SANS_DATA");
    expect(satisf!.significatif).toBe(false);
  });

  it("3. une seule note donne une moyenne NON significative", async () => {
    await db.execute(
      sql`UPDATE ordres_reparation
          SET statut = 'LIVRE', date_cloture = now(), satisfaction_note = 5
          WHERE id = ${orId}`,
    );

    const caller = atelierKpiRouter.createCaller(ctxSuperadmin());
    const r = await caller.getSanteGarage({ periode: "trimestre" });
    const satisf = (r.kpis as any[]).find((k) => k.code === "SATISFACTION_CLIENT");

    expect(satisf!.n).toBe(1);
    expect(satisf!.valeur).toBe(5);
    // Le cœur du lot : 5/5 sur UNE personne ne se lit plus comme une mesure.
    expect(satisf!.significatif).toBe(false);
  });

  it("5. TAUX_REPRISE : un dossier repris se voit, un dossier propre aussi", async () => {
    const caller = atelierKpiRouter.createCaller(ctxSuperadmin());
    const kpi = async () =>
      (await caller.getSanteGarage({ periode: "trimestre" })).kpis.find(
        (k: any) => k.code === "TAUX_REPRISE",
      ) as any;

    // Zéro dossier repris -> 0 %. C'est une MESURE, pas une absence : le
    // dossier existe, on l'a ouvert, et il n'a pas été repris. L'écran doit
    // donc afficher « 0 % », pas « aucune mesure ».
    const avant = await kpi();
    expect(avant).toBeDefined();
    expect(avant!.n).toBeGreaterThanOrEqual(1);
    expect(avant!.valeur).toBe(0);

    // Une reprise se détecte par l'HISTORIQUE : un passage de
    // CONTROLE_QUALITE vers EN_COURS signifie que le contrôle a renvoyé le
    // dossier. C'est la trace, pas une colonne — donc rien à maintenir.
    await db.execute(
      sql`INSERT INTO or_historique (or_id, type, ancienne_valeur, nouvelle_valeur, commentaire)
          VALUES (${orId}, 'STATUT', 'CONTROLE_QUALITE', 'EN_COURS', 'Reprise : contrôle qualité refusé')`,
    );

    const apres = await kpi();
    expect(apres.valeur).toBe(100);
    // Le dénominateur ne change pas : c'est le MÊME dossier, pas un nouveau.
    // Un indicateur dont le dénominateur bouge quand la valeur bouge est
    // impossible à lire.
    expect(apres.n).toBe(avant!.n);

    await db.execute(sql`DELETE FROM or_historique WHERE or_id = ${orId}`);
  });

  it("4. la note est saisissable seulement une fois le dossier prêt ou livré", async () => {
    // Le garde existe côté serveur depuis le début ; on le vérifie parce
    // qu'une note prise AVANT la livraison ne mesurerait rien.
    const caller = atelierKpiRouter.createCaller(ctxSuperadmin());
    await db.execute(sql`UPDATE ordres_reparation SET statut = 'EN_COURS' WHERE id = ${orId}`);

    await expect(
      caller.noterSatisfaction({ orId, note: 5 }),
    ).rejects.toThrow(/livraison|LIVRE/i);

    await db.execute(sql`UPDATE ordres_reparation SET statut = 'LIVRE' WHERE id = ${orId}`);
    const ok = await caller.noterSatisfaction({ orId, note: 4, commentaire: "Rapide et propre" });
    expect(ok.success).toBe(true);

    // Et la note se relit : une écriture qu'aucune lecture ne renvoie est
    // une écriture qu'on croit avoir inventée.
    const [row] = (await db.execute(
      sql`SELECT satisfaction_note, satisfaction_commentaire FROM ordres_reparation WHERE id = ${orId}`,
    )) as unknown as Row[];
    expect(Number(row.satisfaction_note)).toBe(4);
    expect(row.satisfaction_commentaire).toBe("Rapide et propre");
  });
});