import { requireAdminCapability, logAdminAction, rpcAdminListCategories } from './admin';

function parseJsonPayload<T>(payload: string): T {
  return JSON.parse(payload) as T;
}

function getHomeControlWarnings(
  banners: any[],
  sections: any[],
  featuredItems: any[],
  categories: any[],
  tournaments: any[]
): Array<{ id: string; tone: string; title: string; description: string }> {
  var warnings: Array<{ id: string; tone: string; title: string; description: string }> = [];
  var activeBannerCount = banners.filter(function(item: any) { return item.isActive; }).length;
  var visibleSectionCount = sections.filter(function(item: any) { return item.isVisible; }).length;
  var featuredCategoryCount = featuredItems.filter(function(item: any) { return item.itemType === 'category'; }).length;
  var featuredTournamentCount = featuredItems.filter(function(item: any) { return item.itemType === 'tournament'; }).length;
  var activeCategories = categories.filter(function(item: any) { return item.isActive; }).length;

  if (activeBannerCount === 0) {
    warnings.push({
      id: 'no-active-banners',
      tone: 'warning',
      title: 'No active banners are configured',
      description: 'The home page has no active announcement banner to drive campaigns or highlight events.',
    });
  }

  if (visibleSectionCount === 0) {
    warnings.push({
      id: 'no-visible-sections',
      tone: 'danger',
      title: 'All home sections are hidden',
      description: 'The current home composer would hide every configurable section from players.',
    });
  }

  if (featuredCategoryCount === 0 && activeCategories > 0) {
    warnings.push({
      id: 'no-featured-categories',
      tone: 'info',
      title: 'No featured categories selected',
      description: 'Players will not see a curated category section on the home screen.',
    });
  }

  if (featuredTournamentCount === 0 && tournaments.length > 0) {
    warnings.push({
      id: 'no-featured-tournaments',
      tone: 'info',
      title: 'No featured tournaments selected',
      description: 'Tournament discovery on the home screen is currently uncurated.',
    });
  }

  return warnings;
}

// HOME PAGE CONTROL RPCs
// ============================================================================

// RPC: Get home page configuration (public - for client)
export function rpcGetHomeConfig(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    // Get active banners
    var bannersResult = nk.sqlQuery(
      `SELECT * FROM home_banners
       WHERE is_active = true
       AND (start_date IS NULL OR start_date <= NOW())
       AND (end_date IS NULL OR end_date >= NOW())
       ORDER BY display_order ASC`
    );
    var banners = (Array.isArray(bannersResult) ? bannersResult : []).map(function(row: any) {
      return {
        id: row.id,
        title: row.title,
        body: row.body || '',
        imageUrl: row.image_url || '',
        actionUrl: row.action_url || '',
        actionType: row.action_type || 'url',
        actionData: row.action_data,
      };
    });

    // Get home sections
    var sectionsResult = nk.sqlQuery('SELECT * FROM home_sections WHERE is_visible = true ORDER BY display_order ASC');
    var sections = (Array.isArray(sectionsResult) ? sectionsResult : []).map(function(row: any) {
      return {
        sectionKey: row.section_key,
        name: row.name,
        displayOrder: row.display_order,
        config: row.config,
      };
    });

    // Get featured categories
    var featuredCatsResult = nk.sqlQuery(
      `SELECT fi.*, c.name as item_name, c.icon, c.category_key
       FROM featured_items fi
       JOIN categories c ON fi.item_id = c.id
       WHERE fi.item_type = 'category' AND fi.is_active = true
       AND (fi.start_date IS NULL OR fi.start_date <= NOW())
       AND (fi.end_date IS NULL OR fi.end_date >= NOW())
       ORDER BY fi.display_order ASC`
    );
    var featuredCategories = (Array.isArray(featuredCatsResult) ? featuredCatsResult : []).map(function(row: any) {
      return {
        categoryKey: row.category_key,
        name: row.item_name,
        icon: row.icon,
      };
    });

    // Get featured tournaments
    var featuredTournsResult = nk.sqlQuery(
      `SELECT fi.*, t.name as item_name, t.status, t.registration_start, t.tournament_start
       FROM featured_items fi
       JOIN tournaments t ON fi.item_id = t.id
       WHERE fi.item_type = 'tournament' AND fi.is_active = true
       AND (fi.start_date IS NULL OR fi.start_date <= NOW())
       AND (fi.end_date IS NULL OR fi.end_date >= NOW())
       ORDER BY fi.display_order ASC`
    );
    var featuredTournaments = (Array.isArray(featuredTournsResult) ? featuredTournsResult : []).map(function(row: any) {
      return {
        id: row.item_id,
        name: row.item_name,
        status: row.status,
        registrationStart: row.registration_start,
        tournamentStart: row.tournament_start,
      };
    });

    return JSON.stringify({
      banners: banners,
      sections: sections,
      featuredCategories: featuredCategories,
      featuredTournaments: featuredTournaments,
    });
  } catch (error) {
    logger.error('Get home config error: ' + error);
    throw error;
  }
}

// RPC: List banners (admin)
export function rpcAdminListBanners(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'home_control.view');
    var request = JSON.parse(payload || '{}');
    var includeInactive = request.includeInactive || false;

    var whereClause = includeInactive ? '' : 'WHERE is_active = true';
    var result = nk.sqlQuery(`SELECT * FROM home_banners ${whereClause} ORDER BY display_order ASC`);
    var rows = Array.isArray(result) ? result : [];

    var banners = rows.map(function(row: any) {
      return {
        id: row.id,
        title: row.title,
        body: row.body || '',
        imageUrl: row.image_url || '',
        actionUrl: row.action_url || '',
        actionType: row.action_type || 'url',
        actionData: row.action_data,
        startDate: row.start_date,
        endDate: row.end_date,
        displayOrder: row.display_order,
        isActive: row.is_active,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    return JSON.stringify({ banners: banners });
  } catch (error) {
    logger.error('List banners error: ' + error);
    throw error;
  }
}

// RPC: Create banner
export function rpcAdminCreateBanner(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'home_control.view');
    var request = JSON.parse(payload || '{}');
    var banner = request.banner;

    if (!banner || !banner.title) {
      throw new Error('Banner title is required');
    }

    var orderResult = nk.sqlQuery('SELECT COALESCE(MAX(display_order), 0) + 1 as next_order FROM home_banners');
    var orderRows = Array.isArray(orderResult) ? orderResult : [];
    var displayOrder = banner.displayOrder !== undefined ? banner.displayOrder : (orderRows.length > 0 ? parseInt(orderRows[0].next_order) : 1);

    var result = nk.sqlQuery(
      `INSERT INTO home_banners (title, body, image_url, action_url, action_type, action_data, start_date, end_date, display_order, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, title, created_at`,
      [
        banner.title,
        banner.body || '',
        banner.imageUrl || '',
        banner.actionUrl || '',
        banner.actionType || 'url',
        banner.actionData ? JSON.stringify(banner.actionData) : null,
        banner.startDate || null,
        banner.endDate || null,
        displayOrder,
        banner.isActive !== false,
        ctx.userId,
      ]
    );

    var rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) {
      throw new Error('Failed to create banner');
    }

    logAdminAction(nk, logger, ctx.userId, admin.telegramId, 'banner_create', 'banner', rows[0].id, null, banner);

    return JSON.stringify({ success: true, banner: { id: rows[0].id, title: rows[0].title } });
  } catch (error) {
    logger.error('Create banner error: ' + error);
    throw error;
  }
}

// RPC: Update banner
export function rpcAdminUpdateBanner(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'home_control.view');
    var request = JSON.parse(payload || '{}');
    var bannerId = request.bannerId;
    var updates = request.updates;

    if (!bannerId || !updates) {
      throw new Error('Banner ID and updates required');
    }

    var currentResult = nk.sqlQuery('SELECT * FROM home_banners WHERE id = $1', [bannerId]);
    var currentRows = Array.isArray(currentResult) ? currentResult : [];
    if (currentRows.length === 0) {
      throw new Error('Banner not found');
    }

    var setClauses: string[] = ['updated_at = NOW()'];
    var params: any[] = [];
    var paramIndex = 1;

    if (updates.title !== undefined) { setClauses.push('title = $' + paramIndex++); params.push(updates.title); }
    if (updates.body !== undefined) { setClauses.push('body = $' + paramIndex++); params.push(updates.body); }
    if (updates.imageUrl !== undefined) { setClauses.push('image_url = $' + paramIndex++); params.push(updates.imageUrl); }
    if (updates.actionUrl !== undefined) { setClauses.push('action_url = $' + paramIndex++); params.push(updates.actionUrl); }
    if (updates.actionType !== undefined) { setClauses.push('action_type = $' + paramIndex++); params.push(updates.actionType); }
    if (updates.actionData !== undefined) { setClauses.push('action_data = $' + paramIndex++); params.push(JSON.stringify(updates.actionData)); }
    if (updates.startDate !== undefined) { setClauses.push('start_date = $' + paramIndex++); params.push(updates.startDate); }
    if (updates.endDate !== undefined) { setClauses.push('end_date = $' + paramIndex++); params.push(updates.endDate); }
    if (updates.displayOrder !== undefined) { setClauses.push('display_order = $' + paramIndex++); params.push(updates.displayOrder); }
    if (updates.isActive !== undefined) { setClauses.push('is_active = $' + paramIndex++); params.push(updates.isActive); }

    params.push(bannerId);
    nk.sqlExec('UPDATE home_banners SET ' + setClauses.join(', ') + ' WHERE id = $' + paramIndex, params);

    logAdminAction(nk, logger, ctx.userId, admin.telegramId, 'banner_update', 'banner', bannerId, currentRows[0], updates);

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Update banner error: ' + error);
    throw error;
  }
}

// RPC: Delete banner
export function rpcAdminDeleteBanner(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'home_control.view');
    var request = JSON.parse(payload || '{}');
    var bannerId = request.bannerId;

    if (!bannerId) {
      throw new Error('Banner ID required');
    }

    var currentResult = nk.sqlQuery('SELECT * FROM home_banners WHERE id = $1', [bannerId]);
    var currentRows = Array.isArray(currentResult) ? currentResult : [];
    if (currentRows.length === 0) {
      throw new Error('Banner not found');
    }

    nk.sqlExec('DELETE FROM home_banners WHERE id = $1', [bannerId]);

    logAdminAction(nk, logger, ctx.userId, admin.telegramId, 'banner_delete', 'banner', bannerId, currentRows[0], { deleted: true });

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Delete banner error: ' + error);
    throw error;
  }
}

// RPC: Home control snapshot
export function rpcAdminGetHomeControlSnapshot(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'home_control.view');
    var includeInactive = parseJsonPayload<{ includeInactive?: boolean }>(payload || '{}').includeInactive !== false;

    var bannersResponse = parseJsonPayload<{ banners: any[] }>(
      rpcAdminListBanners(ctx, logger, nk, JSON.stringify({ includeInactive: includeInactive }))
    );
    var sectionsResponse = parseJsonPayload<{ sections: any[] }>(
      rpcAdminListHomeSections(ctx, logger, nk, '{}')
    );
    var featuredResponse = parseJsonPayload<{ items: any[] }>(
      rpcAdminListFeaturedItems(ctx, logger, nk, '{}')
    );
    var categoriesResponse = parseJsonPayload<{ categories: any[] }>(
      rpcAdminListCategories(ctx, logger, nk, JSON.stringify({ includeInactive: true }))
    );
    var categories = (categoriesResponse.categories || []).map(function(row: any) {
      return {
        id: row.id,
        categoryKey: row.categoryKey,
        name: row.name,
        icon: row.icon || '',
        isActive: row.isActive !== false,
        questionCount: parseInt(row.questionCount || '0', 10) || 0,
      };
    });
    var tournamentsResult = nk.sqlQuery(
      `SELECT id, name, status
       FROM tournaments
       ORDER BY tournament_start DESC NULLS LAST, registration_start DESC NULLS LAST
       LIMIT 50`
    );
    var tournaments = (Array.isArray(tournamentsResult) ? tournamentsResult : []).map(function(row: any) {
      return {
        id: row.id,
        name: row.name,
        status: row.status,
      };
    });

    return JSON.stringify({
      banners: bannersResponse.banners || [],
      sections: sectionsResponse.sections || [],
      featuredItems: featuredResponse.items || [],
      categories: categories,
      tournaments: tournaments,
      warnings: getHomeControlWarnings(
        bannersResponse.banners || [],
        sectionsResponse.sections || [],
        featuredResponse.items || [],
        categories,
        tournaments
      ),
    });
  } catch (error) {
    logger.error('Home control snapshot error: ' + error);
    throw error;
  }
}

// RPC: List home sections (admin)
export function rpcAdminListHomeSections(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'home_control.view');

    var result = nk.sqlQuery('SELECT * FROM home_sections ORDER BY display_order ASC');
    var rows = Array.isArray(result) ? result : [];

    var sections = rows.map(function(row: any) {
      return {
        id: row.id,
        sectionKey: row.section_key,
        name: row.name,
        isVisible: row.is_visible,
        displayOrder: row.display_order,
        config: row.config,
        updatedAt: row.updated_at,
      };
    });

    return JSON.stringify({ sections: sections });
  } catch (error) {
    logger.error('List home sections error: ' + error);
    throw error;
  }
}

// RPC: Update home sections (batch update visibility/order)
export function rpcAdminUpdateHomeSections(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'home_control.view');
    var request = JSON.parse(payload || '{}');
    var sections = request.sections; // Array of {sectionKey, isVisible, displayOrder, config}

    if (!sections || !Array.isArray(sections)) {
      throw new Error('Sections array required');
    }

    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      var setClauses: string[] = ['updated_at = NOW()'];
      var params: any[] = [];
      var paramIndex = 1;

      if (section.isVisible !== undefined) { setClauses.push('is_visible = $' + paramIndex++); params.push(section.isVisible); }
      if (section.displayOrder !== undefined) { setClauses.push('display_order = $' + paramIndex++); params.push(section.displayOrder); }
      if (section.config !== undefined) { setClauses.push('config = $' + paramIndex++); params.push(JSON.stringify(section.config)); }

      if (params.length > 0) {
        params.push(section.sectionKey);
        nk.sqlExec('UPDATE home_sections SET ' + setClauses.join(', ') + ' WHERE section_key = $' + paramIndex, params);
      }
    }

    logAdminAction(nk, logger, ctx.userId, admin.telegramId, 'home_sections_update', 'home_section', 'batch', null, sections);

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Update home sections error: ' + error);
    throw error;
  }
}

// RPC: List featured items (admin)
export function rpcAdminListFeaturedItems(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'home_control.view');
    var request = JSON.parse(payload || '{}');
    var itemType = request.itemType; // 'category' or 'tournament'

    // Validate itemType to prevent SQL injection - whitelist approach
    var validItemTypes = ['category', 'tournament'];
    if (itemType && validItemTypes.indexOf(itemType) === -1) {
      throw new Error('Invalid item type. Must be "category" or "tournament"');
    }

    var result = nk.sqlQuery(
      `SELECT fi.*,
        COALESCE(c.name, t.name) as item_name,
        c.icon as category_icon, c.category_key,
        t.status as tournament_status
       FROM featured_items fi
       LEFT JOIN categories c ON fi.item_type = 'category' AND fi.item_id = c.id
       LEFT JOIN tournaments t ON fi.item_type = 'tournament' AND fi.item_id = t.id
       WHERE ($1::text IS NULL OR fi.item_type = $1)
       ORDER BY fi.item_type, fi.display_order ASC`,
      [itemType || null]
    );
    var rows = Array.isArray(result) ? result : [];

    var items = rows.map(function(row: any) {
      return {
        id: row.id,
        itemType: row.item_type,
        itemId: row.item_id,
        itemName: row.item_name,
        categoryKey: row.category_key,
        categoryIcon: row.category_icon,
        tournamentStatus: row.tournament_status,
        displayOrder: row.display_order,
        isActive: row.is_active,
        startDate: row.start_date,
        endDate: row.end_date,
        createdAt: row.created_at,
      };
    });

    return JSON.stringify({ items: items });
  } catch (error) {
    logger.error('List featured items error: ' + error);
    throw error;
  }
}

// RPC: Set featured items (replace all of a type)
export function rpcAdminSetFeaturedItems(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'home_control.view');
    var request = JSON.parse(payload || '{}');
    var items = Array.isArray(request.items) ? request.items : null;
    var itemType = request.itemType; // legacy
    var itemIds = request.itemIds; // legacy

    if (!items) {
      if (!itemType || !['category', 'tournament'].includes(itemType)) {
        throw new Error('Valid itemType required (category or tournament)');
      }
      if (!itemIds || !Array.isArray(itemIds)) {
        throw new Error('itemIds array required');
      }
      items = itemIds.map(function(id: string, index: number) {
        return {
          itemType: itemType,
          itemId: id,
          displayOrder: index + 1,
          isActive: true,
        };
      });
    }

    var normalizedItems = items
      .filter(function(item: any) {
        return item && (item.itemType === 'category' || item.itemType === 'tournament') && !!item.itemId;
      })
      .map(function(item: any, index: number) {
        return {
          itemType: item.itemType,
          itemId: item.itemId,
          displayOrder: Math.max(1, parseInt(item.displayOrder || index + 1, 10) || index + 1),
          isActive: item.isActive !== false,
        };
      });

    nk.sqlExec('DELETE FROM featured_items');

    for (var i = 0; i < normalizedItems.length; i++) {
      var item = normalizedItems[i];
      nk.sqlExec(
        `INSERT INTO featured_items (item_type, item_id, display_order, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [item.itemType, item.itemId, item.displayOrder, item.isActive, ctx.userId]
      );
    }

    logAdminAction(nk, logger, ctx.userId, admin.telegramId, 'featured_items_set', 'featured_item', 'all', null, {
      items: normalizedItems,
    });

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('Set featured items error: ' + error);
    throw error;
  }
}

// ============================================================================
