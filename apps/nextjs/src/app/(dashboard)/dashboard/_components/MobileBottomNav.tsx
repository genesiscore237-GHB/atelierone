"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Wrench, UserRound, Warehouse, Gauge } from "lucide-react";
import { usePermissions } from "~/hooks/usePermissions";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Bureau", icon: LayoutDashboard, module: undefined },
  { href: "/dashboard/atelier", label: "Atelier", icon: Wrench, module: "atelier" },
  { href: "/dashboard/rh", label: "RH", icon: UserRound, module: "rh" },
  { href: "/dashboard/stock", label: "Stock", icon: Warehouse, module: "stock" },
  { href: "/dashboard/pilotage", label: "Pilotage", icon: Gauge, module: "pilotage" },
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
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-2xl lg:hidden"
    >
      <ul className="flex items-center justify-around py-1.5">
        {visibleItems.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
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
