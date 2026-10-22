"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, Phone } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  analyserSuiviRelation,
  CANAL_LABELS,
  CANAUX_REPONSE_SAISIE,
  formatDelaiHeures,
  RECLAMATION_LABELS,
  type CanalReponseSaisie,
  type SuiviRelation,
} from "~/lib/suivi-relation";
import { useOrPermissions } from "../../_hooks/useOrPermissions";

type Dialogue = "reponse" | "reclamation" | "resolution" | null;

/**
 * Relation client du dossier — P3.2.
 *
 * Deux faits seulement, mais deux faits qui n'existaient nulle part : quand le
 * client a eu sa première réponse, et ce qu'on lui doit encore quand il a
 * réclamé. Le devis envoyé trace la réponse automatiquement ; les appels et
 * visites se tracent ici. Une réclamation ouverte reste visible jusqu'à sa
 * résolution, y compris après la livraison du véhicule.
 */
export function RelationClient({ or }: { or: any }) {
  const utils = api.useUtils();
  const { flags } = useOrPermissions();
  const id = Number(or.id);
  const editable = flags.modifier;
  const suivi: SuiviRelation = or.suiviRelation ?? analyserSuiviRelation(or.dateOuverture, or.historique ?? []);

  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const [canal, setCanal] = useState<CanalReponseSaisie>("APPEL");
  const [commentaire, setCommentaire] = useState("");
  const [motif, setMotif] = useState("");
  const [resolution, setResolution] = useState("");

  const invalider = () => {
    utils.or.getById.invalidate();
    utils.clients.get.invalidate();
    utils.clients.listInteractions.invalidate();
    utils.atelierKpi.getSanteGarage.invalidate();
  };

  const repondre = api.or.enregistrerReponseClient.useMutation({
    onSuccess: () => {
      toast.success("Première réponse au client tracée");
      setDialogue(null);
      setCommentaire("");
      invalider();
    },
    onError: (e) => toast.error(e.message),
  });

  const ouvrir = api.or.ouvrirReclamation.useMutation({
    onSuccess: () => {
      toast.success("Réclamation enregistrée — elle reste ouverte jusqu'à résolution");
      setDialogue(null);
      setMotif("");
      invalider();
    },
    onError: (e) => toast.error(e.message),
  });

  const resoudre = api.or.resoudreReclamation.useMutation({
    onSuccess: () => {
      toast.success("Réclamation résolue");
      setDialogue(null);
      setResolution("");
      invalider();
    },
    onError: (e) => toast.error(e.message),
  });

  const ouverte = !!suivi.reclamation && suivi.reclamation.statut !== "RESOLUE";

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <MessageCircle size={15} className="text-primary" /> Relation client
        </h3>
        <div className="flex flex-wrap gap-2">
          {!suivi.reponse && editable && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setDialogue("reponse")}>
              <Phone size={13} /> Tracer la première réponse
            </Button>
          )}
          {!ouverte && editable && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setDialogue("reclamation")}>
              <AlertTriangle size={13} /> Enregistrer une réclamation
            </Button>
          )}
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-muted/40 p-2.5 text-xs">
          <p className="mb-1 font-bold uppercase tracking-wide text-muted-foreground">Première réponse</p>
          {suivi.reponse ? (
            <>
              <p className="text-foreground">
                <b>{suivi.reponse.canalLabel}</b> — {formatDelaiHeures(suivi.reponse.delaiHeures)} après l'ouverture
              </p>
              <p className="text-muted-foreground">
                {new Date(suivi.reponse.le).toLocaleString("fr-FR")}
                {suivi.reponse.commentaire ? ` — ${suivi.reponse.commentaire}` : ""}
              </p>
            </>
          ) : (
            <p className="text-warning-foreground">
              Pas encore tracée. Le premier devis envoyé la trace automatiquement ; sinon, appelez le client et déclarez-le ici.
            </p>
          )}
        </div>

        <div className={`rounded-lg p-2.5 text-xs ${ouverte ? "border border-destructive/30 bg-destructive/5" : "bg-muted/40"}`}>
          <p className="mb-1 font-bold uppercase tracking-wide text-muted-foreground">Réclamation</p>
          {suivi.reclamation ? (
            <>
              <p className={ouverte ? "font-semibold text-destructive" : "font-semibold text-success-foreground"}>
                {RECLAMATION_LABELS[suivi.reclamation.statut]} — ouverte le{" "}
                {new Date(suivi.reclamation.ouverteLe).toLocaleDateString("fr-FR")}
              </p>
              {suivi.reclamation.motif && <p className="text-muted-foreground">{suivi.reclamation.motif}</p>}
              {suivi.reclamation.statut === "RESOLUE" && (
                <p className="mt-1 text-success-foreground">
                  <CheckCircle2 size={12} className="mr-1 inline" />
                  Résolue le {new Date(suivi.reclamation.resolueLe!).toLocaleDateString("fr-FR")}
                  {suivi.reclamation.resolution ? ` — ${suivi.reclamation.resolution}` : ""}
                </p>
              )}
              {ouverte && editable && (
                <Button size="sm" variant="outline" className="mt-2 gap-1.5 text-xs" onClick={() => setDialogue("resolution")}>
                  <CheckCircle2 size={13} /> Marquer résolue
                </Button>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Aucune réclamation enregistrée sur ce dossier.</p>
          )}
        </div>
      </div>

      <Dialog open={dialogue === "reponse"} onOpenChange={(o) => { if (!o) setDialogue(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone size={16} className="text-primary" /> Première réponse au client
            </DialogTitle>
            <DialogDescription>
              À utiliser si le client a eu une réponse avant tout devis. Un devis envoyé est tracé automatiquement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Canal</Label>
              <select
                value={canal}
                onChange={(e) => setCanal(e.target.value as CanalReponseSaisie)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {CANAUX_REPONSE_SAISIE.map((c) => (
                  <option key={c} value={c}>{CANAL_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Ce qui a été dit (optionnel)</Label>
              <Textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Ex. : diagnostic en cours, devis prévu demain matin…"
                className="mt-1"
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogue(null)}>Annuler</Button>
            <Button
              onClick={() => repondre.mutate({ orId: id, canal, commentaire: commentaire.trim() || undefined })}
              disabled={repondre.isPending}
              className="gap-2"
            >
              {repondre.isPending && <Loader2 className="size-4 animate-spin" />}
              Enregistrer la réponse
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogue === "reclamation"} onOpenChange={(o) => { if (!o) setDialogue(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-destructive" /> Réclamation client
            </DialogTitle>
            <DialogDescription>
              Décrivez ce que le client reproche. La réclamation restera ouverte et visible sur son dossier jusqu'à sa résolution.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs text-muted-foreground">Motif</Label>
            <Textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Ex. : bruit persistant après la réparation, pièce non conforme…"
              className="mt-1"
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogue(null)}>Annuler</Button>
            <Button
              onClick={() => ouvrir.mutate({ orId: id, motif: motif.trim() })}
              disabled={ouvrir.isPending || motif.trim().length < 5}
              className="gap-2"
            >
              {ouvrir.isPending && <Loader2 className="size-4 animate-spin" />}
              Ouvrir la réclamation
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogue === "resolution"} onOpenChange={(o) => { if (!o) setDialogue(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-success-foreground" /> Résoudre la réclamation
            </DialogTitle>
            <DialogDescription>
              Indiquez ce qui a été fait pour le client. La trace restera attachée au dossier et à sa fiche client.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs text-muted-foreground">Résolution</Label>
            <Textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Ex. : reprise du serrage, pièce remplacée, geste commercial accordé…"
              className="mt-1"
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogue(null)}>Annuler</Button>
            <Button
              onClick={() => resoudre.mutate({ orId: id, resolution: resolution.trim() })}
              disabled={resoudre.isPending || resolution.trim().length < 3}
              className="gap-2"
            >
              {resoudre.isPending && <Loader2 className="size-4 animate-spin" />}
              Marquer résolue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
