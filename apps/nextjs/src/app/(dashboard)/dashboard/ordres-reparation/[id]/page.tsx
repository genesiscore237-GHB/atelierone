import { redirect } from "next/navigation";
import { OrDetailLayout } from "./_components/OrDetailLayout";

export default async function OrdreReparationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    redirect("/dashboard/ordres-reparation");
  }
  return <OrDetailLayout id={numericId} />;
}
