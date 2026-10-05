"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Car, Wrench, Receipt, Package, User, Building2, Users, Search, X, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Dialog } from "~/components/ui/dialog";

const GROUPS = [
  { key: "clients", label: "Clients", icon: User },
  { key: "vehicules", label: "Véhicules", icon: Car },
  { key: "ordres", label: "Ordres de réparation", icon: Wrench },
  { key: "ventes", label: "Ventes & factures", icon: Receipt },
  { key: "produits", label: "Produits & articles", icon: Package },
  { key: "fournisseurs", label: "Fournisseurs", icon: Building2 },
  { key: "employes", label: "Employés", icon: Users },
] as const;

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const { data, isFetching, isError, error } = api.recherche.global.useQuery(
    { q },
    { enabled: open && q.trim().length > 0, staleTime: 30_000 },
  );

  const flatItems = useCallback(() => {
    if (!data) return [];
    const items: { href: string; titre: string; sousTitre: string; group: (typeof GROUPS)[number]["key"] }[] = [];
    for (const g of GROUPS) {
      for (const item of (data[g.key] ?? []) as { href: string; titre: string; sousTitre: string }[]) {
        items.push({ ...item, group: g.key });
      }
    }
    return items;
  }, [data]);

  const items = flatItems();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActiveIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => setActiveIndex(-1), [q, data]);

  const total = items.length;
  const goto = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (total === 0) return;
      setActiveIndex((v) => (v + 1) % total);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (total === 0) return;
      setActiveIndex((v) => (v <= 0 ? total - 1 : v - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = activeIndex >= 0 ? activeIndex : 0;
      const item = items[idx];
      if (item) goto(item.href);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Recherche globale"
        title="Recherche globale (Ctrl+K)"
        className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Search size={15} />
        <span className="hidden lg:inline">Rechercher…</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:inline">
          Ctrl K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <div className="p-2">
          <div className="flex items-center gap-2 border-b border-border px-2 pb-2">
            <Search size={16} className="shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Rechercher : numéro d'OR, plaque, téléphone, FAC-…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {isFetching ? (
              <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="max-h-[50vh] overflow-y-auto py-2">
            {q.trim() === "" ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                Tapez un numéro d'OR, une immatriculation, un nom ou un téléphone.
              </p>
            ) : null}

            {q.trim() !== "" && isError && (
              <p className="px-3 py-4 text-sm text-destructive">
                Recherche indisponible : {error?.message ?? "erreur serveur"}.
              </p>
            )}

            {q.trim() !== "" && !isFetching && !isError && total === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                Aucun résultat pour « {q} ».
              </p>
            )}

            {GROUPS.map((g) => {
              const groupItems = (data?.[g.key] ?? []) as { href: string; titre: string; sousTitre: string }[];
              if (groupItems.length === 0) return null;
              const Icon = g.icon;
              let base = 0;
              for (const pg of GROUPS) {
                if (pg.key === g.key) break;
                base += (data?.[pg.key] ?? []).length;
              }
              return (
                <div key={g.key}>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Icon size={12} />
                    {g.label}
                  </div>
                  {groupItems.map((item, i) => {
                    const idx = base + i;
                    return (
                      <button
                        key={`${g.key}-${item.href}-${i}`}
                        type="button"
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => goto(item.href)}
                        className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          activeIndex === idx ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
                        }`}
                      >
                        <span className="font-medium">{item.titre}</span>
                        <span className="text-xs text-muted-foreground">{item.sousTitre}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Dialog>
    </>
  );
}