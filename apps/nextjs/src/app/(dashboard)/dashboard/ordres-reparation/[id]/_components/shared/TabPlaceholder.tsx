"use client";

import { Construction } from "lucide-react";
import { EmptyState } from "~/components/ui/empty-state";

/** Coquille d'onglet en cours d'implémentation (Phase 0+1). */
export function TabPlaceholder({
  title,
  description,
  features,
}: {
  title: string;
  description: string;
  features: string[];
}) {
  return (
    <div className="space-y-4">
      <EmptyState
        icon={<Construction className="size-8" />}
        title={title}
        description={description}
      />
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Blocs fonctionnels prévus dans cette étape
        </div>
        <ul className="grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="size-1.5 shrink-0 rounded-full bg-primary/50" />
              {f}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground/70">
          Cet onglet s'activera pleinement aux phases ultérieures de la refonte, sur les endpoints tRPC existants.
        </p>
      </div>
    </div>
  );
}
