import { keepPreviousData, useQuery } from '@tanstack/react-query';
import rpcWithSchema from '../../lib/rpc';
import { auditLogsResponseSchema, type AuditLogsResponse } from './contracts';

export interface AuditLogListParams {
  page: number;
  pageSize?: number;
  actionType?: string;
  adminId?: string;
  targetType?: string;
  targetId?: string;
  fromDate?: string;
  toDate?: string;
}

export const AUDIT_LOGS_QUERY_KEY = ['admin', 'audit', 'logs'] as const;

function buildAuditLogPayload(params: AuditLogListParams) {
  const pageSize = params.pageSize ?? 50;
  return {
    actionType: params.actionType,
    adminId: params.adminId,
    targetType: params.targetType,
    targetId: params.targetId,
    dateFrom: params.fromDate,
    dateTo: params.toDate,
    limit: pageSize,
    offset: Math.max(0, (params.page - 1) * pageSize),
  };
}

export function getAuditLogsQueryKey(params: AuditLogListParams) {
  return [
    ...AUDIT_LOGS_QUERY_KEY,
    {
      page: params.page,
      pageSize: params.pageSize ?? 50,
      actionType: params.actionType ?? '',
      adminId: params.adminId ?? '',
      targetType: params.targetType ?? '',
      targetId: params.targetId ?? '',
      fromDate: params.fromDate ?? '',
      toDate: params.toDate ?? '',
    },
  ] as const;
}

export async function fetchAuditLogs(params: AuditLogListParams): Promise<AuditLogsResponse> {
  return rpcWithSchema(
    'admin_list_audit_logs',
    buildAuditLogPayload(params),
    auditLogsResponseSchema,
  );
}

export function useAuditLogsQuery(params: AuditLogListParams) {
  return useQuery<AuditLogsResponse, Error>({
    queryKey: getAuditLogsQueryKey(params),
    queryFn: () => fetchAuditLogs(params),
    placeholderData: keepPreviousData,
  });
}

