"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import {
  AlertTriangle, BellRing, CalendarClock, Clock, PackageX, RefreshCw, ShieldAlert, ShoppingCart, Undo2,
} from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { CommanderProduitDialog } from "~/app/(dashboard)/dashboard/catalog/_components/CommanderProduitDialog";

const fmtDate = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

const NIVEAU_BADGE: Record<string, string> = {
  rupture: "bg-destructive/15 text-destructive",
  critique: "bg-destructive/15 text-destructive",
  faible: "bg-warning/15 text-warning-foreground",
};

/** Page centrale des alertes du magasinier : stock bas, prêts non rendus, DLC, anti-vol, dormants. */
export function AlertesStock() {
  const utils = api.useUtils();
  const [commanderFor, setCommanderFor] = useState<{ produitId: string; titre: string; stock: number } | null>(null);

  const { data: alertes, isLoading, refetch } = api.stock.getAlertes.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: prets } = api.outillage.pretsEnCours.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: dlc } = api.stock.dlcAlertes.useQuery({ seuilJours: 30 }, { refetchInterval: 60_000 });
  const { data: antivol } = api.stock.getAlertesAntiVol.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: dormants } = api.stock.getStocksDormants.useQuery({ jours: 90, limit: 20 });

  const items = (alertes ?? []) as any[];
  const ruptures = items.filter((a: any) => (a.niveau ?? "") === "rupture");
  const critiques = items.filter((a: any) => (a.niveau ?? "") === "critique");
  const faibles = items.filter((a: any) => (a.niveau ?? "") === "faible");
  const pretsList = (prets ?? []) as any[];
  const enRetard = pretsList.filter((p: any) => p.enRetard);
  const dlcList = (dlc ?? []) as any[];
  const antivolList = (antivol ?? []) as any[];
  const dormantsList = (dormants?.items ?? []) as any[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <BellRing size={22} className="text-destructive" /> Alertes du magasin
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Stock bas, ruptures, prêts d'outils non rendus, péremptions (DLC), anomalies anti-vol et stocks dormants.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => { refetch(); utils.outillage.pretsEnCours.invalidate(); }}>
          <RefreshCw size={13} /> Actualiser
        </Button>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : (
        <>
          {/* Stock bas */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <PackageX size={14} className="text-destructive" /> Ruptures & stock critique ({ruptures.length + critiques.length})
              </h3>
              <div className="space-y-1.5">
                {ruptures.length === 0 && critiques.length === 0 && <p className="text-sm text-muted-foreground">Aucun produit en rupture ou critique. 👍</p>}
                {[...ruptures, ...critiques].map((a: any, i: number) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/20 px-3 py-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${NIVEAU_BADGE[a.niveau]}`}>{a.niveau}</span>
                    <span className="font-semibold">{a.titre}</span>
                    <span className="font-mono text-muted-foreground">stock {Number(a.quantite)} / seuil {Number(a.seuilAlerte)}</span>
                    <span className="ml-auto flex gap-1">
                      <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setCommanderFor({ produitId: String(a.produitId ?? a.id), titre: a.titre, stock: Number(a.quantite) })}>
                        <ShoppingCart size={11} /> Commander
                      </Button>
                      <Link href="/dashboard/stock/ajustement-manuel">
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]">Ajuster</Button>
                      </Link>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <PackageX size={14} className="text-warning-foreground" /> Stock faible ({faibles.length})
              </h3>
              <div className="space-y-1.5">
                {faibles.length === 0 && <p className="text-sm text-muted-foreground">Aucun stock faible.</p>}
                {faibles.map((a: any, i: number) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/20 px-3 py-2 text-xs">
                    <span className="font-semibold">{a.titre}</span>
                    <span className="font-mono text-muted-foreground">stock {Number(a.quantite)} / seuil {Number(a.seuilAlerte)}</span>
                    <span className="ml-auto flex gap-1">
                      <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" onClick={() => setCommanderFor({ produitId: String(a.produitId ?? a.id), titre: a.titre, stock: Number(a.quantite) })}>
                        <ShoppingCart size={11} /> Commander
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Prêts d'outils non rendus */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
              <Undo2 size={14} className="text-primary" /> Prêts d'outils en cours ({pretsList.length}{enRetard.length > 0 ? ` — ${enRetard.length} en retard` : ""})
            </h3>
            <div className="space-y-1.5">
              {pretsList.length === 0 && <p className="text-sm text-muted-foreground">Aucun outil prêté en ce moment.</p>}
              {pretsList.map((p: any) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/20 px-3 py-2 text-xs">
                  {p.enRetard ? (
                    <span className="flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[9px] font-bold uppercase text-destructive"><AlertTriangle size={10} /> En retard</span>
                  ) : (
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[9px] font-bold uppercase text-warning-foreground">En cours</span>
                  )}
                  <span className="font-semibold">{p.outilTitre}</span>
                  <span className="text-muted-foreground">→ {p.technicienPrenom ?? ""} {p.technicienNom}</span>
                  <span className="text-muted-foreground">· sorti le {fmtDate(p.dateSortie)} ({p.joursEcoules} j)</span>
                  {p.dateRetour && <span className="text-muted-foreground">· retour prévu {fmtDate(p.dateRetour)}</span>}
                  {p.orId && <span className="font-mono text-[10px] text-muted-foreground">· OR #{p.orId}</span>}
                  <Link href="/dashboard/stock/outillage" className="ml-auto">
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]">Gérer</Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* DLC */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
              <CalendarClock size={14} className="text-destructive" /> Péremptions / DLC ({dlcList.length})
            </h3>
            <div className="space-y-1.5">
              {dlcList.length === 0 && <p className="text-sm text-muted-foreground">Aucun lot proche de la péremption.</p>}
              {dlcList.map((d: any, i: number) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/20 px-3 py-2 text-xs">
                  <span className="font-semibold">{d.titre ?? d.produitTitre ?? "Produit"}</span>
                  <span className="font-mono text-muted-foreground">lot {d.numeroLot} · {Number(d.quantite)} · périme le {fmtDate(d.datePeremption)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Anti-vol */}
          {antivolList.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-destructive">
                <ShieldAlert size={14} /> Anomalies anti-vol ({antivolList.length})
              </h3>
              <div className="space-y-1.5">
                {antivolList.map((a: any, i: number) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-background/60 px-3 py-2 text-xs">
                    <span className="font-semibold">{a.titre ?? a.type}</span>
                    <span className="text-muted-foreground">{a.message ?? a.detail ?? ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dormants */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
              <Clock size={14} className="text-muted-foreground" /> Stocks dormants (90 j — matériel à réutiliser) ({dormantsList.length})
            </h3>
            <div className="space-y-1.5">
              {dormantsList.length === 0 && <p className="text-sm text-muted-foreground">Aucun stock dormant.</p>}
              {dormantsList.map((d: any, i: number) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/20 px-3 py-2 text-xs">
                  <span className="font-semibold">{d.titre}</span>
                  <span className="font-mono text-muted-foreground">{Number(d.quantite ?? d.stock)} unité(s) · {new Intl.NumberFormat("fr-FR").format(Number(d.valeurStock ?? d.valeur ?? 0))} F</span>
                  <span className="text-muted-foreground">· dernière sortie {fmtDate(d.derniereSortie)}</span>
                  <Link href="/dashboard/stock/chercher-avant-commander" className="ml-auto">
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]">Réutiliser</Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

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