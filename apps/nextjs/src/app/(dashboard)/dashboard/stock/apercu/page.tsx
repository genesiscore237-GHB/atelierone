"use client";

import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Package, AlertTriangle, Activity, TrendingUp, ArrowRight, Repeat, ClipboardList, ListOrdered, RefreshCw, ShieldAlert, Snowflake, Store } from "lucide-react";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function StockDashboardPage() {
  const { data: dashboard, isLoading } = api.stock.getDashboard.useQuery();
  const { data: alertes } = api.stock.getAlertes.useQuery();
  const { data: alertesAntiVol } = api.stock.getAlertesAntiVol.useQuery();
  const { data: dormants } = api.stock.getStocksDormants.useQuery({ jours: 90, limit: 10 });

  const summaryCards = [
    { label: "Produits en stock", value: dashboard?.totalProduits ?? 0, icon: Package, color: "text-success-foreground", bg: "bg-success/10" },
    { label: "Valeur du stock", value: (dashboard?.valeurStock ?? 0).toLocaleString("fr-FR") + " F", icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
    { label: "Ruptures", value: dashboard?.nbRuptures ?? 0, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "Stocks bas", value: dashboard?.nbStocksBas ?? 0, icon: Activity, color: "text-warning-foreground", bg: "bg-warning/10" },
    { label: "Surstock", value: dashboard?.nbSurstock ?? 0, icon: Package, color: "text-info-foreground", bg: "bg-info/10" },
    { label: "Mouvements du jour", value: dashboard?.mouvementsJour ?? 0, icon: Activity, color: "text-primary", bg: "bg-primary/10" },
  ];

  const quickActions = [
    { label: "Mouvements", href: "/dashboard/stock/mouvements", icon: ListOrdered, color: "text-primary", bg: "bg-primary/10" },
    { label: "Déconditionner", href: "/dashboard/stock/deconditionnement", icon: Repeat, color: "text-warning-foreground", bg: "bg-warning/10" },
    { label: "Inventaire", href: "/dashboard/stock/inventaire", icon: ClipboardList, color: "text-primary", bg: "bg-primary/10" },
    { label: "Ajuster stock", href: "/dashboard/stock/ajustement-manuel", icon: RefreshCw, color: "text-destructive", bg: "bg-destructive/10" },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h1 className="text-xl font-black tracking-tight text-foreground">Vue d&apos;ensemble du stock</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Indicateurs clés, mouvements récents, alertes et stocks dormants
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {summaryCards.map((card, i) => (
          <motion.div key={card.label} variants={item} className="rounded-xl border border-border dark:border-border bg-background dark:bg-card p-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.bg} ${card.color}`}>
                <card.icon size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{card.label}</p>
                <p className="text-xl font-bold text-foreground">{isLoading ? "-" : card.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Mouvements Récents
              </h2>
              <Link href="/dashboard/stock/mouvements" className="text-xs text-primary hover:underline flex items-center gap-1">
                Voir tout <ArrowRight size={12} />
              </Link>
            </div>
            <div className="space-y-2">
              {dashboard?.mouvementsRecents?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun mouvement récent</p>
              ) : (
                dashboard?.mouvementsRecents?.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg bg-muted/50 dark:bg-muted/50 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${m.type?.includes("RECEPTION") || m.type?.includes("RETOUR") || m.type?.includes("ENTREE") || m.type?.includes("POSITIF") ? "bg-success" : m.type === "VENTE" ? "bg-destructive" : m.type?.includes("DECONDITIONNEMENT") ? "bg-warning" : "bg-primary"}`} />
                      <p className="text-sm text-foreground/80 truncate">{m.produitTitre ?? `#${m.produitId}`}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-sm font-mono ${m.type?.includes("RECEPTION") || m.type?.includes("RETOUR") || m.type?.includes("ENTREE") || m.type?.includes("POSITIF") ? "text-success-foreground" : "text-destructive"}`}>
                        {m.type?.includes("RECEPTION") || m.type?.includes("RETOUR") || m.type?.includes("ENTREE") || m.type?.includes("POSITIF") ? "+" : "-"}{m.quantite}
                      </span>
                      <span className="text-xs text-muted-foreground hidden sm:inline">{m.type}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card p-4">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Alertes Stock</h2>
            <div className="space-y-2">
              {alertes?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucune alerte</p>
              ) : (
                alertes?.slice(0, 5).map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg bg-destructive/10 dark:bg-destructive/5 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{a.titre}</p>
                      <p className="text-xs text-muted-foreground">{a.codeBarre}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-mono font-bold ${a.niveau === "critique" ? "text-destructive" : "text-warning-foreground"}`}>{a.quantite}</p>
                      <p className="text-xs text-muted-foreground">{a.niveau}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card p-4">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Actions Rapides</h2>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`flex flex-col items-center justify-center rounded-lg ${action.bg} ${action.color} p-3 hover:scale-105 transition-transform`}
                >
                  <action.icon size={20} />
                  <span className="text-xs font-medium mt-1">{action.label}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-warning/20 dark:border-warning/50 bg-background dark:bg-card p-4">
            <h2 className="text-sm font-bold text-warning-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Store size={16} /> À achalander
              <Link href="/dashboard/stock/mise-en-rayon" className="ml-auto text-xs font-normal text-primary hover:underline flex items-center gap-1">
                Mise en rayon <ArrowRight size={12} />
              </Link>
            </h2>
            <div className="space-y-2">
              {!dashboard?.aAchalander || dashboard.aAchalander.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">Rien à mettre en rayon</p>
              ) : (
                dashboard.aAchalander.slice(0, 5).map((a) => (
                  <div key={a.produitId} className="flex items-center justify-between rounded-lg bg-warning/10 dark:bg-warning/5 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{a.titre}</p>
                      <p className="text-xs text-muted-foreground">{a.codeBarre}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-bold text-warning-foreground">{a.quantite} en stock</p>
                      <p className="text-xs text-muted-foreground">0 en rayon</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-destructive/20 dark:border-destructive/50 bg-background dark:bg-card p-4">
            <h2 className="text-sm font-bold text-destructive uppercase tracking-wider mb-3 flex items-center gap-2">
              <ShieldAlert size={16} /> Anti-Vol
            </h2>
            <div className="space-y-2">
              {!alertesAntiVol || alertesAntiVol.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">Aucun mouvement suspect</p>
              ) : (
                alertesAntiVol.slice(0, 4).map((a) => (
                  <div key={a.id} className="flex items-start gap-2 rounded-lg bg-destructive/10 dark:bg-destructive/5 px-3 py-2">
                    <ShieldAlert size={14} className="text-destructive mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">{a.titre ?? `#${a.produitId}`}</p>
                      <p className="text-xs text-destructive">{a.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {dormants && dormants.items.length > 0 && (
            <div className="rounded-xl border border-info/20 dark:border-info/50 bg-background dark:bg-card p-4">
              <h2 className="text-sm font-bold text-info-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Snowflake size={16} /> Stocks Dormants
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {dormants.total} · {dormants.valeurTotale.toLocaleString()} F
                </span>
              </h2>
              <div className="space-y-2">
                {dormants.items.slice(0, 5).map((d) => (
                  <div key={d.produitId} className="flex items-center justify-between rounded-lg bg-info/10 dark:bg-info/5 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{d.titre}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.quantite} en stock · {d.categorieNom ?? "N/A"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-bold text-foreground">
                        {Number(d.valeurStock ?? 0).toLocaleString()} F
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {d.derniereVente ? new Date(d.derniereVente).toLocaleDateString("fr-FR") : "Jamais vendu"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
