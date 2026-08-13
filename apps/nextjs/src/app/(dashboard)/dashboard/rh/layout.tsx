import { redirect } from "next/navigation";
import { auth } from "@atelierone/auth";

export default async function RHLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");
  return <>{children}</>;
}
