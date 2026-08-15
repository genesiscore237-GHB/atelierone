import { ModuleEnCours } from "../_components/ModuleEnCours";

export default function CreancesPage() {
  return (
    <ModuleEnCours
      titre="Créances & Relances"
      description="Suivi des factures non soldées, encaissements différés et relances clients (particuliers et entreprises)."
      modulesPrevus={[
        "Liste des créances par client (plafond de crédit)",
        "Encaissements partiels / différés",
        "Relances automatiques et manuelles",
      ]}
    />
  );
}
