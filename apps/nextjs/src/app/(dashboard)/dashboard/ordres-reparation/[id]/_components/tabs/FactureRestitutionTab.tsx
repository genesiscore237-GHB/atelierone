"use client";

/**
 * Onglet 7 — Facture & Restitution : synthèse, accusé de réception, restitution.
 *
 * ÉTAPE 4 : la RESTITUTION a été extraite vers `~/components/or/RestituerVehicule`
 * pour être partagée avec la 360 du véhicule. Ce fichier ne garde que ce qui est
 * propre au dossier — la synthèse financière et l'accusé de réception.
 *
 * Pourquoi ne pas avoir simplement copié le formulaire ici ?
 *
 * Deux formulaires de restitution qui divergent donnent deux réponses à « le
 * véhicule est-il parti avec le plein ? », et l'une des deux aura tort sans
 * qu'on le sache. La réception a déjà divergé une fois entre ses deux écrans :
 * le risque n'est pas théorique.
 */

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { ReceiptText, ClipboardCopy, MessageCircle, CheckCircle2 } from "lucide-react";
import { RestituerVehicule } from "~/components/or/RestituerVehicule";
import { FacturerOR } from "../shared/FacturerOR";

/** Onglet 7 — Facture & Restitution : synthèse, accusé de réception, restitution. */
export function FactureRestitutionTab({ or }: { or: any }) {
  const id = Number(or.id);
  const { data: ar } = api.or.accuseReception.useQuery({ orId: id });
  const [copie, setCopie] = useState(false);

  const totalPieces = Number(or.totalPieces ?? 0);
  const totalMO = Number(or.totalMainOeuvre ?? 0);
  const totalTTC = Number(or.totalTTC ?? 0);
  const dejaFacture = Number(or.totalFacture ?? (or.venteId ? totalTTC : 0));
  const resteAFacturer = Math.max(0, totalTTC - dejaFacture);

  const copierAccuse = () => {
    const texte = ar?.texte ?? "";
    navigator.clipboard?.writeText(texte).then(() => {
      setCopie(true);
      toast.success("Accusé copié dans le presse-papier");
      setTimeout(() => setCopie(false), 2000);
    }).catch(() => toast.error("Copie impossible"));
  };
  const whatsapp = () => {
    const texte = encodeURIComponent(ar?.texte ?? "");
    window.open(`https://wa.me/?text=${texte}`, "_blank");
  };

  return (
    <div className="space-y-4">
      {/* ─── Synthèse financière ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <ReceiptText size={15} className="text-primary" /> Synthèse financière
          </h3>
          <FacturerOR or={or} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <div className="rounded-lg bg-muted/50 p-2"><span className="text-muted-foreground">Pièces : </span><b>{totalPieces.toLocaleString("fr-FR")} F</b></div>
          <div className="rounded-lg bg-muted/50 p-2"><span className="text-muted-foreground">Main d'œuvre : </span><b>{totalMO.toLocaleString("fr-FR")} F</b></div>
          <div className="rounded-lg bg-primary/10 p-2"><span className="text-muted-foreground">Total TTC : </span><b>{totalTTC.toLocaleString("fr-FR")} F</b></div>
          <div className="rounded-lg bg-muted/50 p-2"><span className="text-muted-foreground">Déjà facturé : </span><b>{dejaFacture.toLocaleString("fr-FR")} F</b></div>
          <div className="rounded-lg bg-success/10 p-2"><span className="text-muted-foreground">Reste à facturer : </span><b className="text-success-foreground">{resteAFacturer.toLocaleString("fr-FR")} F</b></div>
        </div>
      </div>

      {/* ─── Accusé de réception ─── */}
      {ar?.texte && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <ClipboardCopy size={15} className="text-primary" /> Accusé de réception
          </h3>
          <p className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">{ar.texte}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={copierAccuse}>
              {copie ? <CheckCircle2 size={13} /> : <ClipboardCopy size={13} />}
              {copie ? "Copié !" : "Copier"}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={whatsapp}>
              <MessageCircle size={13} /> Envoyer sur WhatsApp
            </Button>
          </div>
        </div>
      )}

      {/* ─── Restitution, clôture, historique — panneau PARTAGÉ ─── */}
      <RestituerVehicule or={or} />
    </div>
  );
}