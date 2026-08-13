"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

interface Permission {
  id: number;
  code: string;
  nom: string;
  module: string;
}

interface Role {
  id: number;
  nom: string;
  code: string;
}

interface DetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permission: Permission | null;
  roles?: Role[];
  activeLinks?: { permissionId: number; roleId: number; active: boolean }[];
  onToggle?: (roleId: number, permId: number, roleName: string, permName: string) => void;
}

export function DetailModal({
  open,
  onOpenChange,
  permission,
  roles = [],
  activeLinks = [],
  onToggle,
}: DetailModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  if (!open || !permission) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-foreground">{permission.nom}</h3>
          <button
            ref={closeRef}
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Code: <code className="text-foreground/80">{permission.code}</code>
        </p>
        <p className="mb-4 text-xs text-muted-foreground">Module: {permission.module}</p>

        <div className="space-y-1.5">
          {roles.map((role) => {
            const active = activeLinks.some(
              (l) => l.roleId === role.id && l.permissionId === permission.id && l.active,
            );
            return (
              <div
                key={role.id}
                className="flex items-center justify-between rounded bg-accent/30 p-1.5"
              >
                <span className="text-xs text-foreground">{role.nom}</span>
                <button
                  onClick={() => onToggle?.(role.id, permission.id, role.nom, permission.nom)}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-bold transition-all ${
                    active
                      ? "bg-success/10 text-success-foreground"
                      : "bg-accent/30 text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {active ? (
                    <><Check size={12} /> Activé</>
                  ) : (
                    <><X size={12} /> Désactivé</>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
