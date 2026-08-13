"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ShoppingBag,
  Package,
  DollarSign,
  Users,
  Receipt,
  UserCog,
  Truck,
  Building,
  BarChart3,
  Bell,
  Gift,
  Settings,
  BookOpen,
  ClipboardList,
  RotateCcw,
  ArrowRightLeft,
  UserRound,
  Warehouse,
  Boxes,
  Building2,
} from "lucide-react";
import { usePermissions } from "~/hooks/usePermissions";

const MODULES = [
  { id: "pos", name: "Point de Vente", icon: ShoppingBag, color: "text-[var(--module-pos)]", bg: "bg-[var(--module-pos-bg)]", desc: "Prise de commandes & pré-factures" },
  { id: "stock", name: "Stock", icon: Warehouse, color: "text-[var(--module-stock)]", bg: "bg-[var(--module-stock-bg)]", desc: "Dashboard & Mouvements" },
  { id: "catalog", name: "Catalogue", icon: Package, color: "text-[var(--module-catalog)]", bg: "bg-[var(--module-catalog-bg)]", desc: "Produits & Tarifs" },
  { id: "cash", name: "Caisse", icon: DollarSign, color: "text-[var(--module-cash)]", bg: "bg-[var(--module-cash-bg)]", desc: "Encaissements" },
  { id: "customers", name: "Clients", icon: Users, color: "text-[var(--module-customers)]", bg: "bg-[var(--module-customers-bg)]", desc: "Gestion CRM" },
  { id: "sales", name: "Ventes", icon: Receipt, color: "text-[var(--module-sales)]", bg: "bg-[var(--module-sales-bg)]", desc: "Historique" },
  { id: "procurement", name: "Achats", icon: Truck, color: "text-[var(--module-procurement)]", bg: "bg-[var(--module-procurement-bg)]", desc: "Approvisionnements" },
  { id: "suppliers", name: "Fournisseurs", icon: Building, color: "text-[var(--module-suppliers)]", bg: "bg-[var(--module-suppliers-bg)]", desc: "Gestion fournisseurs" },
  { id: "inventory", name: "Inventaires", icon: ClipboardList, color: "text-[var(--module-inventory)]", bg: "bg-[var(--module-inventory-bg)]", desc: "Comptages" },
  { id: "returns", name: "Retours", icon: RotateCcw, color: "text-[var(--module-returns)]", bg: "bg-[var(--module-returns-bg)]", desc: "Gestion retours" },
  { id: "transfers", name: "Transferts", icon: ArrowRightLeft, color: "text-[var(--module-transfers)]", bg: "bg-[var(--module-transfers-bg)]", desc: "Mouvements inter-sites" },
  { id: "analytics", name: "Analytics", icon: BarChart3, color: "text-[var(--module-analytics)]", bg: "bg-[var(--module-analytics-bg)]", desc: "Statistiques" },
  { id: "bourse", name: "Bourse", icon: BookOpen, color: "text-[var(--module-bourse)]", bg: "bg-[var(--module-bourse-bg)]", desc: "Rachat manuels scolaires" },
  { id: "partner", name: "Partenaire", icon: Building2, color: "text-[var(--module-partner)]", bg: "bg-[var(--module-partner-bg)]", desc: "Achats hors catalogue" },
  { id: "alerts", name: "Alertes", icon: Bell, color: "text-[var(--module-alerts)]", bg: "bg-[var(--module-alerts-bg)]", desc: "Notifications" },
  { id: "loyalty", name: "Fidélité", icon: Gift, color: "text-[var(--module-loyalty)]", bg: "bg-[var(--module-loyalty-bg)]", desc: "Programme fidélité" },
  { id: "rh", name: "RH", icon: UserRound, color: "text-[var(--module-rh)]", bg: "bg-[var(--module-rh-bg)]", desc: "Employés & Contrats" },
  { id: "governance", name: "Gouvernance", icon: UserCog, color: "text-[var(--module-governance)]", bg: "bg-[var(--module-governance-bg)]", desc: "Permissions & Staff" },
  { id: "settings", name: "Paramètres", icon: Settings, color: "text-muted-foreground", bg: "bg-muted", desc: "Configuration" },
];

export function BentoGrid() {
  const { canAccessModule } = usePermissions();
  const visibleModules = MODULES.filter((m) => canAccessModule(m.id));

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6 lg:grid-cols-4">
      {visibleModules.map((m, index) => (
        <ModuleCard key={m.id} module={m} index={index} />
      ))}
    </div>
  );
}

function ModuleCard({
  module,
  index,
}: {
  module: {
    id: string;
    name: string;
    icon: any;
    color: string;
    bg: string;
    desc: string;
  };
  index: number;
}) {
  const IconComponent = module.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 100 }}
    >
      <Link
        href={`/dashboard/${module.id}`}
        className="group relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-2xl md:rounded-[2.5rem] border border-border/10 bg-accent/30 p-3 md:p-6 shadow-2xl transition-all hover:-translate-y-2 hover:border-border hover:bg-accent/50"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-background/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        <div
          className={`mb-2 md:mb-4 flex h-12 w-12 md:h-20 md:w-20 items-center justify-center rounded-2xl md:rounded-3xl ${module.bg} ${module.color} shadow-inner transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3`}
        >
          <IconComponent className="md:w-[38px] w-[24px] h-[24px] md:h-[38px]" strokeWidth={1.5} />
        </div>
        <div className="text-center">
          <h3 className="text-xs md:text-sm font-black tracking-tighter text-foreground uppercase">
            {module.name}
          </h3>
          <p className="mt-0.5 md:mt-1 text-[8px] md:text-[10px] font-medium tracking-widest text-muted-foreground uppercase transition-colors group-hover:text-foreground/80">
            {module.desc}
          </p>
        </div>
        <div className="absolute top-4 md:top-6 right-4 md:right-6 h-1.5 md:h-2 w-1.5 md:w-2 rounded-full bg-primary opacity-50 shadow-[0_0_10px_var(--primary)] transition-opacity group-hover:opacity-100" />
      </Link>
    </motion.div>
  );
}

export default BentoGrid;
