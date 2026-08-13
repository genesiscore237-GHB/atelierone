"use client";

import type { ReactNode } from "react";

interface DashboardShellProps {
  children: ReactNode;
  className?: string;
}

export function DashboardShell({ children, className = "" }: DashboardShellProps) {
  return (
    <div className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 ${className}`}>
      {children}
    </div>
  );
}
