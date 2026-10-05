/** Vérification du classeur V4 : protections, corrections de données, formules clés. */
import ExcelJS from "exceljs";
const F = process.argv[2];
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(F);

console.log("Ordre onglets :", wb.worksheets.map((w) => w.name).join(" | "));
console.log("\n-- Protections --");
for (const ws of wb.worksheets) console.log(ws.name.padEnd(15), "protected:", !!ws.sheetProtection?.sheet ? "OUI" : "non");

const pt = wb.getWorksheet("02_Pointage");
const fmtCell = (c) => {
  const v = c.value;
  if (v instanceof Date) {
    const h = v.getUTCHours(), m = v.getUTCMinutes();
    return (h || m) && v.getUTCFullYear() < 1900
      ? `T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      : v.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && c.numFmt === "hh:mm") {
    const mins = Math.round(v * 1440);
    return `T${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  return String(v ?? "");
};
console.log("\n-- Pointage l6-12 (A,B,D,H,I,S) après correction --");
for (let r = 6; r <= 12; r++) {
  const row = [1, 2, 4, 8, 9, 19].map((c) => fmtCell(pt.getCell(r, c))).join(" | ");
  console.log(r, "|", row);
}
const dates = new Set(), ids = new Set();
for (let r = 6; r <= 60; r++) {
  const a = pt.getCell(r, 1).value;
  if (a instanceof Date) dates.add(a.toISOString().slice(0, 10));
  else if (typeof a === "string" && a.includes("/")) dates.add("⚠ TEXTE:" + a);
  const b = pt.getCell(r, 2).value;
  if (typeof b === "string" && b) { ids.add(b); if (b !== b.toUpperCase()) console.log("⚠ ID minuscule restant:", b); }
}
console.log("Dates distinctes pointées :", [...dates].join(", "));
console.log("IDs distincts :", [...ids].sort().join(","));

const emp = wb.getWorksheet("01_Employes");
console.log("\n-- Employes l6 & l19 (ID,Nom,Prenom,M-formule,L-salaire) --");
for (const r of [6, 19]) {
  console.log(r, emp.getCell(r, 1).value, "|", emp.getCell(r, 2).value, "|", emp.getCell(r, 3).value,
    "| M=", JSON.stringify(emp.getCell(r, 13).value).slice(0, 80),
    "| L=", emp.getCell(r, 12).value);
}
const paie = wb.getWorksheet("03_Paie");
console.log("\n-- Paie B5/D5 période & G12 formule --");
console.log("B5:", paie.getCell("B5").value?.toISOString?.().slice(0, 10), "D5:", paie.getCell("D5").value?.toISOString?.().slice(0, 10));
console.log("G12:", JSON.stringify(paie.getCell(12, 7).value).slice(0, 160));
console.log("Totaux L37:", JSON.stringify(paie.getCell("L37").value));

// Cellules déverrouillées (jaunes) échantillon
const un = [];
pt.eachRow({ includeEmpty: false }, (row, rn) => {
  if (rn > 5 && rn <= 8) row.eachCell((c) => { if (c.style?.protection?.locked === false) un.push(c.address); });
});
console.log("\nJaunes déverrouillées l6-8 Pointage (échantillon):", un.slice(0, 12).join(","), "… total:", un.length);
