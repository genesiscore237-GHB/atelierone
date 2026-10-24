"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Minus,
} from "lucide-react";
import { Button, buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import {
  OR_STEPS,
  type OrCycleFlag,
  type OrNextAction,
  type OrStepId,
  type OrStepStatus,
  type OrStepVisualState,
} from "../../_lib/or-status-machine";

interface OrStepperProps {
  id: number;
  current: OrStepId;
  states: Record<OrStepId, OrStepStatus>;
  nextAction: OrNextAction | null;
  cycle: OrCycleFlag;
  visibleTabs: OrStepId[];
  showAllTabs: boolean;
  canExpand: boolean;
  roleLabel?: string | null;
  onToggleAllTabs: () => void;
}

const STATE_META: Record<
  OrStepVisualState,
  { label: string; text: string; dot: string }
> = {
  done: {
    label: "Terminé",
    text: "text-success-foreground",
    dot: "bg-success text-white",
  },
  in_progress: {
    label: "En cours",
    text: "text-primary",
    dot: "bg-primary/10 text-primary",
  },
  waiting: {
    label: "En attente",
    text: "text-warning-foreground",
    dot: "bg-warning/15 text-warning-foreground",
  },
  blocked: {
    label: "Bloqué",
    text: "text-destructive",
    dot: "bg-destructive text-white",
  },
  todo: {
    label: "À faire",
    text: "text-muted-foreground",
    dot: "bg-muted text-muted-foreground",
  },
  not_applicable: {
    label: "Non applicable",
    text: "text-muted-foreground",
    dot: "bg-muted text-muted-foreground",
  },
};

function StepIcon({ state, step }: { state: OrStepVisualState; step: number }) {
  if (state === "done") return <Check size={11} />;
  if (state === "blocked") return <AlertTriangle size={11} />;
  if (state === "waiting" || state === "in_progress") return <Clock3 size={11} />;
  if (state === "not_applicable") return <Minus size={11} />;
  return <>{step}</>;
}

/**
 * Parcours réel du dossier : 7 étapes, un état calculé sur les données, et une
 * prochaine action cliquable. Les onglets hors rôle sont masqués par défaut ;
 * « Tout le dossier » les révèle pour les profils qui y ont accès.
 */
export function OrStepper({
  id,
  current,
  states,
  nextAction,
  cycle,
  visibleTabs,
  showAllTabs,
  canExpand,
  roleLabel,
  onToggleAllTabs,
}: OrStepperProps) {
  const etapes = OR_STEPS.filter((step) => visibleTabs.includes(step.id));
  const nextActionVisible = nextAction ? visibleTabs.includes(nextAction.tab) : false;

  return (
    <div className="space-y-3">
      {cycle === "bloque" && (
        <div className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-destructive">
                OR bloqué
              </p>
              <p className="text-sm text-foreground/80">
                {nextAction?.label ?? "Un blocage empêche la progression du dossier."}
              </p>
            </div>
          </div>
          {nextAction && nextActionVisible && (
            <Link
              href={`/dashboard/ordres-reparation/${id}?tab=${nextAction.tab}`}
              className={buttonVariants({ size: "sm" })}
            >
              {nextAction.cta} <ArrowRight size={13} className="ml-1" />
            </Link>
          )}
        </div>
      )}

      {cycle === "annule" && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-semibold text-foreground">Cycle arrêté</p>
            <p className="text-muted-foreground">
              Cet OR a été annulé. Les étapes déjà réalisées restent consultables,
              mais aucune progression n'est possible.
            </p>
          </div>
        </div>
      )}

      {cycle === "cloture" && (
        <div className="flex items-start gap-2 rounded-xl border border-success/25 bg-success/5 p-3 text-sm">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success-foreground" />
          <div>
            <p className="font-semibold text-foreground">Dossier clôturé</p>
            <p className="text-muted-foreground">
              Toutes les actions de progression sont terminées. Le dossier reste
              consultable.
            </p>
          </div>
        </div>
      )}

      {cycle === "normal" && nextAction && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <ArrowRight size={15} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                Prochaine action
              </p>
              <p className="text-sm text-foreground/80">{nextAction.label}</p>
            </div>
          </div>
          {nextActionVisible ? (
            <Link
              href={`/dashboard/ordres-reparation/${id}?tab=${nextAction.tab}`}
              className={buttonVariants({ size: "sm" })}
            >
              {nextAction.cta} <ArrowRight size={13} className="ml-1" />
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">
              Action réservée à un autre profil.
            </span>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Parcours · {etapes.length} étape{etapes.length > 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {showAllTabs ? "Tout le dossier" : roleLabel ? `Vue ${roleLabel}` : "Vue adaptée"}
            </span>
            {canExpand && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleAllTabs}
                className="h-7 px-2 text-[11px]"
              >
                {showAllTabs ? "Vue adaptée" : "Tout le dossier"}
              </Button>
            )}
          </div>
        </div>

        <ol className="flex min-w-max items-stretch gap-1 overflow-x-auto pb-1">
          {etapes.map((step) => {
            const state: OrStepStatus = states[step.id] ?? { state: "todo", label: "À faire" };
            const meta = STATE_META[state.state];
            const isActive = step.id === current;

            return (
              <li key={step.id} className="flex items-stretch">
                <Link
                  href={`/dashboard/ordres-reparation/${id}?tab=${step.id}`}
                  title={state.detail ?? state.label}
                  aria-current={isActive ? "step" : undefined}
                  className={cn(
                    "group flex min-w-[8.5rem] flex-col gap-1 rounded-lg border px-2.5 py-2 transition-colors",
                    isActive
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:bg-muted",
                    state.state === "blocked" && "border-destructive/30",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                        meta.dot,
                      )}
                    >
                      <StepIcon state={state.state} step={step.step} />
                    </span>
                    <span
                      className={cn(
                        "whitespace-nowrap text-xs font-semibold",
                        isActive ? "text-primary" : "text-foreground",
                      )}
                    >
                      {step.shortLabel}
                    </span>
                  </span>
                  <span className={cn("ml-6 text-[10px] font-medium", meta.text)}>
                    {state.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
