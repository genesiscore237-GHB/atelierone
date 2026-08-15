import { ModulePlaceholder } from "~/components/module/ModulePlaceholder";

export const dynamic = "force-dynamic";

export default function OccupationPage() {
  return (
    <ModulePlaceholder
      title="Occupation"
      description="Suivi temps réel de l'occupation des emplacements du garage : places occupées, capacité restante et alertes de saturation des zones."
      capabilities={[
        "Vue temps réel des emplacements occupés",
        "Capacité et taux d'occupation par zone",
        "Alertes de saturation",
        "Durée de stationnement par véhicule",
        "Détection des véhicules bloqués (attente pièce, abandon)",
      ]}
      backHref="/dashboard/sites"
      backLabel="Retour à Espace & Sites"
    />
  );
}
