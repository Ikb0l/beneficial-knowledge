import { ACTION_CAPABILITY_MAP, hasCapability, type RestrictedAction } from '../lib/permissions';
import type { AdminCapability } from '../types';
import { useAdminAuthStore } from '../stores/authStore';

export function useRBAC() {
  const { admin } = useAdminAuthStore();

  const isSuperAdmin = admin?.adminLevel === 'super_admin';
  const isAdmin = admin?.adminLevel === 'admin' || isSuperAdmin;
  const capabilities = admin?.capabilities || [];

  /**
   * Check if the current admin can perform a specific action
   */
  const canPerform = (action: RestrictedAction): boolean => {
    if (!isAdmin) return false;
    return hasCapability(capabilities, ACTION_CAPABILITY_MAP[action]);
  };

  const can = (capability: AdminCapability): boolean => {
    if (!isAdmin) return false;
    return hasCapability(capabilities, capability);
  };

  return {
    isSuperAdmin,
    isAdmin,
    canPerform,
    can,
    capabilities,
    adminLevel: admin?.adminLevel ?? null,
  };
}

export default useRBAC;
