"use client";

import { api } from "~/trpc/react";
import {
  BadgeCheck, CalendarClock, CreditCard, KeyRound, RefreshCw, ShieldCheck, UploadCloud, Wallet, WifiOff,
} from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";

const fmtFCFA = (n: number | string | null | undefined) => new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));
const fmtDate = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtDateTime = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");

const STATUT_META: Record<string, { label: string; badge: string }> = {
  OK: { label: "Licence active", badge: "bg-success/15 text-success-foreground" },
  AVERTISSEMENT: { label: "Expire bientôt", badge: "bg-warning/15 text-warning-foreground" },
  LECTURE_SEULE: { label: "Échue — lecture seule", badge: "bg-orange-500/15 text-orange-400" },
  BLOQUE: { label: "Expirée — bloquée", badge: "bg-destructive/15 text-destructive" },
  SANS_LICENCE: { label: "Non enregistré", badge: "bg-destructive/15 text-destructive" },
};

export function MonAbonnement() {
  const { data, isLoading, refetch } = api.licence.portail.useQuery(undefined, { refetchInterval: 60_000 });
  const renouveler = api.licence.renouveler.useMutation({ onSuccess: () => { refetch(); } });
  const pousser = api.sync.pousser.useMutation({ onSuccess: () => { refetch(); } });

  if (isLoading || !data) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  const cfg = data.config as any;
  const loc = data.licenceLocale as any;
  const sync = (data.sync ?? []) as any[];
  const central = data.central as any;
  const licences = (central?.licences ?? []) as any[];
  const paiements = (central?.paiements ?? []) as any[];
  const m = (loc ? STATUT_META[loc.statut] : STATUT_META.SANS_LICENCE) ?? { label: loc?.statut, badge: "bg-muted text-muted-foreground" };
  const enLigne = cfg?.actif === true;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Mon abonnement</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Votre licence, vos paiements et la synchronisation de ce garage.
        </p>
      </div>

      {/* Carte licence */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Statut</p>
            <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase ${m.badge}`}>
              {loc?.statut === "OK" || loc?.statut === "AVERTISSEMENT" ? <ShieldCheck size={13} /> : <WifiOff size={13} />} {m.label}
            </span>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Échéance</p>
            <p className="mt-1 text-lg font-black">{loc ? fmtDate(loc.dateFin) : "—"}</p>
            {loc && <p className="text-xs text-muted-foreground">{loc.joursRestants >= 0 ? `${loc.joursRestants} j restants` : `grâce : ${loc.joursGrace} j`}</p>}
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Formule</p>
            <p className="mt-1 text-lg font-black">{loc?.mode ?? "—"}</p>
            <p className="font-mono text-xs text-muted-foreground">{cfg.siteCode}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/50 pt-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1"><BadgeCheck size={11} /> Pack v{cfg.versionPack}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1"><CalendarClock size={11} /> Dernier heartbeat {loc ? fmtDateTime(loc.dernierHeartbeat) : "—"}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
            {enLigne ? <UploadCloud size={11} className="text-success-foreground" /> : <WifiOff size={11} className="text-destructive" />}
            {enLigne ? `Synchronisé avec ${cfg.centralUrl}` : "Hors-ligne (aucun central configuré)"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={pousser.isPending} onClick={() => pousser.mutate({})}>
            <RefreshCw size={13} className={pousser.isPending ? "animate-spin" : ""} /> Synchroniser maintenant
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-primary" disabled={renouveler.isPending} onClick={() => renouveler.mutate({})}>
            <KeyRound size={13} /> Vérifier le renouvellement
          </Button>
          {loc && (loc.statut === "AVERTISSEMENT" || loc.statut === "LECTURE_SEULE" || loc.statut === "BLOQUE") && enLigne && (
            <Link href={cfg.centralUrl} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90">
              <CreditCard size={13} /> Payer / renouveler
            </Link>
          )}
        </div>
      </div>

      {/* Historique des paiements */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <Wallet size={14} className="text-primary" /> Historique des paiements
        </h3>
        {!enLigne ? (
          <p className="text-sm text-muted-foreground">Aucun central configuré — historique indisponible.</p>
        ) : paiements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun paiement enregistré. Payez pour prolonger votre abonnement.</p>
        ) : (
          <div className="space-y-1.5">
            {paiements.map((p: any) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <span className="font-mono text-xs font-bold">{p.reference}</span>
                <span className="font-semibold">{fmtFCFA(p.montant)} F</span>
                <span className="text-xs text-muted-foreground">{p.periodeMois} mois · {p.fournisseur ?? p.modePaiement}</span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${p.statut === "CONFIRME" ? "bg-success/15 text-success-foreground" : p.statut === "EN_ATTENTE" ? "bg-warning/15 text-warning-foreground" : "bg-destructive/15 text-destructive"}`}>{p.statut}</span>
                <span className="ml-auto text-xs text-muted-foreground">{fmtDate(p.payeLe ?? p.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline des périodes */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <CalendarClock size={14} className="text-primary" /> Périodes de licence
        </h3>
        {!enLigne || licences.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune période enregistrée.</p>
        ) : (
          <div className="space-y-0">
            {licences.map((l: any, i: number) => (
              <div key={l.id} className="relative pb-4 pl-5">
                {i < licences.length - 1 && <span className="absolute left-[5px] top-2 h-full w-px bg-border" />}
                <span className={`absolute left-0 top-1.5 size-2.5 rounded-full ${l.statut === "ACTIVE" ? "bg-success" : "bg-muted"}`} />
                <p className="text-sm font-semibold">
                  {l.mode} <span className="text-muted-foreground">· {fmtDate(l.dateDebut)} → {fmtDate(l.dateFin)}</span>
                </p>
                <p className="text-[10px] uppercase text-muted-foreground">{l.statut} · émise le {fmtDate(l.emitLe)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Synchronisation par table */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <UploadCloud size={14} className="text-primary" /> Synchronisation (dernière poussée par donnée)
        </h3>
        {sync.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune synchronisation effectuée — cliquez « Synchroniser maintenant ».</p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {sync.map((s: any) => (
              <div key={s.table} className="flex items-center gap-2 rounded-lg bg-muted/20 px-3 py-1.5 text-xs">
                <span className="font-medium">{s.table}</span>
                <span className={`ml-auto inline-flex items-center gap-1 font-semibold ${s.statut === "OK" ? "text-success-foreground" : "text-destructive"}`}>
                  {s.statut === "OK" ? <BadgeCheck size={11} /> : <WifiOff size={11} />} {fmtDateTime(s.dernierSync)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}