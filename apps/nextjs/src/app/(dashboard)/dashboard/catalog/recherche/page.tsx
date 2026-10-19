import { redirect } from "next/navigation";

/**
 * Ancienne page « Recherche catalogue » (multi-critères).
 * Les critères avancés vivent désormais dans la liste Articles
 * — bouton « Recherche avancée » (app/(dashboard)/dashboard/catalog/articles).
 * Service pour les signets et liens déjà posés.
 */
export default function RecherchePage() {
  redirect("/dashboard/catalog/articles");
}
