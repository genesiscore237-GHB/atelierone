"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Fingerprint,
  Grid3X3,
  History,
  LogOut,
  Menu,
  UserCog,
  Users2,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";

const tabs = [
  { name: "Personnel", href: "/dashboard/governance", icon: Users2 },
  { name: "Rôles", href: "/dashboard/governance/roles", icon: Fingerprint },
  { name: "Matrice", href: "/dashboard/governance/matrix", icon: Grid3X3 },
  { name: "Audit", href: "/dashboard/governance/audit", icon: History },
];

export default function GovernanceLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    window.location.href = "/login";
  };

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex min-h-screen">
      <header className="fixed top-0 right-0 left-0 z-50 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            aria-label="Menu principal"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground/80 hover:bg-accent"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
              <UserCog size={16} />
            </div>
            <span className="font-bold text-foreground">Gouvernance</span>
          </div>
        </div>
      </header>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-[var(--overlay)] lg:hidden"
          onClick={closeSidebar}
        />
      )}

      <aside
        aria-label="Navigation principale"
        className={`fixed top-0 z-40 h-screen w-72 shrink-0 border-r border-border bg-card/95 backdrop-blur-2xl transition-transform duration-300 ease-out lg:relative ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } pt-14 lg:block lg:w-72 lg:pt-0`}
      >
        <div className="hidden items-center justify-between border-b border-border p-4 lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary shadow-[0_0_20px_var(--primary)]">
              <UserCog size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-foreground">Gouvernance</h2>
              <p className="text-xs text-muted-foreground">Gestion RH</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSignOut}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive/80"
              title="Déconnexion"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 pt-16 lg:pt-2">
          <nav className="space-y-1 px-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={closeSidebar}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  <Icon size={18} />
                  {tab.name}
                  {isActive && (
                    <motion.div
                      layoutId="navGlow"
                      className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]"
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <main className="w-full flex-1 pt-14 lg:ml-0 lg:pt-0">
        <div className="space-y-4 p-3 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
