import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * M4 — OUTILLAGE : le suivi pièce par pièce
 *
 * « J'ai quatre clés dynamométriques, numérotées 1 à 4. » — c'est la phrase
 * que le stock ne sait pas dire. Il dit « 4 ». Il ne sait pas que la n° 3
 * est sur l'établi du Michelin, que la n° 1 est à l'étalonnage, et que la n° 2
 * a été perdue dans une fuite de liquide de frein.
 *
 * Ce que ces tests verrouillent :
 *
 *   · le FLAGUE `produits.suivi_serie` — qui existait depuis le début du
 *     schéma sans être lu nulle part — décide, et rien d'autre ne décide ;
 *   · un outil NON suivi reste prêtable « en gros », sans numéro ;
 *   · un outil suivi EXIGE la pièce, et refuse une pièce indisponible ;
 *   · une pièce cassée ne condamne PAS les autres du même lot ;
 *   · deux clés peuvent être prêtées en même temps (le défaut bloquant) ;
 *   · une pièce perdue ne fait pas disparaître l'outil deux fois du stock ;
 *   · un numéro ne peut pas être créé deux fois ;
 *   · un exemplaire prêté ne peut pas être déclaré « disponible » à la volée.
 */

vi.mock("@atelierone/auth", () => ({}));

const { outillageRouter } = await import("~/server/api/routers/outillage-router");

const NS = "m4outil";
const AGENCE = 1;

let userId = 0;
let employeId = 0;
let produitSuivi = 0;
let produitLibre = 0;
const emps: { id: number; code: string; type: string }[] = [];

function ctx() {
  const user = {
    id: String(userId),
    name: "Outillage",
    email: `${NS}@gpj.cm`,
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

const api = () => outillageRouter.createCaller(ctx());

/**
 * Produit de test, réutilisable.
 *
 * `ON CONFLICT DO UPDATE … RETURNING` : un run avorté laisse le produit en
 * base, et le run suivant échouerait sur une clé dupliquée. Les fixtures se
 * réparent d'elles-mêmes — sauf les mouvements, qui sont immuables (voir
 * `afterAll` : on ne supprime jamais un mouvement, on remet l'état).
 */
async function produit(code: string): Promise<number> {
  const [p] = (await db.execute(
    sql`INSERT INTO produits (code_barre, titre, type_produit, prix_vente, prix_achat)
        VALUES (${code}, ${`Outil test M4 ${code}`}, 'OUTIL', 15000, 9000)
        ON CONFLICT (code_barre) DO UPDATE SET titre = EXCLUDED.titre
        RETURNING id`,
  )) as unknown as { id: number }[];
  return Number(p!.id);
}

/**
 * `emplacements` n'a pas de contrainte d'unicité exploitable sur
 * (agence_id, code) — d'où l'après-vérification explicite plutôt qu'un
 * `ON CONFLICT` qui n'aurait rien à viser.
 */
async function emplacement(code: string, type: string): Promise<number> {
  const trouve = (await db.execute(
    sql`SELECT id FROM emplacements WHERE agence_id = ${AGENCE} AND code = ${code} LIMIT 1`,
  )) as unknown as { id: number }[];
  if (trouve[0]?.id) return Number(trouve[0].id);

  const [e] = (await db.execute(
    sql`INSERT INTO emplacements (agence_id, code, libelle, type)
        VALUES (${AGENCE}, ${code}, ${code}, ${type}) RETURNING id`,
  )) as unknown as { id: number }[];
  return Number(e!.id);
}

async function stock(p: number, q: number, emplacementId: number) {
  await db.execute(sql`DELETE FROM stocks WHERE produit_id = ${p}`);
  await db.execute(
    sql`INSERT INTO stocks (produit_id, agence_id, emplacement_id, quantite)
        VALUES (${p}, ${AGENCE}, ${emplacementId}, ${q})`,
  );
}

async function etats(p: number) {
  return (await db.execute(
    sql`SELECT numero, etat FROM outils_exemplaires
        WHERE produit_id = ${p} ORDER BY numero`,
  )) as unknown as { numero: string; etat: string }[];
}

async function stockDe(p: number): Promise<number> {
  const [r] = (await db.execute(
    sql`SELECT COALESCE(SUM(quantite),0) AS q FROM stocks WHERE produit_id = ${p}`,
  )) as unknown as { q: string }[];
  return Number(r?.q ?? 0);
}

beforeAll(async () => {
  const [u] = (await db.execute(sql`
    INSERT INTO utilisateurs (email, nom, prenom, agence_id, is_active, status)
    VALUES (${`${NS}@gpj.cm`}, 'M4', 'Outillage', ${AGENCE}, true, 'active')
    ON CONFLICT (email) DO UPDATE SET is_active = true
    RETURNING id`)) as unknown as { id: string }[];
  userId = Number(u!.id);

  const [e] = (await db.execute(
    sql`INSERT INTO employes (nom, prenom, matricule, fonction, agence_id)
        VALUES ('Meca', 'Test', ${`${NS}-1`}, 'MECANICIEN', ${AGENCE})
        ON CONFLICT (matricule) DO UPDATE SET matricule = employes.matricule
        RETURNING id`,
  )) as unknown as { id: number }[];
  employeId = Number(e!.id);

  produitSuivi = await produit(`${NS}-SUIVI`);
  produitLibre = await produit(`${NS}-LIBRE`);
  await db.execute(
    sql`UPDATE produits SET is_active = true, suivi_serie = false, statut_outil = NULL
        WHERE id IN (${produitSuivi}, ${produitLibre})`,
  );
  // Un run avorté a pu laisser des pièces et des prêts ouverts : on repart
  // d'un état connu plutôt que de dépendre de l'ordre d'exécution.
  await db.execute(
    sql`DELETE FROM outils_exemplaires WHERE produit_id IN (${produitSuivi}, ${produitLibre})`,
  );
  await db.execute(
    sql`UPDATE prets_outils SET actif = false
        WHERE outil_id IN (${produitSuivi}, ${produitLibre}) AND actif = true`,
  );

  emps.push({ id: await emplacement(`${NS}-RAYON`, "RAYON"), code: "RAYON", type: "RAYON" });
});

afterAll(async () => {
  for (const p of [produitSuivi, produitLibre]) {
    await db.execute(sql`DELETE FROM outils_exemplaires WHERE produit_id = ${p}`);
    await db.execute(sql`DELETE FROM prets_outils WHERE outil_id = ${p}`);
    await db.execute(sql`DELETE FROM stocks WHERE produit_id = ${p}`);
    await db.execute(sql`UPDATE produits SET suivi_serie = false, statut_outil = NULL WHERE id = ${p}`);
  }
  // `mouvements_stock` est APPEND-ONLY : on ne supprime jamais un mouvement.
  // On neutralise les artefacts de test à la source — le produit n'est plus
  // actif, donc plus rien ne peut le citer.
  await db.execute(
    sql`UPDATE produits SET is_active = false
        WHERE code_barre IN (${`${NS}-SUIVI`}, ${`${NS}-LIBRE`})`,
  );
});

describe("M4 — outillage, suivi individuel", () => {
  it("créate autant d'exemplaires que le stock réel, et active le suivi", async () => {
    await stock(produitSuivi, 4, emps[0]!.id);

    const r = await api().initialiserExemplaires({
      produitId: produitSuivi,
      prefixe: "K",
      emplacementId: emps[0]!.id,
    });

    // Le nombre vient du STOCK, pas d'une saisie séparée : sinon l'écran
    // afficherait « 3 disponibles » pour un stock de 4, et personne ne
    // saurait où est la quatrième.
    expect(r.crees, "4 pièces en stock → 4 numéros").toBe(4);
    expect(r.numeros).toEqual(["K1", "K2", "K3", "K4"]);

    const suivi = (await db.execute(
      sql`SELECT suivi_serie FROM produits WHERE id = ${produitSuivi}`,
    )) as unknown as { suivi_serie: boolean }[];
    expect(suivi[0]!.suivi_serie, "le drapeau s'active avec les pièces").toBe(true);
  });

  it("refuse un numéro déjà pris : un rejeu ne crée pas deux « n° 17 »", async () => {
    await stock(produitSuivi, 4, emps[0]!.id);
    const r = await api().initialiserExemplaires({ produitId: produitSuivi, prefixe: "K" });
    expect(r.crees, "tout existe déjà").toBe(0);
    expect(r.dejaLa).toBe(4);
    expect(await etats(produitSuivi)).toHaveLength(4);
  });

  it("un outil suivi EXIGE la pièce précise", async () => {
    await stock(produitSuivi, 4, emps[0]!.id);
    await api().initialiserExemplaires({ produitId: produitSuivi, prefixe: "K" });

    const refus = await api()
      .preter({
        outilId: produitSuivi,
        technicienId: employeId,
        dateRetour: "2026-12-31",
      })
      .then(() => null)
      .catch((e: Error) => e.message);

    expect(refus, "« choisir la pièce » n'est pas facultatif").toMatch(/pièce précise/i);
  });

  it("DEUX clés peuvent être prêtées en même temps", async () => {
    // Le défaut bloquant : l'ancien `preter` refusait tout second prêt du
    // MÊME produit tant que le premier n'était pas rendu. Avec 4 clés sur
    // l'établi, une seule pouvait sortir — l'outil n'était utilisable que
    // s'il était unique.
    const parc = await api().exemplesParProduit({ produitIds: [produitSuivi] });
    const dispo = parc.filter((e) => e.disponible);
    expect(dispo.length, "au moins deux pièces disponibles").toBeGreaterThanOrEqual(2);

    const a = await api().preter({
      outilId: produitSuivi,
      technicienId: employeId,
      exemplaireId: dispo[0]!.id,
      dateRetour: "2026-12-31",
    });
    const b = await api().preter({
      outilId: produitSuivi,
      technicienId: employeId,
      exemplaireId: dispo[1]!.id,
      dateRetour: "2026-12-31",
    });

    expect(a.exemplaireId).not.toBe(b.exemplaireId);
    expect(await stockDe(produitSuivi), "deux pièces sorties → stock 4-2").toBe(2);

    // Nettoyage pour les tests suivants.
    for (const p of [a!.id, b!.id]) {
      await api().retourner({ pretId: Number(p), etatRetour: "OK" });
    }
  });

  it("une pièce cassée ne condamne PAS les autres du même lot", async () => {
    const parc = await api().exemplesParProduit({ produitIds: [produitSuivi] });
    const dispo = parc.filter((e) => e.disponible);
    const autres = dispo.slice(0, 2);

    const pret = await api().preter({
      outilId: produitSuivi,
      technicienId: employeId,
      exemplaireId: autres[0]!.id,
      dateRetour: "2026-12-31",
    });

    await api().retourner({ pretId: Number(pret.id), etatRetour: "ENDOMMAGE", remarque: "Tête fendue" });

    const apres = await api().exemplesParProduit({ produitIds: [produitSuivi] });
    const cassee = apres.find((e) => e.id === autres[0]!.id)!;
    const saSoeur = apres.find((e) => e.id === autres[1]!.id)!;

    expect(cassee.etat).toBe("CASSE");
    // C'est tout l'intérêt du suivi : les 3 autres clés restent utilisables.
    // Avec le `produits.statut_outil` d'avant, les 4 étaient mises « CASSE ».
    expect(saSoeur.disponible, "la sœur n'a rien à voir avec la pièce cassée").toBe(true);
    expect(apres.filter((e) => e.disponible).length, "3 pièces encore disponibles sur 4").toBe(3);
  });

  it("une pièce PERDUE ne fait pas disparaître l'outil deux fois", async () => {
    // Le prêt sort déjà la pièce du stock (4 → 3). La re-déduire à la perte
    // (3 → 2) ferait disparaître un outil de trop par pièce perdue, sans
    // retour possible pour corriger. L'ancien code le faisait.
    const parc = await api().exemplesParProduit({ produitIds: [produitSuivi] });
    const dispo = parc.filter((e) => e.disponible);
    const avant = await stockDe(produitSuivi);

    const pret = await api().preter({
      outilId: produitSuivi,
      technicienId: employeId,
      exemplaireId: dispo[0]!.id,
      dateRetour: "2026-12-31",
    });
    expect(await stockDe(produitSuivi), "sortie au prêt").toBe(avant - 1);

    await api().retourner({ pretId: Number(pret.id), etatRetour: "PERDU", remarque: "Perdu dans une fuite" });

    expect(await stockDe(produitSuivi), "perdu : déjà sorti, on ne re-déduit pas").toBe(avant - 1);

    const apres = await api().exemplesParProduit({ produitIds: [produitSuivi] });
    expect(apres.find((e) => e.id === dispo[0]!.id)!.etat).toBe("PERDU");
  });

  it("on ne déclare pas « disponible » une pièce qui est prêtée", async () => {
    const parc = await api().exemplesParProduit({ produitIds: [produitSuivi] });
    const dispo = parc.filter((e) => e.disponible);
    const pret = await api().preter({
      outilId: produitSuivi,
      technicienId: employeId,
      exemplaireId: dispo[0]!.id,
      dateRetour: "2026-12-31",
    });

    const refus = await api()
      .setEtatExemplaire({ exemplaireId: dispo[0]!.id, etat: "DISPONIBLE" })
      .then(() => null)
      .catch((e: Error) => e.message);

    expect(refus, "il faut enregistrer le retour, pas maquiller l'état").toMatch(/retour/i);
    await api().retourner({ pretId: Number(pret.id), etatRetour: "OK" });
  });

  it("un outil NON suivi reste prêtable, sans numéro", async () => {
    await stock(produitLibre, 3, emps[0]!.id);

    const r = await api().preter({
      outilId: produitLibre,
      technicienId: employeId,
      dateRetour: "2026-12-31",
    });
    expect(r.id).toBeTruthy();
    expect(await stockDe(produitLibre)).toBe(2);

    await api().retourner({ pretId: Number(r.id), etatRetour: "OK" });
    expect(await stockDe(produitLibre), "rendu : le stock revient").toBe(3);
  });

  it("on ne peut pas arrêté le suivi tant que des pièces sont dans le parc", async () => {
    // Désactiver laisserait `produits.suivi_serie = false` avec des
    // exemplaires orphelins que plus aucun écran ne verrait : l'écran
    // afficherait « disponible sur 3 » alors qu'une pièce est cassée.
    const refus = await api()
      .setSuivi({ produitId: produitSuivi, suivi: false })
      .then(() => null)
      .catch((e: Error) => e.message);
    expect(refus).toMatch(/Retirez-les du parc/i);
  });

  it("le refuse l'état d'un exemplaire qui n'appartient pas à l'outil", async () => {
    // Garde-fou d'appartenance : sans lui, on pourrait prêter la pièce n° 1
    // d'une clé en ouvrant la fiche d'une autre clé.
    const parc = await api().exemplesParProduit({ produitIds: [produitSuivi] });
    const piece = parc[0]!;

    const refus = await api()
      .preter({
        outilId: produitLibre,
        technicienId: employeId,
        exemplaireId: piece.id,
        dateRetour: "2026-12-31",
      })
      .then(() => null)
      .catch((e: Error) => e.message);

    expect(refus, "la pièce n'appartient pas à cet outil").toMatch(/Pièce introuvable/i);
  });

  it("déclarer un statut EXIGE la pièce, sinon tout le parc est condamné", async () => {
    // `declarerStatut` écrivait `produits.statut_outil`. Sur un outil suivi, ça
    // condamnerait les 3 autres pièces — saines, sur l'établi — pour une clé
    // partie en réparation. Le suivi individuel ne suffisait pas à être
    //crée : il fallait que cette procédure l'utilise.
    const parc = await api().exemplesParProduit({ produitIds: [produitSuivi] });
    const dispo = parc.filter((e) => e.disponible);

    const refus = await api()
      .declarerStatut({ outilId: produitSuivi, statut: "REPARATION", motif: "Clé n°1 à l'étalonnage" })
      .then(() => null)
      .catch((e: Error) => e.message);

    expect(refus, "il faut nommer la pièce").toMatch(/quelle pièce/i);

    // Avec la pièce : elle seule est hors service.
    await api().declarerStatut({
      outilId: produitSuivi,
      exemplaireId: dispo[0]!.id,
      statut: "REPARATION",
      motif: "Clé à l'étalonnage",
    });

    const apres = await api().exemplesParProduit({ produitIds: [produitSuivi] });
    expect(apres.find((e) => e.id === dispo[0]!.id)!.etat).toBe("REPARATION");
    expect(
      apres.filter((e) => e.disponible).length,
      "les autres pièces restent disponibles",
    ).toBe(dispo.length - 1);
    // Le produit lui-même n'a pas été condamné.
    const [ligne] = (await db.execute(
      sql`SELECT statut_outil FROM produits WHERE id = ${produitSuivi}`,
    )) as unknown as { statut_outil: string | null }[];
    expect(ligne!.statut_outil, "le produit n'est pas mis hors service").toBeNull();

    // Remise en service : cette pièce redevient disponible, et le stock ne
    // bouge pas — une pièce en réparation n'a jamais quitté le stock.
    const stockAvant = await stockDe(produitSuivi);
    await api().leverStatut({ outilId: produitSuivi, exemplaireId: dispo[0]!.id, motif: "Étalonnage terminé" });
    const final = await api().exemplesParProduit({ produitIds: [produitSuivi] });
    expect(final.find((e) => e.id === dispo[0]!.id)!.etat).toBe("DISPONIBLE");
    expect(await stockDe(produitSuivi), "réparée n'est pas perdue : rien à réintégrer").toBe(stockAvant);
  });

  it("une pièce PERDUE sort du stock, et la retrouver le réintègre", async () => {
    const parc = await api().exemplesParProduit({ produitIds: [produitSuivi] });
    const dispo = parc.filter((e) => e.disponible);
    const avant = await stockDe(produitSuivi);

    await api().declarerStatut({
      outilId: produitSuivi,
      exemplaireId: dispo[0]!.id,
      statut: "PERDU",
      motif: "Retrouvée au fond du bac",
    });
    expect(await stockDe(produitSuivi), "perdue : elle quitte le parc").toBe(avant - 1);

    const r = await api().leverStatut({
      outilId: produitSuivi,
      exemplaireId: dispo[0]!.id,
      motif: "Retrouvée au fond du bac",
    });
    expect(r.stockReintegre, "elle avait quitté le stock").toBe(true);
    expect(await stockDe(produitSuivi), "retrouvée : le stock revient").toBe(avant);
  });
});