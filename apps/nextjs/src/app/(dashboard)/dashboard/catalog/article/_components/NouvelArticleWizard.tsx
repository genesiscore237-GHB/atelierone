"use client";

import { useMemo, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { SelectSearch } from "~/components/ui/select-search";
import { ArrowLeft, ArrowRight, Loader2, Plus, PackagePlus, AlertTriangle, Trash2, CheckCircle2, Car, BadgeCheck, ClipboardCheck, Boxes, Truck, ShieldCheck, Ruler, ListChecks, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePermissions } from "~/hooks/usePermissions";
import { VarianteCard, varianteVide, type VarianteForm } from "./VarianteCard";
import { AttributDefLigne } from "./attribut-def-ligne";

const TYPES: { value: TypeProduit; label: string }[] = [
  { value: "PIECE", label: "Pièce détachée" },
  { value: "CONSOMMABLE", label: "Consommable" },
  { value: "OUTIL", label: "Outillage" },
  { value: "EQUIPEMENT", label: "Équipement" },
  { value: "SERVICE", label: "Service" },
  { value: "FOURNITURE", label: "Fourniture" },
  { value: "MANUEL", label: "Manuel / document" },
  { value: "LIQUIDE", label: "Liquide" },
  { value: "BIDON", label: "Bidon / contenant" },
  { value: "AUTRE", label: "Autre" },
];
const ETATS = ["NEUF", "OCCASION", "RECONDITIONNE", "REMANUFACTURE"];
const ORIGINES = ["CONSTRUCTEUR", "OEM", "AFTERMARKET", "ADAPTABLE"];
const LIBELLES_ETATS: Record<string, string> = { NEUF: "Neuf", OCCASION: "Occasion", RECONDITIONNE: "Reconditionné", REMANUFACTURE: "Reusiné (remanufacturé)" };
const LIBELLES_ORIGINES: Record<string, string> = { CONSTRUCTEUR: "Constructeur", OEM: "OEM (équivalent d'origine)", AFTERMARKET: "Après-vente (aftermarket)", ADAPTABLE: "Adaptable" };
const TYPES_ATTRIBUT_VALIDES = ["TEXTE", "LONG_TEXT", "NOMBRE", "INTEGER", "DECIMAL", "BOOLEEN", "ENUM", "MULTI_ENUM", "DATE", "DATETIME", "DUREE", "POURCENTAGE", "MONTANT", "UNIT_VALUE", "RANGE", "REFERENCE", "VEHICLE_REFERENCE", "CODE", "LIEN", "COULEUR", "BOOLEAN"];

type AttributCommun = { cle: string; valeur: string; unite: string; statutValeur?: string };
type TypeProduit = "PIECE" | "CONSOMMABLE" | "OUTIL" | "EQUIPEMENT" | "SERVICE" | "FOURNITURE" | "MANUEL" | "LIQUIDE" | "BIDON" | "AUTRE";
type CompatForm = { typeCompat: string; marque: string; modele: string; anneeDe: string; anneeA: string; motorisation: string; version: string; position: string };

const ETAPES = [
  { n: 1, label: "Identification" },
  { n: 2, label: "Classification" },
  { n: 3, label: "Caractéristiques" },
  { n: 4, label: "Variante & références" },
  { n: 5, label: "Compatibilité véhicule" },
  { n: 6, label: "Fournisseurs & prix" },
  { n: 7, label: "Stock & traçabilité" },
  { n: 8, label: "Vérification" },
] as const;

type ResultatDoublon = { exacts: number; probabilite: string | null; raisons: number };

export function NouvelArticleWizard() {
  const router = useRouter();
  const utils = api.useUtils();
  const { hasPermission } = usePermissions();
  const peutModifier = hasPermission("stock.modifier");
  const [etape, setEtape] = useState<number>(1);
  const [doublonsParRef, setDoublonsParRef] = useState<Record<string, ResultatDoublon>>({});
  const [doublonAccepte, setDoublonAccepte] = useState(false);

  const { data: categories } = api.catalog.listCategories.useQuery();
  const { data: unites } = api.catalog.listUnites.useQuery();
  const { data: emplacements } = api.stock.listEmplacements.useQuery({});
  const { data: fournisseurs } = api.reference.listFournisseurs.useQuery();
  const { data: templates } = api.articles.listTemplates.useQuery();

  // ─── Article ───
  const [designation, setDesignation] = useState("");
  const [designationCourte, setDesignationCourte] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [typeProduit, setTypeProduit] = useState<TypeProduit>("PIECE");
  const [familleId, setFamilleId] = useState<string>("");
  const [sousCategorieId, setSousCategorieId] = useState<string>("");
  const [article3Id, setArticle3Id] = useState<string>("");
  const [etatDefaut, setEtatDefaut] = useState("NEUF");
  const [origineDefaut, setOrigineDefaut] = useState("AFTERMARKET");
  const [attributsCommuns, setAttributsCommuns] = useState<AttributCommun[]>([]);
  const [compatibilites, setCompatibilites] = useState<CompatForm[]>([]);
  const [equivRefs, setEquivRefs] = useState<{ marque: string; reference: string }[]>([]);
  const [comp, setComp] = useState<CompatForm>({ typeCompat: "POSITIVE", marque: "", modele: "", anneeDe: "", anneeA: "", motorisation: "", version: "", position: "" });
  const [eqRef, setEqRef] = useState({ marque: "", reference: "" });
  const [template, setTemplate] = useState("");

  const categorieSelectionnee = Number(article3Id || sousCategorieId || familleId) || undefined;
  const estExemplaire = typeProduit === "OUTIL" || typeProduit === "EQUIPEMENT";
  const porteeVariante = estExemplaire ? "EXEMPLAIRE" : "VARIANTE";
  const libelleEtape4 = estExemplaire ? "Exemplaires & références" : "Variante & références";
  const { data: defsArticleRaw } = api.ontology.getDefinitionsForCategory.useQuery(
    { categorieId: categorieSelectionnee ?? -1, portee: "ARTICLE" },
    { enabled: !!categorieSelectionnee }
  );
  const { data: defsVarianteRaw } = api.ontology.getDefinitionsForCategory.useQuery(
    { categorieId: categorieSelectionnee ?? -1, portee: porteeVariante as any },
    { enabled: !!categorieSelectionnee && typeProduit !== "SERVICE" }
  );
  const defsArticle = (defsArticleRaw?.definitions ?? []).filter((d: any) => d.isActive !== false);
  const defsVariante = (defsVarianteRaw?.definitions ?? []).filter((d: any) => d.isActive !== false);

  // ─── Variantes ───
  const [variantes, setVariantes] = useState<VarianteForm[]>([varianteVide()]);

  const continuerApresCreation = useRef(false);

  const resetFormulaire = () => {
    setEtape(1);
    setDesignation(""); setDesignationCourte(""); setImageUrl("");
    setTypeProduit("PIECE"); setFamilleId(""); setSousCategorieId(""); setArticle3Id("");
    setEtatDefaut("NEUF"); setOrigineDefaut("AFTERMARKET");
    setAttributsCommuns([]); setCompatibilites([]); setEquivRefs([]);
    setComp({ typeCompat: "POSITIVE", marque: "", modele: "", anneeDe: "", anneeA: "", motorisation: "", version: "", position: "" });
    setEqRef({ marque: "", reference: "" }); setTemplate("");
    setVariantes([varianteVide()]);
    setDoublonsParRef({}); setDoublonAccepte(false);
  };

  const uploadPhoto = async (file: File | null) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "articles");
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Échec de l'upload");
      setImageUrl(data.url);
      toast.success("Photo ajoutée");
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de l'upload");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const create = api.articles.createArticle.useMutation({
    onSuccess: (r) => {
      toast.success(`Article créé : ${r.variantesCrees} variante(s), ${r.compatibilitesCrees ?? 0} compatibilité(s), ${r.referencesEquivCrees ?? 0} réf. équivalente(s)`);
      utils.articles.listArticles.invalidate();
      if (continuerApresCreation.current) {
        continuerApresCreation.current = false;
        toast.info("Formulaire réinitialisé — vous pouvez créer le suivant.");
        resetFormulaire();
      } else {
        router.push(`/dashboard/catalog/article/${r.articleId}`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const optCategories = (categories ?? []).map((c: any) => ({ value: String(c.id), label: c.nom }));
  const optUnites = (unites ?? []).map((u: any) => ({ value: u.id, label: `${u.libelle} (${u.symbole ?? u.code})` }));
  const optEmplacements = useMemo(() => {
    const rows = emplacements ?? [];
    const parId = new Map(rows.map((e: any) => [String(e.id), e]));
    const chemin = (e: any): string => {
      const parts: string[] = [e.code];
      let parent = e.parentId ? parId.get(String(e.parentId)) : null;
      let garde = 0;
      while (parent && garde < 7) {
        parts.unshift(parent.code);
        parent = parent.parentId ? parId.get(String(parent.parentId)) : null;
        garde++;
      }
      return parts.join(" › ");
    };
    return [...rows]
      .sort((a: any, b: any) => (a.parentId ?? 0) - (b.parentId ?? 0) || String(a.code).localeCompare(String(b.code)))
      .map((e: any) => ({
        value: String(e.id),
        label: `${"– ".repeat(Math.min(e.profondeur ?? 0, 4))}${chemin(e)}${e.libelle ? ` — ${e.libelle}` : ""}`.trim(),
      }));
  }, [emplacements]);
  const optFournisseurs = (fournisseurs ?? []).map((f: any) => ({ value: String(f.id), label: f.nom }));

  const compatible = (branche: string | null) => {
    if (!branche || typeProduit === "SERVICE") return false;
    if (branche === typeProduit) return true;
    return (branche === "PIECE" || branche === "CONSOMMABLE") && (typeProduit === "PIECE" || typeProduit === "CONSOMMABLE");
  };
  const familles = useMemo(() => (categories ?? []).filter((c: any) => !c.parentId && compatible(c.typeBranche)), [categories, typeProduit]);
  const sousCategories = useMemo(() => (categories ?? []).filter((c: any) => String(c.parentId) === String(familleId)), [categories, familleId]);
  const articles3 = useMemo(() => (categories ?? []).filter((c: any) => String(c.parentId) === String(sousCategorieId)), [categories, sousCategorieId]);
  // Types étendus (FOURNITURE, MANUEL, LIQUIDE, BIDON, AUTRE) : supportés par le modèle,
  // mais aucune catégorie ne leur est encore raccordée → création directe sans classification.
  const sansCategorieAccepte = typeProduit === "SERVICE" || familles.length === 0;

  const appliquerTemplate = (code: string) => {
    const tpl = (templates ?? []).find((t: any) => t.code === code);
    if (!tpl || !Array.isArray(tpl.defs)) return;
    setAttributsCommuns(tpl.defs.map((d: any) => ({ cle: d.cle ?? "", valeur: "", unite: d.unite ?? "", statutValeur: "RENSEIGNE" })));
  };

  const addComp = () => {
    if (!comp.marque || !comp.modele) { toast.error("Marque et modèle requis"); return; }
    setCompatibilites([...compatibilites, { ...comp }]);
    setComp({ typeCompat: "POSITIVE", marque: "", modele: "", anneeDe: "", anneeA: "", motorisation: "", version: "", position: "" });
  };
  const addEqRef = () => {
    if (!eqRef.reference) { toast.error("Référence requise"); return; }
    setEquivRefs([...equivRefs, { ...eqRef }]);
    setEqRef({ marque: "", reference: "" });
  };

  const setV = (i: number, patch: Partial<VarianteForm>) => setVariantes((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));

  const touverAttr = (cle: string) => attributsCommuns.find((a) => a.cle === cle);
  const majAttr = (cle: string, patch: Partial<AttributCommun>) => {
    if (touverAttr(cle)) setAttributsCommuns(attributsCommuns.map((a) => (a.cle === cle ? { ...a, ...patch } : a)));
    else setAttributsCommuns([...attributsCommuns, { cle, valeur: "", unite: "", statutValeur: "RENSEIGNE", ...patch }]);
  };

  const categorieId = Number(article3Id || sousCategorieId || familleId) || undefined;
  const variantesActives = variantes.filter((v) => v.marque || v.referencePrincipale || v.referenceFabricant);
  const refsPrincipales = variantesActives.map((v) => v.referencePrincipale.trim()).filter((r) => r.length >= 3);
  const doublonsExacts = useMemo(() => Object.values(doublonsParRef).reduce((s, d) => s + d.exacts, 0), [doublonsParRef]);

  const continuer = (depuis: number) => {
    if (depuis === 1 || depuis === 2) { if (depuis === 1 && designation.trim().length < 2) { toast.error("Désignation requise"); return; } if (depuis === 2 && !sansCategorieAccepte && !categorieId) { toast.error("Catégorie requise"); return; } }
    if (depuis === 4 && typeProduit !== "SERVICE") {
      if (variantesActives.length === 0) { toast.error("Ajoutez au moins une variante"); return; }
      if (variantesActives.some((v) => !v.referencePrincipale.trim())) { toast.error("Chaque variante doit avoir une référence principale"); return; }
    }
    setEtape(depuis + 1);
  };

  const enregistrer = (continuer1: boolean) => {
    if (doublonsExacts > 0 && !doublonAccepte) {
      toast.error(`Doublon(s) exact(s) détecté(s) (${doublonsExacts}) — cochez la confirmation pour créer quand même.`);
      return;
    }
    if (designation.trim().length < 2) { toast.error("Désignation requise"); return; }
    if (!sansCategorieAccepte && !categorieId) { toast.error("Catégorie requise"); return; }
    const vs = variantesActives;
    if (typeProduit !== "SERVICE" && vs.length === 0) { toast.error("Ajoutez au moins une variante"); return; }
    if (typeProduit !== "SERVICE" && vs.some((v) => !v.referencePrincipale.trim())) { toast.error("Chaque variante doit avoir une référence principale"); return; }
    continuerApresCreation.current = continuer1;
    create.mutate({
      designation: designation.trim(),
      designationCourte: designationCourte.trim() || undefined,
      imageUrl: imageUrl || undefined,
      typeProduit,
      categorieId,
      etatProduitDefaut: etatDefaut as any,
      origineProduitDefaut: origineDefaut as any,
      attributs: attributsCommuns.filter((a) => a.cle.trim()).map((a) => {
        const d = defsArticle.find((x: any) => x.cle === a.cle.trim());
        return {
          cle: a.cle.trim(),
          valeur: a.statutValeur === "INCONNU" || a.statutValeur === "N_A" ? "" : a.valeur,
          unite: a.unite || d?.uniteCode || undefined,
          statutValeur: (a.statutValeur ?? "RENSEIGNE") as any,
          ...(d ? {
            typeAttribut: TYPES_ATTRIBUT_VALIDES.includes(d.typeAttribut) ? (d.typeAttribut as any) : undefined,
            liste: d.liste,
            uniteId: d.uniteId ?? undefined,
            obligatoire: d.obligatoire,
            searchable: d.searchable,
            filtrable: d.filtrable,
            comparable: d.comparable,
            min: d.min != null ? Number(d.min) : undefined,
            max: d.max != null ? Number(d.max) : undefined,
          } : {}),
        };
      }),
      compatibilites: compatibilites.map((c) => ({
        typeCompat: c.typeCompat as any,
        marque: c.marque,
        modele: c.modele,
        anneeDe: c.anneeDe ? Number(c.anneeDe) : undefined,
        anneeA: c.anneeA ? Number(c.anneeA) : undefined,
        motorisation: c.motorisation || undefined,
        version: c.version || undefined,
        position: c.position || undefined,
      })),
      referencesEquiv: equivRefs.filter((r) => r.reference.trim()).map((r) => ({ marque: r.marque || undefined, reference: r.reference.trim() })),
      variantes: vs.map((v) => ({
        marque: v.marque || undefined,
        referencePrincipale: v.referencePrincipale || undefined,
        referenceFabricant: v.referenceFabricant || undefined,
        codeArticle: v.codeArticle || undefined,
        conditionnement: v.conditionnement || undefined,
        etatProduit: v.etatProduit as any,
        origineProduit: v.origineProduit as any,
        positionCote: v.positionCote as any,
        positionEssieu: v.positionEssieu as any,
        prixAchat: v.prixAchat ? Number(v.prixAchat) : undefined,
        prixVente: v.prixVente ? Number(v.prixVente) : undefined,
        prixMinimumVente: v.prixMinimumVente ? Number(v.prixMinimumVente) : undefined,
        prixPro: v.prixPro ? Number(v.prixPro) : undefined,
        prixParticulier: v.prixParticulier ? Number(v.prixParticulier) : undefined,
        tva: v.tva ? Number(v.tva) : undefined,
        compteComptable: v.compteComptable || undefined,
        centreDeCout: v.centreDeCout || undefined,
        methodeValorisation: v.methodeValorisation || undefined,
        unites: v.unites.filter((u) => u.uniteId).map((u) => ({
          uniteId: u.uniteId,
          facteurVersBase: u.facteurVersBase ? Number(u.facteurVersBase) : undefined,
          prixAchat: u.prixAchat ? Number(u.prixAchat) : undefined,
          prixVente: u.prixVente ? Number(u.prixVente) : undefined,
          estUniteBase: u.estUniteBase,
          estUniteAchatDefaut: u.estUniteAchatDefaut,
          estUniteVenteDefaut: u.estUniteVenteDefaut,
        })),
        fournisseurs: v.fournisseurs.filter((f) => f.fournisseurId).map((f) => ({
          fournisseurId: Number(f.fournisseurId),
          referenceFournisseur: f.referenceFournisseur || undefined,
          prixAchat: f.prixAchat ? Number(f.prixAchat) : undefined,
          delaiApprovisionnement: f.delaiApprovisionnement ? Number(f.delaiApprovisionnement) : undefined,
          estPrincipal: f.estPrincipal,
          uniteConditionnement: f.uniteConditionnement || undefined,
          facteurConditionnement: f.facteurConditionnement ? Number(f.facteurConditionnement) : undefined,
        })),
        uniteStockId: v.uniteStockId || undefined,
        stockInitial: v.stockInitial ? Number(v.stockInitial) : undefined,
        emplacementStockId: v.emplacementStockId ? Number(v.emplacementStockId) : undefined,
        seuilAlerte: v.seuilAlerte ? Number(v.seuilAlerte) : undefined,
        stockSecurite: v.stockSecurite ? Number(v.stockSecurite) : undefined,
        pointCommande: v.pointCommande ? Number(v.pointCommande) : undefined,
        qteMinCommande: v.qteMinCommande ? Number(v.qteMinCommande) : undefined,
        fournisseurId: v.fournisseurId ? Number(v.fournisseurId) : undefined,
        numeroSerie: v.numeroSerie || undefined,
        numeroLot: v.numeroLot || undefined,
        dateExpiration: v.dateExpiration || undefined,
        garantieMois: v.garantieMois ? Number(v.garantieMois) : undefined,
        estCore: v.estCore,
        valeurCore: v.valeurCore ? Number(v.valeurCore) : undefined,
        typeOutil: estExemplaire ? v.typeOutil || undefined : undefined,
        etatEquipement: estExemplaire ? v.etatEquipement || undefined : undefined,
        calibrable: estExemplaire ? v.calibrable : undefined,
        numeroImmobilisation: estExemplaire ? v.numeroImmobilisation || undefined : undefined,
        valeurAcquisition: estExemplaire ? (v.valeurAcquisition ? Number(v.valeurAcquisition) : undefined) : undefined,
        attributs: (v.attributs ?? []).filter((a) => a.cle.trim()).map((a) => {
          const d = defsVariante.find((x: any) => x.cle === a.cle.trim());
          return {
            cle: a.cle.trim(),
            valeur: a.statutValeur === "INCONNU" || a.statutValeur === "N_A" ? "" : a.valeur,
            unite: a.unite || d?.uniteCode || undefined,
            statutValeur: (a.statutValeur ?? "RENSEIGNE") as any,
            ...(d ? {
              typeAttribut: TYPES_ATTRIBUT_VALIDES.includes(d.typeAttribut) ? (d.typeAttribut as any) : undefined,
              liste: d.liste,
              uniteId: d.uniteId ?? undefined,
              min: d.min != null ? Number(d.min) : undefined,
              max: d.max != null ? Number(d.max) : undefined,
            } : {}),
          };
        }),
      })),
    });
  };

  const infoVariante = (v: VarianteForm) => `${v.marque || "?"}${v.referencePrincipale ? ` — ${v.referencePrincipale}` : ""}${v.conditionnement ? ` (${v.conditionnement})` : ""}`;
  const margeVariante = (v: VarianteForm) => {
    if (v.prixAchat === "" || v.prixVente === "") return null;
    const m = Number(v.prixVente) - Number(v.prixAchat);
    const taux = Number(v.prixAchat) > 0 ? Math.round((m / Number(v.prixAchat)) * 1000) / 10 : 0;
    return { marge: m, taux };
  };

  const Cabec = ({ n, icone, titre, hint }: { n: number; icone: ReactNode; titre: string; hint?: string }) => (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">{icone} {n}. {titre}</h2>
      {hint && <p className="mb-3 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* ─── Stepper d'étapes ─── */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {ETAPES.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => s.n < etape && setEtape(s.n)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${etape === s.n ? "bg-primary text-primary-foreground" : etape > s.n ? "bg-success/10 text-success-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {etape > s.n ? <CheckCircle2 size={12} /> : <span>{s.n}</span>} {s.n === 4 ? libelleEtape4 : s.label}
            </button>
            {i < ETAPES.length - 1 && <ArrowRight size={13} className="text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* ═══════ ÉTAPE 1 — IDENTIFICATION ═══════ */}
      {etape === 1 && (
        <div className="space-y-4">
          <Cabec n={1} icone={<Tag size={14} className="text-primary" />} titre="Identification" hint="Ce que l'on voit en premier : le nom affiché, le nom court, la nature (type de produit), l'état et l'origine par défaut." />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Désignation *</Label>
              <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Ex : Plaquette de frein avant" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Nom court</Label>
              <Input value={designationCourte} onChange={(e) => setDesignationCourte(e.target.value)} placeholder="Ex : Plaquette avant" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Photo</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input type="file" accept="image/*" onChange={(e) => uploadPhoto(e.target.files?.[0] ?? null)} className="text-xs" />
                {uploadingPhoto && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                {imageUrl && <img src={imageUrl} alt="" className="size-8 rounded border border-border object-cover" />}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <Label className="text-xs text-muted-foreground">Type *</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => { setTypeProduit(t.value); setFamilleId(""); setSousCategorieId(""); setArticle3Id(""); }}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${typeProduit === t.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <select value={etatDefaut} onChange={(e) => setEtatDefaut(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">
                {ETATS.map((t) => <option key={t} value={t}>État par défaut : {LIBELLES_ETATS[t]}</option>)}
              </select>
              <select value={origineDefaut} onChange={(e) => setOrigineDefaut(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">
                {ORIGINES.map((t) => <option key={t} value={t}>Origine par défaut : {LIBELLES_ORIGINES[t]}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button className="gap-2" onClick={() => { if (designation.trim().length < 2) { toast.error("Désignation requise"); return; } setEtape(2); }}>Classification <ArrowRight size={14} /></Button>
          </div>
        </div>
      )}

      {/* ═══════ ÉTAPE 2 — CLASSIFICATION ═══════ */}
      {etape === 2 && (
        <div className="space-y-4">
          <Cabec n={2} icone={<ListChecks size={14} className="text-primary" />} titre="Classification" hint="Famille → sous-catégorie → article. La catégorie choisie générera automatiquement les gabarits de caractéristiques à l'étape suivante." />
          {typeProduit !== "SERVICE" && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="grid gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Famille *</Label>
                  <SelectSearch value={familleId || null} onChange={(v) => { setFamilleId(String(v)); setSousCategorieId(""); setArticle3Id(""); }} options={familles.map((c: any) => ({ value: String(c.id), label: c.nom }))} placeholder="Choisir la famille" searchPlaceholder="Rechercher…" className="mt-1" />
                </div>
                {sousCategories.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Sous-catégorie</Label>
                    <SelectSearch value={sousCategorieId || null} onChange={(v) => { setSousCategorieId(String(v)); setArticle3Id(""); }} options={sousCategories.map((c: any) => ({ value: String(c.id), label: c.nom }))} placeholder="Choisir" searchPlaceholder="Rechercher…" className="mt-1" />
                  </div>
                )}
                {articles3.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Article (niveau 3)</Label>
                    <SelectSearch value={article3Id || null} onChange={(v) => setArticle3Id(String(v))} options={articles3.map((c: any) => ({ value: String(c.id), label: c.nom }))} placeholder="Choisir" searchPlaceholder="Rechercher…" className="mt-1" />
                  </div>
                )}
              </div>
            </div>
          )}
          {typeProduit === "SERVICE" && (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Un <b>service</b> (prestation, diagnostic, main-d'œuvre) n'est <b>pas stockable</b> et n'a pas besoin d'être classé dans l'arbre des pièces — d'où l'absence de catégorie ci-dessus. Ses conditions (durée, prix, garantie) se règlent à l'étape « Fournisseurs & prix » puis lors de la facturation / du devis.
            </div>
          )}
          {typeProduit !== "SERVICE" && familles.length === 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-warning-foreground">
              <b>{typeProduit}</b> est supporté par le modèle de données, mais aucune famille de catégorie n'est encore approvisionnée pour ce type — interface à finaliser. Vous pouvez créer directement sans classification.
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="outline" className="gap-2" onClick={() => setEtape(1)}><ArrowLeft size={14} /> Identification</Button>
            <Button className="gap-2" onClick={() => { if (!sansCategorieAccepte && !categorieId) { toast.error("Catégorie requise"); return; } setEtape(3); }}>Caractéristiques <ArrowRight size={14} /></Button>
          </div>
        </div>
      )}

      {/* ═══════ ÉTAPE 3 — CARACTÉRISTIQUES ═══════ */}
      {etape === 3 && (
        <div className="space-y-4">
          <Cabec n={3} icone={<Ruler size={14} className="text-primary" />} titre="Caractéristiques" hint="Attributs communs à toutes les variantes, générés par la catégorie. Chaque valeur peut être marquée Inconnu ou Non applicable (Inconnu ≠ N/A)." />
          {typeProduit !== "SERVICE" && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Caractéristiques communes{defsArticle.length > 0 ? ` — ${defsArticle.length} générée(s) par la catégorie` : ""}</h3>
                <div className="flex items-center gap-2">
                  <select value={template} onChange={(e) => setTemplate(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs">
                    <option value="">Template…</option>
                    {(templates ?? []).map((t: any) => <option key={t.code} value={t.code}>{t.libelle}</option>)}
                  </select>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => appliquerTemplate(template)}>Appliquer</Button>
                </div>
              </div>
              {defsArticle.length > 0 && (
                <div className="mb-2 space-y-1.5 rounded-lg border border-border bg-muted/40 p-2">
                  {defsArticle.map((d) => {
                    const n = touverAttr(d.cle);
                    return <AttributDefLigne key={d.cle} def={d} value={n?.valeur ?? ""} unite={n?.unite || d.uniteSymbole} statut={n?.statutValeur ?? "RENSEIGNE"} onStatutChange={(s) => majAttr(d.cle, { statutValeur: s })} onChange={(v) => majAttr(d.cle, { valeur: v, unite: n?.unite || d.uniteSymbole || "" })} />;
                  })}
                </div>
              )}
              <div className="space-y-1.5">
                {attributsCommuns.filter((a) => !defsArticle.some((d) => d.cle === a.cle)).map((a, i) => (
                  <div key={i} className="grid grid-cols-12 items-center gap-1.5">
                    <input value={a.cle} onChange={(e) => setAttributsCommuns(attributsCommuns.map((x, idx) => (idx === i ? { ...x, cle: e.target.value } : x)))} placeholder="Clé (épaisseur, largeur…)" className="col-span-4 rounded border border-border bg-background px-2 py-1.5 text-xs" />
                    <input value={a.valeur} onChange={(e) => setAttributsCommuns(attributsCommuns.map((x, idx) => (idx === i ? { ...x, valeur: e.target.value } : x)))} placeholder="Valeur" className="col-span-3 rounded border border-border bg-background px-2 py-1.5 text-xs" disabled={a.statutValeur !== "RENSEIGNE"} />
                    <input value={a.unite} onChange={(e) => setAttributsCommuns(attributsCommuns.map((x, idx) => (idx === i ? { ...x, unite: e.target.value } : x)))} placeholder="Unité" className="col-span-2 rounded border border-border bg-background px-2 py-1.5 text-xs" />
                    <select value={a.statutValeur ?? "RENSEIGNE"} onChange={(e) => majAttr(a.cle, { statutValeur: e.target.value })} className="col-span-2 rounded border border-border bg-background px-1.5 py-1.5 text-[10px]">
                      <option value="RENSEIGNE">Renseigné</option>
                      <option value="INCONNU">Inconnu</option>
                      <option value="N_A">Non applicable</option>
                    </select>
                    <button type="button" className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive" onClick={() => setAttributsCommuns(attributsCommuns.filter((_, idx) => idx !== i))}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="ghost" className="mt-1.5 gap-1 text-xs" onClick={() => setAttributsCommuns([...attributsCommuns, { cle: "", valeur: "", unite: "", statutValeur: "RENSEIGNE" }])}>
                <Plus size={12} /> Ligne
              </Button>
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="outline" className="gap-2" onClick={() => setEtape(2)}><ArrowLeft size={14} /> Classification</Button>
            <Button className="gap-2" onClick={() => { continuer(3); }}>{libelleEtape4} <ArrowRight size={14} /></Button>
          </div>
        </div>
      )}

      {/* ═══════ ÉTAPE 4 — VARIANTE & RÉFÉRENCES ═══════ */}
      {etape === 4 && (
        <div className="space-y-3">
          <Cabec n={4} icone={<Boxes size={14} className="text-primary" />} titre={estExemplaire ? "Exemplaires physiques du modèle" : "Variante (SKU) & références"} hint={estExemplaire ? "L'article représente le MODÈLE (ex. Clé dynamométrique 20–200 N·m). Chaque ligne ci-dessous = un EXEMPLAIRE physique, identifié par n° d'inventaire et/ou n° de série, avec état, emplacement et responsables." : "Une variante = une référence stockable (SKU). Vous pouvez en déclarer plusieurs (ex : 70Ah puis 80Ah). Chaque variante doit avoir une référence principale."} />
          {typeProduit === "SERVICE" ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Un <b>service</b> n'a ni variante (SKU), ni stock, ni compatibilité véhicule. Ses conditions (durée, prix, garantie) se règlent lors de la facturation / devis.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  {estExemplaire ? `Exemplaires (${variantes.length})` : `Variantes / SKU (${variantes.length})`}
                </h2>
                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setVariantes([...variantes, varianteVide()])}>
                  <Plus size={13} /> {estExemplaire ? "Exemplaire" : "Variante"}
                </Button>
              </div>
              {variantes.map((v, i) => (
                <VarianteCard
                  key={i}
                  index={i}
                  value={v}
                  typeArticle={typeProduit}
                  optUnites={optUnites}
                  optEmplacements={optEmplacements}
                  optFournisseurs={optFournisseurs}
                  defsVariante={defsVariante}
                  onRemove={() => setVariantes(variantes.filter((_, idx) => idx !== i))}
                  onChange={(patch) => setV(i, patch)}
                  sections={["identite", "attributs"]}
                />
              ))}
              {variantes.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucune variante. Ajoutez-en au moins une.</p>
              )}
            </>
          )}

          {typeProduit !== "SERVICE" && typeProduit !== "OUTIL" && typeProduit !== "EQUIPEMENT" && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <BadgeCheck size={14} className="text-primary" /> Références équivalentes (niveau article) ({equivRefs.length})
              </h2>
              <div className="flex gap-2">
                <Input value={eqRef.marque} onChange={(e) => setEqRef({ ...eqRef, marque: e.target.value })} placeholder="Marque (MANN, OEM Toyota…)" className="flex-1" />
                <Input value={eqRef.reference} onChange={(e) => setEqRef({ ...eqRef, reference: e.target.value })} placeholder="Référence (W 712/95…)" className="flex-1" />
                <Button size="sm" className="gap-1" disabled={!eqRef.reference} onClick={addEqRef}><Plus size={12} /> Ajouter</Button>
              </div>
              {equivRefs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {equivRefs.map((r, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-mono">
                      {r.marque ? `${r.marque} : ` : ""}{r.reference}
                      <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setEquivRefs(equivRefs.filter((_, idx) => idx !== i))}><Trash2 size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="outline" className="gap-2" onClick={() => setEtape(3)}><ArrowLeft size={14} /> Caractéristiques</Button>
            <Button className="gap-2" onClick={() => continuer(4)}>Compatibilité véhicule <ArrowRight size={14} /></Button>
          </div>
        </div>
      )}

      {/* ═══════ ÉTAPE 5 — COMPATIBILITÉ VÉHICULE ═══════ */}
      {etape === 5 && (
        <div className="space-y-3">
          <Cabec n={5} icone={<Car size={14} className="text-primary" />} titre="Compatibilité véhicule" hint="Lignes POSITIVE (compatible avec) et NEGATIVE (compatible sauf avec), structurées ACES (marque, modèle, années, motorisation, position…)." />
          {typeProduit !== "SERVICE" && typeProduit !== "OUTIL" && typeProduit !== "EQUIPEMENT" && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">Compatibilités ({compatibilites.length})</h2>
              <div className="grid gap-2 sm:grid-cols-4">
                <select value={comp.typeCompat} onChange={(e) => setComp({ ...comp, typeCompat: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">
                  <option value="POSITIVE">Compatible avec</option>
                  <option value="NEGATIVE">Compatible sauf avec</option>
                </select>
                <Input value={comp.marque} onChange={(e) => setComp({ ...comp, marque: e.target.value })} placeholder="Marque *" />
                <Input value={comp.modele} onChange={(e) => setComp({ ...comp, modele: e.target.value })} placeholder="Modèle *" />
                <Input value={comp.motorisation} onChange={(e) => setComp({ ...comp, motorisation: e.target.value })} placeholder="Motorisation (2.0 essence)" />
                <Input value={comp.anneeDe} onChange={(e) => setComp({ ...comp, anneeDe: e.target.value })} placeholder="Année début" />
                <Input value={comp.anneeA} onChange={(e) => setComp({ ...comp, anneeA: e.target.value })} placeholder="Année fin" />
                <Input value={comp.position} onChange={(e) => setComp({ ...comp, position: e.target.value })} placeholder="Position (essieu avant…)" />
                <Button size="sm" className="gap-1" disabled={!comp.marque || !comp.modele} onClick={addComp}><Plus size={12} /> Ajouter</Button>
              </div>
              {compatibilites.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {compatibilites.map((c, i) => (
                    <span key={i} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${c.typeCompat === "NEGATIVE" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border bg-background"}`}>
                      {c.typeCompat === "NEGATIVE" ? "⚠ sauf " : ""}{c.marque} {c.modele}{c.anneeDe ? ` ${c.anneeDe}${c.anneeA ? `–${c.anneeA}` : ""}` : ""}{c.motorisation ? ` · ${c.motorisation}` : ""}{c.position ? ` · ${c.position}` : ""}
                      <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setCompatibilites(compatibilites.filter((_, idx) => idx !== i))}><Trash2 size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="outline" className="gap-2" onClick={() => setEtape(4)}><ArrowLeft size={14} /> {libelleEtape4}</Button>
            <Button className="gap-2" onClick={() => continuer(5)}>Fournisseurs & prix <ArrowRight size={14} /></Button>
          </div>
        </div>
      )}

      {/* ═══════ ÉTAPE 6 — FOURNISSEURS & PRIX ═══════ */}
      {etape === 6 && (
        <div className="space-y-3">
          <Cabec n={6} icone={<Truck size={14} className="text-primary" />} titre="Fournisseurs & prix" hint="Prix d'achat et de vente (HT/F), prix plancher, TVA, conversions d'unités, fournisseur principal et secondaires. La marge est recalculée côté serveur à l'enregistrement et jamais éditée directement." />
          {typeProduit !== "SERVICE" && variantes.map((v, i) => (
            <VarianteCard
              key={i}
              index={i}
              value={v}
              typeArticle={typeProduit}
              optUnites={optUnites}
              optEmplacements={optEmplacements}
              optFournisseurs={optFournisseurs}
              defsVariante={defsVariante}
              onRemove={() => setVariantes(variantes.filter((_, idx) => idx !== i))}
              onChange={(patch) => setV(i, patch)}
              sections={["prix", "fournisseurs"]}
            />
          ))}
          <div className="flex justify-between">
            <Button variant="outline" className="gap-2" onClick={() => setEtape(5)}><ArrowLeft size={14} /> Compatibilité</Button>
            <Button className="gap-2" onClick={() => continuer(6)}>Stock & traçabilité <ArrowRight size={14} /></Button>
          </div>
        </div>
      )}

      {/* ═══════ ÉTAPE 7 — STOCK & TRACABILITÉ ═══════ */}
      {etape === 7 && (
        <div className="space-y-3">
          <Cabec n={7} icone={<ShieldCheck size={14} className="text-primary" />} titre="Stock & traçabilité" hint="Stock initial (mouvement d'ouverture tracé), seuils, emplacement hiérarchique, lot / série, garantie. Chaque entrée initiale génère un événement STOCK_INITIALIZED dans l'audit." />
          {typeProduit !== "SERVICE" && variantes.map((v, i) => (
            <VarianteCard
              key={i}
              index={i}
              value={v}
              typeArticle={typeProduit}
              optUnites={optUnites}
              optEmplacements={optEmplacements}
              optFournisseurs={optFournisseurs}
              defsVariante={defsVariante}
              onRemove={() => setVariantes(variantes.filter((_, idx) => idx !== i))}
              onChange={(patch) => setV(i, patch)}
              sections={["stock"]}
            />
          ))}
          <div className="flex justify-between">
            <Button variant="outline" className="gap-2" onClick={() => setEtape(6)}><ArrowLeft size={14} /> Fournisseurs & prix</Button>
            <Button className="gap-2" onClick={() => { setDoublonsParRef({}); setDoublonAccepte(false); setEtape(8); }}>Vérifier <ArrowRight size={14} /></Button>
          </div>
        </div>
      )}

      {/* ═══════ ÉTAPE 8 — VÉRIFICATION & ENREGISTREMENT ═══════ */}
      {etape === 8 && (
        <div className="space-y-4">
          <Cabec n={8} icone={<ClipboardCheck size={14} className="text-primary" />} titre="Vérification & enregistrement" hint="Enregistrement transactionnel : article + variantes + caractéristiques + compatibilités + références + stock initial — tout ou rien, avec piste d'audit." />
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">Récapitulatif</h2>
            <p className="text-sm"><b>{designation}</b> · {typeProduit}{familles.find((f: any) => String(f.id) === String(familleId)) ? ` · ${familles.find((f: any) => String(f.id) === String(familleId)).nom}` : ""}</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {variantesActives.map((v, i) => {
                const m = margeVariante(v);
                return (
                  <li key={i}>
                    • {infoVariante(v)}
                    {v.prixVente ? ` · HT ${Number(v.prixVente).toLocaleString("fr-FR")} F` : ""}
                    {m && m.marge < 0 ? ` · ⚠ marge négative (${Number(m.marge).toLocaleString("fr-FR")} F)` : ` · marge ${m ? `${Number(m.marge).toLocaleString("fr-FR")} F (${m.taux} %)` : "—"}`}
                    {v.stockInitial ? ` · stock ${v.stockInitial}` : ""}
                    {v.numeroLot ? ` · lot ${v.numeroLot}` : ""}
                  </li>
                );
              })}
            </ul>
          </div>

          {refsPrincipales.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-warning-foreground">
                <AlertTriangle size={14} /> Détection des doublons
              </h2>
              {variantesActives.map((v, i) => {
                const ref = v.referencePrincipale.trim();
                if (ref.length < 3) return null;
                return (
                  <DoublonCheck
                    key={`${ref}-${i}`}
                    reference={ref}
                    nom={designation}
                    marque={v.marque}
                    categorieId={categorieId}
                    caracteristiques={(v.attributs ?? []).filter((a) => a.cle.trim() && a.valeur.trim()).map((a) => ({ cle: a.cle.trim(), valeur: a.valeur }))}
                    onResult={(r) => setDoublonsParRef((p) => ({ ...p, [`${ref}-${i}`]: r }))}
                  />
                );
              })}
              <p className="mt-2 text-xs text-muted-foreground">Moteur multi-critères (10 stratégies). Aucune fusion automatique n'est effectuée : les variantes distinctes restent distinctes (GF5).</p>
            </div>
          )}

          {doublonsExacts > 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <input type="checkbox" checked={doublonAccepte} onChange={(e) => setDoublonAccepte(e.target.checked)} className="mt-0.5 size-4 accent-destructive" />
              <span>
                <b>{doublonsExacts} référence(s) exacte(s) déjà existante(s).</b>
                <span className="block text-xs text-muted-foreground">Je confirme que cette référence est réellement distincte (autre marque, prix, fournisseur…) et je souhaite la créer quand même. Les doublons génèrent des ventes manquées : vérifiez avant de confirmer.</span>
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setEtape(7)}><ArrowLeft size={14} /> Stock</Button>
            {!peutModifier && (
              <p className="text-xs text-muted-foreground">Vous n'avez pas la permission de créer des articles (stock.modifier).</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" disabled={create.isPending || !peutModifier || (doublonsExacts > 0 && !doublonAccepte)} onClick={() => enregistrer(true)}>
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus size={16} />}
                Créer et ajouter un autre
              </Button>
              <Button className="gap-2" disabled={create.isPending || !peutModifier || (doublonsExacts > 0 && !doublonAccepte)} onClick={() => enregistrer(false)}>
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus size={16} />}
                Créer l'article
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Vérifie une référence contre l'existant (moteur multi-critères) et affiche les doublons. */
function DoublonCheck({ reference, nom, marque, categorieId, caracteristiques, onResult }: {
  reference: string;
  nom?: string;
  marque?: string;
  categorieId?: number;
  caracteristiques?: { cle: string; valeur: string }[];
  onResult?: (r: ResultatDoublon) => void;
}) {
  const { data, isLoading } = api.articles.detecterDoublons.useQuery({
    reference,
    nom,
    marque,
    categorieId,
    caracteristiques: caracteristiques?.length ? caracteristiques : undefined,
  });
  const exacts = data?.exacts?.length ?? 0;
  const equivalents = data?.equivalents?.length ?? 0;
  const probabilite = data?.probabilite ?? null;
  const candidats = data?.candidats ?? [];
  const raisons = candidats.reduce((s: number, c: any) => s + (c.raisons?.length ?? 0), 0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  useEffect(() => {
    if (data) onResultRef.current?.({ exacts, probabilite, raisons });
  }, [data, exacts, probabilite, raisons]);
  const total = exacts + equivalents;
  const totCandidats = candidats.length;
  if (isLoading) return <p className="text-xs text-muted-foreground">Vérification de « {reference} »…</p>;
  if (total === 0 && totCandidats === 0) return <p className="text-xs text-success-foreground">✓ « {reference} » : aucune référence existante trouvée.</p>;
  return (
    <div className="rounded-lg border border-warning/30 bg-background px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-warning-foreground">⚠ « {reference} » : {exacts} exacte(s), {equivalents} équivalente(s){totCandidats > 0 ? `, ${totCandidats} candidat(s) au doublon` : ""}.</p>
        {probabilite && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${probabilite === "FORTE" ? "border-destructive/40 bg-destructive/10 text-destructive" : probabilite === "MOYENNE" ? "border-warning/40 bg-warning/10 text-warning-foreground" : "border-border bg-muted text-muted-foreground"}`}>
            Risque de doublon : {probabilite}
          </span>
        )}
      </div>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        {(data?.exacts ?? []).slice(0, 3).map((e: any) => <li key={e.id}>• {e.titre}{e.marque ? ` (${e.marque})` : ""}</li>)}
        {(data?.equivalents ?? []).slice(0, 3).map((e: any) => <li key={e.id}>• équivalente : {e.reference} {e.articleDesignation ? `— ${e.articleDesignation}` : ""}</li>)}
        {candidats.filter((c: any) => (c.raisons ?? []).length > 0).slice(0, 4).map((c: any) => (
          <li key={c.id}>• {c.titre}{c.marque ? ` (${c.marque})` : ""} — {(c.raisons ?? []).join(" · ")}</li>
        ))}
      </ul>
      <p className="mt-1">Vous pouvez créer quand même si la référence est réellement distincte (prix, fournisseur, marque…).</p>
    </div>
  );
}