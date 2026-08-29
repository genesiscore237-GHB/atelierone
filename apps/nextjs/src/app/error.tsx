"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertTriangle size={26} className="text-destructive" />
        </div>
        <h1 className="mt-4 text-lg font-black">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-muted-foreground">Le chargement de cette page a échoué. Réessayez ou revenez à l'accueil.</p>
        {error?.digest && <p className="mt-2 font-mono text-[10px] text-muted-foreground">Référence : {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={reset} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
            Réessayer
          </button>
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">
            <ArrowLeft size={14} /> Retour
          </Link>
        </div>
      </div>
    </div>
  );
}