"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Gauge, BarChart3 } from "lucide-react";
import { DOMAINS, findDomain } from "~/lib/app-nav";
import { usePermissions } from "~/hooks/usePermissions";

/**
 * Vue Pilotage — CHARTE :
 * le même menu que le Bureau, présenté en navigation latérale (sidebar)
 * et en liste compacte de domaines. Accès rapide à tous les domaines
 * sans repasser par l'accueil.
 */
export default function PilotageHubPage() {
  const { canAccessModule } = usePermissions();
  const domain = findDomain("pilotage");
  const visibleDomains = DOMAINS.filter((d) => canAccessModule(d.id));

  if (!domain) return null;

  return (
    <div>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-6 md:p-8">
        <div className="absolute -right-16 -top-16 size-48 rounded-full bg-[var(--module-analytics-bg)] blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--module-analytics-bg)] text-[var(--module-analytics)] shadow-inner">
            <Gauge className="size-7" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">
              Pilotage
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Vision direction et navigation rapide : le même menu que le Bureau,
              organisé pour un accès direct depuis la barre latérale.
            </p>
          </div>
        </div>
      </div>

      {/* Tous les domaines — le même menu que le Bureau */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
        <div className="border-b border-border/60 px-5 py-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Tous les domaines
          </h2>
        </div>
        <ul className="divide-y divide-border/60">
          {visibleDomains.map((d, index) => (
            <motion.li
              key={d.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
            >
              <Link
                href={d.href}
                className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-accent/50"
              >
                <div
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${d.bg} ${d.color} shadow-inner`}
                >
                  <d.icon className="size-4.5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold tracking-tight text-foreground">
                    {d.label}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {d.modules.length} module{d.modules.length > 1 ? "s" : ""} · {d.desc}
                  </p>
                </div>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary"
                />
              </Link>
            </motion.li>
          ))}
        </ul>
      </div>

      {/* Modules du domaine Pilotage */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
        <div className="border-b border-border/60 px-5 py-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Pilotage Direction
          </h2>
        </div>
        <ul className="divide-y divide-border/60">
          {domain.modules.map((module, index) => (
            <motion.li
              key={module.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <Link
                href={module.href}
                className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-accent/50"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--module-analytics-bg)] text-[var(--module-analytics)] shadow-inner">
                  {module.id === "pilotage-direction" ? (
                    <Gauge className="size-5" strokeWidth={1.75} />
                  ) : (
                    <BarChart3 className="size-5" strokeWidth={1.75} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold tracking-tight text-foreground">
                    {module.label}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{module.desc}</p>
                </div>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary"
                />
              </Link>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}
