"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, Plus, X, Lock, Camera, AlertTriangle, Trash2, Star, Wrench, Clock3 } from "lucide-react";
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

const FIELD_LABELS: Record<string, string> = {
  type_produit: "Type de produit",
  titre: "Désignation",
  categorieParentId: "Catégorie principale",
  unite_base: "Unité de base",
  unite_vente_defaut: "Unité de vente par défaut",
  unite_achat_defaut: "Unité d'achat par défaut",
  prix_vente_defaut: "Prix de vente de l'unité par défaut",
};

const DRAFT_KEY = "product_wizard_draft";

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

export function ProductWizard({ onSave, isPending, defaultValues }: ProductWizardProps) {
  const [step, setStep] = useState(0);
  const [typeProduit, setTypeProduit] = useState<"PIECE" | "SERVICE" | null>(defaultValues?.typeProduit ?? null);
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
  // Specs 02 §2.1 : emplacements pour l'emplacement principal de l'article
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

  const [unites, setUnites] = useState<UniteRow[]>(() => {
    if (defaultValues?.unites?.length) return defaultValues.unites;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.unites) return parsed.unites;
      }
    } catch {}
    return [
      { id: "ub_1", unite_id: null, unite_label: "", facteur_conversion: 1, prix_achat: 0, prix_vente: 0, est_unite_achat_defaut: true, est_unite_vente_defaut: true, est_unite_base: true },
    ];
  });

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

  function validateStep(s: number): boolean {
    const newErrors: Record<string, string> = {};
    if (s === 0 && !typeProduit) newErrors.type_produit = "Choisissez le type de produit";
    if (s === 1) {
      if (!formValues.titre?.trim()) newErrors.titre = "Désignation requise";
      if (!formValues.categorieParentId) newErrors.categorieParentId = "Catégorie principale requise";
      if (typeProduit !== "SERVICE" && formValues.code_article && !/^[A-Z0-9-]{2,}$/.test(String(formValues.code_article).trim())) {
        newErrors.code_article = "Code article invalide (lettres, chiffres, tirets — ex. FIL-HUI-001)";
      }
    }
    if (s === 3) {
      const base = unites.find((u) => u.est_unite_base);
      if (!base?.unite_id) newErrors.unite_base = "Unité de base requise";
      if (!unites.some((u) => u.est_unite_vente_defaut && u.unite_id)) newErrors.unite_vente_defaut = "Unité de vente par défaut requise";
      if (!unites.some((u) => u.est_unite_achat_defaut && u.unite_id)) newErrors.unite_achat_defaut = "Unité d'achat par défaut requise";
      const venteDefaut = unites.find((u) => u.est_unite_vente_defaut);
      if (typeProduit !== "SERVICE" && venteDefaut && (!venteDefaut.prix_vente || venteDefaut.prix_vente <= 0)) {
        newErrors.prix_vente_defaut = "Prix de vente de l'unité par défaut requis";
      }
      for (const u of unites) {
        if (u.unite_id && (!Number.isInteger(u.facteur_conversion) || u.facteur_conversion <= 0)) {
          newErrors[`facteur_${u.id}`] = "Facteur de conversion entier positif requis (RG-017)";
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  const goToStep = (s: number) => {
    if (s === step) return;
    if (s > step) {
      for (let i = step; i < s; i++) if (!validateStep(i)) return;
    }
    setStep(s);
  };

  const handleSubmit = async () => {
    for (let s = 0; s <= 3; s++) {
      if (!validateStep(s)) {
        setStep(s);
        return;
      }
    }
    const defaultVente = unites.find((u) => u.est_unite_vente_defaut);
    const defaultAchat = unites.find((u) => u.est_unite_achat_defaut);
    const payload: Record<string, any> = {
      typeProduit: typeProduit,
      titre: formValues.titre,
      codeBarre: formValues.code_barre || undefined,
      nomCode: formValues.nom_code || undefined,
      // Specs 02 §2.1 : champs ajoutés
      codeArticle: formValues.code_article ? String(formValues.code_article).trim().toUpperCase() : undefined,
      designationCourte: formValues.designation_courte || undefined,
      refOem: formValues.ref_oem || undefined,
      refAftermarket: formValues.ref_aftermarket || undefined,
      emplacementPrincipalId: formValues.emplacement_principal_id ?? undefined,
      origineQualite: formValues.origine_qualite || "AUTRE",
      estReconditionnable: !!formValues.est_reconditionnable,
      notes: formValues.notes || undefined,
      editeur: formValues.editeur || undefined,
      description: formValues.description,
      statut: formValues.statut ?? "actif",
      etat: formValues.etat ?? "neuf",
      photos: formValues.photo_preview ? [formValues.photo_preview] : undefined,
      categorieId: formValues.categorie_id ? String(formValues.categorie_id) : formValues.categorieParentId ? String(formValues.categorieParentId) : undefined,
      prixVente: String(defaultVente?.prix_vente ?? 0),
      prixMinimumVente: formValues.prix_minimum_vente ? String(formValues.prix_minimum_vente) : undefined,
      prixAchat: defaultAchat?.prix_achat ? String(defaultAchat.prix_achat) : undefined,
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
    payload.uniteBaseId = unites.find((u) => u.est_unite_base)?.unite_id;
    payload.unites = unites
      .filter((u) => u.unite_id) // ignorer les lignes d'unités non remplies
      .map((u) => ({
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

  const stepLabels = ["Type", "Infos générales", "Détails commerciaux", "Unités & Prix", "Récap"];
  const fournisseurPrincipal = fournisseurRows.find((r) => r.estPrincipal)?.fournisseurId;

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {stepLabels.map((label, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goToStep(i)}
            disabled={(i === 0 && !!defaultValues?.typeProduit) || (i > step + 1)}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-xs font-medium transition-all ${
              i === step
                ? "bg-primary text-primary-foreground"
                : i < step
                  ? "bg-primary/20 text-primary cursor-pointer"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {(() => {
        const missing = Object.keys(errors).filter((k) => FIELD_LABELS[k]).map((k) => FIELD_LABELS[k]);
        if (!missing.length) return null;
        return (
          <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            Champs manquants : {missing.join(", ")}
          </div>
        );
      })()}

      {/* STEP 0 : Type */}
      {step === 0 && (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">Que souhaitez-vous enregistrer ?</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {([["PIECE", "Pièce détachée", Wrench], ["SERVICE", "Main d'œuvre / Prestation", Clock3]] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => { setTypeProduit(value); setErrors((p) => { const n = { ...p }; delete n.type_produit; return n; }); }}
                className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                  typeProduit === value ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:border-primary/40"
                }`}
              >
                <Icon className="size-6 text-primary" />
                <div>
                  <div className="font-medium">{label}</div>
                  <div className="text-xs text-muted-foreground">
                    {value === "PIECE" ? "Pièces de rechange, consommables, pneumatiques…" : "Diagnostic, réparation, entretien, heures atelier…"}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {errors.type_produit && <p className={errorCls}>{errors.type_produit}</p>}
        </div>
      )}

      {/* STEP 1 : Infos générales */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Désignation *</Label>
              <Input value={formValues.titre ?? ""} onChange={(e) => updateFormValue("titre", e.target.value)} placeholder="Ex: Filtre à huile universel" maxLength={150} />
              {errors.titre && <p className={errorCls}>{errors.titre}</p>}
            </div>
            <div>
              <Label>Désignation courte</Label>
              <Input value={formValues.designation_courte ?? ""} onChange={(e) => updateFormValue("designation_courte", e.target.value)} placeholder="Ex: Filtre à huile" maxLength={200} />
              <p className="mt-1 text-xs text-muted-foreground">Nom abrégé pour les listes et étiquettes (specs stock).</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Code article *</Label>
              <Input value={formValues.code_article ?? ""} onChange={(e) => updateFormValue("code_article", e.target.value.toUpperCase())} placeholder="Ex: FIL-HUI-001" maxLength={100} className="uppercase font-mono" />
              <p className="mt-1 text-xs text-muted-foreground">Code interne unique (specs : code_article).</p>
              {errors.code_article && <p className={errorCls}>{errors.code_article}</p>}
            </div>
            <div>
              <Label>Code-barres</Label>
              <Input value={formValues.code_barre ?? ""} onChange={(e) => updateFormValue("code_barre", e.target.value)} placeholder="EAN-13, code interne…" maxLength={100} />
              <p className="mt-1 text-xs text-muted-foreground">Laisser vide pour générer automatiquement (AO-…)</p>
            </div>
            <div>
              <Label>Nom de code</Label>
              <Input value={formValues.nom_code ?? ""} onChange={(e) => updateFormValue("nom_code", e.target.value.toUpperCase())} placeholder="Auto : 2 premières lettres de chaque mot" maxLength={100} className="uppercase" />
              <p className="mt-1 text-xs text-muted-foreground">Code de recherche rapide, généré depuis la désignation.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Catégorie principale *</Label>
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
              {errors.categorieParentId && <p className={errorCls}>{errors.categorieParentId}</p>}
            </div>
            {formValues.categorieParentId && (
              <div>
                <Label>Sous-catégorie</Label>
                <Select value={formValues.categorie_id?.toString() ?? ""} onValueChange={(v) => updateFormValue("categorie_id", v === NO_VALUE ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_VALUE}>Aucune</SelectItem>
                    {childCats?.filter((c: any) => c.typeBranche === typeProduit || c.id === formValues.categorie_id).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Marque / Constructeur</Label>
              <Input value={formValues.editeur ?? ""} onChange={(e) => updateFormValue("editeur", e.target.value)} placeholder="Ex: Générique, Toyota, Bosch…" maxLength={255} />
            </div>
            <div>
              <Label>État</Label>
              <Select value={formValues.etat ?? "neuf"} onValueChange={(v) => updateFormValue("etat", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="neuf">Neuf</SelectItem>
                  <SelectItem value="occasion">Occasion</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Référence constructeur</Label>
              <Input value={formValues.reference_fabricant ?? ""} onChange={(e) => updateFormValue("reference_fabricant", e.target.value)} placeholder="Ex: 90915-YZZD1" maxLength={255} />
            </div>
            <div>
              <Label>Référence OEM</Label>
              <Input value={formValues.ref_oem ?? ""} onChange={(e) => updateFormValue("ref_oem", e.target.value)} placeholder="Référence d'origine constructeur" maxLength={255} />
            </div>
            <div>
              <Label>Référence aftermarket</Label>
              <Input value={formValues.ref_aftermarket ?? ""} onChange={(e) => updateFormValue("ref_aftermarket", e.target.value)} placeholder="Référence équivalent après-vente" maxLength={255} />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <textarea value={formValues.description ?? ""} onChange={(e) => updateFormValue("description", e.target.value)} rows={2} maxLength={500}
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" placeholder="Compatibilité véhicules, remarques…" />
          </div>
          <div>
            <Label>Notes internes</Label>
            <textarea value={formValues.notes ?? ""} onChange={(e) => updateFormValue("notes", e.target.value)} rows={1} maxLength={500}
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" placeholder="Notes internes (specs stock : notes)" />
          </div>
          <div>
            <Label>Photo produit</Label>
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
            <p className="mt-1 text-xs text-muted-foreground">jpg, png, max 2 Mo</p>
          </div>
          <div>
            <Label>Statut (specs : Actif / Inactif / Obsolète / Hors série)</Label>
            <div className="flex flex-wrap gap-3">
              {[["actif", "Actif"], ["inactif", "Inactif"], ["obsolete", "Obsolète"], ["hors_serie", "Hors série"]].map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="statut" checked={(formValues.statut ?? "actif") === v} onChange={() => updateFormValue("statut", v)} />
                  {l}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2 : Détails commerciaux */}
      {step === 2 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Marque</Label>
            <Input value={formValues.marque ?? ""} onChange={(e) => updateFormValue("marque", e.target.value)} maxLength={255} />
          </div>
          <div>
            <Label>Référence fabricant</Label>
            <Input value={formValues.reference_fabricant ?? ""} onChange={(e) => updateFormValue("reference_fabricant", e.target.value)} maxLength={255} placeholder="Ex: FH-001, OEM 12345…" />
          </div>
          <div>
            <Label>Référence OEM</Label>
            <Input value={formValues.ref_oem ?? ""} onChange={(e) => updateFormValue("ref_oem", e.target.value)} maxLength={255} placeholder="Référence d'origine constructeur" />
          </div>
          <div>
            <Label>Référence aftermarket</Label>
            <Input value={formValues.ref_aftermarket ?? ""} onChange={(e) => updateFormValue("ref_aftermarket", e.target.value)} maxLength={255} placeholder="Référence équivalent après-vente" />
          </div>
          <div>
            <Label>Origine / Qualité (specs V2)</Label>
            <Select value={formValues.origine_qualite ?? "AUTRE"} onValueChange={(v) => updateFormValue("origine_qualite", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CONSTRUCTEUR">Constructeur (Genuine)</SelectItem>
                <SelectItem value="OEM">OEM équivalent</SelectItem>
                <SelectItem value="AFTERMARKET">Aftermarket</SelectItem>
                <SelectItem value="AUTRE">Autre</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Distinction de la qualité/origine de la pièce.</p>
          </div>
          <div className="sm:col-span-2">
            <Label>Emplacement principal</Label>
            <Select value={formValues.emplacement_principal_id?.toString() ?? ""} onValueChange={(v) => updateFormValue("emplacement_principal_id", v === NO_VALUE ? null : Number(v))}>
              <SelectTrigger><SelectValue placeholder="Aucun emplacement défini" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_VALUE}>Aucun emplacement</SelectItem>
                {emplacements?.map((e: any) => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.code}{e.libelle ? ` — ${e.libelle}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Emplacement de stockage par défaut (specs stock : emplacement_principal).</p>
          </div>
          <div className="sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={!!formValues.est_reconditionnable} onChange={(e) => updateFormValue("est_reconditionnable", e.target.checked)} className="size-4 accent-primary" />
              Article reconditionnable (fût → unités plus petites — huiles, fluides)
            </label>
            <p className="mt-1 text-xs text-muted-foreground">Autorise le reconditionnement dans le module Stock (specs stock : est_reconditionnable).</p>
          </div>
          <div>
            <Label>Couleur</Label>
            <Input value={formValues.couleur ?? ""} onChange={(e) => updateFormValue("couleur", e.target.value)} maxLength={100} />
          </div>
          <div>
            <Label>Format / Dimension</Label>
            <Select value={formValues.format ?? ""} onValueChange={(v) => updateFormValue("format", v === NO_VALUE ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_VALUE}>Aucun</SelectItem>
                {["A3", "A4", "A5", "AUTRE"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Matière / Composition</Label>
            <textarea value={formValues.matiere_composition ?? ""} onChange={(e) => updateFormValue("matiere_composition", e.target.value)} rows={2} maxLength={500}
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
          </div>
        </div>
      )}

      {/* STEP 3 : Unités & Prix */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>TVA (%)</Label>
              <Input type="number" value={formValues.tva ?? ""} onChange={(e) => updateFormValue("tva", e.target.value)} placeholder="19.25" />
            </div>
            <div>
              <Label>Prix minimum de vente</Label>
              <Input type="number" value={formValues.prix_minimum_vente ?? ""} onChange={(e) => updateFormValue("prix_minimum_vente", e.target.value)} placeholder="Si vide, pas de minimum" />
            </div>
          </div>

          <div>
            <Label>Fournisseur principal</Label>
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
          </div>

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
              <Button type="button" variant="secondary" size="sm" onClick={addFournisseurRow}><Plus className="size-3" /> Ajouter</Button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Seuil d'alerte stock</Label>
              <Input type="number" value={formValues.seuil_alerte_stock ?? 5} onChange={(e) => updateFormValue("seuil_alerte_stock", Number(e.target.value))} />
            </div>
            <div>
              <Label>Seuil critique</Label>
              <Input type="number" value={formValues.seuil_critique ?? 2} onChange={(e) => updateFormValue("seuil_critique", Number(e.target.value))} />
            </div>
            <div>
              <Label>Stock maximum</Label>
              <Input type="number" value={formValues.stock_maximum ?? ""} onChange={(e) => updateFormValue("stock_maximum", e.target.value ? Number(e.target.value) : null)} placeholder="Illimité si vide" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Unités de vente / achat</Label>
              <Button type="button" variant="secondary" size="sm" onClick={addUniteRow}><Plus className="size-3" /> Ajouter une unité</Button>
            </div>
            {unites.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
                <Select value={u.unite_id ?? ""} onValueChange={(v) => setUniteField(u.id, "unite_id", v)}>
                  <SelectTrigger className="w-36"><SelectValue placeholder="Unité" /></SelectTrigger>
                  <SelectContent>
                    {unitesMesure?.map((x: any) => <SelectItem key={x.id} value={x.id}>{x.libelle} ({x.symbole})</SelectItem>)}
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
                  <input type="checkbox" checked={u.est_unite_base} disabled={true} /> Base
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
            {errors.unite_base && <p className={errorCls}>{errors.unite_base}</p>}
            {errors.unite_vente_defaut && <p className={errorCls}>{errors.unite_vente_defaut}</p>}
            {errors.unite_achat_defaut && <p className={errorCls}>{errors.unite_achat_defaut}</p>}
            {errors.prix_vente_defaut && <p className={errorCls}>{errors.prix_vente_defaut}</p>}
          </div>
        </div>
      )}

      {/* STEP 4 : Récap */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card/50 p-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Type</dt>
                <dd className="text-right font-medium">{typeProduit === "PIECE" ? "Pièce détachée" : "Main d'œuvre"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Désignation</dt>
                <dd className="text-right font-medium">{formValues.titre ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Catégorie</dt>
                <dd className="text-right font-medium">{categories?.find((c: any) => String(c.id) === (formValues.categorie_id ?? formValues.categorieParentId))?.nom ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Code-barres</dt>
                <dd className="text-right font-medium">{formValues.code_barre ? formValues.code_barre : "Généré automatiquement"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Nom de code</dt>
                <dd className="text-right font-medium">{formValues.nom_code ? formValues.nom_code : "Généré automatiquement"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">TVA</dt>
                <dd className="text-right font-medium">{formValues.tva ? `${formValues.tva} %` : "0 %"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Seuil d'alerte</dt>
                <dd className="text-right font-medium">{formValues.seuil_alerte_stock ?? 5}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Stock maximum</dt>
                <dd className="text-right font-medium">{formValues.stock_maximum ? `${formValues.stock_maximum}` : "Illimité"}</dd>
              </div>
              {fournisseurPrincipal && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Fournisseur principal</dt>
                  <dd className="text-right font-medium">{fournisseurs?.find((f: any) => String(f.id) === fournisseurPrincipal)?.nom ?? "—"}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(3)}>Retour</Button>
            <Button type="button" onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Enregistrer le produit
            </Button>
          </div>
        </div>
      )}

      {step !== 4 && (
        <div className="flex justify-end gap-2">
          {step > 0 && <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>Retour</Button>}
          <Button type="button" onClick={() => goToStep(step + 1)}>Continuer</Button>
        </div>
      )}
    </div>
  );
}
