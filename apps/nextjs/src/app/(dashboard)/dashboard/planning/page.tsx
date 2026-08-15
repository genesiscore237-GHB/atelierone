import { ModuleEnCours } from "../_components/ModuleEnCours";

export default function PlanningPage() {
  return (
    <ModuleEnCours
      titre="Planning Atelier"
      description="Charge de l'atelier : assignation des techniciens, planification des interventions et suivi du temps."
      modulesPrevus={[
        "Vue planning par technicien / par pont",
        "Assignation des ordres de réparation",
        "Saisie et validation du temps passé",
      ]}
    />
  );
}
