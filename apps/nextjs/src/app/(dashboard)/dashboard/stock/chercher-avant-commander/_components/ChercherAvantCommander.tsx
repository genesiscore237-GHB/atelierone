"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { ImageOff, PackageSearch, RefreshCw, Search, ShoppingCart, Wrench } from "lucide-react";
import { Button } from "~/components/ui/button";
import { usePermissions } from "~/hooks/usePermissions";
import { CommanderProduitDialog } from "~/app/(dashboard)/dashboard/catalog/_components/CommanderProduitDialog";

const NIVEAU_META: Record<string, { label: string; badge: string }> = {
  rupture: { label: "Rupture", badge: "bg-destructive/15 text-destructive" },
  critique: { label: "Critique", badge: "bg-destructive/15 text-destructive" },
  faible: { label: "Faible", badge: "bg-warning/15 text-warning-foreground" },
  ok: { label: "En stock", badge: "bg-success/15 text-success-foreground" },
};

/**
 * RÈGLE « CHERCHER AVANT DE COMMANDER » :
 * avant chaque commande de pièce, le magasinier recherche d'abord le produit
 * dans la base (stock du garage, y compris matériel récupéré/d'occasion).
 * S'il existe et est disponible → sortie « Utiliser » (stock mis à jour).
 * Sinon → commande fournisseur (circuit OR ou stock).
 */
export function ChercherAvantCommander() {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const [q, setQ] = useState("");
  const [type, setType] = useState("TOUS");
  const [sortirFor, setSortirFor] = useState<{ id: number; titre: string; qte: string; uniteId: string; motif: string } | null>(null);
  const [sortirOrFor, setSortirOrFor] = useState<{ id: number; titre: string; qte: string; orId: number } | null>(null);
  const [demandeFor, setDemandeFor] = useState<{ designation: string; reference: string; qte: string; notes: string } | null>(null);
  const [commanderFor, setCommanderFor] = useState<{ produitId: string; titre: string; stock: number } | null>(null);
  const { data: orsEnCours } = api.or.getDashboard.useQuery(undefined, { select: (d: any) => (d?.ors ?? []).filter((o: any) => ["EN_COURS", "EN_ATTENTE", "DIAGNOSTIC"].includes(o.statut ?? "")) });

  const { data, isLoading, refetch } = api.stock.chercherAvantCommander.useQuery(
    { q: q || undefined, type: (type || "TOUS") as any, limit: 100 },
    { refetchInterval: 30_000 }
  );
  const { data: unitesData } = api.catalog.listUnites.useQuery();

  const sortir = api.stock.sortirPourUsage.useMutation({
    onSuccess: (r) => {
      toast.success(`Sortie enregistrée — stock ${r.stockAvant} → ${r.stockApres}`);
      utils.stock.chercherAvantCommander.invalidate();
      utils.stock.getDashboard.invalidate();
      setSortirFor(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const sortirPourReparation = api.stock.sortirPourOR.useMutation({
    onSuccess: () => { toast.success("Pièce sortie pour la réparation — stock mis à jour"); utils.stock.chercherAvantCommander.invalidate(); utils.stock.getDashboard.invalidate(); setSortirOrFor(null); },
    onError: (e) => toast.error(e.message),
  });
  const creerDemande = api.stock.creerDemandeCommande.useMutation({
    onSuccess: () => { toast.success("Demande de commande enregistrée"); utils.stock.listDemandesCommande.invalidate(); setDemandeFor(null); },
    onError: (e) => toast.error(e.message),
  });
  const { data: demandes } = api.stock.listDemandesCommande.useQuery(undefined, { refetchInterval: 60_000 });

  const canModifier = hasPermission("stock.modifier");
  const rows = (data ?? []) as any[];
  const unites = (unitesData ?? []) as any[];
  const img = (p: any) => (Array.isArray(p?.photos) && p.photos.length > 0 ? p.photos[0] : p?.imageUrl ?? null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <PackageSearch size={22} className="text-primary" /> Chercher avant de commander
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Règle magasin : <b>cherchez d'abord dans le stock du garage</b> (y compris le matériel récupéré / d'occasion) — s'il existe, utilisez-le ; sinon commandez.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => refetch()}>
          <RefreshCw size={13} /> Actualiser
        </Button>
      </div>

      {/* Recherche */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher : nom, code-barres, code article, marque…" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary/50" />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="TOUS">Tous les produits</option>
          <option value="PIECE">Pièces</option>
          <option value="CONSOMMABLE">Consommables (huiles…)</option>
          <option value="OUTIL">Outils</option>
        </select>
        <span className="text-xs text-muted-foreground">{rows.length} résultat(s)</span>
      </div>

      {/* Résultats */}
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Wrench size={24} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">
            Aucun produit trouvé {q ? `pour « ${q} »` : "— recherchez une pièce avant de commander"}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Si ce produit n'existe pas au garage, créez une demande de commande :</p>
          <Button size="sm" variant="outline" className="mt-3 gap-1 text-xs" onClick={() => setDemandeFor({ designation: q, reference: "", qte: "1", notes: "" })}>
            <ShoppingCart size={12} /> Créer une demande de commande
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full">
            <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Produit</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">État</th>
                <th className="px-3 py-2.5 text-right">Disponible</th>
                <th className="px-3 py-2.5">Niveau</th>
                <th className="px-3 py-2.5">Par unité</th>
                <th className="px-3 py-2.5 text-right">Prix achat</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((p: any) => {
                const n = NIVEAU_META[p.niveau] ?? NIVEAU_META.ok;
                const photo = img(p);
                return (
                  <tr key={p.id} className="text-sm hover:bg-accent/30">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {photo ? (
                          <img src={photo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground"><ImageOff size={14} /></span>
                        )}
                        <div>
                          <span className="font-semibold">{p.titre}</span>
                          <span className="block font-mono text-[10px] text-muted-foreground">{p.codeBarre ?? p.codeArticle} {p.marque ? `· ${p.marque}` : ""}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${p.typeProduit === "OUTIL" ? "bg-sky-500/15 text-sky-400" : p.typeProduit === "CONSOMMABLE" ? "bg-violet-500/15 text-violet-400" : "bg-muted text-muted-foreground"}`}>
                        {p.typeProduit === "OUTIL" ? "Outil" : p.typeProduit === "CONSOMMABLE" ? "Consommable" : "Pièce"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{p.etat ?? "neuf"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-bold">
                      <span className={p.disponible <= 0 ? "text-destructive" : "text-foreground"}>{p.disponible}</span>
                      {p.stockReserve > 0 && <span className="block text-[9px] text-muted-foreground">({p.stockReserve} réservé)</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${n.badge}`}>{n.label}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {p.unites.length > 0 ? p.unites.map((u: any) => <span key={u.code} className="mr-1.5 font-mono">{u.quantite} {u.symbole ?? u.code}</span>) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {Number(p.dernierPrixAchat ?? p.prixAchat ?? 0) > 0 ? `${new Intl.NumberFormat("fr-FR").format(Number(p.dernierPrixAchat ?? p.prixAchat))} F` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {canModifier && p.disponible > 0 && (
                          <>
                            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px] text-sky-400" disabled={sortirPourReparation.isPending} onClick={() => setSortirOrFor({ id: p.id, titre: p.titre, qte: "1", orId: 0 })}>
                              <Wrench size={11} /> Sortir pour réparation
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px] text-success-foreground" disabled={sortir.isPending} onClick={() => setSortirFor({ id: p.id, titre: p.titre, qte: "1", uniteId: p.unites[0]?.code ?? "", motif: "" })}>
                              <Wrench size={11} /> Sortir (stock)
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setCommanderFor({ produitId: String(p.id), titre: p.titre, stock: p.disponible })}>
                          <ShoppingCart size={11} /> Commander
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal sortie pour usage */}
      {sortirFor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setSortirFor(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Wrench size={16} className="text-success-foreground" /> Utiliser : {sortirFor.titre}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">La sortie est tracée et le stock est mis à jour immédiatement.</p>
            <div className="mt-4 space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quantité</p>
                  <input type="number" min={1} value={sortirFor.qte} onChange={(e) => setSortirFor({ ...sortirFor, qte: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Unité (si applicable)</p>
                  <select value={sortirFor.uniteId} onChange={(e) => setSortirFor({ ...sortirFor, uniteId: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                    <option value="">Base</option>
                    {unites.map((u: any) => <option key={u.id} value={u.code}>{u.libelle} ({u.code})</option>)}
                  </select>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Motif (obligatoire, min 3 caractères)</p>
                <input value={sortirFor.motif} onChange={(e) => setSortirFor({ ...sortirFor, motif: e.target.value })} placeholder="ex. Utilisation sur vidange Toyota — matériel récupéré" className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSortirFor(null)}>Annuler</Button>
              <Button disabled={!Number(sortirFor.qte) || sortirFor.motif.trim().length < 3 || sortir.isPending} onClick={() => sortir.mutate({ produitId: sortirFor.id, quantite: Number(sortirFor.qte), uniteId: sortirFor.uniteId || undefined, motif: sortirFor.motif.trim() })}>
                <Wrench size={14} /> Utiliser et mettre à jour le stock
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal sortie pour réparation (choix de l'OR) */}
      {sortirOrFor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setSortirOrFor(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Wrench size={16} className="text-sky-400" /> Sortir pour réparation : {sortirOrFor.titre}
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ordre de réparation *</p>
                <select value={sortirOrFor.orId} onChange={(e) => setSortirOrFor({ ...sortirOrFor, orId: Number(e.target.value) })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  <option value={0}>Choisir…</option>
                  {(orsEnCours ?? []).map((o: any) => <option key={o.id} value={o.id}>OR-{o.numero ?? o.id} — {o.vehicule ?? ""}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quantité</p>
                <input type="number" min={1} value={sortirOrFor.qte} onChange={(e) => setSortirOrFor({ ...sortirOrFor, qte: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSortirOrFor(null)}>Annuler</Button>
              <Button disabled={!sortirOrFor.orId || !Number(sortirOrFor.qte) || sortirPourReparation.isPending} onClick={() => sortirPourReparation.mutate({ orId: sortirOrFor.orId, produitId: sortirOrFor.id, quantite: Number(sortirOrFor.qte), motif: "Sortie pour réparation" })}>
                <Wrench size={14} /> Sortir
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal demande de commande (produit introuvable) */}
      {demandeFor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setDemandeFor(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <ShoppingCart size={16} className="text-primary" /> Créer une demande de commande
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">Le produit n'existe pas au garage — la demande est enregistrée pour commande.</p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Désignation *</p>
                <input value={demandeFor.designation} onChange={(e) => setDemandeFor({ ...demandeFor, designation: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Référence</p>
                  <input value={demandeFor.reference} onChange={(e) => setDemandeFor({ ...demandeFor, reference: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
                </div>
                <div className="w-24">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quantité</p>
                  <input type="number" min={1} value={demandeFor.qte} onChange={(e) => setDemandeFor({ ...demandeFor, qte: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Notes</p>
                <input value={demandeFor.notes} onChange={(e) => setDemandeFor({ ...demandeFor, notes: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDemandeFor(null)}>Annuler</Button>
              <Button disabled={demandeFor.designation.trim().length < 2 || creerDemande.isPending} onClick={() => creerDemande.mutate({ designation: demandeFor.designation.trim(), reference: demandeFor.reference.trim() || undefined, quantite: Number(demandeFor.qte) || 1, notes: demandeFor.notes.trim() || undefined })}>
                <ShoppingCart size={14} /> Enregistrer la demande
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Demandes de commande en attente */}
      {(demandes ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <ShoppingCart size={14} className="text-primary" /> Demandes de commande en attente ({(demandes ?? []).length})
          </h3>
          <div className="space-y-1">
            {(demandes ?? []).map((d: any) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/20 px-3 py-1.5 text-xs">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${d.statut === "EN_ATTENTE" ? "bg-warning/15 text-warning-foreground" : "bg-success/15 text-success-foreground"}`}>{d.statut}</span>
                <span className="font-semibold">{d.designation}</span>
                {d.reference && <span className="font-mono text-[10px] text-muted-foreground">{d.reference}</span>}
                <span className="font-mono text-[10px] text-muted-foreground">× {Number(d.quantite)} {d.unite}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{new Date(d.creeLe).toLocaleDateString("fr-FR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialog commande fournisseur (réutilisé du catalogue) */}
      {commanderFor !== null && (
        <CommanderProduitDialog
          produitId={commanderFor.produitId}
          titre={commanderFor.titre}
          stock={commanderFor.stock}
          open
          onOpenChange={(open) => { if (!open) setCommanderFor(null); }}
        />
      )}
    </div>
  );
}