import { redirect } from "next/navigation";

/**
 * Ancienne ontologie / attributs (legacy). À refondre dans le module CAT :
 * redirige vers la vue d'ensemble.
 */
export default function CatalogueLegacyOntologie() {
  redirect("/dashboard/catalog/dashboard");
}