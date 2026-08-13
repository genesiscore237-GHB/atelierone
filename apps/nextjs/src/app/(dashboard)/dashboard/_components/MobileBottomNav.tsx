"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Wallet,
  Users,
  Target,
  ShieldCheck,
} from "lucide-react";
import { usePermissions } from "~/hooks/usePermissions";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard, module: undefined },
  { href: "/dashboard/pos", label: "Ventes", icon: Wallet, module: "pos" },
  { href: "/dashboard/customers", label: "Clients", icon: Users, module: "customers" },
  { href: "/dashboard/catalog", label: "Stocks", icon: Target, module: "catalog" },
  { href: "/dashboard/governance", label: "Gouvernance", icon: ShieldCheck, module: "governance" },
  { href: "/dashboard/admin", label: "Pilotage", icon: LayoutDashboard, module: "admin" },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { canAccessModule } = usePermissions();

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard" || pathname === "/dashboard/";
    }
    return pathname.startsWith(href);
  };

  const visibleItems = NAV_ITEMS.filter((item) => canAccessModule(item.module));

  return (
    <nav
      aria-label="Navigation mobile"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-2xl lg:hidden"
    >
      <ul className="flex items-center justify-around py-2">
        {visibleItems.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-1 px-1.5 py-1 text-[10px] font-medium transition-colors ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
