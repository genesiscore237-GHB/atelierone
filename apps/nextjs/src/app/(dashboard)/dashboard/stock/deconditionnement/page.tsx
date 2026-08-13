"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Repeat, Search, X, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function DeconditionnementPage() {
  const [activeTab, setActiveTab] = useState<"nouveau" | "historique">("nouveau");
  const [form, setForm] = useState({
    produitId: "",
    uniteSourceId: "",
    quantiteSource: 0,
    uniteCibleId: "",
    quantiteGeneree: 0,
    motif: "",
  });
  const [showSuccess, setShowSuccess] = useState(false);

  const utils = api.useUtils();
  const { data: produits } = api.catalog.listProducts.useQuery();
  const { data: unites } = api.reference.listUnitesMesure.useQuery();
  const { data: historiques } = api.stock.listDeconditionnements.useQuery();

  const mutation = api.stock.createDeconditionnement.useMutation({
    onSuccess: () => {
      utils.stock.listDeconditionnements.invalidate();
      utils.stock.getDashboard.invalidate();
      setShowSuccess(true);
      setForm({ produitId: "", uniteSourceId: "", quantiteSource: 0, uniteCibleId: "", quantiteGeneree: 0, motif: "" });
      setTimeout(() => setShowSuccess(false), 3000);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      produitId: form.produitId,
      uniteSourceId: form.uniteSourceId,
      quantiteSource: form.quantiteSource,
      uniteCibleId: form.uniteCibleId,
      quantiteGeneree: form.quantiteGeneree,
      motif: form.motif,
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex gap-1 rounded-lg bg-muted dark:bg-muted p-1 w-fit">
        <button onClick={() => setActiveTab("nouveau")} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === "nouveau" ? "bg-background text-foreground shadow-sm dark:bg-muted dark:text-foreground" : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"}`}>
          Nouveau déconditionnement
        </button>
        <button onClick={() => setActiveTab("historique")} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === "historique" ? "bg-background text-foreground shadow-sm dark:bg-muted dark:text-foreground" : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"}`}>
          Historique
        </button>
      </div>

      {activeTab === "nouveau" ? (
        <div className="max-w-2xl">
          <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card p-6">
            <h2 className="text-lg font-bold text-foreground dark:text-foreground mb-4">Déconditionner un produit</h2>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground mb-6">Convertir une unité supérieure en unité inférieure (ex: carton → pièces)</p>

            {showSuccess && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-success/20 dark:bg-success/10 p-3 text-sm text-success-foreground dark:text-success-foreground">
                <CheckCircle size={16} /> Déconditionnement enregistré avec succès
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">Produit</label>
                <select className="w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30" value={form.produitId} onChange={(e) => setForm({ ...form, produitId: e.target.value })} required>
                  <option value="">Sélectionner un produit</option>
                  {produits?.map((p: any) => <option key={p.id} value={p.id}>{p.titre}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">Unité source</label>
                  <select className="w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30" value={form.uniteSourceId} onChange={(e) => setForm({ ...form, uniteSourceId: e.target.value })} required>
                    <option value="">Unité à déconditionner</option>
                    {unites?.map((u: any) => <option key={u.id} value={u.id}>{u.nom} ({u.code})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">Quantité source</label>
                  <input type="number" min={1} step="1" className="w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30" value={form.quantiteSource || ""} onChange={(e) => setForm({ ...form, quantiteSource: Number(e.target.value) })} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">Unité cible</label>
                  <select className="w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30" value={form.uniteCibleId} onChange={(e) => setForm({ ...form, uniteCibleId: e.target.value })} required>
                    <option value="">Unité obtenue</option>
                    {unites?.map((u: any) => <option key={u.id} value={u.id}>{u.nom} ({u.code})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">Quantité générée</label>
                  <input type="number" min={1} step="1" className="w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30" value={form.quantiteGeneree || ""} onChange={(e) => setForm({ ...form, quantiteGeneree: Number(e.target.value) })} required />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 dark:text-foreground/80 mb-1">Motif (optionnel)</label>
                <input type="text" className="w-full rounded-lg border border-border dark:border-border bg-background dark:bg-muted px-4 py-2.5 text-sm text-foreground dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30" value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} placeholder="Ex: Ouverture de carton pour vente à l'unité" />
              </div>

              <button type="submit" disabled={mutation.isPending} className="w-full rounded-lg bg-gradient-to-r from-warning to-warning py-2.5 text-sm font-semibold text-foreground hover:from-warning/80 hover:to-warning/80 disabled:opacity-50 transition-colors">
                {mutation.isPending ? "Traitement..." : "Déconditionner"}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border dark:border-border bg-background dark:bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted dark:bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Produit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Source</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Généré</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider hidden md:table-cell">Motif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-border">
                {historiques?.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground dark:text-muted-foreground">
                    <Repeat size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Aucun déconditionnement</p>
                  </td></tr>
                ) : (
                  historiques?.map((h) => (
                    <tr key={h.id} className="hover:bg-accent dark:hover:bg-accent/30">
                      <td className="px-4 py-3 text-sm text-muted-foreground dark:text-foreground/80">{h.date ? new Date(h.date).toLocaleDateString("fr-FR") : "-"}</td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground dark:text-foreground">{h.produitTitre}</td>
                      <td className="px-4 py-3 text-right text-sm">{h.quantiteSource} {h.uniteSourceCode}</td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-warning-foreground dark:text-warning-foreground">{h.quantiteGeneree}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground dark:text-muted-foreground hidden md:table-cell">{h.motif ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}
