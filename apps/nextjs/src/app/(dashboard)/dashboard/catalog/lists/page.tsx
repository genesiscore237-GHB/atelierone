"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Plus, X, BookOpen, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { EmptyState } from "~/components/ui/empty-state";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export default function SchoolListsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ nom: "", description: "", anneeScolaire: "2026-2027", ministere: "MINESEC" as "MINESEC" | "MINEDUB" });
  const [addData, setAddData] = useState({ produitId: "", quantiteRequise: 1, priorite: "obligatoire" as "obligatoire" | "suggere" });
  const [search, setSearch] = useState("");

  const utils = api.useUtils();
  const { data: lists, isLoading } = api.schoolLists.list.useQuery();
  const { data: listItems } = api.schoolLists.getItems.useQuery({ listId: selectedId! }, { enabled: !!selectedId });

  const createList = api.schoolLists.create.useMutation({
    onSuccess: () => { utils.schoolLists.list.invalidate(); setShowCreate(false); setForm({ nom: "", description: "", anneeScolaire: "2026-2027", ministere: "MINESEC" }); },
  });
  const addItem = api.schoolLists.addItem.useMutation({
    onSuccess: () => { if (selectedId) utils.schoolLists.getItems.invalidate({ listId: selectedId }); setShowAdd(false); setAddData({ produitId: "", quantiteRequise: 1, priorite: "obligatoire" }); },
  });
  const removeItem = api.schoolLists.removeItem.useMutation({
    onSuccess: () => { if (selectedId) utils.schoolLists.getItems.invalidate({ listId: selectedId }); },
  });
  const deleteList = api.schoolLists.delete.useMutation({
    onSuccess: () => { utils.schoolLists.list.invalidate(); setSelectedId(null); },
  });

  const { data: products } = api.catalog.list.useQuery({ query: search || undefined, limit: 50 });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Listes Scolaires</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{lists?.length ?? 0} liste(s)</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="size-4" />
          Nouvelle liste
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-xl bg-muted" />)}
        </div>
      ) : !lists?.length ? (
        <EmptyState icon={<BookOpen className="size-12 text-muted-foreground" />} title="Aucune liste scolaire" description="Créez votre première liste" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <div
              key={list.id}
              onClick={() => setSelectedId(list.id === selectedId ? null : list.id)}
              className={`group cursor-pointer rounded-xl border p-5 transition-all duration-200 ${
                selectedId === list.id
                  ? "border-ring/50 bg-muted/80"
                  : "border-border bg-card hover:bg-muted"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="space-y-1">
                  <h3 className="font-semibold text-foreground">{list.nom}</h3>
                  <p className="text-xs text-muted-foreground">{list.ministere} · {list.anneeScolaire}</p>
                  {list.description && <p className="text-xs text-muted-foreground/70">{list.description}</p>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); if (confirm("Supprimer cette liste ?")) deleteList.mutate({ id: list.id }); }} className="shrink-0 p-1 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="size-4" />
                </button>
              </div>

              {selectedId === list.id && (
                <div className="mt-4 border-t border-border/50 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-muted-foreground">{listItems?.length ?? 0} produit(s)</span>
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); setShowAdd(true); }} className="h-8 px-3 text-xs">
                      <Plus className="size-3" />
                      Ajouter
                    </Button>
                  </div>
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {listItems?.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.produit.titre}</p>
                          <p className="text-xs text-muted-foreground">
                            Qté: {item.quantiteRequise}
                            {item.priorite === "obligatoire" ? (
                              <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success-foreground">Oblig.</span>
                            ) : (
                              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Sugg.</span>
                            )}
                          </p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); if (confirm("Retirer ?")) removeItem.mutate({ itemId: item.id }); }} className="shrink-0 p-1 text-muted-foreground hover:text-destructive transition-colors">
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
          <DialogHeader><DialogTitle className="text-foreground">Nouvelle liste scolaire</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createList.mutate(form); }} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nom *</Label>
              <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Ex: 6e 2026-2027" required />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optionnelle" />
            </div>
            <div className="space-y-1.5">
              <Label>Ministère</Label>
              <Select value={form.ministere} onValueChange={(v) => setForm({ ...form, ministere: v as "MINESEC" | "MINEDUB" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MINESEC">MINESEC (Secondaire)</SelectItem>
                  <SelectItem value="MINEDUB">MINEDUB (Base)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Année scolaire</Label>
              <Input value={form.anneeScolaire} onChange={(e) => setForm({ ...form, anneeScolaire: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
              <Button type="submit" disabled={createList.isPending || !form.nom.trim()}>Créer</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
          <DialogHeader><DialogTitle className="text-foreground">Ajouter un produit</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit..." />
            {products?.items && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border/50">
                {products.items.map((p) => (
                  <div
                    key={p.id}
                    className={`cursor-pointer p-3 transition-colors hover:bg-accent/50 ${addData.produitId === p.id ? "bg-primary/10" : ""}`}
                    onClick={() => setAddData({ ...addData, produitId: p.id })}
                  >
                    <p className="text-sm font-medium text-foreground">{p.titre}</p>
                    <p className="text-xs text-muted-foreground">{p.auteur} — {Number(p.defaultPrice).toLocaleString()} F</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input type="number" min={1} value={addData.quantiteRequise} onChange={(e) => setAddData({ ...addData, quantiteRequise: Number(e.target.value) || 1 })} placeholder="Qté" className="w-24" />
              <Select value={addData.priorite} onValueChange={(v) => setAddData({ ...addData, priorite: v as "obligatoire" | "suggere" })}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="obligatoire">Obligatoire</SelectItem>
                  <SelectItem value="suggere">Suggéré</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Annuler</Button>
              <Button onClick={() => addItem.mutate({ listId: selectedId!, ...addData })} disabled={!addData.produitId || addItem.isPending}>Ajouter</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
