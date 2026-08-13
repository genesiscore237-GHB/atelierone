"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { MinusCircle, Plus, X, TrendingUp, TrendingDown, Wallet, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "~/hooks/usePermissions";

const EXPENSE_CATEGORIES = ["Loyer", "Salaires", "Transport", "Fournitures", "Electricité", "Maintenance", "Divers"] as const;

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

function formatFCFA(amount: number) {
  return new Intl.NumberFormat("fr-CM").format(amount);
}

export default function TreasuryPage() {
  const { hasPermission } = usePermissions();
  const [activeTab, setActiveTab] = useState<"depenses" | "previsions">("depenses");
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseData, setExpenseData] = useState({ posId: "", category: "Divers" as typeof EXPENSE_CATEGORIES[number], amount: 0, description: "", paymentMethod: "CASH" as "CASH" | "BANK" | "MOMO", date: "", caisseId: "" });
  const [showPrevisionModal, setShowPrevisionModal] = useState(false);
  const [prevForm, setPrevForm] = useState({ type: "entree", categorie: "", montantPrevu: 0, datePrevision: "", libelle: "", notes: "" });

  const utils = api.useUtils();
  const { data: cashFlow, isLoading: cfLoading } = api.finance.getCashFlowSummary.useQuery();
  const { data: expenses, isLoading: expLoading } = api.finance.getExpenses.useQuery();
  const { data: posList } = api.settings.pos.list.useQuery();
  const { data: caissesOuvertes } = api.finance.getBalance.useQuery();
  const { data: synthese } = api.finance.getTresorerieSynthese.useQuery({});
  const { data: previsions } = api.finance.listPrevisions.useQuery({});

  const addExpense = api.finance.addExpense.useMutation({
    onSuccess: () => { utils.finance.getExpenses.invalidate(); utils.finance.getCashFlowSummary.invalidate(); utils.finance.getBalance.invalidate(); setShowExpenseModal(false); setExpenseData({ posId: "", category: "Divers", amount: 0, description: "", paymentMethod: "CASH", date: "", caisseId: "" }); },
    onError: (e) => toast.error(e.message),
  });

  const createPrevision = api.finance.createPrevision.useMutation({
    onSuccess: () => { utils.finance.listPrevisions.invalidate(); utils.finance.getTresorerieSynthese.invalidate(); setShowPrevisionModal(false); setPrevForm({ type: "entree", categorie: "", montantPrevu: 0, datePrevision: "", libelle: "", notes: "" }); toast.success("Prévision créée"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground dark:text-foreground">Trésorerie & Dépenses</h1>
          <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">Suivi des flux de trésorerie</p>
        </div>
        <div className="flex gap-2">
          {hasPermission("comptabilite.depense.creer") && (
            <button onClick={() => setShowPrevisionModal(true)} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary px-4 py-2.5 text-sm font-semibold text-foreground hover:from-primary/80 hover:to-primary/80 transition-all shadow-sm"><CalendarRange size={16} /> Nouvelle prévision</button>
          )}
          {hasPermission("comptabilite.depense.creer") && (
            <button onClick={() => setShowExpenseModal(true)} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-destructive to-destructive px-4 py-2.5 text-sm font-semibold text-foreground hover:from-destructive/80 hover:to-destructive/80 transition-all shadow-sm"><MinusCircle size={16} /> Dépense</button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item} className="rounded-xl border border-border bg-card p-5 dark:border-border dark:bg-card">
            <div className="flex items-center gap-3 mb-2"><TrendingUp size={20} className="text-success-foreground" /><p className="text-sm font-medium text-muted-foreground dark:text-muted-foreground">Entrées</p></div>
            <p className="text-2xl font-bold font-mono text-success-foreground dark:text-success-foreground">{formatFCFA(cashFlow?.totalIncome ?? 0)} F</p>
          </motion.div>
        </motion.div>
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item} className="rounded-xl border border-border bg-card p-5 dark:border-border dark:bg-card">
            <div className="flex items-center gap-3 mb-2"><TrendingDown size={20} className="text-destructive" /><p className="text-sm font-medium text-muted-foreground dark:text-muted-foreground">Sorties</p></div>
            <p className="text-2xl font-bold font-mono text-destructive dark:text-destructive">{formatFCFA(cashFlow?.totalExpenses ?? 0)} F</p>
          </motion.div>
        </motion.div>
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item} className={`rounded-xl border p-5 ${(cashFlow?.netCashFlow ?? 0) >= 0 ? "border-success/20 bg-success/10 dark:border-success/20 dark:bg-success/5" : "border-destructive/20 bg-destructive/10 dark:border-destructive/20 dark:bg-destructive/5"}`}>
            <div className="flex items-center gap-3 mb-2"><Wallet size={20} className={(cashFlow?.netCashFlow ?? 0) >= 0 ? "text-success-foreground" : "text-destructive"} /><p className="text-sm font-medium text-muted-foreground dark:text-muted-foreground">Solde net</p></div>
            <p className={`text-2xl font-bold font-mono ${(cashFlow?.netCashFlow ?? 0) >= 0 ? "text-success-foreground dark:text-success-foreground" : "text-destructive dark:text-destructive"}`}>
              {formatFCFA(Math.abs(cashFlow?.netCashFlow ?? 0))} F {(cashFlow?.netCashFlow ?? 0) >= 0 ? "+" : "-"}
            </p>
          </motion.div>
        </motion.div>
      </div>

      {/* Prévisions summary cards */}
      {synthese && (
        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <div className="rounded-xl border border-primary/20 bg-primary/10 p-4 dark:border-primary/20 dark:bg-primary/5">
            <p className="text-xs text-primary dark:text-primary font-medium">Entrées prévues</p>
            <p className="text-lg font-bold font-mono text-primary dark:text-primary/70">{formatFCFA(synthese.totalEntreesPrevues)} F</p>
          </div>
          <div className="rounded-xl border border-warning/20 bg-warning/10 p-4 dark:border-warning/20 dark:bg-warning/5">
            <p className="text-xs text-warning-foreground dark:text-warning-foreground font-medium">Sorties prévues</p>
            <p className="text-lg font-bold font-mono text-warning-foreground dark:text-warning-foreground/70">{formatFCFA(synthese.totalSortiesPrevues)} F</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 dark:border-border dark:bg-card">
            <p className="text-xs text-muted-foreground font-medium">Solde prévisionnel</p>
            <p className={`text-lg font-bold font-mono ${synthese.soldePrevu >= 0 ? "text-success-foreground" : "text-destructive"}`}>
              {formatFCFA(Math.abs(synthese.soldePrevu))} F {synthese.soldePrevu >= 0 ? "+" : "-"}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex rounded-lg bg-muted dark:bg-muted p-1">
        <button onClick={() => setActiveTab("depenses")} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === "depenses" ? "bg-card text-foreground shadow-sm dark:bg-muted dark:text-foreground" : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"}`}>Dépenses</button>
        <button onClick={() => setActiveTab("previsions")} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === "previsions" ? "bg-card text-foreground shadow-sm dark:bg-muted dark:text-foreground" : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"}`}>
          Prévisions {previsions?.length ? <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-foreground">{previsions.length}</span> : null}
        </button>
      </div>

      {/* Depenses Tab */}
      {activeTab === "depenses" && (
        <>
          {cashFlow?.expensesByCategory && cashFlow.expensesByCategory.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6 dark:border-border dark:bg-card mb-8">
              <h2 className="font-semibold text-foreground dark:text-foreground mb-4">Répartition des dépenses par catégorie</h2>
              <div className="space-y-3">
                {cashFlow.expensesByCategory.map((cat: { category: string; total: number }) => {
                  const maxTotal = Math.max(...cashFlow.expensesByCategory.map((c: { total: number }) => c.total));
                  return (
                    <div key={cat.category}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground/80 dark:text-foreground/80">{cat.category}</span>
                        <span className="text-sm font-mono text-foreground dark:text-foreground">{formatFCFA(cat.total)} F</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted dark:bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-destructive to-destructive/80 transition-all" style={{ width: `${maxTotal > 0 ? (cat.total / maxTotal) * 100 : 0}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card overflow-hidden dark:border-border dark:bg-card">
            <div className="px-6 py-4 border-b border-border dark:border-border"><h2 className="font-semibold text-foreground dark:text-foreground">Dépenses récentes</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 dark:bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Catégorie</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider hidden md:table-cell">Description</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 dark:divide-border">
                  {expLoading ? Array.from({ length: 5 }).map((_, i) => (<tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-4 bg-muted dark:bg-muted rounded animate-pulse" /></td></tr>))
                  : expenses?.length === 0 ? <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground dark:text-muted-foreground">Aucune dépense</td></tr>
                  : (expenses as any[])?.map((exp: any) => (
                    <tr key={exp.id} className="hover:bg-accent/30 dark:hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(exp.date).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-3"><span className="inline-block rounded-full bg-muted dark:bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground dark:text-foreground/80">{exp.category}</span></td>
                      <td className="px-4 py-3 text-sm text-muted-foreground dark:text-foreground/80 hidden md:table-cell">{exp.description}</td>
                      <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-destructive">-{formatFCFA(exp.amount)} F</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Previsions Tab */}
      {activeTab === "previsions" && (
        <div className="overflow-x-auto rounded-xl border border-border dark:border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 dark:bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground">Libellé</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground">Type</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground">Prévu</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground">Réel</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground">Date</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground">Statut</th>
              </tr>
            </thead>
            <tbody>
              {!previsions?.length ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground dark:text-muted-foreground"><CalendarRange size={32} className="mx-auto mb-2 opacity-50" />Aucune prévision</td></tr>
              ) : (
                previsions.map((p: any) => (
                  <motion.tr key={p.id} variants={item} className="border-t border-border/50 dark:border-border hover:bg-accent/30 dark:hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{p.libelle}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${p.type === "entree" ? "bg-success/10 text-success-foreground dark:bg-success/10 dark:text-success-foreground" : "bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive"}`}>
                        {p.type === "entree" ? "Entrée" : "Sortie"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{Number(p.montantPrevu).toLocaleString()} F</td>
                    <td className="px-4 py-3 text-right font-mono">{p.montantReel ? `${Number(p.montantReel).toLocaleString()} F` : "—"}</td>
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground">{p.datePrevision ? new Date(p.datePrevision).toLocaleDateString("fr-FR") : "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        p.statut === "realise" ? "bg-success/20 text-success-foreground dark:bg-success/10 dark:text-success-foreground"
                        : p.statut === "annule" ? "bg-destructive/20 text-destructive dark:bg-destructive/10 dark:text-destructive"
                        : p.statut === "depasse" ? "bg-warning/20 text-warning-foreground dark:bg-warning/10 dark:text-warning-foreground"
                        : "bg-primary/20 text-primary dark:bg-primary/10 dark:text-primary"
                      }`}>{p.statut ?? "prévu"}</span>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowExpenseModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl bg-card dark:bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground dark:text-foreground">Enregistrer une dépense</h2>
              <button onClick={() => setShowExpenseModal(false)} className="rounded-lg p-1.5 hover:bg-muted dark:hover:bg-accent"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addExpense.mutate({ categorie: expenseData.category, montant: expenseData.amount, description: expenseData.description, modePaiement: expenseData.paymentMethod.toLowerCase() as "especes" | "carte" | "momo" | "om", caisseId: expenseData.caisseId ? Number(expenseData.caisseId) : undefined } as any); }} className="space-y-4">
              <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-destructive/20 focus:border-destructive" value={expenseData.category} onChange={(e) => setExpenseData({ ...expenseData, category: e.target.value as typeof EXPENSE_CATEGORIES[number] })}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" min={1} placeholder="Montant (FCFA)" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-destructive/20 focus:border-destructive font-mono" value={expenseData.amount || ""} onChange={(e) => setExpenseData({ ...expenseData, amount: parseInt(e.target.value) || 0 })} required />
              <textarea placeholder="Description" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-destructive/20 focus:border-destructive" value={expenseData.description} onChange={(e) => setExpenseData({ ...expenseData, description: e.target.value })} required rows={2} />
              <div className="grid grid-cols-3 gap-2">
                {[{ method: "CASH" as const, label: "Espèces" }, { method: "BANK" as const, label: "Banque" }, { method: "MOMO" as const, label: "MoMo" }].map((m) => (
                  <button key={m.method} type="button" onClick={() => setExpenseData({ ...expenseData, paymentMethod: m.method })} className={`rounded-lg border p-2 text-xs font-medium transition-all ${expenseData.paymentMethod === m.method ? "border-destructive bg-destructive/10 text-destructive dark:bg-destructive/10 dark:border-destructive/60 dark:text-destructive" : "border-border dark:border-border text-muted-foreground dark:text-foreground/80"}`}>{m.label}</button>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Caisse de débit</label>
                <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-destructive/20 focus:border-destructive" value={expenseData.caisseId} onChange={(e) => setExpenseData({ ...expenseData, caisseId: e.target.value })}>
                  <option value="">Caisse ouverte (automatique)</option>
                  {(caissesOuvertes?.caisses ?? []).map((c: { id: string; libelle: string; soldeActuel: string }) => (
                    <option key={c.id} value={c.id}>{c.libelle} — {formatFCFA(Number(c.soldeActuel ?? 0))} F</option>
                  ))}
                </select>
                {(!caissesOuvertes || caissesOuvertes.caisses.length === 0) && (
                  <p className="mt-1 text-xs text-warning">Aucune caisse ouverte : ouvrez une session en Caisse avant de dépenser.</p>
                )}
              </div>
              <button type="submit" disabled={addExpense.isPending || expenseData.amount < 1} className="w-full rounded-lg bg-gradient-to-r from-destructive to-destructive py-2.5 text-sm font-semibold text-foreground hover:from-destructive/80 hover:to-destructive/80 disabled:opacity-50 transition-all">
                {addExpense.isPending ? "Enregistrement..." : "Enregistrer"}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Prevision Modal */}
      {showPrevisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowPrevisionModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl bg-card dark:bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground dark:text-foreground">Nouvelle prévision</h2>
              <button onClick={() => setShowPrevisionModal(false)} className="rounded-lg p-1.5 hover:bg-muted dark:hover:bg-accent"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createPrevision.mutate(prevForm); }} className="space-y-4">
              <input placeholder="Libellé *" required className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={prevForm.libelle} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrevForm({ ...prevForm, libelle: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setPrevForm({ ...prevForm, type: "entree" })} className={`rounded-lg border p-3 text-sm font-medium transition-all ${prevForm.type === "entree" ? "border-success bg-success/10 text-success-foreground dark:bg-success/10 dark:border-success/60" : "border-border dark:border-border text-muted-foreground"}`}>Entrée</button>
                <button type="button" onClick={() => setPrevForm({ ...prevForm, type: "sortie" })} className={`rounded-lg border p-3 text-sm font-medium transition-all ${prevForm.type === "sortie" ? "border-destructive bg-destructive/10 text-destructive dark:bg-destructive/10 dark:border-destructive/60" : "border-border dark:border-border text-muted-foreground"}`}>Sortie</button>
              </div>
              <input type="number" min={1} placeholder="Montant prévu *" required className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono" value={prevForm.montantPrevu || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrevForm({ ...prevForm, montantPrevu: Number(e.target.value) })} />
              <input type="date" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={prevForm.datePrevision} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrevForm({ ...prevForm, datePrevision: e.target.value })} required />
              <input placeholder="Catégorie (optionnel)" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={prevForm.categorie} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrevForm({ ...prevForm, categorie: e.target.value })} />
              <textarea placeholder="Notes" rows={2} className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={prevForm.notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrevForm({ ...prevForm, notes: e.target.value })} />
              <button type="submit" disabled={createPrevision.isPending} className="w-full rounded-lg bg-gradient-to-r from-primary to-primary py-2.5 text-sm font-semibold text-foreground hover:from-primary/80 hover:to-primary/80 disabled:opacity-50 transition-all">
                {createPrevision.isPending ? "Création..." : "Créer la prévision"}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}