"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { Loader2, Plus, X, Lock, Camera, AlertTriangle, Trash2, Star } from "lucide-react";
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

const inputErrorCls = "";
const errorCls = "mt-1 text-xs text-destructive";

// Valeur sentinelle pour les choix « laisser vide » des champs facultatifs
// (Radix ne permet pas de SelectItem à valeur vide).
const NO_VALUE = "__none__";

// Libellés humains des champs, pour le bandeau d'omissions et les messages inline.
const FIELD_LABELS: Record<string, string> = {
  type_produit: "Type de produit",
  titre: "Désignation",
  categorieParentId: "Catégorie principale",
  sous_systeme_id: "Sous-système",
  niveau_id: "Niveau",
  classe_id: "Classe",
  matiere_id: "Matière",
  annee_liste_id: "Année de liste",
  statut_officiel: "Statut officiel",
  ministere_id: "Ministère",
  prix_reglemente_valeur: "Valeur du prix réglementé",
  unite_base: "Unité de base",
  unite_vente_defaut: "Unité de vente par défaut",
  unite_achat_defaut: "Unité d'achat par défaut",
  prix_vente_defaut: "Prix de vente de l'unité par défaut",
};

const DRAFT_KEY = "product_wizard_draft";

/** Nom de code : 2 premières lettres de chaque mot du titre (ex. "32 BANANIER" → "32BA"). */
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

export function ProductWizard({
  onSave, isPending, defaultValues,
}: ProductWizardProps) {
  const utils = api.useUtils();

  const [step, setStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [typeProduit, setTypeProduit] = useState<"MANUEL" | "FOURNITURE" | null>(
    defaultValues?.typeProduit ?? null
  );
  const [duplicateAlert, setDuplicateAlert] = useState<{ id: string; titre: string; date: string } | null>(null);
  const [duplicateIgnored, setDuplicateIgnored] = useState(false);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [isbnWarning, setIsbnWarning] = useState<string | null>(null);
  const [barcodeWarning, setBarcodeWarning] = useState<string | null>(null);
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
    setFormValues(prev => ({ ...prev, [key]: value }));
    if (key === "titre" && !nomCodeTouched) {
      setFormValues(prev => ({ ...prev, nom_code: nomCodeFromTitre(value) }));
    }
    if (key === "nom_code") setNomCodeTouched(true);
    setErrors(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const clearError = (key: string) => {
    setErrors(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const [fournisseurRows, setFournisseurRows] = useState<Record<string, any>[]>(() => {
    if (defaultValues?.fournisseurs && defaultValues.fournisseurs.length > 0) {
      return defaultValues.fournisseurs.map((f: any) => ({ ...f, uniteId: f.uniteId ?? "" }));
    }
    if (defaultValues?.fournisseur_id) return [{ id: "fs_0", fournisseurId: defaultValues.fournisseur_id, uniteId: "", reference: "", prixAchat: "", delai: "", estPrincipal: true }];
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.fournisseurRows) return parsed.fournisseurRows;
      }
    } catch {}
    return [];
  });

  const addFournisseurRow = () => {
    setFournisseurRows(prev => [...prev, { id: `fs_${Date.now()}`, fournisseurId: "", uniteId: "", reference: "", prixAchat: "", delai: "", estPrincipal: prev.length === 0 }]);
  };

  const updateFournisseurRow = (id: string, field: string, value: any) => {
    setFournisseurRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeFournisseurRow = (id: string) => {
    setFournisseurRows(prev => {
      const filtered = prev.filter(r => r.id !== id);
      const hasPrincipal = filtered.some(r => r.estPrincipal);
      if (!hasPrincipal && filtered.length > 0) filtered[0].estPrincipal = true;
      return filtered;
    });
  };

  const setPrincipalFournisseur = (id: string) => {
    setFournisseurRows(prev => prev.map(r => ({ ...r, estPrincipal: r.id === id })));
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

  const { data: categories } = api.catalog.listCategories.useQuery();
  const { data: niveaux } = api.reference.listNiveaux.useQuery(
    { sousSystemeId: formValues.sous_systeme_id || undefined },
  );
  const { data: filieres } = api.reference.listFilieres.useQuery();
  // Les classes du référentiel sont rattachées au niveau (classes générales,
  // sans filière) : la filière est un attribut du manuel, elle ne filtre pas
  // la liste des classes proposées. Sans ce choix, sélectionner une filière
  // pour un niveau secondaire viderait le dropdown Classe.
  const classesFilter = useMemo(() => {
    return formValues.niveau_id ? { niveauId: formValues.niveau_id } : undefined;
  }, [formValues.niveau_id]);
  const { data: classes } = api.reference.listClasses.useQuery(classesFilter);
  const { data: matieres } = api.reference.listMatieres.useQuery();
  const { data: sousSystemes } = api.reference.listSousSystemes.useQuery();
  const { data: anneesScolaires } = api.reference.listAnneesScolaires.useQuery();
  const { data: ministeres } = api.reference.listMinisteres.useQuery();
  const { data: unitesMesure } = api.reference.listUnitesMesure.useQuery();
  const { data: fournisseurs } = api.reference.listFournisseurs.useQuery();

  // RG-006 : la filière ne peut être sélectionnée que pour un niveau secondaire.
  const niveauSecondaire = useMemo(() => {
    const code = niveaux?.find(n => n.id === formValues.niveau_id)?.code;
    return code === "SEC" || code === "SECONDARY";
  }, [niveaux, formValues.niveau_id]);

  // Garde-fou RG-006 : une filière orpheline (brouillon localStorage, ancien
  // état) ne doit jamais être envoyée avec un niveau non secondaire — sinon le
  // serveur rejetterait l'enregistrement à la dernière étape. On la nettoie
  // dès que le niveau courant n'est pas secondaire.
  useEffect(() => {
    if (!niveaux) return;
    if (formValues.filiere_id && formValues.niveau_id && !niveauSecondaire) {
      updateFormValue("filiere_id", null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [niveaux, formValues.niveau_id, formValues.filiere_id, niveauSecondaire]);

  useEffect(() => {
    if (defaultValues?.unites?.length) {
      setUnites(defaultValues.unites);
    }
  }, [defaultValues]);

  useEffect(() => {
    if (!defaultValues || !categories?.length) return;
    if (formValues.categorieParentId || !formValues.categorie_id) return;
    const cat = categories.find((c: any) => String(c.id) === String(formValues.categorie_id));
    if (!cat) return;
    updateFormValue(
      "categorieParentId",
      cat.parentId != null ? String(cat.parentId) : String(cat.id)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, defaultValues, formValues.categorieParentId, formValues.categorie_id]);

  useEffect(() => {
    if (defaultValues) return;
    const timer = setInterval(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ formValues, unites, fournisseurRows })); } catch {}
    }, 30000);
    return () => clearInterval(timer);
  }, [formValues, unites, fournisseurRows, defaultValues]);

  const checkDuplicate = useCallback(async (titre: string) => {
    if (!titre || titre.length < 3) return;
    setIsCheckingDuplicate(true);
    try {
      const result = await utils.catalog.list.fetch({ query: titre, limit: 5 });
      const exact = result.items.find(
        (p: any) => p.titre?.toLowerCase() === titre.toLowerCase()
      );
      if (exact) {
        setDuplicateAlert({ id: exact.id, titre: exact.titre, date: exact.createdAt ? new Date(exact.createdAt).toLocaleDateString("fr-FR") : "date inconnue" });
        setDuplicateIgnored(false);
      } else {
        setDuplicateAlert(null);
      }
    } finally {
      setIsCheckingDuplicate(false);
    }
  }, [utils]);

  // Validations douces (non bloquantes) des formats ISBN / EAN-13.
  const checkIsbnFormat = (v: string) => {
    const digits = v.replace(/[^0-9Xx]/g, "");
    setIsbnWarning(v && !(digits.length === 10 || digits.length === 13)
      ? "Format ISBN attendu : 10 ou 13 chiffres (ex: 978-2-0703-6350-4)"
      : null);
  };

  const checkEanFormat = (v: string) => {
    if (!/^\d{13}$/.test(v)) { setBarcodeWarning(null); return; }
    const digits = v.split("").map(Number);
    const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
    const expected = (10 - (sum % 10)) % 10;
    setBarcodeWarning(expected === digits[12] ? null : "Le code EAN-13 saisi est invalide (clé de contrôle erronée)");
  };

  const validateStep = useCallback((s: number): boolean => {
    const newErrors: Record<string, string> = {};
    const isEditing = !!defaultValues?.typeProduit;
    if (s === 0) {
      if (!typeProduit) newErrors["type_produit"] = "Sélectionnez un type de produit";
    }
    if (s === 1) {
      if (!formValues.titre) newErrors["titre"] = "Désignation requise";
      if (!formValues.categorieParentId) newErrors["categorieParentId"] = "Veuillez sélectionner une catégorie";
    }
    if (s === 2 && typeProduit === "MANUEL") {
      if (!formValues.titre) newErrors["titre"] = "Titre requis";
      // En édition, un manuel importé sans classification reste modifiable :
      // les champs vides sont conservés tels quels. La validation bloquante ne
      // s'applique qu'à la création.
      if (!isEditing) {
        if (!formValues.sous_systeme_id) newErrors["sous_systeme_id"] = "Requis";
        if (!formValues.niveau_id) newErrors["niveau_id"] = "Requis";
        if (!formValues.classe_id) newErrors["classe_id"] = "Requis";
        if (!formValues.matiere_id) newErrors["matiere_id"] = "Requis";
        if (!formValues.annee_liste_id) newErrors["annee_liste_id"] = "Requis";
        if (!formValues.statut_officiel) newErrors["statut_officiel"] = "Requis";
        if (!formValues.ministere_id) newErrors["ministere_id"] = "Requis";
      }
      if (formValues.prix_reglemente && (!formValues.prix_reglemente_valeur || Number(formValues.prix_reglemente_valeur) <= 0)) {
        newErrors["prix_reglemente_valeur"] = "La valeur du prix réglementé est requise";
      }
    }
    if (s === 3) {
      const base = unites.find(u => u.est_unite_base);
      if (!base?.unite_id) newErrors["unite_base"] = "Sélectionnez l'unité de base";
      for (const u of unites) {
        if (!u.est_unite_base && u.unite_id && (u.facteur_conversion <= 0 || !Number.isInteger(u.facteur_conversion))) {
          newErrors[`facteur_${u.id}`] = "Le facteur doit être un entier strictement positif (RG-017)";
        }
      }
      const defautVente = unites.find(u => u.est_unite_vente_defaut && u.unite_id);
      if (!defautVente) newErrors["unite_vente_defaut"] = "Une unité de vente par défaut requise";
      if (!formValues.prix_reglemente && defautVente && (!defautVente.prix_vente || defautVente.prix_vente <= 0)) {
        newErrors["prix_vente_defaut"] = "Le prix de vente de l'unité par défaut est requis";
      }
      const defautAchat = unites.find(u => u.est_unite_achat_defaut && u.unite_id);
      if (!defautAchat) newErrors["unite_achat_defaut"] = "Une unité d'achat par défaut requise";
      const fournisseurIds = fournisseurRows.filter(r => r.fournisseurId).map(r => String(r.fournisseurId));
      if (new Set(fournisseurIds).size !== fournisseurIds.length) {
        newErrors["fournisseur_duplique"] = "Le même fournisseur est sélectionné plusieurs fois (principal + secondaire)";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [typeProduit, formValues, unites, fournisseurRows, defaultValues]);

  const nextStep = () => {
    if (validateStep(step)) {
      setCompletedSteps(prev => new Set([...prev, step]));
      setStep(s => Math.min(s + 1, 4));
    }
  };

  const prevStep = () => setStep(s => Math.max(s - 1, 0));

  const goToStep = (target: number) => {
    if (target === step) return;
    if (target === 0 && defaultValues?.typeProduit) return;
    if (target < step || completedSteps.has(target - 1)) {
      setStep(target);
    }
  };

  const addUnite = () => {
    setUnites(prev => [...prev, {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      unite_id: null,
      unite_label: "",
      facteur_conversion: 1,
      prix_achat: 0,
      prix_vente: 0,
      est_unite_achat_defaut: false,
      est_unite_vente_defaut: false,
      est_unite_base: false,
    }]);
  };

  const removeUnite = (id: string) => {
    setUnites(prev => prev.filter(u => u.id !== id || u.est_unite_base));
  };

  const updateUnite = (id: string, field: keyof UniteRow, value: any) => {
    setUnites(prev => {
      if (field === "est_unite_achat_defaut" && value === true) {
        return prev.map(u => ({ ...u, est_unite_achat_defaut: u.id === id }));
      }
      if (field === "est_unite_vente_defaut" && value === true) {
        return prev.map(u => ({ ...u, est_unite_vente_defaut: u.id === id }));
      }

      const updated = prev.map(u => u.id === id ? { ...u, [field]: value } : u);
      const base = updated.find(u => u.est_unite_base);
      if (!base || !base.unite_id) return updated;

      if (id === base.id && (field === "prix_vente" || field === "prix_achat")) {
        return updated.map(u => {
          if (u.est_unite_base) return u;
          return {
            ...u,
            ...(field === "prix_vente" ? { prix_vente: (value || 0) * (u.facteur_conversion || 1) } : {}),
            ...(field === "prix_achat" ? { prix_achat: (value || 0) * (u.facteur_conversion || 1) } : {}),
          };
        });
      }

      if (id !== base.id && field === "facteur_conversion") {
        return updated.map(u => {
          if (u.id !== id) return u;
          return {
            ...u,
            prix_vente: (base.prix_vente || 0) * (value || 1),
            prix_achat: (base.prix_achat || 0) * (value || 1),
          };
        });
      }

      return updated;
    });
  };

  const handleSubmit = async () => {
    // Aucun message bloquant d'une étape précédente ne doit surgir au moment
    // d'enregistrer : on revérifie chaque étape et on ramène l'utilisateur à la
    // première étape invalide, où les messages s'affichent à leur niveau.
    for (let s = 0; s <= 3; s++) {
      if (!validateStep(s)) {
        setStep(s);
        return;
      }
    }
    const selectedNiveau = niveaux?.find(n => n.id === formValues.niveau_id);
    const selectedMatiere = matieres?.find(m => m.id === formValues.matiere_id);
    const selectedMinistere = ministeres?.find(m => m.id === formValues.ministere_id);
    const selectedAnnee = anneesScolaires?.find(a => a.id === formValues.annee_liste_id);

    const prixReglemente = typeProduit === "MANUEL" && formValues.prix_reglemente;
    const prixReglementeValeur = prixReglemente ? Number(formValues.prix_reglemente_valeur) : null;
    if (prixReglemente && prixReglementeValeur) {
      setUnites(prev => prev.map(u => u.est_unite_base ? { ...u, prix_vente: prixReglementeValeur } : u));
    }

    const defaultVente = unites.find(u => u.est_unite_vente_defaut);
    const defaultAchat = unites.find(u => u.est_unite_achat_defaut);
    const payload: Record<string, any> = {
      typeProduit: typeProduit,
      titre: formValues.titre,
      codeBarre: formValues.code_barre || undefined,
      nomCode: formValues.nom_code || undefined,
      description: formValues.description,
      statut: formValues.statut ?? "actif",
      etat: formValues.etat ?? "neuf",
      auteur: formValues.auteur || undefined,
      editeur: formValues.editeur || undefined,
      isbn: formValues.isbn || undefined,
      collection: formValues.collection || undefined,
      langue: formValues.langue || undefined,
      photos: formValues.photo_preview ? [formValues.photo_preview] : undefined,
      categorieId: formValues.categorie_id ? String(formValues.categorie_id) : (formValues.categorieParentId ? String(formValues.categorieParentId) : undefined),
      prixVente: prixReglemente ? String(prixReglementeValeur) : String(defaultVente?.prix_vente ?? 0),
      prixMinimumVente: typeProduit === "MANUEL" ? String(prixReglemente ? prixReglementeValeur : (defaultVente?.prix_vente ?? 0)) : (formValues.prix_minimum_vente ? String(formValues.prix_minimum_vente) : undefined),
      prixAchat: defaultAchat?.prix_achat ? String(defaultAchat.prix_achat) : undefined,
      tva: formValues.tva ? String(formValues.tva) : "0",
      uniteVente: defaultVente?.unite_label || "unite",
      uniteAchat: defaultAchat?.unite_label || "unite",
      fournisseurId: fournisseurRows.find(r => r.estPrincipal)?.fournisseurId ? String(fournisseurRows.find(r => r.estPrincipal)!.fournisseurId) : undefined,
      fournisseurs: fournisseurRows.filter(r => r.fournisseurId).map(r => ({
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
    };

    if (typeProduit === "MANUEL") {
      payload.sousSystemeId = formValues.sous_systeme_id;
      payload.niveauId = formValues.niveau_id;
      payload.filiereId = formValues.filiere_id || undefined;
      payload.classeId = formValues.classe_id;
      payload.matiereId = formValues.matiere_id;
      payload.anneeListeId = formValues.annee_liste_id;
      payload.ministereId = formValues.ministere_id;
      payload.statutOfficiel = formValues.statut_officiel;
      payload.prixReglemente = prixReglemente;
      if (prixReglemente && prixReglementeValeur) {
        payload.prixReglementeValeur = String(prixReglementeValeur);
      }
      payload.uniteBaseId = unites.find(u => u.est_unite_base)?.unite_id;
      payload.niveauScolaire = selectedNiveau?.libelle;
      payload.matiere = selectedMatiere?.libelle;
    } else {
      payload.marque = formValues.marque;
      payload.referenceFabricant = formValues.reference_fabricant;
      payload.couleur = formValues.couleur;
      payload.format = formValues.format;
      payload.matiereComposition = formValues.matiere_composition;
    }

    payload.unites = unites.map(u => ({
      unite_id: u.unite_id,
      facteur_conversion: u.facteur_conversion,
      prix_achat: u.prix_achat,
      prix_vente: prixReglemente && u.est_unite_base ? prixReglementeValeur : u.prix_vente,
      est_unite_achat_defaut: u.est_unite_achat_defaut,
      est_unite_vente_defaut: u.est_unite_vente_defaut,
      est_unite_base: u.est_unite_base,
    }));

    await onSave(payload);
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  };

  const stepLabels = ["Type", "Infos générales", "Classification", "Unités & Prix", "Récap"];
  const fournisseurPrincipal = fournisseurRows.find(r => r.estPrincipal)?.fournisseurId;

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {stepLabels.map((label, i) => (
          <button key={i} type="button" onClick={() => goToStep(i)} disabled={(i === 0 && !!defaultValues?.typeProduit) || (i > step && !completedSteps.has(i - 1))}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-xs font-medium transition-all ${
              i === step ? "bg-primary text-primary-foreground" :
              completedSteps.has(i) ? "bg-primary/20 text-primary" + ((i === 0 && !!defaultValues?.typeProduit) ? " opacity-60" : " cursor-pointer") :
              "bg-muted text-muted-foreground"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {(() => {
        const missing = Object.keys(errors)
          .filter(k => FIELD_LABELS[k])
          .map(k => FIELD_LABELS[k]);
        if (!missing.length) return null;
        return (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive" role="alert">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span>
              <strong>{missing.length} champ{missing.length > 1 ? "s" : ""} obligatoire{missing.length > 1 ? "s" : ""} manquant{missing.length > 1 ? "s" : ""}</strong>
              {" : "}{missing.join(", ")}. Complétez-les pour continuer.
            </span>
          </div>
        );
      })()}

      {/* STEP 0: Type */}
      {step === 0 && (
        <div className="space-y-4">
          {defaultValues?.typeProduit ? (
            <div className="rounded-xl border-2 border-primary bg-primary/10 p-6">
              <p className="text-sm text-muted-foreground">
                Type de produit :{" "}
                <span className="inline-block rounded bg-primary px-3 py-0.5 text-sm font-medium text-primary-foreground">
                  {defaultValues.typeProduit === "MANUEL" ? "MANUEL" : "FOURNITURE"}
                </span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Le type ne peut pas être modifié.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Quel type de produit souhaitez-vous ajouter ?</p>
              <div className="flex gap-4">
                {[
                  { value: "MANUEL" as const, icon: "📘", label: "Manuel scolaire", desc: "Soumis aux listes officielles" },
                  { value: "FOURNITURE" as const, icon: "✏️", label: "Fourniture / Papeterie", desc: "Article libre" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setTypeProduit(opt.value); setErrors({}); }}
                    className={`flex-1 rounded-xl border-2 p-6 text-center transition-all ${
                      typeProduit === opt.value
                        ? "border-primary bg-primary/10"
                        : "border-border bg-muted/50 hover:border-border"
                    }`}
                  >
                    <div className="text-3xl mb-2">{opt.icon}</div>
                    <div className="font-semibold text-foreground">{opt.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </>
          )}
          {errors.type_produit && <p className={errorCls}>{errors.type_produit}</p>}
        </div>
      )}

      {/* STEP 1: General info */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <Label>Désignation *</Label>
            <Input value={formValues.titre ?? ""} onChange={e => updateFormValue("titre", e.target.value)}
              onBlur={e => checkDuplicate(e.target.value)}
              placeholder="Ex: Mathematics Form 3" maxLength={150} />
            {errors.titre && <p className={errorCls}>{errors.titre}</p>}
            {isCheckingDuplicate && <p className="mt-1 text-xs text-primary">Vérification doublon...</p>}
            {duplicateAlert && !duplicateIgnored && (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="flex items-center gap-1 text-warning-foreground">
                  <AlertTriangle className="size-3" />
                  ⚠️ Un produit similaire existe : "{duplicateAlert.titre}" (créé le {duplicateAlert.date})
                </span>
                <Link href={`/dashboard/catalog/${duplicateAlert.id}`} className="whitespace-nowrap font-medium text-primary hover:text-primary/80 underline">
                  Voir le produit
                </Link>
                <button type="button" onClick={() => { setDuplicateAlert(null); setDuplicateIgnored(true); }}
                  className="whitespace-nowrap font-medium text-muted-foreground hover:text-foreground underline">
                  Continuer quand même
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Code-barres</Label>
              <div className="flex gap-2">
                <Input value={formValues.code_barre ?? ""} onChange={e => updateFormValue("code_barre", e.target.value)}
                  onBlur={e => checkEanFormat(e.target.value)}
                  className="flex-1" placeholder="EAN-13, ISBN, code interne…" maxLength={100} />
                <Button type="button" variant="secondary" className="shrink-0 px-2 text-xs"
                  onClick={() => { navigator.clipboard?.readText?.().then(t => t && updateFormValue("code_barre", t)).catch(() => {}); }} title="Coller le code-barres depuis le presse-papiers">
                  <Camera className="size-3" /> Coller
                </Button>
              </div>
              {barcodeWarning && <p className="mt-1 text-xs text-warning-foreground">{barcodeWarning}</p>}
              <p className="mt-1 text-xs text-muted-foreground">Laisser vide pour générer automatiquement un SKU interne (AO-…)</p>
            </div>
            <div>
              <Label>Nom de code</Label>
              <Input value={formValues.nom_code ?? ""}
                onChange={e => updateFormValue("nom_code", e.target.value.toUpperCase())}
                placeholder="Auto : 2 premières lettres de chaque mot"
                maxLength={100} className="uppercase" />
              <p className="mt-1 text-xs text-muted-foreground">
                Code de recherche rapide (ex. « 32 BANANIER » → <span className="font-medium">32BA</span>). Généré automatiquement depuis la désignation, modifiable.
              </p>
            </div>
            <div className="space-y-2">
              <div>
                <Label>Catégorie principale *</Label>
                <Select value={formValues.categorieParentId?.toString() ?? ""}
                  onValueChange={v => {
                    updateFormValue("categorieParentId", v);
                    updateFormValue("categorie_id", null);
                  }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Seules les catégories de la même branche que le type choisi
                        (RG-002) : une catégorie FOURNITURE n'est pas proposée pour
                        un manuel, et inversement. */}
                    {categories?.filter(c => !c.parentId && (c.typeBranche === typeProduit || c.id === formValues.categorieParentId)).map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.categorieParentId && <p className={errorCls}>{errors.categorieParentId}</p>}
              </div>
              {formValues.categorieParentId && (
                <div>
                  <Label>Sous-catégorie</Label>
                  <Select value={formValues.categorie_id?.toString() ?? ""}
                    onValueChange={v => updateFormValue("categorie_id", v === NO_VALUE ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_VALUE}>Aucune</SelectItem>
                      {categories?.filter(c => c.parentId != null && String(c.parentId) === formValues.categorieParentId && (c.typeBranche === typeProduit || c.id === formValues.categorie_id)).map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.nom}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          {typeProduit === "MANUEL" && <p className="text-xs text-muted-foreground -mt-2">Vous pouvez aussi définir la classification pédagogique à l'étape suivante</p>}
          <div>
            <Label>Description</Label>
            <textarea value={formValues.description ?? ""} onChange={e => updateFormValue("description", e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground outline-none transition-all duration-200 focus:border-ring focus:ring-2 focus:ring-ring/20" rows={2} maxLength={500} placeholder="Description (max 500 car.)" />
            <p className="mt-1 text-xs text-muted-foreground">{(formValues.description ?? "").length}/500</p>
          </div>
          <div>
            <Label>Photo produit</Label>
            <div className="mt-1 flex items-center gap-4">
              <div className="flex-1 rounded-lg border-2 border-dashed border-border bg-muted/30 p-4 text-center hover:border-border transition-colors cursor-pointer"
                onClick={() => {
                  const fileInput = document.getElementById("product-photo-upload") as HTMLInputElement;
                  fileInput?.click();
                }}>
                <Camera className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-1 text-xs text-muted-foreground">Cliquez pour ajouter une photo (jpg, png, max 2 Mo)</p>
                <input id="product-photo-upload" type="file" accept="image/jpeg,image/png" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file && file.size <= 2 * 1024 * 1024) {
                      const reader = new FileReader();
                      reader.onload = (ev) => updateFormValue("photo_preview", ev.target?.result);
                      reader.readAsDataURL(file);
                      updateFormValue("photo_file", file.name);
                    }
                  }} />
              </div>
              {formValues.photo_preview && (
                <div className="relative">
                  <img src={formValues.photo_preview} alt="Aperçu" className="size-20 rounded-lg object-cover border border-border" />
                  <button type="button" onClick={() => { updateFormValue("photo_preview", null); updateFormValue("photo_file", null); }}
                    className="absolute -top-2 -right-2 rounded-full bg-muted p-0.5 text-muted-foreground hover:text-foreground">
                    <X className="size-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
          <div>
            <Label>Statut</Label>
            <div className="flex gap-4 mt-1">
              {(defaultValues?.statut === "inactif" ? ["actif", "inactif"] : ["actif"]).map(s => (
                <label key={s} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="radio" name="statut" checked={(formValues.statut ?? "actif") === s}
                    onChange={() => updateFormValue("statut", s)} className="sr-only" />
                  <span className={`size-3 rounded-full ${(formValues.statut ?? "actif") === s ? (s === "actif" ? "bg-success" : "bg-muted-foreground") : "bg-muted"}`} />
                  {s === "actif" ? "Actif" : "Inactif"}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {defaultValues?.statut === "inactif"
                ? "Produit inactif : sélectionnez « Actif » pour le réactiver."
                : "Le produit est créé actif. La suspension / l'archivage se gèrent via le cycle de vie de la fiche produit."}
            </p>
          </div>
          <div>
            <Label>État</Label>
            <Select value={formValues.etat ?? "neuf"} onValueChange={v => updateFormValue("etat", v)}>
              <SelectTrigger>
                <SelectValue placeholder="État" />
              </SelectTrigger>
              <SelectContent>
                {["neuf", "occasion", "vieux"].map(e => (
                  <SelectItem key={e} value={e}>{e === "neuf" ? "Neuf" : e === "occasion" ? "Occasion" : "Vieux"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* STEP 2: Classification */}
      {step === 2 && (
        <div className="space-y-4">
          {typeProduit === "MANUEL" ? (
            <>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Classification pédagogique</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Sous-système *</Label>
                    <Select value={formValues.sous_systeme_id?.toString() ?? ""}
                      onValueChange={v => { updateFormValue("sous_systeme_id", v); updateFormValue("niveau_id", null); updateFormValue("filiere_id", null); updateFormValue("classe_id", null); updateFormValue("matiere_id", null); }}>
                      <SelectTrigger><SelectValue placeholder="FR / EN" /></SelectTrigger>
                      <SelectContent>
                        {sousSystemes?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.code === "FR" ? "Francophone" : "Anglophone"}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {errors.sous_systeme_id && <p className={errorCls}>{errors.sous_systeme_id}</p>}
                  </div>
                  <div>
                    <Label>Niveau *</Label>
                    <Select value={formValues.niveau_id?.toString() ?? ""}
                      onValueChange={v => {
                        updateFormValue("niveau_id", v);
                        updateFormValue("classe_id", null);
                        updateFormValue("matiere_id", null);
                        // RG-006 : la filière n'a de sens que pour un niveau
                        // secondaire — changer de niveau réinitialise la filière
                        // (sinon elle deviendrait orpheline et le serveur
                        // rejetterait l'enregistrement à la dernière étape).
                        updateFormValue("filiere_id", null);
                      }}>
                      <SelectTrigger><SelectValue placeholder="Niveau" /></SelectTrigger>
                      <SelectContent>
                        {niveaux?.map(n => <SelectItem key={n.id} value={String(n.id)}>{n.libelle}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {errors.niveau_id && <p className={errorCls}>{errors.niveau_id}</p>}
                  </div>
                  <div>
                    <Label>Filière</Label>
                    <Select value={formValues.filiere_id?.toString() ?? ""}
                      onValueChange={v => {
                        // La filière est un attribut du manuel, elle ne filtre
                        // pas les classes : la changer ne réinitialise pas la
                        // classe ni la matière déjà choisies.
                        updateFormValue("filiere_id", v === NO_VALUE ? null : v);
                      }}
                      disabled={!formValues.niveau_id || !niveauSecondaire}>
                      <SelectTrigger>
                        <SelectValue placeholder={!formValues.niveau_id || !niveauSecondaire ? "— Non requis —" : "— Aucune —"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_VALUE}>Aucune</SelectItem>
                        {filieres?.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.libelle}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {formValues.niveau_id && !niveauSecondaire && (
                      <p className="mt-1 text-xs text-muted-foreground">Filière réservée aux niveaux secondaires (RG-006)</p>
                    )}
                  </div>
                  <div>
                    <Label>Classe *</Label>
                    <Select value={formValues.classe_id?.toString() ?? ""}
                      onValueChange={v => { updateFormValue("classe_id", v); updateFormValue("matiere_id", null); }}
                      disabled={!formValues.niveau_id}>
                      <SelectTrigger>
                        <SelectValue placeholder={formValues.niveau_id ? "Classe" : "Sélectionner le niveau d'abord"} />
                      </SelectTrigger>
                      <SelectContent>
                        {classes?.map(c =>
                          <SelectItem key={c.id} value={String(c.id)}>{c.libelle}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {errors.classe_id && <p className={errorCls}>{errors.classe_id}</p>}
                    {formValues.filiere_id && classes?.length ? (
                      <p className="mt-1 text-xs text-muted-foreground">Classes générales du niveau (la filière ne restreint pas la liste)</p>
                    ) : null}
                  </div>
                  <div className="col-span-2">
                    <Label>Matière *</Label>
                    <Select value={formValues.matiere_id?.toString() ?? ""}
                      onValueChange={v => updateFormValue("matiere_id", v)}>
                      <SelectTrigger><SelectValue placeholder="Matière" /></SelectTrigger>
                      <SelectContent>
                        {matieres?.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.libelle}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {errors.matiere_id && <p className={errorCls}>{errors.matiere_id}</p>}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Informations éditoriales</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Titre du manuel *</Label>
                    <Input value={formValues.titre ?? ""} onChange={e => updateFormValue("titre", e.target.value)}
                      placeholder="Titre du manuel" />
                    {errors.titre && <p className={errorCls}>{errors.titre}</p>}
                  </div>
                  <div>
                    <Label>Auteur</Label>
                    <Input value={formValues.auteur ?? ""} onChange={e => updateFormValue("auteur", e.target.value)} />
                  </div>
                  <div>
                    <Label>Éditeur</Label>
                    <Input value={formValues.editeur ?? ""} onChange={e => updateFormValue("editeur", e.target.value)} />
                  </div>
                  <div>
                    <Label>Collection</Label>
                    <Input value={formValues.collection ?? ""} onChange={e => updateFormValue("collection", e.target.value)} placeholder="Ex: Classiques Africains" />
                  </div>
                  <div>
                    <Label>ISBN</Label>
                    <Input value={formValues.isbn ?? ""} onChange={e => updateFormValue("isbn", e.target.value)}
                      onBlur={e => checkIsbnFormat(e.target.value)} placeholder="XXX-X-XXXX-XXXX-X" />
                    {isbnWarning && <p className="mt-1 text-xs text-warning-foreground">{isbnWarning}</p>}
                  </div>
                  <div>
                    <Label>Langue</Label>
                    <Select value={formValues.langue ?? ""} onValueChange={v => updateFormValue("langue", v === NO_VALUE ? null : v)}>
                      <SelectTrigger><SelectValue placeholder="Langue" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_VALUE}>Aucune</SelectItem>
                        {["FR", "EN", "FR/EN", "ES", "DE", "LA"].map(l => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Année liste *</Label>
                    <Select value={formValues.annee_liste_id?.toString() ?? ""}
                      onValueChange={v => updateFormValue("annee_liste_id", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Année" />
                      </SelectTrigger>
                      <SelectContent>
                        {anneesScolaires?.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.libelle}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {errors.annee_liste_id && <p className={errorCls}>{errors.annee_liste_id}</p>}
                  </div>
                  <div>
                    <Label>Statut officiel *</Label>
                    <Select value={formValues.statut_officiel ?? ""}
                      onValueChange={v => updateFormValue("statut_officiel", v)}>
                      <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
                      <SelectContent>
                        {["OFFICIEL", "RECOMMANDE", "COMPLEMENTAIRE", "RETIRE"].map(s =>
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {errors.statut_officiel && <p className={errorCls}>{errors.statut_officiel}</p>}
                  </div>
                  <div>
                    <Label>Ministère *</Label>
                    <Select value={formValues.ministere_id?.toString() ?? ""}
                      onValueChange={v => updateFormValue("ministere_id", v)}>
                      <SelectTrigger><SelectValue placeholder="Ministère" /></SelectTrigger>
                      <SelectContent>
                        {ministeres?.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.code}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {errors.ministere_id && <p className={errorCls}>{errors.ministere_id}</p>}
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input type="checkbox" checked={formValues.prix_reglemente ?? false}
                        onChange={e => updateFormValue("prix_reglemente", e.target.checked)}
                        className="accent-primary" />
                      Prix réglementé (imposé par le ministère)
                    </label>
                    {formValues.prix_reglemente && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-sm text-muted-foreground"><Lock className="inline size-3 text-destructive" /> Prix imposé:</span>
                        <Input type="number" value={formValues.prix_reglemente_valeur ?? ""}
                          onChange={e => updateFormValue("prix_reglemente_valeur", Number(e.target.value))}
                          className="w-40" placeholder="Montant FCFA" />
                      </div>
                    )}
                    {errors.prix_reglemente_valeur && <p className={errorCls}>{errors.prix_reglemente_valeur}</p>}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Détails commerciaux</h4>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Marque</Label><Input value={formValues.marque ?? ""} onChange={e => updateFormValue("marque", e.target.value)} /></div>
                <div><Label>Réf. fabricant</Label><Input value={formValues.reference_fabricant ?? ""} onChange={e => updateFormValue("reference_fabricant", e.target.value)} /></div>
                <div><Label>Couleur</Label><Input value={formValues.couleur ?? ""} onChange={e => updateFormValue("couleur", e.target.value)} /></div>
                  <div>
                    <Label>Format</Label>
                    <Select value={formValues.format ?? ""} onValueChange={v => updateFormValue("format", v === NO_VALUE ? null : v)}>
                      <SelectTrigger><SelectValue placeholder="Format" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_VALUE}>Aucun</SelectItem>
                        {["A3", "A4", "A5", "AUTRE"].map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                <div className="col-span-2"><Label>Matière/Composition</Label><Input value={formValues.matiere_composition ?? ""} onChange={e => updateFormValue("matiere_composition", e.target.value)} /></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Units & Pricing */}
      {step === 3 && (
        <div className="space-y-4">
          {unites.some(u => u.unite_id && u.prix_achat > 0 && u.prix_vente > 0 && u.prix_vente < u.prix_achat) && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>Avertissement (non bloquant) : le prix de vente est inférieur au prix d'achat pour une ou plusieurs unités. L'enregistrement reste possible (vente à perte volontaire / déstockage, RG-016).</span>
            </div>
          )}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Paramètres</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>TVA (%)</Label>
                <Input type="number" value={formValues.tva ?? ""} onChange={e => updateFormValue("tva", Number(e.target.value))}
                  placeholder="Ex: 5" min={0} max={100} />
              </div>
              {typeProduit === "FOURNITURE" && (
                <div>
                  <Label>Prix minimum vente</Label>
                  <Input type="number" value={formValues.prix_minimum_vente ?? ""}
                    onChange={e => updateFormValue("prix_minimum_vente", Number(e.target.value))}
                    placeholder="Optionnel" min={0} />
                  <p className="mt-1 text-xs text-muted-foreground">Si vide, pas de minimum</p>
                </div>
              )}
              <div>
                <Label>Fournisseur principal</Label>
                <Select value={fournisseurRows.find(r => r.estPrincipal)?.fournisseurId ?? ""}
                  onValueChange={v => {
                    const principal = fournisseurRows.find(r => r.estPrincipal);
                    if (v === NO_VALUE) {
                      if (principal) updateFournisseurRow(principal.id, "fournisseurId", "");
                      return;
                    }
                    if (principal) updateFournisseurRow(principal.id, "fournisseurId", v);
                    else setFournisseurRows(prev => [...prev, { id: `fs_${Date.now()}`, fournisseurId: v, uniteId: "", reference: "", prixAchat: "", delai: "", estPrincipal: true }]);
                  }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_VALUE}>Aucun fournisseur</SelectItem>
                    {fournisseurs?.map(f => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  Autres fournisseurs
                  <button type="button" onClick={addFournisseurRow}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                    <Plus className="size-3" /> Ajouter
                  </button>
                </Label>
                <div className="space-y-1.5">
                  {fournisseurRows.filter(r => !r.estPrincipal).map(row => (
                    <div key={row.id} className="flex items-center gap-1.5 rounded border border-border bg-muted/30 p-1.5">
                      <Select value={row.fournisseurId} onValueChange={v => updateFournisseurRow(row.id, "fournisseurId", v)}>
                        <SelectTrigger className="h-7 flex-1 text-xs">
                          <SelectValue placeholder="Fournisseur" />
                        </SelectTrigger>
                        <SelectContent>
                          {fournisseurs?.map(f => (
                            <SelectItem key={f.id} value={String(f.id)}>{f.nom}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={row.uniteId ?? ""} onValueChange={v => updateFournisseurRow(row.id, "uniteId", v === NO_VALUE ? null : v)}>
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue placeholder="Unité" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_VALUE}>Aucune</SelectItem>
                          {unites.filter(u => u.unite_id).map(u => (
                            <SelectItem key={u.id} value={String(u.unite_id)}>{u.unite_label || "Unité"}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input type="text" placeholder="Réf." value={row.reference}
                        onChange={e => updateFournisseurRow(row.id, "reference", e.target.value)}
                        className="h-7 w-20 text-xs" />
                      <Input type="number" placeholder="PA" value={row.prixAchat}
                        onChange={e => updateFournisseurRow(row.id, "prixAchat", e.target.value)}
                        className="h-7 w-16 text-xs" />
                      <Input type="number" placeholder="Délai" value={row.delai}
                        onChange={e => updateFournisseurRow(row.id, "delai", e.target.value)}
                        className="h-7 w-14 text-xs" />
                      <button type="button" onClick={() => setPrincipalFournisseur(row.id)}
                        className={`p-0.5 ${row.estPrincipal ? "text-yellow-400" : "text-muted-foreground hover:text-muted-foreground/80"}`}
                        title="Définir comme principal">
                        <Star className="size-3" />
                      </button>
                      <button type="button" onClick={() => removeFournisseurRow(row.id)}
                        className="p-0.5 text-destructive hover:text-destructive/80">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
                {errors.fournisseur_duplique && <p className={errorCls}>{errors.fournisseur_duplique}</p>}
              </div>
              <div>
                {typeProduit === "MANUEL" && (() => {
                  const venteDefaut = unites.find(u => u.est_unite_vente_defaut);
                  const basePrice = venteDefaut?.prix_vente ?? 0;
                  const rachatPrice = Math.round(basePrice * 0.5 * 100) / 100;
                  return (
                    <div>
                      <Label className="flex items-center gap-1">
                        Prix rachat (max)
                        <Lock className="size-3 text-muted-foreground" />
                      </Label>
                      <div className="flex h-8 w-full items-center rounded border border-border bg-muted/50 px-3 text-sm text-muted-foreground">
                        {rachatPrice > 0 ? `${rachatPrice.toLocaleString()} FCFA` : "—"}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">50% du prix de vente (revente occasion)</p>
                    </div>
                  );
                })()}
                <div>
                  <Label>Seuil d'alerte stock</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" value={formValues.seuil_alerte_stock ?? 5}
                      onChange={e => updateFormValue("seuil_alerte_stock", Number(e.target.value))} min={0}
                      className="w-full" />
                  </div>
                </div>
                <div>
                  <Label>Seuil critique</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" value={formValues.seuil_critique ?? 2}
                      onChange={e => updateFormValue("seuil_critique", Number(e.target.value))} min={0}
                      className="w-full" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Déclenche l'alerte de rupture critique (ex: 2)</p>
                </div>
                <div>
                  <Label>Stock maximum</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" value={formValues.stock_maximum ?? ""}
                      onChange={e => updateFormValue("stock_maximum", e.target.value ? Number(e.target.value) : null)} min={0}
                      className="w-full" placeholder="Illimité" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Unité de base (référence stock)</h4>
            <Select value={unites.find(u => u.est_unite_base)?.unite_id ?? ""}
              onValueChange={v => {
                clearError("unite_base");
                const unit = unitesMesure?.find(u => u.id === v);
                setUnites(prev => prev.map(u => u.est_unite_base ? {
                  ...u, unite_id: v, unite_label: unit?.libelle ?? "",
                  prix_achat: u.prix_achat || 0, prix_vente: u.prix_vente || 0,
                } : u));
              }}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner l'unité de base" />
              </SelectTrigger>
              <SelectContent>
                {unitesMesure?.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.libelle}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.unite_base && <p className={errorCls}>{errors.unite_base}</p>}
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase">Unités de vente/achat</h4>
              <button type="button" onClick={addUnite}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
                <Plus className="size-3" /> Ajouter une unité
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase">
                    <th className="text-left px-2 py-1">Unité</th>
                    <th className="text-left px-2 py-1">Facteur</th>
                    <th className="text-left px-2 py-1">Prix achat</th>
                    <th className="text-left px-2 py-1">Prix vente</th>
                    <th className="text-center px-2 py-1">Achat déf.</th>
                    <th className="text-center px-2 py-1">Vente déf.</th>
                    <th className="px-2 py-1"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {unites.map((u) => (
                    <tr key={u.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-2 py-2">
                         <Select value={u.unite_id ?? ""}
                          onValueChange={v => {
                            const unit = unitesMesure?.find(um => um.id === v);
                            updateUnite(u.id, "unite_id", v);
                            updateUnite(u.id, "unite_label", unit?.libelle ?? "");
                          }}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Unité" />
                          </SelectTrigger>
                          <SelectContent>
                            {unitesMesure?.map(um => <SelectItem key={um.id} value={String(um.id)}>{um.libelle}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" value={u.facteur_conversion} min={1} step={1}
                          onChange={e => updateUnite(u.id, "facteur_conversion", Number(e.target.value))}
                          className="h-8 w-16 rounded border border-border bg-muted/50 px-2 text-sm text-foreground" disabled={u.est_unite_base} />
                        {errors[`facteur_${u.id}`] && <p className={errorCls}>{errors[`facteur_${u.id}`]}</p>}
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" value={u.prix_achat} min={0}
                          onChange={e => updateUnite(u.id, "prix_achat", Number(e.target.value))}
                          className="h-8 w-24 rounded border border-border bg-muted/50 px-2 text-sm text-foreground" />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <input type="number" value={u.prix_vente} min={0}
                            onChange={e => {
                              updateUnite(u.id, "prix_vente", Number(e.target.value));
                              if (Number(e.target.value) > 0) clearError("prix_vente_defaut");
                            }}
                            className="h-8 w-24 rounded border border-border bg-muted/50 px-2 text-sm text-foreground"
                            disabled={formValues.prix_reglemente && u.est_unite_base} />
                          {formValues.prix_reglemente && u.est_unite_base && <Lock className="size-3 text-destructive" />}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="radio" name="achat_defaut" checked={u.est_unite_achat_defaut}
                          onChange={() => { updateUnite(u.id, "est_unite_achat_defaut", true); clearError("unite_achat_defaut"); }}
                          className="accent-primary" />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="radio" name="vente_defaut" checked={u.est_unite_vente_defaut}
                          onChange={() => { updateUnite(u.id, "est_unite_vente_defaut", true); clearError("unite_vente_defaut"); }}
                          className="accent-primary" />
                      </td>
                      <td className="px-2 py-2 text-center">
                        {!u.est_unite_base && (
                          <button type="button" onClick={() => removeUnite(u.id)}
                            className="text-destructive hover:text-destructive/80 transition-colors">
                            <X className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {errors.unite_achat_defaut && <p className={errorCls}>{errors.unite_achat_defaut}</p>}
            {errors.unite_vente_defaut && <p className={errorCls}>{errors.unite_vente_defaut}</p>}
            {errors.prix_vente_defaut && <p className={errorCls}>{errors.prix_vente_defaut}</p>}
            <p className="mt-2 text-xs text-muted-foreground">
              Modifier le prix de l'unité de base (ou un facteur) recalcule automatiquement les prix des autres unités (× facteur).
            </p>
          </div>
        </div>
      )}

      {/* STEP 4: Récapitulatif */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Récapitulatif</h4>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Type</dt>
                <dd className="text-right font-medium">{typeProduit === "MANUEL" ? "Manuel scolaire" : "Fourniture"}</dd>
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
                <dd className="text-right font-medium">{formValues.code_barre ? formValues.code_barre : "Généré automatiquement (SKU interne)"}</dd>
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
                <dt className="text-muted-foreground">Seuil critique</dt>
                <dd className="text-right font-medium">{formValues.seuil_critique ?? 2}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Stock maximum</dt>
                <dd className="text-right font-medium">{formValues.stock_maximum ? `${formValues.stock_maximum}` : "Illimité"}</dd>
              </div>
              {fournisseurPrincipal && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Fournisseur principal</dt>
                  <dd className="text-right font-medium">{fournisseurs?.find(f => String(f.id) === fournisseurPrincipal)?.nom ?? "—"}</dd>
                </div>
              )}
              {typeProduit === "MANUEL" && (
                <>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Niveau</dt>
                    <dd className="text-right font-medium">{niveaux?.find(n => n.id === formValues.niveau_id)?.libelle ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Classe</dt>
                    <dd className="text-right font-medium">{classes?.find(c => c.id === formValues.classe_id)?.libelle ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Matière</dt>
                    <dd className="text-right font-medium">{matieres?.find(m => m.id === formValues.matiere_id)?.libelle ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Statut officiel</dt>
                    <dd className="text-right font-medium">{formValues.statut_officiel ?? "—"}</dd>
                  </div>
                  {formValues.prix_reglemente && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Prix réglementé</dt>
                      <dd className="text-right font-medium">{Number(formValues.prix_reglemente_valeur).toLocaleString()} FCFA</dd>
                    </div>
                  )}
                </>
              )}
              {typeProduit === "FOURNITURE" && (
                <>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Marque</dt>
                    <dd className="text-right font-medium">{formValues.marque || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Réf. fabricant</dt>
                    <dd className="text-right font-medium">{formValues.reference_fabricant || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Couleur</dt>
                    <dd className="text-right font-medium">{formValues.couleur || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Format</dt>
                    <dd className="text-right font-medium">{formValues.format || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Matière / Composition</dt>
                    <dd className="text-right font-medium">{formValues.matiere_composition || "—"}</dd>
                  </div>
                  {formValues.prix_minimum_vente != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Prix minimum de vente</dt>
                      <dd className="text-right font-medium">{Number(formValues.prix_minimum_vente).toLocaleString()} FCFA</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Unités & prix</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase">
                  <th className="text-left px-2 py-1">Unité</th>
                  <th className="text-left px-2 py-1">Facteur</th>
                  <th className="text-left px-2 py-1">Prix achat</th>
                  <th className="text-left px-2 py-1">Prix vente</th>
                  <th className="text-left px-2 py-1">Rôle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {unites.filter(u => u.unite_id).map(u => (
                  <tr key={u.id}>
                    <td className="px-2 py-1.5">{u.unite_label || "Unité"}</td>
                    <td className="px-2 py-1.5">{u.est_unite_base ? "1 (base)" : u.facteur_conversion}</td>
                    <td className="px-2 py-1.5">{u.prix_achat ? `${u.prix_achat.toLocaleString()} FCFA` : "—"}</td>
                    <td className="px-2 py-1.5">{u.prix_vente ? `${u.prix_vente.toLocaleString()} FCFA` : "—"}</td>
                    <td className="px-2 py-1.5">{[u.est_unite_base && "base", u.est_unite_achat_defaut && "achat", u.est_unite_vente_defaut && "vente"].filter(Boolean).join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex justify-between border-t border-border/50 pt-4">
        <Button type="button" variant="secondary" onClick={step > 0 ? prevStep : undefined}
          className={`${step === 0 ? "invisible" : ""}`}>
          ← Précédent
        </Button>
        <div className="flex gap-2">
          {step < 4 ? (
            <Button type="button" onClick={nextStep}>
              Suivant →
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Enregistrer le produit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
