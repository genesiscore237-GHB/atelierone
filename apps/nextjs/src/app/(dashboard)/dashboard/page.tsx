import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth";
import { LayoutDashboard } from "lucide-react";
import { BentoGrid } from "./_components/BentoGrid";
import { ThemeToggle } from "~/components/ui/theme-toggle";
import LogoutButton from "./_components/LogoutButton";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  admin_reseau: "Administrateur réseau",
  responsable_agence: "Responsable agence",
  operateur_pos: "Opérateur POS",
  caissier: "Caissier",
  magasinier: "Magasinier",
  gestionnaire_achats: "Gestionnaire achats",
  comptable: "Comptable",
  rh: "RH",
  consultation: "Consultation",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const displayName = session.user.name || "Arnaud";
  const roleLabel = ROLE_LABELS[session.user.role] ?? session.user.role;
  const canAdmin =
    (session.user.permissions ?? []).some((p) => p.startsWith("admin.")) ||
    session.user.role === "superadmin";

  return (
    <div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary/30">
      {/* TOP NAV */}
      <nav className="fixed top-0 z-50 w-full border-b border-border/5 bg-background/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 md:px-8 py-3 md:py-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-background shadow-[0_0_20px_var(--primary)] md:h-11 md:w-11">
              <span className="text-sm font-black text-primary">LC</span>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tighter uppercase italic md:text-xl">
                Libra<span className="text-primary italic">Core</span>
              </span>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                <span className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
                  ERP
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-6">
            {canAdmin && (
              <Link
                href="/dashboard/admin"
                className="hidden md:flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <LayoutDashboard size={16} />
                Pilotage
              </Link>
            )}
            <div className="flex flex-col items-end border-r border-border/10 pr-3 md:pr-6">
              <div className="flex items-center gap-2">
                <span className="text-xs md:text-sm font-bold text-foreground">
                  {session.user.name}
                </span>
              </div>
              <span className="text-[10px] font-black tracking-widest uppercase text-success-foreground">
                {roleLabel}
              </span>
            </div>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="mx-auto w-full max-w-7xl px-4 md:px-8 pt-24 md:pt-32 pb-20">
        <header className="mb-8 md:mb-12">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-black text-muted-foreground">
            Bienvenue,{" "}
            <span className="font-black text-primary">{displayName}</span>
          </h2>
          <p className="mt-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
            Sélectionnez un module pour commencer la gestion
          </p>
        </header>

        <BentoGrid />
      </main>

      {/* SYSTEM BAR */}
      <div className="fixed bottom-4 md:bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 md:gap-4 rounded-full border border-border/5 bg-black/40 px-3 md:px-6 py-1.5 md:py-2 shadow-2xl backdrop-blur-md">
        <div className="hidden md:flex items-center gap-2 border-r border-border/10 pr-4">
          <span className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase">
            Session sécurisée
          </span>
        </div>
        <span className="text-[8px] md:text-[9px] font-bold tracking-widest text-primary uppercase">
          AtelierOne v1
        </span>
      </div>
    </div>
  );
}
