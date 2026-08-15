import { redirect } from "next/navigation";
import { auth } from "~/lib/auth";
import { ModuleShell } from "~/components/module/ModuleShell";

export default async function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  return <ModuleShell domainId="stock">{children}</ModuleShell>;
}
