import { ModuleEnCours } from "../_components/ModuleEnCours";

export default function OrdresReparationPage() {
  return (
    <ModuleEnCours
      titre="Ordres de Réparation (OR)"
      description="Cycle complet d'un ordre de réparation : plainte client → diagnostic → devis → travaux → facturation."
      modulesPrevus={[
        "Création d'OR (véhicule, client, plainte)",
        "Diagnostic et devis accepté par le client",
        "Lignes pièces détachées + main d'œuvre par technicien",
        "Suivi du temps (interventions techniciens)",
        "Statuts : ouvert → en cours → attente pièce → terminé → facturé",
        "Clôture et transfert vers la facturation",
      ]}
    />
  );
}
