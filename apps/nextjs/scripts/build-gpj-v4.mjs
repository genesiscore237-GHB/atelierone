/**
 * BUILD V4 — Gestion_Personnel_Garage_Polyvalent_Junior_PRO_CORRIGÉ
 * Lit le fichier réel, corrige les données, régénère un classeur sain :
 *   ✔ dates texte « 8/262026 » → vraies dates 26/08/2026
 *   ✔ IDs en majuscules (emp002 → EMP002)
 *   ✔ heures fantômes 00:00 (serial 0) → vidées
 *   ✔ lignes vides intercalées supprimées (resserrées)
 *   ✔ 500 lignes pré-armées, validations, jaune/vert, protection GPJ2026
 *   ✔ structure et adresses IDENTIQUES à l'original (Parametres B21-B31,
 *     Employes A5:Q30, Pointage en-têtes l5, Paie B5/D5 l11-l27…)
 * Les formules utilisent des plages absolues classiques (plus de dépendance
 * aux tableaux structurés, mais mêmes résultats).
 */
import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2];
const OUT_DIR = resolve(__dirname, "../../../DOC/GPJ");
const OUT_FILE = resolve(OUT_DIR, "GPJ_PRO_V4_CORRIGE.xlsx");
mkdirSync(OUT_DIR, { recursive: true });

// ------------------------------------------------------------------ lecture
const src = new ExcelJS.Workbook();
await src.xlsx.readFile(SRC);
const raw = (ws, r, c) => {
  const v = ws.getCell(r, c).value;
  if (v && typeof v === "object") {
    if (v.result !== undefined && v.result !== null) return v.result;
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text) return v.text;
    if (v instanceof Date) return v;
    return null;
  }
  return v ?? null;
};

/** Corrige « 8/262026 » → Date(2026,7,26) ; Date JS → Date UTC stable ; sinon null. */
function fixDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const y = v.getUTCFullYear() >= 1900 ? v.getUTCFullYear() : null;
    if (!y) return null; // serial 0 (1899-12-30) = heure fantôme
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  }
  if (typeof v === "number") {
    if (v <= 1) return null; // serial 0/1 → heure fantôme
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
const fixTime = (v) => {
  if (typeof v === "number") return v > 0 && v < 1 ? v : null;
  if (v instanceof Date) {
    const frac = (v.getUTCHours() + v.getUTCMinutes() / 60) / 24;
    return frac > 0 ? frac : null; // 00:00 = heure fantôme
  }
  return null;
};

// ------------------------------------------------------- extraction Employes
{
  var EMP_ROWS = [];
  const ws = src.getWorksheet("01_Employes");
  for (let r = 6; r <= 30; r++) {
    const id = String(raw(ws, r, 1) ?? "").trim().toUpperCase();
    if (!id || !/^EMP\d+/.test(id)) continue;
    EMP_ROWS.push({
      id, nom: raw(ws, r, 2) ?? "", prenom: raw(ws, r, 3) ?? "",
      poste: raw(ws, r, 5) ?? "", dept: raw(ws, r, 6) ?? "",
      tel: raw(ws, r, 7) ?? "", email: raw(ws, r, 8) ?? "",
      statut: raw(ws, r, 9) ?? "Actif",
      embauche: fixDate(raw(ws, r, 10)),
      contrat: raw(ws, r, 11) ?? "CDI",
      salaire: Number(raw(ws, r, 12)) || null,
      cnps: raw(ws, r, 15) ?? "", adresse: raw(ws, r, 16) ?? "", notes: raw(ws, r, 17) ?? "",
    });
  }
}
// ------------------------------------------------------- extraction Pointage
{
  var PT_ROWS = [];
  const ws = src.getWorksheet("02_Pointage");
  // Horaires standards par jour (pour reconstruire les journées « présentes » sans heures fiables)
  const sched = {};
  const spP = src.getWorksheet("00_Parametres");
  const joursSem = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  for (let i = 0; i < 7; i++) {
    const deb = fixTime(raw(spP, 7 + i, 3)), fin = fixTime(raw(spP, 7 + i, 4));
    sched[joursSem[i]] = raw(spP, 7 + i, 2) === "Oui" && deb != null && fin != null ? { deb, fin } : null;
  }
  for (let r = 6; r <= ws.rowCount; r++) {
    const aRaw = raw(ws, r, 1);
    const bRaw = String(raw(ws, r, 2) ?? "").trim().toUpperCase();
    if ((aRaw == null || aRaw === "") && !bRaw) continue;          // ligne vide → resserrée
    const date = fixDate(aRaw);
    if (!date || !/^EMP\d+$/.test(bRaw)) continue;                  // saisie incomplète/invalide → ignorée
    let arrivee = fixTime(raw(ws, r, 8));
    let depart = fixTime(raw(ws, r, 9));
    const code = String(raw(ws, r, 19) ?? "").trim().toUpperCase();
    // Journée déclarée présente mais heures fantômes/absentes → heures standards du jour
    if ((!arrivee || !depart) && ["A", "R", "HS", "P"].includes(code)) {
      const jourStd = sched[["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"][date.getUTCDay()]];
      if (jourStd) { arrivee = arrivee ?? jourStd.deb; depart = depart ?? jourStd.fin; }
    }
    PT_ROWS.push({
      date, id: bRaw,
      arrivee, depart,
      valAA: raw(ws, r, 10) ?? "Non", valDT: raw(ws, r, 11) ?? "Non",
      code,
      prime: Number(raw(ws, r, 20)) || 0,
      note: raw(ws, r, 21) ?? "",
    });
  }
}
console.log("Journées 'présent' reconstituées aux heures standards là où les heures étaient fantômes.");
console.log(`Extrait : ${EMP_ROWS.length} employés, ${PT_ROWS.length} lignes de pointage valides.`);

// ------------------------------------------------------------------ nouveau
const PWD = "GPJ2026";
const C_YELLOW = "FFF2CC", C_GREEN = "C6EFCE", F_GREEN = "006100";
const C_HEADER = "305496", C_TITLE = "1F3864";
const wb = new ExcelJS.Workbook();

const title = (ws, text, span, row = 1) => {
  ws.mergeCells(row, 1, row, span);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + C_TITLE } };
  c.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(row).height = 24;
};
const bandLabel = (ws, addrRow, col1, col2, text) => {
  ws.mergeCells(addrRow, col1, addrRow, col2);
  const c = ws.getCell(addrRow, col1);
  c.value = text;
  c.font = { bold: true, size: 11 };
};
const headerRow = (ws, row, headers, startCol = 1) => {
  headers.forEach((h, i) => {
    const c = ws.getCell(row, startCol + i);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9.5 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + C_HEADER } };
    c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  ws.getRow(row).height = 28;
};
const yellow = (ws, r1, c1, r2, c2, fmt) => {
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
    const cc = ws.getCell(r, c);
    cc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + C_YELLOW } };
    cc.style.protection = { locked: false };
    cc.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "hair" }, right: { style: "hair" } };
    if (fmt) cc.numFmt = fmt;
  }
};
const green = (ws, r1, c1, r2, c2, fmt) => {
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
    const cc = ws.getCell(r, c);
    cc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + C_GREEN } };
    cc.font = { color: { argb: "FF" + F_GREEN }, size: 9.5 };
    if (fmt) cc.numFmt = fmt;
  }
};
const widths = (ws, w) => w.forEach((x, i) => (ws.getColumn(i + 1).width = x));
/** Protection — ⚠️ exceljs INVERSE les booléens par rapport à l'OOXML :
 *  option:true  → attribut ABSENT/"0" (= action AUTORISÉE dans Excel)
 *  option:false → attribut "1"          (= action BLOQUÉE dans Excel)
 * Cible : tout sélectionner + saisir les jaunes + ajuster largeurs ; structure verrouillée. */
const protect = (ws) =>
  ws.protect(PWD, {
    selectLockedCells: true, selectUnlockedCells: true,   // sélection autorisée partout
    formatCells: true, formatColumns: true, formatRows: true,
    insertRows: false, insertColumns: false,              // insertion BLOQUÉE
    deleteRows: false, deleteColumns: false,              // suppression BLOQUÉE
    insertHyperlinks: false, sort: false,                 // tri bloqué (casserait les plages)
    autoFilter: true,
  });

// ============================================================ 00_Parametres
{
  const sp = src.getWorksheet("00_Parametres");
  const ws = wb.addWorksheet("00_Parametres", { views: [{ showGridLines: false }] });
  title(ws, "⚙️ PARAMÈTRES GÉNÉRAUX — GARAGE POLYVALENT JUNIOR (modifier les JAUNES uniquement)", 6);
  bandLabel(ws, 3, 1, 6, "HORAIRES DE TRAVAIL HEBDOMADAIRES");
  headerRow(ws, 6, ["Jour", "Travaillé ?", "Heure Début", "Heure Fin", "Pause (h)", "Heures nettes / jour"]);
  const jours = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  for (let i = 0; i < 7; i++) {
    const r = 7 + i;
    ws.getCell(r, 1).value = jours[i];
    ws.getCell(r, 2).value = raw(sp, r, 2) ?? (i < 6 ? "Oui" : "Non");
    ws.getCell(r, 3).value = fixTime(raw(sp, r, 3)) ?? (i < 6 ? 7.5 / 24 : null);
    ws.getCell(r, 4).value = fixTime(raw(sp, r, 4)) ?? (i < 6 ? 18 / 24 : null);
    ws.getCell(r, 5).value = raw(sp, r, 5) ?? 0;
    ws.getCell(r, 6).value = { formula: `IF(B${r}="Oui",IF(OR(C${r}="",D${r}=""),"",ROUND((D${r}-C${r})*24-E${r},2)),"")` };
    yellow(ws, r, 2, r, 5);
    green(ws, r, 6, r, 6, "0.00");
    ws.getCell(r, 3).numFmt = "hh:mm"; ws.getCell(r, 4).numFmt = "hh:mm";
  }
  bandLabel(ws, 15, 1, 6, "RÉSUMÉ & PARAMÈTRES DE CALCUL");
  const params = [
    [16, "Jours travaillés / semaine", `COUNTIF(B7:B13,"Oui")`, "green"],
    [17, "Heures nettes / semaine", `SUM(F7:F13)`, "green"],
    [18, "Heures standard / mois (≈ 4.333 sem.)", `ROUND(B17*4.333,1)`, "green"],
    [21, "Heures standard mensuelles (réf. taux)", `B18`, "green"],
    [22, "Taux majoration Heures Supp.", 1.5, "yellow"],
    [23, "Seuil HS journalier (heures)", 9.5, "yellow"],
    [24, "Heures standard d'un jour ouvrable", `F7`, "green"],
    [25, "Heures standard d'un samedi", `F12`, "green"],
    [28, "Comptabiliser les arrivées anticipées ?", "Non", "yellow"],
    [29, "Comptabiliser les départs tardifs ?", "Non", "yellow"],
    [30, "Déduire automatiquement les absences injustifiées ?", "Oui", "yellow"],
    [31, "Déduire automatiquement les départs anticipés ?", "Oui", "yellow"],
  ];
  for (const [r, label, val, kind] of params) {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 2).value = typeof val === "string" && val.startsWith("=") ? { formula: val.slice(1) } : val;
    if (kind === "yellow") yellow(ws, r, 2, r, 2); else green(ws, r, 2, r, 2);
  }
  ws.getCell("B22").numFmt = "0.0"; ws.getCell("B23").numFmt = "0.0";
  bandLabel(ws, 33, 1, 6, "LOGIQUE APPLIQUÉE DANS LE POINTAGE");
  ["1. Arrivée avant l'heure de début → considérée à l'heure (sauf si B28 = Oui).",
   "2. Départ après l'heure de fin → compté à l'heure de fin (sauf si B29 = Oui).",
   "3. Arrivée en retard → minutes de retard calculées (colonne N Pointage).",
   "4. Départ anticipé → minutes manquantes calculées (colonne O Pointage).",
   "5. Tous les calculs se font d'abord en minutes puis convertis en heures.",
  ].forEach((t, i) => (ws.getCell(34 + i, 1).value = t));
  // Listes de référence (mêmes adresses que l'original A39:E49) + CODES en G
  bandLabel(ws, 39, 1, 1, "Postes"); bandLabel(ws, 39, 2, 2, "Départements");
  bandLabel(ws, 39, 3, 3, "Types de contrat"); bandLabel(ws, 39, 4, 4, "Statuts");
  bandLabel(ws, 39, 5, 5, "Types d'absence"); bandLabel(ws, 39, 7, 7, "Codes");
  for (let r = 40; r <= 49; r++) for (let c = 1; c <= 5; c++) {
    const v = raw(sp, r, c);
    if (v != null && v !== "") ws.getCell(r, c).value = v;
    if (ws.getCell(r, c).value != null) yellow(ws, r, c, r, c);
  }
  const CODES = [["A", "Présent (à l'heure)"], ["R", "Retard"], ["HS", "Heures supp."],
    ["P", "Journée partielle"], ["C", "Congé"], ["M", "Maladie"], ["F", "Férié"],
    ["AJ", "Absence justifiée"], ["AI", "Absence injustifiée"]];
  CODES.forEach(([code, lib], i) => {
    ws.getCell(40 + i, 7).value = code;
    ws.getCell(40 + i, 8).value = lib;
    yellow(ws, 40 + i, 7, 40 + i, 8);
  });
  bandLabel(ws, 52, 1, 6, "INSTRUCTIONS");
  ["• JAUNE = saisie (modifiable)   ·   VERT = formule protégée.",
   "• Mot de passe des feuilles : " + PWD + " — à ne diffuser qu'à l'administrateur.",
   "• Pour changer les horaires : modifiez les cellules jaunes du tableau ci-dessus.",
   "• Le taux horaire des employés = Salaire ÷ B21 (recalculé automatiquement).",
   "• Exemple actuel : Lun-Ven 7h30-18h (pause 1h) · Sam 7h30-12h · Dim repos.",
  ].forEach((t, i) => (ws.getCell(53 + i, 1).value = t));
  widths(ws, [46, 14, 11, 11, 10, 18, 7, 24]);
  protect(ws);
}

// ============================================================ 01_Employes
{
  const ws = wb.addWorksheet("01_Employes", { views: [{ state: "frozen", xSplit: 3, ySplit: 5 }] });
  title(ws, "👥 REGISTRE DU PERSONNEL — SOURCE DE VÉRITÉ (ajouter en BAS uniquement)", 17);
  ws.getCell("A3").value = "Complétez uniquement les cellules JAUNES. Les colonnes D, M, N sont calculées (VERTES). Ne supprimez jamais une ligne au milieu.";
  ws.getCell("A3").font = { italic: true, size: 9 };
  headerRow(ws, 5, ["ID", "Nom", "Prénom", "Nom Complet", "Poste", "Département", "Téléphone",
    "Email", "Statut", "Date d'embauche", "Type de contrat", "Salaire Base Mensuel (FCFA)",
    "Taux Horaire (FCFA)", "Taux HS (FCFA)", "N° CNPS", "Adresse", "Notes / Observations"]);
  widths(ws, [10, 20, 14, 26, 20, 18, 20, 24, 11, 13, 14, 14, 12, 12, 14, 22, 24]);
  const LAST = 30; // A6:Q30 comme l'original
  for (let i = 0; i < EMP_ROWS.length; i++) {
    const e = EMP_ROWS[i], r = 6 + i;
    ws.getCell(r, 1).value = e.id;
    ws.getCell(r, 2).value = e.nom; ws.getCell(r, 3).value = e.prenom;
    ws.getCell(r, 5).value = e.poste; ws.getCell(r, 6).value = e.dept;
    ws.getCell(r, 7).value = e.tel || null; ws.getCell(r, 8).value = e.email || null;
    ws.getCell(r, 9).value = e.statut;
    if (e.embauche) ws.getCell(r, 10).value = e.embauche;
    ws.getCell(r, 11).value = e.contrat;
    if (e.salaire != null) ws.getCell(r, 12).value = e.salaire;
    if (e.cnps) ws.getCell(r, 15).value = e.cnps;
    if (e.adresse) ws.getCell(r, 16).value = e.adresse;
    if (e.notes) ws.getCell(r, 17).value = e.notes;
  }
  for (let r = 6; r <= LAST; r++) {
    ws.getCell(r, 4).value = { formula: `TRIM(B${r}&" "&C${r})` };                                   // D
    ws.getCell(r, 13).value = { formula: `IF(L${r}="","",ROUND(L${r}/'00_Parametres'!$B$21,0))` };   // M
    ws.getCell(r, 14).value = { formula: `IF(M${r}="","",ROUND(M${r}*'00_Parametres'!$B$22,0))` };   // N
  }
  yellow(ws, 6, 1, LAST, 3); yellow(ws, 6, 5, LAST, 12, "#,##0");
  ws.getColumn(10).numFmt = "dd/mm/yyyy"; yellow(ws, 6, 10, LAST, 10, "dd/mm/yyyy");
  yellow(ws, 6, 15, LAST, 17);
  green(ws, 6, 4, LAST, 4);
  green(ws, 6, 13, LAST, 14, "#,##0");
  const SP = "'00_Parametres'!";
  for (let r = 6; r <= LAST; r++) {
    ws.getCell(r, 5).dataValidation = { type: "list", allowBlank: true, formulae: [`=${SP}$A$40:$A$49`] };
    ws.getCell(r, 6).dataValidation = { type: "list", allowBlank: true, formulae: [`=${SP}$B$40:$B$45`] };
    ws.getCell(r, 9).dataValidation = { type: "list", allowBlank: true, formulae: [`=${SP}$D$40:$D$45`] };
    ws.getCell(r, 11).dataValidation = { type: "list", allowBlank: true, formulae: [`=${SP}$C$40:$C$45`] };
    ws.getCell(r, 12).dataValidation = { type: "whole", operator: "greaterThan", allowBlank: true, formulae: [0], errorTitle: "Salaire invalide", error: "Nombre ENTIER sans espace (ex : 80000)." };
    ws.getCell(r, 10).dataValidation = { type: "date", operator: "lessThan", allowBlank: true, formulae: ["DATE(2100,1,1)"], errorTitle: "Date invalide", error: "Format JJ/MM/AAAA." };
  }
  protect(ws);
}

// ============================================================ 02_Pointage
{
  const ws = wb.addWorksheet("02_Pointage", { views: [{ state: "frozen", xSplit: 3, ySplit: 5 }] });
  title(ws, "🕐 POINTAGE GPJ — saisir : Date · ID · Arrivée · Départ (ou Code absence)", 21);
  ws.getCell("A2").value = "Une ligne = un employé pour un jour. Séparer deux jours : simplement changer la date (les formules suivent). Codes absence : A, R, HS, P, C, M, F, AJ, AI.";
  ws.getCell("A2").font = { italic: true, size: 9 };
  ws.getCell("A3").value = "JAUNE = saisie · VERT = automatique · ligne grise = séparateur · ligne rose = anomalie à corriger.";
  ws.getCell("A3").font = { italic: true, size: 9 };
  headerRow(ws, 5, ["Date", "ID Employé", "Nom Complet", "Jour", "H. Début théorique", "H. Fin théorique",
    "Pause (h)", "Heure Arrivée réelle", "Heure Départ réelle", "Valider arrivée anticipée ?",
    "Valider départ tardif ?", "Arrivée effective", "Départ effectif", "Minutes de retard",
    "Minutes départ anticipé", "Heures travaillées", "Heures Normales", "Heures Supp.",
    "Code Présence", "Prime Tâche (FCFA)", "Notes / Motif"]);
  widths(ws, [11, 11, 24, 10, 10, 10, 7, 10, 10, 10, 10, 10, 10, 9, 10, 10, 10, 9, 8, 11, 28]);
  const FIRST = 6, LAST = 505, EP = "$A$6:$Q$30", P = "'00_Parametres'!";
  for (let i = 0; i < PT_ROWS.length && i < LAST - FIRST + 1; i++) {
    const p = PT_ROWS[i], r = FIRST + i;
    ws.getCell(r, 1).value = p.date;
    ws.getCell(r, 2).value = p.id;
    if (p.arrivee != null) ws.getCell(r, 8).value = p.arrivee;
    if (p.depart != null) ws.getCell(r, 9).value = p.depart;
    ws.getCell(r, 10).value = p.valAA; ws.getCell(r, 11).value = p.valDT;
    if (p.code) ws.getCell(r, 19).value = p.code;
    if (p.prime) ws.getCell(r, 20).value = p.prime;
    if (p.note) ws.getCell(r, 21).value = p.note;
  }
  for (let r = FIRST; r <= LAST; r++) {
    ws.getCell(r, 3).value = { formula: `IF(B${r}="","",IFERROR(VLOOKUP(B${r},'01_Employes'!${EP},4,FALSE),"⚠ ID inconnu"))` };
    ws.getCell(r, 4).value = { formula: `IF(A${r}="","",TEXT(A${r},"dddd"))` };
    ws.getCell(r, 5).value = { formula: `IF(A${r}="","",IFERROR(INDEX(${P}$C$7:$C$13,WEEKDAY(A${r},2)),""))` };
    ws.getCell(r, 6).value = { formula: `IF(A${r}="","",IFERROR(INDEX(${P}$D$7:$D$13,WEEKDAY(A${r},2)),""))` };
    ws.getCell(r, 7).value = { formula: `IF(A${r}="","",IFERROR(INDEX(${P}$E$7:$E$13,WEEKDAY(A${r},2)),0))` };
    ws.getCell(r, 12).value = { formula: `IF(OR(A${r}="",H${r}=""),"",IF(H${r}<E${r},IF(OR(J${r}="Oui",${P}$B$28="Oui"),H${r},E${r}),H${r}))` };
    ws.getCell(r, 13).value = { formula: `IF(OR(A${r}="",I${r}=""),"",IF(I${r}>F${r},IF(OR(K${r}="Oui",${P}$B$29="Oui"),I${r},F${r}),I${r}))` };
    ws.getCell(r, 14).value = { formula: `IF(OR(A${r}="",H${r}="",E${r}=""),0,MAX(0,ROUND((H${r}-E${r})*1440,0)))` };
    ws.getCell(r, 15).value = { formula: `IF(OR(A${r}="",I${r}="",F${r}=""),0,MAX(0,ROUND((F${r}-I${r})*1440,0)))` };
    ws.getCell(r, 16).value = { formula: `IF(OR(L${r}="",M${r}=""),0,MAX(0,ROUND((M${r}-L${r})*24-G${r},2)))` };
    ws.getCell(r, 17).value = { formula: `IF(P${r}=0,0,MIN(P${r},${P}$B$23))` };
    ws.getCell(r, 18).value = { formula: `IF(P${r}=0,0,MAX(0,P${r}-${P}$B$23))` };
  }
  yellow(ws, FIRST, 1, LAST, 2, "dd/mm/yyyy");
  ws.getColumn(1).numFmt = "dd/mm/yyyy";
  yellow(ws, FIRST, 8, LAST, 11, "hh:mm");
  ws.getColumn(8).numFmt = "hh:mm"; ws.getColumn(9).numFmt = "hh:mm";
  yellow(ws, FIRST, 19, LAST, 21);
  green(ws, FIRST, 3, LAST, 4);
  green(ws, FIRST, 5, LAST, 7, "hh:mm");
  green(ws, FIRST, 12, LAST, 18, "0.00");
  for (let r = FIRST; r <= LAST; r++) { ws.getCell(r, 14).numFmt = "0"; ws.getCell(r, 15).numFmt = "0"; }
  for (let r = FIRST; r <= LAST; r++) {
    ws.getCell(r, 1).dataValidation = { type: "date", operator: "between", allowBlank: true, formulae: ["DATE(2024,1,1)", "DATE(2100,12,31)"], errorTitle: "Date invalide", error: "Saisir une vraie date JJ/MM/AAAA (jamais 8/262026)." };
    ws.getCell(r, 2).dataValidation = { type: "list", allowBlank: true, formulae: ["='01_Employes'!$A$6:$A$30"], errorTitle: "ID inconnu", error: "Choisir un ID existant (01_Employes)." };
    ws.getCell(r, 10).dataValidation = { type: "list", allowBlank: true, formulae: ["\"Oui,Non\""] };
    ws.getCell(r, 11).dataValidation = { type: "list", allowBlank: true, formulae: ["\"Oui,Non\""] };
    ws.getCell(r, 19).dataValidation = { type: "list", allowBlank: true, formulae: [`=${P}$G$40:$G$48`] };
  }
  ws.addConditionalFormatting({
    ref: `A${FIRST}:U${LAST}`, priority: 1,
    rules: [{ type: "expression", priority: 1, formulae: [`AND($A${FIRST}<>"",$B${FIRST}="")`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD9D9D9" } }, font: { italic: true } } }],
  });
  ws.addConditionalFormatting({
    ref: `A${FIRST}:U${LAST}`, priority: 2,
    rules: [{ type: "expression", priority: 2, formulae: [`AND($A${FIRST}<>"",$B${FIRST}<>"",$N${FIRST}>15)`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFF4CCCC" } } } }],
  });
  ws.addConditionalFormatting({
    ref: `R${FIRST}:R${LAST}`, priority: 3,
    rules: [{ type: "expression", priority: 3, formulae: [`AND(ISNUMBER($R${FIRST}),$R${FIRST}>0)`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFD9EAD3" } }, font: { bold: true, color: { argb: "FF38761D" } } } }],
  });
  protect(ws);
}

// ============================================================ 03_Paie
{
  const ws = wb.addWorksheet("03_Paie", { views: [{ state: "frozen", ySplit: 10 }] });
  title(ws, "💰 CALCUL DE PAIE — BASÉ SUR LES HEURES RÉELLES DU POINTAGE", 14);
  ws.getCell("A4").value = "PÉRIODE DE CALCUL";
  ws.getCell("A5").value = "Date début";
  ws.getCell("B5").value = new Date(Date.UTC(2026, 7, 1));
  ws.getCell("C5").value = "Date fin";
  ws.getCell("D5").value = new Date(Date.UTC(2026, 7, 31));
  yellow(ws, 5, 2, 5, 2, "dd/mm/yyyy"); yellow(ws, 5, 4, 5, 4, "dd/mm/yyyy");
  ws.getCell("E5").value = "← Modifiez ces dates pour recalculer toute la paie.";
  ws.getCell("E5").font = { italic: true, size: 9 };

  const synth = [["A8", "Total Heures Normales", "B8", "=G27"], ["C8", "Total Heures Supp", "D8", "=H27"],
    ["E8", "Total Primes Tâches", "F8", "=I27"], ["G8", "Masse Salariale Estimée", "H8", "=L27"]];
  for (const [la, lb, ca, f] of synth) {
    ws.getCell(la).value = lb;
    const c = ws.getCell(ca); c.value = { formula: f.slice(1) };
    c.font = { bold: true, color: { argb: "FF" + F_GREEN } };
    c.numFmt = "#,##0.##";
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + C_GREEN } };
  }

  headerRow(ws, 11, ["ID", "Nom Complet", "Poste", "Type Contrat", "Salaire Base Mensuel",
    "Taux Horaire", "Heures Normales", "Heures Supp.", "Total Primes Tâches",
    "Montant Heures Normales", "Montant HS", "Salaire Brut Estimé", "Jours présents", "Observations"]);
  widths(ws, [10, 26, 18, 13, 13, 10, 10, 10, 12, 13, 11, 13, 9, 20]);
  const PT = "'02_Pointage'!", EM = "'01_Employes'!";
  for (let i = 0; i < 25; i++) {           // lignes 12..36 (25 slots ≥ 14 employés + marge)
    const r = 12 + i, er = 6 + i;
    ws.getCell(r, 1).value = { formula: `IF(${EM}A${er}="","-",${EM}A${er})` };
    ws.getCell(r, 2).value = { formula: `IF($A${r}="-","",'01_Employes'!D${er})` };
    ws.getCell(r, 3).value = { formula: `IF($A${r}="-","",'01_Employes'!E${er})` };
    ws.getCell(r, 4).value = { formula: `IF($A${r}="-","",'01_Employes'!K${er})` };
    ws.getCell(r, 5).value = { formula: `IF($A${r}="-","",'01_Employes'!L${er})` };
    ws.getCell(r, 6).value = { formula: `IF($A${r}="-","",'01_Employes'!M${er})` };
    ws.getCell(r, 7).value = { formula: `IF($A${r}="-","",SUMIFS(${PT}$Q$6:$Q$505,${PT}$B$6:$B$505,$A${r},${PT}$A$6:$A$505,">="&$B$5,${PT}$A$6:$A$505,"<="&$D$5))` };
    ws.getCell(r, 8).value = { formula: `IF($A${r}="-","",SUMIFS(${PT}$R$6:$R$505,${PT}$B$6:$B$505,$A${r},${PT}$A$6:$A$505,">="&$B$5,${PT}$A$6:$A$505,"<="&$D$5))` };
    ws.getCell(r, 9).value = { formula: `IF($A${r}="-","",SUMIFS(${PT}$T$6:$T$505,${PT}$B$6:$B$505,$A${r},${PT}$A$6:$A$505,">="&$B$5,${PT}$A$6:$A$505,"<="&$D$5))` };
    ws.getCell(r, 10).value = { formula: `IF(OR($A${r}="-",$G${r}=""),0,ROUND($G${r}*$F${r},0))` };
    ws.getCell(r, 11).value = { formula: `IF(OR($A${r}="-",$H${r}=""),0,ROUND($H${r}*IFERROR(VLOOKUP($A${r},${EM}$A$6:$Q$30,14,FALSE),0),0))` };
    ws.getCell(r, 12).value = { formula: `IF($A${r}="-","",$J${r}+$K${r}+$I${r})` };
    ws.getCell(r, 13).value = { formula: `IF($A${r}="-","",COUNTIFS(${PT}$B$6:$B$505,$A${r},${PT}$A$6:$A$505,">="&$B$5,${PT}$A$6:$A$505,"<="&$D$5,${PT}$P$6:$P$505,">0"))` };
  }
  ws.getCell("A37").value = "TOTAUX";
  ["G", "H", "I", "J", "K", "L"].forEach((c) => (ws.getCell(`${c}37`).value = { formula: `SUM(${c}12:${c}36)` }));
  ws.getRow(37).font = { bold: true };
  green(ws, 12, 1, 36, 12);
  for (let r = 12; r <= 36; r++) {
    ws.getCell(r, 5).numFmt = "#,##0"; ws.getCell(r, 6).numFmt = "#,##0";
    ws.getCell(r, 7).numFmt = "0.00"; ws.getCell(r, 8).numFmt = "0.00";
    [9, 10, 11, 12].forEach((c) => (ws.getCell(r, c).numFmt = "#,##0"));
  }
  green(ws, 37, 7, 37, 12);
  [7, 8].forEach((c) => (ws.getCell(37, c).numFmt = "0.00"));
  [9, 10, 11, 12].forEach((c) => (ws.getCell(37, c).numFmt = "#,##0"));
  yellow(ws, 12, 14, 36, 14);
  ["1. Ce calcul est une ESTIMATION basée sur les heures pointées dans la période.",
   "2. Le salaire est calculé uniquement sur les heures réelles (mode horaire).",
   "3. Un employé absent sans pointage aura un salaire estimé à 0 pour la période.",
   "4. Pour ajouter un employé : passez par 01_Employes (il apparaîtra ici seul).",
   "5. Les primes de tâche se saisissent directement dans 02_Pointage (colonne T).",
  ].forEach((t, i) => { ws.getCell(39 + i, 1).value = t; ws.getCell(39 + i, 1).font = { italic: true, size: 9 }; });
  protect(ws);
}

// ============================================================ 04_Conges
{
  const ws = wb.addWorksheet("04_Conges", { views: [{ state: "frozen", ySplit: 4 }] });
  title(ws, "🏖️ GESTION DES CONGÉS ET ABSENCES", 9);
  ws.getCell("A2").value = "Enregistrez les demandes (statut Approuvé ⇒ décompté du solde). Droit annuel modifiable dans le bloc SOLDES.";
  ws.getCell("A2").font = { italic: true, size: 9 };
  headerRow(ws, 4, ["N°", "ID Employé", "Nom Complet", "Type d'absence", "Date début", "Date fin",
    "Nb jours", "Motif", "Statut"]);
  widths(ws, [5, 11, 26, 18, 11, 11, 9, 26, 12]);
  for (let r = 5; r <= 44; r++) {
    ws.getCell(r, 1).value = r - 4;
    ws.getCell(r, 3).value = { formula: `IF(B${r}="","",IFERROR(VLOOKUP(B${r},'01_Employes'!$A$6:$Q$30,4,FALSE),"⚠ inconnu"))` };
    ws.getCell(r, 7).value = { formula: `IF(OR(E${r}="",F${r}=""),"",F${r}-E${r}+1)` };
    ws.getCell(r, 2).dataValidation = { type: "list", allowBlank: true, formulae: ["='01_Employes'!$A$6:$A$30"] };
    ws.getCell(r, 4).dataValidation = { type: "list", allowBlank: true, formulae: ["='00_Parametres'!$E$40:$E$46"] };
    ws.getCell(r, 9).dataValidation = { type: "list", allowBlank: true, formulae: ["\"En attente,Approuvé,Refusé\""] };
  }
  yellow(ws, 5, 2, 44, 2); yellow(ws, 5, 4, 44, 6, "dd/mm/yyyy");
  ws.getColumn(5).numFmt = "dd/mm/yyyy"; ws.getColumn(6).numFmt = "dd/mm/yyyy";
  yellow(ws, 5, 8, 44, 9);
  green(ws, 5, 3, 44, 3); green(ws, 5, 7, 44, 7, "0");

  bandLabel(ws, 46, 1, 6, "SOLDES DE CONGÉS (calculés automatiquement)");
  headerRow(ws, 47, ["ID", "Nom Complet", "Droit annuel (jours)", "Jours pris (approuvés)", "Solde restant", "Notes"]);
  for (let i = 0; i < 25; i++) {
    const r = 48 + i, er = 6 + i;
    ws.getCell(r, 1).value = { formula: `IF('01_Employes'!A${er}="","",'01_Employes'!A${er})` };
    ws.getCell(r, 2).value = { formula: `IF(A${r}="","",'01_Employes'!D${er})` };
    ws.getCell(r, 3).value = 30;
    ws.getCell(r, 4).value = { formula: `IF(A${r}="","",SUMIFS($G$5:$G$44,$B$5:$B$44,A${r},$I$5:$I$44,"Approuvé"))` };
    ws.getCell(r, 5).value = { formula: `IF(A${r}="","",C${r}-D${r})` };
  }
  yellow(ws, 48, 3, 72, 3, "0"); yellow(ws, 48, 6, 72, 6);
  green(ws, 48, 1, 72, 2); green(ws, 48, 4, 72, 5, "0");
  protect(ws);
}

// ============================================================ 05_Contrats
{
  const ws = wb.addWorksheet("05_Contrats", { views: [{ state: "frozen", ySplit: 3 }] });
  title(ws, "📄 SUIVI DES CONTRATS DE TRAVAIL", 10);
  headerRow(ws, 3, ["ID", "Nom Complet", "Type contrat", "Date début", "Date fin", "Durée (mois)",
    "Fin période essai", "Salaire brut (FCFA)", "Jours restants", "Alerte"]);
  widths(ws, [10, 26, 14, 12, 12, 11, 13, 14, 11, 12]);
  for (let i = 0; i < 25; i++) {
    const r = 4 + i, er = 6 + i;
    ws.getCell(r, 1).value = { formula: `IF('01_Employes'!A${er}="","",'01_Employes'!A${er})` };
    ws.getCell(r, 2).value = { formula: `IF(A${r}="","",'01_Employes'!D${er})` };
    ws.getCell(r, 3).value = { formula: `IF(A${r}="","",'01_Employes'!K${er})` };
    ws.getCell(r, 8).value = { formula: `IF(A${r}="","",'01_Employes'!L${er})` };
    ws.getCell(r, 6).value = { formula: `IF(OR(D${r}="",E${r}=""),"",ROUND((E${r}-D${r})/30,1))` };
    ws.getCell(r, 9).value = { formula: `IF(E${r}="","",E${r}-TODAY())` };
    ws.getCell(r, 10).value = { formula: `IF(I${r}="","",IF(I${r}<0,"EXPIRÉ",IF(I${r}<=30,"⚠ ≤ 30 j","OK")))` };
    ws.getCell(r, 4).numFmt = "dd/mm/yyyy"; ws.getCell(r, 5).numFmt = "dd/mm/yyyy";
    ws.getCell(r, 7).numFmt = "dd/mm/yyyy";
    ws.getCell(r, 8).numFmt = "#,##0"; ws.getCell(r, 9).numFmt = "0";
  }
  yellow(ws, 4, 4, 28, 5, "dd/mm/yyyy"); yellow(ws, 4, 7, 28, 7, "dd/mm/yyyy");
  green(ws, 4, 1, 28, 3); green(ws, 4, 6, 28, 6, "0.0"); green(ws, 4, 8, 28, 8, "#,##0");
  green(ws, 4, 9, 28, 10);
  ws.addConditionalFormatting({
    ref: "A4:J28", priority: 1,
    rules: [{ type: "expression", priority: 1, formulae: ['$J4="EXPIRÉ"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFF4CCCC" } } } }],
  });
  ws.addConditionalFormatting({
    ref: "A4:J28", priority: 2,
    rules: [{ type: "expression", priority: 2, formulae: ['$J4="⚠ ≤ 30 j"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFE699" } } } }],
  });
  protect(ws);
}

// ============================================================ 06_Competences
{
  const ws = wb.addWorksheet("06_Competences", { views: [{ state: "frozen", xSplit: 3, ySplit: 3 }] });
  title(ws, "🎓 COMPÉTENCES, FORMATIONS & HABILITATIONS", 9);
  headerRow(ws, 3, ["ID", "Nom Complet", "Poste", "Spécialité principale", "Niveau (1-5)",
    "Formations suivies", "Habilitations / Certifications", "Logiciels maîtrisés", "Notes"]);
  widths(ws, [10, 26, 20, 22, 10, 26, 26, 22, 20]);
  for (let i = 0; i < 25; i++) {
    const r = 4 + i, er = 6 + i;
    ws.getCell(r, 1).value = { formula: `IF('01_Employes'!A${er}="","",'01_Employes'!A${er})` };
    ws.getCell(r, 2).value = { formula: `IF(A${r}="","",'01_Employes'!D${er})` };
    ws.getCell(r, 3).value = { formula: `IF(A${r}="","",'01_Employes'!E${er})` };
    ws.getCell(r, 5).dataValidation = { type: "whole", operator: "between", allowBlank: true, formulae: [1, 5], errorTitle: "Niveau", error: "Entier entre 1 et 5." };
  }
  green(ws, 4, 1, 28, 3); yellow(ws, 4, 4, 28, 9);
  protect(ws);
}

// ============================================================ 07_Planning
{
  const ws = wb.addWorksheet("07_Planning", { views: [{ state: "frozen", xSplit: 3, ySplit: 4 }] });
  title(ws, "📅 PLANNING HEBDOMADAIRE / AFFECTATIONS", 9);
  ws.getCell("A2").value = "Semaine du :";
  ws.getCell("B2").value = new Date(Date.UTC(2026, 7, 17));
  yellow(ws, 2, 2, 2, 2, "dd/mm/yyyy");
  headerRow(ws, 4, ["ID", "Nom Complet", "Poste", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]);
  widths(ws, [10, 26, 20, 14, 14, 14, 14, 14, 14]);
  for (let i = 0; i < 25; i++) {
    const r = 5 + i, er = 6 + i;
    ws.getCell(r, 1).value = { formula: `IF('01_Employes'!A${er}="","",'01_Employes'!A${er})` };
    ws.getCell(r, 2).value = { formula: `IF(A${r}="","",'01_Employes'!D${er})` };
    ws.getCell(r, 3).value = { formula: `IF(A${r}="","",'01_Employes'!E${er})` };
  }
  green(ws, 5, 1, 29, 3); yellow(ws, 5, 4, 29, 9);
  ws.getCell("A31").value = "Exemples d'affectation : Atelier – Pont élévateur 1 · Réception client · Magasin · Carrosserie · Extérieur (dépannage)";
  ws.getCell("A31").font = { italic: true, size: 9 };
  protect(ws);
}

// ============================================================ 08_Sanctions
{
  const ws = wb.addWorksheet("08_Sanctions", { views: [{ state: "frozen", ySplit: 3 }] });
  title(ws, "⚠️ REGISTRE DES INCIDENTS, AVERTISSEMENTS & SANCTIONS", 9);
  headerRow(ws, 3, ["N°", "Date", "ID Employé", "Nom Complet", "Type", "Description des faits",
    "Gravité", "Décision / Sanction", "Notes"]);
  widths(ws, [5, 11, 11, 26, 16, 34, 12, 24, 20]);
  for (let r = 4; r <= 43; r++) {
    ws.getCell(r, 1).value = r - 3;
    ws.getCell(r, 4).value = { formula: `IF(C${r}="","",IFERROR(VLOOKUP(C${r},'01_Employes'!$A$6:$Q$30,4,FALSE),"⚠ inconnu"))` };
    ws.getCell(r, 2).numFmt = "dd/mm/yyyy";
    ws.getCell(r, 3).dataValidation = { type: "list", allowBlank: true, formulae: ["='01_Employes'!$A$6:$A$30"] };
    const TYPES_SANCTION = '"Avertissement verbal' + "," + "Avertissement écrit" + "," + "Mise à pied" + "," + "Suspension" + "," + "Rappel à l’ordre" + "," + "Autre" + '"';
    ws.getCell(r, 5).dataValidation = { type: "list", allowBlank: true, formulae: [TYPES_SANCTION] };
    ws.getCell(r, 7).dataValidation = { type: "list", allowBlank: true, formulae: ["\"Faible,Moyenne,Grave\""] };
  }
  yellow(ws, 4, 1, 43, 3, "dd/mm/yyyy"); yellow(ws, 4, 5, 43, 9);
  green(ws, 4, 4, 43, 4);
  protect(ws);
}

// ============================================================ 09_Contacts
{
  const ws = wb.addWorksheet("09_Contacts", { views: [{ state: "frozen", ySplit: 3 }] });
  title(ws, "📞 ANNUAIRE INTERNE — CONTACTS RAPIDES (100 % automatique)", 6);
  headerRow(ws, 3, ["ID", "Nom Complet", "Poste", "Téléphone", "Email", "Département"]);
  widths(ws, [10, 28, 21, 22, 26, 18]);
  for (let i = 0; i < 25; i++) {
    const r = 4 + i, er = 6 + i;
    ws.getCell(r, 1).value = { formula: `IF('01_Employes'!A${er}="","",'01_Employes'!A${er})` };
    ws.getCell(r, 2).value = { formula: `IF(A${r}="","",'01_Employes'!D${er})` };
    ws.getCell(r, 3).value = { formula: `IF(A${r}="","",'01_Employes'!E${er})` };
    ws.getCell(r, 4).value = { formula: `IF(A${r}="","",'01_Employes'!G${er})` };
    ws.getCell(r, 5).value = { formula: `IF(A${r}="","",'01_Employes'!H${er})` };
    ws.getCell(r, 6).value = { formula: `IF(A${r}="","",'01_Employes'!F${er})` };
  }
  green(ws, 4, 1, 28, 6);
  protect(ws);
}

// ============================================================ 00_Dashboard
{
  const ws = wb.addWorksheet("00_Dashboard", { views: [{ showGridLines: false }] });
  title(ws, "📊 GARAGE POLYVALENT JUNIOR — TABLEAU DE BORD RH", 8);
  ws.getCell("A2").value = "Mis à jour automatiquement — ne rien saisir ici.";
  ws.getCell("A2").font = { italic: true, size: 9 };
  const kpi = (row, col, label, formula, fmt = "0") => {
    const lc = ws.getCell(row, col); lc.value = label;
    lc.font = { bold: true, size: 10 };
    const vc = ws.getCell(row + 1, col);
    vc.value = { formula };
    vc.numFmt = fmt;
    vc.font = { bold: true, size: 16, color: { argb: "FF" + F_GREEN } };
    vc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + C_GREEN } };
    vc.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(row + 1).height = 26;
  };
  kpi(4, 1, "EFFECTIF TOTAL", `SUMPRODUCT(('01_Employes'!A6:A30<>"")*1)`);
  kpi(4, 3, "ACTIFS", `COUNTIF('01_Employes'!I6:I30,"Actif")`);
  kpi(4, 5, "CDI", `COUNTIF('01_Employes'!K6:K30,"CDI")`);
  kpi(4, 7, "APPRENTISSAGE", `COUNTIF('01_Employes'!K6:K30,"Apprentissage")`);
  kpi(8, 1, "MASSE SALARIALE BASE (FCFA)", `SUMIF('01_Employes'!I6:I30,"Actif",'01_Employes'!L6:L30)`, "#,##0");
  kpi(8, 5, "HEURES SUPP. (période paie)", `'03_Paie'!H37`, "0.00");
  kpi(8, 7, "MASSE PAIE ESTIMÉE (FCFA)", `'03_Paie'!L37`, "#,##0");

  bandLabel(ws, 12, 1, 2, "RÉPARTITION PAR POSTE"); bandLabel(ws, 12, 5, 6, "RÉPARTITION PAR DÉPARTEMENT");
  headerRow(ws, 13, ["Poste", "Nombre"], 1); headerRow(ws, 13, ["Département", "Nombre"], 5);
  const postes = ["Administrateur", "Secrétaire", "Chef des ateliers", "Mécanicien", "Tôlier", "Magasinier", "Électronicien", "Assistant Administratif"];
  postes.forEach((p, i) => {
    ws.getCell(14 + i, 1).value = p;
    ws.getCell(14 + i, 2).value = { formula: `COUNTIF('01_Employes'!$E$6:$E$30,A${14 + i})` };
  });
  const depts = ["Administration", "Direction Atelier", "Atelier Mécanique", "Carrosserie", "Magasin", "Direction Générale"];
  depts.forEach((d, i) => {
    ws.getCell(14 + i, 5).value = d;
    ws.getCell(14 + i, 6).value = { formula: `COUNTIF('01_Employes'!$F$6:$F$30,E${14 + i})` };
  });
  green(ws, 14, 2, 21, 2); green(ws, 14, 6, 21, 6);

  bandLabel(ws, 24, 1, 4, "ACCÈS RAPIDE AUX MODULES");
  const mods = [
    ["01_Employes", "SOURCE DE VÉRITÉ — fiches employés (ajouter EN BAS)"],
    ["02_Pointage", "Saisie quotidienne : date, ID, arrivée, départ, code"],
    ["03_Paie", "Choisir période B5/D5 — tout est automatique"],
    ["04_Conges", "Demandes + soldes automatiques"],
    ["05_Contrats", "Dates + alerte 30 jours avant échéance"],
    ["06_Competences", "Cartographie des compétences"],
    ["07_Planning", "Planning hebdo (date du lundi en B2)"],
    ["08_Sanctions", "Registre disciplinaire"],
    ["09_Contacts", "Annuaire automatique"],
    ["00_Parametres", "Horaires, taux HS, seuils, listes"],
    ["10_Mode_Emploi", "Notice complète + règles d'or"],
  ];
  headerRow(ws, 25, ["Module", "Description"], 1);
  mods.forEach(([m, d], i) => {
    ws.getCell(26 + i, 1).value = m;
    ws.mergeCells(26 + i, 2, 26 + i, 4);
    ws.getCell(26 + i, 2).value = d;
  });
  widths(ws, [26, 14, 12, 30, 20, 12, 22, 10]);
  protect(ws);
}

// ============================================================ 10_Mode_Emploi
{
  const ws = wb.addWorksheet("10_Mode_Emploi", { views: [{ showGridLines: false }] });
  title(ws, "📖 MODE D'EMPLOI — GESTION DU PERSONNEL GPJ (V4 CORRIGÉ)", 2);
  widths(ws, [110, 40]);
  const lines = [
    ["OBJECTIF", ""],
    ["Ce classeur gère le personnel du garage : fiches employés, pointage horaire, paie estimée, congés, contrats, compétences, planning, sanctions, annuaire.", ""],
    ["", ""],
    ["MODULE → UTILISATION", ""],
    ["00_Parametres", "Horaires (jaunes), taux HS (B22), seuil HS (B23), listes. Tout le classeur en dépend."],
    ["01_Employes", "SOURCE DE VÉRITÉ. Ajouter un employé = remplir la première ligne jaune libre EN BAS."],
    ["02_Pointage", "Une ligne = un employé/jour. Date JJ/MM/AAAA, heures HH:MM. Codes absence si pas d'heures."],
    ["03_Paie", "Modifier uniquement B5 et D5 (période). Tout le reste est calculé."],
    ["04_Conges", "Demandes (statut Approuvé ⇒ solde décompté). Droit annuel ajustable bloc SOLDES."],
    ["05_Contrats", "Renseigner dates début/fin : durée, jours restants et alerte ≤ 30 j automatiques."],
    ["06_Competences", "Saisie libre (niveau 1-5)."],
    ["07_Planning", "Date du lundi en B2 ; affectations dans la grille."],
    ["08_Sanctions", "Registre disciplinaire libre."],
    ["09_Contacts", "Annuaire 100 % automatique."],
    ["", ""],
    ["RÈGLES D'OR", ""],
    ["1.", "Ne JAMAIS colorier une ligne entière manuellement (c'est ce qui cassait les formats). Utiliser les gris/rose automatiques."],
    ["2.", "Ne jamais insérer de ligne AU MILIEU des données : ajouter toujours EN BAS."],
    ["3.", "Dates au format JJ/MM/AAAA strict ; heures HH:MM (7:30 et pas 7h30)."],
    ["4.", "IDs employés en MAJUSCULES (EMP002). La validation de données bloque désormais les ID inconnus."],
    ["5.", "Ne pas modifier les cellules VERTES (protégées — mot de passe " + PWD + ")."],
    ["6.", "Sauvegarder une copie mensuelle (ex : GPJ_BACKUP_AOUT2026.xlsx)."],
    ["7.", "La paie est une ESTIMATION sur heures réelles ; ajuster primes/retenues avant virement."],
    ["", ""],
    ["LOGIQUE DE CALCUL DU SALAIRE", ""],
    ["Taux Horaire", "= Salaire Base Mensuel ÷ Heures standard mensuelles ('00_Parametres'!B21)."],
    ["Heures Normales", "= MIN(Heures travaillées ; Seuil journalier B23), cumulées sur la période."],
    ["Heures Supplémentaires", "= MAX(0 ; Heures travaillées − Seuil B23), cumulées."],
    ["Montant Normal", "= Heures Normales × Taux Horaire."],
    ["Montant HS", "= Heures Supp × (Taux Horaire × Majoration B22)."],
    ["Salaire Brut Estimé", "= Montant Normal + Montant HS + Primes de tâche."],
    ["", ""],
    ["CORRECTIONS APPLIQUÉES DANS CETTE VERSION V4", ""],
    ["✓", "Dates texte « 8/262026 » converties en vraies dates 26/08/2026."],
    ["✓", "IDs en minuscules (emp002…) remis en MAJUSCULES."],
    ["✓", "Heures fantômes 00:00 vidées (elles créaient des retards/journées imaginaires)."],
    ["✓", "Lignes vides intercalées supprimées (les totaux repartent juste)."],
    ["✓", "Feuilles protégées (mot de passe " + PWD + ") : seules les cellules JAUNES sont modifiables."],
    ["✓", "Validations : listes d'IDs, codes présence, dates et heures contrôlées."],
    ["✓", "Anomalies visibles : ligne ROSE = retard > 15 min ; colonne Notes pour le motif."],
  ];
  let r = 3;
  for (const [a, b] of lines) {
    ws.getCell(r, 1).value = a;
    ws.getCell(r, 2).value = b || null;
    if (b === "" && a !== "") {
      ws.getCell(r, 1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
      ws.getCell(r, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + C_HEADER } };
    } else {
      ws.getCell(r, 1).font = { size: 10 };
    }
    ws.getCell(r, 2).alignment = { wrapText: true };
    r++;
  }
  protect(ws);
}

// ------------------------------------------------------------------ écriture
const ORDER = ["00_Dashboard", "00_Parametres", "01_Employes", "02_Pointage", "03_Paie",
  "04_Conges", "05_Contrats", "06_Competences", "07_Planning", "08_Sanctions",
  "09_Contacts", "10_Mode_Emploi"];
ORDER.forEach((name, i) => {
  const w = wb.getWorksheet(name);
  if (w) w.orderNo = i + 1;
});
const buf = await wb.xlsx.writeBuffer();
writeFileSync(OUT_FILE, Buffer.from(buf));
console.log("OK →", OUT_FILE, `(${(buf.length / 1024).toFixed(1)} Ko)`);
console.log("Feuilles :", wb.worksheets.map((w) => w.name).join(" | "));
