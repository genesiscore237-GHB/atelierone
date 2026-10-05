"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { usePermissions } from "~/hooks/usePermissions";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { SelectSearch } from "~/components/ui/select-search";
import { ErrorState } from "~/components/ui/error-state";
import { EmptyState } from "~/components/ui/empty-state";
import {
  ArrowLeft, Package, Plus, Loader2, Trash2, Wrench, Car, BookOpen, FileText, BadgeCheck,
  Save, Info, Warehouse, X, Search, RefreshCcw, GitCompareArrows,
} from "lucide-react";

const TYPE_LABELS: Record<string, string> = { PIECE: "Pièce", CONSOMMABLE: "Consommable", OUTIL: "Outillage", EQUIPEMENT: "Équipement", SERVICE: "Service" };
const ETAT_AD_LABELS: Record<string, string> = { NEUF: "Neuf", OCCASION: "Occasion", RECONDITIONNE: "Reconditionné", REMANUFACTURE: "Remanufacturé" };
const ORIGINE_AD_LABELS: Record<string, string> = { CONSTRUCTEUR: "Constructeur", OEM: "OEM", AFTERMARKET: "Aftermarket", ADAPTABLE: "Adaptable" };
const ETATS_EQUIPEMENT = ["NEUF", "TRES_BON", "BON", "MOYEN", "USE", "ENDOMMAGE", "HORS_SERVICE", "EN_REPARATION"];
const TYPE_OUTIL = ["INDIVIDUEL", "KIT", "JEU", "MACHINE"];

const PRESETS_ATTRIBUTS: Record<string, { cle: string; label: string; unite?: string }[]> = {
  PNEUMATIQUES: [
    { cle: "largeur", label: "Largeur (mm)" }, { cle: "hauteur", label: "Hauteur (série)" }, { cle: "diametre", label: "Diamètre (pouces)" },
    { cle: "indice_charge", label: "Indice de charge" }, { cle: "indice_vitesse", label: "Indice de vitesse" },
    { cle: "type", label: "Type" }, { cle: "saison", label: "Saison" }, { cle: "tubeless", label: "Tubeless" }, { cle: "runflat", label: "Runflat" },
  ],
  BATTERIES: [
    { cle: "tension", label: "Tension (V)", unite: "V" }, { cle: "capacite_ah", label: "Capacité (Ah)", unite: "Ah" },
    { cle: "cca", label: "Courant de démarrage (CCA)", unite: "A" }, { cle: "polarite", label: "Polarité" },
    { cle: "technologie", label: "Technologie" }, { cle: "bornes", label: "Bornes" },
  ],
  FLUIDES: [
    { cle: "grade_sae", label: "Grade SAE (ex. 5W-30)" }, { cle: "type_huile", label: "Type (synthétique…)" },
    { cle: "norme_api", label: "Norme API" }, { cle: "norme_acea", label: "Norme ACEA" },
    { cle: "homologations", label: "Homologations constructeur" }, { cle: "contenance", label: "Contenance", unite: "L" },
  ],
  FILTRATION: [
    { cle: "type_filtre", label: "Type de filtre" }, { cle: "longueur", label: "Longueur", unite: "mm" },
    { cle: "largeur", label: "Largeur", unite: "mm" }, { cle: "hauteur", label: "Hauteur", unite: "mm" },
    { cle: "diametre", label: "Diamètre", unite: "mm" }, { cle: "filetage", label: "Filetage" },
  ],
  BOUGIES: [
    { cle: "filetage", label: "Filetage" }, { cle: "longueur_filetee", label: "Longueur filetée", unite: "mm" },
    { cle: "taille_cle", label: "Taille clé", unite: "mm" }, { cle: "ecartement_electrodes", label: "Écartement électrodes", unite: "mm" },
    { cle: "indice_thermique", label: "Indice thermique" }, { cle: "nb_electrodes", label: "Nombre d'électrodes" }, { cle: "technologie", label: "Technologie" },
  ],
  CLE_DYNAMO: [
    { cle: "plage_min", label: "Plage minimale", unite: "Nm" }, { cle: "plage_max", label: "Plage maximale", unite: "Nm" },
    { cle: "entrainement", label: "Entraînement (1/2″…)" }, { cle: "precision", label: "Précision (%)" }, { cle: "type_cle", label: "Type" },
  ],
  PONT: [
    { cle: "capacite", label: "Capacité (t)", unite: "t" }, { cle: "hauteur_levage", label: "Hauteur de levage", unite: "m" },
    { cle: "nb_colonnes", label: "Nombre de colonnes" }, { cle: "alimentation", label: "Alimentation" },
  ],
};

type Attribut = { cle: string; valeur: string; unite: string };

type TabId = "identification" | "variantes" | "stock" | "compatibilite" | "technique" | "equivalences" | "documents";

function VarianteStock({ variante }: { variante: any }) {
  const { data: etats, isLoading } = api.articles.stockEtats.useQuery({ varianteId: variante.id });
  if (isLoading) return <div className="h-10 animate-pulse rounded-lg bg-muted/50" />;
  const items = [
    { label: "Physique", value: etats?.physique ?? 0, cls: "" },
    { label: "Réservé", value: etats?.reserve ?? 0, cls: "" },
    { label: "Bloqué", value: etats?.bloque ?? 0, cls: "bg-destructive/5" },
    { label: "Disponible", value: etats?.disponible ?? 0, cls: "bg-success/10" },
    { label: "En commande", value: etats?.enCommande ?? 0, cls: "" },
  ];
  return (
    <div className="grid grid-cols-5 gap-2 text-center">
      {items.map((s) => (
        <div key={s.label} className={`rounded-lg bg-muted/50 p-2 ${s.cls}`}>
          <p className="text-lg font-bold">{Number(s.value).toLocaleString("fr-FR")}</p>
          <p className="text-[10px] uppercase text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

export default function ArticleDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const utils = api.useUtils();
  const { hasPermission } = usePermissions();
  const canModifier = hasPermission("stock.modifier");

  const { data, isLoading, error, refetch } = api.articles.getArticle.useQuery({ id }, { retry: false });
  const { data: categories } = api.catalog.listCategories.useQuery();
  const { data: unites } = api.catalog.listUnites.useQuery();
  const { data: emplacements } = api.stock.listEmplacements.useQuery({});
  const { data: fournisseurs } = api.reference.listFournisseurs.useQuery();
  const { data: substitutions } = api.articles.listSubstitutions.useQuery();
  const { data: supersessions } = api.articles.listSupersessions.useQuery();

  const [activeTab, setActiveTab] = useState<TabId>("identification");
  const [editingIdent, setEditingIdent] = useState(false);
  const [identForm, setIdentForm] = useState({ designation: "", designationCourte: "", description: "", categorieId: "", imageUrl: "", isActive: true });
  const [variantesFiltre, setVariantesFiltre] = useState("");

  const [showVariante, setShowVariante] = useState(false);
  const [nv, setNv] = useState<any>({
    marque: "", referenceFabricant: "", referencePrincipale: "", codeArticle: "", conditionnement: "",
    prixAchat: "", prixVente: "", prixPro: "", prixParticulier: "", tva: "", uniteStockId: "", stockInitial: "",
    emplacementStockId: "", fournisseurId: 0, typeOutil: "INDIVIDUEL", etatEquipement: "", etatProduit: "NEUF", origineProduit: "AFTERMARKET",
    positionCote: "N_A", positionEssieu: "N_A", seuilAlerte: "5", stockSecurite: "", pointCommande: "", qteMinCommande: "",
    numeroSerie: "", numeroLot: "", garantieMois: "", estCore: false, valeurCore: "", calibrable: false, numeroImmobilisation: "",
  });
  const [attributs, setAttributs] = useState<Attribut[]>([]);
  const [preset, setPreset] = useState("");
  const [editing, setEditing] = useState(false);
  const [doc, setDoc] = useState({ type: "FICHE_TECHNIQUE", titre: "", url: "" });
  const [refEq, setRefEq] = useState({ marque: "", reference: "", note: "" });
  const [comp, setComp] = useState<any>({ marque: "", modele: "", anneeDe: "", anneeA: "", motorisation: "", version: "", codeMoteur: "", transmission: "", position: "" });

  const addVariante = api.articles.addVariante.useMutation({
    onSuccess: () => {
      toast.success("Variante ajoutée");
      setShowVariante(false);
      setNv({ marque: "", referenceFabricant: "", referencePrincipale: "", codeArticle: "", conditionnement: "", prixAchat: "", prixVente: "", prixPro: "", prixParticulier: "", tva: "", uniteStockId: "", stockInitial: "", emplacementStockId: "", fournisseurId: 0, typeOutil: "INDIVIDUEL", etatEquipement: "", etatProduit: "NEUF", origineProduit: "AFTERMARKET", positionCote: "N_A", positionEssieu: "N_A", seuilAlerte: "5", stockSecurite: "", pointCommande: "", qteMinCommande: "", numeroSerie: "", numeroLot: "", garantieMois: "", estCore: false, valeurCore: "", calibrable: false, numeroImmobilisation: "" });
      utils.articles.getArticle.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateArticle = api.articles.updateArticle.useMutation({
    onSuccess: () => {
      toast.success("Article mis à jour");
      setEditingIdent(false);
      utils.articles.getArticle.invalidate();
      utils.articles.listArticles.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const setAttributsMut = api.articles.setAttributs.useMutation({
    onSuccess: () => { toast.success("Caractéristiques enregistrées"); setEditing(false); utils.articles.getArticle.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const addRef = api.articles.addReferenceEquiv.useMutation({
    onSuccess: () => { toast.success("Référence équivalente ajoutée"); setRefEq({ marque: "", reference: "", note: "" }); utils.articles.getArticle.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const removeRef = api.articles.removeReferenceEquiv.useMutation({
    onSuccess: () => { utils.articles.getArticle.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const addComp = api.articles.addCompatibilite.useMutation({
    onSuccess: () => { toast.success("Compatibilité ajoutée"); setComp({ marque: "", modele: "", anneeDe: "", anneeA: "", motorisation: "", version: "", codeMoteur: "", transmission: "", position: "" }); utils.articles.getArticle.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const removeComp = api.articles.removeCompatibilite.useMutation({
    onSuccess: () => { utils.articles.getArticle.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const addDoc = api.articles.addDocument.useMutation({
    onSuccess: () => { toast.success("Document ajouté"); setDoc({ type: "FICHE_TECHNIQUE", titre: "", url: "" }); utils.articles.getArticle.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const removeDoc = api.articles.removeDocument.useMutation({
    onSuccess: () => { utils.articles.getArticle.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const article = data?.article;
  const variantes = useMemo(() => data?.variantes ?? [], [data?.variantes]);
  const compatibilites = data?.compatibilites ?? [];
  const attributsExistants = data?.attributs ?? [];
  const referencesEquiv = data?.referencesEquiv ?? [];
  const documents = data?.documents ?? [];

  const variantesFiltrees = useMemo(() => {
    const f = variantesFiltre.trim().toLowerCase();
    if (!f) return variantes;
    return variantes.filter((v: any) =>
      [v.titre, v.referencePrincipale, v.referenceFabricant, v.codeArticle, v.codeBarre, v.marque]
        .filter(Boolean).some((x) => String(x).toLowerCase().includes(f))
    );
  }, [variantes, variantesFiltre]);

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted/50" />;
  if (error || !article) {
    return error ? (
      <ErrorState message={error.message} retryAction={() => refetch()} />
    ) : (
      <p className="text-sm text-muted-foreground">Article introuvable.</p>
    );
  }

  const estOutil = article.typeProduit === "OUTIL" || article.typeProduit === "EQUIPEMENT";
  const estService = article.typeProduit === "SERVICE";
  const nomFamille = article.categorieNom ?? "";

  const optUnites = (unites ?? []).map((u: any) => ({ value: u.id, label: `${u.libelle} (${u.symbole ?? u.code})` }));
  const optEmplacements = (emplacements ?? []).map((e: any) => ({ value: e.id, label: `${e.code} — ${e.libelle ?? ""}`.trim() }));
  const optFournisseurs = (fournisseurs ?? []).map((f: any) => ({ value: f.id, label: f.nom }));
  const optCategories = (categories ?? []).map((c: any) => ({ value: String(c.id), label: c.nom }));

  const lancerPreset = () => {
    const presetCle = preset || (nomFamille === "Pneumatiques" ? "PNEUMATIQUES" : nomFamille === "Lubrifiants & Fluides" ? "FLUIDES" : nomFamille === "Filtration" ? "FILTRATION" : "");
    const defs = PRESETS_ATTRIBUTS[presetCle];
    if (!defs) { toast.error("Choisissez un modèle de caractéristiques"); return; }
    const actuelles = new Map(attributs.map((a) => [a.cle, a]));
    setAttributs(defs.map((d) => actuelles.get(d.cle) ?? { cle: d.cle, valeur: "", unite: d.unite ?? "" }));
  };

  const enregistrerAttributs = () => {
    const ok = attributs.filter((a) => a.cle.trim());
    if (ok.length === 0) { toast.error("Aucune caractéristique à enregistrer"); return; }
    setAttributsMut.mutate({ articleId: id, attributs: ok.map((a) => ({ cle: a.cle.trim(), valeur: a.valeur, unite: a.unite })) });
  };

  const ouvrirEditionIdent = () => {
    setIdentForm({
      designation: article.designation,
      designationCourte: article.designationCourte ?? "",
      description: article.description ?? "",
      categorieId: article.categorieId != null ? String(article.categorieId) : "",
      imageUrl: article.imageUrl ?? "",
      isActive: article.isActive !== false,
    });
    setEditingIdent(true);
  };

  const enregistrerIdent = () => {
    if (identForm.designation.trim().length < 2) { toast.error("La désignation est obligatoire (2 caractères min)"); return; }
    updateArticle.mutate({
      articleId: id,
      designation: identForm.designation.trim(),
      designationCourte: identForm.designationCourte.trim() || undefined,
      description: identForm.description.trim() || undefined,
      categorieId: identForm.categorieId ? Number(identForm.categorieId) : undefined,
      imageUrl: identForm.imageUrl.trim() || undefined,
      isActive: identForm.isActive,
    });
  };

  const doVariante = () => {
    if (!nv.marque && !nv.referenceFabricant && !nv.conditionnement && !nv.referencePrincipale) { toast.error("Renseignez au moins la marque, la référence ou le conditionnement"); return; }
    addVariante.mutate({
      articleId: id,
      variante: {
        marque: nv.marque || undefined,
        referenceFabricant: nv.referenceFabricant || undefined,
        referencePrincipale: nv.referencePrincipale || undefined,
        codeArticle: nv.codeArticle || undefined,
        conditionnement: nv.conditionnement || undefined,
        prixAchat: nv.prixAchat ? Number(nv.prixAchat) : undefined,
        prixVente: nv.prixVente ? Number(nv.prixVente) : undefined,
        prixPro: nv.prixPro ? Number(nv.prixPro) : undefined,
        prixParticulier: nv.prixParticulier ? Number(nv.prixParticulier) : undefined,
        tva: nv.tva ? Number(nv.tva) : undefined,
        fournisseurId: nv.fournisseurId || undefined,
        uniteStockId: nv.uniteStockId || undefined,
        stockInitial: nv.stockInitial ? Number(nv.stockInitial) : undefined,
        emplacementStockId: nv.emplacementStockId || undefined,
        typeOutil: estOutil ? nv.typeOutil : undefined,
        etatEquipement: estOutil ? nv.etatEquipement : undefined,
        calibrable: estOutil ? nv.calibrable : undefined,
        numeroImmobilisation: estOutil && article.typeProduit === "EQUIPEMENT" ? nv.numeroImmobilisation : undefined,
        etatProduit: nv.etatProduit || undefined,
        origineProduit: nv.origineProduit || undefined,
        positionCote: nv.positionCote && nv.positionCote !== "N_A" ? nv.positionCote : undefined,
        positionEssieu: nv.positionEssieu && nv.positionEssieu !== "N_A" ? nv.positionEssieu : undefined,
        seuilAlerte: nv.seuilAlerte ? Number(nv.seuilAlerte) : undefined,
        stockSecurite: nv.stockSecurite ? Number(nv.stockSecurite) : undefined,
        pointCommande: nv.pointCommande ? Number(nv.pointCommande) : undefined,
        qteMinCommande: nv.qteMinCommande ? Number(nv.qteMinCommande) : undefined,
        numeroSerie: nv.numeroSerie || undefined,
        numeroLot: nv.numeroLot || undefined,
        garantieMois: nv.garantieMois ? Number(nv.garantieMois) : undefined,
        estCore: nv.estCore,
        valeurCore: nv.estCore && nv.valeurCore ? Number(nv.valeurCore) : undefined,
      },
    });
  };

  const tabs = ([
    { id: "identification", label: "Identification", icon: Info },
    { id: "variantes", label: estOutil ? "Exemplaires" : "Variantes", icon: Package },
    { id: "stock", label: "Stock", icon: Warehouse, hidden: estService },
    { id: "compatibilite", label: "Compatibilité", icon: Car },
    { id: "technique", label: "Technique", icon: Wrench },
    { id: "equivalences", label: "Équivalences", icon: BadgeCheck },
    { id: "documents", label: "Documents", icon: FileText },
  ] as { id: TabId; label: string; icon: any; hidden?: boolean }[]).filter((t) => !t.hidden);

  return (
    <div className="space-y-5">
      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/dashboard/catalog/articles" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Articles
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <h1 className="text-xl font-bold">{article.designation}</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{TYPE_LABELS[article.typeProduit] ?? article.typeProduit}</span>
        {article.code && <span className="font-mono text-xs text-muted-foreground">{article.code}</span>}
        {article.categorieNom && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">{article.categorieNom}</span>}
        {article.isActive === false && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">Inactif</span>}
      </div>

      {/* ─── Onglets ─── */}
      <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-border/60 bg-card/60 p-1 [scrollbar-width:thin]">
        {tabs.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
                active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <t.icon size={14} />
              {t.label}
              {t.id === "variantes" && <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-primary-foreground/20" : "bg-muted"}`}>{variantes.length}</span>}
              {t.id === "compatibilite" && <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-primary-foreground/20" : "bg-muted"}`}>{compatibilites.length}</span>}
            </button>
          );
        })}
      </div>

      {/* ═══════════ ONGLET IDENTIFICATION ═══════════ */}
      {activeTab === "identification" && (
        <div className="space-y-4">
          {!editingIdent ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
                  <div><span className="text-xs text-muted-foreground">Désignation courte</span><p className="font-medium">{article.designationCourte || "—"}</p></div>
                  <div><span className="text-xs text-muted-foreground">Statut</span><p className="font-medium">{article.isActive === false ? "Inactif" : "Actif"}</p></div>
                  <div><span className="text-xs text-muted-foreground">État par défaut</span><p className="font-medium">{ETAT_AD_LABELS[article.etatProduitDefaut ?? ""] ?? article.etatProduitDefaut ?? "—"}</p></div>
                  <div><span className="text-xs text-muted-foreground">Origine par défaut</span><p className="font-medium">{ORIGINE_AD_LABELS[article.origineProduitDefaut ?? ""] ?? article.origineProduitDefaut ?? "—"}</p></div>
                  <div className="col-span-2"><span className="text-xs text-muted-foreground">Description</span><p className="whitespace-pre-line text-muted-foreground">{article.description || "—"}</p></div>
                </div>
                {canModifier && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs shrink-0" onClick={ouvrirEditionIdent}>
                    <Info size={13} /> Modifier l&apos;identification
                  </Button>
                )}
              </div>
              {attributsExistants.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Caractéristiques de l&apos;article (communes à toutes les références)</h3>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {attributsExistants.map((a: any) => (
                      <div key={a.id} className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">{a.cle}</span>
                        <span className="ml-2">{a.valeur ?? "—"}{a.unite ? ` ${a.unite}` : ""}</span>
                        {a.statutValeur && a.statutValeur !== "RENSEIGNE" && (
                          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">{a.statutValeur === "N_A" ? "N/A" : "Inconnu"}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {article.imageUrl && (
                <div className="mt-3 border-t border-border pt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={article.imageUrl} alt="" className="max-h-32 rounded-lg object-contain" />
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">Modifier l&apos;identification</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label className="text-xs text-muted-foreground">Désignation *</Label><Input value={identForm.designation} onChange={(e) => setIdentForm({ ...identForm, designation: e.target.value })} className="mt-1" /></div>
                <div><Label className="text-xs text-muted-foreground">Désignation courte</Label><Input value={identForm.designationCourte} onChange={(e) => setIdentForm({ ...identForm, designationCourte: e.target.value })} className="mt-1" /></div>
                <div>
                  <Label className="text-xs text-muted-foreground">Catégorie</Label>
                  <SelectSearch value={identForm.categorieId || null} onChange={(v) => setIdentForm({ ...identForm, categorieId: v ? String(v) : "" })} options={optCategories} placeholder="—" searchPlaceholder="Rechercher…" size="sm" className="mt-1" />
                </div>
                <div><Label className="text-xs text-muted-foreground">Image (URL)</Label><Input value={identForm.imageUrl} onChange={(e) => setIdentForm({ ...identForm, imageUrl: e.target.value })} placeholder="https://…" className="mt-1" /></div>
                <div className="sm:col-span-2"><Label className="text-xs text-muted-foreground">Description</Label><Textarea value={identForm.description} onChange={(e) => setIdentForm({ ...identForm, description: e.target.value })} rows={3} className="mt-1" /></div>
              </div>
              <label className="mt-3 flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={identForm.isActive} onChange={(e) => setIdentForm({ ...identForm, isActive: e.target.checked })} className="size-3.5" />
                Article actif (visible dans le catalogue)
              </label>
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditingIdent(false)}>Annuler</Button>
                <Button size="sm" className="gap-1" disabled={updateArticle.isPending} onClick={enregistrerIdent}>
                  {updateArticle.isPending ? <Loader2 className="size-3 animate-spin" /> : <Save size={13} />} Enregistrer
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ ONGLET VARIANTES ═══════════ */}
      {activeTab === "variantes" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <Package size={15} className="text-primary" /> {estOutil ? `Exemplaires (${variantes.length})` : `Variantes / SKU (${variantes.length})`}
              </h2>
              <div className="ml-auto flex items-center gap-2">
                {variantes.length > 5 && (
                  <div className="relative">
                    <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={variantesFiltre} onChange={(e) => setVariantesFiltre(e.target.value)} placeholder="Filtrer (réf., marque…)" className="h-8 w-52 pl-7 text-xs" />
                  </div>
                )}
                {canModifier && (
                  <Button size="sm" onClick={() => setShowVariante(true)} className="gap-1.5 text-xs">
                    <Plus size={13} /> {estOutil ? "Ajouter un exemplaire" : "Ajouter une variante"}
                  </Button>
                )}
              </div>
            </div>
            {variantesFiltrees.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {variantes.length === 0
                  ? `Aucune ${estOutil ? "exemplaire" : "variante"}. Ajoutez-en une pour pouvoir stocker et vendre.`
                  : "Aucune variante ne correspond au filtre."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Variante</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Réf.</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Prix achat</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Prix vente</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Stock</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground">État</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {variantesFiltrees.map((v: any) => (
                      <tr key={v.id} className="hover:bg-accent/30">
                        <td className="px-3 py-2 font-medium">
                          <span className="inline-flex items-center gap-2">
                            {v.titre}
                            {v.niveau === "EXEMPLAIRE" && (
                              <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-400">Exemplaire</span>
                            )}
                            {v.statut && v.statut !== "actif" && (
                              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-600">{v.statut}</span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-mono text-xs font-semibold">{v.referencePrincipale ?? v.referenceFabricant ?? v.codeArticle ?? v.codeBarre ?? "—"}</p>
                          {(v.positionCote || v.positionEssieu) && (
                            <p className="text-[10px] uppercase text-muted-foreground">
                              {[v.positionCote, v.positionEssieu].filter((x) => x && x !== "N_A").join(" · ") || "position n/a"}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{v.prixAchat ? `${Number(v.prixAchat).toLocaleString("fr-FR")} F` : "—"}</td>
                        <td className="px-3 py-2 text-right font-mono">{v.prixVente ? `${Number(v.prixVente).toLocaleString("fr-FR")} F` : "—"}</td>
                        <td className="px-3 py-2 text-right font-mono">{Number(v.stockTotal ?? 0).toLocaleString("fr-FR")}</td>
                        <td className="px-3 py-2 text-center">
                          {estOutil && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                              {v.etatEquipement ?? "—"} {v.typeOutil ? `· ${v.typeOutil}` : ""}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link href={`/dashboard/catalog/variante/${v.id}`} className="text-xs text-primary hover:underline">Fiche</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Caractéristiques propres à chaque référence (VARIANTE) — distinctes des attributs ARTICLE */}
          {(() => {
            const avecAttrs = variantesFiltrees.filter((v: any) => (v.attributs ?? []).length > 0);
            if (avecAttrs.length === 0) return null;
            return (
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border p-3">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                    Caractéristiques propres à chaque référence ({estOutil ? "exemplaire" : "variante"})
                  </h2>
                </div>
                <div className="space-y-3 p-3">
                  {avecAttrs.map((v: any) => (
                    <div key={v.id}>
                      <p className="mb-1 text-xs font-semibold">{v.titre} <span className="font-mono font-normal text-muted-foreground">{v.referencePrincipale ?? ""}</span></p>
                      <div className="flex flex-wrap gap-1.5">
                        {v.attributs.map((a: any) => (
                          <span key={a.id} className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-xs">
                            <span className="font-semibold uppercase text-muted-foreground">{a.cle}</span>
                            <span>{a.valeur ?? "—"}{a.unite ? ` ${a.unite}` : ""}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Relations — substitutions & supersessions des variantes */}
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border p-3">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <GitCompareArrows size={15} className="text-primary" /> Relations — substitutions & supersessions
              </h2>
            </div>
            <div className="p-3">
              {(() => {
                const ids = new Set(variantes.map((v: any) => v.id));
                const subs = (substitutions ?? []).filter((s: any) => ids.has(s.varianteAId) || ids.has(s.varianteBId));
                const sups = (supersessions ?? []).filter((s: any) => ids.has(s.ancienneVarianteId) || ids.has(s.nouvelleVarianteId));
                if (subs.length === 0 && sups.length === 0) return <p className="text-sm text-muted-foreground">Aucune relation. Gérez-les depuis la fiche de chaque variante (jamais de fusion automatique).</p>;
                return (
                  <div className="space-y-2">
                    {subs.map((s: any) => (
                      <div key={`sub-${s.id}`} className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
                        <Link href={`/dashboard/catalog/variante/${s.varianteAId}`} className="font-mono hover:underline">#{s.varianteAId}</Link>
                        <span>↔</span>
                        <Link href={`/dashboard/catalog/variante/${s.varianteBId}`} className="font-mono hover:underline">#{s.varianteBId}</Link>
                        <span className="rounded-full bg-muted px-2 py-0.5 uppercase text-muted-foreground">{s.niveauConfiance}</span>
                        {s.motif && <span className="text-muted-foreground">· {s.motif}</span>}
                      </div>
                    ))}
                    {sups.map((s: any) => (
                      <div key={`sup-${s.id}`} className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
                        <RefreshCcw size={12} className="text-primary" />
                        <span className="font-mono line-through">{s.ancienneReference}</span>
                        <span>→</span>
                        <span className="font-mono font-semibold">{s.nouvelleReference}</span>
                        {s.motif && <span className="text-muted-foreground">· {s.motif}</span>}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ ONGLET STOCK ═══════════ */}
      {activeTab === "stock" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Stock par variante ({estOutil ? "exemplaires : 0 à 1 unité physique" : "6 états par référence"}). Détail des lots et sorties sur la fiche de chaque variante.
          </p>
          {variantes.length === 0 ? (
            <div className="rounded-xl border border-border bg-card"><EmptyState title="Aucune variante" description="Ajoutez une variante pour voir le stock de l'article." /></div>
          ) : (
            variantes.map((v: any) => (
              <div key={v.id} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Link href={`/dashboard/catalog/variante/${v.id}`} className="font-semibold hover:underline">{v.titre}</Link>
                  <span className="font-mono text-xs text-muted-foreground">{v.referencePrincipale ?? v.referenceFabricant ?? v.codeArticle ?? "—"}</span>
                  {(v.seuilAlerte != null || v.stockMaximum != null || v.quantiteMinimale != null) && (
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      Seuils : {v.seuilAlerte != null ? `alerte ${v.seuilAlerte}` : ""}{v.quantiteMinimale != null ? ` · minimum ${Number(v.quantiteMinimale)}` : ""}{v.stockMaximum != null ? ` · max ${v.stockMaximum}` : ""}
                    </span>
                  )}
                </div>
                <VarianteStock variante={v} />
                <div className="mt-2 text-right">
                  <Link href={`/dashboard/catalog/variante/${v.id}`} className="text-xs text-primary hover:underline">Voir la fiche variante (lots, sorties)</Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ═══════════ ONGLET COMPATIBILITÉ ═══════════ */}
      {activeTab === "compatibilite" && (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-3">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
              <Car size={15} className="text-primary" /> Véhicules compatibles ({compatibilites.length})
            </h2>
          </div>
          <div className="p-3">
            {canModifier && (
              <>
                <div className="grid gap-2 sm:grid-cols-4">
                  <Input value={comp.marque} onChange={(e) => setComp({ ...comp, marque: e.target.value })} placeholder="Marque (Toyota…)" />
                  <Input value={comp.modele} onChange={(e) => setComp({ ...comp, modele: e.target.value })} placeholder="Modèle (RAV4…)" />
                  <Input value={comp.motorisation} onChange={(e) => setComp({ ...comp, motorisation: e.target.value })} placeholder="Motorisation (2.0 essence…)" />
                  <Input value={comp.position} onChange={(e) => setComp({ ...comp, position: e.target.value })} placeholder="Position (Essieu avant…)" />
                  <Input value={comp.anneeDe} onChange={(e) => setComp({ ...comp, anneeDe: e.target.value })} placeholder="Année début" />
                  <Input value={comp.anneeA} onChange={(e) => setComp({ ...comp, anneeA: e.target.value })} placeholder="Année fin" />
                  <Input value={comp.version} onChange={(e) => setComp({ ...comp, version: e.target.value })} placeholder="Version" />
                  <Input value={comp.codeMoteur} onChange={(e) => setComp({ ...comp, codeMoteur: e.target.value })} placeholder="Code moteur" />
                </div>
                <div className="mt-2 flex justify-end">
                  <Button size="sm" className="gap-1 text-xs" disabled={addComp.isPending || !comp.marque || !comp.modele} onClick={() => addComp.mutate({ articleId: id, compat: { marque: comp.marque, modele: comp.modele, motorisation: comp.motorisation || undefined, position: comp.position || undefined, anneeDe: comp.anneeDe ? Number(comp.anneeDe) : undefined, anneeA: comp.anneeA ? Number(comp.anneeA) : undefined, version: comp.version || undefined, codeMoteur: comp.codeMoteur || undefined } })}>
                    <Plus size={13} /> Ajouter
                  </Button>
                </div>
              </>
            )}
            {compatibilites.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun véhicule référencé.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {compatibilites.map((c: any) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs">
                    <Car size={12} className="text-primary" />
                    {c.marque} {c.modele}{c.anneeDe ? ` ${c.anneeDe}${c.anneeA ? `–${c.anneeA}` : ""}` : ""}{c.motorisation ? ` · ${c.motorisation}` : ""}{c.position ? ` · ${c.position}` : ""}{c.codeMoteur ? ` · ${c.codeMoteur}` : ""}
                    {canModifier && <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeComp.mutate({ id: c.id })}><Trash2 size={11} /></button>}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ ONGLET TECHNIQUE ═══════════ */}
      {activeTab === "technique" && (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
              <Wrench size={15} className="text-primary" /> Caractéristiques techniques — article (communes à toutes les références)
            </h2>
            {canModifier && (
              <div className="flex items-center gap-2">
                <select value={preset} onChange={(e) => setPreset(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs">
                  <option value="">Modèle de caractéristiques…</option>
                  {Object.entries(PRESETS_ATTRIBUTS).map(([k]) => <option key={k} value={k}>{k}</option>)}
                </select>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={lancerPreset}>Pré-remplir</Button>
                {!editing && attributsExistants.length > 0 && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAttributs(attributsExistants.map((a: any) => ({ cle: a.cle, valeur: a.valeur ?? "", unite: a.unite ?? "" }))); setEditing(true); }}>
                    Modifier
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="p-3">
            {!editing ? (
              attributsExistants.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune caractéristique. Cliquez sur « Modifier » pour les renseigner (pneu, batterie, huile, filtre…).</p>
              ) : (
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {attributsExistants.map((a: any) => (
                    <div key={a.id} className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">{a.cle}</span>
                      <span className="ml-2">{a.valeur ?? "—"}{a.unite ? ` ${a.unite}` : ""}</span>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <>
                <div className="space-y-1.5">
                  {attributs.map((a, i) => (
                    <div key={i} className="grid grid-cols-12 items-center gap-1.5">
                      <input value={a.cle} onChange={(e) => setAttributs(attributs.map((x, idx) => (idx === i ? { ...x, cle: e.target.value } : x)))} placeholder="Clé (ex. largeur, sae_grade…)" className="col-span-4 rounded border border-border bg-background px-2 py-1.5 text-xs" />
                      <input value={a.valeur} onChange={(e) => setAttributs(attributs.map((x, idx) => (idx === i ? { ...x, valeur: e.target.value } : x)))} placeholder="Valeur" className="col-span-4 rounded border border-border bg-background px-2 py-1.5 text-xs" />
                      <input value={a.unite} onChange={(e) => setAttributs(attributs.map((x, idx) => (idx === i ? { ...x, unite: e.target.value } : x)))} placeholder="Unité" className="col-span-3 rounded border border-border bg-background px-2 py-1.5 text-xs" />
                      <button type="button" className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive" onClick={() => setAttributs(attributs.filter((_, idx) => idx !== i))}><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between">
                  <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setAttributs([...attributs, { cle: "", valeur: "", unite: "" }])}>
                    <Plus size={12} /> Ligne
                  </Button>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
                    <Button size="sm" className="gap-1" disabled={setAttributsMut.isPending} onClick={enregistrerAttributs}>
                      {setAttributsMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Save size={13} />} Enregistrer
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ ONGLET ÉQUIVALENCES ═══════════ */}
      {activeTab === "equivalences" && (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-3">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
              <BadgeCheck size={15} className="text-primary" /> Références équivalentes ({referencesEquiv.length})
            </h2>
          </div>
          <div className="p-3">
            {canModifier && (
              <div className="flex flex-wrap gap-2">
                <Input value={refEq.marque} onChange={(e) => setRefEq({ ...refEq, marque: e.target.value })} placeholder="Marque (MANN, Bosch, OEM Toyota…)" className="min-w-48 flex-1" />
                <Input value={refEq.reference} onChange={(e) => setRefEq({ ...refEq, reference: e.target.value })} placeholder="Référence (W 712/95, 90915-YZZD2…)" className="min-w-40 flex-1" />
                <Button size="sm" className="gap-1" disabled={addRef.isPending || !refEq.reference} onClick={() => addRef.mutate({ articleId: id, marque: refEq.marque || undefined, reference: refEq.reference })}>
                  <Plus size={13} /> Ajouter
                </Button>
              </div>
            )}
            {referencesEquiv.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Aucune référence équivalente.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {referencesEquiv.map((r: any) => (
                  <span key={r.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-mono">
                    {r.marque ? `${r.marque} : ` : ""}{r.reference}
                    {canModifier && <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeRef.mutate({ id: r.id })}><Trash2 size={11} /></button>}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ ONGLET DOCUMENTS ═══════════ */}
      {activeTab === "documents" && (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-3">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
              <FileText size={15} className="text-primary" /> Documents ({documents.length})
            </h2>
          </div>
          <div className="p-3">
            {canModifier && (
              <div className="flex flex-wrap gap-2">
                <select value={doc.type} onChange={(e) => setDoc({ ...doc, type: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs">
                  <option value="FICHE_TECHNIQUE">Fiche technique</option>
                  <option value="MANUEL">Manuel</option>
                  <option value="CERTIFICAT">Certificat</option>
                  <option value="FACTURE">Facture</option>
                  <option value="PHOTO">Photo</option>
                  <option value="AUTRE">Autre</option>
                </select>
                <Input value={doc.titre} onChange={(e) => setDoc({ ...doc, titre: e.target.value })} placeholder="Titre" className="min-w-40 flex-1" />
                <Input value={doc.url} onChange={(e) => setDoc({ ...doc, url: e.target.value })} placeholder="URL du document" className="min-w-48 flex-1" />
                <Button size="sm" className="gap-1" disabled={addDoc.isPending || !doc.url} onClick={() => addDoc.mutate({ articleId: id, type: doc.type, titre: doc.titre || undefined, url: doc.url })}>
                  <Plus size={13} /> Ajouter
                </Button>
              </div>
            )}
            {documents.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Aucun document.</p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {documents.map((d: any) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-sm">
                    <BookOpen size={13} className="text-primary" />
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">{d.type}</span>
                    <span className="min-w-0 flex-1 truncate">{d.titre ?? d.url}</span>
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Ouvrir</a>
                    {canModifier && <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeDoc.mutate({ id: d.id })}><Trash2 size={12} /></button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Modal ajout variante ─── */}
      {showVariante && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowVariante(false)}>
          <div className="w-full max-w-lg space-y-3 rounded-xl border border-border bg-background p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">{estOutil ? "Nouvel exemplaire" : "Nouvelle variante"}</h3>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setShowVariante(false)}><X size={16} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label className="text-xs text-muted-foreground">Marque</Label><Input value={nv.marque} onChange={(e) => setNv({ ...nv, marque: e.target.value })} placeholder="Bosch, Total…" className="mt-1" /></div>
              <div><Label className="text-xs text-muted-foreground">Référence fabricant</Label><Input value={nv.referenceFabricant} onChange={(e) => setNv({ ...nv, referenceFabricant: e.target.value })} placeholder="BP1234, W712/95…" className="mt-1" /></div>
              <div><Label className="text-xs text-muted-foreground">Référence principale</Label><Input value={nv.referencePrincipale} onChange={(e) => setNv({ ...nv, referencePrincipale: e.target.value })} placeholder="Réf. utilisée par défaut" className="mt-1" /></div>
              <div><Label className="text-xs text-muted-foreground">Conditionnement</Label><Input value={nv.conditionnement} onChange={(e) => setNv({ ...nv, conditionnement: e.target.value })} placeholder="1 L, jeu de 4, boîte…" className="mt-1" /></div>
              <div><Label className="text-xs text-muted-foreground">Code article</Label><Input value={nv.codeArticle} onChange={(e) => setNv({ ...nv, codeArticle: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs text-muted-foreground">État</Label>
                <select value={nv.etatProduit} onChange={(e) => setNv({ ...nv, etatProduit: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {["NEUF", "OCCASION", "RECONDITIONNE", "REMANUFACTURE"].map((t) => <option key={t} value={t}>{ETAT_AD_LABELS[t]}</option>)}
                </select>
              </div>
              <div><Label className="text-xs text-muted-foreground">Origine</Label>
                <select value={nv.origineProduit} onChange={(e) => setNv({ ...nv, origineProduit: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {["AFTERMARKET", "CONSTRUCTEUR", "OEM", "ADAPTABLE"].map((t) => <option key={t} value={t}>{ORIGINE_AD_LABELS[t]}</option>)}
                </select>
              </div>
              <div><Label className="text-xs text-muted-foreground">Position côté</Label>
                <select value={nv.positionCote} onChange={(e) => setNv({ ...nv, positionCote: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {["N_A", "GAUCHE", "DROITE", "CENTRAL", "LES_DEUX"].map((t) => <option key={t} value={t}>{t === "N_A" ? "— non applicable —" : t}</option>)}
                </select>
              </div>
              <div><Label className="text-xs text-muted-foreground">Position essieu</Label>
                <select value={nv.positionEssieu} onChange={(e) => setNv({ ...nv, positionEssieu: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {["N_A", "AVANT", "ARRIERE"].map((t) => <option key={t} value={t}>{t === "N_A" ? "— non applicable —" : t}</option>)}
                </select>
              </div>
              <div><Label className="text-xs text-muted-foreground">Prix achat (F)</Label><Input type="number" min={0} value={nv.prixAchat} onChange={(e) => setNv({ ...nv, prixAchat: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs text-muted-foreground">Prix vente (F)</Label><Input type="number" min={0} value={nv.prixVente} onChange={(e) => setNv({ ...nv, prixVente: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs text-muted-foreground">Prix pro (F)</Label><Input type="number" min={0} value={nv.prixPro} onChange={(e) => setNv({ ...nv, prixPro: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs text-muted-foreground">Prix particulier (F)</Label><Input type="number" min={0} value={nv.prixParticulier} onChange={(e) => setNv({ ...nv, prixParticulier: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs text-muted-foreground">TVA (%)</Label><Input type="number" min={0} max={100} value={nv.tva} onChange={(e) => setNv({ ...nv, tva: e.target.value })} className="mt-1" /></div>
              <div>
                <Label className="text-xs text-muted-foreground">Unité</Label>
                <SelectSearch value={nv.uniteStockId || null} onChange={(v) => setNv({ ...nv, uniteStockId: String(v) })} options={optUnites} placeholder="—" searchPlaceholder="Rechercher…" size="sm" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Fournisseur</Label>
                <SelectSearch value={nv.fournisseurId || null} onChange={(v) => setNv({ ...nv, fournisseurId: Number(v) })} options={optFournisseurs} placeholder="—" searchPlaceholder="Rechercher…" size="sm" className="mt-1" />
              </div>
              {!estOutil && (
                <>
                  <div><Label className="text-xs text-muted-foreground">Stock initial</Label><Input type="number" min={0} value={nv.stockInitial} onChange={(e) => setNv({ ...nv, stockInitial: e.target.value })} className="mt-1" /></div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Emplacement initial</Label>
                    <SelectSearch value={nv.emplacementStockId || null} onChange={(v) => setNv({ ...nv, emplacementStockId: Number(v) })} options={optEmplacements} placeholder="—" searchPlaceholder="Rechercher…" size="sm" className="mt-1" />
                  </div>
                  <div><Label className="text-xs text-muted-foreground">Seuil d'alerte</Label><Input type="number" min={0} value={nv.seuilAlerte} onChange={(e) => setNv({ ...nv, seuilAlerte: e.target.value })} className="mt-1" /></div>
                  <div><Label className="text-xs text-muted-foreground">Stock de sécurité</Label><Input type="number" min={0} value={nv.stockSecurite} onChange={(e) => setNv({ ...nv, stockSecurite: e.target.value })} className="mt-1" /></div>
                  <div><Label className="text-xs text-muted-foreground">Point de commande</Label><Input type="number" min={0} value={nv.pointCommande} onChange={(e) => setNv({ ...nv, pointCommande: e.target.value })} className="mt-1" /></div>
                  <div><Label className="text-xs text-muted-foreground">Qté min de commande</Label><Input type="number" min={0} value={nv.qteMinCommande} onChange={(e) => setNv({ ...nv, qteMinCommande: e.target.value })} className="mt-1" /></div>
                  <div><Label className="text-xs text-muted-foreground">Garantie (mois)</Label><Input type="number" min={0} value={nv.garantieMois} onChange={(e) => setNv({ ...nv, garantieMois: e.target.value })} className="mt-1" /></div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1"><Label className="text-xs text-muted-foreground">N° série / lot</Label><Input value={nv.numeroLot || nv.numeroSerie} onChange={(e) => setNv({ ...nv, numeroLot: e.target.value, numeroSerie: e.target.value })} placeholder="Optionnel" className="mt-1" /></div>
                    <label className="flex h-9 items-center gap-1.5 pb-0.5 text-xs"><input type="checkbox" checked={nv.estCore} onChange={(e) => setNv({ ...nv, estCore: e.target.checked })} className="size-3.5" /> Échange std</label>
                  </div>
                  {nv.estCore && <div><Label className="text-xs text-muted-foreground">Valeur core (F)</Label><Input type="number" min={0} value={nv.valeurCore} onChange={(e) => setNv({ ...nv, valeurCore: e.target.value })} className="mt-1" /></div>}
                </>
              )}
              {estOutil && (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground">Type d'outil</Label>
                    <select value={nv.typeOutil} onChange={(e) => setNv({ ...nv, typeOutil: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                      {TYPE_OUTIL.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">État physique</Label>
                    <select value={nv.etatEquipement ?? ""} onChange={(e) => setNv({ ...nv, etatEquipement: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                      <option value="">—</option>
                      {ETATS_EQUIPEMENT.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><Label className="text-xs text-muted-foreground">N° série</Label><Input value={nv.numeroSerie} onChange={(e) => setNv({ ...nv, numeroSerie: e.target.value })} placeholder="Optionnel" className="mt-1" /></div>
                  {article.typeProduit === "EQUIPEMENT" && (
                    <div><Label className="text-xs text-muted-foreground">N° immobilisation *</Label><Input value={nv.numeroImmobilisation} onChange={(e) => setNv({ ...nv, numeroImmobilisation: e.target.value })} placeholder="Obligatoire" className="mt-1" /></div>
                  )}
                  <label className="flex items-center gap-1.5 pt-1 text-xs"><input type="checkbox" checked={nv.calibrable} onChange={(e) => setNv({ ...nv, calibrable: e.target.checked })} className="size-3.5" /> Soumis à calibration</label>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowVariante(false)}>Annuler</Button>
              <Button size="sm" className="gap-1" disabled={addVariante.isPending} onClick={doVariante}>
                {addVariante.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus size={13} />} Ajouter
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}