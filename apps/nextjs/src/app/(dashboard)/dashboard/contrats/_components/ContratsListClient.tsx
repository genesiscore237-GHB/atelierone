"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  Ban,
  CheckCircle2,
  FileSignature,
  Loader2,
  Pause,
  Plus,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { usePermissions } from "~/hooks/usePermissions";

const TYPE_CONTRAT: Record<string, string> = {
  FORFAIT_MENSUEL: "Forfait mensuel",
  FORFAIT_ANNUEL: "Forfait annuel",
  A_LA_DEMANDE: "À la demande",
  PREVENTIF_PROGRAMME: "Préventif programmé",
  MIXTE: "Mixte",
};

const STATUT_STYLE: Record<string, string> = {
  ACTIF: "bg-success/10 text-success-foreground",
  BROUILLON: "bg-muted text-muted-foreground",
  SUSPENDU: "bg-warning/10 text-warning-foreground",
  RESILIE: "bg-destructive/10 text-destructive",
  EXPIRE: "bg-muted text-muted-foreground",
  RENOUVELLE: "bg-primary/10 text-primary",
};

const EMPTY_FORM = {
  clientId: 0,
  libelle: "",
  typeContrat: "A_LA_DEMANDE",
  dateDebut: new Date().toISOString().slice(0, 10),
  dateFin: "",
  montantForfait: "",
  frequenceFacturation: "A_LA_DEMANDE",
  delaiPaiementJours: 30,
  delaiInterventionHeures: "",
  couverture: "PIECES_ET_MO",
  statutInitial: "ACTIF" as "BROUILLON" | "ACTIF",
};

const EMPTY_GRP = {
  contratId: 0,
  dateDebut: new Date().toISOString().slice(0, 10),
  dateFin: new Date().toISOString().slice(0, 10),
  modePaiement: "credit",
};

export function ContratsListClient() {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [statutFilter, setStatutFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [resilierMotif, setResilierMotif] = useState("");
  const [confirmResilier, setConfirmResilier] = useState<any>(null);
  const [showGroupe, setShowGroupe] = useState(false);
  const [grp, setGrp] = useState(EMPTY_GRP);

  const { data, isLoading } = api.contrats.list.useQuery({ search: search || undefined, statut: statutFilter || undefined, limit: 100 });
  const { data: clientsData } = api.clients.list.useQuery({ typeClient: "ENTR", statut: "ACTIF", limit: 100 });
  const { data: clientsAdmin } = api.clients.list.useQuery({ typeClient: "ADMIN", statut: "ACTIF", limit: 100 });
  const { data: clientsFlotte } = api.clients.list.useQuery({ typeClient: "FLOTTE", statut: "ACTIF", limit: 100 });

  const create = api.contrats.create.useMutation({
    onSuccess: (r) => {
      toast.success(`Contrat ${r.numeroContrat} créé`);
      utils.contrats.list.invalidate();
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
    onError: (e) => toast.error(e.message),
  });
  const activer = api.contrats.activer.useMutation({
    onSuccess: () => { toast.success("Contrat activé"); utils.contrats.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const suspendre = api.contrats.suspendre.useMutation({
    onSuccess: () => { toast.success("Contrat suspendu"); utils.contrats.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const resilier = api.contrats.resilier.useMutation({
    onSuccess: () => { toast.success("Contrat résilié"); utils.contrats.list.invalidate(); setConfirmResilier(null); setResilierMotif(""); },
    onError: (e) => toast.error(e.message),
  });
  const renouveler = api.contrats.renouveler.useMutation({
    onSuccess: (r) => { toast.success(`Contrat renouvelé — fin ${r.nouvelleFin}`); utils.contrats.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const facturerPeriode = api.contrats.facturerPeriode.useMutation({
    onSuccess: (r: any) => {
      toast.success(`Facture groupée ${r.reference} — ${r.orsFactures} OR (${r.montantTotal.toLocaleString("fr-FR")} F${r.echeance ? `, échéance ${r.echeance}` : ""})`);
      utils.contrats.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const contrats = (data?.contrats ?? []) as any[];
  const eligible = [...((clientsData?.clients ?? []) as any[]), ...((clientsAdmin?.clients ?? []) as any[]), ...((clientsFlotte?.clients ?? []) as any[])];
  const canModifier = hasPermission("contrats.modifier") || hasPermission("contrats.creer");

  const submit = () => {
    if (!form.clientId || !form.libelle.trim()) {
      toast.error("Client et libellé requis");
      return;
    }
    create.mutate({
      clientId: form.clientId,
      libelle: form.libelle.trim(),
      typeContrat: form.typeContrat as any,
      dateDebut: form.dateDebut,
      dateFin: form.dateFin || undefined,
      montantForfait: form.montantForfait ? Number(form.montantForfait) : undefined,
      frequenceFacturation: form.frequenceFacturation as any,
      delaiPaiementJours: form.delaiPaiementJours,
      delaiInterventionHeures: form.delaiInterventionHeures ? Number(form.delaiInterventionHeures) : undefined,
      couverture: form.couverture,
      statutInitial: form.statutInitial,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Contrats de maintenance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Forfaits, préventif programmé, à la demande — avec véhicules couverts et cycle de vie complet.
          </p>
        </div>
        {canModifier && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowGroupe((v) => !v)} className="gap-2" title="Facturer les OR terminés non facturés d'un contrat sur une période">
              <FileSignature size={16} /> Facturation groupée
            </Button>
            <Button onClick={() => setShowForm(true)} className="gap-2">
              <Plus size={16} /> Nouveau contrat
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Numéro, libellé, client…" className="w-72 pl-9" />
        </div>
        <select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)} className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none">
          <option value="">Tous les statuts</option>
          {["ACTIF", "BROUILLON", "SUSPENDU", "RESILIE", "EXPIRE", "RENOUVELLE"].map((s) => <option key={s} value={s} className="bg-background">{s}</option>)}
        </select>
      </div>

      {showGroupe && (
        <div className="rounded-xl border border-primary/30 bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <FileSignature size={14} className="text-primary" /> Facturation groupée par contrat
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Regroupe en UNE facture tous les OR terminés non facturés des véhicules couverts, clôturés sur la période. Crédit = créance avec échéance du contrat.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <select value={grp.contratId} onChange={(e) => setGrp({ ...grp, contratId: Number(e.target.value) })} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
              <option value={0}>Contrat (actif)…</option>
              {(contrats ?? []).filter((c: any) => (c.statutEffectif ?? c.statut) === "ACTIF").map((c: any) => (
                <option key={c.id} value={c.id}>{c.numeroContrat} — {c.libelle}</option>
              ))}
            </select>
            <Input type="date" value={grp.dateDebut} onChange={(e) => setGrp({ ...grp, dateDebut: e.target.value })} />
            <Input type="date" value={grp.dateFin} onChange={(e) => setGrp({ ...grp, dateFin: e.target.value })} />
            <select value={grp.modePaiement} onChange={(e) => setGrp({ ...grp, modePaiement: e.target.value })} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
              <option value="credit">Crédit (créance)</option>
              <option value="virement">Virement</option>
              <option value="om">Orange Money</option>
              <option value="momo">MTN MoMo</option>
              <option value="especes">Espèces</option>
            </select>
          </div>
          <Button
            className="mt-3 gap-2"
            disabled={!grp.contratId || facturerPeriode.isPending}
            onClick={() => facturerPeriode.mutate({ contratId: grp.contratId, dateDebut: grp.dateDebut, dateFin: grp.dateFin, modePaiement: grp.modePaiement as any })}
          >
            {facturerPeriode.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 size={15} />}
            Générer la facture groupée
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Contrat</th>
              <th className="px-4 py-2.5">Client</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Période</th>
              <th className="px-4 py-2.5 text-right">Forfait</th>
              <th className="px-4 py-2.5 text-center">Statut</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Chargement…</td></tr>
            ) : contrats.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                <FileSignature size={32} className="mx-auto mb-2 opacity-40" />
                Aucun contrat. Créez votre premier contrat de maintenance.
              </td></tr>
            ) : (
              contrats.map((ct) => (
                <tr key={ct.id} className="text-sm text-foreground hover:bg-accent/30">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{ct.libelle}</p>
                    <span className="font-mono text-[10px] text-muted-foreground">{ct.numeroContrat}</span>
                  </td>
                  <td className="px-4 py-2.5">{ct.clientRaisonSociale ?? `${ct.clientPrenom ?? ""} ${ct.clientNom}`}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                      {TYPE_CONTRAT[ct.typeContrat] ?? ct.typeContrat}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{ct.dateDebut} → {ct.dateFin ?? "tacite"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{Number(ct.montantForfait ?? 0) > 0 ? `${Number(ct.montantForfait).toLocaleString("fr-FR")} F` : "—"}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUT_STYLE[ct.statutEffectif ?? ct.statut] ?? STATUT_STYLE.BROUILLON}`}>
                      {ct.statutEffectif ?? ct.statut}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      {canModifier && (ct.statut === "BROUILLON") && (
                        <button onClick={() => activer.mutate({ id: ct.id })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-success-foreground hover:bg-success/10" title="Activer">
                          <CheckCircle2 size={12} /> Activer
                        </button>
                      )}
                      {canModifier && ct.statut === "ACTIF" && (
                        <button onClick={() => suspendre.mutate({ id: ct.id })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-warning-foreground hover:bg-warning/10" title="Suspendre">
                          <Pause size={12} /> Suspendre
                        </button>
                      )}
                      {canModifier && (ct.statut === "ACTIF" || ct.statut === "SUSPENDU" || ct.statut === "RENOUVELLE") && (
                        <>
                          <button onClick={() => renouveler.mutate({ id: ct.id })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10" title="Renouveler (prolonge d'une période)">
                            <RefreshCw size={12} /> Renouveler
                          </button>
                          <button onClick={() => setConfirmResilier(ct)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10" title="Résilier (motif obligatoire)">
                            <XCircle size={12} /> Résilier
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <FileSignature size={18} className="text-primary" /> Nouveau contrat de maintenance
              </h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1.5 hover:bg-accent">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Client (entreprise / administration / flotte) *</Label>
                <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value={0}>Sélectionner…</option>
                  {eligible.map((cl: any) => <option key={cl.id} value={cl.id}>{cl.raisonSociale ?? `${cl.prenom ?? ""} ${cl.nom}`}</option>)}
                </select>
                {eligible.length === 0 && <p className="mt-1 text-[11px] text-warning-foreground">Créez d'abord un client Entreprise/Administration/Flotte actif.</p>}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Libellé *</Label>
                <Input className="mt-1" value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} placeholder="Maintenance préventive parc — 2026" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Type de contrat</Label>
                  <select value={form.typeContrat} onChange={(e) => setForm({ ...form, typeContrat: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    {Object.entries(TYPE_CONTRAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Fréquence de facturation</Label>
                  <select value={form.frequenceFacturation} onChange={(e) => setForm({ ...form, frequenceFacturation: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="MENSUELLE">Mensuelle</option>
                    <option value="TRIMESTRIELLE">Trimestrielle</option>
                    <option value="ANNUELLE">Annuelle</option>
                    <option value="A_LA_DEMANDE">À la demande</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Début *</Label>
                  <Input type="date" className="mt-1" value={form.dateDebut} onChange={(e) => setForm({ ...form, dateDebut: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Fin (vide = tacite reconduction)</Label>
                  <Input type="date" className="mt-1" value={form.dateFin} onChange={(e) => setForm({ ...form, dateFin: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Montant forfait (FCFA)</Label>
                  <Input type="number" min={0} className="mt-1" value={form.montantForfait} onChange={(e) => setForm({ ...form, montantForfait: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Délai d'intervention (h, SLA)</Label>
                  <Input type="number" min={1} className="mt-1" value={form.delaiInterventionHeures} onChange={(e) => setForm({ ...form, delaiInterventionHeures: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Délai de paiement (jours)</Label>
                  <select value={form.delaiPaiementJours} onChange={(e) => setForm({ ...form, delaiPaiementJours: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    {[0, 7, 15, 30, 45, 60].map((d) => <option key={d} value={d}>{d === 0 ? "Comptant" : `${d} jours`}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Couverture</Label>
                  <select value={form.couverture} onChange={(e) => setForm({ ...form, couverture: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="PIECES_ET_MO">Pièces + main-d'œuvre</option>
                    <option value="MO_SEULE">Main-d'œuvre seule</option>
                    <option value="PREVENTIF_UNIQUEMENT">Préventif uniquement</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" checked={form.statutInitial === "ACTIF"} onChange={(e) => setForm({ ...form, statutInitial: e.target.checked ? "ACTIF" : "BROUILLON" })} className="size-4 accent-primary" />
                <span className="text-sm text-foreground">Activer immédiatement (sinon brouillon)</span>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button onClick={submit} disabled={create.isPending} className="gap-2">
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 size={15} />}
                Créer le contrat
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmResilier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setConfirmResilier(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <XCircle size={16} className="text-destructive" /> Résilier le contrat
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              « {confirmResilier.libelle} » ({confirmResilier.numeroContrat}) sera résilié. Les véhicules couverts seront désactivés.
            </p>
            <Label className="mt-4 block text-xs text-muted-foreground">Motif (obligatoire)</Label>
            <Input className="mt-1" value={resilierMotif} onChange={(e) => setResilierMotif(e.target.value)} placeholder="Fin de partenariat, impayés…" />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmResilier(null)}>Annuler</Button>
              <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={resilierMotif.trim().length < 3} onClick={() => resilier.mutate({ id: confirmResilier.id, motif: resilierMotif.trim() })}>
                Résilier
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}