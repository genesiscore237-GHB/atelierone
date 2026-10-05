"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function useClientPaging<T>(items: T[], pageSize = 25) {
  const [page, setPageLocal] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) setPageLocal(1);
  }, [page, totalPages]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize]
  );

  const setPage = (p: number) => setPageLocal(Math.min(Math.max(1, p), totalPages));

  return { page, setPage, pageItems, total, totalPages };
}

export function PaginationBar({
  page,
  totalPages,
  total,
  onPage,
  label,
  empty,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
  label: string;
  empty?: boolean;
}) {
  if (totalPages <= 1) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        {empty ? "0 résultat" : `${total} ${label}`}
      </p>
    );
  }
  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        {total} {label} · page {page}/{totalPages}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft size={14} /> Précédent
        </button>
        <button
          type="button"
          disabled={page >= totalPages || totalPages <= 1}
          onClick={() => onPage(page + 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
        >
          Suivant <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}