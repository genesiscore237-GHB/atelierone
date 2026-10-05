"use client";

import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { STATUT_LABELS } from "~/server/lib/atelier-service";

/** Historique du cycle de vie d'un OR (timeline). */
export function Timeline({ historique }: { historique: any[] }) {
  if (!historique || historique.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wider">
            <History size={14} className="text-primary" /> Historique du cycle de vie
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center text-sm text-muted-foreground">Aucun changement enregistré.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wider">
          <History size={14} className="text-primary" /> Historique du cycle de vie
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {historique.map((h: any) => (
            <div key={h.id} className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
              <span className={`mt-0.5 w-20 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[9px] font-black uppercase ${
                h.type === "STATUT" ? "bg-primary/10 text-primary" : h.type === "PRIORITE" ? "bg-warning/10 text-warning-foreground" : h.type === "RESPONSABLE" ? "bg-sky-500/10 text-sky-400" : "bg-muted text-muted-foreground"
              }`}>{h.type}</span>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-foreground">
                  {h.type === "PRIORITE"
                    ? `${h.ancienneValeur ?? "—"} → ${h.nouvelleValeur}`
                    : h.type === "RESPONSABLE"
                      ? `Technicien #${h.ancienneValeur ?? "non assigné"} → #${h.nouvelleValeur ?? "non assigné"}`
                      : `${STATUT_LABELS[h.ancienneValeur ?? ""] ?? h.ancienneValeur ?? "—"} → ${STATUT_LABELS[h.nouvelleValeur ?? ""] ?? h.nouvelleValeur}`}
                </span>
                {h.commentaire && <span className="ml-2 text-muted-foreground">· {h.commentaire}</span>}
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(h.changeLe).toLocaleString("fr-FR")}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
