/**
 * LOT 1 — MIGRATION 0024 : L'UNITÉ DE STOCKAGE PARLE, OU NE PARLE PAS
 *
 * Avant 0024, plusieurs grandeurs portaient deux ou trois lignes chacune dans
 * `unites_mesure` (Litre : L, LIT, LITRE — Heure : H, HEU — Celsius : C,
 * CELSIUS — Décimètre : DM, DECIMETRE — Tonne : T, TONNE), 59 produits
 * portaient le CARTON comme unité de base, et 210 sur 319 n'avaient aucune
 * base : un déstockage impossible sans pari sur l'unité.
 *
 * Garanties testées :
 *
 *  1. FUSION : les doublons de même grandeur sont réduits à une ligne active
 *     par libellé ; les références (produits, produit_unites,
 *     unites_domaines, attribut_definitions) sont repointées sur la ligne
 *     conservée ; la ligne source est désactivée, pas supprimée.
 *  2. LITRE : la ligne conservée est LITRE, parce que `mouvements_stock` est
 *     APPEND-ONLY et que l'historique référence déjà LITRE — la migration ne
 *     réécrit pas l'historique, elle y ramène le catalogue.
 *  3. BACKFILL : un produit sans unité de base reçoit PCE ; un produit à base
 *     CTN (carton) reçoit PCE et sa ligne `produit_unites` « CTN x1 » devient
 *     « PCE x1 » ; plus aucun carton ni bidon ne reste base.
 *  4. IDEMPOTENCE : un second passage laisse exactement le même état.
 *  5. PROTOCOLE : le fichier exécuté ENTIER (blocs DO compris) est rejouable
 *     en une seule instruction protocole simple — la découpe naïf sur
 *     point-virgule casserait les blocs DO, comme le sait le moteur
 *     `migrate:sql`.
 *
 * Tout se déroule dans UNE transaction annulée (ROLLBACK) : la base de test
 * partagée ne conservera aucune fixture.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const SQL_TEST = postgres(
  process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/atelierone_erp_test",
  { max: 1, prepare: false },
);

const FICHIER = fileURLToPath(
  new URL(
    "../../../../../../packages/db/drizzle/0024_unites_base_produits.sql",
    import.meta.url,
  ),
);
const DDL = readFileSync(FICHIER, "utf8");

const CODES_A_ASSURER = [
  ["PCE", "Pièce", "pce", "QUANTITE"],
  ["L", "Litre", "L", "PHYSIQUE"],
  ["LIT", "Litre", "L", "QUANTITE"],
  ["LITRE", "Litre", "L", "VOLUME"],
  ["H", "Heure", "h", "PHYSIQUE"],
  ["HEU", "Heure", "h", "TEMPS"],
  ["C", "Degré Celsius", "°C", "PHYSIQUE"],
  ["CELSIUS", "Degré Celsius", "°C", "TEMPERATURE"],
  ["DM", "Décimètre", "dm", "LONGUEUR"],
  ["DECIMETRE", "Décimètre", "dm", "LONGUEUR"],
  ["T", "Tonne", "t", "PHYSIQUE"],
  ["TONNE", "Tonne", "t", "MASSE"],
  ["CTN", "Carton", "ctn", "QUANTITE"],
  ["BID", "Bidon", "bd", "QUANTITE"],
] as const;

let rang = 0;
const codeBarreFixture = () => `TEST-0024-${String(++rang).padStart(2, "0")}`;

async function upsertUnite(code: string, libelle: string, symbole: string, type: string) {
  await SQL_TEST`
    insert into unites_mesure (code, libelle, symbole, type, is_active)
    values (${code}, ${libelle}, ${symbole}, ${type}, true)
    on conflict (code) do nothing`;
}

async function idUnite(code: string): Promise<string> {
  const rows = await SQL_TEST<{ id: string }[]>`
    select id from unites_mesure where code = ${code}`;
  expect(rows.length).toBe(1);
  return rows[0].id;
}

async function creerProduit(titre: string, uniteBaseId: string | null): Promise<number> {
  const rows = await SQL_TEST<{ id: number }[]>`
    insert into produits (code_barre, titre, unite_base_id, type_produit)
    values (${codeBarreFixture()}, ${titre}, ${uniteBaseId}, 'PIECE')
    returning id`;
  return rows[0].id;
}

async function baseDe(produitId: number): Promise<string | null> {
  const r = await SQL_TEST<{ code: string | null }[]>`
    select u.code
    from produits p left join unites_mesure u on u.id = p.unite_base_id
    where p.id = ${produitId}`;
  return r[0]?.code ?? null;
}

async function estActive(code: string): Promise<boolean> {
  const r = await SQL_TEST<{ is_active: boolean }[]>`
    select is_active from unites_mesure where code = ${code}`;
  return r[0]?.is_active ?? true;
}

async function produitUnitesDe(
  produitId: number,
): Promise<{ code: string; facteur: string; base: boolean } | null> {
  const r = await SQL_TEST<{ code: string; facteur: string; base: boolean }[]>`
    select u.code, pu.facteur_vers_base::text as facteur, pu.est_unite_base as base
    from produit_unites pu join unites_mesure u on u.id = pu.unite_id
    where pu.produit_id = ${produitId}`;
  return r[0] ?? null;
}

async function doublonsLibelleActif(): Promise<number> {
  const r = await SQL_TEST<{ n: number }[]>`
    select count(*)::int as n from (
      select lower(btrim(libelle)) from unites_mesure where is_active group by 1 having count(*) > 1
    ) d`;
  return r[0]?.n ?? 0;
}

async function lireEtat(produits: {
  pSansBase: number;
  pLit: number;
  pL: number;
  pCtn: number;
  pBid: number;
  pT: number;
}) {
  return {
    bases: {
      pSansBase: await baseDe(produits.pSansBase),
      pLit: await baseDe(produits.pLit),
      pL: await baseDe(produits.pL),
      pCtn: await baseDe(produits.pCtn),
      pBid: await baseDe(produits.pBid),
      pT: await baseDe(produits.pT),
    },
    actives: {
      L: await estActive("L"),
      LIT: await estActive("LIT"),
      LITRE: await estActive("LITRE"),
      H: await estActive("H"),
      HEU: await estActive("HEU"),
      C: await estActive("C"),
      CELSIUS: await estActive("CELSIUS"),
      DM: await estActive("DM"),
      DECIMETRE: await estActive("DECIMETRE"),
      T: await estActive("T"),
      TONNE: await estActive("TONNE"),
      CTN: await estActive("CTN"),
      BID: await estActive("BID"),
    },
    ligneCtn: await produitUnitesDe(produits.pCtn),
    domaine: (
      await SQL_TEST<{ base: string }[]>`
        select u.code as base
        from unites_domaines d join unites_mesure u on u.id = d.unite_base_id
        where d.code = 'TEST-0024-TEMP'`
    )[0]?.base ?? null,
    attribut: (
      await SQL_TEST<{ unite: string }[]>`
        select u.code as unite
        from attribut_definitions a join unites_mesure u on u.id = a.unite_id
        where a.cle = 'test_0024_temperature_max'`
    )[0]?.unite ?? null,
    doublons: await doublonsLibelleActif(),
  };
}

describe("migration 0024 — unités de base des produits", () => {
  afterAll(async () => {
    await SQL_TEST.end({ timeout: 5 });
  });

  it("fusionne les doublons d'unités, répare les bases, rejouable sans effet", async () => {
    await SQL_TEST.unsafe("BEGIN");
    try {
      // ── 1. fixtures : le référentiel d'unités (peut préexister sans écrasement) ──
      for (const [code, libelle, symbole, type] of CODES_A_ASSURER) {
        await upsertUnite(code, libelle, symbole, type);
      }
      const [idLit, idL, idCtn, idBid, idT, idC] = await Promise.all([
        idUnite("LIT"),
        idUnite("L"),
        idUnite("CTN"),
        idUnite("BID"),
        idUnite("T"),
        idUnite("C"),
      ]);

      const pSansBase = await creerProduit("0024 produit sans base", null);
      const pLit = await creerProduit("0024 produit base LIT", idLit);
      const pL = await creerProduit("0024 produit base L", idL);
      const pCtn = await creerProduit("0024 produit base CTN", idCtn);
      const pBid = await creerProduit("0024 produit base BID", idBid);
      const pT = await creerProduit("0024 produit base T", idT);

      // Le décalque « CTN x1 » / « LIT x1 » que la migration réaligne
      await SQL_TEST`
        insert into produit_unites (produit_id, unite_id, facteur_vers_base, est_unite_base)
        values (${pCtn}, ${idCtn}, 1, true),
               (${pLit}, ${idLit}, 1, true)
        on conflict (produit_id, unite_id) do nothing`;

      // Un domaine et un attribut technique branchés sur C (fusionnée vers CELSIUS)
      await SQL_TEST`
        insert into unites_domaines (code, libelle, unite_base_id)
        values ('TEST-0024-TEMP', 'temperature de test', ${idC})
        on conflict (code) do nothing`;
      await SQL_TEST`
        insert into attribut_definitions (cle, libelle, unite_id, obligatoire)
        values ('test_0024_temperature_max', 'temperature max de test', ${idC}, false)
        on conflict (categorie_id, cle) do nothing`;

      // ── 2. exécution du fichier migratoire COMPLET, en une instruction ──
      await SQL_TEST.unsafe(DDL);

      const apres1 = await lireEtat({ pSansBase, pLit, pL, pCtn, pBid, pT });

      // ── 3. rejeu : IDEMPOTENCE, sans exception, même état exact ──
      await SQL_TEST.unsafe(DDL);
      const apres2 = await lireEtat({ pSansBase, pLit, pL, pCtn, pBid, pT });
      expect(apres2).toEqual(apres1);

      // ── 4. assertions métier ──
      expect(apres1.bases.pSansBase).toBe("PCE");
      expect(apres1.bases.pLit).toBe("LITRE");
      expect(apres1.bases.pL).toBe("LITRE");
      expect(apres1.actives.L).toBe(false);
      expect(apres1.actives.LIT).toBe(false);
      expect(apres1.actives.LITRE).toBe(true);
      expect(apres1.actives.HEU).toBe(false);
      expect(apres1.actives.H).toBe(true);
      expect(apres1.actives.C).toBe(false);
      expect(apres1.actives.CELSIUS).toBe(true);
      expect(apres1.domaine).toBe("CELSIUS");
      expect(apres1.attribut).toBe("CELSIUS");
      expect(apres1.actives.DECIMETRE).toBe(false);
      expect(apres1.actives.DM).toBe(true);
      expect(apres1.bases.pT).toBe("TONNE");
      expect(apres1.actives.T).toBe(false);
      expect(apres1.actives.TONNE).toBe(true);
      expect(apres1.actives.CTN).toBe(true);
      expect(apres1.actives.BID).toBe(true);
      expect(apres1.bases.pCtn).toBe("PCE");
      expect(apres1.bases.pBid).toBe("PCE");
      expect(apres1.ligneCtn).toEqual({ code: "PCE", facteur: "1.000000", base: true });
      expect(apres1.doublons).toBe(0);
    } finally {
      await SQL_TEST.unsafe("ROLLBACK");
    }
  });
});
