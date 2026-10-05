"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  BarChart3, Calendar, ChevronDown, Download, FileText, FileSpreadsheet, FileBarChart,
  FlaskConical, Loader2, RefreshCcw, Save, Search, Star, Trash2, X, Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import type { ReportInput, OptionResource } from "~/server/api/routers/reports/defs";

type DimensionKey = ReportInput["dimension"];

interface Favorite {
  id: string;
  nom: string;
  config: BuilderConfig;
}

interface BuilderConfig {
  dimension: DimensionKey;
  periodeUnite?: string;
  measures: string[];
  ratios: string[];
  filters: Record<string, string[]>;
  dateDebut: string;
  dateFin: string;
  comparePrevious: boolean;
  sortBy: string;
  sortDir: "asc" | "desc";
  limit: number;
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

const CHARTS_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

const DEFAULT_CONFIG: BuilderConfig = {
  dimension: "produit",
  measures: ["ca", "margeBrute"],
  ratios: ["tauxMarge"],
  filters: {},
  dateDebut: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split("T")[0],
  dateFin: new Date().toISOString().split("T")[0],
  comparePrevious: true,
  sortBy: "measure:ca",
  sortDir: "desc",
  limit: 100,
};

const NUMERIC_RESOURCES = new Set(["produits", "categories", "fournisseurs", "clients", "vendeurs", "caisses", "agences"]);

const FILTER_GROUPS: { titre: string; filters: { key: string; label: string; resource: OptionResource }[] }[] = [
  {
    titre: "Produits",
    filters: [
      { key: "produits", label: "Produits", resource: "produits" },
      { key: "categories", label: "Catégories", resource: "categories" },
      { key: "typesProduit", label: "Types de produit", resource: "typesProduit" },
      { key: "fournisseurs", label: "Fournisseurs", resource: "fournisseurs" },
    ],
  },
  {
    titre: "Ventes & agences",
    filters: [
      { key: "vendeurs", label: "Vendeurs", resource: "vendeurs" },
      { key: "clients", label: "Clients", resource: "clients" },
      { key: "caisses", label: "Caisses", resource: "caisses" },
      { key: "modesPaiement", label: "Modes de paiement", resource: "modesPaiement" },
      { key: "agences", label: "Agences", resource: "agences" },
    ],
  },
];

function fmtMoney(v: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XAF", maximumFractionDigits: 0 }).format(v);
}
function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}
function fmtNum(v: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v);
}

function fmtValue(key: string, v: number) {
  if (["ca", "cout", "margeBrute", "remises", "pertes", "panierMoyen"].includes(key)) return fmtMoney(v);
  if (["tauxMarge", "tauxRemise"].includes(key)) return fmtPct(v);
  return fmtNum(v);
}

function Delta({ value, pct }: { value: number; pct: number | null }) {
  if (pct == null) return <span className="text-[10px] text-muted-foreground">—</span>;
  const positive = value >= 0;
  return (
    <span className={`text-[10px] font-medium ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
      {positive ? "+" : ""}
      {fmtNum(pct)}%
    </span>
  );
}

function MultiSelect({
  filterKey, label, resource, value, onChange,
}: {
  filterKey: string; label: string; resource: OptionResource; value: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [labelMap, setLabelMap] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data: options, isLoading } = api.reports.options.useQuery(
    { resource, search: debounced || undefined, limit: 200 },
    { enabled: open || value.length > 0 },
  );

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-accent/40"
      >
        <span className="truncate text-foreground">
          {value.length === 0 ? label : `${label} (${value.length})`}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {value.length > 0 && !open && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {value.slice(0, 6).map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {labelMap[id] ?? id}
              <button onClick={() => toggle(id)} className="hover:text-destructive"><X size={10} /></button>
            </span>
          ))}
          {value.length > 6 && <span className="text-[11px] text-muted-foreground">+{value.length - 6}</span>}
        </div>
      )}
      {open && (
        <div className="absolute z-30 mt-1 w-72 rounded-xl border border-border bg-background shadow-xl dark:bg-card">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search size={13} className="text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1.5 scrollbar-thin">
            {isLoading ? (
              <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
            ) : (options ?? []).length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Aucun résultat</p>
            ) : (
              options?.map((o) => {
                const checked = value.includes(o.id);
                const oExtra = (o as { extra?: string }).extra;
                return (
                  <button
                    key={`${filterKey}:${o.id}`}
                    type="button"
                    onClick={() => {
                      toggle(o.id);
                      setLabelMap((m) => ({ ...m, [o.id]: o.label }));
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-accent/50"
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-primary bg-primary" : "border-border"}`}>
                      {checked && <span className="text-[10px] text-white">✓</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{o.label}</span>
                      {oExtra ? <span className="block truncate text-[10px] text-muted-foreground">{oExtra}</span> : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RapportsPage() {
  const [config, setConfig] = useState<BuilderConfig>(DEFAULT_CONFIG);
  const [generated, setGenerated] = useState(false);
  const [offset, setOffset] = useState(0);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [favOpen, setFavOpen] = useState(false);
  const [favNom, setFavNom] = useState("");
  const [exporting, setExporting] = useState<"csv" | "xlsx" | "pdf" | null>(null);

  const { data: meta } = api.reports.meta.useQuery();
  const { data: templates } = api.reports.templates.useQuery();

  useEffect(() => {
    try {
      const raw = localStorage.getItem("libracore.rapports.favoris");
      if (raw) setFavorites(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const input = useMemo<ReportInput>(() => {
    const f: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config.filters)) {
      if (v.length > 0) f[k] = NUMERIC_RESOURCES.has(k) ? v.map(Number) : v;
    }
    if (config.dateDebut) f.dateDebut = config.dateDebut;
    if (config.dateFin) f.dateFin = config.dateFin;
    return {
      dimension: config.dimension,
      periodeUnite: config.dimension === "periode" ? (config.periodeUnite ?? "mois") : undefined,
      measures: config.measures,
      ratios: config.ratios,
      filters: Object.keys(f).length > 0 ? (f as ReportInput["filters"]) : undefined,
      comparePrevious: config.comparePrevious,
      sortBy: config.sortBy,
      sortDir: config.sortDir,
      limit: config.limit,
      offset,
    } as ReportInput;
  }, [config, offset]);

  const { data: result, isLoading, isFetching } = api.reports.run.useQuery(input, { enabled: generated });

  const set = <K extends keyof BuilderConfig>(k: K, v: BuilderConfig[K]) =>
    setConfig((c) => ({ ...c, [k]: v }));

  function applyTemplate(t: NonNullable<typeof templates>[number]) {
    setConfig({
      ...DEFAULT_CONFIG,
      dimension: t.params.dimension,
      periodeUnite: t.params.periodeUnite,
      measures: t.params.measures,
      ratios: t.params.ratios ?? [],
      filters: {},
      dateDebut: config.dateDebut,
      dateFin: config.dateFin,
      comparePrevious: t.params.comparePrevious ?? false,
      sortBy: t.params.sortBy ?? "measure:ca",
      sortDir: t.params.sortDir ?? "desc",
      limit: t.params.limit ?? 100,
    });
    setOffset(0);
    setGenerated(true);
  }

  function generate() {
    setOffset(0);
    setGenerated(true);
  }

  function saveFavorite() {
    const nom = favNom.trim() || `Rapport ${new Date().toLocaleDateString("fr-FR")}`;
    const fav: Favorite = { id: crypto.randomUUID(), nom, config: { ...config } };
    const next = [...favorites, fav];
    setFavorites(next);
    localStorage.setItem("libracore.rapports.favoris", JSON.stringify(next));
    setFavOpen(false);
    setFavNom("");
  }

  function loadFavorite(fav: Favorite) {
    setConfig(fav.config);
    setOffset(0);
    setGenerated(true);
  }

  function deleteFavorite(id: string) {
    const next = favorites.filter((f) => f.id !== id);
    setFavorites(next);
    localStorage.setItem("libracore.rapports.favoris", JSON.stringify(next));
  }

  const chartData = useMemo(() => {
    const rows = result?.rows ?? [];
    return rows.map((r) => ({ label: r.label, ...r.values }));
  }, [result]);

  const measureColors = useMemo(() => {
    const cols = result?.columns.filter((c) => c.kind !== "dimension") ?? [];
    return Object.fromEntries(cols.map((c, i) => [c.key, CHARTS_COLORS[i % CHARTS_COLORS.length]]));
  }, [result]);

  async function exportData(format: "csv" | "xlsx" | "pdf") {
    if (!result) return;
    setExporting(format);
    try {
      const cols = result.columns;
      const data = result.rows.map((r) => {
        const obj: Record<string, string | number> = { [cols[0].label]: r.label };
        for (const c of cols.slice(1)) obj[c.label] = r.values[c.key] ?? 0;
        if (result.hasCompare) {
          for (const c of cols.slice(1)) obj[`${c.label} (Δ%)`] = r.compare[c.key]?.pct ?? 0;
        }
        return obj;
      });
      data.push(
        Object.fromEntries([
          [cols[0].label, "TOTAL"],
          ...cols.slice(1).map((c) => [c.label, result.totals.values[c.key] ?? 0]),
          ...(result.hasCompare ? cols.slice(1).map((c) => [`${c.label} (Δ%)`, result.totals.compare[c.key]?.pct ?? 0]) : []),
        ]),
      );
      const stamp = `${config.dateDebut}_${config.dateFin}`;
      const base = `rapport-${config.dimension}-${stamp}`;

      if (format === "csv") {
        const Papa = (await import("papaparse")).default;
        const csv = Papa.unparse(data);
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
        downloadBlob(blob, `${base}.csv`);
        return;
      }

      if (format === "xlsx") {
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Rapport");
        ws.columns = cols.map((c) => ({ header: c.label, key: c.key, width: c.kind === "dimension" ? 40 : 16 }));
        for (const r of result.rows) {
          ws.addRow(Object.fromEntries(cols.map((c) => [c.key, c.kind === "dimension" ? r.label : r.values[c.key]])));
        }
        const totalRow = ws.addRow(Object.fromEntries(cols.map((c) => [c.key, c.kind === "dimension" ? "TOTAL" : result.totals.values[c.key]])));
        ws.getRow(1).font = { bold: true };
        ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
        totalRow.font = { bold: true };
        const buf = await wb.xlsx.writeBuffer();
        downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${base}.xlsx`);
        return;
      }

      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14);
      doc.text(`Rapport — ${cols[0].label}`, 14, 14);
      doc.setFontSize(9);
      doc.text(`Période: ${config.dateDebut} → ${config.dateFin}${config.comparePrevious ? " · comparatif période précédente" : ""}`, 14, 20);
      const widths = cols.map((c) => (c.kind === "dimension" ? 60 : 30));
      const startX = 14;
      let y = 28;
      doc.setFont("helvetica", "bold");
      cols.forEach((c, i) => doc.text(c.label.slice(0, 22), startX + widths.slice(0, i).reduce((a, b) => a + b, 0), y));
      doc.setFont("helvetica", "normal");
      y += 5;
      for (const r of result.rows.slice(0, 60)) {
        if (y > 190) { doc.addPage(); y = 15; }
        cols.forEach((c, i) => {
          const x = startX + widths.slice(0, i).reduce((a, b) => a + b, 0);
          const v = c.kind === "dimension" ? r.label : fmtValue(c.key, r.values[c.key] ?? 0);
          doc.text(String(v).slice(0, 26), x, y);
        });
        y += 5;
      }
      doc.save(`${base}.pdf`);
    } catch (e) {
      console.error("Export failed:", e);
      toast.error("Échec de l'export. Réessayez.");
    } finally {
      setExporting(null);
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectedTemplate = templates?.find((t) =>
    t.params.dimension === config.dimension &&
    t.params.sortBy === config.sortBy &&
    t.params.comparePrevious === config.comparePrevious &&
    JSON.stringify(t.params.measures) === JSON.stringify(config.measures),
  );

  const dimLabel = meta?.dimensions.find((d) => d.key === config.dimension)?.label ?? config.dimension;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Rapports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Générateur de rapports commerciaux : combinez librement dimensions, mesures et filtres.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {result && generated && (
            <>
              <button
                onClick={() => exportData("csv")}
                disabled={exporting != null}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/50 disabled:opacity-50"
              >
                <Download size={15} /> CSV
              </button>
              <button
                onClick={() => exportData("xlsx")}
                disabled={exporting != null}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/50 disabled:opacity-50"
              >
                <FileSpreadsheet size={15} /> XLSX
              </button>
              <button
                onClick={() => exportData("pdf")}
                disabled={exporting != null}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/50 disabled:opacity-50"
              >
                <FileText size={15} /> PDF
              </button>
            </>
          )}
          <button
            onClick={() => setFavOpen((o) => !o)}
            className={`flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/50 ${favOpen ? "bg-accent/50" : ""}`}
          >
            <Star size={15} /> Favoris {favorites.length > 0 && <span className="rounded-full bg-primary/15 px-1.5 text-[11px] text-primary">{favorites.length}</span>}
          </button>
        </div>
      </div>

      {favOpen && (
        <motion.div variants={item} initial="hidden" animate="show" className="mb-6 rounded-xl border border-border bg-background p-4 dark:bg-card">
          <div className="mb-3 flex gap-2">
            <input
              value={favNom}
              onChange={(e) => setFavNom(e.target.value)}
              placeholder="Nom du favori…"
              className="w-64 rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted"
            />
            <button
              onClick={saveFavorite}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Save size={14} /> Sauvegarder la config actuelle
            </button>
          </div>
          {favorites.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun favori enregistré. Sauvegardez votre configuration pour la retrouver en un clic.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {favorites.map((fav) => (
                <div key={fav.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <button onClick={() => loadFavorite(fav)} className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary">
                    <Star size={13} className="text-amber-500" /> {fav.nom}
                  </button>
                  <button onClick={() => deleteFavorite(fav.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
        {/* Templates */}
        <motion.section variants={item} className="rounded-xl border border-border bg-background p-5 dark:bg-card">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--module-marge)]" />
            <h2 className="text-base font-semibold text-foreground">Modèles</h2>
            <span className="text-xs text-muted-foreground">— un clic pour appliquer une configuration type</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {templates?.map((t) => {
              const active = selectedTemplate?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    active ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-accent/40"
                  }`}
                >
                  <p className="text-sm font-semibold text-foreground">{t.nom}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                </button>
              );
            })}
          </div>
        </motion.section>

        {/* Builder */}
        <motion.section variants={item} className="rounded-xl border border-border bg-background p-5 dark:bg-card">
          <div className="mb-4 flex items-center gap-2">
            <FlaskConical size={16} className="text-[var(--module-marge)]" />
            <h2 className="text-base font-semibold text-foreground">Paramètres</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Dimension */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Regrouper par</label>
              <select
                value={config.dimension}
                onChange={(e) => set("dimension", e.target.value as DimensionKey)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm dark:bg-muted"
              >
                {meta?.dimensions.map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
              {config.dimension === "periode" && (
                <select
                  value={config.periodeUnite ?? "mois"}
                  onChange={(e) => set("periodeUnite", e.target.value)}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm dark:bg-muted"
                >
                  {meta?.periodUnits.map((u) => (
                    <option key={u.key} value={u.key}>{u.label}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Dates */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Période</label>
              <div className="flex items-center gap-2">
                <Calendar size={15} className="shrink-0 text-muted-foreground" />
                <input
                  type="date"
                  value={config.dateDebut}
                  onChange={(e) => set("dateDebut", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm dark:bg-muted"
                />
                <span className="text-muted-foreground">→</span>
                <input
                  type="date"
                  value={config.dateFin}
                  onChange={(e) => set("dateFin", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm dark:bg-muted"
                />
              </div>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.comparePrevious}
                  onChange={(e) => set("comparePrevious", e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-foreground">Comparer à la période précédente</span>
              </label>
            </div>

            {/* Sort + limit */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Tri</label>
              <div className="flex gap-2">
                <select
                  value={config.sortBy}
                  onChange={(e) => set("sortBy", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm dark:bg-muted"
                >
                  <option value="dimension">{dimLabel}</option>
                  {result?.columns.filter((c) => c.kind !== "dimension").map((c) => (
                    <option key={c.key} value={`measure:${c.key}`}>{c.label}</option>
                  ))}
                </select>
                <select
                  value={config.sortDir}
                  onChange={(e) => set("sortDir", e.target.value as "asc" | "desc")}
                  className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm dark:bg-muted"
                >
                  <option value="desc">Desc.</option>
                  <option value="asc">Asc.</option>
                </select>
              </div>
              <label className="mt-2 block text-sm">
                <span className="text-muted-foreground">Lignes : </span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={config.limit}
                  onChange={(e) => set("limit", Math.min(1000, Math.max(1, Number(e.target.value) || 100)))}
                  className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm dark:bg-muted"
                />
              </label>
            </div>
          </div>

          {/* Columns */}
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Colonnes (mesures & ratios)</label>
            <div className="flex flex-wrap gap-2">
              {meta?.measures.map((m) => {
                const active = config.measures.includes(m.key);
                return (
                  <button
                    key={m.key}
                    onClick={() =>
                      set("measures", active ? config.measures.filter((x) => x !== m.key) : [...config.measures, m.key])
                    }
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent/40"
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
              {meta?.ratios.map((r) => {
                const active = config.ratios.includes(r.key);
                return (
                  <button
                    key={r.key}
                    onClick={() =>
                      set("ratios", active ? config.ratios.filter((x) => x !== r.key) : [...config.ratios, r.key])
                    }
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent/40"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            {config.measures.length === 0 && config.ratios.length === 0 && (
              <p className="mt-1.5 text-xs text-destructive">Sélectionnez au moins une colonne.</p>
            )}
          </div>

          {/* Filters */}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {FILTER_GROUPS.map((group) => (
              <div key={group.titre}>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{group.titre}</label>
                <div className="space-y-2">
                  {group.filters.map((f) => (
                    <MultiSelect
                      key={f.key}
                      filterKey={f.key}
                      label={f.label}
                      resource={f.resource}
                      value={config.filters[f.key] ?? []}
                      onChange={(v) =>
                        setConfig((c) => ({
                          ...c,
                          filters: { ...c.filters, [f.key]: v.length > 0 ? v : undefined },
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
            {result && generated && (
              <span className="mr-auto text-xs text-muted-foreground">
                {result.totalCount} lignes · {result.query.measures.length + result.query.ratios.length} colonnes
              </span>
            )}
            <button
              onClick={generate}
              disabled={config.measures.length === 0 && config.ratios.length === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              <BarChart3 size={15} /> {generated ? "Régénérer" : "Générer le rapport"}
            </button>
          </div>
        </motion.section>

        {/* Results */}
        {generated && (
          <motion.section variants={item} className="space-y-6">
            {isLoading || isFetching ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-background py-16 dark:bg-card">
                <Loader2 size={28} className="animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Calcul du rapport…</p>
              </div>
            ) : !result ? (
              <div className="rounded-xl border border-border bg-background py-10 text-center text-sm text-muted-foreground dark:bg-card">
                Impossible de générer le rapport. Vérifiez les paramètres.
              </div>
            ) : (
              <>
                {/* Totals */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {result.columns.filter((c) => c.kind !== "dimension").map((c) => (
                    <div key={c.key} className="rounded-xl border border-border bg-background p-4 dark:bg-card">
                      <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                      <p className="mt-0.5 truncate text-xl font-bold text-foreground">
                        {fmtValue(c.key, result.totals.values[c.key] ?? 0)}
                      </p>
                      {result.hasCompare && (
                        <Delta value={result.totals.compare[c.key]?.value ?? 0} pct={result.totals.compare[c.key]?.pct ?? null} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Chart */}
                <div className="rounded-xl border border-border bg-background p-5 dark:bg-card">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileBarChart size={16} className="text-[var(--module-marge)]" />
                      <h3 className="text-sm font-semibold text-foreground">Graphique — {dimLabel}</h3>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {result.hasCompare ? "Comparaison période précédente activée" : "Période sélectionnée"}
                    </span>
                  </div>
                  {chartData.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Aucune donnée sur la période</p>
                  ) : config.dimension === "periode" ? (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(value: any, name: any) => [fmtValue(String(name), Number(value)), name]} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          {result.columns.filter((c) => c.kind !== "dimension").map((c) => (
                            <Line key={c.key} type="monotone" dataKey={c.key} name={c.label} stroke={measureColors[c.key]} strokeWidth={2} dot={false} />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData.slice(0, 15)} layout="vertical" margin={{ left: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(value: any, name: any) => [fmtValue(String(name), Number(value)), name]} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          {result.columns.filter((c) => c.kind !== "dimension").map((c) => (
                            <Bar key={c.key} dataKey={c.key} name={c.label} fill={measureColors[c.key]} radius={[0, 3, 3, 0]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Table */}
                <div className="rounded-xl border border-border bg-background dark:bg-card">
                  <div className="border-b border-border px-5 py-4">
                    <h3 className="text-sm font-semibold text-foreground">Détail</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {dimLabel} · {result.totalCount} lignes · tri : {result.query.sortBy} ({result.query.sortDir})
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50 dark:bg-muted/50">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {result.columns[0].label}
                          </th>
                          {result.columns.slice(1).map((c) => (
                            <th key={c.key} className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              {c.label}
                              {result.hasCompare && <span className="ml-1 text-[9px] text-muted-foreground/70">(Δ %)</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border dark:divide-border">
                        {result.rows.length === 0 ? (
                          <tr>
                            <td colSpan={result.columns.length} className="px-4 py-8 text-center text-sm text-muted-foreground">
                              Aucune vente sur la période. Élargissez la période ou allégez les filtres.
                            </td>
                          </tr>
                        ) : (
                          result.rows.map((r) => (
                            <tr key={`${r.id}`} className="hover:bg-accent/30 dark:hover:bg-accent/30">
                              <td className="max-w-[280px] px-4 py-2 text-sm font-medium text-foreground">
                                <span className="line-clamp-2">{r.label}</span>
                              </td>
                              {result.columns.slice(1).map((c) => {
                                const v = r.values[c.key] ?? 0;
                                const neg = ["margeBrute", "pertes"].includes(c.key) && v < 0;
                                return (
                                  <td key={c.key} className="px-4 py-2 text-right font-mono text-sm">
                                    <span className={neg ? "text-destructive" : "text-foreground"}>{fmtValue(c.key, v)}</span>
                                    {result.hasCompare && (
                                      <div className="flex justify-end">
                                        <Delta value={r.compare[c.key]?.value ?? 0} pct={r.compare[c.key]?.pct ?? null} />
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))
                        )}
                      </tbody>
                      {result.rows.length > 0 && (
                        <tfoot>
                          <tr className="border-t border-border bg-muted/30 dark:bg-muted/30">
                            <td className="px-4 py-2.5 text-sm font-bold text-foreground">TOTAL</td>
                            {result.columns.slice(1).map((c) => (
                              <td key={c.key} className="px-4 py-2.5 text-right font-mono text-sm font-bold text-foreground">
                                {fmtValue(c.key, result.totals.values[c.key] ?? 0)}
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                  {result.rows.length >= config.limit && (
                    <div className="flex justify-center border-t border-border p-3">
                      <button
                        onClick={() => setOffset((o) => o + config.limit)}
                        className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-accent/50"
                      >
                        Charger plus
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.section>
        )}

        <p className="flex items-center justify-center gap-1 pb-4 text-center text-xs text-muted-foreground">
          <RefreshCcw size={11} className="inline" />
          Coût = quantité × COALESCE(cost unitaire, prix d'achat × facteur de conversion, 0) · Marge = CA − coût · Marge nette = brute − remises − retours.
        </p>
      </motion.div>
    </div>
  );
}
