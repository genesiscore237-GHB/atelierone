"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Plus, Search, X, FileText, CheckCircle, Clock, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function ContratsPage() {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    employeId: 0, typeContrat: "CDI", dateDebut: "", dateFin: "", dureeMois: 0,
    finPeriodeEssai: "", avantages: "", salaireBase: "", poste: "", notes: "",
  });
  const utils = api.useUtils();

  const { data: contrats, isLoading } = api.rh.listContrats.useQuery({});
  const { data: employes } = api.rh.list.useQuery({ limit: 200 });

  const createContrat = api.rh.createContrat.useMutation({
    onSuccess: () => {
      utils.rh.listContrats.invalidate();
      setShowModal(false);
      setForm({ employeId: 0, typeContrat: "CDI", dateDebut: "", dateFin: "", dureeMois: 0, finPeriodeEssai: "", avantages: "", salaireBase: "", poste: "", notes: "" });
      toast.success("Contrat créé");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const renouveler = api.rh.renouvelerContrat.useMutation({
    onSuccess: (r) => {
      toast.success(`Contrat renouvelé — nouvelle fin : ${r.nouvelleFin}`);
      utils.rh.listContrats.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const emps = (employes?.employees ?? employes ?? []) as unknown as Array<{ id: number; prenom: string; nom: string }>;
  const empName = (id: number) => {
    const e = emps.find((x) => x.id === id);
    return e ? `${e.prenom} ${e.nom}` : `#${id}`;
  };

  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const filtered = (contrats ?? []).filter((c: any) => {
    const q = search.toLowerCase();
    return !q || empName(c.employeId).toLowerCase().includes(q) || String(c.typeContrat ?? "").toLowerCase().includes(q) || String(c.poste ?? "").toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Contrats</h1>
          <p className="mt-1 text-sm text-muted-foreground">Type, dates, période d&apos;essai, avantages et renouvellements</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary px-4 py-2.5 text-sm font-semibold text-foreground hover:from-primary/80 hover:to-primary/80 transition-all shadow-sm">
          <Plus size={16} /> Nouveau contrat
        </button>
      </div>

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
        <input placeholder="Rechercher (employé, type, poste)…" className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary dark:bg-card dark:border-border dark:text-foreground transition-all" value={search} onChange={(e) => setSearch(e.target.value)} />
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
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Essai</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Salaire</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Statut</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-t border-border"><td colSpan={9} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
              ))
            ) : !filtered.length ? (
              <tr><td colSpan={9} className="text-center py-12 text-muted-foreground"><FileText size={32} className="mx-auto mb-2 opacity-50" />Aucun contrat</td></tr>
            ) : (
              filtered.map((c: any) => {
                const expire = c.dateFin && c.dateFin >= today && c.dateFin <= in30;
                const expireBientot = c.dateFin && c.dateFin < in30;
                const essaiEnCours = c.finPeriodeEssai && c.finPeriodeEssai >= today;
                return (
                  <motion.tr key={c.id} variants={item} className="border-t border-border hover:bg-accent transition-colors">
                    <td className="px-4 py-3 font-medium">{empName(c.employeId)}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-primary/10 dark:bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{c.typeContrat}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{c.poste || "—"}</td>
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground">{c.dateDebut ? new Date(c.dateDebut).toLocaleDateString("fr-FR") : "—"}</td>
                    <td className="px-4 py-3 text-center text-xs">
                      {c.dateFin ? new Date(c.dateFin).toLocaleDateString("fr-FR") : "—"}
                      {expire && <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-warning/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-warning-foreground"><AlertTriangle size={9} /> ≤ 30 j</span>}
                      {expireBientot && <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive"><AlertTriangle size={9} /> Expiré</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-xs">
                      {c.finPeriodeEssai ? new Date(c.finPeriodeEssai).toLocaleDateString("fr-FR") : "—"}
                      {essaiEnCours && <span className="ml-1.5 rounded-full bg-info/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-info-foreground">Essai</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{c.salaireBase ? `${Number(c.salaireBase).toLocaleString()} F` : "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.statut === "actif" ? "bg-success/10 text-success-foreground dark:bg-success/10 dark:text-success-foreground" : "bg-muted text-foreground/80 dark:bg-muted/50 dark:text-muted-foreground"}`}>
                        {c.statut === "actif" ? <CheckCircle size={12} /> : <Clock size={12} />} {c.statut === "actif" ? "Actif" : c.statut}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => renouveler.mutate({ id: c.id })}
                        disabled={renouveler.isPending}
                        title="Prolonge la fin de la même durée et journalise le renouvellement"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                      >
                        <RefreshCw size={13} /> Renouveler
                      </button>
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
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg rounded-2xl bg-background dark:bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Nouveau contrat</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 hover:bg-accent"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createContrat.mutate(form); }} className="space-y-4">
              <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.employeId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, employeId: Number(e.target.value) })} required>
                <option value={0}>Employé *</option>
                {emps.map((e: any) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.typeContrat} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, typeContrat: e.target.value })}>
                  <option value="CDI">CDI</option><option value="CDD">CDD</option><option value="Apprentissage">Apprentissage</option><option value="Stage">Stage</option><option value="Journalier">Journalier</option><option value="Prestataire">Prestataire</option>
                </select>
                <input placeholder="Poste" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.poste} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, poste: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Début *</label>
                  <input type="date" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.dateDebut} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, dateDebut: e.target.value })} required />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Fin</label>
                  <input type="date" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.dateFin} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, dateFin: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Durée (mois)</label>
                  <input type="number" min={1} placeholder="ex. 12" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.dureeMois || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, dureeMois: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Fin période d&apos;essai</label>
                  <input type="date" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.finPeriodeEssai} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, finPeriodeEssai: e.target.value })} />
                </div>
              </div>
              <input type="number" placeholder="Salaire brut (FCFA)" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono" value={form.salaireBase} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, salaireBase: e.target.value })} />
              <textarea placeholder="Avantages (un par ligne : logement, transport, mutuelle…)" rows={2} className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.avantages} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, avantages: e.target.value })} />
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