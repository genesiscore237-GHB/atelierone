import HelpCenter from "~/components/help/HelpCenter";
import { STOCK_HELP_FICHES } from "~/lib/help/stock-help";

export const dynamic = "force-dynamic";

const PARCOURS_STOCK = [
  { label: "1. Créer des articles", route: "/dashboard/catalog" },
  { label: "2. Créer les emplacements", route: "/dashboard/stock/emplacements" },
  { label: "3. Inventaire initial", route: "/dashboard/stock/inventaire" },
  { label: "4. Faire une entrée", route: "/dashboard/stock/mouvements" },
  { label: "5. Reconditionner (fût → bidons)", route: "/dashboard/stock/reconditionnement" },
  { label: "6. Sortir pour un OR", route: "/dashboard/stock/mouvements" },
  { label: "7. Consulter la vue d'ensemble", route: "/dashboard/stock/apercu" },
];

export default function AideStockPage() {
  return (
    <HelpCenter
      titre="Stock & Magasin"
      sousTitre="Guide utilisateur complet du module : catalogue, mouvements, inventaire, reconditionnement, emplacements, alertes."
      fiches={STOCK_HELP_FICHES}
      parcours={PARCOURS_STOCK}
      guideDoc="DOC/GUIDE-UTILISATEUR-MODULE-STOCK.md"
    />
  );
}
