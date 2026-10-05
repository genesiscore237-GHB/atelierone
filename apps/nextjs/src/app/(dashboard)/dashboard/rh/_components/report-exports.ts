"use client";

import { toast } from "sonner";

/**
 * R9 — Utilitaires d'export des rapports RH.
 * Une seule source (headers + rows affichés à l'écran) est utilisée pour
 * CSV (« Excel » applicatif), Excel .xlsx (exceljs) et PDF (jsPDF, non compressé
 * pour permettre une vérification réelle du contenu). Aucun recalcul métier ici.
 */

export type ReportCell = string | number | null;
export interface ReportTable {
  headers: string[];
  rows: ReportCell[][];
}

/** YYYY-MM-DD → JJ/MM/AAAA */
export function fmtDateFR(s: string | null | undefined): string {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

export function fmtMontant(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("fr-FR").format(n);
}

/** minutes → HH:MM */
export function fmtHeures(min: number | null | undefined): string {
  if (min === null || min === undefined) return "0:00";
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  return `${min < 0 ? "-" : ""}${h}:${String(m).padStart(2, "0")}`;
}

/** AAAA-MM (sur la borne from) utilisée pour le nommage déterministe des fichiers. */
export function slugPeriode(from: string | undefined, to: string | undefined): string {
  if (from && to && from.slice(0, 7) === to.slice(0, 7)) return from.slice(0, 7);
  if (from && to) return `${from.slice(0, 7)}_${to.slice(0, 7)}`;
  return new Date().toISOString().slice(0, 7);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`${filename} téléchargé`);
}

/** CSV RFC 4180 — séparateur `;` (Excel FR), CRLF, BOM UTF-8. Les nombres restent numériques. */
export function buildCsv(headers: string[], rows: ReportCell[][]): string {
  const esc = (v: ReportCell) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))].join("\r\n");
}

export function exportCsv(filename: string, table: ReportTable) {
  const csv = buildCsv(table.headers, table.rows);
  if (!csv) return;
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, filename);
}

/** Excel réel (.xlsx) via exceljs — en-têtes typés, largeurs, cellules numériques conservées. */
export async function exportXlsx(filename: string, table: ReportTable) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Rapport");
  ws.columns = table.headers.map((h) => ({ header: h, key: h, width: 16 }));
  for (const r of table.rows) {
    ws.addRow(r.map((v) => (v === null ? "" : v)));
  }
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename
  );
}

export interface PdfMeta {
  title: string;
  periodLine: string;
  generatedLine: string;
  footerLine: string;
}

/**
 * PDF via jsPDF (non compressé → contenu texte vérifiable).
 * En-tête de colonnes répété sur chaque page, pagination automatique, marges A4.
 */
export async function exportPdf(filename: string, meta: PdfMeta, table: ReportTable) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: false });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const avail = pageW - margin * 2;

  let y = margin;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(meta.title, margin, y);
  y += 16;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(meta.periodLine, margin, y);
  y += 13;
  doc.text(meta.generatedLine, margin, y);
  y += 22;

  const widths = table.headers.map((h, i) => {
    const maxLen = Math.max(h.length, ...table.rows.map((r) => String(r[i] ?? "").length));
    return Math.max(42, Math.min(140, Math.round((Math.min(maxLen, 24) / 100) * avail)));
  });
  const wSum = widths.reduce((a, b) => a + b, 0);
  const factor = (avail - (table.headers.length - 1) * 5) / wSum;
  const w = widths.map((x) => x * factor);
  const rowH = 18;

  const drawHeader = (top: number) => {
    doc.setFillColor(226, 232, 240);
    doc.rect(margin, top, avail, rowH, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    let x = margin;
    table.headers.forEach((h, i) => {
      doc.text(h, x + 4, top + 12);
      x += w[i] + 5;
    });
  };

  const newPage = () => {
    doc.addPage();
    y = margin + 10;
    drawHeader(y);
    y += rowH;
  };
  drawHeader(y);
  y += rowH;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  for (const r of table.rows) {
    if (y > pageH - margin) newPage();
    let x = margin;
    r.forEach((cell, i) => {
      const text = String(cell ?? "");
      if (typeof cell === "number") {
        doc.text(text, x + w[i] - 4, y + 12, { align: "right" });
      } else {
        doc.text(text.length > 32 ? text.slice(0, 32) : text, x + 4, y + 12);
      }
      x += w[i] + 5;
    });
    y += rowH;
  }

  doc.setFontSize(7);
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.text(meta.footerLine, margin, pageH - 18);
    doc.text(`Page ${p}/${pageCount}`, pageW - margin, pageH - 18, { align: "right" });
  }

  // jsPDF.save() utilise un mécanisme iframe que les navigateurs peuvent bloquer
  // (CSP) et que Playwright n'intercepte pas : on repasse par le même chemin de
  // téléchargement (ancre + blob) que CSV/Excel, garanti déterministe.
  const blob = doc.output("blob");
  downloadBlob(blob, filename);
}

/** Builds a full report header block (période + édition) used at screen AND in PDF. */
export function reportMeta(title: string, from?: string, to?: string): PdfMeta {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return {
    title,
    periodLine: `Période : ${fmtDateFR(from)} – ${fmtDateFR(to)}`,
    generatedLine: `Édité le : ${fmtDateFR(today)}`,
    footerLine: "GPJ — Rapport RH (AtelierOne)",
  };
}