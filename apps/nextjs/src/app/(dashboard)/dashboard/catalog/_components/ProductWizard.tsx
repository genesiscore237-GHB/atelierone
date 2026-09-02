"use client";

import { useState, useMemo } from "react";
import { Loader2, Search, PackagePlus, Plus, X, Wand2, RotateCcw, Trash2 } from "lucide-react";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

/**
 * FORMULAIRE PRODUIT / PIÈCE — wireframe MVP.
 * Layout 2 colonnes : gauche (Identification, Classification, Compatibilité
 * véhicule, Médias) · droite (Prix & tarification, Gestion de stock,
 * Fournisseur, Infos complémentaires). Pied sticky avec Enregistrer /
 * Enregistrer et créer un autre / Annuler.
 */

const TYPE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "PIECE", label: "Pièce détachée", hint: "Neuve, adaptable, échange, réemploi…" },
  { value: "CONSOMMABLE", label: "Consommable", hint: "Huiles, liquides, fournitures…" },
  { value: "OUTIL", label: "Outillage", hint: "Matériel prêté aux techniciens" },
  { value: "SERVICE", label: "Main d'œuvre", hint: "Prestation / tarif horaire" },
];

function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

interface ProductWizardProps {
  onSave: (data: any) => Promise<void>;
  isPending: boolean;
  defaultValues?: any;
  onSaveCreateAnother?: (data: any) => Promise<void>;
  derniereModification?: string;
}

export function ProductWizard({ onSave, isPending, defaultValues, onSaveCreateAnother, derniereModification }: ProductWizardProps) {
  const isEdit = !!defaultValues?.id;
  const [typeProduit, setTypeProduit] = useState<string>(defaultValues?.typeProduit ?? "PIECE");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [f, setF] = useState<Record<string, any>>(() => (defaultValues ? { ...defaultValues } : {}));
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const { data: categories } = api.catalog.listCategories.useQuery();
  const { data: unitesMesure } = api.reference.listUnitesMesure.useQuery();
  const { data: fournisseurs } = api.reference.listFournisseurs.useQuery();
  const { data: emplacements } = api.stock.listEmplacements.useQuery({});

  // Anti-doublon : recherche avant création
  const [dupQ, setDupQ] = useState("");
  const [dupModal, setDupModal] = useState<{ id: number; titre: string; qte: string; emplacementId: string; motif: string } | null>(null);
  const { data: dupResults } = api.catalog.listProducts.useQuery(
    { query: dupQ || undefined, limit: 8 },
    { enabled: dupQ.trim().length >= 2 && !isEdit }
  );
  const utils = api.useUtils();
  const ajouterStock = api.stock.ajouterStock.useMutation({
    onSuccess: (r) => { toast.success(`Stock mis à jour : ${r.stockAvant} → ${r.stockApres}`); utils.stock.invalidate(); utils.catalog.invalidate(); setDupModal(null); setDupQ(""); },
    onError: (e) => toast.error(e.message),
  });

  // ─── Classification (référentiel 3 niveaux) ───
  const compatible = (branche: string | null) => {
    if (!branche || typeProduit === "SERVICE") return false;
    if (branche === typeProduit) return true;
    return (branche === "PIECE" || branche === "CONSOMMABLE") && (typeProduit === "PIECE" || typeProduit === "CONSOMMABLE");
  };
  const familles = useMemo(() => (categories ?? []).filter((c: any) => !c.parentId && compatible(c.typeBranche)), [categories, typeProduit]);
  const estParent = (id: string) => (categories ?? []).some((c: any) => String(c.parentId) === String(id));
  const sousDe = (id: string) => (categories ?? []).filter((c: any) => String(c.parentId) === String(id));
  const categorieChoisie = f.categorieId ? (categories ?? []).find((c: any) => String(c.id) === String(f.categorieId)) : null;
  const sousChoisie = categorieChoisie?.parentId ? (categories ?? []).find((c: any) => String(c.id) === String(categorieChoisie.parentId)) : null;
  const familleChoisie = sousChoisie?.parentId
    ? (categories ?? []).find((c: any) => String(c.id) === String(sousChoisie.parentId))
    : (categorieChoisie && !estParent(String(categorieChoisie.id)) ? categorieChoisie : null);
  const familleId = String(f.familleId ?? familleChoisie?.id ?? "");
  const sousOptions = familleId ? sousDe(familleId).filter((c: any) => estParent(String(c.id))) : [];
  const sousId = String(f.sousCategorieId ?? sousChoisie?.id ?? "");
  const articleOptions = sousId ? sousDe(sousId) : (familleId && sousOptions.length === 0 ? sousDe(familleId) : []);
  const setFamille = (v: string) => setF({ ...f, familleId: v, sousCategorieId: "", categorieId: "" });
  const setSous = (v: string) => setF({ ...f, sousCategorieId: v, categorieId: "" });

  // ─── Suggestion de catégorie selon la désignation (wireframe) ───
  const suggestion = useMemo(() => {
    const titre = (f.titre ?? "").toLowerCase();
    const mots = titre.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    if (mots.length === 0) return null;
    const feuilles = (categories ?? []).filter((c: any) => !estParent(String(c.id)));
    for (const feuille of feuilles) {
      const nom = String(feuille.nom ?? "").toLowerCase();
      if (mots.some((m) => nom.includes(m))) {
        const sous = (categories ?? []).find((c: any) => String(c.id) === String(feuille.parentId));
        const fam = sous?.parentId ? (categories ?? []).find((c: any) => String(c.id) === String(sous.parentId)) : null;
        return { feuille, sous, fam };
      }
    }
    return null;
  }, [f.titre, categories]);
  const appliquerSuggestion = () => {
    if (!suggestion) return;
    setF({
      ...f,
      familleId: String(suggestion.fam?.id ?? suggestion.sous?.id ?? suggestion.feuille.id),
      sousCategorieId: suggestion.sous ? String(suggestion.sous.id) : "",
      categorieId: String(suggestion.feuille.id),
    });
    toast.success("Catégorie suggérée appliquée");
  };

  // ─── Prix : marge & TTC calculés ───
  const prixAchat = Number(f.prixAchat ?? 0);
  const prixVente = Number(f.prixVente ?? 0);
  const tva = Number(f.tva ?? 19.25);
  const margePct = prixAchat > 0 ? Math.round(((prixVente - prixAchat) / prixAchat) * 1000) / 10 : 0;
  const prixTtc = prixVente > 0 ? Math.round(prixVente * (1 + tva / 100) * 100) / 100 : 0;
  const stockMax = Number(f.stockMax ?? 0);
  const stockActuel = Number(f.stockActuel ?? 0);
  const aCommander = stockMax > 0 ? Math.max(0, stockMax - stockActuel) : null;
  const seuilDepasse = stockMax > 0 && Number(f.seuilAlerte ?? 0) > stockMax;

  // ─── Compatibilités véhicule ───
  const [compatDraft, setCompatDraft] = useState({ marque: "", modele: "", anneeDe: "", anneeA: "", motorisation: "" });
  const compat = (f.compatibilites ?? []) as any[];
  const addCompat = () => {
    if (!compatDraft.marque.trim() || !compatDraft.modele.trim()) { toast.error("Marque et modèle requis"); return; }
    set("compatibilites", [...compat, { marque: compatDraft.marque.trim(), modele: compatDraft.modele.trim(), anneeDe: compatDraft.anneeDe ? Number(compatDraft.anneeDe) : null, anneeA: compatDraft.anneeA ? Number(compatDraft.anneeA) : null, motorisation: compatDraft.motorisation.trim() || null }]);
    setCompatDraft({ marque: "", modele: "", anneeDe: "", anneeA: "", motorisation: "" });
  };

  // ─── Photos multiples ───
  const photos = (f.photos ?? []) as string[];
  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const reader = (file: File) => new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(file); });
    Promise.all(Array.from(files).filter((x) => x.size <= 2 * 1024 * 1024).map(reader)).then((imgs) => set("photos", [...photos, ...imgs]));
  };

  const estStocke = typeProduit !== "SERVICE";
  const vendu = typeProduit === "PIECE" || typeProduit === "SERVICE"; // OUTIL/CONSOMMABLE : non vendus

  const valider = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!f.titre?.trim() || f.titre.trim().length < 3) errs.titre = "Désignation requise (min 3 caractères)";
    if (estStocke) {
      if (!f.categorieId) errs.categorieId = "Catégorie (article) requise";
      if (vendu && !(prixAchat > 0)) errs.prixAchat = "Prix d'achat requis (> 0)";
      if (vendu && !(prixVente > 0)) errs.prixVente = "Prix de vente requis (> 0)";
      if (f.quantiteInitiale > 0 && !f.emplacementId) errs.emplacementId = "Choisissez un emplacement (ou 0 en quantité)";
    } else {
      if (!(prixVente > 0)) errs.prixVente = "Tarif requis pour la main d'œuvre";
    }
    return errs;
  };

  const handleSubmit = async (createAnother = false) => {
    const errs = valider();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const unite = unitesMesure?.find((u: any) => String(u.id) === String(f.uniteId)) ?? (unitesMesure ?? [])[0];
    const payload: Record<string, any> = {
      typeProduit,
      titre: f.titre,
      codeArticle: f.codeArticle ? String(f.codeArticle).trim().toUpperCase() : undefined,
      codeBarre: f.codeBarre || undefined,
      designationCourte: f.designationCourte || undefined,
      editeur: f.marque || undefined,
      marque: f.marque || undefined,
      referenceFabricant: f.referenceFabricant || undefined,
      refOem: f.refOem || undefined,
      refAftermarket: f.refAftermarket || undefined,
      etat: f.etat ?? "neuf",
      description: f.description || undefined,
      notes: f.notes || undefined,
      classeAbc: f.classeAbc || undefined,
      poidsKg: f.poidsKg ? Number(f.poidsKg) : undefined,
      dimensions: f.dimensions || undefined,
      garantieMois: f.garantieMois ? Number(f.garantieMois) : undefined,
      suiviSerie: !!f.suiviSerie,
      suiviLot: !!f.suiviLot,
      categorieId: f.categorieId ? String(f.categorieId) : undefined,
      // OUTIL/CONSOMMABLE : non vendus — le serveur force le prix à 0 (pas de prixVente envoyé)
      prixVente: typeProduit === "OUTIL" || typeProduit === "CONSOMMABLE" ? undefined : String(prixVente),
      prixAchat: String(prixAchat),
      prixMinimumVente: f.prixMinimumVente ? String(f.prixMinimumVente) : undefined,
      tva: String(tva),
      fournisseurId: f.fournisseurId ? String(f.fournisseurId) : undefined,
      referenceFournisseur: f.referenceFournisseur || undefined,
      delaiFournisseur: f.delaiFournisseur ? Number(f.delaiFournisseur) : undefined,
      seuilAlerte: f.seuilAlerte ?? 5,
      seuilCritique: f.seuilCritique ?? 2,
      stockMaximum: stockMax > 0 ? stockMax : undefined,
      emplacementPrincipalId: f.emplacementId ? Number(f.emplacementId) : undefined,
      stockInitial: !isEdit && estStocke ? Number(f.quantiteInitiale ?? 0) : undefined,
      emplacementStockId: !isEdit && estStocke && f.quantiteInitiale > 0 ? Number(f.emplacementId) : undefined,
      uniteStockId: !isEdit && estStocke && f.quantiteInitiale > 0 && unite ? String(unite.id) : undefined,
      uniteBaseId: unite ? String(unite.id) : undefined,
      unites: estStocke && unite
        ? [{ unite_id: String(unite.id), facteur_conversion: 1, prix_achat: prixAchat, prix_vente: prixVente, est_unite_achat_defaut: true, est_unite_vente_defaut: true, est_unite_base: true }]
        : unite ? [{ unite_id: String(unite.id), facteur_conversion: 1, prix_achat: 0, prix_vente: prixVente, est_unite_achat_defaut: true, est_unite_vente_defaut: true, est_unite_base: true }] : [],
      photos: photos.length > 0 ? photos : undefined,
      compatibilites: compat.length > 0 ? compat : undefined,
    };
    if (createAnother && onSaveCreateAnother) {
      await onSaveCreateAnother(payload);
    } else {
      await onSave(payload);
    }
  };

  const genererReference = () => set("codeArticle", `REF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);
  const missing = Object.keys(errors);

  return (
    <div className="space-y-5">
      {missing.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
          Champs à compléter : {missing.join(", ")}
        </div>
      )}

      {/* Anti-doublon */}
      {!isEdit && estStocke && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <Label className="text-sm font-medium">Cette pièce existe déjà ? (éviter les doublons)</Label>
          <div className="relative mt-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={dupQ} onChange={(e) => setDupQ(e.target.value)} placeholder="Rechercher par nom ou référence…" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary/50" />
          </div>
          {dupResults && (dupResults.items ?? []).length > 0 && (
            <div className="mt-2 space-y-1">
              {(dupResults.items ?? []).map((p: any) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/20 px-3 py-1.5 text-xs">
                  <span className="font-semibold">{p.titre}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{p.codeBarre ?? p.codeArticle}</span>
                  <Button size="sm" variant="outline" className="ml-auto h-6 gap-1 px-2 text-[10px] text-success-foreground" onClick={() => setDupModal({ id: Number(p.id), titre: p.titre, qte: "1", emplacementId: "", motif: "" })}>
                    <Plus size={11} /> Ajouter du stock
                  </Button>
                </div>
              ))}
            </div>
          )}
          {dupResults && (dupResults.items ?? []).length === 0 && dupQ.trim().length >= 2 && (
            <p className="mt-2 text-xs text-muted-foreground">Aucune pièce trouvée — vous pouvez la créer ci-dessous.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        {/* ═══ COLONNE GAUCHE (65%) ═══ */}
        <div className="space-y-5 xl:col-span-3">
          {/* A — Identification */}
          <Section title="A · Identification">
            {!isEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-sm font-medium">Type :</Label>
                {TYPE_OPTIONS.map((t) => (
                  <button key={t.value} type="button" onClick={() => setTypeProduit(t.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${typeProduit === t.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                    title={t.hint}>{t.label}</button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Référence interne" required={estStocke} error={errors.codeArticle} hint="Unique — générée automatiquement si vide">
                <div className="flex gap-2">
                  <Input value={f.codeArticle ?? ""} onChange={(e) => set("codeArticle", e.target.value.toUpperCase())} placeholder="Ex: FIL-HUI-001" maxLength={100} className="font-mono uppercase" />
                  <Button type="button" variant="outline" size="icon" title="Générer" onClick={genererReference}><RotateCcw className="size-4" /></Button>
                </div>
              </Field>
              <Field label="Code-barres / EAN / QR" hint="Laisser vide pour générer automatiquement">
                <Input value={f.codeBarre ?? ""} onChange={(e) => set("codeBarre", e.target.value)} placeholder="EAN-13, code interne…" maxLength={100} className="font-mono" />
              </Field>
              <Field label="Référence constructeur / OEM">
                <Input value={f.refOem ?? ""} onChange={(e) => set("refOem", e.target.value)} placeholder="Réf. d'origine (ex. 90915-YZZD1)" maxLength={255} />
              </Field>
              <Field label="Référence équipementier" hint="Bosch, Valeo, SKF, Mann…">
                <Input value={f.referenceFabricant ?? ""} onChange={(e) => set("referenceFabricant", e.target.value)} placeholder="Réf. fabricant / équipementier" maxLength={255} />
              </Field>
              <Field label="Désignation" required error={errors.titre} hint="Min 3 caractères">
                <Input value={f.titre ?? ""} onChange={(e) => set("titre", e.target.value)} placeholder="Ex: Filtre à huile universel" maxLength={150} />
              </Field>
              <Field label="Désignation courte" hint="Pour étiquettes et listes">
                <Input value={f.designationCourte ?? ""} onChange={(e) => set("designationCourte", e.target.value)} placeholder="Ex: Filtre à huile" maxLength={200} />
              </Field>
            </div>
            <Field label="Description longue">
              <textarea value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={3} maxLength={500} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" placeholder="Compatibilité véhicules, remarques techniques…" />
            </Field>
          </Section>

          {/* B — Classification */}
          <Section title="B · Classification">
            {suggestion && !f.categorieId && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                <Wand2 size={13} className="text-primary" />
                <span>Catégorie suggérée : <b>{suggestion.fam?.nom ?? ""} {suggestion.sous?.nom ?? ""} — {suggestion.feuille.nom}</b></span>
                <Button size="sm" variant="outline" className="ml-auto h-6 px-2 text-[10px]" onClick={appliquerSuggestion}>Appliquer</Button>
              </div>
            )}
            {estStocke && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Catégorie principale (famille)" required error={errors.categorieId}>
                  <Select value={familleId} onValueChange={setFamille}>
                    <SelectTrigger><SelectValue placeholder="Choisir la famille" /></SelectTrigger>
                    <SelectContent>
                      {familles.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nom}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                {sousOptions.length > 0 && (
                  <Field label="Sous-catégorie" required>
                    <Select value={sousId} onValueChange={setSous}>
                      <SelectTrigger><SelectValue placeholder="Choisir la sous-catégorie" /></SelectTrigger>
                      <SelectContent>
                        {sousOptions.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nom}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {articleOptions.length > 0 && (
                  <Field label="Article" required hint="Dernier niveau du référentiel">
                    <Select value={f.categorieId?.toString() ?? ""} onValueChange={(v) => set("categorieId", v)}>
                      <SelectTrigger><SelectValue placeholder="Choisir l'article" /></SelectTrigger>
                      <SelectContent>
                        {articleOptions.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nom}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Origine / qualité">
                <Select value={f.origineQualite ?? "AUTRE"} onValueChange={(v) => set("origineQualite", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CONSTRUCTEUR">OEM (constructeur)</SelectItem>
                    <SelectItem value="OEM">OEM équivalent</SelectItem>
                    <SelectItem value="AFTERMARKET">Aftermarket</SelectItem>
                    <SelectItem value="AUTRE">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="État">
                <Select value={f.etat ?? "neuf"} onValueChange={(v) => set("etat", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="neuf">Neuf</SelectItem>
                    <SelectItem value="occasion">Réemploi (PIEC)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Échange standard">
                <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2 text-sm">
                  <input type="checkbox" checked={!!f.estCore} onChange={(e) => set("estCore", e.target.checked)} className="size-4 accent-primary" />
                  Core (dépôt coquille)
                </label>
              </Field>
              <Field label="Classification ABC">
                <Select value={f.classeAbc ?? ""} onValueChange={(v) => set("classeAbc", v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="A / B / C" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="A">A — haute rotation</SelectItem>
                    <SelectItem value="B">B — rotation moyenne</SelectItem>
                    <SelectItem value="C">C — faible rotation</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Marque / Fabricant">
              <Input value={f.marque ?? ""} onChange={(e) => set("marque", e.target.value)} placeholder="Ex: Bosch, Toyota, Générique…" maxLength={255} />
            </Field>
          </Section>

          {/* C — Compatibilité véhicule */}
          <Section title="C · Compatibilité véhicule">
            <p className="text-xs text-muted-foreground">Indiquez les véhicules compatibles (marque, modèle, années, motorisation).</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Input placeholder="Marque *" value={compatDraft.marque} onChange={(e) => setCompatDraft({ ...compatDraft, marque: e.target.value })} className="h-9 text-sm" />
              <Input placeholder="Modèle *" value={compatDraft.modele} onChange={(e) => setCompatDraft({ ...compatDraft, modele: e.target.value })} className="h-9 text-sm" />
              <Input placeholder="Année de" type="number" value={compatDraft.anneeDe} onChange={(e) => setCompatDraft({ ...compatDraft, anneeDe: e.target.value })} className="h-9 text-sm" />
              <Input placeholder="Année à" type="number" value={compatDraft.anneeA} onChange={(e) => setCompatDraft({ ...compatDraft, anneeA: e.target.value })} className="h-9 text-sm" />
              <div className="flex gap-2">
                <Input placeholder="Motorisation" value={compatDraft.motorisation} onChange={(e) => setCompatDraft({ ...compatDraft, motorisation: e.target.value })} className="h-9 text-sm" />
                <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={addCompat}><Plus className="size-4" /></Button>
              </div>
            </div>
            {compat.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <tr><th className="px-3 py-2">Marque</th><th className="px-3 py-2">Modèle</th><th className="px-3 py-2">Années</th><th className="px-3 py-2">Motorisation</th><th className="px-3 py-2" /></tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {compat.map((c: any, i: number) => (
                      <tr key={i} className="text-xs">
                        <td className="px-3 py-1.5 font-semibold">{c.marque}</td>
                        <td className="px-3 py-1.5">{c.modele}</td>
                        <td className="px-3 py-1.5 font-mono">{c.anneeDe || "—"} → {c.anneeA || "—"}</td>
                        <td className="px-3 py-1.5">{c.motorisation ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right">
                          <Button type="button" variant="ghost" size="sm" onClick={() => set("compatibilites", compat.filter((_: any, j: number) => j !== i))}><Trash2 className="size-3.5" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* D — Médias */}
          <Section title="D · Médias">
            <div className="flex flex-wrap items-center gap-3">
              {photos.map((ph: string, i: number) => (
                <div key={i} className="relative">
                  <img src={ph} alt="" className="size-20 rounded-lg border border-border object-cover" />
                  <button type="button" onClick={() => set("photos", photos.filter((_: string, j: number) => j !== i))} className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-background"><X className="size-3" /></button>
                </div>
              ))}
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-primary/40">
                <Plus className="size-5" /> Photos
                <input type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">jpg, png — plusieurs photos possibles (la première est l'image principale).</p>
          </Section>
        </div>

        {/* ═══ COLONNE DROITE (35%) ═══ */}
        <div className="space-y-5 xl:col-span-2">
          {/* E — Prix & tarification */}
          <Section title="E · Prix & tarification">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prix d'achat HT (F)" required={estStocke} error={errors.prixAchat}>
                <Input type="number" min={0} value={f.prixAchat ?? ""} onChange={(e) => set("prixAchat", e.target.value)} placeholder="0" />
              </Field>
              <Field label="Prix de vente HT (F)" required error={errors.prixVente}>
                <Input type="number" min={0} value={f.prixVente ?? ""} onChange={(e) => set("prixVente", e.target.value)} placeholder="0" />
              </Field>
              <Field label="TVA (%)">
                <Input type="number" value={f.tva ?? 19.25} onChange={(e) => set("tva", e.target.value)} />
              </Field>
              <Field label="Prix minimum de vente" hint="Remise max contrôlée">
                <Input type="number" min={0} value={f.prixMinimumVente ?? ""} onChange={(e) => set("prixMinimumVente", e.target.value)} placeholder="Optionnel" />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/20 p-3 text-center text-xs">
              <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Marge</p><p className={`font-mono font-bold ${margePct < 0 ? "text-destructive" : "text-success-foreground"}`}>{margePct} %</p></div>
              <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Prix TTC</p><p className="font-mono font-bold">{prixTtc > 0 ? `${prixTtc.toLocaleString("fr-FR")} F` : "—"}</p></div>
              <div><p className="text-[10px] font-bold uppercase text-muted-foreground">Marge €</p><p className="font-mono font-bold">{(prixVente - prixAchat).toLocaleString("fr-FR")} F</p></div>
            </div>
          </Section>

          {/* F — Gestion de stock */}
          <Section title="F · Gestion de stock">
            {isEdit && <Field label="Stock actuel" hint="Lecture seule — gérez via Stock → + Stock"><Input value={stockActuel} readOnly className="bg-muted/40" /></Field>}
            {!isEdit && (
              <Field label="Quantité initiale" hint="Stock déjà présent au garage — arrive directement en stock">
                <Input type="number" min={0} value={f.quantiteInitiale ?? ""} onChange={(e) => set("quantiteInitiale", Number(e.target.value))} placeholder="0" />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stock minimum (seuil)" required={estStocke}>
                <Input type="number" min={0} value={f.seuilAlerte ?? 5} onChange={(e) => set("seuilAlerte", Number(e.target.value))} />
              </Field>
              <Field label="Stock maximum" hint="Alerte si < minimum">
                <Input type="number" min={0} value={f.stockMax ?? ""} onChange={(e) => set("stockMax", e.target.value ? Number(e.target.value) : null)} placeholder="Illimité si vide" />
              </Field>
            </div>
            {seuilDepasse && <p className="text-xs text-destructive">Alerte : le stock minimum est supérieur au stock maximum.</p>}
            {aCommander !== null && <p className="text-xs text-muted-foreground">Quantité à commander : <b className="font-mono">{aCommander} unité(s)</b> (stock max − stock actuel).</p>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unité de gestion">
                <Select value={f.uniteId?.toString() ?? ""} onValueChange={(v) => set("uniteId", v)}>
                  <SelectTrigger><SelectValue placeholder="Pièce, litre…" /></SelectTrigger>
                  <SelectContent>
                    {(unitesMesure ?? []).map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.libelle} ({u.symbole})</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Emplacement / Casier" required={Number(f.quantiteInitiale) > 0} error={errors.emplacementId} hint="Ex: A-12-03">
                <Select value={f.emplacementId?.toString() ?? ""} onValueChange={(v) => set("emplacementId", v)}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>
                    {emplacements?.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.code}{e.libelle ? ` — ${e.libelle}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!f.suiviSerie} onChange={(e) => set("suiviSerie", e.target.checked)} className="size-4 accent-primary" /> Suivi par n° de série</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!f.suiviLot} onChange={(e) => set("suiviLot", e.target.checked)} className="size-4 accent-primary" /> Suivi par lot / péremption</label>
            </div>
          </Section>

          {/* G — Fournisseur principal */}
          <Section title="G · Fournisseur principal">
            <Field label="Fournisseur">
              <div className="flex gap-2">
                <Select value={f.fournisseurId?.toString() ?? ""} onValueChange={(v) => set("fournisseurId", v)}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>
                    {fournisseurs?.map((x: any) => <SelectItem key={x.id} value={String(x.id)}>{x.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Link href="/dashboard/fournisseurs-factures">
                  <Button type="button" variant="outline" className="h-9 shrink-0" title="Nouveau fournisseur"><Plus className="size-4" /></Button>
                </Link>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Référence fournisseur">
                <Input value={f.referenceFournisseur ?? ""} onChange={(e) => set("referenceFournisseur", e.target.value)} placeholder="Réf. du fournisseur" maxLength={100} />
              </Field>
              <Field label="Délai de livraison (jours)">
                <Input type="number" min={0} value={f.delaiFournisseur ?? ""} onChange={(e) => set("delaiFournisseur", e.target.value ? Number(e.target.value) : null)} placeholder="0" />
              </Field>
            </div>
          </Section>

          {/* H — Infos complémentaires */}
          <Section title="H · Informations complémentaires">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Poids (kg)">
                <Input type="number" step="0.01" min={0} value={f.poidsKg ?? ""} onChange={(e) => set("poidsKg", e.target.value)} placeholder="0" />
              </Field>
              <Field label="Dimensions (L × l × H)">
                <Input value={f.dimensions ?? ""} onChange={(e) => set("dimensions", e.target.value)} placeholder="Ex: 40 × 20 × 10" maxLength={50} />
              </Field>
              <Field label="Garantie (mois)">
                <Input type="number" min={0} value={f.garantieMois ?? ""} onChange={(e) => set("garantieMois", e.target.value ? Number(e.target.value) : null)} placeholder="0" />
              </Field>
              <Field label="Actif">
                <label className="mt-1 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={f.statut !== "inactif"} onChange={(e) => set("statut", e.target.checked ? "actif" : "inactif")} className="size-4 accent-primary" />
                  Produit actif (visible dans le stock)
                </label>
              </Field>
            </div>
            <Field label="Notes internes" hint="Visible uniquement par le personnel">
              <textarea value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} maxLength={500} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
            </Field>
          </Section>
        </div>
      </div>

      {/* Pied sticky */}
      <div className="sticky bottom-0 z-30 rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link href="/dashboard/catalog"><Button type="button" variant="outline">Annuler</Button></Link>
          {onSaveCreateAnother && (
            <Button type="button" variant="outline" disabled={isPending} onClick={() => handleSubmit(true)}>
              Enregistrer et créer un autre
            </Button>
          )}
          <Button type="button" onClick={() => handleSubmit(false)} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            <PackagePlus className="mr-1.5 size-4" />
            {isEdit ? "Enregistrer les modifications" : "Enregistrer"}
          </Button>
        </div>
        {derniereModification && <p className="mt-2 text-right text-[10px] text-muted-foreground">Dernière modification : {derniereModification}</p>}
      </div>

      {/* Modal + Stock (anti-doublon) */}
      {dupModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setDupModal(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Plus size={16} className="text-success-foreground" /> Ajouter du stock : {dupModal.titre}
            </h3>
            <div className="mt-4 space-y-3">
              <Field label="Quantité"><Input type="number" min={1} value={dupModal.qte} onChange={(e) => setDupModal({ ...dupModal, qte: e.target.value })} /></Field>
              <Field label="Emplacement">
                <Select value={dupModal.emplacementId} onValueChange={(v) => setDupModal({ ...dupModal, emplacementId: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>
                    {emplacements?.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.code}{e.libelle ? ` — ${e.libelle}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Motif (obligatoire)"><Input value={dupModal.motif} onChange={(e) => setDupModal({ ...dupModal, motif: e.target.value })} placeholder="ex. Pièces retrouvées au garage" /></Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDupModal(null)}>Annuler</Button>
              <Button disabled={!Number(dupModal.qte) || !dupModal.emplacementId || dupModal.motif.trim().length < 3 || ajouterStock.isPending}
                onClick={() => ajouterStock.mutate({ produitId: dupModal.id, quantite: Number(dupModal.qte), emplacementId: Number(dupModal.emplacementId), motif: dupModal.motif.trim() })}>
                <Plus size={14} /> Ajouter
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}