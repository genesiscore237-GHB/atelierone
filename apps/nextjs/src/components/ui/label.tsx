"use client";

import type { ReactNode } from "react";

interface LabelProps {
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function Label({ htmlFor, children, className }: LabelProps) {
  return (
    <label htmlFor={htmlFor} className={`text-sm font-medium text-foreground ${className || ''}`}>
      {children}
    </label>
  );
}