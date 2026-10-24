"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "~/components/ui/skeleton";
import { EmptyState } from "~/components/ui/empty-state";
import { ClipboardList } from "lucide-react";
import { useOrQueries } from "../../_hooks/useOrQueries";
import { useOrPermissions } from "../../_hooks/useOrPermissions";
import { useOrStepper } from "../../_hooks/useOrStepper";
import {
  OR_ROLE_LABELS,
  OR_TABS,
  orCurrentStep,
  orRoleDefaultTab,
  orTabsForRole,
  type OrStepId,
} from "../../_lib/or-status-machine";
import { OrHeader } from "./OrHeader";
import { OrStepper } from "./OrStepper";
import { JournalPanel } from "./shared/JournalPanel";
import { RelationClientDrawer } from "./RelationClientDrawer";
import { ReceptionTab } from "./tabs/ReceptionTab";
import { DiagnosticTab } from "./tabs/DiagnosticTab";
import { DevisTab } from "./tabs/DevisTab";
import { PiecesTab } from "./tabs/PiecesTab";
import { TravauxTab } from "./tabs/TravauxTab";
import { QualiteTab } from "./tabs/QualiteTab";
import { FactureRestitutionTab } from "./tabs/FactureRestitutionTab";

/**
 * Layout de la fiche OR : en-tête compact, parcours réel, onglet routé par
 * URL (?tab=), journal et relation client en tiroirs.
 *
 * Il n'y a plus de bandeau « module en cours de refonte », plus de relation
 * client permanente, plus d'historique sous chaque onglet, et plus de lien vers
 * l'ancienne fiche.
 */
export function OrDetailLayout({ id }: { id: number }) {
  const searchParams = useSearchParams();
  const {
    or,
    employes,
    devisVersions,
    demandesPieces,
    pointages,
    controlesQualite,
    restitutions,
    isLoading,
  } = useOrQueries(id);
  const { flags, user, isLoading: permLoading } = useOrPermissions();

  const [showAllTabs, setShowAllTabs] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [relationOpen, setRelationOpen] = useState(false);

  const stepperInput = useMemo(
    () =>
      or
        ? {
            ...or,
            devisVersions,
            demandesPieces,
            pointages,
            controlesQualite,
            restitutions,
          }
        : null,
    [or, devisVersions, demandesPieces, pointages, controlesQualite, restitutions],
  );

  const stepper = useOrStepper(stepperInput);

  const accessibleTabs = useMemo(
    () => OR_TABS.filter((t) => t.accessor(flags)).map((t) => t.id),
    [flags],
  );
  const roleTabs = useMemo(
    () => orTabsForRole(user?.role, accessibleTabs),
    [user?.role, accessibleTabs],
  );

  const statusTab = or ? orCurrentStep(stepperInput) : "reception";
  const defaultTab = orRoleDefaultTab(statusTab, roleTabs);
  const requestedTab = searchParams.get("tab") as OrStepId | null;
  const resolvedTab: OrStepId =
    requestedTab && accessibleTabs.includes(requestedTab)
      ? requestedTab
      : accessibleTabs.includes(defaultTab)
        ? defaultTab
        : (accessibleTabs[0] ?? "reception");

  const nextActionTab = stepper.nextAction?.tab ?? null;
  const visibleTabs = useMemo(() => {
    const base = showAllTabs ? accessibleTabs : roleTabs;
    const withCurrent = base.includes(resolvedTab)
      ? base
      : [...base, resolvedTab];
    if (
      nextActionTab &&
      accessibleTabs.includes(nextActionTab) &&
      !withCurrent.includes(nextActionTab)
    ) {
      return [...withCurrent, nextActionTab];
    }
    return withCurrent;
  }, [showAllTabs, accessibleTabs, roleTabs, resolvedTab, nextActionTab]);

  const canExpand = accessibleTabs.length > roleTabs.length;
  const roleLabel = user?.role ? OR_ROLE_LABELS[user.role] ?? user.role : null;

  if (isLoading || permLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!or) {
    return (
      <EmptyState
        icon={<ClipboardList className="size-8" />}
        title="Ordre de réparation introuvable"
      />
    );
  }

  return (
    <div className="space-y-5">
      <OrHeader
        or={or}
        employes={employes}
        onOpenJournal={() => setJournalOpen(true)}
        onOpenRelation={() => setRelationOpen(true)}
      />

      {accessibleTabs.length === 0 ? (
        <EmptyState
          title="Aucun onglet accessible"
          description="Votre profil n'a pas accès aux étapes de ce dossier."
        />
      ) : (
        <>
          <OrStepper
            id={id}
            current={resolvedTab}
            states={stepper.stepsState}
            nextAction={stepper.nextAction}
            cycle={stepper.cycle}
            visibleTabs={visibleTabs}
            showAllTabs={showAllTabs}
            canExpand={canExpand}
            roleLabel={roleLabel}
            onToggleAllTabs={() => setShowAllTabs((v) => !v)}
          />

          {resolvedTab === "reception" && <ReceptionTab or={or} />}
          {resolvedTab === "diagnostic" && <DiagnosticTab or={or} />}
          {resolvedTab === "devis" && <DevisTab or={or} />}
          {resolvedTab === "pieces" && <PiecesTab or={or} />}
          {resolvedTab === "travaux" && <TravauxTab or={or} />}
          {resolvedTab === "qualite" && <QualiteTab or={or} />}
          {resolvedTab === "facture-restitution" && <FactureRestitutionTab or={or} />}
        </>
      )}

      <JournalPanel
        open={journalOpen}
        onOpenChange={setJournalOpen}
        historique={or.historique ?? []}
      />
      <RelationClientDrawer
        open={relationOpen}
        onOpenChange={setRelationOpen}
        or={or}
      />
    </div>
  );
}
