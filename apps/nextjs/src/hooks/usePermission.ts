import { useCallback } from "react";
import { useSession } from "next-auth/react";

// Permission matrix for AtelierOne roles
const rolePermissions: Record<string, string[]> = {
  admin_reseau: ['*'],
  responsable_agence: [
    'sale.create', 'sale.read', 'sale.update', 'sale.void',
    'inventory.view', 'inventory.adjust', 'inventory.count',
    'cash.session.open', 'cash.session.close', 'cash.session.manage',
    'product.create', 'product.update', 'product.delete',
    'report.view', 'audit.view'
  ],
  operateur_pos: [
    'sale.create', 'sale.read',
    'product.read',
    'payment.collect',
    'cash.session.open'
  ],
  caissier: [
    'sale.read',
    'cash.session.open', 'cash.session.close',
    'payment.collect'
  ],
  magasinier: [
    'inventory.view', 'inventory.adjust', 'inventory.count',
    'product.read'
  ]
};

export function usePermission() {
  const { data: session } = useSession();
  const user = session?.user;

  const can = useCallback((permission: string, scope?: string) => {
    if (!user) return false;

    if (user.role === 'admin_reseau') return true;

    if (!user.role) return false;
    const permissions = rolePermissions[user.role] || [];
    if (permissions.includes('*') || permissions.includes(permission)) {
      return true;
    }

    return false;
  }, [user]);

  return { can, user };
}