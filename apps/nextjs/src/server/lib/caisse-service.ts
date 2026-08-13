import { db } from "~/server/db";
import { caisses, mouvementsCaisse, sessionsCaisse, caisseOperateurs, depenses } from "@atelierone/db";
import { eq, and, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { PertesService } from "~/server/lib/pertes-service";

export type TypeMouvement =
  | "vente"
  | "depense"
  | "entree"
  | "sortie"
  | "apport"
  | "retrait"
  | "correction"
  | "remboursement"
  | "annulation"
  | "paiement_fournisseur"
  | "encaissement_dette";

const TYPES_CREDIT = new Set<TypeMouvement>(["vente", "entree", "apport", "encaissement_dette"]);

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

export class CaisseService {
  static async verifierAcces(caisseId: number, userId: number): Promise<void> {
    const [op] = await db.select({ id: caisseOperateurs.id }).from(caisseOperateurs)
      .where(and(eq(caisseOperateurs.caisseId, caisseId), eq(caisseOperateurs.userId, userId)))
      .limit(1);
    if (!op) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Accès non autorisé à cette caisse" });
    }
  }

  static async verifierPermission(caisseId: number, userId: number, permission: "peutOuvrir" | "peutFermer" | "peutDepenser"): Promise<void> {
    await CaisseService.verifierAcces(caisseId, userId);
    const [op] = await db.select({ flag: caisseOperateurs[permission] }).from(caisseOperateurs)
      .where(and(eq(caisseOperateurs.caisseId, caisseId), eq(caisseOperateurs.userId, userId)))
      .limit(1);
    if (!op || !op.flag) {
      const messages: Record<string, string> = {
        peutOuvrir: "Vous n'avez pas le droit d'ouvrir cette caisse",
        peutFermer: "Vous n'avez pas le droit de fermer cette caisse",
        peutDepenser: "Vous n'avez pas le droit d'effectuer des dépenses sur cette caisse",
      };
      throw new TRPCError({ code: "FORBIDDEN", message: messages[permission] });
    }
  }

  static async getSessionOuverte(caisseId: number, tx?: Tx): Promise<{ id: number; soldeActuel: string }> {
    const client = (tx ?? db) as any;
    const select = client.select({
      id: sessionsCaisse.id,
      soldeActuel: sessionsCaisse.soldeActuel,
    }).from(sessionsCaisse)
      .where(and(eq(sessionsCaisse.caisseId, caisseId), eq(sessionsCaisse.statut, "ouverte")))
      .limit(1);
    const [session] = tx
      ? await select.for("update")
      : await select;
    if (!session) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune session ouverte pour cette caisse" });
    }
    return session;
  }

  static async trouverCaisseOuverte(agenceId: number, tx?: Tx): Promise<{ caisseId: number; sessionId: number; soldeActuel: string }> {
    const client = (tx ?? db) as any;
    const [row] = await client
      .select({
        caisseId: sessionsCaisse.caisseId,
        sessionId: sessionsCaisse.id,
        soldeActuel: sessionsCaisse.soldeActuel,
      })
      .from(sessionsCaisse)
      .innerJoin(caisses, eq(sessionsCaisse.caisseId, caisses.id))
      .where(and(eq(sessionsCaisse.statut, "ouverte"), eq(caisses.agenceId, agenceId)))
      .limit(1);
    if (!row) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Aucune caisse ouverte pour cette agence" });
    }
    return row;
  }

  static async enregistrerMouvement(params: {
    caisseId: number;
    sessionId: number;
    type: TypeMouvement;
    montant: number;
    motif?: string;
    reference?: string;
    entiteType?: string;
    entiteId?: number;
    categorieDepense?: string;
    effectuePar: number;
  }, tx?: Tx) {
    const client = (tx ?? db) as any;
    const [mvt] = await client.insert(mouvementsCaisse).values({
      caisseId: params.caisseId,
      type: params.type,
      montant: String(params.montant),
      motif: params.motif || null,
      reference: params.reference || null,
      entiteType: params.entiteType || null,
      entiteId: params.entiteId ?? null,
      categorieDepense: params.categorieDepense || null,
      effectuePar: params.effectuePar,
    }).returning();
    return mvt;
  }

  static async mettreAJourSolde(sessionId: number, montant: number, sens: "credit" | "debit", tx?: Tx) {
    const client = (tx ?? db) as any;
    const signedMontant = sens === "credit" ? montant : -montant;
    await client.execute(sql`UPDATE sessions_caisse SET solde_actuel = solde_actuel + ${signedMontant} WHERE id = ${sessionId}`);
  }

  static async verifierSoldeSuffisant(sessionId: number, montant: number, tx?: Tx): Promise<void> {
    const client = (tx ?? db) as any;
    const [session] = await client
      .select({ soldeActuel: sessionsCaisse.soldeActuel })
      .from(sessionsCaisse)
      .where(eq(sessionsCaisse.id, sessionId))
      .limit(1);
    const solde = Number(session?.soldeActuel ?? 0);
    if (solde < montant) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Solde insuffisant en caisse (${solde.toLocaleString("fr-FR")} FCFA disponibles pour ${montant.toLocaleString("fr-FR")} FCFA demandés)`,
      });
    }
  }

  static async enregistrerFlux(params: {
    caisseId: number;
    agenceId: number;
    type: TypeMouvement;
    montant: number;
    motif?: string;
    reference?: string;
    entiteType?: string;
    entiteId?: number;
    categorieDepense?: string;
    effectuePar: number;
  }, tx?: Tx) {
    const executer = async (client: Tx) => {
      const session = await CaisseService.getSessionOuverte(params.caisseId, client);
      const estDebit = !TYPES_CREDIT.has(params.type);
      if (estDebit) {
        await CaisseService.verifierSoldeSuffisant(session.id, params.montant, client);
      }
      const mvt = await CaisseService.enregistrerMouvement({
        ...params,
        sessionId: session.id,
      }, client);
      await CaisseService.mettreAJourSolde(session.id, params.montant, estDebit ? "debit" : "credit", client);
      return mvt;
    };
    if (tx) return executer(tx);
    return db.transaction(executer) as any;
  }

  static async enregistrerMouvementComplet(params: {
    caisseId: number;
    agenceId: number;
    type: TypeMouvement;
    montant: number;
    motif?: string;
    reference?: string;
    effectuePar: number;
  }) {
    return CaisseService.enregistrerFlux(params);
  }

  static async fermerSession(params: {
    caisseId: number;
    userId: number;
    soldeReel: number;
  }) {
    return db.transaction(async (tx) => {
      const session = await CaisseService.getSessionOuverte(params.caisseId, tx);
      const soldeActuel = Number(session.soldeActuel ?? 0);
      const ecart = params.soldeReel - soldeActuel;
      await (tx as any).update(sessionsCaisse).set({
        statut: "fermee",
        fermePar: params.userId,
        fermeLe: new Date(),
        soldeCompteFermeture: String(params.soldeReel),
        soldeAttenduFermeture: String(soldeActuel),
        ecart: String(ecart),
      }).where(eq(sessionsCaisse.id, session.id));

      if (ecart > 0) {
        const [caisse] = await (tx as any).select({ agenceId: caisses.agenceId }).from(caisses)
          .where(eq(caisses.id, params.caisseId)).limit(1);
        if (caisse) {
          await PertesService.enregistrerPerte({
            agenceId: Number(caisse.agenceId),
            montantPerte: ecart,
            typePerte: "ECART_CAISSE",
            motif: `Écart de fermeture de caisse (session #${session.id})`,
            reference: `SESSION-${session.id}`,
            referenceType: "SESSION_CAISSE",
            effectuePar: params.userId,
          }, tx as any);
        }
      }

      return { sessionId: session.id, ecart, soldeAttendu: soldeActuel, soldeReel: params.soldeReel };
    }) as any;
  }

  static async enregistrerDepenseAvecCaisse(params: {
    caisseId: number;
    agenceId: number;
    categorie: string;
    montant: number;
    description?: string;
    effectuePar: number;
  }) {
    return db.transaction(async (tx) => {
      const session = await CaisseService.getSessionOuverte(params.caisseId, tx);

      const [dep] = await (tx as any).insert(depenses).values({
        agenceId: params.agenceId,
        categorie: params.categorie,
        montant: String(params.montant),
        description: params.description || null,
        caisseId: params.caisseId,
        sessionCaisseId: session.id,
        enregistrePar: params.effectuePar,
      }).returning();

      await CaisseService.enregistrerMouvement({
        caisseId: params.caisseId,
        sessionId: session.id,
        type: "depense",
        montant: params.montant,
        motif: params.description || params.categorie,
        categorieDepense: params.categorie,
        effectuePar: params.effectuePar,
      }, tx);

      await CaisseService.mettreAJourSolde(session.id, params.montant, "debit", tx);

      return dep;
    }) as any;
  }
}
