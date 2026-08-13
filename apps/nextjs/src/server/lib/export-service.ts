// @ts-ignore -- papaparse has no bundled type declarations
import Papa from "papaparse";
// @ts-expect-error -- pas de types DTS
import jsPDF from "jspdf";
// @ts-expect-error -- pas de types DTS
import ExcelJS from "exceljs";
import { db } from "@atelierone/db";
import { ventes, ventesLignes, produits, stocks, caisses, sessionsCaisse, utilisateurs, clients } from "@atelierone/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export interface ExportOptions {
  agenceId: string;
  startDate?: string;
  endDate?: string;
  caisseId?: string;
  format: "csv" | "pdf" | "xlsx";
  type: "sales" | "inventory" | "analytics" | "cash";
}

export class ExportService {
  static async exportSales(options: ExportOptions): Promise<Buffer> {
    const { agenceId, startDate, endDate, format } = options;

    const where = [eq(ventes.agenceId, Number(agenceId)) as any];
    if (startDate) where.push(gte(ventes.createdAt, new Date(startDate)));
    if (endDate) where.push(lte(ventes.createdAt, new Date(endDate)));

    const rows = await db
      .select({
        reference: ventes.reference,
        date: ventes.createdAt,
        montant: ventes.montantTotal,
        paiement: ventes.modePaiement,
        statut: ventes.statut,
        operateur: utilisateurs.nom,
        client: clients.nom,
      })
      .from(ventes)
      .leftJoin(utilisateurs, eq(ventes.operateurId, utilisateurs.id))
      .leftJoin(clients, eq(ventes.clientId, clients.id))
      .where(and(...where))
      .orderBy(ventes.createdAt);

    return this.formatData(rows, format, "rapport_ventes");
  }

  static async exportInventory(options: ExportOptions): Promise<Buffer> {
    const { agenceId, format } = options;

    const rows = await db
      .select({
        codeBarre: produits.codeBarre,
        titre: produits.titre,
        editeur: produits.editeur,
        prixVente: produits.prixVente,
        stock: stocks.quantite,
        seuil: produits.seuilAlerte,
      })
      .from(stocks)
      .leftJoin(produits, eq(stocks.produitId, produits.id))
      .where(eq(stocks.agenceId, Number(agenceId)))
      .orderBy(produits.titre);

    return this.formatData(rows, format, "rapport_stock");
  }

  static async exportAnalytics(options: ExportOptions): Promise<Buffer> {
    const { agenceId, startDate, endDate, format } = options;

    const where = [eq(ventes.agenceId, Number(agenceId)) as any];
    if (startDate) where.push(gte(ventes.createdAt, new Date(startDate)));
    if (endDate) where.push(lte(ventes.createdAt, new Date(endDate)));

    const rows = await db
      .select({
        produit: produits.titre,
        quantite: sql<number>`sum(${ventesLignes.quantite})`,
        revenu: sql<string>`sum(${ventesLignes.totalLigne})`,
        cout: sql<string>`sum(${ventesLignes.quantite} * COALESCE(${ventesLignes.coutUnitaire}, ${produits.prixAchat} * ${ventesLignes.facteurConversion}, 0))`,
        marge: sql<string>`sum(${ventesLignes.totalLigne} - ${ventesLignes.quantite} * COALESCE(${ventesLignes.coutUnitaire}, ${produits.prixAchat} * ${ventesLignes.facteurConversion}, 0))`,
      })
      .from(ventesLignes)
      .leftJoin(ventes, eq(ventesLignes.venteId, ventes.id))
      .leftJoin(produits, eq(ventesLignes.produitId, produits.id))
      .where(and(...where))
      .groupBy(produits.id, produits.titre)
      .orderBy(sql`marge desc`);

    return this.formatData(rows, format, "rapport_analytique");
  }

  static async exportCash(options: ExportOptions): Promise<Buffer> {
    const { agenceId, format } = options;

    const rows = await db
      .select({
        caisse: caisses.libelle,
        solde: sessionsCaisse.soldeActuel,
        statut: sessionsCaisse.statut,
        ouvertLe: sessionsCaisse.ouvertLe,
        fermeLe: sessionsCaisse.fermeLe,
        ouvertPar: utilisateurs.nom,
      })
      .from(caisses)
      .leftJoin(sessionsCaisse, eq(sessionsCaisse.caisseId, caisses.id))
      .leftJoin(utilisateurs, eq(sessionsCaisse.ouvertPar, utilisateurs.id))
      .where(eq(caisses.agenceId, Number(agenceId)))
      .orderBy(caisses.createdAt);

    return this.formatData(rows, format, "rapport_caisse");
  }

  private static async formatData(data: Record<string, unknown>[], format: string, name: string): Promise<Buffer> {
    switch (format) {
      case "csv": return this.toCSV(data);
      case "pdf": return this.toPDF(data, name);
      case "xlsx": return await this.toXLSX(data, name);
      default: throw new Error("Format non supporté");
    }
  }

  private static toCSV(data: Record<string, unknown>[]): Buffer {
    return Buffer.from(Papa.unparse(data), "utf-8");
  }

  private static toPDF(data: Record<string, unknown>[], title: string): Buffer {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(title.replace(/_/g, " ").toUpperCase(), 20, 20);
    doc.setFontSize(10);

    let y = 40;
    const first = data[0];
    if (first) {
      const headers = Object.keys(first);
      headers.forEach((h, i) => doc.text(h, 20 + (i % 5) * 40, y));
      y += 10;
      data.forEach((row) => {
        if (y > 270) { doc.addPage(); y = 20; }
        headers.forEach((h, i) => doc.text(String(row[h] ?? "").slice(0, 15), 20 + (i % 5) * 40, y));
        y += 10;
      });
    }
    return Buffer.from(doc.output("arraybuffer"));
  }

  private static async toXLSX(data: Record<string, unknown>[], _name: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Report");
    const first = data[0];
    if (first) {
      ws.addRow(Object.keys(first));
      data.forEach((r) => ws.addRow(Object.values(r)));
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf as ArrayBuffer);
  }

  static async generateExport(options: ExportOptions): Promise<Buffer> {
    switch (options.type) {
      case "sales": return this.exportSales(options);
      case "inventory": return this.exportInventory(options);
      case "analytics": return this.exportAnalytics(options);
      case "cash": return this.exportCash(options);
      default: throw new Error("Type d'export non supporté");
    }
  }
}
