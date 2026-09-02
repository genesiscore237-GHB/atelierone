"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api } from "~/trpc/react";
import { ProductWizard } from "../../_components/ProductWizard";
import { toast } from "sonner";

export default function NouveauProduitPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const [formKey, setFormKey] = useState(0);

  const createProduct = api.catalog.create.useMutation({
    onSuccess: () => {
      utils.catalog.list.invalidate();
      toast.success("Produit créé");
      router.push("/dashboard/catalog");
    },
    onError: (e) => toast.error(e.message),
  });
  const createAnother = api.catalog.create.useMutation({
    onSuccess: () => {
      utils.catalog.list.invalidate();
      toast.success("Produit créé — vous pouvez enregistrer le suivant");
      setFormKey((k) => k + 1);
    },
    onError: (e) => toast.error(e.message),
  });

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
        <h1 className="mt-2 text-lg font-semibold text-foreground">Nouveau produit</h1>
        <p className="text-xs text-muted-foreground">Stock › Produits › Nouveau</p>
      </div>

      <ProductWizard
        key={formKey}
        onSave={async (data) => { await createProduct.mutateAsync(data); }}
        onSaveCreateAnother={async (data) => { await createAnother.mutateAsync(data); }}
        isPending={createProduct.isPending || createAnother.isPending}
      />
    </div>
  );
}