"use client";

import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { STATUT_LABELS } from "~/server/lib/atelier-service";
import {
  CANAL_LABELS,
  RECLAMATION_LABELS,
  type CanalReponse,
  type ReclamationStatut,
} from "~/lib/suivi-relation";

function libelleEvenement(h: any): string {
  if (h.type === "REPONSE_CLIENT") {
    return `Première réponse : ${CANAL_LABELS[h.nouvelleValeur as CanalReponse] ?? h.nouvelleValeur ?? "—"}`;
  }
  if (h.type === "RECLAMATION") {
    return `Réclamation : ${RECLAMATION_LABELS[h.nouvelleValeur as ReclamationStatut] ?? h.nouvelleValeur ?? "—"}`;
  }
  if (h.type === "PRIORITE") return `${h.ancienneValeur ?? "—"} → ${h.nouvelleValeur}`;
  if (h.type === "RESPONSABLE") {
    return `Technicien #${h.ancienneValeur ?? "non assigné"} → #${h.nouvelleValeur ?? "non assigné"}`;
  }
  return `${STATUT_LABELS[h.ancienneValeur ?? ""] ?? h.ancienneValeur ?? "—"} → ${STATUT_LABELS[h.nouvelleValeur ?? ""] ?? h.nouvelleValeur}`;
}

interface TimelineProps {
  historique: any[];
  showHeader?: boolean;
  listClassName?: string;
}

/** Historique du cycle de vie d'un OR (timeline). */
export function Timeline({
  historique,
  showHeader = true,
  listClassName = "max-h-72",
}: TimelineProps) {
  if (!historique || historique.length === 0) {
    if (!showHeader) {
      return (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aucun événement enregistré.
        </p>
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
          <p className="py-4 text-center text-sm text-muted-foreground">
            Aucun changement enregistré.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={showHeader ? undefined : "border-0 bg-transparent shadow-none"}>
      {showHeader && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wider">
            <History size={14} className="text-primary" /> Historique du cycle de vie
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={showHeader ? undefined : "p-0"}>
        <div className={`${listClassName} space-y-1.5 overflow-y-auto pr-1`}>
          {historique.map((h: any) => (
            <div key={h.id} className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
              <span
                className={`mt-0.5 w-20 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[9px] font-black uppercase ${
                  h.type === "STATUT"
                    ? "bg-primary/10 text-primary"
                    : h.type === "PRIORITE"
                      ? "bg-warning/10 text-warning-foreground"
                      : h.type === "RESPONSABLE"
                        ? "bg-sky-500/10 text-sky-400"
                        : h.type === "REPONSE_CLIENT"
                          ? "bg-sky-500/10 text-sky-400"
                          : h.type === "RECLAMATION"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground"
                }`}
              >
                {h.type === "REPONSE_CLIENT"
                  ? "RÉPONSE"
                  : h.type === "RECLAMATION"
                    ? "RÉCLAM."
                    : h.type}
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-foreground">{libelleEvenement(h)}</span>
                {h.commentaire && (
                  <span className="ml-2 text-muted-foreground">· {h.commentaire}</span>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {new Date(h.changeLe).toLocaleString("fr-FR")}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
