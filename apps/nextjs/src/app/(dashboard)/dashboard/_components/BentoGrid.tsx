"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DOMAINS } from "~/lib/app-nav";
import { usePermissions } from "~/hooks/usePermissions";

export function BentoGrid() {
  const { canAccessModule } = usePermissions();
  const visibleDomains = DOMAINS.filter((d) => canAccessModule(d.id));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {visibleDomains.map((domain, index) => {
        const visibleModules = domain.modules.filter((m) =>
          canAccessModule(m.moduleId ?? domain.id)
        );
        return (
          <motion.div
            key={domain.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, type: "spring", stiffness: 100 }}
            className="h-full"
          >
            <Link
              href={domain.href}
              className="group relative flex h-full min-h-44 flex-col justify-between overflow-hidden rounded-2xl border border-border/10 bg-accent/30 p-5 shadow-xl transition-all hover:-translate-y-1 hover:border-border hover:bg-accent/50 md:min-h-52"
            >
              <div
                className={`absolute -right-10 -top-10 size-32 rounded-full ${domain.bg} blur-2xl opacity-60 transition-opacity duration-500 group-hover:opacity-100`}
              />
              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`flex size-12 items-center justify-center rounded-2xl ${domain.bg} ${domain.color} shadow-inner transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 md:size-14`}
                  >
                    <domain.icon className="size-6 md:size-7" strokeWidth={1.5} />
                  </div>
                  <div className="flex items-center gap-1 rounded-full border border-border/40 bg-background/60 px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    {visibleModules.length} module{visibleModules.length > 1 ? "s" : ""}
                  </div>
                </div>
                <h3 className="mt-4 text-sm font-black tracking-tighter text-foreground uppercase md:text-base">
                  {domain.label}
                </h3>
                <p className="mt-1 text-[10px] font-medium leading-relaxed tracking-wide text-muted-foreground uppercase">
                  {domain.desc}
                </p>
              </div>
              <div className="relative mt-4 flex items-center gap-1 text-[11px] font-bold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Entrer dans le domaine
                <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="absolute right-5 top-5 size-1.5 rounded-full bg-primary opacity-50 shadow-[0_0_10px_var(--primary)] transition-opacity group-hover:opacity-100" />
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}

export default BentoGrid;
