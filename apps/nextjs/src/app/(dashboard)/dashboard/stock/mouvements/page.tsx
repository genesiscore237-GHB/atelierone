"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Search, ArrowDown, ArrowUp, Filter } from "lucide-react";

export default function MouvementsPage() {
  const [filters, setFilters] = useState({ type: "", search: "", dateDebut: "", dateFin: "" });
  const { data: mouvements, isLoading } = api.stock.getMouvements.useQuery({
    type: filters.type || undefined,
    limit: 100,
  });

  const typeColors: Record<string, string> = {
    entree: "text-success-foreground bg-success/20 dark:text-success-foreground dark:bg-success/10",
    reception: "text-success-foreground bg-success/20 dark:text-success-foreground dark:bg-success/10",
    vente: "text-destructive bg-destructive/20 dark:text-destructive dark:bg-destructive/10",
    retour: "text-primary bg-primary/20 dark:text-primary dark:bg-primary/10",
    ajustement: "text-warning-foreground bg-warning/20 dark:text-warning-foreground dark:bg-warning/10",
    deconditionnement: "text-primary bg-primary/20 dark:text-primary dark:bg-primary/10",
    inventaire: "text-warning-foreground bg-warning/20 dark:text-warning-foreground dark:bg-warning/10",
  };

  const types = ["", "entree", "reception", "vente", "retour", "ajustement", "deconditionnement", "inventaire"];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher par produit..."
            className="w-full rounded-lg border border-border dark:border-border bg-background dark:bg-card pl-9 pr-3 py-2 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setFilters({ ...filters, type: t })}
              className={`rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                filters.type === t
                  ? "bg-primary text-foreground"
                  : "bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground hover:bg-accent dark:hover:bg-accent"
              }`}
            >
              {t || "Tous"}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted dark:bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Produit</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Quantité</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider hidden md:table-cell">Stock avant</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider hidden md:table-cell">Stock après</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Motif</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-4 py-4"><div className="h-4 bg-muted dark:bg-muted rounded animate-pulse" /></td></tr>
                ))
              ) : mouvements?.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground dark:text-muted-foreground">
                  <p className="font-medium">Aucun mouvement</p>
                </td></tr>
              ) : (
                mouvements?.filter(m => !filters.search || m.produitTitre?.toLowerCase().includes(filters.search.toLowerCase())).map((m) => (
                  <tr key={m.id} className="hover:bg-accent dark:hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-muted-foreground dark:text-foreground/80 whitespace-nowrap">
                      {m.dateMouvement ? new Date(m.dateMouvement).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground dark:text-foreground">{m.produitTitre ?? `#${m.produitId}`}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[m.type] ?? "bg-muted text-foreground/80 dark:bg-muted dark:text-foreground/80"}`}>
                        {m.type === "entree" || m.type === "reception" ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                        {m.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono font-bold text-foreground dark:text-foreground">{m.quantite}</td>
                    <td className="px-4 py-3 text-right text-sm text-muted-foreground dark:text-foreground/80 hidden md:table-cell">{m.stockAvant}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-foreground dark:text-foreground hidden md:table-cell">{m.stockApres}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground dark:text-muted-foreground hidden lg:table-cell max-w-[200px] truncate">{m.motif ?? m.commentaire ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
