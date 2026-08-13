"use client";

import { useEffect, useRef, useCallback } from "react";
import { localDb, type PendingSale } from "~/lib/db/local-db";

export function useSyncManager(onSyncComplete?: () => void) {
  const syncingRef = useRef(false);

  const syncPending = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;

    try {
      const pending = await localDb.pendingSales.where("synced").equals(0).toArray();
      if (pending.length === 0) {
        onSyncComplete?.();
        return;
      }

      const response = await fetch("/api/trpc/pos.bulkSyncSales", {
        method: "POST",
        headers: { "Content-Type": "application/json", "cookie": document.cookie },
        body: JSON.stringify({
          0: { json: { sales: pending }, meta: { values: [["undefined"]], v: 1 } },
        }),
      });

      if (response.ok) {
        const ids = pending.map((s) => s.clientSideId);
        await localDb.pendingSales.where("clientSideId").anyOf(ids).delete();
        onSyncComplete?.();
      } else {
        await localDb.pendingSales.where("synced").equals(0).modify((s: PendingSale) => {
          s.syncAttempts = s.syncAttempts + 1;
        });
      }
    } catch {
      await localDb.pendingSales.where("synced").equals(0).modify((s: PendingSale) => {
        s.syncAttempts = s.syncAttempts + 1;
      });
    } finally {
      syncingRef.current = false;
    }
  }, [onSyncComplete]);

  useEffect(() => {
    const handleOnline = () => syncPending();
    window.addEventListener("online", handleOnline);
    const interval = setInterval(() => { if (navigator.onLine) syncPending(); }, 30000);
    return () => { window.removeEventListener("online", handleOnline); clearInterval(interval); };
  }, [syncPending]);

  return { syncPending };
}
