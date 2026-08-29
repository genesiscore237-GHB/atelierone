import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <Compass size={26} className="text-primary" />
        </div>
        <h1 className="mt-4 text-lg font-black">Page introuvable</h1>
        <p className="mt-2 text-sm text-muted-foreground">Cette adresse n'existe pas ou a été déplacée.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
            <Home size={14} /> Aller au tableau de bord
          </Link>
        </div>
      </div>
    </div>
  );
}