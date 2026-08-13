"use client";

import { useState, useRef, useMemo } from "react";
import { api } from "~/trpc/react";
import { ArrowLeft, Upload, FileText, CheckCircle2, AlertCircle, Download, BookOpen, X, FileSpreadsheet } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { toast } from "sonner";
import Link from "next/link";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

type LigneImport = {
  titre: string;
  auteur: string;
  editeur: string;
  niveauScolaire: string;
  matiere: string;
  prixVente: string;
  priorite: "obligatoire" | "suggere";
};

type ColumnMap = { fileCol: string; systemField: string };
const SYSTEM_FIELDS = [
  { value: "titre", label: "Titre *" },
  { value: "auteur", label: "Auteur" },
  { value: "editeur", label: "Éditeur" },
  { value: "niveauScolaire", label: "Niveau scolaire" },
  { value: "matiere", label: "Matière" },
  { value: "prixVente", label: "Prix vente" },
  { value: "priorite", label: "Priorité" },
  { value: "_skip", label: "(Ignorer)" },
];

const STEPS = ["Paramètres", "Mapping", "Aperçu", "Finalisation"];

export default function ImportPage() {
  const [step, setStep] = useState(0);
  const [rawText, setRawText] = useState("");
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [ministere, setMinistere] = useState<"MINESEC" | "MINEDUB">("MINESEC");
  const [anneeScolaire, setAnneeScolaire] = useState("2026-2027");
  const [nomListe, setNomListe] = useState("");
  const [resultat, setResultat] = useState<{ created: number; skipped: number; total: number; errors?: { titre: string; raison: string }[] } | null>(null);
  const [fileName, setFileName] = useState("");
  const [columnMaps, setColumnMaps] = useState<ColumnMap[]>([]);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lignes = useMemo<LigneImport[]>(() => {
    if (!rawRows.length || !columnMaps.length) return [];
    const fieldIndex = (field: string): number => {
      const idx = columnMaps.findIndex(m => m.systemField === field);
      return idx >= 0 ? idx : -1;
    };
    const idxTitre = fieldIndex("titre");
    const idxAuteur = fieldIndex("auteur");
    const idxEditeur = fieldIndex("editeur");
    const idxNiveau = fieldIndex("niveauScolaire");
    const idxMatiere = fieldIndex("matiere");
    const idxPrix = fieldIndex("prixVente");
    const idxPriorite = fieldIndex("priorite");
    return rawRows.map(cols => ({
      titre: idxTitre >= 0 ? (cols[idxTitre] ?? "") : "",
      auteur: idxAuteur >= 0 ? (cols[idxAuteur] ?? "") : "",
      editeur: idxEditeur >= 0 ? (cols[idxEditeur] ?? "") : "",
      niveauScolaire: idxNiveau >= 0 ? (cols[idxNiveau] ?? "") : "",
      matiere: idxMatiere >= 0 ? (cols[idxMatiere] ?? "") : "",
      prixVente: idxPrix >= 0 ? (cols[idxPrix] ?? "0") : "0",
      priorite: (idxPriorite >= 0 && cols[idxPriorite] === "suggere" ? "suggere" : "obligatoire") as "obligatoire" | "suggere",
    })).filter(l => l.titre);
  }, [rawRows, columnMaps]);

  const utils = api.useUtils();
  const { data: anneesScolaires } = api.reference.listAnneesScolaires.useQuery();

  const bulkImport = api.catalog.bulkImport.useMutation({
    onSuccess: (res) => { setResultat(res); utils.catalog.list.invalidate(); toast.success("Import terminé"); },
    onError: (e) => toast.error(`Erreur import: ${e.message}`),
  });

  function parseCSV(text: string) {
    const lines = text.trim().split("\n").filter(Boolean);
    if (lines.length < 2) { setErrors(["Le fichier doit contenir au moins 2 lignes (en-tête + données)"]); return; }
    const first = lines[0];
    if (!first) { setErrors(["Fichier vide"]); return; }
    const headers = first.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    setFileHeaders(headers);
    setColumnMaps(headers.map(h => ({ fileCol: h, systemField: "_skip" })));
    const parsed: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      if (cols.length < 1 || !cols[0]) continue;
      parsed.push(cols);
    }
    setRawRows(parsed);
    setErrors([]);
    setStep(1);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Fichier trop volumineux (max 10 Mo)"); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRawText(text);
      parseCSV(text);
    };
    reader.readAsText(file);
  }

  function autoDetectMapping() {
    setColumnMaps(prev => prev.map(m => {
      const lower = m.fileCol.toLowerCase();
      const match = SYSTEM_FIELDS.find(f =>
        f.value !== "_skip" && (lower.includes(f.value.toLowerCase()) || lower.includes(f.label.toLowerCase().replace("*", "").trim()))
      );
      return { ...m, systemField: match?.value ?? "_skip" };
    }));
  }

  function getNiveauLabel(niveau: string): string {
    const map: Record<string, string> = {
      "6e": "6e", "5e": "5e", "4e": "4e", "3e": "3e",
      "2nde": "Seconde", "1re": "Première", "tle": "Terminale",
      "cp": "CP", "ce1": "CE1", "ce2": "CE2", "cm1": "CM1", "cm2": "CM2",
    };
    return map[niveau.toLowerCase()] ?? niveau;
  }

  const mappedLignes = lignes.length > 0 && columnMaps.length > 0
    ? lignes : [];

  if (resultat) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="rounded-xl border border-border bg-card p-8 text-center max-w-lg mx-auto">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="size-7 text-success-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Import terminé</h2>
          <div className="mt-4 flex justify-center gap-6">
            <div className="text-center"><p className="text-2xl font-bold text-success-foreground">{resultat.created}</p><p className="text-sm text-muted-foreground">Créés</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-warning-foreground">{resultat.skipped}</p><p className="text-sm text-muted-foreground">Ignorés</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-foreground">{resultat.total}</p><p className="text-sm text-muted-foreground">Total</p></div>
          </div>
          {resultat.errors && resultat.errors.length > 0 && (
            <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-border bg-background p-3 text-left">
              <p className="mb-2 text-xs font-semibold text-warning-foreground">
                Lignes ignorées ({resultat.errors.length})
              </p>
              <ul className="space-y-1">
                {resultat.errors.map((e, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{e.titre}</span> — {e.raison}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/dashboard/catalog"><Button>Voir le catalogue</Button></Link>
            <Button variant="secondary" onClick={() => { setResultat(null); setRawRows([]); setRawText(""); setStep(0); setFileName(""); }}>Nouvel import</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <Link href="/dashboard/catalog" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" />
          Retour au catalogue
        </Link>
        <div className="mt-2">
          <h1 className="text-lg font-semibold text-foreground">Import listes officielles</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Assistant d&apos;import des listes scolaires MINESEC / MINEDUB</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2">
        {STEPS.map((label, i) => (
          <button key={i} type="button" disabled={i > step}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-xs font-medium transition-all ${
              i === step ? "bg-primary text-primary-foreground" :
              i < step ? "bg-primary/20 text-primary" :
              "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {/* STEP 0 — Parameters */}
      {step === 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
            <BookOpen className="size-4 text-primary" />
            Paramètres de l&apos;import
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Année scolaire cible *</Label>
              <Select value={anneeScolaire} onValueChange={setAnneeScolaire}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {anneesScolaires?.map(a => (
                    <SelectItem key={a.id} value={a.libelle}>{a.libelle}</SelectItem>
                  ))}
                  <SelectItem value="__create__">+ Créer une nouvelle année</SelectItem>
                </SelectContent>
              </Select>
              {anneeScolaire === "__create__" && (
                <Input value={nomListe} onChange={e => setAnneeScolaire(e.target.value)} placeholder="Ex: 2027-2028" />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Ministère source *</Label>
              <div className="flex gap-4 mt-1">
                {["MINESEC", "MINEDUB"].map(m => (
                  <label key={m} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input type="radio" name="ministere" checked={ministere === m}
                      onChange={() => setMinistere(m as "MINESEC" | "MINEDUB")} className="accent-primary" />
                    {m === "MINESEC" ? "MINESEC (Secondaire)" : "MINEDUB (Base)"}
                  </label>
                ))}
              </div>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>Fichier source *</Label>
              <div className="rounded-lg border-2 border-dashed border-border bg-muted/30 p-6 text-center hover:border-ring transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}>
                <FileSpreadsheet className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-1 text-sm text-muted-foreground">Glisser-déposer ou choisir un fichier</p>
                <p className="text-xs text-muted-foreground/70">Formats: .csv (max 10 Mo)</p>
                <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
              </div>
              {fileName && (
                <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">
                  <span className="text-success-foreground"><FileText className="inline size-3 mr-1" />{fileName}</span>
                  <button onClick={() => { setFileName(""); setRawText(""); setRawRows([]); }} className="text-muted-foreground hover:text-foreground">
                    <X className="size-3" />
                  </button>
                </div>
              )}
              <div className="mt-2 text-center">
                <span className="text-xs text-muted-foreground/70">Ou </span>
                <button onClick={() => setStep(1)}
                  className="text-xs text-primary hover:text-primary/80 underline underline-offset-2">
                  passer cette étape (saisie manuelle)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 1 — Column Mapping */}
      {step === 1 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
            <FileText className="size-4 text-primary" />
            Mapping des colonnes
          </h2>
          {fileHeaders.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-lg border border-border/50">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Colonne fichier</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground"></th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Champ système</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border/50">
                    {columnMaps.map((m, i) => (
                      <tr key={i} className="hover:bg-accent/50">
                        <td className="px-3 py-2 text-foreground">{m.fileCol}</td>
                        <td className="px-3 py-2 text-center text-muted-foreground/70">→</td>
                        <td className="px-3 py-2">
                          <Select value={m.systemField} onValueChange={v => setColumnMaps(prev =>
                            prev.map((cm, j) => j === i ? { ...cm, systemField: v } : cm)
                          )}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SYSTEM_FIELDS.map(f => (
                                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex gap-2">
                <Button onClick={autoDetectMapping} variant="secondary" className="text-xs">
                  Détection automatique
                </Button>
                <p className="text-xs text-muted-foreground self-center ml-2">💡 Mapping basé sur les noms de colonnes</p>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm text-warning-foreground">
                <AlertCircle className="size-4 shrink-0" />
                Aucun fichier chargé. Collez les données CSV ci-dessous.
              </div>
              <textarea value={rawText} onChange={e => setRawText(e.target.value)}
                rows={8} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground outline-none transition-all duration-200 focus:border-ring focus:ring-2 focus:ring-ring/20 resize-y font-mono text-sm"
                placeholder="Collez ici les données CSV (titre, auteur, editeur, niveau, matière, prix, priorité)..."
              />
              <div className="flex gap-2">
                <Button onClick={() => { if (rawText.trim()) parseCSV(rawText); }} disabled={!rawText.trim()}>
                  <Upload className="size-4" /> Analyser
                </Button>
                <Button onClick={() => {
                  const header = "titre,auteur,editeur,niveauScolaire,matiere,prixVente,priorite";
                  const sample = ["Mathématiques 6e,Colin,Hatier,6e,Mathématiques,4500,obligatoire","Français 6e,Bertrand,Edicef,6e,Français,4200,obligatoire"].join("\n");
                  const blob = new Blob([header + "\n" + sample], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = "modele-import-liste-scolaire.csv"; a.click(); URL.revokeObjectURL(url);
                }} variant="secondary">
                  <Download className="size-4" /> Modèle CSV
                </Button>
              </div>
            </div>
          )}
          {errors.length > 0 && (
            <div className="mt-3 space-y-1">
              {errors.map((e, i) => <p key={i} className="text-xs text-destructive">{e}</p>)}
            </div>
          )}
        </div>
      )}

      {/* STEP 2 — Preview */}
      {step === 2 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
            <FileText className="size-4 text-primary" />
            Aperçu ({lignes.length} ligne{lignes.length !== 1 ? "s" : ""})
            <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success-foreground">
              {lignes.filter(l => l.priorite === "obligatoire").length} obligatoires
            </span>
          </h2>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border/50">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {["Titre", "Auteur", "Éditeur", "Niveau", "Matière", "Prix", "Priorité"].map(col => (
                    <th key={col} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {lignes.slice(0, 50).map((l, i) => (
                  <tr key={i} className="hover:bg-accent/50 transition-colors">
                    <td className="px-3 py-2 font-medium text-foreground">{l.titre}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.auteur}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.editeur}</td>
                    <td className="px-3 py-2 text-foreground">{getNiveauLabel(l.niveauScolaire)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.matiere}</td>
                    <td className="px-3 py-2 font-mono text-foreground">{Number(l.prixVente).toLocaleString()} F</td>
                    <td className="px-3 py-2">
                      {l.priorite === "obligatoire" ? (
                        <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success-foreground">Obligatoire</span>
                      ) : (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">Suggéré</span>
                      )}
                    </td>
                  </tr>
                ))}
                {lignes.length > 50 && (
                  <tr><td colSpan={7} className="px-3 py-2 text-center italic text-muted-foreground">+{lignes.length - 50} lignes supplémentaires</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STEP 3 — Finalisation + Import */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
              <CheckCircle2 className="size-4 text-success-foreground" />
              Finalisation
            </h2>
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-2 text-sm">
              <div className="flex justify-between text-foreground/80"><span>Ministère</span><span className="font-medium text-foreground">{ministere}</span></div>
              <div className="flex justify-between text-foreground/80"><span>Année scolaire</span><span className="font-medium text-foreground">{anneeScolaire}</span></div>
              <div className="flex justify-between text-foreground/80"><span>Produits à importer</span><span className="font-medium text-foreground">{lignes.length}</span></div>
              <div className="flex justify-between text-foreground/80"><span>Dont obligatoires</span><span className="font-medium text-success-foreground">{lignes.filter(l => l.priorite === "obligatoire").length}</span></div>
            </div>
            <div className="mt-4 flex gap-3">
              <Button onClick={() => bulkImport.mutate({
                items: lignes,
                nomListe: nomListe || `Liste ${ministere} ${anneeScolaire}`,
                anneeScolaire,
                ministere,
              })} disabled={bulkImport.isPending} className="flex-1">
                {bulkImport.isPending ? "Import en cours..." : `Importer ${lignes.length} produit${lignes.length !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation footer */}
      <div className="flex justify-between border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={() => setStep(s => Math.max(0, s - 1))}
          className={`${step === 0 ? "invisible" : ""}`}>
          ← Précédent
        </Button>
        <div className="flex gap-2">
          {step < 3 ? (
            <Button onClick={() => {
              if (step === 0 && !fileName && !rawText.trim()) { toast.error("Veuillez charger un fichier"); return; }
              if (step === 1 && lignes.length === 0 && !rawText.trim()) { toast.error("Aucune donnée à importer"); return; }
              setStep(s => Math.min(s + 1, 3));
            }}>
              Suivant →
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
