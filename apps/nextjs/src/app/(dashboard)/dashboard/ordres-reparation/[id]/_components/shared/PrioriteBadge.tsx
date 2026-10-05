export function PrioriteBadge({ priorite }: { priorite?: string | null }) {
  const p = priorite ?? "P3";
  const cls =
    p === "P1" ? "bg-destructive text-white" :
    p === "P2" ? "bg-warning text-white" :
    p === "P3" ? "bg-success text-white" :
    "bg-muted text-muted-foreground";
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-black ${cls}`}>{p}</span>;
}
