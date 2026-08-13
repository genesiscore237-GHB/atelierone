"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Plus, Search, X, AlertTriangle, Gavel } from "lucide-react";
import { toast } from "sonner";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function SanctionsPage() {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ employeId: 0, typeSanction: "avertissement", motif: "", gravite: "MOYENNE", dateSanction: "", dateDebutEffet: "", dateFinEffet: "", dureeJours: 0, detailsFinanciers: 0 });
  const utils = api.useUtils();

  const { data: sanctions, isLoading } = api.rh.listSanctions.useQuery({});
  const { data: employes } = api.rh.list.useQuery({});

  const createSanction = api.rh.createSanction.useMutation({
    onSuccess: () => { utils.rh.listSanctions.invalidate(); setShowModal(false); setForm({ employeId: 0, typeSanction: "avertissement", motif: "", gravite: "MOYENNE", dateSanction: "", dateDebutEffet: "", dateFinEffet: "", dureeJours: 0, detailsFinanciers: 0 }); toast.success("Sanction enregistrée"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  function getTypeLabel(t: string) {
    const map: Record<string, string> = { avertissement: "Avertissement", blame: "Blâme", mise_a_pied: "Mise à pied", retenue_salaire: "Retenue salaire", licenciement: "Licenciement" };
    return map[t] ?? t;
  }

  function getGraviteBadge(g: string) {
    switch (g) {
      case "LEGERE": return "bg-muted text-foreground/80 dark:bg-muted/10 dark:text-muted-foreground";
      case "GRAVE": return "bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive";
      default: return "bg-warning/10 text-warning-foreground dark:bg-warning/10 dark:text-warning-foreground";
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Sanctions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestion des sanctions disciplinaires</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-destructive to-destructive px-4 py-2.5 text-sm font-semibold text-foreground hover:from-destructive/80 hover:to-destructive/80 transition-all shadow-sm"><Plus size={16} /> Nouvelle sanction</button>
      </div>

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
        <input placeholder="Rechercher..." className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary dark:bg-card dark:border-border dark:text-foreground transition-all" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Employé</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Motif</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Gravité</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Date</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Détail</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-t border-border"><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
              ))
            ) : !sanctions?.length ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground"><Gavel size={32} className="mx-auto mb-2 opacity-50" />Aucune sanction</td></tr>
            ) : (
              sanctions.map((s: any) => (
                <motion.tr key={s.id} variants={item} className="border-t border-border hover:bg-accent transition-colors">
                  <td className="px-4 py-3 font-medium">{s.employeId}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-destructive/10 dark:bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">{getTypeLabel(s.typeSanction)}</span></td>
                  <td className="px-4 py-3 max-w-[200px] truncate text-muted-foreground">{s.motif}</td>
                  <td className="px-4 py-3 text-center"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getGraviteBadge(s.gravite)}`}>{s.gravite}</span></td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground">{s.dateSanction ? new Date(s.dateSanction).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{s.detailsFinanciers ? `${Number(s.detailsFinanciers).toLocaleString()} F` : s.dureeJours ? `${s.dureeJours}j` : "—"}</td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl bg-background dark:bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Nouvelle sanction</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 hover:bg-accent"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createSanction.mutate(form); }} className="space-y-4">
              <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-destructive/30 focus:border-destructive" value={form.employeId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, employeId: Number(e.target.value) })} required>
                <option value={0}>Employé *</option>
                {employes?.map((e: any) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
              </select>
              <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-destructive/30 focus:border-destructive" value={form.typeSanction} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, typeSanction: e.target.value })}>
                <option value="avertissement">Avertissement</option><option value="blame">Blâme</option><option value="mise_a_pied">Mise à pied</option><option value="retenue_salaire">Retenue salaire</option><option value="licenciement">Licenciement</option>
              </select>
              <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-destructive/30 focus:border-destructive" value={form.gravite} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, gravite: e.target.value })}>
                <option value="LEGERE">Légère</option><option value="MOYENNE">Moyenne</option><option value="GRAVE">Grave</option>
              </select>
              <textarea placeholder="Motif *" required rows={2} className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-destructive/30 focus:border-destructive" value={form.motif} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, motif: e.target.value })} />
              <input type="date" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-destructive/30 focus:border-destructive" value={form.dateSanction} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, dateSanction: e.target.value })} required />
              <input type="number" placeholder="Montant financier (optionnel)" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-destructive/30 focus:border-destructive font-mono" value={form.detailsFinanciers || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, detailsFinanciers: Number(e.target.value) })} />
              <button type="submit" disabled={createSanction.isPending} className="w-full rounded-lg bg-gradient-to-r from-destructive to-destructive py-2.5 text-sm font-semibold text-foreground hover:from-destructive/80 hover:to-destructive/80 disabled:opacity-50 transition-all">
                {createSanction.isPending ? "Enregistrement..." : "Enregistrer"}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}