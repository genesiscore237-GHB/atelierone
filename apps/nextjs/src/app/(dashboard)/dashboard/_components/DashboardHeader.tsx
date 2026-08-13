"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ShoppingBag,
  Package,
  Users,
  ShieldCheck,
  LayoutDashboard,
} from "lucide-react";
import { ThemeToggle } from "@atelierone/ui";
import { usePermissions } from "~/hooks/usePermissions";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Accueil", icon: ShoppingBag, module: undefined },
  { href: "/dashboard/catalog", label: "Catalogue", icon: Package, module: "catalog" },
  { href: "/dashboard/customers", label: "Clients", icon: Users, module: "customers" },
  { href: "/dashboard/governance", label: "Gouvernance", icon: ShieldCheck, module: "governance" },
];

export function DashboardHeader() {
  const pathname = usePathname();
  const { canAccessModule } = usePermissions();

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard" || pathname === "/dashboard/";
    }
    return pathname.startsWith(href);
  };

  const visibleItems = NAV_ITEMS.filter((item) => canAccessModule(item.module));
  const showAdmin = canAccessModule("admin");

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-bold text-foreground"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-black">
              L
            </div>
            <span className="hidden text-sm sm:inline">AtelierOne</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {visibleItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {showAdmin && (
            <Link
              href="/dashboard/admin"
              className={`hidden md:flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname.startsWith("/dashboard/admin")
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <LayoutDashboard size={16} />
              Pilotage
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
