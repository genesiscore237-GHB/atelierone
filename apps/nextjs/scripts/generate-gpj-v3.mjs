/**
 * Générateur — Gestion_Personnel_GPJ_V3_PRO.xlsx
 * Reconstruction complète du fichier RH GPJ avec les protections de l'audit :
 *  - Formules robustes aux lignes vides (SI(ESTVIDE…)) sur 500 lignes pré-armées
 *  - Validations de données (dates JJ/MM/AAAA, heures HH:MM, listes déroulantes)
 *  - Cellules JAUNES = saisie (déverrouillées) / VERTES = calculées (verrouillées)
 *  - Protection de chaque feuille, mot de passe GPJ2026
 *  - Mise en forme conditionnelle (séparateurs gris, anomalies rouges, alertes contrats)
 *
 * NOTE : les formules sont stockées en syntaxe EN (canonique .xlsx) ;
 * Excel FR les affiche automatiquement traduites (SI, RECHERCHEV, SOMME.SI.ENS…).
 */
import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../../DOC/GPJ");
const OUT_FILE = resolve(OUT_DIR, "Gestion_Personnel_GPJ_V3_PRO.xlsx");
mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------- constantes
const PWD = "GPJ2026";
const C_YELLOW = "FFF2CC";
const C_GREEN = "C6EFCE";
const F_GREEN = "006100";
const C_HEADER = "305496";
const C_TITLE = "1F3864";
const C_GRAY = "D9D9D9";
const MAX_P = 25;        // 01_Employes : lignes 6..25
const PT_FIRST = 5;
const PT_LAST = 504;

const EMPLOYES = [
  ["EMP001", "Tsafack Ndongmo", "Symphonien", "Administrateur", "Administration", "CDI", 250000],
  ["EMP002", "Pandja Tchatchoua", "Syriane", "Secrétaire", "Administration", "CDI", 150000],
  ["EMP003", "Takoueta", "Yvan", "Chef des ateliers", "Direction Atelier", "CDI", 300000],
  ["EMP004", "Chekep", "Faustin", "Mécanicien", "Atelier Mécanique", "CDI", 180000],
  ["EMP005", "Abdou", "", "Tôlier", "Carrosserie", "Apprentissage", 80000],
  ["EMP006", "Nyontyen Si", "Jean Vinny", "Mécanicien", "Atelier Mécanique", "Apprentissage", 80000],
  ["EMP007", "Holé", "Homsala", "Magasinier", "Magasin", "Apprentissage", 80000],
  ["EMP008", "Ebene", "Ngono", "Mécanicien", "Atelier Mécanique", "Apprentissage", 80000],
  ["EMP009", "Tineba", "Vital Eric", "Mécanicien", "Atelier Mécanique", "Apprentissage", 80000],
  ["EMP010", "Deutchoua Tientcheu", "Christian", "Mécanicien", "Atelier Mécanique", "Apprentissage", 80000],
  ["EMP011", "Fouakouet", "Youssoufa", "Électronicien", "Atelier Mécanique", "Apprentissage", 80000],
  ["EMP012", "Ngouamera", "Adrien Gildas", "Mécanicien", "Atelier Mécanique", "Apprentissage", 80000],
  ["EMP013", "Nague Zemdjui", "Arnaud", "Assistant Administratif", "Administration", "CDD", 120000],
];
const TELEPHONES = {
  EMP001: ["677 89 71 62"], EMP002: ["656 04 71 31"], EMP003: ["657 78 99 78"],
  EMP004: ["672 67 18 01"], EMP005: ["673 84 48 12"], EMP006: ["694 36 28 38"],
  EMP007: ["699 47 09 80"], EMP008: ["653 04 86 11"], EMP009: ["698 14 24 06"],
  EMP010: ["695 07 89 78", "678 03 61 47"], EMP011: ["640 85 90 53", "620 04 32 29"],
  EMP012: ["680 09 48 64"], EMP013: ["658 77 57 44"],
};
const EMAILS = { EMP007: "holehomsala7@gmail.com", EMP013: "arnaudstars@gmail.com" };
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const CODES_PRESENCE = ["A", "R", "HS", "P", "C", "M", "F", "AJ", "AI"];
const POSTES_LISTE = ["Administrateur", "Secrétaire", "Chef des ateliers", "Mécanicien", "Tôlier",
  "Magasinier", "Électronicien", "Assistant Administratif", "Apprenti", "Autre"];
const DEPTS_LISTE = ["Administration", "Direction Atelier", "Atelier Mécanique", "Carrosserie",
  "Magasin", "Direction Générale"];
const STATUTS_LISTE = ["Actif", "Congé", "Suspendu", "Sorti"];
const CONTRATS_LISTE = ["CDI", "CDD", "Apprentissage", "Stage"];

const wb = new ExcelJS.Workbook();
wb.creator = "AtelierOne — reconstruction audit V3";

// ---------------------------------------------------------------- helpers
const title = (ws, text, span) => {
  ws.mergeCells(1, 1, 1, span);
  const c = ws.getCell(1, 1);
  c.value = text;
  c.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + C_TITLE } };
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 26;
};
const note = (ws, row, text, span, color6 = "FFF2CC") => {
  ws.mergeCells(row, 1, row, span);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { italic: true, size: 9.5 };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + color6 } };
  c.alignment = { wrapText: true, vertical: "top" };
};
const headerRow = (ws, row, headers, startCol = 1) => {
  headers.forEach((h, i) => {
    const c = ws.getCell(row, startCol + i);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + C_HEADER } };
    c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  ws.getRow(row).height = 30;
};
const styleRange = (ws, r1, c1, r2, c2, kind, numFmt) => {
  for (let r = r1; r <= r2; r++) for (let col = c1; col <= c2; col++) {
    const c = ws.getCell(r, col);
    if (kind === "yellow") {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + C_YELLOW } };
      c.style.protection = { locked: false };
      c.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "hair" }, right: { style: "hair" } };
    } else {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + C_GREEN } };
      c.font = { color: { argb: "FF" + F_GREEN } };
    }
    if (numFmt) c.numFmt = numFmt;
  }
};
const widths = (ws, w) => w.forEach((x, i) => (ws.getColumn(i + 1).width = x));
/** Protection structurelle : interdit insertion/suppression de lignes & colonnes,
 *  modification de formats ; autorise la sélection et le filtre. */
const protect = (ws) =>
  ws.protect(PWD, {
    formatCells: true, insertRows: true, insertColumns: true,
    deleteRows: true, deleteColumns: true, sort: true,
    selectLockedCells: false, selectUnlockedCells: false, autoFilter: false,
  });

// ============================================================ 00_Dashboard
{
  const ws = wb.addWorksheet("00_Dashboard", { views: [{ showGridLines: false }] });
  title(ws, "📊 TABLEAU DE BORD RH — GPJ (tout est automatique)", 8);
  ws.getCell("A2").value = new Date().toLocaleDateString("fr-FR") + " — données live depuis les autres feuilles";
  ws.getCell("A2").font = { italic: true, size: 9 };

  const KPI = [
    ["Effectif total", `COUNTIF('01_Employes'!$A$6:$A$${MAX_P},"EMP*")`, "0"],
    ["Dont CDI", `COUNTIF('01_Employes'!$G$6:$G$${MAX_P},"CDI")`, "0"],
    ["Dont Apprentissage", `COUNTIF('01_Employes'!$G$6:$G$${MAX_P},"Apprentissage")`, "0"],
    ["Masse salariale mensuelle (FCFA)", `SUM('01_Employes'!$H$6:$H$${MAX_P})`, "#,##0"],
    ["Pointages saisis aujourd'hui", `COUNTIFS('02_Pointage'!$A$5:$A$${PT_LAST},TODAY(),'02_Pointage'!$B$5:$B$${PT_LAST},"<>")`, "0"],
    ["Heures supp. du mois en cours", `SUMIFS('02_Pointage'!$K$5:$K$${PT_LAST},'02_Pointage'!$A$5:$A$${PT_LAST},">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))`, "0.0"],
    ["Coût HS du mois (FCFA)", `SUMIFS('02_Pointage'!$M$5:$M$${PT_LAST},'02_Pointage'!$A$5:$A$${PT_LAST},">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))`, "#,##0"],
    ["Contrats expirés / ≤ 30 j", `COUNTIF('05_Contrats'!$H$6:$H$35,"⚠ ≤ 30 j")+COUNTIF('05_Contrats'!$H$6:$H$35,"EXPIRÉ")`, "0"],
    ["Congés approuvés en cours", `COUNTIFS('04_Conges'!$G$6:$G$65,"Approuvé",'04_Conges'!$D$6:$D$65,"<="&TODAY(),'04_Conges'!$E$6:$E$65,">="&TODAY())`, "0"],
  ];
  let r = 4;
  for (const [label, f, fmt] of KPI) {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = { size: 11, bold: true };
    ws.mergeCells(r, 2, r, 4);
    const c = ws.getCell(r, 2);
    c.value = { formula: f };
    c.numFmt = fmt;
    c.font = { bold: true, size: 12, color: { argb: "FF" + F_GREEN } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + C_GREEN } };
    c.alignment = { horizontal: "center" };
    ws.getRow(r).height = 20;
    r += 2;
  }
  note(ws, r + 1,
    "RÈGLES D'OR : ne jamais colorier une ligne entière manuellement · ajouter les pointages EN BAS du tableau · " +
    "dates JJ/MM/AAAA · heures HH:MM · IDs en MAJUSCULES. En cas d'accroc : Révision > Ôter la protection (" +
    PWD + "), corriger, puis reprotéger — ou exécuter la macro « Correction_Complete_GPJ » (fichier MACRO_Correction_GPJ.bas fourni).",
    8, "FCE4D6");
  widths(ws, [34, 18, 10, 12]);
  protect(ws);
}

// ============================================================ 00_Parametres
{
  const ws = wb.addWorksheet("00_Parametres", { views: [{ showGridLines: false }] });
  title(ws, "⚙️ PARAMÈTRES GLOBAUX — modifier uniquement les cellules JAUNES", 13);
  note(ws, 2, "Les cellules VERTES sont des formules protégées. Mot de passe des feuilles : " + PWD + ".", 13);

  ws.getCell("A5").value = "HORAIRES HEBDOMADAIRES";
  ws.getCell("A5").font = { bold: true };
  headerRow(ws, 6, ["Jour", "Travaillé ?", "Début", "Fin", "Pause (h)", "Heures effectives"]);
  JOURS.forEach((j, i) => {
    const rr = 7 + i;
    ws.getCell(rr, 1).value = j;
    ws.getCell(rr, 2).value = i < 6 ? "Oui" : "Non";
    if (i < 6) {
      ws.getCell(rr, 3).value = 7.5 / 24;
      ws.getCell(rr, 4).value = 18 / 24;
      ws.getCell(rr, 5).value = 1;
      ws.getCell(rr, 6).value = { formula: `($D${rr}-$C${rr})*24-$E${rr}` };
    }
  });
  styleRange(ws, 7, 2, 13, 5, "yellow");
  styleRange(ws, 7, 6, 13, 6, "green", "0.00");
  for (let rr = 7; rr <= 13; rr++) { ws.getCell(rr, 3).numFmt = "hh:mm"; ws.getCell(rr, 4).numFmt = "hh:mm"; }

  ws.getCell("A16").value = "RÉSUMÉ SEMAINE"; ws.getCell("A16").font = { bold: true };
  ws.getCell("A17").value = "Jours travaillés / semaine";
  ws.getCell("B17").value = { formula: `COUNTIF(B7:B13,"Oui")` };
  ws.getCell("A18").value = "Heures normales / semaine";
  ws.getCell("B18").value = { formula: `SUM(F7:F13)` }; ws.getCell("B18").numFmt = "0.00";
  styleRange(ws, 17, 2, 18, 2, "green");

  ws.getCell("A21").value = "PARAMÈTRES DE CALCUL"; ws.getCell("A21").font = { bold: true };
  ws.getCell("A22").value = "Taux majoration heures supp.";
  ws.getCell("B22").value = 1.5; ws.getCell("B22").numFmt = "0.0";
  ws.getCell("A23").value = "Seuil HS journalier (h)";
  ws.getCell("B23").value = 9.5; ws.getCell("B23").numFmt = "0.0";
  ws.getCell("A24").value = "Heures normales / mois";
  ws.getCell("B24").value = { formula: `$B$17*$B$18*52/12` }; ws.getCell("B24").numFmt = "0.00";
  ws.getCell("A25").value = "Jours de congés annuels";
  ws.getCell("B25").value = 18;
  styleRange(ws, 22, 2, 23, 2, "yellow");
  styleRange(ws, 24, 2, 25, 2, "green");

  ws.getCell("A28").value = "RÈGLES DE COMPTABILISATION"; ws.getCell("A28").font = { bold: true };
  [
    "Au-delà de 9h30/jour → Heures Supplémentaires (majorées au taux ci-dessus).",
    "Codes C, M, F, AJ, AI : pas d'heures saisies ; la journée n'est pas comptée travaillée.",
    "Retards > 15 min signalés automatiquement (colonne S de Pointage).",
    "Les absences injustifiées (AI) génèrent une retenue dans 03_Paie.",
  ].forEach((t, i) => (ws.getCell(29 + i, 1).value = "• " + t));

  // Listes de référence (colonnes H..M)
  ws.getCell("H5").value = "POSTES"; ws.getCell("I5").value = "DÉPARTEMENTS";
  ws.getCell("J5").value = "STATUTS"; ws.getCell("K5").value = "CONTRATS";
  ws.getCell("L5").value = "CODES PRÉSENCE"; ws.getCell("M5").value = "OUI/NON";
  [5, 6].forEach(() => {});
  POSTES_LISTE.forEach((v, i) => (ws.getCell(6 + i, 8).value = v));
  DEPTS_LISTE.forEach((v, i) => (ws.getCell(6 + i, 9).value = v));
  STATUTS_LISTE.forEach((v, i) => (ws.getCell(6 + i, 10).value = v));
  CONTRATS_LISTE.forEach((v, i) => (ws.getCell(6 + i, 11).value = v));
  CODES_PRESENCE.forEach((v, i) => (ws.getCell(6 + i, 12).value = v));
  ["Oui", "Non"].forEach((v, i) => (ws.getCell(6 + i, 13).value = v));
  styleRange(ws, 6, 8, 15, 11, "yellow");
  styleRange(ws, 6, 12, 14, 13, "yellow");
  [5, 6, 7].forEach((col) => (ws.getCell(5, col).font = { bold: true }));
  [8, 9, 10, 11, 12, 13].forEach((col) => (ws.getCell(5, col).font = { bold: true }));

  widths(ws, [32, 12, 9, 9, 10, 17, 2, 22, 20, 12, 14, 16, 10]);
  protect(ws);
}

// ============================================================ 01_Employes
{
  const ws = wb.addWorksheet("01_Employes", { views: [{ state: "frozen", ySplit: 5 }] });
  title(ws, "👥 EMPLOYÉS — SOURCE DE VÉRITÉ (ajouter en BAS uniquement)", 17);
  note(ws, 2, "JAUNES à remplir · VERTES calculées. Ne jamais supprimer une ligne au milieu. " +
    "Lignes 19-25 libres pour les nouveaux employés (formules déjà armées).", 17);
  const H = ["ID", "Nom", "Prénom", "Poste", "Département", "Statut", "Type contrat",
    "Salaire mensuel", "Date embauche", "Téléphone 1", "Téléphone 2", "Email",
    "Taux horaire", "Ancienneté (ans)", "Congés dispo", "Notes", "Date sortie"];
  headerRow(ws, 5, H);
  widths(ws, [10, 21, 15, 21, 18, 11, 15, 15, 13, 14, 14, 27, 11, 13, 11, 24, 12]);

  for (let rr = 6; rr <= MAX_P; rr++) {
    const seed = EMPLOYES[rr - 6];
    if (seed) {
      const [id, nom, prenom, poste, dept, contrat, salaire] = seed;
      ws.getCell(rr, 1).value = id;
      ws.getCell(rr, 2).value = nom;
      ws.getCell(rr, 3).value = prenom || "";
      ws.getCell(rr, 4).value = poste;
      ws.getCell(rr, 5).value = dept;
      ws.getCell(rr, 6).value = "Actif";
      ws.getCell(rr, 7).value = contrat;
      ws.getCell(rr, 8).value = salaire;
      const tel = TELEPHONES[id] || [];
      if (tel[0]) ws.getCell(rr, 10).value = tel[0];
      if (tel[1]) ws.getCell(rr, 11).value = tel[1];
      if (EMAILS[id]) ws.getCell(rr, 12).value = EMAILS[id];
    }
    ws.getCell(rr, 13).value = { formula: `IF($H${rr}="","",ROUND($H${rr}/'00_Parametres'!$B$24,2))` };
    ws.getCell(rr, 14).value = { formula: `IF($I${rr}="","",ROUND((TODAY()-$I${rr})/365.25,1))` };
    ws.getCell(rr, 15).value = {
      formula: `IF($A${rr}="","",'00_Parametres'!$B$25-SUMIFS('04_Conges'!$F:$F,'04_Conges'!$A:$A,$A${rr},'04_Conges'!$G:$G,"Approuvé"))`,
    };
  }
  styleRange(ws, 6, 1, MAX_P, 12, "yellow");
  styleRange(ws, 6, 16, MAX_P, 17, "yellow");
  styleRange(ws, 6, 13, MAX_P, 15, "green");
  styleRange(ws, 6, 8, MAX_P, 8, "yellow", "#,##0");
  styleRange(ws, 6, 9, MAX_P, 9, "yellow", "dd/mm/yyyy");

  for (let rr = 6; rr <= MAX_P; rr++) {
    ws.getCell(rr, 4).dataValidation = { type: "list", allowBlank: true, formulae: ["='00_Parametres'!$H$6:$H$15"] };
    ws.getCell(rr, 5).dataValidation = { type: "list", allowBlank: true, formulae: ["='00_Parametres'!$I$6:$I$11"] };
    ws.getCell(rr, 6).dataValidation = { type: "list", allowBlank: true, formulae: ["='00_Parametres'!$J$6:$J$9"] };
    ws.getCell(rr, 7).dataValidation = { type: "list", allowBlank: true, formulae: ["='00_Parametres'!$K$6:$K$9"] };
    ws.getCell(rr, 8).dataValidation = { type: "whole", operator: "greaterThan", allowBlank: true, formulae: [0], errorTitle: "Salaire invalide", error: "Nombre entier SANS espace ni séparateur (ex : 80000)." };
    ws.getCell(rr, 9).dataValidation = { type: "date", operator: "lessThan", allowBlank: true, formulae: ["DATE(2100,1,1)"], errorTitle: "Date invalide", error: "Format JJ/MM/AAAA." };
  }
  protect(ws);
}

// ============================================================ 02_Pointage
{
  const ws = wb.addWorksheet("02_Pointage", { views: [{ state: "frozen", xSplit: 2, ySplit: 4 }] });
  title(ws, "🕐 POINTAGE QUOTIDIEN — saisir : Date · ID · Code · Arrivée · Départ", 21);
  note(ws, 2, "VERTES = automatique. Pour séparer deux jours : nouvelle ligne avec UNIQUEMENT la date en colonne A " +
    "(grisée automatiquement, ignorée par la paie). Codes : " + CODES_PRESENCE.join(", ") + ".", 21);
  const H = ["Date", "ID employé", "Nom & Prénom", "Jour", "Code", "Arrivée", "Départ",
    "Retard (min)", "H travaillées", "H normales", "H supp.", "Majoration", "Montant HS",
    "Statut jour", "Observations", "Saisi par", "Validé par", "Date validation",
    "Anomalies détectées", "Action conseillée", "État ligne"];
  headerRow(ws, 4, H);
  widths(ws, [11, 11, 23, 11, 7, 8, 8, 10, 11, 11, 9, 11, 13, 11, 22, 12, 12, 13, 30, 26, 12]);

  const P = "'00_Parametres'!";
  for (let rr = PT_FIRST; rr <= PT_LAST; rr++) {
    ws.getCell(rr, 3).value = {
      formula: `IF($B${rr}="","",IFERROR(VLOOKUP($B${rr},'01_Employes'!$A$6:$Q$${MAX_P},2,FALSE)&" "&VLOOKUP($B${rr},'01_Employes'!$A$6:$Q$${MAX_P},3,FALSE),"⚠ ID inconnu"))`,
    };
    ws.getCell(rr, 4).value = { formula: `IF($A${rr}="","",TEXT($A${rr},"dddd"))` };
    ws.getCell(rr, 8).value = {
      formula: `IF(OR($F${rr}="",$A${rr}=""),"",MAX(0,ROUND(($F${rr}-INDEX(${P}$C$7:$C$13,MATCH(TEXT($A${rr},"dddd"),${P}$A$7:$A$13,0)))*1440,0)))`,
    };
    ws.getCell(rr, 9).value = {
      formula: `IF(OR($F${rr}="",$G${rr}=""),"",MAX(0,($G${rr}-$F${rr})*24-INDEX(${P}$E$7:$E$13,MATCH(TEXT($A${rr},"dddd"),${P}$A$7:$A$13,0))))`,
    };
    ws.getCell(rr, 10).value = { formula: `IF($I${rr}="","",MIN($I${rr},${P}$B$23))` };
    ws.getCell(rr, 11).value = { formula: `IF($I${rr}="","",MAX(0,$I${rr}-${P}$B$23))` };
    ws.getCell(rr, 12).value = { formula: `IF(OR($K${rr}="",$K${rr}=0),"",${P}$B$22)` };
    ws.getCell(rr, 13).value = {
      formula: `IF(OR($K${rr}="",$K${rr}=0),"",ROUND($K${rr}*IFERROR(VLOOKUP($B${rr},'01_Employes'!$A$6:$Q$${MAX_P},13,FALSE),0)*${P}$B$22,0))`,
    };
    ws.getCell(rr, 14).value = {
      formula: `IF($A${rr}="","",IF(INDEX(${P}$B$7:$B$13,MATCH(TEXT($A${rr},"dddd"),${P}$A$7:$A$13,0))="Oui","Ouvrable","Repos"))`,
    };
    ws.getCell(rr, 19).value = {
      formula: `IF($A${rr}="","",TRIM(IF(AND(OR($E${rr}="A",$E${rr}="R",$E${rr}="P",$E${rr}="HS"),OR($F${rr}="",$G${rr}="")),"Arrivée/Départ manquants ; ","")&IF(AND(ISNUMBER($I${rr}),$I${rr}<0),"Durée négative ; ","")&IF(AND(ISNUMBER($H${rr}),$H${rr}>15),"Retard > 15 min ; ","")&IF($C${rr}="⚠ ID inconnu","ID absent de 01_Employes ; ","")))`,
    };
    ws.getCell(rr, 20).value = {
      formula: `IF($A${rr}="","",TRIM(IF(AND($N${rr}="Repos",$E${rr}=""),"Saisir un code absence (C/M/F/AJ/AI)","")&IF($S${rr}<>""," | Corriger colonne S","")))`,
    };
    ws.getCell(rr, 21).value = { formula: `IF($A${rr}="","",IF($S${rr}="","✓ OK","À corriger"))` };
  }
  styleRange(ws, PT_FIRST, 1, PT_LAST, 2, "yellow");
  styleRange(ws, PT_FIRST, 5, PT_LAST, 7, "yellow");
  styleRange(ws, PT_FIRST, 15, PT_LAST, 18, "yellow");
  styleRange(ws, PT_FIRST, 3, PT_LAST, 4, "green");
  styleRange(ws, PT_FIRST, 8, PT_LAST, 14, "green");
  styleRange(ws, PT_FIRST, 19, PT_LAST, 21, "green");
  styleRange(ws, PT_FIRST, 1, PT_LAST, 1, "yellow", "dd/mm/yyyy");
  styleRange(ws, PT_FIRST, 6, PT_LAST, 7, "yellow", "hh:mm");
  [9, 10, 11].forEach((c) => styleRange(ws, PT_FIRST, c, PT_LAST, c, "green", "0.00"));
  styleRange(ws, PT_FIRST, 12, PT_LAST, 12, "green", "0.0");
  styleRange(ws, PT_FIRST, 13, PT_LAST, 13, "green", "#,##0");
  styleRange(ws, PT_FIRST, 18, PT_LAST, 18, "yellow", "dd/mm/yyyy");

  for (let rr = PT_FIRST; rr <= PT_LAST; rr++) {
    ws.getCell(rr, 1).dataValidation = {
      type: "date", operator: "between", allowBlank: true,
      formulae: ["DATE(2024,1,1)", "DATE(2100,12,31)"],
      errorTitle: "Date invalide", error: "Saisir une vraie date au format JJ/MM/AAAA (pas 8/262026 !).",
    };
    ws.getCell(rr, 2).dataValidation = {
      type: "list", allowBlank: true, formulae: [`='01_Employes'!$A$6:$A$${MAX_P}`],
      errorTitle: "ID inconnu", error: "Choisir un ID existant dans 01_Employes.",
    };
    ws.getCell(rr, 5).dataValidation = { type: "list", allowBlank: true, formulae: ["='00_Parametres'!$L$6:$L$14"] };
  }

  ws.addConditionalFormatting({
    ref: `A${PT_FIRST}:U${PT_LAST}`, priority: 1,
    rules: [{
      type: "expression", priority: 1,
      formulae: [`AND($A${PT_FIRST}<>"",$B${PT_FIRST}="")`],
      style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FF" + C_GRAY } }, font: { italic: true, bold: true } },
    }],
  });
  ws.addConditionalFormatting({
    ref: `A${PT_FIRST}:U${PT_LAST}`, priority: 2,
    rules: [{
      type: "expression", priority: 2,
      formulae: [`AND($A${PT_FIRST}<>"",$S${PT_FIRST}<>"")`],
      style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFF4CCCC" } } },
    }],
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 21 } };
  protect(ws);
}

// ============================================================ 03_Paie
{
  const ws = wb.addWorksheet("03_Paie", { views: [{ state: "frozen", ySplit: 13 }] });
  title(ws, "💰 PAIE DU MOIS — tout est automatique sauf Primes / Avances / Mode / Signature", 14);
  ws.getCell("A3").value = "Période du :";
  ws.getCell("B3").value = new Date(Date.UTC(2026, 7, 1));
  ws.getCell("C3").value = "au:";
  ws.getCell("D3").value = new Date(Date.UTC(2026, 7, 31));
  styleRange(ws, 3, 2, 3, 2, "yellow", "dd/mm/yyyy");
  styleRange(ws, 3, 4, 3, 4, "yellow", "dd/mm/yyyy");
  note(ws, 5, "NET = Salaire base + Montant HS + Primes − Retenue AI − Avances. " +
    "Retenue AI = nb d'absences injustifiées × 9,5 h × taux horaire.", 14);

  ws.getCell("A9").value = "SYNTHÈSE"; ws.getCell("A9").font = { bold: true };
  ws.getCell("A10").value = "Effectif payé";
  ws.getCell("B10").value = { formula: `COUNTIF($A$15:$A$28,"<>-")` };
  ws.getCell("A11").value = "Masse salariale nette";
  ws.getCell("B11").value = { formula: `$L$29` };
  ws.getCell("D10").value = "Total HS payées";
  ws.getCell("E10").value = { formula: `$G$29` };
  ws.getCell("B11").numFmt = "#,##0"; ws.getCell("E10").numFmt = "#,##0";

  const H = ["ID", "Nom & Prénom", "Jours présents", "HN totales", "HS totales", "Taux horaire",
    "Montant HS", "Salaire base", "Retenue AI", "Primes", "Avances", "NET À PAYER",
    "Mode paiement", "Signature"];
  headerRow(ws, 14, H);
  widths(ws, [10, 26, 11, 11, 11, 12, 13, 13, 12, 12, 12, 15, 15, 16]);

  const PT = "'02_Pointage'!", E = "'01_Employes'!";
  for (let i = 0; i < 14; i++) {           // lignes 15..28 (13 employés + 1 libre)
    const rr = 15 + i, er = 6 + i;
    ws.getCell(rr, 1).value = { formula: `IF(${E}A${er}="","-",${E}A${er})` };
    ws.getCell(rr, 2).value = {
      formula: `IF($A${rr}="-","",$A${rr}&": "&IFERROR(VLOOKUP($A${rr},${E}$A$6:$Q$${MAX_P},2,FALSE)&" "&VLOOKUP($A${rr},${E}$A$6:$Q$${MAX_P},3,FALSE),"?"))`,
    };
    ws.getCell(rr, 3).value = {
      formula: `IF($A${rr}="-","",COUNTIFS(${PT}$B:$B,$A${rr},${PT}$A:$A,">="&$B$3,${PT}$A:$A,"<="&$D$3,${PT}$I:$I,">0"))`,
    };
    ws.getCell(rr, 4).value = {
      formula: `IF($A${rr}="-","",SUMIFS(${PT}$J:$J,${PT}$B:$B,$A${rr},${PT}$A:$A,">="&$B$3,${PT}$A:$A,"<="&$D$3))`,
    };
    ws.getCell(rr, 5).value = {
      formula: `IF($A${rr}="-","",SUMIFS(${PT}$K:$K,${PT}$B:$B,$A${rr},${PT}$A:$A,">="&$B$3,${PT}$A:$A,"<="&$D$3))`,
    };
    ws.getCell(rr, 6).value = { formula: `IF($A${rr}="-","",IFERROR(VLOOKUP($A${rr},${E}$A$6:$Q$${MAX_P},13,FALSE),0))` };
    ws.getCell(rr, 7).value = { formula: `IF($A${rr}="-","",ROUND($E${rr}*$F${rr}*'00_Parametres'!$B$22,0))` };
    ws.getCell(rr, 8).value = { formula: `IF($A${rr}="-","",IFERROR(VLOOKUP($A${rr},${E}$A$6:$Q$${MAX_P},8,FALSE),0))` };
    ws.getCell(rr, 9).value = {
      formula: `IF($A${rr}="-","",COUNTIFS(${PT}$B:$B,$A${rr},${PT}$A:$A,">="&$B$3,${PT}$A:$A,"<="&$D$3,${PT}$E:$E,"AI")*$F${rr}*'00_Parametres'!$B$23)`,
    };
    ws.getCell(rr, 12).value = { formula: `IF($A${rr}="-","",$H${rr}+$G${rr}+$J${rr}-$I${rr}-$K${rr})` };
    ws.getCell(rr, 13).dataValidation = { type: "list", allowBlank: true, formulae: ['"Espèces,Orange Money,MTN MoMo,Virement"]' };
  }
  ws.getCell("A29").value = "TOTAUX";
  ["C", "D", "E", "G", "H", "I", "J", "K", "L"].forEach((c) => (ws.getCell(`${c}29`).value = { formula: `SUM(${c}15:${c}28)` }));
  ws.getRow(29).font = { bold: true };

  styleRange(ws, 15, 1, 28, 9, "green");
  styleRange(ws, 15, 12, 28, 12, "green");
  styleRange(ws, 15, 10, 28, 11, "yellow", "#,##0");
  styleRange(ws, 15, 13, 28, 14, "yellow");
  [3, 4, 5].forEach((c) => styleRange(ws, 15, c, 28, c, "green", "0.00"));
  for (let rr = 15; rr <= 28; rr++) {
    ws.getCell(rr, 6).numFmt = "#,##0.00";
    [7, 8, 9].forEach((c) => (ws.getCell(rr, c).numFmt = "#,##0"));
    ws.getCell(rr, 12).numFmt = "#,##0";
  }
  styleRange(ws, 29, 3, 29, 12, "green", "#,##0");
  protect(ws);
}

// ============================================================ 04_Conges
{
  const ws = wb.addWorksheet("04_Conges", { views: [{ state: "frozen", ySplit: 5 }] });
  title(ws, "🏖️ CONGÉS — une demande par ligne (statut Approuvé ⇒ solde décompté)", 10);
  const H = ["ID", "Nom & Prénom", "Type", "Début", "Fin", "Jours décomptés", "Statut",
    "Solde avant", "Solde restant", "Motif / Observations"];
  headerRow(ws, 5, H);
  widths(ws, [10, 24, 13, 11, 11, 13, 12, 11, 12, 30]);
  for (let rr = 6; rr <= 65; rr++) {
    ws.getCell(rr, 2).value = {
      formula: `IF($A${rr}="","",IFERROR(VLOOKUP($A${rr},'01_Employes'!$A$6:$Q$${MAX_P},2,FALSE)&" "&VLOOKUP($A${rr},'01_Employes'!$A$6:$Q$${MAX_P},3,FALSE),"⚠ ID inconnu"))`,
    };
    ws.getCell(rr, 6).value = { formula: `IF(OR($D${rr}="",$E${rr}=""),"",NETWORKDAYS($D${rr},$E${rr}))` };
    ws.getCell(rr, 9).value = { formula: `IF($A${rr}="","",IF($G${rr}="Approuvé",$H${rr}-$F${rr},$H${rr}))` };
  }
  styleRange(ws, 6, 1, 65, 1, "yellow");
  styleRange(ws, 6, 3, 65, 5, "yellow", "dd/mm/yyyy");
  styleRange(ws, 6, 7, 65, 8, "yellow");
  styleRange(ws, 6, 10, 65, 10, "yellow");
  styleRange(ws, 6, 2, 65, 2, "green");
  styleRange(ws, 6, 6, 65, 6, "green", "0");
  styleRange(ws, 6, 9, 65, 9, "green", "0");
  for (let rr = 6; rr <= 65; rr++) {
    ws.getCell(rr, 1).dataValidation = { type: "list", allowBlank: true, formulae: [`='01_Employes'!$A$6:$A$${MAX_P}`] };
    ws.getCell(rr, 3).dataValidation = { type: "list", allowBlank: true, formulae: ['"Annuel,Maladie,Maternité,Sans solde,Exceptionnel"]' };
    ws.getCell(rr, 7).dataValidation = { type: "list", allowBlank: true, formulae: ['"En attente,Approuvé,Refusé"]' };
  }
  protect(ws);
}

// ============================================================ 05_Contrats
{
  const ws = wb.addWorksheet("05_Contrats", { views: [{ state: "frozen", ySplit: 5 }] });
  title(ws, "📄 CONTRATS — alerte automatique 30 jours avant échéance", 9);
  const H = ["ID", "Nom & Prénom", "Type contrat", "Poste actuel", "Date début", "Date fin",
    "Jours restants", "Alerte", "Notes"];
  headerRow(ws, 5, H);
  widths(ws, [10, 24, 14, 21, 11, 11, 12, 12, 26]);
  for (let rr = 6; rr <= 35; rr++) {
    ws.getCell(rr, 2).value = {
      formula: `IF($A${rr}="","",IFERROR(VLOOKUP($A${rr},'01_Employes'!$A$6:$Q$${MAX_P},2,FALSE)&" "&VLOOKUP($A${rr},'01_Employes'!$A$6:$Q$${MAX_P},3,FALSE),"⚠ ID inconnu"))`,
    };
    ws.getCell(rr, 4).value = { formula: `IF($A${rr}="","",IFERROR(VLOOKUP($A${rr},'01_Employes'!$A$6:$Q$${MAX_P},4,FALSE),""))` };
    ws.getCell(rr, 7).value = { formula: `IF($F${rr}="","",$F${rr}-TODAY())` };
    ws.getCell(rr, 8).value = { formula: `IF($G${rr}="","",IF($G${rr}<0,"EXPIRÉ",IF($G${rr}<=30,"⚠ ≤ 30 j","OK")))` };
  }
  styleRange(ws, 6, 1, 35, 1, "yellow");
  styleRange(ws, 6, 3, 35, 3, "yellow");
  styleRange(ws, 6, 5, 35, 6, "yellow", "dd/mm/yyyy");
  styleRange(ws, 6, 9, 35, 9, "yellow");
  styleRange(ws, 6, 2, 35, 4, "green");
  styleRange(ws, 6, 7, 35, 8, "green");
  for (let rr = 6; rr <= 35; rr++) {
    ws.getCell(rr, 7).numFmt = "0";
    ws.getCell(rr, 1).dataValidation = { type: "list", allowBlank: true, formulae: [`='01_Employes'!$A$6:$A$${MAX_P}`] };
  }
  ws.addConditionalFormatting({
    ref: "A6:I35", priority: 1,
    rules: [{ type: "expression", priority: 1, formulae: ['$H6="EXPIRÉ"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFF4CCCC" } } } }],
  });
  ws.addConditionalFormatting({
    ref: "A6:I35", priority: 2,
    rules: [{ type: "expression", priority: 2, formulae: ['$H6="⚠ ≤ 30 j"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFE699" } } } }],
  });
  protect(ws);
}

// ============================================================ 06_Competences
{
  const ws = wb.addWorksheet("06_Competences", { views: [{ state: "frozen", xSplit: 2, ySplit: 5 }] });
  title(ws, "🎓 CARTOGRAPHIE DES COMPÉTENCES — 1=Débutant … 4=Expert", 12);
  const COMP = ["Moteur", "Transmission", "Électricité auto", "Diagnostic électro.",
    "Carrosserie/tôlerie", "Peinture", "Pneumatiques", "Climatisation",
    "Magasin/stocks", "Relation client"];
  headerRow(ws, 5, ["ID", "Employé", ...COMP]);
  widths(ws, [10, 24, ...COMP.map(() => 13)]);
  for (let i = 0; i < 14; i++) {
    const rr = 6 + i, er = 6 + i;
    ws.getCell(rr, 1).value = { formula: `IF('01_Employes'!A${er}="","",'01_Employes'!A${er})` };
    ws.getCell(rr, 2).value = {
      formula: `IF($A${rr}="","",IFERROR(VLOOKUP($A${rr},'01_Employes'!$A$6:$Q$${MAX_P},2,FALSE)&" "&VLOOKUP($A${rr},'01_Employes'!$A$6:$Q$${MAX_P},3,FALSE),""))`,
    };
  }
  styleRange(ws, 6, 1, 19, 2, "green");
  styleRange(ws, 6, 3, 19, 12, "yellow");
  for (let rr = 6; rr <= 19; rr++)
    for (let cc = 3; cc <= 12; cc++)
      ws.getCell(rr, cc).dataValidation = { type: "list", allowBlank: true, formulae: ['"1,2,3,4"'] };
  ws.getCell("A21").value = "Légende : 1 Débutant · 2 Intermédiaire · 3 Confirmé · 4 Expert";
  ws.getCell("A21").font = { italic: true };
  protect(ws);
}

// ============================================================ 07_Planning
{
  const ws = wb.addWorksheet("07_Planning", { views: [{ state: "frozen", xSplit: 2, ySplit: 5 }] });
  title(ws, "📅 PLANNING HEBDO — saisir la date du LUNDI en B2, affectations dans la grille", 9);
  ws.getCell("A2").value = "Semaine du lundi :";
  ws.getCell("B2").value = new Date(Date.UTC(2026, 7, 24));
  styleRange(ws, 2, 2, 2, 2, "yellow", "dd/mm/yyyy");
  headerRow(ws, 5 - 1, [], 1); // no-op garde-fou
  const H = ["ID", "Employé", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  headerRow(ws, 4, H);
  for (let j = 0; j < 7; j++) {
    const c = ws.getCell(4, 3 + j);
    c.value = { formula: `TEXT($B$2+${j},"dd/mm")` };
  }
  for (let i = 0; i < 14; i++) {
    const rr = 6 + i, er = 6 + i;
    ws.getCell(rr, 1).value = { formula: `IF('01_Employes'!A${er}="","",'01_Employes'!A${er})` };
    ws.getCell(rr, 2).value = {
      formula: `IF($A${rr}="","",IFERROR(VLOOKUP($A${rr},'01_Employes'!$A$6:$Q$${MAX_P},2,FALSE)&" "&VLOOKUP($A${rr},'01_Employes'!$A$6:$Q$${MAX_P},3,FALSE),""))`,
    };
  }
  styleRange(ws, 6, 1, 19, 2, "green");
  styleRange(ws, 6, 3, 19, 9, "yellow");
  ws.addConditionalFormatting({
    ref: "I6:I19", priority: 1,
    rules: [{ type: "expression", priority: 1, formulae: ['$I6<>""'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFEAD1DC" } } } }],
  });
  note(ws, 21, "Astuce : codes tâches courts (ex : OR-104, Réception, Magasin). Colonne Dim en rose = repos hebdomadaire.", 9);
  widths(ws, [10, 24, 14, 14, 14, 14, 14, 14, 14]);
  protect(ws);
}

// ============================================================ 08_Sanctions
{
  const ws = wb.addWorksheet("08_Sanctions", { views: [{ state: "frozen", ySplit: 5 }] });
  title(ws, "⚠️ REGISTRE DISCIPLINAIRE — saisie libre", 8);
  const H = ["Date", "ID", "Nom & Prénom", "Type", "Motif", "Durée / Mesure", "Décision", "Observations"];
  headerRow(ws, 5, H);
  widths(ws, [11, 10, 24, 19, 30, 14, 20, 26]);
  for (let rr = 6; rr <= 45; rr++) {
    ws.getCell(rr, 3).value = {
      formula: `IF($B${rr}="","",IFERROR(VLOOKUP($B${rr},'01_Employes'!$A$6:$Q$${MAX_P},2,FALSE)&" "&VLOOKUP($B${rr},'01_Employes'!$A$6:$Q$${MAX_P},3,FALSE),"⚠ ID inconnu"))`,
    };
    ws.getCell(rr, 4).dataValidation = { type: "list", allowBlank: true, formulae: ['"Avertissement verbal,Avertissement écrit,Mise à pied,Suspension,Rappel à l\'ordre,Autre"]' };
  }
  styleRange(ws, 6, 1, 45, 1, "yellow", "dd/mm/yyyy");
  styleRange(ws, 6, 2, 45, 2, "yellow");
  styleRange(ws, 6, 4, 45, 8, "yellow");
  styleRange(ws, 6, 3, 45, 3, "green");
  protect(ws);
}

// ============================================================ 09_Contacts
{
  const ws = wb.addWorksheet("09_Contacts", { views: [{ state: "frozen", ySplit: 5 }] });
  title(ws, "📞 ANNUAIRE — 100 % automatique depuis 01_Employes (ne rien saisir)", 7);
  const H = ["#", "ID", "Nom & Prénom", "Poste", "Téléphone 1", "Téléphone 2", "Email"];
  headerRow(ws, 5, H);
  widths(ws, [5, 10, 26, 21, 15, 15, 28]);
  for (let i = 0; i < 20; i++) {
    const rr = 6 + i, er = 6 + i;
    ws.getCell(rr, 1).value = { formula: `IF('01_Employes'!A${er}="", "", ${i + 1})` };
    ws.getCell(rr, 2).value = { formula: `IF('01_Employes'!A${er}="","",'01_Employes'!A${er})` };
    ws.getCell(rr, 3).value = {
      formula: `IF($B${rr}="","",IFERROR(VLOOKUP($B${rr},'01_Employes'!$A$6:$Q$${MAX_P},2,FALSE)&" "&VLOOKUP($B${rr},'01_Employes'!$A$6:$Q$${MAX_P},3,FALSE),""))`,
    };
    ws.getCell(rr, 4).value = { formula: `IF($B${rr}="","",IFERROR(VLOOKUP($B${rr},'01_Employes'!$A$6:$Q$${MAX_P},4,FALSE),""))` };
    ws.getCell(rr, 5).value = { formula: `IF($B${rr}="","",IFERROR(VLOOKUP($B${rr},'01_Employes'!$A$6:$Q$${MAX_P},10,FALSE),""))` };
    ws.getCell(rr, 6).value = { formula: `IF($B${rr}="","",IFERROR(VLOOKUP($B${rr},'01_Employes'!$A$6:$Q$${MAX_P},11,FALSE),""))` };
    ws.getCell(rr, 7).value = { formula: `IF($B${rr}="","",IFERROR(VLOOKUP($B${rr},'01_Employes'!$A$6:$Q$${MAX_P},12,FALSE),""))` };
  }
  styleRange(ws, 6, 1, 25, 7, "green");
  protect(ws);
}

// ---------------------------------------------------------------- écriture
const buf = await wb.xlsx.writeBuffer();
writeFileSync(OUT_FILE, Buffer.from(buf));
console.log("OK →", OUT_FILE, `(${(buf.length / 1024).toFixed(1)} Ko)`);
console.log("Feuilles :", wb.worksheets.map((w) => w.name).join(" | "));
