"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Plus, Search, Truck, FileText, CheckCircle, Clock, AlertTriangle, X, ShoppingCart, DollarSign, Sparkles, Receipt, ChevronDown, Pencil, Copy, Ban, FolderOpen, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "~/hooks/usePermissions";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

function ComboBox({ options, value, onChange, placeholder }: {
  options: Array<{ value: string; label: string; sub?: string }>;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find(o => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter(o => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(q)) : options;
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary">
        <Search size={14} className="text-muted-foreground shrink-0" />
        <input
          value={open ? query : (selected?.label ?? "")}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          className="w-full bg-transparent outline-none text-sm dark:text-foreground"
        />
        <button type="button" onClick={() => setOpen(!open)} className="shrink-0 text-muted-foreground hover:text-foreground">
          <ChevronDown size={14} />
        </button>
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-background dark:bg-card shadow-lg">
          {filtered.map(o => (
            <button
              key={o.value}
              type="button"
              onMouseDown={() => { onChange(o.value); setOpen(false); setQuery(""); }}
              className={`block w-full text-left px-3 py-2 text-sm hover:bg-muted dark:hover:bg-muted transition-colors ${o.value === value ? "text-primary font-medium" : "text-foreground dark:text-foreground"}`}
            >
              {o.label}
              {o.sub && <span className="block text-xs text-muted-foreground">{o.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProcurementPage() {
  const { hasPermission } = usePermissions();
  const [activeTab, setActiveTab] = useState<"suppliers" | "orders" | "suggestions" | "credit" | "factures">("suppliers");
  const [search, setSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("");
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    paymentTerms: "30 days"
  });
  const [orderForm, setOrderForm] = useState({
    supplierId: "",
    destinationPosId: "",
    demandeurId: "",
    demandeur: "",
    dateSouhaitee: "",
    livraisonAttendue: "",
    priorite: "normale" as "basse" | "normale" | "haute",
    motif: "",
    notes: "",
    lines: [] as Array<{ productId: string; quantityOrdered: number; unitCost: number }>
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<{ detteId: number; fournisseurNom: string; montantRestant: number } | null>(null);
  const [payForm, setPayForm] = useState({ montant: "", modePaiement: "especes", reference: "", notes: "", caisseId: "" });
  const [receptionPay, setReceptionPay] = useState({ actif: false, mode: "especes", montant: "", caisseId: "" });
  const [motifReliquat, setMotifReliquat] = useState("");
  const [dossierId, setDossierId] = useState<number | null>(null);
  const { data: dossier, isLoading: dossierLoading } = api.procurement.dossierAchat.useQuery(
    { achatId: dossierId ?? 0 },
    { enabled: dossierId != null, retry: false },
  );
  const [clotureMotif, setClotureMotif] = useState("");
  const cloturerAchat = api.procurement.cloturerAchat.useMutation({
    onSuccess: () => {
      toast.success("Dossier clôturé — reliquat abandonné et documenté");
      setClotureMotif("");
      utils.procurement.purchaseOrders.list.invalidate();
      if (dossierId != null) utils.procurement.dossierAchat.invalidate({ achatId: dossierId });
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const [receiveTarget, setReceiveTarget] = useState<string | null>(null);
  const { data: receiveOrderDetail } = api.procurement.purchaseOrders.get.useQuery(
    { id: receiveTarget ?? "" },
    { enabled: !!receiveTarget, retry: false },
  );
  const [receiveLines, setReceiveLines] = useState<Array<{
    produitId: string;
    titre: string;
    quantiteCommandee: number;
    quantiteRecue: number;
    prixUnitaire: string;
    appliquerPrix: boolean;
    marge: number;
    prixVente: string;
    prixMinimumVente: string;
    prixMaximumRachat: string;
    tva: string;
    typeProduit: string;
    motifEcart: string;
  }>>([]);
  const productById = (id: string) => (products?.items ?? []).find((p: any) => String(p.id) === id);

  useEffect(() => {
    if (receiveOrderDetail && receiveTarget) {
      setReceiveLines(receiveOrderDetail.lignes.map((l) => {
        const p = productById(l.produitId) as any;
        const estManuel = (l.typeProduit ?? p?.typeProduit) === "MANUEL";
        const homologue = 0;
        const margeDefaut = estManuel && homologue > 0 ? Number(agenceConfig?.margeDefautManuels ?? 25) : 0;
        const prixAchat = estManuel && homologue > 0
          ? Math.round(homologue * (1 - margeDefaut / 100))
          : Number(l.prixUnitaire ?? 0);
        const prixVenteActuel = l.prixVente ? Number(l.prixVente) : (p?.prixVente ? Number(p.prixVente) : 0);
        const margeInitiale = prixAchat > 0 && prixVenteActuel > 0
          ? Math.round(((prixVenteActuel - prixAchat) / prixAchat) * 100)
          : 20;
        return {
          produitId: l.produitId,
          titre: l.titre,
          quantiteCommandee: Number(l.quantite ?? 0),
          quantiteRecue: Number(l.quantite ?? 0),
          prixUnitaire: String(prixAchat),
          appliquerPrix: false,
          marge: estManuel && homologue > 0 ? margeDefaut : margeInitiale,
          prixVente: estManuel && homologue > 0 ? String(homologue) : (prixVenteActuel > 0 ? String(prixVenteActuel) : ""),
          prixMinimumVente: l.prixMinimumVente ? String(l.prixMinimumVente) : (p?.prixMinimumVente ? String(p.prixMinimumVente) : ""),
          prixMaximumRachat: l.prixMaximumRachat ? String(l.prixMaximumRachat) : "",
          tva: String(l.tva ?? p?.tva ?? "0"),
          typeProduit: l.typeProduit ?? p?.typeProduit ?? "FOURNITURE",
          motifEcart: "",
        };
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiveOrderDetail, receiveTarget]);

  const utils = api.useUtils();
  const { data: session } = useSession();
  const { data: suppliers, isLoading: suppliersLoading } = api.procurement.suppliers.list.useQuery();
  const { data: orders, isLoading: ordersLoading } = api.procurement.purchaseOrders.list.useQuery();
  const { data: posList } = api.settings.pos.list.useQuery();
  const { data: agenceConfig } = api.settings.organization.get.useQuery();
  const { data: products } = api.catalog.listProducts.useQuery();
  const { data: members } = api.governance.member.list.useQuery({ limit: 100 });
  const { data: suggestions, isLoading: suggestionsLoading } = api.procurement.suggestedOrders.useQuery();
  const { data: dettes } = api.procurement.listDettes.useQuery();
  const { data: statsFournisseur } = api.procurement.getStatsFournisseur.useQuery({});
  const { data: factures } = api.procurement.listFactures.useQuery({});
  const { data: caissesOuvertes } = api.finance.getBalance.useQuery();
  const searchTerm = search.trim().toLowerCase();
  const filteredSuppliers = searchTerm
    ? (suppliers ?? []).filter((s: any) => [s.name, s.contactName, s.phone, s.email].some((v: any) => v && String(v).toLowerCase().includes(searchTerm)))
    : suppliers;
  const filteredOrders = searchTerm
    ? (orders ?? []).filter((o: any) => {
        const supplierName = o.supplier?.name ?? o.fournisseur?.nom ?? "";
        return [o.id, o.reference, supplierName, o.status, o.demandeur].some((v: any) => v && String(v).toLowerCase().includes(searchTerm));
      })
    : orders;
  const displayedOrders = orderStatusFilter
    ? (filteredOrders ?? []).filter((o: any) => o.status === orderStatusFilter)
    : filteredOrders;
  const [showFactureModal, setShowFactureModal] = useState(false);
  const [factureForm, setFactureForm] = useState({ fournisseurId: 0, montantTTC: "", montantHT: "", montantTVA: "", dateFacture: "", dateEcheance: "", numeroFactureFournisseur: "", notes: "" });

  const createFacture = api.procurement.createFacture.useMutation({
    onSuccess: () => {
      utils.procurement.listFactures.invalidate();
      setShowFactureModal(false);
      setFactureForm({ fournisseurId: 0, montantTTC: "", montantHT: "", montantTVA: "", dateFacture: "", dateEcheance: "", numeroFactureFournisseur: "", notes: "" });
      toast.success("Facture créée");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const generateOrders = api.procurement.generateOrdersFromSuggestions.useMutation({
    onSuccess: (r) => {
      utils.procurement.purchaseOrders.list.invalidate();
      utils.procurement.suggestedOrders.invalidate();
      toast.success(`${r.count} commande(s) générée(s) (${r.montantTotal.toLocaleString()} F)`);
      setActiveTab("orders");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const generateOrderFromSuggestion = api.procurement.generateOrderFromSuggestions.useMutation({
    onSuccess: (r) => {
      utils.procurement.purchaseOrders.list.invalidate();
      utils.procurement.suggestedOrders.invalidate();
      if (r.count > 0) {
        toast.success(`BC ${r.created[0]?.reference} créé (${r.montantTotal.toLocaleString()} F)`);
        setActiveTab("orders");
      } else {
        toast.info("Toutes les suggestions de ce fournisseur sont déjà couvertes");
      }
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const createSupplier = api.procurement.suppliers.create.useMutation({
    onSuccess: () => {
      utils.procurement.suppliers.list.invalidate();
      setShowSupplierModal(false);
      setSupplierForm({ name: "", contactName: "", phone: "", email: "", address: "", paymentTerms: "30 days" });
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const emptyOrderForm = {
    supplierId: "", destinationPosId: "", demandeurId: "", demandeur: "",
    dateSouhaitee: "", livraisonAttendue: "", priorite: "normale" as "basse" | "normale" | "haute",
    motif: "", notes: "", lines: [] as Array<{ productId: string; quantityOrdered: number; unitCost: number }>
  };

  const createOrder = api.procurement.purchaseOrders.create.useMutation({
    onSuccess: () => {
      utils.procurement.purchaseOrders.list.invalidate();
      setShowOrderModal(false);
      setEditId(null);
      setOrderForm(emptyOrderForm);
      toast.success("Bon de commande créé");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const updateOrder = api.procurement.purchaseOrders.update.useMutation({
    onSuccess: () => {
      utils.procurement.purchaseOrders.list.invalidate();
      setShowOrderModal(false);
      setEditId(null);
      setOrderForm(emptyOrderForm);
      toast.success("Bon de commande modifié");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const duplicateOrder = api.procurement.purchaseOrders.duplicate.useMutation({
    onSuccess: () => {
      utils.procurement.purchaseOrders.list.invalidate();
      toast.success("Bon de commande dupliqué");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const [getTarget, setGetTarget] = useState<string | null>(null);
  const { data: orderDetail } = api.procurement.purchaseOrders.get.useQuery(
    { id: getTarget ?? "" },
    { enabled: !!getTarget, retry: false },
  );
  useEffect(() => {
    if (orderDetail && getTarget) {
      setOrderForm({
        supplierId: orderDetail.fournisseurId,
        destinationPosId: orderDetail.destinationPosId ?? "",
        demandeurId: orderDetail.demandeurId ?? "",
        demandeur: orderDetail.demandeur ?? "",
        dateSouhaitee: orderDetail.dateSouhaitee ?? "",
        livraisonAttendue: orderDetail.livraisonAttendue ?? "",
        priorite: (orderDetail.priorite ?? "normale") as "basse" | "normale" | "haute",
        motif: orderDetail.motif ?? "",
        notes: orderDetail.notes ?? "",
        lines: orderDetail.lignes.map(l => ({ productId: l.produitId, quantityOrdered: l.quantite, unitCost: Number(l.prixUnitaire) }))
      });
      setEditId(getTarget);
      setGetTarget(null);
      setShowOrderModal(true);
    }
  }, [orderDetail, getTarget]);

  const updateOrderStatus = api.procurement.purchaseOrders.updateStatus.useMutation({
    onSuccess: () => {
      utils.procurement.purchaseOrders.list.invalidate();
      toast.success("Statut mis à jour");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const receiveOrder = api.procurement.receivePurchaseOrder.useMutation({
    onSuccess: (r) => {
      utils.procurement.purchaseOrders.list.invalidate();
      utils.procurement.listDettes.invalidate();
      utils.procurement.historiquePrix.invalidate();
      utils.catalog.listProducts.invalidate();
      setReceiveTarget(null);
      setReceiveLines([]);
      setReceptionPay({ actif: false, mode: "especes", montant: "", caisseId: "" });
      setMotifReliquat("");
      toast.success(r.recu ? "Commande réceptionnée" : "Réception enregistrée");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const totalRecu = receiveLines.reduce((s, l) => s + l.quantiteRecue * Number(l.prixUnitaire || 0), 0);

  const submitReceive = () => {
    const lignes = receiveLines.map((l) => ({
      produitId: l.produitId,
      quantiteRecue: l.quantiteRecue,
      prixUnitaire: l.prixUnitaire,
      motifEcart: l.motifEcart || undefined,
    }));
    receiveOrder.mutate({
      id: receiveTarget!,
      lignes,
      motifReliquat: motifReliquat || undefined,
      paiement: receptionPay.actif && Number(receptionPay.montant) > 0
        ? {
            mode: receptionPay.mode,
            montant: String(receptionPay.montant),
            caisseId: receptionPay.caisseId ? Number(receptionPay.caisseId) : undefined,
          }
        : undefined,
      prixAjustes: receiveLines
        .filter((l) => l.appliquerPrix)
        .map((l) => ({
          produitId: l.produitId,
          prixAchat: l.prixUnitaire || null,
          prixVente: l.prixVente ? l.prixVente : null,
          prixMinimumVente: l.prixMinimumVente ? l.prixMinimumVente : null,
          prixMaximumRachat: l.prixMaximumRachat ? l.prixMaximumRachat : null,
          tva: l.tva ? l.tva : null,
        })),
    });
  };

  const updateReceiveLine = (index: number, field: string, value: any) => {
    setReceiveLines(prev => {
      const nl = [...prev];
      const ligne = { ...nl[index] };
      const estManuel = ligne.typeProduit === "MANUEL";
      const homologue = 0;
      if (estManuel && homologue > 0) {
        if (field === "marge") {
          ligne.marge = Number(value) || 0;
          ligne.prixUnitaire = String(Math.round(homologue * (1 - ligne.marge / 100)));
        } else if (field === "prixUnitaire") {
          ligne.prixUnitaire = value;
          const pa = Number(value) || 0;
          if (pa > 0) ligne.marge = Math.round((1 - pa / homologue) * 100);
        } else {
          (ligne as any)[field] = value;
        }
      } else if (field === "marge") {
        ligne.marge = Number(value) || 0;
        const pa = Number(ligne.prixUnitaire ?? 0);
        ligne.prixVente = pa > 0 ? String(Math.round(pa * (1 + ligne.marge / 100))) : "";
      } else if (field === "prixUnitaire") {
        ligne.prixUnitaire = value;
        const pa = Number(value) || 0;
        if (pa > 0) ligne.prixVente = String(Math.round(pa * (1 + ligne.marge / 100)));
      } else {
        (ligne as any)[field] = value;
      }
      nl[index] = ligne;
      return nl;
    });
  };

  const payerDette = api.procurement.payerDette.useMutation({
    onSuccess: (r) => {
      utils.procurement.listDettes.invalidate();
      utils.procurement.getStatsFournisseur.invalidate();
      setPayModal(null);
      toast.success(`Paiement enregistré — Restant: ${Number(r.montantRestant).toLocaleString()} F`);
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  function getStatusBadge(status: string) {
    switch (status) {
      case "brouillon": return { icon: <Clock size={14} />, text: "Brouillon", color: "bg-muted text-foreground/80 dark:bg-muted-foreground/10 dark:text-muted-foreground" };
      case "commande": return { icon: <FileText size={14} />, text: "Commandé", color: "bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary" };
      case "partiel": return { icon: <AlertTriangle size={14} />, text: "Partiel", color: "bg-warning/10 text-warning-foreground dark:bg-warning/10 dark:text-warning-foreground" };
      case "recu": return { icon: <CheckCircle size={14} />, text: "Reçu", color: "bg-success/10 text-success-foreground dark:bg-success/10 dark:text-success-foreground" };
      case "cloturee": return { icon: <CheckCircle2 size={14} />, text: "Clôturé", color: "bg-muted text-foreground/80 dark:bg-muted-foreground/10 dark:text-muted-foreground" };
      case "annulee": return { icon: <X size={14} />, text: "Annulé", color: "bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive" };
      default: return { icon: <Clock size={14} />, text: status, color: "bg-muted text-foreground/80 dark:bg-muted-foreground/10 dark:text-muted-foreground" };
    }
  }

  const addOrderLine = () => {
    setOrderForm({
      ...orderForm,
      lines: [...orderForm.lines, { productId: "", quantityOrdered: 1, unitCost: 0 }]
    });
  };

  const updateOrderLine = (index: number, field: string, value: any) => {
    const newLines = [...orderForm.lines];
    newLines[index] = { ...newLines[index], [field]: value } as any;
    setOrderForm({ ...orderForm, lines: newLines });
  };

  const removeOrderLine = (index: number) => {
    setOrderForm({
      ...orderForm,
      lines: orderForm.lines.filter((_, i) => i !== index)
    });
  };

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground dark:text-foreground">Achats & Fournisseurs</h1>
          <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">Gérez vos fournisseurs et commandes d'achat</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSupplierModal(true)}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-success to-success/80 px-4 py-2.5 text-sm font-semibold text-foreground hover:from-success/80 hover:to-success/60 transition-all shadow-sm"
          >
            <Plus size={16} /> Nouveau fournisseur
          </button>
          {hasPermission("achats.commander") && (
            <button
              onClick={() => { setOrderForm(emptyOrderForm); setEditId(null); setShowOrderModal(true); }}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary/80 px-4 py-2.5 text-sm font-semibold text-foreground hover:from-primary/80 hover:to-primary/60 transition-all shadow-sm"
            >
              <ShoppingCart size={16} /> Nouvelle commande
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex rounded-lg bg-muted dark:bg-muted p-1">
        <button
          onClick={() => setActiveTab("suppliers")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "suppliers"
              ? "bg-background text-foreground shadow-sm dark:bg-muted dark:text-foreground"
              : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
          }`}
        >
          Fournisseurs
        </button>
        <button
          onClick={() => setActiveTab("orders")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "orders"
              ? "bg-background text-foreground shadow-sm dark:bg-muted dark:text-foreground"
              : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
          }`}
        >
          Commandes
        </button>
        <button
          onClick={() => setActiveTab("suggestions")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "suggestions"
              ? "bg-background text-foreground shadow-sm dark:bg-muted dark:text-foreground"
              : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
          }`}
        >
          Suggestions
          {suggestions && suggestions.totalProduits > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-bold text-foreground">
              {suggestions.totalProduits}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("credit")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "credit"
              ? "bg-background text-foreground shadow-sm dark:bg-muted dark:text-foreground"
              : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
          }`}
        >
          Crédit
          {dettes && dettes.filter(d => d.statut !== "paye").length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-foreground">
              {dettes.filter(d => d.statut !== "paye").length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("factures")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "factures"
              ? "bg-background text-foreground shadow-sm dark:bg-muted dark:text-foreground"
              : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
          }`}
        >
          Factures
        </button>
      </div>

      {/* Search */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
        <input
          placeholder={activeTab === "suppliers" ? "Rechercher un fournisseur..." : "Rechercher une commande..."}
          className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary dark:bg-card dark:border-border dark:text-foreground transition-all"
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />
      </div>

      {/* Suppliers Tab */}
      {activeTab === "suppliers" && (
        <motion.div variants={container} initial="hidden" animate="show" className="rounded-xl border border-border bg-background overflow-hidden dark:border-border dark:bg-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 dark:bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Fournisseur</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider hidden md:table-cell">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Téléphone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Conditions</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-border">
                {suppliersLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={5} className="px-4 py-4"><div className="h-4 bg-muted dark:bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : filteredSuppliers?.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground dark:text-muted-foreground">
                    <Truck size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Aucun fournisseur</p>
                    <p className="text-sm mt-1">Ajoutez votre premier fournisseur</p>
                  </td></tr>
                ) : (
                  filteredSuppliers?.map((supplier: NonNullable<typeof suppliers>[number]) => (
                    <motion.tr key={supplier.id} variants={item} className="hover:bg-muted/50 dark:hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-foreground dark:text-foreground">{supplier.name}</p>
                        {supplier.contactName && <p className="text-xs text-muted-foreground dark:text-muted-foreground">{supplier.contactName}</p>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {supplier.email && <p className="text-sm text-muted-foreground dark:text-foreground/80">{supplier.email}</p>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {supplier.phone && <p className="text-sm text-muted-foreground dark:text-foreground/80">{supplier.phone}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground dark:text-foreground/80">{supplier.paymentTerms}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 dark:text-primary dark:hover:bg-primary/10 transition-colors">
                          Modifier
                        </button>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Orders Tab */}
      {activeTab === "orders" && (
        <motion.div variants={container} initial="hidden" animate="show" className="rounded-xl border border-border bg-background overflow-hidden dark:border-border dark:bg-card">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border dark:border-border">
            <h2 className="text-sm font-semibold text-foreground dark:text-foreground">Bons de commande ({displayedOrders?.length ?? 0})</h2>
            <select
              value={orderStatusFilter}
              onChange={(e) => setOrderStatusFilter(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Tous les statuts</option>
              <option value="brouillon">Brouillon</option>
              <option value="commande">Commandé</option>
              <option value="partiel">Partiel</option>
              <option value="recu">Reçu</option>
              <option value="annulee">Annulé</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 dark:bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Commande</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider hidden md:table-cell">Fournisseur</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Destination</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Montant</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Statut</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-border">
                {ordersLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="px-4 py-4"><div className="h-4 bg-muted dark:bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : (displayedOrders?.length ?? 0) === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground dark:text-muted-foreground">
                    <FileText size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Aucune commande</p>
                    <p className="text-sm mt-1">Créez votre premier bon de commande</p>
                  </td></tr>
                ) : (
                  displayedOrders?.map((order: NonNullable<typeof orders>[number]) => {
                    const status = getStatusBadge(order.status);
                    return (
                      <motion.tr key={order.id} variants={item} className="hover:bg-muted/50 dark:hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-foreground dark:text-foreground">{order.reference ?? `#${order.id.slice(-8)}`}</p>
                          <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                            {order.orderedAt ? new Date(order.orderedAt).toLocaleDateString("fr-FR") : "Non commandée"}
                          </p>
                          {order.demandeur && (
                            <p className="text-xs text-muted-foreground dark:text-muted-foreground">Demandeur: {order.demandeur}</p>
                          )}
                          {order.priorite && order.priorite !== "normale" && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium mt-1 ${
                              order.priorite === "haute" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            }`}>
                              {order.priorite === "haute" ? "Priorité haute" : "Priorité basse"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <p className="text-sm text-muted-foreground dark:text-foreground/80">{order.supplier.name}</p>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <p className="text-sm text-muted-foreground dark:text-foreground/80">{order.destinationPos?.name ?? ""}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold font-mono text-foreground dark:text-foreground">{order.totalAmount} F</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>
                            {status.icon} {status.text}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {order.status === "brouillon" && hasPermission("achats.commander") && (
                              <>
                                <button
                                  onClick={() => setGetTarget(order.id)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/70 dark:hover:bg-muted transition-colors"
                                  title="Modifier le BC"
                                >
                                  <Pencil size={13} /> Modifier
                                </button>
                                <button
                                  onClick={() => updateOrderStatus.mutate({ id: order.id, statut: "commande" })}
                                  disabled={updateOrderStatus.isPending}
                                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 dark:text-primary dark:hover:bg-primary/10 transition-colors disabled:opacity-50"
                                >
                                  Commander
                                </button>
                              </>
                            )}
                            {order.status === "commande" && hasPermission("achats.recevoir") && (
                              <button
                                onClick={() => setReceiveTarget(order.id)}
                                disabled={receiveOrder.isPending}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-success-foreground hover:bg-success/10 dark:text-success-foreground dark:hover:bg-success/10 transition-colors disabled:opacity-50"
                              >
                                <Truck size={13} /> Réceptionner
                              </button>
                            )}
                            {order.status !== "annulee" && (
                              <button
                                onClick={() => setDossierId(Number(order.id))}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted/70 dark:hover:bg-muted transition-colors disabled:opacity-50"
                                title="Suivi du dossier (réceptions, écarts, paiements)"
                              >
                                <FolderOpen size={14} />
                              </button>
                            )}
                            {order.status !== "annulee" && (
                              <button
                                onClick={() => duplicateOrder.mutate({ id: order.id })}
                                disabled={duplicateOrder.isPending}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted/70 dark:hover:bg-muted transition-colors disabled:opacity-50"
                                title="Dupliquer le BC"
                              >
                                <Copy size={14} />
                              </button>
                            )}
                            {["brouillon", "commande", "partiel"].includes(order.status) && hasPermission("achats.commander") && (
                              <button
                                onClick={() => updateOrderStatus.mutate({ id: order.id, statut: "annulee" })}
                                disabled={updateOrderStatus.isPending}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                                title="Annuler la commande"
                              >
                                <Ban size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Suggestions Tab */}
      {activeTab === "suggestions" && (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
          {suggestionsLoading ? (
            <div className="rounded-xl border border-border bg-background p-8 text-center dark:border-border dark:bg-card">
              <p className="text-sm text-muted-foreground">Chargement des suggestions...</p>
            </div>
          ) : !suggestions || suggestions.suggestions.length === 0 ? (
            <div className="rounded-xl border border-border bg-background p-12 text-center dark:border-border dark:bg-card">
              <CheckCircle size={40} className="mx-auto mb-3 text-success-foreground opacity-50" />
              <p className="font-medium text-foreground dark:text-foreground">Aucune suggestion</p>
              <p className="text-sm mt-1 text-muted-foreground dark:text-muted-foreground">Tous les stocks sont au-dessus du seuil d'alerte</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-xl border border-warning/20 bg-warning/10 p-4 dark:border-warning/20 dark:bg-warning/10">
                <div className="flex items-center gap-3">
                  <Sparkles size={24} className="text-warning-foreground" />
                  <div>
                    <p className="text-sm font-semibold text-foreground dark:text-foreground">
                      {suggestions.totalProduits} produit(s) sous le seuil d'alerte
                    </p>
                    <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                      {suggestions.suggestions.length} fournisseur(s) · Total estimé: {suggestions.montantTotal.toLocaleString()} F
                    </p>
                  </div>
                </div>
                {hasPermission("achats.commander") && (
                  <button
                    onClick={() => generateOrders.mutate()}
                    disabled={generateOrders.isPending}
                    className="flex items-center gap-2 rounded-lg bg-warning px-4 py-2 text-sm font-semibold text-foreground hover:bg-warning/80 disabled:opacity-50 transition-colors"
                  >
                    {generateOrders.isPending ? "Génération..." : "Générer les BC"}
                  </button>
                )}
              </div>

              {suggestions.suggestions.map((s: any) => (
                <motion.div key={s.fournisseurId} variants={item} className="rounded-xl border border-border bg-background overflow-hidden dark:border-border dark:bg-card">
                  <div className="flex items-center justify-between border-b border-border/50 dark:border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Truck size={16} className="text-muted-foreground" />
                      <span className="font-semibold text-foreground dark:text-foreground">{s.fournisseurNom}</span>
                      <span className="text-xs text-muted-foreground">({s.lignes.length} article{s.lignes.length > 1 ? "s" : ""})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-foreground dark:text-foreground">{s.montantTotal.toLocaleString()} F</span>
                      {hasPermission("achats.commander") && (
                        <button
                          onClick={() => generateOrderFromSuggestion.mutate({ fournisseurId: Number(s.fournisseurId) })}
                          disabled={generateOrderFromSuggestion.isPending || !s.lignes.some((l: any) => !l.dejaInclu)}
                          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          title={s.lignes.every((l: any) => l.dejaInclu) ? "Suggestions déjà couvertes par un BC existant" : "Créer un bon de commande à partir des suggestions"}
                        >
                          <Plus size={14} />
                          {generateOrderFromSuggestion.isPending ? "Création..." : "Créer le bon de commande"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50 dark:bg-muted/50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Produit</th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Stock</th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Seuil</th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Qté suggérée</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Prix achat</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border dark:divide-border">
                        {s.lignes.map((l: any) => (
                          <tr key={l.produitId} className="hover:bg-muted/50 dark:hover:bg-muted/30">
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-foreground dark:text-foreground">{l.titre}</p>
                                {l.dejaInclu && (
                                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground" title="Déjà couvert par un BC existant">
                                    Dans {l.refBc}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground font-mono">{l.codeBarre}</p>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${l.stockActuel <= 0 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning-foreground"}`}>
                                {l.stockActuel}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-center text-sm text-muted-foreground dark:text-foreground/80">{l.seuilAlerte}</td>
                            <td className="px-4 py-2 text-center">
                              <span className="text-sm font-semibold text-primary dark:text-primary">{l.qteSuggeree}</span>
                            </td>
                            <td className="px-4 py-2 text-right text-sm text-muted-foreground dark:text-foreground/80">{l.prixAchat.toLocaleString()} F</td>
                            <td className="px-4 py-2 text-right text-sm font-mono text-foreground dark:text-foreground">{l.totalLigne.toLocaleString()} F</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              ))}
            </>
          )}
        </motion.div>
      )}

      {/* Credit Tab */}
      {activeTab === "credit" && (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
          {statsFournisseur && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-background p-4 dark:border-border dark:bg-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <DollarSign size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Total achats</p>
                    <p className="text-xl font-bold text-foreground dark:text-foreground">{statsFournisseur.totalAchats}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background p-4 dark:border-border dark:bg-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Dette restante</p>
                    <p className="text-xl font-bold text-foreground dark:text-foreground">{statsFournisseur.detteTotale.toLocaleString()} F</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background p-4 dark:border-border dark:bg-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning-foreground">
                    <Clock size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Dettes impayées</p>
                    <p className="text-xl font-bold text-foreground dark:text-foreground">{statsFournisseur.dettesEnRetard}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-background overflow-hidden dark:border-border dark:bg-card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 dark:bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Référence</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Fournisseur</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Total</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Payé</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Restant</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Échéance</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Statut</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-border">
                  {!dettes || dettes.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      <CheckCircle size={40} className="mx-auto mb-3 opacity-30" />
                      <p className="font-medium">Aucune dette fournisseur</p>
                    </td></tr>
                  ) : (
                    dettes.map((d: any) => (
                      <motion.tr key={d.id} variants={item} className={`hover:bg-muted/50 dark:hover:bg-muted/30 ${d.isOverdue ? "bg-destructive/5 dark:bg-destructive/5" : ""}`}>
                        <td className="px-4 py-3">
                          <p className="text-sm font-mono text-foreground dark:text-foreground">{d.reference}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground dark:text-foreground/80">{d.fournisseurNom}</td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-foreground dark:text-foreground">{Number(d.montantTotal).toLocaleString()} F</td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-success-foreground dark:text-success-foreground">{Number(d.montantPaye).toLocaleString()} F</td>
                        <td className="px-4 py-3 text-right text-sm font-mono font-bold text-destructive dark:text-destructive">{Number(d.montantRestant).toLocaleString()} F</td>
                        <td className="px-4 py-3 text-center text-sm text-muted-foreground dark:text-foreground/80">
                          {d.echeanceLe ? new Date(d.echeanceLe).toLocaleDateString("fr-FR") : "—"}
                          {d.joursRestants !== null && (
                            <span className={`ml-1 text-xs ${d.joursRestants < 0 ? "text-destructive" : d.joursRestants <= 7 ? "text-warning-foreground" : "text-muted-foreground"}`}>
                              {d.joursRestants < 0 ? `(${d.joursRestants}j)` : `(${d.joursRestants}j)`}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                            d.statut === "paye" ? "bg-success/10 text-success-foreground" :
                            d.isOverdue ? "bg-destructive/10 text-destructive" :
                            d.statut === "partiel" ? "bg-warning/10 text-warning-foreground" :
                            "bg-muted text-muted-foreground dark:bg-muted dark:text-foreground/80"
                          }`}>
                            {d.statut === "paye" ? "Payé" : d.statut === "partiel" ? "Partiel" : "Impayé"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {d.statut !== "paye" && hasPermission("achats.commander") && (
                            <button
                              onClick={() => {
                                setPayModal({ detteId: d.id, fournisseurNom: d.fournisseurNom, montantRestant: Number(d.montantRestant) });
                                setPayForm({ montant: String(d.montantRestant), modePaiement: "especes", reference: "", notes: "", caisseId: "" });
                              }}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-success-foreground hover:bg-success/10 dark:text-success-foreground dark:hover:bg-success/10 transition-colors"
                            >
                              Payer
                            </button>
                          )}
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* Factures Tab */}
      {activeTab === "factures" && (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground dark:text-muted-foreground">
              {factures?.length ?? 0} facture(s)
            </p>
            <button
              onClick={() => setShowFactureModal(true)}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-success to-success/80 px-4 py-2 text-sm font-semibold text-foreground hover:from-success/80 hover:to-success/60 transition-all shadow-sm"
            >
              <Plus size={16} /> Nouvelle facture
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border dark:border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 dark:bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground">Réf.</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground">Fournisseur</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground">Montant TTC</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground">Statut</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground">Échéance</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground dark:text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {!factures?.length ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground dark:text-muted-foreground">Aucune facture</td>
                  </tr>
                ) : (
                  factures.map((f: any) => (
                    <motion.tr key={f.id} variants={item} className="border-t border-border/50 dark:border-border hover:bg-muted/50 dark:hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{f.reference}</td>
                      <td className="px-4 py-3 font-medium">{factures && suppliers ? (suppliers.find((s: any) => String(s.id) === String(f.fournisseurId))?.name ?? f.fournisseurId) : f.fournisseurId}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{Number(f.montantTTC).toLocaleString()} F</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          f.statut === "payee" ? "bg-success/10 text-success-foreground dark:bg-success/10 dark:text-success-foreground"
                          : f.statut === "impayee" ? "bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive"
                          : f.statut === "partielle" ? "bg-warning/10 text-warning-foreground dark:bg-warning/10 dark:text-warning-foreground"
                          : "bg-muted text-foreground/80 dark:bg-muted-foreground/10 dark:text-muted-foreground"
                        }`}>
                          {f.statut === "payee" ? "Payée" : f.statut === "impayee" ? "Impayée" : f.statut === "partielle" ? "Partielle" : f.statut}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                        {f.dateEcheance ? new Date(f.dateEcheance).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                        {f.createdAt ? new Date(f.createdAt).toLocaleDateString("fr-FR") : "—"}
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Facture Modal */}
      {showFactureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowFactureModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg rounded-2xl bg-background dark:bg-card p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground dark:text-foreground">Nouvelle facture fournisseur</h2>
              <button onClick={() => setShowFactureModal(false)} className="rounded-lg p-1.5 hover:bg-muted dark:hover:bg-muted"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              createFacture.mutate(factureForm);
            }} className="space-y-4">
              <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={factureForm.fournisseurId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFactureForm({ ...factureForm, fournisseurId: Number(e.target.value) })} required>
                <option value={0}>Sélectionner un fournisseur *</option>
                {suppliers?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input type="number" step="0.01" placeholder="Montant HT" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={factureForm.montantHT} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFactureForm({ ...factureForm, montantHT: e.target.value })} />
              <input type="number" step="0.01" placeholder="Montant TVA" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={factureForm.montantTVA} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFactureForm({ ...factureForm, montantTVA: e.target.value })} />
              <input type="number" step="0.01" placeholder="Montant TTC *" required className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={factureForm.montantTTC} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFactureForm({ ...factureForm, montantTTC: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" placeholder="Date facture" className="rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={factureForm.dateFacture} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFactureForm({ ...factureForm, dateFacture: e.target.value })} />
                <input type="date" placeholder="Date échéance" className="rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={factureForm.dateEcheance} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFactureForm({ ...factureForm, dateEcheance: e.target.value })} />
              </div>
              <input placeholder="N° facture fournisseur" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={factureForm.numeroFactureFournisseur} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFactureForm({ ...factureForm, numeroFactureFournisseur: e.target.value })} />
              <textarea placeholder="Notes" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={factureForm.notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFactureForm({ ...factureForm, notes: e.target.value })} />
              <button type="submit" disabled={createFacture.isPending} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
                {createFacture.isPending ? "Création..." : "Créer la facture"}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowSupplierModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg rounded-2xl bg-background dark:bg-card p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground dark:text-foreground">Nouveau fournisseur</h2>
              <button onClick={() => setShowSupplierModal(false)} className="rounded-lg p-1.5 hover:bg-muted dark:hover:bg-muted"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createSupplier.mutate(supplierForm); }} className="space-y-4">
              <input placeholder="Nom du fournisseur *" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={supplierForm.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSupplierForm({ ...supplierForm, name: e.target.value })} required />
              <input placeholder="Nom du contact" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={supplierForm.contactName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSupplierForm({ ...supplierForm, contactName: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Téléphone" className="rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={supplierForm.phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSupplierForm({ ...supplierForm, phone: e.target.value })} />
                <input placeholder="Email" type="email" className="rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={supplierForm.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSupplierForm({ ...supplierForm, email: e.target.value })} />
              </div>
              <textarea placeholder="Adresse" rows={3} className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={supplierForm.address} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSupplierForm({ ...supplierForm, address: e.target.value })} />
              <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={supplierForm.paymentTerms} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSupplierForm({ ...supplierForm, paymentTerms: e.target.value })}>
                <option value="15 days">15 jours</option>
                <option value="30 days">30 jours</option>
                <option value="45 days">45 jours</option>
                <option value="60 days">60 jours</option>
              </select>
              <button type="submit" disabled={createSupplier.isPending} className="w-full rounded-lg bg-success py-2.5 text-sm font-semibold text-foreground hover:bg-success/80 disabled:opacity-50 transition-colors">
                {createSupplier.isPending ? "Création..." : "Créer le fournisseur"}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowOrderModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-5xl rounded-2xl bg-background dark:bg-card p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-foreground dark:text-foreground">{editId ? "Modifier le bon de commande" : "Nouveau bon de commande"}</h2>
                <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-0.5">Le brouillon sert de bon de commande interne, puis « Commander » l'envoie au fournisseur</p>
              </div>
              <button onClick={() => setShowOrderModal(false)} className="rounded-lg p-1.5 hover:bg-muted dark:hover:bg-muted"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (editId) {
                updateOrder.mutate({ id: editId, ...orderForm });
              } else {
                createOrder.mutate({ ...orderForm, statut: "brouillon" });
              }
            }} className="space-y-6">
              {/* Fournisseur + Livraison */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Fournisseur *</label>
                  <ComboBox
                    options={(suppliers ?? []).map(s => ({ value: s.id, label: s.name, sub: s.contactName || undefined }))}
                    value={orderForm.supplierId}
                    onChange={(v) => setOrderForm({ ...orderForm, supplierId: v })}
                    placeholder="Rechercher un fournisseur..."
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Livraison vers (point de vente)</label>
                  <ComboBox
                    options={(posList ?? []).map(p => ({ value: p.id, label: p.name }))}
                    value={orderForm.destinationPosId}
                    onChange={(v) => setOrderForm({ ...orderForm, destinationPosId: v })}
                    placeholder="Rechercher un point de vente..."
                  />
                </div>
              </div>

              {/* Demandeur + Commandeur */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Demandeur *</label>
                  <ComboBox
                    options={(members?.members ?? []).map(m => ({ value: String(m.id), label: `${m.prenom ?? ""} ${m.nom}`.trim() || m.email, sub: m.email }))}
                    value={orderForm.demandeurId}
                    onChange={(v) => {
                      const m = members?.members.find(x => String(x.id) === v);
                      setOrderForm({ ...orderForm, demandeurId: v, demandeur: m ? `${m.prenom ?? ""} ${m.nom}`.trim() || m.email : "" });
                    }}
                    placeholder="Rechercher un utilisateur..."
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Commandeur</label>
                  <div className="rounded-lg border border-border px-4 py-2.5 bg-muted/40 dark:bg-muted/40 text-sm text-muted-foreground">
                    {session?.user?.name ?? "Vous (compte connecté)"}
                  </div>
                </div>
              </div>

              {/* Priorité + dates + motif */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Priorité</label>
                  <select className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={orderForm.priorite} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOrderForm({ ...orderForm, priorite: e.target.value as "basse" | "normale" | "haute" })}>
                    <option value="basse">Priorité basse</option>
                    <option value="normale">Priorité normale</option>
                    <option value="haute">Priorité haute</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Date souhaitée (BC)</label>
                  <input type="date" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={orderForm.dateSouhaitee} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOrderForm({ ...orderForm, dateSouhaitee: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Livraison attendue</label>
                  <input type="date" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={orderForm.livraisonAttendue} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOrderForm({ ...orderForm, livraisonAttendue: e.target.value })} />
                </div>
              </div>
              <input type="text" placeholder="Motif (ex: réapprovisionnement, stock bas, commande spéciale...)" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={orderForm.motif} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOrderForm({ ...orderForm, motif: e.target.value })} />

              {/* Order Lines */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground/80 dark:text-foreground/80">Lignes de commande (produits du catalogue)</h3>
                  <button type="button" onClick={addOrderLine} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 dark:text-primary dark:hover:bg-primary/10 transition-colors">
                    <Plus size={14} /> Ajouter
                  </button>
                </div>
                {orderForm.lines.map((line: { productId: string; quantityOrdered: number; unitCost: number }, index: number) => (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-lg border border-border dark:border-border">
                    <div className="flex-1">
                      <ComboBox
                        options={(products?.items ?? []).map(p => ({ value: String(p.id), label: p.titre, sub: p.purchasePrice ? `Prix d'achat: ${Number(p.purchasePrice).toLocaleString()} F` : undefined }))}
                        value={line.productId}
                        onChange={(v) => {
                          const p = products?.items?.find(x => String(x.id) === v);
                          const newLines = [...orderForm.lines];
                          newLines[index] = {
                            ...newLines[index],
                            productId: v,
                            unitCost: p?.purchasePrice ? Number(p.purchasePrice) : newLines[index].unitCost
                          };
                          setOrderForm({ ...orderForm, lines: newLines });
                        }}
                        placeholder="Rechercher un produit..."
                      />
                    </div>
                    <input type="number" min="1" placeholder="Qté" className="w-20 rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={line.quantityOrdered} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateOrderLine(index, 'quantityOrdered', parseInt(e.target.value) || 1)} required />
                    <input type="number" min="0" step="0.01" placeholder="Coût unitaire" className="w-32 rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={line.unitCost} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateOrderLine(index, 'unitCost', parseFloat(e.target.value) || 0)} required />
                    <span className="w-24 text-sm font-mono text-muted-foreground dark:text-muted-foreground">{(line.quantityOrdered * line.unitCost).toLocaleString()} F</span>
                    <button type="button" onClick={() => removeOrderLine(index)} className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                ))}
                {orderForm.lines.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground dark:text-muted-foreground py-4">Aucune ligne ajoutée</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border dark:border-border">
                <div className="text-sm text-muted-foreground dark:text-muted-foreground">
                  Total: <span className="font-semibold font-mono">{orderForm.lines.reduce((sum: number, line: { quantityOrdered: number; unitCost: number }) => sum + (line.quantityOrdered * line.unitCost), 0).toLocaleString()} FCFA</span>
                </div>
                <button type="submit" disabled={(createOrder.isPending || updateOrder.isPending) || orderForm.lines.length === 0} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
                  {(createOrder.isPending || updateOrder.isPending) ? "Enregistrement..." : editId ? "Enregistrer les modifications" : "Créer le bon de commande"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Reception Modal */}
      {receiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setReceiveTarget(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-4xl rounded-2xl bg-background dark:bg-card p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-foreground dark:text-foreground">Réceptionner la commande</h2>
                <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-0.5">
                  {receiveOrderDetail?.reference} · {receiveOrderDetail?.fournisseurNom || "Fournisseur"}
                </p>
              </div>
              <button onClick={() => setReceiveTarget(null)} className="rounded-lg p-1.5 hover:bg-muted dark:hover:bg-muted"><X size={18} /></button>
            </div>

            <div className="rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/15 p-3 mb-4">
              <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                Ajustez les quantités reçues et les prix facturés (les prix de commande sont pré-remplis).
                Le prix du BC = votre prix d'achat fournisseur. Définissez la marge de revente : le prix de vente
                est recalculé automatiquement. Cochez <span className="font-semibold text-primary dark:text-primary">Appliquer au catalogue</span>
                pour mettre à jour tous les prix (achat, vente, min. vente, réglementé, max. rachat) avec traçabilité complète.
              </p>
            </div>

            <div className="space-y-2">
              {receiveLines.map((ligne, index) => (
                <div key={ligne.produitId} className="rounded-xl border border-border dark:border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground dark:text-foreground truncate">{ligne.titre}</p>
                      <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                        Commandé: <span className="font-mono">{ligne.quantiteCommandee}</span>
                        {ligne.typeProduit === "LIVRE" && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">Livre</span>}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 shrink-0 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={ligne.appliquerPrix}
                        onChange={(e) => {
                          const nl = [...receiveLines];
                          nl[index] = { ...nl[index], appliquerPrix: e.target.checked };
                          setReceiveLines(nl);
                        }}
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      <span className={`text-xs font-medium ${ligne.appliquerPrix ? "text-primary dark:text-primary" : "text-muted-foreground dark:text-muted-foreground"}`}>
                        Appliquer au catalogue
                      </span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Qté reçue</label>
                      <input
                        type="number" min="0"
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        value={ligne.quantiteRecue}
                        onChange={(e) => updateReceiveLine(index, "quantiteRecue", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Prix achat reçu (F)</label>
                      <input
                        type="number" min="0" step="0.01"
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        value={ligne.prixUnitaire}
                        onChange={(e) => updateReceiveLine(index, "prixUnitaire", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Marge revente (%)</label>
                      <input
                        type="number" min="0" max="500" step="1"
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        value={ligne.marge}
                        onChange={(e) => updateReceiveLine(index, "marge", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">Prix vente (F) <span className="text-success-foreground">TTC*</span></label>
                      <input
                        type="number" min="0" step="0.01"
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        value={ligne.prixVente}
                        onChange={(e) => updateReceiveLine(index, "prixVente", e.target.value)}
                      />
                    </div>
                  </div>
                  {ligne.quantiteRecue < ligne.quantiteCommandee && (
                    <div className="pt-1">
                      <label className="mb-1 block text-xs text-warning-foreground">Motif de l'écart (réception partielle) *</label>
                      <input
                        type="text"
                        placeholder="Ex : rupture fournisseur, produit endommagé…"
                        className="w-full rounded-lg border border-warning/40 px-3 py-2 text-sm dark:bg-muted dark:border-warning/30 dark:text-foreground outline-none focus:ring-2 focus:ring-warning/30"
                        value={ligne.motifEcart}
                        onChange={(e) => updateReceiveLine(index, "motifEcart", e.target.value)}
                      />
                    </div>
                  )}
                  {ligne.appliquerPrix && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Prix minimum vente (F)</label>
                        <input
                          type="number" min="0" step="0.01"
                          className="w-full rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                          value={ligne.prixMinimumVente}
                          onChange={(e) => updateReceiveLine(index, "prixMinimumVente", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">TVA (%)</label>
                        <input
                          type="number" min="0" max="100" step="0.5"
                          className="w-full rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                          value={ligne.tva}
                          onChange={(e) => updateReceiveLine(index, "tva", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Prix max rachat Bourse (F)</label>
                        <input
                          type="number" min="0" step="0.01"
                          className="w-full rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                          value={ligne.prixMaximumRachat}
                          onChange={(e) => updateReceiveLine(index, "prixMaximumRachat", e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                  {ligne.appliquerPrix && Number(ligne.tva) > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Prix HT estimé : <span className="font-mono">{Number(ligne.prixVente || 0).toLocaleString()} F</span> · TVA {ligne.tva}% · Prix TTC :
                      <span className="font-mono font-medium"> {Math.round((Number(ligne.prixVente || 0) * (1 + Number(ligne.tva) / 100))).toLocaleString()} F</span>
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Paiement à la réception */}
            <div className="mt-4 rounded-xl border border-border dark:border-border p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={receptionPay.actif}
                  onChange={(e) => {
                    const actif = e.target.checked;
                    setReceptionPay((p) => ({ ...p, actif, montant: actif ? String(totalRecu) : p.montant }));
                  }}
                  className="h-4 w-4 rounded border-border accent-success"
                />
                <span className={`text-sm font-medium ${receptionPay.actif ? "text-success-foreground" : "text-muted-foreground"}`}>
                  Payer à la réception ({totalRecu.toLocaleString()} F pour ce qui est reçu)
                </span>
              </label>
              {receptionPay.actif && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Montant (F)</label>
                    <input type="number" min="1" max={totalRecu} step="0.01"
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-success/30"
                      value={receptionPay.montant}
                      onChange={(e) => setReceptionPay({ ...receptionPay, montant: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Mode de paiement</label>
                    <select
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-success/30"
                      value={receptionPay.mode}
                      onChange={(e) => setReceptionPay({ ...receptionPay, mode: e.target.value })}>
                      <option value="especes">Espèces</option>
                      <option value="virement">Virement</option>
                      <option value="cheque">Chèque</option>
                      <option value="mobile_money">Mobile Money</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Caisse de débit</label>
                    <select
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-success/30"
                      value={receptionPay.caisseId}
                      onChange={(e) => setReceptionPay({ ...receptionPay, caisseId: e.target.value })}>
                      <option value="">Caisse ouverte (auto)</option>
                      {(caissesOuvertes?.caisses ?? []).map((c: { id: string; libelle: string }) => (
                        <option key={c.id} value={c.id}>{c.libelle}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Clôture du reliquat non reçu */}
            {receiveLines.some((l) => l.quantiteRecue < l.quantiteCommandee) && (
              <div className="mt-3 rounded-xl border border-destructive/30 dark:border-destructive/30 p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!motifReliquat}
                    onChange={(e) => setMotifReliquat(e.target.checked ? "Reliquat non reçu" : "")}
                    className="h-4 w-4 rounded border-border accent-destructive"
                  />
                  <span className="text-sm font-medium text-muted-foreground">Clôturer le dossier : abandonner le reliquat non reçu</span>
                </label>
                {motifReliquat && (
                  <input
                    type="text"
                    placeholder="Motif de clôture (obligatoire) *"
                    className="w-full rounded-lg border border-destructive/40 px-3 py-2 text-sm dark:bg-muted dark:text-foreground outline-none focus:ring-2 focus:ring-destructive/30"
                    value={motifReliquat}
                    onChange={(e) => setMotifReliquat(e.target.value)}
                  />
                )}
              </div>
            )}

            <div className="flex items-center justify-between mt-5 pt-4 border-t border-border dark:border-border">
              <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                {receiveLines.filter(l => l.appliquerPrix).length > 0
                  ? `${receiveLines.filter(l => l.appliquerPrix).length} ligne(s) avec ajustement de prix au catalogue`
                  : "Aucun ajustement de prix catalogue"}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setReceiveTarget(null)} className="rounded-lg px-5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted dark:hover:bg-muted transition-colors">
                  Annuler
                </button>
                <button
                  onClick={submitReceive}
                  disabled={receiveOrder.isPending || receiveLines.some(l => l.quantiteRecue <= 0) || receiveLines.some(l => l.quantiteRecue < l.quantiteCommandee && !l.motifEcart.trim())}
                  className="rounded-lg bg-success px-6 py-2.5 text-sm font-semibold text-foreground hover:bg-success/80 disabled:opacity-50 transition-colors"
                >
                  {receiveOrder.isPending ? "Réception en cours..." : "Confirmer la réception"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Dossier Modal (suivi BC : réceptions, écarts, paiements) */}
      {dossierId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setDossierId(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-4xl rounded-2xl bg-background dark:bg-card p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-foreground dark:text-foreground">Suivi du dossier — {dossier?.achat?.reference ?? dossierId}</h2>
                <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-0.5">
                  {dossier?.achat?.fournisseurNom ?? ""} · Statut : <span className="font-medium">{dossier?.achat?.statut ?? "…"}</span>
                  {dossier?.achat?.dateCloture ? ` · Clôturé le ${new Date(dossier.achat.dateCloture).toLocaleDateString("fr-FR")}` : ""}
                </p>
              </div>
              <button onClick={() => setDossierId(null)} className="rounded-lg p-1.5 hover:bg-muted dark:hover:bg-muted"><X size={18} /></button>
            </div>

            {dossierLoading && <p className="text-sm text-muted-foreground py-8 text-center">Chargement du dossier…</p>}
            {!dossierLoading && dossier && (
              <div className="space-y-5">
                {/* Totaux */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-border dark:border-border p-3">
                    <p className="text-[11px] text-muted-foreground uppercase">Montant BC</p>
                    <p className="text-lg font-bold font-mono">{dossier.totaux.montantBC.toLocaleString()} F</p>
                  </div>
                  <div className="rounded-xl border border-border dark:border-border p-3">
                    <p className="text-[11px] text-muted-foreground uppercase">Reçu</p>
                    <p className="text-lg font-bold font-mono text-success-foreground">{dossier.totaux.montantRecu.toLocaleString()} F</p>
                  </div>
                  <div className="rounded-xl border border-border dark:border-border p-3">
                    <p className="text-[11px] text-muted-foreground uppercase">Payé</p>
                    <p className="text-lg font-bold font-mono">{dossier.totaux.montantPaye.toLocaleString()} F</p>
                  </div>
                  <div className="rounded-xl border border-destructive/30 dark:border-destructive/30 p-3">
                    <p className="text-[11px] text-muted-foreground uppercase">Restant à payer</p>
                    <p className="text-lg font-bold font-mono text-destructive">{dossier.totaux.resteAPayer.toLocaleString()} F</p>
                  </div>
                </div>

                {/* Lignes du BC avec restant */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Lignes du BC</h3>
                  <div className="overflow-x-auto rounded-xl border border-border dark:border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 dark:bg-muted/30 text-xs text-muted-foreground uppercase">
                        <tr>
                          <th className="text-left px-3 py-2">Produit</th>
                          <th className="text-center px-3 py-2">Commandé</th>
                          <th className="text-center px-3 py-2">Reçu</th>
                          <th className="text-center px-3 py-2">Restant</th>
                          <th className="text-right px-3 py-2">Prix BC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {dossier.lignes.map((l: any) => (
                          <tr key={l.id}>
                            <td className="px-3 py-2 text-foreground">{l.titre ?? l.produitId}</td>
                            <td className="px-3 py-2 text-center">{l.quantite}</td>
                            <td className="px-3 py-2 text-center text-success-foreground">{l.quantiteRecue}</td>
                            <td className={`px-3 py-2 text-center ${l.resteARecevoir > 0 ? "text-warning-foreground font-medium" : "text-muted-foreground"}`}>{l.resteARecevoir}</td>
                            <td className="px-3 py-2 text-right font-mono">{Number(l.prixUnitaire ?? 0).toLocaleString()} F</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Réceptions */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Réceptions ({dossier.receptions.length})</h3>
                  {dossier.receptions.length === 0 && <p className="text-xs text-muted-foreground">Aucune réception.</p>}
                  <div className="space-y-2">
                    {dossier.receptions.map((br: any) => (
                      <div key={br.id} className="rounded-xl border border-border dark:border-border p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{br.reference}</p>
                          <p className="text-xs text-muted-foreground">{new Date(br.createdAt).toLocaleString("fr-FR")}</p>
                        </div>
                        <div className="mt-2 space-y-1">
                          {br.lignes.map((l: any) => (
                            <p key={l.id} className="text-xs text-muted-foreground flex justify-between">
                              <span>Produit #{l.produitId} · {l.quantiteRecue}/{l.quantiteCommandee} reçus · {Number(l.prixUnitaire ?? 0).toLocaleString()} F</span>
                              {l.motifEcart && <span className="text-warning-foreground ml-2">⚠ {l.motifEcart}</span>}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Écarts */}
                {dossier.ecarts.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Écarts documentés ({dossier.ecarts.length})</h3>
                    <div className="overflow-x-auto rounded-xl border border-destructive/30 dark:border-destructive/30">
                      <table className="w-full text-sm">
                        <thead className="bg-destructive/5 text-xs text-muted-foreground uppercase">
                          <tr>
                            <th className="text-left px-3 py-2">Produit</th>
                            <th className="text-center px-3 py-2">Type</th>
                            <th className="text-center px-3 py-2">Commandé</th>
                            <th className="text-center px-3 py-2">Reçu</th>
                            <th className="text-right px-3 py-2">Prix BC</th>
                            <th className="text-right px-3 py-2">Prix reçu</th>
                            <th className="text-left px-3 py-2">Motif</th>
                            <th className="text-left px-3 py-2">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {dossier.ecarts.map((e: any) => (
                            <tr key={e.id}>
                              <td className="px-3 py-2">#{e.produitId}</td>
                              <td className="px-3 py-2">
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${e.typeEcart === "QTE_INF" ? "bg-warning/10 text-warning-foreground" : e.typeEcart === "QTE_SUP" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                                  {e.typeEcart === "QTE_INF" ? "QTE <" : e.typeEcart === "QTE_SUP" ? "QTE >" : "PRIX ≠"}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">{e.quantiteCommandee}</td>
                              <td className="px-3 py-2 text-center">{e.quantiteRecue}</td>
                              <td className="px-3 py-2 text-right font-mono">{e.prixBC ? Number(e.prixBC).toLocaleString() : "—"}</td>
                              <td className="px-3 py-2 text-right font-mono">{e.prixRecu ? Number(e.prixRecu).toLocaleString() : "—"}</td>
                              <td className="px-3 py-2 text-xs">{e.motif ?? "—"}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleDateString("fr-FR")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Paiements */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Paiements ({dossier.paiements.length})</h3>
                  {dossier.paiements.length === 0 && <p className="text-xs text-muted-foreground">Aucun paiement enregistré.</p>}
                  <div className="space-y-2">
                    {dossier.paiements.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between rounded-xl border border-border dark:border-border p-3">
                        <div>
                          <p className="text-sm font-medium font-mono">{Number(p.montant).toLocaleString()} F</p>
                          <p className="text-xs text-muted-foreground">{p.modePaiement} · {p.reference ?? "—"} {p.notes ? `· ${p.notes}` : ""}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{new Date(p.effectueLe).toLocaleString("fr-FR")}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Clôture du reliquat */}
                {dossier.achat?.statut === "partiel" && hasPermission("achats.recevoir") && (
                  <div className="rounded-xl border border-destructive/30 dark:border-destructive/30 p-3 space-y-2">
                    <p className="text-sm font-medium text-foreground">Clôturer le dossier</p>
                    <p className="text-xs text-muted-foreground">Abandonne le reliquat non reçu : l'écart est documenté, la dette reste calculée sur ce qui a été reçu.</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Motif de clôture (obligatoire) *"
                        className="flex-1 rounded-lg border border-border px-3 py-2 text-sm dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-destructive/30"
                        value={clotureMotif}
                        onChange={(e) => setClotureMotif(e.target.value)}
                      />
                      <button
                        onClick={() => cloturerAchat.mutate({ achatId: dossierId!, motif: clotureMotif })}
                        disabled={cloturerAchat.isPending || clotureMotif.trim().length < 3}
                        className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/80 disabled:opacity-50 transition-colors shrink-0"
                      >
                        {cloturerAchat.isPending ? "Clôture..." : "Clôturer le reliquat"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Payment Modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setPayModal(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl bg-background dark:bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-foreground dark:text-foreground">Payer la dette</h2>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground">{payModal.fournisseurNom}</p>
              </div>
              <button onClick={() => setPayModal(null)} className="rounded-lg p-1.5 hover:bg-muted dark:hover:bg-muted"><X size={18} /></button>
            </div>
            <div className="mb-4 rounded-lg bg-muted/50 dark:bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground uppercase">Restant à payer</p>
              <p className="text-2xl font-bold font-mono text-destructive dark:text-destructive">{payModal.montantRestant.toLocaleString()} F</p>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              payerDette.mutate({
                detteId: payModal.detteId,
                montant: payForm.montant,
                modePaiement: payForm.modePaiement,
                reference: payForm.reference || undefined,
                notes: payForm.notes || undefined,
                caisseId: payForm.caisseId ? Number(payForm.caisseId) : undefined,
              });
            }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground mb-1">Montant à payer (F)</label>
                <input type="number" min="1" max={payModal.montantRestant} step="0.01" required
                  className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-success/30 focus:border-success"
                  value={payForm.montant}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPayForm({ ...payForm, montant: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground mb-1">Mode de paiement</label>
                <select
                  className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-success/30 focus:border-success"
                  value={payForm.modePaiement}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPayForm({ ...payForm, modePaiement: e.target.value })}>
                  <option value="especes">Espèces</option>
                  <option value="virement">Virement</option>
                  <option value="cheque">Chèque</option>
                  <option value="mobile_money">Mobile Money</option>
                </select>
              </div>
              <input placeholder="Référence (optionnel)" className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-success/30 focus:border-success" value={payForm.reference} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPayForm({ ...payForm, reference: e.target.value })} />
              <div>
                <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground mb-1">Caisse de débit</label>
                <select
                  className="w-full rounded-lg border border-border px-4 py-2.5 dark:bg-muted dark:border-border dark:text-foreground outline-none focus:ring-2 focus:ring-success/30 focus:border-success"
                  value={payForm.caisseId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPayForm({ ...payForm, caisseId: e.target.value })}>
                  <option value="">Caisse ouverte (automatique)</option>
                  {(caissesOuvertes?.caisses ?? []).map((c: { id: string; libelle: string; soldeActuel: string }) => (
                    <option key={c.id} value={c.id}>{c.libelle} — {Number(c.soldeActuel ?? 0).toLocaleString()} F</option>
                  ))}
                </select>
                {(!caissesOuvertes || caissesOuvertes.caisses.length === 0) && (
                  <p className="mt-1 text-xs text-warning">Aucune caisse ouverte : ouvrez une session en Caisse avant de payer.</p>
                )}
              </div>
              <button type="submit" disabled={payerDette.isPending || (caissesOuvertes?.caisses?.length ?? 0) === 0} className="w-full rounded-lg bg-success py-2.5 text-sm font-semibold text-foreground hover:bg-success/80 disabled:opacity-50 transition-colors">
                {payerDette.isPending ? "Traitement..." : "Confirmer le paiement"}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}