import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import {
  jobsSnapshotSchema,
  rankedResetJobSchema,
  type JobsSnapshot,
  type RankedResetJob,
} from './contracts';

export const JOBS_SNAPSHOT_QUERY_KEY = ['admin', 'jobs', 'snapshot'] as const;
const RANKED_RESET_CONTINUE_DELAY_MS = 120;
const RANKED_RESET_MAX_CONTINUE_STEPS = 5000;

async function fetchJobsSnapshot(): Promise<JobsSnapshot> {
  return rpcWithSchema(
    'admin_get_jobs_snapshot',
    { aiLimit: 8, recentJobsLimit: 8 },
    jobsSnapshotSchema,
  );
}

export function useJobsSnapshot() {
  return useQuery<JobsSnapshot, Error>({
    queryKey: JOBS_SNAPSHOT_QUERY_KEY,
    queryFn: fetchJobsSnapshot,
    refetchInterval: 20_000,
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function fetchRankedResetStatus(jobId?: string): Promise<RankedResetJob> {
  return rpcWithSchema(
    'admin_get_ranked_reset_status',
    jobId ? { jobId } : {},
    rankedResetJobSchema,
  );
}

export async function continueRankedResetJob(jobId: string): Promise<RankedResetJob> {
  if (!jobId) {
    throw new Error('jobId is required');
  }

  let latest = await rpcWithSchema(
    'admin_continue_ranked_reset',
    { jobId },
    rankedResetJobSchema,
  );

  for (let step = 0; step < RANKED_RESET_MAX_CONTINUE_STEPS; step += 1) {
    if (latest.status === 'completed' || latest.status === 'failed') {
      return latest;
    }

    await sleep(RANKED_RESET_CONTINUE_DELAY_MS);
    latest = await rpcWithSchema(
      'admin_continue_ranked_reset',
      { jobId },
      rankedResetJobSchema,
    );
  }

  return latest;
}

export async function startRankedReset(input: {
  reason: string;
  confirmText: string;
  maintenanceConfirmed: boolean;
}): Promise<RankedResetJob> {
  const started = await rpcWithSchema(
    'admin_start_ranked_reset',
    input,
    rankedResetJobSchema,
  );

  return continueRankedResetJob(started.jobId);
}

export function useContinueRankedResetMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: continueRankedResetJob,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: JOBS_SNAPSHOT_QUERY_KEY });
    },
  });
}

export function useStartRankedResetMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startRankedReset,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: JOBS_SNAPSHOT_QUERY_KEY });
    },
  });
}
