import { redirect } from "next/navigation";
import { auth } from "~/lib/auth";
import { ModuleShell } from "~/components/module/ModuleShell";

/**
 * « Utilisateurs & Rôles » vit dans le domaine Socle & Administration :
 * pas de navigation propre — le ModuleShell du domaine fournit le
 * breadcrumb et les onglets (Paramétrage général, Utilisateurs & Rôles,
 * Journal d'audit), cohérent avec le pattern RH.
 */
export default async function GovernanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  return <ModuleShell domainId="administration">{children}</ModuleShell>;
}
