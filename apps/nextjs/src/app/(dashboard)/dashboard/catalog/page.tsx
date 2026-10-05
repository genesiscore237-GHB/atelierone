import { redirect } from "next/navigation";

/**
 * Ancienne page d'accueil du domaine Catalogue (liste produits legacy).
 * Module en refonte : redirige vers la nouvelle vue d'ensemble (CAT-01).
 */
export default function CatalogueLegacyHome() {
  redirect("/dashboard/catalog/dashboard");
}