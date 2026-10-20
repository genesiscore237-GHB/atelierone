"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { ChevronDown, ChevronUp, Clock, Wrench, AlertTriangle, Calendar, Car } from "lucide-react";

export function RevueVehicules() {
  const [mode, setMode] = useState<"vehicules" | "restitution">("revue");
  const [traines, setTraines] = useState(false);
  const [q, setQ] = useState("");

  const { data: revue, isLoading } = api.revueParc.file.useQuery(
    { q: q || undefined, traines: traines || undefined, limite: 200 },
    { enabled: mode === "revue" },
  );

  if (mode === "registre") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button size="sm" onClick={() => setMode("revue")} variant="outline">
          Passer en vue revue
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Chargement de la revue…</div>;
  }

  if (!revue || revue.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {traines ? "Aucun véhicule ne traîne." : "Aucun véhicule à réviser."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
          Revue du parc
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTraines((v) => !v)}
            className={`text-xs ${traines ? "text-warning-foreground" : "text-muted-foreground"}`}
          >
            {traines ? "Tout afficher" : "Ça traîne"}
          </Button>
          <button
            type="button"
            onClick={() => setMode("registre")}
            className="text-xs text-muted-foreground hover:bg-accent rounded px-2 py-1"
          >
            Voir le registre
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2">Plaque</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Position</th>
              <th className="px-3 py-2">Alertes</th>
              <th className="px-3 py-2">Entrée</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {revue.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/40">
                <td className="px-3 py-2 font-mono font-semibold text-foreground">
                  {r.immatriculation ?? r.numRegistre ?? "—"}
                </td>
                <td className="px-3 py-2">{r.clientNom ?? "—"}</td>
                <td className="px-3 py-2">{r.statut}</td>
                <td className="px-3 py-2">{r.site}</td>
                <td className="px-3 py-2">{r.zone}</td>
                <td className="px-3 py-2">{r.alertes}</td>
                <td className="px-3 py-2">{r.dateEntree}</td>
                <td className="px-3 py-2">
                  <Button size="sm" variant="outline" className="text-xs">
                    Voir
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RevueVehicules;
