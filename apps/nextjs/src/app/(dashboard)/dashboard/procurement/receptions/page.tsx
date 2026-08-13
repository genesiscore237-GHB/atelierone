"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ClipboardList, CheckCircle, XCircle, AlertTriangle, Eye, ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "~/hooks/usePermissions";

type Reception = {
  id: string;
  reference: string;
  statut: string;
  achatId: string;
  fournisseurId: string;
  notes: string | null;
  receptionnePar: string | null;
  createdAt: Date | null;
};

export default function ReceptionsPage() {
  const { hasPermission } = usePermissions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [motifRejet, setMotifRejet] = useState("");
  const [notesControle, setNotesControle] = useState("");
  const [actionTab, setActionTab] = useState<"controle" | "historique">("controle");

  const utils = api.useUtils();
  const { data: receptions } = api.procurement.listReceptions.useQuery();
  const { data: selectedReception } = api.procurement.getReception.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );

  const validerMutation = api.procurement.validerReception.useMutation({
    onSuccess: () => {
      utils.procurement.listReceptions.invalidate();
      utils.stock.getDashboard.invalidate();
      setSelectedId(null);
      setNotesControle("");
    },
    onError: (e) => toast.error(e.message),
  });

  const rejeterMutation = api.procurement.rejeterReception.useMutation({
    onSuccess: () => {
      utils.procurement.listReceptions.invalidate();
      setSelectedId(null);
      setMotifRejet("");
    },
    onError: (e) => toast.error(e.message),
  });

  const enControle = receptions?.filter(r => r.statut === "en_controle") ?? [];
  const archivees = receptions?.filter(r => ["validee", "rejetee"].includes(r.statut ?? "")) ?? [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Contrôle réceptions</h2>
          <p className="text-sm text-muted-foreground">Valider ou rejeter les réceptions en attente de contrôle qualité</p>
        </div>
        <Link
          href="/dashboard/procurement/reception"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Nouvelle réception
        </Link>
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button onClick={() => setActionTab("controle")} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${actionTab === "controle" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Contrôle ({enControle.length})
        </button>
        <button onClick={() => setActionTab("historique")} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${actionTab === "historique" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Archivées ({archivees.length})
        </button>
      </div>

      {actionTab === "controle" && enControle.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <ClipboardList size={48} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">Aucune réception en attente de contrôle</p>
        </div>
      )}

      {actionTab === "controle" && enControle.length > 0 && (
        <div className="grid gap-4">
          {enControle.map(reception => (
            <div key={reception.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-semibold text-foreground">{reception.reference}</span>
                  <span className="ml-2 inline-flex items-center rounded-full bg-warning/10 text-warning-foreground">
                    <AlertTriangle size={10} className="mr-1" /> Contrôle requis
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedId(selectedId === reception.id ? null : reception.id)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-accent transition-colors"
                  >
                    <Eye size={14} className="inline mr-1" /> Détails
                  </button>
                  {hasPermission("achats.recevoir") && (
                    <button
                      onClick={() => {
                        validerMutation.mutate({ id: reception.id, notesControle });
                      }}
                      disabled={validerMutation.isPending}
                      className="rounded-lg bg-success px-3 py-1.5 text-xs font-medium text-success-foreground hover:bg-success/90 disabled:opacity-50 transition-colors"
                    >
                      <ThumbsUp size={14} className="inline mr-1" /> Valider
                    </button>
                  )}
                  {hasPermission("achats.recevoir") && (
                    <button
                      onClick={() => {
                        const motif = prompt("Motif de rejet :");
                        if (motif) rejeterMutation.mutate({ id: reception.id, motifRejet: motif });
                      }}
                      disabled={rejeterMutation.isPending}
                      className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                    >
                      <ThumbsDown size={14} className="inline mr-1" /> Rejeter
                    </button>
                  )}
                </div>
              </div>

              {selectedId === reception.id && (
                <ReceptionDetails receptionId={reception.id} />
              )}
            </div>
          ))}
        </div>
      )}

      {actionTab === "historique" && (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Réf.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Statut</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Notes</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {archivees.map(r => (
                <tr key={r.id} className="hover:bg-accent">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{r.reference}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.statut === "validee"
                        ? "bg-success/10 text-success-foreground"
                        : "bg-destructive/10 text-destructive"
                    }`}>
                      {r.statut === "validee" ? <CheckCircle size={10} className="mr-1" /> : <XCircle size={10} className="mr-1" />}
                      {r.statut === "validee" ? "Validée" : "Rejetée"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("fr-FR") : "-"}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate">{r.notes ?? "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setSelectedId(selectedId === r.id ? null : r.id)} className="text-xs text-primary hover:underline">
                      Détails
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

function ReceptionDetails({ receptionId }: { receptionId: string }) {
  const { data: reception } = api.procurement.getReception.useQuery(
    { id: receptionId },
    { enabled: !!receptionId }
  );

  if (!reception) {
    return <div className="text-sm text-muted-foreground py-4 text-center"><Loader2 size={16} className="animate-spin inline mr-2" />Chargement...</div>;
  }

  return (
    <div className="border-t border-border pt-3 mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground uppercase">
            <th className="text-left px-3 py-2">Produit</th>
            <th className="text-right px-3 py-2">Commandé</th>
            <th className="text-right px-3 py-2">Reçu</th>
            <th className="text-right px-3 py-2">Prix U.</th>
            <th className="text-right px-3 py-2">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {(reception as any).lignes?.map((l: any) => (
            <tr key={l.id}>
              <td className="px-3 py-2 text-foreground/80">{l.produitId}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{l.quantiteCommandee}</td>
              <td className="px-3 py-2 text-right font-mono text-foreground">{l.quantiteRecue}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{Number(l.prixUnitaire).toLocaleString()} F</td>
              <td className="px-3 py-2 text-right font-mono text-foreground">{(l.quantiteRecue * Number(l.prixUnitaire)).toLocaleString()} F</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
