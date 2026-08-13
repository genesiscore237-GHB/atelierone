"use client";

import Link from "next/link";
import { Building2, FileText } from "lucide-react";

export default function PartnerPage() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Building2 className="size-5 text-primary" />
            Partenaires
          </h1>
          <p className="text-xs text-muted-foreground">Achats hors catalogue et factures partenaires</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/dashboard/partner/achats"
          className="rounded-xl border border-border bg-card p-6 hover:bg-accent transition-colors">
          <Building2 className="size-8 text-primary mb-2" />
          <h2 className="text-base font-semibold text-foreground">Achats partenaires</h2>
          <p className="text-sm text-muted-foreground mt-1">Achats hors catalogue avec commission agent</p>
        </Link>
        <Link href="/dashboard/partner/factures"
          className="rounded-xl border border-border bg-card p-6 hover:bg-accent transition-colors">
          <FileText className="size-8 text-destructive mb-2" />
          <h2 className="text-base font-semibold text-foreground">Factures partenaires</h2>
          <p className="text-sm text-muted-foreground mt-1">Factures avec écart tracé et validation PMV</p>
        </Link>
      </div>
    </div>
  );
}
