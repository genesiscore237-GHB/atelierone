"use client";

import { useState, useMemo } from "react";
import { Loader2, Search, PackagePlus, Plus } from "lucide-react";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

/**
 * CRÉATION D'UN PRODUIT — simple, complet, optimisé (specs garage).
 * 1. Anti-doublon : on recherche d'abord la pièce (éviter les rachats inutiles).
 * 2. Un seul écran en 3 blocs : Identité / Prix & fournisseur / Stock initial.
 * 3. La quantité initiale est saisie ici → le produit arrive directement en stock.
 * Le type est pré-sélectionné « Pièce » ; la Main d'œuvre (rare) est allégée.
 */

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "PIECE", label: "Pièce détachée" },
  { value: "CONSOMMABLE", label: "Consommable (huiles…)" },
  { value: "OUTIL", label: "Outil / Matériel" },
  { value: "SERVICE", label: "Main d'œuvre" },
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

interface ProductWizardProps {
  onSave: (data: any) => Promise<void>;
  isPending: boolean;
  defaultValues?: any;
}

export function ProductWizard({ onSave, isPending, defaultValues }: ProductWizardProps) {
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

  const parentCats = useMemo(() => categories?.filter((c: any) => !c.parentId) ?? [], [categories]);
  const estStocke = typeProduit !== "SERVICE";

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!f.titre?.trim()) errs.titre = "Désignation requise";
    if (estStocke && !f.categorieId) errs.categorieId = "Catégorie requise";
    if (estStocke && f.quantiteInitiale > 0 && !f.emplacementId) errs.emplacementId = "Choisissez un emplacement (ou 0 en quantité)";
    if (!estStocke && !Number(f.prixVente)) errs.prixVente = "Tarif requis pour la main d'œuvre";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const unite = unitesMesure?.find((u: any) => String(u.id) === String(f.uniteId)) ?? (unitesMesure ?? [])[0];
    const defaultVente = Number(f.prixVente ?? 0);
    const payload: Record<string, any> = {
      typeProduit,
      titre: f.titre,
      codeArticle: f.codeArticle ? String(f.codeArticle).trim().toUpperCase() : undefined,
      designationCourte: f.designationCourte || undefined,
      editeur: f.marque || undefined,
      marque: f.marque || undefined,
      referenceFabricant: f.referenceFabricant || undefined,
      refOem: f.refOem || undefined,
      refAftermarket: f.refAftermarket || undefined,
      etat: f.etat ?? "neuf",
      description: f.description || undefined,
      notes: f.notes || undefined,
      categorieId: f.categorieId ? String(f.categorieId) : undefined,
      prixVente: String(defaultVente),
      prixAchat: f.prixAchat ? String(f.prixAchat) : undefined,
      tva: f.tva ? String(f.tva) : "0",
      fournisseurId: f.fournisseurId ? String(f.fournisseurId) : undefined,
      seuilAlerte: f.seuilAlerte ?? 5,
      emplacementPrincipalId: f.emplacementId ? Number(f.emplacementId) : undefined,
      // Quantité initiale → directement en stock (uniquement à la création)
      stockInitial: !isEdit && estStocke ? Number(f.quantiteInitiale ?? 0) : undefined,
      emplacementStockId: !isEdit && estStocke && f.quantiteInitiale > 0 ? Number(f.emplacementId) : undefined,
      uniteStockId: !isEdit && estStocke && f.quantiteInitiale > 0 && unite ? String(unite.id) : undefined,
      uniteBaseId: unite ? String(unite.id) : undefined,
      unites: estStocke && unite
        ? [{ unite_id: String(unite.id), facteur_conversion: 1, prix_achat: Number(f.prixAchat ?? 0), prix_vente: defaultVente, est_unite_achat_defaut: true, est_unite_vente_defaut: true, est_unite_base: true }]
        : unite ? [{ unite_id: String(unite.id), facteur_conversion: 1, prix_achat: 0, prix_vente: defaultVente, est_unite_achat_defaut: true, est_unite_vente_defaut: true, est_unite_base: true }] : [],
      photos: f.photo ? [f.photo] : undefined,
    };
    await onSave(payload);
  };

  const missing = Object.keys(errors);

  return (
    <div className="space-y-5">
      {missing.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
          Champs à compléter : {missing.join(", ")}
        </div>
      )}

      {/* Type (pré-sélectionné Pièce, modifiable — désactivé en édition) */}
      {!isEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-sm font-medium">Type :</Label>
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTypeProduit(t.value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${typeProduit === t.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Anti-doublon : chercher avant de créer */}
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

      {/* Bloc Identité */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Identité</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Désignation" required error={errors.titre}>
            <Input value={f.titre ?? ""} onChange={(e) => set("titre", e.target.value)} placeholder="Ex: Filtre à huile universel" maxLength={150} />
          </Field>
          <Field label="Référence (interne / constructeur)" hint="Laisser vide pour générer automatiquement">
            <Input value={f.codeArticle ?? ""} onChange={(e) => set("codeArticle", e.target.value.toUpperCase())} placeholder="Ex: FIL-HUI-001 ou réf. constructeur" maxLength={100} className="font-mono uppercase" />
          </Field>
          {estStocke && (
            <Field label="Catégorie" required error={errors.categorieId}>
              <Select value={f.categorieId?.toString() ?? ""} onValueChange={(v) => set("categorieId", v)}>
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  {parentCats?.filter((c: any) => !c.parentId && (c.typeBranche === typeProduit || c.id === f.categorieId)).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {!estStocke && (
            <Field label="Catégorie (optionnel)">
              <Select value={f.categorieId?.toString() ?? ""} onValueChange={(v) => set("categorieId", v)}>
                <SelectTrigger><SelectValue placeholder="Aucune" /></SelectTrigger>
                <SelectContent>
                  {parentCats?.filter((c: any) => !c.parentId).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Marque">
            <Input value={f.marque ?? ""} onChange={(e) => set("marque", e.target.value)} placeholder="Ex: Bosch, Toyota, Générique…" maxLength={255} />
          </Field>
          <Field label="État">
            <Select value={f.etat ?? "neuf"} onValueChange={(v) => set("etat", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="neuf">Neuf</SelectItem>
                <SelectItem value="occasion">Occasion / récupéré</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Photo" hint="jpg, png, max 2 Mo">
            <div className="flex items-center gap-3">
              {f.photo && <img src={f.photo} alt="" className="size-12 rounded-lg border border-border object-cover" />}
              <label className="cursor-pointer">
                <Button type="button" variant="secondary" asChild><span>Choisir une photo</span></Button>
                <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.size <= 2 * 1024 * 1024) { const r = new FileReader(); r.onload = () => set("photo", r.result as string); r.readAsDataURL(file); }
                }} />
              </label>
            </div>
          </Field>
          <Field label="Description">
            <textarea value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2} maxLength={500} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
          </Field>
        </div>
      </div>

      {/* Bloc Prix & fournisseur */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Prix & fournisseur</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Prix d'achat (F)">
            <Input type="number" min={0} value={f.prixAchat ?? ""} onChange={(e) => set("prixAchat", e.target.value)} placeholder="0" />
          </Field>
          <Field label="Prix de vente (F)" required={!estStocke} error={errors.prixVente} hint={!estStocke ? "Tarif horaire / prestation" : "Facultatif — ajouté plus tard si besoin"}>
            <Input type="number" min={0} value={f.prixVente ?? ""} onChange={(e) => set("prixVente", e.target.value)} placeholder="Facultatif" />
          </Field>
          <Field label="Fournisseur principal">
            <Select value={f.fournisseurId?.toString() ?? ""} onValueChange={(v) => set("fournisseurId", v)}>
              <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
              <SelectContent>
                {fournisseurs?.map((x: any) => <SelectItem key={x.id} value={String(x.id)}>{x.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      {/* Bloc Stock initial */}
      {estStocke && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Stock initial</h3>
          <p className="mb-3 text-xs text-muted-foreground">Quantité déjà présente au garage — le produit arrive directement en stock.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Field label="Quantité initiale" hint="0 = produit sans stock pour l'instant">
              <Input type="number" min={0} value={f.quantiteInitiale ?? ""} onChange={(e) => set("quantiteInitiale", Number(e.target.value))} placeholder="0" />
            </Field>
            <Field label="Unité" hint="Pièce, litre, bidon…">
              <Select value={f.uniteId?.toString() ?? ""} onValueChange={(v) => set("uniteId", v)}>
                <SelectTrigger><SelectValue placeholder="Unité" /></SelectTrigger>
                <SelectContent>
                  {(unitesMesure ?? []).map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.libelle} ({u.symbole})</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Emplacement" required={Number(f.quantiteInitiale) > 0} error={errors.emplacementId}>
              <Select value={f.emplacementId?.toString() ?? ""} onValueChange={(v) => set("emplacementId", v)}>
                <SelectTrigger><SelectValue placeholder="Ex: Casier A3" /></SelectTrigger>
                <SelectContent>
                  {emplacements?.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.code}{e.libelle ? ` — ${e.libelle}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Seuil d'alerte" hint="Alerte quand le stock passe sous ce seuil">
              <Input type="number" min={0} value={f.seuilAlerte ?? 5} onChange={(e) => set("seuilAlerte", Number(e.target.value))} />
            </Field>
          </div>
        </div>
      )}

      {/* Bloc Avancé (replié) */}
      <details className="rounded-xl border border-border bg-card/50 p-4">
        <summary className="cursor-pointer text-sm font-bold uppercase tracking-wider text-muted-foreground">Références & options avancées</summary>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Référence constructeur">
            <Input value={f.referenceFabricant ?? ""} onChange={(e) => set("referenceFabricant", e.target.value)} maxLength={255} />
          </Field>
          <Field label="Référence OEM">
            <Input value={f.refOem ?? ""} onChange={(e) => set("refOem", e.target.value)} maxLength={255} />
          </Field>
          <Field label="Référence aftermarket">
            <Input value={f.refAftermarket ?? ""} onChange={(e) => set("refAftermarket", e.target.value)} maxLength={255} />
          </Field>
          <Field label="TVA (%)">
            <Input type="number" value={f.tva ?? ""} onChange={(e) => set("tva", e.target.value)} placeholder="19.25" />
          </Field>
          <Field label="Notes internes">
            <Input value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
          </Field>
        </div>
      </details>

      <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
        <Button type="button" onClick={handleSubmit} disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          <PackagePlus className="mr-1.5 size-4" />
          {isEdit ? "Enregistrer les modifications" : "Enregistrer le produit"}
        </Button>
      </div>

      {/* Modal « + Stock » (anti-doublon) */}
      {dupModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setDupModal(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Plus size={16} className="text-success-foreground" /> Ajouter du stock : {dupModal.titre}
            </h3>
            <div className="mt-4 space-y-3">
              <Field label="Quantité">
                <Input type="number" min={1} value={dupModal.qte} onChange={(e) => setDupModal({ ...dupModal, qte: e.target.value })} />
              </Field>
              <Field label="Emplacement">
                <Select value={dupModal.emplacementId} onValueChange={(v) => setDupModal({ ...dupModal, emplacementId: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>
                    {emplacements?.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.code}{e.libelle ? ` — ${e.libelle}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Motif (obligatoire)">
                <Input value={dupModal.motif} onChange={(e) => setDupModal({ ...dupModal, motif: e.target.value })} placeholder="ex. Pièces retrouvées au garage" />
              </Field>
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