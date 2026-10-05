/** Inspection pass 3 : tables structurées, couleurs, validations, CF, images du fichier ORIGINAL. */
import ExcelJS from "exceljs";
const SRC = process.argv[2];
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);

for (const ws of wb.worksheets) {
  console.log(`\n=== ${ws.name} ===`);
  const tbl = Object.values(ws.tables || {});
  if (tbl.length) tbl.forEach((t) => console.log("  TABLE:", t.name, t.tableRef ?? t.range ?? JSON.stringify(t.displayNames ?? {})));
  // couleurs de remplissage les plus fréquentes
  const fills = {};
  for (let r = 1; r <= Math.min(ws.rowCount || 1, 200); r++) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: false }, (c) => {
      const f = c.fill;
      if (f && f.fgColor && f.pattern === "solid") {
        const k = f.fgColor.argb || JSON.stringify(f.fgColor);
        fills[k] = (fills[k] || 0) + 1;
      }
    });
  }
  const top = Object.entries(fills).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log("  FILLS top:", top.map(([k, v]) => `${k.replace("FF", "")}×${v}`).join(" · "));
  const dv = (ws.dataValidations?.dataValidation || []).length;
  const cf = (ws.conditionalFormattings || []).length;
  console.log("  validations:", dv, "| CF:", cf, "| autofilter:", JSON.stringify(ws.autoFilter ?? null));
}
console.log("\nMédias (images):", wb.model?.media?.length ?? 0);
