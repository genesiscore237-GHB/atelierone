"use client";

import { Download } from "lucide-react";
import { Button } from "~/components/ui/button";

interface MatrixData {
  permissionCode: string;
  permissionNom: string;
  module: string;
  roleCode: string;
  roleNom: string;
  active: boolean;
}

interface ExportButtonProps {
  data: MatrixData[];
  filename?: string;
}

export function ExportButton({ data, filename = "matrice-permissions.csv" }: ExportButtonProps) {
  const handleExport = () => {
    const headers = ["Permission", "Code", "Module", "Rôle", "Code Rôle", "Actif"];
    const rows = data.map((d) => [
      d.permissionNom,
      d.permissionCode,
      d.module,
      d.roleNom,
      d.roleCode,
      d.active ? "Oui" : "Non",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="ghost" onClick={handleExport}>
      <Download className="h-4 w-4 mr-2" />
      Exporter CSV
    </Button>
  );
}
