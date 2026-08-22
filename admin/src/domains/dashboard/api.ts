import { useQuery } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import { dashboardSnapshotSchema, type DashboardSnapshot } from './contracts';

export const DASHBOARD_SNAPSHOT_QUERY_KEY = ['admin', 'dashboard', 'snapshot'] as const;

async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  return rpcWithSchema(
    'admin_get_dashboard_snapshot',
    { days: 7, recentMatchesLimit: 5, recentActionsLimit: 6 },
    dashboardSnapshotSchema,
  );
}

export function useDashboardSnapshot() {
  return useQuery<DashboardSnapshot, Error>({
    queryKey: DASHBOARD_SNAPSHOT_QUERY_KEY,
    queryFn: fetchDashboardSnapshot,
    refetchInterval: 30_000,
  });
}

