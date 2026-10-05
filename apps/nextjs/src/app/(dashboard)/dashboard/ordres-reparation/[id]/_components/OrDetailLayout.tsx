"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buttonVariants } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { EmptyState } from "~/components/ui/empty-state";
import { ClipboardList, History } from "lucide-react";
import { useOrQueries } from "../../_hooks/useOrQueries";
import { useOrPermissions } from "../../_hooks/useOrPermissions";
import { useOrStepper } from "../../_hooks/useOrStepper";
import {
  OR_TABS,
  orStepForStatus,
  type OrStepId,
} from "../../_lib/or-status-machine";
import { OrHeader } from "./OrHeader";
import { OrStepper } from "./OrStepper";
import { Timeline } from "./shared/Timeline";
import { ReceptionTab } from "./tabs/ReceptionTab";
import { DiagnosticTab } from "./tabs/DiagnosticTab";
import { DevisTab } from "./tabs/DevisTab";
import { PiecesTab } from "./tabs/PiecesTab";
import { TravauxTab } from "./tabs/TravauxTab";
import { QualiteTab } from "./tabs/QualiteTab";
import { FactureRestitutionTab } from "./tabs/FactureRestitutionTab";

/** Layout de la fiche OR : header + stepper + onglet routé par URL (?tab=). */
export function OrDetailLayout({ id }: { id: number }) {
  const searchParams = useSearchParams();
  const { or, employes, isLoading } = useOrQueries(id);
  const { flags, isLoading: permLoading } = useOrPermissions();
  const stepper = useOrStepper(or);

  const visibleTabs: OrStepId[] = useMemo(
    () => OR_TABS.filter((t) => t.accessor(flags)).map((t) => t.id),
    [flags]
  );

  const statusTab = or ? orStepForStatus(or.statut) : "reception";
  const requestedTab = searchParams.get("tab") as OrStepId | null;
  const resolvedTab: OrStepId = requestedTab && visibleTabs.includes(requestedTab)
    ? requestedTab
    : statusTab || "reception";

  if (isLoading || permLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!or) {
    return (
      <EmptyState icon={<ClipboardList className="size-8" />} title="Ordre de réparation introuvable" />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <span>Module en cours de refonte : les onglets diagnostic, devis, pièces, travaux, qualité et restitution sont progressivement activés ici.</span>
        <Link href={`/dashboard/ordres-reparation?or=${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <History size={13} className="mr-1" /> Vue complète (précédente)
        </Link>
      </div>
      <OrHeader or={or} employes={employes} />
      <OrStepper id={id} current={resolvedTab} states={stepper.stepsState} nextAction={stepper.nextAction} visibleTabs={visibleTabs} />
      {resolvedTab === "reception" && <ReceptionTab or={or} />}
      {resolvedTab === "diagnostic" && <DiagnosticTab or={or} />}
      {resolvedTab === "devis" && <DevisTab or={or} />}
      {resolvedTab === "pieces" && <PiecesTab or={or} />}
      {resolvedTab === "travaux" && <TravauxTab or={or} />}
      {resolvedTab === "qualite" && <QualiteTab or={or} />}
      {resolvedTab === "facture-restitution" && <FactureRestitutionTab or={or} />}
      <Timeline historique={or.historique ?? []} />
    </div>
  );
}
