interface ModuleHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

/**
 * En-tête de page standard : le fil d'Ariane est fourni par le ModuleShell
 * du domaine — ce header ne rend que le titre, la description et les actions.
 */
export function ModuleHeader({ title, description, actions }: ModuleHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
