"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { api } from "~/trpc/react";
import { EmptyState } from "~/components/ui/empty-state";
import { canAccessModule } from "~/lib/module-permissions";

// Permissions réelles chargées depuis la matrice DB (role_permissions)
// au moment du login (packages/auth/src/config.ts) et exposées via user.getMe.

const STALE_PERMISSIONS = 5 * 60 * 1000;

export function usePermissions() {
  // Permissions chargées au login : quasi-immuables en session. Cache large
  // pour ne pas refaire un round-trip serveur à chaque navigation.
  const { data: user, isLoading } = api.user.getMe.useQuery(undefined, {
    staleTime: STALE_PERMISSIONS,
  });

  const hasPermission = (action: string): boolean => {
    if (isLoading || !user) return false;
    return (user.permissions ?? []).includes(action);
  };

  const hasAnyPermission = (actions: string[]): boolean => {
    if (isLoading || !user) return false;
    return actions.some((a) => (user.permissions ?? []).includes(a));
  };

  const canAccessModuleFn = (moduleId: string | undefined): boolean => {
    if (isLoading) return false;
    return canAccessModule(user?.permissions, moduleId);
  };

  return { hasPermission, hasAnyPermission, canAccessModule: canAccessModuleFn, user, isLoading };
}

interface GuardProps {
  permission: string;
  fallback?: ReactNode;
  children: ReactNode;
}

const defaultGuardFallback = (
  <EmptyState title="Accès non autorisé" description="Vous n'avez pas les permissions nécessaires." />
);

export function Guard({ permission, fallback = defaultGuardFallback, children }: GuardProps) {
  const { hasPermission } = usePermissions();

  if (!hasPermission(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

export function ModuleGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { canAccessModule, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <span className="text-sm text-muted-foreground">Chargement…</span>
      </div>
    );
  }

  const moduleId = pathname.split("/")[2]; // /dashboard/<module>/...

  if (!canAccessModule(moduleId)) {
    return (
      <EmptyState
        title="Accès non autorisé"
        description="Ce module n'est pas accessible avec votre profil."
      />
    );
  }

  return <>{children}</>;
}
