"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "~/trpc/react";
import {
  Search, X, CheckCircle, Printer, Wallet, LogIn, LogOut,
  DollarSign, Banknote, Smartphone, CreditCard, Receipt,
  FileText, Download, Building2, TrendingDown, TrendingUp,
  ArrowUpFromLine, ArrowDownFromLine, Info, Trash2, ArrowRightLeft, Filter,
  HandCoins, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "~/hooks/usePermissions";

const TYPE_LABELS: Record<string, string> = {
  vente: "Vente",
  depense: "Dépense",
  entree: "Entrée",
  sortie: "Sortie",
  apport: "Apport",
  retrait: "Retrait",
  correction: "Correction",
  remboursement: "Remboursement",
  annulation: "Annulation",
  paiement_fournisseur: "Paiement fournisseur",
  encaissement_dette: "Encaissement dette",
};
const TYPE_ORDER = ["vente", "entree", "apport", "depense", "retrait", "sortie", "remboursement", "annulation", "paiement_fournisseur", "encaissement_dette", "correction"];

const FALLBACK_COMPANY = {
  name: "GARAGE POLYVALENT JUNIOR",
  slogan: "Librairie & Papeterie",
  address: "125 Rue de la Paix, Bonanjo",
  city: "Douala, Cameroun",
  phone: "+237 6 81 68 16 81",
  email: "dg.atelierone@gmail.com",
  rc: "RC/DLA/2025/B/1234",
  niu: "M0123456789123",
  capital: "1 000 000 FCFA",
};

interface PreInvoiceLigne {
  produitId: string;
  quantite: number;
  prixUnitaire: number;
  total: number;
}

interface PreInvoiceItem {
  id: string;
  reference: string;
  clientNom: string;
  clientId?: string;
  montantTotal: string;
  remise: string;
  statut: string;
  notes: string | null;
  modePaiement?: string | null;
  createdAt: Date | null;
  lignes?: PreInvoiceLigne[];
  productNames?: Record<string, string>;
  operateurId?: string | null;
  operateurNom?: string | null;
  caisseId?: string | null;
  caisseLibelle?: string | null;
}

interface InvoiceData {
  reference: string;
  total: number;
  clientNom: string;
  clientId?: string;
  date: Date;
  lignes: PreInvoiceLigne[];
  productNames: Record<string, string>;
  remise: number;
  modePaiement: string;
  montantRecu: number;
  monnaie: number;
  notes: string;
}

const MODE_LABELS: Record<string, string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
  carte: "Carte bancaire",
  credit: "Crédit",
};

export default function CashPage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const utils = api.useUtils();
  const { hasPermission } = usePermissions();
  const [selectedCaisseId, setSelectedCaisseId] = useState<string | null>(null);
  const { data: registers } = api.cash.listCaisseRegisters.useQuery();
  const { data: org } = api.settings.organization.get.useQuery();
  const orgInfo = {
    name: org?.nom ?? FALLBACK_COMPANY.name,
    slogan: org?.slogan ?? FALLBACK_COMPANY.slogan,
    address: org?.adresse ?? FALLBACK_COMPANY.address,
    city: org?.ville ? [org.ville, org.pays].filter(Boolean).join(", ") : FALLBACK_COMPANY.city,
    phone: org?.telephone ?? FALLBACK_COMPANY.phone,
    email: org?.email ?? FALLBACK_COMPANY.email,
    siteWeb: org?.siteWeb ?? "",
    logoUrl: org?.logoUrl ?? "",
    rc: org?.rcRccm ?? "",
    niu: org?.niu ?? "",
    ifu: org?.ifu ?? "",
    capital: org?.capital ?? "",
    devise: org?.devise ?? "XAF",
    tvaDefaut: org?.tvaDefaut ?? 0,
    mentionPiedFacture: org?.mentionPiedFacture ?? "",
    politiqueRetour: org?.politiqueRetour ?? "",
  };
  const champsVisibles = (org?.champsVisibles ?? {}) as Record<string, boolean>;
  const deviseLabel = orgInfo.devise === "XAF" ? "FCFA" : orgInfo.devise;
  const adresseLigne = [orgInfo.address, orgInfo.city].filter(Boolean).join(", ");
  const legaux = [
    orgInfo.rc ? `RC: ${orgInfo.rc}` : "",
    orgInfo.niu ? `NIU: ${orgInfo.niu}` : "",
    orgInfo.ifu ? `IFU: ${orgInfo.ifu}` : "",
    orgInfo.capital ? `Capital: ${orgInfo.capital}` : "",
  ].filter(Boolean).join(" | ");
  const contactLigne = [
    champsVisibles.telephone !== false && orgInfo.phone ? `Tel: ${orgInfo.phone}` : "",
    champsVisibles.email !== false && orgInfo.email ? `Email: ${orgInfo.email}` : "",
    orgInfo.siteWeb || "",
  ].filter(Boolean).join(" | ");
  useEffect(() => {
    const saved = localStorage.getItem("cash_selected_caisse");
    if (saved) setSelectedCaisseId(saved);
  }, []);
  const selectCaisse = (id: string | null) => {
    setSelectedCaisseId(id);
    if (id) localStorage.setItem("cash_selected_caisse", id);
    else localStorage.removeItem("cash_selected_caisse");
  };
  const { data: session } = api.pos.getOpenSession.useQuery({ caisseId: selectedCaisseId ?? undefined });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPI, setSelectedPI] = useState<PreInvoiceItem | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payMode, setPayMode] = useState<"especes" | "mobile_money" | "carte" | "credit">("especes");
  const [montantRecu, setMontantRecu] = useState(0);
  const [payNotes, setPayNotes] = useState("");
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionOpeningBal, setSessionOpeningBal] = useState(0);
  const [sessionClosingBal, setSessionClosingBal] = useState(0);
  const [sessionNotes, setSessionNotes] = useState("");
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState(0);
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseDesc, setExpenseDesc] = useState("");
  const [showFourModal, setShowFourModal] = useState(false);
  const [fourDetteId, setFourDetteId] = useState<number | null>(null);
  const [fourMontant, setFourMontant] = useState("");
  const [fourMode, setFourMode] = useState("especes");
  const { data: dettesFournisseurs } = api.procurement.listDettes.useQuery();
  const payerDetteFour = api.procurement.payerDette.useMutation({
    onSuccess: (r) => {
      toast.success(`Paiement fournisseur enregistré — Restant: ${Number(r.montantRestant).toLocaleString()} F`);
      setShowFourModal(false);
      setFourDetteId(null);
      setFourMontant("");
      utils.procurement.listDettes.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const [showFundModal, setShowFundModal] = useState(false);
  const [fundType, setFundType] = useState<"apport" | "retrait">("apport");
  const [fundAmount, setFundAmount] = useState(0);
  const [fundMotif, setFundMotif] = useState("");
  const [panelTab, setPanelTab] = useState<"prefactures" | "historique">("prefactures");
  const [historySubTab, setHistorySubTab] = useState<"en_cours" | "fermees">("en_cours");
  const [historyFilterType, setHistoryFilterType] = useState("all");
  const [selectedClosedSessionId, setSelectedClosedSessionId] = useState<string | null>(null);
  const [closedSessionsPage, setClosedSessionsPage] = useState(0);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [statutFilter, setStatutFilter] = useState<string>("pre_facture");
  const [datePreset, setDatePreset] = useState<string>("today");

  const dateRange = (() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    if (datePreset === "today") {
      start.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
      end.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (datePreset === "week") {
      const d = now.getDay();
      start.setDate(now.getDate() - (d === 0 ? 6 : d - 1));
    } else if (datePreset === "month") {
      start.setDate(1);
    }
    return { dateDebut: start.toISOString(), dateFin: end.toISOString() };
  })();

  const { data: preInvoices } = api.pos.searchPreInvoices.useQuery(
    {
      query: searchQuery,
      statut: statutFilter === "all" ? undefined : statutFilter as any,
      limit: 50,
      dateDebut: datePreset !== "all" ? dateRange.dateDebut : undefined,
      dateFin: datePreset !== "all" ? dateRange.dateFin : undefined,
    }
  );
  const { data: pendingPreInvoiceCount } = api.pos.countPreInvoices.useQuery();

  const payPreInvoice = api.pos.payPreInvoice.useMutation({
    onSuccess: (data) => {
      if (selectedPI && selectedPI.lignes) {
        setInvoice({
          reference: data.reference,
          total: Number(data.totalAmount),
          clientNom: selectedPI.clientNom,
          clientId: selectedPI.clientId,
          date: new Date(),
          lignes: selectedPI.lignes,
          productNames: selectedPI.productNames || {},
          remise: Number(selectedPI.remise),
          modePaiement: payMode,
          montantRecu: payMode === "especes" ? montantRecu : totalAPayer,
          monnaie,
          notes: payNotes,
        });
      }
      setSelectedPI(null);
      setShowPayModal(false);
      utils.pos.searchPreInvoices.invalidate();
      setTimeout(() => setInvoice(null), 30000);
    },
    onError: (e) => toast.error(e.message),
  });

  const voidSale = api.sales.voidSale.useMutation({
    onSuccess: () => {
      setSelectedPI(null);
      setShowVoidModal(false);
      setVoidReason("");
      utils.pos.searchPreInvoices.invalidate();
      toast.success("Facture annulée");
    },
    onError: (e) => toast.error(e.message),
  });

  const openSessionMut = api.pos.openSession.useMutation({
    onSuccess: () => { utils.pos.getOpenSession.invalidate(); utils.cash.listCaisseRegisters.invalidate(); setShowSessionModal(false); },
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

  const recordMovementMut = api.cash.recordMovement.useMutation({
    onSuccess: () => {
      setShowFundModal(false);
      setFundAmount(0);
      setFundMotif("");
      utils.pos.getOpenSession.invalidate();
      utils.cash.listCaisseRegisters.invalidate();
      utils.cash.getSessionSummary.invalidate();
      setPanelTab("historique");
      setHistorySubTab("en_cours");
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: closedSessionsData } = api.cash.listClosedSessions.useQuery(
    { caisseId: selectedCaisseId ?? session?.caisseId ?? "", limit: 20, offset: closedSessionsPage * 20 },
    { enabled: historySubTab === "fermees" }
  );

  const { data: closedSessionDetail } = api.cash.getClosedSessionDetail.useQuery(
    { caisseId: selectedCaisseId ?? session?.caisseId ?? "", sessionId: selectedClosedSessionId ?? "" },
    { enabled: !!selectedClosedSessionId }
  );

  const expenseMut = api.cash.recordExpense.useMutation({
    onSuccess: () => {
      setShowExpenseModal(false);
      setExpenseAmount(0);
      setExpenseCategory("");
      setExpenseDesc("");
      utils.pos.getOpenSession.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: sessionSummary } = api.cash.getSessionSummary.useQuery(
    { caisseId: session?.caisseId ?? "" },
    { enabled: !!session },
  );

  const currentCaisse = registers?.find((r) => r.id === (selectedCaisseId ?? registers[0]?.id));
  const canDepenser = (currentCaisse?.permissions?.peutDepenser && session) ?? false;

  const loadLignes = async (pi: PreInvoiceItem) => {
    try {
      const data = await utils.pos.resumeSale.fetch({ venteId: pi.id });
      const lignes = data.lignes.map(l => ({
        produitId: l.productId,
        nom: l.productName,
        quantite: l.quantity,
        prixUnitaire: l.unitPrice,
        total: l.quantity * l.unitPrice,
      }));
      const productNames: Record<string, string> = {};
      for (const l of lignes) {
        productNames[l.produitId] = l.nom;
      }
      setSelectedPI({ ...pi, lignes, productNames });
    } catch {
      toast.error("Erreur chargement détails");
    }
  };

  const totalAPayer = selectedPI
    ? Number(selectedPI.montantTotal) - Number(selectedPI.remise)
    : 0;
  const monnaie = payMode === "especes" && montantRecu >= totalAPayer ? montantRecu - totalAPayer : 0;

  useEffect(() => {
    if (!showPayModal) {
      setPayMode("especes");
      setMontantRecu(0);
      setPayNotes("");
    }
  }, [showPayModal]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Caisse</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Encaissement des pré-factures et gestion des fonds
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(registers?.length ?? 0) > 1 && (
            <select
              value={selectedCaisseId ?? ""}
              onChange={(e) => selectCaisse(e.target.value || null)}
              className="inline-flex items-center rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-muted-foreground outline-none hover:bg-muted transition-colors"
              title="Caisse active"
            >
              <option value="">Caisse par défaut</option>
              {registers?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.libelle}{r.session ? " · ouverte" : " · fermée"}
                </option>
              ))}
            </select>
          )}
          {session ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-success/10 border border-success/20 px-3 py-1.5 text-xs font-medium text-success">
              <Wallet size={14} /> {Number(session.soldeActuel ?? 0).toLocaleString()} F
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-1.5 text-xs font-medium text-destructive">
              <LogOut size={14} /> Caisse fermée
            </span>
          )}
          {(session ? hasPermission("caisse.fermer") : hasPermission("caisse.ouvrir")) && (
            <button onClick={() => setShowSessionModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
              {session ? <LogOut size={14} /> : <LogIn size={14} />}
              {session ? "Fermer" : "Ouvrir"}
            </button>
          )}
          {session && hasPermission("caisse.mouvement") && (
            <>
              <button onClick={() => setShowFundModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
                <ArrowUpFromLine size={14} /> Apport/Retrait
              </button>
              {canDepenser && (
                <button onClick={() => setShowExpenseModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors">
                  <TrendingDown size={14} /> Dépense
                </button>
              )}
              {hasPermission("achats.commander") && (
                <button onClick={() => setShowFourModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
                  <HandCoins size={14} /> Payer fournisseur
                </button>
              )}
            </>
          )}
          <Link
            href="/dashboard/cash/transferts"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <ArrowRightLeft size={14} /> Transferts
          </Link>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Encaissé ajd</p>
          <p className="text-xl font-bold text-foreground mt-1">
            {session && sessionSummary ? `${Number(sessionSummary.recap?.totalVentes ?? 0).toLocaleString()} F` : "-- F"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pré-factures en attente</p>
          <p className="text-xl font-bold text-foreground mt-1">{pendingPreInvoiceCount?.count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Session</p>
          <p className="text-xl font-bold text-foreground mt-1">{session ? "Ouverte" : "Fermée"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Solde actuel</p>
          <p className="text-xl font-bold text-foreground mt-1">
            {session ? `${Number(session.soldeActuel ?? 0).toLocaleString()} F` : "--"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex border-b border-border">
          <button onClick={() => setPanelTab("prefactures")}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
              panelTab === "prefactures" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground/60"
            }`}>
            <Receipt size={14} className="inline mr-1" /> Pré-factures
          </button>
          <button onClick={() => setPanelTab("historique")}
            className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
              panelTab === "historique" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground/60"
            }`}>
            <FileText size={14} className="inline mr-1" /> Historique
          </button>
        </div>

        {panelTab === "prefactures" && (
          <>
            <div className="p-4 border-b border-border space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">
                  {statutFilter === "pre_facture" ? "Pré-factures en attente" :
                   statutFilter === "termine" ? "Factures encaissées" :
                   statutFilter === "annulee" ? "Factures annulées" :
                   "Toutes les factures"}
                </h2>
                {session ? (
                  <span className="text-xs text-success font-medium">Caisse ouverte</span>
                ) : (
                  <span className="text-xs text-destructive font-medium">Caisse fermée</span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: "pre_facture", label: "En attente", color: "bg-warning/20 text-warning-foreground border-warning/20" },
                  { key: "termine", label: "Payées", color: "bg-success/20 text-success border-success/20" },
                  { key: "annulee", label: "Annulées", color: "bg-destructive/20 text-destructive border-destructive/20" },
                  { key: "suspendue", label: "Suspendues", color: "bg-muted text-foreground/60 border-border" },
                  { key: "all", label: "Toutes", color: "bg-primary/20 text-primary border-primary/20" },
                ].map((f) => (
                  <button key={f.key} onClick={() => setStatutFilter(f.key)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
                      statutFilter === f.key
                        ? f.color + " ring-2 ring-offset-1 ring-current"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: "today", label: "Aujourd'hui" },
                  { key: "week", label: "Cette semaine" },
                  { key: "month", label: "Ce mois" },
                  { key: "all", label: "Tout" },
                ].map((d) => (
                  <button key={d.key} onClick={() => setDatePreset(d.key)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      datePreset === d.key
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}>
                    {d.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  ref={searchRef}
                  placeholder="Rechercher par référence, client, notes..."
                  className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="divide-y divide-border max-h-96 overflow-y-auto">
              {!preInvoices ? (
                <div className="p-8 space-y-3">
                  {[1,2,3,4].map((i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
                  ))}
                </div>
              ) : preInvoices.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {searchQuery
                    ? "Aucune facture trouvée pour cette recherche"
                    : statutFilter === "pre_facture"
                      ? "Aucune pré-facture en attente"
                      : "Aucune facture trouvée"}
                </div>
              ) : (
                (preInvoices as unknown as PreInvoiceItem[])?.map((pi) => {
                  const total = Number(pi.montantTotal) - Number(pi.remise);
                  const isSelected = selectedPI?.id === pi.id;
                  const isVoided = pi.statut === "annulee";
                  const isPaid = pi.statut === "termine";
                  const isSuspended = pi.statut === "suspendue";
                  return (
                    <div
                      key={pi.id}
                      onClick={() => { if (!isVoided) loadLignes(pi); }}
                      className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                        isSelected ? "bg-primary/10 border-l-2 border-primary" : isVoided ? "opacity-50 border-l-2 border-destructive/20 bg-destructive/30" : isPaid ? "border-l-2 border-success/20 bg-success/20" : "hover:bg-muted border-l-2 border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                          isVoided ? "bg-destructive/20 text-destructive" : isPaid ? "bg-success/20 text-success" : isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                        }`}>
                          <FileText size={14} />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isSelected ? "text-primary" : isVoided ? "text-destructive line-through" : "text-foreground"}`}>
                            {pi.reference}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{pi.clientNom}</p>
                          <div className="flex gap-1.5 mt-0.5">
                            {isVoided && (
                              <span className="text-[9px] font-semibold text-destructive bg-destructive/10 px-1.5 py-px rounded border border-destructive/20">Annulée</span>
                            )}
                            {isPaid && (
                              <span className="text-[9px] font-semibold text-success bg-success/10 px-1.5 py-px rounded border border-success/20">Payée</span>
                            )}
                            {pi.statut === "pre_facture" && (
                              <span className="text-[9px] font-semibold text-warning-foreground bg-warning/10 px-1.5 py-px rounded border border-warning/20">Attente</span>
                            )}
                            {isSuspended && (
                              <span className="text-[9px] font-semibold text-muted-foreground bg-muted px-1.5 py-px rounded border border-border">Suspendue</span>
                            )}
                            {pi.modePaiement && isPaid && (
                              <span className="text-[9px] text-muted-foreground">{MODE_LABELS[pi.modePaiement] ?? pi.modePaiement}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p className={`text-sm font-bold ${isSelected ? "text-primary" : isVoided ? "text-destructive" : "text-foreground"}`}>
                            {total.toLocaleString()} F
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {pi.createdAt ? new Date(pi.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {preInvoices && preInvoices.length >= 50 && (
                <div className="p-3 text-center text-[10px] text-muted-foreground">
                  Affichage des 50 premiers résultats. Affinez votre recherche.
                </div>
              )}
            </div>
          </>
        )}

        {panelTab === "historique" && (
          <div>
            {/* Sub-tabs */}
            <div className="flex border-b border-border bg-muted/50">
              <button onClick={() => { setHistorySubTab("en_cours"); setSelectedClosedSessionId(null); }}
                className={`px-4 py-2 text-xs font-semibold transition-colors ${
                  historySubTab === "en_cours" ? "text-primary border-b-2 border-primary bg-background" : "text-muted-foreground hover:text-foreground/60"
                }`}>
                Session en cours
              </button>
              <button onClick={() => { setHistorySubTab("fermees"); setSelectedClosedSessionId(null); }}
                className={`px-4 py-2 text-xs font-semibold transition-colors ${
                  historySubTab === "fermees" ? "text-primary border-b-2 border-primary bg-background" : "text-muted-foreground hover:text-foreground/60"
                }`}>
                Sessions fermées
              </button>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Filter size={13} className="text-muted-foreground" />
              <select value={historyFilterType}
                onChange={(e) => setHistoryFilterType(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-primary">
                <option value="all">Tous les types</option>
                {TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
              {historyFilterType !== "all" && (
                <span className="text-xs text-muted-foreground">
                  {TYPE_LABELS[historyFilterType] ?? historyFilterType}
                </span>
              )}
            </div>

            {historySubTab === "en_cours" && (
              <div className="max-h-80 overflow-y-auto">
                {!session ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Ouvrez une session pour voir l&apos;historique
                  </div>
                ) : sessionSummary === null ? (
                  <div className="p-8 space-y-3">
                    {[1,2,3,4].map((i) => (
                      <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
                    ))}
                  </div>
                ) : sessionSummary?.mouvements?.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Aucun mouvement pour cette session
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {sessionSummary?.mouvements?.filter((m: any) => historyFilterType === "all" || m.type === historyFilterType)?.map((m: any) => (
                      <div key={m.id} className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                            m.type === "vente" || m.type === "entree" || m.type === "apport" || m.type === "encaissement_dette"
                              ? "bg-success/20 text-success"
                              : "bg-destructive/20 text-destructive"
                          }`}>
                            {m.type === "vente" ? <DollarSign size={14} /> :
                             m.type === "depense" ? <TrendingDown size={14} /> :
                             m.type === "apport" ? <ArrowUpFromLine size={14} /> :
                             m.type === "retrait" ? <ArrowDownFromLine size={14} /> :
                             <Info size={14} />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{TYPE_LABELS[m.type] ?? m.type}</p>
                            <p className="text-xs text-muted-foreground">{m.motif ?? ""}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${
                            m.type === "vente" || m.type === "entree" || m.type === "apport" || m.type === "encaissement_dette"
                              ? "text-success" : "text-destructive"
                          }`}>
                            {m.type === "vente" || m.type === "entree" || m.type === "apport" || m.type === "encaissement_dette" ? "+" : "-"}
                            {Number(m.montant).toLocaleString()} F
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {m.createdAt ? new Date(m.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {historySubTab === "fermees" && !selectedClosedSessionId && (
              <div className="max-h-80 overflow-y-auto">
                {!closedSessionsData ? (
                  <div className="p-8 space-y-3">
                    {[1,2,3].map((i) => (
                      <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                    ))}
                  </div>
                ) : closedSessionsData.sessions.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Aucune session fermée trouvée
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {closedSessionsData.sessions.map((s: any) => {
                      const ouvert = s.ouvertLe ? new Date(s.ouvertLe) : null;
                      const ferme = s.fermeLe ? new Date(s.fermeLe) : null;
                      const ecart = Number(s.ecart);
                      return (
                        <div key={s.id}
                          onClick={() => setSelectedClosedSessionId(s.id)}
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
                              <Wallet size={14} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground">
                                {ouvert ? ouvert.toLocaleDateString("fr-FR") : "-"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {ouvert?.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                {" → "}
                                {ferme?.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className="text-sm font-bold text-foreground">
                              {Number(s.soldeFermeture ?? 0).toLocaleString()} F
                            </p>
                            <p className={`text-xs font-medium ${ecart === 0 ? "text-success" : "text-destructive"}`}>
                              {ecart === 0 ? "Écart: 0" : ecart > 0 ? `+${ecart.toLocaleString()}` : ecart.toLocaleString()} F
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {closedSessionsData && closedSessionsData.total > 20 && (
                  <div className="flex items-center justify-between p-3 border-t border-border">
                    <button disabled={closedSessionsPage === 0}
                      onClick={() => setClosedSessionsPage(p => Math.max(0, p - 1))}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors">
                      ← Précédent
                    </button>
                    <span className="text-xs text-muted-foreground">
                      Page {closedSessionsPage + 1} / {Math.ceil(closedSessionsData.total / 20)}
                    </span>
                    <button disabled={(closedSessionsPage + 1) * 20 >= closedSessionsData.total}
                      onClick={() => setClosedSessionsPage(p => p + 1)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors">
                      Suivant →
                    </button>
                  </div>
                )}
              </div>
            )}

            {historySubTab === "fermees" && selectedClosedSessionId && (
              <div className="max-h-80 overflow-y-auto">
                <button onClick={() => setSelectedClosedSessionId(null)}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-primary hover:text-primary transition-colors">
                  ← Retour aux sessions fermées
                </button>
                {!closedSessionDetail ? (
                  <div className="p-8 space-y-3">
                    {[1,2,3].map((i) => (
                      <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Recap */}
                    {closedSessionDetail.recap && (
                      <div className="px-3 py-2 space-y-1 border-b border-border">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Ouverture</span>
                          <span className="font-medium">{Number(closedSessionDetail.session.soldeOuverture ?? 0).toLocaleString()} F</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Fermeture</span>
                          <span className="font-medium">{Number(closedSessionDetail.session.soldeFermeture ?? 0).toLocaleString()} F</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Ventes</span>
                          <span className="font-semibold text-success">+{Number(closedSessionDetail.recap.totalVentes ?? 0).toLocaleString()} F</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Dépenses</span>
                          <span className="font-semibold text-destructive">-{Number(closedSessionDetail.recap.totalDepenses ?? 0).toLocaleString()} F</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Apports</span>
                          <span className="font-semibold text-success">+{Number(closedSessionDetail.recap.totalApports ?? 0).toLocaleString()} F</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Retraits</span>
                          <span className="font-semibold text-destructive">-{Number(closedSessionDetail.recap.totalRetraits ?? 0).toLocaleString()} F</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Remboursements</span>
                          <span className="font-semibold text-destructive">-{Number(closedSessionDetail.recap.totalRemboursements ?? 0).toLocaleString()} F</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Annulations</span>
                          <span className="font-semibold text-destructive">-{Number(closedSessionDetail.recap.totalAnnulations ?? 0).toLocaleString()} F</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Paiements fournisseurs</span>
                          <span className="font-semibold text-destructive">-{Number(closedSessionDetail.recap.totalPaiementsFournisseurs ?? 0).toLocaleString()} F</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Encaissements dettes</span>
                          <span className="font-semibold text-success">+{Number(closedSessionDetail.recap.totalEncaissementsDettes ?? 0).toLocaleString()} F</span>
                        </div>
                        <div className="border-t border-border pt-1 flex justify-between text-xs font-bold">
                          <span>Écart</span>
                          <span className={Number(closedSessionDetail.session.ecart) === 0 ? "text-success" : "text-destructive"}>
                            {Number(closedSessionDetail.session.ecart ?? 0).toLocaleString()} F
                          </span>
                        </div>
                      </div>
                    )}
                    {/* Movements */}
                    <div className="divide-y divide-border">
                      {closedSessionDetail.mouvements?.filter((m: any) => historyFilterType === "all" || m.type === historyFilterType)?.map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                              m.type === "vente" || m.type === "entree" || m.type === "apport" || m.type === "encaissement_dette"
                                ? "bg-success/20 text-success"
                                : "bg-destructive/20 text-destructive"
                            }`}>
                              {m.type === "vente" ? <DollarSign size={14} /> :
                               m.type === "depense" ? <TrendingDown size={14} /> :
                               m.type === "apport" ? <ArrowUpFromLine size={14} /> :
                               m.type === "retrait" ? <ArrowDownFromLine size={14} /> :
                               <Info size={14} />}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{TYPE_LABELS[m.type] ?? m.type}</p>
                              <p className="text-xs text-muted-foreground">{m.motif ?? ""}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-bold ${
                              m.type === "vente" || m.type === "entree" || m.type === "apport" || m.type === "encaissement_dette"
                                ? "text-success" : "text-destructive"
                            }`}>
                              {m.type === "vente" || m.type === "entree" || m.type === "apport" || m.type === "encaissement_dette" ? "+" : "-"}
                              {Number(m.montant).toLocaleString()} F
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {m.createdAt ? new Date(m.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Invoice preview modal */}
      <AnimatePresence>
        {selectedPI && selectedPI.lignes && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-2 sm:p-4" onClick={() => setSelectedPI(null)}>
            <motion.div id="invoice-print-area" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-3xl rounded-2xl bg-card shadow-2xl overflow-y-auto max-h-[98vh]" onClick={(e) => e.stopPropagation()}>

              {/* Toolbar */}
              <div className="flex items-center justify-between bg-card px-5 py-3 rounded-t-2xl">
                <div className="flex items-center gap-2 text-foreground">
                  <FileText size={16} />
                  <span className="text-sm font-semibold">{selectedPI.reference}</span>
                </div>
                <div className="flex items-center gap-2">
                  {(selectedPI.statut === "pre_facture" || selectedPI.statut === "suspendue") && (
                    <button onClick={() => setShowVoidModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-2 text-xs font-bold text-foreground hover:bg-destructive/90 transition-colors shadow-lg shadow-destructive/20">
                      <Trash2 size={14} /> Annuler
                    </button>
                  )}
                  <button onClick={() => {
                    if (!session) { toast.error("Ouvrez d'abord la caisse"); return; }
                    setMontantRecu(totalAPayer);
                    setShowPayModal(true);
                  }} disabled={!session || selectedPI.statut !== "pre_facture"}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-success px-4 py-2 text-xs font-bold text-foreground hover:bg-success/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-success/20">
                    <DollarSign size={14} />
                    {selectedPI.statut === "termine" ? "Encaissée" : "Encaisser"}
                  </button>
                  <button onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent/80 transition-colors print:hidden">
                    <Printer size={14} /> Imprimer
                  </button>
                  <button onClick={() => setSelectedPI(null)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent/80 transition-colors print:hidden">
                    <X size={14} /> Fermer
                  </button>
                </div>
              </div>

              <div className="px-4 sm:px-6 lg:px-8 py-5">
                {/* Company header */}
                <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-primary pb-4 mb-4 gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      {orgInfo.logoUrl ? (
                        <img src={orgInfo.logoUrl} alt="Logo" className="h-11 w-11 shrink-0 rounded-lg object-contain" />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-foreground shrink-0">
                          <Building2 size={20} />
                        </div>
                      )}
                      <div>
                        <h1 className="text-lg font-bold text-foreground uppercase tracking-tight">{orgInfo.name}</h1>
                        {champsVisibles.slogan !== false && orgInfo.slogan && <p className="text-[10px] text-primary font-medium">{orgInfo.slogan}</p>}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground space-y-px">
                      {champsVisibles.ville !== false && adresseLigne && <p>{adresseLigne}</p>}
                      {contactLigne && <p>{contactLigne}</p>}
                      {champsVisibles.identifiantsLegaux !== false && legaux && <p>{legaux}</p>}
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2 mb-1.5">
                      <p className="text-[9px] text-primary font-medium uppercase tracking-widest">
                        {selectedPI.statut === "termine" ? "Facture" : selectedPI.statut === "annulee" ? "Annulée" : "Pré-facture"}
                      </p>
                      <p className="text-base font-bold font-mono text-primary">{selectedPI.reference}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Date: {selectedPI.createdAt ? new Date(selectedPI.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "-"}
                    </p>
                  </div>
                </div>

                {/* Client */}
                <div className="mb-4">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Client</p>
                  <div className="bg-muted rounded-lg px-3 py-2 border border-border">
                    <p className="text-sm font-semibold text-foreground">{selectedPI.clientNom || "Client Divers"}</p>
                  </div>
                </div>

                {/* Opérateur & Caisse */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {champsVisibles.operateur !== false && (
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Générée par</p>
                      <div className="bg-muted rounded-lg px-3 py-2 border border-border">
                        <p className="text-xs font-semibold text-foreground">{selectedPI.operateurNom || "—"}</p>
                      </div>
                    </div>
                  )}
                  {champsVisibles.caisse !== false && (
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Caisse</p>
                      <div className="bg-muted rounded-lg px-3 py-2 border border-border">
                        <p className="text-xs font-semibold text-foreground">{selectedPI.caisseLibelle || "—"}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Products */}
                <table className="w-full text-xs mb-4">
                  <thead>
                    <tr className="bg-muted text-foreground">
                      <th className="text-left py-2 px-3 font-medium rounded-tl-lg w-[45%]">Désignation</th>
                      <th className="text-center py-2 px-3 font-medium w-[15%]">Qté</th>
                      <th className="text-right py-2 px-3 font-medium w-[20%]">P.U.</th>
                      <th className="text-right py-2 px-3 font-medium rounded-tr-lg w-[20%]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPI.lignes.map((l, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/50"}>
                        <td className="py-2 px-3 text-foreground/60 text-[11px]">
                          {selectedPI.productNames?.[l.produitId] ?? l.produitId.substring(0, 12)}
                        </td>
                        <td className="py-2 px-3 text-center text-foreground/60">{l.quantite}</td>
                        <td className="py-2 px-3 text-right text-muted-foreground">{l.prixUnitaire.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-medium text-foreground">{l.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="flex justify-end mb-4">
                  <div className="w-56 sm:w-64 space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Sous-total</span>
                      <span>{totalAPayer.toLocaleString()} {deviseLabel}</span>
                    </div>
                    {Number(selectedPI.remise) > 0 && champsVisibles.remise !== false && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Remise</span>
                        <span className="text-destructive">- {Number(selectedPI.remise).toLocaleString()} {deviseLabel}</span>
                      </div>
                    )}
                    <div className="border-t border-border pt-1.5 flex justify-between text-base font-bold text-primary">
                      <span>Total</span>
                      <span>{totalAPayer.toLocaleString()} {deviseLabel}</span>
                    </div>
                    {champsVisibles.tva !== false && orgInfo.tvaDefaut > 0 && (
                      <p className="text-[9px] text-muted-foreground text-right">TVA incluse ({orgInfo.tvaDefaut}%)</p>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-border pt-3 text-center text-[9px] text-muted-foreground space-y-0.5">
                  <p className="font-medium text-muted-foreground">{orgInfo.name}</p>
                  {champsVisibles.identifiantsLegaux !== false && legaux && <p>{legaux}</p>}
                  {champsVisibles.ville !== false && adresseLigne && <p>{adresseLigne}{orgInfo.phone ? ` - Tel: ${orgInfo.phone}` : ""}</p>}
                  {orgInfo.mentionPiedFacture && <p>{orgInfo.mentionPiedFacture}</p>}
                  {orgInfo.politiqueRetour && <p className="italic">{orgInfo.politiqueRetour}</p>}
                  {!orgInfo.mentionPiedFacture && !orgInfo.politiqueRetour && <p className="text-foreground/80 italic">Merci de votre visite !</p>}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Paiement */}
      <AnimatePresence>
        {showPayModal && selectedPI && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowPayModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl bg-card p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-foreground">Encaissement</h2>
                <button onClick={() => setShowPayModal(false)} className="rounded-lg p-1.5 hover:bg-muted"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 px-4 py-3">
                  <div>
                    <p className="text-xs text-primary font-medium">{selectedPI.reference}</p>
                    <p className="text-xs text-primary">{selectedPI.clientNom}</p>
                  </div>
                  <span className="text-xl font-bold text-primary">{totalAPayer.toLocaleString()} F</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2">Mode de paiement</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "especes" as const, label: "Espèces", icon: <Banknote size={16} /> },
                      { value: "mobile_money" as const, label: "Mobile Money", icon: <Smartphone size={16} /> },
                      { value: "carte" as const, label: "Carte", icon: <CreditCard size={16} /> },
                      { value: "credit" as const, label: "Crédit", icon: <Receipt size={16} /> },
                    ].map((m) => (
                      <button key={m.value} onClick={() => { setPayMode(m.value); if (m.value !== "especes") setMontantRecu(totalAPayer); }}
                        className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${payMode === m.value ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
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
                    <span className="text-sm font-medium text-success">Monnaie à rendre</span>
                    <span className="text-lg font-bold text-success">{monnaie.toLocaleString()} F</span>
                  </div>
                )}

                {payMode === "especes" && montantRecu > 0 && montantRecu < totalAPayer && (
                  <p className="text-xs text-destructive">⚠ Montant insuffisant</p>
                )}

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
                  <input className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="..." />
                </div>

                <button
                  onClick={() => payPreInvoice.mutate({ venteId: selectedPI.id, modePaiement: payMode, montantPaye: payMode === "especes" ? montantRecu : undefined })}
                  disabled={payPreInvoice.isPending || (payMode === "especes" && montantRecu < totalAPayer)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-success to-success py-3 text-sm font-semibold text-foreground hover:from-success/90 hover:to-success/90 disabled:opacity-50 transition-all shadow-lg"
                >
                  <CheckCircle size={18} />
                  {payPreInvoice.isPending ? "Traitement..." : `Confirmer l'encaissement (${totalAPayer.toLocaleString()} F)`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal annulation */}
      <AnimatePresence>
        {showVoidModal && selectedPI && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowVoidModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm rounded-2xl bg-card p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/20"><Trash2 size={20} className="text-destructive" /></div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">Annuler la facture</h2>
                  <p className="text-xs text-muted-foreground">{selectedPI.reference}</p>
                </div>
              </div>
              <div className="space-y-3 mb-4">
                <div className="rounded-lg bg-warning/10 border border-warning/20 px-3 py-2 text-xs text-warning-foreground">
                  Les stocks seront remis à jour. Cette action est irréversible.
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Motif d&apos;annulation</label>
                  <textarea rows={3} autoFocus
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-destructive/20"
                    value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
                    placeholder="Ex: Erreur de saisie, annulation client..." />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowVoidModal(false)}
                  className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                  Retour
                </button>
                <button
                  onClick={() => voidSale.mutate({ venteId: selectedPI.id, motif: voidReason || "Annulation" })}
                  disabled={voidSale.isPending || !voidReason.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-destructive py-2 text-sm font-semibold text-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors">
                  <Trash2 size={16} />
                  {voidSale.isPending ? "Annulation..." : "Confirmer l'annulation"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal apport/retrait */}
      <AnimatePresence>
        {showFundModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowFundModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm rounded-2xl bg-card p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${fundType === "apport" ? "bg-success/20" : "bg-destructive/20"}`}>
                  {fundType === "apport" ? <ArrowUpFromLine size={20} className="text-success" /> : <ArrowDownFromLine size={20} className="text-destructive" />}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">{fundType === "apport" ? "Apport de fonds" : "Retrait de fonds"}</h2>
                  <p className="text-xs text-muted-foreground">{fundType === "apport" ? "Entrée de fonds supplémentaire" : "Sortie de fonds de la caisse"}</p>
                </div>
              </div>
              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setFundType("apport")}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${fundType === "apport" ? "border-success/30 bg-success/10 text-success" : "border-border text-muted-foreground hover:bg-muted"}`}>
                    <ArrowUpFromLine size={14} /> Apport
                  </button>
                  <button onClick={() => setFundType("retrait")}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${fundType === "retrait" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border text-muted-foreground hover:bg-muted"}`}>
                    <ArrowDownFromLine size={14} /> Retrait
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Montant (FCFA)</label>
                  <input type="number" min={0} autoFocus
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    value={fundAmount || ""} onChange={(e) => setFundAmount(Number(e.target.value) || 0)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Motif</label>
                  <input
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    value={fundMotif} onChange={(e) => setFundMotif(e.target.value)}
                    placeholder={fundType === "apport" ? "Ex: Complément de fonds, espèces déposées..." : "Ex: Remboursement, retrait pour dépôt banque..."} />
                </div>
                {session && (
                  <p className="text-xs text-muted-foreground">
                    Solde actuel: <span className="font-semibold">{Number(session.soldeActuel ?? 0).toLocaleString()} F</span>
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowFundModal(false)}
                  className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                  Annuler
                </button>
                <button onClick={() => {
                  if (!fundAmount || !fundMotif.trim()) { toast.error("Montant et motif requis"); return; }
                  recordMovementMut.mutate({ caisseId: session.caisseId, type: fundType, montant: fundAmount, motif: fundMotif.trim() });
                }} disabled={recordMovementMut.isPending || !fundAmount || !fundMotif.trim()}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-foreground hover:opacity-90 disabled:opacity-50 transition-colors ${fundType === "apport" ? "bg-success" : "bg-destructive"}`}>
                  {recordMovementMut.isPending ? "Enregistrement..." : fundType === "apport" ? "Enregistrer l'apport" : "Enregistrer le retrait"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal paiement fournisseur */}
      <AnimatePresence>
        {showFourModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowFourModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl bg-card p-6 dark:bg-card" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 dark:bg-primary/30"><HandCoins size={20} className="text-primary" /></div>
                <div>
                  <h2 className="text-lg font-bold text-foreground dark:text-foreground">Payer un fournisseur</h2>
                  <p className="text-xs text-muted-foreground">
                    Débit de la caisse <span className="font-medium text-foreground">{session ? `${session.caisseId ? `#${session.caisseId}` : ""} (${Number(session.soldeActuel ?? 0).toLocaleString()} F)` : "— fermée"}</span>
                  </p>
                </div>
              </div>
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Dette à payer</label>
                  <select
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 dark:bg-muted dark:border-border"
                    value={fourDetteId ?? ""}
                    onChange={(e) => { setFourDetteId(e.target.value ? Number(e.target.value) : null); setFourMontant(""); }}>
                    <option value="">Sélectionner...</option>
                    {(dettesFournisseurs ?? [])
                      .filter((d: any) => d.statut !== "paye")
                      .map((d: any) => (
                        <option key={d.id} value={d.id}>
                          {d.fournisseurNom} — {Number(d.montantRestant ?? 0).toLocaleString()} F ({d.reference})
                        </option>
                      ))}
                  </select>
                  {(!dettesFournisseurs || dettesFournisseurs.filter((d: any) => d.statut !== "paye").length === 0) && (
                    <p className="mt-1 text-xs text-muted-foreground">Aucune dette fournisseur impayée.</p>
                  )}
                </div>
                {fourDetteId != null && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Montant (FCFA)</label>
                      <input type="number" min={1} step="0.01"
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 dark:bg-muted dark:border-border"
                        value={fourMontant} onChange={(e) => setFourMontant(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Mode de paiement</label>
                      <select
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 dark:bg-muted dark:border-border"
                        value={fourMode} onChange={(e) => setFourMode(e.target.value)}>
                        <option value="especes">Espèces</option>
                        <option value="virement">Virement</option>
                        <option value="cheque">Chèque</option>
                        <option value="mobile_money">Mobile Money</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowFourModal(false)}
                  className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors dark:border-border dark:text-muted-foreground">
                  Annuler
                </button>
                <button
                  onClick={() => {
                    if (!fourDetteId) { toast.error("Sélectionnez une dette"); return; }
                    const montant = Number(fourMontant);
                    if (!montant || montant <= 0) { toast.error("Montant invalide"); return; }
                    payerDetteFour.mutate({
                      detteId: fourDetteId,
                      montant: String(montant),
                      modePaiement: fourMode,
                      caisseId: session?.caisseId ? Number(session.caisseId) : undefined,
                    });
                  }}
                  disabled={payerDetteFour.isPending || !session || !fourDetteId || !Number(fourMontant)}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {payerDetteFour.isPending ? <RefreshCw size={14} className="animate-spin" /> : <HandCoins size={14} />}
                  {payerDetteFour.isPending ? "Traitement..." : "Confirmer le paiement"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal dépense */}
      <AnimatePresence>
        {showExpenseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowExpenseModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm rounded-2xl bg-card p-6 dark:bg-card" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/20 dark:bg-destructive/30"><TrendingDown size={20} className="text-destructive" /></div>
                <div>
                  <h2 className="text-lg font-bold text-foreground dark:text-foreground">Nouvelle dépense</h2>
                  <p className="text-xs text-muted-foreground">Sortie de fonds</p>
                </div>
              </div>
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Montant (FCFA)</label>
                  <input type="number" min={0} autoFocus
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-destructive/20 dark:bg-muted dark:border-border"
                    value={expenseAmount || ""} onChange={(e) => setExpenseAmount(Number(e.target.value) || 0)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Catégorie</label>
                  <select
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-destructive/20 dark:bg-muted dark:border-border"
                    value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}>
                    <option value="">Sélectionner...</option>
                    <option value="loyer">Loyer</option>
                    <option value="electricite">Électricité</option>
                    <option value="eau">Eau</option>
                    <option value="fournisseur">Fournisseur</option>
                    <option value="transport">Transport</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="fourniture">Fourniture de bureau</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
                  <textarea rows={2}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-destructive/20 dark:bg-muted dark:border-border resize-none"
                    value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowExpenseModal(false)}
                  className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors dark:border-border dark:text-muted-foreground">
                  Annuler
                </button>
                {hasPermission("caisse.mouvement") && (
                  <button onClick={() => {
                    if (!expenseAmount || !expenseCategory) { toast.error("Montant et catégorie requis"); return; }
                    expenseMut.mutate({ caisseId: session.caisseId, montant: expenseAmount, categorie: expenseCategory, description: expenseDesc || undefined });
                  }} disabled={expenseMut.isPending || !expenseAmount || !expenseCategory}
                    className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors">
                    {expenseMut.isPending ? "Enregistrement..." : "Enregistrer"}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal session */}
      <AnimatePresence>
        {showSessionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowSessionModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm rounded-2xl bg-card p-6 dark:bg-card" onClick={(e) => e.stopPropagation()}>
              {session ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/20 dark:bg-success/30"><Wallet size={20} className="text-success" /></div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground dark:text-foreground">Fermer la caisse</h2>
                      <p className="text-xs text-muted-foreground">{session.libelle}</p>
                    </div>
                  </div>

                  {/* Récapitulatif */}
                  {sessionSummary && (
                    <div className="rounded-xl bg-muted dark:bg-muted/50 p-3 mb-4 space-y-1.5 text-xs">
                      <div className="flex justify-between text-muted-foreground dark:text-muted-foreground">
                        <span>Total ventes</span>
                        <span className="font-semibold text-success">+{Number(sessionSummary.recap?.totalVentes ?? 0).toLocaleString()} F</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground dark:text-muted-foreground">
                        <span>Total dépenses</span>
                        <span className="font-semibold text-destructive">-{Number(sessionSummary.recap?.totalDepenses ?? 0).toLocaleString()} F</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground dark:text-muted-foreground">
                        <span>Apports</span>
                        <span className="font-semibold text-success">+{Number(sessionSummary.recap?.totalApports ?? 0).toLocaleString()} F</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground dark:text-muted-foreground">
                        <span>Retraits</span>
                        <span className="font-semibold text-destructive">-{Number(sessionSummary.recap?.totalRetraits ?? 0).toLocaleString()} F</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground dark:text-muted-foreground">
                        <span>Entrées (transferts)</span>
                        <span className="font-semibold text-success">+{Number(sessionSummary.recap?.totalEntrees ?? 0).toLocaleString()} F</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground dark:text-muted-foreground">
                        <span>Sorties (transferts)</span>
                        <span className="font-semibold text-destructive">-{Number(sessionSummary.recap?.totalSorties ?? 0).toLocaleString()} F</span>
                      </div>
                      <div className="border-t border-border dark:border-border pt-1.5 flex justify-between text-foreground dark:text-foreground">
                        <span className="font-semibold">Solde théorique</span>
                        <span className="font-bold">{(
                          Number(sessionSummary.session?.soldeOuverture ?? 0) +
                          Number(sessionSummary.recap?.totalVentes ?? 0) -
                          Number(sessionSummary.recap?.totalDepenses ?? 0) +
                          Number(sessionSummary.recap?.totalApports ?? 0) -
                          Number(sessionSummary.recap?.totalRetraits ?? 0) +
                          Number(sessionSummary.recap?.totalEntrees ?? 0) -
                          Number(sessionSummary.recap?.totalSorties ?? 0)
                        ).toLocaleString()} F</span>
                      </div>
                    </div>
                  )}
                  {!sessionSummary && (
                    <div className="h-10 animate-pulse rounded-xl bg-muted dark:bg-muted mb-4" />
                  )}

                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Solde d&apos;ouverture</span><span className="font-medium">{Number(session.soldeOuverture ?? 0).toLocaleString()} F</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Solde actuel</span><span className="font-bold text-success">{Number(session.soldeActuel ?? 0).toLocaleString()} F</span></div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Solde de fermeture</label>
                      <input type="number" className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 dark:bg-muted dark:border-border" value={sessionClosingBal} onChange={(e) => setSessionClosingBal(Number(e.target.value) || 0)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
                      <input className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 dark:bg-muted dark:border-border" value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} />
                    </div>
                  </div>
                  {hasPermission("caisse.fermer") && (
                    <button onClick={() => closeSessionMut.mutate({ caisseId: session.caisseId ?? selectedCaisseId ?? undefined, closingBalance: sessionClosingBal, notes: sessionNotes || undefined })} disabled={closeSessionMut.isPending}
                      className="w-full rounded-xl bg-destructive py-2.5 text-sm font-semibold text-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors">
                      {closeSessionMut.isPending ? "Fermeture..." : "Fermer la caisse"}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 dark:bg-primary/30"><LogIn size={20} className="text-primary" /></div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground dark:text-foreground">Ouvrir la caisse</h2>
                      <p className="text-xs text-muted-foreground">Nouvelle session</p>
                    </div>
                  </div>
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Fond de caisse (FCFA)</label>
                      <input type="number" min={0} className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 dark:bg-muted dark:border-border" value={sessionOpeningBal} onChange={(e) => setSessionOpeningBal(Number(e.target.value) || 0)} />
                    </div>
                  </div>
                  {hasPermission("caisse.ouvrir") && (
                    <button onClick={() => openSessionMut.mutate({ openingBalance: sessionOpeningBal, caisseId: selectedCaisseId ?? undefined })} disabled={openSessionMut.isPending}
                      className="w-full rounded-xl bg-success py-2.5 text-sm font-semibold text-foreground hover:bg-success/90 disabled:opacity-50 transition-colors">
                      {openSessionMut.isPending ? "Ouverture..." : "Ouvrir la caisse"}
                    </button>
                  )}
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Invoice preview */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #invoice-preview, #invoice-preview * { visibility: visible; }
          #invoice-preview { position: fixed; left: 0; top: 0; width: 100%; padding: 20px; background: #fff; font-size: 12px; }
          #invoice-preview .no-print { display: none !important; }
          @page { margin: 15mm; }
        }
      `}</style>
      <AnimatePresence>
        {invoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setInvoice(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-3xl rounded-2xl bg-card shadow-2xl overflow-y-auto max-h-[95vh]" onClick={(e) => e.stopPropagation()}>

              {/* Print actions bar */}
              <div className="no-print flex items-center justify-between bg-card px-6 py-4 rounded-t-2xl">
                <div className="flex items-center gap-2 text-foreground">
                  <FileText size={18} />
                  <span className="text-sm font-semibold">Aperçu facture</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-foreground hover:bg-accent/80 transition-colors">
                    <Printer size={14} /> Imprimer
                  </button>
                  <button onClick={() => setInvoice(null)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-foreground hover:bg-accent/80 transition-colors">
                    <X size={14} /> Fermer
                  </button>
                </div>
              </div>

              {/* Invoice content */}
              <div id="invoice-preview" className="px-8 py-6">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-primary pb-5 mb-5">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      {orgInfo.logoUrl ? (
                        <img src={orgInfo.logoUrl} alt="Logo" className="h-12 w-12 shrink-0 rounded-lg object-contain" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-foreground">
                          <Building2 size={22} />
                        </div>
                      )}
                      <div>
                        <h1 className="text-xl font-bold text-foreground uppercase tracking-tight">{orgInfo.name}</h1>
                        {champsVisibles.slogan !== false && orgInfo.slogan && <p className="text-xs text-primary font-medium">{orgInfo.slogan}</p>}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground space-y-0.5 mt-2">
                      {champsVisibles.ville !== false && adresseLigne && <p>{adresseLigne}</p>}
                      {contactLigne && <p>{contactLigne}</p>}
                      {champsVisibles.identifiantsLegaux !== false && legaux && <p>{legaux}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2 mb-2">
                      <p className="text-[10px] text-primary font-medium uppercase tracking-wider">Facture</p>
                      <p className="text-lg font-bold font-mono text-primary">{invoice.reference}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Date: {invoice.date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                </div>

                {/* Client */}
                <div className="mb-5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Facturé à</p>
                  <div className="bg-muted rounded-lg px-3 py-2 border border-border">
                    <p className="text-sm font-semibold text-foreground">{invoice.clientNom || "Client Divers"}</p>
                    {invoice.clientId && <p className="text-xs text-muted-foreground">ID: {invoice.clientId}</p>}
                  </div>
                </div>

                {/* Products table */}
                <table className="w-full text-xs mb-5">
                  <thead>
                    <tr className="bg-muted text-foreground">
                      <th className="text-left py-2.5 px-3 font-medium rounded-tl-lg w-[50%]">Désignation</th>
                      <th className="text-center py-2.5 px-3 font-medium">Qté</th>
                      <th className="text-right py-2.5 px-3 font-medium">P.U.</th>
                      <th className="text-right py-2.5 px-3 font-medium rounded-tr-lg">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.lignes.map((l, i) => {
                      const nom = invoice.productNames[l.produitId];
                      return (
                        <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/50"}>
                          <td className="py-2 px-3 text-foreground/60">{nom ?? `Article #${l.produitId.substring(0, 8)}`}</td>
                          <td className="py-2 px-3 text-center text-foreground/60">{l.quantite}</td>
                          <td className="py-2 px-3 text-right text-muted-foreground">{l.prixUnitaire.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right font-medium text-foreground">{l.total.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="flex justify-end mb-5">
                  <div className="w-64 space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Sous-total</span>
                      <span>{invoice.total.toLocaleString()} {deviseLabel}</span>
                    </div>
                    {invoice.remise > 0 && champsVisibles.remise !== false && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Remise</span>
                        <span className="text-destructive">- {invoice.remise.toLocaleString()} {deviseLabel}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Net à payer</span>
                      <span className="font-semibold text-foreground">{Math.max(0, invoice.total - invoice.remise).toLocaleString()} {deviseLabel}</span>
                    </div>
                    <div className="border-t border-border pt-1.5 flex justify-between text-base font-bold text-primary">
                      <span>Total dû</span>
                      <span>{Math.max(0, invoice.total - invoice.remise).toLocaleString()} {deviseLabel}</span>
                    </div>
                    {champsVisibles.tva !== false && orgInfo.tvaDefaut > 0 && (
                      <p className="text-[10px] text-muted-foreground text-right">TVA incluse ({orgInfo.tvaDefaut}%)</p>
                    )}
                  </div>
                </div>

                {/* Payment info */}
                <div className="bg-success/10 border border-success/20 rounded-lg px-4 py-3 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle size={14} className="text-success" />
                    <span className="text-xs font-semibold text-success uppercase tracking-wider">Paiement effectué</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Mode :</span> <span className="font-medium text-foreground/60">{MODE_LABELS[invoice.modePaiement] ?? invoice.modePaiement}</span></div>
                    <div><span className="text-muted-foreground">Montant reçu :</span> <span className="font-medium text-foreground/60">{invoice.montantRecu.toLocaleString()} {deviseLabel}</span></div>
                    {invoice.monnaie > 0 && (
                      <div><span className="text-muted-foreground">Monnaie rendue :</span> <span className="font-medium text-success">{invoice.monnaie.toLocaleString()} {deviseLabel}</span></div>
                    )}
                  </div>
                </div>

                {invoice.notes && (
                  <div className="text-xs text-muted-foreground mb-4 italic">
                    Note: {invoice.notes}
                  </div>
                )}

                {/* Footer */}
                <div className="border-t border-border pt-4 text-center text-[10px] text-muted-foreground space-y-1">
                  <p className="font-medium text-muted-foreground">{orgInfo.name}{orgInfo.slogan ? ` - ${orgInfo.slogan}` : ""}</p>
                  {champsVisibles.identifiantsLegaux !== false && legaux && <p>{legaux}</p>}
                  <p>{adresseLigne}{orgInfo.phone ? ` | Tel: ${orgInfo.phone}` : ""}</p>
                  {orgInfo.mentionPiedFacture && <p>{orgInfo.mentionPiedFacture}</p>}
                  {orgInfo.politiqueRetour && <p>{orgInfo.politiqueRetour}</p>}
                  {!orgInfo.mentionPiedFacture && !orgInfo.politiqueRetour && <p className="text-foreground/80">Merci de votre confiance !</p>}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Impression : n'imprimer que la zone facture
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const _style = document.createElement("style");
  _style.textContent = `@media print {
  body * { visibility: hidden !important; }
  #invoice-print-area, #invoice-print-area * { visibility: visible !important; }
  #invoice-print-area {
    position: absolute !important;
    left: 0; top: 0;
    width: 100% !important;
    max-height: none !important;
    overflow: visible !important;
    box-shadow: none !important;
  }
}`;
  document.head.appendChild(_style);
}
