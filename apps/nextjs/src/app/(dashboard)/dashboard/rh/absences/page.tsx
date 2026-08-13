"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Plus, Search, X, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function AbsencesPage() {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ employeId: 0, typeAbsence: "conge_paye", dateDebut: "", dateFin: "", dureeJours: 0, motif: "", justifie: false });
  const utils = api.useUtils();

  const { data: absences, isLoading } = api.rh.listAbsences.useQuery({});
  const { data: employes } = api.rh.list.useQuery({});

  const createAbsence = api.rh.createAbsence.useMutation({
    onSuccess: () => { utils.rh.listAbsences.invalidate(); utils.rh.stats.invalidate(); setShowModal(false); setForm({ employeId: 0, typeAbsence: "conge_paye", dateDebut: "", dateFin: "", dureeJours: 0, motif: "", justifie: false }); toast.success("Absence enregistrée"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const validerAbsence = api.rh.validerAbsence.useMutation({
    onSuccess: () => { utils.rh.listAbsences.invalidate(); toast.success("Statut mis à jour"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  function getTypeLabel(t: string) {
    const map: Record<string, string> = { conge_paye: "Congé payé", conge_maladie: "Maladie", conge_sans_solde: "Sans solde", absence_injustifiee: "Injustifiée", retard: "Retard" };
    return map[t] ?? t;
  }

  function getStatusBadge(s: string) {
    switch (s) {
      case "validee": return { icon: <CheckCircle size={12} />, text: "Validée", color: "bg-success/10 text-success-foreground dark:bg-success/10 dark:text-success-foreground" };
      case "rejetee": return { icon: <X size={12} />, text: "Rejetée", color: "bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive" };
      default: return { icon: <Clock size={12} />, text: "En attente", color: "bg-warning/10 text-warning-foreground dark:bg-warning/10 dark:text-warning-foreground" };
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Absences</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestion des absences et congés</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-warning to-warning px-4 py-2.5 text-sm font-semibold text-foreground hover:from-warning/80 hover:to-warning/80 transition-all shadow-sm"><Plus size={16} /> Nouvelle absence</button>
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
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Du</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Au</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Jours</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Justifié</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Statut</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-t border-border"><td colSpan={8} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
              ))
            ) : !absences?.length ? (
              <tr><td colSpan={8} className="text-center py-12 text-muted-foreground"><AlertTriangle size={32} className="mx-auto mb-2 opacity-50" />Aucune absence</td></tr>
            ) : (
              absences.map((a: any) => {
                const badge = getStatusBadge(a.statut);
                return (
                  <motion.tr key={a.id} variants={item} className="border-t border-border hover:bg-accent transition-colors">
                    <td className="px-4 py-3 font-medium">{a.employePrenom} {a.employeNom}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{getTypeLabel(a.typeAbsence)}</span></td>
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground">{a.dateDebut ? new Date(a.dateDebut).toLocaleDateString("fr-FR") : "—"}</td>
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground">{a.dateFin ? new Date(a.dateFin).toLocaleDateString("fr-FR") : "—"}</td>
                    <td className="px-4 py-3 text-right font-mono">{a.dureeJours ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{a.justifie ? <CheckCircle size={14} className="text-success-foreground mx-auto" /> : <X size={14} className="text-muted-foreground mx-auto" />}</td>
                    <td className="px-4 py-3 text-center"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.color}`}>{badge.icon} {badge.text}</span></td>
                    <td className="px-4 py-3 text-center">
                      {a.statut === "en_attente" && (
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => validerAbsence.mutate({ id: a.id, statut: "validee" })} className="rounded-lg p-1.5 text-success-foreground hover:bg-success/10 transition-colors" title="Valider"><CheckCircle size={16} /></button>
                          <button onClick={() => validerAbsence.mutate({ id: a.id, statut: "rejetee" })} className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10 transition-colors" title="Rejeter"><X size={16} /></button>
                        </div>
                      )}
                    </td>
                  </motion.tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl bg-background dark:bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Nouvelle absence</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 hover:bg-accent"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createAbsence.mutate(form); }} className="space-y-4">
              <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-warning/30 focus:border-warning" value={form.employeId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, employeId: Number(e.target.value) })} required>
                <option value={0}>Employé *</option>
                {employes?.map((e: any) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
              </select>
              <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-warning/30 focus:border-warning" value={form.typeAbsence} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, typeAbsence: e.target.value })}>
                <option value="conge_paye">Congé payé</option><option value="conge_maladie">Maladie</option><option value="conge_sans_solde">Sans solde</option><option value="absence_injustifiee">Injustifiée</option><option value="retard">Retard</option>
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" className="rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-warning/30 focus:border-warning" value={form.dateDebut} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, dateDebut: e.target.value })} required />
                <input type="date" className="rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-warning/30 focus:border-warning" value={form.dateFin} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, dateFin: e.target.value })} />
              </div>
              <textarea placeholder="Motif" rows={2} className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-warning/30 focus:border-warning" value={form.motif} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, motif: e.target.value })} />
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={form.justifie} onChange={(e) => setForm({ ...form, justifie: e.target.checked })} className="rounded border-border" />
                Justifié
              </label>
              <button type="submit" disabled={createAbsence.isPending} className="w-full rounded-lg bg-gradient-to-r from-warning to-warning py-2.5 text-sm font-semibold text-foreground hover:from-warning/80 hover:to-warning/80 disabled:opacity-50 transition-all">
                {createAbsence.isPending ? "Enregistrement..." : "Enregistrer"}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}