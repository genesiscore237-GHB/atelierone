"use client";

import { useMemo, useState } from "react";
import { History, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Sheet, SheetContent } from "~/components/ui/sheet";
import { Timeline } from "./Timeline";

type Filtre = "TOUS" | "STATUT" | "PRIORITE" | "RESPONSABLE" | "RELATION";

const FILTRES: Array<{ id: Filtre; label: string }> = [
  { id: "TOUS", label: "Tout" },
  { id: "STATUT", label: "Statuts" },
  { id: "PRIORITE", label: "Priorité" },
  { id: "RESPONSABLE", label: "Technicien" },
  { id: "RELATION", label: "Relation client" },
];

function correspond(h: any, filtre: Filtre): boolean {
  if (filtre === "TOUS") return true;
  if (filtre === "RELATION") {
    return h.type === "REPONSE_CLIENT" || h.type === "RECLAMATION";
  }
  return h.type === filtre;
}

interface JournalPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  historique: any[];
}

/** Journal unique du dossier, en tiroir : un seul historique, filtrable. */
export function JournalPanel({ open, onOpenChange, historique }: JournalPanelProps) {
  const [filtre, setFiltre] = useState<Filtre>("TOUS");

  const evenements = useMemo(
    () => (historique ?? []).filter((h) => correspond(h, filtre)),
    [historique, filtre],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-xl overflow-y-auto p-0">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <History size={16} className="text-primary" /> Journal du dossier
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tous les événements du cycle de vie, au même endroit.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Fermer le journal"
          >
            <X size={16} />
          </Button>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            {FILTRES.map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant={filtre === f.id ? "default" : "outline"}
                onClick={() => setFiltre(f.id)}
                className="h-7 px-2.5 text-[11px]"
              >
                {f.label}
              </Button>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            {evenements.length} événement{evenements.length > 1 ? "s" : ""}
            {filtre !== "TOUS" ? " dans ce filtre" : ""}.
          </p>

          <Timeline
            historique={evenements}
            showHeader={false}
            listClassName="max-h-[calc(100vh-15rem)]"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
