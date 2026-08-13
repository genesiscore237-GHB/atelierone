"use client";

import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { BookOpen, Scale, TrendingUp, TrendingDown } from "lucide-react";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

function formatFCFA(amount: number) {
  return new Intl.NumberFormat("fr-CM").format(amount);
}

export default function FinancePage() {
  const { data: ledger, isLoading: ledgerLoading } = api.finance.getLedger.useQuery();
  const { data: balance, isLoading: balanceLoading } = api.finance.getBalance.useQuery();

  if (ledgerLoading || balanceLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-muted rounded animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  const isBalanced = (balance?.totalDebit ?? 0) === (balance?.totalCredit ?? 0);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Comptabilit&eacute;</h1>
        <p className="mt-1 text-sm text-muted-foreground">Grand livre et balance comptable</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp size={20} className="text-success-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Total D&eacute;bits</p>
            </div>
            <p className="text-2xl font-bold font-mono text-foreground">{formatFCFA(balance?.totalDebit ?? 0)} F</p>
          </motion.div>
        </motion.div>

        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <TrendingDown size={20} className="text-destructive" />
              <p className="text-sm font-medium text-muted-foreground">Total Cr&eacute;dits</p>
            </div>
            <p className="text-2xl font-bold font-mono text-foreground">{formatFCFA(balance?.totalCredit ?? 0)} F</p>
          </motion.div>
        </motion.div>

        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item} className={`rounded-xl border p-5 ${isBalanced ? "border-success/20 bg-success/10" : "border-destructive/20 bg-destructive/10"}`}>
            <div className="flex items-center gap-3 mb-2">
              <Scale size={20} className={isBalanced ? "text-success-foreground" : "text-destructive"} />
              <p className="text-sm font-medium text-muted-foreground">Balance</p>
            </div>
            <p className={`text-lg font-bold ${isBalanced ? "text-success-foreground" : "text-destructive"}`}>
              {isBalanced ? "Equilibrée" : "Déséquilibrée"}
            </p>
          </motion.div>
        </motion.div>
      </div>

      {/* Balance Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <BookOpen size={18} /> Balance des comptes
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Compte</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">D&eacute;bit</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Cr&eacute;dit</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Solde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {balance?.accounts?.map((acc: { id: string; code: string; name: string; type: string; totalDebit: number; totalCredit: number }) => {
                const solde = (acc.totalDebit ?? 0) - (acc.totalCredit ?? 0);
                return (
                  <tr key={acc.id} className="hover:bg-accent transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{acc.code}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{acc.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{acc.type}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-foreground">{formatFCFA(acc.totalDebit ?? 0)}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-foreground">{formatFCFA(acc.totalCredit ?? 0)}</td>
                    <td className={`px-4 py-3 text-right text-sm font-mono font-semibold ${solde >= 0 ? "text-success-foreground" : "text-destructive"}`}>
                      {formatFCFA(Math.abs(solde))} {solde >= 0 ? "D" : "C"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {balance?.accounts?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">Aucune écriture comptable</div>
          )}
        </div>
      </div>

      {/* Ledger */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <BookOpen size={18} /> Grand Livre
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Réf.</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">D&eacute;bit</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Cr&eacute;dit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(ledger?.entries as any[])?.map((entry: { id: string; date: Date; description: string; referenceType: string; totalDebit: number; totalCredit: number }) => (
                <tr key={entry.id} className="hover:bg-accent transition-colors">
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(entry.date).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{entry.description}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{entry.referenceType}</td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-foreground">{formatFCFA(entry.totalDebit ?? 0)}</td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-foreground">{formatFCFA(entry.totalCredit ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ledger?.entries?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">Aucune écriture comptable</div>
          )}
        </div>
      </div>
    </div>
  );
}
