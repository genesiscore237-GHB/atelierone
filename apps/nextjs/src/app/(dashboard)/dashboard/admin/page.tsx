import { auth } from "~/lib/auth";
import { redirect } from "next/navigation";
import { AdminDashboardContent } from "./AdminDashboardContent";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-black text-foreground">
          Centre de pilotage
        </h1>
        <p className="mt-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">
          Vue d&apos;ensemble — {session.user.name || "Admin"}
        </p>
      </header>

      <AdminDashboardContent />
    </div>
  );
}
