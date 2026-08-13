"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { ArrowLeft, Sparkles, BookOpen, Package, TrendingUp, AlertTriangle } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { AchalandageTable } from "../_components/AchalandageTable";

type SuiviLigne = {
  emplacementId: string;
  code: string;
  libelle: string;
  produitsRequis: number;
  quantiteCible: number;
  enRayon: number;
  enStock: number;
  couverture: number;
  completude: number;
};

type Kit = {
  emplacementId: string;
  code: string;
  libelle: string;
  sousSysteme: string | null;
  niveau: string | null;
  classe: string | null;
  produitsRequis: number;
  quantiteCible: number;
};

function CouvertureBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums">{Math.round(value)}%</span>
    </div>
  );
}

export default function AchalandagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emplacementParam = searchParams.get("emplacementId");

  const { data: suivi, isLoading } = api.rayons.suivi.useQuery();
  const { data: kits } = api.rayons.kitsRentree.useQuery({});

  const [selected, setSelected] = useState<{ id: number; libelle: string; code: string } | null>(() => {
    if (emplacementParam) {
      return { id: Number(emplacementParam), libelle: "", code: "" };
    }
    return null;
  });

  const kitByEmplacement = useMemo(() => {
    const m = new Map<string, Kit>();
    for (const k of kits?.kits ?? []) m.set(k.emplacementId, k);
    return m;
  }, [kits]);

  const lignes: SuiviLigne[] = suivi?.parEtagere ?? [];
  const resume = suivi?.resume;

  function ouvrir(l: SuiviLigne) {
    const kit = kitByEmplacement.get(l.emplacementId);
    setSelected({
      id: Number(l.emplacementId),
      libelle: kit?.libelle ?? l.libelle,
      code: l.code,
    });
  }

  const statCards = [
    { label: "Étagères-classe", value: resume?.etageresClasse ?? 0, icon: BookOpen },
    { label: "Produits requis", value: resume?.produitsRequis ?? 0, icon: Package },
    { label: "Unités en rayon", value: resume?.enRayon ?? 0, icon: TrendingUp },
    { label: "Couverture moyenne", value: `${Math.round(resume?.couvertureMoyenne ?? 0)}%`, icon: Sparkles, danger: (resume?.couvertureMoyenne ?? 0) < 50 },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            onClick={() => router.push("/dashboard/stock/rayons")}
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Retour aux rayons
          </button>
          <h1 className="text-xl font-semibold text-foreground">Achalandage rentrée</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Suivi des étagères-classe : requis vs en rayon, couverture et mise en rayon
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <c.icon className={`size-4 ${c.danger ? "text-destructive" : "text-muted-foreground/60"}`} />
            </div>
            <p className={`mt-1.5 text-2xl font-semibold ${c.danger ? "text-destructive" : "text-foreground"}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg bg-muted" />
          ))}
        </div>
      ) : lignes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <Sparkles className="size-10 text-muted-foreground" />
          <h3 className="mt-4 text-base font-medium text-foreground">Aucune étagère-classe</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Les étagères-classe apparaîtront ici dès qu'une étagère est liée à une classe du référentiel éducatif.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Étagère</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Classe</th>
                <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Requis</th>
                <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">En rayon</th>
                <th className="px-4 py-3 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Couverture</th>
                <th className="px-4 py-3 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Complétude</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lignes.map((l) => {
                const kit = kitByEmplacement.get(l.emplacementId);
                const aligne = l.couverture >= 100;
                const alerte = l.couverture < 50 && l.produitsRequis > 0;
                return (
                  <tr key={l.emplacementId} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="block text-sm font-medium text-foreground">{kit?.libelle ?? l.libelle}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{l.code}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {kit?.sousSysteme && (
                        <span className="mr-1.5 inline-flex rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{kit.sousSysteme}</span>
                      )}
                      {kit?.classe ?? "—"}
                      {kit?.niveau && <span className="ml-1.5 text-xs text-muted-foreground">({kit.niveau})</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{l.produitsRequis}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{l.enRayon}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <CouvertureBar
                          value={l.couverture}
                          color={aligne ? "bg-emerald-500" : alerte ? "bg-destructive" : "bg-amber-500"}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-sm tabular-nums text-muted-foreground">{Math.round(l.completude)}%</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => ouvrir(l)}>
                        {alerte && <AlertTriangle className="size-3.5 text-destructive" />}
                        Détails
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <AchalandageTable
          emplacementId={selected.id}
          libelle={selected.libelle || "Étagère"}
          code={selected.code}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
