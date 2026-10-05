"use client";

import {
  orStepForStatus,
  orNextAction,
  orStepsState,
  OR_STEPS,
  type OrStepId,
} from "../_lib/or-status-machine";

/** Calcule l'état du stepper (7 étapes) + la prochaine action recommandée d'un OR. */
export function useOrStepper(or: {
  statut?: string | null;
} | null | undefined) {
  const statut = or?.statut ?? null;
  const stepsState = orStepsState(statut);
  const currentStep: OrStepId = orStepForStatus(statut);
  const nextAction = orNextAction(statut);

  return {
    steps: OR_STEPS,
    stepsState,
    currentStep,
    nextAction,
  };
}
