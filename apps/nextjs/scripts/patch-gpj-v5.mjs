/**
 * PATCH V5 — correction CHIRURGICALE en place du fichier ORIGINAL.
 * Principe : préserver 100 % de la structure/design d'origine
 * (tables structurées Employes/Pointage, couleurs, séparateurs rouges,
 * mises en forme conditionnelles existantes, dispositions) et corriger
 * UNIQUEMENT :
 *   1. dates texte « 8/262026 » → vraies dates (col A Pointage)
 *   2. IDs en majuscules (Pointage B, Employes A)
 *   3. heures fantômes 00:00 → vidées OU reconstituées aux heures standards
 *      si la ligne est codée présente (A/R/HS/P)
 *   4. salaires texte → nombres (Employes L)
 *   5. déverrouillage de toutes les cellules JAUNES FFF2CC (convention du fichier)
 *   6. protection de chaque feuille (GPJ2026) avec sélection libre
 */
import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2];
const OUT_DIR = resolve(__dirname, "../../../DOC/GPJ");
const OUT_FILE = resolve(OUT_DIR, "GPJ_PRO_V5_STRUCTURE_ORIGINALE.xlsx");
mkdirSync(OUT_DIR, { recursive: true });

const PWD = "GPJ2026";

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);

// ------------------------------------------------------------- helpers
function fixDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (v.getUTCFullYear() < 1900) return null;
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  }
  if (typeof v === "number") {
    if (v < 40000) return null; // sérial 0/heures → pas une date
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = /^(\d{1,2})\/(\d{2,6})$/.exec(s); // 8/262026
  if (m) {
    const mo = +m[1], rest = m[2];
    const day = +rest.slice(0, rest.length - 4), yr = +rest.slice(-4);
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) return new Date(Date.UTC(yr, mo - 1, day));
  }
  const d2 = new Date(s);
  return isNaN(d2) ? null : new Date(Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate()));
}
function fixTime(v) {
  if (typeof v === "number") {
    if (v > 0 && v < 1) return v;
    return null;
  }
  if (v instanceof Date) {
    const frac = (v.getUTCHours() + v.getUTCMinutes() / 60) / 24;
    return frac > 0 ? frac : null;
  }
  return null;
}
const rawVal = (cell) => {
  const v = cell.value;
  if (v && typeof v === "object") {
    if (v.result !== undefined && v.result !== null) return v.result;
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text) return v.text;
    if (v instanceof Date) return v;
    return null;
  }
  return v ?? null;
};

// Horaires standards par jour depuis 00_Parametres
{
  var SCHED = {};
  const sp = wb.getWorksheet("00_Parametres");
  const jours = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  for (let i = 0; i < 7; i++) {
    const r = 7 + i;
    const deb = fixTime(rawVal(sp.getCell(r, 3)));
    const fin = fixTime(rawVal(sp.getCell(r, 4)));
    SCHED[jours[i]] = sp.getCell(r, 2).value === "Oui" && deb != null && fin != null ? { deb, fin } : null;
  }
}
const schedFor = (date) =>
  SCHED[["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"][date.getUTCDay()]];

let stats = { dates: 0, ids: 0, heuresVidees: 0, heuresStd: 0, salaires: 0 };

// ================================================================ 02_Pointage
{
  const ws = wb.getWorksheet("02_Pointage");
  const lastRow = Math.min(ws.rowCount || 150, 150);
  for (let r = 6; r <= lastRow; r++) {
    // --- A : date
    const aCell = ws.getCell(r, 1);
    const aRaw = rawVal(aCell);
    const hasA = !(aRaw == null || aRaw === "");
    const d = hasA ? fixDate(aRaw) : null;
    if (hasA && d) {
      const wasText = typeof aRaw === "string";
      aCell.value = d;
      aCell.numFmt = "dd/mm/yyyy";
      if (wasText) stats.dates++;
    }
    // --- B : ID majuscule
    const bCell = ws.getCell(r, 2);
    const bRaw = rawVal(bCell);
    if (typeof bRaw === "string" && bRaw.trim()) {
      const up = bRaw.trim().toUpperCase();
      if (up !== bRaw) { bCell.value = up; stats.ids++; }
    }
    // --- S code (pour règle de reconstitution)
    const code = String(rawVal(ws.getCell(r, 19)) ?? "").trim().toUpperCase();
    // --- H/I : heures réelles
    for (const [col] of [[8], [9]]) {
      const cell = ws.getCell(r, col);
      const t = fixTime(rawVal(cell));
      if (t != null) {
        cell.numFmt = "hh:mm";                    // normalise l'affichage
        continue;                                  // vraie heure → inchangée
      }
      const cur = rawVal(cell);
      const vide = cur == null || cur === "";
      if (!vide) { cell.clearContents(); stats.heuresVidees++; }  // fantôme 00:00
    }
    if ((code === "A" || code === "R" || code === "HS" || code === "P") && d) {
      const std = schedFor(d);
      if (std) {
        const hC = ws.getCell(r, 8), dC = ws.getCell(r, 9);
        if (rawVal(hC) == null || rawVal(hC) === "") {
          hC.value = std.deb; hC.numFmt = "hh:mm"; stats.heuresStd++;
        }
        if (rawVal(dC) == null || rawVal(dC) === "") {
          dC.value = std.fin; dC.numFmt = "hh:mm";
        }
      }
    }
  }
  // Validations (aucune n'existait) sur la plage de la table
  for (let r = 6; r <= lastRow; r++) {
    ws.getCell(r, 2).dataValidation = { type: "list", allowBlank: true, formulae: ["='01_Employes'!$A$6:$A$30"], errorTitle: "ID inconnu", error: "Choisir un ID existant (01_Employes)." };
    ws.getCell(r, 10).dataValidation = { type: "list", allowBlank: true, formulae: ["\"Oui,Non\""] };
    ws.getCell(r, 11).dataValidation = { type: "list", allowBlank: true, formulae: ["\"Oui,Non\""] };
    const CODES = '"A,R,HS,P,C,M,F,AJ,AI"';
    ws.getCell(r, 19).dataValidation = { type: "list", allowBlank: true, formulae: [CODES] };
    const aDv = ws.getCell(r, 1).dataValidation;
    if (!aDv || !aDv.type) {
      ws.getCell(r, 1).dataValidation = { type: "date", operator: "between", allowBlank: true, formulae: ["DATE(2024,1,1)", "DATE(2100,12,31)"], errorTitle: "Date invalide", error: "JJ/MM/AAAA." };
    }
  }
}

// ================================================================ 01_Employes
{
  const ws = wb.getWorksheet("01_Employes");
  for (let r = 6; r <= 30; r++) {
    const idCell = ws.getCell(r, 1);
    const v = rawVal(idCell);
    if (typeof v === "string" && v.trim()) {
      const up = v.trim().toUpperCase();
      if (up !== v) { idCell.value = up; stats.ids++; }
    }
    const sCell = ws.getCell(r, 12);
    const s = rawVal(sCell);
    if (typeof s === "string" && s.replace(/[ \u00A0]/g, "") !== "") {
      const n = Number(s.replace(/[ \u00A0]/g, ""));
      if (!isNaN(n)) { sCell.value = n; sCell.numFmt = "#,##0"; stats.salaires++; }
    } else if (typeof s === "number") {
      sCell.numFmt = "#,##0";
    }
  }
}

// ============================================ déverrouillage des JAUNES FFF2CC
let unlocked = 0;
for (const ws of wb.worksheets) {
  const maxR = Math.min(ws.rowCount || 1, 600);
  for (let r = 1; r <= maxR; r++) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: false }, (c) => {
      const f = c.fill;
      if (f && f.pattern === "solid" && f.fgColor) {
        const argb = (f.fgColor.argb || "").toUpperCase();
        if (argb.endsWith("FFF2CC")) {
          c.style.protection = { locked: false };
          unlocked++;
        }
      }
    });
  }
}

// ================================================================ protections
for (const ws of wb.worksheets) {
  ws.protect(PWD, {
    selectLockedCells: true, selectUnlockedCells: true,
    formatCells: true, formatColumns: true, formatRows: true,
    insertRows: false, insertColumns: false, deleteRows: false, deleteColumns: false,
    insertHyperlinks: false, sort: false, autoFilter: true,
  });
}

// ------------------------------------------------------------------ écriture
const buf = await wb.xlsx.writeBuffer();
writeFileSync(OUT_FILE, Buffer.from(buf));
console.log("OK →", OUT_FILE, `(${(buf.length / 1024).toFixed(1)} Ko)`);
console.log("STATS:", JSON.stringify(stats), "| cellules jaunes déverrouillées:", unlocked);
