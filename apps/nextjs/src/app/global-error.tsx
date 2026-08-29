"use client";

import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body className="flex min-h-screen items-center justify-center bg-background p-6 font-sans text-foreground">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertTriangle size={26} className="text-destructive" />
          </div>
          <h1 className="mt-4 text-lg font-black">Une erreur critique est survenue</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            L'application a rencontré un problème inattendu. Rechargez la page — vos données sont en sécurité.
          </p>
          {error?.digest && <p className="mt-2 font-mono text-[10px] text-muted-foreground">Référence : {error.digest}</p>}
          <div className="mt-6 flex justify-center gap-2">
            <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
              <RefreshCw size={14} /> Réessayer
            </button>
            <Link href="/login" className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-accent">
              <Home size={14} /> Accueil
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}