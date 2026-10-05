"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, Home, LayoutGrid, LogOut, X } from "lucide-react";
import { signOut } from "next-auth/react";
import { DOMAINS, moduleVisible } from "~/lib/app-nav";
import { usePermissions } from "~/hooks/usePermissions";

interface AppSidebarProps {
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
}

/**
 * Navigation latérale complète (mode Pilotage) :
 * le même menu que le bureau, présenté en accordéons de domaines.
 * Desktop : fixe à gauche. Mobile : drawer plein écran.
 */
export function AppSidebar({ variant = "desktop", onNavigate }: AppSidebarProps) {
  const pathname = usePathname();
  const { canAccessModule, user } = usePermissions();

  const [openDomains, setOpenDomains] = useState<Set<string>>(() => {
    const seg = pathname.split("/")[2];
    return new Set(DOMAINS.filter((d) => d.href.split("/")[2] === seg).map((d) => d.id));
  });

  useEffect(() => {
    const seg = pathname.split("/")[2];
    if (seg) {
      const matching = new Set(DOMAINS.filter((d) => d.href.split("/")[2] === seg).map((d) => d.id));
      if (matching.size > 0) {
        setOpenDomains((prev) => new Set([...prev, ...matching]));
      }
    }
  }, [pathname]);

  const visibleDomains = DOMAINS.filter((d) => canAccessModule(d.id));

  const toggleDomain = (id: string) => {
    setOpenDomains((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isDomainActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const linkClasses = (active: boolean, indent = false) =>
    `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
      indent ? "ml-4" : ""
    } ${
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-accent hover:text-foreground"
    }`;

  const roleLabel =
    user?.role === "superadmin"
      ? "Super Administrateur"
      : user?.role === "directeur"
        ? "Directeur"
        : user?.role === "chef_atelier"
          ? "Chef des ateliers"
          : user?.role ?? "";

  const router = useRouter();

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2 font-bold text-foreground"
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-black text-primary-foreground">
            A
          </div>
          <span className="text-sm">AtelierOne</span>
        </Link>
        {variant === "mobile" && (
          <button
            type="button"
            onClick={onNavigate}
            aria-label="Fermer le menu"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Corps de navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:thin]">
        <p className="px-2 pb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
          Bureau
        </p>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className={linkClasses(pathname === "/dashboard" || pathname === "/dashboard/")}
        >
          <Home size={16} />
          Bureau (accueil)
        </Link>

        <p className="px-2 pb-2 pt-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
          Domaines de gestion
        </p>
        <div className="space-y-1">
          {visibleDomains.map((domain) => {
            const isOpen = openDomains.has(domain.id);
            const active = isDomainActive(domain.href);
            const visibleModules = domain.modules.filter((m) =>
              canAccessModule(m.moduleId ?? domain.id) && moduleVisible(m.status)
            );
            return (
              <div key={domain.id}>
                <button
                  type="button"
                  onClick={() => toggleDomain(domain.id)}
                  aria-expanded={isOpen}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors ${
                    active
                      ? "bg-accent/70 text-foreground"
                      : "text-foreground/90 hover:bg-accent"
                  }`}
                >
                  <domain.icon size={16} className={domain.color} strokeWidth={2} />
                  <span className="flex-1 truncate text-left">{domain.label}</span>
                  <ChevronDown
                    size={15}
                    className={`text-muted-foreground transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="mt-0.5 space-y-0.5">
                    <Link
                      href={domain.homeHref ?? domain.href}
                      onClick={onNavigate}
                      className={linkClasses(pathname === (domain.homeHref ?? domain.href), true)}
                    >
                      <LayoutGrid size={14} className="shrink-0 text-muted-foreground" />
                      Vue d&apos;ensemble
                    </Link>
                    {visibleModules.map((m) => {
                      const mActive = pathname === m.href || pathname.startsWith(m.href + "/");
                      return (
                        <Link
                          key={m.id}
                          href={m.href}
                          onClick={onNavigate}
                          className={linkClasses(mActive, true)}
                        >
                          <m.icon size={14} className="shrink-0 text-muted-foreground" />
                          <span className="truncate">{m.label}</span>
                          {m.status === "enConstruction" && (
                            <span className="ml-1 rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold text-amber-600">
                              DEV
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pied : utilisateur */}
      <div className="border-t border-border/60 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-black text-primary">
            {(user?.name ?? "U").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-foreground">{user?.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{roleLabel}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Se déconnecter"
            title="Se déconnecter"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
