"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Loader2, X } from "lucide-react";

function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 size={14} className={`animate-spin ${className}`} />;
}

const CATEGORY_PALETTE: Record<string, { bg: string; border: string; text: string }> = {
  finance:     { bg: "from-success/10 to-success/5",  border: "border-success/20", text: "text-success-foreground" },
  members:     { bg: "from-primary/10 to-primary/5",       border: "border-primary/20",    text: "text-primary" },
  staff:       { bg: "from-primary/10 to-primary/5",   border: "border-primary/20",  text: "text-primary" },
  settings:    { bg: "from-warning/10 to-warning/5",     border: "border-warning/20",   text: "text-warning-foreground" },
  security:    { bg: "from-destructive/10 to-destructive/5",         border: "border-destructive/20",     text: "text-destructive" },
  module:      { bg: "from-info/10 to-info/5",       border: "border-info/20",    text: "text-info-foreground" },
  comms:       { bg: "from-[var(--module-rh-bg)] to-[var(--module-rh-bg)]",        border: "border-[var(--module-rh)]/20",     text: "text-[var(--module-rh)]" },
  event:       { bg: "from-[var(--module-transfers-bg)] to-[var(--module-transfers-bg)]",  border: "border-[var(--module-transfers)]/20", text: "text-[var(--module-transfers)]" },
  organization:{ bg: "from-warning/10 to-warning/5",   border: "border-warning/20",  text: "text-warning-foreground" },
  unit:        { bg: "from-[var(--module-inventory-bg)] to-[var(--module-inventory-bg)]",       border: "border-[var(--module-inventory)]/20",    text: "text-[var(--module-inventory)]" },
  project:     { bg: "from-[var(--module-suppliers-bg)] to-[var(--module-suppliers-bg)]",       border: "border-[var(--module-suppliers)]/20",    text: "text-[var(--module-suppliers)]" },
  fundraising: { bg: "from-warning/10 to-warning/5",   border: "border-warning/20",  text: "text-warning-foreground" },
  cell:        { bg: "from-primary/10 to-primary/5",   border: "border-primary/20",  text: "text-primary" },
  audit:       { bg: "from-destructive/10 to-destructive/5",       border: "border-destructive/20",    text: "text-destructive" },
  social:      { bg: "from-[var(--module-governance-bg)] to-[var(--module-governance-bg)]", border: "border-[var(--module-governance)]/20", text: "text-[var(--module-governance)]" },
  music:       { bg: "from-[var(--module-analytics-bg)] to-[var(--module-analytics-bg)]",    border: "border-[var(--module-analytics)]/20",   text: "text-[var(--module-analytics)]" },
  system:      { bg: "from-muted/10 to-muted/5", border: "border-muted/20", text: "text-muted-foreground" },
};

const FALLBACK_STYLE = { bg: "from-muted/10 to-muted/5", border: "border-muted/20", text: "text-muted-foreground" };

function getPalette(cat: string) {
  const key = cat.toLowerCase().replace(/[^a-z]/g, "");
  return CATEGORY_PALETTE[key] ?? FALLBACK_STYLE;
}

export default function MatrixGrid({
  roles,
  grouped,
  activeLinks,
  toggle,
  collapsed,
  onToggleCat,
  mode,
  isPending,
  onSelectPermission,
  cats,
  category,
  onSetCategory,
}: any) {
  const linked = (roleId: any, permId: any) =>
    activeLinks?.some((l: any) => l.roleId === roleId && l.permissionId === permId && l.active);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        <button
          onClick={() => onSetCategory("all")}
          className={`rounded px-2 py-1 text-[10px] transition-colors ${
            category === "all" ? "bg-accent/50 text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Tout
        </button>
        {Array.from(cats?.entries() ?? []).map(([cat, info]: any) => {
          const palette = getPalette(cat);
          return (
            <button
              key={cat}
              onClick={() => onSetCategory(cat)}
              className={`rounded px-2 py-1 text-[10px] transition-colors flex items-center gap-1 ${
                category === cat
                  ? `${palette.bg} ${palette.text} border ${palette.border}`
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat}
              <span className="rounded-full bg-accent/50 px-1.5 text-[8px]">{info.a}/{info.c}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {Object.entries(grouped).map(([cat, { perms, active: catActive }]: any) => {
          const palette = getPalette(cat);
          const isC = collapsed?.has(cat);
          return (
            <motion.div
              key={cat}
              className={`overflow-hidden rounded-lg border ${palette.border} bg-gradient-to-br ${palette.bg}`}
            >
              <button
                onClick={() => onToggleCat(cat)}
                className="flex w-full items-center justify-between px-4 py-2 hover:bg-accent/50 transition-colors"
                aria-expanded={!isC}
              >
                <span className={`rounded bg-accent/50 px-3 py-1 text-xs font-bold uppercase ${palette.text}`}>
                  {cat}
                </span>
                <span className="text-xs text-muted-foreground">
                  {catActive}/{perms.length}
                </span>
                <ChevronDown
                  size={16}
                  className={`text-muted-foreground transition-transform ${isC ? "-rotate-90" : ""}`}
                />
              </button>

              <AnimatePresence initial={false}>
                {!isC && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full min-w-[600px]">
                        <thead>
                          <tr className="border-t border-border/50 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                            <th className="px-4 py-2 text-left">Permission</th>
                            {roles?.map((r: any) => (
                              <th key={r.id} className="px-3 py-2 text-center">{r.nom ?? r.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {perms.map((perm: any) => (
                            <tr key={perm.id} className="hover:bg-accent/5 transition-colors">
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-foreground">{perm.nom ?? perm.name}</span>
                                  <button
                                    onClick={() => onSelectPermission?.({ permission: perm, roles })}
                                    className="text-muted-foreground hover:text-muted-foreground transition-colors"
                                  >
                                    <span className="text-[10px]">ℹ</span>
                                  </button>
                                </div>
                              </td>
                              {roles?.map((r: any) => {
                                const active = linked(r.id, perm.id);
                                return (
                                  <td key={`${perm.id}-${r.id}`} className="px-3 py-2 text-center">
                                    <button
                                      onClick={() => toggle(r.id, perm.id, r.nom ?? r.name, perm.nom ?? perm.name)}
                                      disabled={isPending}
                                      className={`inline-flex items-center justify-center rounded border px-2.5 py-1 text-[11px] font-bold transition-all ${
                                        active
                                          ? "border-success bg-success/10 text-success-foreground"
                                          : "border-border bg-accent/30 text-muted-foreground hover:border-border"
                                      }`}
                                    >
                                      {active ? <Check size={12} /> : <X size={12} />}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="block md:hidden divide-y divide-border">
                      {perms.map((perm: any) => (
                        <div key={perm.id} className="px-4 py-2">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="text-xs text-foreground">{perm.nom ?? perm.name}</span>
                            <button
                              onClick={() => onSelectPermission?.({ permission: perm, roles })}
                              className="text-muted-foreground hover:text-muted-foreground"
                            >
                              <span className="text-[10px]">ℹ</span>
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {roles?.map((r: any) => {
                              const active = linked(r.id, perm.id);
                              return (
                                <button
                                  key={`${perm.id}-${r.id}`}
                                  onClick={() => toggle(r.id, perm.id, r.nom ?? r.name, perm.nom ?? perm.name)}
                                  disabled={isPending}
                                  className={`rounded border px-2 py-0.5 text-[10px] font-bold transition-all ${
                                    active
                                      ? "border-success bg-success/10 text-success-foreground"
                                      : "border-border bg-accent/30 text-muted-foreground"
                                  }`}
                                >
                                  {(r.nom ?? r.name).slice(0, 6)}
                                  {active ? " ✓" : " ✗"}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
