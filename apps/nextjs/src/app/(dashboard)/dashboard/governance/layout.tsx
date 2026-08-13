import { redirect } from "next/navigation";
import { auth } from "@atelierone/auth";
import GovernanceLayoutClient from "./GovernanceLayoutClient";

export default async function GovernanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  return <GovernanceLayoutClient>{children}</GovernanceLayoutClient>;
}
