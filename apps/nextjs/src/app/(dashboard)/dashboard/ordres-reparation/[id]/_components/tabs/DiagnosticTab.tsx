"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Stethoscope, ClipboardList, Loader2, Send, CheckCircle2, Undo2, Plus, Trash2,
  ShieldCheck, AlertTriangle, Car, Wrench, FileText, Lock,
} from "lucide-react";
import { useOrPermissions } from "../../../_hooks/useOrPermissions";

const DVI_STATUTS = ["OK", "SURVEILLER", "DEFECTUEUX", "URGENT", "NON_INSPECTE"] as const;
const DVI_STATUT_LABELS: Record<string, string> = {
  OK: "OK",
  SURVEILLER: "À surveiller",
  DEFECTUEUX: "Défectueux",
  URGENT: "Urgent",
  NON_INSPECTE: "Non inspecté",
};
const DVI_STATUT_BADGE: Record<string, string> = {
  OK: "bg-success/10 text-success-foreground",
  SURVEILLER: "bg-warning/10 text-warning-foreground",
  DEFECTUEUX: "bg-destructive/10 text-destructive",
  URGENT: "bg-destructive/20 text-destructive",
  NON_INSPECTE: "bg-muted text-muted-foreground",
};
const DVI_PRIORITES = ["IMMEDIATE", "PROCHE_VISITE", "CONSEIL"] as const;
const DVI_PRIORITE_LABELS: Record<string, string> = {
  IMMEDIATE: "Immédiate",
  PROCHE_VISITE: "Prochaine visite",
  CONSEIL: "Conseil",
};
const DVI_TEMPLATES: Record<string, { label: string; points: Array<{ groupe: string; libelle: string }> }> = {
  MULTI_POINTS: {
    label: "Multi-points (complet)",
    points: [
      { groupe: "Extérieur", libelle: "Carrosserie / rayures" },
      { groupe: "Extérieur", libelle: "Pare-brise / vitres" },
      { groupe: "Extérieur", libelle: "Rétroviseurs" },
      { groupe: "Moteur", libelle: "Niveau d'huile" },
      { groupe: "Moteur", libelle: "Liquide de refroidissement" },
      { groupe: "Moteur", libelle: "Courroies / durites" },
      { groupe: "Habitacle", libelle: "Climatisation" },
      { groupe: "Habitacle", libelle: "Éclairage intérieur" },
      { groupe: "Freinage", libelle: "Plaquettes avant" },
      { groupe: "Freinage", libelle: "Plaquettes arrière" },
      { groupe: "Freinage", libelle: "Liquide de frein" },
      { groupe: "Pneumatiques", libelle: "Usure pneus avant" },
      { groupe: "Pneumatiques", libelle: "Usure pneus arrière" },
      { groupe: "Éclairage", libelle: "Feux avant / arrière" },
    ],
  },
  FREINS: {
    label: "Freins",
    points: [
      { groupe: "Freinage", libelle: "Plaquettes avant — épaisseur" },
      { groupe: "Freinage", libelle: "Plaquettes arrière — épaisseur" },
      { groupe: "Freinage", libelle: "Disques avant" },
      { groupe: "Freinage", libelle: "Disques arrière" },
      { groupe: "Freinage", libelle: "Liquide de frein" },
      { groupe: "Freinage", libelle: "Flexibles / durites" },
      { groupe: "Freinage", libelle: "Frein à main" },
    ],
  },
  ENTRETIEN: {
    label: "Entretien",
    points: [
      { groupe: "Moteur", libelle: "Vidange huile moteur" },
      { groupe: "Moteur", libelle: "Filtre à huile" },
      { groupe: "Moteur", libelle: "Filtre à air" },
      { groupe: "Moteur", libelle: "Filtre habitacle" },
      { groupe: "Moteur", libelle: "Bougies" },
      { groupe: "Moteur", libelle: "Liquide de refroidissement" },
    ],
  },
};

type LignePreco = { type: string; libelle: string; quantite: string; prixUnitaire: string; tva: string; dureeHeures: string };
type PointDvi = { groupe: string; libelle: string; statut: string; mesure: string; notes: string; recommandation: string; priorite: string };

function emptyPreco(): LignePreco {
  return { type: "SERVICE", libelle: "", quantite: "1", prixUnitaire: "", tva: "0", dureeHeures: "" };
}

/** Onglet 2 — Diagnostic : rapport + validation chef + inspection DVI + conversion en devis. */
export function DiagnosticTab({ or }: { or: any }) {
  const id = Number(or.id);
  const utils = api.useUtils();
  const { flags } = useOrPermissions();

  const rapport = or.rapportDiagnostic ?? null;
  const lignesPreco = (or.lignes ?? []).filter((l: any) => l.origine === "DIAGNOSTIC");
  const peutSoumettre = flags.canDiagnostiquer && or.statut === "EN_ATTENTE_DIAGNOSTIC";
  const peutValider = flags.valider && rapport?.statut === "SOUMIS";

  // ─── Formulaire rapport ───
  const [form, setForm] = useState({ constat: "", cause: "", codesDTC: "", tests: "" });
  const [lignes, setLignes] = useState<LignePreco[]>([emptyPreco()]);
  const [showRenvoi, setShowRenvoi] = useState(false);
  const [renvoiMotif, setRenvoiMotif] = useState("");

  const soumettre = api.or.creerRapportDiagnostic.useMutation({
    onSuccess: () => {
      toast.success("Diagnostic soumis pour validation");
      setForm({ constat: "", cause: "", codesDTC: "", tests: "" });
      setLignes([emptyPreco()]);
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const validerRapport = api.or.validerDiagnostic.useMutation({
    onSuccess: () => {
      toast.success("Diagnostic validé — OR passé en cours de travaux");
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const renvoyerRapport = api.or.retournerDiagnostic.useMutation({
    onSuccess: () => {
      toast.success("Diagnostic renvoyé au technicien");
      setShowRenvoi(false);
      setRenvoiMotif("");
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const soumettreRapport = () => {
    if (form.constat.trim().length < 3) {
      toast.error("Le constat est requis (3 caractères minimum)");
      return;
    }
    const lignesOk = lignes.filter((l) => l.libelle.trim());
    if (lignesOk.length === 0) {
      toast.error("Ajoutez au moins une préconisation (ligne)");
      return;
    }
    soumettre.mutate({
      orId: id,
      constat: form.constat.trim(),
      cause: form.cause.trim() || undefined,
      codesDTC: form.codesDTC.trim() || undefined,
      tests: form.tests.trim() || undefined,
      lignes: lignesOk.map((l) => ({
        type: (l.type as "PIECE") || "SERVICE",
        libelle: l.libelle.trim(),
        quantite: Number(l.quantite) || 1,
        prixUnitaire: Number(l.prixUnitaire) || 0,
        tva: Number(l.tva) || 0,
        dureeHeures: l.dureeHeures ? Number(l.dureeHeures) : undefined,
      })),
    });
  };

  // ─── DVI ───
  const { data: inspections, refetch: refetchInsp } = api.or.listerInspections.useQuery({ orId: id });
  const [showDvi, setShowDvi] = useState(false);
  const [dviTitre, setDviTitre] = useState("Inspection multi-points");
  const [dviTemplate, setDviTemplate] = useState("MULTI_POINTS");
  const [dviPoints, setDviPoints] = useState<PointDvi[]>([]);
  const [conversion, setConversion] = useState<Record<number, { prix: string; type: string }>>({});

  const sauvegarderDvi = api.or.sauvegarderInspection.useMutation({
    onSuccess: () => {
      toast.success("Inspection enregistrée");
      setShowDvi(false);
      setDviPoints([]);
      utils.or.getById.invalidate();
      refetchInsp();
    },
    onError: (e) => toast.error(e.message),
  });
  const envoyerDvi = api.or.envoyerInspection.useMutation({
    onSuccess: () => {
      toast.success("Inspection envoyée (figée)");
      refetchInsp();
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const convertirDvi = api.or.convertirPointsEnLignes.useMutation({
    onSuccess: () => {
      toast.success("Points convertis en lignes de devis");
      utils.or.getById.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const choisirTemplate = (tpl: string) => {
    setDviTemplate(tpl);
    setDviPoints(DVI_TEMPLATES[tpl]?.points.map((p) => ({
      groupe: p.groupe,
      libelle: p.libelle,
      statut: "NON_INSPECTE",
      mesure: "",
      notes: "",
      recommandation: "",
      priorite: "CONSEIL",
    })) ?? []);
  };

  const setPoint = (i: number, patch: Partial<PointDvi>) => {
    setDviPoints((pts) => pts.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const enregistrerDvi = () => {
    const ok = dviPoints.filter((p) => p.libelle.trim());
    if (ok.length === 0) {
      toast.error("Ajoutez au moins un point d'inspection");
      return;
    }
    sauvegarderDvi.mutate({
      orId: id,
      template: dviTemplate,
      titre: dviTitre.trim() || "Inspection",
      points: ok.map((p) => ({
        groupe: p.groupe.trim() || "Général",
        libelle: p.libelle.trim(),
        statut: p.statut as any,
        mesure: p.mesure || undefined,
        notes: p.notes || undefined,
        recommandation: p.recommandation || undefined,
        priorite: p.priorite as any,
      })),
    });
  };

  const pointsAConvertir = (insp: any) =>
    (insp.points ?? []).filter((p: any) => p.statut === "DEFECTUEUX" || p.statut === "URGENT");

  const lancerConversion = (insp: any) => {
    const cfg = conversion[insp.id];
    const pts = pointsAConvertir(insp);
    convertirDvi.mutate({
      orId: id,
      pointIds: pts.map((p: any) => p.id),
      prixUnitaire: cfg?.prix ? Number(cfg.prix) : 0,
      type: (cfg?.type as any) ?? "SERVICE",
    });
  };

  const groupesDvi = (insp: any) => {
    const map = new Map<string, any[]>();
    for (const p of insp.points ?? []) {
      const cur = map.get(p.groupe) ?? [];
      cur.push(p);
      map.set(p.groupe, cur);
    }
    return [...map.entries()];
  };

  return (
    <div className="space-y-4">
      {/* ─── Rapport de diagnostic ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <Stethoscope size={15} className="text-primary" /> Rapport de diagnostic
        </h3>

        {!rapport || rapport.statut === "RETOURNE" ? (
          <div className="space-y-3">
            {rapport?.statut === "RETOURNE" && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
                <Undo2 size={15} className="mt-0.5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">Diagnostic renvoyé par le chef d'atelier</p>
                  {rapport.commentaireValidateur && <p className="mt-0.5 text-xs text-destructive/90">{rapport.commentaireValidateur}</p>}
                </div>
              </div>
            )}
            {!peutSoumettre && (
              <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                <Lock size={13} />
                {or.statut !== "EN_ATTENTE_DIAGNOSTIC"
                  ? `Le diagnostic ne peut être soumis qu'à l'état « En attente diagnostic » (état actuel : ${or.statut}).`
                  : "Vous n'avez pas la permission de soumettre un diagnostic."}
              </p>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Constat *</Label>
              <textarea
                value={form.constat}
                onChange={(e) => setForm({ ...form, constat: e.target.value })}
                rows={3}
                placeholder="Description technique du constat…"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                disabled={!peutSoumettre}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Cause probable / racine</Label>
              <textarea
                value={form.cause}
                onChange={(e) => setForm({ ...form, cause: e.target.value })}
                rows={2}
                placeholder="Cause probable…"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                disabled={!peutSoumettre}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Codes défaut (DTC)</Label>
                <Input
                  value={form.codesDTC}
                  onChange={(e) => setForm({ ...form, codesDTC: e.target.value })}
                  placeholder="Ex : P0301, P0171"
                  className="mt-1"
                  disabled={!peutSoumettre}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Outils / tests réalisés</Label>
                <Input
                  value={form.tests}
                  onChange={(e) => setForm({ ...form, tests: e.target.value })}
                  placeholder="Ex : valise OBD, test compression…"
                  className="mt-1"
                  disabled={!peutSoumettre}
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Préconisations (alimentent le devis) *</Label>
                {peutSoumettre && (
                  <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={() => setLignes([...lignes, emptyPreco()])}>
                    <Plus size={12} /> Ajouter une ligne
                  </Button>
                )}
              </div>
              <div className="space-y-1.5">
                {lignes.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 items-center gap-1.5 rounded-lg border border-border bg-background p-1.5">
                    <select
                      value={l.type}
                      onChange={(e) => setLignes(lignes.map((x, idx) => (idx === i ? { ...x, type: e.target.value } : x)))}
                      className="col-span-2 rounded border border-border bg-background px-1 py-1 text-xs"
                      disabled={!peutSoumettre}
                    >
                      <option value="SERVICE">MO</option>
                      <option value="PIECE">Pièce</option>
                    </select>
                    <input
                      value={l.libelle}
                      onChange={(e) => setLignes(lignes.map((x, idx) => (idx === i ? { ...x, libelle: e.target.value } : x)))}
                      placeholder="Désignation"
                      className="col-span-4 rounded border border-border bg-background px-2 py-1 text-xs"
                      disabled={!peutSoumettre}
                    />
                    <input
                      type="number"
                      min={0}
                      value={l.quantite}
                      onChange={(e) => setLignes(lignes.map((x, idx) => (idx === i ? { ...x, quantite: e.target.value } : x)))}
                      placeholder="Qté"
                      className="col-span-1 rounded border border-border bg-background px-1 py-1 text-xs"
                      disabled={!peutSoumettre}
                    />
                    <input
                      type="number"
                      min={0}
                      value={l.prixUnitaire}
                      onChange={(e) => setLignes(lignes.map((x, idx) => (idx === i ? { ...x, prixUnitaire: e.target.value } : x)))}
                      placeholder="P.U."
                      className="col-span-2 rounded border border-border bg-background px-1 py-1 text-xs"
                      disabled={!peutSoumettre}
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={l.dureeHeures}
                      onChange={(e) => setLignes(lignes.map((x, idx) => (idx === i ? { ...x, dureeHeures: e.target.value } : x)))}
                      placeholder="h"
                      className="col-span-1 rounded border border-border bg-background px-1 py-1 text-xs"
                      disabled={!peutSoumettre}
                    />
                    {peutSoumettre && (
                      <button
                        type="button"
                        className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive"
                        onClick={() => setLignes(lignes.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {peutSoumettre && (
              <div className="flex justify-end">
                <Button onClick={soumettreRapport} disabled={soumettre.isPending} className="gap-1.5 text-xs">
                  {soumettre.isPending ? <Loader2 className="size-3 animate-spin" /> : <Send size={14} />}
                  Soumettre le diagnostic
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                rapport.statut === "VALIDE" ? "bg-success/10 text-success-foreground" : "bg-warning/10 text-warning-foreground"
              }`}>
                {rapport.statut === "VALIDE" ? "Validé" : "Soumis — en attente de validation"}
              </span>
              {rapport.statut === "VALIDE" && rapport.valideLe && (
                <span className="text-xs text-muted-foreground">
                  Validé le {new Date(rapport.valideLe).toLocaleString("fr-FR")}
                  {rapport.commentaireValidateur ? ` — ${rapport.commentaireValidateur}` : ""}
                </span>
              )}
            </div>
            <div className="rounded-lg border border-border bg-background p-3 text-sm">
              <p className="font-medium">Constat</p>
              <p className="mt-0.5 text-muted-foreground">{rapport.constat}</p>
              {rapport.cause && (
                <>
                  <p className="mt-2 font-medium">Cause probable</p>
                  <p className="mt-0.5 text-muted-foreground">{rapport.cause}</p>
                </>
              )}
              {rapport.codesDTC && (
                <p className="mt-2 text-xs text-muted-foreground"><b>DTC :</b> {rapport.codesDTC}</p>
              )}
              {rapport.tests && (
                <p className="mt-1 text-xs text-muted-foreground"><b>Tests :</b> {rapport.tests}</p>
              )}
            </div>
            {lignesPreco.length > 0 && (
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Préconisations ({lignesPreco.length})
                </p>
                <ul className="space-y-1 text-sm">
                  {lignesPreco.map((l: any) => (
                    <li key={l.id} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        {l.type === "SERVICE" ? <Wrench size={13} className="text-primary" /> : <Car size={13} className="text-primary" />}
                        {l.libelle} × {l.quantite}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {Number(l.prixUnitaire).toLocaleString("fr-FR")} F
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {peutValider && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" className="gap-1.5 text-xs" onClick={() => setShowRenvoi(true)}>
                  <Undo2 size={14} /> Renvoyer
                </Button>
                <Button
                  className="gap-1.5 text-xs"
                  disabled={validerRapport.isPending}
                  onClick={() => validerRapport.mutate({ rapportId: rapport.id })}
                >
                  {validerRapport.isPending ? <Loader2 className="size-3 animate-spin" /> : <ShieldCheck size={14} />}
                  Valider le diagnostic
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Renvoi (motif chef) ─── */}
      {showRenvoi && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <Label className="text-xs font-semibold text-destructive">Motif du renvoi *</Label>
          <textarea
            value={renvoiMotif}
            onChange={(e) => setRenvoiMotif(e.target.value)}
            rows={2}
            placeholder="Raison du renvoi au technicien…"
            className="mt-1 w-full rounded-lg border border-destructive/30 bg-background px-3 py-2 text-sm outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowRenvoi(false)}>Annuler</Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={renvoiMotif.trim().length < 3 || renvoyerRapport.isPending}
              onClick={() => renvoyerRapport.mutate({ rapportId: rapport.id, commentaire: renvoiMotif.trim() })}
            >
              {renvoyerRapport.isPending ? <Loader2 className="size-3 animate-spin" /> : <Send size={13} />}
              Renvoyer le diagnostic
            </Button>
          </div>
        </div>
      )}

      {/* ─── Inspection DVI ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <ClipboardList size={15} className="text-primary" /> Inspection DVI
          </h3>
          {flags.canDiagnostiquer && !showDvi && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setShowDvi(true)}>
              <Plus size={13} /> Nouvelle inspection
            </Button>
          )}
        </div>

        {showDvi && (
          <div className="mb-4 space-y-3 rounded-lg border border-dashed border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Titre</Label>
                <Input value={dviTitre} onChange={(e) => setDviTitre(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Template</Label>
                <select
                  value={dviTemplate}
                  onChange={(e) => choisirTemplate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  {Object.entries(DVI_TEMPLATES).map(([k, t]) => (
                    <option key={k} value={k}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Points d'inspection ({dviPoints.length})</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-xs"
                  onClick={() => setDviPoints([...dviPoints, { groupe: "Général", libelle: "", statut: "NON_INSPECTE", mesure: "", notes: "", recommandation: "", priorite: "CONSEIL" }])}
                >
                  <Plus size={12} /> Point
                </Button>
              </div>
              {dviPoints.map((p, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-1.5 rounded-lg border border-border bg-background p-1.5">
                  <input
                    value={p.groupe}
                    onChange={(e) => setPoint(i, { groupe: e.target.value })}
                    placeholder="Groupe"
                    className="col-span-2 rounded border border-border bg-background px-1 py-1 text-xs"
                  />
                  <input
                    value={p.libelle}
                    onChange={(e) => setPoint(i, { libelle: e.target.value })}
                    placeholder="Point inspecté"
                    className="col-span-4 rounded border border-border bg-background px-2 py-1 text-xs"
                  />
                  <select
                    value={p.statut}
                    onChange={(e) => setPoint(i, { statut: e.target.value })}
                    className="col-span-2 rounded border border-border bg-background px-1 py-1 text-xs"
                  >
                    {DVI_STATUTS.map((s) => (
                      <option key={s} value={s}>{DVI_STATUT_LABELS[s]}</option>
                    ))}
                  </select>
                  <input
                    value={p.mesure}
                    onChange={(e) => setPoint(i, { mesure: e.target.value })}
                    placeholder="Mesure"
                    className="col-span-1 rounded border border-border bg-background px-1 py-1 text-xs"
                  />
                  <select
                    value={p.priorite}
                    onChange={(e) => setPoint(i, { priorite: e.target.value })}
                    className="col-span-1 rounded border border-border bg-background px-1 py-1 text-xs"
                  >
                    {DVI_PRIORITES.map((pr) => (
                      <option key={pr} value={pr}>{DVI_PRIORITE_LABELS[pr]}</option>
                    ))}
                  </select>
                  <input
                    value={p.notes}
                    onChange={(e) => setPoint(i, { notes: e.target.value })}
                    placeholder="Notes"
                    className="col-span-1 rounded border border-border bg-background px-1 py-1 text-xs"
                  />
                  <button
                    type="button"
                    className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive"
                    onClick={() => setDviPoints(dviPoints.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowDvi(false); setDviPoints([]); }}>
                Annuler
              </Button>
              <Button size="sm" className="gap-1.5" disabled={sauvegarderDvi.isPending} onClick={enregistrerDvi}>
                {sauvegarderDvi.isPending ? <Loader2 className="size-3 animate-spin" /> : <FileText size={14} />}
                Enregistrer l'inspection
              </Button>
            </div>
          </div>
        )}

        {(inspections ?? []).length === 0 && !showDvi ? (
          <p className="text-sm text-muted-foreground">Aucune inspection. Créez une inspection multi-points pour structurer le diagnostic.</p>
        ) : (
          <div className="space-y-3">
            {(inspections ?? []).map((insp: any) => (
              <div key={insp.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{insp.titre}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      insp.statut === "ENVOYE" ? "bg-success/10 text-success-foreground" : "bg-warning/10 text-warning-foreground"
                    }`}>
                      {insp.statut === "ENVOYE" ? "Envoyée (figée)" : "Brouillon"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(insp.createdAt).toLocaleDateString("fr-FR")} · {DVI_TEMPLATES[insp.template]?.label ?? insp.template}
                    </span>
                  </div>
                  {flags.canDiagnostiquer && insp.statut !== "ENVOYE" && (
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={envoyerDvi.isPending} onClick={() => envoyerDvi.mutate({ inspectionId: insp.id })}>
                      <Send size={12} /> Figer / envoyer
                    </Button>
                  )}
                </div>

                {groupesDvi(insp).map(([groupe, pts]) => (
                  <div key={groupe} className="mt-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{groupe}</p>
                    <ul className="mt-1 space-y-1">
                      {pts.map((p: any) => (
                        <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${DVI_STATUT_BADGE[p.statut] ?? ""}`}>
                            {DVI_STATUT_LABELS[p.statut] ?? p.statut}
                          </span>
                          <span>{p.libelle}</span>
                          {p.mesure && <span className="text-xs text-muted-foreground">· {p.mesure}</span>}
                          {p.priorite && p.priorite !== "CONSEIL" && (
                            <span className="text-[10px] text-muted-foreground">· {DVI_PRIORITE_LABELS[p.priorite]}</span>
                          )}
                          {p.notes && <span className="text-xs text-muted-foreground">· {p.notes}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {flags.canDiagnostiquer && pointsAConvertir(insp).length > 0 && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-warning/40 bg-warning/5 p-2">
                    <div className="flex items-center gap-1.5 text-xs">
                      <AlertTriangle size={13} className="text-warning-foreground" />
                      <span className="font-medium">{pointsAConvertir(insp).length} point(s) défectueux/urgent — convertir en devis :</span>
                    </div>
                    <select
                      value={conversion[insp.id]?.type ?? "SERVICE"}
                      onChange={(e) => setConversion({ ...conversion, [insp.id]: { prix: conversion[insp.id]?.prix ?? "", type: e.target.value } })}
                      className="rounded border border-border bg-background px-2 py-1 text-xs"
                    >
                      <option value="SERVICE">Main d'œuvre</option>
                      <option value="PIECE">Pièce</option>
                    </select>
                    <Input
                      type="number"
                      min={0}
                      value={conversion[insp.id]?.prix ?? ""}
                      onChange={(e) => setConversion({ ...conversion, [insp.id]: { prix: e.target.value, type: conversion[insp.id]?.type ?? "SERVICE" } })}
                      placeholder="P.U."
                      className="h-7 w-24 text-xs"
                    />
                    <Button
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      disabled={convertirDvi.isPending}
                      onClick={() => lancerConversion(insp)}
                    >
                      <Wrench size={12} /> Convertir
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        <CheckCircle2 size={13} className="text-primary" />
        Les préconisations du diagnostic et les points DVI convertis alimentent automatiquement l'onglet Devis & Autorisation.
      </p>
    </div>
  );
}