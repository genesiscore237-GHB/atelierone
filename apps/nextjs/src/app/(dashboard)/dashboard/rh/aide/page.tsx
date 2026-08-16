import HelpCenter from "~/components/help/HelpCenter";
import { RH_HELP_FICHES } from "~/lib/help/rh-help";

export const dynamic = "force-dynamic";

const PARCOURS_RH = [
  { label: "1. Vérifier le paramétrage", route: "/dashboard/rh/parametrage" },
  { label: "2. Créer un employé", route: "/dashboard/rh/employes" },
  { label: "3. Pointer une présence", route: "/dashboard/rh/presences" },
  { label: "4. Demander un congé", route: "/dashboard/rh/absences" },
  { label: "5. Clôturer le mois", route: "/dashboard/rh/presences" },
  { label: "6. Calculer la paie", route: "/dashboard/rh/paie" },
  { label: "7. Consulter le tableau de bord", route: "/dashboard/rh/tableau-de-bord" },
];

export default function AideRHPage() {
  return (
    <HelpCenter
      titre="Personnel (RH)"
      sousTitre="Guide utilisateur complet du module : parcours de prise en main, fiches par sous-module, recherche."
      fiches={RH_HELP_FICHES}
      parcours={PARCOURS_RH}
      guideDoc="DOC/GUIDE-UTILISATEUR-MODULE-RH.md"
    />
  );
}
