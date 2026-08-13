"use client";

import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Bell, AlertTriangle, CheckCircle, Clock } from "lucide-react";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function AlertsPage() {
  const utils = api.useUtils();
  const { data: alerts, isLoading } = api.alert.getActiveAlerts.useQuery();

  const resolveAlert = api.alert.resolveAlert.useMutation({
    onSuccess: () => utils.alert.getActiveAlerts.invalidate(),
    onError: (e) => alert(e.message),
  });

  function getSeverityBadge(severity: string) {
    switch (severity) {
      case "CRITICAL": return { icon: <AlertTriangle size={14} />, text: "Critique", color: "bg-destructive/10 text-destructive" };
      case "HIGH": return { icon: <AlertTriangle size={14} />, text: "Élevé", color: "bg-warning/10 text-warning-foreground" };
      case "MEDIUM": return { icon: <Clock size={14} />, text: "Moyen", color: "bg-warning/10 text-warning-foreground" };
      case "LOW": return { icon: <Bell size={14} />, text: "Faible", color: "bg-primary/10 text-primary" };
      default: return { icon: <Bell size={14} />, text: severity, color: "bg-muted text-muted-foreground" };
    }
  }

  function getTypeBadge(type: string) {
    switch (type) {
      case "STOCK_LOW": return { icon: <AlertTriangle size={14} />, text: "Stock faible", color: "bg-warning/10 text-warning-foreground" };
      case "ANOMALY": return { icon: <AlertTriangle size={14} />, text: "Anomalie", color: "bg-primary/10 text-primary" };
      case "SYSTEM": return { icon: <Bell size={14} />, text: "Système", color: "bg-muted text-muted-foreground" };
      case "CUSTOM": return { icon: <Bell size={14} />, text: "Personnalisé", color: "bg-primary/10 text-primary" };
      default: return { icon: <Bell size={14} />, text: type, color: "bg-muted text-muted-foreground" };
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Alertes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Surveillance des alertes système</p>
      </div>

      <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-6">
              <div className="h-4 bg-muted rounded animate-pulse mb-2" />
              <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
            </div>
          ))
        ) : alerts?.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <CheckCircle size={48} className="mx-auto mb-4 text-success-foreground" />
            <h3 className="text-lg font-semibold text-foreground">Aucune alerte active</h3>
            <p className="mt-2 text-sm text-muted-foreground">Toutes les alertes ont été résolues</p>
          </div>
        ) : (
          alerts?.map((alert) => {
            const severity = getSeverityBadge(alert.severite ?? "MOYENNE");
            const type = getTypeBadge(alert.type);
            return (
              <motion.div key={alert.id} variants={item} className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${type.color}`}>
                        {type.icon} {type.text}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${severity.color}`}>
                        {severity.icon} {severity.text}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {alert.createdAt ? new Date(alert.createdAt).toLocaleString("fr-FR") : ""}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">{alert.titre}</h3>
                    <p className="text-foreground/80 mb-4">{alert.message}</p>
                  </div>
                  <button
                    onClick={() => resolveAlert.mutate({ alertId: alert.id })}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-success-foreground hover:bg-success/10 transition-colors"
                  >
                    <CheckCircle size={16} /> Résoudre
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </motion.div>
    </div>
  );
}
