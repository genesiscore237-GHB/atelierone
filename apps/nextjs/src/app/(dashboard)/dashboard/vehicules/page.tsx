import { ModuleEnCours } from "../_components/ModuleEnCours";

export default function VehiculesPage() {
  return (
    <ModuleEnCours
      titre="Véhicules & Parc"
      description="Gestion des fiches véhicules : immatriculation, historique, statuts d'immobilisation et suivi du parc client."
      modulesPrevus={[
        "Fiche véhicule (marque, modèle, kilométrage, numéro de châssis)",
        "Suivi d'immobilisation (12 statuts : réception → diagnostic → réparation → sortie)",
        "Historique des interventions par véhicule",
      ]}
    />
  );
}
