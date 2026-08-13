"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Plus, Search, Truck, ArrowRight, CheckCircle, Clock, AlertTriangle, X, Package, MapPin } from "lucide-react";
import { toast } from "sonner";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function TransfersPage() {
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [formData, setFormData] = useState({
    fromPosId: "",
    toPosId: "",
    productId: "",
    quantity: 0,
    reason: ""
  });

  const utils = api.useUtils();
  const { data: transfers, isLoading } = api.inventory.getTransfers.useQuery();
  const { data: posList } = api.settings.pos.list.useQuery();
  const { data: products } = api.catalog.listProducts.useQuery();

  const createTransfer = api.inventory.transferStock.useMutation({
    onSuccess: () => {
      utils.inventory.getTransfers.invalidate();
      setShowModal(false);
      setFormData({ fromPosId: "", toPosId: "", productId: "", quantity: 0, reason: "" });
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const updateTransferStatus = api.inventory.shipTransfer.useMutation({
    onSuccess: () => utils.inventory.getTransfers.invalidate(),
    onError: (e: { message: string }) => toast.error(e.message),
  });

  function getStatusBadge(status: string) {
    switch (status) {
      case "PENDING": return { icon: <Clock size={14} />, text: "En attente", color: "bg-warning/10 text-warning-foreground" };
      case "IN_TRANSIT": return { icon: <Truck size={14} />, text: "En transit", color: "bg-primary/10 text-primary" };
      case "COMPLETED": return { icon: <CheckCircle size={14} />, text: "Terminé", color: "bg-success/10 text-success-foreground" };
      case "CANCELLED": return { icon: <X size={14} />, text: "Annulé", color: "bg-destructive/10 text-destructive" };
      default: return { icon: <Clock size={14} />, text: status, color: "bg-muted text-foreground/80" };
    }
  }

  const handleStatusUpdate = (transferId: string, newStatus: string) => {
    updateTransferStatus.mutate({ transferId });
  };

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Transferts Inter-Sites</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gérez les mouvements de stock entre vos points de vente</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all shadow-sm">
          <Plus size={16} /> Nouveau transfert
        </button>
      </div>

      {/* Search */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
        <input
          placeholder="Rechercher par produit, site..."
          className="w-full rounded-xl border border-input bg-background pl-10 pr-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />
      </div>

      {/* Transfers Table */}
      <motion.div variants={container} initial="hidden" animate="show" className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Transfert</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Produit</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">De → Vers</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Quantité</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Statut</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-4 py-4"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
                ))
              ) : transfers?.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  <Truck size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Aucun transfert</p>
                  <p className="text-sm mt-1">Créez votre premier transfert inter-sites</p>
                </td></tr>
              ) : (
                transfers?.filter((transfer: NonNullable<typeof transfers>[number]) =>
                  search === "" ||
                  transfer.productTitle?.toLowerCase().includes(search.toLowerCase()) ||
                  transfer.fromPosName?.toLowerCase().includes(search.toLowerCase()) ||
                  transfer.toPosName?.toLowerCase().includes(search.toLowerCase())
                ).map((transfer: NonNullable<typeof transfers>[number]) => {
                  const status = getStatusBadge(transfer.status);
                  return (
                    <motion.tr key={transfer.id} variants={item} className="hover:bg-accent transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-foreground">#{transfer.id.slice(-8)}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-sm text-foreground/80">{transfer.productTitle}</p>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground/80">{transfer.fromPosName}</span>
                          <ArrowRight size={14} className="text-muted-foreground" />
                          <span className="text-sm text-foreground/80">{transfer.toPosName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold font-mono text-foreground">{transfer.quantity}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>
                          {status.icon} {status.text}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-foreground/80">
                          {new Date(transfer.createdAt).toLocaleDateString("fr-FR")}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {transfer.status === "PENDING" && (
                          <button
                            onClick={() => handleStatusUpdate(transfer.id, "IN_TRANSIT")}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Truck size={14} /> En transit
                          </button>
                        )}
                        {transfer.status === "IN_TRANSIT" && (
                          <button
                            onClick={() => handleStatusUpdate(transfer.id, "COMPLETED")}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-success-foreground hover:bg-success/10 transition-colors"
                          >
                            <CheckCircle size={14} /> Terminer
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Create Transfer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg rounded-2xl bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Nouveau transfert</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 hover:bg-accent"><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createTransfer.mutate(formData); }} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">Site d'origine</label>
                  <select className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={formData.fromPosId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, fromPosId: e.target.value })} required>
                    <option value="">Sélectionner</option>
                    {posList?.map((pos: NonNullable<typeof posList>[number]) => <option key={pos.id} value={pos.id}>{pos.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">Site de destination</label>
                  <select className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={formData.toPosId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, toPosId: e.target.value })} required>
                    <option value="">Sélectionner</option>
                    {posList?.filter((pos: NonNullable<typeof posList>[number]) => pos.id !== formData.fromPosId).map((pos: NonNullable<typeof posList>[number]) => <option key={pos.id} value={pos.id}>{pos.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Produit</label>
                <select className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={formData.productId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, productId: e.target.value })} required>
                  <option value="">Sélectionner un produit</option>
                  {products?.map((product: NonNullable<typeof products>[number]) => (
                    <option key={product.id} value={product.id}>
                       {product.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Quantité</label>
                <input type="number" min="1" className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={formData.quantity} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Motif</label>
                <textarea rows={3} placeholder="Raison du transfert..." className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" value={formData.reason} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, reason: e.target.value })} />
              </div>

              <button type="submit" disabled={createTransfer.isPending} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {createTransfer.isPending ? "Création..." : "Créer le transfert"}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}