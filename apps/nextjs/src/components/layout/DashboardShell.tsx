"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Gauge, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ThemeToggle } from "@atelierone/ui";
import { AppSidebar } from "~/components/layout/AppSidebar";
import { SaasStatusBar } from "~/components/layout/SaasStatusBar";
import { ModuleGuard } from "~/hooks/usePermissions";
import { GlobalSearch } from "~/components/layout/GlobalSearch";
import { MobileBottomNav } from "~/app/(dashboard)/dashboard/_components/MobileBottomNav";
import { HelpButton } from "~/components/help/HelpButton";

const SIDEBAR_KEY = "ao.sidebar.collapsed";

/**
 * Coquille applicative globale :
 * - Header compact (logo, Bureau, Pilotage, thème, menu mobile)
 * - Navigation latérale gauche (accordéons de domaines) sur toutes les
 *   pages sauf le Bureau — repliable / extensible pour maximiser la
 *   place de la page sélectionnée (préférence mémorisée)
 * - Drawer mobile pour la navigation latérale
 * - Garde de permissions (ModuleGuard)
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
  }, []);

  const isBureau = pathname === "/dashboard" || pathname === "/dashboard/";
  const isPilotage = pathname.startsWith("/dashboard/pilotage");

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            {!isBureau && (
              <>
                {/* Toggle sidebar (desktop) */}
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-label={collapsed ? "Afficher la navigation" : "Masquer la navigation"}
                  title={collapsed ? "Afficher la navigation" : "Masquer la navigation"}
                  className="hidden rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:flex"
                >
                  {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                </button>
                {/* Ouverture du drawer (mobile) */}
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Ouvrir le menu"
                  className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
                >
                  <Menu size={18} />
                </button>
              </>
            )}
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-bold text-foreground"
            >
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-black text-primary-foreground">
                A
              </div>
              <span className="hidden text-sm sm:inline">AtelierOne</span>
            </Link>
            <nav
              className="ml-2 hidden items-center gap-1 md:flex"
              aria-label="Navigation principale"
            >
              <Link
                href="/dashboard"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isBureau
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <Home size={15} />
                Bureau
              </Link>
              <Link
                href="/dashboard/pilotage"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isPilotage
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <Gauge size={15} />
                Pilotage
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-1">
            <GlobalSearch />
            <HelpButton />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px]">
        {/* Sidebar desktop (repliable) */}
        {!isBureau && !collapsed && (
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 border-r border-border/60 lg:block">
            <AppSidebar variant="desktop" />
          </aside>
        )}

        {/* Drawer mobile */}
        {!isBureau && sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Fermer le menu"
              onClick={() => setSidebarOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-border bg-background shadow-2xl">
              <AppSidebar variant="mobile" onNavigate={() => setSidebarOpen(false)} />
            </aside>
          </div>
        )}

        {/* Contenu */}
        <main className="min-w-0 flex-1">
          <SaasStatusBar />
          <ModuleGuard>{children}</ModuleGuard>
        </main>
      </div>

      {/* Navigation rapide mobile */}
      <MobileBottomNav />
    </div>
  );
}
