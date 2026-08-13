import { z } from "zod";
import { createTRPCRouter, protectedProcedure, stockProcedure, requirePermissionProcedure } from "~/server/api/trpc";
import { db, achats, achatsLignes, fournisseurs, stocks, stocksUnites, produits, bonsReception, lignesBonReception, mouvementsStock, produitsFournisseurs, dettesFournisseurs, remboursementsFournisseurs, auditLogs, facturesFournisseur, caisses, produitUnites, prixHistorique, unitesMesure, utilisateurs, tarifs, ecartsReception } from "@atelierone/db";
import { eq, and, desc, sql, lt, isNull, lte, gte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getFacteurVersBase } from "~/server/lib/stock-engine";
import { CaisseService } from "~/server/lib/caisse-service";
import { PertesService } from "~/server/lib/pertes-service";
import { creerLotEtStock, sortirLotSpecifique, trouverLotParReference } from "~/server/lib/lot-service";

// ─── Réception : traçabilité des écarts et suivi financier du dossier ───
// Un écart est documenté à chaque réception (quantité inf/sup ou prix différent
// du BC). La dette fournisseur est cumulée au prorata de ce qui est réellement
// reçu, au prix du bon de commande (l'écart de prix reste documenté).

type PaiementReception = {
  mode: string;
  caisseId?: number;
  montant?: string;
  reference?: string;
  notes?: string;
};

async function enregistrerEcartsReception(tx: any, params: {
  bonReceptionId: number | null;
  achatId: number | null;
  produitId: number;
  quantiteCommandee: number;
  quantiteRecue: number;
  prixBC: number | null;
  prixRecu: number;
  motifEcart?: string | null;
  effectuePar: number;
}) {
  if (params.achatId == null) return;
  const { quantiteCommandee, quantiteRecue } = params;
  const insertEcart = (typeEcart: string, qteComm: number, qteRecu: number) =>
    tx.insert(ecartsReception).values({
      bonReceptionId: params.bonReceptionId,
      achatId: params.achatId,
      produitId: params.produitId,
      typeEcart,
      quantiteCommandee: qteComm,
      quantiteRecue: qteRecu,
      prixBC: params.prixBC != null ? String(params.prixBC) : null,
      prixRecu: String(params.prixRecu),
      motif: params.motifEcart || null,
      creePar: params.effectuePar,
    }) as any;

  if (quantiteRecue < quantiteCommandee) {
    await insertEcart("QTE_INF", quantiteCommandee, quantiteRecue);
  } else if (quantiteRecue > quantiteCommandee) {
    await insertEcart("QTE_SUP", quantiteCommandee, quantiteRecue);
  }
  if (params.prixBC != null && params.prixRecu !== params.prixBC) {
    await insertEcart("PRIX_ECART", quantiteCommandee, quantiteRecue);
  }
}

async function cumulerDetteEtPayer(tx: any, params: {
  achatId: number;
  fournisseurId: number;
  agenceId: number;
  montantRecu: number;
  paiement?: PaiementReception | null;
  motifDette?: string;
  effectuePar: number;
}) {
  const { achatId, fournisseurId, agenceId, montantRecu } = params;
  if (montantRecu <= 0) return { detteId: null as number | null, statut: "aucun" };

  const [dette] = await (tx as any).select().from(dettesFournisseurs)
    .where(eq(dettesFournisseurs.achatId, achatId)).limit(1).for("update");

  let detteId: number;
  if (!dette) {
    const echeance = new Date();
    echeance.setDate(echeance.getDate() + 30);
    const [newDette] = await (tx as any).insert(dettesFournisseurs).values({
      achatId,
      fournisseurId,
      agenceId,
      reference: `Dette-ACH-${achatId}-${Date.now()}`,
      montantTotal: String(montantRecu),
      montantPaye: "0",
      montantRestant: String(montantRecu),
      echeanceLe: echeance,
      notes: params.motifDette || null,
    }).returning();
    detteId = newDette.id;
  } else {
    detteId = dette.id;
    const nouveauTotal = Number(dette.montantTotal ?? 0) + montantRecu;
    const paye = Number(dette.montantPaye ?? 0);
    await (tx as any).update(dettesFournisseurs).set({
      montantTotal: String(nouveauTotal),
      montantRestant: String(Math.max(0, nouveauTotal - paye)),
    }).where(eq(dettesFournisseurs.id, detteId));
  }

  if (params.paiement) {
    const montantPaiement = Number(params.paiement.montant ?? 0);
    if (montantPaiement > 0) {
      const [detteCourante] = await (tx as any).select().from(dettesFournisseurs)
        .where(eq(dettesFournisseurs.id, detteId)).limit(1).for("update");
      const newPaye = Number(detteCourante.montantPaye ?? 0) + montantPaiement;
      const newRestant = Number(detteCourante.montantTotal) - newPaye;
      const statut = newRestant <= 0 ? "paye" : "partiel";
      await (tx as any).update(dettesFournisseurs).set({
        montantPaye: String(newPaye),
        montantRestant: String(Math.max(0, newRestant)),
        statut,
      }).where(eq(dettesFournisseurs.id, detteId));

      const caisseId = params.paiement.caisseId ??
        (await CaisseService.trouverCaisseOuverte(agenceId, tx as any)).caisseId;

      await (tx as any).insert(remboursementsFournisseurs).values({
        detteId,
        montant: String(montantPaiement),
        modePaiement: params.paiement.mode,
        caisseId,
        reference: params.paiement.reference || null,
        notes: params.paiement.notes || null,
      });

      await CaisseService.enregistrerFlux({
        caisseId,
        agenceId,
        type: "paiement_fournisseur",
        montant: montantPaiement,
        motif: `Paiement réception (dette #${detteId}, ${params.paiement.mode})`,
        reference: params.paiement.reference || `DETTE-${detteId}`,
        entiteType: "DETTE_FOURNISSEUR",
        entiteId: detteId,
        effectuePar: params.effectuePar,
      }, tx as any);

      await (tx as any).update(achats).set({
        montantPaye: sql`COALESCE(${achats.montantPaye}, 0) + ${montantPaiement}`,
      }).where(eq(achats.id, achatId));

      return { detteId, statut };
    }
  }
  return { detteId, statut: dette ? "partiel" : "impaye" };
}

// ─── Suggestions de réapprovisionnement (calcul partagé) ───
// Chaque suggestion = produit sous le seuil d'alerte, regroupé par fournisseur.
// Une ligne est « déjà couverte » si un BC actif (brouillon/commande/partiel)
// contient déjà ce produit chez ce fournisseur → évite les doublons.
async function getSuggestionsInternes(agenceId: number, fournisseurIds?: number[]) {
  const lowStockProducts = await db
    .select({
      produitId: produits.id,
      titre: produits.titre,
      codeBarre: produits.codeBarre,
      seuilAlerte: produits.seuilAlerte,
      stockActuel: sql<number>`COALESCE((
        SELECT SUM(s.quantite) FROM stocks s
        WHERE s.produit_id = ${produits.id} AND s.agence_id = ${agenceId}
      ), 0)`,
      prixAchat: produits.prixAchat,
      fournisseurId: produits.fournisseurId,
      fournisseurNom: fournisseurs.nom,
    })
    .from(produits)
    .leftJoin(fournisseurs, eq(produits.fournisseurId, fournisseurs.id))
    .where(and(
      eq(produits.isActive, true),
      eq(produits.statutCycleVie, "ACTIF"),
      sql`COALESCE((
        SELECT SUM(s.quantite) FROM stocks s
        WHERE s.produit_id = ${produits.id} AND s.agence_id = ${agenceId}
      ), 0) < ${produits.seuilAlerte}`,
    ));

  const multiSupplierPrices = await db
    .select({
      produitId: produitsFournisseurs.produitId,
      fournisseurId: produitsFournisseurs.fournisseurId,
      fournisseurNom: fournisseurs.nom,
      uniteId: produitsFournisseurs.uniteId,
      prixAchat: produitsFournisseurs.prixAchat,
      delaiApprovisionnement: produitsFournisseurs.delaiApprovisionnement,
      estPrincipal: produitsFournisseurs.estPrincipal,
    })
    .from(produitsFournisseurs)
    .innerJoin(fournisseurs, eq(produitsFournisseurs.fournisseurId, fournisseurs.id))
    .where(eq(produitsFournisseurs.isActive, true));

  const priceMap = new Map<number, any>();
  for (const sp of multiSupplierPrices) {
    const pid = sp.produitId!;
    if (!priceMap.has(pid) || sp.estPrincipal) priceMap.set(pid, sp);
  }

  // Couverture : produit+fournisseur déjà présents dans un BC actif
  const couverts = await db
    .select({
      produitId: achatsLignes.produitId,
      fournisseurId: achats.fournisseurId,
      reference: achats.reference,
    })
    .from(achatsLignes)
    .innerJoin(achats, eq(achatsLignes.achatId, achats.id))
    .where(inArray(achats.statut, ["brouillon", "commande", "partiel"]));
  const couvertMap = new Map<string, string>();
  for (const c of couverts) {
    if (c.produitId != null && c.fournisseurId != null && !couvertMap.has(`${c.produitId}:${c.fournisseurId}`)) {
      couvertMap.set(`${c.produitId}:${c.fournisseurId}`, c.reference ?? "");
    }
  }

  const bySupplier = new Map<number, {
    fournisseurId: number;
    fournisseurNom: string;
    lignes: any[];
    montantTotal: number;
  }>();

  for (const p of lowStockProducts) {
    const pid = p.produitId!;
    const stockActuel = Number(p.stockActuel ?? 0);
    const seuil = Number(p.seuilAlerte ?? 5);
    const qteSuggeree = Math.max(seuil * 2 - stockActuel, seuil);
    const multiInfo = priceMap.get(pid);
    const fournisseurId = multiInfo?.fournisseurId ?? p.fournisseurId;
    const fournisseurNom = multiInfo?.fournisseurNom ?? p.fournisseurNom ?? "Fournisseur non défini";
    const prixAchat = multiInfo?.prixAchat ? Number(multiInfo.prixAchat) : (p.prixAchat ? Number(p.prixAchat) : 0);
    const totalLigne = qteSuggeree * prixAchat;
    const refBc = couvertMap.get(`${pid}:${fournisseurId}`);

    if (!fournisseurId) continue;
    if (fournisseurIds && !fournisseurIds.includes(fournisseurId)) continue;

    if (!bySupplier.has(fournisseurId)) {
      bySupplier.set(fournisseurId, { fournisseurId, fournisseurNom, lignes: [], montantTotal: 0 });
    }
    const group = bySupplier.get(fournisseurId)!;
    group.lignes.push({
      produitId: pid,
      titre: p.titre,
      codeBarre: p.codeBarre,
      stockActuel,
      seuilAlerte: seuil,
      qteSuggeree,
      prixAchat,
      totalLigne,
      dejaInclu: Boolean(refBc),
      refBc: refBc ?? null,
    });
    if (!refBc) group.montantTotal += totalLigne;
  }

  return Array.from(bySupplier.values()).sort((a, b) => b.montantTotal - a.montantTotal);
}

type PrixAjustement = {
  produitId: number;
  prixAchat?: number | null;
  prixVente?: number | null;
  prixMinimumVente?: number | null;
  prixMaximumRachat?: number | null;
  tva?: number | null;
};

// ─── Ajustement des prix du catalogue à la réception (traçabilité append-only) ───
// Reçoit : produit, nouveau prix d'achat (depuis la facture fournisseur), et optionnellement
// les nouveaux prix de vente / minimum de vente. Met à jour :
//   produits.prixAchat (+ prixAchatReference si vide) · produits.prixVente · produits.prixMinimumVente ·
//   produitsFournisseurs.prixAchat (fournisseur concerné) · produitUnites.prixAchat (unité d'achat)
// Chaque changement (ancien → nouveau) est journalisé dans prix_historique + audit_logs.
async function appliquerPrixCatalogue(
  tx: any,
  user: { id: number; agenceId: number },
  fournisseurId: number | null,
  uniteId: string | null,
  source: "RECEPTION_COMMANDE" | "RECEPTION_LIBRE" | "MANUEL",
  reference: string | null,
  referenceType: string | null,
  motif: string | null,
  ajustements: PrixAjustement[]
) {
  const changements: any[] = [];
  for (const a of ajustements) {
    const [produit] = await tx.select().from(produits).where(eq(produits.id, a.produitId)).limit(1) as any;
    if (!produit) continue;

    const setProduit: any = {};
    let touched = false;

    if (a.prixAchat != null) {
      const ancien = Number(produit.prixAchat ?? 0);
      const nouveau = Number(a.prixAchat);
      if (nouveau !== ancien) {
        setProduit.prixAchat = String(nouveau);
        if (!produit.prixAchatReference) setProduit.prixAchatReference = String(ancien || nouveau);
        changements.push({ produitId: a.produitId, typePrix: "ACHAT", ancienPrix: String(ancien), nouveauPrix: String(nouveau), uniteId });
        touched = true;
      }
    }
    if (a.prixVente != null) {
      const ancien = Number(produit.prixVente ?? 0);
      const nouveau = Number(a.prixVente);
      if (nouveau !== ancien) {
        setProduit.prixVente = String(nouveau);
        changements.push({ produitId: a.produitId, typePrix: "VENTE", ancienPrix: String(ancien), nouveauPrix: String(nouveau), uniteId });
        touched = true;
      }
    }
    if (a.prixMinimumVente != null) {
      const ancien = Number(produit.prixMinimumVente ?? 0);
      const nouveau = Number(a.prixMinimumVente);
      if (nouveau !== ancien) {
        setProduit.prixMinimumVente = String(nouveau);
        changements.push({ produitId: a.produitId, typePrix: "MINIMUM_VENTE", ancienPrix: String(ancien), nouveauPrix: String(nouveau), uniteId });
        touched = true;
      }
    }
    if (a.tva != null) {
      const ancien = Number(produit.tva ?? 0);
      const nouveau = Number(a.tva);
      if (nouveau !== ancien) {
        setProduit.tva = String(nouveau);
        changements.push({ produitId: a.produitId, typePrix: "TVA", ancienPrix: String(ancien), nouveauPrix: String(nouveau), uniteId });
        touched = true;
      }
    }

    if (touched) {
      setProduit.updatedAt = new Date();
      await tx.update(produits).set(setProduit).where(eq(produits.id, a.produitId)) as any;
    }

    // Prix d'achat chez ce fournisseur (produitsFournisseurs)
    if (a.prixAchat != null && fournisseurId != null) {
      const [pf] = await tx.select().from(produitsFournisseurs).where(and(
        eq(produitsFournisseurs.produitId, a.produitId),
        eq(produitsFournisseurs.fournisseurId, fournisseurId)
      )).limit(1) as any;
      if (pf) {
        const ancien = Number(pf.prixAchat ?? 0);
        const nouveau = Number(a.prixAchat);
        if (nouveau !== ancien) {
          await tx.update(produitsFournisseurs).set({ prixAchat: String(nouveau), updatedAt: new Date() }).where(eq(produitsFournisseurs.id, pf.id)) as any;
          changements.push({ produitId: a.produitId, typePrix: "FOURNISSEUR_ACHAT", ancienPrix: String(ancien), nouveauPrix: String(nouveau), uniteId });
        }
      }
    }

    // Prix d'achat sur l'unité d'achat (produitUnites)
    if (a.prixAchat != null && uniteId != null) {
      const [unite] = await tx.select().from(produitUnites).where(and(
        eq(produitUnites.produitId, a.produitId),
        eq(produitUnites.uniteId, uniteId)
      )).limit(1) as any;
      if (unite) {
        const ancien = Number(unite.prixAchat ?? 0);
        const nouveau = Number(a.prixAchat);
        if (nouveau !== ancien) {
          await tx.update(produitUnites).set({ prixAchat: String(nouveau) }).where(eq(produitUnites.id, unite.id)) as any;
          changements.push({ produitId: a.produitId, typePrix: "UNITE_ACHAT", ancienPrix: String(ancien), nouveauPrix: String(nouveau), uniteId });
        }
      }
    }

    // Prix maximum de rachat (tarif Bourse — livres d'occasion)
    if (a.prixMaximumRachat != null) {
      const [tarif] = await tx.select().from(tarifs).where(and(
        eq(tarifs.produitId, a.produitId),
        eq(tarifs.type, "maximum_rachat"),
        eq(tarifs.isActive, true)
      )).limit(1) as any;
      const ancien = tarif ? Number(tarif.prix ?? 0) : 0;
      const nouveau = Number(a.prixMaximumRachat);
      if (nouveau !== ancien) {
        if (tarif) {
          await tx.update(tarifs).set({ prix: String(nouveau), updatedAt: new Date() }).where(eq(tarifs.id, tarif.id)) as any;
        } else {
          await tx.insert(tarifs).values({
            produitId: a.produitId,
            type: "maximum_rachat",
            prix: String(nouveau),
            label: "Prix max rachat (Bourse)",
            quantiteMin: 1,
            isActive: true,
          }) as any;
        }
        changements.push({ produitId: a.produitId, typePrix: "MAXIMUM_RACHAT", ancienPrix: String(ancien), nouveauPrix: String(nouveau), uniteId });
      }
    }
  }

  for (const c of changements) {
    await tx.insert(prixHistorique).values({
      produitId: c.produitId,
      fournisseurId,
      uniteId: c.uniteId || null,
      typePrix: c.typePrix,
      ancienPrix: c.ancienPrix,
      nouveauPrix: c.nouveauPrix,
      source,
      reference,
      referenceType,
      motif,
      effectuePar: user.id,
      agenceId: user.agenceId,
    }) as any;
  }

  if (changements.length > 0) {
    await tx.insert(auditLogs).values({
      userId: user.id,
      action: "prix.ajuster",
      entityType: "produit",
      details: JSON.stringify({ source, reference, referenceType, motif, changements }),
    }) as any;
  }

  return changements;
}

export const procurementRouter = createTRPCRouter({
  suppliers: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await db
        .select()
        .from(fournisseurs)
        .where(and(
          eq(fournisseurs.agenceId, ctx.user.agenceId),
          eq(fournisseurs.isActive, true)
        ))
        .orderBy(desc(fournisseurs.createdAt));
      return rows.map(s => ({
        id: String(s.id),
        nom: s.nom,
        code: s.code,
        contact: s.contact,
        telephone: s.telephone,
        email: s.email,
        adresse: s.adresse,
        ville: s.ville,
        pays: s.pays,
        agenceId: s.agenceId,
        isActive: s.isActive,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        name: s.nom,
        contactName: s.contact ?? "",
        phone: s.telephone ?? "",
        address: s.adresse ?? "",
        paymentTerms: "",
      }));
    }),
    create: stockProcedure
      .input(z.object({
        nom: z.string().optional(),
        code: z.string().optional(),
        contact: z.string().optional(),
        telephone: z.string().optional(),
        email: z.string().email().optional(),
        adresse: z.string().optional(),
        ville: z.string().optional(),
        pays: z.string().optional(),
        name: z.string().optional(),
        contactName: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        paymentTerms: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const effectiveValues = {
          nom: input.nom ?? input.name ?? "",
          code: input.code && input.code.trim() !== "" ? input.code : `F-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          contact: input.contact ?? input.contactName ?? null,
          telephone: input.telephone ?? input.phone ?? null,
          email: input.email ?? null,
          adresse: input.adresse ?? input.address ?? null,
          ville: input.ville ?? null,
          pays: input.pays ?? null,
          agenceId: ctx.user.agenceId,
        };
        const result = await db.insert(fournisseurs).values(effectiveValues).returning();
        const s = result[0];
        if (!s) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Échec de la création" });
        return {
          id: String(s.id),
          nom: s.nom,
          code: s.code,
          contact: s.contact,
          telephone: s.telephone,
          email: s.email,
          adresse: s.adresse,
          ville: s.ville,
          pays: s.pays,
          agenceId: s.agenceId,
          isActive: s.isActive,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          name: s.nom,
          contactName: s.contact ?? "",
          phone: s.telephone ?? "",
          address: s.adresse ?? "",
        };
      }),
    delete: stockProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await db.update(fournisseurs).set({ isActive: false }).where(eq(fournisseurs.id, Number(input.id))) as any;
        return { success: true };
      }),
    update: stockProcedure
      .input(z.object({
        id: z.string(),
        nom: z.string().optional(),
        code: z.string().optional(),
        contact: z.string().optional(),
        telephone: z.string().optional(),
        email: z.string().email().optional(),
        adresse: z.string().optional(),
        ville: z.string().optional(),
        pays: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const result = await db.update(fournisseurs)
          .set(data)
          .where(and(eq(fournisseurs.id, id), eq(fournisseurs.agenceId, ctx.user.agenceId)))
          .returning();
        const s = result[0];
        if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Fournisseur introuvable" });
        return {
          id: String(s.id),
          nom: s.nom,
          code: s.code,
          contact: s.contact,
          telephone: s.telephone,
          email: s.email,
          adresse: s.adresse,
          ville: s.ville,
          pays: s.pays,
          agenceId: s.agenceId,
          isActive: s.isActive,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          name: s.nom,
          contactName: s.contact ?? "",
          phone: s.telephone ?? "",
          address: s.adresse ?? "",
        };
      }),
  }),

  purchaseOrders: createTRPCRouter({
    list: protectedProcedure
      .input(z.object({
        statut: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const conditions = [eq(achats.agenceId, ctx.user.agenceId)];
        if (input?.statut) conditions.push(eq(achats.statut, input.statut));

        const rows = await db
          .select({
            id: achats.id,
            fournisseurId: achats.fournisseurId,
            reference: achats.reference,
            statut: achats.statut,
            totalHT: achats.totalHT,
            totalTTC: achats.totalTTC,
            notes: achats.notes,
            demandeur: achats.demandeur,
            demandeurId: achats.demandeurId,
            dateSouhaitee: achats.dateSouhaitee,
            priorite: achats.priorite,
            motif: achats.motif,
            destinationPosId: achats.destinationPosId,
            livraisonAttendue: achats.livraisonAttendue,
            creePar: achats.creePar,
            createdAt: achats.createdAt,
            fournisseur: {
              id: fournisseurs.id,
              nom: fournisseurs.nom,
              name: fournisseurs.nom,
            },
            destination: {
              id: caisses.id,
              libelle: caisses.libelle,
            },
          })
          .from(achats)
          .innerJoin(fournisseurs, eq(achats.fournisseurId, fournisseurs.id))
          .leftJoin(caisses, eq(achats.destinationPosId, caisses.id))
          .where(and(...conditions))
          .orderBy(desc(achats.createdAt));
        return rows.map(o => ({
          id: String(o.id),
          fournisseurId: o.fournisseurId,
          reference: o.reference,
          statut: o.statut,
          totalHT: o.totalHT,
          totalTTC: o.totalTTC,
          notes: o.notes,
          demandeur: o.demandeur,
          demandeurId: o.demandeurId,
          dateSouhaitee: o.dateSouhaitee,
          priorite: o.priorite,
          motif: o.motif,
          livraisonAttendue: o.livraisonAttendue,
          creePar: o.creePar,
          createdAt: o.createdAt,
          fournisseur: o.fournisseur,
          status: o.statut,
          supplier: o.fournisseur,
          totalAmount: Number(o.totalTTC ?? o.totalHT ?? 0),
          orderedAt: o.createdAt?.toISOString(),
          destinationPos: o.destination?.libelle ? { id: String(o.destination.id), name: o.destination.libelle } : null,
        }));
      }),
    create: stockProcedure
      .input(z.object({
        fournisseurId: z.string().optional(),
        supplierId: z.string().optional(),
        destinationPosId: z.string().optional(),
        reference: z.string().min(1).optional(),
        totalHT: z.string().optional(),
        totalTVA: z.string().optional(),
        totalTTC: z.string().optional(),
        notes: z.string().optional(),
        expectedDeliveryAt: z.union([z.string(), z.date()]).optional(),
        demandeur: z.string().max(255).optional(),
        demandeurId: z.string().optional(),
        dateSouhaitee: z.union([z.string(), z.date()]).optional(),
        priorite: z.enum(["basse", "normale", "haute"]).default("normale"),
        motif: z.string().optional(),
        statut: z.enum(["brouillon", "commande"]).optional(),
        livraisonAttendue: z.union([z.string(), z.date()]).optional(),
        lignes: z.array(z.object({
          produitId: z.string().optional(),
          quantite: z.number().min(1).optional(),
          prixUnitaire: z.string().min(1).optional(),
          uniteId: z.string().optional(),
          facteurConversion: z.number().optional(),
          productId: z.string().optional(),
          quantityOrdered: z.number().optional(),
          unitCost: z.number().optional(),
        })).optional(),
        lines: z.array(z.object({
          produitId: z.string().optional(),
          quantite: z.number().min(1).optional(),
          prixUnitaire: z.string().min(1).optional(),
          uniteId: z.string().optional(),
          facteurConversion: z.number().optional(),
          productId: z.string().optional(),
          quantityOrdered: z.number().optional(),
          unitCost: z.number().optional(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const effectiveFournisseurId = input.fournisseurId ?? input.supplierId;
        if (!effectiveFournisseurId) throw new TRPCError({ code: "BAD_REQUEST", message: "Fournisseur requis." });
        const expectedDeliveryStr = input.expectedDeliveryAt instanceof Date ? input.expectedDeliveryAt.toISOString() : input.expectedDeliveryAt;
        const effectiveLignes = (input.lignes ?? input.lines ?? []).map(l => ({
          produitId: l.produitId ?? l.productId,
          quantite: l.quantite ?? l.quantityOrdered ?? 0,
          prixUnitaire: l.prixUnitaire ?? String(l.unitCost ?? 0),
        }));
        return db.transaction(async (tx) => {
          const ref = `ACH-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
          const fournisseurId = input.fournisseurId ?? input.supplierId;
          const lignes = input.lignes ?? input.lines ?? [];
          if (!fournisseurId || !lignes.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Fournisseur et lignes requis." });
          const [achat] = await tx.insert(achats).values({
            fournisseurId: Number(fournisseurId),
            agenceId: ctx.user.agenceId,
            reference: ref,
            statut: input.statut ?? "commande",
            notes: input.notes || null,
            demandeur: input.demandeur || null,
            demandeurId: input.demandeurId ? Number(input.demandeurId) : null,
            dateSouhaitee: input.dateSouhaitee ? String(input.dateSouhaitee).slice(0, 10) : null,
            priorite: input.priorite ?? "normale",
            motif: input.motif || null,
            destinationPosId: input.destinationPosId ? Number(input.destinationPosId) : null,
            livraisonAttendue: input.livraisonAttendue ? String(input.livraisonAttendue).slice(0, 10) : null,
            creePar: ctx.user.id,
          }).returning() as any;
          let totalHT = 0;
          for (const ligne of lignes) {
            const qte = Number(ligne.quantite ?? ligne.quantityOrdered ?? 0);
            const pu = String(ligne.prixUnitaire ?? ligne.unitCost ?? 0);
            const uniteId = ligne.uniteId || null;
            const facteur = uniteId
              ? Number(ligne.facteurConversion) || (await getFacteurVersBase(tx as any, Number(ligne.produitId || ligne.productId), uniteId))
              : 1;
            totalHT += qte * Number(pu);
            await tx.insert(achatsLignes).values({
              achatId: achat.id,
              produitId: Number(ligne.produitId || ligne.productId),
              quantite: qte,
              prixUnitaire: pu,
              totalLigne: String(qte * Number(pu)),
              uniteId,
              facteurConversion: facteur,
              quantiteConvertie: uniteId ? String(qte * facteur) : null,
            }) as any;
          }
          await (tx as any).update(achats).set({ totalHT: String(totalHT), totalTVA: "0", totalTTC: String(totalHT) }).where(eq(achats.id, achat.id));
          return { id: String(achat.id), reference: ref };
        }) as any;
      }),
    get: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        const id = Number(input.id);
        const [achat] = await db.select().from(achats)
          .where(and(eq(achats.id, id), eq(achats.agenceId, ctx.user.agenceId)))
          .limit(1) as any;
        if (!achat) throw new TRPCError({ code: "NOT_FOUND", message: "Commande non trouvée" });
        const lignes = await db.select({
          id: achatsLignes.id,
          produitId: achatsLignes.produitId,
          quantite: achatsLignes.quantite,
          prixUnitaire: achatsLignes.prixUnitaire,
          uniteId: achatsLignes.uniteId,
          facteurConversion: achatsLignes.facteurConversion,
          titre: produits.titre,
          typeProduit: produits.typeProduit,
          prixVente: produits.prixVente,
          prixMinimumVente: produits.prixMinimumVente,
          prixAchat: produits.prixAchat,
          tva: produits.tva,
        }).from(achatsLignes)
          .leftJoin(produits, eq(achatsLignes.produitId, produits.id))
          .where(eq(achatsLignes.achatId, id));
        const produitsIds = lignes.map(l => l.produitId).filter(Boolean) as number[];
        let rachatMap = new Map<number, string>();
        if (produitsIds.length > 0) {
          const rachats = await db.select({
            produitId: tarifs.produitId,
            prix: tarifs.prix,
          }).from(tarifs)
            .where(and(
              eq(tarifs.type, "maximum_rachat"),
              eq(tarifs.isActive, true),
              inArray(tarifs.produitId, produitsIds)
            ));
          for (const r of rachats) rachatMap.set(Number(r.produitId), String(r.prix));
        }
        return {
          id: String(achat.id),
          reference: achat.reference,
          statut: achat.statut,
          fournisseurId: String(achat.fournisseurId),
          fournisseurNom: achat.fournisseurId ? (await db.select({ nom: fournisseurs.nom }).from(fournisseurs).where(eq(fournisseurs.id, achat.fournisseurId)).limit(1) as any)?.[0]?.nom ?? "" : "",
          demandeur: achat.demandeur,
          demandeurId: achat.demandeurId ? String(achat.demandeurId) : null,
          dateSouhaitee: achat.dateSouhaitee ? String(achat.dateSouhaitee).slice(0, 10) : null,
          priorite: achat.priorite,
          motif: achat.motif,
          notes: achat.notes,
          destinationPosId: achat.destinationPosId ? String(achat.destinationPosId) : null,
          livraisonAttendue: achat.livraisonAttendue ? String(achat.livraisonAttendue).slice(0, 10) : null,
          totalHT: achat.totalHT,
          totalTVA: achat.totalTVA,
          totalTTC: achat.totalTTC,
          lignes: lignes.map(l => ({
            id: l.id,
            produitId: String(l.produitId),
            titre: l.titre,
            quantite: l.quantite,
            prixUnitaire: String(l.prixUnitaire ?? 0),
            uniteId: l.uniteId ? String(l.uniteId) : null,
            facteurConversion: Number(l.facteurConversion ?? 1),
            typeProduit: l.typeProduit,
            prixVente: l.prixVente ? String(l.prixVente) : null,
            prixMinimumVente: l.prixMinimumVente ? String(l.prixMinimumVente) : null,
            prixAchat: l.prixAchat ? String(l.prixAchat) : null,
            tva: l.tva ? String(l.tva) : "0",
            prixMaximumRachat: rachatMap.get(Number(l.produitId)) ?? null,
          })),
        };
      }),
    update: stockProcedure
      .input(z.object({
        id: z.string(),
        fournisseurId: z.string().optional(),
        demandeur: z.string().max(255).optional(),
        demandeurId: z.string().optional(),
        dateSouhaitee: z.union([z.string(), z.date()]).optional(),
        priorite: z.enum(["basse", "normale", "haute"]).optional(),
        motif: z.string().optional(),
        destinationPosId: z.string().optional(),
        livraisonAttendue: z.union([z.string(), z.date()]).optional(),
        notes: z.string().optional(),
        lignes: z.array(z.object({
          produitId: z.string().optional(),
          quantite: z.number().min(1).optional(),
          prixUnitaire: z.string().min(1).optional(),
          uniteId: z.string().optional(),
          facteurConversion: z.number().optional(),
          productId: z.string().optional(),
          quantityOrdered: z.number().optional(),
          unitCost: z.number().optional(),
        })).optional(),
        lines: z.array(z.object({
          productId: z.string().optional(),
          quantityOrdered: z.number().optional(),
          unitCost: z.number().optional(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = Number(input.id);
        const [achat] = await db.select({ id: achats.id, statut: achats.statut, fournisseurId: achats.fournisseurId })
          .from(achats).where(eq(achats.id, id)).limit(1) as any;
        if (!achat) throw new TRPCError({ code: "NOT_FOUND", message: "Commande non trouvée" });
        if (achat.statut !== "brouillon") throw new TRPCError({ code: "BAD_REQUEST", message: "Seul un bon de commande brouillon peut être modifié." });
        const rawLignes = (input.lignes ?? input.lines ?? []) as Array<Record<string, unknown>>;
        if (!rawLignes.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Au moins une ligne requise." });
        const lignes = rawLignes.map((l) => ({
          produitId: (l.produitId ?? l.productId) as string | undefined,
          quantite: (l.quantite ?? l.quantityOrdered) as number | undefined,
          prixUnitaire: (l.prixUnitaire ?? (l.unitCost != null ? String(l.unitCost) : undefined)) as string | undefined,
          uniteId: l.uniteId as string | undefined,
          facteurConversion: l.facteurConversion as number | undefined,
        }));
        return db.transaction(async (tx) => {
          await (tx as any).update(achats).set({
            fournisseurId: input.fournisseurId ? Number(input.fournisseurId) : achat.fournisseurId,
            demandeur: input.demandeur ?? null,
            demandeurId: input.demandeurId ? Number(input.demandeurId) : null,
            dateSouhaitee: input.dateSouhaitee ? String(input.dateSouhaitee).slice(0, 10) : null,
            priorite: input.priorite ?? "normale",
            motif: input.motif ?? null,
            destinationPosId: input.destinationPosId ? Number(input.destinationPosId) : null,
            livraisonAttendue: input.livraisonAttendue ? String(input.livraisonAttendue).slice(0, 10) : null,
            notes: input.notes ?? null,
            updatedAt: new Date(),
          }).where(eq(achats.id, id));
          await (tx as any).delete(achatsLignes).where(eq(achatsLignes.achatId, id));
          let totalHT = 0;
          for (const ligne of lignes) {
            const qte = Number(ligne.quantite ?? 0);
            const pu = String(ligne.prixUnitaire ?? 0);
            const uniteId = ligne.uniteId || null;
            const facteur = uniteId
              ? Number(ligne.facteurConversion) || (await getFacteurVersBase(tx as any, Number(ligne.produitId), uniteId))
              : 1;
            totalHT += qte * Number(pu);
            await (tx as any).insert(achatsLignes).values({
              achatId: id,
              produitId: Number(ligne.produitId),
              quantite: qte,
              prixUnitaire: pu,
              totalLigne: String(qte * Number(pu)),
              uniteId,
              facteurConversion: facteur,
              quantiteConvertie: uniteId ? String(qte * facteur) : null,
            });
          }
          await (tx as any).update(achats).set({ totalHT: String(totalHT), totalTVA: "0", totalTTC: String(totalHT) }).where(eq(achats.id, id));
          return { id: String(id), success: true };
        }) as any;
      }),
    duplicate: stockProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const id = Number(input.id);
        const [achat] = await db.select().from(achats).where(eq(achats.id, id)).limit(1) as any;
        if (!achat) throw new TRPCError({ code: "NOT_FOUND", message: "Commande non trouvée" });
        const lignes = await db.select().from(achatsLignes).where(eq(achatsLignes.achatId, id));
        return db.transaction(async (tx) => {
          const ref = `ACH-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
          const [nouveau] = await (tx as any).insert(achats).values({
            fournisseurId: achat.fournisseurId,
            agenceId: ctx.user.agenceId,
            reference: ref,
            statut: "brouillon",
            notes: achat.notes,
            demandeur: achat.demandeur,
            demandeurId: achat.demandeurId,
            dateSouhaitee: achat.dateSouhaitee,
            priorite: achat.priorite,
            motif: achat.motif,
            destinationPosId: achat.destinationPosId,
            livraisonAttendue: achat.livraisonAttendue,
            creePar: ctx.user.id,
          }).returning();
          for (const l of lignes) {
            await (tx as any).insert(achatsLignes).values({
              achatId: nouveau.id,
              produitId: l.produitId,
              quantite: l.quantite,
              prixUnitaire: l.prixUnitaire,
              totalLigne: l.totalLigne,
              uniteId: l.uniteId,
              facteurConversion: l.facteurConversion,
              quantiteConvertie: l.quantiteConvertie,
            });
          }
          await (tx as any).update(achats).set({ totalHT: achat.totalHT, totalTVA: achat.totalTVA, totalTTC: achat.totalTTC }).where(eq(achats.id, nouveau.id));
          return { id: String(nouveau.id), reference: ref };
        }) as any;
      }),
    updateStatus: stockProcedure
      .input(z.object({
        id: z.string(),
        statut: z.enum(["brouillon", "commande", "partiel", "recu", "annulee"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const transitions: Record<string, string[]> = {
          brouillon: ["commande", "annulee"],
          commande: ["partiel", "recu", "annulee"],
          partiel: ["recu", "annulee"],
          recu: [],
          annulee: [],
        };
        const [achat] = await db.select({ statut: achats.statut }).from(achats).where(eq(achats.id, Number(input.id))).limit(1) as any;
        if (!achat) throw new TRPCError({ code: "NOT_FOUND", message: "Achat non trouvé" });
        const allowed = transitions[achat.statut] ?? [];
        if (!allowed.includes(input.statut)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Transition ${achat.statut} → ${input.statut} non autorisée` });
        }
        await db.update(achats).set({ statut: input.statut } as any).where(eq(achats.id, Number(input.id)));
        return { success: true };
      }),
  }),

  receivePurchaseOrder: requirePermissionProcedure("achats.recevoir")
    .input(z.object({
      id: z.string(),
      lignes: z.array(z.object({
        produitId: z.string(),
        quantiteRecue: z.number().min(0).optional(),
        prixUnitaire: z.union([z.string(), z.number()]).nullish(),
        motifEcart: z.string().optional(),
      })).optional(),
      paiement: z.object({
        mode: z.string(),
        caisseId: z.number().optional(),
        montant: z.string().optional(),
        reference: z.string().optional(),
        notes: z.string().optional(),
      }).optional(),
      motifReliquat: z.string().optional(),
      prixAjustes: z.array(z.object({
        produitId: z.string(),
        prixAchat: z.union([z.string(), z.number()]).nullish(),
        prixVente: z.union([z.string(), z.number()]).nullish(),
        prixMinimumVente: z.union([z.string(), z.number()]).nullish(),
        prixReglementeValeur: z.union([z.string(), z.number()]).nullish(),
        prixMaximumRachat: z.union([z.string(), z.number()]).nullish(),
        tva: z.union([z.string(), z.number()]).nullish(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const prixAjustesMap = new Map<number, any>();
        for (const p of input.prixAjustes ?? []) {
          const pid = Number(p.produitId);
          if (pid && (p.prixAchat != null || p.prixVente != null || p.prixMinimumVente != null || p.prixReglementeValeur != null || p.prixMaximumRachat != null || p.tva != null)) {
            prixAjustesMap.set(pid, p);
          }
        }
        const lignesRecues = new Map<number, { qteRecue: number; prixUnitaire?: number | null; motifEcart?: string }>();
        for (const l of input.lignes ?? []) {
          lignesRecues.set(Number(l.produitId), {
            qteRecue: l.quantiteRecue ?? 0,
            prixUnitaire: l.prixUnitaire != null ? Number(l.prixUnitaire) : undefined,
            motifEcart: l.motifEcart,
          });
        }

        const [achat] = await tx
          .select()
          .from(achats)
          .where(and(
            eq(achats.id, input.id),
            eq(achats.agenceId, ctx.user.agenceId)
          ))
          .limit(1) as any;

        if (!achat) throw new TRPCError({ code: "NOT_FOUND", message: "Achat non trouvé" });
        if (achat.statut === "recu" || achat.statut === "cloturee") throw new TRPCError({ code: "BAD_REQUEST", message: "Dossier déjà fermé" });
        if (achat.statut === "annulee") throw new TRPCError({ code: "BAD_REQUEST", message: "Commande annulée" });

        const [supplier] = await tx
          .select()
          .from(fournisseurs)
          .where(eq(fournisseurs.id, achat.fournisseurId))
          .limit(1) as any;

        const achatsLignesData = await tx
          .select()
          .from(achatsLignes)
          .where(eq(achatsLignes.achatId, Number(input.id))) as any;

        const [br] = await tx.insert(bonsReception).values({
          achatId: Number(input.id),
          fournisseurId: Number(achat.fournisseurId || supplier.id),
          agenceId: ctx.user.agenceId,
          reference: `BR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          statut: "recu",
          receptionnePar: ctx.user.id,
        }).returning() as any;

        let allReceived = true;
        let montantRecu = 0;
        for (const ligne of achatsLignesData) {
          const pId = ligne.produitId;
          if (!pId) continue;
          const recu = lignesRecues.get(pId);
          const qteCommandee = Number(ligne.quantite ?? 0);
          const qteRecue = recu ? recu.qteRecue : qteCommandee;
          const pu = recu?.prixUnitaire != null ? String(recu.prixUnitaire) : (ligne.prixUnitaire ? String(ligne.prixUnitaire) : "0");
          const prixBC = Number(ligne.prixUnitaire ?? 0);
          const prixRecu = Number(pu);
          if (qteRecue < qteCommandee) {
            allReceived = false;
            if (!(recu?.motifEcart)) {
              throw new TRPCError({ code: "BAD_REQUEST", message: `Motif d'écart requis pour la réception partielle du produit ${pId}` });
            }
          }
          if (qteRecue > 0) montantRecu += qteRecue * prixBC;

          let uniteId = ligne.uniteId || null;
          let facteur = 1;
          if (uniteId) {
            facteur = await getFacteurVersBase(tx as any, pId, uniteId);
          } else {
            const [uniteData] = await tx.select({ uniteBaseId: produits.uniteBaseId }).from(produits).where(eq(produits.id, pId)).limit(1) as any;
            uniteId = uniteData?.uniteBaseId || null;
          }
          const qteBase = qteRecue * facteur;
          const coutUnitaireBase = facteur > 0 ? Number(pu) / facteur : Number(pu);

          await tx.insert(lignesBonReception).values({
            bonReceptionId: br.id,
            produitId: pId,
            quantiteCommandee: qteCommandee,
            quantiteRecue: qteRecue,
            prixUnitaire: pu,
            prixUnitaireBC: String(prixBC),
            motifEcart: recu?.motifEcart || null,
          }) as any;

          await enregistrerEcartsReception(tx as any, {
            bonReceptionId: br.id,
            achatId: Number(input.id),
            produitId: pId,
            quantiteCommandee: qteCommandee,
            quantiteRecue: qteRecue,
            prixBC,
            prixRecu,
            motifEcart: recu?.motifEcart,
            effectuePar: Number(ctx.user.id),
          });

          const [existingStock] = await tx.select().from(stocks).where(and(eq(stocks.produitId, pId), eq(stocks.agenceId, ctx.user.agenceId))).limit(1) as any;

          if (existingStock) {
            const oldQte = Number(existingStock.quantite ?? 0);
            const oldCMP = Number(existingStock.coutUnitaireMoyen ?? 0);
            const newQte = oldQte + qteBase;
            const newCMP = qteBase > 0 ? ((oldCMP * oldQte) + (coutUnitaireBase * qteBase)) / newQte : oldCMP;
            await tx.update(stocks).set({ quantite: String(newQte), coutUnitaireMoyen: String(newCMP) }).where(eq(stocks.id, existingStock.id)) as any;
            await tx.insert(mouvementsStock).values({
              produitId: pId, agenceId: ctx.user.agenceId,
              type: "ACHAT_RECEPTION", sens: "E",
              quantite: String(qteBase), uniteId,
              stockAvant: String(oldQte), stockApres: String(newQte),
              coutUnitaireBase: String(coutUnitaireBase), reference: br.reference, referenceType: "BON_RECEPTION",
              motif: "Réception commande", effectuePar: ctx.user.id,
            }) as any;
          } else {
            await tx.insert(stocks).values({ produitId: pId, agenceId: ctx.user.agenceId, quantite: String(qteBase), uniteReferenceId: uniteId, coutUnitaireMoyen: String(coutUnitaireBase) }) as any;
            await tx.insert(mouvementsStock).values({
              produitId: pId, agenceId: ctx.user.agenceId,
              type: "ACHAT_RECEPTION", sens: "E",
              quantite: String(qteBase), uniteId,
              stockAvant: "0", stockApres: String(qteBase),
              coutUnitaireBase: String(coutUnitaireBase), reference: br.reference, referenceType: "BON_RECEPTION",
              motif: "Réception commande", effectuePar: ctx.user.id,
            }) as any;
          }

          if (uniteId) {
            const [existingSU] = await tx.select().from(stocksUnites).where(
              and(eq(stocksUnites.produitId, pId), eq(stocksUnites.agenceId, ctx.user.agenceId), eq(stocksUnites.uniteId, uniteId))
            ).limit(1) as any;
            if (existingSU) {
              await tx.update(stocksUnites).set({ quantite: existingSU.quantite + qteRecue }).where(eq(stocksUnites.id, existingSU.id)) as any;
            } else {
              await tx.insert(stocksUnites).values({ produitId: pId, agenceId: ctx.user.agenceId, uniteId, quantite: qteRecue }) as any;
            }
          }

          const ajustement = prixAjustesMap.get(pId);
          if (ajustement) {
            await appliquerPrixCatalogue(
              tx,
              { id: ctx.user.id, agenceId: ctx.user.agenceId },
              Number(achat.fournisseurId || supplier.id),
              uniteId,
              "RECEPTION_COMMANDE",
              br.reference,
              "BON_RECEPTION",
              "Ajustement prix à la réception de la commande",
              [{ produitId: pId, prixAchat: ajustement.prixAchat ?? null, prixVente: ajustement.prixVente ?? null, prixMinimumVente: ajustement.prixMinimumVente ?? null, prixReglementeValeur: ajustement.prixReglementeValeur ?? null, prixMaximumRachat: ajustement.prixMaximumRachat ?? null, tva: ajustement.tva ?? null }]
            );
          }
        }

        let newStatut: string;
        if (allReceived) {
          newStatut = "recu";
        } else if (input.motifReliquat) {
          newStatut = "cloturee";
          for (const ligne of achatsLignesData) {
            const pId = ligne.produitId;
            const recu = lignesRecues.get(pId);
            const qteCommandee = Number(ligne.quantite ?? 0);
            const qteRecue = recu ? recu.qteRecue : 0;
            if (qteRecue < qteCommandee) {
              await enregistrerEcartsReception(tx as any, {
                bonReceptionId: br.id,
                achatId: Number(input.id),
                produitId: pId,
                quantiteCommandee: qteCommandee - qteRecue,
                quantiteRecue: 0,
                prixBC: Number(ligne.prixUnitaire ?? 0),
                prixRecu: Number(ligne.prixUnitaire ?? 0),
                motifEcart: input.motifReliquat,
                effectuePar: Number(ctx.user.id),
              });
            }
          }
        } else {
          newStatut = "partiel";
        }

        await tx.update(achats).set({
          statut: newStatut,
          montantRecu: sql`COALESCE(${achats.montantRecu}, 0) + ${montantRecu}`,
          dateCloture: newStatut === "cloturee" ? new Date() : undefined,
          cloturePar: newStatut === "cloturee" ? ctx.user.id : undefined,
          motif: newStatut === "cloturee" ? (input.motifReliquat ?? null) : undefined,
        }).where(eq(achats.id, Number(input.id))) as any;

        let detteCreee = false;
        if (montantRecu > 0) {
          const dette = await cumulerDetteEtPayer(tx as any, {
            achatId: Number(input.id),
            fournisseurId: Number(achat.fournisseurId || supplier.id),
            agenceId: ctx.user.agenceId,
            montantRecu,
            paiement: (input.paiement as PaiementReception | null) ?? null,
            motifDette: `Auto-générée depuis la réception de la commande #${input.id} (${br.reference})`,
            effectuePar: Number(ctx.user.id),
          });
          detteCreee = dette.detteId != null;
        }

        return { success: true, recu: allReceived, statut: newStatut, detteCreee };
      }) as any;
    }),

  // Fermeture du dossier d'un BC partiellement reçu : le reliquat non reçu est
  // abandonné et documenté (écart QTE_INF) avec motif ; la dette reste calculée
  // sur ce qui a été réellement reçu.
  cloturerAchat: requirePermissionProcedure("achats.recevoir")
    .input(z.object({
      achatId: z.coerce.number(),
      motif: z.string().min(3, "Motif requis (min. 3 caractères)"),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [achat] = await (tx as any).select().from(achats)
          .where(and(eq(achats.id, input.achatId), eq(achats.agenceId, ctx.user.agenceId)))
          .limit(1).for("update");
        if (!achat) throw new TRPCError({ code: "NOT_FOUND", message: "Commande introuvable" });
        if (achat.statut !== "partiel") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Seule une commande partiellement reçue peut être clôturée" });
        }

        const lignes = await (tx as any).select().from(achatsLignes).where(eq(achatsLignes.achatId, input.achatId));
        const brIds = await (tx as any).select({ id: bonsReception.id }).from(bonsReception).where(eq(bonsReception.achatId, input.achatId));

        const recuParProduit = new Map<number, number>();
        if (brIds.length) {
          const lignesRecues = await (tx as any).select({
            produitId: lignesBonReception.produitId,
            qte: sql<number>`COALESCE(SUM(${lignesBonReception.quantiteRecue}), 0)`,
          }).from(lignesBonReception)
            .where(inArray(lignesBonReception.bonReceptionId, brIds.map((b: any) => b.id)))
            .groupBy(lignesBonReception.produitId);
          for (const r of lignesRecues) recuParProduit.set(Number(r.produitId), Number(r.qte ?? 0));
        }

        for (const ligne of lignes) {
          const pId = Number(ligne.produitId);
          const reste = Number(ligne.quantite ?? 0) - (recuParProduit.get(pId) ?? 0);
          if (reste > 0) {
            await (tx as any).insert(ecartsReception).values({
              bonReceptionId: null,
              achatId: input.achatId,
              produitId: pId,
              typeEcart: "QTE_INF",
              quantiteCommandee: reste,
              quantiteRecue: 0,
              prixBC: String(ligne.prixUnitaire ?? 0),
              prixRecu: String(ligne.prixUnitaire ?? 0),
              motif: input.motif,
              creePar: ctx.user.id,
            });
          }
        }

        await (tx as any).update(achats).set({
          statut: "cloturee",
          dateCloture: new Date(),
          cloturePar: ctx.user.id,
          motif: input.motif,
        }).where(eq(achats.id, input.achatId));

        return { success: true };
      }) as any;
    }),

  // Vue consolidée du dossier d'achat : BC, réceptions, écarts, paiements et
  // restants (à recevoir / à payer) — traçabilité jusqu'à la fermeture.
  dossierAchat: protectedProcedure
    .input(z.object({ achatId: z.coerce.number() }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const [achat] = await db.select().from(achats)
        .where(and(eq(achats.id, input.achatId), eq(achats.agenceId, agenceId)))
        .limit(1) as any;
      if (!achat) throw new TRPCError({ code: "NOT_FOUND", message: "Commande introuvable" });

      const [fournisseur] = await db.select({ nom: fournisseurs.nom }).from(fournisseurs)
        .where(eq(fournisseurs.id, achat.fournisseurId)).limit(1) as any;

      const lignes = await db.select({
        id: achatsLignes.id,
        produitId: achatsLignes.produitId,
        quantite: achatsLignes.quantite,
        prixUnitaire: achatsLignes.prixUnitaire,
        titre: produits.titre,
      }).from(achatsLignes)
        .leftJoin(produits, eq(produits.id, achatsLignes.produitId))
        .where(eq(achatsLignes.achatId, input.achatId)) as any;

      const receptions = await db.select().from(bonsReception)
        .where(eq(bonsReception.achatId, input.achatId))
        .orderBy(desc(bonsReception.createdAt)) as any;

      const brIds = receptions.map((r: any) => r.id);
      let lignesRecues: any[] = [];
      if (brIds.length) {
        lignesRecues = await db.select({
          bonReceptionId: lignesBonReception.bonReceptionId,
          produitId: lignesBonReception.produitId,
          quantiteRecue: lignesBonReception.quantiteRecue,
          prixUnitaire: lignesBonReception.prixUnitaire,
          prixUnitaireBC: lignesBonReception.prixUnitaireBC,
          motifEcart: lignesBonReception.motifEcart,
        }).from(lignesBonReception)
          .where(inArray(lignesBonReception.bonReceptionId, brIds)) as any;
      }

      const ecarts = await db.select().from(ecartsReception)
        .where(eq(ecartsReception.achatId, input.achatId))
        .orderBy(desc(ecartsReception.createdAt)) as any;

      const [dette] = await db.select().from(dettesFournisseurs)
        .where(eq(dettesFournisseurs.achatId, input.achatId)).limit(1) as any;

      let paiements: any[] = [];
      if (dette) {
        paiements = await db.select().from(remboursementsFournisseurs)
          .where(eq(remboursementsFournisseurs.detteId, dette.id))
          .orderBy(desc(remboursementsFournisseurs.createdAt)) as any;
      }

      const recuParProduit = new Map<number, number>();
      for (const lr of lignesRecues) {
        recuParProduit.set(Number(lr.produitId), (recuParProduit.get(Number(lr.produitId)) ?? 0) + Number(lr.quantiteRecue ?? 0));
      }

      const montantBC = lignes.reduce((s: number, l: any) => s + Number(l.quantite ?? 0) * Number(l.prixUnitaire ?? 0), 0);

      return {
        achat: { ...achat, fournisseurNom: fournisseur?.nom ?? null },
        lignes: lignes.map((l: any) => ({
          ...l,
          quantiteRecue: recuParProduit.get(Number(l.produitId)) ?? 0,
          resteARecevoir: Math.max(0, Number(l.quantite ?? 0) - (recuParProduit.get(Number(l.produitId)) ?? 0)),
        })),
        receptions: receptions.map((r: any) => ({
          ...r,
          lignes: lignesRecues.filter((lr) => lr.bonReceptionId === r.id),
        })),
        ecarts,
        dette: dette ?? null,
        paiements,
        totaux: {
          montantBC,
          montantRecu: Number(achat.montantRecu ?? 0),
          montantPaye: Number(achat.montantPaye ?? 0),
          resteAPayer: Math.max(0, Number(dette?.montantRestant ?? 0)),
        },
      };
    }),

  // ─── Réceptions ───
  listReceptions: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select()
      .from(bonsReception)
      .where(eq(bonsReception.agenceId, ctx.user.agenceId))
      .orderBy(desc(bonsReception.createdAt));
    return rows.map(r => ({
      id: r.id,
      reference: r.reference,
      statut: r.statut,
      achatId: r.achatId,
      fournisseurId: r.fournisseurId,
      notes: r.notes,
      receptionnePar: r.receptionnePar,
      createdAt: r.createdAt,
    }));
  }),

  // Historique des prix (traçabilité append-only)
  historiquePrix: protectedProcedure
    .input(z.object({
      produitId: z.coerce.number().optional(),
      typePrix: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(prixHistorique.agenceId, ctx.user.agenceId)];
      if (input.produitId) conditions.push(eq(prixHistorique.produitId, input.produitId));
      if (input.typePrix) conditions.push(eq(prixHistorique.typePrix, input.typePrix));
      const rows = await db.select({
        id: prixHistorique.id,
        produitId: prixHistorique.produitId,
        produitTitre: produits.titre,
        fournisseurId: prixHistorique.fournisseurId,
        fournisseurNom: fournisseurs.nom,
        uniteId: prixHistorique.uniteId,
        uniteLibelle: unitesMesure.libelle,
        typePrix: prixHistorique.typePrix,
        ancienPrix: prixHistorique.ancienPrix,
        nouveauPrix: prixHistorique.nouveauPrix,
        source: prixHistorique.source,
        reference: prixHistorique.reference,
        referenceType: prixHistorique.referenceType,
        motif: prixHistorique.motif,
        effectueParNom: sql`coalesce(${utilisateurs.prenom} || ' ' || ${utilisateurs.nom}, ${utilisateurs.nom})`,
        createdAt: prixHistorique.createdAt,
      })
        .from(prixHistorique)
        .leftJoin(produits, eq(prixHistorique.produitId, produits.id))
        .leftJoin(fournisseurs, eq(prixHistorique.fournisseurId, fournisseurs.id))
        .leftJoin(unitesMesure, eq(prixHistorique.uniteId, unitesMesure.id))
        .leftJoin(utilisateurs, eq(prixHistorique.effectuePar, utilisateurs.id))
        .where(and(...conditions))
        .orderBy(desc(prixHistorique.createdAt))
        .limit(input.limit);
      return rows as any[];
    }),

  // Traçabilité comptable : toutes les réceptions d'un produit (par BR)
  receptionsParProduit: protectedProcedure
    .input(z.object({
      produitId: z.coerce.number().optional(),
      fournisseurId: z.coerce.number().optional(),
      limit: z.number().min(1).max(500).default(200),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(bonsReception.agenceId, ctx.user.agenceId)];
      if (input.produitId) conditions.push(eq(lignesBonReception.produitId, input.produitId));
      if (input.fournisseurId) conditions.push(eq(bonsReception.fournisseurId, input.fournisseurId));
      const rows = await db.select({
        id: lignesBonReception.id,
        bonReceptionId: bonsReception.id,
        reference: bonsReception.reference,
        statut: bonsReception.statut,
        createdAt: bonsReception.createdAt,
        produitId: lignesBonReception.produitId,
        produitTitre: produits.titre,
        fournisseurId: bonsReception.fournisseurId,
        fournisseurNom: fournisseurs.nom,
        quantiteCommandee: lignesBonReception.quantiteCommandee,
        quantiteRecue: lignesBonReception.quantiteRecue,
        prixUnitaire: lignesBonReception.prixUnitaire,
        receptionneParNom: sql`coalesce(${utilisateurs.prenom} || ' ' || ${utilisateurs.nom}, ${utilisateurs.nom})`,
      })
        .from(lignesBonReception)
        .innerJoin(bonsReception, eq(lignesBonReception.bonReceptionId, bonsReception.id))
        .innerJoin(produits, eq(lignesBonReception.produitId, produits.id))
        .leftJoin(fournisseurs, eq(bonsReception.fournisseurId, fournisseurs.id))
        .leftJoin(utilisateurs, eq(bonsReception.receptionnePar, utilisateurs.id))
        .where(and(...conditions))
        .orderBy(desc(bonsReception.createdAt))
        .limit(input.limit);
      const montantTotal = rows.reduce((s, r) => s + Number(r.quantiteRecue) * Number(r.prixUnitaire), 0);
      return { rows: rows as any[], montantTotal };
    }),

  createReception: requirePermissionProcedure("achats.recevoir")
    .input(z.object({
      achatId: z.string(),
      fournisseurId: z.string(),
      lignes: z.array(z.object({
        produitId: z.string(),
        quantiteCommandee: z.number().min(1),
        quantiteRecue: z.number().min(0),
        prixUnitaire: z.string(),
        uniteId: z.string().optional(),
        facteurConversion: z.number().default(1),
        appliquerPrixCatalogue: z.boolean().default(false),
        prixVente: z.union([z.string(), z.number()]).nullish(),
        prixMinimumVente: z.union([z.string(), z.number()]).nullish(),
        prixReglementeValeur: z.union([z.string(), z.number()]).nullish(),
        prixMaximumRachat: z.union([z.string(), z.number()]).nullish(),
        tva: z.union([z.string(), z.number()]).nullish(),
        motifEcart: z.string().optional(),
      })),
      paiement: z.object({
        mode: z.string(),
        caisseId: z.number().optional(),
        montant: z.string().optional(),
        reference: z.string().optional(),
        notes: z.string().optional(),
      }).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const linkedAchatId = input.achatId.startsWith("standalone") ? null : Number(input.achatId);
        if (linkedAchatId != null && !Number.isInteger(linkedAchatId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Identifiant de commande invalide" });
        }
        let bcPrixMap = new Map<number, number>();
        if (linkedAchatId != null) {
          const [achatExistant] = await tx.select({ statut: achats.statut }).from(achats).where(
            and(eq(achats.id, linkedAchatId), eq(achats.agenceId, ctx.user.agenceId))
          ).limit(1) as any;
          if (!achatExistant) throw new TRPCError({ code: "NOT_FOUND", message: "Commande d'achat introuvable" });
          if (achatExistant.statut === "recu" || achatExistant.statut === "cloturee") throw new TRPCError({ code: "BAD_REQUEST", message: "Dossier déjà fermé" });
          if (achatExistant.statut === "annulee") throw new TRPCError({ code: "BAD_REQUEST", message: "Commande annulée" });
          const bcLignes = await tx.select().from(achatsLignes).where(eq(achatsLignes.achatId, linkedAchatId)) as any;
          for (const l of bcLignes) bcPrixMap.set(Number(l.produitId), Number(l.prixUnitaire ?? 0));
        }
        const ref = `BR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const [br] = await tx.insert(bonsReception).values({
          achatId: linkedAchatId,
          fournisseurId: Number(input.fournisseurId),
          agenceId: ctx.user.agenceId,
          reference: ref,
          statut: "en_controle",
          receptionnePar: ctx.user.id,
          notes: input.notes || null,
        }).returning() as any;
        let allReceived = true;
        let montantRecu = 0;
        for (const [ligneIndex, ligne] of input.lignes.entries()) {
          const pId = Number(ligne.produitId);
          const qteCommandee = Number(ligne.quantiteCommandee ?? 0);
          const qteRecue = Number(ligne.quantiteRecue ?? 0);
          const prixUnitaire = Number(ligne.prixUnitaire ?? 0);
          if (qteRecue < qteCommandee) allReceived = false;
          const prixBC = bcPrixMap.get(pId) ?? null;
          if (qteRecue < qteCommandee && !ligne.motifEcart) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Motif d'écart requis pour une réception partielle (${ligne.produitId})` });
          }
          if (qteRecue > 0) montantRecu += qteRecue * (prixBC ?? prixUnitaire);

          const uniteId = ligne.uniteId || null;
          const facteur = uniteId
            ? await getFacteurVersBase(tx as any, pId, uniteId)
            : 1;
          const qteBase = qteRecue * facteur;
          const coutUnitaireBase = facteur > 0 ? prixUnitaire / facteur : prixUnitaire;

          await tx.insert(lignesBonReception).values({
            bonReceptionId: br.id,
            produitId: pId,
            quantiteCommandee: qteCommandee,
            quantiteRecue: qteRecue,
            prixUnitaire: String(prixUnitaire),
            prixUnitaireBC: prixBC != null ? String(prixBC) : null,
            motifEcart: ligne.motifEcart || null,
          }) as any;

          await enregistrerEcartsReception(tx as any, {
            bonReceptionId: br.id,
            achatId: linkedAchatId,
            produitId: pId,
            quantiteCommandee: qteCommandee,
            quantiteRecue: qteRecue,
            prixBC,
            prixRecu: prixUnitaire,
            motifEcart: ligne.motifEcart,
            effectuePar: Number(ctx.user.id),
          });

          if (qteRecue > 0) {
            const { lotId } = await creerLotEtStock(tx as any, {
              produitId: pId,
              agenceId: ctx.user.agenceId,
              quantite: qteBase,
              coutUnitaire: coutUnitaireBase,
              fournisseurId: Number(input.fournisseurId),
              numeroLot: `LOT-${ref}-${ligneIndex}`,
              reference: ref,
            });
            const [existingStock] = await tx.select().from(stocks).where(
              and(eq(stocks.produitId, pId), eq(stocks.agenceId, ctx.user.agenceId))
            ).limit(1) as any;
            const oldQte = existingStock ? Number(existingStock.quantite ?? 0) : 0;
            const oldCMP = existingStock ? Number(existingStock.coutUnitaireMoyen ?? 0) : 0;
            const newQte = oldQte + qteBase;
            const newCMP = qteBase > 0 ? ((oldCMP * oldQte) + (coutUnitaireBase * qteBase)) / newQte : oldCMP;

            if (existingStock) {
              await tx.update(stocks).set({
                quantite: String(newQte),
                coutUnitaireMoyen: String(newCMP),
              }).where(eq(stocks.id, existingStock.id)) as any;
            } else {
              await tx.insert(stocks).values({
                produitId: pId,
                agenceId: ctx.user.agenceId,
                quantite: String(qteBase),
                uniteReferenceId: uniteId,
                coutUnitaireMoyen: String(coutUnitaireBase),
              }) as any;
            }

            await tx.insert(mouvementsStock).values({
              produitId: pId,
              agenceId: ctx.user.agenceId,
              type: "ACHAT_RECEPTION",
              sens: "E",
              quantite: String(qteBase),
              uniteId,
              lotId,
              stockAvant: String(oldQte),
              stockApres: String(newQte),
              coutUnitaireBase: String(coutUnitaireBase),
              reference: ref,
              referenceType: "BON_RECEPTION",
              motif: "Réception fournisseur",
              effectuePar: ctx.user.id,
            }) as any;

            if (uniteId) {
              const [existingSU] = await tx.select().from(stocksUnites).where(
                and(eq(stocksUnites.produitId, pId), eq(stocksUnites.agenceId, ctx.user.agenceId), eq(stocksUnites.uniteId, uniteId))
              ).limit(1) as any;
              if (existingSU) {
                await tx.update(stocksUnites).set({ quantite: existingSU.quantite + qteRecue }).where(eq(stocksUnites.id, existingSU.id)) as any;
              } else {
                await tx.insert(stocksUnites).values({ produitId: pId, agenceId: ctx.user.agenceId, uniteId, quantite: qteRecue }) as any;
              }
            }

            if (ligne.appliquerPrixCatalogue) {
              await appliquerPrixCatalogue(
                tx,
                { id: ctx.user.id, agenceId: ctx.user.agenceId },
                Number(input.fournisseurId),
                uniteId,
                "RECEPTION_LIBRE",
                ref,
                "BON_RECEPTION",
                "Ajustement prix à la réception libre",
                [{ produitId: pId, prixAchat: prixUnitaire, prixVente: ligne.prixVente != null ? Number(ligne.prixVente) : null, prixMinimumVente: ligne.prixMinimumVente != null ? Number(ligne.prixMinimumVente) : null, prixReglementeValeur: ligne.prixReglementeValeur != null ? Number(ligne.prixReglementeValeur) : null, prixMaximumRachat: ligne.prixMaximumRachat != null ? Number(ligne.prixMaximumRachat) : null, tva: ligne.tva != null ? Number(ligne.tva) : null }]
              );
            }
          }
        }
        const newStatut = allReceived ? "recu" : "partiel";
        if (linkedAchatId != null) {
          await tx.update(achats).set({
            statut: newStatut,
            montantRecu: sql`COALESCE(${achats.montantRecu}, 0) + ${montantRecu}`,
          }).where(eq(achats.id, linkedAchatId)) as any;

          if (montantRecu > 0) {
            const dette = await cumulerDetteEtPayer(tx as any, {
              achatId: linkedAchatId,
              fournisseurId: Number(input.fournisseurId),
              agenceId: ctx.user.agenceId,
              montantRecu,
              paiement: (input.paiement as PaiementReception | null) ?? null,
              motifDette: `Auto-générée depuis la réception ${ref}`,
              effectuePar: Number(ctx.user.id),
            });
            return { id: String(br.id), reference: ref, statut: newStatut, detteId: dette.detteId };
          }
        }

        return { id: String(br.id), reference: ref, statut: newStatut };
      }) as any;
    }),

  getReception: protectedProcedure
    .input(z.object({ id: z.coerce.string() }))
    .query(async ({ input }) => {
      const [bon] = await db.select()
        .from(bonsReception)
        .where(eq(bonsReception.id, input.id))
        .limit(1);
      if (!bon) throw new TRPCError({ code: "NOT_FOUND" });
      const lignes = await db.select()
        .from(lignesBonReception)
        .where(eq(lignesBonReception.bonReceptionId, input.id));
      return { ...bon, lignes };
    }),

  validerReception: requirePermissionProcedure("achats.recevoir")
    .input(z.object({
      id: z.coerce.string(),
      notesControle: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [bon] = await db.select()
        .from(bonsReception)
        .where(and(eq(bonsReception.id, input.id), eq(bonsReception.agenceId, ctx.user.agenceId)))
        .limit(1);
      if (!bon) throw new TRPCError({ code: "NOT_FOUND", message: "Réception introuvable" });
      if (bon.statut !== "en_controle") throw new TRPCError({ code: "BAD_REQUEST", message: "Statut invalide" });
      await db.update(bonsReception).set({ statut: "validee", notes: input.notesControle || bon.notes } as any).where(eq(bonsReception.id, input.id));
      return { success: true };
    }),

  rejeterReception: requirePermissionProcedure("achats.recevoir")
    .input(z.object({
      id: z.coerce.string(),
      motifRejet: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [bon] = await tx.select()
          .from(bonsReception)
          .where(and(eq(bonsReception.id, input.id), eq(bonsReception.agenceId, ctx.user.agenceId)))
          .limit(1);
        if (!bon) throw new TRPCError({ code: "NOT_FOUND", message: "Réception introuvable" });
        if (bon.statut !== "en_controle") throw new TRPCError({ code: "BAD_REQUEST", message: "Statut invalide" });
        const lignes = await tx.select().from(lignesBonReception).where(eq(lignesBonReception.bonReceptionId, Number(input.id))) as any[];
        for (const ligne of lignes) {
          const qteRecue = Number(ligne.quantiteRecue ?? 0);
          if (qteRecue <= 0) continue;
          const produitId = Number(ligne.produitId);
          const [existingStock] = await tx.select().from(stocks).where(
            and(eq(stocks.produitId, produitId), eq(stocks.agenceId, ctx.user.agenceId))
          ).limit(1) as any;
          if (!existingStock) continue;
          const oldQte = Number(existingStock.quantite ?? 0);
          const newQte = Math.max(0, oldQte - qteRecue);
          await tx.update(stocks).set({ quantite: String(newQte) }).where(eq(stocks.id, existingStock.id)) as any;

          const lotId = await trouverLotParReference(tx as any, {
            produitId,
            agenceId: ctx.user.agenceId,
            reference: bon.reference,
            referenceType: "BON_RECEPTION",
          });
          if (lotId != null) {
            await sortirLotSpecifique(tx as any, {
              lotId,
              produitId,
              agenceId: ctx.user.agenceId,
              quantite: qteRecue,
              type: "REJET_RECEPTION",
              motif: input.motifRejet || "Réception rejetée",
              effectuePar: Number(ctx.user.id),
              reference: bon.reference,
              referenceType: "BON_RECEPTION",
            });
          }

          await tx.insert(mouvementsStock).values({
            produitId,
            agenceId: ctx.user.agenceId,
            type: "REJET_RECEPTION",
            sens: "S",
            quantite: String(qteRecue),
            stockAvant: String(oldQte),
            stockApres: String(newQte),
            reference: bon.reference,
            referenceType: "BON_RECEPTION",
            motif: input.motifRejet || "Réception rejetée",
            effectuePar: ctx.user.id,
          }) as any;

          const coutUnitaire = Number(existingStock.coutUnitaireMoyen ?? 0);
          const montantPerte = qteRecue * coutUnitaire;
          if (montantPerte > 0) {
            await PertesService.enregistrerPerte({
              agenceId: ctx.user.agenceId,
              produitId,
              quantite: qteRecue,
              coutUnitaire,
              montantPerte,
              typePerte: "REJET_RECEPTION",
              motif: input.motifRejet || "Réception rejetée",
              reference: bon.reference,
              referenceType: "BON_RECEPTION",
              effectuePar: Number(ctx.user.id),
            }, tx as any);
          }
        }
        await tx.update(bonsReception).set({ statut: "rejetee", notes: input.motifRejet || bon.notes } as any).where(eq(bonsReception.id, input.id));
        return { success: true };
      }) as any;
    }),

  // ─── Suggestion automatique de BC ───
  suggestedOrders: protectedProcedure
    .input(z.object({
      agenceId: z.number().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const agenceId = input?.agenceId ?? ctx.user.agenceId ?? 1;
      const suggestions = await getSuggestionsInternes(agenceId);
      const totalProduits = suggestions.reduce((s, g) => s + g.lignes.filter((l: any) => !l.dejaInclu).length, 0);
      return {
        suggestions,
        totalProduits,
        montantTotal: suggestions.reduce((sum, g) => sum + g.montantTotal, 0),
      };
    }),

  generateOrdersFromSuggestions: requirePermissionProcedure("achats.commander")
    .input(z.object({
      fournisseurIds: z.array(z.number()).optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId ?? 1;

      const lowStockProducts = await db
        .select({
          produitId: produits.id,
          seuilAlerte: produits.seuilAlerte,
          stockActuel: sql<number>`COALESCE((
            SELECT SUM(s.quantite) FROM stocks s
            WHERE s.produit_id = ${produits.id} AND s.agence_id = ${agenceId}
          ), 0)`,
          prixAchat: produits.prixAchat,
          fournisseurId: produits.fournisseurId,
        })
        .from(produits)
        .where(and(
          eq(produits.isActive, true),
          eq(produits.statutCycleVie, "ACTIF"),
          sql`COALESCE((
            SELECT SUM(s.quantite) FROM stocks s
            WHERE s.produit_id = ${produits.id} AND s.agence_id = ${agenceId}
          ), 0) < ${produits.seuilAlerte}`,
        ));

      const multiSupplierPrices = await db
        .select({
          produitId: produitsFournisseurs.produitId,
          fournisseurId: produitsFournisseurs.fournisseurId,
          prixAchat: produitsFournisseurs.prixAchat,
          estPrincipal: produitsFournisseurs.estPrincipal,
        })
        .from(produitsFournisseurs)
        .where(eq(produitsFournisseurs.isActive, true));

      const priceMap = new Map<number, any>();
      for (const sp of multiSupplierPrices) {
        const pid = sp.produitId!;
        if (!priceMap.has(pid) || sp.estPrincipal) priceMap.set(pid, sp);
      }

      const bySupplier = new Map<number, { lignes: any[]; montantTotal: number }>();
      for (const p of lowStockProducts) {
        const pid = p.produitId!;
        const stockActuel = Number(p.stockActuel ?? 0);
        const seuil = Number(p.seuilAlerte ?? 5);
        const qteSuggeree = Math.max(seuil * 2 - stockActuel, seuil);
        const multiInfo = priceMap.get(pid);
        const fournisseurId = multiInfo?.fournisseurId ?? p.fournisseurId;
        const prixAchat = multiInfo?.prixAchat ? String(multiInfo.prixAchat) : (p.prixAchat ? String(p.prixAchat) : "0");

        if (!fournisseurId) continue;
        if (input?.fournisseurIds && !input.fournisseurIds.includes(fournisseurId)) continue;

        if (!bySupplier.has(fournisseurId)) bySupplier.set(fournisseurId, { lignes: [], montantTotal: 0 });
        const group = bySupplier.get(fournisseurId)!;
        group.lignes.push({ produitId: pid, quantite: qteSuggeree, prixUnitaire: prixAchat });
        group.montantTotal += qteSuggeree * Number(prixAchat);
      }

      const created: { id: string; reference: string; fournisseurId: number; montantTotal: number }[] = [];
      for (const [fournisseurId, group] of bySupplier) {
        const ref = `ACH-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const [achat] = await db.insert(achats).values({
          fournisseurId,
          agenceId,
          reference: ref,
          statut: "brouillon",
          creePar: ctx.user.id,
        } as any).returning() as any;
        for (const ligne of group.lignes) {
          await db.insert(achatsLignes).values({
            achatId: achat.id,
            produitId: ligne.produitId,
            quantite: ligne.quantite,
            prixUnitaire: ligne.prixUnitaire,
            totalLigne: String(ligne.quantite * Number(ligne.prixUnitaire)),
          } as any);
        }
        created.push({ id: String(achat.id), reference: ref, fournisseurId, montantTotal: group.montantTotal });
      }

      return { created, count: created.length, montantTotal: created.reduce((s, c) => s + c.montantTotal, 0) };
    }) as any,

  // Générer un seul bon de commande (brouillon) depuis les suggestions
  // d'UN fournisseur — lignes déjà couvertes skipées.
  generateOrderFromSuggestions: requirePermissionProcedure("achats.commander")
    .input(z.object({
      fournisseurId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId ?? 1;
      const suggestions = await getSuggestionsInternes(agenceId, [input.fournisseurId]);
      const group = suggestions[0];
      const lignesActives = group?.lignes.filter((l: any) => !l.dejaInclu) ?? [];
      let dejaCouvertes = (group?.lignes.length ?? 0) - lignesActives.length;

      if (lignesActives.length === 0) {
        return { created: [], count: 0, montantTotal: 0, dejaCouvertes };
      }

      const ref = `ACH-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const totalMontant = lignesActives.reduce((s, l) => s + l.qteSuggeree * l.prixAchat, 0);
      const [achat] = await db.insert(achats).values({
        fournisseurId: input.fournisseurId,
        agenceId,
        reference: ref,
        statut: "brouillon",
        totalHT: String(totalMontant),
        totalTTC: String(totalMontant),
        creePar: ctx.user.id,
      } as any).returning() as any;

      let montantTotal = 0;
      for (const ligne of lignesActives) {
        const totalLigne = ligne.qteSuggeree * ligne.prixAchat;
        montantTotal += totalLigne;
        await db.insert(achatsLignes).values({
          achatId: achat.id,
          produitId: ligne.produitId,
          quantite: String(ligne.qteSuggeree),
          prixUnitaire: String(ligne.prixAchat),
          totalLigne: String(totalLigne),
        } as any);
      }

      return {
        created: [{ id: String(achat.id), reference: ref, fournisseurId: input.fournisseurId, montantTotal }],
        count: 1,
        montantTotal,
        dejaCouvertes,
      };
    }),

  // ─── Crédit fournisseur ───
  listDettes: protectedProcedure
    .input(z.object({
      statut: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(dettesFournisseurs.agenceId, ctx.user.agenceId)];
      if (input?.statut) conditions.push(eq(dettesFournisseurs.statut, input.statut));

      const rows = await db.select({
        id: dettesFournisseurs.id,
        reference: dettesFournisseurs.reference,
        fournisseurId: dettesFournisseurs.fournisseurId,
        fournisseurNom: fournisseurs.nom,
        achatId: dettesFournisseurs.achatId,
        montantTotal: dettesFournisseurs.montantTotal,
        montantPaye: dettesFournisseurs.montantPaye,
        montantRestant: dettesFournisseurs.montantRestant,
        statut: dettesFournisseurs.statut,
        echeanceLe: dettesFournisseurs.echeanceLe,
        notes: dettesFournisseurs.notes,
        createdAt: dettesFournisseurs.createdAt,
      })
        .from(dettesFournisseurs)
        .innerJoin(fournisseurs, eq(dettesFournisseurs.fournisseurId, fournisseurs.id))
        .where(and(...conditions))
        .orderBy(desc(dettesFournisseurs.createdAt));

      return rows.map(r => ({
        ...r,
        isOverdue: r.echeanceLe && new Date(r.echeanceLe) < new Date() && r.statut !== "paye",
        joursRestants: r.echeanceLe ? Math.ceil((new Date(r.echeanceLe).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null,
      }));
    }),

  createDette: requirePermissionProcedure("achats.commander")
    .input(z.object({
      achatId: z.number(),
      fournisseurId: z.number(),
      montantTotal: z.string(),
      echeanceLe: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const ref = `Dette-${Date.now()}`;
      const [dette] = await db.insert(dettesFournisseurs).values({
        achatId: input.achatId,
        fournisseurId: input.fournisseurId,
        agenceId: ctx.user.agenceId,
        reference: ref,
        montantTotal: input.montantTotal,
        montantPaye: "0",
        montantRestant: input.montantTotal,
        echeanceLe: input.echeanceLe ? new Date(input.echeanceLe) : null,
        notes: input.notes || null,
      } as any).returning() as any;
      return { id: String(dette.id), reference: ref };
    }) as any,

  payerDette: requirePermissionProcedure("achats.commander")
    .input(z.object({
      detteId: z.number(),
      montant: z.string(),
      modePaiement: z.string(),
      caisseId: z.number().optional(),
      reference: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const montant = Number(input.montant);
      if (!Number.isFinite(montant) || montant <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Montant invalide" });
      }
      const agenceId = ctx.user.agenceId;

      return db.transaction(async (tx) => {
        const [dette] = await (tx as any).select().from(dettesFournisseurs)
          .where(eq(dettesFournisseurs.id, input.detteId)).limit(1).for("update");
        if (!dette) throw new TRPCError({ code: "NOT_FOUND", message: "Dette non trouvée" });
        if (Number(dette.agenceId) !== agenceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Dette hors de votre agence" });
        }

        const montantPaye = Number(dette.montantPaye ?? 0) + montant;
        const montantRestant = Number(dette.montantTotal) - montantPaye;
        const statut = montantRestant <= 0 ? "paye" : "partiel";

        const caisseId = input.caisseId ?? (await CaisseService.trouverCaisseOuverte(agenceId, tx as any)).caisseId;

        await (tx as any).update(dettesFournisseurs).set({
          montantPaye: String(montantPaye),
          montantRestant: String(Math.max(0, montantRestant)),
          statut,
        }).where(eq(dettesFournisseurs.id, input.detteId));

        await (tx as any).insert(remboursementsFournisseurs).values({
          detteId: input.detteId,
          montant: String(montant),
          modePaiement: input.modePaiement,
          caisseId,
          reference: input.reference || null,
          notes: input.notes || null,
        });

        await CaisseService.enregistrerFlux({
          caisseId,
          agenceId,
          type: "paiement_fournisseur",
          montant,
          motif: `Paiement dette fournisseur #${input.detteId} (${input.modePaiement})`,
          reference: input.reference || `DETTE-${input.detteId}`,
          entiteType: "DETTE_FOURNISSEUR",
          entiteId: input.detteId,
          effectuePar: Number(ctx.user.id),
        }, tx as any);

        return { success: true, statut, montantRestant: Math.max(0, montantRestant) };
      }) as any;
    }),

  getStatsFournisseur: protectedProcedure
    .input(z.object({ fournisseurId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const fournisseurFilter = input.fournisseurId ? eq(achats.fournisseurId, input.fournisseurId) : undefined;

      const [stats] = await db.select({
        totalAchats: sql<number>`COUNT(*)`,
        montantTotal: sql<number>`COALESCE(SUM(${achats.totalTTC}), 0)`,
      })
        .from(achats)
        .where(and(eq(achats.agenceId, agenceId), fournisseurFilter)) as any;

      const dettes = await db.select({
        montantRestant: dettesFournisseurs.montantRestant,
        statut: dettesFournisseurs.statut,
      })
        .from(dettesFournisseurs)
        .where(and(eq(dettesFournisseurs.agenceId, agenceId), input.fournisseurId ? eq(dettesFournisseurs.fournisseurId, input.fournisseurId) : undefined));

      const detteTotale = dettes.reduce((sum, d) => sum + Number(d.montantRestant ?? 0), 0);
      const dettesEnRetard = dettes.filter(d => d.statut !== "paye").length;

      return {
        totalAchats: Number(stats?.totalAchats ?? 0),
        montantTotal: Number(stats?.montantTotal ?? 0),
        detteTotale,
        dettesEnRetard,
      };
    }),

  // ─── Classement fournisseurs par CA total ───
  supplierRanking: protectedProcedure
    .input(z.object({
      limit: z.number().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const rows = await db.select({
        fournisseurId: achats.fournisseurId,
        fournisseurNom: fournisseurs.nom,
        totalAchats: sql<number>`COUNT(*)`,
        montantTotal: sql<number>`COALESCE(SUM(${achats.totalTTC}), 0)`,
      })
        .from(achats)
        .innerJoin(fournisseurs, eq(achats.fournisseurId, fournisseurs.id))
        .where(eq(achats.agenceId, agenceId))
        .groupBy(achats.fournisseurId, fournisseurs.nom)
        .orderBy(sql`COALESCE(SUM(${achats.totalTTC}), 0) DESC`)
        .limit(input.limit);
      return rows.map(r => ({ ...r, fournisseurId: Number(r.fournisseurId) }));
    }),

  // ─── Stock disponible par fournisseur ───
  stockBySupplier: protectedProcedure
    .input(z.object({
      fournisseurId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const conditions = [eq(produits.isActive, true)];
      if (input.fournisseurId) conditions.push(eq(produits.fournisseurId, input.fournisseurId));

      const rows = await db.select({
        produitId: produits.id,
        titre: produits.titre,
        codeBarre: produits.codeBarre,
        prixVente: produits.prixVente,
        prixAchat: produits.prixAchat,
        fournisseurId: produits.fournisseurId,
        fournisseurNom: fournisseurs.nom,
        stockTotal: sql<number>`COALESCE(SUM(${stocks.quantite}), 0)`,
      })
        .from(produits)
        .leftJoin(fournisseurs, eq(produits.fournisseurId, fournisseurs.id))
        .leftJoin(stocks, and(eq(stocks.produitId, produits.id), eq(stocks.agenceId, agenceId)))
        .where(and(...conditions))
        .groupBy(produits.id, fournisseurs.nom)
        .orderBy(fournisseurs.nom, produits.titre);
      return rows;
    }),

  // ─── Historique événements fournisseur (via auditLogs) ───
  supplierHistory: protectedProcedure
    .input(z.object({
      fournisseurId: z.number(),
      limit: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const rows = await db.select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
      })
        .from(auditLogs)
        .where(eq(auditLogs.entityId, String(input.fournisseurId)))
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.limit);
      return rows.map(r => ({
        ...r,
        details: r.details ? JSON.parse(r.details as string) : null,
      }));
    }),

  // ─── Factures fournisseur ───
  listFactures: protectedProcedure
    .input(z.object({
      fournisseurId: z.number().optional(),
      statut: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const conditions = [eq(facturesFournisseur.agenceId, agenceId)];
      if (input.fournisseurId) conditions.push(eq(facturesFournisseur.fournisseurId, input.fournisseurId));
      if (input.statut) conditions.push(eq(facturesFournisseur.statut, input.statut));

      return db.select()
        .from(facturesFournisseur)
        .where(and(...conditions))
        .orderBy(desc(facturesFournisseur.createdAt));
    }),

  createFacture: requirePermissionProcedure("achats.commander")
    .input(z.object({
      fournisseurId: z.number(),
      achatId: z.number().optional(),
      montantHT: z.string().optional(),
      montantTVA: z.string().optional(),
      montantTTC: z.string(),
      dateFacture: z.string().optional(),
      dateEcheance: z.string().optional(),
      numeroFactureFournisseur: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const agenceId = ctx.user.agenceId;
      const ref = `FAC-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const [facture] = await db.insert(facturesFournisseur).values({
        reference: ref,
        fournisseurId: input.fournisseurId,
        achatId: input.achatId || null,
        agenceId,
        montantHT: input.montantHT || input.montantTTC,
        montantTVA: input.montantTVA || "0",
        montantTTC: input.montantTTC,
        dateFacture: input.dateFacture || null,
        dateEcheance: input.dateEcheance || null,
        numeroFactureFournisseur: input.numeroFactureFournisseur || null,
        notes: input.notes || null,
        creePar: ctx.user.id,
      } as any).returning() as any;
      return { id: String(facture.id), reference: ref };
    }) as any,

  payerFacture: requirePermissionProcedure("achats.commander")
    .input(z.object({
      factureId: z.number(),
      montant: z.string(),
      modePaiement: z.string(),
      caisseId: z.number().optional(),
      reference: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const montant = Number(input.montant);
      if (!Number.isFinite(montant) || montant <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Montant invalide" });
      }
      const agenceId = ctx.user.agenceId;

      return db.transaction(async (tx) => {
        const [facture] = await (tx as any).select().from(facturesFournisseur)
          .where(eq(facturesFournisseur.id, input.factureId)).limit(1).for("update");
        if (!facture) throw new TRPCError({ code: "NOT_FOUND", message: "Facture non trouvée" });
        if (Number(facture.agenceId) !== agenceId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Facture hors de votre agence" });
        }
        if (facture.statut === "paye") throw new TRPCError({ code: "BAD_REQUEST", message: "Facture déjà payée" });

        const montantPaye = Number(facture.montantPaye ?? 0) + montant;
        const montantRestant = Number(facture.montantTTC ?? 0) - montantPaye;
        const statut = montantRestant <= 0 ? "paye" : "partiel";

        const caisseId = input.caisseId ?? (await CaisseService.trouverCaisseOuverte(agenceId, tx as any)).caisseId;

        await (tx as any).update(facturesFournisseur).set({
          montantPaye: String(montantPaye),
          montantRestant: String(Math.max(0, montantRestant)),
          statut,
        }).where(eq(facturesFournisseur.id, input.factureId));

        await CaisseService.enregistrerFlux({
          caisseId,
          agenceId,
          type: "paiement_fournisseur",
          montant,
          motif: `Paiement facture fournisseur #${input.factureId} (${input.modePaiement})`,
          reference: input.reference || `FAC-${input.factureId}`,
          entiteType: "FACTURE_FOURNISSEUR",
          entiteId: input.factureId,
          effectuePar: Number(ctx.user.id),
        }, tx as any);

        return { success: true, statut, montantRestant: Math.max(0, montantRestant) };
      }) as any;
    }),
});

