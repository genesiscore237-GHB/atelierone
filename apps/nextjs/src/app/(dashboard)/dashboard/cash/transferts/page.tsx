"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Plus, Search, X, ArrowRightLeft, CheckCircle, Clock } from "lucide-react";
import { toast } from "sonner";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function TransfertsPage() {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ caisseSourceId: 0, caisseDestId: 0, montant: 0, motif: "" });
  const utils = api.useUtils();

  const { data: transferts, isLoading } = api.cash.listTransferts.useQuery({});
  const { data: caisses } = api.cash.listCaisses.useQuery();

  const createTransfert = api.cash.createTransfert.useMutation({
    onSuccess: () => {
      utils.cash.listTransferts.invalidate();
      setShowModal(false);
      setForm({ caisseSourceId: 0, caisseDestId: 0, montant: 0, motif: "" });
      toast.success("Transfert effectué");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Transferts entre caisses</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gérez les mouvements d'argent entre caisses</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
        >
          <Plus size={16} /> Nouveau transfert
        </button>
      </div>

      {/* Search */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
        <input
          placeholder="Rechercher un transfert..."
          className="w-full rounded-xl border border-input bg-background pl-10 pr-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Transferts Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Réf.</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Destination</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Montant</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Motif</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Statut</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-t border-border">
                  <td colSpan={7} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                </tr>
              ))
            ) : !transferts?.length ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-muted-foreground">
                  <ArrowRightLeft size={32} className="mx-auto mb-2 opacity-50" />
                  Aucun transfert
                </td>
              </tr>
            ) : (
              transferts.map((t: any) => {
                const source = caisses?.find(c => c.id === t.caisseSourceId);
                const dest = caisses?.find(c => c.id === t.caisseDestId);
                return (
                  <motion.tr key={t.id} variants={item} className="border-t border-border hover:bg-accent transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.reference}</td>
                    <td className="px-4 py-3 font-medium">{source?.libelle ?? `Caisse #${t.caisseSourceId}`}</td>
                    <td className="px-4 py-3 font-medium">{dest?.libelle ?? `Caisse #${t.caisseDestId}`}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-primary">{Number(t.montant).toLocaleString()} F</td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-muted-foreground">{t.motif || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        t.statut === "effectue" ? "bg-success/10 text-success-foreground"
                        : "bg-muted text-foreground/80"
                      }`}>
                        {t.statut === "effectue" ? <CheckCircle size={12} /> : <Clock size={12} />}
                        {t.statut === "effectue" ? "Effectué" : t.statut}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">{t.createdAt ? new Date(t.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                  </motion.tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Transfert Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Nouveau transfert</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 hover:bg-accent"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              createTransfert.mutate(form);
            }} className="space-y-4">
              <select className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.caisseSourceId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, caisseSourceId: Number(e.target.value) })} required>
                <option value={0}>Caisse source *</option>
                {caisses?.map((c: any) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
              </select>
              <select className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.caisseDestId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, caisseDestId: Number(e.target.value) })} required>
                <option value={0}>Caisse destination *</option>
                {caisses?.map((c: any) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
              </select>
              <input type="number" min={1} placeholder="Montant (FCFA)" required
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono"
                value={form.montant || ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, montant: Number(e.target.value) })} />
              <textarea placeholder="Motif du transfert" required rows={2}
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                value={form.motif}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, motif: e.target.value })} />
              <button type="submit" disabled={createTransfert.isPending || form.caisseSourceId === form.caisseDestId || form.caisseSourceId === 0 || form.caisseDestId === 0}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all">
                {createTransfert.isPending ? "Transfert..." : "Effectuer le transfert"}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}