"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api } from "~/trpc/react";
import { ProductWizard } from "../../_components/ProductWizard";
import { toast } from "sonner";

export default function NouveauProduitPage() {
  const router = useRouter();
  const utils = api.useUtils();

  const createProduct = api.catalog.create.useMutation({
    onSuccess: () => {
      utils.catalog.list.invalidate();
      toast.success("Produit créé");
      router.push("/dashboard/catalog");
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
      </div>

      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6">
        <ProductWizard
          onSave={async (data) => {
            await createProduct.mutateAsync(data);
          }}
          isPending={createProduct.isPending}
        />
      </div>
    </div>
  );
}
