"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Map, Car, BellRing, Settings } from "lucide-react";

const tabs = [
  { href: "/dashboard/garage", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/garage/carte", label: "Carte", icon: Map },
  { href: "/dashboard/garage/vehicules", label: "Véhicules", icon: Car },
  { href: "/dashboard/garage/alertes", label: "Alertes", icon: BellRing },
  { href: "/dashboard/garage/configuration", label: "Configuration", icon: Settings },
];

export function GarageNav() {
  const pathname = usePathname();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Parking & Véhicules</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registre des véhicules immobilisés, carte du site et alertes (GPJ)
        </p>
      </div>
      <div className="flex gap-1 rounded-lg bg-muted p-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-background text-foreground shadow-sm dark:bg-muted dark:text-foreground"
                  : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}