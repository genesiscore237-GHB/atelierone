"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Plus, Search, X, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ employeId: 0, typeDocument: "contrat", titre: "", fichierUrl: "", dateEmission: "", dateExpiration: "" });
  const utils = api.useUtils();

  const { data: documents, isLoading } = api.rh.listDocuments.useQuery({});
  const { data: employes } = api.rh.list.useQuery({});

  const createDoc = api.rh.createDocument.useMutation({
    onSuccess: () => { utils.rh.listDocuments.invalidate(); setShowModal(false); setForm({ employeId: 0, typeDocument: "contrat", titre: "", fichierUrl: "", dateEmission: "", dateExpiration: "" }); toast.success("Document ajouté"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const deleteDoc = api.rh.deleteDocument.useMutation({
    onSuccess: () => { utils.rh.listDocuments.invalidate(); toast.success("Document supprimé"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">Documents des employés</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-success to-success px-4 py-2.5 text-sm font-semibold text-foreground hover:from-success/80 hover:to-success/80 transition-all shadow-sm"><Plus size={16} /> Nouveau document</button>
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
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Titre</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Émission</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Expiration</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-t border-border"><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
              ))
            ) : !documents?.length ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground"><FileText size={32} className="mx-auto mb-2 opacity-50" />Aucun document</td></tr>
            ) : (
              documents.map((d: any) => (
                <motion.tr key={d.id} variants={item} className="border-t border-border hover:bg-accent transition-colors">
                  <td className="px-4 py-3 font-medium">{d.employeId}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-success/10 dark:bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success-foreground">{d.typeDocument}</span></td>
                  <td className="px-4 py-3 text-muted-foreground">{d.titre || "—"}</td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground">{d.dateEmission ? new Date(d.dateEmission).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground">{d.dateExpiration ? new Date(d.dateExpiration).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => { if (confirm("Supprimer ce document ?")) deleteDoc.mutate({ id: d.id }); }} className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/10 transition-colors">
                      <Trash2 size={16} />
                    </button>
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
              <h2 className="text-lg font-bold text-foreground">Nouveau document</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 hover:bg-accent"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createDoc.mutate(form); }} className="space-y-4">
              <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.employeId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, employeId: Number(e.target.value) })} required>
                <option value={0}>Employé *</option>
                {employes?.map((e: any) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
              </select>
              <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.typeDocument} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, typeDocument: e.target.value })}>
                <option value="contrat">Contrat</option><option value="certificat_travail">Certificat travail</option><option value="bulletin_paie">Bulletin paie</option><option value="attestation">Attestation</option><option value="diplome">Diplôme</option><option value="piece_identite">Pièce identité</option>
              </select>
              <input placeholder="Titre" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.titre} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, titre: e.target.value })} />
              <input type="url" placeholder="URL du fichier *" required className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.fichierUrl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, fichierUrl: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" placeholder="Date émission" className="rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.dateEmission} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, dateEmission: e.target.value })} />
                <input type="date" placeholder="Date expiration" className="rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={form.dateExpiration} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, dateExpiration: e.target.value })} />
              </div>
              <button type="submit" disabled={createDoc.isPending} className="w-full rounded-lg bg-gradient-to-r from-success to-success py-2.5 text-sm font-semibold text-foreground hover:from-success/80 hover:to-success/80 disabled:opacity-50 transition-all">
                {createDoc.isPending ? "Ajout..." : "Ajouter le document"}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}