"use client";

import { History, Loader2, X } from "lucide-react";
import { raisonLabel } from "~/lib/rh-labels";

interface HistoriqueEntry {
  id: number;
  version?: number | null;
  raison: string | null;
  creatorPrenom?: string | null;
  creatorName?: string | null;
  createdBy?: number | null;
  createdAt?: string | Date | null;
  detail?: unknown;
}

export default function HistoriqueDialog({
  open,
  onClose,
  title,
  emptyLabel,
  rows,
  isLoading,
  isError,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  emptyLabel: string;
  rows: HistoriqueEntry[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--overlay)] p-4" onClick={onClose}>
      <div className="mx-auto my-8 w-full max-w-3xl rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
            <History size={16} className="text-primary" /> {title}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          État archivé avant chaque régénération ou décision — lecture seule, versionné partiellement.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Chargement de l&apos;historique…
          </div>
        ) : isError ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <p>Impossible de charger l&apos;historique.</p>
            <button onClick={onRetry} className="mt-3 rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-accent">
              Réessayer
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {r.version != null && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
                        v{r.version}
                      </span>
                    )}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {raisonLabel(r.raison)}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {[r.creatorPrenom, r.creatorName].filter(Boolean).join(" ") || "—"} ·{" "}
                    {r.createdAt ? new Date(r.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </span>
                </div>
                {r.detail !== undefined && (
                  <details className="mt-2">
                    <summary className="cursor-pointer select-none text-xs font-medium text-primary">Voir l&apos;état archivé</summary>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
                      {JSON.stringify(r.detail, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}