"use client";

import Link from "next/link";
import { Check, ArrowRight, AlertTriangle } from "lucide-react";
import { cn } from "~/lib/utils";
import {
  OR_STEPS,
  type OrStepId,
  type OrStepState,
} from "../../_lib/or-status-machine";

interface OrStepperProps {
  id: number;
  current: OrStepId;
  states: Record<OrStepId, OrStepState>;
  nextAction: string | null;
  visibleTabs: OrStepId[];
}

/** Bandeau de prochaine action + stepper 7 étapes cliquable (lecture). */
export function OrStepper({ id, current, states, nextAction, visibleTabs }: OrStepperProps) {
  return (
    <div className="space-y-3">
      {nextAction && (
        <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <ArrowRight size={15} className="mt-0.5 shrink-0 text-primary" />
          <span>
            <span className="font-semibold text-foreground">Prochaine action recommandée : </span>
            <span className="text-foreground/80">{nextAction}</span>
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card p-3">
        <ol className="flex min-w-max items-center gap-1">
          {OR_STEPS.map((step, i) => {
            const state = states[step.id];
            const isVisible = visibleTabs.includes(step.id);
            const isActive = step.id === current;
            return (
              <li key={step.id} className="flex items-center">
                {i > 0 && (
                  <span className={cn("mx-1 h-px w-4 sm:w-6", state === "done" ? "bg-success" : "bg-border")} />
                )}
                <Link
                  href={`/dashboard/ordres-reparation/${id}?tab=${step.id}`}
                  className={cn(
                    "group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                  )}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                      state === "done" ? "bg-success text-white" :
                      state === "current" ? "bg-primary text-white" :
                      "bg-muted text-muted-foreground"
                    )}
                  >
                    {state === "done" ? <Check size={11} /> : step.step}
                  </span>
                  <span className="whitespace-nowrap">{step.label}</span>
                  {!isVisible && (
                    <span className="ml-0.5 inline-flex items-center text-warning-foreground" title="Lecture seule selon vos permissions">
                      <AlertTriangle size={11} />
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
