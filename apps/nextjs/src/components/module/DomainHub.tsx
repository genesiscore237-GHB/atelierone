"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { findDomain } from "~/lib/app-nav";
import { usePermissions } from "~/hooks/usePermissions";

/**
 * Page d'accueil d'un domaine — CHARTE D'AFFICHAGE :
 * le bento est réservé au Bureau. Ici, les sous-menus sont présentés en
 * lignes compactes (liste scannable, extensible, jamais envahissante),
 * triées selon l'ordre métier du registre app-nav.
 */
export function DomainHub({ domainId }: { domainId: string }) {
  const { canAccessModule } = usePermissions();
  const domain = findDomain(domainId);

  if (!domain) return null;

  const visibleModules = domain.modules.filter((m) =>
    canAccessModule(m.moduleId ?? domain.id)
  );

  return (
    <div>
      {/* Hero du domaine */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-6 md:p-8">
        <div className={`absolute -right-16 -top-16 size-48 rounded-full ${domain.bg} blur-3xl`} />
        <div className="relative flex items-start gap-4">
          <div
            className={`flex size-14 shrink-0 items-center justify-center rounded-2xl ${domain.bg} ${domain.color} shadow-inner`}
          >
            <domain.icon className="size-7" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">
              {domain.label}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{domain.desc}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
              {visibleModules.length} module{visibleModules.length > 1 ? "s" : ""} ·{" "}
              {domain.modules.map((m) => m.label).join(" · ")}
            </p>
          </div>
        </div>
      </div>

      {/* Liste des modules (lignes compactes) */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
        <div className="border-b border-border/60 px-5 py-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Modules du domaine
          </h2>
        </div>
        <ul className="divide-y divide-border/60">
          {visibleModules.map((module, index) => (
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
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${domain.bg} ${domain.color} shadow-inner transition-transform duration-300 group-hover:scale-105`}
                >
                  <module.icon className="size-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold tracking-tight text-foreground">
                    {module.label}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {module.desc}
                  </p>
                </div>
                <span className="hidden shrink-0 text-[11px] font-bold uppercase tracking-wider text-primary opacity-0 transition-opacity group-hover:opacity-100 sm:block">
                  Ouvrir
                </span>
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
