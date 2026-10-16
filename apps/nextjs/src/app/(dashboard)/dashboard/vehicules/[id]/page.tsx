import { FicheVehicule360 } from "~/components/vehicule/FicheVehicule360";

export default async function VehiculeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FicheVehicule360 id={id} contexte="atelier" />;
}