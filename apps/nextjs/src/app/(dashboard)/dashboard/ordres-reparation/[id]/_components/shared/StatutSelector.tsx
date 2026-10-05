"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import {
  STATUTS_ATELIER,
  STATUT_LABELS,
  transitionStatutAtelierValide,
} from "~/server/lib/atelier-service";

/**
 * Sélecteur de statut avec raison obligatoire pour BLOQUE / ANNULE.
 * Affiche explicitement "notre statut" et les transitions autorisées uniquement.
 */
export function StatutSelector({ or, id }: { or: any; id: number }) {
  const utils = api.useUtils();
  const [showRaison, setShowRaison] = useState<string | null>(null);
  const [raison, setRaison] = useState("");

  const changerStatut = api.or.changerStatut.useMutation({
    onSuccess: () => {
      toast.success("Statut mis à jour");
      utils.or.getById.invalidate();
      utils.or.list.invalidate();
      setShowRaison(null);
      setRaison("");
    },
    onError: (e) => toast.error(e.message),
  });

  const transitions = STATUTS_ATELIER.filter((s) => s !== or.statut && transitionStatutAtelierValide(or.statut, s).ok);
  const besoinRaison = (s: string) => s === "BLOQUE" || s === "ANNULE";

  return (
    <div className="flex items-center gap-1">
      <select
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        value=""
        onChange={(e) => {
          const s = e.target.value;
          if (!s) return;
          if (besoinRaison(s)) { setShowRaison(s); setRaison(""); }
          else changerStatut.mutate({ id, nouveauStatut: s as any, commentaire: undefined });
        }}
      >
        <option value="">Statut : {STATUT_LABELS[or.statut] ?? or.statut}…</option>
        {transitions.length === 0 && <option value="" disabled>— aucune transition disponible —</option>}
        {transitions.map((s) => (
          <option key={s} value={s} className="bg-background">{STATUT_LABELS[s]}</option>
        ))}
      </select>

      {showRaison && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowRaison(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-destructive" />
                {showRaison === "BLOQUE" ? "Bloquer ce véhicule" : "Annuler cet OR"}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              La raison est obligatoire pour {STATUT_LABELS[showRaison]}.
            </p>
            <div className="mt-3">
              <Label className="text-xs text-muted-foreground">Raison</Label>
              <textarea
                value={raison}
                onChange={(e) => setRaison(e.target.value)}
                placeholder={showRaison === "BLOQUE" ? "Pièces manquantes, validation client…" : "Motif de l'annulation"}
                className="mt-1 w-full rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRaison(null)}>Annuler</Button>
              <Button
                className={showRaison === "BLOQUE" ? "bg-destructive text-destructive-foreground" : ""}
                disabled={raison.trim().length < 3 || changerStatut.isPending}
                onClick={() => changerStatut.mutate({ id, nouveauStatut: showRaison as any, raison: raison.trim(), commentaire: raison.trim() })}
              >
                Confirmer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
