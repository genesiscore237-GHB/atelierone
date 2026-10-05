"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { UserMinus, CheckCircle, X, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

function formatFCFA(amount: number) {
  return new Intl.NumberFormat("fr-CM").format(amount);
}

export default function DebtsPage() {
  const [filter, setFilter] = useState<"UNPAID" | "PARTIAL" | "PAID" | "OVERDUE" | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<"CASH" | "MOMO" | "OM">("CASH");

  const utils = api.useUtils();
  const { data: debts, isLoading } = api.finance.getDebts.useQuery({ status: filter, search: search || undefined });
  const { data: caissesOuvertes } = api.finance.getBalance.useQuery();
  const [payCaisseId, setPayCaisseId] = useState("");
  const payDebt = api.finance.payDebt.useMutation({
    onSuccess: () => {
      utils.finance.getDebts.invalidate();
      utils.finance.getBalance.invalidate();
      setShowPayModal(false);
      setPayAmount(0);
      setSelectedDebt(null);
      setPayCaisseId("");
      toast.success("Versement enregistré et crédité en caisse");
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedDebtData = debts?.find((d: { id: string }) => d.id === selectedDebt);

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Créances Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">Suivi des crédits et recouvrements</p>
        </div>
        <div className="flex gap-2">
          {(["UNPAID", "PARTIAL", "PAID", "OVERDUE"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(filter === s ? undefined : s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent dark:bg-muted dark:text-foreground/80 dark:hover:bg-muted"
              }`}
            >
              {s === "UNPAID" ? "Impayé" : s === "PARTIAL" ? "Partiel" : s === "PAID" ? "Payé" : "En retard"}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par client, équipement ou référence de vente..."
          className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-card outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : debts?.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <CheckCircle size={48} className="mx-auto mb-4 text-success-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Aucune créance</h3>
          <p className="mt-2 text-sm text-muted-foreground">Tous les clients sont à jour</p>
        </div>
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
          {debts?.map((debt: any) => {
            const progress = debt.amount > 0 ? ((debt.amount - debt.remaining) / debt.amount) * 100 : 0;
            const isOverdue = debt.isOverdue;
            return (
              <motion.div key={debt.id} variants={item} className={`rounded-xl border p-5 transition-all ${
                isOverdue ? "border-destructive/20 bg-destructive/10" : "border-border bg-card"
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <UserMinus size={16} className={isOverdue ? "text-destructive" : "text-muted-foreground"} />
                      <h3 className="font-semibold text-foreground">{debt.customerName}</h3>
                      {isOverdue && <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive dark:bg-destructive/10 dark:text-destructive"><AlertTriangle size={10} /> En retard</span>}
                      {debt.status === "PAID" && <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success-foreground dark:bg-success/10 dark:text-success-foreground"><CheckCircle size={10} /> Payé</span>}
                      {debt.status === "PARTIAL" && <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-foreground dark:bg-warning/10 dark:text-warning-foreground"><Clock size={10} /> Partiel</span>}
                    </div>
                    {debt.customerPhone && <p className="text-sm text-muted-foreground">{debt.customerPhone}</p>}
                    {debt.dueDate && <p className="text-xs text-muted-foreground mt-1">Échéance: {new Date(debt.dueDate).toLocaleDateString("fr-FR")}</p>}
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Reste à payer</p>
                      <p className="text-xl font-bold font-mono text-foreground">{formatFCFA(debt.remaining)} F</p>
                      <p className="text-xs text-muted-foreground">sur {formatFCFA(debt.amount)} F</p>
                    </div>

                    <div className="w-32">
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            progress >= 100 ? "bg-success" : progress >= 50 ? "bg-warning" : "bg-destructive"
                          }`}
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-center text-muted-foreground mt-1">{Math.round(progress)}% payé</p>
                    </div>

                    {debt.status !== "PAID" && (
                      <button
                        onClick={() => { setSelectedDebt(debt.id); setPayAmount(debt.remaining); setShowPayModal(true); }}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Encaisser
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Pay Debt Modal */}
      {showPayModal && selectedDebtData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowPayModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Enregistrer un versement</h2>
              <button onClick={() => setShowPayModal(false)} className="rounded-lg p-1.5 hover:bg-accent"><X size={18} /></button>
            </div>
            <div className="mb-4 rounded-lg bg-card p-3">
              <p className="text-sm text-muted-foreground">Client</p>
              <p className="font-semibold text-foreground">{selectedDebtData.customerName}</p>
              <p className="text-sm text-muted-foreground mt-1">Reste: <span className="font-mono font-bold">{formatFCFA(selectedDebtData.remaining)} F</span></p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Montant du versement (FCFA)</label>
                <input
                  type="number"
                  min={1}
                  max={selectedDebtData.remaining}
                  className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-card outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                  value={payAmount}
                  onChange={(e) => setPayAmount(parseInt(e.target.value) || 0)}
                />
                {payAmount > selectedDebtData.remaining && (
                  <p className="text-xs text-destructive mt-1">Le montant dépasse le reste à payer</p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { method: "CASH" as const, label: "Espèces" },
                  { method: "MOMO" as const, label: "MoMo" },
                  { method: "OM" as const, label: "OM" },
                ].map((m) => (
                  <button
                    key={m.method}
                    onClick={() => setPayMethod(m.method)}
                    className={`rounded-lg border p-2 text-xs font-medium transition-all ${
                      payMethod === m.method
                        ? "border-primary bg-primary/10 text-primary dark:bg-primary/10 dark:border-primary dark:text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Caisse de crédit</label>
                <select
                  value={payCaisseId}
                  onChange={(e) => setPayCaisseId(e.target.value)}
                  className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-card outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">Caisse ouverte (automatique)</option>
                  {(caissesOuvertes?.caisses ?? []).map((c: { id: string; libelle: string; soldeActuel: string }) => (
                    <option key={c.id} value={c.id}>{c.libelle} — {formatFCFA(Number(c.soldeActuel ?? 0))} F</option>
                  ))}
                </select>
                {(!caissesOuvertes || caissesOuvertes.caisses.length === 0) && (
                  <p className="mt-1 text-xs text-warning">Aucune caisse ouverte : ouvrez une session en Caisse avant d'encaisser.</p>
                )}
              </div>
              <button
                onClick={() => {
                  if (payAmount > selectedDebtData.remaining || payAmount < 1) return;
                  if (selectedDebt) payDebt.mutate({ debtId: selectedDebt, amount: payAmount, method: payMethod, caisseId: payCaisseId ? Number(payCaisseId) : undefined });
                }}
                disabled={payDebt.isPending || payAmount > selectedDebtData.remaining || payAmount < 1}
                className="w-full rounded-lg bg-success py-2.5 text-sm font-semibold text-success-foreground hover:bg-success/90 disabled:opacity-50 transition-colors"
              >
                {payDebt.isPending ? "Enregistrement..." : "Confirmer le versement"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
