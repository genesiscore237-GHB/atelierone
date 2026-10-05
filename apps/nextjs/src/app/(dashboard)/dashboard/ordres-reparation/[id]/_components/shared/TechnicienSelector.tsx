"use client";

import { toast } from "sonner";
import { UserRound } from "lucide-react";
import { api } from "~/trpc/react";
import { SelectSearch } from "~/components/ui/select-search";

/** Sélecteur de technicien responsable (assignerTechnicien) avec recherche. */
export function TechnicienSelector({
  or,
  employes,
}: {
  or: any;
  employes: any[];
}) {
  const utils = api.useUtils();
  const assigner = api.or.assignerTechnicien.useMutation({
    onSuccess: () => {
      toast.success("Technicien responsable mis à jour");
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const placeholder = `Technicien : ${or.responsablePrenom ? `${or.responsablePrenom} ${or.responsableNom ?? ""}` : "non assigné"}`;

  return (
    <div className="flex items-center gap-2">
      <UserRound size={14} className="shrink-0 text-muted-foreground" />
      <SelectSearch
        value={or.responsableTechnicienId ?? ""}
        onChange={(v) => {
          assigner.mutate({
            id: Number(or.id),
            technicienId: v ? Number(v) : null,
            commentaire: "Changement depuis la fiche",
          });
        }}
        options={(employes ?? []).map((e: any) => ({
          value: e.id,
          label: `${e.prenom ?? ""} ${e.nom ?? ""}`.trim() || `#${e.id}`,
          hint: e.matricule ?? "",
        }))}
        placeholder={placeholder}
        searchPlaceholder="Rechercher un technicien…"
        className="w-56"
      />
    </div>
  );
}
