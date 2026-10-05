import { redirect } from "next/navigation";

/**
 * Ancienne fiche produit (module legacy, table `produits`).
 * Remplacée par la fiche variante du nouveau module articles :
 * redirige vers /dashboard/catalog/variante/[id].
 */
export default async function CatalogueLegacyProduit({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/catalog/variante/${id}`);
}