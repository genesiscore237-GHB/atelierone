"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  AlertTriangle, Building2, CheckCircle2, CreditCard, Download, Globe, KeyRound, RefreshCw, ShieldCheck, Wallet, Clock, UploadCloud, TrendingUp, WifiOff, Search, PhoneCall,
} from "lucide-react";
import { Button } from "~/components/ui/button";

const fmtFCFA = (n: number | string | null | undefined) => new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));
const fmtDate = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtDateHeure = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");

export function SaasDashboard() {
  const utils = api.useUtils();
  const [siteId, setSiteId] = useState(0);
  const [mois, setMois] = useState(1);
  const [montant, setMontant] = useState(15000);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [recherche, setRecherche] = useState("");
  const [tenantId, setTenantId] = useState<number | null>(null);

  const { data, isLoading, isError } = api.central.dashboard.useQuery();
  const { data: paiements } = api.central.paiements.useQuery({});
  const { data: ingests } = api.central.ingests.useQuery({ limit: 20 });
  const { data: ficheTenant } = api.central.ficheTenant.useQuery({ siteId: tenantId ?? 0 }, { enabled: tenantId !== null });

  const suspendre = api.central.suspendreSite.useMutation({
    onSuccess: () => { toast.success("Statut du site mis à jour"); utils.central.dashboard.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const etendre = api.central.etendreLicence.useMutation({
    onSuccess: () => { toast.success(`Licence étendue de ${mois} mois`); utils.central.dashboard.invalidate(); utils.central.licences.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const creerPaiement = api.central.creerPaiement.useMutation({
    onSuccess: () => { toast.success("Paiement créé (en attente)"); utils.central.paiements.invalidate(); utils.central.dashboard.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const confirmer = api.central.confirmerPaiement.useMutation({
    onSuccess: () => { toast.success("Paiement confirmé — le garage sera renouvelé à son prochain heartbeat"); utils.central.paiements.invalidate(); utils.central.dashboard.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const marquerRelance = api.central.marquerRelanceFaite.useMutation({
    onSuccess: () => { toast.success("Relance marquée faite"); utils.central.dashboard.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const exportCsv = async (type: "garages" | "paiements") => {
    setExportLoading(type);
    try {
      const res = await fetch("/api/trpc/central." + type + "?batch=1", { method: "GET" });
      const json = await res.json();
      const r: string = json[0]?.result?.data?.json ?? "";
      if (!r) throw new Error("Export vide");
      const blob = new Blob([r], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = type === "garages" ? "garages.csv" : "paiements.csv";
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Export CSV téléchargé");
    } catch (e: any) {
      toast.error(e.message ?? "Export impossible");
    }
    setExportLoading(null);
  };

  if (isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <Globe size={24} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm font-semibold text-foreground">Réservé au serveur central</p>
        <p className="mt-1 text-sm text-muted-foreground">Ce tableau de bord n'est disponible que sur l'instance centrale (APP_ROLE=central).</p>
      </div>
    );
  }

  const stats = data.stats as any;
  const sites = (data.sites ?? []) as any[];
  const snapshots = (data.snapshots ?? []) as any[];
  const paiementsList = (paiements ?? []) as any[];
  const ingestsList = (ingests ?? []) as any[];
  const alertes = (data.alertes ?? {}) as any;
  const evolution = (data.evolutionRevenu ?? []) as any[];
  const relances = (data.relances ?? []) as any[];
  const audit = (data.audit ?? []) as any[];
  const maxRevenu = Math.max(1, ...evolution.map((e) => e.montant));

  const sitesFiltres = sites.filter((s: any) => !recherche.trim() || [s.nomGarage, s.codeSite, s.ville ?? ""].some((v) => String(v).toLowerCase().includes(recherche.toLowerCase())));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">AtelierOne SaaS — Serveur central</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tous vos garages clients : licences, paiements, synchronisation. C'est ici que vous facturez.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" disabled={exportLoading === "garages"} onClick={() => exportCsv("garages")}>
            {exportLoading === "garages" ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />} Garages CSV
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" disabled={exportLoading === "paiements"} onClick={() => exportCsv("paiements")}>
            {exportLoading === "paiements" ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />} Paiements CSV
          </Button>
        </div>
      </div>

      {/* Alertes */}
      {(alertes.licencesExpirant7j?.length > 0 || alertes.sitesHorsLigne?.length > 0 || alertes.sitesSansLicence?.length > 0) && (
        <div className="space-y-1.5 rounded-xl border border-warning/30 bg-warning/5 p-3">
          {alertes.licencesExpirant7j?.map((a: any) => (
            <p key={a.codeSite + "exp" + a.dateFin} className="flex items-center gap-2 text-xs font-semibold text-warning-foreground">
              <AlertTriangle size={13} /> {a.nomGarage} ({a.codeSite}) — licence expire dans {a.joursRestants} j ({new Date(a.dateFin).toLocaleDateString("fr-FR")}) → relancez le client
            </p>
          ))}
          {alertes.sitesHorsLigne?.map((a: any) => (
            <p key={a.codeSite + "off" + a.dernierHeartbeat} className="flex items-center gap-2 text-xs font-semibold text-warning-foreground">
              <WifiOff size={13} /> {a.nomGarage} ({a.codeSite}) — hors-ligne depuis {fmtDateHeure(a.dernierHeartbeat)} ({">"} 7 j)
            </p>
          ))}
          {alertes.sitesSansLicence?.map((a: any) => (
            <p key={a.codeSite + "nol" + a.codeSite} className="flex items-center gap-2 text-xs font-semibold text-destructive">
              <AlertTriangle size={13} /> {a.nomGarage} ({a.codeSite}) — sans licence → bloqué
            </p>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="MRR (30 j)" value={`${fmtFCFA(stats.mrr)} F`} icon={<TrendingUp size={14} />} accent="text-primary" />
        <Kpi label="ARPU (30 j)" value={`${fmtFCFA(stats.arpu)} F`} icon={<Wallet size={14} />} />
        <Kpi label="Churn (licences)" value={stats.churn} icon={<WifiOff size={14} />} accent={stats.churn > 0 ? "text-destructive" : "text-success-foreground"} />
        <Kpi label="Garages enregistrés" value={stats.nbSites} icon={<Building2 size={14} />} />
        <Kpi label="Licences actives" value={stats.licencesActives} icon={<ShieldCheck size={14} />} accent="text-success-foreground" />
        <Kpi label="Revenu total" value={`${fmtFCFA(stats.revenuTotal)} F`} icon={<CreditCard size={14} />} />
      </div>

      {/* Évolution du revenu */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <TrendingUp size={14} className="text-primary" /> Revenu mensuel (6 derniers mois)
        </h3>
        <div className="flex h-32 items-end gap-3">
          {evolution.map((e: any) => (
            <div key={e.mois} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[9px] font-bold text-foreground">{e.montant > 0 ? `${Math.round((e.montant / 1000) * 10) / 10}k` : ""}</span>
              <div
                className={`w-full rounded-t-lg ${e.montant > 0 ? "bg-primary/70" : "bg-muted"}`}
                style={{ height: `${Math.max(4, (e.montant / maxRevenu) * 100)}%` }}
              />
              <span className="text-[9px] text-muted-foreground">{e.mois.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Garages */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Building2 size={14} className="text-primary" /> Garages clients ({sitesFiltres.length}/{sites.length})
          </h3>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher (nom, code, ville)…" className="h-8 w-56 rounded-lg border border-border bg-background pl-8 pr-3 text-xs outline-none focus:border-primary/50" />
          </div>
        </div>
        {sites.length === 0 && <p className="text-sm text-muted-foreground">Aucun garage enregistré. Installez un pack et enregistrez-le (licence.enregistrer).</p>}
        <div className="space-y-2">
          {sitesFiltres.map((s: any) => (
            <div key={s.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                  s.sante === "VERT" ? "bg-success/15 text-success-foreground" : s.sante === "ORANGE" ? "bg-warning/15 text-warning-foreground" : "bg-destructive/15 text-destructive"
                }`} title="Santé (licence + heartbeat + sync)">
                  <span className={`size-1.5 rounded-full ${s.sante === "VERT" ? "bg-success" : s.sante === "ORANGE" ? "bg-warning" : "bg-destructive"}`} /> {s.sante}
                </span>
                <button onClick={() => setTenantId(s.id)} className="font-semibold text-primary hover:underline" title="Voir la fiche complète">
                  {s.nomGarage}
                </button>
                <span className="font-mono text-[10px] text-muted-foreground">{s.codeSite}</span>
                {s.ville && <span className="text-xs text-muted-foreground">{s.ville}</span>}
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${s.statut === "ACTIF" ? "bg-success/10 text-success-foreground" : "bg-destructive/10 text-destructive"}`}>{s.statut}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  sync : {fmtDateHeure(s.derniereSync)} · heartbeat : {fmtDateHeure(s.dernierHeartbeat)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {s.licence ? (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${(s.licence.joursRestants ?? 0) <= 0 ? "bg-destructive/10 text-destructive" : (s.licence.joursRestants ?? 0) <= 7 ? "bg-warning/10 text-warning-foreground" : "bg-success/10 text-success-foreground"}`}>
                    Licence {s.licence.mode} : échéance {fmtDate(s.licence.dateFin)} · {s.licence.joursRestants} j restants
                  </span>
                ) : (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">Sans licence</span>
                )}
                <span className="text-muted-foreground">{s.nbPaiements} paiement(s) · {fmtFCFA(s.payeTotal)} F encaissés</span>
                {s.versionLogiciel && <span className="font-mono text-[10px] text-muted-foreground">v{s.versionLogiciel}</span>}
                <div className="ml-auto flex items-center gap-1.5">
                  <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setTenantId(s.id)}>
                    <Building2 size={11} /> Fiche
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" onClick={() => { setSiteId(s.id); }}>
                    <KeyRound size={11} /> Étendre
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-destructive" onClick={() => suspendre.mutate({ id: s.id, suspendu: s.statut === "ACTIF" })}>
                    {s.statut === "ACTIF" ? "Suspendre" : "Réactiver"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Relances */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <PhoneCall size={14} className="text-primary" /> Relances à faire ({relances.filter((r: any) => r.statut === "A_FAIRE").length})
        </h3>
        {relances.length === 0 && <p className="text-sm text-muted-foreground">Aucune relance générée — tout est sous contrôle.</p>}
        <div className="space-y-1.5">
          {relances.slice(0, 12).map((r: any) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${r.statut === "A_FAIRE" ? "bg-warning/15 text-warning-foreground" : "bg-success/15 text-success-foreground"}`}>{r.statut}</span>
              <span className="font-medium">{r.message}</span>
              <span className="ml-auto text-muted-foreground">{fmtDateHeure(r.creeLe)}</span>
              {r.statut === "A_FAIRE" && (
                <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px] text-success-foreground" disabled={marquerRelance.isPending} onClick={() => marquerRelance.mutate({ id: r.id })}>
                  <CheckCircle2 size={11} /> Marquée faite
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Journal éditeur */}
      {audit.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <ShieldCheck size={14} className="text-primary" /> Journal éditeur (30 dernières actions)
          </h3>
          <div className="space-y-1">
            {audit.map((a: any) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg bg-muted/20 px-3 py-1.5 text-xs">
                <Clock size={11} className="text-muted-foreground" />
                <span className="font-mono text-[10px] text-muted-foreground">{a.siteCode ?? "—"}</span>
                <span className="font-bold uppercase text-[10px]">{a.action}</span>
                <span className="text-muted-foreground">{a.acteurEmail ?? "—"}</span>
                <span className="ml-auto text-muted-foreground">{fmtDateHeure(a.creeLe)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Paiements (simulation CinetPay) */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <CreditCard size={14} className="text-primary" /> Paiements (simulation CinetPay / Orange Money / MTN MoMo)
        </h3>
        {sites.length > 0 && (
          <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Garage</p>
              <select value={siteId} onChange={(e) => setSiteId(Number(e.target.value))} className="mt-1 h-9 rounded-lg border border-border bg-background px-3 text-sm">
                <option value={0}>Choisir…</option>
                {sites.map((s: any) => <option key={s.id} value={s.id}>{s.nomGarage} ({s.codeSite})</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mois</p>
              <select value={mois} onChange={(e) => setMois(Number(e.target.value))} className="mt-1 h-9 rounded-lg border border-border bg-background px-3 text-sm">
                {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} mois</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Montant (F)</p>
              <input type="number" value={montant} onChange={(e) => setMontant(Number(e.target.value))} className="mt-1 h-9 w-32 rounded-lg border border-border bg-background px-3 text-sm" />
            </div>
            <Button size="sm" disabled={!siteId} onClick={() => creerPaiement.mutate({ siteId, montant, periodeMois: mois, modePaiement: "cinetpay", fournisseur: "orange_money" })}>
              Créer le paiement
            </Button>
          </div>
        )}
        <div className="space-y-1.5">
          {paiementsList.length === 0 && <p className="text-sm text-muted-foreground">Aucun paiement.</p>}
          {paiementsList.slice(0, 15).map((p: any) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
              <span className="font-mono font-bold">{p.reference}</span>
              <span className="font-semibold">{fmtFCFA(p.montant)} F</span>
              <span className="text-muted-foreground">{p.siteNom} · {p.periodeMois} mois · {p.fournisseur ?? p.modePaiement}</span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${p.statut === "CONFIRME" ? "bg-success/10 text-success-foreground" : p.statut === "EN_ATTENTE" ? "bg-warning/10 text-warning-foreground" : "bg-destructive/10 text-destructive"}`}>{p.statut}</span>
              <span className="ml-auto text-muted-foreground">{fmtDate(p.createdAt)}</span>
              {p.statut === "EN_ATTENTE" && (
                <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px] text-success-foreground" onClick={() => confirmer.mutate({ id: p.id })}>
                  <CheckCircle2 size={11} /> Confirmer (paiement reçu)
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Ingests reçus */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <UploadCloud size={14} className="text-primary" /> Synchronisations reçues (20 dernières)
        </h3>
        {ingestsList.length === 0 && <p className="text-sm text-muted-foreground">Aucune donnée synchronisée — les garages poussent toutes les 5 min.</p>}
        <div className="space-y-1">
          {ingestsList.map((i: any) => (
            <div key={i.id} className="flex items-center gap-2 rounded-lg bg-muted/20 px-3 py-1.5 text-xs">
              <Clock size={11} className="text-muted-foreground" />
              <span className="font-mono text-[10px] text-muted-foreground">{i.siteCode}</span>
              <span className="font-medium">{i.entite}</span>
              <span className="text-muted-foreground">{i.nbLignes} ligne(s)</span>
              <span className="ml-auto text-muted-foreground">{fmtDate(i.reçuLe)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Panneau extension licence */}
      {siteId > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setSiteId(0)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <KeyRound size={16} className="text-primary" /> Étendre la licence (mois × {mois})
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">Émission manuelle (support) — ou utilisez le flux paiement ci-dessus.</p>
            <div className="mt-4 flex items-center gap-2">
              <select value={mois} onChange={(e) => setMois(Number(e.target.value))} className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm">
                {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} mois</option>)}
              </select>
              <select value={montant} onChange={(e) => setMontant(Number(e.target.value))} className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm">
                <option value={15000}>Essai (gratuit)</option>
                <option value={15000}>15 000 F/mois</option>
                <option value={25000}>25 000 F/mois</option>
                <option value={50000}>50 000 F/mois</option>
              </select>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSiteId(0)}>Annuler</Button>
              <Button onClick={() => { etendre.mutate({ siteId, mois, mode: montant === 15000 ? "ESSAI" : "ABONNEMENT" }); setSiteId(0); }}>
                <KeyRound size={14} /> Étendre
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Fiche tenant (drill-down) */}
      {tenantId !== null && (
        <FicheTenantModal siteId={tenantId} onClose={() => setTenantId(null)} />
      )}
    </div>
  );
}

// ─── Fiche tenant : tout sur un garage ───
function FicheTenantModal({ siteId, onClose }: { siteId: number; onClose: () => void }) {
  const { data, isLoading } = api.central.ficheTenant.useQuery({ siteId });
  if (isLoading || !data) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"><div className="h-72 w-full max-w-3xl animate-pulse rounded-2xl bg-muted" /></div>;
  const s = data.site as any;
  const lc = data.licenceCourante as any;
  const licences = (data.licences ?? []) as any[];
  const paiements = (data.paiements ?? []) as any[];
  const ingests = (data.ingests ?? []) as any[];
  const snapshots = (data.snapshots ?? []) as any[];
  const audit = (data.audit ?? []) as any[];
  const relances = (data.relances ?? []) as any[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Building2 size={16} className="text-primary" /> {s.nomGarage}
            </h3>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{s.codeSite} · {s.ville ?? "—"} · {s.statut} · v{s.versionLogiciel ?? "?"} · inscrit {fmtDate(s.inscritLe)}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>Fermer</Button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
          <Field label="Licence courante" value={lc ? `${lc.mode} · ${lc.statut}` : "Aucune"} />
          <Field label="Échéance" value={lc ? fmtDate(lc.dateFin) : "—"} />
          <Field label="Jours restants" value={lc ? String(lc.joursRestants) : "—"} />
          <Field label="Dernier heartbeat" value={fmtDateHeure(s.dernierHeartbeat)} />
          <Field label="Dernière sync" value={fmtDateHeure(s.derniereSync)} />
          <Field label="Email" value={s.email} />
          <Field label="Téléphone" value={s.telephone} />
          <Field label="Paiements" value={`${paiements.filter((p) => p.statut === "CONFIRME").length} · ${fmtFCFA(paiements.filter((p) => p.statut === "CONFIRME").reduce((a: number, p: any) => a + p.montant, 0))} F`} />
        </div>

        <h4 className="mt-5 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Périodes de licence ({licences.length})</h4>
        <div className="space-y-1">
          {licences.map((l: any) => (
            <div key={l.id} className="flex items-center gap-2 rounded-lg bg-muted/20 px-3 py-1.5 text-xs">
              <span className="font-semibold">{l.mode}</span>
              <span className="text-muted-foreground">{fmtDate(l.dateDebut)} → {fmtDate(l.dateFin)}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${l.statut === "ACTIVE" ? "bg-success/15 text-success-foreground" : "bg-muted text-muted-foreground"}`}>{l.statut}</span>
            </div>
          ))}
        </div>

        <h4 className="mt-5 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Activité synchronisée</h4>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {snapshots.length === 0 && <p className="col-span-full text-xs text-muted-foreground">Aucune donnée synchronisée.</p>}
          {snapshots.slice(0, 8).map((sn: any) => (
            <div key={sn.id} className="rounded-lg bg-muted/20 px-3 py-2 text-xs">
              <p className="text-[9px] font-bold uppercase text-muted-foreground">{sn.type} · {sn.periode}</p>
              <p className="font-black">{fmtFCFA(sn.montant)} F <span className="font-normal text-muted-foreground">· {sn.nb}</span></p>
            </div>
          ))}
        </div>

        <h4 className="mt-5 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Synchronisations (50 dernières)</h4>
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {ingests.length === 0 && <p className="text-xs text-muted-foreground">Aucune.</p>}
          {ingests.map((i: any) => (
            <div key={i.id} className="flex items-center gap-2 rounded-lg bg-muted/20 px-3 py-1 text-[11px]">
              <Clock size={10} className="text-muted-foreground" />
              <span className="font-medium">{i.entite}</span>
              <span className="text-muted-foreground">{i.nbLignes} ligne(s)</span>
              <span className="ml-auto text-muted-foreground">{fmtDateHeure(i.reçuLe)}</span>
            </div>
          ))}
        </div>

        <h4 className="mt-5 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Relances & journal</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            {relances.map((r: any) => (
              <div key={r.id} className="rounded-lg bg-muted/20 px-3 py-1.5 text-[11px]">
                <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase ${r.statut === "A_FAIRE" ? "bg-warning/15 text-warning-foreground" : "bg-success/15 text-success-foreground"}`}>{r.statut}</span> {r.message}
              </div>
            ))}
          </div>
          <div className="space-y-1">
            {audit.map((a: any) => (
              <div key={a.id} className="rounded-lg bg-muted/20 px-3 py-1.5 text-[11px]">
                <span className="font-bold uppercase text-[9px]">{a.action}</span> · {a.acteurEmail ?? "—"} · {fmtDateHeure(a.creeLe)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value ?? "—"}</p>
    </div>
  );
}

function Kpi({ label, value, icon, accent }: { label: string; value: string | number; icon: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground ${accent ?? ""}`}>
        {icon} {label}
      </div>
      <p className="mt-1 text-lg font-black text-foreground">{value}</p>
    </div>
  );
}