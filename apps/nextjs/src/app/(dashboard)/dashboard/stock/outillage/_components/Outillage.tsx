"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  AlertTriangle, ClipboardCheck, Hammer, HandHelping, ImageOff, PackageSearch, Plus, RefreshCw, Search, Undo2, Wrench, X,
} from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { usePermissions } from "~/hooks/usePermissions";

const fmtDate = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");
const fmtJour = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

const STATUT_META: Record<string, { label: string; badge: string }> = {
  DISPONIBLE: { label: "Disponible", badge: "bg-success/15 text-success-foreground" },
  PRETE: { label: "Prêté", badge: "bg-warning/15 text-warning-foreground" },
  STOCK_EPUISE: { label: "Épuisé", badge: "bg-destructive/15 text-destructive" },
  REPARATION: { label: "En réparation", badge: "bg-warning/15 text-warning-foreground" },
  USE: { label: "Usé", badge: "bg-warning/15 text-warning-foreground" },
  CASSE: { label: "Cassé", badge: "bg-destructive/15 text-destructive" },
  PERDU: { label: "Perdu", badge: "bg-destructive/15 text-destructive" },
  VOLE: { label: "Volé", badge: "bg-destructive/15 text-destructive" },
  REFORME: { label: "Réformé", badge: "bg-muted text-muted-foreground" },
};

const DECLARE_STATUTS = [
  { value: "REPARATION", label: "En réparation" },
  { value: "USE", label: "Usé" },
  { value: "CASSE", label: "Cassé" },
  { value: "PERDU", label: "Perdu" },
  { value: "VOLE", label: "Volé" },
  { value: "REFORME", label: "Réformé" },
] as const;

const ETAT_RETOUR_OPTIONS = [
  { value: "OK", label: "OK — rendu en bon état" },
  { value: "ENDOMMAGE", label: "Endommagé (cassé / usé)" },
  { value: "PERDU", label: "Perdu (non rendu / volé)" },
] as const;

export function Outillage() {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [statut, setStatut] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [showPret, setShowPret] = useState<number | null>(null);
  const [techPret, setTechPret] = useState(0);
  const [motifPret, setMotifPret] = useState("");
  const [dateRetourPret, setDateRetourPret] = useState("");
  const [orPret, setOrPret] = useState(0);
  const [retourFor, setRetourFor] = useState<{ pretId: number; etat: "OK" | "ENDOMMAGE" | "PERDU"; remarque: string } | null>(null);
  const [declarerFor, setDeclarerFor] = useState<{ outilId: number; titre: string; statut: string; motif: string } | null>(null);
  const [leverFor, setLeverFor] = useState<{ outilId: number; motif: string } | null>(null);

  const { data, isLoading, refetch } = api.outillage.list.useQuery({
    q: q || undefined,
    type: (type || undefined) as "OUTIL" | "CONSOMMABLE" | undefined,
    statut: (statut || undefined) as "TOUS" | "DISPONIBLE" | "PRETE" | "STOCK_EPUISE" | "REPARATION" | "USE" | "CASSE" | "PERDU" | "VOLE" | "REFORME" | undefined,
    limit: 300,
  }, { refetchInterval: 30_000 });
  const { data: techniciens } = api.rh.list.useQuery({ limit: 200, statut: "actif" });
  const { data: histo } = api.outillage.historiquePrets.useQuery({ limit: 20 }, { refetchInterval: 30_000 });
  const { data: orsEnCours } = api.or.getDashboard.useQuery(undefined, { select: (d: any) => (d?.ors ?? []).filter((o: any) => ["EN_COURS", "EN_ATTENTE", "DIAGNOSTIC"].includes(o.statut ?? "")) });

  const preter = api.outillage.preter.useMutation({
    onSuccess: () => { toast.success("Outil prêté"); utils.outillage.list.invalidate(); utils.outillage.historiquePrets.invalidate(); utils.outillage.pretsEnCours.invalidate(); setShowPret(null); setTechPret(0); setMotifPret(""); setDateRetourPret(""); setOrPret(0); },
    onError: (e) => toast.error(e.message),
  });
  const retourner = api.outillage.retourner.useMutation({
    onSuccess: (r) => {
      const etat = retourFor?.etat;
      toast.success(etat === "PERDU" ? "Outil déclaré perdu — il n'est plus prêtable" : etat === "ENDOMMAGE" ? "Outil rendu — statut Cassé enregistré" : "Outil rendu en bon état");
      utils.outillage.list.invalidate(); utils.outillage.historiquePrets.invalidate(); utils.outillage.get.invalidate(); utils.outillage.pretsEnCours.invalidate();
      setRetourFor(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const declarerStatut = api.outillage.declarerStatut.useMutation({
    onSuccess: (r) => { toast.success(`Outil déclaré : ${r.statutLabel}`); utils.outillage.list.invalidate(); utils.outillage.get.invalidate(); utils.outillage.pretsEnCours.invalidate(); setDeclarerFor(null); },
    onError: (e) => toast.error(e.message),
  });
  const leverStatut = api.outillage.leverStatut.useMutation({
    onSuccess: () => { toast.success("Outil de nouveau disponible"); utils.outillage.list.invalidate(); utils.outillage.get.invalidate(); setLeverFor(null); },
    onError: (e) => toast.error(e.message),
  });

  const canModifier = hasPermission("stock.modifier");
  const outils = (data ?? []) as any[];
  const techs = (techniciens?.employees ?? []) as any[];
  const pretsRecents = (histo ?? []) as any[];
  const ors = (orsEnCours ?? []) as any[];
  const enRetardCount = pretsRecents.filter((p: any) => p.actif && p.enRetard).length;

  const img = (o: any) => (Array.isArray(o?.photos) && o.photos.length > 0 ? o.photos[0] : o?.imageUrl ?? null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Hammer size={22} className="text-primary" /> Outillage & Matériel
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Outils prêtés aux techniciens (statut disponible/prêté) · consommables et EPI en stock · vérification à l'inventaire.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {enRetardCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-destructive/15 px-3 py-1.5 text-xs font-bold text-destructive">
              <AlertTriangle size={13} /> {enRetardCount} prêt(s) en retard
            </span>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => refetch()}>
            <RefreshCw size={13} /> Actualiser
          </Button>
          <Link href="/dashboard/catalog">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Plus size={13} /> Enregistrer un outil / matériel (catalogue)
            </Button>
          </Link>
          <Link href="/dashboard/stock/inventaire">
            <Button size="sm" className="gap-1.5 text-xs">
              <ClipboardCheck size={13} /> Inventaire
            </Button>
          </Link>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un outil : nom, code-barres, code article…" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary/50" />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="">Tous les types</option>
          <option value="OUTIL">Outils</option>
          <option value="CONSOMMABLE">Consommables / EPI</option>
        </select>
        <select value={statut} onChange={(e) => setStatut(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="">Tous les statuts</option>
          <option value="DISPONIBLE">Disponible</option>
          <option value="PRETE">Prêté</option>
          <option value="REPARATION">En réparation</option>
          <option value="USE">Usé</option>
          <option value="CASSE">Cassé</option>
          <option value="PERDU">Perdu</option>
          <option value="VOLE">Volé</option>
          <option value="REFORME">Réformé</option>
          <option value="STOCK_EPUISE">Épuisé</option>
        </select>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : outils.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Wrench size={24} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">Aucun outil ou matériel enregistré. Créez-le depuis le catalogue (type « Outil » ou « Consommable »).</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full">
            <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Outil / Matériel</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Catégorie</th>
                <th className="px-3 py-2.5 text-right">Stock</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="px-3 py-2.5">Prêté à</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {outils.map((o: any) => {
                const m = STATUT_META[o.statut] ?? { label: o.statut, badge: "bg-muted text-muted-foreground" };
                const photo = img(o);
                const pret = o.prets?.[0];
                return (
                  <tr key={o.id} className="text-sm hover:bg-accent/30">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {photo ? (
                          <img src={photo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground"><ImageOff size={14} /></span>
                        )}
                        <div>
                          <button onClick={() => setDetailId(o.id)} className="text-left font-semibold text-primary hover:underline">
                            {o.titre}
                          </button>
                          <span className="block font-mono text-[10px] text-muted-foreground">{o.codeBarre ?? o.codeArticle}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${o.typeProduit === "OUTIL" ? "bg-sky-500/15 text-sky-400" : "bg-violet-500/15 text-violet-400"}`}>
                        {o.typeProduit === "OUTIL" ? "Outil" : "Consommable"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{o.categorieNom ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      <span className={Number(o.stockTotal) <= 0 ? "text-destructive" : "text-foreground"}>{Number(o.stockTotal)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${m.badge}`}>{m.label}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {pret ? (
                        <div>
                          <span className="font-semibold text-warning-foreground">{pret.technicien}</span>
                          {pret.enRetard && (
                            <span className="ml-1 inline-block rounded-full bg-destructive/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive">En retard</span>
                          )}
                          {pret.dateRetour && <span className="block text-[10px] text-muted-foreground">retour prévu {fmtJour(pret.dateRetour)}</span>}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setDetailId(o.id)}>Fiche</Button>
                        {canModifier && o.typeProduit === "OUTIL" && (
                          o.estPrete ? (
                            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px] text-success-foreground" disabled={retourner.isPending} onClick={() => setRetourFor({ pretId: pret.id, etat: "OK", remarque: "" })}>
                              <Undo2 size={11} /> Rendre
                            </Button>
                          ) : o.statutOutil ? (
                            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px] text-success-foreground" onClick={() => setLeverFor({ outilId: o.id, motif: "" })}>
                              <Undo2 size={11} /> Rendre dispo
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setShowPret(o.id)}>
                                <HandHelping size={11} /> Prêter
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[10px] text-destructive" onClick={() => setDeclarerFor({ outilId: o.id, titre: o.titre, statut: "CASSE", motif: "" })}>
                                <AlertTriangle size={11} /> Déclarer
                              </Button>
                            </>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Prêts récents */}
      {pretsRecents.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Undo2 size={14} className="text-primary" /> Prêts récents
          </h3>
          <div className="space-y-1">
            {pretsRecents.map((p: any) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/20 px-3 py-1.5 text-xs">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${p.actif ? "bg-warning/15 text-warning-foreground" : "bg-success/15 text-success-foreground"}`}>{p.actif ? "En cours" : "Rendu"}</span>
                <span className="font-semibold">{p.outilTitre}</span>
                <span className="text-muted-foreground">→ {p.technicienPrenom ?? ""} {p.technicienNom}</span>
                <span className="ml-auto text-muted-foreground">{fmtDate(p.dateSortie)}{p.retourneLe ? ` · rendu ${fmtDate(p.retourneLe)}` : ""}{p.etatRetour ? ` · ${p.etatRetour}` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal prêt */}
      {showPret !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowPret(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <HandHelping size={16} className="text-primary" /> Prêter l'outil
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Technicien</p>
                <select value={techPret} onChange={(e) => setTechPret(Number(e.target.value))} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  <option value={0}>Choisir…</option>
                  {techs.filter((t: any) => t.statut === "actif").map((t: any) => <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Réparation liée (OR en cours — optionnel)</p>
                <select value={orPret} onChange={(e) => setOrPret(Number(e.target.value))} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  <option value={0}>Aucune — prêt simple</option>
                  {ors.map((o: any) => <option key={o.id} value={o.id}>OR-{o.numero ?? o.id} — {o.vehicule ?? ""}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Date de retour prévue *</p>
                <input type="date" value={dateRetourPret} onChange={(e) => setDateRetourPret(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Motif (optionnel)</p>
                <input value={motifPret} onChange={(e) => setMotifPret(e.target.value)} placeholder="ex. Remplacement plaquettes" className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPret(null)}>Annuler</Button>
              <Button disabled={!techPret || !dateRetourPret || preter.isPending} onClick={() => preter.mutate({ outilId: showPret, technicienId: techPret, orId: orPret || undefined, motif: motifPret || undefined, dateRetour: dateRetourPret })}>
                <HandHelping size={14} /> Prêter
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal retour : état choisi par le magasinier (contrôle du retour) */}
      {retourFor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setRetourFor(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Undo2 size={16} className="text-primary" /> Rendre l'outil — contrôle du retour
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">L'outil revient-il entier ? L'état choisi est enregistré dans l'historique.</p>
            <div className="mt-4 space-y-2">
              {ETAT_RETOUR_OPTIONS.map((opt) => (
                <label key={opt.value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${retourFor.etat === opt.value ? "border-primary/60 bg-primary/5" : "border-border"}`}>
                  <input type="radio" checked={retourFor.etat === opt.value} onChange={() => setRetourFor({ ...retourFor, etat: opt.value })} className="accent-primary" />
                  <span className={opt.value === "PERDU" ? "font-semibold text-destructive" : opt.value === "ENDOMMAGE" ? "font-semibold text-warning-foreground" : ""}>{opt.label}</span>
                </label>
              ))}
            </div>
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Remarque {retourFor.etat !== "OK" ? "(obligatoire)" : "(optionnelle)"}</p>
              <input value={retourFor.remarque} onChange={(e) => setRetourFor({ ...retourFor, remarque: e.target.value })} placeholder="ex. mâchoire faussée, manche fissuré…" className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </div>
            {retourFor.etat === "PERDU" && (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-[11px] text-destructive">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                L'outil sera marqué « Perdu » et ne sera plus prêtable.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRetourFor(null)}>Annuler</Button>
              <Button disabled={retourner.isPending || (retourFor.etat !== "OK" && retourFor.remarque.trim().length < 3)} onClick={() => retourner.mutate({ pretId: retourFor.pretId, etatRetour: retourFor.etat, remarque: retourFor.remarque.trim() || undefined })}>
                <Undo2 size={14} /> Confirmer le retour
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal déclaration : usé / cassé / perdu / volé / en réparation / réformé */}
      {declarerFor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setDeclarerFor(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <AlertTriangle size={16} className="text-destructive" /> Déclarer : {declarerFor.titre}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">Justification obligatoire — l'outil ne sera plus prêtable (la quantité est ajustée pour perte/vol/casse/réforme).</p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Statut</p>
                <select value={declarerFor.statut} onChange={(e) => setDeclarerFor({ ...declarerFor, statut: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  {DECLARE_STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Motif (obligatoire, min 3 caractères)</p>
                <textarea value={declarerFor.motif} onChange={(e) => setDeclarerFor({ ...declarerFor, motif: e.target.value })} rows={2} placeholder="ex. mâchoire faussée après chute, disparu du vestiaire…" className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeclarerFor(null)}>Annuler</Button>
              <Button variant="destructive" disabled={declarerFor.motif.trim().length < 3 || declarerStatut.isPending} onClick={() => declarerStatut.mutate({ outilId: declarerFor.outilId, statut: declarerFor.statut as any, motif: declarerFor.motif.trim() })}>
                <AlertTriangle size={14} /> Déclarer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal lever un statut (retour à disponible) */}
      {leverFor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setLeverFor(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Undo2 size={16} className="text-success-foreground" /> Rendre l'outil disponible
            </h3>
            <div className="mt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Motif (min 3 caractères)</p>
              <input value={leverFor.motif} onChange={(e) => setLeverFor({ ...leverFor, motif: e.target.value })} placeholder="ex. réparation terminée" className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLeverFor(null)}>Annuler</Button>
              <Button disabled={leverFor.motif.trim().length < 3 || leverStatut.isPending} onClick={() => leverStatut.mutate({ outilId: leverFor.outilId, motif: leverFor.motif.trim() })}>
                <Undo2 size={14} /> Rendre disponible
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Fiche outil */}
      {detailId !== null && <FicheOutil id={detailId} onClose={() => setDetailId(null)} canModifier={canModifier} onRetourner={retourner} onOuvrirRetour={setRetourFor} />}
    </div>
  );
}

// ─── Fiche outil : photos + stock par emplacement/unité + prêts + mouvements ───
function FicheOutil({ id, onClose, canModifier, onRetourner, onOuvrirRetour }: { id: number; onClose: () => void; canModifier: boolean; onRetourner: any; onOuvrirRetour: (r: { pretId: number; etat: "OK" | "ENDOMMAGE" | "PERDU"; remarque: string }) => void }) {
  const { data, isLoading } = api.outillage.get.useQuery({ id }, { refetchInterval: 30_000 });
  if (isLoading || !data) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"><div className="h-64 w-full max-w-2xl animate-pulse rounded-2xl bg-muted" /></div>;
  const o = data.outil as any;
  const photo = Array.isArray(o?.photos) && o.photos.length > 0 ? o.photos[0] : o?.imageUrl ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            {photo ? (
              <img src={photo} alt="" className="h-14 w-14 rounded-xl object-cover" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground"><ImageOff size={20} /></span>
            )}
            <div>
              <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                <Wrench size={16} className="text-primary" /> {o.titre}
              </h3>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {o.codeBarre ?? o.codeArticle} · {o.typeProduit === "OUTIL" ? "Outil" : "Consommable"} · {o.categorieNom ?? "—"} {o.marque ? `· ${o.marque}` : ""} {o.etat ? `· ${o.etat}` : ""}
              </p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Fermer"><X size={14} /></Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <F label="Stock total" value={`${data.stockTotal} unité(s)`} />
          {data.stock.map((s: any) => <F key={s.emplacementId} label={`Emplacement #${s.emplacementId}`} value={`${s.quantite} unité(s)`} />)}
          {data.stock.length === 0 && <F label="Emplacement" value="Aucun stock enregistré" />}
          <F label="Seuil d'alerte" value={o.seuilAlerte != null ? String(o.seuilAlerte) : "—"} />
        </div>

        {data.stockParUnite.length > 0 && (
          <div className="mt-3 rounded-lg bg-muted/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quantités par unité (huiles, consommables)</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {data.stockParUnite.map((u: any) => (
                <span key={u.uniteId} className="rounded-full bg-background px-2.5 py-1 text-xs font-mono font-bold">
                  {u.quantite} {u.symbole ?? u.libelle ?? u.code}
                </span>
              ))}
            </div>
          </div>
        )}

        {data.futs?.length > 0 && (
          <div className="mt-3 rounded-lg bg-muted/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fûts / lots (specs huiles)</p>
            <div className="mt-1.5 space-y-1">
              {data.futs.map((f: any) => (
                <div key={f.lotId} className="flex flex-wrap items-center gap-2 rounded-lg bg-background px-2.5 py-1.5 text-xs">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${f.ouvert ? "bg-warning/15 text-warning-foreground" : "bg-muted text-muted-foreground"}`}>{f.ouvert ? "Ouvert" : "Fermé"}</span>
                  <span className="font-mono font-bold">{f.numeroLot ?? `LOT-${f.lotId}`}</span>
                  <span className="font-mono text-muted-foreground">{f.volumeRestant} / {f.volumeInitial} L</span>
                  {f.datePeremption && <span className="text-muted-foreground">· périme le {new Date(f.datePeremption).toLocaleDateString("fr-FR")}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {o.description && <p className="mt-3 rounded-lg bg-muted/20 p-3 text-sm text-muted-foreground">{o.description}</p>}

        <h4 className="mt-5 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Prêts ({data.historiquePrets.length})</h4>
        {data.historiquePrets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Jamais prêté.</p>
        ) : (
          <div className="space-y-1.5">
            {data.historiquePrets.map((p: any) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/20 px-3 py-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${p.actif ? "bg-warning/15 text-warning-foreground" : "bg-success/15 text-success-foreground"}`}>{p.actif ? "En cours" : "Rendu"}</span>
                <span className="font-semibold">{p.technicienPrenom ?? ""} {p.technicienNom}</span>
                <span className="text-muted-foreground">{fmtDate(p.dateSortie)}{p.retourneLe ? ` → ${fmtDate(p.retourneLe)}` : ""}</span>
                {p.dateRetour && !p.retourneLe && <span className="text-muted-foreground">· prévu {fmtJour(p.dateRetour)}</span>}
                {p.enRetard && <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive">En retard</span>}
                {p.motif && <span className="text-muted-foreground">· {p.motif}</span>}
                {p.orId && <span className="font-mono text-[10px] text-muted-foreground">· OR #{p.orId}</span>}
                {p.etatRetour && <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${p.etatRetour === "OK" ? "bg-success/15 text-success-foreground" : p.etatRetour === "ENDOMMAGE" ? "bg-warning/15 text-warning-foreground" : "bg-destructive/15 text-destructive"}`}>{p.etatRetour}</span>}
                {p.remarque && <span className="italic text-muted-foreground">· {p.remarque}</span>}
                {p.actif && canModifier && (
                  <Button size="sm" variant="outline" className="ml-auto h-6 gap-1 px-2 text-[10px] text-success-foreground" disabled={onRetourner.isPending} onClick={() => onOuvrirRetour({ pretId: p.id, etat: "OK", remarque: "" })}>
                    <Undo2 size={11} /> Rendre
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <h4 className="mt-5 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Mouvements de stock (30 derniers)</h4>
        {data.mouvements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun mouvement.</p>
        ) : (
          <div className="space-y-1">
            {data.mouvements.map((m: any) => (
              <div key={m.id} className="flex items-center gap-2 rounded-lg bg-muted/20 px-3 py-1.5 text-xs">
                <PackageSearch size={11} className="text-muted-foreground" />
                <span className="font-mono text-[10px] font-bold">{m.type}</span>
                <span className="font-semibold">{Number(m.quantite)}</span>
                {m.motif && <span className="text-muted-foreground">· {m.motif}</span>}
                <span className="ml-auto text-muted-foreground">{fmtDate(m.dateMouvement)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Fermer</Button>
          <Link href="/dashboard/stock/inventaire">
            <Button size="sm" variant="outline"><ClipboardCheck size={13} /> Vérifier à l'inventaire</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function F({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}