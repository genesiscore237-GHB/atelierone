"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, Plus, X, Camera, AlertTriangle, Trash2, Star, Wrench, Clock3, Package, Hammer, ChevronDown } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export type UniteRow = {
  id: string;
  unite_id: string | null;
  unite_label: string;
  facteur_conversion: number;
  prix_achat: number;
  prix_vente: number;
  est_unite_achat_defaut: boolean;
  est_unite_vente_defaut: boolean;
  est_unite_base: boolean;
};

const errorCls = "mt-1 text-xs text-destructive";
const NO_VALUE = "__none__";

const DRAFT_KEY = "product_wizard_draft";

const TYPE_OPTIONS = [
  { value: "PIECE", label: "Pièce détachée", hint: "Pièces de rechange, pneumatiques…", icon: Wrench },
  { value: "CONSOMMABLE", label: "Consommable", hint: "Huiles, EPI, fournitures…", icon: Package },
  { value: "OUTIL", label: "Outil / Matériel", hint: "Outillage prêté aux techniciens", icon: Hammer },
  { value: "SERVICE", label: "Main d'œuvre", hint: "Tarif horaire, prestation…", icon: Clock3 },
] as const;

const TYPE_META: Record<string, { label: string }> = {
  PIECE: { label: "Pièce détachée" },
  CONSOMMABLE: { label: "Consommable" },
  OUTIL: { label: "Outil / Matériel" },
  SERVICE: { label: "Main d'œuvre" },
};

/** Nom de code : 2 premières lettres de chaque mot du titre (ex. "Filtre à huile" → "FIAH"). */
function nomCodeFromTitre(titre: string): string {
  const words = (titre ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length > 0);
  return words.map((w) => w.slice(0, 2)).join("");
}

interface ProductWizardProps {
  onSave: (data: any) => Promise<void>;
  isPending: boolean;
  defaultValues?: any;
}

/** Section repliable du formulaire unique. */
function Section({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h3>
        <ChevronDown size={16} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-4 space-y-4">{children}</div>}
    </div>
  );
}

function Field({ label, required, error, children, hint }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <div className="mt-1">{children}</div>
      {error && <p className={errorCls}>{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ProductWizard({ onSave, isPending, defaultValues }: ProductWizardProps) {
  const isEdit = !!defaultValues?.id;
  const [typeProduit, setTypeProduit] = useState<"PIECE" | "SERVICE" | "OUTIL" | "CONSOMMABLE">(defaultValues?.typeProduit ?? "PIECE");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [nomCodeTouched, setNomCodeTouched] = useState<boolean>(!!defaultValues?.nom_code);
  const [formValues, setFormValues] = useState<Record<string, any>>(() => {
    if (defaultValues) return defaultValues;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.formValues) return parsed.formValues;
        return parsed;
      }
    } catch {}
    return {};
  });

  const updateFormValue = (key: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    if (key === "titre" && !nomCodeTouched) {
      setFormValues((prev) => ({ ...prev, nom_code: nomCodeFromTitre(value) }));
    }
    if (key === "nom_code") setNomCodeTouched(true);
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const { data: categories } = api.catalog.listCategories.useQuery();
  const { data: unitesMesure } = api.reference.listUnitesMesure.useQuery();
  const { data: fournisseurs } = api.reference.listFournisseurs.useQuery();
  const { data: emplacements } = api.stock.listEmplacements.useQuery({});

  const [fournisseurRows, setFournisseurRows] = useState<any[]>(() => {
    if (defaultValues?.fournisseurs?.length) return defaultValues.fournisseurs;
    return [];
  });

  const addFournisseurRow = () => {
    setFournisseurRows((prev) => [...prev, { id: `fs_${Date.now()}`, fournisseurId: "", uniteId: "", reference: "", prixAchat: "", delai: "", estPrincipal: prev.length === 0 }]);
  };
  const updateFournisseurRow = (id: string, field: string, value: any) => {
    setFournisseurRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };
  const removeFournisseurRow = (id: string) => {
    setFournisseurRows((prev) => {
      const filtered = prev.filter((r) => r.id !== id);
      const hasPrincipal = filtered.some((r) => r.estPrincipal);
      if (!hasPrincipal && filtered.length > 0) filtered[0].estPrincipal = true;
      return filtered;
    });
  };
  const setPrincipalFournisseur = (id: string) => {
    setFournisseurRows((prev) => prev.map((r) => ({ ...r, estPrincipal: r.id === id })));
  };

  // Unité par défaut : si l'utilisateur n'en configure aucune, on en crée une automatiquement
  const [unites, setUnites] = useState<UniteRow[]>(() => {
    if (defaultValues?.unites?.length) return defaultValues.unites;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.unites?.length) return parsed.unites;
      }
    } catch {}
    return [];
  });
  const premiereUnite = useMemo(() => (unitesMesure ?? [])[0] as any, [unitesMesure]);

  useEffect(() => {
    // Ajout rapide : auto-création de l'unité de base si aucune n'est configurée
    if (unites.length === 0 && premiereUnite) {
      setUnites([
        { id: "ub_auto", unite_id: String(premiereUnite.id), unite_label: premiereUnite.libelle ?? "", facteur_conversion: 1, prix_achat: Number(formValues.prix_achat ?? 0), prix_vente: Number(formValues.prix_vente ?? 0), est_unite_achat_defaut: true, est_unite_vente_defaut: true, est_unite_base: true },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premiereUnite?.id]);

  const setUniteField = (id: string, field: string, value: any) => {
    setUnites((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u;
        const next = { ...u, [field]: value };
        if (field === "unite_id") {
          const uu = unitesMesure?.find((x: any) => x.id === value);
          next.unite_label = uu?.libelle ?? "";
        }
        return next;
      })
    );
  };
  const addUniteRow = () => {
    setUnites((prev) => [...prev, { id: `u_${Date.now()}`, unite_id: null, unite_label: "", facteur_conversion: 1, prix_achat: 0, prix_vente: 0, est_unite_achat_defaut: false, est_unite_vente_defaut: false, est_unite_base: false }]);
  };
  const removeUniteRow = (id: string) => {
    setUnites((prev) => {
      const base = prev.find((u) => u.est_unite_base);
      if (base?.id === id) return prev;
      return prev.filter((u) => u.id !== id);
    });
  };

  const parentCats = useMemo(() => categories?.filter((c: any) => !c.parentId) ?? [], [categories]);
  const childCats = useMemo(
    () => categories?.filter((c: any) => String(c.parentId) === formValues.categorieParentId) ?? [],
    [categories, formValues.categorieParentId]
  );
  const estStocke = typeProduit !== "SERVICE";
  const prixObligatoire = typeProduit === "PIECE" || typeProduit === "SERVICE";

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!formValues.titre?.trim()) newErrors.titre = "Désignation requise";
    if (estStocke && !formValues.categorieParentId) newErrors.categorieParentId = "Catégorie principale requise";
    if (estStocke && formValues.code_article && !/^[A-Z0-9-]{2,}$/.test(String(formValues.code_article).trim())) {
      newErrors.code_article = "Code article invalide (lettres, chiffres, tirets — ex. FIL-HUI-001)";
    }

    // Unité de base garantie (ajout rapide) + prix de vente selon le type
    let unitesFinales = unites.filter((u) => u.unite_id);
    const defaultVente = unitesFinales.find((u) => u.est_unite_vente_defaut) ?? unitesFinales[0];
    const defaultAchat = unitesFinales.find((u) => u.est_unite_achat_defaut) ?? defaultVente;
    if (estStocke && unitesFinales.length === 0) {
      if (!premiereUnite) newErrors.unite_base = "Aucune unité de mesure disponible — configurez d'abord une unité";
      else {
        unitesFinales = [
          { unite_id: String(premiereUnite.id), facteur_conversion: 1, prix_achat: Number(formValues.prix_achat ?? 0), prix_vente: Number(formValues.prix_vente ?? 0), est_unite_achat_defaut: true, est_unite_vente_defaut: true, est_unite_base: true } as any,
        ];
      }
    }
    const prixVente = Number(defaultVente?.prix_vente ?? 0);
    if (prixObligatoire && prixVente <= 0) newErrors.prix_vente = "Prix de vente requis (le service/la pièce doit avoir un tarif)";

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const payload: Record<string, any> = {
      typeProduit: typeProduit,
      titre: formValues.titre,
      codeBarre: formValues.code_barre || undefined,
      nomCode: formValues.nom_code || undefined,
      codeArticle: formValues.code_article ? String(formValues.code_article).trim().toUpperCase() : undefined,
      designationCourte: formValues.designation_courte || undefined,
      refOem: formValues.ref_oem || undefined,
      refAftermarket: formValues.ref_aftermarket || undefined,
      emplacementPrincipalId: formValues.emplacement_principal_id ?? undefined,
      origineQualite: formValues.origine_qualite || "AUTRE",
      dlcJours: formValues.dlc_jours || undefined,
      estReconditionnable: !!formValues.est_reconditionnable,
      estCore: !!formValues.est_core,
      valeurCore: formValues.valeur_core || undefined,
      notes: formValues.notes || undefined,
      editeur: formValues.editeur || undefined,
      description: formValues.description,
      statut: formValues.statut ?? "actif",
      etat: formValues.etat ?? "neuf",
      photos: formValues.photo_preview ? [formValues.photo_preview] : undefined,
      categorieId: formValues.categorie_id ? String(formValues.categorie_id) : formValues.categorieParentId ? String(formValues.categorieParentId) : undefined,
      prixVente: String(prixVente),
      prixMinimumVente: formValues.prix_minimum_vente ? String(formValues.prix_minimum_vente) : undefined,
      prixAchat: (defaultAchat?.prix_achat || formValues.prix_achat) ? String(defaultAchat?.prix_achat || formValues.prix_achat) : undefined,
      tva: formValues.tva ? String(formValues.tva) : "0",
      uniteVente: defaultVente?.unite_label || "unite",
      uniteAchat: defaultAchat?.unite_label || "unite",
      fournisseurId: fournisseurRows.find((r) => r.estPrincipal)?.fournisseurId ? String(fournisseurRows.find((r) => r.estPrincipal)!.fournisseurId) : undefined,
      fournisseurs: fournisseurRows.filter((r) => r.fournisseurId).map((r) => ({
        fournisseurId: Number(r.fournisseurId),
        uniteId: r.uniteId || undefined,
        referenceFournisseur: r.reference || undefined,
        prixAchat: r.prixAchat ? String(r.prixAchat) : undefined,
        delaiApprovisionnement: r.delai ? Number(r.delai) : undefined,
        estPrincipal: r.estPrincipal ?? false,
      })),
      seuilAlerte: formValues.seuil_alerte_stock ?? 5,
      seuilCritique: formValues.seuil_critique ?? 2,
      stockMaximum: formValues.stock_maximum ?? undefined,
      marque: formValues.marque,
      referenceFabricant: formValues.reference_fabricant,
      couleur: formValues.couleur,
      format: formValues.format,
      matiereComposition: formValues.matiere_composition,
    };
    payload.uniteBaseId = unitesFinales.find((u) => u.est_unite_base)?.unite_id ?? defaultVente?.unite_id;
    payload.unites = unitesFinales.map((u) => ({
      unite_id: u.unite_id,
      facteur_conversion: u.facteur_conversion,
      prix_achat: u.prix_achat,
      prix_vente: u.prix_vente,
      est_unite_achat_defaut: u.est_unite_achat_defaut,
      est_unite_vente_defaut: u.est_unite_vente_defaut,
      est_unite_base: u.est_unite_base,
    }));
    await onSave(payload);
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  };

  const fournisseurPrincipal = fournisseurRows.find((r) => r.estPrincipal)?.fournisseurId;
  const missing = Object.keys(errors).map((k) => {
    const LABELS: Record<string, string> = { titre: "Désignation", categorieParentId: "Catégorie principale", prix_vente: "Prix de vente", unite_base: "Unité de base" };
    return LABELS[k] ?? k;
  });

  return (
    <div className="space-y-5">
      {missing.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
          <AlertTriangle size={13} /> Champs à compléter : {missing.join(", ")}
        </div>
      )}

      {/* Type de produit : pré-sélectionné Pièce, modifiable en un clic (désactivé en édition) */}
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Type de produit</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = typeProduit === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={isEdit && typeProduit !== opt.value}
                onClick={() => { setTypeProduit(opt.value); }}
                className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-all ${selected ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:border-primary/40"} ${isEdit && !selected ? "opacity-40" : ""}`}
              >
                <Icon className="size-5 shrink-0 text-primary" />
                <span>
                  <span className="block text-sm font-semibold leading-tight">{opt.label}</span>
                  <span className="block text-[10px] leading-tight text-muted-foreground">{opt.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {typeProduit === "PIECE" ? "Pièce de rechange suivie en stock." : typeProduit === "CONSOMMABLE" ? "Huiles, EPI, fournitures — suivi en stock, non vendu (prix 0)." : typeProduit === "OUTIL" ? "Outillage prêté aux techniciens (non vendu)." : "Main d'œuvre / tarif horaire — sans stock."}
        </p>
      </div>

      {/* Essentiel */}
      <Section title="Informations essentielles" defaultOpen>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Désignation" required error={errors.titre}>
            <Input value={formValues.titre ?? ""} onChange={(e) => updateFormValue("titre", e.target.value)} placeholder="Ex: Filtre à huile universel" maxLength={150} />
          </Field>
          <Field label="Désignation courte" hint="Nom abrégé pour les listes et étiquettes">
            <Input value={formValues.designation_courte ?? ""} onChange={(e) => updateFormValue("designation_courte", e.target.value)} placeholder="Ex: Filtre à huile" maxLength={200} />
          </Field>
        </div>
        {estStocke && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Code article" required={false} error={errors.code_article} hint="Code interne unique — ex. FIL-HUI-001">
              <Input value={formValues.code_article ?? ""} onChange={(e) => updateFormValue("code_article", e.target.value.toUpperCase())} placeholder="FIL-HUI-001" maxLength={100} className="font-mono uppercase" />
            </Field>
            <Field label="Code-barres" hint="Laisser vide pour générer automatiquement">
              <Input value={formValues.code_barre ?? ""} onChange={(e) => updateFormValue("code_barre", e.target.value)} placeholder="EAN-13, code interne…" maxLength={100} />
            </Field>
            <Field label="Nom de code" hint="Auto : 2 premières lettres de chaque mot">
              <Input value={formValues.nom_code ?? ""} onChange={(e) => updateFormValue("nom_code", e.target.value.toUpperCase())} placeholder="Auto" maxLength={100} className="uppercase" />
            </Field>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Catégorie principale" required={estStocke} error={errors.categorieParentId}>
            <Select
              value={formValues.categorieParentId?.toString() ?? ""}
              onValueChange={(v) => { updateFormValue("categorieParentId", v); updateFormValue("categorie_id", null); }}
            >
              <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
              <SelectContent>
                {parentCats?.filter((c: any) => !c.parentId && (c.typeBranche === typeProduit || c.id === formValues.categorieParentId)).map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {formValues.categorieParentId && (
            <Field label="Sous-catégorie">
              <Select value={formValues.categorie_id?.toString() ?? ""} onValueChange={(v) => updateFormValue("categorie_id", v === NO_VALUE ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Aucune" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VALUE}>Aucune</SelectItem>
                  {childCats?.filter((c: any) => c.typeBranche === typeProduit || c.id === formValues.categorie_id).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {!formValues.categorieParentId && estStocke && (
            <div />
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Marque / Constructeur">
            <Input value={formValues.editeur ?? ""} onChange={(e) => updateFormValue("editeur", e.target.value)} placeholder="Ex: Générique, Toyota, Bosch…" maxLength={255} />
          </Field>
          <Field label="État">
            <Select value={formValues.etat ?? "neuf"} onValueChange={(v) => updateFormValue("etat", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="neuf">Neuf</SelectItem>
                <SelectItem value="occasion">Occasion (matériel récupéré)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Description" hint="Compatibilité véhicules, remarques…">
          <textarea value={formValues.description ?? ""} onChange={(e) => updateFormValue("description", e.target.value)} rows={2} maxLength={500}
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
        </Field>
        <Field label="Photo produit" hint="jpg, png, max 2 Mo">
          <div className="flex items-center gap-3">
            {formValues.photo_preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={formValues.photo_preview} alt="Aperçu" className="size-16 rounded-lg border border-border object-cover" />
            )}
            <label className="cursor-pointer">
              <Button type="button" variant="secondary" asChild>
                <span><Camera className="size-3" /> {formValues.photo_preview ? "Changer" : "Ajouter une photo"}</span>
              </Button>
              <input
                type="file" accept="image/jpeg,image/png" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.size <= 2 * 1024 * 1024) {
                    const reader = new FileReader();
                    reader.onload = () => updateFormValue("photo_preview", reader.result as string);
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </label>
            {formValues.photo_preview && (
              <Button type="button" variant="ghost" size="sm" onClick={() => updateFormValue("photo_preview", null)}><X className="size-3" /> Retirer</Button>
            )}
          </div>
        </Field>
      </Section>

      {/* Prix (simple, toujours visible pour pièce/service) */}
      <Section title={estStocke ? "Prix (stock)" : "Tarif"} defaultOpen>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Prix d'achat (F)" hint="Coût d'approvisionnement">
            <Input type="number" min={0} value={formValues.prix_achat ?? ""} onChange={(e) => updateFormValue("prix_achat", e.target.value)} placeholder="0" />
          </Field>
          <Field label="Prix de vente (F)" required={prixObligatoire} error={errors.prix_vente} hint={typeProduit === "OUTIL" || typeProduit === "CONSOMMABLE" ? "Non vendu — prix forcé à 0" : "Tarif unitaire de vente"}>
            <Input type="number" min={0} value={formValues.prix_vente ?? ""} onChange={(e) => updateFormValue("prix_vente", e.target.value)} placeholder={typeProduit === "OUTIL" || typeProduit === "CONSOMMABLE" ? "0 (non vendu)" : "Ex: 5000"} />
          </Field>
          <Field label="TVA (%)">
            <Input type="number" value={formValues.tva ?? ""} onChange={(e) => updateFormValue("tva", e.target.value)} placeholder="19.25" />
          </Field>
        </div>
        {estStocke && (
          <Field label="Prix minimum de vente" hint="Si vide, pas de minimum">
            <Input type="number" value={formValues.prix_minimum_vente ?? ""} onChange={(e) => updateFormValue("prix_minimum_vente", e.target.value)} />
          </Field>
        )}
      </Section>

      {estStocke && (
        <>
          {/* Approvisionnement & stock */}
          <Section title="Approvisionnement & stock" defaultOpen={false}>
            <Field label="Fournisseur principal">
              <Select
                value={fournisseurPrincipal?.toString() ?? ""}
                onValueChange={(v) => {
                  if (!v) return;
                  if (fournisseurRows.some((r) => String(r.fournisseurId) === v)) return;
                  setFournisseurRows((prev) => [...prev, { id: `fs_${Date.now()}`, fournisseurId: v, uniteId: "", reference: "", prixAchat: "", delai: "", estPrincipal: true }]);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Aucun fournisseur" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VALUE}>Aucun fournisseur</SelectItem>
                  {fournisseurs?.map((f: any) => (
                    <SelectItem key={f.id} value={String(f.id)}>{f.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {fournisseurRows.length > 0 && (
              <div className="space-y-2">
                <Label>Autres fournisseurs</Label>
                {fournisseurRows.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
                    <Select value={r.fournisseurId?.toString() ?? ""} onValueChange={(v) => updateFournisseurRow(r.id, "fournisseurId", v)}>
                      <SelectTrigger className="w-44"><SelectValue placeholder="Fournisseur" /></SelectTrigger>
                      <SelectContent>
                        {fournisseurs?.map((f: any) => <SelectItem key={f.id} value={String(f.id)}>{f.nom}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input className="w-28" placeholder="Réf." value={r.reference ?? ""} onChange={(e) => updateFournisseurRow(r.id, "reference", e.target.value)} />
                    <Input className="w-28" type="number" placeholder="Prix achat" value={r.prixAchat ?? ""} onChange={(e) => updateFournisseurRow(r.id, "prixAchat", e.target.value)} />
                    <Input className="w-20" type="number" placeholder="Délai (j)" value={r.delai ?? ""} onChange={(e) => updateFournisseurRow(r.id, "delai", e.target.value)} />
                    <Button type="button" variant="ghost" size="sm" title="Fournisseur principal" onClick={() => setPrincipalFournisseur(r.id)}>
                      <Star className={`size-4 ${r.estPrincipal ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`} />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeFournisseurRow(r.id)}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
                <Button type="button" variant="secondary" size="sm" onClick={addFournisseurRow}><Plus className="size-3" /> Ajouter un fournisseur</Button>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Seuil d'alerte stock" hint="Alerte quand le stock passe sous ce seuil">
                <Input type="number" value={formValues.seuil_alerte_stock ?? 5} onChange={(e) => updateFormValue("seuil_alerte_stock", Number(e.target.value))} />
              </Field>
              <Field label="Seuil critique">
                <Input type="number" value={formValues.seuil_critique ?? 2} onChange={(e) => updateFormValue("seuil_critique", Number(e.target.value))} />
              </Field>
              <Field label="Stock maximum" hint="Illimité si vide">
                <Input type="number" value={formValues.stock_maximum ?? ""} onChange={(e) => updateFormValue("stock_maximum", e.target.value ? Number(e.target.value) : null)} />
              </Field>
            </div>
            <Field label="Emplacement principal" hint="Emplacement de stockage par défaut">
              <Select value={formValues.emplacement_principal_id?.toString() ?? ""} onValueChange={(v) => updateFormValue("emplacement_principal_id", v === NO_VALUE ? null : Number(v))}>
                <SelectTrigger><SelectValue placeholder="Aucun emplacement défini" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VALUE}>Aucun emplacement</SelectItem>
                  {emplacements?.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.code}{e.libelle ? ` — ${e.libelle}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm">
                <input type="checkbox" checked={!!formValues.est_reconditionnable} onChange={(e) => updateFormValue("est_reconditionnable", e.target.checked)} className="size-4 accent-primary" />
                Article reconditionnable (fût → litres — huiles, fluides)
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm">
                <input type="checkbox" checked={!!formValues.est_core} onChange={(e) => updateFormValue("est_core", e.target.checked)} className="size-4 accent-primary" />
                Pièce en échange standard (core)
              </label>
            </div>
            {!!formValues.est_core && (
              <Field label="Valeur du dépôt (coquille) — FCFA">
                <Input type="number" min={0} value={formValues.valeur_core ?? ""} onChange={(e) => updateFormValue("valeur_core", e.target.value ? Number(e.target.value) : null)} placeholder="ex. 25000" />
              </Field>
            )}
            <Field label="DLC — délai d'alerte (jours)" hint="Alerte avant péremption (fluides, colles…)">
              <Input type="number" min={1} value={formValues.dlc_jours ?? ""} onChange={(e) => updateFormValue("dlc_jours", e.target.value ? Number(e.target.value) : null)} placeholder="ex. 30" />
            </Field>
          </Section>

          {/* Unités */}
          <Section title="Unités de vente / achat" defaultOpen={false}>
            <p className="text-xs text-muted-foreground">Une unité de base est créée automatiquement — ajoutez d'autres unités (ex. litre, bidon) si nécessaire.</p>
            <div className="space-y-2">
              {unites.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
                  <Select value={u.unite_id ?? ""} onValueChange={(v) => setUniteField(u.id, "unite_id", v)}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="Unité" /></SelectTrigger>
                    <SelectContent>
                      {unitesMesure?.map((x: any) => <SelectItem key={x.id} value={String(x.id)}>{x.libelle} ({x.symbole})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="w-20" type="number" value={u.facteur_conversion} onChange={(e) => setUniteField(u.id, "facteur_conversion", Number(e.target.value))} title="Facteur vers l'unité de base" />
                  <span className="text-xs text-muted-foreground">facteur</span>
                  {!u.est_unite_base && (
                    <>
                      <Input className="w-28" type="number" placeholder="Prix achat" value={u.prix_achat || ""} onChange={(e) => setUniteField(u.id, "prix_achat", Number(e.target.value))} />
                      <Input className="w-28" type="number" placeholder="Prix vente" value={u.prix_vente || ""} onChange={(e) => setUniteField(u.id, "prix_vente", Number(e.target.value))} />
                    </>
                  )}
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={u.est_unite_base} disabled /> Base
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={u.est_unite_achat_defaut} onChange={(e) => setUniteField(u.id, "est_unite_achat_defaut", e.target.checked)} /> Achat
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={u.est_unite_vente_defaut} onChange={(e) => setUniteField(u.id, "est_unite_vente_defaut", e.target.checked)} /> Vente
                  </label>
                  {!u.est_unite_base && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeUniteRow(u.id)}><Trash2 className="size-4" /></Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={addUniteRow}><Plus className="size-3" /> Ajouter une unité</Button>
            </div>
          </Section>
        </>
      )}

      {/* Références & avancé */}
      <Section title="Références & options avancées" defaultOpen={false}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Référence constructeur" hint="Ex: 90915-YZZD1">
            <Input value={formValues.reference_fabricant ?? ""} onChange={(e) => updateFormValue("reference_fabricant", e.target.value)} maxLength={255} />
          </Field>
          <Field label="Référence OEM">
            <Input value={formValues.ref_oem ?? ""} onChange={(e) => updateFormValue("ref_oem", e.target.value)} maxLength={255} />
          </Field>
          <Field label="Référence aftermarket">
            <Input value={formValues.ref_aftermarket ?? ""} onChange={(e) => updateFormValue("ref_aftermarket", e.target.value)} maxLength={255} />
          </Field>
          <Field label="Marque (fiche)">
            <Input value={formValues.marque ?? ""} onChange={(e) => updateFormValue("marque", e.target.value)} maxLength={255} />
          </Field>
          <Field label="Origine / Qualité">
            <Select value={formValues.origine_qualite ?? "AUTRE"} onValueChange={(v) => updateFormValue("origine_qualite", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CONSTRUCTEUR">Constructeur (Genuine)</SelectItem>
                <SelectItem value="OEM">OEM équivalent</SelectItem>
                <SelectItem value="AFTERMARKET">Aftermarket</SelectItem>
                <SelectItem value="AUTRE">Autre</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Format / Dimension">
            <Select value={formValues.format ?? ""} onValueChange={(v) => updateFormValue("format", v === NO_VALUE ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_VALUE}>Aucun</SelectItem>
                {["A3", "A4", "A5", "AUTRE"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Couleur">
            <Input value={formValues.couleur ?? ""} onChange={(e) => updateFormValue("couleur", e.target.value)} maxLength={100} />
          </Field>
          <Field label="Matière / Composition">
            <Input value={formValues.matiere_composition ?? ""} onChange={(e) => updateFormValue("matiere_composition", e.target.value)} maxLength={500} />
          </Field>
        </div>
        <Field label="Notes internes">
          <textarea value={formValues.notes ?? ""} onChange={(e) => updateFormValue("notes", e.target.value)} rows={2} maxLength={500}
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
        </Field>
        <Field label="Statut">
          <div className="flex flex-wrap gap-3">
            {[["actif", "Actif"], ["inactif", "Inactif"], ["obsolete", "Obsolète"], ["hors_serie", "Hors série"]].map(([v, l]) => (
              <label key={v} className="flex items-center gap-1.5 text-sm">
                <input type="radio" name="statut" checked={(formValues.statut ?? "actif") === v} onChange={() => updateFormValue("statut", v)} />
                {l}
              </label>
            ))}
          </div>
        </Field>
      </Section>

      <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
        <Button type="button" onClick={handleSubmit} disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          {isEdit ? "Enregistrer les modifications" : "Enregistrer le produit"}
        </Button>
      </div>
    </div>
  );
}