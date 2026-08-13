"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { TrendingUp, AlertTriangle, Clock, DollarSign, ShoppingCart } from "lucide-react";

const urgenceConfig = {
  critique: { bg: "bg-destructive/20 dark:bg-destructive/10", text: "text-destructive dark:text-destructive", dot: "bg-destructive", label: "Critique" },
  faible: { bg: "bg-warning/20 dark:bg-warning/10", text: "text-warning-foreground dark:text-warning-foreground", dot: "bg-warning", label: "Faible" },
  normal: { bg: "bg-success/20 dark:bg-success/10", text: "text-success-foreground dark:text-success-foreground", dot: "bg-success", label: "Normal" },
};

export default function PrevisionsPage() {
  const [joursHist, setJoursHist] = useState(30);
  const [joursCouverture, setJoursCouverture] = useState(30);

  const { data, isLoading } = api.stock.getPrevisionsAchat.useQuery({
    joursHistorique: joursHist,
    joursCouverture: joursCouverture,
    limite: 100,
  });

  const coutTotal = data?.reduce((acc: number, p: any) => acc + (p.coutEstimeCommande ?? 0), 0) ?? 0;
  const besoinsCritiques = data?.filter((p: any) => p.urgence === "critique").length ?? 0;
  const besoinsFaibles = data?.filter((p: any) => p.urgence === "faible").length ?? 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground dark:text-foreground">Prévisions d'achat</h2>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground">Basées sur l'historique des ventes et les niveaux de stock actuels</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <label className="text-muted-foreground dark:text-muted-foreground">Hist.</label>
            <select className="rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-3 py-1.5 text-sm text-foreground dark:text-foreground outline-none" value={joursHist} onChange={(e) => setJoursHist(Number(e.target.value))}>
              <option value={7}>7 jours</option>
              <option value={14}>14 jours</option>
              <option value={30}>30 jours</option>
              <option value={60}>60 jours</option>
              <option value={90}>90 jours</option>
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-muted-foreground dark:text-muted-foreground">Couverture</label>
            <select className="rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-3 py-1.5 text-sm text-foreground dark:text-foreground outline-none" value={joursCouverture} onChange={(e) => setJoursCouverture(Number(e.target.value))}>
              <option value={7}>7 jours</option>
              <option value={14}>14 jours</option>
              <option value={30}>30 jours</option>
              <option value={60}>60 jours</option>
              <option value={90}>90 jours</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-destructive/20 dark:bg-destructive/10 p-2.5">
              <AlertTriangle size={20} className="text-destructive dark:text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground dark:text-foreground">{besoinsCritiques}</p>
              <p className="text-xs text-muted-foreground dark:text-muted-foreground">Besoins critiques</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-warning/20 dark:bg-warning/10 p-2.5">
              <Clock size={20} className="text-warning-foreground dark:text-warning-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground dark:text-foreground">{besoinsFaibles}</p>
              <p className="text-xs text-muted-foreground dark:text-muted-foreground">Stock faible</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/20 dark:bg-primary/10 p-2.5">
              <DollarSign size={20} className="text-primary dark:text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground dark:text-foreground">{coutTotal.toLocaleString("fr-FR")} F</p>
              <p className="text-xs text-muted-foreground dark:text-muted-foreground">Coût estimé total</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted dark:bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Urgence</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Produit</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Stock</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Vente/jour</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Jours restants</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Besoin recommandé</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider hidden md:table-cell">Coût estimé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground dark:text-muted-foreground">Chargement...</td></tr>
              ) : data?.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground dark:text-muted-foreground">
                  <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Aucune prévision</p>
                </td></tr>
              ) : (
                data?.map((p: any) => {
                  const uc = urgenceConfig[p.urgence as keyof typeof urgenceConfig] ?? urgenceConfig.normal;
                  return (
                    <tr key={p.produitId} className="hover:bg-accent dark:hover:bg-accent/30">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${uc.bg} ${uc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${uc.dot}`} />
                          {uc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-foreground dark:text-foreground">{p.titre}</div>
                        {p.codeBarre && <div className="text-xs text-muted-foreground">{p.codeBarre}</div>}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground dark:text-foreground">{p.stockActuel}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground dark:text-foreground/80">{p.venteMoyenneJour}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums">{p.joursRestants >= 999 ? "∞" : p.joursRestants}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-primary dark:text-primary">{p.besoinRecommande > 0 ? p.besoinRecommande : "-"}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground dark:text-foreground/80 hidden md:table-cell">{p.coutEstimeCommande ? `${p.coutEstimeCommande.toLocaleString("fr-FR")} F` : "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
