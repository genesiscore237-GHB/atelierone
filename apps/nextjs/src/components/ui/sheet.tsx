"use client";

import type { ReactNode } from "react";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Sheet({ open, onOpenChange, children }: SheetProps) {
  if (!open) return null;
  return <>{children}</>;
}

interface SheetContentProps {
  children: ReactNode;
  side?: "left" | "right" | "top" | "bottom";
  className?: string;
}

export function SheetContent({ children, side = "right", className = "" }: SheetContentProps) {
  const sideClasses = {
    right: "inset-y-0 right-0 h-full border-l",
    left: "inset-y-0 left-0 h-full border-r",
    top: "inset-x-0 top-0 border-b",
    bottom: "inset-x-0 bottom-0 border-t",
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[var(--overlay)]"
        onClick={() => {}}
      />
      <div
        className={`fixed z-50 bg-background p-6 shadow-lg overflow-y-auto ${sideClasses[side]} ${className}`}
        data-slot="sheet-content"
      >
        {children}
      </div>
    </>
  );
}

export function SheetTrigger({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function SheetClose({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function SheetHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col space-y-2 text-center sm:text-left ${className}`}>{children}</div>;
}

export function SheetFooter({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 ${className}`}>{children}</div>;
}

export function SheetTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-lg font-semibold text-foreground ${className}`}>{children}</h2>;
}

export function SheetDescription({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-sm text-muted-foreground ${className}`}>{children}</p>;
}
