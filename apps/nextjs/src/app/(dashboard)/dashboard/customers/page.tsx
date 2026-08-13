"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Plus, Search, Users, User, Phone, Mail, Star, Gift, X } from "lucide-react";
import { toast } from "sonner";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<string>("");
  const [showModal, setShowModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    segment: "standard" as "standard" | "premium" | "vip"
  });

  const utils = api.useUtils();
  const { data: customers, isLoading } = api.customers.list.useQuery({
    search: search || undefined,
    segment: segment || undefined
  }, { onError: (e) => toast.error(e.message) });

  const createCustomer = api.customers.create.useMutation({
    onSuccess: () => {
      utils.customers.list.invalidate();
      setShowModal(false);
      setFormData({ name: "", phone: "", email: "", address: "", segment: "standard" });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateCustomer = api.customers.update.useMutation({
    onSuccess: () => {
      utils.customers.list.invalidate();
      setSelectedCustomer(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteCustomer = api.customers.delete.useMutation({
    onSuccess: () => utils.customers.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const updateLoyaltyPoints = api.customers.updateLoyaltyPoints.useMutation({
    onError: (e) => toast.error(e.message),
  });

  function getSegmentBadge(segment: string | null) {
    switch (segment) {
      case "vip": return { icon: <Star size={14} />, text: "VIP", color: "bg-primary/10 text-primary" };
      case "premium": return { icon: <Gift size={14} />, text: "Premium", color: "bg-warning/10 text-warning-foreground" };
      default: return { icon: <User size={14} />, text: "Standard", color: "bg-muted/10 text-muted-foreground" };
    }
  }

  const handleEdit = (customer: any) => {
    setSelectedCustomer(customer.id);
    setFormData({
      name: customer.name,
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      segment: customer.segment
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCustomer) {
      updateCustomer.mutate({
        id: selectedCustomer,
        nom: formData.name,
        telephone: formData.phone,
        email: formData.email,
        adresse: formData.address,
      });
    } else {
      createCustomer.mutate(formData);
    }
  };

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Clients & Fidélité</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gérez votre base clients et programme de fidélité</p>
        </div>
        <button onClick={() => { setSelectedCustomer(null); setShowModal(true); }} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-primary/80 transition-all">
          <Plus size={16} /> Nouveau client
        </button>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input
            placeholder="Rechercher par nom, téléphone..."
            className="w-full rounded-xl border border-border bg-muted/50 pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
        >
          <option value="">Tous les segments</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
          <option value="vip">VIP</option>
        </select>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Total Clients</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{customers?.length || 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2">
            <Star size={20} className="text-primary" />
            <span className="text-sm font-medium text-muted-foreground">VIP</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {customers?.filter(c => c.segment === 'vip').length || 0}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2">
            <Gift size={20} className="text-warning-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Points Fidélité</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
             {customers?.reduce((sum, c) => sum + (c.loyaltyPoints ?? 0), 0).toLocaleString() || 0}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2">
            <User size={20} className="text-success-foreground" />
            <span className="text-sm font-medium text-muted-foreground">CA Moyen</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
             {customers?.length ? Math.round(customers.reduce((sum, c) => sum + (c.totalSpent ?? 0), 0) / customers.length).toLocaleString() : 0} F
          </p>
        </div>
      </div>

      <motion.div variants={container} initial="hidden" animate="show" className="rounded-xl border border-border bg-card/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Segment</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Points</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Dépenses</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-4 py-4"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
                ))
              ) : customers?.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  <Users size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Aucun client</p>
                  <p className="text-sm mt-1">Ajoutez votre premier client</p>
                </td></tr>
              ) : (
                customers?.map((customer) => {
                  const segment = getSegmentBadge(customer.segment);
                  return (
                    <motion.tr key={customer.id} variants={item} className="hover:bg-accent/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-foreground">{customer.name}</p>
                        {customer.lastPurchaseAt && (
                          <p className="text-xs text-muted-foreground">
                            Dernier achat: {new Date(customer.lastPurchaseAt).toLocaleDateString("fr-FR")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="space-y-1">
                          {customer.phone && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone size={12} /> {customer.phone}
                            </div>
                          )}
                          {customer.email && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail size={12} /> {customer.email}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${segment.color}`}>
                          {segment.icon} {segment.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold font-mono text-foreground">{customer.loyaltyPoints ?? 0}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold font-mono text-primary">{(customer.totalSpent ?? 0).toLocaleString()} F</span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => handleEdit(customer)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => {
                            const points = prompt("Nombre de points à définir:");
                            if (points && parseInt(points)) {
                              updateLoyaltyPoints.mutate({
                                id: customer.id,
                                points: parseInt(points)
                              });
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-success-foreground hover:bg-success/10 transition-colors"
                        >
                          Points
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

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] backdrop-blur-sm p-4" onClick={() => setShowModal(false)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg rounded-2xl border border-border bg-background p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">
                {selectedCustomer ? "Modifier le client" : "Nouveau client"}
              </h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                placeholder="Nom complet *"
                className="w-full rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Téléphone"
                  className="rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
                <input
                  placeholder="Email"
                  type="email"
                  className="rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <textarea
                placeholder="Adresse"
                rows={3}
                className="w-full rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
              <select
                className="w-full rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-foreground outline-none focus:border-primary transition-colors"
                value={formData.segment}
                onChange={(e) => setFormData({ ...formData, segment: e.target.value as "standard" | "premium" | "vip" })}
              >
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
                <option value="vip">VIP</option>
              </select>
              <button
                type="submit"
                disabled={createCustomer.isPending || updateCustomer.isPending}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors"
              >
                {createCustomer.isPending || updateCustomer.isPending ? "Enregistrement..." : (selectedCustomer ? "Modifier" : "Créer le client")}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
