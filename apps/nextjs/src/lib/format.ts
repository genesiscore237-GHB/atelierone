export function formatCurrency(amount: number | string | null | undefined): string {
  const n = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  return `${n.toLocaleString("fr-FR")} F`;
}

export const DEVISE_DEFAUT = "XOF";

export function formatDevise(amount: number | string | null | undefined, devise: string | null | undefined = DEVISE_DEFAUT): string {
  const n = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  return `${n.toLocaleString("fr-FR")} ${devise || DEVISE_DEFAUT}`;
}

export function formatCurrencyShort(amount: number | string | null | undefined): string {
  const n = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR");
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("fr-FR");
}
