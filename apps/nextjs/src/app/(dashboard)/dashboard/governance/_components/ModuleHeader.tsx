"use client";

import { usePathname } from "next/navigation";
import { Home, ChevronRight } from "lucide-react";
import Link from "next/link";

interface ModuleHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function ModuleHeader({ title, description, actions }: ModuleHeaderProps) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <div className="mb-6">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">
          <Home className="h-3.5 w-3.5" />
        </Link>
        {segments.map((seg, i) => {
          const href = "/" + segments.slice(0, i + 1).join("/");
          const label = seg === "dashboard" ? "Dashboard" : seg.charAt(0).toUpperCase() + seg.slice(1);
          return (
            <span key={href} className="flex items-center gap-1.5">
              <ChevronRight className="h-3 w-3" />
              {i === segments.length - 1 ? (
                <span className="text-foreground font-medium">{label}</span>
              ) : (
                <Link href={href} className="hover:text-foreground transition-colors">
                  {label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
