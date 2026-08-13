import { db } from "~/server/db";
import { comptes, ecrituresJournal, lignesEcritureJournal } from "@atelierone/db";
import { eq, and, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

interface EntryLine {
  compteCode: string;
  montant: number;
  sens: "debit" | "credit";
  libelle?: string;
}

export class ComptaService {
  private static async nextEcritureId(tx: Tx): Promise<number> {
    const [r] = await tx.select({ id: sql<number>`COALESCE(MAX(id), 0) + 1` }).from(ecrituresJournal);
    return r.id;
  }

  private static async nextLigneEcritureId(tx: Tx): Promise<number> {
    const [r] = await tx.select({ id: sql<number>`COALESCE(MAX(id), 0) + 1` }).from(lignesEcritureJournal);
    return r.id;
  }

  static async genererEcritureVente(params: {
    tx: Tx;
    agenceId: number;
    reference: string;
    montantTotal: number;
    operateurId: number;
  }) {
    const compteClient = await this.getCompte(params.tx, params.agenceId, "411000");
    const compteVente = await this.getCompte(params.tx, params.agenceId, "701000");

    const nextId = await this.nextEcritureId(params.tx);
    const [ecriture] = await params.tx.insert(ecrituresJournal).values({
      id: nextId,
      agenceId: params.agenceId,
      reference: `EC-${params.reference}`,
      libelle: `Vente ${params.reference}`,
      documentType: "VENTE",
      documentId: null,
    }).returning();

    const nextLigne = await this.nextLigneEcritureId(params.tx);
    await params.tx.insert(lignesEcritureJournal).values([
      {
        id: nextLigne,
        ecritureId: ecriture.id,
        compteId: compteClient.id,
        montant: String(params.montantTotal),
        sens: "debit",
        libelle: `Vente ${params.reference}`,
      },
      {
        id: nextLigne + 1,
        ecritureId: ecriture.id,
        compteId: compteVente.id,
        montant: String(params.montantTotal),
        sens: "credit",
        libelle: `Vente ${params.reference}`,
      },
    ]);
  }

  static async genererEcritureReception(params: {
    tx: Tx;
    agenceId: number;
    reference: string;
    montantTotal: number;
    operateurId: number;
  }) {
    const compteStock = await this.getCompte(params.tx, params.agenceId, "311000");
    const compteFournisseur = await this.getCompte(params.tx, params.agenceId, "401000");

    const nextId = await this.nextEcritureId(params.tx);
    const [ecriture] = await params.tx.insert(ecrituresJournal).values({
      id: nextId,
      agenceId: params.agenceId,
      reference: `EC-${params.reference}`,
      libelle: `Réception ${params.reference}`,
      documentType: "RECEPTION",
      documentId: null,
    }).returning();

    const nextLigne = await this.nextLigneEcritureId(params.tx);
    await params.tx.insert(lignesEcritureJournal).values([
      {
        id: nextLigne,
        ecritureId: ecriture.id,
        compteId: compteStock.id,
        montant: String(params.montantTotal),
        sens: "debit",
        libelle: `Réception ${params.reference}`,
      },
      {
        id: nextLigne + 1,
        ecritureId: ecriture.id,
        compteId: compteFournisseur.id,
        montant: String(params.montantTotal),
        sens: "credit",
        libelle: `Réception ${params.reference}`,
      },
    ]);
  }

  static async genererEcritureRetour(params: {
    tx: Tx;
    agenceId: number;
    reference: string;
    montantTotal: number;
    typeRetour: string;
    operateurId: number;
  }) {
    const compteStock = await this.getCompte(params.tx, params.agenceId, "311000");
    const compteClient = await this.getCompte(params.tx, params.agenceId, "411000");

    const nextId = await this.nextEcritureId(params.tx);
    const [ecriture] = await params.tx.insert(ecrituresJournal).values({
      id: nextId,
      agenceId: params.agenceId,
      reference: `EC-${params.reference}`,
      libelle: `Retour ${params.reference}`,
      documentType: "RETOUR",
      documentId: null,
    }).returning();

    const nextLigne = await this.nextLigneEcritureId(params.tx);
    await params.tx.insert(lignesEcritureJournal).values([
      {
        id: nextLigne,
        ecritureId: ecriture.id,
        compteId: compteClient.id,
        montant: String(params.montantTotal),
        sens: params.typeRetour === "REMBOURSEMENT" ? "debit" : "credit",
        libelle: `Retour ${params.reference}`,
      },
      {
        id: nextLigne + 1,
        ecritureId: ecriture.id,
        compteId: compteStock.id,
        montant: String(params.montantTotal),
        sens: params.typeRetour === "REMBOURSEMENT" ? "credit" : "debit",
        libelle: `Retour ${params.reference}`,
      },
    ]);
  }

  private static async getCompte(tx: Tx, agenceId: number, code: string) {
    const [c] = await tx.select().from(comptes).where(
      and(eq(comptes.agenceId, agenceId), eq(comptes.code, code))
    ).limit(1);
    if (c) return c;
    const [maxId] = await tx.select({ maxId: sql<number>`COALESCE(MAX(id), 0) + 1` }).from(comptes);
    const [nouveau] = await tx.insert(comptes).values({
      id: maxId.maxId,
      agenceId,
      code,
      nom: this.nomCompteParDefaut(code),
      typeCompte: this.typeCompteParDefaut(code),
    }).returning();
    return nouveau;
  }

  private static nomCompteParDefaut(code: string): string {
    const noms: Record<string, string> = {
      "411000": "Clients",
      "701000": "Ventes de marchandises",
      "311000": "Stocks de marchandises",
      "401000": "Fournisseurs",
      "511000": "Caisse",
      "581000": "Banque",
    };
    return noms[code] ?? `Compte ${code}`;
  }

  private static typeCompteParDefaut(code: string): string {
    if (code.startsWith("4")) return "TIERS";
    if (code.startsWith("7")) return "PRODUIT";
    if (code.startsWith("3")) return "STOCK";
    if (code.startsWith("5")) return "TRESORERIE";
    return "AUTRE";
  }
}
