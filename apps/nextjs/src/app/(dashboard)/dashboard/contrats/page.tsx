import { ModuleEnCours } from "../_components/ModuleEnCours";

export default function ContratsPage() {
  return (
    <ModuleEnCours
      titre="Contrats Flottes"
      description="Maintenance régulière pour les entreprises sous contrat : véhicules rattachés, conditions de paiement et remises."
      modulesPrevus={[
        "Création de contrat (dates, type de maintenance, conditions de paiement)",
        "Rattachement des véhicules de la flotte",
        "Suivi des visites et interventions contractuelles",
      ]}
    />
  );
}
