import { VehiculeDetail } from "../_components/VehiculeDetail";

export default async function VehiculeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VehiculeDetail id={id} />;
}