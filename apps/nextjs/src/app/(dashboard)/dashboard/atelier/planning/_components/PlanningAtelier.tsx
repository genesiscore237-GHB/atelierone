"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { CalendarDays, UserRound, Wrench } from "lucide-react";
import { Button } from "~/components/ui/button";
import { PRIORITE_META, STATUT_LABELS, STATUT_BADGE } from "~/server/lib/atelier-service";
import { usePermissions } from "~/hooks/usePermissions";

export function PlanningAtelier() {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();
  const { data, isLoading } = api.or.getPlanning.useQuery();
  const { data: techniciens } = api.rh.list.useQuery({ limit: 100, statut: "actif" });
  const [selTech, setSelTech] = useState<Record<number, number>>({});

  const assigner = api.or.assignerTechnicien.useMutation({
    onSuccess: () => { toast.success("Assignation mise à jour"); utils.or.getPlanning.invalidate(); utils.or.getDashboard.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const canModifier = hasPermission("or.modifier");
  const listTech = ((techniciens?.employees ?? []) as any[]).filter((e) => e.statut === "actif");
  const planning = (data ?? { parTechnicien: [], nonAssignes: [], totalParc: 0 }) as any;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <CalendarDays size={22} className="text-primary" /> Planning du jour
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Qui travaille sur quoi — règle : ne pas charger plus de 80 % de la capacité d'un technicien (marge pour les urgences P1).
        </p>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(planning.parTechnicien ?? []).map((t: any) => {
            const c = t.charge;
            return (
              <div key={t.technicien.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UserRound size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{t.technicien.prenom} {t.technicien.nom}</p>
                      <p className="text-[10px] text-muted-foreground">{t.technicien.fonction}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-black ${c.depassement80 ? "text-destructive" : "text-success-foreground"}`}>{c.pourcent} %</span>
                    <p className="text-[10px] text-muted-foreground">charge ({c.actifs}/5)</p>
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${c.depassement80 ? "bg-destructive" : "bg-success"}`} style={{ width: `${Math.min(c.pourcent, 100)}%` }} />
                </div>
                <div className="mt-3 space-y-2">
                  {t.vehicules.length === 0 && <p className="text-sm text-muted-foreground">Aucun véhicule assigné.</p>}
                  {t.vehicules.map((o: any) => (
                    <div key={o.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold">{o.immatriculation}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${PRIORITE_META[o.priorite]?.badge}`}>{o.priorite}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${STATUT_BADGE[o.statut] ?? "bg-muted"}`}>{STATUT_LABELS[o.statut] ?? o.statut}</span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {o.numero} · {o.clientRaisonSociale ?? `${o.clientPrenom ?? ""} ${o.clientNom ?? ""}`} · {o.plainte ?? "—"}
                        </p>
                        {o.raisonBlocage && <p className="text-[10px] text-destructive">⛔ {o.raisonBlocage}</p>}
                      </div>
                      {canModifier && (
                        <select
                          value=""
                          onChange={(e) => e.target.value && assigner.mutate({ id: o.id, technicienId: Number(e.target.value), commentaire: "Assignation depuis le planning" })}
                          className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none"
                        >
                          <option value="">Réassigner…</option>
                          {listTech.map((te: any) => <option key={te.id} value={te.id} className="bg-background">{te.prenom} {te.nom}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Non assignés */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <Wrench size={14} className="text-primary" /> Non assignés — file d'attente
        </div>
        {(planning.nonAssignes ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Tous les véhicules ont un responsable.</p>
        ) : (
          <div className="space-y-2">
            {(planning.nonAssignes ?? []).map((o: any) => (
              <div key={o.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold">{o.immatriculation}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${PRIORITE_META[o.priorite]?.badge}`}>{o.priorite}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${STATUT_BADGE[o.statut] ?? "bg-muted"}`}>{STATUT_LABELS[o.statut] ?? o.statut}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{o.numero} · {o.clientRaisonSociale ?? `${o.clientPrenom ?? ""} ${o.clientNom ?? ""}`} · {o.plainte ?? "—"}</p>
                </div>
                {canModifier && (
                  <select
                    value=""
                    onChange={(e) => e.target.value && assigner.mutate({ id: o.id, technicienId: Number(e.target.value), commentaire: "Assignation depuis le planning" })}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none"
                  >
                    <option value="">Assigner…</option>
                    {listTech.map((te: any) => <option key={te.id} value={te.id} className="bg-background">{te.prenom} {te.nom}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}