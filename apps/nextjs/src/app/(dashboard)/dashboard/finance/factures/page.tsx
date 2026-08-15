import { ModulePlaceholder } from "~/components/module/ModulePlaceholder";

export const dynamic = "force-dynamic";

export default function FacturesPage() {
  return (
    <ModulePlaceholder
      title="Devis & Factures"
      description="Cycle complet de facturation du garage : création de devis à partir des ordres de réparation, validation, numérotation automatique et génération de PDF professionnels (devis, factures, avoirs)."
      capabilities={[
        "Création de devis depuis un ordre de réparation",
        "Validation hiérarchique et numérotation automatique",
        "Conversion devis → facture en un clic",
        "Génération de PDF aux couleurs du garage",
        "Suivi des statuts : brouillon, envoyé, validé, payé, impayé",
      ]}
      backHref="/dashboard/finance"
      backLabel="Retour à Finance & Caisse"
    />
  );
}
