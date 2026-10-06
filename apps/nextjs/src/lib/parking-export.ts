/**
 * Generation des exports du registre vehicules.
 *
 * Tout se passe DANS LE NAVIGATEUR, volontairement : les photos sont stockees
 * en data URI (jusqu'a 6 Mo chacune) et un envoi serveur seraitRejected par la
 * limite de taille de reponse des fonctions serverless. Le navigateur a
 * directement les donnees, evite un aller-retour de plusieurs dizaines de Mo et
 * permet de telecharger le fichier sans jamais l'ecrire sur le serveur.
 *
 * Les bibliotheques lourdes (exceljs, jspdf) sont chargees dynamiquement : elles
 * ne pèsent pas sur le bundle initial d'un utilisateur qui n'exporte jamais.
 */

import {
  CHAMPS_EXPORT_VEHICULE,
  getChampExport,
  nomFichierExport,
  reduirePhoto,
  telechargerBlob,
  type ChampExportVehicule,
  type FormatExport,
} from "~/app/(dashboard)/dashboard/garage/_components/export-champs";

/** Forme d'une ligne retournee par `garage.exportVehicules`. */
export interface LigneExportVehicule {
  id: number;
  numRegistre: number;
  immatriculation: string | null;
  marque: string | null;
  modele: string | null;
  version: string | null;
  couleur: string | null;
  vin: string | null;
  clientNom: string | null;
  clientTelephone: string | null;
  statut: string;
  motif: string | null;
  provenance: string | null;
  centreX: number | null;
  centreY: number | null;
  rotation: number | null;
  longueur: number | null;
  largeur: number | null;
  hauteur: number | null;
  poids: number | null;
  dimensionsEstimees: boolean | null;
  dateEntree: Date | string | null;
  dateDerniereAction: Date | string | null;
  dateDevis: Date | string | null;
  dateCommande: Date | string | null;
  dateFinTravaux: Date | string | null;
  dateDerniereRelance: Date | string | null;
  notes: string | null;
  nbPhotos?: number;
  site?: string | null;
  zone?: string | null;
  spot?: string | null;
  photos: { url: string; categorie: string; date?: string; auteur?: string }[];
}

export { CHAMPS_EXPORT_VEHICULE };

export interface VignetteExport {
  bytes: ArrayBuffer;
  largeur: number;
  hauteur: number;
  type: string;
}

export interface OptionsGenerationExport {
  format: FormatExport;
  /** Cles de champs, deja normalisees par le serveur. */
  champs: string[];
  /** Nombre maximum de photos integrees par vehicule. */
  photosParVehicule: number;
  /** Ligne d'en-tete du document (filtre applique, agence...). */
  contexte?: string;
}

export interface ResultatExport {
  nomFichier: string;
  octets: number;
  lignes: number;
  photosIntegrees: number;
  photosInvalides: number;
  dureeMs: number;
}

const FORMAT_DATE = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const VIDE = "";

function dateOuVide(v: Date | string | null): string {
  if (v == null || v === "") return VIDE;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? VIDE : FORMAT_DATE.format(d);
}

function nombreOuVide(v: number | null, decimales = 2): string | number {
  if (v == null || !Number.isFinite(v)) return VIDE;
  // Un entier reste un entier : evite "1500,00" dans un tableur.
  return Number.isInteger(v) ? v : Number(v.toFixed(decimales));
}

/** ArrayBuffer -> data URI base64 complète, par morceaux pour ne pas deborder la pile. */
function arrayBufferEnDataUri(buffer: ArrayBuffer, type = "image/jpeg"): string {
  const octets = new Uint8Array(buffer);
  let binaire = "";
  const PAS = 0x8000;
  for (let i = 0; i < octets.length; i += PAS) {
    binaire += String.fromCharCode(...octets.subarray(i, i + PAS));
  }
  return `data:${type};base64,${btoa(binaire)}`;
}

/** ArrayBuffer -> base64 pur (sans préfixe data URI), pour ExcelJS.addImage / jsPDF.addImage. */
function arrayBufferEnBase64(buffer: ArrayBuffer): string {
  const octets = new Uint8Array(buffer);
  // Construction par petits morceaux pour éviter "Maximum call stack size exceeded"
  // et garantir un binaire valide pour btoa (chaque char = 0-255).
  const CHUNK = 0x4000; // 16 KiB
  let binaire = "";
  for (let i = 0; i < octets.length; i += CHUNK) {
    const chunk = octets.subarray(i, i + CHUNK);
    // apply évite le spread sur gros tableaux
    binaire += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binaire);
}

/** Valeur « texte » d'un champ, pour CSV et PDF. */
export function valeurTexte(v: LigneExportVehicule, champ: ChampExportVehicule): string {
  switch (champ.cle) {
    case "numRegistre":
      return String(v.numRegistre);
    case "immatriculation":
      return v.immatriculation ?? VIDE;
    case "marque":
      return v.marque ?? VIDE;
    case "modele":
      return v.modele ?? VIDE;
    case "version":
      return v.version ?? VIDE;
    case "couleur":
      return v.couleur ?? VIDE;
    case "vin":
      return v.vin ?? VIDE;
    case "clientNom":
      return v.clientNom ?? VIDE;
    case "clientTelephone":
      return v.clientTelephone ?? VIDE;
    case "statut":
      return v.statut;
    case "motif":
      return v.motif ?? VIDE;
    case "provenance":
      return v.provenance ?? VIDE;
    case "site":
      return v.site ?? VIDE;
    case "zone":
      return v.zone ?? VIDE;
    case "spot":
      return v.spot ?? VIDE;
    case "position":
      return v.centreX == null || v.centreY == null
        ? VIDE
        : `${v.centreX.toFixed(2)} / ${v.centreY.toFixed(2)}`;
    case "positionne":
      return v.centreX == null ? "NON" : "OUI";
    case "longueur":
      return nombreOuVide(v.longueur) === VIDE ? VIDE : String(nombreOuVide(v.longueur));
    case "largeur":
      return nombreOuVide(v.largeur) === VIDE ? VIDE : String(nombreOuVide(v.largeur));
    case "hauteur":
      return nombreOuVide(v.hauteur) === VIDE ? VIDE : String(nombreOuVide(v.hauteur));
    case "poids":
      return nombreOuVide(v.poids, 0) === VIDE ? VIDE : String(nombreOuVide(v.poids, 0));
    case "dimensionsEstimees":
      return v.dimensionsEstimees ? "OUI" : "NON";
    case "dateEntree":
      return dateOuVide(v.dateEntree);
    case "dateDerniereAction":
      return dateOuVide(v.dateDerniereAction);
    case "dateDevis":
      return dateOuVide(v.dateDevis);
    case "dateCommande":
      return dateOuVide(v.dateCommande);
    case "dateFinTravaux":
      return dateOuVide(v.dateFinTravaux);
    case "dateDerniereRelance":
      return dateOuVide(v.dateDerniereRelance);
    case "nbPhotos":
      return String(v.nbPhotos);
    case "notes":
      return v.notes ?? VIDE;
    default:
      return VIDE;
  }
}

/** Valeur « native » d'un champ, pour un tableur (types preserves). */
export function valeurCellule(
  v: LigneExportVehicule,
  champ: ChampExportVehicule,
  photos: VignetteExport[] | null,
): string | number | boolean | Date | null {
  switch (champ.type) {
    case "nombre":
      return champ.cle === "numRegistre" ? v.numRegistre : v.nbPhotos;
    case "mesure": {
      const brut =
        champ.cle === "longueur"
          ? v.longueur
          : champ.cle === "largeur"
            ? v.largeur
            : champ.cle === "hauteur"
              ? v.hauteur
              : v.poids;
      if (brut == null || !Number.isFinite(brut)) return null;
      return champ.cle === "poids" ? Math.round(brut) : Number(brut.toFixed(2));
    }
    case "date": {
      const brut =
        champ.cle === "dateEntree"
          ? v.dateEntree
          : champ.cle === "dateDerniereAction"
            ? v.dateDerniereAction
            : champ.cle === "dateDevis"
              ? v.dateDevis
              : champ.cle === "dateCommande"
                ? v.dateCommande
                : champ.cle === "dateFinTravaux"
                  ? v.dateFinTravaux
                  : v.dateDerniereRelance;
      if (brut == null || brut === "") return null;
      const d = brut instanceof Date ? brut : new Date(brut);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case "booleen":
      return champ.cle === "positionne" ? v.centreX != null : v.dimensionsEstimees === true;
    case "photos":
      // Le contenu du fichier image est gere par le redacteur : on met le nombre.
      return photos && photos.length > 0 ? photos.length : null;
    case "texte":
    default:
      return valeurTexte(v, champ);
  }
}

/** Reduit les photos des vehicules en vignettes, avec une concurrence bornee. */
export async function construireVignettes(
  vehicules: LigneExportVehicule[],
  photosParVehicule: number,
  onProgression?: (fait: number, total: number) => void,
): Promise<Map<number, VignetteExport[]>> {
  const resultat = new Map<number, VignetteExport[]>();
  if (photosParVehicule <= 0) return resultat;

  const cibles: { id: number; url: string }[] = [];
  for (const v of vehicules) {
    for (const p of v.photos.slice(0, photosParVehicule)) {
      cibles.push({ id: v.id, url: p.url });
    }
  }
  if (cibles.length === 0) return resultat;

  let fait = 0;
  // Concurrence bornee : decode + redimensionner toutes les photos en parallele
  // ferait saturer la memoire et bloquer l'interface.
  const PAR_LOT = 4;
  for (let i = 0; i < cibles.length; i += PAR_LOT) {
    const lot = cibles.slice(i, i + PAR_LOT);
    const vignettes = await Promise.all(lot.map((c) => reduirePhoto(c.url, 200, 0.72)));
    lot.forEach((c, idx) => {
      const result = vignettes[idx];
      if (result) {
        // Convert new VignetteExportResult to old VignetteExport format
        const vg: VignetteExport = {
          bytes: result.bytes,
          largeur: result.largeur,
          hauteur: result.hauteur,
          type: result.type,
        };
        const liste = resultat.get(c.id) ?? [];
        liste.push(vg);
        resultat.set(c.id, liste);
      }
      fait += 1;
      onProgression?.(fait, cibles.length);
    });
  }
  return resultat;
}

/** Version avec logs de diagnostic pour la première photo. */
async function construireVignettesAvecLogs(
  vehicules: LigneExportVehicule[],
  photosParVehicule: number,
  onProgression?: (fait: number, total: number) => void,
  selectedColumns?: string[],
): Promise<Map<number, VignetteExport[]>> {
  const resultat = new Map<number, VignetteExport[]>();
  if (photosParVehicule <= 0) return resultat;

  const cibles: { id: number; url: string; photoIndex: number }[] = [];
  for (const v of vehicules) {
    const photosToUse = v.photos.slice(0, photosParVehicule);
    for (let photoIndex = 0; photoIndex < photosToUse.length; photoIndex++) {
      cibles.push({ id: v.id, url: photosToUse[photoIndex].url, photoIndex });
    }
  }
  if (cibles.length === 0) return resultat;

  if (cibles.length > 0) {
    const first = cibles[0];
    const firstVehicle = vehicules.find(v => v.id === first.id);
    console.info("[LIBRACORE_XLSX_PHOTO_INPUT]", {
      vehicleId: firstVehicle?.id,
      immatriculation: firstVehicle?.immatriculation,
      photosIsArray: Array.isArray(firstVehicle?.photos),
      photosCount: Array.isArray(firstVehicle?.photos) ? firstVehicle.photos.length : null,
      firstPhotoType: typeof firstVehicle?.photos?.[0]?.url,
      firstPhotoPrefix: firstVehicle?.photos?.[0]?.url?.slice(0, 60),
      firstPhotoLength: firstVehicle?.photos?.[0]?.url?.length ?? 0,
      selectedColumns: selectedColumns ?? [],
    });
  }

  let fait = 0;
  const PAR_LOT = 4;
  let auditCount = 0;

  for (let i = 0; i < cibles.length; i += PAR_LOT) {
    const lot = cibles.slice(i, i + PAR_LOT);
    const vignettes = await Promise.all(lot.map(async (c) => {
      const result = await reduirePhoto(c.url, 200, 0.72);
      
      // Audit logging for first 10 photos
      if (auditCount < 10) {
        auditCount++;
        // The audit is already logged inside reduirePhoto
      }
      return { cible: c, result };
    }));
    
    lot.forEach((c, idx) => {
      const { result } = vignettes[idx];
      if (result) {
        // Convert new VignetteExportResult to old VignetteExport format
        const vg: VignetteExport = {
          bytes: result.bytes,
          largeur: result.largeur,
          hauteur: result.hauteur,
          type: result.type,
        };
        const liste = resultat.get(c.id) ?? [];
        liste.push(vg);
        resultat.set(c.id, liste);
      }
      fait += 1;
      onProgression?.(fait, cibles.length);
    });
  }
  return resultat;
}

function enTeteDocument(contexte: string | undefined, lignes: number): { titre: string; sousTitres: string[] } {
  const sousTitres: string[] = [];
  if (contexte && contexte.trim().length > 0) sousTitres.push(contexte.trim());
  sousTitres.push(
    `${lignes} véhicule${lignes > 1 ? "s" : ""} — export du ${new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date())}`,
  );
  return { titre: "Registre des véhicules", sousTitres };
}

/**
 * Feuille Excel : en-tetes figes, filtre automatique, largeurs ajustees, types
 * natifs (les nombres restent des nombres, les dates des dates).
 */
async function genererXlsx(
  vehicules: LigneExportVehicule[],
  champs: ChampExportVehicule[],
  vignettes: Map<number, VignetteExport[]>,
  contexte: string | undefined,
): Promise<{ blob: Blob; photosInvalides: number; photosInserees: number }> {
  const ExcelJS = await import("exceljs");
  const classeur = new ExcelJS.Workbook();
  classeur.creator = "Lipatrad ERP";
  classeur.created = new Date();
  const feuille = classeur.addWorksheet("Véhicules", {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  const { titre, sousTitres } = enTeteDocument(contexte, vehicules.length);
  feuille.mergeCells(1, 1, 1, Math.max(1, champs.length));
  const cellTitre = feuille.getCell(1, 1);
  cellTitre.value = titre;
  cellTitre.font = { bold: true, size: 14 };
  sousTitres.forEach((ligne, i) => {
    feuille.mergeCells(2 + i, 1, 2 + i, Math.max(1, champs.length));
    const c = feuille.getCell(2 + i, 1);
    c.value = ligne;
    c.font = { size: 9, color: { argb: "FF64748B" } };
  });

  const LIGNE_ENTETE = 3;
  champs.forEach((champ, i) => {
    const c = feuille.getCell(LIGNE_ENTETE, i + 1);
    c.value = champ.label;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    c.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    feuille.getColumn(i + 1).width = champ.largeur;
  });
  feuille.getRow(LIGNE_ENTETE).height = 28;

  const avecPhotos = champs.some((c) => c.type === "photos");
  const hauteurLigne = avecPhotos ? 70 : 18;
  const dateStyle = "dd/mm/yyyy";

  let photosInvalides = 0;
  let photosInserees = 0;

  vehicules.forEach((v, indexLigne) => {
    const rangee = feuille.getRow(LIGNE_ENTETE + 1 + indexLigne);
    rangee.height = hauteurLigne;
    const photosLigne = vignettes.get(v.id) ?? [];
    champs.forEach((champ, i) => {
      const c = rangee.getCell(i + 1);
      const valeur = valeurCellule(v, champ, photosLigne);
      if (champ.type === "date" && valeur instanceof Date) {
        c.value = valeur;
        c.numFmt = dateStyle;
      } else if (champ.type === "photos") {
        c.value = photosLigne.length > 0 ? photosLigne.length : VIDE;
      } else if (champ.type === "texte" && champ.cle === "clientTelephone") {
        // Forcer le texte : un telephone saisi "0700000000" ne doit pas devenir
        // 700000000 dans Excel.
        c.value = v.clientTelephone ?? VIDE;
        c.numFmt = "@";
      } else {
        c.value = valeur as string | number | boolean | null;
      }
      c.alignment = { vertical: avecPhotos ? "top" : "middle", wrapText: champ.type === "texte" };
      c.border = {
        top: { style: "hair", color: { argb: "FFE2E8F0" } },
        bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
        left: { style: "hair", color: { argb: "FFE2E8F0" } },
        right: { style: "hair", color: { argb: "FFE2E8F0" } },
      };
      if (indexLigne % 2 === 1) {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    });

    // Photo de couverture, ancree dans la colonne « photos ».
    // L'image s'enregistre sur le classeur (renvoie un id), puis on l'ancre sur
    // la feuille avec ce meme id.
    // Selection photo principale : isPrimary sinon premiere valide
    let couverture: VignetteExport | undefined;
    if (avecPhotos && photosLigne.length > 0) {
      couverture = photosLigne.find(p => (p as any).isPrimary) ?? photosLigne[0];
    }
    if (couverture) {
      const indexColonne = champs.findIndex((c) => c.type === "photos");
      if (indexColonne >= 0) {
        try {
          // LOG DIAGNOSTIC - avant ajout image
          console.info("[LIBRACORE_XLSX_IMAGE_PARSED]", {
            vehicleId: v.id,
            immatriculation: v.immatriculation,
            detectedMimeType: couverture.type,
            detectedExtension: couverture.type === "image/png" ? "png" : "jpeg",
            base64Length: couverture.bytes.byteLength,
            isValidDataUri: true,
          });

          // ExcelJS attend du base64 PUR (sans préfixe data URI)
          const base64Pur = arrayBufferEnBase64(couverture.bytes);
          const extension = couverture.type === "image/png" ? "png" : "jpeg";

          const identifiant = classeur.addImage({
            base64: base64Pur,
            extension,
          });
          const hauteurImage = Math.min(
            hauteurLigne - 6,
            Math.max(20, (96 * couverture.hauteur) / couverture.largeur),
          );
          // Utiliser le vrai numéro de ligne Excel (rangee.number est 1-based)
          const excelRowNumber = rangee.number;
          feuille.addImage(identifiant, {
            tl: { col: indexColonne, row: excelRowNumber - 1 }, // zero-based pour tl
            ext: { width: 96, height: Math.max(1, Math.round(hauteurImage)) },
            editAs: "oneCell",
          });

          // LOG DIAGNOSTIC - après ajout image
          console.info("[LIBRACORE_XLSX_IMAGE_ADDED]", {
            vehicleId: v.id,
            immatriculation: v.immatriculation,
            imageId: identifiant,
            photoColumnIndex: indexColonne,
            excelRowNumber,
            anchor: { col: indexColonne, row: excelRowNumber - 1 },
            width: 96,
            height: Math.max(1, Math.round(hauteurImage)),
          });

          photosInserees += 1;
        } catch (e) {
          // Image invalide : placeholder dans la cellule + compteur
          photosInvalides += 1;
          const indexColonne = champs.findIndex((c) => c.type === "photos");
          if (indexColonne >= 0) {
            const c = rangee.getCell(indexColonne + 1);
            c.value = "Photo invalide";
            c.font = { color: { argb: "FFB4B4B4" }, italic: true };
          }
          console.warn("[LIBRACORE_XLSX_IMAGE_ERROR]", {
            vehicleId: v.id,
            immatriculation: v.immatriculation,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
  });

  feuille.autoFilter = {
    from: { row: LIGNE_ENTETE, column: 1 },
    to: { row: LIGNE_ENTETE, column: Math.max(1, champs.length) },
  };

  const tampon = await classeur.xlsx.writeBuffer();
  return {
    blob: new Blob([tampon], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    photosInvalides,
    photosInserees,
  };
}

/**
 * CSV : separateur point-virgule + BOM, convention attendue par un Excel
 * francophone. Les guillemets et separateurs internes sont echappes.
 */
function genererCsv(vehicules: LigneExportVehicule[], champs: ChampExportVehicule[]): Blob {
  const echapper = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const enTete = enTeteDocument(undefined, vehicules.length);
  const lignes: string[] = [
    echapper(enTete.titre),
    ...enTete.sousTitres.map(echapper),
    VIDE,
    champs.map((c) => echapper(c.label)).join(";"),
  ];
  for (const v of vehicules) {
    lignes.push(champs.map((c) => echapper(valeurTexte(v, c))).join(";"));
  }
  // BOM : sans lui Excel interprete les accents en Latin-1.
  return new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), lignes.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
}

/**
 * PDF paysage dessine a la main : un PDF de 25 colonnes serait illisible, on
 * borne donc la largeur et on pagine verticalement.
 */
async function genererPdf(
  vehicules: LigneExportVehicule[],
  champs: ChampExportVehicule[],
  vignettes: Map<number, VignetteExport[]>,
  contexte: string | undefined,
): Promise<{ blob: Blob; photosInvalides: number }> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageL = 297;
  const pageH = 210;
  const marge = 12;
  const { titre, sousTitres } = enTeteDocument(contexte, vehicules.length);

  let y = marge;
  let photosInvalides = 0;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(titre, marge, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  for (const l of sousTitres) {
    doc.text(l, marge, y);
    y += 4.5;
  }
  doc.setTextColor(0, 0, 0);
  y += 3;

  // Colonnes : on garde une largeur minimale et on retire les plus larges si ca
  // deborde, plutot que dshrinker la police jusqu'a l'illisible.
  const visibles = champs.filter((c) => c.type !== "photos");
  const colonnePhoto = champs.some((c) => c.type === "photos");
  const dispo = pageL - marge * 2 - (colonnePhoto ? 26 : 0);
  const largeurs = visibles.map((c) => c.largeur);
  const somme = largeurs.reduce((a, b) => a + b, 0);
  const facteur = somme > dispo ? dispo / somme : 1;

  // Positions calculees une seule fois : evite tout index non garanti et rend
  // le tracé des cellules trivial.
  const colonnes = visibles.map((champ, i) => ({
    champ,
    x: marge + 1.5 + largeurs.slice(0, i).reduce((a, b) => a + Math.max(10, b * facteur), 0),
    largeur: Math.max(10, (largeurs[i] ?? 12) * facteur),
  }));

  const taillePolice = facteur < 0.75 ? 5.6 : 6.4;
  const hauteurLigne = 4.4;

  const enTeteTableau = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(marge, y - 3.4, dispo, 5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(taillePolice);
    for (const col of colonnes) {
      doc.text(doc.splitTextToSize(col.champ.label, col.largeur - 2), col.x, y);
    }
    doc.setTextColor(0, 0, 0);
    y += 4;
  };

  enTeteTableau();

  for (const v of vehicules) {
    if (y > pageH - marge - hauteurLigne) {
      doc.addPage();
      y = marge + 2;
      // Reprise de l'entete : un tableau sans entete sur les pages suivantes
      // est inutilisable.
      enTeteTableau();
    }

    if (v.id % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marge, y - 3.2, dispo, hauteurLigne, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(taillePolice);
    for (const col of colonnes) {
      const texte = valeurTexte(v, col.champ);
      if (texte) {
        doc.text(doc.splitTextToSize(texte, col.largeur - 2), col.x, y);
      }
    }

    if (colonnePhoto) {
      const vg = vignettes.get(v.id)?.[0];
      if (vg) {
        try {
          doc.addImage(
            arrayBufferEnBase64(vg.bytes),
            "JPEG",
            pageL - marge - 24,
            y - 3,
            24,
            4.2,
          );
        } catch {
          // Vignette illisible : placeholder + compteur
          photosInvalides += 1;
          doc.setFontSize(5);
          doc.setTextColor(180, 180, 180);
          doc.text("Aucune photo", pageL - marge - 22, y + 0.5);
          doc.setTextColor(0, 0, 0);
        }
      } else {
        // Pas de photo : placeholder
        photosInvalides += 1;
        doc.setFontSize(5);
        doc.setTextColor(180, 180, 180);
        doc.text("Aucune photo", pageL - marge - 22, y + 0.5);
        doc.setTextColor(0, 0, 0);
      }
    }
    y += hauteurLigne;
  }

  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    doc.text(`Lipatrad ERP — page ${p}/${doc.getNumberOfPages()}`, pageL - marge, pageH - 6, {
      align: "right",
    });
  }

  return { blob: doc.output("blob"), photosInvalides };
}

/** Point d'entree unique : produit le fichier et le telecharge. */
export async function genererEtTelechargerExport(
  vehicules: LigneExportVehicule[],
  options: OptionsGenerationExport,
  prefixe = "registre-vehicules",
  onProgression?: (fait: number, total: number) => void,
): Promise<ResultatExport> {
  const debut = Date.now();
  const champs = options.champs
    .map((cle) => getChampExport(cle))
    .filter((c): c is ChampExportVehicule => Boolean(c));
  if (champs.length === 0) {
    throw new Error("Aucune colonne valide sélectionnée.");
  }

  // LOG DIAGNOSTIC - entrée export
  console.info("[LIBRACORE_EXPORT_START]", {
    vehicleCount: vehicules.length,
    format: options.format,
    photosParVehicule: options.photosParVehicule,
    hasPhotosField: vehicules[0]?.photos !== undefined,
    firstVehiclePhotos: vehicules[0]?.photos?.length ?? 0,
    firstVehiclePhotoField: (vehicules[0] as { photo?: string } | undefined)?.photo ?? null,
    selectedColumns: options.champs,
  });

  // FALLBACK : si photos array vide mais photo (vignette liste) dispo, on l'utilise
  const vehiculesAvecFallback = vehicules.map(v => {
    const photo = (v as { photo?: string }).photo;
    if ((!v.photos || v.photos.length === 0) && photo) {
      return { ...v, photos: [{ url: photo, categorie: "VIGNETTE", date: new Date().toISOString(), auteur: "Système" }] };
    }
    return v;
  });

  const avecPhotos = champs.some((c) => c.type === "photos") && options.photosParVehicule > 0;
  
  // Injecter les colonnes sélectionnées pour les logs de diagnostic
  const vignettes = avecPhotos
    ? await construireVignettesAvecLogs(vehiculesAvecFallback, options.photosParVehicule, onProgression, champs.map(c => c.cle))
    : new Map<number, VignetteExport[]>();
  let photosIntegrees = 0;
  for (const liste of vignettes.values()) photosIntegrees += liste.length;

  let photosInvalides = 0;
  let blob: Blob;
  let extension: string;
  switch (options.format) {
    case "xlsx": {
      const xlsxResult = await genererXlsx(vehiculesAvecFallback, champs, vignettes, options.contexte);
      blob = xlsxResult.blob;
      photosInvalides = xlsxResult.photosInvalides;
      photosIntegrees = xlsxResult.photosInserees;
      extension = "xlsx";
      break;
    }
    case "pdf":
      const pdfResult = await genererPdf(vehiculesAvecFallback, champs, vignettes, options.contexte);
      blob = pdfResult.blob;
      photosInvalides = pdfResult.photosInvalides;
      extension = "pdf";
      break;
    case "csv":
    default:
      blob = genererCsv(vehiculesAvecFallback, champs);
      extension = "csv";
      break;
  }

  const nomFichier = nomFichierExport(prefixe, extension);
  telechargerBlob(blob, nomFichier);

  // LOG DIAGNOSTIC - résumé final
  console.info("[LIBRACORE_XLSX_EXPORT_SUMMARY]", {
    vehicleCount: vehiculesAvecFallback.length,
    vehicleCountWithPhotos: Array.from(vignettes.values()).filter(l => l.length > 0).length,
    imagesAttempted: photosIntegrees + photosInvalides,
    imagesInserted: photosIntegrees,
    imagesSkipped: photosInvalides,
    invalidImages: photosInvalides,
    missingImages: vehiculesAvecFallback.length - Array.from(vignettes.values()).filter(l => l.length > 0).length,
    outputSizeBytes: blob.size,
    generationDurationMs: Date.now() - debut,
  });

  return {
    nomFichier,
    octets: blob.size,
    lignes: vehiculesAvecFallback.length,
    photosIntegrees,
    photosInvalides,
    dureeMs: Date.now() - debut,
  };
}

/** Estimation de la taille, pour avertir avant de lancer un export heavyweight. */
export function estimerPoidsExport(
  vehicules: LigneExportVehicule[],
  champs: ChampExportVehicule[],
  photosParVehicule: number,
): number {
  // ~35 Ko par vignette JPEG, + overhead de compression du format.
  const photos = vehicules.length * photosParVehicule * 35_000;
  const texte = vehicules.length * champs.length * 24;
  return photos + texte;
}

/** Liste des champs disponibles, regroupes pour la modale de selection. */
export function champsParGroupe(): { groupe: string; champs: ChampExportVehicule[] }[] {
  const parGroupe = new Map<string, ChampExportVehicule[]>();
  for (const champ of CHAMPS_EXPORT_VEHICULE) {
    const liste = parGroupe.get(champ.groupe) ?? [];
    liste.push(champ);
    parGroupe.set(champ.groupe, liste);
  }
  return [...parGroupe.entries()].map(([groupe, champs]) => ({ groupe, champs }));
}