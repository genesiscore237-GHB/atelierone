import { MobileBottomNav } from "./_components/MobileBottomNav";
import { DashboardHeader } from "./_components/DashboardHeader";
import { ModuleGuard } from "~/hooks/usePermissions";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
      <DashboardHeader />
      <ModuleGuard>{children}</ModuleGuard>
    </div>
  );
}
