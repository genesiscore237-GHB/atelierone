import { ModulePlaceholder } from "~/components/module/ModulePlaceholder";

export const dynamic = "force-dynamic";

export default function TransfertsSitesPage() {
  return (
    <ModulePlaceholder
      title="Transferts Site 1 ↔ Site 2"
      description="Déplacements tracés des véhicules entre les zones du garage (réparation ↔ longue durée, attente pièce ↔ parc extérieur) avec historique complet."
      capabilities={[
        "Transfert d'un véhicule entre sites et zones",
        "Historique complet des déplacements",
        "Motif de transfert (attente pièce, abandon, fin de réparation)",
        "Validation par le chef d'atelier",
        "Rapport de mouvements par véhicule",
      ]}
      backHref="/dashboard/sites"
      backLabel="Retour à Espace & Sites"
    />
  );
}
