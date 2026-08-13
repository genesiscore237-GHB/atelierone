"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import { Loader2, ShoppingCart } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "~/components/ui/select";
import { usePermissions } from "~/hooks/usePermissions";

type Props = {
  produitId: string;
  titre?: string;
  stock?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * CMD-1 — Dialog partagé « Commander » depuis le catalogue.
 * Préremplit la commande avec les données catalogue (fournisseur principal,
 * prix d'achat fournisseur, quantité suggérée, unité d'achat, TVA) et permet
 * de créer un bon de commande (brouillon ou commande) via procurement.create.
 */
export function CommanderProduitDialog({ produitId, titre, stock, open, onOpenChange }: Props) {
  const { hasPermission } = usePermissions();
  const utils = api.useUtils();

  const { data: product, isLoading: productLoading } = api.catalog.getById.useQuery(
    { id: produitId },
    { enabled: open && !!produitId },
  );
  const { data: suppliers } = api.procurement.suppliers.list.useQuery(undefined, {
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const fournisseurs = product?.fournisseurs ?? [];
  const principal = fournisseurs.find((f: any) => f.estPrincipal)
    ?? fournisseurs[0]
    ?? (product?.fournisseurId
      ? {
          fournisseurId: String(product.fournisseurId),
          fournisseurNom: product.fournisseurNom ?? null,
          uniteId: null,
          prixAchat: product.prixAchat ? String(product.prixAchat) : null,
        }
      : null);

  const [fournisseurId, setFournisseurId] = useState<string>("");
  const [prixUnitaire, setPrixUnitaire] = useState<string>("");
  const [quantite, setQuantite] = useState<string>("1");
  const [uniteId, setUniteId] = useState<string>("");
  const [priorite, setPriorite] = useState<"basse" | "normale" | "haute">("normale");
  const [motif, setMotif] = useState("");
  const [dateSouhaitee, setDateSouhaitee] = useState("");

  useEffect(() => {
    if (!open) return;
    const f = principal;
    setFournisseurId(f ? String(f.fournisseurId) : "");
    setPrixUnitaire(f?.prixAchat ? String(Number(f.prixAchat)) : product?.prixAchat ? String(Number(product.prixAchat)) : "");
    setUniteId(f?.uniteId ? String(f.uniteId) : "");
    const max = Number(product?.stockMaximum ?? 0);
    const s = Number(stock ?? 0);
    setQuantite(String(Math.max(1, max - s)));
    setPriorite("normale");
    setMotif("");
    setDateSouhaitee("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id]);

  const tva = Number(product?.tva ?? 0);
  const qte = Math.max(1, Number(quantite) || 0);
  const pu = Number(prixUnitaire) || 0;
  const totalHT = qte * pu;
  const totalTVA = Math.round(totalHT * tva / 100);
  const totalTTC = totalHT + totalTVA;

  const selectedFournisseur = suppliers?.find((s: any) => String(s.id) === fournisseurId);
  const sansFournisseur = !fournisseurId;

  const createOrder = api.procurement.purchaseOrders.create.useMutation({
    onSuccess: (r: any) => {
      utils.procurement.purchaseOrders.list.invalidate();
      utils.procurement.suggestedOrders.invalidate();
      utils.catalog.list.invalidate();
      onOpenChange(false);
      toast.success(r.reference ? `Bon de commande ${r.reference} créé` : "Bon de commande créé", {
        action: {
          label: "Voir les achats",
          onClick: () => window.location.assign("/dashboard/procurement"),
        },
      });
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const submit = (statut: "brouillon" | "commande") => {
    if (sansFournisseur) {
      toast.error("Aucun fournisseur lié : créez la commande depuis Achats → Nouvelle commande");
      return;
    }
    createOrder.mutate({
      fournisseurId,
      statut,
      priorite,
      motif: motif || undefined,
      dateSouhaitee: dateSouhaitee || undefined,
      lignes: [{
        produitId,
        quantite: qte,
        prixUnitaire: String(pu),
        uniteId: uniteId || undefined,
      }],
    });
  };

  const isPending = createOrder.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-background text-foreground sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <ShoppingCart className="size-4" /> Commander « {product?.titre ?? titre ?? produitId} »
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Bon de commande prérempli depuis le catalogue (brouillon ou commande)
          </p>
        </DialogHeader>

        {productLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {sansFournisseur && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                Aucun fournisseur principal lié à ce produit. Sélectionnez-en un ci-dessous ou créez la commande depuis Achats.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Fournisseur</Label>
                <Select value={fournisseurId} onValueChange={(v) => {
                  setFournisseurId(v);
                  const f = fournisseurs.find((x: any) => String(x.fournisseurId) === v)
                    ?? (suppliers?.find((s: any) => String(s.id) === v) as any);
                  if (f?.prixAchat) setPrixUnitaire(String(Number(f.prixAchat)));
                  if (f?.uniteId) setUniteId(String(f.uniteId));
                }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {fournisseurs.map((f: any) => (
                      <SelectItem key={String(f.fournisseurId)} value={String(f.fournisseurId)}>
                        {f.fournisseurNom}{f.estPrincipal ? " (principal)" : ""}
                      </SelectItem>
                    ))}
                    {suppliers?.filter((s: any) => !fournisseurs.some((f: any) => String(f.fournisseurId) === String(s.id)))
                      .map((s: any) => (
                        <SelectItem key={String(s.id)} value={String(s.id)}>{s.nom ?? s.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Quantité</Label>
                <Input type="number" min={1} value={quantite} onChange={e => setQuantite(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Prix unitaire (F)</Label>
                <Input type="number" min={0} value={prixUnitaire} onChange={e => setPrixUnitaire(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Priorité</Label>
                <Select value={priorite} onValueChange={(v) => setPriorite(v as any)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basse">Basse</SelectItem>
                    <SelectItem value="normale">Normale</SelectItem>
                    <SelectItem value="haute">Haute</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date souhaitée</Label>
                <Input type="date" value={dateSouhaitee} onChange={e => setDateSouhaitee(e.target.value)} />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Motif</Label>
                <Input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Rupture / stock bas / demande client..." />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Stock actuel</span><span className="font-mono text-foreground">{stock ?? "—"} {product?.uniteAchat && stock ? product.uniteAchat : ""}</span>
              </div>
              <div className="flex justify-between text-muted-foreground mt-1">
                <span>Total HT</span><span className="font-mono text-foreground">{totalHT.toLocaleString()} F</span>
              </div>
              <div className="flex justify-between text-muted-foreground mt-1">
                <span>TVA ({tva}%)</span><span className="font-mono text-foreground">{totalTVA.toLocaleString()} F</span>
              </div>
              <div className="flex justify-between text-muted-foreground mt-1 border-t border-border pt-1">
                <span className="font-medium text-foreground">Total TTC</span>
                <span className="font-mono font-semibold text-foreground">{totalTTC.toLocaleString()} F</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>Annuler</Button>
              <Button
                variant="outline"
                onClick={() => submit("brouillon")}
                disabled={isPending || sansFournisseur || !hasPermission("achats.commander")}
              >
                {isPending && <Loader2 className="size-4 animate-spin" />} Sauvegarder brouillon
              </Button>
              <Button
                onClick={() => submit("commande")}
                disabled={isPending || sansFournisseur || !hasPermission("achats.commander")}
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <ShoppingCart className="size-4" />} Commander
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}