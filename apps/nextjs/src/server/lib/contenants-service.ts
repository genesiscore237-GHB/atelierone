import { and, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db, lots, stocksLots, produits, produitUnites, deconditionnements } from "@atelierone/db";
import {
  enregistrerMouvement,
  getFacteurVersBase,
  TYPES_MOUVEMENT,
} from "~/server/lib/stock-engine";

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

/**
 * CONTENANTS — l'huile en fût, et ce qu'on en tire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME, EN UNE PHRASE
 *
 * « L'huile qu'on achète en fût et qu'on déconditionne en petite unité litre
 * pour les vidanges, mais dont on doit avoir une traçabilité impeccable. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LA DLC EST LE VRAI ENJEU
 *
 * Une huile scellée se garde des années. **Une fois ouverte, elle s'oxyde** et
 * se périme en quelques mois — pour une 5W30 moteur, la règle usuelle est
 * douze mois après ouverture, pas cinq ans après fabrication.
 *
 * Le modèle ne l'exprimait pas : un seul `date_peremption`, décrivant le
 * contenant scellé, recopié tel quel sur les bidons. Le système annonçait
 * donc une huile encore valable quatre ans après la première vidange — et
 * refusait de servir l'huile ouverte la veille.
 *
 * Deux dates distinctes, donc :
 *   · `date_peremption`     la DLC du contenant SCELLÉ (ce que dit le
 *                           fournisseur) — informational, jamais
 *                           utilisée pour décider d'une sortie ;
 *   · `date_ouverture` + `periodicite_ouverture_jours`
 *                           ce que le garage sait : le jour où le fût a été
 *                           ouvert, et combien de temps il tient ensuite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUCUNE PÉRIODICITÉ N'EST IMPOSÉE
 *
 * L'expert métier est explicite : il n'existe pas de périodicité universelle.
 * Elle dépend de la notice du fabricant, des exigences du constructeur, de la
 * criticité de la mesure et des résultats des contrôles précédents.
 *
 * On saisit donc ce que le garage sait, et on enregistre **d'où ça vient** :
 * `reference_ouverture` porte « Castrol — notice constructeur Renault ». Un
 * chiffre sans source n'est pas une règle, c'est une Devinette qui se
 * propagera sans que personne ne la conteste.
 */

/**
 * La DLC effective d'un lot : ce qui doit piloter la sortie.
 *
 * `ouverture + périodicité` si le contenant a été ouvert, la DLC fournisseur
 * sinon. Les noms de champs sont tolérés en deux écritures parce que la même
 * formule est appelée depuis des requêtes (`periodicite`) et depuis des
 * objets déjà normalisés (`periodiciteOuvertureJours`).
 */
export function dlcEffective(lot: {
  dateOuverture: string | Date | null | undefined;
  periodicite?: number | null;
  periodiciteOuvertureJours?: number | null;
  datePeremption: string | Date | null | undefined;
}): Date | null {
  const periodicite = lot.periodicite ?? lot.periodiciteOuvertureJours ?? null;
  if (lot.dateOuverture && periodicite != null) {
    const base = new Date(lot.dateOuverture);
    base.setDate(base.getDate() + Number(periodicite));
    return base;
  }
  return lot.datePeremption ? new Date(lot.datePeremption) : null;
}

/** Un contenant est ouvert si et seulement si on sait QUAND il a été ouvert. */
export function estOuvert(lot: { dateOuverture: string | Date | null }): boolean {
  return lot.dateOuverture != null;
}

/**
 * OUVRIR UN CONTENANT.
 *
 * Idempotent par construction : rouvrir un fût déjà ouvert ne décale PAS sa
 * date d'ouverture. Un fût ouvert le 12 mars reste daté du 12 mars, même si
 * le magasinier clique deux fois ou si quelqu'un renseigne une erreur.
 *
 * Décaler la date au second clic vaudrait SOMMETTRE plusieurs mois de
 * conservation à une simple maladresse — le défaut exact qu'on cherche à
 * éviter.
 */
export async function ouvrirContenant(
  tx: Tx,
  params: {
    lotId: number;
    /** Date d'ouverture. Par défaut aujourd'hui. */
    dateOuverture?: Date | null;
    /** Délai de conservation APRÈS ouverture. Repris de `produits.dlcJours`
     *  si absent — et s'il est absent lui aussi, on exige une saisie
     *  explicite plutôt que d'inventer une valeur. */
    periodiciteJours?: number | null;
    /** D'où vient ce délai. */
    reference?: string | null;
    /** Contenu du contenant en unité de base, figé à l'ouverture. */
    contenuSource?: number | null;
    effectuePar?: number;
  },
): Promise<{
  lotId: number;
  numeroLot: string;
  dateOuverture: string;
  dejaOuvert: boolean;
  dlc: string | null;
}> {
  const [lot] = (await tx
    .select({
      id: lots.id,
      produitId: lots.produitId,
      numeroLot: lots.numeroLot,
      dateOuverture: lots.dateOuverture,
      periodicite: lots.periodiciteOuvertureJours,
      datePeremption: lots.datePeremption,
      contenuSource: lots.contenuSource,
      contenuRestant: lots.contenuRestant,
      statut: lots.statut,
      estBloque: lots.estBloque,
    })
    .from(lots)
    .where(eq(lots.id, params.lotId))
    .limit(1)) as unknown as {
    id: number;
    produitId: number;
    numeroLot: string;
    dateOuverture: string | null;
    periodicite: number | null;
    datePeremption: string | null;
    contenuSource: string | null;
    contenuRestant: string | null;
    statut: string;
    estBloque: boolean;
  }[];

  if (!lot) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lot introuvable." });
  }
  if (lot.estBloque) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Le lot ${lot.numeroLot} est bloqué (rappel fournisseur ou consignation). Levée du blocage avant toute ouverture.`,
    });
  }

  const dlc = dlcEffective(lot);
  const formatDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  if (lot.dateOuverture) {
    // Déjà ouvert : on ne touche à rien. Rouvrir ne doit permettre de
    // conservation, ni changer une DLC déjà communiquée.
    return {
      lotId: lot.id,
      numeroLot: lot.numeroLot,
      dateOuverture: String(lot.dateOuverture).slice(0, 10),
      dejaOuvert: true,
      dlc: formatDate(dlc),
    };
  }

  // La périodicité : le garage, sinon le produit, sinon on refuse.
  let periodicite = params.periodiciteJours ?? lot.periodicite ?? null;
  if (periodicite == null) {
    const [p] = (await tx
      .select({ dlcJours: produits.dlcJours, uniteBaseId: produits.uniteBaseId })
      .from(produits)
      .where(eq(produits.id, lot.produitId))
      .limit(1)) as unknown as { dlcJours: number | null; uniteBaseId: string | null }[];
    periodicite = p?.dlcJours ?? null;
  }
  if (periodicite == null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Délai de conservation après ouverture inconnu. Renseignez-le — la DLC d'un contenant " +
        "ouvert n'a rien à voir avec celle du contenant scellé, et le système ne l'invente pas.",
    });
  }

  const dateOuverture = params.dateOuverture ?? new Date();

  // Le contenu restant est FIGÉ à l'ouverture : c'est la quantité d'eau
  // qui reste dans le fût. Toute autre valeur serait une estimation.
  const contenu = params.contenuSource ?? (lot.contenuSource ? Number(lot.contenuSource) : null);

  await tx
    .update(lots)
    .set({
      dateOuverture: dateOuverture.toISOString().slice(0, 10),
      periodiciteOuvertureJours: Math.trunc(periodicite),
      referenceOuverture: params.reference ?? null,
      contenuSource: contenu != null ? String(contenu) : lot.contenuSource,
      contenuRestant: contenu != null ? String(contenu) : lot.contenuRestant,
    } as never)
    .where(eq(lots.id, lot.id));

  const ouverture = new Date(dateOuverture);
  ouverture.setDate(ouverture.getDate() + Math.trunc(periodicite));

  return {
    lotId: lot.id,
    numeroLot: lot.numeroLot,
    dateOuverture: dateOuverture.toISOString().slice(0, 10),
    dejaOuvert: false,
    dlc: formatDate(ouverture),
  };
}

/**
 * DÉCONDITIONNER UN CONTENANT OUVERT — un fût devient des bidons tracés.
 *
 * C'est l'opération qui, jusque-là, perdait la traçabilité. Elle produit un
 * LOT CIBLE unique pour tous les bidons issus du même fût :
 *
 *   · `lot_source_id` = le fût → le lien qui survit à la conversion ;
 *   · `date_ouverture` = celle du fût ;
 *   · `date_peremption` = ouverture + périodicité → le FEFO consumera donc
 *     ce lot avant le fût encore scellé, sans qu'aucune règle spéciale
 *     soit nécessaire.
 *
 * Un lot par flacon serait inapplicable : 208 lots par fût.
 */
export async function deconditionnerContenant(
  tx: Tx,
  params: {
    lotId: number;
    /** Article des unités produites. NULL = même article. */
    produitCibleId?: number | null;
    uniteSourceId: string;
    uniteCibleId: string;
    /** Quantité de contenants source consommés (ex. 1 fût). */
    quantiteSource: number;
    /** Quantité d'unités cible produites (ex. 208 bidons). */
    quantiteCible: number;
    emplacementSourceId?: number | null;
    emplacementCibleId?: number | null;
    motif?: string | null;
    effectuePar?: number;
    /** Facteur de conversion, figé. Recalculé si absent. */
    facteurConversion?: number | null;
    coutUnitaireBase?: number | string;
  },
): Promise<{ lotSourceId: number; lotCibleId: number; dlcCible: string | null; facteur: number }> {
  const [lot] = (await tx
    .select({
      id: lots.id,
      produitId: lots.produitId,
      numeroLot: lots.numeroLot,
      dateOuverture: lots.dateOuverture,
      periodicite: lots.periodiciteOuvertureJours,
      datePeremption: lots.datePeremption,
      contenuRestant: lots.contenuRestant,
      coutUnitaire: lots.coutUnitaire,
      estBloque: lots.estBloque,
    })
    .from(lots)
    .where(eq(lots.id, params.lotId))
    .limit(1)) as unknown as {
    id: number;
    produitId: number;
    numeroLot: string;
    dateOuverture: string | null;
    periodicite: number | null;
    datePeremption: string | null;
    contenuRestant: string | null;
    coutUnitaire: string | null;
    estBloque: boolean;
  }[];

  if (!lot) throw new TRPCError({ code: "NOT_FOUND", message: "Lot introuvable." });
  if (lot.estBloque) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Le lot ${lot.numeroLot} est bloqué : on ne le déconditionne pas.`,
    });
  }
  if (!lot.dateOuverture) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Ce contenant n'est pas ouvert. Ouvrez-le d'abord : un bidon tire d'un fût scellé " +
        "n'a pas la date d'ouverture qui fait sa DLC.",
    });
  }

  const dlcCible = dlcEffective(lot);

  // ── Quantité réellement disponible dans le contenant ─────────────────────
  // Le contrôle porte sur `stocks_lots`, pas sur `stocks` : c'est la quantité
  // du LOT qui autorise un déconditionnement. Un fût peut avoir du volume
  // mais aucune quantité portée par un lot — dans ce cas on ne tire pas
  // de lui, faute de quoi les bidons produits seraient sans provenance.
  const [sl] = (await tx
    .select({ quantite: stocksLots.quantite })
    .from(stocksLots)
    .where(
      and(
        eq(stocksLots.lotId, lot.id),
        eq(stocksLots.produitId, lot.produitId),
      ),
    )
    .limit(1)) as unknown as { quantite: string }[];

  const dispo = sl ? Number(sl.quantite) : 0;
  if (dispo <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Le lot ${lot.numeroLot} n'a aucun stock : rien à déconditionner.`,
    });
  }
  if (params.quantiteSource > dispo) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Stock insuffisant sur le lot ${lot.numeroLot} : ${dispo} disponible, ${params.quantiteSource} demandé.`,
    });
  }

  const produitCibleId = params.produitCibleId ?? lot.produitId;
  const groupeOperationId = crypto.randomUUID();
  // Une seule résolution d'agence, réutilisée par les deux mouvements et la
  // trace : trois appels identiques pour la même valeur n'ont aucun intérêt.
  const agenceId = await agenceDeLote(tx, lot.id);

  // ── Conversion vers l'unité de base ──────────────────────────────────────
  //
  // `enregistrerMouvement` attend des quantités en unité de BASE. Or ici on
  // raisonne en contenants : « 1 fût » n'est pas 1 litre.
  //
  // Sans cette conversion, sortir un fût débiterait 1 litre au lieu de 208 —
  // et le stock du fût se viderait 208 fois trop vite, sans qu'aucun contrôle
  // ne s'en aperçoive : la quantité « 1 » serait celle demandée.
  //
  // `facteurVersBase` = nombre d'unités de base par unité donnée. Un fût de
  // 208 L avec une base litre vaut 208 ; un bidon de 1 L vaut 1.
  const fSource = await getFacteurVersBase(tx, lot.produitId, params.uniteSourceId);
  const fCible = await getFacteurVersBase(tx, produitCibleId, params.uniteCibleId);
  const qteBaseSortie = params.quantiteSource * fSource;
  const qteBaseEntree = params.quantiteCible * fCible;
  /** Unités cible par unité source — FIGÉ à l'opération. */
  const facteur = params.facteurConversion ?? (fCible ? fSource / fCible : 1);

  // ── Le lot cible : un lot de bidons groupés ──────────────────────────────
  const numeroCible = `${lot.numeroLot}-BID-${new Date().toISOString().slice(0, 10)}`;

  const [lotCible] = (await tx
    .insert(lots)
    .values({
      produitId: produitCibleId,
      numeroLot: numeroCible,
      statut: "disponible",
      dateReception: new Date(),
      quantiteInitiale: Math.round(params.quantiteCible),
      coutUnitaire: lot.coutUnitaire,
      // La DLC des bidons N'EST PAS celle du scellé : c'est l'ouverture
      // plus la périodicité. C'est ce qui fait que le FEFO les consomme
      // avant le fût encore fermé.
      datePeremption: dlcCible ? dlcCible.toISOString().slice(0, 10) : null,
      dateEntree: new Date(),
      dateOuverture: lot.dateOuverture,
      periodiciteOuvertureJours: lot.periodicite,
      referenceOuverture: lot.numeroLot,
      lotSourceId: lot.id,
      provenance: `Deconditionnement du lot ${lot.numeroLot}`,
      isActive: true,
    } as never)
    .returning()) as unknown as { id: number }[];
  const lotCibleId = lotCible!.id;

  // ── Le mouvement : sortie du fût, entrée des bidons ──────────────────────
  // Par le MOTEUR, jamais en écriture directe. C'est la règle 3 du cadrage.
  //
  // Le coût unitaire vient du LOT, pas du mouvement source : on sort du fût
  // au prix du fût, et les bidons entrent au MÊME prix. C'est ce qui rend la
  // valorisation cohérente entre le vrac et le conditionné — sans quoi la
  // marge calculée sur un bidon serait fausse.
  const cout = lot.coutUnitaire != null ? Number(lot.coutUnitaire) : undefined;

  await enregistrerMouvement(tx as never, {
    type: TYPES_MOUVEMENT.DECONDITIONNEMENT_SORTIE as never,
    sens: "S",
    produitId: lot.produitId,
    agenceId,
    quantite: qteBaseSortie,
    uniteId: params.uniteSourceId,
    emplacementId: params.emplacementSourceId ?? undefined,
    lotPourTracabilite: lot.id,
    groupeOperationId,
    motif: params.motif ?? `Ouverture du contenant ${lot.numeroLot}`,
    effectuePar: params.effectuePar,
    coutUnitaireBase: cout,
  });

  await enregistrerMouvement(tx as never, {
    type: TYPES_MOUVEMENT.DECONDITIONNEMENT_ENTREE as never,
    sens: "E",
    produitId: produitCibleId,
    agenceId,
    quantite: qteBaseEntree,
    uniteId: params.uniteCibleId,
    emplacementId: params.emplacementCibleId ?? undefined,
    lotId: lotCibleId,
    groupeOperationId,
    motif: params.motif ?? `Bidons issus du lot ${lot.numeroLot}`,
    effectuePar: params.effectuePar,
    coutUnitaireBase: cout,
  });

  // ── Le registre des lots ────────────────────────────────────────────────
  //
  // `enregistrerMouvement` met à jour `stocks` et `stocks_unites`, mais PAS
  // `stocks_lots` : seul le moteur de lots le fait. Sans ce travail, le fût
  // continuerait de réclamer son contenu au registre — et le FEFO, qui
  // s'appuie sur `stocks_lots`, repartirait sur un fût déjà vidé.
  //
  // C'est l'incohérence des trois tables de quantité, rencontrée pour de
  // bon : le trigger d'invariant prévu au cadrage § 3.2 la traiterait à la
  // racine, mais il a été différé — le stock existant ne peut pas être
  // réconcilié sans recensement. On traite donc ici, explicitement, plutôt
  // que de laisser le registre mentir.
  const [slSource] = (await tx
    .select({ id: stocksLots.id, quantite: stocksLots.quantite })
    .from(stocksLots)
    .where(
      and(
        eq(stocksLots.lotId, lot.id),
        eq(stocksLots.produitId, lot.produitId),
        eq(stocksLots.agenceId, agenceId),
      ),
    )
    .for("update")) as unknown as { id: number; quantite: string }[];

  if (slSource) {
    const restant = Math.max(0, Number(slSource.quantite) - qteBaseSortie);
    await tx
      .update(stocksLots)
      .set({ quantite: String(restant) } as never)
      .where(eq(stocksLots.id, slSource.id));
  }

  await tx
    .insert(stocksLots)
    .values({
      produitId: produitCibleId,
      agenceId,
      lotId: lotCibleId,
      quantite: String(qteBaseEntree),
    } as never)
    .onConflictDoUpdate({
      target: [stocksLots.produitId, stocksLots.agenceId, stocksLots.lotId],
      set: { quantite: String(qteBaseEntree) },
    } as never);

  // ── Le contenu restant du fût ────────────────────────────────────────────
  // `contenu_restant` est en unité de BASE, comme `stocks.quantite`. Sans
  // cette décrémentation, un fût ouvert afficherait « 208 L restants »
  // indéfiniment — et le magasinier croirait pouvoir en tirer autant
  // qu'il veut.
  if (lot.contenuRestant != null) {
    const restant = Math.max(0, Number(lot.contenuRestant) - qteBaseSortie);
    await tx
      .update(lots)
      .set({
        contenuRestant: String(restant),
        statut: restant <= 0 ? "epuise" : "disponible",
      } as never)
      .where(eq(lots.id, lot.id));
  }

  // ── La trace ─────────────────────────────────────────────────────────────
  await tx.insert(deconditionnements).values({
    agenceId,
    produitId: lot.produitId,
    produitCibleId: produitCibleId !== lot.produitId ? produitCibleId : null,
    uniteSourceId: params.uniteSourceId,
    uniteCibleId: params.uniteCibleId,
    quantiteSource: String(params.quantiteSource),
    quantiteGeneree: String(params.quantiteCible),
    lotIdSource: lot.id,
    lotIdCible: lotCibleId,
    dateOuverture: lot.dateOuverture,
    dlcCible: dlcCible ? dlcCible.toISOString().slice(0, 10) : null,
    facteurConversion: String(facteur),
    effectuePar: params.effectuePar ?? 0,
    motif: params.motif ?? null,
  } as never);

  return {
    lotSourceId: lot.id,
    lotCibleId,
    dlcCible: dlcCible ? dlcCible.toISOString().slice(0, 10) : null,
    facteur,
  };
}

/** `lots` n'a pas d'agence : le périmètre vient de la ligne de stock du lot. */
async function agenceDeLote(tx: Tx, lotId: number): Promise<number> {
  const [r] = (await tx
    .select({ agenceId: stocksLots.agenceId })
    .from(stocksLots)
    .where(eq(stocksLots.lotId, lotId))
    .limit(1)) as unknown as { agenceId: number }[];
  if (!r?.agenceId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Ce lot n'est rattaché à aucune agence : impossible de tracer le déconditionnement.",
    });
  }
  return r.agenceId;
}

/** Ligne du tableau de bord des contenants — nom de colonnes, pas de types. */
export type LigneContenant = {
  lot_id: number;
  produit_id: number;
  titre: string;
  numero_lot: string;
  date_ouverture: string | null;
  periodicite_ouverture_jours: number | null;
  reference_ouverture: string | null;
  lot_source_id: number | null;
  contenu_source: number | null;
  contenu_restant: number | null;
  date_peremption: string | null;
  est_bloque: boolean;
  motif_blocage: string | null;
  dlc_effective: string | null;
  quantite_en_stock: number;
  statut: string | null;
};

/**
 * CONTENANTS OUVERTS D'UN ARTICLE — le tableau de bord du garage.
 *
 * Alimente l'écran « fûts ouverts » : ce qui reste, et jusqu'à quand.
 *
 * Le type de retour est EXPLICITE. `db.execute` renvoie un type opaque, et
 * diffuser ses lignes (`{ ...ligne, quantite: Number(ligne.quantite) }`)
 * effondre l'inférence : le client tRPC ne voit plus que `{ quantite }` et
 * TS nie l'existence de `numero_lot`. Nommer la forme ici évite d'écrire
 * l'interface deux fois.
 */
export async function listerContenantsOuverts(
  agenceId: number,
  produitId?: number,
): Promise<LigneContenant[]> {
  const r = await db.execute(sql`
    SELECT l.id                AS lot_id,
           l.produit_id,
           p.titre,
           l.numero_lot,
           l.date_ouverture,
           l.periodicite_ouverture_jours,
           l.reference_ouverture,
           l.lot_source_id,
           l.contenu_source,
           l.contenu_restant,
           l.date_peremption,
           l.est_bloque,
           l.motif_blocage,
           l.statut,
           COALESCE(
             CASE WHEN l.date_ouverture IS NOT NULL
                       AND l.periodicite_ouverture_jours IS NOT NULL
                  THEN l.date_ouverture + l.periodicite_ouverture_jours
             END,
             l.date_peremption
           )                                               AS dlc_effective,
           COALESCE(SUM(sl.quantite), 0)                   AS quantite_en_stock
      FROM lots l
      JOIN produits p        ON p.id = l.produit_id
      LEFT JOIN stocks_lots sl ON sl.lot_id = l.id AND sl.agence_id = ${agenceId}
     WHERE l.date_ouverture IS NOT NULL
       ${produitId ? sql`AND l.produit_id = ${produitId}` : sql``}
     GROUP BY l.id, p.titre
     ORDER BY COALESCE(
              CASE WHEN l.date_ouverture IS NOT NULL
                        AND l.periodicite_ouverture_jours IS NOT NULL
                   THEN l.date_ouverture + l.periodicite_ouverture_jours
              END,
              l.date_peremption,
              '9999-12-31'::date
            ) ASC
  `);
  const lignes = r as unknown as LigneContenant[];
  return lignes.map((l) => ({
    ...l,
    quantite_en_stock: Number(l.quantite_en_stock ?? 0),
    contenu_source: l.contenu_source != null ? Number(l.contenu_source) : null,
    contenu_restant: l.contenu_restant != null ? Number(l.contenu_restant) : null,
  }));
}

/** L'unité cible d'un article, pour proposer « 1 fût = combien de bidons ». */
export async function factoriserConversion(
  tx: Tx,
  produitSourceId: number,
  produitCibleId: number,
  uniteSourceId: string,
  uniteCibleId: string,
): Promise<number> {
  const facteur = (produitId: number, uniteId: string): Promise<number> =>
    tx
      .select({ f: produitUnites.facteurVersBase })
      .from(produitUnites)
      .where(and(eq(produitUnites.produitId, produitId), eq(produitUnites.uniteId, uniteId)))
      .limit(1)
      .then((r: unknown) => {
        const row = (r as { f: string | null }[])[0];
        return row?.f ? Number(row.f) : 1;
      });

  const fSource = await facteur(produitSourceId, uniteSourceId);
  const fCible = await facteur(produitCibleId, uniteCibleId);
  if (!fSource || !fCible) return 1;
  return fSource / fCible;
}