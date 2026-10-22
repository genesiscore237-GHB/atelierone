"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { ErrorState } from "~/components/ui/error-state";
import { Loader2, ArrowRight } from "lucide-react";
import { STATUT_LABELS } from "~/server/lib/vehicule-service";
import { STATUT_LABELS as OR_STATUT_LABELS } from "~/server/lib/atelier-service";

const DIAGNOSTIC_LABELS: Record<string, string> = {
  BROUILLON: "Brouillon",
  SOUMIS: "Soumis",
  VALIDE: "Validé",
  REJETE: "Rejeté",
};

const PRIORITE_STYLE: Record<string, string> = {
  P1: "bg-destructive/10 text-destructive",
  P2: "bg-warning/10 text-warning-foreground",
  P3: "bg-success/10 text-success-foreground",
};

function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR");
}

export function RevueVehicules({ q }: { q?: string }) {
  const [traines, setTraines] = useState(false);

  const { data: revue, isLoading, isError, error, refetch } = api.revueParc.file.useQuery({
    q: q?.trim() || undefined,
    traines: traines || undefined,
    limite: 200,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Chargement de la revue…
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        message={error?.message ?? "Impossible de charger la revue du parc."}
        retryAction={() => void refetch()}
      />
    );
  }

  const lignes = revue ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {lignes.length} véhicule(s) · triés par ce qui bloque, puis par retard et priorité
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setTraines((v) => !v)}
          className={`ml-auto text-xs ${traines ? "text-warning-foreground" : "text-muted-foreground"}`}
        >
          {traines ? "Tout afficher" : "Ça traîne"}
        </Button>
      </div>

      {lignes.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {traines ? "Aucun véhicule ne traîne." : "Aucun véhicule à réviser."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Plaque</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Phase</th>
                <th className="px-3 py-2">Panne déclarée</th>
                <th className="px-3 py-2">Diagnostic</th>
                <th className="px-3 py-2">Devis</th>
                <th className="px-3 py-2">Ce qui bloque</th>
                <th className="px-3 py-2">Dernier constat</th>
                <th className="px-3 py-2">Technicien</th>
                <th className="px-3 py-2">Priorité</th>
                <th className="px-3 py-2">Jours / promesse</th>
                <th className="px-3 py-2 text-right">Fiche</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((r) => {
                const phase = STATUT_LABELS[r.phase] ?? OR_STATUT_LABELS[r.phase] ?? r.phase;
                const constat = r.dernierConstat;
                const constatTexte = constat?.constat ?? constat?.intervention ?? constat?.suite ?? null;

                return (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 align-top last:border-0 transition-colors hover:bg-muted/40"
                  >
                    <td className="px-3 py-2">
                      <div className="font-mono font-semibold text-foreground">
                        {r.immatriculation ?? "Sans plaque"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">n° {r.numRegistre}</div>
                    </td>
                    <td className="px-3 py-2">{r.clientNom ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                        {phase}
                      </span>
                    </td>
                    <td className="max-w-[180px] px-3 py-2">
                      <span className="line-clamp-2" title={r.pannesDeclarees ?? undefined}>
                        {r.pannesDeclarees ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {r.diagnosticStatut ? (
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            r.diagnosticStatut === "VALIDE"
                              ? "bg-success/10 text-success-foreground"
                              : r.diagnosticStatut === "REJETE"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {DIAGNOSTIC_LABELS[r.diagnosticStatut] ?? r.diagnosticStatut}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.devisAccepte === true ? "Accepté" : r.devisAccepte === false ? "Refusé" : "—"}
                    </td>
                    <td className="max-w-[240px] px-3 py-2">
                      {r.bloquePar ? (
                        <span className="font-medium text-warning-foreground" title={r.bloquePar}>
                          {r.bloquePar}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="max-w-[220px] px-3 py-2">
                      {constatTexte ? (
                        <>
                          <span className="line-clamp-2" title={constatTexte}>
                            {constatTexte}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {constat?.libelle ?? ""}
                            {constat?.createdAt ? ` · ${fmtDate(constat.createdAt)}` : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.technicien ?? "—"}</td>
                    <td className="px-3 py-2">
                      {r.priorite ? (
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-black ${
                            PRIORITE_STYLE[r.priorite] ?? "bg-muted text-muted-foreground"
                          }`}
                        >
                          {r.priorite}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-foreground">
                        {r.jours != null ? `${r.jours} j` : "—"}
                      </div>
                      {r.datePromesse && (
                        <div className="text-[10px] text-muted-foreground">
                          promesse {fmtDate(r.datePromesse)}
                        </div>
                      )}
                      {r.enRetard && (
                        <div className="text-[10px] font-semibold text-destructive">
                          retard {r.retardJours ?? "?"} j
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.vehiculeId != null ? (
                        <Button size="sm" variant="outline" asChild className="text-xs">
                          <Link href={`/dashboard/garage/vehicules/${r.vehiculeId}`}>
                            Voir <ArrowRight size={13} className="ml-1" />
                          </Link>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default RevueVehicules;
