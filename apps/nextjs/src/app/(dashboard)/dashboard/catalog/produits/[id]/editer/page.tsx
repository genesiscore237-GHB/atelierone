import { redirect } from "next/navigation";

/**
 * Ancien écran d'édition produit (legacy). Refondu dans le module CAT :
 * redirige vers la vue d'ensemble.
 */
export default function CatalogueLegacyEditProduit() {
  redirect("/dashboard/catalog/dashboard");
}