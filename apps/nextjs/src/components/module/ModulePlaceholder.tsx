import Link from "next/link";
import { Construction, CheckCircle2, ArrowLeft } from "lucide-react";

interface ModulePlaceholderProps {
  title: string;
  description: string;
  capabilities?: string[];
  backHref: string;
  backLabel: string;
}

/**
 * Page propre pour les modules métier en cours de développement :
 * présente le rôle du module, les fonctionnalités prévues et l'état d'avancement.
 */
export function ModulePlaceholder({
  title,
  description,
  capabilities = [],
  backHref,
  backLabel,
}: ModulePlaceholderProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ArrowLeft size={14} />
        {backLabel}
      </Link>

      <div className="rounded-2xl border border-border/60 bg-card/50 p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Construction className="size-7" strokeWidth={1.75} />
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-warning-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-warning-foreground" />
            En cours de développement
          </span>
        </div>

        <h1 className="mt-5 text-2xl font-black tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>

        {capabilities.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Fonctionnalités prévues
            </h2>
            <ul className="mt-3 space-y-2">
              {capabilities.map((cap) => (
                <li
                  key={cap}
                  className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-sm text-foreground"
                >
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-primary" />
                  {cap}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 rounded-xl border border-dashed border-border bg-background/40 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Ce module sera disponible prochainement
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground/80">
            Les données et schémas correspondants sont préparés en base. L&apos;interface
            complète (liste, recherche, création, validation) sera livrée dans une
            prochaine version.
          </p>
        </div>
      </div>
    </div>
  );
}
