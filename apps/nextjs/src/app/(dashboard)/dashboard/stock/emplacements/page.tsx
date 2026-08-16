"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { AlertTriangle, Check, MapPin, Package, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

/**
 * EMPLACEMENTS — rayonnage codifié ZONE-ALLEE-RAYON-NIVEAU (specs 03 §3).
 * Création / édition / consultation du contenu de chaque emplacement.
 */
export default function EmplacementsPage() {
  const utils = api.useUtils();
  const { data: emplacements, isLoading, isError, refetch } = api.stock.listEmplacements.useQuery({});
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [form, setForm] = useState({ code: "", libelle: "", type: "RAYON" });

  const create = api.stock.createEmplacement.useMutation({
    onSuccess: () => {
      toast.success("Emplacement créé");
      utils.stock.listEmplacements.invalidate();
      setShowForm(false);
      setForm({ code: "", libelle: "", type: "RAYON" });
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: contenu } = api.stock.getEmplacementContenu.useQuery(
    { emplacementId: selected ?? 0 },
    { enabled: !!selected }
  );

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (isError) return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 py-10 text-center">
      <AlertTriangle size={28} className="mb-2 text-destructive" />
      <p className="text-sm font-medium text-foreground">Erreur de chargement</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Réessayer</Button>
    </div>
  );

  const list = (emplacements ?? []).filter(
    (e: any) => !search || e.code.toLowerCase().includes(search.toLowerCase()) || (e.libelle ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const save = () => {
    if (!form.code.trim()) { toast.error("Code requis (format : ZONE-ALLEE-RAYON-NIVEAU)"); return; }
    create.mutate({ code: form.code.trim().toUpperCase(), libelle: form.libelle.trim() || undefined, type: form.type });
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Emplacements & Rayonnage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Codification ZONE-ALLEE-RAYON-NIVEAU (ex. MAG-A-01-03, EXT-PNEU)
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="gap-2">
          <Plus size={16} /> Nouvel emplacement
        </Button>
      </div>

      {showForm && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Nouvel emplacement</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs text-muted-foreground">Code * (ZONE-ALLEE-RAYON-NIVEAU)</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ex: MAG-A-01-03" className="mt-1 font-mono" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Libellé</Label>
              <Input value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} placeholder="ex: Allée A, rayon 1, niveau 3" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Type</Label>
              <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="RAYON">Rayon</option>
                <option value="SOL">Sol</option>
                <option value="TIROIR">Tiroir</option>
                <option value="EXTERIEUR">Extérieur</option>
                <option value="FRIGO">Frigo</option>
                <option value="AUTRE">Autre</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={save} disabled={create.isPending} className="gap-2">
              <Check size={14} /> {create.isPending ? "Création..." : "Enregistrer"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        {/* Liste des emplacements */}
        <div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input placeholder="Rechercher un emplacement (code, libellé)..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
              <MapPin size={28} className="mb-2 opacity-40" />
              <p className="text-sm font-medium text-foreground">Aucun emplacement</p>
              <p className="mt-1 text-xs text-muted-foreground">Créez la structure de votre magasin (ZONE-ALLEE-RAYON-NIVEAU).</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              {list.map((e: any) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setSelected(e.id)}
                  className={`flex w-full items-center justify-between border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/50 ${selected === e.id ? "bg-accent/70" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-mono text-sm font-semibold text-foreground">
                      <MapPin size={13} className="shrink-0 text-primary" />
                      {e.code}
                      {!e.isActive && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Inactif</span>}
                    </div>
                    {e.libelle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.libelle}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">{e.type}</span>
                    <span className="text-[10px] text-muted-foreground">{e.profondeur > 0 ? "sous-emplacement" : "racine"}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Contenu de l'emplacement sélectionné */}
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Package size={14} className="text-primary" />
            Contenu de l'emplacement
          </div>
          {!selected ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
              <MapPin size={28} className="mb-2 opacity-40" />
              <p className="text-sm font-medium text-foreground">Sélectionnez un emplacement</p>
              <p className="mt-1 text-xs text-muted-foreground">Pour voir les articles qui y sont stockés.</p>
            </div>
          ) : !contenu || contenu.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
              <Package size={28} className="mb-2 opacity-40" />
              <p className="text-sm font-medium text-foreground">Emplacement vide</p>
              <p className="mt-1 text-xs text-muted-foreground">Aucun article stocké ici pour le moment.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Article</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Code</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Qté</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {contenu.map((c: any) => (
                    <tr key={c.produitId} className="border-t border-border hover:bg-accent/40">
                      <td className="px-4 py-2.5 font-medium">{c.titre}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{c.codeArticle ?? c.codeBarre}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{c.quantite}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{c.valeur.toLocaleString("fr-FR")} F</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
