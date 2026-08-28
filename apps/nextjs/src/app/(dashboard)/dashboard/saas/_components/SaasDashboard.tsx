"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  Building2, CheckCircle2, CreditCard, Globe, KeyRound, RefreshCw, ShieldCheck, Wallet, Clock, UploadCloud,
} from "lucide-react";
import { Button } from "~/components/ui/button";

const fmtFCFA = (n: number | string | null | undefined) => new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));
const fmtDate = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

export function SaasDashboard() {
  const utils = api.useUtils();
  const [siteId, setSiteId] = useState(0);
  const [mois, setMois] = useState(1);
  const [montant, setMontant] = useState(15000);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);

  const { data, isLoading, isError } = api.central.dashboard.useQuery();
  const { data: paiements } = api.central.paiements.useQuery({});
  const { data: ingests } = api.central.ingests.useQuery({ limit: 20 });

  const suspendre = api.central.suspendreSite.useMutation({
    onSuccess: () => { toast.success("Statut du site mis à jour"); utils.central.dashboard.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const etendre = api.central.etendreLicence.useMutation({
    onSuccess: () => { toast.success(`Licence étendue de ${mois} mois`); utils.central.dashboard.invalidate(); utils.central.licences.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const creerPaiement = api.central.creerPaiement.useMutation({
    onSuccess: () => { toast.success("Paiement créé (en attente)"); utils.central.paiements.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const confirmer = api.central.confirmerPaiement.useMutation({
    onSuccess: () => { toast.success("Paiement confirmé — le garage sera renouvelé à son prochain heartbeat"); utils.central.paiements.invalidate(); utils.central.dashboard.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">AtelierOne SaaS — Serveur central</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tous vos garages clients : licences, paiements, synchronisation. C'est ici que vous facturez.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Garages enregistrés" value={stats.nbSites} icon={<Building2 size={14} />} />
        <Kpi label="Licences actives" value={stats.licencesActives} icon={<ShieldCheck size={14} />} accent="text-success-foreground" />
        <Kpi label="Paiements confirmés" value={stats.paiementsConfirmes} icon={<CreditCard size={14} />} />
        <Kpi label="Revenu total" value={`${fmtFCFA(stats.revenuTotal)} F`} icon={<Wallet size={14} />} accent="text-primary" />
        <Kpi label="Ingests (30 j)" value={stats.ingests30j} icon={<UploadCloud size={14} />} accent="text-sky-400" />
        <Kpi label="Sites actifs" value={stats.sitesActifs} icon={<Globe size={14} />} />
      </div>

      {/* Garages */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <Building2 size={14} className="text-primary" /> Garages clients ({sites.length})
        </h3>
        {sites.length === 0 && <p className="text-sm text-muted-foreground">Aucun garage enregistré. Installez un pack et enregistrez-le (licence.enregistrer).</p>}
        <div className="space-y-2">
          {sites.map((s: any) => (
            <div key={s.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{s.nomGarage}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{s.codeSite}</span>
                {s.ville && <span className="text-xs text-muted-foreground">{s.ville}</span>}
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${s.statut === "ACTIF" ? "bg-success/10 text-success-foreground" : "bg-destructive/10 text-destructive"}`}>{s.statut}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  dernière sync : {fmtDate(s.derniereSync)} · heartbeat : {fmtDate(s.dernierHeartbeat)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {s.licence ? (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${(s.licence.joursRestants ?? 0) <= 7 ? "bg-warning/10 text-warning-foreground" : (s.licence.joursRestants ?? 0) <= 0 ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success-foreground"}`}>
                    Licence {s.licence.mode} : échéance {fmtDate(s.licence.dateFin)} · {s.licence.joursRestants} j restants
                  </span>
                ) : (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">Sans licence</span>
                )}
                <span className="text-muted-foreground">{s.nbPaiements} paiement(s) · {fmtFCFA(s.payeTotal)} F encaissés</span>
                {s.versionLogiciel && <span className="font-mono text-[10px] text-muted-foreground">v{s.versionLogiciel}</span>}
                <div className="ml-auto flex items-center gap-1.5">
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