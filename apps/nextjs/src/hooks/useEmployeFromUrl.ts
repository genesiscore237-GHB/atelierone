"use client";

import { useSearchParams } from "next/navigation";
import { parseEmployeId } from "~/lib/employe-url";

/**
 * P04 — hook client : lit et valide `?employeId=` puis retourne l'identifiant
 * (entier > 0) ou null. Les pages RH s'en servent pour pré-sélectionner l'employé.
 */
export function useEmployeFromUrl(): number | null {
  const searchParams = useSearchParams();
  return parseEmployeId(searchParams?.get("employeId"));
}