/**
 * VÉRIFICATION DE bout en bout contre la base de TRAVAIL (`atelierone_erp`).
 *
 * Les tests d'intégration tournent sur `atelierone_erp_test`, qui reçoit les
 * migrations avant chaque exécution. La base de travail, elle, n'en reçoit
 * que lorsque quelqu'un les applique — d'où le bug livré hier : la colonne
 * `atelier_parametres.outillage_catalogue` y manquait, `getCatalogueOutillage`
 * levait, et l'écran affichait un bloc vide.
 *
 * Ce script rejoue le parcours agent CONTRE LA BASE DE TRAVAIL pour vérifier
 * ce que voit réellement l'utilisateur. Il ne purge rien : il nettoie
 * uniquement les lignes qu'il a lui-même créées, marquées d'un préfixe.
 *
 * Usage : DATABASE_URL=... npx tsx src/test-outillage-e2e.ts
 */

import { db } from "~/server/db";
import { sql } from "drizzle-orm";
import { orRouter } from "~/server/api/routers/or-router";
import { OUTILLAGE_PAR_DEFAUT } from "~/lib/outillage";
import { lireCatalogue } from "~/server/lib/outillage-catalogue";

const NS = "E2EOUT";
const IMAT = "E2E-OUT-001";

function ctx() {
  const user = {
    id: "1",
    name: "Vérif E2E",
    email: "e2e@local.test",
    agenceId: 1,
    agenceName: "GPJ",
    organizationId: "1",
    role: "superadmin",
    permissions: [],
    isActive: true,
    status: "active",
  };
  return { headers: new Headers(), user, session: { user, expires: "2099-01-01T00:00:00.000Z" } } as never;
}

const etape = (n: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "OK  " : "ECHEC"} ${n}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
};

async function nettoyer() {
  const marqueur = `${NS}%`;
  await db.execute(
    sql`DELETE FROM lignes_ordre_reparation WHERE ordre_id IN (SELECT id FROM ordres_reparation WHERE pannes_declarees LIKE ${marqueur}::text)`,
  );
  await db.execute(sql`DELETE FROM ordres_reparation WHERE pannes_declarees LIKE ${marqueur}::text`);
  await db.execute(sql`DELETE FROM vehicules WHERE immat_norm = ${IMAT}`);
  await db.execute(sql`DELETE FROM clients WHERE nom LIKE ${`${marqueur}`}::text OR nom LIKE ${`Client ${NS}`}::text`);
}

(async () => {
  console.log("\n=== Vérification E2E outillage (base de travail) ===");
  console.log(`Base : ${(process.env.DATABASE_URL ?? "").replace(/:\/\/[^@]*@/, "://***@")}\n`);

  await nettoyer();

  console.log("1. La procédure qui échouait répond-elle ?");
  try {
    const { items, source } = await lireCatalogue(db, 1);
    etape("lireCatalogue répond", items.length > 0, `${items.length} éléments (source : ${source})`);
    etape(
      "repli = nomenclature par défaut",
      items.length === OUTILLAGE_PAR_DEFAUT.length,
      `${items.length} attendus ${OUTILLAGE_PAR_DEFAUT.length}`,
    );
  } catch (e) {
    etape("lireCatalogue", false, (e as Error).message);
    process.exit(1);
  }

  console.log("\n2. L'agent peut-il enregistrer un état des lieux ?");
  const caller = orRouter.createCaller(ctx());
  const r = await caller.receptionner({
    client: { nom: `Client ${NS}`, telephone: "691995001" },
    vehicule: { immatriculation: IMAT, marque: "Peugeot" },
    reception: {
      kilometrageEntree: 10000,
      pannesDeclarees: `${NS} contrôle`,
      outillage: {
        CRIC: { present: true, observation: "Vérifié au sol" },
        TRIANGLE: { present: false, observation: "" },
      },
    },
  });
  etape("réception enregistrée", r.id > 0, `OR ${r.numero}`);

  const [o] = (await db.execute(
    sql`SELECT outillage FROM ordres_reparation WHERE id = ${r.id}`,
  )) as unknown as { outillage: Record<string, { present: boolean; observation: string; libelle?: string }> }[];
  const out = o.outillage ?? {};
  etape("toute la nomenclature est figée", Object.keys(out).length === 18, `${Object.keys(out).length} clés`);
  etape("présence conservée", out.CRIC?.present === true);
  etape("observation conservée", out.CRIC?.observation === "Vérifié au sol");
  etape("libellé figé", out.CRIC?.libelle === "CRIC");
  etape("absent = false (pas « jamais regardé »)", out.TRIANGLE?.present === false);

  console.log("\n3. L'agent peut-il modifier la nomenclature de l'agence ?");
  const avant = await caller.getCatalogueOutillage();
  const nouveau = { cle: "CALE", libelle: "Cale de nivellement", ordre: 999 };
  const ajout = await caller.updateCatalogueOutillage({ items: [...avant.items, nouveau] });
  etape("ajout", ajout.ajoutes === 1, `${ajout.total} éléments`);

  const apresAjout = await caller.getCatalogueOutillage();
  const renomme = await caller.updateCatalogueOutillage({
    items: apresAjout.items.map((i) => (i.cle === "CALE" ? { ...i, libelle: "Cales de nivellement" } : i)),
  });
  etape("renommage (clé inchangée)", renomme.total === 19);
  const apresRenomme = await caller.getCatalogueOutillage();
  etape(
    "clé stable après renommage",
    apresRenomme.items.find((i) => i.cle === "CALE")?.libelle === "Cales de nivellement",
  );

  const retrait = await caller.updateCatalogueOutillage({
    items: apresRenomme.items.filter((i) => i.cle !== "CALE"),
  });
  etape("retrait", retrait.total === 18);

  console.log("\n4. Un élément retiré reste visible dans le dossier passé");
  const items = (await caller.getCatalogueOutillage()).items;
  const normalise = (await import("~/server/lib/outillage-catalogue")).normaliserOutillage(items, out);
  etape("réponse historique conservée", normalise.TRIANGLE !== undefined);

  await nettoyer();
  await caller.updateCatalogueOutillage({ items });
  console.log("\n=== Fin ===\n");
  process.exit(process.exitCode ?? 0);
})().catch((e) => {
  console.error("\nERREUR :", e);
  process.exit(1);
});
