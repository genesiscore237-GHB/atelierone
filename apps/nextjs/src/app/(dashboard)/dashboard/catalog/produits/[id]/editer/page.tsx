"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";
import { api } from "~/trpc/react";
import { ProductWizard, type UniteRow } from "../../../_components/ProductWizard";
import { Skeleton } from "~/components/ui/skeleton";
import { toast } from "sonner";

function mapProductToDefaults(product: any) {
  const unites: UniteRow[] = (product.productUnits ?? []).filter((u: any) => u.statut === "ACTIF").map((u: any, i: number) => ({
    id: `u_${i}`,
    unite_id: u.uniteId,
    unite_label: "",
    facteur_conversion: u.facteurVersParent != null ? Number(u.facteurVersParent) : 1,
    prix_achat: Number(u.prixAchat) || 0,
    prix_vente: Number(u.prixVente) || 0,
    est_unite_achat_defaut: u.estUniteAchatDefaut ?? false,
    est_unite_vente_defaut: u.estUniteVenteDefaut ?? false,
    est_unite_base: u.estUniteBase ?? false,
  }));

  return {
    typeProduit: product.typeProduit,
    titre: product.titre,
    code_barre: product.codeBarre ?? "",
    description: product.description ?? "",
    statut: product.statut ?? "actif",
    etat: product.etat ?? "neuf",
    langue: product.langue ?? "",
    collection: product.collection ?? "",
    photo_preview: product.photos?.[0] ?? null,
    categorie_id: product.categorieId ? String(product.categorieId) : null,
    prix_vente: product.prixVente != null ? Number(product.prixVente) : 0,
    prix_achat: product.prixAchat ? Number(product.prixAchat) : 0,
    tva: product.tva ? Number(product.tva) : 0,
    fournisseur_id: product.fournisseurId ? String(product.fournisseurId) : null,
    seuil_alerte_stock: product.seuilAlerte ?? 5,
    stock_maximum: product.stockMaximum ?? null,
    fournisseurs: (product.fournisseurs ?? []).map((f: any, i: number) => ({
      id: `fs_${i}`,
      fournisseurId: String(f.fournisseurId),
      uniteId: f.uniteId ?? "",
      reference: f.referenceFournisseur ?? "",
      prixAchat: f.prixAchat ? String(f.prixAchat) : "",
      delai: f.delaiApprovisionnement ? String(f.delaiApprovisionnement) : "",
      estPrincipal: f.estPrincipal ?? false,
    })),
    auteur: product.auteur ?? "",
    editeur: product.editeur ?? "",
    isbn: product.isbn ?? "",
    statut_officiel: product.statutOfficiel ?? "",
    sous_systeme_id: product.sousSystemeId,
    niveau_id: product.niveauId,
    filiere_id: product.filiereId,
    classe_id: product.classeId,
    matiere_id: product.matiereId,
    annee_liste_id: product.anneeListeId,
    ministere_id: product.ministereId,
    prix_reglemente: product.prixReglemente ?? false,
    prix_reglemente_valeur: product.prixReglementeValeur ? Number(product.prixReglementeValeur) : 0,
    marque: product.marque ?? "",
    reference_fabricant: product.referenceFabricant ?? "",
    couleur: product.couleur ?? "",
    format: product.format ?? "",
    matiere_composition: product.matiereComposition ?? "",
    // Specs 02 §2.1 : champs d'article
    code_article: product.codeArticle ?? "",
    designation_courte: product.designationCourte ?? "",
    ref_oem: product.refOem ?? "",
    ref_aftermarket: product.refAftermarket ?? "",
    emplacement_principal_id: product.emplacementPrincipalId ?? null,
    origine_qualite: product.origineQualite ?? "AUTRE",
    dlc_jours: product.dlcJours ?? null,
    est_reconditionnable: product.estReconditionnable ?? false,
    notes: product.notes ?? "",
    unites,
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
