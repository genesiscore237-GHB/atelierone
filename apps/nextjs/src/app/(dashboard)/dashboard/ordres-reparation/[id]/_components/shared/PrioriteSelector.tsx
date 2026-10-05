"use client";

import { toast } from "sonner";
import { api } from "~/trpc/react";
import { PRIORITE_META } from "~/server/lib/atelier-service";

/** Sélecteur de priorité avec historisation obligatoire. */
export function PrioriteSelector({ or, id }: { or: any; id: number }) {
  const utils = api.useUtils();
  const changerPriorite = api.or.changerPriorite.useMutation({
    onSuccess: (r) => {
      toast.success(`Priorité ${r.priorite}`);
      utils.or.getById.invalidate();
      utils.or.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const p = or.priorite ?? "P3";
  const badgeCls =
    p === "P1" ? "bg-destructive text-white" :
    p === "P2" ? "bg-warning text-white" :
    p === "P3" ? "bg-success text-white" :
    "bg-muted text-muted-foreground";

  return (
    <div className="flex items-center gap-1">
      <span className={`rounded px-2 py-0.5 text-[11px] font-black ${badgeCls}`}>{p}</span>
      <select
        className="h-9 rounded-lg border border-border bg-background px-2 text-xs"
        value=""
        onChange={(e) => e.target.value && changerPriorite.mutate({ id, priorite: e.target.value as any, motif: "Changement depuis la fiche" })}
      >
        <option value="">Priorité…</option>
        {(["P1", "P2", "P3", "P4"] as const).filter((x) => x !== p).map((x) => (
          <option key={x} value={x} className="bg-background">{x} — {PRIORITE_META[x]?.libelle}</option>
        ))}
      </select>
    </div>
  );
}
