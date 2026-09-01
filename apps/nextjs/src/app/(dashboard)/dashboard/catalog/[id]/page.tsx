"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "~/trpc/react";
import {
  ArrowLeft, Package, Trash2, Barcode, Info,
  BarChart3, History, ShoppingCart, Eye, AlertTriangle,
  Loader2, Plus, ChevronRight, ChevronDown,
  Play, Pause, Ban, Archive, Star, Check, Tag, Receipt, Boxes,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { ProductWizard } from "../_components/ProductWizard";
import { CommanderProduitDialog } from "../_components/CommanderProduitDialog";
import { toast } from "sonner";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const statutBadge: Record<string, { label: string; cls: string }> = {
  actif:       { label: "Actif",       cls: "bg-success/10 text-success-foreground border-success/20" },
  inactif:     { label: "Inactif",     cls: "bg-muted text-muted-foreground" },
  rupture:     { label: "Rupture",     cls: "bg-destructive/10 text-destructive border-destructive/20" },
  a_commander: { label: "À commander", cls: "bg-warning/10 text-warning-foreground border-warning/20" },
  archive:     { label: "Archivé",     cls: "bg-muted text-muted-foreground" },
  bloque:      { label: "Bloqué",      cls: "bg-destructive/10 text-destructive border-destructive/20" },
};

const cycleVieBadge: Record<string, { label: string; cls: string }> = {
  BROUILLON:   { label: "Brouillon",     cls: "bg-muted text-foreground/80 border-border" },
  ACTIF:       { label: "Actif",         cls: "bg-success/10 text-success-foreground border-success/20" },
  SUSPENDU:    { label: "Suspendu",      cls: "bg-warning/10 text-warning-foreground border-warning/20" },
  DISCONTINUE: { label: "Discontinué",   cls: "bg-destructive/10 text-destructive border-destructive/20" },
  ARCHIVE:     { label: "Archivé",       cls: "bg-muted text-muted-foreground" },
};

const tabs = [
  { id: "apercu",   label: "Aperçu",       icon: Eye },
  { id: "emballage", label: "Emballage",   icon: Package },
  { id: "stock",    label: "Stock",        icon: BarChart3 },
  { id: "tarifs",   label: "Tarifs",       icon: Tag },
  { id: "historique", label: "Historique", icon: History },
  { id: "ventes",   label: "Ventes",       icon: ShoppingCart },
];

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("apercu");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [showAddUniteModal, setShowAddUniteModal] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<string | null>(null);
  const [transitionMotif, setTransitionMotif] = useState("");
  const [showCommanderDialog, setShowCommanderDialog] = useState(false);

  const { data: product, isLoading } = api.catalog.getById.useQuery({ id }, { enabled: !!id });
  const { data: stock } = api.inventory.getStock.useQuery({ produitId: id }, { enabled: !!id });
  const { data: movements } = api.inventory.getMovements.useQuery({ produitId: id, limit: 50 }, { enabled: !!id });
  const { data: arbre } = api.catalog.getArbreEmballage.useQuery({ produitId: id }, { enabled: !!id });
  const utils = api.useUtils();

  const updateProduct = api.catalog.update.useMutation({
    onSuccess: () => { utils.catalog.getById.invalidate(); setShowEditModal(false); },
    onError: (e) => toast.error(e.message),
  });

  const deleteProduct = api.catalog.delete.useMutation({
    onSuccess: () => router.push("/dashboard/catalog"),
  });

  const transitionMutation = api.catalog.setStatutCycleVie.useMutation({
    onSuccess: (r) => { utils.catalog.getById.invalidate(); toast.success(`${r.from} → ${r.to}`); setShowTransitionModal(false); },
    onError: (e) => toast.error(e.message),
  });

  const addUnite = api.catalog.addUnite.useMutation({
    onSuccess: () => { utils.catalog.getArbreEmballage.invalidate(); utils.catalog.getById.invalidate(); toast.success("Unité ajoutée"); setShowAddUniteModal(false); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-5 w-32 rounded-lg bg-muted" />
        <Skeleton className="h-64 rounded-xl bg-muted" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Package className="mx-auto size-12 text-muted-foreground/70" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">Produit introuvable</h2>
          <Link href="/dashboard/catalog" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-accent/30 px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-accent">
            <ArrowLeft className="size-4" />
            Retour au catalogue
          </Link>
        </div>
      </div>
    );
  }

  const currentCycleStatut = product.statutCycleVie ?? "BROUILLON";
  const badge = statutBadge[product.statut ?? "actif"] ?? { label: product.statut ?? "Inconnu", cls: "bg-muted text-muted-foreground" };
  const cycleBadge = cycleVieBadge[currentCycleStatut] ?? { label: currentCycleStatut, cls: "bg-muted text-muted-foreground" };

  const allowedTransitions: Record<string, string[]> = {
    BROUILLON: ["ACTIF"],
    ACTIF: ["SUSPENDU", "DISCONTINUE"],
    SUSPENDU: ["ACTIF"],
    DISCONTINUE: ["ARCHIVE"],
    ARCHIVE: [],
  };
  const nextTransitions = allowedTransitions[currentCycleStatut] ?? [];

  const openTransition = (target: string) => {
    setTransitionTarget(target);
    setTransitionMotif("");
    setShowTransitionModal(true);
  };

  const handleTransition = () => {
    if (!transitionTarget) return;
    transitionMutation.mutate({
      produitId: id,
      nouveauStatut: transitionTarget as any,
      motif: (transitionTarget === "SUSPENDU" || transitionTarget === "ACTIF") ? transitionMotif : undefined,
    });
  };

  const TabContent = ({ tabId }: { tabId: string }) => {
    switch (tabId) {
      case "apercu": return <ApercuTab product={product} stock={stock} arbre={arbre} />;
      case "emballage": return <EmballageTab productId={id} arbre={arbre} />;
      case "stock": return <StockTab productId={id} stock={stock} product={product} />;
      case "tarifs": return <TarifsTab productId={id} product={product} />;
      case "historique": return <HistoriqueTab movements={movements} />;
      case "ventes": return <VentesTab productId={id} />;
      default: return null;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div>
        <Link href="/dashboard/catalog" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" />
          Catalogue
        </Link>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-foreground">{product.titre}</h1>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                {badge.label}
              </span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cycleBadge.cls}`}>
                {cycleBadge.label}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {product.codeBarre && <span className="font-mono">{product.codeBarre}</span>}
              {product.typeProduit && (
                <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {({ PIECE: "Pièce détachée", SERVICE: "Main d'œuvre", OUTIL: "Outil", CONSOMMABLE: "Consommable" } as Record<string, string>)[product.typeProduit] ?? product.typeProduit}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {nextTransitions.map(t => (
              <Button key={t} onClick={() => openTransition(t)}>
                {t === "ACTIF" && <Play className="size-4" />}
                {t === "SUSPENDU" && <Pause className="size-4" />}
                {t === "DISCONTINUE" && <Ban className="size-4" />}
                {t === "ARCHIVE" && <Archive className="size-4" />}
                {t === "ACTIF" ? "Activer" : t === "SUSPENDU" ? "Suspendre" : t === "DISCONTINUE" ? "Discontinuer" : t}
              </Button>
            ))}
            <Button onClick={() => setShowEditModal(true)}>
              Modifier
            </Button>
            <Button onClick={() => setShowCommanderDialog(true)} variant="outline">
              <ShoppingCart className="size-4" /> Commander
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <div className="flex gap-1">
          {tabs.map(({ id: tabId, label, icon: Icon }) => (
            <button key={tabId} onClick={() => setActiveTab(tabId)}
              className={`flex items-center gap-2 border-b-2 px-4 pb-3 pt-2 text-sm font-medium transition-all ${
                activeTab === tabId
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <TabContent tabId={activeTab} />

      {/* Edit Dialog */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="border-border bg-background text-foreground sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Modifier le produit</DialogTitle>
          </DialogHeader>
          <ProductWizard
            defaultValues={product}
            onSave={async (data) => { await updateProduct.mutateAsync({ id, ...data }); }}
            isPending={updateProduct.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Transition Dialog */}
      <Dialog open={showTransitionModal} onOpenChange={setShowTransitionModal}>
        <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Transition {currentCycleStatut} → {transitionTarget}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {transitionTarget === "SUSPENDU" && "Motif de suspension obligatoire"}
              {transitionTarget === "ACTIF" && currentCycleStatut === "SUSPENDU" && "Documentez la résolution"}
              {transitionTarget === "DISCONTINUE" && "Confirmez l'arrêt commercial de ce produit"}
              {transitionTarget === "ARCHIVE" && "Archivage définitif du produit"}
            </p>
          </DialogHeader>
          <div className="space-y-4">
            {(transitionTarget === "SUSPENDU" || (transitionTarget === "ACTIF" && currentCycleStatut === "SUSPENDU")) && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Motif</label>
                <textarea className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground outline-none transition-all duration-200 focus:border-ring focus:ring-2 focus:ring-ring/20 min-h-[80px]" value={transitionMotif}
                  onChange={e => setTransitionMotif(e.target.value)}
                  placeholder="Raison du changement de statut..." />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowTransitionModal(false)}>Annuler</Button>
              <Button onClick={handleTransition} disabled={transitionMutation.isPending || (transitionTarget === "SUSPENDU" && !transitionMotif.trim())}>
                Confirmer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Commander depuis le catalogue (CMD-3) */}
      <CommanderProduitDialog
        produitId={id}
        titre={product.titre}
        stock={Number(stock?.quantite ?? 0)}
        open={showCommanderDialog}
        onOpenChange={setShowCommanderDialog}
      />
    </div>
  );
}

/* ───── Composants ───── */

function UniteTreeNode({ node, depth = 0, showActions, onAddChild, onEdit, onDelete }: {
  node: any; depth?: number; showActions?: boolean;
  onAddChild?: (id: string) => void; onEdit?: (node: any) => void; onDelete?: (node: any) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-accent/50 transition-colors group"
        style={{ paddingLeft: `${12 + depth * 24}px` }}>
        <button onClick={() => setExpanded(!expanded)} className="size-4 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0">
          {hasChildren ? (expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />) : <span className="size-3.5" />}
        </button>
        <span className="text-sm font-medium text-foreground">{node.unite?.libelle ?? node.unite?.code ?? node.uniteId}</span>
        <span className="text-xs text-muted-foreground">{node.unite?.code}</span>
        {node.facteurVersParent && Number(node.facteurVersParent) !== 1 && (
          <span className="text-xs text-muted-foreground">×{node.facteurVersParent}</span>
        )}
        <div className="flex gap-1 ml-auto items-center">
          {node.estUniteBase && <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning-foreground flex items-center gap-0.5"><Star className="size-3" />Base</span>}
          {node.estUniteVenteDefaut && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary flex items-center gap-0.5"><Check className="size-3" />Vente</span>}
          {node.estUniteAchatDefaut && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary flex items-center gap-0.5"><Check className="size-3" />Achat</span>}
          {node.statut !== "ACTIF" && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{node.statut}</span>
          )}
          {node.prixVente && <span className="text-xs font-mono text-success-foreground">{Number(node.prixVente).toLocaleString()} F</span>}
          {showActions && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                    {onAddChild && <button onClick={() => onAddChild(node.id)} className="rounded p-0.5 text-muted-foreground hover:text-primary"><Plus className="size-3" /></button>}
              {onEdit && <button onClick={() => onEdit(node)} className="rounded p-0.5 text-muted-foreground hover:text-warning-foreground">✎</button>}
            </div>
          )}
        </div>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child: any) => (
            <UniteTreeNode key={child.id} node={child} depth={depth + 1}
              showActions={showActions} onAddChild={onAddChild} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
      <div className={`text-lg font-bold font-mono ${color ?? "text-foreground"}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase mt-0.5">{label}</div>
    </div>
  );
}

/* ───── Aperçu Tab ───── */
function ApercuTab({ product, stock, arbre }: { product: any; stock: any; arbre?: any[] }) {
  const marge = (() => {
    const cout = Number(stock?.coutUnitaireMoyen) || Number(arbre?.[0]?.prixAchat) || 0;
    const pv = Number(product.prixVente);
    return cout > 0 && pv > 0 ? Math.round((1 - cout / pv) * 100) + "%" : "—";
  })();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <div className="text-4xl mb-2">{product.photos?.[0] ? null : "📘"}</div>
            {product.photos?.[0] ? (
              <img src={product.photos[0]} alt={product.titre} className="mx-auto size-20 rounded-lg object-cover" />
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <KpiCard value={stock?.quantite ?? 0} label="Stock actuel" color={stock?.quantite > 0 ? "text-foreground" : "text-destructive"} />
            <KpiCard value={product.seuilAlerte ?? 5} label="Seuil alerte" />
            <KpiCard value={product.stockMaximum ?? "∞"} label="Stock max" />
            <KpiCard value={marge} label="Marge unit." />
            <KpiCard value={product.prixVente ? `${Number(product.prixVente).toLocaleString()} F` : "—"} label="Prix vente" />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
              <Info className="size-4 text-primary" />
              Informations générales
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Row label="Désignation" value={product.titre} />
              <Row label="Catégorie" value={product.categorieNom ?? product.categorieId ?? "—"} />
              <Row label="Niveau" value={product.niveauScolaire ?? "—"} />
              <Row label="Classe" value={product.classeNom ?? product.classeId ?? "—"} />
              <Row label="Sous système" value={product.sousSystemeNom ?? product.sousSystemeId ?? "—"} />
              <Row label="Matière" value={product.matiere ?? "—"} />
              <Row label="ISBN" value={product.isbn ?? "—"} />
              <Row label="Éditeur" value={product.editeur ?? "—"} />
              <Row label="Fournisseur" value={product.fournisseurNom ?? product.fournisseurId ?? "—"} />
              <Row label="Prix homologué" value={
                product.prixReglementeValeur
                  ? `${Number(product.prixReglementeValeur).toLocaleString()} F`
                  : "—"
              } />
              <Row label="Prix" value={
                product.prixReglemente
                  ? `${Number(product.prixReglementeValeur ?? product.prixVente).toLocaleString()} F (réglementé)`
                  : `${Number(product.prixVente).toLocaleString()} F`
              } />
              {product.typeProduit === "FOURNITURE" && (
                <>
                  <Row label="Marque" value={product.marque ?? "—"} />
                  <Row label="Réf. fabricant" value={product.referenceFabricant ?? "—"} />
                  <Row label="Couleur" value={product.couleur ?? "—"} />
                  <Row label="Format" value={product.format ?? "—"} />
                  <Row label="Composition" value={product.matiereComposition ?? "—"} />
                </>
              )}
              {product.typeProduit === "PIECE" && (
                <>
                  <Row label="Origine / Qualité" value={product.origineQualite === "CONSTRUCTEUR" ? "Constructeur (Genuine)" : product.origineQualite === "OEM" ? "OEM équivalent" : product.origineQualite === "AFTERMARKET" ? "Aftermarket" : product.origineQualite === "AUTRE" ? "Autre" : "—"} />
                  <Row label="DLC (alerte avant péremption)" value={product.dlcJours ? `${product.dlcJours} jour(s)` : "Non concerné"} />
                  <Row label="Échange standard (core)" value={product.estCore ? `Oui — dépôt ${Number(product.valeurCore ?? 0).toLocaleString("fr-FR")} F` : "Non"} />
                  <Row label="Marque" value={product.marque ?? "—"} />
                  <Row label="Réf. OEM" value={product.refOem ?? "—"} />
                  <Row label="Réf. Aftermarket" value={product.refAftermarket ?? "—"} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {product.description && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-2">Description</h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{product.description}</p>
        </div>
      )}

      {product.fournisseurs && product.fournisseurs.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
            <Info className="size-4 text-primary" />
            Fournisseurs ({product.fournisseurs.length})
          </h3>
          <div className="space-y-2">
            {product.fournisseurs.map((f: any) => (
              <div key={f.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-3">
                <div className="flex items-center gap-3">
                  {f.estPrincipal && <Star className="size-3.5 text-warning-foreground fill-warning" />}
                  <span className="text-sm text-foreground">{f.fournisseurNom}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {f.referenceFournisseur && <span>Réf: {f.referenceFournisseur}</span>}
                  {f.prixAchat && <span className="font-mono text-foreground">{Number(f.prixAchat).toLocaleString()} F</span>}
                  {f.delaiApprovisionnement && <span>Délai: {f.delaiApprovisionnement}j</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {arbre && arbre.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
            <Package className="size-4 text-primary" />
            Arbre d'emballage
          </h3>
          <div className="space-y-0.5">
            {arbre.map((node: any) => <UniteTreeNode key={node.id} node={node} />)}
          </div>
        </div>
      )}

      {product.codesBarres?.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
            <Barcode className="size-4 text-primary" />
            Codes-barres
          </h3>
          <div className="space-y-2">
            {product.codesBarres.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-foreground">{b.valeur}</span>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{b.type}</span>
                </div>
                {b.estDefaut && <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success-foreground">Par défaut</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───── Emballage Tab ───── */
function EmballageTab({ productId, arbre }: { productId: string; arbre?: any[] }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [editNode, setEditNode] = useState<any>(null);
  const [newUniteId, setNewUniteId] = useState("");
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [newFacteur, setNewFacteur] = useState("1");
  const [newPrixVente, setNewPrixVente] = useState("");
  const [newPrixAchat, setNewPrixAchat] = useState("");
  const [newIsBase, setNewIsBase] = useState(false);
  const [newIsVente, setNewIsVente] = useState(false);
  const [newIsAchat, setNewIsAchat] = useState(false);

  const utils = api.useUtils();

  const { data: unites } = api.reference.listUnitesMesure.useQuery();

  const addUnite = api.catalog.addUnite.useMutation({
    onSuccess: () => { utils.catalog.getArbreEmballage.invalidate(); toast.success("Unité ajoutée"); resetForm(); setShowAddModal(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateUnite = api.catalog.updateUnite.useMutation({
    onSuccess: () => { utils.catalog.getArbreEmballage.invalidate(); toast.success("Mise à jour effectuée"); setEditNode(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteUnite = api.catalog.deleteUnite.useMutation({
    onSuccess: () => { utils.catalog.getArbreEmballage.invalidate(); toast.success("Unité désactivée"); setShowDeleteModal(null); },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setNewUniteId(""); setNewParentId(null); setNewFacteur("1");
    setNewPrixVente(""); setNewPrixAchat(""); setNewIsBase(false);
    setNewIsVente(false); setNewIsAchat(false);
  };

  const openAddChild = (parentId: string) => {
    resetForm();
    setNewParentId(parentId);
    setShowAddModal(true);
  };

  const flatNodes = (nodes: any[]): any[] => {
    const result: any[] = [];
    const walk = (list: any[], depth: number) => {
      for (const n of list) { result.push({ ...n, depth }); if (n.children) walk(n.children, depth + 1); }
    };
    walk(nodes, 0);
    return result;
  };

  const handleAdd = () => {
    if (!newUniteId) { toast.error("Sélectionnez une unité"); return; }
    const f = parseFloat(newFacteur);
    if (!f || f <= 0) { toast.error("Facteur de conversion invalide"); return; }
    addUnite.mutate({
      produitId: productId,
      uniteId: newUniteId,
      parentId: newParentId,
      facteurVersParent: f,
      prixVente: newPrixVente ? parseFloat(newPrixVente) : undefined,
      prixAchat: newPrixAchat ? parseFloat(newPrixAchat) : undefined,
      estUniteBase: newIsBase,
      estUniteVenteDefaut: newIsVente,
      estUniteAchatDefaut: newIsAchat,
    });
  };

  const allFlattened = arbre ? flatNodes(arbre) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Arbre d'emballage</h3>
        <Button onClick={() => { resetForm(); setShowAddModal(true); }}>
          <Plus className="size-4" />
          Ajouter une unité
        </Button>
      </div>

      {!arbre || arbre.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Package className="mx-auto size-8 text-muted-foreground/70" />
          <p className="mt-2 text-sm text-muted-foreground">Aucune unité d'emballage définie</p>
          <p className="text-xs text-muted-foreground/70">Ajoutez des unités ou appliquez un modèle d'emballage</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          {arbre.map((node: any) => (
            <UniteTreeNode key={node.id} node={node}
              onAddChild={openAddChild}
              onEdit={(n: any) => setEditNode(n)}
              onDelete={(n: any) => setShowDeleteModal(n.id)}
              showActions
            />
          ))}
        </div>
      )}

      {/* Add Unit Dialog */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {newParentId ? "Ajouter une sous-unité" : "Ajouter une unité d'emballage"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Unité</label>
              <select className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground outline-none transition-all duration-200 focus:border-ring focus:ring-2 focus:ring-ring/20" value={newUniteId} onChange={e => setNewUniteId(e.target.value)}>
                <option value="">Sélectionner...</option>
                {unites?.map((u: any) => <option key={u.id} value={u.id}>{u.code} — {u.libelle}</option>)}
              </select>
            </div>
            {!newParentId && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Parent (optionnel, racine si vide)</label>
                <select className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground outline-none transition-all duration-200 focus:border-ring focus:ring-2 focus:ring-ring/20" value={newParentId ?? ""} onChange={e => setNewParentId(e.target.value || null)}>
                  <option value="">(Racine)</option>
                  {allFlattened.map((n: any) => (
                    <option key={n.id} value={n.id}>
                      {"  ".repeat(n.depth)}{n.unite?.libelle ?? n.uniteId}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Facteur vers parent</label>
              <Input type="number" step="0.000001" min="0.000001" value={newFacteur}
                onChange={e => setNewFacteur(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Prix achat</label>
                <Input type="number" step="0.01" value={newPrixAchat}
                  onChange={e => setNewPrixAchat(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Prix vente</label>
                <Input type="number" step="0.01" value={newPrixVente}
                  onChange={e => setNewPrixVente(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-foreground/80">
                <input type="checkbox" checked={newIsBase} onChange={e => setNewIsBase(e.target.checked)} />
                Unité de base
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground/80">
                <input type="checkbox" checked={newIsVente} onChange={e => setNewIsVente(e.target.checked)} />
                Vente défaut
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground/80">
                <input type="checkbox" checked={newIsAchat} onChange={e => setNewIsAchat(e.target.checked)} />
                Achat défaut
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowAddModal(false)}>Annuler</Button>
              <Button onClick={handleAdd} disabled={addUnite.isPending}>
                Ajouter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Unit Dialog */}
      <Dialog open={!!editNode} onOpenChange={() => setEditNode(null)}>
        <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Modifier l'unité</DialogTitle>
          </DialogHeader>
          {editNode && <EditUniteForm node={editNode} onSave={(data) => updateUnite.mutate({ id: editNode.id, ...data })}
            isPending={updateUnite.isPending} onCancel={() => setEditNode(null)} unites={unites} />}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!showDeleteModal} onOpenChange={() => setShowDeleteModal(null)}>
        <DialogContent className="border-border bg-background text-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Désactiver l'unité</DialogTitle>
            <p className="text-sm text-muted-foreground">
              L'unité sera désactivée. Les stocks doivent être nuls pour désactiver.
            </p>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowDeleteModal(null)}>Annuler</Button>
            <Button variant="danger" onClick={() => showDeleteModal && deleteUnite.mutate({ id: showDeleteModal })}
              disabled={deleteUnite.isPending}>
              Désactiver
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditUniteForm({ node, onSave, isPending, onCancel, unites }: {
  node: any; onSave: (data: any) => void; isPending: boolean; onCancel: () => void; unites?: any[];
}) {
  const [facteur, setFacteur] = useState(node.facteurVersParent ?? "1");
  const [prixVente, setPrixVente] = useState(node.prixVente ?? "");
  const [prixAchat, setPrixAchat] = useState(node.prixAchat ?? "");
  const [isBase, setIsBase] = useState(node.estUniteBase ?? false);
  const [isVente, setIsVente] = useState(node.estUniteVenteDefaut ?? false);
  const [isAchat, setIsAchat] = useState(node.estUniteAchatDefaut ?? false);

  const facteurChanged = facteur !== node.facteurVersParent;

  const handleSave = () => {
    onSave({
      facteurVersParent: parseFloat(facteur),
      prixVente: prixVente ? parseFloat(prixVente) : null,
      prixAchat: prixAchat ? parseFloat(prixAchat) : null,
      estUniteBase: isBase,
      estUniteVenteDefaut: isVente,
      estUniteAchatDefaut: isAchat,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>Unité: <span className="text-foreground">{node.unite?.libelle ?? node.uniteId}</span></span>
      </div>
      {facteurChanged && (
        <div className="rounded-lg border border-warning/20 bg-warning/5 p-2 text-xs text-warning-foreground">
          Le changement du facteur créera une nouvelle version (l'ancienne sera clôturée)
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Facteur vers parent</label>
        <Input type="number" step="0.000001" min="0.000001" value={facteur}
          onChange={e => setFacteur(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Prix achat</label>
          <Input type="number" step="0.01" value={prixAchat}
            onChange={e => setPrixAchat(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Prix vente</label>
          <Input type="number" step="0.01" value={prixVente}
            onChange={e => setPrixVente(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm text-foreground/80">
          <input type="checkbox" checked={isBase} onChange={e => setIsBase(e.target.checked)} />
          Unité de base
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground/80">
          <input type="checkbox" checked={isVente} onChange={e => setIsVente(e.target.checked)} />
          Vente défaut
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground/80">
          <input type="checkbox" checked={isAchat} onChange={e => setIsAchat(e.target.checked)} />
          Achat défaut
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button onClick={handleSave} disabled={isPending}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

/* ───── Tarifs Tab ───── */
const TARIF_TYPES = [
  { value: "public", label: "Prix public" },
  { value: "ecole", label: "Prix école" },
  { value: "grossiste", label: "Prix grossiste" },
  { value: "revendeur", label: "Prix revendeur" },
  { value: "partenaire", label: "Prix partenaire" },
  { value: "promotionnel", label: "Prix promotionnel" },
  { value: "minimum_vente", label: "Prix minimum de vente" },
  { value: "maximum_rachat", label: "Prix maximum de rachat" },
];

function TarifsTab({ productId, product }: { productId: string; product: any }) {
  const utils = api.useUtils();
  const { data: tarifsList, isLoading } = api.catalog.listTarifs.useQuery({ produitId: productId });
  const { data: prixHistorique } = api.procurement.historiquePrix.useQuery(
    { produitId: Number(productId) },
    { enabled: !!productId },
  );
  const { data: recParProduit } = api.procurement.receptionsParProduit.useQuery(
    { produitId: Number(productId), limit: 200 },
    { enabled: !!productId },
  );

  const PRICE_TYPE_LABELS: Record<string, string> = {
    ACHAT: "Prix achat",
    VENTE: "Prix vente",
    MINIMUM_VENTE: "Prix minimum vente",
    FOURNISSEUR_ACHAT: "Prix fournisseur",
    UNITE_ACHAT: "Prix unité",
    PRIX_REGLEMENTE: "Prix réglementé",
    MAXIMUM_RACHAT: "Prix max rachat",
    TVA: "TVA",
  };
  const PRICE_TYPE_CLS: Record<string, string> = {
    ACHAT: "bg-primary/10 text-primary",
    VENTE: "bg-success/10 text-success-foreground",
    MINIMUM_VENTE: "bg-destructive/10 text-destructive",
    FOURNISSEUR_ACHAT: "bg-warning/10 text-warning-foreground",
    UNITE_ACHAT: "bg-muted text-foreground/80",
    PRIX_REGLEMENTE: "bg-primary/10 text-primary",
    MAXIMUM_RACHAT: "bg-warning/10 text-warning-foreground",
    TVA: "bg-muted text-foreground/80",
  };

  const setTarif = api.catalog.setTarif.useMutation({
    onSuccess: () => { utils.catalog.listTarifs.invalidate(); toast.success("Tarif enregistré"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteTarif = api.catalog.deleteTarif.useMutation({
    onSuccess: () => { utils.catalog.listTarifs.invalidate(); toast.success("Tarif supprimé"); },
    onError: (e) => toast.error(e.message),
  });

  const activeTypes = new Set(tarifsList?.map((t: any) => t.type));
  const missingTypes = TARIF_TYPES.filter(t => !activeTypes.has(t.value));

  const handleSet = (type: string, prix: string) => {
    if (!prix || Number(prix) <= 0) { toast.error("Prix invalide"); return; }
    setTarif.mutate({ produitId: productId, type: type as any, prix });
  };

  const handleDelete = (id: string) => deleteTarif.mutate({ id });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
          <Tag className="size-4 text-primary" />
          Tarifs configurés
        </h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : !tarifsList?.length ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">Aucun tarif configuré</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Ajoutez des tarifs ci-dessous pour activer le contrôle des prix</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tarifsList.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-3">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    t.type === "minimum_vente" ? "bg-destructive/10 text-destructive" :
                    t.type === "maximum_rachat" ? "bg-warning/10 text-warning-foreground" :
                    "bg-muted text-foreground/80"
                  }`}>{TARIF_TYPES.find(tt => tt.value === t.type)?.label ?? t.type}</span>
                  {t.label && <span className="text-xs text-muted-foreground">{t.label}</span>}
                  {t.quantiteMin && t.quantiteMin > 1 && <span className="text-xs text-muted-foreground">≥ {t.quantiteMin}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-foreground">{Number(t.prix).toLocaleString()} F</span>
                    <button onClick={() => handleDelete(String(t.id))}
                      className="p-1 text-destructive hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {missingTypes.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Ajouter un tarif</h3>
          <div className="grid gap-2">
            {missingTypes.map(t => (
              <AddTarifRow key={t.value} type={t.value} label={t.label} onAdd={(prix) => handleSet(t.value, prix)} isPending={setTarif.isPending} />
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
        <strong>Prix minimum de vente</strong> : bloque la vente en POS si le prix saisi est inférieur.
        <br /><strong>Prix maximum de rachat</strong> : plafond utilisé par la Bourse pour calculer le prix de rachat d'un livre d'occasion.
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
          <History className="size-4 text-primary" />
          Journal des prix (ajustements à la réception)
        </h3>
        {!prixHistorique?.length ? (
          <p className="text-sm text-muted-foreground">Aucun ajustement de prix enregistré. Les prix sont ajustés lors des réceptions de commandes ou de réceptions libres.</p>
        ) : (
          <div className="space-y-2">
            {prixHistorique.map((h: any) => (
              <div key={h.id} className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PRICE_TYPE_CLS[h.typePrix] ?? "bg-muted text-foreground/80"}`}>
                    {PRICE_TYPE_LABELS[h.typePrix] ?? h.typePrix}
                  </span>
                  <span className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString("fr-FR")}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-mono text-sm text-foreground">
                    <span className="text-destructive">{Number(h.ancienPrix ?? 0).toLocaleString()} F</span>
                    <span className="mx-2 text-muted-foreground">→</span>
                    <span className="text-success-foreground">{Number(h.nouveauPrix).toLocaleString()} F</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {h.source === "RECEPTION_COMMANDE" ? "Réception commande" :
                     h.source === "RECEPTION_LIBRE" ? "Réception libre" : "Manuel"}
                    {h.reference && <span className="ml-1 font-mono">({h.reference})</span>}
                    {h.fournisseurNom && <span className="ml-1">· {h.fournisseurNom}</span>}
                  </span>
                </div>
                {h.uniteLibelle && <p className="mt-1 text-xs text-muted-foreground">Unité: {h.uniteLibelle}</p>}
                {h.effectueParNom && <p className="text-xs text-muted-foreground">Par {h.effectueParNom}</p>}
                {h.motif && <p className="mt-0.5 text-xs italic text-muted-foreground">"{h.motif}"</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1">
          <Receipt className="size-4 text-primary" />
          Réceptions du produit (traçabilité comptable)
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Toutes les réceptions de ce produit avec le prix facturé à chaque bon de réception (BR).
          Le stock est valorisé par coût moyen pondéré (CMP) ; chaque ligne reste traçable par BR.
        </p>
        {!recParProduit?.rows?.length ? (
          <p className="text-sm text-muted-foreground">Aucune réception enregistrée pour ce produit.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase">
                    <th className="text-left px-3 py-2">Référence</th>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">Fournisseur</th>
                    <th className="text-right px-3 py-2">Qté reçue</th>
                    <th className="text-right px-3 py-2">Prix unitaire</th>
                    <th className="text-right px-3 py-2">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {recParProduit.rows.map((r: any) => (
                    <tr key={r.id} className="text-foreground/80">
                      <td className="px-3 py-2 font-mono text-xs">{r.reference}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("fr-FR")}</td>
                      <td className="px-3 py-2 text-xs">{r.fournisseurNom ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{r.quantiteRecue}</td>
                      <td className="px-3 py-2 text-right font-mono">{Number(r.prixUnitaire).toLocaleString()} F</td>
                      <td className="px-3 py-2 text-right font-mono">{(r.quantiteRecue * Number(r.prixUnitaire)).toLocaleString()} F</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td colSpan={5} className="px-3 py-2 text-right text-xs font-medium text-foreground">Total reçu</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">{recParProduit.montantTotal.toLocaleString()} F</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {recParProduit.rows.length} ligne(s) de réception · CMP actuel : <span className="font-mono">{product?.prixAchat ? `${Number(product.prixAchat).toLocaleString()} F` : "—"}</span>
            </p>
          </>
        )}
      </div>

      <EquivalencesSection produitId={productId} />

      <KitCompositionSection produitId={productId} />
    </div>
  );
}

/* ───── Équivalences / Supersession (specs V2 §02) ───── */
function EquivalencesSection({ produitId }: { produitId: string }) {
  const utils = api.useUtils();
  const { data: equivalences, isLoading } = api.catalog.listEquivalences.useQuery({ produitId: Number(produitId) });
  const { data: produits } = api.catalog.list.useQuery({ limit: 300 });
  const [addForm, setAddForm] = useState({ articleEquivalentId: 0, type: "SUPERSESSION", priorite: 1, notes: "" });

  const add = api.catalog.addEquivalence.useMutation({
    onSuccess: () => { toast.success("Équivalence ajoutée"); utils.catalog.listEquivalences.invalidate(); setAddForm({ articleEquivalentId: 0, type: "SUPERSESSION", priorite: 1, notes: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const del = api.catalog.deleteEquivalence.useMutation({
    onSuccess: () => { toast.success("Équivalence supprimée"); utils.catalog.listEquivalences.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const listeProduits = (produits?.items ?? []).filter((p: any) => Number(p.id) !== Number(produitId));

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
        <Tag size={14} className="text-primary" /> Équivalences / Supersession
      </div>
      {isLoading ? (
        <Skeleton className="h-16 rounded-lg bg-muted" />
      ) : (
        <div className="space-y-2">
          {!equivalences?.length ? (
            <p className="text-sm text-muted-foreground">Aucune pièce équivalente définie.</p>
          ) : (
            <div className="space-y-2">
              {equivalences.map((eq: any) => (
                <div key={eq.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{eq.articleEquivalent?.titre ?? `Produit #${eq.articleEquivalentId}`}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${eq.type === "SUPERSESSION" ? "bg-primary/10 text-primary" : "bg-info/10 text-info-foreground"}`}>
                      {eq.type === "SUPERSESSION" ? "Remplace" : eq.type === "INTERCHANGEABLE" ? "Interchangeable" : "Kit"}
                    </span>
                    {eq.priorite > 1 && <span className="ml-2 text-xs text-muted-foreground">priorité {eq.priorite}</span>}
                    {eq.notes && <span className="ml-2 text-xs text-muted-foreground">· {eq.notes}</span>}
                  </div>
                  <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => del.mutate({ id: eq.id })} disabled={del.isPending}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 rounded-lg border border-dashed border-border p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ajouter une équivalence</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={addForm.articleEquivalentId}
                onChange={(e) => setAddForm({ ...addForm, articleEquivalentId: Number(e.target.value) })}
              >
                <option value={0}>Pièce équivalente...</option>
                {listeProduits.map((p: any) => <option key={p.id} value={Number(p.id)}>{p.titre}</option>)}
              </select>
              <select
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={addForm.type}
                onChange={(e) => setAddForm({ ...addForm, type: e.target.value })}
              >
                <option value="SUPERSESSION">Remplace (supersession)</option>
                <option value="INTERCHANGEABLE">Interchangeable</option>
                <option value="KIT_COMPOSANT">Composant de kit</option>
              </select>
              <Input placeholder="Notes (optionnel)" value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} />
              <Button
                className="gap-1.5"
                disabled={!addForm.articleEquivalentId || add.isPending}
                onClick={() => add.mutate({ articleId: Number(produitId), articleEquivalentId: addForm.articleEquivalentId, type: addForm.type as any, priorite: addForm.priorite, notes: addForm.notes || undefined })}
              >
                <Plus size={14} /> {add.isPending ? "Ajout..." : "Ajouter"}
              </Button>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Type SUPERSESSION : cette pièce remplace celle-ci (nouvelle référence). INTERCHANGEABLE : échangeable sans modification.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───── Composition de kit (specs V2 §02, US18) ───── */
function KitCompositionSection({ produitId }: { produitId: string }) {
  const utils = api.useUtils();
  const { data: lignes, isLoading } = api.catalog.listKitLignes.useQuery({ kitId: Number(produitId) });
  const { data: produits } = api.catalog.list.useQuery({ limit: 300 });
  const [addForm, setAddForm] = useState({ composantId: 0, quantite: 1 });

  const add = api.catalog.addKitLigne.useMutation({
    onSuccess: () => { toast.success("Composant ajouté au kit"); utils.catalog.listKitLignes.invalidate(); setAddForm({ composantId: 0, quantite: 1 }); },
    onError: (e) => toast.error(e.message),
  });
  const del = api.catalog.deleteKitLigne.useMutation({
    onSuccess: () => { toast.success("Composant retiré"); utils.catalog.listKitLignes.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const listeProduits = (produits?.items ?? []).filter((p: any) => Number(p.id) !== Number(produitId));

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
        <Boxes size={14} className="text-primary" /> Composition du kit
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Un article de type KIT sort du stock avec ses composants (mouvements liés à l'OR). Définissez ici sa composition.
      </p>
      {isLoading ? (
        <Skeleton className="h-16 rounded-lg bg-muted" />
      ) : (
        <div className="space-y-2">
          {!lignes?.length ? (
            <p className="text-sm text-muted-foreground">Aucune composition définie pour cet article.</p>
          ) : (
            lignes.map((l: any) => (
              <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{l.titre}</span>
                  <span className="ml-2 text-xs text-muted-foreground">× {l.quantite}</span>
                  {l.codeBarre && <span className="ml-2 font-mono text-[10px] text-muted-foreground">{l.codeBarre}</span>}
                </div>
                <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => del.mutate({ id: l.id })} disabled={del.isPending}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))
          )}
          <div className="mt-3 rounded-lg border border-dashed border-border p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ajouter un composant</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
                value={addForm.composantId}
                onChange={(e) => setAddForm({ ...addForm, composantId: Number(e.target.value) })}
              >
                <option value={0}>Composant (pièce / fluide)...</option>
                {listeProduits.map((p: any) => <option key={p.id} value={Number(p.id)}>{p.titre}</option>)}
              </select>
              <Input type="number" min={1} placeholder="Qté" value={addForm.quantite} onChange={(e) => setAddForm({ ...addForm, quantite: Number(e.target.value) })} />
              <Button
                className="gap-1.5 sm:col-span-3"
                disabled={!addForm.composantId || add.isPending}
                onClick={() => add.mutate({ kitId: Number(produitId), composantId: addForm.composantId, quantite: addForm.quantite })}
              >
                <Plus size={14} /> {add.isPending ? "Ajout..." : "Ajouter le composant"}
              </Button>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              À la sortie du kit, chaque composant est décrémenté (quantité × composition) avec un mouvement tracé lié à l'OR.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function AddTarifRow({ type, label, onAdd, isPending }: { type: string; label: string; onAdd: (prix: string) => void; isPending: boolean }) {
  const [prix, setPrix] = useState("");
  const isEnforcement = type === "minimum_vente" || type === "maximum_rachat";
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs w-40 ${isEnforcement ? "text-destructive" : "text-muted-foreground"}`}>{label}</span>
      <Input type="number" step="0.01" value={prix} onChange={e => setPrix(e.target.value)}
        placeholder="Prix en FCFA" />
      <Button variant="secondary" disabled={!prix || isPending}
        onClick={() => onAdd(prix)}
        className="text-xs px-3">
        Ajouter
      </Button>
    </div>
  );
}

/* ───── Stock Tab ───── */
function StockTab({ productId, stock, product }: { productId: string; stock: any; product?: any }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 text-center">
          <p className="text-xs text-muted-foreground uppercase">Stock actuel</p>
          <p className={`mt-1 text-3xl font-bold ${(stock?.quantite ?? 0) <= 0 ? "text-destructive" : "text-foreground"}`}>
            {stock?.quantite ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 text-center">
          <p className="text-xs text-muted-foreground uppercase">Emplacement</p>
          <p className="mt-1 text-lg text-foreground">{stock?.emplacement ?? "Non défini"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 text-center">
          <p className="text-xs text-muted-foreground uppercase">Valeur stock</p>
          <p className="mt-1 text-lg font-mono text-success-foreground">
            {stock?.quantite ? `${(Number(stock.quantite) * Number(stock.prixAchat ?? 0)).toLocaleString()} F` : "—"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm text-warning-foreground">
        <AlertTriangle className="size-4 shrink-0" />
        <span>Seuil d'alerte: {stock?.seuilAlerte ?? 5} unités</span>
      </div>
      {product?.stockMaximum && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
          <span>Stock maximum: {product.stockMaximum} unités</span>
        </div>
      )}
    </div>
  );
}

/* ───── Historique Tab ───── */
function HistoriqueTab({ movements }: { movements: any[] | undefined }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3">Mouvements de stock</h3>
      {!movements?.length ? (
        <p className="text-sm text-muted-foreground">Aucun mouvement enregistré.</p>
      ) : (
        <div className="space-y-2">
          {movements.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  m.type === "entree" ? "bg-success/10 text-success-foreground" : "bg-destructive/10 text-destructive"
                }`}>
                  {m.type === "entree" ? "+" : "-"}{m.quantite}
                </span>
                <div>
                  <p className="text-sm text-foreground">
                    {m.type === "entree" ? "Entrée" : m.type === "sortie" ? "Sortie" : m.type}
                    {m.referenceType && <span className="ml-2 text-xs text-muted-foreground">({m.referenceType})</span>}
                  </p>
                  {m.commentaire && <p className="text-xs text-muted-foreground">{m.commentaire}</p>}
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Avant: {m.stockAvant}</p>
                <p>Après: {m.stockApres}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───── Ventes Tab ───── */
function VentesTab({ productId }: { productId: string }) {
  const { data: salesData } = api.sales.list.useQuery();
  const productSales = salesData?.filter((s: any) =>
    s.lignes?.some((l: any) => l.produitId === productId)
  );

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3">Historique des ventes</h3>
      {!productSales?.length ? (
        <p className="text-sm text-muted-foreground">Aucune vente enregistrée pour ce produit.</p>
      ) : (
        <div className="space-y-2">
          {productSales.map((s: any) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{s.reference}</p>
                <p className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString("fr-FR")}</p>
              </div>
              <div className="text-right">
                <p className="font-mono font-semibold text-primary">{Number(s.montantTotal).toLocaleString()} F</p>
                <p className="text-xs text-muted-foreground capitalize">{s.modePaiement}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───── Shared Components ───── */
function InfoCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
        <Icon className="size-4 text-primary" />
        {title}
      </h3>
      <dl className="space-y-2 text-sm">{children}</dl>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-mono ${highlight ? "font-semibold text-foreground" : "text-foreground"}`}>{value ?? "—"}</dd>
    </div>
  );
}
