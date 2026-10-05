"use client";

import { AlertTriangle, Construction } from "lucide-react";
import { usePermissions } from "~/hooks/usePermissions";
import { isDev } from "~/lib/app-nav";

export default function ServicesPage() {
  const { hasPermission } = usePermissions();
  if (!hasPermission("stock.consulter")) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <AlertTriangle size={15} /> Vous n&apos;avez pas la permission de consulter les services.
      </div>
    );
  }

  if (!isDev()) return null;

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
        <Construction size={40} className="mx-auto text-amber-500" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-foreground">Services — en construction</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Ce module est en cours de développement. Il sera disponible en production lors de la prochaine version.
        </p>
      </div>
      <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-600">
        DEV ONLY
      </span>
    </div>
  );
}
