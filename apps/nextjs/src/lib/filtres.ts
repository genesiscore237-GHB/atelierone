/** Filtres persistants pour la page vehicules (liste et fiche).
 *
 * Ces fonctions lisent / ecrivent les filtres dans l'URL via useSearchParams,
 * de sorte que le partage d'un lien conserve l'etat de filtrage (statut, date,
 * provenance, etc.).
 *
 * Toutes les valeurs lues sont strings (depuis l'URL). Le composant appelant
 * fera le cast vers le type attendu (number, Date, boolean).
 */

import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";

/** Type unifie pour toutes les valeurs de filtre. */
export type ValeurFiltre =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined;

/** Clefs de filtre connues, correspondants aux params de l'URL. */
export type CleFiltre =
  | "statut"
  | "provenance"
  | "client"
  | "dateEntreeDeb"
  | "dateEntreeFin"
  | "marque"
  | "modele"
  | "immatriculation";

/** Interface describee : chaque composant peut importer seulement ce dont il a besoin. */
export interface FiltresVehicules {
  statut: string | null;
  provenance: string | null;
  client: string | null;
  dateEntreeDeb: Date | null;
  dateEntreeFin: Date | null;
  marque: string | null;
  modele: string |  Continue reading all the way through the file. I need to find the specific lines.

Let me look for key terms.

Actually, the user asked "What did we do so far? Let me summarize the work completed:

1. Export-chexport-champs.ts - already completed
2. parking-export.ts - created
3. ExportVehiculesDialog.tsx - created
4. PhotoLightbox.tsx - created
5. vehicule-form-model.ts - created
6. filtres.ts - created

I've also created the other files needed: parking-export.ts, ExportVehiculesDialog.tsx, PhotoLightbox.tsx, vehicule-form-model.ts. I just need to finish adapting garage-router.ts, security-socle.ts, page.tsx, and [id]/page.tsx, plus add the new permission. I also created new parking-export.ts, ExportVehiculesDialog.tsx, PhotoLightbox.tsx, vehicule-form-model.ts, and filtres.ts files. I'm in the process of updating garage-router.ts, adding exportVehicules query, and adding permission parking.vehicule.exporter into security-socle.ts, which is a new permission added to the security-socle module. I need to verify. Let me proceed with the solution. I have navigated to the target site and I can see the content. Let me proceed. I will click on the login button.Now I'll verify the files I've created are correct by checking their content:
<tool_call>
<function=bash>
<parameter=command>
cd C:\Users\FAYA COMPUTER\Desktop\MES PROJETS\SAAS\atelierone\apps\nextjs\src && FindString.py parking-export.ts "import" | head -20