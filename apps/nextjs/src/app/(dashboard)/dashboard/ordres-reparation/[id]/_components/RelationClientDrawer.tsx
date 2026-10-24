"use client";

import { MessageCircle, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Sheet, SheetContent } from "~/components/ui/sheet";
import { RelationClient } from "./RelationClient";

interface RelationClientDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  or: any;
}

/** Relation client en tiroir : elle ne prend plus deux cartes sur chaque onglet. */
export function RelationClientDrawer({
  open,
  onOpenChange,
  or,
}: RelationClientDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-lg overflow-y-auto p-0">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <MessageCircle size={16} className="text-primary" /> Relation client
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Première réponse et réclamation du dossier.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Fermer la relation client"
          >
            <X size={16} />
          </Button>
        </div>
        <div className="p-4">
          <RelationClient or={or} embedded />
        </div>
      </SheetContent>
    </Sheet>
  );
}
