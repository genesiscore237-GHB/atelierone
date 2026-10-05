import { toast } from "sonner";

/** Télécharge une chaîne CSV (BOM UTF-8) sous un nom de fichier et notifie. */
export function downloadCsv(csv: string | undefined, filename: string) {
  if (!csv) return;
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`${filename} téléchargé`);
}