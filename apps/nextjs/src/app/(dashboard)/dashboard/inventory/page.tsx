"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Plus, Search, ClipboardList, CheckCircle, Clock, AlertTriangle, X, Play, Pause, Eye } from "lucide-react";
import { toast } from "sonner";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<"sessions" | "counts">("sessions");
  const [showModal, setShowModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "Session inventaire",
    siteId: "",
    notes: ""
  });

  const utils = api.useUtils();
  const { data: sessions, isLoading: sessionsLoading } = api.inventory.getInventorySessions.useQuery();
  const { data: counts, isLoading: countsLoading } = api.inventory.getInventoryCounts.useQuery(
    { sessionId: selectedSession || "" }, 
    { enabled: !!selectedSession && activeTab === "counts" }
  );
  const { data: posList } = api.settings.pos.list.useQuery();

  const createSession = api.inventory.startInventorySession.useMutation({
    onSuccess: () => {
      utils.inventory.getInventorySessions.invalidate();
      setShowModal(false);
      setFormData({ name: "Session inventaire", siteId: "", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const startSession = api.inventory.beginInventoryCount.useMutation({
    onSuccess: () => utils.inventory.getInventorySessions.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const completeSession = api.inventory.completeInventorySession.useMutation({
    onSuccess: () => {
      utils.inventory.getInventorySessions.invalidate();
      if (selectedSession) {
        utils.inventory.getInventoryCounts.invalidate();
      }
    },
    onError: (e) => toast.error(e.message),
  });

  function getStatusBadge(status: string) {
    switch (status) {
      case "OPEN": return { icon: <Clock size={14} />, text: "Ouvert", color: "bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary" };
      case "COUNTING": return { icon: <ClipboardList size={14} />, text: "Comptage", color: "bg-warning/20 text-warning-foreground dark:bg-warning/10 dark:text-warning-foreground" };
      case "REVIEW": return { icon: <Eye size={14} />, text: "Révision", color: "bg-primary/20 text-primary dark:bg-primary/10 dark:text-primary" };
      case "APPROVED": return { icon: <CheckCircle size={14} />, text: "Approuvé", color: "bg-success/20 text-success-foreground dark:bg-success/10 dark:text-success-foreground" };
      case "COMPLETED": return { icon: <CheckCircle size={14} />, text: "Terminé", color: "bg-success/20 text-success-foreground dark:bg-success/10 dark:text-success-foreground" };
      default: return { icon: <Clock size={14} />, text: status, color: "bg-muted text-foreground/80" };
    }
  }

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground dark:text-foreground">Inventaires</h1>
          <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">Gérez les sessions d'inventaire et les comptages</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary px-4 py-2.5 text-sm font-semibold text-foreground hover:from-primary/80 hover:to-primary/80 transition-all shadow-sm">
          <Plus size={16} /> Nouvelle session
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex rounded-lg bg-muted dark:bg-muted p-1">
        <button
          onClick={() => { setActiveTab("sessions"); setSelectedSession(null); }}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "sessions"
              ? "bg-background text-foreground shadow-sm dark:bg-muted dark:text-foreground"
              : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
          }`}
        >
          Sessions
        </button>
        <button
          onClick={() => setActiveTab("counts")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "counts"
              ? "bg-background text-foreground shadow-sm dark:bg-muted dark:text-foreground"
              : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
          }`}
        >
          Comptages
        </button>
      </div>

      {/* Sessions Tab */}
      {activeTab === "sessions" && (
        <motion.div variants={container} initial="hidden" animate="show" className="rounded-xl border border-border bg-background overflow-hidden dark:border-border dark:bg-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted dark:bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Session</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider hidden md:table-cell">Site</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Créée par</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-border">
                {sessionsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="px-4 py-4"><div className="h-4 bg-muted dark:bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : sessions?.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground dark:text-muted-foreground">
                    <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Aucune session d'inventaire</p>
                    <p className="text-sm mt-1">Créez votre première session</p>
                  </td></tr>
                ) : (
                  sessions?.map((session) => {
                    const status = getStatusBadge(session.status);
                    return (
                      <motion.tr key={session.id} variants={item} className="hover:bg-muted dark:hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-foreground dark:text-foreground">#{session.id.slice(-8)}</p>
                          {session.notes && <p className="text-xs text-muted-foreground dark:text-muted-foreground">{session.notes}</p>}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <p className="text-sm text-muted-foreground dark:text-foreground/80">{session.posId || 'N/A'}</p>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <p className="text-sm text-muted-foreground dark:text-foreground/80">{session.startedBy || 'N/A'}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>
                            {status.icon} {status.text}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-muted-foreground dark:text-foreground/80">
                            {new Date(session.startedAt).toLocaleDateString("fr-FR")}
                          </p>
                          {session.completedAt && (
                            <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                              Terminé: {new Date(session.completedAt).toLocaleDateString("fr-FR")}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          {session.status === "OPEN" && (
                            <button
                              onClick={() => startSession.mutate({ sessionId: session.id })}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 dark:text-primary dark:hover:bg-primary/10 transition-colors"
                            >
                              <Play size={14} /> Démarrer
                            </button>
                          )}
                          {session.status === "COUNTING" && (
                            <>
                              <button
                                onClick={() => { setSelectedSession(session.id); setActiveTab("counts"); }}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 dark:text-primary dark:hover:bg-primary/10 transition-colors"
                              >
                                <Eye size={14} /> Voir comptages
                              </button>
                              <button
                                onClick={() => completeSession.mutate({ sessionId: session.id })}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-success-foreground hover:bg-success/10 dark:text-success-foreground dark:hover:bg-success/10 transition-colors"
                              >
                                <CheckCircle size={14} /> Terminer
                              </button>
                            </>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Counts Tab */}
      {activeTab === "counts" && (
        <div>
          {selectedSession ? (
            <motion.div variants={container} initial="hidden" animate="show" className="rounded-xl border border-border bg-background overflow-hidden dark:border-border dark:bg-card">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted dark:bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Produit</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Système</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Compté</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Écart</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Compté par</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border dark:divide-border">
                    {countsLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}><td colSpan={6} className="px-4 py-4"><div className="h-4 bg-muted dark:bg-muted rounded animate-pulse" /></td></tr>
                      ))
                    ) : counts?.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground dark:text-muted-foreground">
                        <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="font-medium">Aucun comptage</p>
                        <p className="text-sm mt-1">Les comptages apparaîtront ici</p>
                      </td></tr>
                    ) : (
                      counts?.map((count) => {
                        const discrepancy = Number(count.countedQuantity) - Number(count.systemQuantity);
                        return (
                          <motion.tr key={count.id} variants={item} className="hover:bg-muted dark:hover:bg-accent/30 transition-colors">
                             <td className="px-4 py-3">
                                <p className="text-sm font-medium text-foreground dark:text-foreground">{count.productTitle || 'Produit inconnu'}</p>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <span className="text-sm font-mono text-muted-foreground dark:text-foreground/80">{count.systemQuantity}</span>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <span className="text-sm font-mono text-foreground dark:text-foreground">{count.countedQuantity}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`text-sm font-mono ${discrepancy === 0 ? 'text-success-foreground' : discrepancy > 0 ? 'text-primary' : 'text-destructive'}`}>
                                {discrepancy > 0 ? '+' : ''}{discrepancy}
                              </span>
                            </td>

                          </motion.tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <ClipboardList size={40} className="mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground dark:text-muted-foreground">Sélectionnez une session pour voir les comptages</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Session Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl bg-background dark:bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground dark:text-foreground">Nouvelle session d'inventaire</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 hover:bg-muted dark:hover:bg-accent"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createSession.mutate({
              name: formData.name,
              siteId: formData.siteId,
            }); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">Point de vente</label>
                <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={formData.siteId} onChange={(e) => setFormData({ ...formData, siteId: e.target.value })} required>
                  <option value="">Sélectionner un site</option>
                  {posList?.map((pos) => <option key={pos.id} value={pos.id}>{pos.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">Notes</label>
                <textarea rows={3} placeholder="Instructions spéciales..." className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
              </div>

              <button type="submit" disabled={createSession.isPending} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
                {createSession.isPending ? "Création..." : "Créer la session"}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}