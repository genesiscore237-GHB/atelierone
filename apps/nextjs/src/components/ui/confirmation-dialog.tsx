import { useState } from 'react';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  requiresReason?: boolean;
}

export function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  variant = 'default',
  requiresReason = false
}: ConfirmationDialogProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    onConfirm(requiresReason ? reason : undefined);
    setReason('');
    onClose();
  };

  if (!isOpen) return null;

  const confirmBtnClass = variant === 'destructive'
    ? 'rounded-xl bg-destructive py-2.5 px-4 text-sm font-bold text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50'
    : 'rounded-xl bg-primary py-2.5 px-4 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-modal)]">
        <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{description}</p>

        {requiresReason && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground mb-2">
              Motif (obligatoire)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Expliquez la raison de cette action..."
              rows={3}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-ring"
              required
            />
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border bg-background py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={requiresReason && !reason.trim()}
            className={confirmBtnClass + " flex-1"}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}