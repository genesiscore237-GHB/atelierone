import { redirect } from "next/navigation";

/**
 * Ancienne gestion des catégories (legacy). À refondre dans le module CAT :
 * redirige vers la vue d'ensemble.
 */
export default function CatalogueLegacyCategories() {
  redirect("/dashboard/catalog/dashboard");
}