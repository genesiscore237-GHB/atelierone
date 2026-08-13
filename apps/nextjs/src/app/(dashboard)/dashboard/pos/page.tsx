"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "~/trpc/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart, Plus, Minus, Trash2, X,
  Search, User, UserPlus, Pause, RotateCcw,
  Tag, Percent, Printer, Barcode, AlertTriangle, Package, FileText, CheckCircle,
  LogIn, LogOut, DollarSign, Wallet, CreditCard, Smartphone, Lock,
  Receipt, Settings, Banknote
} from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "~/hooks/usePermissions";

interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  typeProduit: string;
  stock?: number;
  seuilAlerte?: number;
  prixMinimumVente?: number | null;
  uniteId?: string;
  uniteLabel?: string;
  facteurConversion?: number;
  unites?: { uniteId: string; libelle: string; facteurVersBase: number; prixVente: number | null; estUniteVenteDefaut: boolean; estUniteBase: boolean }[];
}

interface SuspendedCart {
  id: string;
  items: CartItem[];
  customerId?: string;
  customerName?: string;
  createdAt: string;
  total: number;
}

interface Customer {
  id: string;
  name: string;
  phone?: string;
}

export default function POSPage() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { barcodeInputRef.current?.focus(); }, []);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showSuspendedModal, setShowSuspendedModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [preInvoiceResult, setPreInvoiceResult] = useState<{ reference: string; total: number; lignes: { produitId: string; produitNom: string; quantite: number; prixUnitaire: number; total: number }[]; customerName?: string; operateurName?: string; agenceName?: string } | null>(null);
  const [showPreConfirm, setShowPreConfirm] = useState(false);
  const [undoState, setUndoState] = useState<{ item: CartItem; message: string } | null>(null);
  const [suspendedCarts, setSuspendedCarts] = useState<SuspendedCart[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const saved = JSON.parse(localStorage.getItem("pos_suspended_carts") ?? "[]");
      setSuspendedCarts(saved);
    }
  }, []);
  const undoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [lineDiscount, setLineDiscount] = useState<{ productId: string; percent: number } | null>(null);
  const [ticketDiscountPercent, setTicketDiscountPercent] = useState(0);

  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  // ── Session caisse ──
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionOpeningBalance, setSessionOpeningBalance] = useState(0);
  const [sessionClosingBalance, setSessionClosingBalance] = useState(0);
  const [sessionNotes, setSessionNotes] = useState("");
  const [selectedCaisseId, setSelectedCaisseId] = useState<string | null>(null);
  const { data: registers } = api.cash.listCaisseRegisters.useQuery();
  const { data: org } = api.settings.organization.get.useQuery();
  const orgInfo = {
    name: org?.nom ?? "LIBRAPAP",
    slogan: org?.slogan ?? "",
    address: org?.adresse ?? "",
    city: org?.ville ? [org.ville, org.pays].filter(Boolean).join(", ") : "Yaoundé, Cameroun",
    phone: org?.telephone ?? "+237 000 000 000",
    email: org?.email ?? "",
    logoUrl: org?.logoUrl ?? "",
    rc: org?.rcRccm ?? "XX-XXX-XXX",
    niu: org?.niu ?? "XXXXXXXX",
    ifu: org?.ifu ?? "",
    capital: org?.capital ?? "",
    devise: org?.devise ?? "XAF",
    tvaDefaut: org?.tvaDefaut ?? 0,
    mentionPiedTicket: org?.mentionPiedTicket ?? "",
  };
  const champsVisibles = (org?.champsVisibles ?? {}) as Record<string, boolean>;
  const deviseLabel = orgInfo.devise === "XAF" ? "FCFA" : orgInfo.devise;
  const adresseLigne = [orgInfo.address, orgInfo.city].filter(Boolean).join(", ");
  const legaux = [
    orgInfo.rc ? `RCCM: ${orgInfo.rc}` : "",
    orgInfo.niu ? `NIU: ${orgInfo.niu}` : "",
    orgInfo.ifu ? `IFU: ${orgInfo.ifu}` : "",
    orgInfo.capital ? `Capital: ${orgInfo.capital}` : "",
  ].filter(Boolean).join(" | ");
  useEffect(() => {
    const saved = localStorage.getItem("pos_selected_caisse");
    if (saved) setSelectedCaisseId(saved);
  }, []);
  const selectCaisse = (id: string | null) => {
    setSelectedCaisseId(id);
    if (id) localStorage.setItem("pos_selected_caisse", id);
    else localStorage.removeItem("pos_selected_caisse");
  };

  // ── Paiement ──
  const [showPayModal, setShowPayModal] = useState(false);
  const [payMode, setPayMode] = useState<"especes" | "mobile_money" | "carte" | "credit">("especes");
  const [montantRecu, setMontantRecu] = useState(0);
  const [payNotes, setPayNotes] = useState("");
  const [saleResult, setSaleResult] = useState<{ reference: string; total: number } | null>(null);

  // ── Recherche serveur ──
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");

  const utils = api.useUtils();
  const { hasPermission, user } = usePermissions();
  const canAccessCash = user?.role === "superadmin" || user?.role === "directeur";
  const { data: session } = api.pos.getOpenSession.useQuery({ caisseId: selectedCaisseId ?? undefined });
  const { data: products } = api.pos.listProductsWithStock.useQuery({ limit: 200 });
  const { data: customers } = api.customers.list.useQuery({ search: "" });
  const { data: preInvoices } = api.pos.searchPreInvoices.useQuery({ statut: "pre_facture", limit: 5 });
  const { data: preInvoiceCount } = api.pos.countPreInvoices.useQuery();
  const searchProductsQuery = api.pos.searchProducts.useQuery(
    { query: search, limit: 50 },
    { enabled: search.length >= 1 }
  );
  const customerSearch = api.pos.searchCustomers.useQuery(
    { query: customerSearchQuery, limit: 20 },
    { enabled: customerSearchQuery.length >= 1 }
  );
  const { data: suspendedSales } = api.pos.getSuspendedSales.useQuery();
  const createSale = api.pos.createSale.useMutation({
    onSuccess: (data) => {
      setSaleResult({ reference: data.reference, total: Number(data.totalAmount) });
      setCart([]);
      setSelectedCustomer(null);
      setTicketDiscountPercent(0);
      setShowPayModal(false);
      utils.pos.getSuspendedSales.invalidate();
      utils.pos.searchPreInvoices.invalidate();
      setTimeout(() => setSaleResult(null), 15000);
    },
    onError: (e) => toast.error(e.message),
  });
  const suspendSale = api.pos.suspendSale.useMutation({
    onSuccess: () => {
      utils.pos.getSuspendedSales.invalidate();
      clearCart();
    },
    onError: (e) => toast.error(e.message),
  });
  const openSessionMut = api.pos.openSession.useMutation({
    onSuccess: () => {
      utils.pos.getOpenSession.invalidate();
      utils.cash.listCaisseRegisters.invalidate();
      setShowSessionModal(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const closeSessionMut = api.pos.closeSession.useMutation({
    onSuccess: (data: any) => {
      utils.pos.getOpenSession.invalidate();
      utils.cash.listCaisseRegisters.invalidate();
      setShowSessionModal(false);
      if (data?.ecart != null) {
        const ecart = Number(data.ecart);
        if (ecart !== 0) toast.info(`Écart de fermeture enregistré: ${ecart.toLocaleString()} F`);
        else toast.success("Fermeture sans écart.");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const createPreInvoice = api.pos.createPreInvoice.useMutation({
    onSuccess: (data) => {
      setShowPreConfirm(false);
      const allProducts = searchProductsQuery.data ?? (products as any[]) ?? [];
      const lignes = ((data as any).lignes as any[] ?? []).map((l: any) => {
        const p = allProducts.find((x: any) => x.id === l.produitId);
        return { ...l, produitNom: p?.name ?? p?.titre ?? l.produitId.substring(0, 8) };
      });
      setPreInvoiceResult({
        reference: data.reference,
        total: Number(data.montantTotal),
        lignes,
        customerName: selectedCustomer?.name,
        operateurName: (data as any).operateurName,
        agenceName: (data as any).agenceName,
      });
      setCart([]);
      setSelectedCustomer(null);
      setTicketDiscountPercent(0);
      utils.pos.searchPreInvoices.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const createCustomer = api.customers.create.useMutation({
    onSuccess: (data) => {
      utils.customers.list.invalidate();
      if (data) setSelectedCustomer({ id: data.id, name: data.name, phone: data.phone ?? undefined });
      setShowCustomerModal(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
    },
    onError: (e) => toast.error(e.message),
  });

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const pmvViolations = cart.filter(
    (item) => item.prixMinimumVente != null && item.prixMinimumVente > 0 && item.unitPrice < item.prixMinimumVente
  );
  const lineDiscountsTotal = cart.reduce((sum, item) => {
    const s = item.unitPrice * item.quantity;
    return sum + (item.discountPercent > 0 ? s * (item.discountPercent / 100) : 0);
  }, 0);
  const ticketDiscountAmount = ticketDiscountPercent > 0
    ? (subtotal - lineDiscountsTotal) * (ticketDiscountPercent / 100) : 0;
  const total = subtotal - lineDiscountsTotal - ticketDiscountAmount;
  const articleCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const addToCart = useCallback((product: { id: string; name: string; defaultPrice: number; typeProduit: string; prixMinimumVente?: number | null; unites?: CartItem["unites"] }) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      const units = product.unites ?? [];
      const def = units.find((u: any) => u.estUniteVenteDefaut || u.estUniteBase) ?? units[0];
      const price = def?.prixVente ?? product.defaultPrice;
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: price,
        discountPercent: 0,
        typeProduit: product.typeProduit,
        prixMinimumVente: product.prixMinimumVente ?? null,
        unites: units,
        uniteId: def?.uniteId,
        uniteLabel: def?.libelle,
        facteurConversion: def?.facteurVersBase ?? 1,
      }];
    });
  }, []);

  const updateUnite = useCallback((productId: string, uniteId: string) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;
        const u = item.unites?.find((x: any) => x.uniteId === uniteId);
        if (!u) return item;
        return {
          ...item,
          uniteId: u.uniteId,
          uniteLabel: u.libelle,
          facteurConversion: u.facteurVersBase ?? 1,
          unitPrice: u.prixVente ?? item.unitPrice,
        };
      })
    );
  }, []);

  const updateUnitPrice = useCallback((productId: string, value: string) => {
    const stripped = value.replace(/[^0-9]/g, "");
    if (!stripped) return;
    const num = Number(stripped);
    if (isNaN(num) || num < 0) return;
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, unitPrice: num } : item
      )
    );
  }, []);

  const updateQuantity = useCallback((productId: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean) as CartItem[]
    );
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    if (undoTimeout.current) clearTimeout(undoTimeout.current);
    setCart((prev) => {
      const removed = prev.find((item) => item.productId === productId);
      if (removed) {
        setUndoState({ item: removed, message: `${removed.productName} retiré` });
        undoTimeout.current = setTimeout(() => setUndoState(null), 5000);
      }
      return prev.filter((item) => item.productId !== productId);
    });
  }, []);

  const undoRemove = useCallback((item: CartItem) => {
    setCart((prev) => [...prev, item]);
    setUndoState(null);
    if (undoTimeout.current) clearTimeout(undoTimeout.current);
  }, []);

  const setLineDiscountForProduct = useCallback((productId: string, percent: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, discountPercent: Math.min(percent, 100) } : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setSelectedCustomer(null);
    setTicketDiscountPercent(0);
  }, []);

  const suspendCart = useCallback(() => {
    if (cart.length === 0) return;
    suspendSale.mutate({
      clientId: selectedCustomer?.id,
      lignes: cart.map((item) => ({
        produitId: item.productId,
        quantite: item.quantity,
        prixUnitaire: item.unitPrice,
      })),
    });
    const suspended: SuspendedCart = {
      id: `cart_${Date.now()}`,
      items: [...cart],
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      createdAt: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      total,
    };
    const updated = [...suspendedCarts, suspended];
    setSuspendedCarts(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("pos_suspended_carts", JSON.stringify(updated));
    }
    clearCart();
  }, [cart, selectedCustomer, total, suspendedCarts, suspendSale, clearCart]);

  const removeSuspendedCart = useCallback((id: string) => {
    const updated = suspendedCarts.filter((c) => c.id !== id);
    setSuspendedCarts(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("pos_suspended_carts", JSON.stringify(updated));
    }
  }, [suspendedCarts]);

  const resumeCart = useCallback((suspended: SuspendedCart) => {
    setCart(suspended.items);
    if (suspended.customerId && customers) {
      const c = (customers as any[]).find((c: any) => c.id === suspended.customerId);
      if (c) setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone ?? undefined });
    }
    const updated = suspendedCarts.filter((c) => c.id !== suspended.id);
    setSuspendedCarts(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("pos_suspended_carts", JSON.stringify(updated));
    }
    setShowSuspendedModal(false);
  }, [customers, suspendedCarts]);

  const resumeServerSale = useCallback(async (venteId: string) => {
    try {
      const data = await utils.pos.resumeSale.fetch({ venteId });
      setCart(data.lignes.map(l => ({
        productId: l.productId,
        productName: "",
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: 0,
        typeProduit: "FOURNITURE",
      })));
      if (data.vente.clientId && customers) {
        const c = (customers as any[]).find((c: any) => c.id === data.vente.clientId);
        if (c) setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone ?? undefined });
      }
      setShowSuspendedModal(false);
    } catch { toast.error("Erreur lors de la reprise de la vente"); }
  }, [customers, utils]);

  const handleBarcodeSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (barcodeInput.trim()) {
      if (searchProductsQuery.data) {
        const found = searchProductsQuery.data.find(
          (p: any) => p.sku === barcodeInput || p.isbn === barcodeInput || p.codeBarre === barcodeInput
        );
        if (found) {
          addToCart({ id: found.id, name: found.name, defaultPrice: Number(found.defaultPrice ?? 0), typeProduit: found.typeProduit ?? "FOURNITURE", prixMinimumVente: found.prixMinimumVente ?? null, unites: found.unites });
          setBarcodeInput("");
          return;
        }
      }
      if (products) {
        const found = (products as any[]).find(
          (p: any) => p.sku === barcodeInput || p.isbn === barcodeInput || p.codeBarre === barcodeInput
        );
        if (found) {
          addToCart({ id: found.id, name: found.name, defaultPrice: Number(found.defaultPrice ?? 0), typeProduit: found.typeProduit ?? "FOURNITURE", prixMinimumVente: found.prixMinimumVente ?? null, unites: found.unites });
          setBarcodeInput("");
          return;
        }
      }
      toast.error("Produit non trouvé");
    }
  }, [barcodeInput, products, searchProductsQuery.data, addToCart]);

  const isSearching = search.length >= 1;
  const searchItems = isSearching && searchProductsQuery.data
    ? searchProductsQuery.data
    : (products as any[]) ?? [];

  const produitsFiltres = isSearching && searchProductsQuery.data
    ? (searchProductsQuery.data as any[])
      .reduce((acc: any[], p: any) => {
        if (!acc.find((x: any) => x.id === p.id)) acc.push(p);
        return acc;
      }, []).slice(0, 50)
    : !search
      ? (searchItems as any[]).slice(0, 30)
      : (searchItems as any[])
        .filter((p: any) =>
          p.name?.toLowerCase().includes(search.toLowerCase()) ||
          p.sku?.toLowerCase().includes(search.toLowerCase()) ||
          p.isbn?.toLowerCase().includes(search.toLowerCase()) ||
          p.author?.toLowerCase().includes(search.toLowerCase())
        )
        .reduce((acc: any[], p: any) => {
          if (!acc.find((x: any) => x.id === p.id)) acc.push(p);
          return acc;
        }, [])
        .slice(0, 30) ?? [];

  const inStock = (id: string) => {
    const p = (products as any[])?.find((p: any) => p.id === id);
    return Number(p?.stock ?? 0);
  };

  const renderProductCard = (p: any, onAdd: () => void) => {
    const stock = Number(p.stock ?? 0);
    const enRupture = stock <= 0;
    const stockFaible = stock > 0 && stock < (p.seuilAlerte ?? 5);
    const pmv = Number(p.prixMinimumVente ?? 0);
    return (
      <motion.button
        key={p.id}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => {
          if (enRupture) {
            toast.error("Impossible d'ajouter un article en rupture");
            return;
          }
          addToCart({ id: p.id, name: p.name, defaultPrice: Number(p.defaultPrice ?? p.prixVente ?? 0), typeProduit: p.typeProduit ?? "FOURNITURE", prixMinimumVente: pmv > 0 ? pmv : null, unites: p.unites });
          onAdd();
        }}
        disabled={enRupture}
        className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
          enRupture ? "border-destructive/20 bg-destructive/10" :
          stockFaible ? "border-warning/20 bg-warning/10" :
          "border-border bg-background hover:border-primary/30"
        }`}
      >
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
          enRupture ? "bg-destructive/10 text-destructive" :
          stockFaible ? "bg-warning/20 text-warning-foreground" :
          "bg-primary/10 text-primary"
        }`}>
          <Package size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
          <p className="text-xs text-muted-foreground truncate">{p.author ? `${p.author} · ` : ""}{p.sku ?? ""}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-primary">{Number(p.defaultPrice ?? p.prixVente ?? 0).toLocaleString()} F</p>
          {pmv > 0 && (
            <p className="text-xs text-destructive">PMV : {pmv.toLocaleString()} F</p>
          )}
          {enRupture ? (
            <span className="text-xs font-semibold text-destructive">RUPTURE</span>
          ) : stockFaible ? (
            <span className="text-xs font-semibold text-warning-foreground">{stock} unité{stock > 1 ? "s" : ""}</span>
          ) : (
            <span className="text-xs text-muted-foreground">Stock: {stock}</span>
          )}
        </div>
      </motion.button>
    );
  };

  const monnaie = payMode === "especes" && montantRecu >= total ? montantRecu - total : 0;

  const handleGeneratePreInvoice = useCallback(() => {
    if (cart.length === 0) return;
    setShowPreConfirm(true);
  }, [cart.length]);

  const confirmGeneratePreInvoice = useCallback(() => {
    if (cart.length === 0) return;
    createPreInvoice.mutate({
      clientId: selectedCustomer?.id,
      lignes: cart.map((item) => ({
        produitId: item.productId,
        quantite: item.quantity,
        prixUnitaire: item.unitPrice,
        uniteId: item.uniteId,
        facteurConversion: item.facteurConversion ?? 1,
      })),
      remise: ticketDiscountPercent > 0 ? total * (ticketDiscountPercent / 100) : 0,
      caisseId: selectedCaisseId ?? undefined,
    });
  }, [cart, selectedCustomer, ticketDiscountPercent, total, createPreInvoice, selectedCaisseId]);

  const handlePay = useCallback(() => {
    if (cart.length === 0) return;
    if (!session) { toast.error("Veuillez d'abord ouvrir une session de caisse (F10)"); return; }
    const remiseVal = ticketDiscountPercent > 0 ? total * (ticketDiscountPercent / 100) : 0;
    createSale.mutate({
      customerId: selectedCustomer?.id,
      clientId: selectedCustomer?.id,
      modePaiement: payMode,
      lignes: cart.map((item) => ({
        produitId: item.productId,
        quantite: item.quantity,
        prixUnitaire: Math.round(item.unitPrice * (1 - item.discountPercent / 100)),
        uniteId: item.uniteId,
        facteurConversion: item.facteurConversion ?? 1,
      })),
      remise: Math.round(remiseVal + lineDiscountsTotal),
      montantPaye: payMode === "especes" && montantRecu > 0 ? montantRecu : undefined,
      notes: payNotes || undefined,
      caisseId: selectedCaisseId ?? undefined,
    });
  }, [cart, selectedCustomer, ticketDiscountPercent, total, session, payMode, montantRecu, payNotes, lineDiscountsTotal, createSale, selectedCaisseId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
          searchInputRef.current?.focus();
        }
        return;
      }
      switch (e.key) {
        case "F2": e.preventDefault(); searchInputRef.current?.focus(); break;
        case "F3": e.preventDefault(); barcodeInputRef.current?.focus(); break;
        case "F4": e.preventDefault(); suspendCart(); break;
        case "F5": e.preventDefault(); if (cart.length > 0) setShowClearConfirm(true); break;
        case "F6": e.preventDefault(); setShowDiscountModal(true); break;
        case "F8": e.preventDefault(); if (cart.length > 0) handleGeneratePreInvoice(); break;
        case "F9": e.preventDefault(); if (cart.length > 0 && canAccessCash) setShowPayModal(true); break;
        case "F10": e.preventDefault(); setShowSessionModal(true); break;
        case "Escape": e.preventDefault(); setShowSuspendedModal(false); setShowDiscountModal(false); setShowCustomerModal(false); setShowPayModal(false); setShowSessionModal(false); setShowPreConfirm(false); break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart.length, suspendCart, handleGeneratePreInvoice, handlePay, canAccessCash]);

  return (
    <>
    <style>{`
      @media print {
        @page { margin: 0; size: 80mm auto; }
        body * { visibility: hidden; }
        #print-receipt, #print-receipt * { visibility: visible; }
        #print-receipt { display: block !important; position: absolute; top: 0; left: 0; width: 80mm; padding: 8px 12px; font-family: 'Courier New', 'Lucida Console', monospace; font-size: 11px; line-height: 1.3; }
        #print-receipt h1 { font-size: 16px; text-align: center; margin-bottom: 2px; letter-spacing: 2px; }
        #print-receipt .ref { text-align: center; font-size: 14px; font-weight: bold; margin-bottom: 8px; }
        #print-receipt .sep { border-top: 1px dashed #000; margin: 6px 0; }
        #print-receipt table { width: 100%; border-collapse: collapse; }
        #print-receipt td { padding: 1px 2px; font-size: 10px; }
        #print-receipt .total { font-weight: bold; font-size: 13px; text-align: right; margin-top: 6px; }
        #print-receipt .footer { text-align: center; font-size: 9px; margin-top: 12px; color: #000; }
      }
      #print-receipt { display: none; }
    `}</style>
    <div className="flex flex-col lg:flex-row gap-4 lg:h-[calc(100vh-8rem)]">
      <div className="flex-1 flex flex-col">
        <div className="mb-2 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(registers?.length ?? 0) > 1 && (
                <select
                  value={selectedCaisseId ?? ""}
                  onChange={(e) => selectCaisse(e.target.value || null)}
                  className="inline-flex items-center rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground outline-none hover:bg-accent transition-colors"
                  title="Caisse active"
                >
                  <option value="">Caisse par défaut</option>
                  {registers?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.libelle}{r.session ? ` · ouverte (${Number(r.session.soldeActuel ?? 0).toLocaleString()} F)` : " · fermée"}
                    </option>
                  ))}
                </select>
              )}
              {session ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-success/10 border border-success/20 px-3 py-1 text-xs font-medium text-success-foreground">
                  <Wallet size={12} /> Caisse ouverte · {Number(session.soldeActuel ?? 0).toLocaleString()} F
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-1 text-xs font-medium text-destructive">
                  <LogOut size={12} /> Caisse fermée
                </span>
              )}
              {(session ? hasPermission("caisse.fermer") : hasPermission("caisse.ouvrir")) && (
                <button onClick={() => setShowSessionModal(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
                  {session ? <LogOut size={12} /> : <LogIn size={12} />}
                  {session ? "Fermer (F10)" : "Ouvrir (F10)"}
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                ref={searchInputRef}
                placeholder="Rechercher un produit (F2)..."
                className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search.length >= 1 && (
                <div className="absolute left-0 right-0 z-10 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border border-border bg-background p-1.5 shadow-xl space-y-1">
                  {produitsFiltres.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      {searchProductsQuery.isFetching ? "Recherche en cours..." : "Aucun produit trouvé"}
                    </p>
                  ) : (
                    produitsFiltres.map((p: any) => renderProductCard(p, () => { setSearch(""); searchInputRef.current?.focus(); }))
                  )}
                </div>
              )}
            </div>
            <form onSubmit={handleBarcodeSubmit} className="relative">
              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                ref={barcodeInputRef}
                placeholder="Code-barres..."
                className="w-48 rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
              />
            </form>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSuspendedModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <Pause size={12} /> Paniers suspendus ({suspendedCarts.length})
            </button>
            {cart.length > 0 && (
              <>
                <button onClick={suspendCart} className="inline-flex items-center gap-1.5 rounded-lg border border-warning/20 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning-foreground hover:bg-warning/20 transition-colors">
                  <Pause size={12} /> Suspendre (F4)
                </button>
                <button onClick={() => setShowClearConfirm(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors">
                  <RotateCcw size={12} /> Vider (F5)
                </button>
              </>
            )}
          </div>
          {preInvoiceCount && preInvoiceCount.count > 0 && canAccessCash && (
            <div className="rounded-lg border border-warning/20 bg-warning/10 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-warning-foreground">
                  {preInvoiceCount.count} pré-facture{preInvoiceCount.count > 1 ? "s" : ""} en attente de paiement
                </span>
                <a href="/dashboard/cash" className="text-xs font-medium text-warning-foreground underline hover:text-warning-foreground">
                  Aller à la caisse →
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {!search && produitsFiltres.map((p: any) => renderProductCard(p, () => {}))}
        </div>
      </div>

      <div className="w-full lg:w-96 lg:shrink-0 flex flex-col">
        <div className="rounded-xl border border-border bg-background flex flex-col max-h-[55vh] lg:max-h-none lg:h-full">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} className="text-primary" />
              <span className="text-sm font-bold text-foreground">Panier</span>
              <span className="text-xs text-muted-foreground">({articleCount} art.)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCustomerModal(true)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  selectedCustomer ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                <User size={12} />
                {selectedCustomer ? selectedCustomer.name : "Client"}
              </button>
              <button
                onClick={() => setShowDiscountModal(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                <Tag size={12} /> -%
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <ShoppingCart size={40} className="mb-2" />
                <p className="text-sm">Panier vide</p>
                <p className="text-xs">Scannez ou recherchez des articles</p>
              </div>
            ) : (
              cart.map((item, index) => {
                const stock = inStock(item.productId);
                const belowPmv = item.prixMinimumVente != null && item.prixMinimumVente > 0 && item.unitPrice < item.prixMinimumVente;
                return (
                  <motion.div
                    key={`${item.productId}-${index}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`rounded-lg border p-3 ${belowPmv ? "border-destructive/50 bg-destructive/5" : "border-border"}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-foreground truncate flex-1">{item.productName}</p>
                      <button onClick={() => removeFromCart(item.productId)} className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {item.unites && item.unites.length > 1 && (
                      <div className="mb-1.5">
                        <select
                          value={item.uniteId ?? ""}
                          onChange={(e) => updateUnite(item.productId, e.target.value)}
                          className="w-full rounded-md border border-border bg-muted px-1.5 py-1 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          {item.unites.map((u: any) => (
                            <option key={u.uniteId} value={u.uniteId}>
                              {u.libelle} {u.facteurVersBase !== 1 ? `(×${u.facteurVersBase})` : ""} - {(u.prixVente ?? item.unitPrice).toLocaleString()} F
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQuantity(item.productId, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground hover:bg-accent transition-colors"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center text-sm font-mono font-bold text-foreground">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.productId, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground hover:bg-accent transition-colors"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      {item.typeProduit === "MANUEL" ? (
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary">{(item.unitPrice * item.quantity).toLocaleString()} F</p>
                          <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                            <Lock size={10} /> Prix fixe
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <input
                              value={item.unitPrice}
                              onChange={(e) => updateUnitPrice(item.productId, e.target.value)}
                              onBlur={(e) => { if (!e.target.value.replace(/[^0-9]/g, "")) updateUnitPrice(item.productId, String(item.unitPrice)); }}
                              inputMode="numeric"
                              className={`w-24 rounded-md border ${belowPmv ? "border-destructive bg-destructive/10" : "border-border bg-muted"} px-1.5 py-0.5 text-right text-sm font-mono font-bold text-primary outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary`}
                            />
                            {item.prixMinimumVente != null && item.prixMinimumVente > 0 && (
                              <p className={`text-xs ${belowPmv ? "text-destructive font-semibold" : "text-destructive/70"}`}>
                                PMV : {item.prixMinimumVente.toLocaleString()} F
                              </p>
                            )}
                            <p className={`text-xs ${belowPmv ? "text-destructive font-semibold" : "text-muted-foreground"}`}>={(item.unitPrice * item.quantity).toLocaleString()} F</p>
                          </div>
                          {item.discountPercent > 0 && (
                            <p className="text-xs text-destructive">-{item.discountPercent}%</p>
                          )}
                        </div>
                      )}
                    </div>
                    {item.quantity > stock && stock > 0 && (
                      <p className="text-xs text-warning-foreground mt-1">⚠ Stock disponible: {stock}</p>
                    )}
                    {stock <= 0 && (
                      <p className="text-xs text-destructive mt-1">⚠ RUPTURE</p>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>

          <div className="border-t border-border p-4 space-y-3">
            {lineDiscountsTotal > 0 && (
              <div className="flex justify-between text-xs text-destructive">
                <span>Remises lignes</span>
                <span>-{lineDiscountsTotal.toLocaleString()} F</span>
              </div>
            )}
            {ticketDiscountAmount > 0 && (
              <div className="flex justify-between text-xs text-destructive">
                <span>Remise ticket ({ticketDiscountPercent}%)</span>
                <span>-{ticketDiscountAmount.toLocaleString()} F</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-foreground">Total</span>
              <span className="text-lg font-bold text-primary">{total.toLocaleString()} F</span>
            </div>
            <button
              onClick={handleGeneratePreInvoice}
              disabled={cart.length === 0 || createPreInvoice.isPending}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary py-3 text-sm font-semibold text-foreground hover:from-primary/80 hover:to-primary/80 disabled:opacity-50 transition-all shadow-lg"
            >
              <FileText size={18} />
              {createPreInvoice.isPending ? "Génération..." : "Pré-facture (F8)"}
            </button>
            <button
              onClick={() => {
                if (!session) { toast.error("Ouvrez d'abord la caisse (F10)"); return; }
                if (cart.length === 0) return;
                setMontantRecu(total);
                setPayNotes("");
                setShowPayModal(true);
              }}
              disabled={!canAccessCash || cart.length === 0}
              className={`w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-success to-success py-3 text-sm font-semibold text-foreground hover:from-success/80 hover:to-success/80 disabled:opacity-50 transition-all shadow-lg ${canAccessCash ? "" : "hidden"}`}
            >
              <DollarSign size={18} />
              Paiement (F9)
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSuspendedModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowSuspendedModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-foreground">Paniers suspendus</h2>
                <button onClick={() => setShowSuspendedModal(false)} className="rounded-lg p-1.5 hover:bg-accent"><X size={18} /></button>
              </div>
              {suspendedCarts.length === 0 && (!suspendedSales || suspendedSales.length === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun panier suspendu</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {suspendedSales?.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/10 p-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{s.reference}</p>
                        <p className="text-xs text-muted-foreground">{s.totalAmount.toLocaleString()} F · {new Date(s.createdAt).toLocaleString("fr-FR")}</p>
                      </div>
                      <button onClick={() => resumeServerSale(s.id)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/90 transition-colors">
                        Reprendre
                      </button>
                    </div>
                  ))}
                  {suspendedCarts.map((sc) => (
                    <div key={sc.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{sc.customerName ?? "Client Divers"}</p>
                        <p className="text-xs text-muted-foreground">{sc.items.length} articles · {sc.createdAt}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-primary">{sc.total.toLocaleString()} F</p>
                        <button onClick={() => resumeCart(sc)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/90 transition-colors">
                          Reprendre
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}

        {showCustomerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowCustomerModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-foreground">Sélectionner un client</h2>
                <button onClick={() => setShowCustomerModal(false)} className="rounded-lg p-1.5 hover:bg-accent"><X size={18} /></button>
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  placeholder="Rechercher un client..."
                  className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                />
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
                <button onClick={() => { setSelectedCustomer(null); setShowCustomerModal(false); }} className={`w-full text-left rounded-lg border p-3 ${!selectedCustomer ? "border-primary/30 bg-primary/10" : "border-border hover:bg-accent"}`}>
                  <p className="text-sm font-medium text-foreground">Client Divers</p>
                  <p className="text-xs text-muted-foreground">Client par défaut</p>
                </button>
                {(customerSearchQuery.length >= 1 && customerSearch.data ? customerSearch.data : customers)?.map((c: any) => (
                  <button key={c.id} onClick={() => { setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone }); setShowCustomerModal(false); }} className={`w-full text-left rounded-lg border p-3 ${selectedCustomer?.id === c.id ? "border-primary/30 bg-primary/10" : "border-border hover:bg-accent"}`}>
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.phone ?? "Pas de téléphone"}</p>
                  </button>
                ))}
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Nouveau client</p>
                <div className="flex gap-2">
                  <input placeholder="Nom" className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
                  <input placeholder="Téléphone" className="w-32 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
                  <button
                    onClick={() => { if (newCustomerName.trim()) createCustomer.mutate({ name: newCustomerName.trim(), phone: newCustomerPhone.trim() }); }}
                    disabled={createCustomer.isPending || !newCustomerName.trim()}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    <UserPlus size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showDiscountModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowDiscountModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-foreground">Remises</h2>
                <button onClick={() => setShowDiscountModal(false)} className="rounded-lg p-1.5 hover:bg-accent"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Remise par ligne</label>
                  {cart.map((item) => (
                    <div key={item.productId} className="flex items-center justify-between py-1.5">
                      <span className="text-sm text-foreground/80 truncate flex-1">{item.productName}</span>
                      <input
                        type="number" min={0} max={100}
                        className="w-16 rounded-lg border border-border px-2 py-1 text-sm text-right outline-none"
                        value={item.discountPercent}
                        onChange={(e) => setLineDiscountForProduct(item.productId, Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                      />
                      <span className="text-xs text-muted-foreground ml-1">%</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border pt-4">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Remise globale sur le ticket</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={0} max={100}
                      className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none"
                      value={ticketDiscountPercent}
                      onChange={(e) => setTicketDiscountPercent(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showPreConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowPreConfirm(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-foreground">Confirmer la pré-facture</h2>
                <button onClick={() => setShowPreConfirm(false)} className="rounded-lg p-1.5 hover:bg-accent"><X size={18} /></button>
              </div>
              <div className="border-t border-border pt-3 mb-3 max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left py-1">Article</th>
                      <th className="text-right py-1">Qté</th>
                      <th className="text-right py-1">PU</th>
                      <th className="text-right py-1">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="py-1 text-foreground/80 truncate max-w-[140px]">{item.productName}</td>
                        <td className="py-1 text-right text-foreground/80">{item.quantity}</td>
                        <td className="py-1 text-right text-foreground/80">{item.unitPrice.toLocaleString()}</td>
                        <td className="py-1 text-right font-medium text-foreground">{(item.unitPrice * item.quantity).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pmvViolations.length > 0 && (
                <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <p className="text-xs font-semibold text-destructive flex items-center gap-1 mb-1">
                    <AlertTriangle size={12} /> Prix en dessous du prix minimum de vente (PMV)
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {pmvViolations.map((v) => (
                      <li key={v.productId} className="text-xs text-destructive">
                        {v.productName} : {v.unitPrice.toLocaleString()} F (PMV {v.prixMinimumVente?.toLocaleString()} F)
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-destructive mt-1">Génération bloquée. Corrigez le prix ou retirez l'article.</p>
                </div>
              )}
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-bold text-foreground">Total</span>
                <span className="text-lg font-bold text-primary">{total.toLocaleString()} F</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={confirmGeneratePreInvoice}
                  disabled={createPreInvoice.isPending || pmvViolations.length > 0}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary py-2.5 text-sm font-semibold text-foreground hover:from-primary/80 hover:to-primary/80 disabled:opacity-50 transition-all shadow-lg"
                >
                  <FileText size={16} />
                  {createPreInvoice.isPending ? "Génération..." : "Valider la pré-facture"}
                </button>
                <button
                  onClick={() => { setShowPreConfirm(false); setSearch(""); setTimeout(() => searchInputRef.current?.focus(), 50); }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground hover:bg-accent transition-colors"
                >
                  <Search size={14} /> Ajouter des produits
                </button>
                <button
                  onClick={() => setShowPreConfirm(false)}
                  className="w-full rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowClearConfirm(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-foreground mb-2">Vider le panier ?</h2>
              <p className="text-sm text-muted-foreground mb-4">Cette action supprimera tous les articles du panier.</p>
              <div className="flex gap-2">
                <button onClick={() => setShowClearConfirm(false)} className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors">Annuler</button>
                <button onClick={() => { clearCart(); setShowClearConfirm(false); }} className="flex-1 rounded-lg bg-destructive py-2 text-sm font-medium text-foreground hover:bg-destructive/90 transition-colors">Vider</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {undoState && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl bg-background px-4 py-3 shadow-xl"
          >
            <p className="text-sm text-foreground">{undoState.message}</p>
            <button onClick={() => undoRemove(undoState.item)} className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors">Annuler</button>
          </motion.div>
        )}
      </AnimatePresence>

      {preInvoiceResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"
          onClick={() => setPreInvoiceResult(null)}
        >
          <div className="w-full max-w-md rounded-2xl bg-background p-8 shadow-modal" onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle size={32} className="text-success-foreground" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2 text-center">Pré-facture générée</h2>
              <p className="text-sm text-muted-foreground mb-1 text-center">Référence</p>
              <p className="text-2xl font-bold font-mono text-primary mb-3 text-center">{preInvoiceResult.reference}</p>
              <div className="flex justify-between text-xs text-muted-foreground mb-2 px-1">
                <span>Client: {preInvoiceResult.customerName ?? "Divers"}</span>
                <span>Par: {preInvoiceResult.operateurName ?? "—"}</span>
              </div>
              {preInvoiceResult.lignes.length > 0 && (
                <div className="border-t border-border pt-3 mb-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left py-1">Article</th>
                        <th className="text-right py-1">Qté</th>
                        <th className="text-right py-1">PU</th>
                        <th className="text-right py-1">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preInvoiceResult.lignes.map((l, i) => (
                        <tr key={i} className="border-b border-border">
                          <td className="py-1 text-foreground/80 truncate max-w-[140px]">{l.produitNom}</td>
                          <td className="py-1 text-right text-foreground/80">{l.quantite}</td>
                          <td className="py-1 text-right text-foreground/80">{l.prixUnitaire.toLocaleString()}</td>
                          <td className="py-1 text-right font-medium text-foreground">{l.total.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-lg font-bold text-foreground text-center mb-4">{preInvoiceResult.total.toLocaleString()} FCFA</p>
              <p className="text-xs text-muted-foreground text-center mb-4">Remettez cette pré-facture au client. Il la présentera à la caisse pour paiement.</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => { window.print(); }}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-foreground hover:bg-primary/90 transition-colors"
                >
                  <Printer size={16} /> Imprimer
                </button>
                <button
                  onClick={() => setPreInvoiceResult(null)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-accent transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}

        <AnimatePresence>
        {showSessionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowSessionModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
              {session ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10"><Wallet size={20} className="text-success-foreground" /></div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">Fermer la caisse</h2>
                      <p className="text-xs text-muted-foreground">{session.libelle}</p>
                    </div>
                  </div>
                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Solde d'ouverture</span><span className="font-medium">{Number(session.soldeOuverture ?? 0).toLocaleString()} F</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Solde actuel</span><span className="font-bold text-success-foreground">{Number(session.soldeActuel ?? 0).toLocaleString()} F</span></div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Solde de fermeture</label>
                      <input type="number" className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" value={sessionClosingBalance} onChange={(e) => setSessionClosingBalance(Number(e.target.value) || 0)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Notes (optionnel)</label>
                      <input className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} placeholder="Observation..." />
                    </div>
                  </div>
                  {hasPermission("caisse.fermer") && (
                    <button onClick={() => closeSessionMut.mutate({ caisseId: session.caisseId ?? selectedCaisseId ?? undefined, closingBalance: sessionClosingBalance, notes: sessionNotes || undefined })} disabled={closeSessionMut.isPending} className="w-full rounded-xl bg-destructive py-2.5 text-sm font-semibold text-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors">
                      {closeSessionMut.isPending ? "Fermeture..." : "Fermer la caisse"}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10"><LogIn size={20} className="text-primary" /></div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">Ouvrir la caisse</h2>
                      <p className="text-xs text-muted-foreground">Nouvelle session de vente</p>
                    </div>
                  </div>
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Fond de caisse (FCFA)</label>
                      <input type="number" min={0} className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" value={sessionOpeningBalance} onChange={(e) => setSessionOpeningBalance(Number(e.target.value) || 0)} placeholder="0" />
                    </div>
                  </div>
                  {hasPermission("caisse.ouvrir") && (
                    <button onClick={() => openSessionMut.mutate({ openingBalance: sessionOpeningBalance, caisseId: selectedCaisseId ?? undefined })} disabled={openSessionMut.isPending} className="w-full rounded-xl bg-success py-2.5 text-sm font-semibold text-foreground hover:bg-success/90 disabled:opacity-50 transition-colors">
                      {openSessionMut.isPending ? "Ouverture..." : "Ouvrir la caisse"}
                    </button>
                  )}
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPayModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowPayModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-foreground">Paiement</h2>
                <button onClick={() => setShowPayModal(false)} className="rounded-lg p-1.5 hover:bg-accent"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Total à payer</span>
                  <span className="text-xl font-bold text-primary">{total.toLocaleString()} F</span>
                </div>
                {lineDiscountsTotal > 0 && <div className="flex justify-between text-xs text-destructive"><span>Remises lignes</span><span>-{lineDiscountsTotal.toLocaleString()} F</span></div>}
                {ticketDiscountAmount > 0 && <div className="flex justify-between text-xs text-destructive"><span>Remise ticket ({ticketDiscountPercent}%)</span><span>-{ticketDiscountAmount.toLocaleString()} F</span></div>}

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2">Mode de paiement</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "especes" as const, label: "Espèces", icon: <Banknote size={16} /> },
                      { value: "mobile_money" as const, label: "Mobile Money", icon: <Smartphone size={16} /> },
                      { value: "carte" as const, label: "Carte", icon: <CreditCard size={16} /> },
                      { value: "credit" as const, label: "Crédit", icon: <Receipt size={16} /> },
                    ].map((m) => (
                      <button key={m.value} onClick={() => { setPayMode(m.value); if (m.value !== "especes") setMontantRecu(total); }}
                        className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${payMode === m.value ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"}`}>
                        {m.icon} {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {payMode === "especes" && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Montant reçu (FCFA)</label>
                    <input type="number" min={0} className="w-full rounded-lg border border-border px-3 py-2 text-lg font-bold text-right outline-none focus:ring-2 focus:ring-primary/20" value={montantRecu} onChange={(e) => setMontantRecu(Number(e.target.value) || 0)} />
                  </div>
                )}

                {payMode === "especes" && monnaie > 0 && (
                  <div className="flex justify-between items-center rounded-lg bg-success/10 border border-success/20 px-4 py-3">
                    <span className="text-sm font-medium text-success-foreground">Monnaie à rendre</span>
                    <span className="text-lg font-bold text-success-foreground">{monnaie.toLocaleString()} F</span>
                  </div>
                )}

                {payMode === "especes" && montantRecu > 0 && montantRecu < total && (
                  <p className="text-xs text-destructive">⚠ Montant insuffisant ({montantRecu.toLocaleString()} F reçu, {total.toLocaleString()} F requis)</p>
                )}

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Notes (optionnel)</label>
                  <input className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="..." />
                </div>

                {hasPermission("pos.vente.creer") && (
                  <button
                    onClick={handlePay}
                    disabled={createSale.isPending || (payMode === "especes" && montantRecu < total)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-success to-success py-3 text-sm font-semibold text-foreground hover:from-success/80 hover:to-success/80 disabled:opacity-50 transition-all shadow-lg"
                  >
                    <CheckCircle size={18} />
                    {createSale.isPending ? "Traitement..." : `Confirmer le paiement (${total.toLocaleString()} F)`}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {saleResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"
            onClick={() => setSaleResult(null)}
          >
            <motion.div className="w-full max-w-md rounded-2xl bg-background p-8 text-center" onClick={(e) => e.stopPropagation()}>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle size={32} className="text-success-foreground" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Vente effectuée</h2>
              <p className="text-sm text-muted-foreground mb-1">Référence</p>
              <p className="text-2xl font-bold font-mono text-primary mb-2">{saleResult.reference}</p>
              <p className="text-lg font-bold text-foreground mb-6">{saleResult.total.toLocaleString()} FCFA</p>
              <div className="flex gap-2 justify-center">
                <button onClick={() => { window.print(); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-foreground hover:bg-primary/90 transition-colors">
                  <Printer size={16} /> Imprimer ticket
                </button>
                <button onClick={() => setSaleResult(null)} className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-accent transition-colors">
                  Fermer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>

    <div id="print-receipt">
      {preInvoiceResult && (
        <>
          {champsVisibles.logoTicket === true && orgInfo.logoUrl && (
            <img src={orgInfo.logoUrl} alt="Logo" style={{ maxHeight: 60, maxWidth: 120, objectFit: "contain", display: "block", margin: "0 auto" }} />
          )}
          <h1>{orgInfo.name}</h1>
          {champsVisibles.slogan !== false && orgInfo.slogan && <p style={{ textAlign: "center", fontSize: 11 }}>{orgInfo.slogan}</p>}
          {champsVisibles.ville !== false && adresseLigne && <p style={{ textAlign: "center", fontSize: 11 }}>{adresseLigne}</p>}
          {champsVisibles.telephone !== false && orgInfo.phone && <p style={{ textAlign: "center", fontSize: 11 }}>Tél: {orgInfo.phone}</p>}
          {champsVisibles.email !== false && orgInfo.email && <p style={{ textAlign: "center", fontSize: 10 }}>Email: {orgInfo.email}</p>}
          {preInvoiceResult.agenceName && <p style={{ textAlign: "center", fontSize: 10 }}>{preInvoiceResult.agenceName}</p>}
          {champsVisibles.identifiantsLegaux !== false && legaux && <p style={{ textAlign: "center", fontSize: 9 }}>{legaux}</p>}
          <div className="sep" />
          <p className="ref">PRÉ-FACTURE</p>
          <p style={{ textAlign: "center", fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>
            {preInvoiceResult.reference}
          </p>
          <p style={{ textAlign: "center", fontSize: 10 }}>
            {new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
          <p style={{ fontSize: 10 }}>Client: {preInvoiceResult.customerName ?? "Client Divers"}</p>
          <p style={{ fontSize: 10 }}>Opérateur: {preInvoiceResult.operateurName ?? "—"}</p>
          <div className="sep" />
          <table>
            <thead>
              <tr style={{ fontSize: 10, borderBottom: "1px dashed #000" }}>
                <td style={{ fontWeight: "bold" }}>Article</td>
                <td style={{ fontWeight: "bold", textAlign: "center" }}>Qté</td>
                <td style={{ fontWeight: "bold", textAlign: "right" }}>PU</td>
                <td style={{ fontWeight: "bold", textAlign: "right" }}>Total</td>
              </tr>
            </thead>
            <tbody>
              {preInvoiceResult.lignes.map((l, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 10 }}>{l.produitNom.length > 28 ? l.produitNom.substring(0, 28) : l.produitNom}</td>
                  <td style={{ textAlign: "center", fontSize: 10 }}>{l.quantite}</td>
                  <td style={{ textAlign: "right", fontSize: 10 }}>{l.prixUnitaire.toLocaleString()}</td>
                  <td style={{ textAlign: "right", fontSize: 10 }}>{l.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="sep" />
          <p className="total">Total: {preInvoiceResult.total.toLocaleString()} {deviseLabel}</p>
          {champsVisibles.tva !== false && orgInfo.tvaDefaut > 0 && <p style={{ textAlign: "right", fontSize: 9 }}>TVA incluse ({orgInfo.tvaDefaut}%)</p>}
          <div className="sep" />
          {orgInfo.mentionPiedTicket ? (
            <p className="footer" style={{ fontSize: 8 }}>{orgInfo.mentionPiedTicket}</p>
          ) : (
            <p className="footer" style={{ fontSize: 8 }}>Marchandise vendue ne peut être reprise ni échangée</p>
          )}
          <p className="footer">Merci de votre visite !</p>
          <p className="footer">Présentez cette pré-facture à la caisse pour paiement</p>
        </>
      )}
      {saleResult && (
        <>
          {champsVisibles.logoTicket === true && orgInfo.logoUrl && (
            <img src={orgInfo.logoUrl} alt="Logo" style={{ maxHeight: 60, maxWidth: 120, objectFit: "contain", display: "block", margin: "0 auto" }} />
          )}
          <h1>{orgInfo.name}</h1>
          {champsVisibles.slogan !== false && orgInfo.slogan && <p style={{ textAlign: "center", fontSize: 11 }}>{orgInfo.slogan}</p>}
          {champsVisibles.ville !== false && adresseLigne && <p style={{ textAlign: "center", fontSize: 11 }}>{adresseLigne}</p>}
          {champsVisibles.telephone !== false && orgInfo.phone && <p style={{ textAlign: "center", fontSize: 11 }}>Tel: {orgInfo.phone}</p>}
          {champsVisibles.email !== false && orgInfo.email && <p style={{ textAlign: "center", fontSize: 10 }}>Email: {orgInfo.email}</p>}
          {champsVisibles.identifiantsLegaux !== false && legaux && <p style={{ textAlign: "center", fontSize: 9 }}>{legaux}</p>}
          <div className="sep" />
          <p className="ref">TICKET DE VENTE</p>
          <p style={{ textAlign: "center", fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>
            {saleResult.reference}
          </p>
          <p style={{ textAlign: "center", fontSize: 10 }}>
            {new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
          <p style={{ fontSize: 10 }}>Client: {selectedCustomer?.name ?? "Client Divers"}</p>
          <p style={{ fontSize: 10 }}>Paiement: {payMode === "especes" ? "Espèces" : payMode === "mobile_money" ? "Mobile Money" : payMode === "carte" ? "Carte" : "Crédit"}</p>
          <div className="sep" />
          <table>
            <thead>
              <tr style={{ fontSize: 10, borderBottom: "1px dashed #000" }}>
                <td style={{ fontWeight: "bold" }}>Article</td>
                <td style={{ fontWeight: "bold", textAlign: "center" }}>Qté</td>
                <td style={{ fontWeight: "bold", textAlign: "right" }}>PU</td>
                <td style={{ fontWeight: "bold", textAlign: "right" }}>Total</td>
              </tr>
            </thead>
            <tbody>
              {cart.map((item, i) => {
                const pu = Math.round(item.unitPrice * (1 - item.discountPercent / 100));
                return (
                  <tr key={i}>
                    <td style={{ fontSize: 10 }}>{item.productName.substring(0, 28)}</td>
                    <td style={{ textAlign: "center", fontSize: 10 }}>{item.quantity}</td>
                    <td style={{ textAlign: "right", fontSize: 10 }}>{pu.toLocaleString()}</td>
                    <td style={{ textAlign: "right", fontSize: 10 }}>{(pu * item.quantity).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="sep" />
          {(lineDiscountsTotal > 0) && <p style={{ fontSize: 11, textAlign: "right" }}>Remises: -{lineDiscountsTotal.toLocaleString()} {deviseLabel}</p>}
          {(ticketDiscountAmount > 0) && <p style={{ fontSize: 11, textAlign: "right" }}>Remise ticket ({ticketDiscountPercent}%): -{ticketDiscountAmount.toLocaleString()} {deviseLabel}</p>}
          <p className="total">Total: {saleResult.total.toLocaleString()} {deviseLabel}</p>
          {champsVisibles.tva !== false && orgInfo.tvaDefaut > 0 && <p style={{ textAlign: "right", fontSize: 9 }}>TVA incluse ({orgInfo.tvaDefaut}%)</p>}
          {payMode === "especes" && montantRecu > saleResult.total && (
            <p style={{ fontSize: 11, textAlign: "right" }}>Monnaie rendue: {(montantRecu - saleResult.total).toLocaleString()} {deviseLabel}</p>
          )}
          <div className="sep" />
          {orgInfo.mentionPiedTicket && <p className="footer" style={{ fontSize: 8 }}>{orgInfo.mentionPiedTicket}</p>}
          <p className="footer">Merci de votre visite !</p>
        </>
      )}
    </div>
    </>
  );
}
