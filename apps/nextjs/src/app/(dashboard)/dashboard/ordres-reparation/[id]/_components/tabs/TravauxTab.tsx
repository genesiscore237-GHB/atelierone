"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Wrench, Play, Square, Timer, Loader2, Plus, Trash2, UserRound, Camera, AlertTriangle, CheckCircle2, Lock,
} from "lucide-react";
import { useOrPermissions } from "../../../_hooks/useOrPermissions";
import { TechnicienSelector } from "../shared/TechnicienSelector";
import { SelectSearch } from "~/components/ui/select-search";

const TYPE_LIGNE_LABELS: Record<string, string> = {
  PIECE: "Pièce",
  SERVICE: "Main d'œuvre",
  FORFAIT: "Forfait",
  SOUS_TRAITANCE: "Sous-traitance",
  CONSOMMABLE: "Consommable",
};
const AUTORISATION_BADGE: Record<string, string> = {
  PROPOSE: "bg-muted text-muted-foreground",
  AUTORISE: "bg-success/10 text-success-foreground",
  DECLINE: "bg-destructive/10 text-destructive",
  REPORTE: "bg-warning/10 text-warning-foreground",
};
const STATUT_LIGNE_BADGE: Record<string, string> = {
  a_faire: "bg-muted text-muted-foreground",
  en_cours: "bg-warning/10 text-warning-foreground",
  fait: "bg-success/10 text-success-foreground",
  valide: "bg-primary/10 text-primary",
};
const STATUT_LIGNE_LABELS: Record<string, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  fait: "Terminé",
  valide: "Validé",
};

/** Onglet 5 — Travaux & Pointage : éditeur de lignes, technicien, pointage, signalement. */
export function TravauxTab({ or }: { or: any }) {
  const id = Number(or.id);
  const utils = api.useUtils();
  const { flags } = useOrPermissions();
  const { data: employes } = api.rh.roster.useQuery({ statut: "actif" });
  const employesList = (employes ?? []) as any[];
  const peutEditer = flags.canTravaux;

  const { data: pointages, refetch: refetchPointages } = api.or.listerPointages.useQuery({ orId: id });

  const [nv, setNv] = useState({ type: "SERVICE", libelle: "", quantite: "1", prixUnitaire: "", tva: "0", dureeHeures: "" });
  const [ptg, setPtg] = useState({ technicienId: 0, ligneId: 0, description: "" });
  const [ptgManuel, setPtgManuel] = useState({ technicienId: 0, dureeHeures: "", description: "" });
  const [signaler, setSignaler] = useState("");
  const [showPhotos, setShowPhotos] = useState(false);
  const [uploading, setUploading] = useState(false);

  const addLigne = api.or.addLigne.useMutation({
    onSuccess: () => { toast.success("Ligne ajoutée"); setNv({ type: "SERVICE", libelle: "", quantite: "1", prixUnitaire: "", tva: "0", dureeHeures: "" }); utils.or.getById.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateLigne = api.or.updateLigne.useMutation({
    onSuccess: () => { toast.success("Ligne mise à jour"); utils.or.getById.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteLigne = api.or.deleteLigne.useMutation({
    onSuccess: () => { toast.success("Ligne supprimée"); utils.or.getById.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const pointer = api.or.pointageIntervention.useMutation({
    onSuccess: () => { toast.success("Pointage enregistré"); refetchPointages(); utils.or.getById.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const ajouterPhoto = api.or.ajouterPhoto.useMutation({
    onSuccess: () => utils.or.getById.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const lignes = or.lignes ?? [];
  const lignesAutorisees = lignes.filter((l: any) => l.statutAutorisation === "AUTORISE");
  const pointagesEnCours = (pointages ?? []).filter((p: any) => p.enCours);
  const optTechniciens = employesList.map((e: any) => ({ value: e.id, label: `${e.prenom ?? ""} ${e.nom}`.trim() }));
  const optLignes = lignesAutorisees.map((l: any) => ({ value: l.id, label: l.libelle }));

  const ajouterLigne = () => {
    if (!nv.libelle.trim()) { toast.error("Désignation requise"); return; }
    addLigne.mutate({ ordreId: id, type: nv.type as any, libelle: nv.libelle.trim(), quantite: Number(nv.quantite) || 1, prixUnitaire: Number(nv.prixUnitaire) || 0, tva: Number(nv.tva) || 0, dureeHeures: nv.dureeHeures ? Number(nv.dureeHeures) : undefined });
  };

  const demarrer = () => {
    if (!ptg.technicienId) { toast.error("Technicien requis"); return; }
    pointer.mutate({ orId: id, technicienId: ptg.technicienId, dateIntervention: new Date().toISOString().slice(0, 10), ligneId: ptg.ligneId || undefined, description: ptg.description || undefined });
  };
  const terminer = (p: any) => {
    pointer.mutate({ orId: id, technicienId: p.technicienId, dateIntervention: p.dateIntervention, heureFin: true });
  };
  const saisieManuelle = () => {
    if (!ptgManuel.technicienId) { toast.error("Technicien requis"); return; }
    if (!ptgManuel.dureeHeures || Number(ptgManuel.dureeHeures) <= 0) { toast.error("Durée requise"); return; }
    pointer.mutate({ orId: id, technicienId: ptgManuel.technicienId, dateIntervention: new Date().toISOString().slice(0, 10), dureeHeures: Number(ptgManuel.dureeHeures), description: ptgManuel.description || undefined });
  };

  const signalerSupplements = () => {
    if (!signaler.trim()) { toast.error("Décrivez les travaux supplémentaires"); return; }
    addLigne.mutate({
      ordreId: id,
      type: "SERVICE",
      libelle: `[Supplément] ${signaler.trim()}`,
      quantite: 1,
      prixUnitaire: 0,
      tva: 0,
    });
    setSignaler("");
    toast.success("Signalement ajouté — créez une nouvelle version de devis pour l'autoriser (onglet Devis)");
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files).slice(0, 8)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", `or-${id}`);
        const res = await fetch("/api/uploads", { method: "POST", body: formData });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        const data = await res.json();
        await new Promise<void>((resolve) => ajouterPhoto.mutate({ id, url: data.url, type: file.type.startsWith("video") ? "VIDEO" : "PHOTO" }, { onSettled: () => resolve() }));
        ok++;
      } catch (e: any) {
        toast.error(e.message ?? "Erreur upload");
      }
    }
    setUploading(false);
    if (ok > 0) toast.success(`${ok} fichier(s) ajouté(s)`);
  };

  return (
    <div className="space-y-4">
      {/* ─── Technicien responsable ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <UserRound size={15} className="text-primary" /> Technicien responsable
        </div>
        <TechnicienSelector or={or} employes={employesList} />
      </div>

      {!peutEditer && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          <Lock size={13} /> Vous n'avez pas la permission d'éditer les travaux — consultation seule.
        </p>
      )}

      {/* ─── Éditeur de lignes ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <Wrench size={15} className="text-primary" /> Lignes de travaux ({lignes.length}) — {lignesAutorisees.length} autorisée(s)
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Seules les lignes <b>autorisées</b> peuvent être exécutées et marquées terminées.
        </p>

        {lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune ligne. Ajoutez-en une ci-dessous.</p>
        ) : (
          <div className="space-y-1.5">
            {lignes.map((l: any) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${AUTORISATION_BADGE[l.statutAutorisation] ?? ""}`}>
                  {l.statutAutorisation === "AUTORISE" ? "Autorisée" : l.statutAutorisation === "DECLINE" ? "Déclinée" : l.statutAutorisation === "REPORTE" ? "Reportée" : "Proposée"}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUT_LIGNE_BADGE[l.statut] ?? ""}`}>
                  {STATUT_LIGNE_LABELS[l.statut] ?? l.statut}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {l.libelle}
                  <span className="ml-1 text-xs text-muted-foreground">({TYPE_LIGNE_LABELS[l.type] ?? l.type} · ×{Number(l.quantite)} · {Number(l.prixUnitaire).toLocaleString("fr-FR")} F{l.dureeHeures ? ` · ${Number(l.dureeHeures)} h` : ""})</span>
                </span>

                {peutEditer && (
                  <>
                    <SelectSearch
                      value={l.technicienId ?? null}
                      onChange={(v) => updateLigne.mutate({ id: l.id, technicienId: v ? Number(v) : null })}
                      options={optTechniciens}
                      placeholder="Technicien…"
                      searchPlaceholder="Nom…"
                      size="sm"
                      className="w-40"
                    />
                    {l.statutAutorisation === "AUTORISE" && l.statut !== "fait" && l.statut !== "valide" && (
                      <Button size="sm" variant="outline" className="h-6 gap-0.5 px-2 text-[10px]" disabled={updateLigne.isPending} onClick={() => updateLigne.mutate({ id: l.id, statut: "fait" })}>
                        <CheckCircle2 size={11} /> Terminer
                      </Button>
                    )}
                    {l.statut === "fait" && l.statutAutorisation === "AUTORISE" && (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => updateLigne.mutate({ id: l.id, statut: "a_faire" })}>Rouvrir</Button>
                    )}
                    {l.statutAutorisation !== "AUTORISE" && l.statutAutorisation !== "DECLINE" && (
                      <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => deleteLigne.mutate({ id: l.id })}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {peutEditer && (
          <div className="mt-3 rounded-lg border border-dashed border-border p-2.5">
            <div className="grid grid-cols-12 items-center gap-1.5">
              <select value={nv.type} onChange={(e) => setNv({ ...nv, type: e.target.value })} className="col-span-2 rounded border border-border bg-background px-1 py-1.5 text-xs">
                {Object.entries(TYPE_LIGNE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
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

      {/* ─── Pointage ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <Timer size={15} className="text-primary" /> Pointage des interventions
        </h3>
        {peutEditer && (
          <div className="grid gap-2 lg:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-border bg-background p-3">
              <Label className="text-xs text-muted-foreground">Démarrer un pointage (timer)</Label>
              <div className="flex flex-wrap gap-2">
                <SelectSearch
                  value={ptg.technicienId || null}
                  onChange={(v) => setPtg({ ...ptg, technicienId: Number(v) })}
                  options={optTechniciens}
                  placeholder="Technicien…"
                  searchPlaceholder="Nom…"
                  size="sm"
                  className="min-w-36 flex-1"
                />
                <SelectSearch
                  value={ptg.ligneId || null}
                  onChange={(v) => setPtg({ ...ptg, ligneId: Number(v) })}
                  options={optLignes}
                  placeholder="Ligne (optionnel)…"
                  searchPlaceholder="Rechercher…"
                  size="sm"
                  className="min-w-36 flex-1"
                />
                <Input value={ptg.description} onChange={(e) => setPtg({ ...ptg, description: e.target.value })} placeholder="Description" className="flex-1 text-xs" />
              </div>
              <Button size="sm" className="gap-1 text-xs" disabled={pointer.isPending} onClick={demarrer}>
                {pointer.isPending ? <Loader2 className="size-3 animate-spin" /> : <Play size={12} />} Démarrer
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border border-border bg-background p-3">
              <Label className="text-xs text-muted-foreground">Saisie manuelle (oubli de pointeuse)</Label>
              <div className="flex flex-wrap gap-2">
                <SelectSearch
                  value={ptgManuel.technicienId || null}
                  onChange={(v) => setPtgManuel({ ...ptgManuel, technicienId: Number(v) })}
                  options={optTechniciens}
                  placeholder="Technicien…"
                  searchPlaceholder="Nom…"
                  size="sm"
                  className="min-w-36 flex-1"
                />
                <Input type="number" min={0} step="0.25" value={ptgManuel.dureeHeures} onChange={(e) => setPtgManuel({ ...ptgManuel, dureeHeures: e.target.value })} placeholder="Durée (h)" className="w-24 text-xs" />
                <Input value={ptgManuel.description} onChange={(e) => setPtgManuel({ ...ptgManuel, description: e.target.value })} placeholder="Description" className="flex-1 text-xs" />
              </div>
              <Button size="sm" variant="outline" className="gap-1 text-xs" disabled={pointer.isPending} onClick={saisieManuelle}>
                <Plus size={12} /> Enregistrer la durée
              </Button>
            </div>
          </div>
        )}

        {pointagesEnCours.length > 0 && (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
            {pointagesEnCours.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block size-2 animate-pulse rounded-full bg-destructive" />
                  <b>{p.technicienPrenom} {p.technicienNom}</b>
                  <span className="text-muted-foreground">pointage en cours{p.ligneLibelle ? ` — ${p.ligneLibelle}` : ""}</span>
                </span>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={pointer.isPending} onClick={() => terminer(p)}>
                  <Square size={11} /> Terminer
                </Button>
              </div>
            ))}
          </div>
        )}

        {(pointages ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Aucun pointage enregistré.</p>
        ) : (
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
            {(pointages ?? []).map((p: any) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
                <UserRound size={12} className="text-primary" />
                <b>{p.technicienPrenom} {p.technicienNom}</b>
                {p.ligneLibelle && <span className="text-muted-foreground">— {p.ligneLibelle}</span>}
                <span className="ml-auto font-mono">{p.duree != null ? `${p.duree.toLocaleString("fr-FR")} h` : "—"}</span>
                <span className="text-[10px] text-muted-foreground">{p.heureDebut ? new Date(p.heureDebut).toLocaleString("fr-FR") : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Signalement travaux supplémentaires ─── */}
      {peutEditer && (
        <div className="rounded-xl border border-dashed border-warning/40 bg-warning/5 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-warning-foreground">
            <AlertTriangle size={15} /> Signalement de travaux supplémentaires
          </h3>
          <div className="flex flex-wrap gap-2">
            <Input value={signaler} onChange={(e) => setSignaler(e.target.value)} placeholder="Ex : disque de frein arrière HS découvert pendant le démontage…" className="min-w-64 flex-1" />
            <Button size="sm" variant="outline" className="gap-1" onClick={signalerSupplements}>
              <Plus size={13} /> Signaler
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Le signalement devient une ligne « Supplément » — créez ensuite une nouvelle version de devis (onglet Devis) pour l'autoriser.
          </p>
        </div>
      )}

      {/* ─── Photos travaux ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <Camera size={15} className="text-primary" /> Photos travaux (avant / pendant / après)
          </h3>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setShowPhotos(!showPhotos)}>
            {showPhotos ? "Masquer" : "Voir / ajouter"} ({or.photos?.length ?? 0})
          </Button>
        </div>
        {showPhotos && (
          <div>
            {peutEditer && (
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4" className="mb-2 block text-xs" onChange={(e) => handleUpload(e.target.files)} disabled={uploading} />
            )}
            {uploading && <p className="mb-2 text-xs text-muted-foreground"><Loader2 className="mr-1 inline size-3 animate-spin" />Téléversement…</p>}
            {(or.photos ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune photo.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {(or.photos ?? []).map((p: any) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="group relative overflow-hidden rounded-lg border border-border">
                    {p.type === "PHOTO" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt="" className="aspect-square w-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-muted text-xs">🎬</div>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}