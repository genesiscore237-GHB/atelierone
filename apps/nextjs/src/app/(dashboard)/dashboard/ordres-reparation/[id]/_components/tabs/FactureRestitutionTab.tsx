"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  ReceiptText, History, ClipboardCopy, MessageCircle, Car, KeyRound, Lock, CheckCircle2, Loader2, PackageCheck, Trash2,
} from "lucide-react";
import { useOrPermissions } from "../../../_hooks/useOrPermissions";

const CARBURANT_OPTIONS = ["vide", "1/4", "1/2", "3/4", "plein"];
const CARBURANT_LABELS: Record<string, string> = { vide: "Vide", "1/4": "1/4", "1/2": "1/2", "3/4": "3/4", plein: "Plein" };
const MOTIFS_NON_REPARE = ["REFUS_CLIENT", "PIECES_INDISPONIBLES", "ABANDON", "AUTRE"] as const;
const MOTIF_NON_REPARE_LABELS: Record<string, string> = {
  REFUS_CLIENT: "Refus du client",
  PIECES_INDISPONIBLES: "Pièces indisponibles",
  ABANDON: "Abandon du véhicule",
  AUTRE: "Autre motif",
};
const CHECKLIST_SORTIE = [
  "Outillage / accessoires (conformes à l'entrée)",
  "Clés remises",
  "Documents véhicule remis",
  "Anciennes pièces remises au client",
  "Propreté du véhicule",
  "Objets personnels récupérés",
];

/** Onglet 7 — Facture & Restitution : synthèse, accusé de réception, restitution, clôture. */
export function FactureRestitutionTab({ or }: { or: any }) {
  const id = Number(or.id);
  const utils = api.useUtils();
  const { flags } = useOrPermissions();
  const peutRestituer = flags.canRestitution;

  const { data: ar } = api.or.accuseReception.useQuery({ orId: id });
  const { data: restitutions } = api.or.listerRestitutions.useQuery({ orId: id });
  const [copie, setCopie] = useState(false);

  const [restitForm, setRestitForm] = useState({
    kilometrageSortie: "",
    niveauCarburantSortie: "",
    recuperateurNom: "",
    signatureClient: "",
    observations: "",
    motifNonRepare: "AUTRE",
    travauxNonRealises: "",
    sortieExceptionnelle: false,
    motifException: "",
    commentaireException: "",
    checklist: CHECKLIST_SORTIE.map((l) => ({ libelle: l, ok: false, observation: "" })),
  });

  const restituer = api.or.restituerVehicule.useMutation({
    onSuccess: () => {
      toast.success("Véhicule restitué — OR livré");
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const fermer = api.or.fermerDefinitivement.useMutation({
    onSuccess: () => {
      toast.success("Dossier fermé définitivement");
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

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

  const restitChecklist = (i: number, patch: Partial<{ ok: boolean; observation: string }>) => {
    setRestitForm((f) => ({
      ...f,
      checklist: f.checklist.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    }));
  };

  const soumettreRestitution = () => {
    if (restitForm.kilometrageSortie === "") { toast.error("Kilométrage de sortie requis"); return; }
    if (restitForm.recuperateurNom.trim().length < 2) { toast.error("Récupérateur requis"); return; }
    if (restitForm.signatureClient.trim().length < 2) { toast.error("Signature (nom tapé) requise"); return; }
    if (restitForm.sortieExceptionnelle) {
      if (restitForm.motifException.trim().length < 3) { toast.error("Motif de sortie exceptionnelle requis"); return; }
      if (restitForm.commentaireException.trim().length < 3) { toast.error("Commentaire requis pour la sortie exceptionnelle"); return; }
    }
    const checklist = restitForm.checklist.map((c) => ({ libelle: c.libelle, ok: c.ok, observation: c.observation || undefined }));
    restituer.mutate({
      orId: id,
      kilometrageSortie: Number(restitForm.kilometrageSortie),
      niveauCarburantSortie: restitForm.niveauCarburantSortie || undefined,
      checklist,
      recuperateurNom: restitForm.recuperateurNom.trim(),
      signatureClient: restitForm.signatureClient.trim(),
      observations: restitForm.observations.trim() || undefined,
      motifNonRepare: restitForm.motifNonRepare as any,
      travauxNonRealises: restitForm.travauxNonRealises.trim() || undefined,
      sortieExceptionnelle: restitForm.sortieExceptionnelle || undefined,
      motifException: restitForm.motifException.trim() || undefined,
      commentaireException: restitForm.commentaireException.trim() || undefined,
    });
  };

  const restitue = or.statut === "LIVRE";
  const peutCloturer = flags.canRestitution && restitue && or.statut !== "ferme_definitif";

  return (
    <div className="space-y-4">
      {/* ─── Synthèse financière ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <ReceiptText size={15} className="text-primary" /> Synthèse financière
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <div className="rounded-lg bg-muted/50 p-2"><span className="text-muted-foreground">Pièces : </span><b>{totalPieces.toLocaleString("fr-FR")} F</b></div>
          <div className="rounded-lg bg-muted/50 p-2"><span className="text-muted-foreground">Main d'œuvre : </span><b>{totalMO.toLocaleString("fr-FR")} F</b></div>
          <div className="rounded-lg bg-primary/10 p-2"><span className="text-muted-foreground">Total TTC : </span><b>{totalTTC.toLocaleString("fr-FR")} F</b></div>
          <div className="rounded-lg bg-muted/50 p-2"><span className="text-muted-foreground">Déjà facturé : </span><b>{dejaFacture.toLocaleString("fr-FR")} F</b></div>
          <div className="rounded-lg bg-success/10 p-2"><span className="text-muted-foreground">Reste à facturer : </span><b className="text-success-foreground">{resteAFacturer.toLocaleString("fr-FR")} F</b></div>
        </div>
        {or.venteId && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-bold uppercase text-success-foreground">
            <CheckCircle2 size={11} /> Facturé (réf. {or.venteReference ?? `#${or.venteId}`})
          </p>
        )}
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

      {/* ─── Restitution ─── */}
      {!restitue && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <KeyRound size={15} className="text-primary" /> Restitution du véhicule
          </h3>
          {!peutRestituer && (
            <p className="mb-2 flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              <Lock size={13} /> Vous n'avez pas la permission de restituer le véhicule.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs text-muted-foreground">Kilométrage sortie *</Label>
              <Input type="number" min={0} value={restitForm.kilometrageSortie} onChange={(e) => setRestitForm({ ...restitForm, kilometrageSortie: e.target.value })} placeholder="Ex : 45 320" className="mt-1" disabled={!peutRestituer} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Niveau carburant sortie</Label>
              <select value={restitForm.niveauCarburantSortie} onChange={(e) => setRestitForm({ ...restitForm, niveauCarburantSortie: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" disabled={!peutRestituer}>
                <option value="">—</option>
                {CARBURANT_OPTIONS.map((n) => <option key={n} value={n}>{CARBURANT_LABELS[n]}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Motif si non / partiellement réparé</Label>
              <select value={restitForm.motifNonRepare} onChange={(e) => setRestitForm({ ...restitForm, motifNonRepare: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" disabled={!peutRestituer}>
                {MOTIFS_NON_REPARE.map((m) => <option key={m} value={m}>{MOTIF_NON_REPARE_LABELS[m]}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {restitForm.checklist.map((c, i) => (
              <div key={i} className="rounded-lg border border-border bg-background p-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={c.ok} onChange={(e) => restitChecklist(i, { ok: e.target.checked })} disabled={!peutRestituer} className="size-4" />
                  {c.libelle}
                </label>
                <input value={c.observation} onChange={(e) => restitChecklist(i, { observation: e.target.value })} placeholder="Observation" className="mt-1.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs" disabled={!peutRestituer} />
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Récupérateur (peut différer du propriétaire) *</Label>
              <Input value={restitForm.recuperateurNom} onChange={(e) => setRestitForm({ ...restitForm, recuperateurNom: e.target.value })} placeholder="Nom du récupérateur" className="mt-1" disabled={!peutRestituer} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Signature (nom tapé) *</Label>
              <Input value={restitForm.signatureClient} onChange={(e) => setRestitForm({ ...restitForm, signatureClient: e.target.value })} placeholder="Nom signé par le client" className="mt-1" disabled={!peutRestituer} />
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Travaux non réalisés (si partiel)</Label>
              <textarea value={restitForm.travauxNonRealises} onChange={(e) => setRestitForm({ ...restitForm, travauxNonRealises: e.target.value })} rows={2} placeholder="Liste des travaux non réalisés…" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50" disabled={!peutRestituer} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Observations client</Label>
              <textarea value={restitForm.observations} onChange={(e) => setRestitForm({ ...restitForm, observations: e.target.value })} rows={2} placeholder="Observations…" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50" disabled={!peutRestituer} />
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-dashed border-warning/40 bg-warning/5 p-3">
            <label className="flex items-start gap-2 text-xs font-medium text-foreground">
              <input type="checkbox" className="mt-0.5 size-4" checked={restitForm.sortieExceptionnelle}
                onChange={(e) => setRestitForm({ ...restitForm, sortieExceptionnelle: e.target.checked })}
                disabled={!peutRestituer} />
              <span>
                <b>Sortie exceptionnelle</b> — véhicule sort malgré QC non validé, travaux non terminés ou facture non soldée (le motif, le commentaire et le reste dû restent tracés sur le dossier).
              </span>
            </label>
            {restitForm.sortieExceptionnelle && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Motif de la sortie exceptionnelle *</Label>
                  <Input value={restitForm.motifException} onChange={(e) => setRestitForm({ ...restitForm, motifException: e.target.value })} placeholder="Ex : formuleur autorisée malgré refus du client" className="mt-1" disabled={!peutRestituer} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Commentaire *</Label>
                  <Input value={restitForm.commentaireException} onChange={(e) => setRestitForm({ ...restitForm, commentaireException: e.target.value })} placeholder="Ex : montant restant 150 000 F encaissé sous 30 jours" className="mt-1" disabled={!peutRestituer} />
                </div>
              </div>
            )}
          </div>
          {peutRestituer && (
            <div className="mt-4 flex justify-end">
              <Button className="gap-1.5 text-xs" disabled={restituer.isPending} onClick={soumettreRestitution}>
                {restituer.isPending ? <Loader2 className="size-3 animate-spin" /> : <PackageCheck size={14} />}
                Restituer le véhicule
              </Button>
            </div>
          )}
        </div>
      )}

      {restitue && (
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm">
          <CheckCircle2 size={16} className="text-success-foreground" />
          Véhicule restitué — OR livré.
        </div>
      )}

      {/* ─── Clôture définitive ─── */}
      {peutCloturer && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Lock size={15} className="text-primary" /> Clôture définitive
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Le véhicule est restitué et le solde réglé (ou crédit validé) : la clôture définitive fige le dossier (plus aucune modification).
          </p>
          <Button variant="outline" className="gap-1.5 text-xs" disabled={fermer.isPending} onClick={() => fermer.mutate({ id, motif: "Clôture définitive" })}>
            {fermer.isPending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 size={14} />}
            Fermer définitivement
          </Button>
        </div>
      )}

      {/* ─── Historique des restitutions ─── */}
      {(restitutions ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <History size={15} className="text-primary" /> Historique des restitutions
          </h3>
          <div className="space-y-1.5">
            {(restitutions ?? []).map((r: any) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
                <Car size={12} className="text-primary" />
                <span>Km {r.kilometrageSortie ?? "—"}{r.niveauCarburantSortie ? ` · ${CARBURANT_LABELS[r.niveauCarburantSortie]}` : ""}</span>
                <span className="text-muted-foreground">· {r.recuperateurNom}</span>
                {r.motifNonRepare && <span className="text-muted-foreground">· {MOTIF_NON_REPARE_LABELS[r.motifNonRepare]}</span>}
                <span className="ml-auto text-[10px] text-muted-foreground">{new Date(r.dateRestitution).toLocaleString("fr-FR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}