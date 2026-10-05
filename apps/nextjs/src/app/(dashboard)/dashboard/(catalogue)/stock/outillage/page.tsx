"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { SelectSearch } from "~/components/ui/select-search";
import {
  Wrench, Package, PackageOpen, Undo2, Loader2, Plus, Search, AlertTriangle,
  ArrowRightLeft, Droplets, ClipboardList, History, Hand, CheckCircle2, Settings2,
} from "lucide-react";
import { usePermissions } from "~/hooks/usePermissions";

const TYPE_LABELS: Record<string, string> = { OUTIL: "Outil", CONSOMMABLE: "Consommable", PIECE: "Pièce" };
const STATUT_OUTIL_LABELS: Record<string, string> = {
  REPARATION: "En réparation", USE: "Usé", CASSE: "Cassé", PERDU: "Perdu", VOLE: "Volé", REFORME: "Réformé",
};
const ETATS_RETOUR = ["OK", "ENDOMMAGE", "PERDU"] as const;

/** Page Bureau & Outillage : tableau de bord du magasinier (MVP conception stock + outillage). */
export default function BureauOutillagePage() {
  const { hasPermission } = usePermissions();
  const peutGerer = hasPermission("stock.utiliser") || hasPermission("stock.modifier");
  const peutConsulter = hasPermission("stock.consulter");

  const utils = api.useUtils();
  const { data: stockBureau, refetch: refetchBureau } = api.outillage.bureauList.useQuery({});
  const { data: prets, refetch: refetchPrets } = api.outillage.pretsEnCours.useQuery();
  const { data: mouvements, refetch: refetchMvts } = api.outillage.bureauMouvements.useQuery({});
  const { data: bureau } = api.outillage.bureauEmplacement.useQuery();
  const { data: emplacements } = api.stock.listEmplacements.useQuery({});
  const { data: produits } = api.catalog.list.useQuery({ limit: 200 });
  const produitsList = (produits?.items ?? []) as any[];
  const { data: employes } = api.rh.roster.useQuery({ statut: "actif" });
  const employesList = (employes ?? []) as any[];

  const [q, setQ] = useState("");
  const [typeFiltre, setTypeFiltre] = useState("");
  const [sousSeuilOnly, setSousSeuilOnly] = useState(false);

  // ─── Modals ───
  const [showAppro, setShowAppro] = useState(false);
  const [appro, setAppro] = useState({ produitId: 0, emplacementSourceId: 0, quantite: "1", motif: "" });
  const [showPret, setShowPret] = useState(false);
  const [pret, setPret] = useState({ outilId: 0, technicienId: 0, dateRetour: "", orId: "", motif: "" });
  const [showDotation, setShowDotation] = useState(false);
  const [dot, setDot] = useState({ produitId: 0, quantite: "1", orId: "", technicienId: 0, motif: "" });
  const [retour, setRetour] = useState<{ pretId: number; outil: string } | null>(null);
  const [retourForm, setRetourForm] = useState({ etatRetour: "OK", remarque: "" });
  const [seuilEdit, setSeuilEdit] = useState<{ produitId: number; valeur: string } | null>(null);

  const approvisionner = api.outillage.approvisionnerBureau.useMutation({
    onSuccess: () => { toast.success("Bureau approvisionné (transfert tracé)"); setShowAppro(false); setAppro({ produitId: 0, emplacementSourceId: 0, quantite: "1", motif: "" }); refetchBureau(); refetchMvts(); },
    onError: (e) => toast.error(e.message),
  });
  const preter = api.outillage.preter.useMutation({
    onSuccess: () => { toast.success("Outil prêté au technicien"); setShowPret(false); setPret({ outilId: 0, technicienId: 0, dateRetour: "", orId: "", motif: "" }); refetchBureau(); refetchPrets(); },
    onError: (e) => toast.error(e.message),
  });
  const retourner = api.outillage.retourner.useMutation({
    onSuccess: () => { toast.success("Retour enregistré"); setRetour(null); setRetourForm({ etatRetour: "OK", remarque: "" }); refetchBureau(); refetchPrets(); },
    onError: (e) => toast.error(e.message),
  });
  const doter = api.outillage.doter.useMutation({
    onSuccess: () => { toast.success("Dotation enregistrée (effet stock)"); setShowDotation(false); setDot({ produitId: 0, quantite: "1", orId: "", technicienId: 0, motif: "" }); refetchBureau(); refetchMvts(); },
    onError: (e) => toast.error(e.message),
  });
  const setSeuil = api.outillage.setSeuilBureau.useMutation({
    onSuccess: () => { toast.success("Seuil du bureau mis à jour"); refetchBureau(); },
    onError: (e) => toast.error(e.message),
  });

  const magasins = (emplacements ?? []).filter((e: any) => e.code !== "BUREAU");
  const outilsDisponibles = produitsList.filter((p: any) => p.typeProduit === "OUTIL");
  const consommables = produitsList.filter((p: any) => p.typeProduit !== "OUTIL");
  const optProduits = produitsList.map((p: any) => ({ value: p.id, label: `${p.codeArticle ?? ""} ${p.titre}`.trim(), hint: p.typeProduit }));
  const optMagasins = magasins.map((e: any) => ({ value: e.id, label: `${e.code} — ${e.libelle ?? ""}`.trim() }));
  const optOutils = outilsDisponibles.map((p: any) => ({ value: p.id, label: p.titre, hint: p.codeArticle ?? "" }));
  const optConsommables = consommables.map((p: any) => ({ value: p.id, label: `${p.codeArticle ?? ""} ${p.titre}`.trim() }));
  const optTechniciens = employesList.map((e: any) => ({ value: e.id, label: `${e.prenom ?? ""} ${e.nom}`.trim() }));

  const liste = (stockBureau ?? []).filter((r: any) => {
    if (typeFiltre && r.typeProduit !== typeFiltre) return false;
    if (sousSeuilOnly && !r.sousSeuil) return false;
    if (q.trim()) {
      const s = q.toLowerCase();
      return (r.titre ?? "").toLowerCase().includes(s) || (r.codeArticle ?? "").toLowerCase().includes(s) || (r.codeBarre ?? "").toLowerCase().includes(s);
    }
    return true;
  });

  const nbSousSeuil = (stockBureau ?? []).filter((r: any) => r.sousSeuil).length;
  const nbRetards = (prets ?? []).filter((p: any) => p.enRetard).length;
  const mouvementsAujourdhui = (mouvements ?? []).filter((m: any) => {
    if (!m.dateMouvement) return false;
    const d = new Date(m.dateMouvement);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  const doAppro = () => {
    if (!appro.produitId) { toast.error("Article requis"); return; }
    if (!appro.emplacementSourceId) { toast.error("Magasin source requis"); return; }
    approvisionner.mutate({ produitId: appro.produitId, emplacementSourceId: appro.emplacementSourceId, quantite: Number(appro.quantite) || 1, motif: appro.motif || undefined });
  };
  const doPret = () => {
    if (!pret.outilId) { toast.error("Outil requis"); return; }
    if (!pret.technicienId) { toast.error("Technicien requis"); return; }
    if (!pret.dateRetour) { toast.error("Date de retour prévue requise"); return; }
    preter.mutate({ outilId: pret.outilId, technicienId: pret.technicienId, dateRetour: pret.dateRetour, orId: pret.orId ? Number(pret.orId) : undefined, motif: pret.motif || undefined });
  };
  const doDot = () => {
    if (!dot.produitId) { toast.error("Consommable requis"); return; }
    if (dot.motif.trim().length < 3) { toast.error("Motif requis (3 caractères minimum)"); return; }
    doter.mutate({ produitId: dot.produitId, quantite: Number(dot.quantite) || 1, orId: dot.orId ? Number(dot.orId) : undefined, technicienId: dot.technicienId || undefined, motif: dot.motif.trim() });
  };
  const doRetour = () => {
    if (!retour) return;
    if (retourForm.etatRetour !== "OK" && retourForm.remarque.trim().length < 3) {
      toast.error("Remarque obligatoire (3 caractères minimum) quand l'état n'est pas OK");
      return;
    }
    retourner.mutate({ pretId: retour.pretId, etatRetour: retourForm.etatRetour as any, remarque: retourForm.remarque || undefined });
  };

  if (!peutConsulter) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <AlertTriangle size={15} /> Vous n'avez pas la permission de consulter le stock.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Bureau & Outillage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Point de distribution du magasinier : {bureau?.libelle ?? "Bureau"} — approvisionnement tracé depuis les magasins, prêts d'outils, dotations.
          </p>
        </div>
      </div>

      {/* ─── Tuiles ─── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><AlertTriangle size={13} className="text-warning-foreground" /> Sous seuil</div>
          <p className="mt-1 text-2xl font-bold">{nbSousSeuil}</p>
          <p className="text-xs text-muted-foreground">articles au bureau</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Hand size={13} className="text-primary" /> Prêts en cours</div>
          <p className="mt-1 text-2xl font-bold">{(prets ?? []).length}</p>
          <p className="text-xs text-muted-foreground">outils chez les techniciens</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Undo2 size={13} className="text-destructive" /> Prêts en retard</div>
          <p className={`mt-1 text-2xl font-bold ${nbRetards > 0 ? "text-destructive" : ""}`}>{nbRetards}</p>
          <p className="text-xs text-muted-foreground">à relancer</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><History size={13} className="text-sky-400" /> Mouvements du jour</div>
          <p className="mt-1 text-2xl font-bold">{mouvementsAujourdhui}</p>
          <p className="text-xs text-muted-foreground">entrées / sorties bureau</p>
        </div>
      </div>

      {/* ─── Actions principales ─── */}
      {peutGerer && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAppro(true)}>
            <ArrowRightLeft size={14} /> Approvisionner le bureau
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowPret(true)}>
            <Hand size={14} /> Prêter un outil
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowDotation(true)}>
            <Droplets size={14} /> Dotation consommable
          </Button>
        </div>
      )}

      {/* ─── Stock du bureau ─── */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Package size={15} className="text-primary" /> Stock du bureau ({liste.length})
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="h-8 w-52 pl-8 text-xs" />
            </div>
            <select value={typeFiltre} onChange={(e) => setTypeFiltre(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs">
              <option value="">Tous types</option>
              <option value="OUTIL">Outils</option>
              <option value="CONSOMMABLE">Consommables</option>
              <option value="PIECE">Pièces</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={sousSeuilOnly} onChange={(e) => setSousSeuilOnly(e.target.checked)} className="size-3.5" />
              Sous seuil
            </label>
          </div>
        </div>

        {(stockBureau ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Aucun article au bureau. Utilisez « Approvisionner le bureau » depuis un magasin.
          </p>
        ) : liste.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Aucun résultat pour les filtres.</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Article</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Quantité</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">Seuil</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">Statut</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((r: any) => (
                  <tr key={r.produitId} className="border-t border-border hover:bg-accent/30">
                    <td className="px-3 py-2">
                      <span className="font-medium">{r.titre}</span>
                      {r.codeArticle && <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{r.codeArticle}</span>}
                      {r.statutOutil && (
                        <span className="ml-1.5 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive">
                          {STATUT_OUTIL_LABELS[r.statutOutil] ?? r.statutOutil}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                        {TYPE_LABELS[r.typeProduit] ?? r.typeProduit}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {Number(r.quantite).toLocaleString("fr-FR")}
                      {Number(r.reservee) > 0 && <span className="text-[10px] text-muted-foreground"> (dispo {Number(r.disponible).toLocaleString("fr-FR")})</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {seuilEdit?.produitId === r.produitId ? (
                        <span className="inline-flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            autoFocus
                            value={seuilEdit.valeur}
                            onChange={(e) => setSeuilEdit({ produitId: r.produitId, valeur: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                setSeuil.mutate({ produitId: r.produitId, seuil: Math.max(0, Number(seuilEdit.valeur) || 0) });
                                setSeuilEdit(null);
                              }
                              if (e.key === "Escape") setSeuilEdit(null);
                            }}
                            className="h-6 w-16 text-xs"
                          />
                          <CheckCircle2 size={12} className="cursor-pointer text-success-foreground" onClick={() => { setSeuil.mutate({ produitId: r.produitId, seuil: Math.max(0, Number(seuilEdit.valeur) || 0) }); setSeuilEdit(null); }} />
                        </span>
                      ) : (
                        <>
                          <span className="font-mono text-xs">{r.seuil || "—"}</span>
                          {peutGerer && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="ml-1 h-5 w-5 p-0"
                              title="Régler le seuil du bureau"
                              onClick={() => setSeuilEdit({ produitId: r.produitId, valeur: String(r.seuil || 0) })}
                            >
                              <Settings2 size={11} />
                            </Button>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.sousSeuil ? (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase text-warning-foreground">Sous seuil</span>
                      ) : (
                        <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase text-success-foreground">OK</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {peutGerer && r.sousSeuil && (
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setShowAppro(true)}>
                          <ArrowRightLeft size={12} /> Approvisionner
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Prêts en cours / en retard ─── */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Hand size={15} className="text-primary" /> Prêts d'outils en cours ({(prets ?? []).length})
          </h2>
        </div>
        {(prets ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Aucun outil prêté.</p>
        ) : (
          <div className="space-y-1.5 p-3">
            {(prets ?? []).map((p: any) => (
              <div key={p.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${p.enRetard ? "border-destructive/30 bg-destructive/5" : "border-border bg-background"}`}>
                <Wrench size={13} className="text-primary" />
                <span className="font-medium">{p.outilTitre}</span>
                <span className="text-xs text-muted-foreground">→ {p.technicienPrenom} {p.technicienNom}</span>
                <span className="text-xs text-muted-foreground">depuis {new Date(p.dateSortie).toLocaleDateString("fr-FR")}</span>
                {p.dateRetour && (
                  <span className={`text-xs ${p.enRetard ? "font-bold text-destructive" : "text-muted-foreground"}`}>
                    retour prévu {new Date(p.dateRetour).toLocaleDateString("fr-FR")}
                  </span>
                )}
                {p.enRetard && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">En retard ({p.joursEcoules} j)</span>}
                {peutGerer && (
                  <Button size="sm" variant="outline" className="ml-auto h-7 gap-1 text-xs" onClick={() => { setRetour({ pretId: p.id, outil: p.outilTitre }); setRetourForm({ etatRetour: "OK", remarque: "" }); }}>
                    <Undo2 size={12} /> Retourner
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Mouvements récents du bureau ─── */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <History size={15} className="text-primary" /> Mouvements récents du bureau
          </h2>
        </div>
        {(mouvements ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Aucun mouvement.</p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto p-3">
            {(mouvements ?? []).map((m: any) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${m.type === "APPROVISIONNEMENT_BUREAU_ENTREE" || m.type === "APPROVISIONNEMENT_BUREAU_SORTIE" ? "bg-sky-500/10 text-sky-400" : m.type === "DOTATION_CONSOMMABLE" ? "bg-warning/10 text-warning-foreground" : m.type === "SORTIE_OUTIL" ? "bg-primary/10 text-primary" : m.type === "RETOUR_OUTIL" ? "bg-success/10 text-success-foreground" : "bg-muted text-muted-foreground"}`}>
                  {m.type.replace(/_/g, " ")}
                </span>
                <span className="min-w-0 flex-1 truncate">{m.produitTitre}</span>
                <span className={`font-mono font-bold ${m.sens === "S" ? "text-destructive" : "text-success-foreground"}`}>{m.sens === "S" ? "−" : "+"}{Number(m.quantite)}</span>
                {m.motif && <span className="max-w-52 truncate text-muted-foreground">· {m.motif}</span>}
                <span className="text-[10px] text-muted-foreground">{new Date(m.dateMouvement).toLocaleString("fr-FR")}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Modal : Approvisionner le bureau ─── */}
      <Dialog open={showAppro} onOpenChange={setShowAppro}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowRightLeft size={15} className="text-primary" /> Approvisionner le bureau</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Transfert tracé : sortie du magasin source → entrée au bureau (mouvements formalisés).</p>
          <div className="mt-3 space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Article *</Label>
              <SelectSearch
                value={appro.produitId || null}
                onChange={(v) => setAppro({ ...appro, produitId: Number(v) })}
                options={optProduits}
                placeholder="Rechercher un article…"
                searchPlaceholder="Code, désignation…"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Magasin source *</Label>
                <SelectSearch
                  value={appro.emplacementSourceId || null}
                  onChange={(v) => setAppro({ ...appro, emplacementSourceId: Number(v) })}
                  options={optMagasins}
                  placeholder="Magasin…"
                  searchPlaceholder="Rechercher…"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Quantité *</Label>
                <Input type="number" min={1} value={appro.quantite} onChange={(e) => setAppro({ ...appro, quantite: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Motif</Label>
              <Input value={appro.motif} onChange={(e) => setAppro({ ...appro, motif: e.target.value })} placeholder="Réassort, urgence…" className="mt-1" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAppro(false)}>Annuler</Button>
              <Button className="gap-1.5" disabled={approvisionner.isPending} onClick={doAppro}>
                {approvisionner.isPending ? <Loader2 className="size-3 animate-spin" /> : <ArrowRightLeft size={14} />} Approvisionner
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal : Prêter un outil ─── */}
      <Dialog open={showPret} onOpenChange={setShowPret}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Hand size={15} className="text-primary" /> Prêter un outil</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Sortie au bureau → technicien, avec retour prévu et contrôle d'état au retour.</p>
          <div className="mt-3 space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Outil *</Label>
              <SelectSearch
                value={pret.outilId || null}
                onChange={(v) => setPret({ ...pret, outilId: Number(v) })}
                options={optOutils}
                placeholder="Rechercher un outil…"
                searchPlaceholder="Clé, pince, valise…"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Technicien *</Label>
                <SelectSearch
                  value={pret.technicienId || null}
                  onChange={(v) => setPret({ ...pret, technicienId: Number(v) })}
                  options={optTechniciens}
                  placeholder="Technicien…"
                  searchPlaceholder="Nom…"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Retour prévu *</Label>
                <Input type="date" value={pret.dateRetour} onChange={(e) => setPret({ ...pret, dateRetour: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">OR lié (optionnel)</Label>
                <Input value={pret.orId} onChange={(e) => setPret({ ...pret, orId: e.target.value })} placeholder="N° d'OR" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Motif</Label>
                <Input value={pret.motif} onChange={(e) => setPret({ ...pret, motif: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPret(false)}>Annuler</Button>
              <Button className="gap-1.5" disabled={preter.isPending} onClick={doPret}>
                {preter.isPending ? <Loader2 className="size-3 animate-spin" /> : <Hand size={14} />} Prêter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal : Dotation consommable ─── */}
      <Dialog open={showDotation} onOpenChange={setShowDotation}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Droplets size={15} className="text-primary" /> Dotation consommable</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Sortie du bureau vers un OR ou un technicien, sans retour (effet stock immédiat).</p>
          <div className="mt-3 space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Consommable / pièce *</Label>
              <SelectSearch
                value={dot.produitId || null}
                onChange={(v) => setDot({ ...dot, produitId: Number(v) })}
                options={optConsommables}
                placeholder="Rechercher un article…"
                searchPlaceholder="Code, désignation…"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Quantité *</Label>
                <Input type="number" min={1} value={dot.quantite} onChange={(e) => setDot({ ...dot, quantite: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">OR lié</Label>
                <Input value={dot.orId} onChange={(e) => setDot({ ...dot, orId: e.target.value })} placeholder="N° d'OR" className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Technicien</Label>
              <SelectSearch
                value={dot.technicienId || null}
                onChange={(v) => setDot({ ...dot, technicienId: Number(v) })}
                options={optTechniciens}
                placeholder="—"
                searchPlaceholder="Nom…"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Motif * (min 3)</Label>
              <Input value={dot.motif} onChange={(e) => setDot({ ...dot, motif: e.target.value })} placeholder="Ex : vidange OR 5, huile 5W40" className="mt-1" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDotation(false)}>Annuler</Button>
              <Button className="gap-1.5" disabled={doter.isPending} onClick={doDot}>
                {doter.isPending ? <Loader2 className="size-3 animate-spin" /> : <Droplets size={14} />} Doter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal : Retour d'outil ─── */}
      <Dialog open={retour !== null} onOpenChange={(o) => { if (!o) setRetour(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Undo2 size={15} className="text-primary" /> Retour : {retour?.outil}</DialogTitle></DialogHeader>
          <div className="mt-3 space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">État au retour *</Label>
              <select value={retourForm.etatRetour} onChange={(e) => setRetourForm({ ...retourForm, etatRetour: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {ETATS_RETOUR.map((e) => <option key={e} value={e}>{e === "OK" ? "OK" : e === "ENDOMMAGE" ? "Endommagé" : "Perdu"}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Remarque {retourForm.etatRetour !== "OK" && <span className="text-destructive">* obligatoire si ≠ OK</span>}</Label>
              <textarea value={retourForm.remarque} onChange={(e) => setRetourForm({ ...retourForm, remarque: e.target.value })} rows={2} placeholder="État, responsabilité…" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRetour(null)}>Annuler</Button>
              <Button className="gap-1.5" disabled={retourner.isPending} onClick={doRetour}>
                {retourner.isPending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 size={14} />} Valider le retour
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {!peutGerer && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          <ClipboardList size={13} /> Lecture seule : vous pouvez consulter le bureau, mais les actions (approvisionner, prêter, doter, retourner) requièrent les droits du magasinier.
        </p>
      )}
    </div>
  );
}