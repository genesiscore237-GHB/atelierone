"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  ArrowRight, Car, CheckCircle2, Clock, FileText, Loader2, Phone, Receipt, Send, Wallet,
} from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { usePermissions } from "~/hooks/usePermissions";

const PERIODES = [
  { id: "7j", label: "7 derniers jours", offset: 7 },
  { id: "30j", label: "30 derniers jours", offset: 30 },
  { id: "mois", label: "Ce mois-ci", offset: 0 },
  { id: "trimestre", label: "Ce trimestre", offset: 0 },
  { id: "annee", label: "Cette année", offset: 0 },
] as const;

const ETAT_VEHICULE_META: Record<string, { label: string; badge: string }> = {
  EN_TRAVAUX: { label: "En travaux", badge: "bg-sky-500/15 text-sky-400" },
  PRET: { label: "Prêt", badge: "bg-success/15 text-success-foreground" },
  LIVRE: { label: "Livré", badge: "bg-primary/15 text-primary" },
  SORTI: { label: "Sorti", badge: "bg-muted text-muted-foreground" },
};

const ETAT_FACTURE_META: Record<string, { label: string; badge: string }> = {
  NON_TRANSMISE: { label: "Non transmise", badge: "bg-muted text-muted-foreground" },
  ATTENTE_BON_COMMANDE: { label: "Attente bon de commande", badge: "bg-violet-500/15 text-violet-400" },
  ATTENTE_PAIEMENT: { label: "Attente paiement", badge: "bg-warning/15 text-warning-foreground" },
  AVANCE: { label: "Avance reçue", badge: "bg-sky-500/15 text-sky-400" },
  PAYEE: { label: "Payée", badge: "bg-success/15 text-success-foreground" },
};

const fmtFCFA = (n: number | string | null | undefined) => new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));
const fmtDate = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const todayStr = () => new Date().toISOString().slice(0, 10);
const dateISO = (offset: number) => {
  const d = new Date();
  if (offset > 0) d.setDate(d.getDate() - offset);
  else if (offset === 0) d.setDate(1);
  return d.toISOString().slice(0, 10);
};

export function ActivitesClient({ clientId, clientName }: { clientId: number; clientName: string }) {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const [periode, setPeriode] = useState<string>("30j");
  const [du, setDu] = useState(() => dateISO(30));
  const [fin, setFin] = useState(todayStr());

  const { data, isLoading, refetch } = api.clients.getActivite.useQuery({ clientId, dateDebut: du, dateFin: fin });

  const transmettre = api.clients.marquerFactureTransmise.useMutation({
    onSuccess: () => { toast.success("Facture marquée comme transmise au client"); utils.clients.getActivite.invalidate(); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const attenteBC = api.clients.marquerAttenteBonCommande.useMutation({
    onSuccess: () => { toast.success("Facture en attente de bon de commande"); utils.clients.getActivite.invalidate(); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const reprendre = api.clients.reprendreFacture.useMutation({
    onSuccess: () => { toast.success("Bon de commande reçu — relance paiement"); utils.clients.getActivite.invalidate(); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const canModifier = hasPermission("clients.modifier");
  const canConsulter = hasPermission("clients.consulter");

  const applyPeriode = (id: string) => {
    setPeriode(id);
    if (id === "7j") { setDu(dateISO(7)); setFin(todayStr()); }
    else if (id === "30j") { setDu(dateISO(30)); setFin(todayStr()); }
    else if (id === "mois") { setDu(dateISO(0)); setFin(todayStr()); }
    else if (id === "trimestre") {
      const d = new Date(); const m = Math.floor(d.getMonth() / 3) * 3;
      setDu(new Date(d.getFullYear(), m, 1).toISOString().slice(0, 10)); setFin(todayStr());
    } else { setDu(`${new Date().getFullYear()}-01-01`); setFin(todayStr()); }
  };

  if (isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (!data) return <p className="text-sm text-muted-foreground">Aucune donnée disponible.</p>;

  const vehicules = (data.vehicules ?? []) as any[];
  const comp = data.compteurs as any;
  const fac = data.facturation as any;
  const compteurs = fac?.compteurs ?? {};

  return (
    <div className="space-y-4">
      {/* Sélecteur période */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl bg-muted/60 p-1 [scrollbar-width:thin]">
          {PERIODES.map((p) => (
            <button key={p.id} onClick={() => applyPeriode(p.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${periode === p.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-accent"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <input type="date" value={du} onChange={(e) => { setDu(e.target.value); setPeriode(""); }} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" />
          <span className="text-xs text-muted-foreground">→</span>
          <input type="date" value={fin} onChange={(e) => { setFin(e.target.value); setPeriode(""); }} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" />
        </div>
      </div>

      {/* Compteurs véhicules */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Véhicules" value={comp?.totalVehicules ?? 0} icon={<Car size={14} />} />
        <Kpi label="En travaux" value={comp?.enTravaux ?? 0} icon={<Clock size={14} />} accent="text-sky-400" />
        <Kpi label="Prêts" value={comp?.prets ?? 0} icon={<CheckCircle2 size={14} />} accent="text-success-foreground" />
        <Kpi label="Sortis" value={comp?.sortis ?? 0} icon={<Car size={14} />} accent="text-muted-foreground" />
      </div>

      {/* Synthèse facturation période */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
        <MiniStat label="Facturé" value={`${fmtFCFA(fac?.totalFacture)} F`} />
        <MiniStat label="Encaissé" value={`${fmtFCFA(fac?.totalPaye)} F`} />
        <MiniStat label="Restant dû" value={`${fmtFCFA(fac?.totalReste)} F`} warn={(fac?.totalReste ?? 0) > 0} />
        <MiniStat label="Marge (CMP)" value={`${fmtFCFA(fac?.totalMarge)} F`} />
        <MiniStat label="Délai moyen paiement" value={fac?.delaiMoyenPaiementJours != null ? `${fac.delaiMoyenPaiementJours} j` : "—"} />
        <div className="rounded-lg bg-muted/40 p-2">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">États factures</p>
          <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
            {Object.entries(ETAT_FACTURE_META).map(([k, m]) => (
              <span key={k} className="mr-1.5 inline-flex items-center gap-0.5">
                <span className={`h-1.5 w-1.5 rounded-full ${m.badge.split(" ")[0]}`} />{m.label} <b>{compteurs[k] ?? 0}</b>
              </span>
            ))}
          </p>
        </div>
      </div>

      {/* Tableau véhicules × factures */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <Wallet size={14} className="text-primary" /> Véhicules & factures sur la période
        </h3>
        {vehicules.length === 0 && <p className="text-sm text-muted-foreground">Aucun véhicule sur cette période.</p>}
        <div className="space-y-3">
          {vehicules.map((v: any) => {
            const etatV = ETAT_VEHICULE_META[v.etat] ?? { label: v.etat, badge: "bg-muted text-muted-foreground" };
            return (
              <div key={v.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/dashboard/vehicules/${v.id}`} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-sm font-bold text-primary hover:bg-primary/10" title="Voir la fiche 360°">
                    <Car size={13} /> {v.immatriculation} <ArrowRight size={12} className="opacity-60" />
                  </Link>
                  <span className="text-xs text-muted-foreground">{v.marque} {v.modele}</span>
                  {v.chauffeurNom && <span className="text-[10px] text-muted-foreground">chauffeur : {v.chauffeurNom}</span>}
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${etatV.badge}`}>{etatV.label}</span>
                </div>

                {v.orCourant && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-semibold">{v.orCourant.numero}</span>
                    <span className="text-muted-foreground">entré {fmtDate(v.orCourant.dateOuverture)}</span>
                    {v.orCourant.priorite && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-black text-white ${v.orCourant.priorite === "P1" ? "bg-destructive" : v.orCourant.priorite === "P2" ? "bg-warning" : v.orCourant.priorite === "P3" ? "bg-success" : "bg-muted text-muted-foreground"}`}>{v.orCourant.priorite}</span>
                    )}
                    <span className="text-muted-foreground">{v.orCourant.statut}</span>
                    {v.orCourant.raisonBlocage && <span className="text-warning">bloqué : {v.orCourant.raisonBlocage}</span>}
                    <Link href={`/dashboard/ordres-reparation/${v.orCourant.id}`} className="ml-auto inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                      Ouvrir l'OR <ArrowRight size={12} />
                    </Link>
                  </div>
                )}

                {v.factures && v.factures.length > 0 && (
                  <div className="mt-2 space-y-1.5 border-t border-border/40 pt-2">
                    {v.factures.map((f: any) => {
                      const m = ETAT_FACTURE_META[f.etat] ?? { label: f.etat, badge: "bg-muted text-muted-foreground" };
                      return (
                        <div key={f.orId} className="flex flex-wrap items-center gap-2 rounded-lg bg-background/60 px-2.5 py-1.5 text-xs">
                          <Receipt size={13} className="text-muted-foreground" />
                          <span className="font-mono font-semibold">{f.reference}</span>
                          <span className="text-muted-foreground">{fmtDate(f.dateFacture)}</span>
                          <span className="font-semibold">{fmtFCFA(f.total)} F</span>
                          {f.paye > 0 && <span className="text-success-foreground">payé {fmtFCFA(f.paye)} F</span>}
                          {f.reste > 0 && <span className="text-warning-foreground">reste {fmtFCFA(f.reste)} F</span>}
                          {f.marge != null && <span className="text-muted-foreground">marge {fmtFCFA(f.marge)} F</span>}
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${m.badge}`}>{m.label}</span>
                          {canModifier && f.etat === "NON_TRANSMISE" && (
                            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" disabled={transmettre.isPending} onClick={() => transmettre.mutate({ orId: f.orId })}>
                              {transmettre.isPending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Marquer transmise
                            </Button>
                          )}
                          {canModifier && (f.etat === "ATTENTE_PAIEMENT" || f.etat === "NON_TRANSMISE") && (
                            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" disabled={attenteBC.isPending} onClick={() => attenteBC.mutate({ orId: f.orId })}>
                              <FileText size={11} /> Attente bon de commande
                            </Button>
                          )}
                          {canModifier && f.etat === "ATTENTE_BON_COMMANDE" && (
                            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px] text-success-foreground" disabled={reprendre.isPending} onClick={() => reprendre.mutate({ orId: f.orId })}>
                              <CheckCircle2 size={11} /> BC reçu — relance paiement
                            </Button>
                          )}
                          {canConsulter && (
                            <Link href={`/dashboard/ordres-reparation/${f.orId}`} className="ml-auto inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                              Fiche OR <ArrowRight size={11} />
                            </Link>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!v.orCourant && (!v.factures || v.factures.length === 0) && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Aucun OR sur la période.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground ${accent ?? ""}`}>
        {icon} {label}
      </div>
      <p className="mt-1 text-xl font-black text-foreground">{value}</p>
    </div>
  );
}

function MiniStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm font-black ${warn ? "text-warning-foreground" : "text-foreground"}`}>{value}</p>
    </div>
  );
}