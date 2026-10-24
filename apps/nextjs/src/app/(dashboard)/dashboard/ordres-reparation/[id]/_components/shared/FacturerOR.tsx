"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Receipt } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { useOrPermissions } from "../../../_hooks/useOrPermissions";

/**
 * Action de facturation de l'OR.
 *
 * Elle vivait dans l'en-tête permanent, avec son dialogue et ses totaux. Elle
 * est désormais dans l'onglet Facture & Restitution, seul endroit où l'on
 * décide de facturer.
 */
export function FacturerOR({ or }: { or: any }) {
  const utils = api.useUtils();
  const { flags } = useOrPermissions();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    modePaiement: "especes",
    remisePourcent: "",
    notes: "",
  });

  const facturer = api.or.facturer.useMutation({
    onSuccess: (r: any) => {
      toast.success(
        `OR facturé — ${r.reference} (${Number(r.montantTotal).toLocaleString("fr-FR")} F)`,
      );
      utils.or.getById.invalidate();
      utils.or.list.invalidate();
      utils.or.getDashboard.invalidate();
      setOpen(false);
      setForm({ modePaiement: "especes", remisePourcent: "", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  if (or.venteId) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-bold uppercase text-success-foreground">
        <Check size={11} /> Facturé
        {or.venteReference ? ` · ${or.venteReference}` : ""}
      </span>
    );
  }

  if (!flags.canFacturation || or.statut !== "PRET_A_LIVRER") return null;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5 text-xs">
        <Receipt size={14} /> Facturer l'OR
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt size={16} className="text-primary" /> Facturer l'OR {or.numero}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Total TTC :{" "}
            <b className="text-foreground">
              {Number(or.totalTTC ?? 0).toLocaleString("fr-FR")} F
            </b>
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Mode de paiement</Label>
              <select
                value={form.modePaiement}
                onChange={(e) => setForm({ ...form, modePaiement: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="especes">Espèces</option>
                <option value="om">Orange Money</option>
                <option value="momo">MTN MoMo</option>
                <option value="carte">Carte</option>
                <option value="virement">Virement</option>
                <option value="credit">Crédit (créance)</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Remise (%) — défaut : contrat ou client
              </Label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={form.remisePourcent}
                onChange={(e) => setForm({ ...form, remisePourcent: e.target.value })}
                placeholder="0"
                className="mt-1 w-full rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optionnel"
                className="mt-1 w-full rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={() =>
                facturer.mutate({
                  id: Number(or.id),
                  modePaiement: form.modePaiement as any,
                  remisePourcent: form.remisePourcent
                    ? Number(form.remisePourcent)
                    : undefined,
                  notes: form.notes || undefined,
                })
              }
              disabled={facturer.isPending}
              className="gap-2"
            >
              {facturer.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Receipt size={14} />
              )}
              Facturer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
