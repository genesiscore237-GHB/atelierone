"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import {
  AlertTriangle,
  CalendarCheck,
  Car,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Lock,
  MessageSquareText,
  PackageSearch,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Stethoscope,
  Users,
  X,
  ClipboardCheck,
} from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  PRIORITE_META,
  STATUT_LABELS,
  STATUT_BADGE,
  ALERTE_META,
  MOTIF_ENTREE_LABELS,
  PRIORITES,
  STATUTS_ATELIER,
  MOTIFS_ENTREE,
  suggererPriorite,
} from "~/server/lib/atelier-service";
import { usePermissions } from "~/hooks/usePermissions";

const TYPE_CLIENT_LABELS: Record<string, string> = { PART: "Particulier", ENTR: "Entreprise", ADMIN: "Administration", ASSUR: "Assurance", FLOTTE: "Flotte", PROSP: "Prospect" };

const DIAG_BADGE: Record<string, string> = {
  VALIDE: "bg-success/15 text-success-foreground",
  SOUMIS: "bg-sky-500/15 text-sky-400",
  RETOURNE: "bg-destructive/15 text-destructive",
  BROUILLON: "bg-muted text-muted-foreground",
};
const DEVIS_BADGE: Record<string, string> = {
  ACCEPTE: "bg-success/15 text-success-foreground",
  EN_ATTENTE: "bg-warning/15 text-warning-foreground",
};
const FACTURE_BADGE: Record<string, string> = {
  PAYEE: "bg-success/15 text-success-foreground",
  AVANCE: "bg-sky-500/15 text-sky-400",
  ATTENTE_BON_COMMANDE: "bg-violet-500/15 text-violet-400",
  ATTENTE_PAIEMENT: "bg-warning/15 text-warning-foreground",
  NON_TRANSMISE: "bg-muted text-muted-foreground",
  A_FACTURER: "bg-primary/15 text-primary",
};
const FACTURE_LABEL: Record<string, string> = {
  PAYEE: "Payée", AVANCE: "Avance", ATTENTE_BON_COMMANDE: "Attente BC", ATTENTE_PAIEMENT: "Attente paiement", NON_TRANSMISE: "Non transmise", A_FACTURER: "À facturer",
};

export function ParcDashboard() {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const { data, isLoading, refetch, dataUpdatedAt } = api.or.getDashboard.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: notifsData } = api.or.listNotifsAtelier.useQuery({ lu: false });

  const [search, setSearch] = useState("");
  const [fPriorite, setFPriorite] = useState("");
  const [fStatut, setFStatut] = useState("");
  const [fAlerte, setFAlerte] = useState("");
  const [fPieces, setFPieces] = useState(false);
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  const [showNotifs, setShowNotifs] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const notifs = (notifsData ?? []) as any[];
  const marquerLu = api.or.marquerNotifLu.useMutation({
    onSuccess: () => utils.or.listNotifsAtelier.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const canModifier = hasPermission("or.modifier") || hasPermission("or.creer");

  const parc = (data?.parc ?? []) as any[];
  const kpis = (data?.kpis ?? {}) as any;
  const repPriorite = (data?.repPriorite ?? []) as any[];
  const repStatut = (data?.repStatut ?? []) as any[];
  const topAnciens = (data?.topAnciens ?? []) as any[];

  const filtered = parc.filter((p) => {
    const q = search.toLowerCase();
    const okText = !q || `${p.numero} ${p.immatriculation} ${p.clientDisplay} ${p.plainte ?? ""}`.toLowerCase().includes(q);
    const okP = !fPriorite || p.priorite === fPriorite;
    const okS = !fStatut || p.statut === fStatut;
    const okA = !fAlerte || p.alerte === fAlerte || (fAlerte === "BLOQUE" && p.statut === "BLOQUE");
    const okPieces = !fPieces || ((p.pieces?.enAttente ?? 0) > 0 || (p.pieces?.manquantes ?? 0) > 0);
    const okKpi = !kpiFilter || (kpiFilter === "P1" ? p.priorite === "P1" : kpiFilter === "RETARD" ? p.alerte === "RETARD" : kpiFilter === "BLOQUE" ? p.statut === "BLOQUE" : kpiFilter === "PARCTOTAL" ? true : true);
    return okText && okP && okS && okA && okPieces && okKpi;
  });

  const exportCsv = () => {
    const lignes = [["numero", "immatriculation", "client", "telephone", "date_entree", "priorite", "statut", "responsable", "promesse", "jours", "retard", "alerte", "emplacement", "plainte", "diagnostic", "devis", "techniciens", "interventions", "pieces_attente", "pieces_manquantes", "bc", "facture", "facture_montant"].join(";")];
    for (const p of filtered) {
      lignes.push([
        p.numero, p.immatriculation, p.clientDisplay, p.clientTelephone ?? "", p.dateOuverture ? new Date(p.dateOuverture).toISOString() : "", p.priorite, p.statut,
        p.responsablePrenom ? `${p.responsablePrenom} ${p.responsableNom ?? ""}` : "", p.datePromesse ?? "", p.joursImmobilisation, p.retardJours, p.alerte, p.emplacement ?? "",
        `"${(p.plainte ?? "").replace(/"/g, '""')}"`, p.diagnostic?.statut ?? "", p.devis ?? "", p.techniciens?.join("|") ?? "", p.interventions ? `${p.interventions.nb}/${p.interventions.heures}h` : "",
        p.pieces?.enAttente ?? 0, p.pieces?.manquantes ?? 0, p.pieces?.bc?.join("|") ?? "", p.facture?.etat ?? "", p.facture?.montant ?? "",
      ].join(";"));
    }
    const blob = new Blob([lignes.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `parc-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`${filtered.length} véhicule(s) exportés`);
  };

  const kpiCards = [
    { id: "PARCTOTAL", label: "Véhicules en parc", value: kpis.totalParc, icon: Car, cls: "text-primary bg-primary/10" },
    { id: "P1", label: "P1 ouverts", value: kpis.p1Ouverts, icon: AlertTriangle, cls: "text-destructive bg-destructive/10" },
    { id: "RETARD", label: "En retard", value: kpis.enRetard, icon: Clock, cls: "text-destructive bg-destructive/10" },
    { id: "BLOQUE", label: "Bloqués", value: kpis.bloques, icon: Lock, cls: "text-warning-foreground bg-warning/10" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Pilotage du parc</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Priorités · Alertes · Statuts — aucun véhicule ne doit être « oublié » sur le parking.
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-success" />
              {dataUpdatedAt ? `MAJ ${new Date(dataUpdatedAt).toLocaleTimeString("fr-FR")}` : "…"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => refetch()}>
            <RefreshCw size={13} /> Actualiser
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download size={13} /> CSV ({filtered.length})
          </Button>
          {canModifier && (
            <>
              <button
                onClick={() => setShowNotifs((v) => !v)}
                className={`relative flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${notifs.length > 0 ? "border-warning/40 bg-warning/10 text-warning-foreground" : "border-border text-muted-foreground"}`}
                title="Notifications atelier"
              >
                🔔 {notifs.length}
              </button>
              <Link href="/dashboard/atelier/reception">
                <Button className="gap-2">
                  <Plus size={16} /> Nouvelle réception
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* KPIs cliquables */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiCards.map((c) => (
          <button
            key={c.id}
            onClick={() => setKpiFilter(kpiFilter === c.id ? null : c.id)}
            className={`rounded-xl border p-4 text-left transition-all hover:shadow-md ${kpiFilter === c.id ? "border-primary ring-1 ring-primary" : "border-border bg-card"}`}
          >
            <div className="flex items-center gap-3">
              <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${c.cls}`}>
                <c.icon size={20} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">{c.label}</p>
                <p className="truncate text-lg font-bold text-foreground">{c.value}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Répartition par priorité */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">Répartition par priorité</div>
          <div className="space-y-2">
            {repPriorite.map((r) => (
              <div key={r.priorite} className="flex items-center gap-2">
                <span className="w-8 rounded px-1.5 py-0.5 text-center text-[11px] font-black text-white" style={{ backgroundColor: PRIORITE_META[r.priorite]?.couleur }}>
                  {r.priorite}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${r.pourcent}%`, backgroundColor: PRIORITE_META[r.priorite]?.couleur }} />
                </div>
                <span className="w-14 text-right text-xs font-bold text-muted-foreground">{r.nombre} ({r.pourcent} %)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Répartition par statut */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">Répartition par statut</div>
          <div className="space-y-2">
            {repStatut.map((s) => (
              <div key={s.statut} className="flex items-center gap-2">
                <span className={`w-32 truncate rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUT_BADGE[s.statut] ?? "bg-muted"}`}>{s.libelle}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${parc.length ? (s.nombre / parc.length) * 100 : 0}%` }} />
                </div>
                <span className="w-6 text-right text-xs font-bold text-muted-foreground">{s.nombre}</span>
              </div>
            ))}
            {repStatut.length === 0 && <p className="text-sm text-muted-foreground">Aucun véhicule en parc.</p>}
          </div>
        </div>

        {/* Top véhicules les plus anciens */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">Top anciens du parc</div>
          <div className="space-y-2">
            {topAnciens.length === 0 && <p className="text-sm text-muted-foreground">Aucun véhicule.</p>}
            {topAnciens.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-1.5 text-sm">
                <div className="min-w-0">
                  <Link href={`/dashboard/ordres-reparation/${t.id}`} className="font-mono text-xs font-bold hover:text-primary">{t.immatriculation}</Link>
                  <span className="ml-1 text-xs text-muted-foreground">{t.clientDisplay}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${PRIORITE_META[t.priorite]?.badge}`}>{t.priorite}</span>
                  <span className="text-xs font-bold text-warning-foreground">{t.joursImmobilisation} j</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showNotifs && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">🔔 Notifications atelier</h3>
            {notifs.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => marquerLu.mutate({ id: 0, tout: true })}>Tout marquer lu</Button>
            )}
          </div>
          {notifs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune notification en attente. Tout est traité.</p>
          ) : (
            <div className="space-y-2">
              {notifs.map((n) => (
                <div key={n.id} className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                  n.type === "PIECE_ARRIVEE" ? "border-success/40 bg-success/5"
                  : n.type === "DIAGNOSTIC_A_VALIDER" ? "border-sky-500/40 bg-sky-500/5"
                  : n.type === "PIECE_MANQUANTE" ? "border-destructive/40 bg-destructive/5"
                  : "border-primary/40 bg-primary/5"
                }`}>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{n.titre}</p>
                    {n.message && <p className="truncate text-xs text-muted-foreground">{n.message}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {n.numeroOR && <Link href={`/dashboard/ordres-reparation/${n.orId}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10">Ouvrir</Link>}
                    <button
                      onClick={() => marquerLu.mutate({ id: n.id })}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-success-foreground hover:bg-success/10"
                      title="Marquer comme traité"
                    >
                      ✓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="N° OR, immat, client, travaux…" className="w-72 pl-9" />
        </div>
        <select value={fPriorite} onChange={(e) => setFPriorite(e.target.value)} className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none">
          <option value="">Toutes priorités</option>
          {PRIORITES.map((p) => <option key={p} value={p} className="bg-background">{p} — {PRIORITE_META[p].libelle}</option>)}
        </select>
        <select value={fStatut} onChange={(e) => setFStatut(e.target.value)} className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none">
          <option value="">Tous statuts</option>
          {STATUTS_ATELIER.map((s) => <option key={s} value={s} className="bg-background">{STATUT_LABELS[s]}</option>)}
        </select>
        <select value={fAlerte} onChange={(e) => setFAlerte(e.target.value)} className="h-10 rounded-lg border border-border bg-accent/30 px-3 text-sm text-foreground outline-none">
          <option value="">Toutes alertes</option>
          {["RETARD", "BLOQUE", "P1", "PROCHE", "LONG", "OK"].map((a) => <option key={a} value={a} className="bg-background">{ALERTE_META[a]?.libelle}</option>)}
        </select>
        <button
          onClick={() => setFPieces((v) => !v)}
          className={`flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${fPieces ? "border-primary bg-primary/10 text-primary" : "border-border bg-accent/30 text-muted-foreground"}`}
          title="Véhicules avec pièces en attente ou manquantes"
        >
          <PackageSearch size={14} /> Pièces en attente
        </button>
      </div>

      {/* Tableau du parc */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">N° OR</th>
              <th className="px-3 py-2.5">Véhicule</th>
              <th className="px-3 py-2.5">Client</th>
              <th className="px-3 py-2.5 text-center">Prio</th>
              <th className="px-3 py-2.5">Statut</th>
              <th className="px-3 py-2.5">Entrée</th>
              <th className="px-3 py-2.5">Plainte</th>
              <th className="px-3 py-2.5 text-center">Diag.</th>
              <th className="px-3 py-2.5 text-center">Devis</th>
              <th className="px-3 py-2.5">Techniciens</th>
              <th className="px-3 py-2.5 text-center">Pièces</th>
              <th className="px-3 py-2.5">Facture</th>
              <th className="px-3 py-2.5">Responsable</th>
              <th className="px-3 py-2.5 text-center">Promesse</th>
              <th className="px-3 py-2.5 text-right">Jours</th>
              <th className="px-3 py-2.5 text-right">Retard</th>
              <th className="px-3 py-2.5 text-center">Alerte</th>
              <th className="px-3 py-2.5">Emplacement</th>
              <th className="px-3 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {isLoading ? (
              <tr><td colSpan={19} className="px-4 py-8 text-center text-sm text-muted-foreground">Chargement…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={19} className="px-4 py-12 text-center text-sm text-muted-foreground">
                <Car size={32} className="mx-auto mb-2 opacity-40" /> Aucun véhicule au parc. Lancez une réception.
              </td></tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} onClick={() => setDetailId(p.id)} className={`cursor-pointer text-sm text-foreground hover:bg-accent/30 ${p.alerte === "RETARD" ? "bg-destructive/5" : p.alerte === "BLOQUE" ? "bg-warning/5" : ""}`}>
                  <td className="px-3 py-2 font-mono text-xs font-bold">{p.numero}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono font-semibold">{p.immatriculation}</span>
                    <span className="block text-[10px] text-muted-foreground">{p.marque} {p.modele}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="block max-w-36 truncate font-medium">{p.clientDisplay}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {TYPE_CLIENT_LABELS[p.clientType] ?? p.clientType} · {p.clientTelephone ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex w-7 justify-center rounded px-1.5 py-0.5 text-[11px] font-black text-white ${p.priorite === "P1" ? "bg-destructive" : p.priorite === "P2" ? "bg-warning" : p.priorite === "P3" ? "bg-success" : "bg-muted text-muted-foreground"}`}>{p.priorite}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUT_BADGE[p.statut] ?? "bg-muted"}`}>{STATUT_LABELS[p.statut] ?? p.statut}</span>
                    {p.raisonBlocage && <span className="block max-w-28 truncate text-[10px] text-destructive">⛔ {p.raisonBlocage}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{p.dateOuverture ? new Date(p.dateOuverture).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="max-w-36 px-3 py-2">
                    {p.plainte ? (
                      <span className="block truncate text-xs text-muted-foreground" title={p.plainte}>
                        <MessageSquareText size={11} className="mr-1 inline text-muted-foreground" />{p.plainte}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {p.diagnostic ? (
                      <span title={p.diagnostic.constat ?? ""} className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${DIAG_BADGE[p.diagnostic.statut] ?? "bg-muted"}`}>
                        {p.diagnostic.statut === "VALIDE" ? "Validé" : p.diagnostic.statut === "SOUMIS" ? "Soumis" : p.diagnostic.statut === "RETOURNE" ? "Renvoyé" : p.diagnostic.statut}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {p.devis ? (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${DEVIS_BADGE[p.devis] ?? "bg-muted"}`}>
                        {p.devis === "ACCEPTE" ? "Accepté" : "En attente"}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {p.techniciens?.length ? (
                      <span className="flex flex-wrap gap-0.5">
                        {p.techniciens.slice(0, 2).map((t: string) => (
                          <span key={t} className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">{t.split(" ")[0]}</span>
                        ))}
                        {p.techniciens.length > 2 && <span className="text-[9px] text-muted-foreground">+{p.techniciens.length - 2}</span>}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {p.pieces ? (
                      <span className="inline-flex flex-col items-center gap-0.5">
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${(p.pieces.manquantes ?? 0) > 0 ? "bg-destructive/15 text-destructive" : (p.pieces.enAttente ?? 0) > 0 ? "bg-warning/15 text-warning-foreground" : "bg-success/15 text-success-foreground"}`}>
                          {p.pieces.servies}/{p.pieces.nbDemandes} servies
                        </span>
                        {(p.pieces.enAttente ?? 0) > 0 && <span className="text-[9px] text-warning-foreground">{p.pieces.enAttente} attente</span>}
                        {(p.pieces.manquantes ?? 0) > 0 && <span className="text-[9px] text-destructive">{p.pieces.manquantes} manquante(s)</span>}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {p.facture ? (
                      <span className="inline-flex flex-col items-start gap-0.5">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${FACTURE_BADGE[p.facture.etat] ?? "bg-muted"}`}>{FACTURE_LABEL[p.facture.etat] ?? p.facture.etat}</span>
                        {p.facture.montant != null && <span className="text-[9px] font-semibold text-muted-foreground">{Number(p.facture.montant).toLocaleString("fr-FR")} F</span>}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.responsablePrenom ? `${p.responsablePrenom} ${p.responsableNom ?? ""}` : "—"}</td>
                  <td className="px-3 py-2 text-center text-xs">{p.datePromesse ? new Date(p.datePromesse).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-warning-foreground">{p.joursImmobilisation} j</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-destructive">{p.retardJours > 0 ? `${p.retardJours} j` : "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-black ${ALERTE_META[p.alerte]?.badge ?? ""}`}>{ALERTE_META[p.alerte]?.libelle ?? p.alerte}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.emplacement}</td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/dashboard/ordres-reparation/${p.id}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10">Fiche</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Panneau détail au clic */}
      {detailId !== null && <ParcDetailModal orId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

// ─── Panneau détail véhicule au clic (toutes les informations de suivi) ───
function ParcDetailModal({ orId, onClose }: { orId: number; onClose: () => void }) {
  const { data, isLoading } = api.or.getDashboard.useQuery(undefined, { refetchInterval: 30_000 });
  const parc = (data?.parc ?? []) as any[];
  const p = parc.find((x) => x.id === orId);

  if (isLoading) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"><div className="h-72 w-full max-w-2xl animate-pulse rounded-2xl bg-muted" /></div>;
  if (!p) return null;

  const fmt = (n: number | string | null | undefined) => n === null || n === undefined ? "—" : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
  const fmtDate = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Car size={16} className="text-primary" /> {p.immatriculation}
              <span className="font-mono text-xs font-semibold text-muted-foreground">{p.numero}</span>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{p.marque} {p.modele} · {p.clientDisplay} ({TYPE_CLIENT_LABELS[p.clientType] ?? p.clientType} · {p.clientTelephone ?? "—"})</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Fermer"><X size={14} /></Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <DetField label="Statut" value={STATUT_LABELS[p.statut] ?? p.statut} badge={STATUT_BADGE[p.statut]} />
          <DetField label="Priorité" value={p.priorite} />
          <DetField label="Alerte" value={ALERTE_META[p.alerte]?.libelle ?? p.alerte} />
          <DetField label="Date d'entrée" value={fmtDate(p.dateOuverture)} />
          <DetField label="Au garage depuis" value={`${p.joursImmobilisation} j`} />
          <DetField label="Promesse" value={fmtDate(p.datePromesse)} warn={p.retardJours > 0} />
          <DetField label="Retard" value={p.retardJours > 0 ? `${p.retardJours} j` : "—"} warn={p.retardJours > 0} />
          <DetField label="Responsable" value={p.responsablePrenom ? `${p.responsablePrenom} ${p.responsableNom ?? ""}` : "—"} />
          <DetField label="Emplacement" value={p.emplacement ?? "—"} />
        </div>

        {p.raisonBlocage && (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
            <span className="font-semibold text-warning-foreground">⛔ Bloqué :</span> {p.raisonBlocage}
          </div>
        )}

        {p.plainte && (
          <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <MessageSquareText size={11} /> Plaintes du client
            </p>
            <p className="mt-1 text-sm whitespace-pre-line">{p.plainte}</p>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <Stethoscope size={11} /> Diagnostic
            </p>
            {p.diagnostic ? (
              <>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${DIAG_BADGE[p.diagnostic.statut] ?? "bg-muted"}`}>
                  {p.diagnostic.statut === "VALIDE" ? "Validé" : p.diagnostic.statut === "SOUMIS" ? "Soumis" : p.diagnostic.statut === "RETOURNE" ? "Renvoyé" : p.diagnostic.statut}
                </span>
                {p.diagnostic.constat && <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground">{p.diagnostic.constat}</p>}
              </>
            ) : <p className="mt-1 text-xs text-muted-foreground">Non établi</p>}
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <ClipboardCheck size={11} /> Devis client
            </p>
            {p.devis ? (
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${DEVIS_BADGE[p.devis] ?? "bg-muted"}`}>
                {p.devis === "ACCEPTE" ? "Accepté — travaux autorisés" : "En attente de validation client"}
              </span>
            ) : <p className="mt-1 text-xs text-muted-foreground">Non soumis</p>}
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <Users size={11} /> Interventions ({p.interventions?.nb ?? 0})
            </p>
            {p.techniciens?.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {p.techniciens.map((t: string) => (
                  <span key={t} className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-border">{t}</span>
                ))}
              </div>
            ) : <p className="mt-1 text-xs text-muted-foreground">Aucune intervention pointée</p>}
            {p.interventions && <p className="mt-1 text-xs text-muted-foreground">{p.interventions.nb} intervention(s) · {p.interventions.heures} h</p>}
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <PackageSearch size={11} /> Pièces commandées
            </p>
            {p.pieces ? (
              <>
                <p className="mt-1 text-xs">
                  {p.pieces.servies} servie(s) · {p.pieces.enAttente} en attente · {p.pieces.manquantes} manquante(s) — {p.pieces.nbDemandes} demande(s)
                </p>
                {p.pieces.bc?.length > 0 && <p className="mt-1 font-mono text-[10px] text-muted-foreground">BC : {p.pieces.bc.join(", ")}</p>}
              </>
            ) : <p className="mt-1 text-xs text-muted-foreground">Aucune demande</p>}
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/10 p-3 sm:col-span-2">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <Receipt size={11} /> Facturation
            </p>
            {p.facture ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${FACTURE_BADGE[p.facture.etat] ?? "bg-muted"}`}>{FACTURE_LABEL[p.facture.etat] ?? p.facture.etat}</span>
                {p.facture.reference && <span className="font-mono text-xs">{p.facture.reference}</span>}
                {p.facture.montant != null && <span className="font-bold">{fmt(p.facture.montant)} F</span>}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {p.statut === "PRET_A_LIVRER" ? "Prêt à facturer — passez à la facturation depuis la fiche OR" : "Non facturé"}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Fermer</Button>
          <Link href={`/dashboard/vehicules/${p.vehiculeId ?? ""}`}>
            <Button size="sm" variant="outline">Fiche véhicule 360°</Button>
          </Link>
          <Link href={`/dashboard/ordres-reparation/${p.id}`}>
            <Button size="sm">Fiche OR</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function DetField({ label, value, badge, warn }: { label: string; value: string; badge?: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      {badge ? (
        <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${badge}`}>{value}</span>
      ) : (
        <p className={`text-sm ${warn ? "font-bold text-destructive" : "text-foreground"}`}>{value}</p>
      )}
    </div>
  );
}
