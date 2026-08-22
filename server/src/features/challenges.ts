import { getPlayerGameStateFeatures } from './helpers';
import { shouldSendRealtimeNotification } from './notifications';

// CHALLENGE SYSTEM RPCs
// ============================================================================

export function rpcAcceptChallenge(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx.userId) {
    throw new Error('Authentication required');
  }

  var transactionStarted = false;
  var rollbackIfStarted = function() {
    if (!transactionStarted) return;
    try {
      nk.sqlExec(`ROLLBACK`, []);
    } catch (_rollbackError) {
      // Best-effort rollback.
    }
    transactionStarted = false;
  };

  try {
    var request = JSON.parse(payload || '{}');
    var challengeId = request.challengeId;

    if (!challengeId) {
      throw new Error('challengeId is required');
    }

    nk.sqlExec(`BEGIN`, []);
    transactionStarted = true;

    // Lock challenge row to prevent concurrent accepts creating duplicate matches.
    var result = nk.sqlQuery(
      `SELECT id, challenger_id, challenged_id, category, expires_at, status, match_id
       FROM pending_challenges
       WHERE id = $1
       FOR UPDATE`,
      [challengeId]
    );
    var rows = Array.isArray(result) ? result : [];

    if (rows.length === 0) {
      throw new Error('Challenge not found');
    }

    var challenge = rows[0];

    if (challenge.challenged_id !== ctx.userId) {
      throw new Error('This challenge is not for you');
    }

    if (challenge.status !== 'pending') {
      if (challenge.status === 'accepted' && challenge.match_id) {
        var existingMatchId = String(challenge.match_id);
        if (existingMatchId.indexOf('.') === -1) {
          existingMatchId = existingMatchId + '.nakama';
        }
        rollbackIfStarted();
        return JSON.stringify({
          success: true,
          matchId: existingMatchId,
          challengeId: challengeId,
          alreadyAccepted: true,
        });
      }
      if (challenge.status === 'expired') {
        throw new Error('Challenge has expired');
      }
      if (challenge.status === 'declined') {
        throw new Error('Challenge was declined');
      }
      if (challenge.status === 'auto_declined') {
        throw new Error('Challenge was auto-declined');
      }
      if (challenge.status === 'expired_challenger_busy') {
        throw new Error('Challenger is currently in another match');
      }
      throw new Error('Challenge is no longer pending');
    }

    if (new Date(challenge.expires_at) < new Date()) {
      nk.sqlExec(
        `UPDATE pending_challenges
         SET status = 'expired'
         WHERE id = $1 AND status = 'pending'`,
        [challengeId]
      );
      throw new Error('Challenge has expired');
    }

    // Safety Check: Check if acceptor is busy (in a game)
    var acceptorState = getPlayerGameStateFeatures(nk, ctx.userId);
    if (acceptorState && !['idle', 'selecting', 'ended'].includes(acceptorState)) {
      // Keep the challenge pending so the user can retry after they finish the match.
      logger.info('Challenge ' + challengeId + ' not accepted - acceptor busy (state: ' + acceptorState + ')');
      return JSON.stringify({ success: false, reason: 'auto_declined_busy' });
    }

    // Safety Check: Check if challenger is still online (check their session or recent activity)
    // Note: We check if challenger has an active game state which indicates they're online
    var challengerState = getPlayerGameStateFeatures(nk, challenge.challenger_id);
    // If challenger is in a game already, they can't join this challenge match
    if (challengerState && !['idle', 'selecting'].includes(challengerState)) {
      nk.sqlExec(
        `UPDATE pending_challenges SET status = 'expired_challenger_busy' WHERE id = $1`,
        [challengeId]
      );
      throw new Error('Challenger is currently in another match');
    }

    // Create a match for the two players
    var matchId = nk.matchCreate('quiz_match', {
      category: challenge.category || 'general',
      isChallenge: 'true',
      player1: challenge.challenger_id,
      player2: challenge.challenged_id,
    });

    // Extract UUID from matchId (format is "uuid.nakama")
    // Database column is UUID type, so we need just the UUID part
    var matchIdUuid = matchId.split('.')[0];

    // Update challenge status only if still pending (guards against race conditions).
    var updateResult = nk.sqlQuery(
      `UPDATE pending_challenges
       SET status = 'accepted', match_id = $1
       WHERE id = $2 AND status = 'pending'
       RETURNING id`,
      [matchIdUuid, challengeId]
    );
    var updateRows = Array.isArray(updateResult) ? updateResult : [];
    if (updateRows.length === 0) {
      var latestResult = nk.sqlQuery(
        `SELECT status, match_id
         FROM pending_challenges
         WHERE id = $1`,
        [challengeId]
      );
      var latestRows = Array.isArray(latestResult) ? latestResult : [];
      if (latestRows.length > 0 && latestRows[0].status === 'accepted' && latestRows[0].match_id) {
        var concurrentMatchId = String(latestRows[0].match_id);
        if (concurrentMatchId.indexOf('.') === -1) {
          concurrentMatchId = concurrentMatchId + '.nakama';
        }
        rollbackIfStarted();
        return JSON.stringify({
          success: true,
          matchId: concurrentMatchId,
          challengeId: challengeId,
          alreadyAccepted: true,
        });
      }
      throw new Error('Challenge is no longer pending');
    }

    // Mark related inbox notification as read for the acceptor
    nk.sqlExec(
      `UPDATE notifications SET is_read = true, read_at = NOW()
       WHERE user_id = $1 AND type = 'friend_challenge'
         AND data::jsonb->>'challengeId' = $2`,
      [ctx.userId, challengeId]
    );

    nk.sqlExec(`COMMIT`, []);
    transactionStarted = false;

    // Send notification to challenger
    if (shouldSendRealtimeNotification(nk, challenge.challenger_id, 'challenge_accepted')) {
      nk.notificationSend(
        challenge.challenger_id,
        'Challenge Accepted!',
        {
          type: 'challenge_accepted',
          title: 'Challenge Accepted!',
          body: 'Your challenge was accepted. Get ready to play.',
          challengeId: challengeId,
          matchId: matchId,
          acceptedBy: ctx.userId,
          inbox: false,
        },
        101, // Code for challenge accepted
        ctx.userId,
        true
      );
    }

    logger.info('Challenge ' + challengeId + ' accepted, match created: ' + matchId);

    return JSON.stringify({
      success: true,
      matchId: matchId,
      challengeId: challengeId,
    });
  } catch (error) {
    rollbackIfStarted();
    logger.error('Error accepting challenge: ' + error);
    throw error;
  }
}

export function rpcDeclineChallenge(
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
    var challengeId = request.challengeId;

    if (!challengeId) {
      throw new Error('challengeId is required');
    }

    // Get the challenge
    var result = nk.sqlQuery(
      `SELECT id, challenger_id, challenged_id, status
       FROM pending_challenges WHERE id = $1`,
      [challengeId]
    );
    var rows = Array.isArray(result) ? result : [];

    if (rows.length === 0) {
      throw new Error('Challenge not found');
    }

    var challenge = rows[0];

    if (challenge.challenged_id !== ctx.userId) {
      throw new Error('This challenge is not for you');
    }

    if (challenge.status !== 'pending') {
      if (challenge.status === 'accepted') {
        throw new Error('Challenge was already accepted');
      }
      if (challenge.status === 'expired') {
        throw new Error('Challenge has expired');
      }
      if (challenge.status === 'declined') {
        throw new Error('Challenge was already declined');
      }
      if (challenge.status === 'auto_declined') {
        throw new Error('Challenge was already auto-declined');
      }
      if (challenge.status === 'expired_challenger_busy') {
        throw new Error('Challenger is currently in another match');
      }
      throw new Error('Challenge is no longer pending');
    }

    var declineResult = nk.sqlQuery(
      `UPDATE pending_challenges
       SET status = 'declined'
       WHERE id = $1 AND challenged_id = $2 AND status = 'pending'
       RETURNING challenger_id`,
      [challengeId, ctx.userId]
    );
    var declineRows = Array.isArray(declineResult) ? declineResult : [];
    if (declineRows.length === 0) {
      throw new Error('Challenge is no longer pending');
    }
    var challengerId = declineRows[0].challenger_id || challenge.challenger_id;

    // Mark related inbox notification as read for the decliner
    nk.sqlExec(
      `UPDATE notifications SET is_read = true, read_at = NOW()
       WHERE user_id = $1 AND type = 'friend_challenge'
         AND data::jsonb->>'challengeId' = $2`,
      [ctx.userId, challengeId]
    );

    // Send notification to challenger
    if (challengerId && shouldSendRealtimeNotification(nk, challengerId, 'challenge_declined')) {
      nk.notificationSend(
        challengerId,
        'Challenge Declined',
        {
          type: 'challenge_declined',
          title: 'Challenge Declined',
          body: 'Your challenge was declined.',
          challengeId: challengeId,
          declinedBy: ctx.userId,
          inbox: false,
        },
        102, // Code for challenge declined
        ctx.userId,
        true
      );
    }

    logger.info('Challenge ' + challengeId + ' declined by ' + ctx.userId);

    return JSON.stringify({
      success: true,
      challengeId: challengeId,
    });
  } catch (error) {
    logger.error('Error declining challenge: ' + error);
    throw error;
  }
}

// ============================================================================
