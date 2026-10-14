/**
 * LOT R5 — Normalisation des téléphones pour la détection de doublons client
 * (exigence E6).
 *
 * Deux clients saisis à la réception (« 06 12 34 56 78 » et « 0612345678 »)
 * sont le MÊME client. On normalise pour comparer :
 *   - trim, suppression de tous les caractères non numériques ;
 *   - on ne garde que les chiffres ;
 *   - normalisation des préfixes internationaux courants du Cameroun vers le
 *     format national 9 chiffres (237 6xx… → 6xx…, +237 6xx… → 6xx…).
 *
 * Renvoie null si le résultat n'a pas le format attendu (9 chiffres
 * commençant par un indicatif mobile valide) : « pas d'invention » (D3) —
 * un numéro illisible n'est PAS fusionné à tort.
 *
 * NB : la ponctuation (espaces, tirets, points, parenthèses) est supprimée ;
 * seuls les chiffres restent pour la comparaison.
 */
export function normaliserTelephone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D+/g, "");
  if (!d) return null;
  // Préfixes internationaux Cameroun → national.
  if (d.startsWith("237")) d = d.slice(3);
  // Certaines saisies incluent l'indicatif sans le préfixe « 237 » complet
  // mais avec un « 0 » de sécurité : on le retire.
  if (d.length === 10 && d.startsWith("0")) d = d.slice(1);
  // Format national attendu : 9 chiffres, mobiles camerounais 6xx / 2xx (fixe).
  if (d.length !== 9) return null;
  if (!/^[62]\d{8}$/.test(d)) return null;
  return d;
}

/** Deux téléphones sont-ils « le même » au sens dédoublonnage ? */
export function telephonesIdentiques(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normaliserTelephone(a);
  const nb = normaliserTelephone(b);
  return !!na && !!nb && na === nb;
}
