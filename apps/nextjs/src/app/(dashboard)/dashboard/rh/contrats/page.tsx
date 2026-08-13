"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Plus, Search, X, FileText, CheckCircle, Clock } from "lucide-react";
import { toast } from "sonner";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function ContratsPage() {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ employeId: 0, typeContrat: "CDI", dateDebut: "", dateFin: "", dureeMois: 0, salaireBase: "", poste: "", notes: "" });
  const utils = api.useUtils();

  const { data: contrats, isLoading } = api.rh.listContrats.useQuery({});
  const { data: employes } = api.rh.list.useQuery({});

  const createContrat = api.rh.createContrat.useMutation({
    onSuccess: () => { utils.rh.listContrats.invalidate(); setShowModal(false); setForm({ employeId: 0, typeContrat: "CDI", dateDebut: "", dateFin: "", dureeMois: 0, salaireBase: "", poste: "", notes: "" }); toast.success("Contrat créé"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Contrats</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestion des contrats de travail</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary px-4 py-2.5 text-sm font-semibold text-foreground hover:from-primary/80 hover:to-primary/80 transition-all shadow-sm"><Plus size={16} /> Nouveau contrat</button>
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
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Poste</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Début</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Fin</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Salaire</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Statut</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-t border-border"><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
              ))
            ) : !contrats?.length ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground"><FileText size={32} className="mx-auto mb-2 opacity-50" />Aucun contrat</td></tr>
            ) : (
              contrats.map((c: any) => (
                <motion.tr key={c.id} variants={item} className="border-t border-border hover:bg-accent transition-colors">
                  <td className="px-4 py-3 font-medium">{c.employeId}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-primary/10 dark:bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{c.typeContrat}</span></td>
                  <td className="px-4 py-3 text-muted-foreground">{c.poste || "—"}</td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground">{c.dateDebut ? new Date(c.dateDebut).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground">{c.dateFin ? new Date(c.dateFin).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{c.salaireBase ? `${Number(c.salaireBase).toLocaleString()} F` : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.statut === "actif" ? "bg-success/10 text-success-foreground dark:bg-success/10 dark:text-success-foreground" : "bg-muted text-foreground/80 dark:bg-muted/50 dark:text-muted-foreground"}`}>
                      {c.statut === "actif" ? <CheckCircle size={12} /> : <Clock size={12} />} {c.statut === "actif" ? "Actif" : c.statut}
                    </span>
                  </td>
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
              <h2 className="text-lg font-bold text-foreground">Nouveau contrat</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 hover:bg-accent"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createContrat.mutate(form); }} className="space-y-4">
              <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.employeId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, employeId: Number(e.target.value) })} required>
                <option value={0}>Employé *</option>
                {employes?.map((e: any) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
              </select>
              <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.typeContrat} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, typeContrat: e.target.value })}>
                <option value="CDI">CDI</option><option value="CDD">CDD</option><option value="stage">Stage</option><option value="temporaire">Temporaire</option><option value="prestation">Prestation</option>
              </select>
              <input placeholder="Poste" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.poste} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, poste: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" className="rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.dateDebut} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, dateDebut: e.target.value })} required />
                <input type="date" className="rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.dateFin} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, dateFin: e.target.value })} />
              </div>
              <input type="number" placeholder="Salaire de base (FCFA)" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono" value={form.salaireBase} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, salaireBase: e.target.value })} />
              <button type="submit" disabled={createContrat.isPending} className="w-full rounded-lg bg-gradient-to-r from-primary to-primary py-2.5 text-sm font-semibold text-foreground hover:from-primary/80 hover:to-primary/80 disabled:opacity-50 transition-all">
                {createContrat.isPending ? "Création..." : "Créer le contrat"}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}