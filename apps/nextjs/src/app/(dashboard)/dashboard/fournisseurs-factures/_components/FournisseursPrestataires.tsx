"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  Building2, FileText, Search, Plus, Phone, Mail, MapPin, Upload, Eye, Trash2,
  CheckCircle2, Clock, Loader2, HandCoins, FileSignature, Wallet, Briefcase, CircleDollarSign,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  TYPES_SERVICE, TYPES_SERVICE_LABELS, CATEGORIES_DEPENSE, CATEGORIES_LABELS,
} from "~/server/lib/fournisseurs-types";

const fmtFCFA = (n: number | string | null | undefined) => new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));
const fmtDate = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

const STATUT_BADGE: Record<string, string> = {
  paye: "bg-success/15 text-success-foreground",
  partielle: "bg-sky-500/15 text-sky-400",
  impayee: "bg-destructive/15 text-destructive",
};
const STATUT_LABEL: Record<string, string> = { paye: "Payée", partielle: "Partielle", impayee: "Impayée" };

const CIRCUIT_BADGE: Record<string, string> = {
  PIECES: "bg-primary/15 text-primary",
  CHARGES: "bg-violet-500/15 text-violet-400",
};
const CIRCUIT_LABEL: Record<string, string> = { PIECES: "Pièces / OR", CHARGES: "Charge / service" };

export function FournisseursPrestataires() {
  const params = useSearchParams();
  const initial = params.get("tab") === "factures" ? "factures" : "fournisseurs";
  const [tab, setTab] = useState(initial);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Fournisseurs & Factures</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tous les prestataires du garage (pièces et services) — chaque facture payée est enregistrée avec son scan et retrouvable.
        </p>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl bg-muted/60 p-1 [scrollbar-width:thin]">
        <button onClick={() => setTab("fournisseurs")} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${tab === "fournisseurs" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-accent"}`}>
          <Building2 size={14} /> Référentiel fournisseurs
        </button>
        <button onClick={() => setTab("factures")} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${tab === "factures" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-accent"}`}>
          <FileText size={14} /> Archive des factures
        </button>
      </div>

      {tab === "fournisseurs" ? <Referentiel /> : <Archive />}
    </div>
  );
}

// ═══════════ RÉFÉRENTIEL FOURNISSEURS ═══════════
function Referentiel() {
  const utils = api.useUtils();
  const [q, setQ] = useState("");
  const [typeService, setTypeService] = useState("");
  const [circuit, setCircuit] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form, setForm] = useState({
    nom: "", typeService: "PIECES_AUTO", circuit: "PIECES", contact: "", telephone: "",
    email: "", adresse: "", ville: "", conditionsPaiement: "", niuNif: "", rccm: "", notes: "",
  });

  const { data, isLoading } = api.fournisseurs.list.useQuery({ q: q || undefined, typeService: typeService || undefined, circuit: circuit || undefined, limit: 200 });
  const create = api.fournisseurs.create.useMutation({
    onSuccess: () => { toast.success("Fournisseur créé"); utils.fournisseurs.list.invalidate(); utils.fournisseurs.stats.invalidate(); setShowModal(false); setForm({ nom: "", typeService: "PIECES_AUTO", circuit: "PIECES", contact: "", telephone: "", email: "", adresse: "", ville: "", conditionsPaiement: "", niuNif: "", rccm: "", notes: "" }); },
    onError: (e) => toast.error(e.message),
  });

  const fournisseurs = (data?.fournisseurs ?? []) as any[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, contact, téléphone, ville, NIU…" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary/50" />
        </div>
        <select value={typeService} onChange={(e) => setTypeService(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="">Tous les types</option>
          {TYPES_SERVICE.map((t) => <option key={t} value={t}>{TYPES_SERVICE_LABELS[t]}</option>)}
        </select>
        <select value={circuit} onChange={(e) => setCircuit(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="">Tous les circuits</option>
          <option value="PIECES">Pièces / OR</option>
          <option value="CHARGES">Charges / services</option>
        </select>
        <Button size="sm" className="gap-1.5" onClick={() => setShowModal(true)}>
          <Plus size={14} /> Nouveau fournisseur
        </Button>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : fournisseurs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Building2 size={24} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">Aucun fournisseur. Créez le premier prestataire du garage.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fournisseurs.map((f: any) => (
            <div key={f.id} className="rounded-xl border border-border bg-card p-4 hover:border-primary/30">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Building2 size={14} className="shrink-0 text-primary" /> {f.nom}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{f.code}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${CIRCUIT_BADGE[f.circuit] ?? "bg-muted text-muted-foreground"}`}>{CIRCUIT_LABEL[f.circuit] ?? f.circuit}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">{TYPES_SERVICE_LABELS[f.typeService] ?? f.typeService}</span>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {f.telephone && <p className="flex items-center gap-1.5"><Phone size={11} /> {f.telephone}</p>}
                {f.email && <p className="flex items-center gap-1.5"><Mail size={11} /> {f.email}</p>}
                {f.ville && <p className="flex items-center gap-1.5"><MapPin size={11} /> {f.ville}</p>}
                {f.conditionsPaiement && <p className="flex items-center gap-1.5"><HandCoins size={11} /> {f.conditionsPaiement}</p>}
                {f.niuNif && <p className="font-mono text-[10px]">NIU : {f.niuNif}</p>}
              </div>
              <Button size="sm" variant="outline" className="mt-3 w-full gap-1 text-xs" onClick={() => setDetailId(f.id)}>
                Voir la fiche & factures
              </Button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowModal(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Building2 size={16} className="text-primary" /> Nouveau fournisseur / prestataire
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <Label>Nom *</Label>
                <input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50" placeholder="ex. Eneo Cameroun, Pièces Auto DLA…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type de service</Label>
                  <select value={form.typeService} onChange={(e) => setForm({ ...form, typeService: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                    {TYPES_SERVICE.map((t) => <option key={t} value={t}>{TYPES_SERVICE_LABELS[t]}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Circuit</Label>
                  <select value={form.circuit} onChange={(e) => setForm({ ...form, circuit: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                    <option value="PIECES">Pièces / lié OR-véhicule</option>
                    <option value="CHARGES">Charge / service général</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Contact</Label><input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" /></div>
                <div><Label>Téléphone</Label><input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Email</Label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" /></div>
                <div><Label>Ville</Label><input value={form.ville} onChange={(e) => setForm({ ...form, ville: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" /></div>
              </div>
              <div><Label>Adresse</Label><input value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2"><Label>Conditions de paiement</Label><input value={form.conditionsPaiement} onChange={(e) => setForm({ ...form, conditionsPaiement: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" placeholder="ex. 30 jours, 50% à la commande" /></div>
                <div><Label>NIU / NIF</Label><input value={form.niuNif} onChange={(e) => setForm({ ...form, niuNif: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" /></div>
              </div>
              <div><Label>Notes</Label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 h-16 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>Annuler</Button>
              <Button disabled={!form.nom.trim() || create.isPending} onClick={() => create.mutate(form as any)}>
                {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Créer
              </Button>
            </div>
          </div>
        </div>
      )}

      {detailId !== null && <FicheFournisseur id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

// ═══════════ FICHE FOURNISSEUR ═══════════
function FicheFournisseur({ id, onClose }: { id: number; onClose: () => void }) {
  const utils = api.useUtils();
  const { data, isLoading } = api.fournisseurs.get.useQuery({ id });
  const payer = api.fournisseurs.payerFacture.useMutation({
    onSuccess: () => { toast.success("Paiement enregistré"); utils.fournisseurs.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !data) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"><div className="h-64 w-full max-w-3xl animate-pulse rounded-2xl bg-muted" /></div>;
  const f = data.fournisseur as any;
  const factures = (data.factures ?? []) as any[];
  const stats = data.stats as any;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Building2 size={16} className="text-primary" /> {f.nom}
            </h3>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{f.code} · {TYPES_SERVICE_LABELS[f.typeService] ?? f.typeService} · {CIRCUIT_LABEL[f.circuit] ?? f.circuit}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>Fermer</Button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
          {f.contact && <Field label="Contact" value={f.contact} />}
          {f.telephone && <Field label="Téléphone" value={f.telephone} />}
          {f.email && <Field label="Email" value={f.email} />}
          {f.ville && <Field label="Ville" value={f.ville} />}
          {f.conditionsPaiement && <Field label="Conditions" value={f.conditionsPaiement} />}
          {f.niuNif && <Field label="NIU/NIF" value={f.niuNif} />}
          {f.rccm && <Field label="RCCM" value={f.rccm} />}
          {f.notes && <Field label="Notes" value={f.notes} />}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Factures" value={String(stats?.nbFactures ?? 0)} />
          <Stat label="Total TTC" value={`${fmtFCFA(stats?.totalTTC)} F`} />
          <Stat label="Payé" value={`${fmtFCFA(stats?.totalPaye)} F`} accent="text-success-foreground" />
          <Stat label="Restant" value={`${fmtFCFA(stats?.totalRestant)} F`} accent={(stats?.totalRestant ?? 0) > 0 ? "text-destructive" : "text-success-foreground"} />
        </div>
        {stats?.nbCommandes > 0 && <p className="mt-2 text-xs text-muted-foreground">{stats.nbCommandes} commande(s) pièces liée(s) au stock / OR.</p>}

        <h4 className="mt-5 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Factures ({factures.length})</h4>
        {factures.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune facture enregistrée.</p>
        ) : (
          <div className="space-y-1.5">
            {factures.map((fx: any) => (
              <div key={fx.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                <span className="font-mono font-bold">{fx.reference}</span>
                <span className="text-muted-foreground">{fmtDate(fx.dateFacture)}</span>
                {fx.libelle && <span className="max-w-40 truncate">{fx.libelle}</span>}
                {fx.numeroFactureFournisseur && <span className="font-mono text-[10px] text-muted-foreground">n° {fx.numeroFactureFournisseur}</span>}
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${STATUT_BADGE[fx.statut] ?? ""}`}>{STATUT_LABEL[fx.statut] ?? fx.statut}</span>
                <span className="ml-auto font-semibold">{fmtFCFA(fx.montantTTC)} F</span>
                {(fx.statut === "impayee" || fx.statut === "partielle") && (
                  <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" disabled={payer.isPending} onClick={() => payer.mutate({ id: fx.id, montant: Number(fx.montantRestant) })}>
                    <HandCoins size={11} /> Payer {fmtFCFA(fx.montantRestant)} F
                  </Button>
                )}
                {fx.fichierUrl && (
                  <a href={fx.fichierUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                    <Eye size={11} /> Scan
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════ ARCHIVE FACTURES ═══════════
function Archive() {
  const utils = api.useUtils();
  const [q, setQ] = useState("");
  const [fournisseurId, setFournisseurId] = useState(0);
  const [circuit, setCircuit] = useState("");
  const [categorie, setCategorie] = useState("");
  const [statut, setStatut] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [montantMin, setMontantMin] = useState("");
  const [montantMax, setMontantMax] = useState("");
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading } = api.fournisseurs.listFactures.useQuery({
    q: q || undefined,
    fournisseurId: fournisseurId || undefined,
circuit: (circuit || undefined) as "PIECES" | "CHARGES" | undefined,
    categorieDepense: categorie || undefined,
    statut: statut || undefined,
    dateDebut: dateDebut || undefined,
    dateFin: dateFin || undefined,
    montantMin: montantMin ? Number(montantMin) : undefined,
    montantMax: montantMax ? Number(montantMax) : undefined,
    limit: 100,
  });
  const { data: fournisseursData } = api.fournisseurs.list.useQuery({ limit: 300 });
  const { data: statsData } = api.fournisseurs.stats.useQuery({});
  const payer = api.fournisseurs.payerFacture.useMutation({
    onSuccess: () => { toast.success("Paiement enregistré"); utils.fournisseurs.listFactures.invalidate(); utils.fournisseurs.stats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const attacher = api.fournisseurs.attacherScan.useMutation({
    onSuccess: () => { toast.success("Scan rattaché"); utils.fournisseurs.listFactures.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const supprimer = api.fournisseurs.supprimerFacture.useMutation({
    onSuccess: () => { toast.success("Facture supprimée"); utils.fournisseurs.listFactures.invalidate(); utils.fournisseurs.stats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const factures = (data?.factures ?? []) as any[];
  const fournisseurs = (fournisseursData?.fournisseurs ?? []) as any[];
  const stats = statsData as any;

  const handleScan = async (fxId: number, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploadingId(fxId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "factures-fournisseur");
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const d = await res.json();
      await attacher.mutateAsync({ id: fxId, fichierUrl: d.url });
      toast.success("Scan enregistré");
    } catch (e: any) {
      toast.error(e.message ?? "Erreur upload");
    }
    setUploadingId(null);
  };

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Factures archivées" value={String(stats.nbFactures ?? 0)} />
          <Stat label="Total TTC" value={`${fmtFCFA(stats.totalTTC)} F`} />
          <Stat label="Payé" value={`${fmtFCFA(stats.totalPaye)} F`} accent="text-success-foreground" />
          <Stat label="Restant" value={`${fmtFCFA(stats.totalRestant)} F`} accent={(stats.totalRestant ?? 0) > 0 ? "text-destructive" : "text-success-foreground"} />
          <Stat label="Circuit pièces" value={`${stats?.pieces?.nb ?? 0} · ${fmtFCFA(stats?.pieces?.total)} F`} accent="text-primary" />
          <Stat label="Charges / services" value={`${stats?.charges?.nb ?? 0} · ${fmtFCFA(stats?.charges?.total)} F`} accent="text-violet-400" />
        </div>
      )}

      {/* Recherche intelligente */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Libellé, n° facture fournisseur, fournisseur…" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary/50" />
          </div>
          <select value={fournisseurId} onChange={(e) => setFournisseurId(Number(e.target.value))} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
            <option value={0}>Tous les fournisseurs</option>
            {fournisseurs.map((f: any) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
          <select value={circuit} onChange={(e) => setCircuit(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="">Circuit</option>
            <option value="PIECES">Pièces / OR</option>
            <option value="CHARGES">Charges / services</option>
          </select>
          <select value={categorie} onChange={(e) => setCategorie(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="">Catégorie</option>
            {CATEGORIES_DEPENSE.map((c) => <option key={c} value={c}>{CATEGORIES_LABELS[c]}</option>)}
          </select>
          <select value={statut} onChange={(e) => setStatut(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="">Statut</option>
            <option value="paye">Payée</option>
            <option value="partielle">Partielle</option>
            <option value="impayee">Impayée</option>
          </select>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" />
            <span className="text-xs text-muted-foreground">→</span>
            <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" />
          </div>
          <input type="number" value={montantMin} onChange={(e) => setMontantMin(e.target.value)} placeholder="Montant min (F)" className="h-8 w-32 rounded-lg border border-border bg-background px-2 text-xs" />
          <input type="number" value={montantMax} onChange={(e) => setMontantMax(e.target.value)} placeholder="Montant max (F)" className="h-8 w-32 rounded-lg border border-border bg-background px-2 text-xs" />
          <span className="ml-auto text-xs text-muted-foreground">{data?.total ?? 0} facture(s)</span>
          <Button size="sm" className="gap-1.5" onClick={() => setShowModal(true)}>
            <Plus size={14} /> Enregistrer une facture
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : factures.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <FileText size={24} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">Aucune facture trouvée pour ces critères.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full">
            <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Réf.</th>
                <th className="px-3 py-2.5">Fournisseur</th>
                <th className="px-3 py-2.5">Libellé</th>
                <th className="px-3 py-2.5">Circuit</th>
                <th className="px-3 py-2.5">Catégorie</th>
                <th className="px-3 py-2.5 text-right">Date</th>
                <th className="px-3 py-2.5 text-right">Montant</th>
                <th className="px-3 py-2.5 text-right">Payé</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="px-3 py-2.5">Scan</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {factures.map((fx: any) => (
                <tr key={fx.id} className="text-sm hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono text-xs font-bold">{fx.reference}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{fx.fournisseurNom}</p>
                    <p className="text-[10px] text-muted-foreground">{fx.numeroFactureFournisseur ? `n° ${fx.numeroFactureFournisseur}` : ""}</p>
                  </td>
                  <td className="max-w-44 truncate px-3 py-2 text-xs">{fx.libelle ?? "—"}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${CIRCUIT_BADGE[fx.circuit] ?? ""}`}>{CIRCUIT_LABEL[fx.circuit] ?? fx.circuit}</span></td>
                  <td className="px-3 py-2 text-xs">{fx.categorieDepense ? (CATEGORIES_LABELS[fx.categorieDepense] ?? fx.categorieDepense) : "—"}</td>
                  <td className="px-3 py-2 text-right text-xs">{fmtDate(fx.dateFacture)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmtFCFA(fx.montantTTC)} F</td>
                  <td className="px-3 py-2 text-right text-xs text-success-foreground">{fmtFCFA(fx.montantPaye)} F</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${STATUT_BADGE[fx.statut] ?? ""}`}>{STATUT_LABEL[fx.statut] ?? fx.statut}</span></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => handleScan(fx.id, e.target.files)} />
                      <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[10px]" disabled={uploadingId === fx.id} onClick={() => fileInput.current?.click()}>
                        {uploadingId === fx.id ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} {fx.fichierUrl ? "Remplacer" : "Scanner"}
                      </Button>
                      {fx.fichierUrl && (
                        <a href={fx.fichierUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-primary hover:underline" title="Voir le scan">
                          <Eye size={13} />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {(fx.statut === "impayee" || fx.statut === "partielle") && (
                        <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" disabled={payer.isPending} onClick={() => payer.mutate({ id: fx.id, montant: Number(fx.montantRestant) })}>
                          <HandCoins size={11} /> Payer
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive" onClick={() => setConfirmDel(fx.id)} title="Supprimer">
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <NouvelleFacture onClose={() => setShowModal(false)} fournisseurs={fournisseurs} />
      )}

      {confirmDel !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-foreground">Supprimer cette facture ?</h3>
            <p className="mt-2 text-sm text-muted-foreground">La facture sera retirée de l'archive (aucun lien commande requis).</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDel(null)}>Annuler</Button>
              <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { supprimer.mutate({ id: confirmDel }); setConfirmDel(null); }}>
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════ NOUVELLE FACTURE ═══════════
function NouvelleFacture({ onClose, fournisseurs }: { onClose: () => void; fournisseurs: any[] }) {
  const utils = api.useUtils();
  const [form, setForm] = useState({
    fournisseurId: 0, dateFacture: new Date().toISOString().slice(0, 10), numeroFactureFournisseur: "",
    libelle: "", circuit: "CHARGES", categorieDepense: "ELECTRICITE", modePaiement: "especes",
    montantTTC: "", montantHT: "", montantTVA: "", montantPaye: "", fichierUrl: "", notes: "",
  });
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const create = api.fournisseurs.createFacture.useMutation({
    onSuccess: () => { toast.success("Facture enregistrée dans l'archive"); utils.fournisseurs.listFactures.invalidate(); utils.fournisseurs.stats.invalidate(); utils.fournisseurs.get.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleScan = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "factures-fournisseur");
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const d = await res.json();
      setForm((prev) => ({ ...prev, fichierUrl: d.url }));
      toast.success("Scan téléversé");
    } catch (e: any) {
      toast.error(e.message ?? "Erreur upload");
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
          <FileSignature size={16} className="text-primary" /> Enregistrer une facture fournisseur
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">À chaque règlement, créez la facture et rattachez son scan pour l'archive.</p>
        <div className="mt-4 space-y-3">
          <div>
            <Label>Fournisseur *</Label>
            <select value={form.fournisseurId} onChange={(e) => setForm({ ...form, fournisseurId: Number(e.target.value) })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
              <option value={0}>Choisir…</option>
              {fournisseurs.map((f: any) => <option key={f.id} value={f.id}>{f.nom} ({CIRCUIT_LABEL[f.circuit] ?? f.circuit})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date facture</Label>
              <input type="date" value={form.dateFacture} onChange={(e) => setForm({ ...form, dateFacture: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </div>
            <div>
              <Label>N° facture fournisseur</Label>
              <input value={form.numeroFactureFournisseur} onChange={(e) => setForm({ ...form, numeroFactureFournisseur: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" placeholder="ex. FAC-2026-118" />
            </div>
          </div>
          <div>
            <Label>Libellé / objet</Label>
            <input value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" placeholder="ex. Facture électricité août 2026, Peinture porte AV…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Circuit</Label>
              <select value={form.circuit} onChange={(e) => setForm({ ...form, circuit: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                <option value="CHARGES">Charge / service général</option>
                <option value="PIECES">Pièces (liée commande/OR)</option>
              </select>
            </div>
            <div>
              <Label>Catégorie de dépense</Label>
              <select value={form.categorieDepense} onChange={(e) => setForm({ ...form, categorieDepense: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                {CATEGORIES_DEPENSE.map((c) => <option key={c} value={c}>{CATEGORIES_LABELS[c]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Montant TTC (F) *</Label>
              <input type="number" value={form.montantTTC} onChange={(e) => setForm({ ...form, montantTTC: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </div>
            <div>
              <Label>Mode de paiement</Label>
              <select value={form.modePaiement} onChange={(e) => setForm({ ...form, modePaiement: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                <option value="especes">Espèces</option>
                <option value="carte">Carte</option>
                <option value="momo">Mobile Money</option>
                <option value="om">Orange Money</option>
                <option value="virement">Virement</option>
                <option value="cheque">Chèque</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Montant payé (F)</Label>
              <input type="number" value={form.montantPaye} onChange={(e) => setForm({ ...form, montantPaye: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" placeholder="0" />
            </div>
            <div>
              <Label>HT (F)</Label>
              <input type="number" value={form.montantHT} onChange={(e) => setForm({ ...form, montantHT: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </div>
            <div>
              <Label>TVA (F)</Label>
              <input type="number" value={form.montantTVA} onChange={(e) => setForm({ ...form, montantTVA: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" />
            </div>
          </div>
          <div>
            <Label>Scan de la facture (PDF / image)</Label>
            <div className="mt-1 flex items-center gap-2">
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => handleScan(e.target.files)} />
              <Button size="sm" variant="outline" className="gap-1.5" disabled={uploading} onClick={() => fileInput.current?.click()}>
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {form.fichierUrl ? "Remplacer le scan" : "Téléverser le scan"}
              </Button>
              {form.fichierUrl && <a href={form.fichierUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Eye size={12} /> Voir</a>}
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 h-14 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button disabled={!form.fournisseurId || !form.montantTTC || create.isPending} onClick={() => create.mutate({ fournisseurId: form.fournisseurId, dateFacture: form.dateFacture, numeroFactureFournisseur: form.numeroFactureFournisseur || undefined, libelle: form.libelle || undefined, circuit: form.circuit as any, categorieDepense: form.categorieDepense as any, modePaiement: form.modePaiement as any, montantTTC: Number(form.montantTTC), montantHT: form.montantHT ? Number(form.montantHT) : undefined, montantTVA: form.montantTVA ? Number(form.montantTVA) : undefined, montantPaye: form.montantPaye ? Number(form.montantPaye) : 0, fichierUrl: form.fichierUrl || undefined, notes: form.notes || undefined })}>
            {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileSignature size={14} />} Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value ?? "—"}</p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-base font-black ${accent ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{children}</p>;
}