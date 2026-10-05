"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  ShieldCheck, Loader2, CheckCircle2, XCircle, Car, History, Lock, Stethoscope,
} from "lucide-react";
import { useOrPermissions } from "../../../_hooks/useOrPermissions";

const CHECKLIST_DEFAUT = [
  "Travaux conformes au devis autorisé",
  "Serrages / couples respectés",
  "Niveaux de liquides contrôlés",
  "Absence de fuite",
  "Codes défaut effacés / recontrôlés",
  "Propreté du véhicule",
  "Protections / outils retirés",
  "Essai des systèmes réparés",
];

/** Onglet 6 — Contrôle Qualité : checklist, essai routier, validation, historique. */
export function QualiteTab({ or }: { or: any }) {
  const id = Number(or.id);
  const utils = api.useUtils();
  const { flags } = useOrPermissions();
  const peutQc = flags.canQualite;

  const { data: controles } = api.or.listerControlesQualite.useQuery({ orId: id });

  const [checklist, setChecklist] = useState<Array<{ libelle: string; ok: boolean }>>(
    CHECKLIST_DEFAUT.map((l) => ({ libelle: l, ok: false }))
  );
  const [essaiRoutier, setEssaiRoutier] = useState(false);
  const [distanceEssai, setDistanceEssai] = useState("");
  const [observations, setObservations] = useState("");

  const validerQc = api.or.validerControleQualite.useMutation({
    onSuccess: () => {
      toast.success("Contrôle qualité enregistré");
      setChecklist(CHECKLIST_DEFAUT.map((l) => ({ libelle: l, ok: false })));
      setEssaiRoutier(false);
      setDistanceEssai("");
      setObservations("");
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const soumettre = (resultat: "VALIDE" | "REJETE") => {
    if (checklist.length === 0) { toast.error("Checklist vide"); return; }
    if (resultat === "REJETE" && !observations.trim()) {
      toast.error("Le motif de rejet est obligatoire (retour en travaux)");
      return;
    }
    validerQc.mutate({
      orId: id,
      checklist: checklist.map((c) => ({ libelle: c.libelle, ok: c.ok })),
      essaiRoutier,
      distanceEssai: distanceEssai || undefined,
      observations: observations.trim() || undefined,
      resultat,
    });
  };

  const dernier = controles?.[0] ?? null;
  const enAttente = or.statut === "CONTROLE_QUALITE";

  return (
    <div className="space-y-4">
      {enAttente && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-sm text-sky-400">
          <Stethoscope size={15} />
          Le véhicule est en contrôle qualité — effectuez la checklist puis validez (ou renvoyez en travaux).
        </div>
      )}

      {/* ─── Checklist ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <ShieldCheck size={15} className="text-primary" /> Checklist qualité
        </h3>
        <div className="space-y-1.5">
          {checklist.map((c, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <span>{c.libelle}</span>
              <label className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${c.ok ? "text-success-foreground" : "text-destructive"}`}>{c.ok ? "OK" : "Non OK"}</span>
                <input
                  type="checkbox"
                  checked={c.ok}
                  onChange={(e) => setChecklist(checklist.map((x, idx) => (idx === i ? { ...x, ok: e.target.checked } : x)))}
                  disabled={!peutQc}
                  className="size-4"
                />
              </label>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">Essai routier</Label>
            <div className="mt-1 flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={essaiRoutier} onChange={(e) => setEssaiRoutier(e.target.checked)} disabled={!peutQc} className="size-4" />
                Réalisé
              </label>
              {essaiRoutier && (
                <Input value={distanceEssai} onChange={(e) => setDistanceEssai(e.target.value)} placeholder="Distance / durée" className="max-w-40" disabled={!peutQc} />
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Observations / motif de rejet</Label>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={2}
              placeholder="Résultat, réserves, motif de rejet éventuel…"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
              disabled={!peutQc}
            />
          </div>
        </div>

        {peutQc && (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="outline" className="gap-1.5 text-xs" disabled={validerQc.isPending} onClick={() => soumettre("REJETE")}>
              {validerQc.isPending ? <Loader2 className="size-3 animate-spin" /> : <XCircle size={14} />}
              Rejeter (retour en travaux)
            </Button>
            <Button className="gap-1.5 text-xs" disabled={validerQc.isPending} onClick={() => soumettre("VALIDE")}>
              {validerQc.isPending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 size={14} />}
              Valider le QC — prêt à livrer
            </Button>
          </div>
        )}
        {!peutQc && (
          <p className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            <Lock size={13} /> Vous n'avez pas la permission d'effectuer le contrôle qualité.
          </p>
        )}
      </div>

      {/* ─── Historique QC ─── */}
      {(controles ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <History size={15} className="text-primary" /> Historique des contrôles
          </h3>
          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {(controles ?? []).map((c: any) => (
              <div key={c.id} className="rounded-lg bg-muted/30 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${c.resultat === "VALIDE" ? "bg-success/10 text-success-foreground" : "bg-destructive/10 text-destructive"}`}>
                    {c.resultat === "VALIDE" ? "Validé" : "Rejeté"}
                  </span>
                  <span className="text-muted-foreground">{new Date(c.dateControle).toLocaleString("fr-FR")}</span>
                  {c.essaiRoutier && <span className="inline-flex items-center gap-1 text-muted-foreground"><Car size={11} /> Essai routier{c.distanceEssai ? ` (${c.distanceEssai})` : ""}</span>}
                </div>
                <p className="mt-1 text-muted-foreground">
                  Checklist : {((c.checklist ?? []) as any[]).filter((x) => x.ok).length}/{((c.checklist ?? []) as any[]).length} OK
                  {c.observations ? ` — ${c.observations}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}