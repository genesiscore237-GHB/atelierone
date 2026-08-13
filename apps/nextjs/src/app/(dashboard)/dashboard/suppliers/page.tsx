// src/app/dashboard/suppliers/page.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { Plus, Search, Building, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

export default function SuppliersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ nom: "", contact: "", telephone: "", email: "", adresse: "", ville: "" });

  const utils = api.useUtils();
  const { data: suppliers = [], isLoading } = api.procurement.suppliers.list.useQuery();
  const createSupplier = api.procurement.suppliers.create.useMutation({
    onSuccess: () => { utils.procurement.suppliers.list.invalidate(); setShowModal(false); setFormData({ nom: "", contact: "", telephone: "", email: "", adresse: "", ville: "" }); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = suppliers.filter(s =>
    searchTerm === "" ||
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.contactName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.phone?.includes(searchTerm) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Fournisseurs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez vos relations fournisseurs et leurs informations
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nouveau Fournisseur
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un fournisseur..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Suppliers Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="space-y-3">
                  <div className="h-4 bg-muted rounded animate-pulse" />
                  <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : filtered.length === 0 ? (
          <div className="col-span-full">
            <Card>
              <CardContent className="p-12 text-center">
                <Building className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {searchTerm ? "Aucun résultat" : "Aucun fournisseur"}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {searchTerm ? "Essayez un autre terme de recherche" : "Commencez par ajouter votre premier fournisseur."}
                </p>
                <Button onClick={() => setShowModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter un Fournisseur
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          filtered.map((supplier) => (
            <Card key={supplier.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">{supplier.name}</h3>
                    <p className="text-sm text-muted-foreground">{supplier.contactName || "Non spécifié"}</p>
                  </div>
                  <Badge variant="outline">Actif</Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Phone className="w-4 h-4 mr-2" />
                    {supplier.phone || "Non spécifié"}
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Mail className="w-4 h-4 mr-2" />
                    {supplier.email || "Non spécifié"}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {!isLoading && filtered.length > 0 && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Building className="h-8 w-8 text-primary" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Total Fournisseurs</p>
                  <p className="text-2xl font-bold text-foreground">{filtered.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
                  <span className="text-success-foreground font-bold">A</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Actifs</p>
                  <p className="text-2xl font-bold text-foreground">{filtered.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Supplier Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-background p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-foreground mb-4">Nouveau fournisseur</h2>
            <form onSubmit={e => { e.preventDefault(); createSupplier.mutate(formData); }} className="space-y-3">
              <input placeholder="Nom" className="w-full rounded-lg border border-border px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30" value={formData.nom} onChange={e => setFormData({...formData, nom: e.target.value })} required />
              <input placeholder="Contact" className="w-full rounded-lg border border-border px-4 py-2.5 text-sm outline-none" value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value })} />
              <input placeholder="Téléphone" className="w-full rounded-lg border border-border px-4 py-2.5 text-sm outline-none" value={formData.telephone} onChange={e => setFormData({...formData, telephone: e.target.value })} />
              <input placeholder="Email" type="email" className="w-full rounded-lg border border-border px-4 py-2.5 text-sm outline-none" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value })} />
              <input placeholder="Adresse" className="w-full rounded-lg border border-border px-4 py-2.5 text-sm outline-none" value={formData.adresse} onChange={e => setFormData({...formData, adresse: e.target.value })} />
              <input placeholder="Ville" className="w-full rounded-lg border border-border px-4 py-2.5 text-sm outline-none" value={formData.ville} onChange={e => setFormData({...formData, ville: e.target.value })} />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-muted">Annuler</button>
                <button type="submit" disabled={createSupplier.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50">{createSupplier.isPending ? "Création..." : "Créer"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}