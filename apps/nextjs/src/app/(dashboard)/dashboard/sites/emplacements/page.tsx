import { ModulePlaceholder } from "~/components/module/ModulePlaceholder";

export const dynamic = "force-dynamic";

export default function EmplacementsPage() {
  return (
    <ModulePlaceholder
      title="Emplacements"
      description="Cartographie physique du garage : zones de réception, diagnostic, réparation et attente (Site 1) ainsi que longue durée, carcasses et véhicules abandonnés (Site 2)."
      capabilities={[
        "Zones configurées : réception, diagnostic, réparation, attente",
        "Site 2 : longue durée, carcasses, abandonnés",
        "Capacité par emplacement",
        "Assignation d'un véhicule à un emplacement",
        "Statut visuel par zone (libre, occupé, saturé)",
      ]}
      backHref="/dashboard/sites"
      backLabel="Retour à Espace & Sites"
    />
  );
}
