"use client";

import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  overlayClassName?: string;
  ariaLabel?: string;
}

export function Dialog({
  open,
  onOpenChange,
  children,
  className = "",
  containerClassName = "",
  overlayClassName = "",
  ariaLabel,
}: DialogProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className={cn("fixed inset-0 z-50 flex items-center justify-center", containerClassName)}
    >
      <div
        className={cn("fixed inset-0 bg-[var(--overlay)] backdrop-blur-sm", overlayClassName)}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div
        className={cn(
          "relative rounded-xl border border-border bg-background text-foreground shadow-[var(--shadow-modal)] w-full max-w-lg mx-auto max-h-[90vh] overflow-y-auto",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogContent({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="mb-4">{children}</div>;
}

export function DialogTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-lg font-semibold text-foreground ${className}`}>{children}</h2>;
}

export function DialogDescription({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-sm text-muted-foreground ${className}`}>{children}</p>;
}
