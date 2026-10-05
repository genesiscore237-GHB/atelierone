import { redirect } from "next/navigation";
import { auth } from "~/lib/auth";
import { GuidePanel } from "~/components/catalogue/GuidePanel";

export default async function GuidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");
  const { id } = await params;
  const categoryId = Number(id);
  if (!categoryId) redirect("/dashboard/catalog/categories");
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      <h1 className="text-xl font-bold tracking-tight text-foreground">Guide de saisie</h1>
      <GuidePanel categorieId={categoryId} />
    </div>
  );
}