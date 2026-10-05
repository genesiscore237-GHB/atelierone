/** Inspection pass 2 : colonnes restantes, tables structurées, validations, CF. */
import ExcelJS from "exceljs";

const SRC = process.argv[2];
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);

const fmtV = (v, maxLen = 60) => {
  if (v && typeof v === "object") {
    if (v.formula) return "=" + v.formula + (v.result !== undefined && v.result !== null ? `→${JSON.stringify(v.result).slice(0, 40)}` : "");
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text) return v.text;
    if (v instanceof Date) return "D:" + v.toISOString().slice(0, 10);
    return JSON.stringify(v).slice(0, maxLen);
  }
  const s = String(v ?? "");
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
};
const showRow = (ws, r, c1, c2) =>
  console.log(String(r).padStart(3), "|", Array.from({ length: c2 - c1 + 1 }, (_, i) => fmtV(ws.getCell(r, c1 + i).value, 46)).join(" | "));

const wsP = wb.getWorksheet("02_Pointage");
console.log("=== 02_Pointage EN-TÊTES (l5, A→U) ===");
showRow(wsP, 5, 1, 21);
console.log("--- Formules ligne 6 (A→U) ---");
showRow(wsP, 6, 1, 21);
console.log("--- Lignes 46-70 (fin des données ?) col A,B,H,I,K,M ---");
for (let r = 46; r <= 70; r++) {
  const vals = [1, 2, 8, 9, 11, 13].map((c) => fmtV(wsP.getCell(r, c).value, 22)).join(" | ");
  if (vals.replace(/[|\s]/g, "").length) console.log(String(r).padStart(3), "|", vals);
}
console.log("--- Tables structurées Pointage:", JSON.stringify(wsP.tables || {}, null, 0));
console.log("--- Validations (échantillon):", JSON.stringify((wsP.dataValidations?.dataValidation || []).slice(0, 4)));
console.log("--- CF count:", (wsP.conditionalFormattings || []).length);

const wsE = wb.getWorksheet("01_Employes");
console.log("\n=== 01_Employes EN-TÊTES (l5, N→Q) ===");
for (let c = 14; c <= 17; c++) console.log(`col ${c}:`, JSON.stringify(wsE.getCell(5, c).value));
console.log("--- Formules ligne 6 (D,J,M,N..Q) ---");
[4, 10, 13, 14, 15, 16, 17].forEach((c) => console.log(`col ${c}:`, fmtV(wsE.getCell(6, c).value, 90)));
console.log("--- Tables Employes:", JSON.stringify(wsE.tables || {}));

const wsPaie = wb.getWorksheet("03_Paie");
console.log("\n=== 03_Paie : lignes 21-32 (A→N) ===");
for (let r = 21; r <= 32; r++) showRow(wsPaie, r, 1, 14);
console.log("--- Tables Paie:", JSON.stringify(wsPaie.tables || {}));

const wsPar = wb.getWorksheet("00_Parametres");
console.log("\n=== 00_Parametres : lignes 31-58 (A→G) ===");
for (let r = 31; r <= 58; r++) {
  const line = Array.from({ length: 7 }, (_, i) => fmtV(wsPar.getCell(r, i + 1).value, 40)).join(" | ");
  if (line.replace(/[|\s]/g, "")) console.log(String(r).padStart(3), "|", line);
}
console.log("--- Horaires exactes C7:D13 ---");
for (let r = 7; r <= 13; r++) console.log(r, fmtV(wsPar.getCell(r, 3).value), "→", fmtV(wsPar.getCell(r, 4).value), "pause", fmtV(wsPar.getCell(r, 5).value));

for (const name of ["00_Dashboard", "04_Conges", "05_Contrats", "06_Competences", "07_Planning", "08_Sanctions", "09_Contacts", "10_Mode_Emploi"]) {
  const ws = wb.getWorksheet(name);
  console.log(`\n=== ${name} (aperçu 34 lignes × ${Math.min(ws.columnCount, 8)} cols) ===`);
  for (let r = 1; r <= Math.min(34, ws.rowCount); r++) {
    const line = Array.from({ length: Math.min(ws.columnCount, 8) }, (_, i) => fmtV(ws.getCell(r, i + 1).value, 38)).join(" | ");
    if (line.replace(/[|\s]/g, "")) console.log(String(r).padStart(3), "|", line);
  }
}
