/** Vérif V5 : tables préservées ? protections ? corrections appliquées ? types des heures source. */
import ExcelJS from "exceljs";

const outPath = process.argv[2];
const srcPath = process.argv[3];

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(outPath);

console.log("-- Tables conservées --");
for (const ws of wb.worksheets) {
  const t = Object.values(ws.tables || {});
  if (t.length) console.log(" ", ws.name, "→", t.map((x) => x.name).join(","));
}
const pt = wb.getWorksheet("02_Pointage");
console.log("\n-- Corrections en place (l6-8 & l35/l46) --");
for (const r of [6, 7, 35, 46]) {
  const cells = [1, 2, 8, 9].map((c) => {
    const cell = pt.getCell(r, c);
    const v = cell.value;
    if (v == null) return "∅";
    if (v instanceof Date) {
      const hh = String(v.getUTCHours()).padStart(2, "0"), mm = String(v.getUTCMinutes()).padStart(2, "0");
      return v.getUTCFullYear() < 1900 ? `T${hh}:${mm}` : v.toISOString().slice(0, 10);
    }
    return JSON.stringify(v).slice(0, 24);
  });
  console.log(String(r).padStart(3), "|", cells.join(" | "));
}
console.log("\n-- Types dans le FICHIER SOURCE (H6:I8) --");
const src = new ExcelJS.Workbook();
await src.xlsx.readFile(srcPath);
const sp = src.getWorksheet("02_Pointage");
for (let r = 6; r <= 8; r++) for (const c of [8, 9]) {
  const cell = sp.getCell(r, c);
  const v = cell.value;
  console.log(`src ${cell.address}:`, typeof v, v && v.constructor?.name, v instanceof Date ? v.toISOString() : JSON.stringify(v));
}
