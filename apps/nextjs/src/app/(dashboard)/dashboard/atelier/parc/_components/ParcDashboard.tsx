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
  Loader2,
  Lock,
  Plus,
  Search,
  Users,
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

export function ParcDashboard() {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const { data, isLoading } = api.or.getDashboard.useQuery();
  const { data: vehiculesData } = api.vehicules.list.useQuery({ limit: 100 });
  const { data: clientsData } = api.clients.list.useQuery({ limit: 200 });
  const { data: techniciens } = api.rh.list.useQuery({ limit: 100, statut: "actif" });
  const { data: notifsData } = api.or.listNotifsAtelier.useQuery({ lu: false });

  const [search, setSearch] = useState("");
  const [fPriorite, setFPriorite] = useState("");
  const [fStatut, setFStatut] = useState("");
  const [fAlerte, setFAlerte] = useState("");
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  const [showReception, setShowReception] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);

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
    const okKpi = !kpiFilter || (kpiFilter === "P1" ? p.priorite === "P1" : kpiFilter === "RETARD" ? p.alerte === "RETARD" : kpiFilter === "BLOQUE" ? p.statut === "BLOQUE" : kpiFilter === "PARCTOTAL" ? true : true);
    return okText && okP && okS && okA && okKpi;
  });

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
          </p>
        </div>
        {canModifier && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotifs((v) => !v)}
              className={`relative flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${notifs.length > 0 ? "border-warning/40 bg-warning/10 text-warning-foreground" : "border-border text-muted-foreground"}`}
              title="Notifications atelier"
            >
              🔔 {notifs.length}
            </button>
            <Button onClick={() => setShowReception(true)} className="gap-2">
              <Plus size={16} /> Nouvelle réception
            </Button>
          </div>
        )}
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
                  <Link href={`/dashboard/ordres-reparation?or=${t.id}`} className="font-mono text-xs font-bold hover:text-primary">{t.immatriculation}</Link>
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
                    {n.numeroOR && <Link href={`/dashboard/ordres-reparation?or=${n.orId}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10">Ouvrir</Link>}
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
              <tr><td colSpan={12} className="px-4 py-8 text-center text-sm text-muted-foreground">Chargement…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={12} className="px-4 py-12 text-center text-sm text-muted-foreground">
                <Car size={32} className="mx-auto mb-2 opacity-40" /> Aucun véhicule au parc. Lancez une réception.
              </td></tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className={`text-sm text-foreground hover:bg-accent/30 ${p.alerte === "RETARD" ? "bg-destructive/5" : p.alerte === "BLOQUE" ? "bg-warning/5" : ""}`}>
                  <td className="px-3 py-2 font-mono text-xs font-bold">{p.numero}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono font-semibold">{p.immatriculation}</span>
                    <span className="block text-[10px] text-muted-foreground">{p.marque} {p.modele}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="block max-w-40 truncate font-medium">{p.clientDisplay}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {TYPE_CLIENT_LABELS[p.clientType] ?? p.clientType} · {p.clientTelephone ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex w-7 justify-center rounded px-1.5 py-0.5 text-[11px] font-black text-white ${p.priorite === "P1" ? "bg-destructive" : p.priorite === "P2" ? "bg-warning" : p.priorite === "P3" ? "bg-success" : "bg-muted text-muted-foreground"}`}>{p.priorite}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUT_BADGE[p.statut] ?? "bg-muted"}`}>{STATUT_LABELS[p.statut] ?? p.statut}</span>
                    {p.raisonBlocage && <span className="block max-w-32 truncate text-[10px] text-destructive">⛔ {p.raisonBlocage}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.responsablePrenom ? `${p.responsablePrenom} ${p.responsableNom ?? ""}` : "—"}</td>
                  <td className="px-3 py-2 text-center text-xs">{p.datePromesse ? new Date(p.datePromesse).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-warning-foreground">{p.joursImmobilisation} j</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-destructive">{p.retardJours > 0 ? `${p.retardJours} j` : "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-black ${ALERTE_META[p.alerte]?.badge ?? ""}`}>{ALERTE_META[p.alerte]?.libelle ?? p.alerte}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.emplacement}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/dashboard/ordres-reparation?or=${p.id}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10">Fiche</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showReception && <ReceptionModal
        vehicules={(vehiculesData?.vehicules ?? []) as any[]}
        clients={(clientsData?.clients ?? []) as any[]}
        techniciens={((techniciens?.employees ?? []) as any[]).filter((e) => e.statut === "actif")}
        onClose={() => setShowReception(false)}
        onDone={() => { utils.or.getDashboard.invalidate(); utils.or.list.invalidate(); setShowReception(false); }}
      />}
    </div>
  );
}

// ─── Modal de réception rapide (véhicule + client + motif + priorité + promesse) ───
function ReceptionModal({ vehicules, clients, techniciens, onClose, onDone }: {
  vehicules: any[]; clients: any[]; techniciens: any[];
  onClose: () => void; onDone: () => void;
}) {
  const utils = api.useUtils();
  const [vehiculeId, setVehiculeId] = useState(0);
  const [clientId, setClientId] = useState(0);
  const [nouvelleImmat, setNouvelleImmat] = useState("");
  const [marque, setMarque] = useState("");
  const [modele, setModele] = useState("");
  const [motEntree, setMotEntree] = useState("PANNE");
  const [plainte, setPlainte] = useState("");
  const [clientAttend, setClientAttend] = useState(false);
  const [courtoisie, setCourtoisie] = useState(false);
  const [datePromesse, setDatePromesse] = useState("");
  const [emplacement, setEmplacement] = useState("Réception");
  const [technicienId, setTechnicienId] = useState(0);
  const [priorite, setPriorite] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const createVehicule = api.vehicules.create.useMutation();
  const create = api.or.create.useMutation({
    onSuccess: (r: any) => {
      toast.success(`Réception enregistrée — ${r.numero} (P${priorite ?? "3"})`);
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const [creating, setCreating] = useState(false);

  // Suggestion de priorité en direct
  const suggestion = suggererPriorite({
    clientAttend,
    courtoisie,
    promesseJourJ: datePromesse === new Date().toISOString().slice(0, 10),
    promesseJ1: false,
  });

  const submit = async () => {
    let vId = vehiculeId;
    if (vehiculeId === -1) {
      if (!nouvelleImmat.trim()) { toast.error("Immatriculation requise pour un véhicule inconnu"); return; }
      setCreating(true);
      try {
        const res = await createVehicule.mutateAsync({ immatriculation: nouvelleImmat.trim(), marque: marque || undefined, modele: modele || undefined, clientId: clientId || undefined } as any);
        vId = res.id;
      } catch (e: any) { toast.error(e.message); setCreating(false); return; }
      setCreating(false);
    }
    if (!vId) { toast.error("Sélectionnez ou créez un véhicule"); return; }
    create.mutate({
      vehiculeId: vId,
      clientId: clientId || undefined,
      plainte: plainte || undefined,
      motEntree: motEntree as any,
      priorite: (priorite ?? suggestion ?? "P3") as any,
      datePromesse: datePromesse || undefined,
      emplacement: emplacement || undefined,
      responsableTechnicienId: technicienId || undefined,
      clientAttendSurPlace: clientAttend,
      courtoisieDemandee: courtoisie,
      notes: notes || undefined,
    } as any);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Car size={18} className="text-primary" /> Nouvelle réception
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-accent">✕</button>
        </div>

        <div className="space-y-4">
          {/* Véhicule */}
          <div className="rounded-lg border border-dashed border-border p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Véhicule *</div>
            <select value={vehiculeId} onChange={(e) => setVehiculeId(Number(e.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value={0}>— Sélectionner un véhicule connu —</option>
              {vehicules.map((v: any) => <option key={v.id} value={v.id}>{v.immatriculation} — {v.marque} {v.modele}</option>)}
              <option value={-1} className="font-semibold">+ Véhicule inconnu (création rapide)</option>
            </select>
            {vehiculeId === -1 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Input placeholder="Immatriculation *" value={nouvelleImmat} onChange={(e) => setNouvelleImmat(e.target.value)} className="font-mono" />
                <Input placeholder="Marque" value={marque} onChange={(e) => setMarque(e.target.value)} />
                <Input placeholder="Modèle" value={modele} onChange={(e) => setModele(e.target.value)} />
              </div>
            )}
          </div>

          {/* Client */}
          <div className="rounded-lg border border-dashed border-border p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client (auto si véhicule rattaché)</div>
            <select value={clientId} onChange={(e) => setClientId(Number(e.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value={0}>— Aucun / hérité du véhicule —</option>
              {clients.filter((c: any) => c.statut === "ACTIF").map((c: any) => (
                <option key={c.id} value={c.id}>{c.raisonSociale ?? `${c.prenom ?? ""} ${c.nom}`}</option>
              ))}
            </select>
          </div>

          {/* Motif + consignes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Motif d'entrée</Label>
              <select value={motEntree} onChange={(e) => setMotEntree(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {MOTIFS_ENTREE.map((m) => <option key={m} value={m}>{MOTIF_ENTREE_LABELS[m]}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Restitution promise</Label>
              <Input type="date" className="mt-1" value={datePromesse} onChange={(e) => setDatePromesse(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Travaux demandés / symptômes</Label>
            <textarea rows={2} value={plainte} onChange={(e) => setPlainte(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" placeholder="Description détaillée…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Emplacement</Label>
              <Input className="mt-1" value={emplacement} onChange={(e) => setEmplacement(e.target.value)} placeholder="Réception, Parc A, Pont 1…" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Responsable technique (optionnel)</Label>
              <select value={technicienId} onChange={(e) => setTechnicienId(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value={0}>Non assigné</option>
                {techniciens.map((t: any) => <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5 text-sm text-foreground">
              <input type="checkbox" checked={clientAttend} onChange={(e) => setClientAttend(e.target.checked)} className="size-4 accent-primary" />
              Client attend sur place
            </label>
            <label className="flex items-center gap-1.5 text-sm text-foreground">
              <input type="checkbox" checked={courtoisie} onChange={(e) => setCourtoisie(e.target.checked)} className="size-4 accent-primary" />
              Véhicule de courtoisie demandé
            </label>
          </div>

          {/* Priorité */}
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Priorité *</span>
              <span className="text-xs text-muted-foreground">Suggestion système : <b className={PRIORITE_META[suggestion]?.badge}>{suggestion} — {PRIORITE_META[suggestion]?.libelle}</b></span>
            </div>
            <div className="flex gap-2">
              {PRIORITES.map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorite(priorite === p ? null : p)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-bold transition-all ${priorite === p ? "border-primary ring-1 ring-primary" : "border-border"}`}
                  style={{ color: PRIORITE_META[p].couleur }}
                >
                  {p}
                  <span className="block text-[9px] font-medium text-muted-foreground">{PRIORITE_META[p].libelle}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={submit} disabled={create.isPending || creating} className="gap-2">
              {create.isPending || creating ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 size={15} />}
              Enregistrer la réception
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}