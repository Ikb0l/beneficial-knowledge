import { getAdminInfoForFeatures, logAdminActionFeatures, requireAdminForFeatures } from './helpers';

// DONATIONS RPCs
// ============================================================================

export function rpcInitiateDonation(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  try {
    var request = JSON.parse(payload || '{}');

    if (!request.amountCents || request.amountCents < 100) {
      throw new Error('Minimum donation is $1 (100 cents)');
    }

    // Create pending donation record
    var result = nk.sqlQuery(
      `INSERT INTO donations (user_id, amount_cents, currency, donor_name, donor_message, is_anonymous)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        ctx.userId,
        request.amountCents,
        request.currency || 'USD',
        request.donorName || null,
        request.donorMessage || null,
        request.isAnonymous || false,
      ]
    );
    var rows = Array.isArray(result) ? result : [];

    // In production, integrate with payment provider here
    // For now, return donation ID for manual confirmation

    return JSON.stringify({
      donationId: rows.length > 0 ? rows[0].id : null,
      amountCents: request.amountCents,
      currency: request.currency || 'USD',
      // paymentUrl would come from Stripe/PayPal integration
    });
  } catch (error) {
    logger.error('Error initiating donation: ' + error);
    throw error;
  }
}

export function rpcConfirmDonation(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminForFeatures(ctx, nk, logger);
    var adminInfo = getAdminInfoForFeatures(ctx, nk, logger);
    var request = JSON.parse(payload || '{}');

    if (!request.donationId) {
      throw new Error('donationId is required');
    }

    // Get donation
    var donResult = nk.sqlQuery(
      `SELECT user_id, amount_cents, payment_status FROM donations WHERE id = $1`,
      [request.donationId]
    );
    var donRows = Array.isArray(donResult) ? donResult : [];

    if (donRows.length === 0) {
      throw new Error('Donation not found');
    }

    if (donRows[0].payment_status === 'completed') {
      throw new Error('Donation already confirmed');
    }

    var userId = donRows[0].user_id;
    var amountCents = parseInt(donRows[0].amount_cents);

    // Find applicable tier
    var tierResult = nk.sqlQuery(
      `SELECT id, tier_name FROM donation_tiers
       WHERE min_amount_cents <= $1 AND is_active = true
       ORDER BY min_amount_cents DESC LIMIT 1`,
      [amountCents]
    );
    var tierRows = Array.isArray(tierResult) ? tierResult : [];

    var tierName = null;

    if (tierRows.length > 0) {
      tierName = tierRows[0].tier_name;
    }

    // Start transaction for atomic donation confirmation
    nk.sqlExec(`BEGIN`, []);

    try {
      // Update donation status
      nk.sqlExec(
        `UPDATE donations SET payment_status = 'completed', completed_at = NOW(),
         badge_awarded_id = $1, coins_bonus = $2
         WHERE id = $3`,
        [null, 0, request.donationId]
      );

      // Create notification
      nk.sqlExec(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'system', 'Thank you for your donation!', $2)`,
        [userId, 'Your donation of $' + (amountCents / 100).toFixed(2) + ' has been received. Thank you for supporting us!']
      );

      // Commit transaction
      nk.sqlExec(`COMMIT`, []);

      // Audit logging (after successful commit)
      logAdminActionFeatures(nk, logger, adminInfo.adminId, adminInfo.telegramId,
        'confirm_donation', 'donation', request.donationId, null,
        { userId: userId, amountCents: amountCents, tierName: tierName, rewardsDisabled: true });

      logger.info('Donation confirmed: ' + request.donationId + ' for user ' + userId);
    } catch (txError) {
      // Rollback on any error
      try {
        nk.sqlExec(`ROLLBACK`, []);
      } catch (rollbackError) {
        logger.error('Rollback failed: ' + rollbackError);
      }
      throw txError;
    }

    return JSON.stringify({
      success: true,
      donationId: request.donationId,
      tierName: tierName,
      rewardsDisabled: true,
    });
  } catch (error) {
    logger.error('Error confirming donation: ' + error);
    throw error;
  }
}

export function rpcGetDonorLeaderboard(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var request = JSON.parse(payload || '{}');
    var limitValue = Number(request.limit);
    var limit = Number.isFinite(limitValue) ? Math.floor(limitValue) : 10;
    if (limit < 1) limit = 1;
    if (limit > 50) limit = 50;

    var result = nk.sqlQuery(
      `SELECT d.user_id, d.donor_name, d.is_anonymous,
              SUM(d.amount_cents) as total_donated,
              COUNT(*) as donation_count,
              s.value->>'firstName' as first_name
       FROM donations d
       LEFT JOIN storage s ON s.user_id = d.user_id AND s.collection = 'player_data' AND s.key = 'telegram'
       WHERE d.payment_status = 'completed'
       GROUP BY d.user_id, d.donor_name, d.is_anonymous, s.value->>'firstName'
       ORDER BY total_donated DESC
       LIMIT $1`,
      [limit]
    );
    var rows = Array.isArray(result) ? result : [];

    var donors = rows.map(function(row: any, index: number) {
      var displayName = 'Anonymous';
      if (!row.is_anonymous) {
        displayName = row.donor_name || row.first_name || 'Supporter';
      }

      return {
        rank: index + 1,
        displayName: displayName,
        totalDonatedCents: parseInt(row.total_donated) || 0,
        donationCount: parseInt(row.donation_count) || 0,
        isAnonymous: row.is_anonymous,
      };
    });

    return JSON.stringify({
      donors: donors,
    });
  } catch (error) {
    logger.error('Error getting donor leaderboard: ' + error);
    throw error;
  }
}

export function rpcAdminGetDonationStats(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminForFeatures(ctx, nk, logger);

    // Total donations
    var totalResult = nk.sqlQuery(
      `SELECT COALESCE(SUM(amount_cents), 0) as total, COUNT(*) as count
       FROM donations WHERE payment_status = 'completed'`
    );
    var totalRows = Array.isArray(totalResult) ? totalResult : [];
    var totalCents = totalRows.length > 0 ? parseInt(totalRows[0].total) || 0 : 0;
    var totalCount = totalRows.length > 0 ? parseInt(totalRows[0].count) || 0 : 0;

    // This month
    var monthResult = nk.sqlQuery(
      `SELECT COALESCE(SUM(amount_cents), 0) as total, COUNT(*) as count
       FROM donations
       WHERE payment_status = 'completed'
       AND completed_at >= DATE_TRUNC('month', CURRENT_DATE)`
    );
    var monthRows = Array.isArray(monthResult) ? monthResult : [];
    var monthCents = monthRows.length > 0 ? parseInt(monthRows[0].total) || 0 : 0;
    var monthCount = monthRows.length > 0 ? parseInt(monthRows[0].count) || 0 : 0;

    // Unique donors
    var uniqueResult = nk.sqlQuery(
      `SELECT COUNT(DISTINCT user_id) as count FROM donations WHERE payment_status = 'completed'`
    );
    var uniqueRows = Array.isArray(uniqueResult) ? uniqueResult : [];
    var uniqueDonors = uniqueRows.length > 0 ? parseInt(uniqueRows[0].count) || 0 : 0;

    // Average donation
    var avgDonation = totalCount > 0 ? Math.round(totalCents / totalCount) : 0;

    return JSON.stringify({
      totalCents: totalCents,
      totalCount: totalCount,
      monthCents: monthCents,
      monthCount: monthCount,
      uniqueDonors: uniqueDonors,
      avgDonationCents: avgDonation,
    });
  } catch (error) {
    logger.error('Error getting donation stats: ' + error);
    throw error;
  }
}

// ============================================================================
