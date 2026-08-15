import { ModulePlaceholder } from "~/components/module/ModulePlaceholder";

export const dynamic = "force-dynamic";

export default function CompetencesPage() {
  return (
    <ModulePlaceholder
      title="Compétences & Formations"
      description="Matrice de compétences du garage : quelles compétences chaque technicien maîtrise (mécanique, électricité, diagnostic, carrosserie…), détection des écarts et plan de formation."
      capabilities={[
        "Matrice de compétences par employé",
        "Détection des écarts entre compétences requises et disponibles",
        "Plan de formation annuel",
        "Certifications et attestations",
        "Historique des formations suivies",
      ]}
      backHref="/dashboard/rh"
      backLabel="Retour au Personnel (RH)"
    />
  );
}
