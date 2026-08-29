/**
 * Validation des clés API des sites (central).
 * La clé ANCIENNE reste acceptée pendant 24 h après une rotation afin que
 * le garage puisse la récupérer ; la réponse indique alors la nouvelle clé.
 */

export const FENETRE_BASCULE_MS = 24 * 60 * 60 * 1000;

export interface ValidationCle {
  valide: boolean;
  nouvelleCleApi: string | null; // à remettre au garage si l'ancienne a été utilisée
}

export function validerCleSite(site: { cleApi: string | null; cleApiAncienne: string | null; cleApiChangeLe: Date | string | null }, cleFournie: string): ValidationCle {
  const propre = (cleFournie ?? "").trim();
  if (!propre) return { valide: false, nouvelleCleApi: null };

  if (site.cleApi && propre === site.cleApi) {
    return { valide: true, nouvelleCleApi: null };
  }

  // Ancienne clé : acceptée pendant la fenêtre de bascule, on renvoie la nouvelle
  if (site.cleApiAncienne && propre === site.cleApiAncienne && site.cleApiChangeLe) {
    const change = new Date(site.cleApiChangeLe).getTime();
    if (Date.now() - change < FENETRE_BASCULE_MS) {
      return { valide: true, nouvelleCleApi: site.cleApi };
    }
  }

  return { valide: false, nouvelleCleApi: null };
}