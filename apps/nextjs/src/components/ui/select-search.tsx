"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Check, ChevronDown, X, Plus } from "lucide-react";
import { cn } from "~/lib/utils";

export interface SelectSearchOption {
  value: string | number;
  label: string;
  hint?: string;
}

interface SelectSearchProps {
  value: string | number | null;
  onChange: (value: string | number) => void;
  options: SelectSearchOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Taille compacte pour les grilles denses (lignes répétées). */
  size?: "md" | "sm";
  /** Tri par défaut : options telles que fournies. Mettre false pour ne pas trier. */
  autoSort?: boolean;
  /**
   * Saisie libre : la recherche peut devenir une NOUVELLE option (« + Utiliser
   * "…" »), non présente dans `options`. Le composant émet alors une chaîne de
   * valeur arbitraire — à n'utiliser que si le champ cible accepte du texte
   * libre (ex. `typeVehicule` varchar). Défaut false = sélection stricte.
   */
  allowCustom?: boolean;
  /** Longueur max de la valeur libre (défaut 30 — `vehicules.type_vehicule`). */
  customMaxLength?: number;
  /** Rôle ARIA du conteneur (défaut « combobox »). */
  role?: string;
}

/**
 * Dropdown avec recherche saisissable (combobox).
 * À utiliser dès qu'une liste peut dépasser ~10 éléments (règle UX projet).
 */
export function SelectSearch({
  value,
  onChange,
  options,
  placeholder = "Sélectionner…",
  disabled,
  className,
  searchPlaceholder = "Rechercher…",
  emptyText = "Aucun résultat",
  size = "md",
  autoSort = true,
  allowCustom = false,
  customMaxLength = 30,
  role = "combobox",
}: SelectSearchProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = options;
    if (q) {
      list = options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          (o.hint ?? "").toLowerCase().includes(q) ||
          String(o.value).toLowerCase().includes(q)
      );
    }
    if (autoSort) {
      list = [...list].sort((a, b) => a.label.localeCompare(b.label, "fr"));
    }
    return list;
  }, [options, search, autoSort]);

  const selected = options.find((o) => String(o.value) === String(value));

  // Saisie libre : texte proposes comme nouvelle option s'il n'est ni vide ni
  // déjà connu (comparaison sur la valeur ET sur le libellé affiché).
  const saisieLibre = (() => {
    if (!allowCustom) return null;
    const brut = search.trim();
    if (!brut) return null;
    if (brut.length > customMaxLength) return null;
    const dejaConnu = options.some(
      (o) =>
        String(o.value).toLowerCase() === brut.toLowerCase() ||
        o.label.toLowerCase() === brut.toLowerCase(),
    );
    return dejaConnu ? null : brut;
  })();

  // Une valeur libre déjà enregistrée n'est plus dans `options` : on affiche
  // son texte brut plutôt que le placeholder (sinon la saisie semble perdue).
  const texteAffiche = selected
    ? selected.label
    : value != null && value !== ""
      ? String(value)
      : placeholder;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        role={role}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 text-sm",
          "transition-colors focus:outline-none focus:border-primary/50",
          size === "sm" ? "h-8 text-xs" : "h-9",
          disabled && "cursor-not-allowed opacity-50",
          open && "border-primary/50"
        )}
      >
        <span className={cn("truncate text-left", !selected && (value == null || value === "") && "text-muted-foreground")}>
          {texteAffiche}
        </span>
        {value != null && value !== "" && (
          <span
            role="button"
            tabIndex={-1}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setOpen(false);
            }}
          >
            <X size={13} />
          </span>
        )}
        <ChevronDown size={14} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-background shadow-lg">
          <div className="relative border-b border-border p-1.5">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                // La saisie libre prime si elle est proposée, sinon 1ʳᵉ résultat.
                if (saisieLibre !== null) {
                  onChange(saisieLibre);
                  setOpen(false);
                  return;
                }
                const premier = filtered[0];
                if (premier) {
                  onChange(premier.value);
                  setOpen(false);
                }
              }}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-xs outline-none focus:border-primary/50"
            />
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {saisieLibre !== null && (
              <button
                type="button"
                onClick={() => {
                  onChange(saisieLibre);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent/50"
              >
                <Plus size={14} className="shrink-0 text-primary" />
                <span className="min-w-0 truncate">
                  Utiliser <span className="font-semibold">« {saisieLibre} »</span>
                </span>
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {saisieLibre === null ? emptyText : "Aucune correspondance — utilisez la saisie ci-dessus"}
              </p>
            ) : (
              filtered.map((o) => {
                const isSelected = String(o.value) === String(value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                      isSelected ? "bg-primary/10 text-primary" : "hover:bg-accent/50"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{o.label}</span>
                      {o.hint && <span className="block truncate text-[10px] text-muted-foreground">{o.hint}</span>}
                    </span>
                    {isSelected && <Check size={14} className="shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}