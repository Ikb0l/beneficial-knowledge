import { requireAdminCapability, logAdminAction } from './admin';
import { getRankTiersFromDb, invalidateRankTiersCache } from './config';

// ============================================================================
// RANK TIERS ADMIN RPCs
// ============================================================================

// RPC: Get rank tiers (public - for client display)
export function rpcGetRankTiers(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var tiers = getRankTiersFromDb(nk, logger);
    return JSON.stringify({ tiers: tiers });
  } catch (error) {
    logger.error('Get rank tiers error: ' + error);
    throw error;
  }
}

// RPC: List rank tiers (admin - full details)
export function rpcAdminListRankTiers(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'rank_tiers.view');
    var request = JSON.parse(payload || '{}');
    var includeInactive = request.includeInactive || false;

    var whereClause = includeInactive ? '' : 'WHERE is_active = true';
    var result = nk.sqlQuery(
      `SELECT * FROM rank_tiers ${whereClause} ORDER BY display_order ASC`
    );
    var rows = Array.isArray(result) ? result : [];

    var tiers = rows.map(function(row: any) {
      return {
        id: row.id,
        tierKey: row.tier_key,
        name: row.name,
        minMmr: row.min_mmr,
        maxMmr: row.max_mmr,
        iconUrl: row.icon_url || '',
        color: row.color || '',
        displayOrder: row.display_order,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    return JSON.stringify({ tiers: tiers });
  } catch (error) {
    logger.error('Admin list rank tiers error: ' + error);
    throw error;
  }
}

// RPC: Create rank tier
export function rpcAdminCreateRankTier(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'rank_tiers.manage');
    var request = JSON.parse(payload || '{}');
    var tier = request.tier;

    if (!tier || !tier.tierKey || !tier.name || tier.minMmr === undefined || tier.maxMmr === undefined) {
      throw new Error('Tier key, name, minMmr, and maxMmr are required');
    }

    // Validate tier key format
    if (!/^[a-z0-9_]+$/.test(tier.tierKey)) {
      throw new Error('Tier key must be lowercase alphanumeric with underscores only');
    }

    // Check for key conflict
    var existingResult = nk.sqlQuery('SELECT id FROM rank_tiers WHERE tier_key = $1', [tier.tierKey]);
    if (Array.isArray(existingResult) && existingResult.length > 0) {
      throw new Error('Tier key already exists');
    }

    // Check for MMR range overlap with active tiers
    var overlapResult = nk.sqlQuery(
      `SELECT name FROM rank_tiers WHERE is_active = true
       AND NOT ($1 > max_mmr OR $2 < min_mmr)`,
      [tier.minMmr, tier.maxMmr]
    );
    if (Array.isArray(overlapResult) && overlapResult.length > 0) {
      throw new Error('MMR range overlaps with existing tier: ' + overlapResult[0].name);
    }

    // Get next display order
    var orderResult = nk.sqlQuery('SELECT COALESCE(MAX(display_order), 0) + 1 as next_order FROM rank_tiers');
    var orderRows = Array.isArray(orderResult) ? orderResult : [];
    var displayOrder = tier.displayOrder !== undefined ? tier.displayOrder : (orderRows.length > 0 ? parseInt(orderRows[0].next_order) : 1);

    var result = nk.sqlQuery(
      `INSERT INTO rank_tiers (tier_key, name, min_mmr, max_mmr, icon_url, color, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, tier_key, name, created_at`,
      [tier.tierKey, tier.name, tier.minMmr, tier.maxMmr, tier.iconUrl || '', tier.color || '', displayOrder, tier.isActive !== false]
    );

    var rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) {
      throw new Error('Failed to create rank tier');
    }

    invalidateRankTiersCache();
    logAdminAction(nk, logger, ctx.userId, admin.telegramId, 'rank_tier_create', 'rank_tier', rows[0].id, null, tier);

    return JSON.stringify({ success: true, tier: { id: rows[0].id, tierKey: rows[0].tier_key, name: rows[0].name } });
  } catch (error) {
    logger.error('Create rank tier error: ' + error);
    throw error;
  }
}

// RPC: Update rank tier
export function rpcAdminUpdateRankTier(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'rank_tiers.manage');
    var request = JSON.parse(payload || '{}');
    var tierId = request.tierId;
    var updates = request.updates;

    if (!tierId || !updates) {
      throw new Error('Tier ID and updates required');
    }

    // Get current tier
    var currentResult = nk.sqlQuery('SELECT * FROM rank_tiers WHERE id = $1', [tierId]);
    var currentRows = Array.isArray(currentResult) ? currentResult : [];
    if (currentRows.length === 0) {
      throw new Error('Rank tier not found');
    }
    var oldTier = currentRows[0];

    // Check for MMR range overlap if changing MMR values
    var newMinMmr = updates.minMmr !== undefined ? updates.minMmr : oldTier.min_mmr;
    var newMaxMmr = updates.maxMmr !== undefined ? updates.maxMmr : oldTier.max_mmr;

    if (updates.minMmr !== undefined || updates.maxMmr !== undefined) {
      var overlapResult = nk.sqlQuery(
        `SELECT name FROM rank_tiers WHERE is_active = true AND id != $1
         AND NOT ($2 > max_mmr OR $3 < min_mmr)`,
        [tierId, newMinMmr, newMaxMmr]
      );
      if (Array.isArray(overlapResult) && overlapResult.length > 0) {
        throw new Error('MMR range overlaps with existing tier: ' + overlapResult[0].name);
      }
    }

    // Build update query
    var setClauses: string[] = ['updated_at = NOW()'];
    var params: any[] = [];
    var paramIndex = 1;

    if (updates.name !== undefined) { setClauses.push('name = $' + paramIndex++); params.push(updates.name); }
    if (updates.minMmr !== undefined) { setClauses.push('min_mmr = $' + paramIndex++); params.push(updates.minMmr); }
    if (updates.maxMmr !== undefined) { setClauses.push('max_mmr = $' + paramIndex++); params.push(updates.maxMmr); }
    if (updates.iconUrl !== undefined) { setClauses.push('icon_url = $' + paramIndex++); params.push(updates.iconUrl); }
    if (updates.color !== undefined) { setClauses.push('color = $' + paramIndex++); params.push(updates.color); }
    if (updates.displayOrder !== undefined) { setClauses.push('display_order = $' + paramIndex++); params.push(updates.displayOrder); }
    if (updates.isActive !== undefined) { setClauses.push('is_active = $' + paramIndex++); params.push(updates.isActive); }

    params.push(tierId);
    nk.sqlExec('UPDATE rank_tiers SET ' + setClauses.join(', ') + ' WHERE id = $' + paramIndex, params);

    invalidateRankTiersCache();
    logAdminAction(nk, logger, ctx.userId, admin.telegramId, 'rank_tier_update', 'rank_tier', tierId, oldTier, updates);

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Update rank tier error: ' + error);
    throw error;
  }
}

// RPC: Delete rank tier
export function rpcAdminDeleteRankTier(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'rank_tiers.manage');
    var request = JSON.parse(payload || '{}');
    var tierId = request.tierId;

    if (!tierId) {
      throw new Error('Tier ID required');
    }

    var currentResult = nk.sqlQuery('SELECT * FROM rank_tiers WHERE id = $1', [tierId]);
    var currentRows = Array.isArray(currentResult) ? currentResult : [];
    if (currentRows.length === 0) {
      throw new Error('Rank tier not found');
    }

    nk.sqlExec('UPDATE rank_tiers SET is_active = false, updated_at = NOW() WHERE id = $1', [tierId]);

    invalidateRankTiersCache();
    logAdminAction(nk, logger, ctx.userId, admin.telegramId, 'rank_tier_delete', 'rank_tier', tierId, currentRows[0], { deleted: true });

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Delete rank tier error: ' + error);
    throw error;
  }
}

// ============================================================================
