"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  ShoppingBag, Warehouse, Package, DollarSign, Users, Receipt, Truck, Building,
  ClipboardList, RotateCcw, ArrowRightLeft, BarChart3, BookOpen, Building2,
  Bell, Gift, UserRound, UserCog, Settings, Menu, X, LayoutDashboard, TrendingUp, FileBarChart,
} from "lucide-react";

const MODULES = [
  { id: "pos", name: "Point de Vente", icon: ShoppingBag, color: "text-[var(--module-pos)]", bg: "bg-[var(--module-pos-bg)]" },
  { id: "stock", name: "Stock", icon: Warehouse, color: "text-[var(--module-stock)]", bg: "bg-[var(--module-stock-bg)]" },
  { id: "catalog", name: "Catalogue", icon: Package, color: "text-[var(--module-catalog)]", bg: "bg-[var(--module-catalog-bg)]" },
  { id: "cash", name: "Caisse", icon: DollarSign, color: "text-[var(--module-cash)]", bg: "bg-[var(--module-cash-bg)]" },
  { id: "customers", name: "Clients", icon: Users, color: "text-[var(--module-customers)]", bg: "bg-[var(--module-customers-bg)]" },
  { id: "sales", name: "Ventes", icon: Receipt, color: "text-[var(--module-sales)]", bg: "bg-[var(--module-sales-bg)]" },
  { id: "procurement", name: "Achats", icon: Truck, color: "text-[var(--module-procurement)]", bg: "bg-[var(--module-procurement-bg)]" },
  { id: "suppliers", name: "Fournisseurs", icon: Building, color: "text-[var(--module-suppliers)]", bg: "bg-[var(--module-suppliers-bg)]" },
  { id: "inventory", name: "Inventaires", icon: ClipboardList, color: "text-[var(--module-inventory)]", bg: "bg-[var(--module-inventory-bg)]" },
  { id: "returns", name: "Retours", icon: RotateCcw, color: "text-[var(--module-returns)]", bg: "bg-[var(--module-returns-bg)]" },
  { id: "transfers", name: "Transferts", icon: ArrowRightLeft, color: "text-[var(--module-transfers)]", bg: "bg-[var(--module-transfers-bg)]" },
  { id: "analytics", name: "Analytics", icon: BarChart3, color: "text-[var(--module-analytics)]", bg: "bg-[var(--module-analytics-bg)]" },
  { id: "marge", name: "Marge", icon: TrendingUp, color: "text-[var(--module-marge)]", bg: "bg-[var(--module-marge-bg)]" },
  { id: "rapports", name: "Rapports", icon: FileBarChart, color: "text-[var(--module-marge)]", bg: "bg-[var(--module-marge-bg)]" },
  { id: "bourse", name: "Bourse", icon: BookOpen, color: "text-[var(--module-bourse)]", bg: "bg-[var(--module-bourse-bg)]" },
  { id: "partner", name: "Partenaire", icon: Building2, color: "text-[var(--module-partner)]", bg: "bg-[var(--module-partner-bg)]" },
  { id: "alerts", name: "Alertes", icon: Bell, color: "text-[var(--module-alerts)]", bg: "bg-[var(--module-alerts-bg)]" },
  { id: "loyalty", name: "Fidélité", icon: Gift, color: "text-[var(--module-loyalty)]", bg: "bg-[var(--module-loyalty-bg)]" },
  { id: "rh", name: "RH", icon: UserRound, color: "text-[var(--module-rh)]", bg: "bg-[var(--module-rh-bg)]" },
  { id: "governance", name: "Gouvernance", icon: UserCog, color: "text-[var(--module-governance)]", bg: "bg-[var(--module-governance-bg)]" },
  { id: "finance", name: "Finance", icon: DollarSign, color: "text-[var(--module-finance)]", bg: "bg-[var(--module-finance-bg)]" },
  { id: "settings", name: "Paramètres", icon: Settings, color: "text-muted-foreground", bg: "bg-muted" },
];

export function AdminSidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const closeSidebar = () => setSidebarOpen(false);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <>
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed left-3 top-16 z-30 flex h-9 w-9 items-center justify-center rounded-lg bg-accent/80 text-foreground/70 backdrop-blur-xl hover:bg-accent lg:hidden"
        aria-label="Menu"
      >
        <Menu size={18} />
      </button>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-[var(--overlay)] lg:hidden"
          onClick={closeSidebar}
        />
      )}

      <aside
        className={`fixed left-0 z-30 h-full w-64 shrink-0 border-r border-border bg-card/95 backdrop-blur-2xl transition-transform duration-300 ease-out lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } pt-14`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <LayoutDashboard size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-black text-foreground">Pilotage</h2>
              <p className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase">Admin</p>
            </div>
          </div>
          <button
            onClick={closeSidebar}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent lg:hidden"
          >
            <X size={15} />
          </button>
        </div>

        <div className="h-[calc(100vh-8.5rem)] overflow-y-auto py-2 px-2 scrollbar-thin">
          <nav className="space-y-0.5">
            {MODULES.map((mod) => {
              const Icon = mod.icon;
              const active = isActive(`/dashboard/${mod.id}`);
              return (
                <Link
                  key={mod.id}
                  href={`/dashboard/${mod.id}`}
                  onClick={closeSidebar}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  <div className={`flex h-7 w-7 items-center justify-center rounded-md ${active ? mod.bg : "bg-transparent"}`}>
                    <Icon size={15} className={active ? mod.color : "text-current"} />
                  </div>
                  <span className="truncate">{mod.name}</span>
                  {active && (
                    <motion.div
                      layoutId="adminNavGlow"
                      className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]"
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}
