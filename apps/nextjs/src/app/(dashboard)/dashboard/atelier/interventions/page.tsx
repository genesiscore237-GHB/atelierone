import { ModulePlaceholder } from "~/components/module/ModulePlaceholder";

export const dynamic = "force-dynamic";

export default function InterventionsPage() {
  return (
    <ModulePlaceholder
      title="Interventions & Temps"
      description="Suivi détaillé du travail en atelier : qui a travaillé sur quel véhicule, combien de temps, et à quel coût. Ce module alimente la paie des techniciens et la facturation des ordres de réparation."
      capabilities={[
        "Journal des interventions par ordre de réparation",
        "Pointage des temps de travail par technicien",
        "Main d'œuvre facturée vs temps réel",
        "Suivi des heures supplémentaires",
        "Export des rapports d'activité atelier",
      ]}
      backHref="/dashboard/atelier"
      backLabel="Retour à Véhicules & Atelier"
    />
  );
}
