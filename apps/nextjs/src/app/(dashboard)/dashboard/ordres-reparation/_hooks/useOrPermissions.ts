"use client";

import { usePermissions } from "~/hooks/usePermissions";
import {
  buildOrPermissions,
  type OrPermissionFlags,
} from "../_lib/or-status-machine";

/** Flags fins de permission pour le module OR, dérivés des permissions serveur réelles. */
export function useOrPermissions(): { flags: OrPermissionFlags; user: any; isLoading: boolean } {
  const { hasPermission, user, isLoading } = usePermissions();
  return { flags: buildOrPermissions(hasPermission), user, isLoading };
}
