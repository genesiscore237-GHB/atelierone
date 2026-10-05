"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Car, Receipt, Check, Loader2 } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import {
  ALERTE_META,
} from "~/server/lib/atelier-service";
import { useOrPermissions } from "../../_hooks/useOrPermissions";
import { StatutBadge } from "./shared/StatutBadge";
import { PrioriteBadge } from "./shared/PrioriteBadge";
import { StatutSelector } from "./shared/StatutSelector";
import { PrioriteSelector } from "./shared/PrioriteSelector";
import { TechnicienSelector } from "./shared/TechnicienSelector";

/** En-tête de la fiche OR : identité, dates, tuiles financières, actions globales. */
export function OrHeader({ or, employes }: { or: any; employes: any[] }) {
  const utils = api.useUtils();
  const { flags } = useOrPermissions();
  const [showFacture, setShowFacture] = useState(false);
  const [factureForm, setFactureForm] = useState({ modePaiement: "especes", remisePourcent: "", notes: "" });

  const facturer = api.or.facturer.useMutation({
    onSuccess: (r: any) => {
      toast.success(`OR facturé — ${r.reference} (${Number(r.montantTotal).toLocaleString("fr-FR")} F)`);
      utils.or.getById.invalidate();
      utils.or.list.invalidate();
      setShowFacture(false);
      setFactureForm({ modePaiement: "especes", remisePourcent: "", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const id = Number(or.id);
  const hasAlerte = or.alerte && or.alerte !== "OK";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard/ordres-reparation" className="mr-1 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft size={14} /> Liste
            </Link>
            <h2 className="text-lg font-bold text-foreground">OR {or.numero}</h2>
            <PrioriteBadge priorite={or.priorite} />
            <StatutBadge statut={or.statut} />
            {hasAlerte && (
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${ALERTE_META[or.alerte]?.badge ?? ""}`}>
                {ALERTE_META[or.alerte]?.libelle ?? or.alerte}
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            <Car size={12} className="inline" /> {or.immatriculation} — {or.marque} {or.modele}
            {or.clientPrenom && <> · Client : {or.clientPrenom} {or.clientNom}</>}
          </p>
          {or.plainte && <p className="mt-1 text-sm">Plainte : <span className="text-foreground/80">{or.plainte}</span></p>}

          <p className="mt-1 text-xs text-muted-foreground">
            Entrée : {or.dateOuverture ? new Date(or.dateOuverture).toLocaleDateString("fr-FR") : "—"}
            {or.datePromesse && <> · Promesse : {new Date(or.datePromesse).toLocaleDateString("fr-FR")}</>}
            {or.joursImmobilisation !== undefined && <> · Immobilisation : <b className="text-warning-foreground">{or.joursImmobilisation} j</b></>}
            {or.retardJours > 0 && <> · <b className="text-destructive">Retard {or.retardJours} j</b></>}
            {or.emplacement && <> · {or.emplacement}</>}
          </p>

          {or.raisonBlocage && (
            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-destructive">
              <span className="inline-block size-1.5 rounded-full bg-destructive" /> Bloqué : {or.raisonBlocage}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <StatutSelector or={or} id={id} />
            <PrioriteSelector or={or} id={id} />
          </div>
          <TechnicienSelector or={or} employes={employes} />
          <div className="flex items-center gap-2">
            {flags.canFacturation && or.statut === "PRET_A_LIVRER" && !or.venteId && (
              <Button onClick={() => setShowFacture(true)} className="gap-1.5 text-xs">
                <Receipt size={14} /> Facturer
              </Button>
            )}
            {or.venteId && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-bold uppercase text-success-foreground">
                <Check size={11} /> Facturé
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-muted/50 p-2"><span className="text-muted-foreground">Pièces : </span><b>{Number(or.totalPieces ?? 0).toLocaleString("fr-FR")} F</b></div>
        <div className="rounded-lg bg-muted/50 p-2"><span className="text-muted-foreground">Main d'œuvre : </span><b>{Number(or.totalMainOeuvre ?? 0).toLocaleString("fr-FR")} F</b></div>
        <div className="rounded-lg bg-primary/10 p-2"><span className="text-muted-foreground">Total TTC : </span><b>{Number(or.totalTTC ?? 0).toLocaleString("fr-FR")} F</b></div>
      </div>

      {showFacture && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowFacture(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt size={16} className="text-primary" /> Facturer l'OR {or.numero}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Total TTC : <b className="text-foreground">{Number(or.totalTTC).toLocaleString("fr-FR")} F</b>
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Mode de paiement</Label>
                <select value={factureForm.modePaiement} onChange={(e) => setFactureForm({ ...factureForm, modePaiement: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="especes">Espèces</option>
                  <option value="om">Orange Money</option>
                  <option value="momo">MTN MoMo</option>
                  <option value="carte">Carte</option>
                  <option value="virement">Virement</option>
                  <option value="credit">Crédit (créance)</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Remise (%) — défaut : contrat ou client</Label>
                <input
                  type="number" min={0} max={100} step="0.5"
                  value={factureForm.remisePourcent}
                  onChange={(e) => setFactureForm({ ...factureForm, remisePourcent: e.target.value })}
                  placeholder="0"
                  className="mt-1 w-full rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <input
                  value={factureForm.notes}
                  onChange={(e) => setFactureForm({ ...factureForm, notes: e.target.value })}
                  placeholder="Optionnel"
                  className="mt-1 w-full rounded-lg border border-border bg-accent/30 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowFacture(false)}>Annuler</Button>
              <Button
                onClick={() => facturer.mutate({
                  id,
                  modePaiement: factureForm.modePaiement as any,
                  remisePourcent: factureForm.remisePourcent ? Number(factureForm.remisePourcent) : undefined,
                  notes: factureForm.notes || undefined,
                })}
                disabled={facturer.isPending}
                className="gap-2"
              >
                {facturer.isPending ? <Loader2 className="size-4 animate-spin" /> : <Receipt size={14} />}
                Facturer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
