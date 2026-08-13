import type { ReactNode } from 'react';
import { Button } from './button';

interface ErrorStateProps {
  errorCode?: string;
  message: string;
  retryAction?: () => void;
}

export function ErrorState({ errorCode, message, retryAction }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 mb-4 text-destructive">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      {errorCode && (
        <p className="text-sm font-mono text-muted-foreground mb-2">Error {errorCode}</p>
      )}
      <h3 className="text-lg font-semibold text-foreground mb-2">Une erreur est survenue</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">{message}</p>
      {retryAction && (
        <Button onClick={retryAction} variant="secondary">
          Réessayer
        </Button>
      )}
    </div>
  );
}