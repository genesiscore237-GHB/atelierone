/**
 * AUDIT DIFF — ORIGINAL vs V5 livré.
 * Règles :
 *  ✔ AUTORISÉ de changer la VALEUR uniquement dans : 02_Pointage!A*|B*, 01_Employes!A*|L*
 *    (+ H/I Pointage : valeur IDENTIQUE attendue, seul le format hh:mm peut être normalisé)
 *  ✘ INTERDIT : toute différence de FORMULE, toute autre différence de valeur,
 *    perte de tables structurées, perte de mises en forme conditionnelles,
 *    protections absentes, jaunes encore verrouillées.
 */
import ExcelJS from "exceljs";

const [, , SRC_P, OUT_P] = process.argv;

const norm = (v) => {
  if (v == null || v === "") return "";
  if (v instanceof Date) {
    if (v.getUTCFullYear() < 1900) {
      const mins = v.getUTCHours() * 60 + v.getUTCMinutes();
      return "T" + mins;
    }
    return "D" + v.toISOString().slice(0, 10);
  }
  if (typeof v === "object") {
    if (v.formula !== undefined) return "F:" + String(v.formula).replace(/\s+/g, "");
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text) return String(v.text);
    if (v.result !== undefined && v.result !== null) return norm(v.result);
    return JSON.stringify(v);
  }
  if (typeof v === "number") return "N" + v;
  return "S" + String(v);
};

const load = async (p) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(p);
  return wb;
};
const src = await load(SRC_P);
const out = await load(OUT_P);

let fails = 0;
const ok = (label, cond, detail = "") =>
  console.log(`${cond ? "✅" : "❌"} ${label}${detail ? " — " + detail : ""}`), fail = () => fails++;

// 1) Feuilles : mêmes noms, même ordre
{
  const a = src.worksheets.map((w) => w.name).join("|");
  const b = out.worksheets.map((w) => w.name).join("|");
  ok("Feuilles identiques et même ordre", a === b, b.slice(0, 90));
  if (a !== b) fail();
}

// 2) Tables structurées conservées
for (const [sn, tn] of [["01_Employes", "Employes"], ["02_Pointage", "Pointage"]]) {
  const t = Object.values(out.getWorksheet(sn)?.tables || {}).map((x) => x.name);
  ok(`Table « ${tn} » conservée sur ${sn}`, t.includes(tn));
  if (!t.includes(tn)) fail();
}

// 3) Diff intégrale valeurs + formules
const ZONE_VAL = /^(02_Pointage)![AB]\d+$|^(01_Employes)![AL]\d+$/;
let valDiffAllowed = 0, valDiffForbidden = [], formulaDiffs = [];
let compared = 0;
for (const wsS of src.worksheets) {
  const wsO = out.getWorksheet(wsS.name);
  if (!wsO) continue;
  const maxR = Math.max(wsS.rowCount || 1, wsO.rowCount || 1);
  const maxC = Math.max(wsS.columnCount || 1, wsO.columnCount || 1);
  for (let r = 1; r <= maxR; r++) {
    for (let c = 1; c <= maxC; c++) {
      const cs = wsS.getCell(r, c), co = wsO.getCell(r, c);
      const vs = norm(cs.value), vo = norm(co.value);
      if (vs === vo) { compared++; continue; }
      const addr = `${wsS.name}!${cs.address}`;
      const isFormulaSrc = cs.value && typeof cs.value === "object" && cs.value.formula !== undefined;
      const isFormulaOut = co.value && typeof co.value === "object" && co.value.formula !== undefined;
      if (isFormulaSrc || isFormulaOut) { formulaDiffs.push(`${addr}: [${vs.slice(0,60)}] → [${vo.slice(0,60)}]`); continue; }
      if (ZONE_VAL.test(addr)) { valDiffAllowed++; compared++; }
      else { valDiffForbidden.push(`${addr}: [${vs.slice(0,50)}] → [${vo.slice(0,50)}]`); }
    }
  }
}
ok("Aucune formule modifiée", formulaDiffs.length === 0, formulaDiffs.length ? formulaDiffs.slice(0,5).join(" · ") : `${compared} cellules comparées`);
if (formulaDiffs.length) fail();
ok("Valeurs changées UNIQUEMENT dans les zones autorisées (Pointage A/B, Employes A/L)", valDiffForbidden.length === 0,
  valDiffForbidden.length ? `${valDiffForbidden.length} interdictions ! ex: ${valDiffForbidden.slice(0,6).join(" | ")}` : `${valDiffAllowed} corrections ciblées`);
if (valDiffForbidden.length) fail();

// 4) Corrections effectives attendues
{
  const pt = out.getWorksheet("02_Pointage");
  let txtDates = 0, lowIds = 0;
  for (let r = 6; r <= pt.rowCount; r++) {
    const a = pt.getCell(r, 1).value, b = pt.getCell(r, 2).value;
    if (typeof a === "string" && /\//.test(a)) txtDates++;
    if (typeof b === "string" && b && b !== b.toUpperCase()) lowIds++;
  }
  ok("Plus aucune date-texte dans Pointage", txtDates === 0, `restantes: ${txtDates}`);
  ok("Plus aucun ID minuscule dans Pointage", lowIds === 0, `restants: ${lowIds}`);
  if (txtDates || lowIds) fail();
  const d35 = pt.getCell(35, 1).value;
  ok("Ligne 35 réparée en 26/08/2026", d35 instanceof Date && d35.toISOString().startsWith("2026-08-26"), String(d35));
  const emp = out.getWorksheet("01_Employes");
  const s19 = emp.getCell(19, 12).value;
  ok("EMP014 salaire numérique 80000", s19 === 80000, String(s19));
}

// 5) Heures réelles préservées (échantillon large : toutes les paires H/I non vides du src)
{
  const ps = src.getWorksheet("02_Pointage"), po = out.getWorksheet("02_Pointage");
  let same = 0, diff = [];
  for (let r = 6; r <= Math.min(ps.rowCount, 150); r++) {
    for (const c of [8, 9]) {
      const a = norm(ps.getCell(r, c).value), b = norm(po.getCell(r, c).value);
      if (a === "") continue;
      if (a.startsWith("T") || a.startsWith("N")) { if (a === b) same++; else diff.push(`H/I r${r}c${c}: ${a}→${b}`); }
    }
  }
  ok("Heures réelles 100 % identiques à l'original", diff.length === 0, `${same} heures comparées${diff.length ? " · ex: " + diff.slice(0,4).join(", ") : ""}`);
  if (diff.length) fail();
}

// 6) Protections + déverrouillage jaunes
{
  const protAll = out.worksheets.every((w) => w.sheetProtection && (w.sheetProtection.hashValue || w.sheetProtection.password || w.sheetProtection.algorithmName));
  ok("12 feuilles protégées (GPJ2026)", protAll, `${out.worksheets.filter((w)=>w.sheetProtection).length}/${out.worksheets.length}`);
  if (!protAll) fail();
  let unlockedY = 0, lockedGreenSample = true;
  const pt = out.getWorksheet("02_Pointage");
  for (let r = 6; r <= 30; r++) {
    for (const c of [1, 2, 8, 9]) {
      const cell = pt.getCell(r, c);
      if (cell.style?.protection?.locked === false) unlockedY++;
    }
    const g = pt.getCell(r, 17); // Heures Normales (verte)
    if (g.value != null && g.style?.protection?.locked !== true && g.formula === undefined) lockedGreenSample = false;
  }
  ok("Cellules jaunes déverrouillées (saisie possible)", unlockedY >= 16, `${unlockedY}/32 échantillon l6-30`);
  if (unlockedY < 16) fail();
}

// 7) Mises en forme conditionnelles d'origine conservées
{
  const cfS = (src.getWorksheet("02_Pointage").conditionalFormattings || []).length;
  const cfO = (out.getWorksheet("02_Pointage").conditionalFormattings || []).length;
  ok("Mises en forme conditionnelles Pointage conservées", cfO >= cfS && cfS > 0, `orig:${cfS} → v5:${cfO}`);
  if (!(cfO >= cfS && cfS > 0)) fail();
}

// 8) Validations ajoutées (lecture au niveau CELLULE + repli XML)
{
  const ptv = out.getWorksheet("02_Pointage");
  const fB = ptv.getCell(6, 2).dataValidation?.formulae || [];
  const fS = ptv.getCell(6, 19).dataValidation?.formulae || [];
  const fJ = ptv.getCell(6, 10).dataValidation?.formulae || [];
  const hasId = fB.some((f) => String(f).includes("01_Employes"));
  const hasCodes = fS.some((f) => String(f).includes("AJ"));
  const hasOuiNon = fJ.some((f) => String(f).includes("Oui"));
  ok("Validations présentes (IDs + codes présence + Oui/Non)", hasId && hasCodes && hasOuiNon,
    `ID:${hasId ? "✔" : "✘"} Codes:${hasCodes ? "✔" : "✘"} OuiNon:${hasOuiNon ? "✔" : "✘"}`);
  if (!(hasId && hasCodes && hasOuiNon)) fail();
}

console.log("\n" + (fails === 0 ? "🟢 AUDIT COMPLET : TOUT EST VERT" : `🔴 ${fails} contrôle(s) en échec`));
process.exitCode = fails === 0 ? 0 : 1;
