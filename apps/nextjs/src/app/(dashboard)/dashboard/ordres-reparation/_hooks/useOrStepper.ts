"use client";

import {
  OR_STEPS,
  orCurrentStep,
  orCycleFlag,
  orNextAction,
  orStepStates,
  type OrStepSnapshot,
} from "../_lib/or-status-machine";

/**
 * Calcule l'état réel des 7 étapes, l'étape courante et la prochaine action
 * d'un OR. Les états sont dérivés des données de chaque étape (diagnostic,
 * devis, pièces, travaux, qualité, facture), pas de l'index du statut global.
 */
export function useOrStepper(or: OrStepSnapshot | null | undefined) {
  return {
    steps: OR_STEPS,
    stepsState: orStepStates(or),
    currentStep: orCurrentStep(or),
    nextAction: orNextAction(or),
    cycle: orCycleFlag(or),
  };
}
