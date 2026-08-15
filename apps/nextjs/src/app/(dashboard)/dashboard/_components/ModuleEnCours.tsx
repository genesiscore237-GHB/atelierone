import Link from "next/link";
import { Wrench } from "lucide-react";

interface ModuleEnCoursProps {
  titre: string;
  description: string;
  modulesPrevus?: string[];
}

/**
 * Page placeholder pour les modules métier en cours de développement.
 * Les schémas (tables) sont déjà prêts en base ; l'interface sera livrée
 * progressivement.
 */
export function ModuleEnCours({ titre, description, modulesPrevus }: ModuleEnCoursProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Wrench className="size-8" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-bold text-foreground">{titre}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
        {modulesPrevus && modulesPrevus.length > 0 && (
          <ul className="mx-auto mt-6 max-w-md space-y-1.5 text-left text-sm">
            {modulesPrevus.map((m) => (
              <li key={m} className="flex items-center gap-2 text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" />
                {m}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-8 flex justify-center gap-2">
          <Link
            href="/dashboard"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            Retour au tableau de bord
          </Link>
        </div>
      </div>
    </div>
  );
}
