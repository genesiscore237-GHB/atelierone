"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Compass,
  RotateCcw,
  Search,
} from "lucide-react";

export interface EtapeGuide {
  id: string;
  titre: string;
  ou?: string;
  route?: string;
  quoi?: string[];
  attendu?: string;
  astuce?: string;
}

function cleProgression(module: string) {
  return `atelierone-guide-${module}`;
}

export default function GuideInteractif({
  module,
  etapes,
}: {
  module: string;
  etapes: Array<EtapeGuide>;
}) {
  const [fait, setFait] = useState<Record<string, boolean>>({});
  const [pret, setPret] = useState(false);
  const [ouverts, setOuverts] = useState<Array<string>>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    let stocke: Record<string, boolean> = {};
    try {
      const brut = window.localStorage.getItem(cleProgression(module));
      if (brut) stocke = JSON.parse(brut) as Record<string, boolean>;
    } catch {
      stocke = {};
    }
    setFait(stocke);
    setPret(true);
  }, [module]);

  useEffect(() => {
    if (!pret) return;
    try {
      window.localStorage.setItem(cleProgression(module), JSON.stringify(fait));
    } catch {
      // stockage indisponible : progression simplement non conservée
    }
  }, [fait, pret, module]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return etapes;
    return etapes.filter((e) =>
      `${e.titre} ${e.ou ?? ""} ${(e.quoi ?? []).join(" ")} ${e.attendu ?? ""} ${e.astuce ?? ""}`
        .toLowerCase()
        .includes(t),
    );
  }, [q, etapes]);

  const total = etapes.length;
  const nbFait = etapes.filter((e) => fait[e.id]).length;
  const pct = total === 0 ? 0 : Math.round((nbFait / total) * 100);

  const basculerFait = (id: string) =>
    setFait((f) => ({ ...f, [id]: !f[id] }));

  const basculerOuvert = (id: string) =>
    setOuverts((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  return (
    <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-primary">
          <Compass size={15} />
          Pas-à-pas interactif
        </div>
        <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
          <span>
            {nbFait} / {total} étapes réalisées
          </span>
          <span className="font-bold text-primary">{pct} %</span>
        </div>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une étape…"
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setFait({});
            setOuverts([]);
            setQ("");
          }}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RotateCcw size={12} />
          Réinitialiser la progression
        </button>
      </div>

      {visibles.length === 0 ? (
        <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-8 text-center">
          <Search size={24} className="mb-2 opacity-40" />
          <p className="text-sm font-medium text-foreground">Aucune étape trouvée</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Essayez d&apos;autres mots-clés ou videz la recherche.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {visibles.map((e, i) => {
            const estFait = !!fait[e.id];
            const estOuvert = ouverts.includes(e.id);
            return (
              <div
                key={e.id}
                className={`overflow-hidden rounded-xl border transition-colors ${
                  estFait ? "border-success/30 bg-success/5" : "border-border bg-card"
                }`}
              >
                <div className="flex items-stretch">
                  <button
                    type="button"
                    aria-label={estFait ? `Marquer à refaire : ${e.titre}` : `Marquer comme fait : ${e.titre}`}
                    onClick={() => basculerFait(e.id)}
                    className="flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {estFait ? (
                      <CheckCircle2 size={18} className="text-success" />
                    ) : (
                      <Circle size={18} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => basculerOuvert(e.id)}
                    className="flex flex-1 items-center justify-between gap-3 py-3 pr-3 text-left"
                  >
                    <div className="min-w-0">
                      <div
                        className={`text-sm font-semibold text-foreground ${
                          estFait ? "line-through opacity-70" : ""
                        }`}
                      >
                        <span className="mr-2 text-xs font-bold text-primary">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {e.titre}
                      </div>
                      {e.ou && (
                        <p className="mt-0.5 text-xs text-muted-foreground">Où : {e.ou}</p>
                      )}
                    </div>
                    {estOuvert ? (
                      <ChevronDown size={15} className="shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight size={15} className="shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </div>

                {estOuvert && (
                  <div className="space-y-3 border-t border-border px-4 py-4 pl-12 text-sm">
                    {e.quoi && e.quoi.length > 0 && (
                      <ol className="list-decimal space-y-1 pl-4 text-foreground">
                        {e.quoi.map((s, j) => (
                          <li key={j}>{s}</li>
                        ))}
                      </ol>
                    )}
                    {e.attendu && (
                      <p className="flex items-start gap-2 rounded-lg bg-success/5 px-3 py-2 text-success-foreground">
                        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" />
                        <span>
                          <strong>Le contrôle est réussi si :</strong> {e.attendu}
                        </span>
                      </p>
                    )}
                    {e.astuce && (
                      <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-foreground">
                        <strong>Astuce :</strong> {e.astuce}
                      </p>
                    )}
                    {e.route && (
                      <Link
                        href={e.route}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                      >
                        <Compass size={12} className="text-primary" />
                        Aller à l&apos;écran
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
