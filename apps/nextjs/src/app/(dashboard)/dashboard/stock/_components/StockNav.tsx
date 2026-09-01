"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListOrdered, Repeat, ClipboardList, Package, TrendingUp, Store, ArrowLeftRight, RefreshCw, LayoutGrid, SearchCheck, BellRing, Hammer } from "lucide-react";

const tabs = [
  { href: "/dashboard/stock", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/stock/chercher-avant-commander", label: "Chercher avant de commander", icon: SearchCheck },
  { href: "/dashboard/stock/alertes", label: "Alertes", icon: BellRing },
  { href: "/dashboard/stock/mouvements", label: "Mouvements", icon: ListOrdered },
  { href: "/dashboard/stock/outillage", label: "Outillage", icon: Hammer },
  { href: "/dashboard/stock/rayons", label: "Rayons", icon: LayoutGrid },
  { href: "/dashboard/stock/mise-en-rayon", label: "Mise en rayon", icon: Store },
  { href: "/dashboard/stock/deconditionnement", label: "Déconditionnement", icon: Repeat },
  { href: "/dashboard/stock/reconditionnement", label: "Reconditionnement", icon: Package },
  { href: "/dashboard/stock/transfert", label: "Transfert", icon: ArrowLeftRight },
  { href: "/dashboard/stock/ajustement-manuel", label: "Ajustement", icon: RefreshCw },
  { href: "/dashboard/stock/previsions", label: "Prévisions", icon: TrendingUp },
  { href: "/dashboard/stock/inventaire", label: "Inventaire", icon: ClipboardList },
];

export function StockNav() {
  const pathname = usePathname();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Stock & Entrepôt</h1>
        <p className="mt-1 text-sm text-muted-foreground">Gérez les stocks, mouvements, déconditionnements et inventaires</p>
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
