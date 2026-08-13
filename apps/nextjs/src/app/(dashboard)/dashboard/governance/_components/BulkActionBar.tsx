"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, ToggleRight } from "lucide-react";

interface BulkActionBarProps {
  selectedCount: number;
  loading?: boolean;
  onClear: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}

export function BulkActionBar({
  selectedCount,
  loading,
  onClear,
  onToggleStatus,
  onDelete,
}: BulkActionBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2"
        >
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
            <span className="text-sm font-medium text-foreground">
              {selectedCount} sélectionné{selectedCount > 1 ? "s" : ""}
            </span>
            <div className="h-4 w-px bg-muted" />
            <button
              onClick={onToggleStatus}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent/50 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ToggleRight className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
              {loading ? "Mise à jour..." : "Activer/Désactiver"}
            </button>
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </button>
            <div className="h-4 w-px bg-muted" />
            <button
              onClick={onClear}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/50 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
