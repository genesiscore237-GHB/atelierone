/**
 * Code-barres — détection du type enregistré dans `codes_barres`.
 *
 * La même règle sert à la création par le catalogue et à la création par le
 * recensement : deux copies divergenteraient (un code lu « EAN13 » d'un
 * chemin, « INTERNE » de l'autre) — une seule implémentation.
 */
export function detectBarcodeType(v: string): string {
  if (/^\d{13}$/.test(v)) return "EAN13";
  if (/^\d{8}$/.test(v)) return "EAN8";
  return "INTERNE";
}
