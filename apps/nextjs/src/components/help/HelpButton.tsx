"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, CircleHelp, HelpCircle, Search, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@atelierone/ui";
import { RH_HELP_FICHES, findHelpFicheByRoute, searchHelpFiches, type HelpFiche } from "~/lib/help/rh-help";
import { STOCK_HELP_FICHES } from "~/lib/help/stock-help";

const PRIORITE_BADGE: Record<string, string> = {
  P0: "bg-destructive/10 text-destructive",
  P1: "bg-warning/10 text-warning-foreground",
  P2: "bg-info/10 text-info-foreground",
};

/** Registres d'aide par domaine (extensible) */
const HELP_REGISTRES: Array<{ prefix: string; titre: string; centreHref: string; fiches: HelpFiche[] }> = [
  { prefix: "/dashboard/rh", titre: "Personnel (RH)", centreHref: "/dashboard/rh/aide", fiches: RH_HELP_FICHES },
  { prefix: "/dashboard/stock", titre: "Stock & Magasin", centreHref: "/dashboard/stock/aide", fiches: STOCK_HELP_FICHES },
  { prefix: "/dashboard/catalog", titre: "Stock & Magasin", centreHref: "/dashboard/stock/aide", fiches: STOCK_HELP_FICHES },
];

/**
 * BOUTON D'AIDE CONTEXTUEL ("?") — affiché dans le header global.
 * Ouvre un panneau latéral avec l'aide de la page courante
 * (détection par route) + recherche dans les fiches du domaine.
 */
export function HelpButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // N'affiche le bouton que sur les pages couvertes par un registre d'aide
  const registre = HELP_REGISTRES.find((r) => pathname.startsWith(r.prefix));
  if (!registre) return null;

  const current = findHelpFicheByRoute(pathname, registre.fiches);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Aide du module"
          title="Aide du module"
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <CircleHelp size={18} />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-0">
        <SheetHeader className="border-b border-border p-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <HelpCircle size={16} className="text-primary" />
              Aide — {registre.titre}
            </SheetTitle>
            <SheetCloseButton onClick={() => setOpen(false)} />
          </div>
        </SheetHeader>

        <div className="space-y-4 p-4">
          {current ? (
            <FicheDetail fiche={current} compact />
          ) : (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Sélectionnez un sous-module dans le centre d'aide pour voir son explication.
            </div>
          )}

          <div className="border-t border-border pt-3">
            <Link
              href={registre.centreHref}
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <span className="flex items-center gap-2">
                <HelpCircle size={15} className="text-primary" />
                Centre d'aide complet (recherche, parcours)
              </span>
              <ArrowRight size={14} className="text-muted-foreground" />
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SheetCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Fermer l'aide"
      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <X size={16} />
    </button>
  );
}

/** Détail d'une fiche (compact : panneau contextuel / complet : centre d'aide) */
export function FicheDetail({ fiche, compact = false }: { fiche: HelpFiche; compact?: boolean }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${PRIORITE_BADGE[fiche.priorite] ?? "bg-muted text-muted-foreground"}`}>
            Priorité {fiche.priorite}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {fiche.fonctionnalites.length} fonctionnalités
          </span>
        </div>
        <h3 className="mt-2 text-lg font-bold text-foreground">{fiche.titre}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{fiche.courte}</p>
      </div>

      {fiche.prerequis.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-warning-foreground">
            <AlertCircle size={13} /> À savoir avant d'utiliser
          </div>
          <ul className="mt-2 space-y-1">
            {fiche.prerequis.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-warning-foreground" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">Fonctionnalités</div>
        <ul className="space-y-1.5">
          {fiche.fonctionnalites.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-primary" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">Comment faire</div>
        <ol className="space-y-2">
          {fiche.etapes.map((e, i) => (
            <li key={i} className="rounded-lg bg-muted/50 p-2.5 text-sm">
              <span className="font-semibold text-foreground">{i + 1}. {e.titre}</span>
              <span className="mt-0.5 block text-muted-foreground">{e.detail}</span>
            </li>
          ))}
        </ol>
      </div>

      {!compact && fiche.regles.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">Règles à connaître</div>
          <div className="space-y-2">
            {fiche.regles.map((r, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-2.5 text-sm">
                <span className="font-semibold text-foreground">{r.titre} :</span>{" "}
                <span className="text-muted-foreground">{r.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!compact && fiche.faq.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">Questions fréquentes</div>
          <div className="space-y-2">
            {fiche.faq.map((x, i) => (
              <details key={i} className="group rounded-lg border border-border bg-card">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">
                  {x.q}
                </summary>
                <p className="px-3 pb-3 text-sm text-muted-foreground">{x.r}</p>
              </details>
            ))}
          </div>
        </div>
      )}

      <Link
        href={fiche.route}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Ouvrir : {fiche.titre}
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}

/** Barre de recherche des fiches (utilisée par le centre d'aide) */
export function HelpSearch({
  onQuery,
}: {
  onQuery: (fiches: HelpFiche[]) => void;
}) {
  const [query, setQuery] = useState("");

  const handle = (q: string) => {
    setQuery(q);
    onQuery(searchHelpFiches(q));
  };

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
      <input
        value={query}
        onChange={(e) => handle(e.target.value)}
        placeholder="Rechercher : matricule, congé, IRPP, récidive, CSV, clôture…"
        className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-4 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
      {query && (
        <button
          type="button"
          onClick={() => handle("")}
          aria-label="Effacer la recherche"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
