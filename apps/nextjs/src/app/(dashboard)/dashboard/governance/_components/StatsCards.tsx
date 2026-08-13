"use client";

import { motion } from "framer-motion";
import { Users, UserCheck, UserPlus, UserX } from "lucide-react";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemAnim = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

interface StatsData {
  total: number;
  active: number;
  invited: number;
  suspended: number;
}

interface StatsCardsProps {
  stats: StatsData;
}

const cards = [
  {
    key: "total" as const,
    label: "Total membres",
    icon: Users,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    key: "active" as const,
    label: "Membres actifs",
    icon: UserCheck,
    color: "text-success-foreground",
    bg: "bg-success/10",
  },
  {
    key: "invited" as const,
    label: "En attente d'activation",
    icon: UserPlus,
    color: "text-warning-foreground",
    bg: "bg-warning/10",
  },
  {
    key: "suspended" as const,
    label: "Suspendus",
    icon: UserX,
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
];

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {cards.map((card) => {
        const Icon = card.icon;
        const value = stats[card.key];
        return (
          <motion.div
            key={card.key}
            variants={itemAnim}
            className="rounded-xl border border-border bg-card/50 p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`rounded-lg ${card.bg} p-2`}>
                <Icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{card.label}</p>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
