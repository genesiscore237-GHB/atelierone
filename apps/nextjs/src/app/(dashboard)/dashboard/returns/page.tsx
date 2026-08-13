"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Search, RotateCcw, Receipt, Package, Trash2, CreditCard, DollarSign, CheckCircle, X, Eye } from "lucide-react";
import { toast } from "sonner";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function ReturnsPage() {
  const [activeTab, setActiveTab] = useState<"search" | "returns" | "credits">("search");
  const [ticketId, setTicketId] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [useCreditModal, setUseCreditModal] = useState<{ credit: any } | null>(null);
  const [creditAmount, setCreditAmount] = useState(0);
  const [returnForm, setReturnForm] = useState({
    returnType: "REFUND" as "REFUND" | "CREDIT" | "EXCHANGE",
    disposition: "STOCK" as "STOCK" | "SCRAP" | "EXCHANGE" | "CREDIT" | "REFUND",
    reason: "",
    items: [] as Array<{
      saleItemId: string;
      quantity: number;
      reason: string;
      condition: "GOOD" | "DAMAGED" | "EXPIRED";
    }>
  });

  const utils = api.useUtils();

  const searchTicket = api.returns.searchTicket.useQuery(
    { ticketId },
    { enabled: !!ticketId && ticketId.length > 5 }
  );

  const { data: returns, isLoading: returnsLoading } = api.returns.getReturns.useQuery({}, { enabled: activeTab === "returns" });
  const { data: credits, isLoading: creditsLoading } = api.returns.getCredits.useQuery({}, { enabled: activeTab === "credits" });

  const createReturn = api.returns.createReturn.useMutation({
    onSuccess: () => {
      utils.returns.getReturns.invalidate();
      setShowReturnModal(false);
      setSelectedTicket(null);
      setReturnForm({
        returnType: "REFUND",
        disposition: "STOCK",
        reason: "",
        items: []
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const useCredit = api.returns.useCredit.useMutation({
    onSuccess: () => utils.returns.getCredits.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  function getReturnTypeBadge(type: string) {
    switch (type) {
      case "REFUND": return { icon: <DollarSign size={14} />, text: "Remboursement", color: "bg-primary/10 text-primary" };
      case "CREDIT": return { icon: <CreditCard size={14} />, text: "Avoir", color: "bg-success/10 text-success-foreground" };
      case "EXCHANGE": return { icon: <RotateCcw size={14} />, text: "Échange", color: "bg-warning/10 text-warning-foreground" };
      default: return { icon: <Receipt size={14} />, text: type, color: "bg-muted text-muted-foreground" };
    }
  }

  const handleCreateReturn = (ticket: any) => {
    setSelectedTicket(ticket);
    // Initialize return form with all items
    setReturnForm({
      returnType: "REFUND",
      disposition: "STOCK",
      reason: "",
      items: ticket.items?.map((item: any) => ({
        saleItemId: item.id,
        quantity: 1, // Default to 1, user can change
        reason: "",
        condition: "GOOD" as const
      })) || []
    });
    setShowReturnModal(true);
  };

  const updateReturnItem = (index: number, field: string, value: any) => {
    const newItems = [...returnForm.items];
    newItems[index] = { ...newItems[index], [field]: value } as any;
    setReturnForm({ ...returnForm, items: newItems });
  };

  const handleSubmitReturn = () => {
    if (!selectedTicket) return;

    createReturn.mutate({
      saleId: selectedTicket.id,
      returnType: returnForm.returnType,
      disposition: returnForm.disposition,
      reason: returnForm.reason,
      items: returnForm.items.filter(item => item.quantity > 0)
    });
  };

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Retours & Remboursements</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gérez les retours clients et les avoirs</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex rounded-lg bg-muted p-1">
        <button
          onClick={() => setActiveTab("search")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "search"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Recherche Ticket
        </button>
        <button
          onClick={() => setActiveTab("returns")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "returns"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Historique Retours
        </button>
        <button
          onClick={() => setActiveTab("credits")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "credits"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Avoirs
        </button>
      </div>

      {/* Search Ticket Tab */}
      {activeTab === "search" && (
        <div className="space-y-6">
          <div className="max-w-md">
            <label className="block text-sm font-medium text-foreground/80 mb-2">
              Numéro de ticket ou ID de vente
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input
                placeholder="Ex: SALE-123 ou numéro de ticket"
                className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
              />
            </div>
          </div>

          {/* Search Results */}
          {searchTicket.data && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-background p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">Ticket trouvé</h3>
                <button
                  onClick={() => handleCreateReturn(searchTicket.data)}
                  className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary px-4 py-2 text-sm font-semibold text-foreground hover:from-primary/80 hover:to-primary/80 transition-all"
                >
                  <RotateCcw size={16} /> Créer retour
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">ID Vente</p>
                  <p className="font-mono text-foreground">{(searchTicket.data?.id) as string}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                   <p className="text-foreground">{new Date(searchTicket.data.createdAt).toLocaleDateString("fr-FR")}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="font-semibold text-foreground">{(searchTicket.data?.totalAmount) as number} FCFA</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Statut</p>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                    (searchTicket.data?.status as string) === "ACTIVE" ? "bg-success/10 text-success-foreground" : "bg-destructive/10 text-destructive"
                  }`}>
                    {(searchTicket.data?.status as string) === "ACTIVE" ? <CheckCircle size={12} /> : <X size={12} />}
                    {(searchTicket.data?.status) as string}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-foreground/80">Articles</h4>
                {(searchTicket.data?.items as any[])?.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.product.title}</p>
                      <p className="text-xs text-muted-foreground">Qté: {item.quantity} × {item.unitPrice} F</p>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{item.quantity * item.unitPrice} F</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {searchTicket.isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}
        </div>
      )}

      {/* Returns History Tab */}
      {activeTab === "returns" && (
        <motion.div variants={container} initial="hidden" animate="show" className="rounded-xl border border-border bg-background overflow-hidden ">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Retour</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Vente</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Montant</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {returnsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="px-4 py-4"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : returns?.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <Receipt size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Aucun retour</p>
                    <p className="text-sm mt-1">Les retours apparaîtront ici</p>
                  </td></tr>
                ) : (
                  returns?.map((returnItem) => {
                    const typeBadge = getReturnTypeBadge(returnItem.returnType);
                    return (
                      <motion.tr key={returnItem.id} variants={item} className="hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-foreground">#{returnItem.id.slice(-8)}</p>
                          {returnItem.reason && <p className="text-xs text-muted-foreground">{returnItem.reason}</p>}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <p className="text-sm text-muted-foreground">#{returnItem.saleId.slice(-8)}</p>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${typeBadge.color}`}>
                            {typeBadge.icon} {typeBadge.text}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold font-mono text-foreground">{returnItem.totalAmount} F</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-muted-foreground">
                            {new Date(returnItem.createdAt).toLocaleDateString("fr-FR")}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                            <Eye size={14} /> Détails
                          </button>
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

      {/* Credits Tab */}
      {activeTab === "credits" && (
        <motion.div variants={container} initial="hidden" animate="show" className="rounded-xl border border-border bg-background overflow-hidden ">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Avoir</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Retour</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Montant</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Utilisé</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Statut</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {creditsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="px-4 py-4"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : credits?.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Aucun avoir</p>
                    <p className="text-sm mt-1">Les avoirs apparaîtront ici</p>
                  </td></tr>
                ) : (
                  credits?.map((credit) => (
                    <motion.tr key={credit.id} variants={item} className="hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-foreground">#{credit.id.slice(-8)}</p>
                        <p className="text-xs text-muted-foreground">
                          Créé le {new Date(credit.createdAt).toLocaleDateString("fr-FR")}
                        </p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-sm text-muted-foreground">#{credit.return?.saleId?.slice(-8)}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold font-mono text-foreground">{credit.amount} F</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-mono text-muted-foreground">
                          {(credit as any).usedAmount || 0} F
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                          credit.status === "ACTIVE" ? "bg-success/10 text-success-foreground" : "bg-muted text-muted-foreground"
                        }`}>
                          {credit.status === "ACTIVE" ? <CheckCircle size={12} /> : <X size={12} />}
                          {credit.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {credit.status === "ACTIVE" && (
                          <button
                            onClick={() => {
                              setCreditAmount(credit.amount);
                              setUseCreditModal({ credit });
                            }}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-success hover:bg-success/10 transition-colors"
                          >
                            Utiliser
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Return Modal */}
      {showReturnModal && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowReturnModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-2xl rounded-2xl bg-background p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Créer un retour</h2>
              <button onClick={() => setShowReturnModal(false)} className="rounded-lg p-1.5 hover:bg-accent"><X size={18} /></button>
            </div>

            <div className="space-y-6">
              {/* Return Options */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-2">Type de retour</label>
                  <select
                    className="w-full rounded-lg border border-border px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    value={returnForm.returnType}
                    onChange={(e) => setReturnForm({ ...returnForm, returnType: e.target.value as "REFUND" | "CREDIT" | "EXCHANGE" })}
                  >
                    <option value="REFUND">Remboursement</option>
                    <option value="CREDIT">Avoir</option>
                    <option value="EXCHANGE">Échange</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-2">Disposition stock</label>
                  <select
                    className="w-full rounded-lg border border-border px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    value={returnForm.disposition}
                    onChange={(e) => setReturnForm({ ...returnForm, disposition: e.target.value as "STOCK" | "SCRAP" | "EXCHANGE" | "CREDIT" | "REFUND" })}
                  >
                    <option value="STOCK">Remettre en stock</option>
                    <option value="SCRAP">Rebut/destruction</option>
                    <option value="EXCHANGE">Pour échange</option>
                    <option value="CREDIT">Avoir</option>
                    <option value="REFUND">Remboursement</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">Motif du retour</label>
                <textarea
                  className="w-full rounded-lg border border-border px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  rows={3}
                  value={returnForm.reason}
                  onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })}
                  placeholder="Expliquez la raison du retour..."
                />
              </div>

              {/* Return Items */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground/80">Articles à retourner</h3>
                {selectedTicket.items?.map((item: any, index: number) => {
                  const returnItem = returnForm.items[index];
                  return (
                    <div key={item.id} className="p-4 rounded-lg border border-border">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.product.title}</p>
                          <p className="text-xs text-muted-foreground">Prix: {item.unitPrice} F × {item.quantity} = {(item.unitPrice * item.quantity).toLocaleString()} F</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Quantité</label>
                          <input
                            type="number"
                            min="0"
                            max={item.quantity}
                            className="w-full rounded border border-border px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            value={returnItem?.quantity || 0}
                            onChange={(e) => updateReturnItem(index, 'quantity', parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">État</label>
                          <select
                            className="w-full rounded border border-border px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            value={returnItem?.condition || "GOOD"}
                            onChange={(e) => updateReturnItem(index, 'condition', e.target.value)}
                          >
                            <option value="GOOD">Bon état</option>
                            <option value="DAMAGED">Endommagé</option>
                            <option value="EXPIRED">Périmé</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Motif</label>
                          <input
                            className="w-full rounded border border-border px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            value={returnItem?.reason || ""}
                            onChange={(e) => updateReturnItem(index, 'reason', e.target.value)}
                            placeholder="Motif spécifique..."
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  Total retour: <span className="font-semibold font-mono">
                    {returnForm.items.reduce((sum, item, index) => {
                      const saleItem = selectedTicket.items?.[index];
                      return sum + (item.quantity * (saleItem?.unitPrice || 0));
                    }, 0).toLocaleString()} FCFA
                  </span>
                </div>
                <button
                  onClick={handleSubmitReturn}
                  disabled={createReturn.isPending || !returnForm.items.some(item => item.quantity > 0)}
                  className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {createReturn.isPending ? "Traitement..." : "Créer le retour"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Credit Use Modal */}
      {useCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setUseCreditModal(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Utiliser l'avoir</h2>
              <button onClick={() => setUseCreditModal(null)} className="rounded-lg p-1.5 hover:bg-accent"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Avoir disponible</p>
                <p className="text-2xl font-bold text-foreground">{useCreditModal.credit.amount} FCFA</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">Montant à utiliser</label>
                <input
                  type="number"
                  min="1"
                  max={useCreditModal.credit.amount}
                  className="w-full rounded-lg border border-border px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(Math.min(Number(e.target.value) || 0, useCreditModal.credit.amount))}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setUseCreditModal(null)}
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground/80 hover:bg-accent/30 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    if (creditAmount > 0) {
                      useCredit.mutate({
                        creditId: useCreditModal.credit.id,
                        amount: creditAmount,
                        saleId: "",
                      });
                      setUseCreditModal(null);
                    }
                  }}
                  disabled={creditAmount <= 0 || useCredit.isPending}
                  className="flex-1 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-success/90 disabled:opacity-50 transition-colors"
                >
                  {useCredit.isPending ? "Traitement..." : "Confirmer"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}