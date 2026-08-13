"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Gift, Star, Users, TrendingUp, Plus, Settings, Award, Crown, Diamond } from "lucide-react";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function LoyaltyPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "programs" | "rewards">("overview");

  const utils = api.useUtils();
  const { data: loyaltyStats, isLoading: statsLoading } = api.loyalty.getStats.useQuery();
  const { data: programs, isLoading: programsLoading } = api.loyalty.getPrograms.useQuery();
  const { data: rewards, isLoading: rewardsLoading } = api.loyalty.getRewards.useQuery();

  // Mock data for demonstration
  const mockStats = {
    totalPoints: 125000,
    activeMembers: 450,
    redemptionRate: 68,
    avgPointsPerCustomer: 278
  };

  const mockPrograms = [
    {
      id: "1",
      name: "Programme VIP",
      type: "TIER_BASED",
      status: "ACTIVE",
      pointsPerXAF: 1,
      tiers: [
        { name: "Bronze", minPoints: 0, benefits: ["5% de réduction"] },
        { name: "Argent", minPoints: 5000, benefits: ["10% de réduction", "Livraison gratuite"] },
        { name: "Or", minPoints: 15000, benefits: ["15% de réduction", "Livraison gratuite", "Accès anticipé"] },
        { name: "Platine", minPoints: 30000, benefits: ["20% de réduction", "Livraison gratuite", "Accès anticipé", "Conseiller dédié"] }
      ]
    }
  ];

  const mockRewards = [
    { id: "1", name: "Réduction 10%", pointsCost: 500, category: "DISCOUNT", status: "ACTIVE" },
    { id: "2", name: "Livraison gratuite", pointsCost: 1000, category: "SHIPPING", status: "ACTIVE" },
    { id: "3", name: "Produit offert", pointsCost: 2000, category: "PRODUCT", status: "ACTIVE" },
    { id: "4", name: "Accès VIP 1 mois", pointsCost: 5000, category: "SERVICE", status: "ACTIVE" }
  ];

  function getTierIcon(tier: string) {
    switch (tier.toLowerCase()) {
      case "bronze": return <Award size={16} className="text-warning-foreground" />;
      case "argent": return <Star size={16} className="text-muted-foreground" />;
      case "or": return <Crown size={16} className="text-warning" />;
      case "platine": return <Diamond size={16} className="text-primary" />;
      default: return <Star size={16} className="text-muted-foreground" />;
    }
  }

  function getTierColor(tier: string) {
    switch (tier.toLowerCase()) {
      case "bronze": return "bg-warning/20 text-warning-foreground dark:bg-warning/10 dark:text-warning-foreground";
      case "argent": return "bg-muted text-foreground dark:bg-muted-foreground/10 dark:text-muted-foreground";
      case "or": return "bg-warning/10 text-warning dark:bg-warning/10 dark:text-warning";
      case "platine": return "bg-primary/20 text-primary dark:bg-primary/10 dark:text-primary";
      default: return "bg-muted text-foreground";
    }
  }

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground dark:text-foreground">Programme de Fidélité</h1>
          <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">Gérez les récompenses et l'engagement client</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-success to-success px-4 py-2.5 text-sm font-semibold text-foreground hover:from-success/80 hover:to-success/80 transition-all shadow-sm">
            <Plus size={16} /> Nouvelle récompense
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary px-4 py-2.5 text-sm font-semibold text-foreground hover:from-primary/80 hover:to-primary/80 transition-all shadow-sm">
            <Settings size={16} /> Paramètres
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex rounded-lg bg-muted dark:bg-muted p-1">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "overview"
              ? "bg-background text-foreground shadow-sm dark:bg-muted dark:text-foreground"
              : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
          }`}
        >
          Vue d'ensemble
        </button>
        <button
          onClick={() => setActiveTab("programs")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "programs"
              ? "bg-background text-foreground shadow-sm dark:bg-muted dark:text-foreground"
              : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
          }`}
        >
          Programmes
        </button>
        <button
          onClick={() => setActiveTab("rewards")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "rewards"
              ? "bg-background text-foreground shadow-sm dark:bg-muted dark:text-foreground"
              : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
          }`}
        >
          Récompenses
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <motion.div variants={item} className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground dark:text-muted-foreground">Points totaux</p>
                  <p className="text-2xl font-bold text-foreground dark:text-foreground mt-1">
                    {statsLoading ? "..." : mockStats.totalPoints.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">
                    En circulation
                  </p>
                </div>
                <div className="rounded-lg bg-primary/10 p-3 dark:bg-primary/10">
                  <Gift size={24} className="text-primary" />
                </div>
              </div>
            </motion.div>

            <motion.div variants={item} className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground dark:text-muted-foreground">Membres actifs</p>
                  <p className="text-2xl font-bold text-foreground dark:text-foreground mt-1">
                    {statsLoading ? "..." : mockStats.activeMembers}
                  </p>
                  <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">
                    Avec programme actif
                  </p>
                </div>
                <div className="rounded-lg bg-success/20 p-3 dark:bg-success/10">
                  <Users size={24} className="text-success-foreground dark:text-success-foreground" />
                </div>
              </div>
            </motion.div>

            <motion.div variants={item} className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground dark:text-muted-foreground">Taux d'échange</p>
                  <p className="text-2xl font-bold text-foreground dark:text-foreground mt-1">
                    {statsLoading ? "..." : `${mockStats.redemptionRate}%`}
                  </p>
                  <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">
                    Points utilisés
                  </p>
                </div>
                <div className="rounded-lg bg-warning/20 p-3 dark:bg-warning/10">
                  <TrendingUp size={24} className="text-warning-foreground dark:text-warning-foreground" />
                </div>
              </div>
            </motion.div>

            <motion.div variants={item} className="rounded-xl border border-border bg-background p-6 dark:border-border dark:bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground dark:text-muted-foreground">Moyenne/client</p>
                  <p className="text-2xl font-bold text-foreground dark:text-foreground mt-1">
                    {statsLoading ? "..." : mockStats.avgPointsPerCustomer}
                  </p>
                  <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">
                    Points par membre
                  </p>
                </div>
                <div className="rounded-lg bg-primary/20 p-3 dark:bg-primary/10">
                  <Star size={24} className="text-primary dark:text-primary" />
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Recent Activity */}
          <motion.div variants={item} className="rounded-xl border border-border bg-background dark:border-border dark:bg-card">
            <div className="border-b border-border p-6 dark:border-border">
              <h3 className="text-lg font-semibold text-foreground dark:text-foreground">Activité récente</h3>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1">Dernières transactions de fidélité</p>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {[
                  { customer: "Marie Dupont", action: "Points gagnés", points: "+250", reason: "Achat de 25,000 FCFA", time: "2h ago" },
                  { customer: "Jean Kouassi", action: "Récompense échangée", points: "-500", reason: "Réduction 10%", time: "4h ago" },
                  { customer: "Sophie Traoré", action: "Niveau atteint", points: "+100", reason: "Passage Or", time: "6h ago" },
                  { customer: "Paul N'Diaye", action: "Points expirés", points: "-50", reason: "Expiration annuelle", time: "1j ago" },
                  { customer: "Fatou Sow", action: "Points gagnés", points: "+180", reason: "Achat de 18,000 FCFA", time: "1j ago" }
                ].map((activity, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 dark:bg-muted">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 dark:bg-primary/10 flex items-center justify-center">
                        <Gift size={16} className="text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground dark:text-foreground">
                          {activity.customer} - {activity.action}
                        </p>
                        <p className="text-xs text-muted-foreground dark:text-muted-foreground">{activity.reason}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${activity.points.startsWith('+') ? 'text-success-foreground' : 'text-destructive'}`}>
                        {activity.points} pts
                      </p>
                      <p className="text-xs text-muted-foreground dark:text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Programs Tab */}
      {activeTab === "programs" && (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
          {mockPrograms.map((program) => (
            <motion.div key={program.id} variants={item} className="rounded-xl border border-border bg-background dark:border-border dark:bg-card">
              <div className="border-b border-border p-6 dark:border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground dark:text-foreground">{program.name}</h3>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1">
                      {program.pointsPerXAF} point{program.pointsPerXAF > 1 ? 's' : ''} par FCFA dépensé
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                    program.status === "ACTIVE" ? "bg-success/20 text-success-foreground" : "bg-muted text-foreground/80"
                  }`}>
                    {program.status === "ACTIVE" ? "Actif" : "Inactif"}
                  </span>
                </div>
              </div>

              <div className="p-6">
                <h4 className="text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-4">Niveaux de fidélité</h4>
                <div className="space-y-3">
                  {program.tiers.map((tier, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 dark:bg-muted">
                      <div className="flex items-center gap-3">
                        {getTierIcon(tier.name)}
                        <div>
                          <p className="text-sm font-medium text-foreground dark:text-foreground">{tier.name}</p>
                          <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                            À partir de {tier.minPoints.toLocaleString()} points
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {tier.benefits.map((benefit, i) => (
                            <span key={i} className={`inline-block px-2 py-1 text-xs rounded-full ${getTierColor(tier.name)}`}>
                              {benefit}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Rewards Tab */}
      {activeTab === "rewards" && (
        <motion.div variants={container} initial="hidden" animate="show" className="rounded-xl border border-border bg-background overflow-hidden dark:border-border dark:bg-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 dark:bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Récompense</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider hidden md:table-cell">Catégorie</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Coût (points)</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Statut</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-border">
                {rewardsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={5} className="px-4 py-4"><div className="h-4 bg-muted dark:bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : mockRewards.map((reward) => (
                  <motion.tr key={reward.id} variants={item} className="hover:bg-accent/30 dark:hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground dark:text-foreground">{reward.name}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-muted-foreground dark:text-foreground/80 capitalize">{reward.category.toLowerCase()}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold font-mono text-foreground dark:text-foreground">
                        {reward.pointsCost.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                        reward.status === "ACTIVE" ? "bg-success/20 text-success-foreground" : "bg-muted text-foreground/80"
                      }`}>
                        {reward.status === "ACTIVE" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                        Modifier
                      </button>
                      <button className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        reward.status === "ACTIVE"
                          ? "text-destructive hover:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/10"
                          : "text-success-foreground hover:bg-success/10 dark:text-success-foreground dark:hover:bg-success/10"
                      }`}>
                        {reward.status === "ACTIVE" ? "Désactiver" : "Activer"}
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}