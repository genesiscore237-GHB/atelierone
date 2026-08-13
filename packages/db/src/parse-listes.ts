import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC = path.resolve(__dirname, "../../../DOC/liste manuels scolaires");
const OUT = path.resolve(__dirname, "../data/manuels-officiels.json");

const FILES: { file: string; source: string; ministere: string; annee: string; sousSysteme: string; filiere: string | null }[] = [
  { file: "Liste_Officielle_MINEDUB_2025-2026_Complete.md", source: "MINEDUB-2025-2026", ministere: "MINEDUB", annee: "2025-2026", sousSysteme: "MIX", filiere: null },
  { file: "Liste_Officielle_MINESEC_ESGF_2026-2027_Complete.md", source: "ESGF-2026-2027", ministere: "MINESEC", annee: "2026-2027", sousSysteme: "FR", filiere: "GEN" },
  { file: "Liste_Officielle_MINESEC_STT_2025-2026_Complete.md", source: "STT-2025-2026", ministere: "MINESEC", annee: "2025-2026", sousSysteme: "FR", filiere: "TECH" },
  { file: "Liste_Officielle_MINESEC_STVE_TST_2025-2026_Complete.md", source: "STVE-TST-2025-2026", ministere: "MINESEC", annee: "2025-2026", sousSysteme: "EN", filiere: "TECH" },
  { file: "Liste_Officielle_MINESEC_Industrial_Education_Anglophone_2025-2026_Complete.md", source: "INDUSTRIAL-2025-2026", ministere: "MINESEC", annee: "2025-2026", sousSysteme: "EN", filiere: "TECH" },
];

const CLASSE_NORMALIZERS: [RegExp, string][] = [
  [/^nursery\s*1$/i, "N1"], [/^nursery\s*2$/i, "N2"], [/^nursery\s*3$/i, "N3"],
  [/^maternelle\s*1/i, "PS"], [/^maternelle\s*2/i, "MS"], [/^maternelle\s*3/i, "GS"],
  [/^class\s*i$/i, "C1"], [/^class\s*ii$/i, "C2"], [/^class\s*iii$/i, "C3"],
  [/^class\s*iv$/i, "C4"], [/^class\s*v$/i, "C5"], [/^class\s*vi$/i, "C6"],
  [/^sil$/i, "SIL"], [/^cp$/i, "CP"], [/^ce\s*1$/i, "CE1"], [/^ce\s*2$/i, "CE2"],
  [/^cm\s*1$/i, "CM1"], [/^cm\s*2$/i, "CM2"],
  [/^6[èe]me$/i, "6e"], [/^5[èe]me$/i, "5e"], [/^4[èe]me$/i, "4e"], [/^3[èe]me$/i, "3e"],
  [/^2[èe]me$/i, "5e"],
  [/^2nde/i, "2NDE"], [/^1[èe]re/i, "1ERE"], [/^terminal/i, "TLE"], [/^tle$/i, "TLE"],
  [/^form\s*one$/i, "FORM1"], [/^form\s*two$/i, "FORM2"], [/^form\s*three$/i, "FORM3"],
  [/^form\s*four/i, "FORM4"], [/^form\s*five/i, "FORM5"],
  [/^lower\s*\/\s*upper\s*sixth/i, "L6"], [/^upper\s*sixth/i, "U6"], [/^lower\s*sixth/i, "L6"],
  [/^1[èe]re\s*ann/i, "6e"], [/^2[èe]me\s*ann/i, "5e"], [/^3[èe]me\s*ann/i, "4e"], [/^4[èe]me\s*ann/i, "3e"],
];

function normClasse(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, " ");
  for (const [re, code] of CLASSE_NORMALIZERS) {
    if (re.test(s)) return code;
  }
  if (/ann[eè]e/.test(s)) {
    const m = s.match(/([1-4])[èe]re\s*ann[eè]e/i);
    if (m) return ["6e", "5e", "4e", "3e"][Number(m[1]) - 1] ?? null;
  }
  if (/ann[eè]e/.test(s)) return null;
  const m = s.match(/(Nursery\s*\d|Maternelle\s*\d|CLASS\s*(?:I|II|III|IV|V|VI)|SIL|CP|CE\s*\d|CM\s*\d|Form\s*(?:One|Two|Three|Four|Five)?|Lower\s*\/\s*Upper\s*Sixth|6[èe]me|5[èe]me|4[èe]me|3[èe]me|2nde|1[èe]res?|Terminales?|Tle)/i);
  if (!m) return null;
  for (const [re, code] of CLASSE_NORMALIZERS) {
    if (re.test(m[1])) return code;
  }
  return null;
}

function parsePrice(raw: string): number | null {
  const s = raw.replace(/\u00A0/g, " ").trim();
  if (!s || s === "-" || s === "…") return null;
  const first = s.split("/")[0].trim();
  const m = first.match(/[\d][\d\s.,]*/);
  if (!m) return null;
  const num = Number(m[0].replace(/[\s.]/g, "").replace(",", "."));
  return Number.isFinite(num) && num > 0 ? num : null;
}

interface RawRow {
  source: string;
  ministere: string;
  annee: string;
  sousSysteme: string;
  filiere: string | null;
  classe: string | null;
  classeRaw: string | null;
  matiere: string | null;
  titre: string;
  auteurs: string | null;
  editeur: string | null;
  prix: number | null;
}

function parseFile(cfg: (typeof FILES)[number]): RawRow[] {
  const text = fs.readFileSync(path.join(SRC, cfg.file), "utf-8");
  const lines = text.split(/\r?\n/);
  const rows: RawRow[] = [];
  let sectionClass: string | null = null;
  let header: string[] | null = null;

  const colIndex = (names: string[]) => {
    if (!header) return undefined;
    for (const n of names) {
      const i = header.findIndex((h) => h.toLowerCase().includes(n));
      if (i >= 0) return i;
    }
    return undefined;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^#{2,4}\s+/.test(trimmed)) {
      const code = normClasse(trimmed);
      if (code) sectionClass = trimmed;
      continue;
    }
    if (!trimmed.startsWith("|")) continue;

    const cells = trimmed.split("|").slice(1, -1).map((c) => c.trim());

    if (cells.every((c) => /^:?-+:?$/.test(c))) {
      continue; // ligne de séparation
    }

    const joined = cells.join(" ").toLowerCase();
    const isHeader = (joined.includes("titre") || joined.includes("title")) &&
      (joined.includes("prix") || joined.includes("price")) &&
      !/^[\d]/.test(cells[0]);

    if (isHeader) {
      header = cells;
      continue;
    }
    if (!header) continue;

    const iTitre = colIndex(["titre"]) ?? colIndex(["title"]);
    if (iTitre === undefined) continue;
    const titre = cells[iTitre] ?? "";
    if (!titre || titre === "-") continue;
    const iPrix = colIndex(["prix", "price"]);
    const prix = parsePrice(cells[iPrix ?? 0] ?? "");
    if (!prix) continue;

    const iClasse = colIndex(["classe", "class"]);
    const iMatiere = colIndex(["matière", "matiere", "subject", "related professional subjects"]);
    const iEditeur = colIndex(["éditeur", "editeur", "publisher"]);
    const iAuteur = colIndex(["auteur", "author"]);

    let classeRaw: string | null = iClasse !== undefined ? cells[iClasse] : null;
    if (iClasse !== undefined && cells[iClasse] === "All") {
      // colonne classe présente mais vide de sens (ex: "All") => classe de section
      classeRaw = null;
    }
    if (!classeRaw && sectionClass) classeRaw = sectionClass;

    const editeur = iEditeur !== undefined ? cells[iEditeur] : null;
    if (!editeur || editeur === "-") continue;

    rows.push({
      source: cfg.source,
      ministere: cfg.ministere,
      annee: cfg.annee,
      sousSysteme: cfg.sousSysteme,
      filiere: cfg.filiere,
      classe: classeRaw ? normClasse(classeRaw) : null,
      classeRaw,
      matiere: iMatiere !== undefined ? cells[iMatiere] || null : null,
      titre,
      auteurs: iAuteur !== undefined ? cells[iAuteur] || null : null,
      editeur,
      prix,
    });
  }
  return rows;
}

let all: RawRow[] = [];
for (const f of FILES) {
  const rows = parseFile(f);
  console.log(`${f.source}: ${rows.length} lignes`);
  all = all.concat(rows);
}

const noClasse = all.filter((r) => !r.classe);
const noEditeur = all.filter((r) => !r.editeur);
const noMatiere = all.filter((r) => !r.matiere);
console.log(`\nTotal: ${all.length}`);
console.log(`Sans classe normalisée: ${noClasse.length}`);
for (const r of noClasse.slice(0, 25)) console.log(`  [${r.source}] "${r.classeRaw}" | ${r.titre.slice(0, 60)}`);
console.log(`Sans matière: ${noMatiere.length}`);
for (const r of noMatiere.slice(0, 10)) console.log(`  [${r.source}] "${r.titre.slice(0, 60)}"`);

const matieres = new Set<string>();
for (const r of all) if (r.matiere) matieres.add(r.matiere);
console.log(`\nMatières distinctes (${matieres.size}):`);
for (const m of [...matieres].sort()) console.log("  " + m);

const editeurs = new Set<string>();
for (const r of all) if (r.editeur) editeurs.add(r.editeur);
console.log(`\nÉditeurs distincts (${editeurs.size}):`);
for (const e of [...editeurs].sort()) console.log("  " + e);

fs.writeFileSync(OUT, JSON.stringify(all, null, 2), "utf-8");
console.log(`\nÉcrit: ${OUT}`);
