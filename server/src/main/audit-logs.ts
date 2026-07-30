import { requireAdminCapability } from './admin';

// AUDIT LOG RPCs
// ============================================================================

// RPC: List audit logs
export function rpcAdminListAuditLogs(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'audit.view');
    var request = JSON.parse(payload || '{}');
    var limit = Math.min(request.limit || request.pageSize || 50, 200);
    var page = Math.max(parseInt(request.page || 1, 10), 1);
    var offset = request.offset !== undefined ? request.offset : (page - 1) * limit;
    var adminId = request.adminId;
    var actionType = request.actionType;
    var targetType = request.targetType;
    var targetId = request.targetId;
    var dateFrom = request.dateFrom || request.fromDate;
    var dateTo = request.dateTo || request.toDate;

    var conditions: string[] = [];
    var params: any[] = [];
    var paramIndex = 1;

    if (adminId) {
      conditions.push('al.admin_id = $' + paramIndex++);
      params.push(adminId);
    }
    if (actionType) {
      conditions.push('al.action_type = $' + paramIndex++);
      params.push(actionType);
    }
    if (targetType) {
      conditions.push('al.target_type = $' + paramIndex++);
      params.push(targetType);
    }
    if (targetId) {
      conditions.push('al.target_id = $' + paramIndex++);
      params.push(targetId);
    }
    if (dateFrom) {
      conditions.push('al.created_at >= $' + paramIndex++);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('al.created_at <= $' + paramIndex++);
      params.push(dateTo);
    }

    var whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Get total count
    var countResult = nk.sqlQuery('SELECT COUNT(*) as count FROM admin_audit_log al ' + whereClause, params);
    var countRows = Array.isArray(countResult) ? countResult : [];
    var total = countRows.length > 0 ? parseInt(countRows[0].count) : 0;

    // Get logs with admin name
    params.push(limit);
    params.push(offset);
    var result = nk.sqlQuery(
      `SELECT al.*, u.username as admin_name
       FROM admin_audit_log al
       LEFT JOIN users u ON al.admin_id = u.id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );
    var rows = Array.isArray(result) ? result : [];

    var logs = rows.map(function(row: any) {
      return {
        id: row.id,
        adminId: row.admin_id,
        adminName: row.admin_name || 'Unknown',
        adminTelegramId: row.admin_telegram_id,
        actionType: row.action_type,
        targetType: row.target_type,
        targetId: row.target_id,
        oldValue: row.old_value,
        newValue: row.new_value,
        metadata: row.metadata,
        createdAt: row.created_at,
      };
    });

    // Get distinct action types for filter dropdown
    var actionTypesResult = nk.sqlQuery('SELECT DISTINCT action_type FROM admin_audit_log ORDER BY action_type');
    var actionTypes = (Array.isArray(actionTypesResult) ? actionTypesResult : []).map(function(r: any) { return r.action_type; });

    // Get distinct target types for filter dropdown
    var targetTypesResult = nk.sqlQuery('SELECT DISTINCT target_type FROM admin_audit_log WHERE target_type IS NOT NULL ORDER BY target_type');
    var targetTypes = (Array.isArray(targetTypesResult) ? targetTypesResult : []).map(function(r: any) { return r.target_type; });

    return JSON.stringify({
      logs: logs,
      total: total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
      limit: limit,
      offset: offset,
      actionTypes: actionTypes,
      targetTypes: targetTypes,
    });
  } catch (error) {
    logger.error('List audit logs error: ' + error);
    throw error;
  }
}

// RPC: Get single audit log entry
export function rpcAdminGetAuditLog(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'audit.view');
    var request = JSON.parse(payload || '{}');
    var logId = request.logId;

    if (!logId) {
      throw new Error('Log ID required');
    }

    var result = nk.sqlQuery(
      `SELECT al.*, u.username as admin_name
       FROM admin_audit_log al
       LEFT JOIN users u ON al.admin_id = u.id
       WHERE al.id = $1`,
      [logId]
    );
    var rows = Array.isArray(result) ? result : [];

    if (rows.length === 0) {
      throw new Error('Audit log entry not found');
    }

    var row = rows[0];
    return JSON.stringify({
      log: {
        id: row.id,
        adminId: row.admin_id,
        adminName: row.admin_name || 'Unknown',
        adminTelegramId: row.admin_telegram_id,
        actionType: row.action_type,
        targetType: row.target_type,
        targetId: row.target_id,
        oldValue: row.old_value,
        newValue: row.new_value,
        metadata: row.metadata,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    logger.error('Get audit log error: ' + error);
    throw error;
  }
}

// RPC: List bans
export function rpcAdminListBans(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'users.view');
    var request = JSON.parse(payload || '{}');
    var activeOnly = request.active;
    var limit = Math.min(request.limit || 20, 100);
    var offset = request.offset || 0;

    var whereClause = activeOnly ? 'WHERE is_active = true' : '';

    var countResult = nk.sqlQuery('SELECT COUNT(*) as count FROM user_bans ' + whereClause);
    var countRows = Array.isArray(countResult) ? countResult : [];
    var total = countRows.length > 0 ? parseInt(countRows[0].count) : 0;

    var result = nk.sqlQuery(
      `SELECT b.*, u.username as banned_username, admin.username as admin_username
       FROM user_bans b
       LEFT JOIN users u ON b.user_id = u.id
       LEFT JOIN users admin ON b.banned_by = admin.id
       ${whereClause.replace('is_active', 'b.is_active')}
       ORDER BY b.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    var rows = Array.isArray(result) ? result : [];
    var bans = rows.map(function(row: any) {
      return {
        id: row.id,
        userId: row.user_id,
        username: row.banned_username || 'Unknown',
        telegramId: row.telegram_id,
        bannedBy: row.banned_by,
        bannedByName: row.admin_username || 'System',
        reason: row.reason,
        isPermanent: row.is_permanent,
        expiresAt: row.expires_at,
        isActive: row.is_active,
        createdAt: row.created_at,
        unbannedAt: row.unbanned_at,
        unbannedBy: row.unbanned_by,
      };
    });

    return JSON.stringify({
      items: bans,
      total: total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error('List bans error: ' + error);
    throw error;
  }
}

// ============================================================================
