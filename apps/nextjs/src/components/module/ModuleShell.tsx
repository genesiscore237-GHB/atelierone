"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home, LayoutGrid } from "lucide-react";
import { findDomain, findModuleByPath, moduleVisible } from "~/lib/app-nav";
import { usePermissions } from "~/hooks/usePermissions";

interface ModuleShellProps {
  domainId: string;
  children: React.ReactNode;
}

/**
 * Coquille de navigation d'un domaine :
 * breadcrumb (Bureau > Domaine > Module), bouton retour,
 * et bandeau de sous-menus (tabs) masqué sur la page d'accueil du domaine.
 */
export function ModuleShell({ domainId, children }: ModuleShellProps) {
  const pathname = usePathname();
  const { canAccessModule } = usePermissions();
  const domain = findDomain(domainId);

  if (!domain) return <>{children}</>;

  const isDomainHome = pathname === domain.href;
  const activeModule = findModuleByPath(pathname);
  const tabs = domain.modules.filter(
    (m) => moduleVisible(m.status) && canAccessModule(m.moduleId ?? domain.id)
  );
  const homeHref = domain.homeHref ?? domain.href;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-8">
      {/* Breadcrumb + retour */}
      <nav aria-label="Fil d'Ariane" className="pt-6">
        <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium transition-colors hover:bg-accent hover:text-foreground"
          >
            <Home size={13} />
            Bureau
          </Link>
          <ChevronRight size={13} className="opacity-50" />
          <Link
            href={domain.href}
            aria-current={isDomainHome ? "page" : undefined}
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium transition-colors hover:bg-accent ${
              isDomainHome ? "text-foreground" : "hover:text-foreground"
            }`}
          >
            <domain.icon size={13} className={domain.color} />
            {domain.label}
          </Link>
          {activeModule && !isDomainHome && activeModule.href !== pathname && (
            <>
              <ChevronRight size={13} className="opacity-50" />
              <Link
                href={activeModule.href}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium transition-colors hover:bg-accent hover:text-foreground"
              >
                {activeModule.label}
              </Link>
            </>
          )}
          {activeModule && activeModule.href === pathname && (
            <>
              <ChevronRight size={13} className="opacity-50" />
              <span className="px-1.5 py-0.5 font-semibold text-foreground">
                {activeModule.label}
              </span>
            </>
          )}
        </div>
      </nav>

      {/* Bandeau de sous-menus du domaine */}
      {!isDomainHome && tabs.length > 0 && (
        <div className="mt-4 flex items-center gap-2 overflow-x-auto rounded-xl border border-border/60 bg-card/60 p-1 backdrop-blur [scrollbar-width:thin]">
          <Link
            key="tab-home"
            href={homeHref}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
              pathname === homeHref
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <LayoutGrid size={14} />
            Vue d&apos;ensemble
          </Link>
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <tab.icon size={14} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Bandeau de sous-écrans du module actif (ex. Rôles, Matrice, Logs) */}
      {activeModule?.subs && activeModule.subs.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto rounded-xl bg-muted/60 p-1 [scrollbar-width:thin]">
          {activeModule.subs
            .filter((s) => canAccessModule(s.moduleId ?? activeModule.moduleId ?? domain.id))
            .map((sub) => {
              const isActive = pathname === sub.href || pathname.startsWith(`${sub.href}/`);
              return (
                <Link
                  key={sub.href}
                  href={sub.href}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <sub.icon size={13} />
                  {sub.label}
                </Link>
              );
            })}
        </div>
      )}

      <div className="py-6">{children}</div>
    </div>
  );
}
