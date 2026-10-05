import { STATUT_BADGE, STATUT_LABELS } from "~/server/lib/atelier-service";

export function StatutBadge({ statut, className = "" }: { statut: string | null | undefined; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${STATUT_BADGE[statut ?? ""] ?? "bg-muted text-muted-foreground"} ${className}`}
    >
      {STATUT_LABELS[statut ?? ""] ?? statut ?? "—"}
    </span>
  );
}
