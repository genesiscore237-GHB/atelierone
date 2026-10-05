"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  FileText, Send, Plus, Trash2, Loader2, ShieldCheck, ReceiptText, History, Lock, CheckCircle2, XCircle, Clock3, StickyNote,
} from "lucide-react";
import { useOrPermissions } from "../../../_hooks/useOrPermissions";

const TYPE_LIGNE_LABELS: Record<string, string> = {
  PIECE: "Pièce",
  SERVICE: "Main d'œuvre",
  FORFAIT: "Forfait",
  SOUS_TRAITANCE: "Sous-traitance",
  CONSOMMABLE: "Consommable",
};
const TYPE_LIGNE_BADGE: Record<string, string> = {
  PIECE: "bg-muted text-muted-foreground",
  SERVICE: "bg-primary/10 text-primary",
  FORFAIT: "bg-violet-500/10 text-violet-400",
  SOUS_TRAITANCE: "bg-sky-500/10 text-sky-400",
  CONSOMMABLE: "bg-warning/10 text-warning-foreground",
};
const AUTORISATION_LABELS: Record<string, string> = {
  PROPOSE: "Proposé",
  AUTORISE: "Autorisé",
  DECLINE: "Décliné",
  REPORTE: "Reporté",
};
const AUTORISATION_BADGE: Record<string, string> = {
  PROPOSE: "bg-muted text-muted-foreground",
  AUTORISE: "bg-success/10 text-success-foreground",
  DECLINE: "bg-destructive/10 text-destructive",
  REPORTE: "bg-warning/10 text-warning-foreground",
};
const ORIGINE_LABELS: Record<string, string> = {
  DIAGNOSTIC: "Diagnostic",
  DVI: "Inspection DVI",
  CLIENT: "Manuel",
  DECOUVERT: "Travaux supp.",
};
const VERSION_STATUT_LABELS: Record<string, string> = {
  BROUILLON: "Brouillon",
  ENVOYE: "Envoyé au client",
  AUTORISE_TOTAL: "Autorisé (total)",
  AUTORISE_PARTIEL: "Autorisé (partiel)",
  REFUSE: "Refusé",
};
const VERSION_STATUT_BADGE: Record<string, string> = {
  BROUILLON: "bg-muted text-muted-foreground",
  ENVOYE: "bg-sky-500/10 text-sky-400",
  AUTORISE_TOTAL: "bg-success/10 text-success-foreground",
  AUTORISE_PARTIEL: "bg-warning/10 text-warning-foreground",
  REFUSE: "bg-destructive/10 text-destructive",
};
const METHODES = ["ORAL", "SMS", "EMAIL", "SIGNATURE", "WEB"] as const;
const METHODE_LABELS: Record<string, string> = {
  ORAL: "Oral",
  SMS: "SMS",
  EMAIL: "Email",
  SIGNATURE: "Signature tablette",
  WEB: "Lien web",
};

const totalLigne = (l: any) => {
  const q = Number(l.quantite ?? 1);
  const pu = Number(l.prixUnitaire ?? 0);
  const tva = Number(l.tva ?? 0);
  return q * pu * (1 + tva / 100);
};

/** Onglet 3 — Devis & Autorisation : versions, lignes, autorisation ligne par ligne. */
export function DevisTab({ or }: { or: any }) {
  const id = Number(or.id);
  const utils = api.useUtils();
  const { flags } = useOrPermissions();

  const { data: versions, refetch: refetchVersions } = api.or.listerDevisVersions.useQuery({ orId: id });
  const { data: autorisations } = api.or.listerAutorisations.useQuery({ orId: id });

  const dernier = versions?.[0] ?? null;
  const lignes = or.lignes ?? [];
  const totalAutorise = lignes
    .filter((l: any) => l.statutAutorisation === "AUTORISE")
    .reduce((s: number, l: any) => s + totalLigne(l), 0);

  // ─── Actions version ───
  const creerVersion = api.or.creerVersionDevis.useMutation({
    onSuccess: () => {
      toast.success("Nouvelle version de devis créée");
      refetchVersions();
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const envoyerVersion = api.or.envoyerVersionDevis.useMutation({
    onSuccess: () => {
      toast.success("Devis envoyé au client — en attente d'autorisation");
      refetchVersions();
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Édition des lignes ───
  const [nv, setNv] = useState({ type: "SERVICE", libelle: "", quantite: "1", prixUnitaire: "", tva: "0", dureeHeures: "" });
  const [versionOuverte, setVersionOuverte] = useState<number | null>(null);
  const addLigne = api.or.addLigne.useMutation({
    onSuccess: () => {
      toast.success("Ligne ajoutée au devis");
      setNv({ type: "SERVICE", libelle: "", quantite: "1", prixUnitaire: "", tva: "0", dureeHeures: "" });
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteLigne = api.or.deleteLigne.useMutation({
    onSuccess: () => {
      toast.success("Ligne supprimée");
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const ajouterLigne = () => {
    if (!nv.libelle.trim()) {
      toast.error("Désignation requise");
      return;
    }
    addLigne.mutate({
      ordreId: id,
      type: nv.type as any,
      libelle: nv.libelle.trim(),
      quantite: Number(nv.quantite) || 1,
      prixUnitaire: Number(nv.prixUnitaire) || 0,
      tva: Number(nv.tva) || 0,
      dureeHeures: nv.dureeHeures ? Number(nv.dureeHeures) : undefined,
    });
  };

  // ─── Autorisation ligne par ligne ───
  const [autorisation, setAutorisation] = useState<Record<number, string>>({});
  const [methode, setMethode] = useState<string>("ORAL");
  const [qui, setQui] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const enregistrerAutorisations = api.or.autoriserLignes.useMutation({
    onSuccess: (r: any) => {
      toast.success(`Autorisation enregistrée : ${r.autorises} autorisée(s), ${r.declines} déclinée(s), ${r.reportes} reportée(s)`);
      setAutorisation({});
      setQui("");
      setCommentaire("");
      refetchVersions();
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const soumettreAutorisations = () => {
    const choix = Object.entries(autorisation).filter(([, v]) => v !== "PROPOSE");
    if (choix.length === 0) {
      toast.error("Aucune ligne à autoriser : sélectionnez Autoriser / Décliner / Reporter");
      return;
    }
    enregistrerAutorisations.mutate({
      orId: id,
      devisVersionId: dernier?.id,
      lignes: choix.map(([ligneId, statut]) => ({ ligneId: Number(ligneId), statut: statut as any })),
      methode: methode as any,
      qui: qui.trim() || undefined,
      commentaire: commentaire.trim() || undefined,
    });
  };

  const peutEditerLignes = flags.canDeviser && or.statut !== "ferme_definitif";
  const versionEnvoyee = dernier?.statut === "ENVOYE";
  const peutAutoriser = flags.valider && versionEnvoyee;

  return (
    <div className="space-y-4">
      {/* ─── Résumé financier ─── */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-muted/50 p-2">
          <span className="text-muted-foreground">Devis v{dernier?.version ?? "—"} : </span>
          <b>{Number(dernier?.montantTTC ?? 0).toLocaleString("fr-FR")} F TTC</b>
        </div>
        <div className="rounded-lg bg-success/10 p-2">
          <span className="text-muted-foreground">Autorisé : </span>
          <b className="text-success-foreground">{totalAutorise.toLocaleString("fr-FR")} F TTC</b>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <span className="text-muted-foreground">Lignes : </span>
          <b>{lignes.length}</b>
        </div>
      </div>

      {/* ─── Versions ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <FileText size={15} className="text-primary" /> Versions de devis
          </h3>
          {flags.canDeviser && lignes.length > 0 && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" disabled={creerVersion.isPending} onClick={() => creerVersion.mutate({ orId: id })}>
              {creerVersion.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus size={13} />}
              Nouvelle version
            </Button>
          )}
        </div>

        {(versions ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune version. {lignes.length === 0 ? "Ajoutez des lignes (préconisations, DVI ou manuelles) puis créez une version." : "Créez une version pour envoyer le devis au client."}
          </p>
        ) : (
          <div className="space-y-2">
            {(versions ?? []).map((v: any) => (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold">v{v.version}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${VERSION_STATUT_BADGE[v.statut] ?? "bg-muted text-muted-foreground"}`}>
                    {VERSION_STATUT_LABELS[v.statut] ?? v.statut}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {Number(v.montantTTC).toLocaleString("fr-FR")} F TTC
                  </span>
                  {v.envoyeLe && <span className="text-[11px] text-muted-foreground">· envoyé {new Date(v.envoyeLe).toLocaleDateString("fr-FR")}</span>}
                  {v.dateAutorisation && <span className="text-[11px] text-muted-foreground">· autorisé {new Date(v.dateAutorisation).toLocaleDateString("fr-FR")} ({METHODE_LABELS[v.methodeAutorisation] ?? v.methodeAutorisation})</span>}
                </div>
                <div className="flex items-center gap-2">
                  {v.statut === "BROUILLON" && flags.valider && (
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={envoyerVersion.isPending} onClick={() => envoyerVersion.mutate({ devisVersionId: v.id })}>
                      <Send size={12} /> Envoyer au client
                    </Button>
                  )}
                  {(v.lignesSnapshot ?? []).length > 0 && (
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setVersionOuverte(versionOuverte === v.id ? null : v.id)}>
                      <History size={12} /> Lignes ({v.lignesSnapshot.length})
                    </Button>
                  )}
                </div>
                {versionOuverte === v.id && (v.lignesSnapshot ?? []).length > 0 && (
                  <div className="mt-2 w-full space-y-1 border-t border-border pt-2">
                    {(v.lignesSnapshot as any[]).map((l: any) => (
                      <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/30 px-2 py-1 text-xs">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TYPE_LIGNE_BADGE[l.type] ?? ""}`}>
                          {TYPE_LIGNE_LABELS[l.type] ?? l.type}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{l.libelle}</span>
                        <span className="text-muted-foreground">×{Number(l.quantite)} · {Number(l.prixUnitaire).toLocaleString("fr-FR")} F</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${AUTORISATION_BADGE[l.statutAutorisation] ?? ""}`}>
                          {AUTORISATION_LABELS[l.statutAutorisation] ?? l.statutAutorisation}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Autorisation ligne par ligne ─── */}
      {peutAutoriser && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <ShieldCheck size={15} className="text-primary" /> Autorisation ligne par ligne (v{dernier.version})
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Seules les lignes « Autorisées » pourront être servies en pièces et exécutées en travaux.
          </p>
          <div className="space-y-1.5">
            {lignes.map((l: any) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TYPE_LIGNE_BADGE[l.type] ?? ""}`}>
                  {TYPE_LIGNE_LABELS[l.type] ?? l.type}
                </span>
                <span className="min-w-0 flex-1 truncate">{l.libelle}</span>
                <span className="font-mono text-xs text-muted-foreground">{totalLigne(l).toLocaleString("fr-FR")} F</span>
                <select
                  value={autorisation[l.id] ?? l.statutAutorisation ?? "PROPOSE"}
                  onChange={(e) => setAutorisation({ ...autorisation, [l.id]: e.target.value })}
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="PROPOSE">—</option>
                  <option value="AUTORISE">Autoriser</option>
                  <option value="DECLINE">Décliner</option>
                  <option value="REPORTE">Reporter</option>
                </select>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div>
              <Label className="text-xs text-muted-foreground">Méthode</Label>
              <select value={methode} onChange={(e) => setMethode(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {METHODES.map((m) => (
                  <option key={m} value={m}>{METHODE_LABELS[m]}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Qui a autorisé</Label>
              <Input value={qui} onChange={(e) => setQui(e.target.value)} placeholder="Client, nom…" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Commentaire client</Label>
              <Input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Optionnel" className="mt-1" />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" className="gap-1.5" disabled={enregistrerAutorisations.isPending} onClick={soumettreAutorisations}>
              {enregistrerAutorisations.isPending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 size={14} />}
              Enregistrer les autorisations
            </Button>
          </div>
        </div>
      )}

      {versionEnvoyee && !flags.valider && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          <Lock size={13} /> Le devis est envoyé — seule une personne avec la permission « or.valider » peut recueillir l'autorisation client.
        </p>
      )}

      {/* ─── Lignes du devis ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <ReceiptText size={15} className="text-primary" /> Lignes du devis ({lignes.length})
        </h3>

        {lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune ligne. Ajoutez une ligne manuelle ci-dessous (les préconisations du diagnostic et les points DVI convertis s'ajoutent automatiquement).</p>
        ) : (
          <div className="space-y-1.5">
            {lignes.map((l: any) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TYPE_LIGNE_BADGE[l.type] ?? ""}`}>
                  {TYPE_LIGNE_LABELS[l.type] ?? l.type}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${AUTORISATION_BADGE[l.statutAutorisation] ?? ""}`}>
                  {AUTORISATION_LABELS[l.statutAutorisation] ?? l.statutAutorisation}
                </span>
                <span className="min-w-0 flex-1 truncate">{l.libelle}</span>
                <span className="text-xs text-muted-foreground">
                  ×{Number(l.quantite)} · {Number(l.prixUnitaire).toLocaleString("fr-FR")} F
                  {l.dureeHeures ? ` · ${Number(l.dureeHeures)} h` : ""}
                </span>
                <span className="font-mono text-xs">{totalLigne(l).toLocaleString("fr-FR")} F</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {ORIGINE_LABELS[l.origine] ?? l.origine}
                </span>
                {peutEditerLignes && l.statutAutorisation === "PROPOSE" && (
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => deleteLigne.mutate({ id: l.id })} disabled={deleteLigne.isPending}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {peutEditerLignes && (
          <div className="mt-3 rounded-lg border border-dashed border-border p-2.5">
            <div className="grid grid-cols-12 items-center gap-1.5">
              <select value={nv.type} onChange={(e) => setNv({ ...nv, type: e.target.value })} className="col-span-2 rounded border border-border bg-background px-1 py-1.5 text-xs">
                {Object.entries(TYPE_LIGNE_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
              <input value={nv.libelle} onChange={(e) => setNv({ ...nv, libelle: e.target.value })} placeholder="Désignation" className="col-span-4 rounded border border-border bg-background px-2 py-1.5 text-xs" />
              <input type="number" min={0} value={nv.quantite} onChange={(e) => setNv({ ...nv, quantite: e.target.value })} placeholder="Qté" className="col-span-1 rounded border border-border bg-background px-1 py-1.5 text-xs" />
              <input type="number" min={0} value={nv.prixUnitaire} onChange={(e) => setNv({ ...nv, prixUnitaire: e.target.value })} placeholder="P.U." className="col-span-2 rounded border border-border bg-background px-1 py-1.5 text-xs" />
              <input type="number" min={0} step="0.5" value={nv.dureeHeures} onChange={(e) => setNv({ ...nv, dureeHeures: e.target.value })} placeholder="h" className="col-span-1 rounded border border-border bg-background px-1 py-1.5 text-xs" />
              <Button size="sm" className="col-span-2 gap-1 text-xs" disabled={addLigne.isPending} onClick={ajouterLigne}>
                {addLigne.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus size={12} />} Ajouter
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Historique des autorisations ─── */}
      {(autorisations ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <History size={15} className="text-primary" /> Historique des autorisations
          </h3>
          <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {(autorisations ?? []).map((a: any) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${AUTORISATION_BADGE[a.statut] ?? ""}`}>
                  {AUTORISATION_LABELS[a.statut] ?? a.statut}
                </span>
                <span className="min-w-0 flex-1 truncate">{a.libelle}</span>
                {a.version && <span className="text-muted-foreground">v{a.version}</span>}
                <span className="text-muted-foreground">{METHODE_LABELS[a.methode] ?? a.methode}</span>
                {a.qui && <span>· {a.qui}</span>}
                {a.commentaire && <span className="inline-flex items-center gap-1 text-muted-foreground"><StickyNote size={11} /> {a.commentaire}</span>}
                <span className="text-[10px] text-muted-foreground">{new Date(a.dateAutorisation).toLocaleString("fr-FR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Travaux supplémentaires ─── */}
      {flags.canDeviser && dernier?.statut && dernier.statut !== "BROUILLON" && lignes.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          <Clock3 size={13} className="text-primary" />
          Découverte de travaux supplémentaires en cours d'intervention ? Créez une <b>nouvelle version</b> (v{Number(dernier.version) + 1}) pour une nouvelle demande d'autorisation — l'historique est conservé.
        </p>
      )}

      {or.statut === "ferme_definitif" && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          <XCircle size={13} /> Dossier fermé définitivement — plus aucune modification possible.
        </p>
      )}
    </div>
  );
}