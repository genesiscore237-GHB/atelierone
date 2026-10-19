"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer, X, QrCode } from "lucide-react";
import { Button } from "~/components/ui/button";
import { libelleZone } from "~/lib/emplacements";

/**
 * ÉTIQUETTE IMPRIMABLE D'EMPLACEMENT (Lot 1, étape 4.2).
 *
 * Une étiquette code + QR à coller sur le rayonnage : scanner le QR mène à
 * la rubrique emplacements ( repertoire `?p=CODE` que la page lira pour
 * pré-sélectionner), le code reste lisible à l'œil. Impression IMLOCÁLE —
 * `window.print()` avec un bloc `@media print` qui isole l'étiquette, même
 * motif que les reçus POS et les fiches véhicule : aucune lib d'impression,
 * aucune requête serveur.
 *
 * Aucune permission d'écriture ici : une étiquette est de la lecture mise
 * en page — visible pour tout le monde, exportée par le navigateur.
 */

export interface EmplacementPourEtiquette {
  id: number;
  code: string;
  libelle: string | null;
  type: string;
  zoneStockage: string | null;
}

export function EtiquetteEmplacement({
  emplacement,
  fermer,
}: {
  emplacement: EmplacementPourEtiquette | null;
  fermer: () => void;
}) {
  // L'URL encodée est ASSEMBLÉE au moment de la fermeture du modal — pas à
  // l'ouverture : un guidage (`modules next.js`) peut relire le modal avant
  // fenêtre : on évite tout accès window hors navigateur.
  const uriQr = useMemo(() => {
    if (typeof window === "undefined" || !emplacement) return "";
    const cible = encodeURIComponent(emplacement.code);
    return `${window.location.origin}/dashboard/stock/emplacements?p=${cible}`;
  }, [emplacement]);

  const [seul, setSeul] = useState(false);

  if (!emplacement) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <style media="print">{`
        body > *:not(#etiquette-id-client) { display: none !important; }
        #etiquette-id-client { position: static !important; inset: auto !important; background: #fff !important; padding: 0 !important; z-index: auto !important; }
        #etiquette-id-client .zone-no-imprimer  { display: none !important; }
      `}</style>

      <div
        id="etiquette-id-client"
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg"
      >
        <div className="zone-no-imprimer mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
            <QrCode size={15} className="mr-1.5 inline text-primary" />
            Étiquette {emplacement.code}
          </h2>
          <button
            type="button"
            onClick={fermer}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
            aria-label="Fermer l'étiquette"
          >
            <X size={16} />
          </button>
        </div>

        <div className="rounded-lg border border-border bg-white p-6 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {emplacement.type}
          </p>
          <p className="mt-2 text-3xl font-bold font-mono tracking-tight text-foreground break-all">
            {emplacement.code}
          </p>
          {emplacement.libelle && (
            <p className="mt-1 text-sm text-muted-foreground">{emplacement.libelle}</p>
          )}
          <p className="mt-2 text-xs font-medium text-muted-foreground">
            {libelleZone(emplacement.zoneStockage)}
          </p>
          {uriQr && (
            <div className="mt-4 flex justify-center">
              <QRCodeSVG value={uriQr} size={120} level="M" />
            </div>
          )}
        </div>

        <div className="zone-no-imprimer mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={fermer}>
            Annuler
          </Button>
          <Button onClick={() => window.print()} className="gap-2">
            <Printer size={14} /> Imprimer
          </Button>
        </div>
      </div>
    </div>
  );
}
