import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * P3.1 — Les statistiques ne doivent PAS mentir.
 *
 * Bug d'origine : les six procédures d'`analytics` filtraient sur
 * `sales.statut = "ACTIVE"`. Or `sales` est un ALIAS de `ventes`, et la
 * nomenclature réellement écrite par le code est
 * `brouillon | pre_facture | termine | valide | annule`
 * (`sale-service.creerVente` → `termine`, `valider` → `valide`,
 * `sales.annulerVente` → `annule`).
 *
 * "ACTIVE" n'est écrite par AUCUN chemin d'écriture. Conséquence : chiffre
 * d'affaires, panier moyen et analyse de marge renvoyaient 0 — silencieusement,
 * sans lever la moindre erreur. Un tableau de bord qui affiche des zéros sans
 * prévenir est pire qu'un tableau de bord absent : on décide sur des chiffres
 * faux en croyant qu'il n'y a rien eu.
 *
 * Ce test fixe la règle métier : une préfacture, un brouillon et une vente
 * annulée ne sont pas du chiffre d'affaires. Seules `termine` et `valide`
 * comptent.
 */

vi.mock("@atelierone/auth", () => ({}));

const { analyticsRouter } = await import("~/server/api/routers/analytics");

const AGENCE = 1;
const NS = "p31";

let userId = 0;
const produitsIds: number[] = [];
const ventesIds: number[] = [];

/** Une vente par statut, avec un montant différent pour rendre le total lisible. */
const ATTENDU: { statut: string; montant: number }[] = [
  { statut: "termine", montant: 100_000 },
  { statut: "valide", montant: 50_000 },
  { statut: "pre_facture", montant: 900_000 },
  { statut: "brouillon", montant: 800_000 },
  { statut: "annule", montant: 700_000 },
];

const SOMME_ATTENDUE = 150_000; // uniquement termine + valide
const NB_ATTENDU = 2;

function ctx() {
  const user = {
    id: String(userId),
    name: "P3.1 stats",
    email: `${NS}.stats@gpj.cm`,
    agenceId: AGENCE,
    agenceName: "GPJ",
    organizationId: String(AGENCE),
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

describe("P3.1 — Chiffre d'affaires : seules les ventes réalisées comptent", () => {
  beforeAll(async () => {
    // Nettoyage d'ABORD : un run précédent interrompu (échec réseau, Ctrl+C)
    // laisse les fixtures derrière et le run suivant bute sur une contrainte
    // d'unicité — transformant un test rejouable en test qui ne passe qu'une
    // fois. Un test doit pouvoir être relancé autant de fois que nécessaire.
    await db.execute(sql`DELETE FROM ventes WHERE reference LIKE ${`${NS}-%`}`);
    await db.execute(sql`DELETE FROM produits WHERE code_barre = ${`${NS}-CB-1`}`);
    await db.execute(sql`DELETE FROM utilisateurs WHERE email = ${`${NS}.stats@gpj.cm`}`);

    const [u] = (await db.execute(sql`
      INSERT INTO utilisateurs (email, nom, prenom, agence_id, is_active, status)
      VALUES (${`${NS}.stats@gpj.cm`}, 'P31', 'Stats', ${AGENCE}, true, 'active')
      RETURNING id`)) as unknown as { id: string }[];
    userId = Number(u!.id);

    const [p] = (await db.execute(sql`
      INSERT INTO produits (code_barre, titre, prix_vente, prix_achat)
      VALUES (${`${NS}-CB-1`}, 'Produit test P3.1', 10000, 6000)
      RETURNING id`)) as unknown as { id: number }[];
    produitsIds.push(Number(p!.id));

    for (const v of ATTENDU) {
      const [row] = (await db.execute(sql`
        INSERT INTO ventes (agence_id, reference, operateur_id, montant_total, statut, created_at)
        VALUES (${AGENCE}, ${`${NS}-${v.statut}`}, ${userId}, ${v.montant}, ${v.statut}, now())
        RETURNING id`)) as unknown as { id: number }[];
      ventesIds.push(Number(row!.id));
    }
  });

  afterAll(async () => {
    // Nettoyage par identifiant métier plutôt que par id : les fixtures d'un
    // run interrompu ont des id unknowns ici, et `DELETE ... WHERE id IN (SELECT
    // ...)` avec une liste vide produit `IN ()` — invalide en SQL.
    await db.execute(sql`DELETE FROM ventes WHERE reference LIKE ${`${NS}-%`}`);
    await db.execute(sql`DELETE FROM produits WHERE code_barre = ${`${NS}-CB-1`}`);
    if (userId) {
      await db.execute(sql`DELETE FROM audit_logs WHERE user_id = ${userId}`);
      await db.execute(sql`DELETE FROM utilisateurs WHERE id = ${userId}`);
    }
  });

  it("compte les ventes terminee/valide et ecarte brouillon, pre-facture et annule", async () => {
    const caller = analyticsRouter.createCaller(ctx());
    const res = await caller.getSalesSummary({});

    expect(res, "la procedure doit repondre").not.toBeNull();
    expect(Number(res!.totalSales)).toBe(NB_ATTENDU);
    expect(Number(res!.totalRevenue)).toBe(SOMME_ATTENDUE);

    // Le piège serait un total qui inclut tout : 2 450 000 au lieu de 150 000.
    const tout = ATTENDU.reduce((a, b) => a + b.montant, 0);
    expect(Number(res!.totalRevenue)).not.toBe(tout);
  });

  it("la nomenclature des statuts de vente est centralisée, pas dupliquée", async () => {
    const { STATUTS_VENTE, STATUTS_VENTE_REALISEE } = await import("~/server/lib/sale-service");
    expect([...STATUTS_VENTE].sort()).toEqual(
      ["annule", "brouillon", "pre_facture", "termine", "valide"].sort(),
    );
    expect([...STATUTS_VENTE_REALISEE].sort()).toEqual(["termine", "valide"]);
    for (const s of STATUTS_VENTE) expect(typeof s).toBe("string");
  });
});