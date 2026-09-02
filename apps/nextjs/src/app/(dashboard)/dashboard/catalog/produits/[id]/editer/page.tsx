"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";
import { api } from "~/trpc/react";
import { ProductWizard } from "../../../_components/ProductWizard";
import { Skeleton } from "~/components/ui/skeleton";
import { toast } from "sonner";

function mapProductToDefaults(product: any) {
  return {
    typeProduit: product.typeProduit,
    titre: product.titre,
    codeArticle: product.codeArticle ?? "",
    categorieId: product.categorieId ? String(product.categorieId) : null,
    marque: product.marque ?? product.editeur ?? "",
    etat: product.etat ?? "neuf",
    photo: product.photos?.[0] ?? null,
    description: product.description ?? "",
    prixAchat: product.prixAchat ? Number(product.prixAchat) : 0,
    prixVente: product.prixVente != null ? Number(product.prixVente) : 0,
    fournisseurId: (product.fournisseurId ?? product.fournisseurs?.[0]?.fournisseurId) ? String(product.fournisseurId ?? product.fournisseurs?.[0]?.fournisseurId) : "",
    seuilAlerte: product.seuilAlerte ?? 5,
    emplacementId: product.emplacementPrincipalId ?? null,
    uniteId: product.productUnits?.find?.((u: any) => u.estUniteBase)?.uniteId ?? product.productUnits?.[0]?.uniteId ?? "",
    quantiteInitiale: 0,
    referenceFabricant: product.referenceFabricant ?? "",
    refOem: product.refOem ?? "",
    refAftermarket: product.refAftermarket ?? "",
    tva: product.tva ? Number(product.tva) : 0,
    notes: product.notes ?? "",
  };
}

export default function EditProduitPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const utils = api.useUtils();

  const { data: product, isLoading } = api.catalog.getById.useQuery({ id }, { enabled: !!id });

  const updateProduct = api.catalog.update.useMutation({
    onSuccess: () => {
      utils.catalog.list.invalidate();
      toast.success("Produit mis à jour");
      router.push("/dashboard/catalog");
    },
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
          <Package className="mx-auto size-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">Produit introuvable</h2>
          <Link
            href="/dashboard/catalog"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-accent/30 px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-accent/50"
          >
            <ArrowLeft className="size-4" />
            Retour au catalogue
          </Link>
        </div>
      </div>
    );
  }

  const defaultValues = mapProductToDefaults(product);

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <Link
          href="/dashboard/catalog"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Catalogue
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-foreground">
          Modifier : {product.titre}
        </h1>
      </div>

      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6">
        <ProductWizard
          defaultValues={defaultValues}
          onSave={async (data) => {
            await updateProduct.mutateAsync({ id, ...data });
          }}
          isPending={updateProduct.isPending}
        />
      </div>
    </div>
  );
}
