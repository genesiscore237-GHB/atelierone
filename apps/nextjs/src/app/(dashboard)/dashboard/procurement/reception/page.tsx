"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { ArrowLeft, Search, Plus, CheckCircle2, Loader2, Trash2, AlertTriangle, FileSpreadsheet, Save, Printer, Layers } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { toast } from "sonner";
import { usePermissions } from "~/hooks/usePermissions";
import Link from "next/link";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";



type LigneReception = {
  id: string;
  produitId: string;
  produitLabel: string;
  codeBarre: string;
  quantiteRecue: number;
  prixUnitaire: number;
  prixAchatAvant: number | null;
  uniteRecepId: string;
  uniteRecepLabel: string;
  facteurConversion: number;
  appliquerPrixCatalogue: boolean;
  prixVente: number | null;
  prixMinimumVente: number | null;
  prixReglementeValeur: number | null;
  prixMaximumRachat: number | null;
  tva: number;
  typeProduit: string;
  prixReglemente: boolean;
  marge: number;
  unitesDisponibles: { id: string; libelle: string; facteurConversion: number; prixAchat: number | null; estDefaut: boolean }[];
  lotOpen: boolean;
  numeroLot: string;
  datePeremption: string;
  dateFabrication: string;
  provenance: string;
  qualite: string;
  fabricant: string;
};

export default function ReceptionPage() {
  const { hasPermission } = usePermissions();
  const searchParams = useSearchParams();
  const prefillProduitId = searchParams.get("produitId");

  const [fournisseur, setFournisseur] = useState("");
  const [numFacture, setNumFacture] = useState("");
  const [dateReception, setDateReception] = useState(new Date().toISOString().split("T")[0]);
  const [pointVente, setPointVente] = useState("");
  const [notes, setNotes] = useState("");
  const [lignes, setLignes] = useState<LigneReception[]>([]);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<{ reference: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewFournisseur, setShowNewFournisseur] = useState(false);
  const [newFournisseurNom, setNewFournisseurNom] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: products } = api.catalog.list.useQuery(
    { query: searchQuery || undefined, limit: 10 },
    { enabled: searchQuery.length > 0 }
  );

  const { data: prefillProduct } = api.catalog.getById.useQuery(
    { id: prefillProduitId! },
    { enabled: !!prefillProduitId }
  );

  const { data: supplierList } = api.procurement.suppliers.list.useQuery();

  const { data: agenceConfig } = api.settings.organization.get.useQuery();
  const { data: caisseList } = api.settings.pos.list.useQuery();
  const [recepPay, setRecepPay] = useState({ actif: false, mode: "especes", montant: "", caisseId: "" });

  const createFournisseur = api.procurement.suppliers.create.useMutation({
    onSuccess: (res) => {
      setFournisseur(res.id);
      setNewFournisseurNom("");
      setShowNewFournisseur(false);
      toast.success("Fournisseur créé");
    },
    onError: (e) => toast.error(e.message),
  });

  const createReception = api.procurement.createReception.useMutation({
    onSuccess: (res) => {
      setResult(res);
      utils.procurement.listReceptions.invalidate();
      utils.inventory.listStock.invalidate();
      setSaving(false);
    },
    onError: (e) => { toast.error(e.message); setSaving(false); },
  });

  const utils = api.useUtils();

  const pdvs = ["Boutique Principale", "Boutique Secondaire", "Dépôt Central"];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (prefillProduct) addProductLine(prefillProduct);
  }, [prefillProduct]);

  function getPrixAchatDefaut(produit: any): number {
    const units = (produit as any).productUnits as any[] | undefined;
    if (units?.length) {
      const def = units.find((u: any) => u.estUniteAchatDefaut || u.estUniteBase);
      return Number(def?.prixAchat ?? produit.prixAchat ?? produit.prixVente ?? 0);
    }
    return Number(produit.prixAchat ?? produit.prixVente ?? 0);
  }

  function getUnitesProduit(produit: any): { id: string; libelle: string; facteurConversion: number; prixAchat: number | null; estDefaut: boolean }[] {
    const units = (produit as any).productUnits as any[] | undefined;
    if (units?.length) {
      return units.map((u: any) => ({
        id: String(u.uniteId),
        libelle: u.unite?.libelle ?? u.libelle ?? "",
        facteurConversion: Number(u.facteurVersBase ?? u.facteurVersParent ?? 1),
        prixAchat: u.prixAchat ? Number(u.prixAchat) : null,
        estDefaut: !!u.estUniteAchatDefaut || !!u.estUniteBase,
      }));
    }
    return [{ id: "pcs", libelle: "Pièce", facteurConversion: 1, prixAchat: getPrixAchatDefaut(produit), estDefaut: true }];
  }

  function addProductLine(produit: any) {
    if (lignes.some(l => l.produitId === produit.id)) {
      toast.info("Produit déjà ajouté");
      return;
    }
    const unites = getUnitesProduit(produit);
    const uniteDefaut = unites.find(u => u.estDefaut) ?? unites[0]!;
    const estManuel = produit.typeProduit === "MANUEL";
    const homologue = produit.prixReglementeValeur ? Number(produit.prixReglementeValeur) : 0;
    const margeDefaut = estManuel && homologue > 0 ? Number(agenceConfig?.margeDefautManuels ?? 25) : 0;
    const prix = estManuel && homologue > 0
      ? Math.round(homologue * (1 - margeDefaut / 100))
      : (uniteDefaut?.prixAchat ?? getPrixAchatDefaut(produit));

    setLignes(prev => [...prev, {
      id: `l_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      produitId: produit.id,
      produitLabel: produit.titre,
      codeBarre: produit.codeBarre ?? "",
      quantiteRecue: 1,
      prixUnitaire: prix,
      prixAchatAvant: prix,
      uniteRecepId: uniteDefaut?.id ?? "pcs",
      uniteRecepLabel: uniteDefaut?.libelle ?? "Pièce",
      facteurConversion: uniteDefaut?.facteurConversion ?? 1,
      appliquerPrixCatalogue: false,
      prixVente: estManuel && homologue > 0 ? homologue : (produit.prixVente ? Number(produit.prixVente) : null),
      prixMinimumVente: produit.prixMinimumVente ? Number(produit.prixMinimumVente) : null,
      prixReglementeValeur: homologue > 0 ? homologue : (produit.prixReglementeValeur ? Number(produit.prixReglementeValeur) : null),
      prixMaximumRachat: null,
      tva: Number(produit.tva ?? 0),
      typeProduit: produit.typeProduit ?? "FOURNITURE",
      prixReglemente: !!produit.prixReglemente,
      marge: estManuel && homologue > 0 ? margeDefaut : (prix > 0 && Number(produit.prixVente ?? 0) > 0 ? Math.round(((Number(produit.prixVente) - prix) / prix) * 100) : 20),
      unitesDisponibles: unites,
      lotOpen: false,
      numeroLot: "",
      datePeremption: "",
      dateFabrication: "",
      provenance: "",
      qualite: "",
      fabricant: "",
    }]);
    setSearchQuery("");
    setShowDropdown(false);
    searchRef.current?.focus();
  }

  function updateLigne(id: string, field: keyof LigneReception, value: any) {
    setLignes(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === "uniteRecepId") {
        const u = l.unitesDisponibles.find(x => x.id === value);
        if (u) {
          updated.facteurConversion = u.facteurConversion;
          updated.uniteRecepLabel = u.libelle;
          updated.prixUnitaire = u.prixAchat ?? l.prixUnitaire;
          updated.prixAchatAvant = u.prixAchat ?? l.prixUnitaire;
        }
      }
      const estManuel = updated.typeProduit === "MANUEL";
      const homologue = Number(updated.prixReglementeValeur ?? 0);
      if (estManuel && homologue > 0) {
        if (field === "marge") {
          updated.prixUnitaire = Math.round(homologue * (1 - (Number(updated.marge ?? 0)) / 100));
        } else if (field === "prixUnitaire") {
          const pa = Number(updated.prixUnitaire ?? 0);
          if (pa > 0) updated.marge = Math.round((1 - pa / homologue) * 100);
        }
      } else if (field === "prixUnitaire" || field === "marge") {
        const pa = Number(updated.prixUnitaire ?? 0);
        const marge = Number(updated.marge ?? 0);
        if (pa > 0) updated.prixVente = Math.round(pa * (1 + marge / 100));
      }
      return updated;
    }));
  }

  function removeLigne(id: string) {
    setLignes(prev => prev.filter(l => l.id !== id));
    toast("Ligne supprimée", {
      action: { label: "Annuler", onClick: () => {} },
      duration: 3000,
    });
  }

  function getPrixAlert(l: LigneReception): string | null {
    if (!l.prixAchatAvant || l.prixAchatAvant === 0) return null;
    const diff = ((l.prixUnitaire - l.prixAchatAvant) / l.prixAchatAvant) * 100;
    if (Math.abs(diff) > 5) {
      const signe = diff > 0 ? "+" : "";
      return `⚠️ Le prix a changé de ${signe}${diff.toFixed(0)}% (${l.prixAchatAvant.toLocaleString()} → ${l.prixUnitaire.toLocaleString()})`;
    }
    return null;
  }

  function validate(): string | null {
    if (!fournisseur) return "Fournisseur requis";
    if (!numFacture) return "N° facture/BL requis";
    if (!lignes.length) return "Ajoutez au moins une ligne";
    if (lignes.some(l => l.quantiteRecue <= 0)) return "Toutes les quantités doivent être > 0";
    if (lignes.some(l => l.prixUnitaire < 0)) return "Tous les prix doivent être ≥ 0";
    return null;
  }

  function handleSubmit(draft = false) {
    const err = validate();
    if (err) { toast.error(err); return; }
    if (!draft) { setShowConfirm(true); return; }
    doSubmit(true);
  }

  function doSubmit(draft = false) {
    setSaving(true);
    setShowConfirm(false);
    const validLines = lignes.filter(l => l.quantiteRecue > 0 && l.produitId);
    createReception.mutate({
      achatId: `standalone_${Date.now()}`,
      fournisseurId: fournisseur,
      lignes: validLines.map(l => ({
        produitId: l.produitId,
        quantiteCommandee: l.quantiteRecue,
        quantiteRecue: draft ? 0 : l.quantiteRecue,
        prixUnitaire: String(l.prixUnitaire),
        uniteId: l.uniteRecepId === "pcs" ? undefined : l.uniteRecepId,
        facteurConversion: l.facteurConversion ?? 1,
        appliquerPrixCatalogue: l.appliquerPrixCatalogue,
        prixVente: l.appliquerPrixCatalogue && l.prixVente != null ? String(l.prixVente) : null,
        prixMinimumVente: l.appliquerPrixCatalogue && l.prixMinimumVente != null ? String(l.prixMinimumVente) : null,
        prixReglementeValeur: l.appliquerPrixCatalogue && l.prixReglementeValeur != null ? String(l.prixReglementeValeur) : null,
        prixMaximumRachat: l.appliquerPrixCatalogue && l.prixMaximumRachat != null ? String(l.prixMaximumRachat) : null,
        tva: l.appliquerPrixCatalogue ? String(l.tva ?? 0) : null,
        numeroLot: l.numeroLot?.trim() || undefined,
        datePeremption: l.datePeremption?.trim() || undefined,
        dateFabrication: l.dateFabrication?.trim() || undefined,
        provenance: l.provenance?.trim() || undefined,
        qualite: l.qualite?.trim() || undefined,
        fabricant: l.fabricant?.trim() || undefined,
      })),
      paiement: recepPay.actif && Number(recepPay.montant) > 0
        ? {
            mode: recepPay.mode,
            montant: String(recepPay.montant),
            caisseId: recepPay.caisseId ? Number(recepPay.caisseId) : undefined,
          }
        : undefined,
      notes: notes || undefined,
    });
  }

  const totalLignes = lignes.length;
  const totalQte = lignes.reduce((s, l) => s + l.quantiteRecue, 0);
  const totalMontant = lignes.reduce((s, l) => s + l.quantiteRecue * l.prixUnitaire, 0);
  const hasPrixAlert = lignes.some(l => getPrixAlert(l) !== null);

  if (result) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-xl border border-border bg-card p-8 text-center max-w-lg mx-auto mt-12">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="size-7 text-success-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">✅ Réception enregistrée avec succès</h2>
          <p className="text-sm text-muted-foreground mb-2">Réf: <span className="font-mono text-foreground">{result.reference}</span></p>
          <div className="mt-6 flex justify-center gap-3 flex-wrap">
            <Button variant="secondary">
              <Printer className="size-4" /> Imprimer
            </Button>
            <Button variant="secondary" onClick={() => { setResult(null); setFournisseur(""); setNumFacture(""); setLignes([]); setNotes(""); }}>
              Nouvelle réception
            </Button>
            <Link href="/dashboard/procurement"><Button variant="secondary">Retour au stock</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div>
        <Link href="/dashboard/procurement" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Achats
        </Link>
        <div className="mt-2">
          <h1 className="text-lg font-semibold text-foreground">Nouvelle réception de stock</h1>
        </div>
      </div>

      {/* EN-TÊTE */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">En-tête de réception</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Fournisseur *</Label>
            <div className="flex gap-1">
              <Select value={fournisseur} onValueChange={setFournisseur}>
                <SelectTrigger className={`flex-1 h-[38px] text-sm ${!fournisseur ? "text-muted-foreground" : ""}`}>
                  <SelectValue placeholder="Sélectionner un fournisseur" />
                </SelectTrigger>
                <SelectContent>
                  {supplierList?.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button onClick={() => setShowNewFournisseur(true)} title="Nouveau fournisseur"
                className="shrink-0 rounded-lg border border-border bg-muted/50 px-2 text-xs text-primary hover:text-primary/80 hover:border-ring transition-colors">
                + Nouveau
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>N° facture/BL *</Label>
            <Input value={numFacture} onChange={e => setNumFacture(e.target.value)} placeholder="Ex: FAC-2201" />
          </div>
          <div className="space-y-1.5">
            <Label>Date réception *</Label>
            <Input type="date" value={dateReception} onChange={e => setDateReception(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Point de vente *</Label>
            <Select value={pointVente} onValueChange={setPointVente}>
              <SelectTrigger className="h-[38px] text-sm">
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent>
                {pdvs.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* LIGNES DE RÉCEPTION */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Lignes de réception</h2>
          <div className="flex gap-2">
            <button onClick={() => document.getElementById("file-import-input")?.click()}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
              <FileSpreadsheet className="size-3" /> Import fichier
            </button>
            <input id="file-import-input" type="file" accept=".csv,.xlsx" className="hidden"
              onChange={e => { const file = e.target.files?.[0]; if (file) toast.info("Import fichier (simulation)"); }} />
          </div>
        </div>

        {/* Product search autocomplete */}
        <div className="mb-4 relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input ref={searchRef} value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); }}
                className="w-full rounded-lg border border-border bg-muted/50 pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
                placeholder="🔍 Rechercher un produit (nom, code-barres)..." />
            </div>
            <Button type="button" onClick={() => {
              if (searchQuery && products?.items?.length) addProductLine(products.items[0]!);
            }} disabled={!searchQuery} className="shrink-0">
              <Plus className="size-4" /> Ajouter
            </Button>
          </div>
          {showDropdown && searchQuery && products?.items?.length && (
            <div ref={dropdownRef} className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-background shadow-xl max-h-60 overflow-y-auto">
              {products.items.map((p: any) => {
                const already = lignes.some(l => l.produitId === p.id);
                return (
                  <button key={p.id} type="button" disabled={already}
                    onClick={() => addProductLine(p)}
                    className={`w-full text-left px-3 py-2.5 text-sm border-b border-border/50 last:border-b-0 transition-colors ${
                      already ? "text-muted-foreground/70 cursor-not-allowed" : "text-foreground hover:bg-muted"
                    }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.titre}</span>
                      <span className="text-xs text-muted-foreground">{p.codeBarre ?? ""}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Unité achat: {getUnitesProduit(p).find(u => u.estDefaut)?.libelle ?? "—"} · Prix: {getPrixAchatDefaut(p).toLocaleString()} F
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase">
                <th className="text-left px-3 py-2 min-w-[180px]">Produit</th>
                <th className="text-center px-3 py-2 min-w-[110px]">Unité récep.</th>
                <th className="text-center px-3 py-2">Qté</th>
                <th className="text-right px-3 py-2 min-w-[90px]">Prix U.</th>
                <th className="text-center px-3 py-2 min-w-[80px]">Équiv. base</th>
                <th className="text-center px-3 py-2 min-w-[110px]">Catalogue</th>
                <th className="text-right px-3 py-2 min-w-[80px]">Sous-total</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {lignes.map(l => {
                const sousTotal = l.quantiteRecue * l.prixUnitaire;
                const equivBase = l.quantiteRecue * l.facteurConversion;
                return (
                  <>
                  <tr key={l.id} className="text-foreground/80">
                    <td className="px-3 py-2">
                      <div className="text-foreground text-sm font-medium">{l.produitLabel}</div>
                      {l.codeBarre && <div className="text-xs text-muted-foreground">{l.codeBarre}</div>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Select value={l.uniteRecepId} onValueChange={v => updateLigne(l.id, "uniteRecepId", v)}>
                        <SelectTrigger className="h-8 w-[100px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-40">
                          {l.unitesDisponibles.map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.libelle}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="number" value={l.quantiteRecue} min={0}
                        onChange={e => updateLigne(l.id, "quantiteRecue", Number(e.target.value))}
                        className="h-8 w-20 rounded border border-border bg-muted/50 px-2 text-center text-sm text-foreground" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={l.prixUnitaire} min={0} step={1}
                        onChange={e => updateLigne(l.id, "prixUnitaire", Number(e.target.value))}
                        className="h-8 w-28 rounded border border-border bg-muted/50 px-2 text-right text-sm text-foreground ml-auto" />
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-muted-foreground italic">{equivBase} pcs</td>
                    <td className="px-3 py-2 text-center">
                      <label className="flex items-center justify-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={l.appliquerPrixCatalogue}
                          onChange={e => updateLigne(l.id, "appliquerPrixCatalogue", e.target.checked)}
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                        <span className={`text-xs ${l.appliquerPrixCatalogue ? "text-primary font-medium" : "text-muted-foreground"}`}>
                          Appliquer
                        </span>
                      </label>
                      {l.appliquerPrixCatalogue && (
                        <div className="mt-1.5 flex flex-col gap-1.5 items-center">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">Marge</span>
                            <input
                              type="number" min={0} step={1}
                              value={l.marge ?? ""}
                              onChange={e => updateLigne(l.id, "marge", Number(e.target.value))}
                              className="h-7 w-16 rounded border border-border bg-muted/50 px-2 text-center text-xs text-foreground" />
                            <span className="text-[10px] text-muted-foreground">%</span>
                          </div>
                          <input
                            type="number" min={0} step={1} placeholder="Prix vente"
                            value={l.prixVente ?? ""}
                            onChange={e => updateLigne(l.id, "prixVente", e.target.value === "" ? null : Number(e.target.value))}
                            className="h-7 w-32 rounded border border-primary/30 bg-muted/50 px-2 text-right text-xs text-foreground" />
                          <input
                            type="number" min={0} step={1} placeholder="Prix min. vente"
                            value={l.prixMinimumVente ?? ""}
                            onChange={e => updateLigne(l.id, "prixMinimumVente", e.target.value === "" ? null : Number(e.target.value))}
                            className="h-7 w-32 rounded border border-primary/30 bg-muted/50 px-2 text-right text-xs text-foreground" />
                          {l.prixReglemente && (
                            <input
                              type="number" min={0} step={1} placeholder={l.typeProduit === "MANUEL" ? "Prix homologué" : "Prix réglementé"}
                              value={l.prixReglementeValeur ?? ""}
                              onChange={e => updateLigne(l.id, "prixReglementeValeur", e.target.value === "" ? null : Number(e.target.value))}
                              className="h-7 w-32 rounded border border-primary/30 bg-muted/50 px-2 text-right text-xs text-foreground" />
                          )}
                          <input
                            type="number" min={0} step={1} placeholder="Prix max rachat"
                            value={l.prixMaximumRachat ?? ""}
                            onChange={e => updateLigne(l.id, "prixMaximumRachat", e.target.value === "" ? null : Number(e.target.value))}
                            className="h-7 w-32 rounded border border-primary/30 bg-muted/50 px-2 text-right text-xs text-foreground" />
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">TVA</span>
                            <input
                              type="number" min={0} step={0.5}
                              value={l.tva ?? 0}
                              onChange={e => updateLigne(l.id, "tva", Number(e.target.value))}
                              className="h-7 w-16 rounded border border-border bg-muted/50 px-2 text-center text-xs text-foreground" />
                            <span className="text-[10px] text-muted-foreground">%</span>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{sousTotal.toLocaleString()} F</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => updateLigne(l.id, "lotOpen", !l.lotOpen)} title="Détails du lot (péremption, provenance…)"
                          className={`text-muted-foreground transition-colors hover:text-primary ${l.lotOpen ? "text-primary" : ""}`}>
                          <Layers className="size-4" />
                        </button>
                        <button onClick={() => removeLigne(l.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {l.lotOpen && (
                    <tr className="border-0 bg-muted/20">
                      <td colSpan={8} className="px-3 pt-1 pb-3">
                        <div className="rounded-lg border border-border/60 bg-background p-3">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Détails du lot (optionnel) — traçabilité et FEFO</p>
                          <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
                            <label className="space-y-1">
                              <span className="text-[11px] text-muted-foreground">N° lot</span>
                              <input value={l.numeroLot} onChange={e => updateLigne(l.id, "numeroLot", e.target.value)}
                                placeholder="auto"
                                className="h-8 w-full rounded border border-border bg-muted/50 px-2 text-xs text-foreground" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[11px] text-muted-foreground">Date péremption</span>
                              <input type="date" value={l.datePeremption} onChange={e => updateLigne(l.id, "datePeremption", e.target.value)}
                                className="h-8 w-full rounded border border-border bg-muted/50 px-2 text-xs text-foreground" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[11px] text-muted-foreground">Date fabrication</span>
                              <input type="date" value={l.dateFabrication} onChange={e => updateLigne(l.id, "dateFabrication", e.target.value)}
                                className="h-8 w-full rounded border border-border bg-muted/50 px-2 text-xs text-foreground" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[11px] text-muted-foreground">Provenance</span>
                              <input value={l.provenance} onChange={e => updateLigne(l.id, "provenance", e.target.value)}
                                placeholder="Ex: Douala port"
                                className="h-8 w-full rounded border border-border bg-muted/50 px-2 text-xs text-foreground" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[11px] text-muted-foreground">Qualité</span>
                              <input value={l.qualite} onChange={e => updateLigne(l.id, "qualite", e.target.value)}
                                placeholder="Ex: Grade A / Original"
                                className="h-8 w-full rounded border border-border bg-muted/50 px-2 text-xs text-foreground" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[11px] text-muted-foreground">Fabricant</span>
                              <input value={l.fabricant} onChange={e => updateLigne(l.id, "fabricant", e.target.value)}
                                placeholder="Ex: MANN, Total…"
                                className="h-8 w-full rounded border border-border bg-muted/50 px-2 text-xs text-foreground" />
                            </label>
                          </div>
                          {l.datePeremption && l.dateFabrication && l.datePeremption < l.dateFabrication && (
                            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive">
                              <AlertTriangle className="size-3.5" /> La date de péremption précède la date de fabrication — vérifiez la saisie.
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </>
                );
              })}
            </tbody>
          </table>
          {lignes.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">Aucune ligne. Utilisez la recherche ci-dessus pour ajouter des produits.</p>
          )}
        </div>

        {/* Prix alerts */}
        {hasPrixAlert && (
          <div className="mt-3 space-y-1">
            {lignes.map(l => {
              const msg = getPrixAlert(l);
              return msg ? (
                <div key={l.id} className="flex items-start gap-1.5 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning-foreground">
                  <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                  <span>{l.produitLabel}: {msg}</span>
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>

      {/* RÉCAPITULATIF */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Récapitulatif</h2>
        <div className="flex gap-8 text-sm">
          <div><span className="text-muted-foreground">Lignes :</span> <span className="text-foreground font-medium">{totalLignes}</span></div>
          <div><span className="text-muted-foreground">Total qté :</span> <span className="text-foreground font-medium">{totalQte} pcs</span></div>
          <div><span className="text-muted-foreground">Total montant :</span> <span className="text-foreground font-mono font-semibold">{totalMontant.toLocaleString()} FCFA</span></div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notes / Observations</Label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground outline-none transition-all duration-200 focus:border-ring focus:ring-2 focus:ring-ring/20 mt-1" rows={2} placeholder="Observations..." />
      </div>

      {/* PAIEMENT À LA RÉCEPTION */}
      <div className="rounded-xl border border-border bg-card p-5">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={recepPay.actif}
            onChange={(e) => setRecepPay((p) => ({ ...p, actif: e.target.checked, montant: e.target.checked ? String(totalMontant) : p.montant }))}
            className="h-4 w-4 rounded border-border accent-success"
          />
          <span className={`text-sm font-medium ${recepPay.actif ? "text-success-foreground" : "text-muted-foreground"}`}>
            Payer à la réception ({totalMontant.toLocaleString()} F) — optionnel, sinon dette fournisseur
          </span>
        </label>
        {recepPay.actif && (
          <div className="grid gap-3 sm:grid-cols-3 mt-3">
            <div>
              <Label>Montant (F)</Label>
              <input type="number" min={1} max={totalMontant} step="0.01"
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 mt-1"
                value={recepPay.montant}
                onChange={(e) => setRecepPay({ ...recepPay, montant: e.target.value })} />
            </div>
            <div>
              <Label>Mode de paiement</Label>
              <select
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 mt-1"
                value={recepPay.mode}
                onChange={(e) => setRecepPay({ ...recepPay, mode: e.target.value })}>
                <option value="especes">Espèces</option>
                <option value="virement">Virement</option>
                <option value="cheque">Chèque</option>
                <option value="mobile_money">Mobile Money</option>
              </select>
            </div>
            <div>
              <Label>Caisse de débit</Label>
              <select
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 mt-1"
                value={recepPay.caisseId}
                onChange={(e) => setRecepPay({ ...recepPay, caisseId: e.target.value })}>
                <option value="">Caisse ouverte (auto)</option>
                {(caisseList ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ACTIONS */}
      <div className="flex justify-between border-t border-border/50 pt-4">
        <Link href="/dashboard/procurement">
          <Button variant="outline">← Retour</Button>
        </Link>
        <div className="flex gap-2">
          {hasPermission("achats.recevoir") && (
            <Button variant="outline" onClick={() => handleSubmit(true)} disabled={saving}>
              <Save className="size-4" /> Brouillon
            </Button>
          )}
          {hasPermission("achats.recevoir") && (
            <Button onClick={() => handleSubmit(false)} disabled={saving || !lignes.some(l => l.quantiteRecue > 0)}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Valider réception
            </Button>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowConfirm(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-foreground mb-2">Confirmer la réception</h2>
            <p className="text-sm text-muted-foreground mb-4">
              de {totalLignes} produit{totalLignes > 1 ? "s" : ""} pour un total de {totalMontant.toLocaleString()} FCFA
            </p>
            <div className="space-y-3 text-sm text-foreground/80">
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <p>Cette action va :</p>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  <li>• Créer {totalLignes} mouvement{totalLignes > 1 ? "s" : ""} d'entrée en stock</li>
                  <li>• Mettre à jour le CUMP de chaque produit</li>
                  <li>• Ne pourra pas être annulée directement (nécessitera un ajustement manuel)</li>
                </ul>
              </div>
              {hasPrixAlert && (
                <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs text-warning-foreground">
                  <AlertTriangle className="size-3.5 inline mr-1" />
                  Certains prix ont varié de plus de 5%. Vérifiez avant de confirmer.
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowConfirm(false)} className="flex-1">Annuler</Button>
                <Button onClick={() => doSubmit(false)} disabled={saving} className="flex-1">
                  {saving ? "Traitement..." : "Confirmer"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nouveau fournisseur */}
      {showNewFournisseur && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowNewFournisseur(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-foreground mb-4">Nouveau fournisseur</h2>
            <div className="space-y-3">
              <Input value={newFournisseurNom} onChange={e => setNewFournisseurNom(e.target.value)} placeholder="Nom du fournisseur" />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowNewFournisseur(false)}>Annuler</Button>
                <Button onClick={() => createFournisseur.mutate({ nom: newFournisseurNom })} disabled={!newFournisseurNom || createFournisseur.isPending}>Créer</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
