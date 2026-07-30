// TELEGRAM STARS PAYMENT RPCs
// ============================================================================

function getTelegramBotTokenForStars(nk: nkruntime.Nakama, logger: nkruntime.Logger): string {
  var botToken = '';
  try {
    var configResult = nk.sqlQuery(
      `SELECT config_value FROM game_config WHERE config_key = 'telegram_bot_token'`
    );
    var configRows = Array.isArray(configResult) ? configResult : [];
    if (configRows.length > 0 && configRows[0].config_value) {
      botToken = String(configRows[0].config_value).replace(/"/g, '').trim();
    }
  } catch (e) {
    logger.warn('Could not read bot token from config: ' + e);
  }
  return botToken;
}

function getTelegramUserIdForUser(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string
): number | null {
  try {
    var read = nk.storageRead([
      { collection: 'player_data', key: 'telegram', userId: userId },
    ]);
    var value = read && read.length > 0 ? read[0].value : null;
    if (!value) return null;
    var raw = value.telegramId || value.telegram_id || null;
    var parsed = typeof raw === 'number' ? raw : parseInt(String(raw || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch (error) {
    logger.warn('Failed to read telegram user id from storage: ' + error);
    return null;
  }
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    var parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractTxId(tx: any): string {
  var candidates = [
    tx?.id,
    tx?.transaction_id,
    tx?.telegram_payment_charge_id,
    tx?.provider_payment_charge_id,
    tx?.source?.id,
    tx?.source?.transaction_id,
  ];
  for (var i = 0; i < candidates.length; i++) {
    var value = candidates[i];
    if (value !== undefined && value !== null) {
      var normalized = String(value).trim();
      if (normalized) return normalized;
    }
  }
  return '';
}

function extractTxAmount(tx: any): number | null {
  var amountCandidates = [
    tx?.amount,
    tx?.total_amount,
    tx?.star_amount,
    tx?.stars,
    tx?.source?.amount,
    tx?.source?.total_amount,
  ];
  for (var i = 0; i < amountCandidates.length; i++) {
    var parsed = parseNumber(amountCandidates[i]);
    if (parsed !== null) return Math.floor(parsed);
  }
  return null;
}

function extractTxUserId(tx: any): number | null {
  var userCandidates = [
    tx?.user?.id,
    tx?.source?.user?.id,
    tx?.source?.sender_user?.id,
    tx?.source?.from?.id,
    tx?.partner?.user?.id,
    tx?.from?.id,
    tx?.sender?.id,
  ];
  for (var i = 0; i < userCandidates.length; i++) {
    var parsed = parseNumber(userCandidates[i]);
    if (parsed !== null && parsed > 0) return Math.floor(parsed);
  }
  return null;
}

function extractTxPayload(tx: any): string {
  var candidates = [
    tx?.payload,
    tx?.invoice_payload,
    tx?.description,
    tx?.source?.payload,
    tx?.source?.invoice_payload,
    tx?.metadata?.payload,
  ];
  for (var i = 0; i < candidates.length; i++) {
    var value = candidates[i];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return '';
}

function extractTxDateMs(tx: any): number | null {
  var candidates = [
    tx?.date,
    tx?.created_at,
    tx?.create_date,
    tx?.source?.date,
  ];
  for (var i = 0; i < candidates.length; i++) {
    var value = candidates[i];
    if (typeof value === 'number' && Number.isFinite(value)) {
      // Telegram-style unix timestamps are typically seconds.
      return value > 1000000000000 ? value : value * 1000;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      var parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return parsed;
      var numeric = parseNumber(value);
      if (numeric !== null) return numeric > 1000000000000 ? numeric : numeric * 1000;
    }
  }
  return null;
}

function verifyStarsPaymentWithTelegram(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  botToken: string,
  expectedTelegramId: number,
  expectedStars: number,
  donationId: string,
  donationCreatedAt: string | null
): { verified: boolean; paymentId?: string; reason?: string } {
  if (!botToken) {
    return { verified: false, reason: 'Telegram bot token is not configured' };
  }
  if (!expectedTelegramId || expectedTelegramId <= 0) {
    return { verified: false, reason: 'Telegram identity is unavailable for this account' };
  }

  try {
    var apiUrl = 'https://api.telegram.org/bot' + botToken + '/getStarTransactions';
    var response = nk.httpRequest(
      apiUrl,
      'post',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ offset: 0, limit: 100 }),
      10000
    );

    if (response.code !== 200) {
      return { verified: false, reason: 'Telegram verification request failed: ' + response.code };
    }

    var parsed = JSON.parse(response.body || '{}');
    if (!parsed || parsed.ok !== true) {
      return { verified: false, reason: 'Telegram verification response not ok' };
    }

    var result = parsed.result;
    var transactions = Array.isArray(result)
      ? result
      : Array.isArray(result?.transactions)
        ? result.transactions
        : Array.isArray(result?.star_transactions)
          ? result.star_transactions
          : Array.isArray(result?.items)
            ? result.items
            : [];

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return { verified: false, reason: 'No star transactions found for verification' };
    }

    var createdAtMs = donationCreatedAt ? Date.parse(String(donationCreatedAt)) : Date.now();
    if (Number.isNaN(createdAtMs)) createdAtMs = Date.now();
    var minAllowedTime = createdAtMs - (5 * 60 * 1000);
    var nowMs = Date.now();

    for (var i = 0; i < transactions.length; i++) {
      var tx = transactions[i];
      var txId = extractTxId(tx);
      var txAmount = extractTxAmount(tx);
      var txUserId = extractTxUserId(tx);
      var txPayload = extractTxPayload(tx);
      var txDateMs = extractTxDateMs(tx);

      if (!txId) continue;
      if (txAmount === null || txAmount !== expectedStars) continue;
      if (txUserId !== null && txUserId !== expectedTelegramId) continue;
      if (txDateMs !== null && (txDateMs < minAllowedTime || txDateMs > nowMs + 60000)) continue;

      // Strong check: invoice payload should include donation id.
      if (txPayload && txPayload.indexOf(donationId) === -1) {
        continue;
      }

      return { verified: true, paymentId: txId };
    }

    return { verified: false, reason: 'No matching verified transaction found' };
  } catch (error) {
    return { verified: false, reason: 'Telegram verification error: ' + error };
  }
}

export function rpcCreateStarsInvoice(
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
    var stars = parseInt(request.stars) || 0;
    var tier = request.tier || 'custom';
    var title = request.title || 'Donation';
    var description = request.description || 'Support Islamic Quiz';

    if (stars < 50) {
      throw new Error('Minimum donation is 50 Stars');
    }

    // Get bot token from environment/config
    var botToken = getTelegramBotTokenForStars(nk, logger);

    // Create pending donation record
    var donationResult = nk.sqlQuery(
      `INSERT INTO donations (user_id, amount_cents, currency, payment_provider, payment_status, donor_message)
       VALUES ($1, $2, 'XTR', 'telegram_stars', 'pending', $3)
       RETURNING id`,
      [ctx.userId, stars, 'tier:' + tier]
    );
    var donationRows = Array.isArray(donationResult) ? donationResult : [];
    var donationId = donationRows.length > 0 ? donationRows[0].id : null;

    if (!donationId) {
      throw new Error('Failed to create donation record');
    }

    // If bot token is available, create invoice via Telegram Bot API
    if (botToken) {
      try {
        var invoicePayload = JSON.stringify({
          user_id: ctx.userId,
          donation_id: donationId,
          tier: tier,
        });

        var apiUrl = 'https://api.telegram.org/bot' + botToken + '/createInvoiceLink';
        var response = nk.httpRequest(apiUrl, 'post', {
          'Content-Type': 'application/json',
        }, JSON.stringify({
          title: title,
          description: description,
          payload: invoicePayload,
          currency: 'XTR', // Telegram Stars currency code
          prices: [{ label: 'Donation', amount: stars }],
        }), 10000);

        if (response.code === 200) {
          var responseBody = JSON.parse(response.body);
          if (responseBody.ok && responseBody.result) {
            return JSON.stringify({
              invoiceUrl: responseBody.result,
              donationId: donationId,
              stars: stars,
              tier: tier,
            });
          }
        }

        logger.warn('Telegram API response: ' + response.code + ' - ' + response.body);
      } catch (apiError) {
        logger.error('Telegram API error: ' + apiError);
      }
    }

    // In production, fail if Telegram API is not working
    throw new Error('Failed to create invoice: Telegram API not configured or unavailable');
  } catch (error) {
    logger.error('Error creating stars invoice: ' + error);
    throw error;
  }
}

export function rpcConfirmStarsPayment(
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
    var donationId = request.donationId;

    if (!donationId) {
      throw new Error('donationId is required');
    }

    // Get donation record and check authorization
    var donCheckResult = nk.sqlQuery(
      `SELECT user_id, amount_cents, currency, payment_status, donor_message, created_at, payment_id
       FROM donations WHERE id = $1`,
      [donationId]
    );
    var donCheckRows = Array.isArray(donCheckResult) ? donCheckResult : [];

    if (donCheckRows.length === 0) {
      throw new Error('Donation not found');
    }

    // Verify ownership first (separate from the atomic claim)
    if (donCheckRows[0].user_id !== ctx.userId) {
      throw new Error('Unauthorized');
    }

    // Atomically claim the donation - prevents race conditions
    // This UPDATE only succeeds if payment_status is not already 'completed'
    var donResult = nk.sqlQuery(
      `UPDATE donations SET payment_status = 'processing'
       WHERE id = $1 AND payment_status = 'pending'
       RETURNING user_id, amount_cents, currency, donor_message, created_at`,
      [donationId]
    );
    var donRows = Array.isArray(donResult) ? donResult : [];

    if (donRows.length === 0) {
      // Either already processing or completed
      return JSON.stringify({
        success: true,
        message: 'Payment already processed',
        donationId: donationId,
      });
    }

    var donation = donRows[0];
    var stars = parseInt(donation.amount_cents) || 0;

    // Verify payment server-side with Telegram transactions.
    var botToken = getTelegramBotTokenForStars(nk, logger);
    var telegramUserId = getTelegramUserIdForUser(nk, logger, ctx.userId);
    var verification = verifyStarsPaymentWithTelegram(
      nk,
      logger,
      botToken,
      telegramUserId || 0,
      stars,
      donationId,
      donation.created_at || null
    );
    if (!verification.verified || !verification.paymentId) {
      // Move back to pending to allow a retry after eventual consistency delay.
      try {
        nk.sqlExec(
          `UPDATE donations
           SET payment_status = 'pending'
           WHERE id = $1 AND payment_status = 'processing'`,
          [donationId]
        );
      } catch (resetError) {
        logger.warn('Failed to reset unverified stars payment to pending: ' + resetError);
      }
      throw new Error(verification.reason || 'Telegram payment could not be verified');
    }

    // Prevent replay across donations.
    var replayResult = nk.sqlQuery(
      `SELECT id FROM donations
       WHERE payment_provider = 'telegram_stars'
         AND payment_id = $1
         AND id <> $2
         AND payment_status = 'completed'
       LIMIT 1`,
      [verification.paymentId, donationId]
    );
    var replayRows = Array.isArray(replayResult) ? replayResult : [];
    if (replayRows.length > 0) {
      try {
        nk.sqlExec(
          `UPDATE donations
           SET payment_status = 'failed'
           WHERE id = $1 AND payment_status = 'processing'`,
          [donationId]
        );
      } catch (markFailedError) {
        logger.warn('Failed to mark replayed stars payment as failed: ' + markFailedError);
      }
      throw new Error('Payment transaction has already been used');
    }

    // Extract tier from donor_message (stored as 'tier:xxx')
    var tier = 'custom';
    if (donation.donor_message && donation.donor_message.startsWith('tier:')) {
      tier = donation.donor_message.replace('tier:', '');
    }

    nk.sqlExec(`BEGIN`, []);
    try {
      // Update donation status
      nk.sqlExec(
        `UPDATE donations SET payment_status = 'completed', completed_at = NOW(),
         payment_provider = 'telegram_stars', payment_id = $1, badge_awarded_id = $2, coins_bonus = $3
         WHERE id = $4`,
        [verification.paymentId, null, 0, donationId]
      );

      // Create notification
      nk.sqlExec(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'system', 'Thank you for your donation!', $2)`,
        [ctx.userId, 'Your donation of ' + stars + ' Stars has been received. Thank you for supporting us!']
      );

      nk.sqlExec(`COMMIT`, []);
    } catch (txError) {
      try {
        nk.sqlExec(`ROLLBACK`, []);
      } catch (rollbackError) {
        logger.error('Telegram Stars rollback failed: ' + rollbackError);
      }
      try {
        nk.sqlExec(
          `UPDATE donations
           SET payment_status = 'pending'
           WHERE id = $1 AND payment_status = 'processing'`,
          [donationId]
        );
      } catch (resetAfterTxError) {
        logger.warn('Failed to reset stars payment after transaction failure: ' + resetAfterTxError);
      }
      throw txError;
    }

    logger.info('Telegram Stars payment confirmed: ' + donationId + ' for user ' + ctx.userId + ' - ' + stars + ' stars');

    return JSON.stringify({
      success: true,
      donationId: donationId,
      stars: stars,
      tier: tier,
      rewardsDisabled: true,
    });
  } catch (error) {
    logger.error('Error confirming stars payment: ' + error);
    throw error;
  }
}

// ============================================================================
