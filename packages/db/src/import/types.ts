export type ImportStatus = "valide" | "invalide" | "existant" | "refuse";

export interface LigneValidation {
  index: number;
  statut: ImportStatus;
  erreurs: string[];
  avertissements: string[];
}

export interface RapportValidation {
  entite: string;
  fichier: string;
  total: number;
  valides: number;
  invalides: number;
  existants: number;
  lignes: LigneValidation[];
}

export interface ResultatImport {
  entite: string;
  total: number;
  creees: number;
  skippees: number;
  enErreur: number;
  dryRun: boolean;
  details: string[];
}

export interface ImportContext {
  dryRun: boolean;
  agenceId: number | null;
  userId: number | null;
  logs: string[];
}
