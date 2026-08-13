"use client";

interface Permission {
  id: string;
  code: string;
  nom: string;
}

interface CheckboxGroupProps {
  label: string;
  permissions: Permission[];
  selectedIds: string[];
  onToggle: (permId: string) => void;
}

export function CheckboxGroup({ label, permissions, selectedIds, onToggle }: CheckboxGroupProps) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground mb-2">{label}</p>
      <div className="space-y-1.5">
        {permissions.map((perm) => (
          <label
            key={perm.id}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-accent cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(perm.id)}
              onChange={() => onToggle(perm.id)}
              className="rounded border-border"
            />
            <div>
              <p className="text-sm font-medium text-foreground">{perm.nom}</p>
              <p className="text-xs text-muted-foreground font-mono">{perm.code}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
