"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Plus, ClipboardList, CheckCircle, Clock, AlertTriangle, X, Eye, Play } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "~/hooks/usePermissions";

export default function InventairePage() {
  const { hasPermission } = usePermissions();
  const [showModal, setShowModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [formData, setFormData] = useState({ libelle: "", notes: "" });
  const [countForm, setCountForm] = useState({ produitId: "", uniteId: "", quantiteReelle: 0, commentaire: "" });

  const utils = api.useUtils();
  const { data: sessions, isLoading } = api.stock.listSessionsInventaire.useQuery();
  const { data: sessionDetail } = api.stock.getSessionInventaire.useQuery(
    { id: selectedSession! },
    { enabled: !!selectedSession }
  );
  const { data: produits } = api.catalog.listProducts.useQuery();
  const { data: unites } = api.reference.listUnitesMesure.useQuery();

  const createSession = api.stock.createSessionInventaire.useMutation({
    onSuccess: () => {
      utils.stock.listSessionsInventaire.invalidate();
      setShowModal(false);
      setFormData({ libelle: "", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const compter = api.stock.compterProduit.useMutation({
    onSuccess: () => {
      selectedSession && utils.stock.getSessionInventaire.invalidate({ id: selectedSession });
      setCountForm({ produitId: "", uniteId: "", quantiteReelle: 0, commentaire: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const valider = api.stock.validerSession.useMutation({
    onSuccess: () => {
      utils.stock.listSessionsInventaire.invalidate();
      selectedSession && utils.stock.getSessionInventaire.invalidate({ id: selectedSession });
    },
    onError: (e) => toast.error(e.message),
  });

  const statusConfig: Record<string, { icon: any; label: string; color: string }> = {
    en_cours: { icon: Clock, label: "En cours", color: "bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary" },
    valide: { icon: CheckCircle, label: "Validé", color: "bg-success/10 text-success-foreground dark:bg-success/10 dark:text-success-foreground" },
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Sessions d'inventaire</h2>
        {hasPermission("stock.inventaire") && (
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary px-4 py-2 text-sm font-semibold text-foreground hover:from-primary/80 hover:to-primary/80 transition-all">
            <Plus size={16} /> Nouvelle session
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 dark:bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Session</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}><td colSpan={4} className="px-4 py-4"><div className="h-4 bg-muted/50 dark:bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : sessions?.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                    <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Aucune session</p>
                    <p className="text-sm mt-1">Créez votre première session d'inventaire</p>
                  </td></tr>
                ) : (
                  sessions?.map((s) => {
                    const status = statusConfig[s.statut] ?? { icon: Clock, label: s.statut, color: "bg-muted/50 text-foreground/80" };
                    const Icon = status.icon;
                    return (
                      <tr key={s.id} className="hover:bg-accent/10 dark:hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-foreground">{s.libelle ?? `Session #${s.id}`}</p>
                          {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>
                            <Icon size={12} /> {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground dark:text-foreground/80">
                          {s.dateDebut ? new Date(s.dateDebut).toLocaleDateString("fr-FR") : "-"}
                          {s.dateFin && <span className="text-xs text-muted-foreground block">Fin: {new Date(s.dateFin).toLocaleDateString("fr-FR")}</span>}
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          <button
                            onClick={() => setSelectedSession(selectedSession === s.id ? null : s.id)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 dark:text-primary dark:hover:bg-primary/10 transition-colors"
                          >
                            <Eye size={14} /> Détails
                          </button>
                          {s.statut === "en_cours" && hasPermission("stock.inventaire") && (
                            <button
                              onClick={() => valider.mutate({ id: s.id })}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-success-foreground hover:bg-success/10 dark:text-success-foreground dark:hover:bg-success/10 transition-colors"
                            >
                              <CheckCircle size={14} /> Valider
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selectedSession ? (
          <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                {sessionDetail?.libelle ?? "Détails session"}
              </h3>
              <span className="text-xs text-muted-foreground">{sessionDetail?.totalProduits ?? 0} produits, {sessionDetail?.totalEcarts ?? 0} écarts</span>
            </div>

            <div className="mb-4 rounded-lg bg-muted/50 dark:bg-muted/50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Produit</label>
                  <select className="w-full rounded-lg border border-border/50 dark:border-border bg-background dark:bg-muted px-3 py-1.5 text-xs text-foreground outline-none" value={countForm.produitId} onChange={(e) => setCountForm({ ...countForm, produitId: e.target.value })}>
                    <option value="">Sélectionner</option>
                    {produits?.map((p: any) => <option key={p.id} value={p.id}>{p.titre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Qté réelle</label>
                  <input type="number" min={0} className="w-full rounded-lg border border-border/50 dark:border-border bg-background dark:bg-muted px-3 py-1.5 text-xs text-foreground outline-none" value={countForm.quantiteReelle || ""} onChange={(e) => setCountForm({ ...countForm, quantiteReelle: Number(e.target.value) })} />
                </div>
              </div>
              <div className="mt-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Unité de comptage (optionnel)</label>
                <select className="w-full rounded-lg border border-border/50 dark:border-border bg-background dark:bg-muted px-3 py-1.5 text-xs text-foreground outline-none" value={countForm.uniteId} onChange={(e) => setCountForm({ ...countForm, uniteId: e.target.value })}>
                  <option value="">Unité de base (défaut)</option>
                  {unites?.map((u: any) => <option key={u.id} value={u.id}>{u.nom} ({u.code})</option>)}
                </select>
              </div>
              {hasPermission("stock.inventaire") && (
                <button
                  onClick={() => countForm.produitId && compter.mutate({ sessionId: selectedSession, produitId: countForm.produitId, uniteId: countForm.uniteId || undefined, quantiteReelle: countForm.quantiteReelle, commentaire: countForm.commentaire })}
                  disabled={!countForm.produitId || compter.isPending}
                  className="mt-2 w-full rounded-lg bg-primary py-1.5 text-xs font-semibold text-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors"
                >
                  {compter.isPending ? "..." : "Enregistrer le comptage"}
                </button>
              )}
            </div>

            <div className="space-y-1 max-h-96 overflow-y-auto">
              {sessionDetail?.comptages?.map((c: any) => {
                const ecart = Number(c.ecart ?? 0);
                return (
                  <div key={c.id} className="flex items-center justify-between rounded-lg bg-muted/50 dark:bg-muted/50 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{c.titre ?? `#${c.produitId}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.codeBarre}
                        {c.codeUnite && <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 dark:bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary dark:text-primary">{c.codeUnite}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-right shrink-0">
                      <div>
                        <p className="text-xs text-muted-foreground">Théorique</p>
                        <p className="text-sm font-mono">{c.quantiteTheorique}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Réel</p>
                        <p className="text-sm font-mono">{c.quantiteReelle}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Écart</p>
                        <p className={`text-sm font-mono font-bold ${ecart === 0 ? "text-success-foreground" : ecart > 0 ? "text-primary" : "text-destructive"}`}>
                          {ecart > 0 ? "+" : ""}{ecart}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {(!sessionDetail?.comptages || sessionDetail.comptages.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun comptage enregistré</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-border dark:border-border bg-background dark:bg-card p-8">
            <div className="text-center">
              <Eye size={40} className="mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">Sélectionnez une session pour voir les détails et enregistrer des comptages</p>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl bg-background dark:bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Nouvelle session d'inventaire</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 hover:bg-accent dark:hover:bg-accent"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createSession.mutate({ libelle: formData.libelle, notes: formData.notes }); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Libellé</label>
                <input type="text" className="w-full rounded-lg border border-border/50 dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" value={formData.libelle} onChange={(e) => setFormData({ ...formData, libelle: e.target.value })} placeholder={`Inventaire du ${new Date().toLocaleDateString("fr-FR")}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Notes</label>
                <textarea rows={3} className="w-full rounded-lg border border-border/50 dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Notes optionnelles" />
              </div>
              <button type="submit" disabled={createSession.isPending} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
                {createSession.isPending ? "Création..." : "Créer la session"}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
