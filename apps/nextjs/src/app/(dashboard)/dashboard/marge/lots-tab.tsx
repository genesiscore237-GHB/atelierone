"use client";

import { useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import Link from "next/link";
import { Search, Download, Package, Coins, TrendingUp, AlertTriangle, CalendarDays, ShieldAlert, X, Loader2 } from "lucide-react";

type SortKey = "marge" | "montantVendu" | "qteVendue" | "cout" | "tauxEcoulement" | "dateEntree" | "datePeremption";

const sortLabels: Record<SortKey, string> = {
  marge: "Marge",
  montantVendu: "CA",
  qteVendue: "Qté vendue",
  cout: "Coût",
  tauxEcoulement: "Écoulement",
  dateEntree: "Entrée",
  datePeremption: "Péremption",
};

const statutLabels: Record<string, string> = {
  disponible: "En stock",
  epuise: "Épuisés",
  alerte_dlc: "DLC ≤ 30 j",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XAF", maximumFractionDigits: 0 }).format(amount);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d.length <= 10 ? `${d}T00:00:00` : d).toLocaleDateString("fr-FR");
}

export default function LotsTab({ dateDebut, dateFin }: { dateDebut: string; dateFin: string }) {
  const [recherche, setRecherche] = useState("");
  const [statut, setStatut] = useState<"disponible" | "epuise" | "alerte_dlc" | "">("");
  const [typeProduit, setTypeProduit] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("marge");
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [pickerOuvert, setPickerOuvert] = useState(false);
  const [pickerRecherche, setPickerRecherche] = useState("");

  const produitIds = selection.size > 0 ? Array.from(selection) : undefined;

  const { data, isLoading, isError, refetch } = api.marge.getAnalyseLots.useQuery({
    dateDebut,
    dateFin,
    produitIds,
    typeProduit: typeProduit || undefined,
    statut: statut || undefined,
    sortBy,
    limit: 50,
    offset,
  });

  const { data: catalogue } = api.marge.getAnalyseProduits.useQuery({
    dateDebut,
    dateFin,
    sortBy: "ca",
    limit: 500,
    offset: 0,
  });

  const [detailLotId, setDetailLotId] = useState<number | null>(null);
  const { data: detailLot, isLoading: detailLoading } = api.marge.getDetailLot.useQuery(
    { lotId: detailLotId ?? 0 },
    { enabled: detailLotId != null, retry: false },
  );

  const produitsDisponibles = useMemo(() => {
    const q = pickerRecherche.trim().toLowerCase();
    const all = catalogue?.produits ?? [];
    if (!q) return all;
    return all.filter((p: any) =>
      p.titre.toLowerCase().includes(q) ||
      p.codeBarre.toLowerCase().includes(q),
    );
  }, [catalogue, pickerRecherche]);

  function toggleSelection(id: number) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setOffset(0);
  }

  const lots = data?.lots ?? [];
  const resume = data?.resume;

  const lotsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return lots;
    return lots.filter((l) =>
      l.numeroLot.toLowerCase().includes(q) ||
      l.titre.toLowerCase().includes(q) ||
      l.codeBarre.toLowerCase().includes(q) ||
      (l.fournisseur ?? "").toLowerCase().includes(q),
    );
  }, [lots, recherche]);

  function handleExportCsv() {
    if (lotsFiltres.length === 0) {
      toast.error("Aucun lot à exporter");
      return;
    }
    setExporting(true);
    try {
      const header = ["N° Lot", "Type", "Produit", "Code barre", "Fournisseur", "Date entrée", "Péremption", "Qté initiale", "Qté vendue", "Qté restante", "Écoulement", "CA", "Coût", "Marge", "% Marge", "Pertes", "Bénéfice net lot"];
      const lignes = lotsFiltres.map((l) => [
        l.numeroLot, l.typeProduit ?? "", l.titre, l.codeBarre, l.fournisseur ?? "", formatDate(l.dateEntree), formatDate(l.datePeremption),
        String(l.quantiteInitiale), String(l.qteVendue), String(l.qteRestante), `${l.tauxEcoulement.toFixed(1)} %`,
        l.montantVendu.toFixed(2), l.coutVendu.toFixed(2), l.marge.toFixed(2), `${l.tauxMarge.toFixed(1)} %`, l.pertes.toFixed(2),
        (l.beneficeNetLot ?? l.marge - l.pertes).toFixed(2),
      ]);
      const csv = "\uFEFF" + [header, ...lignes]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analyse-lots-${dateDebut || "cumul"}_${dateFin || "aujourdhui"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${lotsFiltres.length} lots exportés`);
    } catch (e) {
      console.error("Export lots failed:", e);
      toast.error("Échec de l'export CSV");
    } finally {
      setExporting(false);
    }
  }

  const badgeDlc = (l: (typeof lots)[number]) => {
    if (l.statutDlc === "perime") {
      return <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"><AlertTriangle size={11} /> Périmé</span>;
    }
    if (l.statutDlc === "bientot") {
      return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"><CalendarDays size={11} /> ≤ 30 j</span>;
    }
    return <span className="text-xs text-muted-foreground">—</span>;
  };

  return (
    <div className="space-y-6">
      {/* Résumé */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-background p-5 dark:bg-card">
          <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><Coins size={14} /> Montant vendu</p>
          <p className="text-2xl font-bold text-foreground mt-1">{isLoading ? "..." : formatCurrency(resume?.montantVendu ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-5 dark:bg-card">
          <p className="text-sm font-medium text-muted-foreground">Coût des lots vendus</p>
          <p className="text-2xl font-bold text-foreground mt-1">{isLoading ? "..." : formatCurrency(resume?.coutVendu ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-5 dark:bg-card">
          <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><TrendingUp size={14} /> Marge</p>
          <p className={`text-2xl font-bold mt-1 ${(resume?.marge ?? 0) >= 0 ? "text-success-foreground" : "text-destructive"}`}>
            {isLoading ? "..." : formatCurrency(resume?.marge ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Taux: {isLoading ? "..." : formatPercent(resume?.tauxMarge ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-5 dark:bg-card">
          <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><Package size={14} /> Stock en lots</p>
          <p className="text-2xl font-bold text-foreground mt-1">{isLoading ? "..." : resume?.qteRestante ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-5 dark:bg-card">
          <p className="text-sm font-medium text-muted-foreground">Lots analysés</p>
          <p className="text-2xl font-bold text-foreground mt-1">{isLoading ? "..." : data?.total ?? 0}</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher n° lot, produit, code barre, fournisseur…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="w-full rounded-lg border border-border py-2 pl-9 pr-3 text-sm dark:bg-muted text-foreground"
          />
        </div>
        <select
          className="rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted text-foreground"
          value={typeProduit}
          onChange={(e) => { setTypeProduit(e.target.value); setOffset(0); }}
        >
          <option value="">Tous les types</option>
          <option value="MANUEL">Manuel scolaire</option>
          <option value="FOURNITURE">Fourniture</option>
        </select>
        <select
          className="rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted text-foreground"
          value={statut}
          onChange={(e) => { setStatut(e.target.value as typeof statut); setOffset(0); }}
        >
          <option value="">Tous les statuts</option>
          {(["disponible", "epuise", "alerte_dlc"] as const).map((s) => (
            <option key={s} value={s}>{statutLabels[s]}</option>
          ))}
        </select>
        <div className="relative">
          <button
            onClick={() => setPickerOuvert((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/50"
          >
            <Package size={15} /> Produits {selection.size > 0 ? `(${selection.size})` : ""}
          </button>
          {pickerOuvert && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPickerOuvert(false)} />
              <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-border bg-background dark:bg-card p-3 shadow-xl">
                <input
                  type="text"
                  placeholder="Rechercher un produit…"
                  value={pickerRecherche}
                  onChange={(e) => setPickerRecherche(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted text-foreground"
                />
                <div className="mt-2 max-h-72 overflow-y-auto space-y-1">
                  {produitsDisponibles.map((p: any) => (
                    <label key={p.produitId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/40 cursor-pointer select-none text-sm">
                      <input
                        type="checkbox"
                        checked={selection.has(Number(p.produitId))}
                        onChange={() => toggleSelection(Number(p.produitId))}
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-foreground">{p.titre}</span>
                        <span className="block text-[10px] text-muted-foreground">{p.codeBarre} · {p.typeProduit ?? ""}</span>
                      </span>
                    </label>
                  ))}
                  {produitsDisponibles.length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">Aucun produit</p>
                  )}
                </div>
                {selection.size > 0 && (
                  <button
                    onClick={() => setSelection(new Set())}
                    className="mt-2 w-full rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5"
                  >
                    Effacer la sélection ({selection.size})
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        <Link
          href="/dashboard/stock/ajustement-manuel"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
          title="Déclarer un vol, une casse, une avarie ou un rebut : le stock du lot est déduit et la perte imputée au lot"
        >
          <ShieldAlert size={15} /> Déclarer vol/perte
        </Link>
        <button
          onClick={handleExportCsv}
          disabled={exporting}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/50 disabled:opacity-50"
        >
          <Download size={15} /> CSV
        </button>
      </div>

      {/* Erreur serveur */}
      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center justify-between gap-4">
          <span>Impossible de charger l'analyse des lots. Réessayez.</span>
          <button onClick={() => refetch()} className="rounded-lg border border-destructive/40 px-3 py-1.5 font-medium hover:bg-destructive/10">
            Réessayer
          </button>
        </div>
      )}

      {/* Tableau */}
      <div className="rounded-xl border border-border bg-background dark:bg-card">
        <div className="border-b border-border p-5">
          <h3 className="text-lg font-semibold text-foreground">Analyse par lot</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.total ?? 0} lots · tri par {sortLabels[sortBy]}
            {statut ? ` · ${statutLabels[statut]}` : ""}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 dark:bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Lot / Produit</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Fournisseur</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Entrée</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Péremption</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Init.</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Vendu</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Restant</th>
                {(["montantVendu", "cout", "marge", "tauxEcoulement", "tauxMarge"] as const).map((key) => (
                  <th key={key} className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">
                    <button
                      onClick={() => { setSortBy(key === "tauxMarge" ? "marge" : key); setOffset(0); }}
                      className={`hover:text-foreground ${sortBy === key ? "text-primary" : "text-muted-foreground"}`}
                      title={key === "marge" ? "Marge brute du lot : montant vendu − coût d'achat du lot (avant déduction des aléas)" : undefined}
                    >
                      {key === "montantVendu" ? "CA" : key === "cout" ? "Coût" : key === "marge" ? "Marge brute" : key === "tauxEcoulement" ? "% Écoulé" : "% Marge"}
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Pertes</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <span title="Bénéfice net du lot = marge brute − pertes (vols, casses, avaries…) : ton bénéfice réel sur ce lot">Bénéfice net lot ?</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={14} className="px-4 py-3"><div className="h-4 bg-muted dark:bg-muted rounded animate-pulse" /></td></tr>
                ))
              ) : lotsFiltres.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {recherche ? "Aucun lot ne correspond à la recherche." : "Aucun lot sur la période."}
                  </td>
                </tr>
              ) : (
                lotsFiltres.map((l) => (
                  <tr
                    key={l.lotId}
                    onClick={() => setDetailLotId(Number(l.lotId))}
                    className="hover:bg-accent/30 dark:hover:bg-accent/30 cursor-pointer"
                    title="Voir le détail du lot (ventes et aléas)"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-foreground font-mono">{l.numeroLot}</p>
                      <p className="text-xs text-muted-foreground">{l.titre}{l.codeBarre ? ` · ${l.codeBarre}` : ""}</p>
                      {l.typeProduit && (
                        <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${l.typeProduit === "MANUEL" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {l.typeProduit === "MANUEL" ? "Manuel" : "Fourniture"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{l.fournisseur ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(l.dateEntree)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{formatDate(l.datePeremption)}</span>
                        {badgeDlc(l)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-muted-foreground">{l.quantiteInitiale}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-muted-foreground">{l.qteVendue}</td>
                    <td className={`px-4 py-3 text-right text-sm font-mono font-medium ${l.qteRestante > 0 ? "text-foreground" : "text-muted-foreground"}`}>{l.qteRestante}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono">{formatCurrency(l.montantVendu)}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-muted-foreground">{formatCurrency(l.coutVendu)}</td>
                    <td className={`px-4 py-3 text-right text-sm font-mono ${l.marge >= 0 ? "text-success-foreground" : "text-destructive"}`}>{formatCurrency(l.marge)}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-muted-foreground">{formatPercent(l.tauxEcoulement)}</td>
                    <td className={`px-4 py-3 text-right text-sm font-mono ${l.tauxMarge >= 0 ? "text-success-foreground" : "text-destructive"}`}>{formatPercent(l.tauxMarge)}</td>
                    <td className={`px-4 py-3 text-right text-sm font-mono ${l.pertes > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {l.pertes > 0 ? formatCurrency(l.pertes) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm font-mono font-semibold ${(l.beneficeNetLot ?? 0) >= 0 ? "text-success-foreground" : "text-destructive"}`}>
                      {formatCurrency(l.beneficeNetLot ?? 0)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && (data?.total ?? 0) > offset + 50 && (
          <div className="border-t border-border p-4 text-center">
            <button
              onClick={() => setOffset(offset + 50)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/50"
            >
              Charger plus
            </button>
          </div>
        )}
      </div>

      {/* Modal détail du lot */}
      {detailLotId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setDetailLotId(null)}>
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-background dark:bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">Détail du lot — {detailLot?.lot?.numeroLot ?? detailLotId}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {detailLot?.lot?.titre ?? ""} · {detailLot?.lot?.typeProduit === "MANUEL" ? "Manuel scolaire" : "Fourniture"}
                  {detailLot?.lot?.fournisseur ? ` · ${detailLot.lot.fournisseur}` : ""}
                </p>
              </div>
              <button onClick={() => setDetailLotId(null)} className="rounded-lg p-1.5 hover:bg-muted"><X size={18} /></button>
            </div>

            {detailLoading && <p className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="inline animate-spin" size={16} /> Chargement…</p>}

            {!detailLoading && detailLot && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-[11px] text-muted-foreground uppercase">Vendu</p>
                    <p className="text-lg font-bold font-mono text-foreground">{formatCurrency(detailLot.lot.montantVendu)}</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-[11px] text-muted-foreground uppercase">Coût vendu</p>
                    <p className="text-lg font-bold font-mono text-foreground">{formatCurrency(detailLot.lot.coutVendu)}</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-[11px] text-muted-foreground uppercase">Marge brute</p>
                    <p className="text-lg font-bold font-mono text-success-foreground">{formatCurrency(detailLot.lot.marge)}</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-[11px] text-muted-foreground uppercase">Bénéfice net lot</p>
                    <p className="text-lg font-bold font-mono text-success-foreground">{formatCurrency(detailLot.lot.beneficeNetLot)}</p>
                    <p className="text-[10px] text-muted-foreground">{detailLot.lot.pertes > 0 ? `− ${formatCurrency(detailLot.lot.pertes)} d'aléas` : "aucun aléa"}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">Ventes du lot ({detailLot.ventes.length})</h4>
                  {detailLot.ventes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucune vente rattachée à ce lot.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                          <tr>
                            <th className="text-left px-3 py-2">Référence</th>
                            <th className="text-center px-3 py-2">Date</th>
                            <th className="text-center px-3 py-2">Qté</th>
                            <th className="text-right px-3 py-2">Prix unitaire</th>
                            <th className="text-right px-3 py-2">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {detailLot.ventes.map((v: any) => (
                            <tr key={v.venteId}>
                              <td className="px-3 py-2 font-mono text-xs">{v.reference}</td>
                              <td className="px-3 py-2 text-center text-xs">{new Date(v.date).toLocaleDateString("fr-FR")}</td>
                              <td className="px-3 py-2 text-center">{v.quantite}</td>
                              <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(v.prixUnitaire))}</td>
                              <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(v.total))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <ShieldAlert size={14} className="text-destructive" /> Aléas du lot ({detailLot.pertes.length})
                  </h4>
                  {detailLot.pertes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucun vol, casse ou perte sur ce lot.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-destructive/30">
                      <table className="w-full text-sm">
                        <thead className="bg-destructive/5 text-xs text-muted-foreground uppercase">
                          <tr>
                            <th className="text-left px-3 py-2">Type</th>
                            <th className="text-center px-3 py-2">Date</th>
                            <th className="text-center px-3 py-2">Qté</th>
                            <th className="text-right px-3 py-2">Montant</th>
                            <th className="text-left px-3 py-2">Motif</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {detailLot.pertes.map((p: any) => (
                            <tr key={p.id}>
                              <td className="px-3 py-2">
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${p.typePerte === "VOL" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning-foreground"}`}>
                                  {p.typePerte}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center text-xs">{new Date(p.datePerte).toLocaleDateString("fr-FR")}</td>
                              <td className="px-3 py-2 text-center">{p.quantite}</td>
                              <td className="px-3 py-2 text-right font-mono text-destructive">{formatCurrency(Number(p.montantPerte))}</td>
                              <td className="px-3 py-2 text-xs">{p.motif ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <Link
                    href="/dashboard/stock/ajustement-manuel"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
                  >
                    <ShieldAlert size={14} /> Déclarer un aléa sur ce lot
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
