import {
  getCategoryTypeByKey,
  getDefaultCategoryKey,
  getQuestionCountCaps,
  getQuestionsPerMatchForCategory,
  getResolvedMatchPacingForMode,
  getTimePerQuestionMs,
  isValidCategoryFromDb,
} from './config';
import { GAME_CONFIG, QUESTION_HISTORY_MAX, normalizeCategory } from './constants';
import { clearPlayerGameState, setPlayerGameState } from './friends';
import {
  endMatch,
  handleAnswer,
  maybeAnswerAsBot,
  randomizeOptionsForQuestions,
  revealAnswer,
  selectQuestions,
  selectQuestionsFromList,
  sendMatchStateSnapshot,
  startQuestion,
} from './match-helpers';
import { getRankTierKeyForMmr } from './mmr';
import { decodeData, getStorageValueByKey } from './utils';

var MIN_MATCH_QUESTIONS = 3;
var SYSTEM_HARD_MATCH_QUESTIONS = 1000;
var MIN_MATCH_TIME_PER_QUESTION_MS = 5000;
var MAX_MATCH_TIME_PER_QUESTION_MS = 60000;
var WAITING_TIMEOUT_MS_DEFAULT = 60000;
var WAITING_TIMEOUT_MS_CHALLENGE_OR_TOURNAMENT = 120000;
var MAX_SPECTATORS_PER_MATCH = 200;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return Math.floor(value);
}

function getPresenceSessionId(presence: nkruntime.Presence): string {
  var withSessionId = presence as nkruntime.Presence & { sessionId?: string; session_id?: string };
  var sessionId = withSessionId.sessionId || withSessionId.session_id || '';
  return typeof sessionId === 'string' ? sessionId : '';
}

function hasActiveSessions(sessionMap: {[key: string]: boolean} | null | undefined): boolean {
  if (!sessionMap) return false;
  for (var sessionId in sessionMap) {
    if (sessionMap[sessionId]) {
      return true;
    }
  }
  return false;
}

function isExpectedMatchPlayer(state: any, userId: string): boolean {
  var expectedPlayers = Array.isArray(state?.expectedPlayers) ? state.expectedPlayers : [];
  return expectedPlayers.indexOf(userId) !== -1;
}

function clearSpectatorStateForUser(state: any, userId: string): boolean {
  var changed = false;
  if (state?.spectators && state.spectators[userId]) {
    delete state.spectators[userId];
    changed = true;
  }
  if (state?.spectatorSessions && state.spectatorSessions[userId]) {
    delete state.spectatorSessions[userId];
    changed = true;
  }
  if (state?.pendingSpectators && state.pendingSpectators[userId]) {
    delete state.pendingSpectators[userId];
    changed = true;
  }
  if (changed) {
    state.spectatorCountDirty = true;
  }
  return changed;
}

// MATCH HANDLER FUNCTIONS - Using named function declarations
// ============================================================================

export function matchInit(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  params: {[key: string]: string}
): {state: nkruntime.MatchState, tickRate: number, label: string} {
  var category = normalizeCategory(params.category || '');
  var parentCategory = normalizeCategory(params.parentCategory || '');
  if (!category || !isValidCategoryFromDb(nk, logger, category)) {
    var defaultCategory = getDefaultCategoryKey(nk, logger);
    category = defaultCategory || '';
  }
  if (parentCategory && !isValidCategoryFromDb(nk, logger, parentCategory)) {
    parentCategory = '';
  }
  var botMatch = params.bot === 'true';
  var practiceMode = params.practice === 'true';
  var isChallenge = params.isChallenge === 'true';
  var isTournament = params.isTournament === 'true';
  var tournamentId = params.tournamentId || null;
  var tournamentMatchId = params.tournamentMatchId || null;
  var tournamentRoundNumber = parseInt(params.tournamentRound || '1', 10);
  if (!Number.isFinite(tournamentRoundNumber) || tournamentRoundNumber < 1) {
    tournamentRoundNumber = 1;
  }
  var tournamentPlayer1UserId = params.tournamentPlayer1UserId || null;
  var tournamentPlayer2UserId = params.tournamentPlayer2UserId || null;
  var tournamentPlayer1IsBot = params.tournamentPlayer1IsBot === 'true';
  var tournamentPlayer2IsBot = params.tournamentPlayer2IsBot === 'true';
  var botDisplayName = params.botDisplayName || 'Quiz Bot';
  var botDifficultyProfile: any = null;
  if (params.botDifficultyProfile) {
    try {
      botDifficultyProfile = JSON.parse(params.botDifficultyProfile);
    } catch (_e) {
      botDifficultyProfile = null;
    }
  }
  var allowSpectators = params.allowSpectators === 'true';
  var expectedPlayers: string[] = [];

  // Track expected players whenever they are provided.
  var seenExpectedPlayers: {[key: string]: boolean} = {};
  if (params.player1 && !seenExpectedPlayers[params.player1]) {
    expectedPlayers.push(params.player1);
    seenExpectedPlayers[params.player1] = true;
  }
  if (params.player2 && !seenExpectedPlayers[params.player2]) {
    expectedPlayers.push(params.player2);
    seenExpectedPlayers[params.player2] = true;
  }

  logger.info('Initializing match for category: ' + category + (isChallenge ? ' (challenge match)' : ''));

  // Load game settings from database at match creation time
  var categoryType = getCategoryTypeByKey(nk, logger, category);
  var questionCountCaps = getQuestionCountCaps(nk, logger);
  var categoryQuestionCap = categoryType === 'vocabulary'
    ? questionCountCaps.vocabularyMax
    : questionCountCaps.normalMax;
  categoryQuestionCap = clampInt(categoryQuestionCap, MIN_MATCH_QUESTIONS, questionCountCaps.systemHardMax);
  var runtimeQuestionCap = clampInt(categoryQuestionCap, MIN_MATCH_QUESTIONS, SYSTEM_HARD_MATCH_QUESTIONS);
  var questionsPerMatch = getQuestionsPerMatchForCategory(nk, logger, category);
  var timePerQuestionMs = getTimePerQuestionMs(nk, logger);
  questionsPerMatch = clampInt(questionsPerMatch, MIN_MATCH_QUESTIONS, runtimeQuestionCap);
  timePerQuestionMs = clampInt(timePerQuestionMs, MIN_MATCH_TIME_PER_QUESTION_MS, MAX_MATCH_TIME_PER_QUESTION_MS);
  var pacingMode: 'ranked' | 'practice' | 'tournament' = isTournament
    ? 'tournament'
    : (practiceMode ? 'practice' : 'ranked');
  var matchPacing = getResolvedMatchPacingForMode(nk, logger, pacingMode);
  var countdownSeconds = clampInt(matchPacing.countdownSeconds, 0, 15);
  var revealDelayMs = clampInt(matchPacing.revealDelayMs, 0, 60000);
  var questionPoolQuestions: any[] | null = null;

  // If tournament match, prefer tournament-specific settings
  if (isTournament && tournamentId) {
    try {
      var tournamentSettings = nk.sqlQuery(
        `SELECT question_count, time_per_question_ms, question_pool_ids FROM tournaments WHERE id = $1`,
        [tournamentId]
      );
      var settingRows = Array.isArray(tournamentSettings) ? tournamentSettings : [];
      if (settingRows.length > 0) {
        var row = settingRows[0];
        var qc = row.question_count ? parseInt(row.question_count) : 0;
        if (Number.isFinite(qc) && qc > 0) {
          var clampedQc = clampInt(qc, MIN_MATCH_QUESTIONS, runtimeQuestionCap);
          if (clampedQc !== qc) {
            logger.warn(
              'Clamped tournament question_count from '
              + qc
              + ' to '
              + clampedQc
              + ' for match '
              + tournamentMatchId
              + ' (category='
              + category
              + ', categoryType='
              + categoryType
              + ', cap='
              + runtimeQuestionCap
              + ')'
            );
          }
          questionsPerMatch = clampedQc;
        }
        var tpp = row.time_per_question_ms ? parseInt(row.time_per_question_ms) : 0;
        if (Number.isFinite(tpp) && tpp > 0) {
          var clampedTpp = clampInt(tpp, MIN_MATCH_TIME_PER_QUESTION_MS, MAX_MATCH_TIME_PER_QUESTION_MS);
          if (clampedTpp !== tpp) {
            logger.warn('Clamped tournament time_per_question_ms from ' + tpp + ' to ' + clampedTpp + ' for match ' + tournamentMatchId);
          }
          timePerQuestionMs = clampedTpp;
        }

        // Optional: Load question pool (by IDs) if provided, restricted to the match category.
        var poolRaw = row.question_pool_ids;
        var poolIds: string[] = [];
        if (Array.isArray(poolRaw)) {
          for (var pi = 0; pi < poolRaw.length; pi++) {
            if (typeof poolRaw[pi] === 'string' && poolRaw[pi].length > 0) {
              poolIds.push(poolRaw[pi]);
            }
          }
        } else if (typeof poolRaw === 'string') {
          // PostgreSQL may return uuid[] as "{uuid,uuid}"
          var trimmed = poolRaw.trim();
          if (trimmed.length > 2 && trimmed[0] === '{' && trimmed[trimmed.length - 1] === '}') {
            var inner = trimmed.slice(1, -1);
            if (inner.trim().length > 0) {
              var parts = inner.split(',');
              for (var ps = 0; ps < parts.length; ps++) {
                var v = parts[ps].replace(/"/g, '').trim();
                if (v) poolIds.push(v);
              }
            }
          }
        }

        // Hard cap to avoid overly large SQL IN clauses in runtime.
        var MAX_POOL_IDS = 500;
        if (poolIds.length > MAX_POOL_IDS) {
          poolIds = poolIds.slice(0, MAX_POOL_IDS);
        }

        if (poolIds.length > 0) {
          try {
            var paramsList: any[] = [category];
            var placeholders: string[] = [];
            for (var p = 0; p < poolIds.length; p++) {
              placeholders.push('$' + (paramsList.length + 1));
              paramsList.push(poolIds[p]);
            }

            var qRowsResult = nk.sqlQuery(
              `SELECT id, category, difficulty, question_text, options, correct_index, explanation, source_reference, question_type, passage_text
               FROM questions
               WHERE is_active = true
                 AND category = $1
                 AND id IN (${placeholders.join(',')})`,
              paramsList
            );
            var qRows = Array.isArray(qRowsResult) ? qRowsResult : [];

            function parseOptions(optionsValue: any): any[] | null {
              var options = optionsValue;
              try {
                if (Array.isArray(options) && options.length > 0 && typeof options[0] === 'number') {
                  var byteString = '';
                  for (var j = 0; j < options.length; j++) {
                    byteString += String.fromCharCode(options[j]);
                  }
                  options = JSON.parse(byteString);
                } else if (typeof options === 'string') {
                  options = JSON.parse(options);
                }
              } catch {
                return null;
              }
              return Array.isArray(options) ? options : null;
            }

            var loaded: any[] = [];
            for (var qi = 0; qi < qRows.length; qi++) {
              var qRow = qRows[qi];
              var opts = parseOptions(qRow.options);
              if (!opts || opts.length < 2 || opts.length > 6) continue;
              var correctIndex = typeof qRow.correct_index === 'number'
                ? qRow.correct_index
                : parseInt(qRow.correct_index, 10);
              if (!Number.isFinite(correctIndex) || correctIndex < 0 || correctIndex >= opts.length) continue;

              loaded.push({
                id: qRow.id,
                category: qRow.category,
                difficulty: qRow.difficulty,
                questionText: qRow.question_text,
                options: opts,
                correctIndex: correctIndex,
                explanation: qRow.explanation || '',
                sourceReference: qRow.source_reference || '',
                questionType: qRow.question_type || 'mcq',
                passageText: qRow.passage_text || '',
              });
            }

            if (loaded.length > 0) {
              questionPoolQuestions = loaded;
              logger.info('Loaded tournament question pool: ' + loaded.length + ' questions for category ' + category);
            } else {
              logger.warn('Tournament question pool configured but no valid questions were loaded for category ' + category);
            }
          } catch (poolError) {
            logger.warn('Failed to load tournament question pool: ' + poolError);
          }
        }
      }
    } catch (settingsError) {
      logger.warn('Failed to load tournament settings for match: ' + settingsError);
    }
  }

  var matchId = (ctx as any).matchId || '';
  var state = {
    phase: 'waiting',
    players: {} as {[key: string]: any},
    category: category,
    parentCategory: parentCategory || null,
    matchId: matchId,
    questions: [] as unknown as any[],
    currentQuestionIndex: 0,
    questionsAsked: 0,
    questionStartTick: 0,
    phaseStartTick: 0,
    lastQuestion: null,
    lastReveal: null,
    lastMatchEnd: null,
    botMatch: botMatch,
    practiceMode: practiceMode,
    botId: botMatch ? 'bot_' + matchId : null,
    tickRate: 10,
    isChallenge: isChallenge,
    expectedPlayers: expectedPlayers,
    // Tournament tracking
    isTournament: isTournament,
    tournamentId: tournamentId,
    tournamentMatchId: tournamentMatchId,
    tournamentRound: tournamentRoundNumber,
    tournamentPlayer1UserId: tournamentPlayer1UserId,
    tournamentPlayer2UserId: tournamentPlayer2UserId,
    tournamentPlayer1IsBot: tournamentPlayer1IsBot,
    tournamentPlayer2IsBot: tournamentPlayer2IsBot,
    botDisplayName: botDisplayName,
    botDifficultyProfile: botDifficultyProfile,
    allowSpectators: allowSpectators,
    spectators: {} as {[key: string]: any},
    playerSessions: {} as {[key: string]: {[key: string]: boolean}},
    spectatorSessions: {} as {[key: string]: {[key: string]: boolean}},
    pendingSpectators: {} as {[key: string]: boolean},
    rematchCreated: false,
    rematchId: null as string | null,
    // Game settings loaded from DB
    questionsPerMatch: questionsPerMatch,
    timePerQuestionMs: timePerQuestionMs,
    countdownSeconds: countdownSeconds,
    revealDelayMs: revealDelayMs,
    matchPacing: matchPacing,
    // Optional tournament question pool (preloaded at match init)
    questionPoolQuestions: questionPoolQuestions,
  };

  return {
    state: state,
    tickRate: 10,
    label: JSON.stringify({
      category: category,
      parentCategory: parentCategory || null,
      status: 'waiting',
      isChallenge: isChallenge,
      isTournament: isTournament,
      isPractice: practiceMode,
    }),
  };
}

export function matchJoinAttempt(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  presence: nkruntime.Presence,
  metadata: {[key: string]: string}
): {state: nkruntime.MatchState, accept: boolean, rejectMessage?: string} | null {
  logger.info('matchJoinAttempt: userId=' + presence.userId + ', phase=' + state.phase +
    ', isChallenge=' + state.isChallenge + ', isTournament=' + state.isTournament);

  var expectedPlayers = Array.isArray(state.expectedPlayers) ? state.expectedPlayers : [];
  var isExpectedPlayer = expectedPlayers.indexOf(presence.userId) !== -1;

  // Allow rejoin if player already in match
  if (state.players && state.players[presence.userId]) {
    // For tournament matches verify the participant hasn't been
    // forfeited / eliminated / disqualified since the match started.
    // The normal forfeit flow (replaceParticipantInPendingOrReadyMatchWithBot
    // + autoReportTournamentResult) should have already cleaned up, but
    // if it failed silently a stale in_progress match could otherwise
    // let the player back in.
    if (state.isTournament && state.tournamentMatchId) {
      var participantCheck = nk.sqlQuery(
        `SELECT tp.status FROM tournament_participants tp
         JOIN tournament_matches tm ON (tm.player1_participant_id = tp.id OR tm.player2_participant_id = tp.id)
         WHERE tm.id = $1 AND tp.user_id = $2`,
        [state.tournamentMatchId, presence.userId]
      );
      var checkRows = Array.isArray(participantCheck) ? participantCheck : [];
      if (checkRows.length > 0) {
        var pStatus = String(checkRows[0].status || '');
        if (pStatus === 'forfeited' || pStatus === 'eliminated' || pStatus === 'disqualified') {
          logger.info('Rejecting rejoin for ' + presence.userId + ' — participant status: ' + pStatus);
          return { state: state, accept: false, rejectMessage: 'You have been ' + pStatus + ' from this tournament' };
        }
      }
    }
    logger.info('Player ' + presence.userId + ' rejoining match');
    return { state: state, accept: true };
  }

  if (isExpectedPlayer && clearSpectatorStateForUser(state, presence.userId)) {
    logger.info('Converted expected tournament player from spectator state to player join: ' + presence.userId);
  }

  // Allow rejoin if spectator already in match
  if (state.spectators && state.spectators[presence.userId]) {
    logger.info('Spectator ' + presence.userId + ' rejoining match');
    return { state: state, accept: true };
  }

  var wantsSpectator = metadata &&
    (metadata.role === 'spectator' || metadata.spectator === 'true' || metadata.spectator === '1');
  if (wantsSpectator && isExpectedPlayer) {
    logger.info('Ignoring spectator metadata for expected tournament player: ' + presence.userId);
  } else if (wantsSpectator) {
    if (!state.allowSpectators) {
      logger.warn('Spectator join not allowed, rejecting ' + presence.userId);
      return { state: state, accept: false, rejectMessage: 'Spectators not allowed' };
    }
    if (state.phase === 'ended') {
      logger.warn('Match ended, rejecting spectator ' + presence.userId);
      return { state: state, accept: false, rejectMessage: 'Match already ended' };
    }
    var connectedSpectators = getConnectedSpectatorCount(state);
    var pendingSpectatorsCount = 0;
    if (state.pendingSpectators) {
      for (var pendingSpectatorId in state.pendingSpectators) {
        if (state.pendingSpectators[pendingSpectatorId]) {
          pendingSpectatorsCount++;
        }
      }
    }
    if ((connectedSpectators + pendingSpectatorsCount) >= MAX_SPECTATORS_PER_MATCH) {
      logger.warn('Spectator limit reached, rejecting ' + presence.userId);
      return { state: state, accept: false, rejectMessage: 'Spectator limit reached' };
    }
    if (!state.pendingSpectators) {
      state.pendingSpectators = {};
    }
    state.pendingSpectators[presence.userId] = true;
    return { state: state, accept: true };
  }

  var playerCount = Object.keys(state.players || {}).length;
  var maxPlayers = (state.botMatch || state.practiceMode) ? 1 : 2;

  if (playerCount >= maxPlayers) {
    logger.warn('Match is full, rejecting ' + presence.userId);
    return { state: state, accept: false, rejectMessage: 'Match is full' };
  }

  // Restrict join to expected players when provided
  if (expectedPlayers.length > 0 && !isExpectedPlayer) {
    logger.warn('Match restricted to expected players, rejecting ' + presence.userId);
    return { state: state, accept: false, rejectMessage: 'Not authorized for this match' };
  }

  // For matches in progress, allow expected players to join even during countdown
  if (state.phase !== 'waiting') {
    if (isExpectedPlayer) {
      logger.info('Allowing expected player to join: ' + presence.userId);
      return { state: state, accept: true };
    }
    logger.warn('Match already started, rejecting ' + presence.userId);
    return { state: state, accept: false, rejectMessage: 'Match already started' };
  }

  return { state: state, accept: true };
}

export function matchJoin(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  presences: nkruntime.Presence[]
): {state: nkruntime.MatchState} | null {
  if (!state.players) {
    state.players = {};
  }
  if (!state.spectators) {
    state.spectators = {};
  }
  if (!state.playerSessions) {
    state.playerSessions = {};
  }
  if (!state.spectatorSessions) {
    state.spectatorSessions = {};
  }
  if (!state.pendingSpectators) {
    state.pendingSpectators = {};
  }

  var categoryId = state.category || 'prophets';
  var rejoinPresences: nkruntime.Presence[] = [];
  var spectatorPresences: nkruntime.Presence[] = [];
  var newPlayerPresences: nkruntime.Presence[] = [];
  var spectatorChanged = state.spectatorCountDirty === true;
  state.spectatorCountDirty = false;

  for (var i = 0; i < presences.length; i++) {
    var presence = presences[i];
    var sessionId = getPresenceSessionId(presence);
    logger.info('Player joined: ' + presence.userId);

    if (isExpectedMatchPlayer(state, presence.userId) && clearSpectatorStateForUser(state, presence.userId)) {
      spectatorChanged = true;
      logger.info('Cleared spectator state for expected tournament player during join: ' + presence.userId);
    }

    var existingSpectator = state.spectators[presence.userId];
    if (existingSpectator) {
      if (!state.spectatorSessions[presence.userId]) {
        state.spectatorSessions[presence.userId] = {};
      }
      if (sessionId) {
        state.spectatorSessions[presence.userId][sessionId] = true;
      }
      var wasSpectatorConnected = !!existingSpectator.connected;
      existingSpectator.connected = true;
      existingSpectator.lastDisconnectTick = null;
      if (presence.username) {
        existingSpectator.username = presence.username;
      }
      spectatorPresences.push(presence);
      if (!wasSpectatorConnected) {
        spectatorChanged = true;
      }
      continue;
    }

    if (state.pendingSpectators[presence.userId]) {
      delete state.pendingSpectators[presence.userId];
      if (!state.spectatorSessions[presence.userId]) {
        state.spectatorSessions[presence.userId] = {};
      }
      if (sessionId) {
        state.spectatorSessions[presence.userId][sessionId] = true;
      }
      state.spectators[presence.userId] = {
        userId: presence.userId,
        username: presence.username,
        connected: true,
        lastDisconnectTick: null,
      };
      spectatorPresences.push(presence);
      spectatorChanged = true;
      continue;
    }

    var existingPlayer = state.players[presence.userId];
    if (existingPlayer) {
      if (!state.playerSessions[presence.userId]) {
        state.playerSessions[presence.userId] = {};
      }
      if (sessionId) {
        state.playerSessions[presence.userId][sessionId] = true;
      }
      if (typeof existingPlayer.lastDisconnectTick === 'number') {
        existingPlayer.totalDisconnectedTicks = (existingPlayer.totalDisconnectedTicks || 0) + (tick - existingPlayer.lastDisconnectTick);
      }
      existingPlayer.connected = true;
      existingPlayer.lastDisconnectTick = null;
      if (presence.username) {
        existingPlayer.username = presence.username;
      }
      setPlayerGameState(nk, presence.userId, 'playing');
      rejoinPresences.push(presence);
      continue;
    }

    // Load player's global and category MMR from storage
    var playerCategoryMmr = {
      mmr: GAME_CONFIG.STARTING_MMR,
      rd: GAME_CONFIG.STARTING_RD,
      volatility: GAME_CONFIG.STARTING_VOLATILITY,
    };
    var playerGlobalMmr = {
      mmr: GAME_CONFIG.STARTING_MMR,
      rd: GAME_CONFIG.STARTING_RD,
      volatility: GAME_CONFIG.STARTING_VOLATILITY,
    };
    var playerAvatarUrl = '';

    try {
      var reads: nkruntime.StorageReadRequest[] = [
        { collection: 'player_data', key: 'global_mmr', userId: presence.userId },
        { collection: 'player_data', key: 'category_mmr', userId: presence.userId },
        { collection: 'player_data', key: 'telegram', userId: presence.userId },
      ];
      var results = nk.storageRead(reads);
      var globalMmrValue = getStorageValueByKey(results, 'global_mmr');
      if (globalMmrValue) {
        playerGlobalMmr.mmr = globalMmrValue.mmr || GAME_CONFIG.STARTING_MMR;
        playerGlobalMmr.rd = globalMmrValue.rd || GAME_CONFIG.STARTING_RD;
        playerGlobalMmr.volatility = globalMmrValue.volatility || GAME_CONFIG.STARTING_VOLATILITY;
      }

      var categoryMmr = getStorageValueByKey(results, 'category_mmr');
      if (categoryMmr && categoryMmr[categoryId]) {
        playerCategoryMmr.mmr = categoryMmr[categoryId].mmr || GAME_CONFIG.STARTING_MMR;
        playerCategoryMmr.rd = categoryMmr[categoryId].rd || GAME_CONFIG.STARTING_RD;
        playerCategoryMmr.volatility = categoryMmr[categoryId].volatility || GAME_CONFIG.STARTING_VOLATILITY;
      }

      // Get avatar URL from telegram data with account fallback
      var telegramData = getStorageValueByKey(results, 'telegram');
      if (telegramData && telegramData.photoUrl) {
        playerAvatarUrl = telegramData.photoUrl;
      } else {
        var account = nk.accountGetId(presence.userId);
        if (account && account.user && account.user.avatarUrl) {
          playerAvatarUrl = account.user.avatarUrl;
        }
      }
    } catch (error) {
      logger.warn('Could not load MMR for player ' + presence.userId + ': ' + error);
    }

    state.players[presence.userId] = {
      oderId: presence.userId,
      username: presence.username,
      mmr: playerCategoryMmr.mmr,
      rd: playerCategoryMmr.rd,
      volatility: playerCategoryMmr.volatility,
      globalMmr: playerGlobalMmr.mmr,
      globalRd: playerGlobalMmr.rd,
      globalVolatility: playerGlobalMmr.volatility,
      avatarUrl: playerAvatarUrl,
      score: 0,
      streak: 0,
      answers: [],
      connected: true,
      lastDisconnectTick: null,
      answeredCurrent: false,
      isBot: false,
    };
    if (!state.playerSessions[presence.userId]) {
      state.playerSessions[presence.userId] = {};
    }
    if (sessionId) {
      state.playerSessions[presence.userId][sessionId] = true;
    }

    logger.info('Player ' + presence.username + ' joined with category MMR: ' + playerCategoryMmr.mmr +
      ' (global: ' + playerGlobalMmr.mmr + ')');

    // Set player game state to 'playing' (for challenge safety checks)
    setPlayerGameState(nk, presence.userId, 'playing');

    // Track new players joining after the waiting phase so they get a state snapshot.
    if (state.phase !== 'waiting') {
      newPlayerPresences.push(presence);
    }
  }

  if (state.isTournament && state.tournamentMatchId) {
    try {
      nk.sqlExec(
        `UPDATE tournament_matches SET last_activity_at = NOW() WHERE id = $1`,
        [state.tournamentMatchId]
      );
    } catch (error) {
      logger.warn('Failed to update tournament match activity (join): ' + error);
    }
  }

  if (state.botMatch && Object.keys(state.players).length === 1) {
    ensureBotPlayer(state, logger);
  }

  // Broadcast player joined
  var playerList = [];
  for (var oderId in state.players) {
    var p = state.players[oderId];
    playerList.push({
      oderId: p.oderId,
      username: p.username,
      mmr: p.mmr,
      rankTier: getRankTierKeyForMmr(nk, logger, p.mmr),
      connected: p.connected,
      avatarUrl: p.avatarUrl || '',
    });
  }
  dispatcher.broadcastMessage(1, JSON.stringify({ players: playerList }));

  var realPlayerIds = getRealPlayerIds(state.players);
  var readyToStart = (state.botMatch || state.practiceMode)
    ? realPlayerIds.length === 1
    : realPlayerIds.length === 2;

  // Start countdown if we have enough players
  if (state.phase === 'waiting' && readyToStart) {
    var excludeIds = getRecentQuestionIds(nk, logger, realPlayerIds, state.category);
    var selectedQuestions = (state.questionPoolQuestions && Array.isArray(state.questionPoolQuestions) && state.questionPoolQuestions.length > 0)
      ? selectQuestionsFromList(state.category, state.questionPoolQuestions, nk, logger, excludeIds, state.questionsPerMatch, false)
      : selectQuestions(state.category, nk, logger, excludeIds, state.questionsPerMatch, false);
    if (!Array.isArray(selectedQuestions) || selectedQuestions.length === 0) {
      logger.error(
        'Cannot start match due to zero available real questions'
        + ' (matchId=' + (state.matchId || '')
        + ', category=' + state.category
        + ', requested=' + state.questionsPerMatch
        + ', pool=' + (state.questionPoolQuestions ? state.questionPoolQuestions.length : 0)
        + ')'
      );
      endMatch(state, tick, dispatcher, nk, logger, null, 'insufficient_questions');
      return { state: state };
    }
    if (selectedQuestions.length !== state.questionsPerMatch) {
      logger.warn(
        'Adjusted match question count to available real questions'
        + ' (matchId=' + (state.matchId || '')
        + ', category=' + state.category
        + ', requested=' + state.questionsPerMatch
        + ', selected=' + selectedQuestions.length
        + ')'
      );
      state.questionsPerMatch = selectedQuestions.length;
    }
    state.questions = randomizeOptionsForQuestions(selectedQuestions);
    var countdownSeconds = clampInt(state.countdownSeconds, 0, 15);
    if (countdownSeconds <= 0) {
      logger.info('Match ready, starting immediately (no countdown)');
      startQuestion(state, tick, dispatcher, logger);
    } else {
      state.phase = 'countdown';
      state.phaseStartTick = tick;
      logger.info('Match ready, starting countdown (' + countdownSeconds + 's)');
      dispatcher.broadcastMessage(
        2,
        JSON.stringify({
          countdown: countdownSeconds,
          category: state.category,
          parentCategory: state.parentCategory || null,
          matchPacing: state.matchPacing || null,
        })
      );
    }
  }

  if (rejoinPresences.length > 0 && state.phase !== 'waiting') {
    for (var j = 0; j < rejoinPresences.length; j++) {
      sendMatchStateSnapshot(state, tick, dispatcher, rejoinPresences[j]);
    }
  }

  if (newPlayerPresences.length > 0 && state.phase !== 'waiting') {
    for (var j = 0; j < newPlayerPresences.length; j++) {
      sendMatchStateSnapshot(state, tick, dispatcher, newPlayerPresences[j]);
    }
  }

  if (spectatorPresences.length > 0 && state.phase !== 'waiting') {
    for (var k = 0; k < spectatorPresences.length; k++) {
      sendMatchStateSnapshot(state, tick, dispatcher, spectatorPresences[k]);
    }
  }

  if (spectatorChanged) {
    updateTournamentSpectatorCount(nk, logger, state);
  }

  return { state: state };
}

export function matchLeave(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  presences: nkruntime.Presence[]
): {state: nkruntime.MatchState} | null {
  if (!state.playerSessions) {
    state.playerSessions = {};
  }
  if (!state.spectatorSessions) {
    state.spectatorSessions = {};
  }

  var spectatorChanged = false;
  for (var i = 0; i < presences.length; i++) {
    var presence = presences[i];
    var sessionId = getPresenceSessionId(presence);
    logger.info('Player left: ' + presence.userId);
    if (state.spectators && state.spectators[presence.userId]) {
      var spectatorSessionMap = state.spectatorSessions[presence.userId] || {};
      if (sessionId) {
        delete spectatorSessionMap[sessionId];
      } else {
        spectatorSessionMap = {};
      }
      state.spectatorSessions[presence.userId] = spectatorSessionMap;

      if (hasActiveSessions(spectatorSessionMap)) {
        continue;
      }

      if (state.spectators[presence.userId].connected) {
        state.spectators[presence.userId].connected = false;
        state.spectators[presence.userId].lastDisconnectTick = tick;
        spectatorChanged = true;
      }
      continue;
    }
    if (state.players && state.players[presence.userId]) {
      var playerSessionMap = state.playerSessions[presence.userId] || {};
      if (sessionId) {
        delete playerSessionMap[sessionId];
      } else {
        playerSessionMap = {};
      }
      state.playerSessions[presence.userId] = playerSessionMap;

      if (hasActiveSessions(playerSessionMap)) {
        continue;
      }

      state.players[presence.userId].connected = false;
      state.players[presence.userId].lastDisconnectTick = tick;
      dispatcher.broadcastMessage(3, JSON.stringify({ userId: presence.userId, oderId: presence.userId }));
    }
  }

  if (state.isTournament && state.tournamentMatchId) {
    try {
      nk.sqlExec(
        `UPDATE tournament_matches SET last_activity_at = NOW() WHERE id = $1`,
        [state.tournamentMatchId]
      );
    } catch (error) {
      logger.warn('Failed to update tournament match activity (leave): ' + error);
    }
  }

  if (spectatorChanged) {
    updateTournamentSpectatorCount(nk, logger, state);
  }

  if (state.phase === 'waiting') {
    // Keep waiting matches alive so reconnect grace and timeout logic in matchLoop can resolve safely.
    return { state: state };
  }

  var connectedCount = 0;
  for (var oderId in state.players) {
    if (state.players[oderId].connected) connectedCount++;
  }
  if (connectedCount === 0) {
    // Keep match alive so matchLoop can end it consistently (e.g. all_disconnected after grace).
    // If the match already ended, allow it to terminate immediately.
    if (state.phase === 'ended') {
      return null;
    }
    return { state: state };
  }

  return { state: state };
}

export function checkForDisconnectForfeit(
  state: any,
  tick: number,
  dispatcher: nkruntime.MatchDispatcher,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): boolean {
  if (!state.players || state.phase === 'waiting' || state.phase === 'ended') {
    return false;
  }

  var connectedIds: string[] = [];
  var disconnectedIds: string[] = [];
  for (var oderId in state.players) {
    if (state.players[oderId].connected) {
      connectedIds.push(oderId);
    } else {
      disconnectedIds.push(oderId);
    }
  }

  // No disconnected players
  if (disconnectedIds.length === 0) {
    return false;
  }

  var ticksPerSecond = state.tickRate || 10;
  var graceTicks = Math.ceil((GAME_CONFIG.DISCONNECT_GRACE_MS / 1000) * ticksPerSecond);
  var totalGraceCapTicks = Math.ceil((180000 / 1000) * ticksPerSecond); // 3 min total disconnect cap

  // Check if any player has exceeded the TOTAL accumulated disconnect cap
  // (prevents disconnect/reconnect cycling abuse — 14 s disconnect, 1 s reconnect, repeat).
  function playerExceededTotalCap(playerId: string): boolean {
    var totalDisc = state.players[playerId]?.totalDisconnectedTicks;
    return typeof totalDisc === 'number' && totalDisc >= totalGraceCapTicks;
  }

  // Case 1: One player connected, one or more disconnected - forfeit after grace period
  if (connectedIds.length === 1) {
    for (var i = 0; i < disconnectedIds.length; i++) {
      var disconnectedId = disconnectedIds[i];
      var lastDisconnectTick = state.players[disconnectedId].lastDisconnectTick;
      var pastIndividualGrace = typeof lastDisconnectTick === 'number' && (tick - lastDisconnectTick) >= graceTicks;
      var pastTotalCap = playerExceededTotalCap(disconnectedId);
      if (pastIndividualGrace || pastTotalCap) {
        var winnerId = connectedIds[0];
        var reason = pastTotalCap && !pastIndividualGrace ? 'total_disconnect_cap' : 'disconnect_grace';
        logger.info('Forfeit due to disconnect (' + reason + '). Winner: ' + winnerId + ' disconnectedId: ' + disconnectedId);
        endMatch(state, tick, dispatcher, nk, logger, winnerId, 'forfeit');
        return true;
      }
    }
  }

  // Case 2: All players disconnected - end match as draw after grace period
  if (connectedIds.length === 0 && disconnectedIds.length > 0) {
    var allPastGrace = true;
    for (var i = 0; i < disconnectedIds.length; i++) {
      var disconnectedId = disconnectedIds[i];
      var lastDisconnectTick = state.players[disconnectedId].lastDisconnectTick;
      var pastIndividualGrace = typeof lastDisconnectTick === 'number' && (tick - lastDisconnectTick) >= graceTicks;
      var pastTotalCap = playerExceededTotalCap(disconnectedId);
      if (!pastIndividualGrace && !pastTotalCap) {
        allPastGrace = false;
        break;
      }
    }
    if (allPastGrace) {
      logger.info('All players disconnected past grace period. Ending match as draw.');
      endMatch(state, tick, dispatcher, nk, logger, null, 'all_disconnected');
      return true;
    }
  }

  return false;
}

export function getRealPlayerIds(players: {[key: string]: any}): string[] {
  var ids: string[] = [];
  for (var oderId in players) {
    if (!players[oderId].isBot) {
      ids.push(oderId);
    }
  }
  return ids;
}

export function getRecentQuestionIds(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  playerIds: string[],
  category: string
): string[] {
  // Skip recent question tracking for performance under high load
  // The question cache already provides good randomization
  // This avoids 2+ storage reads per match start
  if (playerIds.length === 0) {
    return [];
  }

  // For performance, only do recent question tracking for single player (bot matches)
  // PvP matches will just get random questions from cache
  if (playerIds.length > 1) {
    return [];
  }

  var exclude: {[key: string]: boolean} = {};

  try {
    var reads: nkruntime.StorageReadRequest[] = [];
    for (var i = 0; i < playerIds.length; i++) {
      reads.push({ collection: 'player_data', key: 'recent_questions', userId: playerIds[i] });
    }
    var results = nk.storageRead(reads);
    for (var j = 0; j < results.length; j++) {
      var value = results[j]?.value || {};
      var recentList = value[category] || [];
      for (var k = 0; k < recentList.length; k++) {
        exclude[recentList[k]] = true;
      }
    }
  } catch (error) {
    // Silently ignore - recent question tracking is not critical
    return [];
  }

  var excludeIds: string[] = [];
  for (var id in exclude) {
    excludeIds.push(id);
  }
  if (excludeIds.length > QUESTION_HISTORY_MAX) {
    excludeIds = excludeIds.slice(0, QUESTION_HISTORY_MAX);
  }
  return excludeIds;
}

export function ensureBotPlayer(state: any, logger: nkruntime.Logger): void {
  if (!state.botMatch || !state.botId) {
    return;
  }
  if (state.players[state.botId]) {
    return;
  }

  var humanMmr = GAME_CONFIG.STARTING_MMR;
  for (var oderId in state.players) {
    if (!state.players[oderId].isBot) {
      humanMmr = state.players[oderId].mmr || humanMmr;
      break;
    }
  }

  var botDisplayName = typeof state.botDisplayName === 'string' ? state.botDisplayName.trim() : '';
  if (!botDisplayName) {
    botDisplayName = 'Quiz Bot';
  }

  state.players[state.botId] = {
    oderId: state.botId,
    username: botDisplayName,
    mmr: humanMmr,
    rd: GAME_CONFIG.STARTING_RD,
    volatility: GAME_CONFIG.STARTING_VOLATILITY,
    score: 0,
    streak: 0,
    answers: [],
    connected: true,
    answeredCurrent: false,
    isBot: true,
  };

  logger.info('Bot player added to match: ' + state.botId);
}

export function matchLoop(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  messages: nkruntime.MatchMessage[]
): {state: nkruntime.MatchState} | null {
  var ticksPerSecond = state.tickRate || 10;
  var ticksSincePhaseStart = tick - (state.phaseStartTick || 0);
  // Use settings from state (loaded from DB at match init), fall back to GAME_CONFIG defaults
  var timePerQuestionMs = state.timePerQuestionMs || GAME_CONFIG.TIME_PER_QUESTION_MS;
  var questionTimeLimit = timePerQuestionMs / 1000;
  if (!Number.isFinite(questionTimeLimit) || questionTimeLimit <= 0) {
    questionTimeLimit = GAME_CONFIG.TIME_PER_QUESTION_MS / 1000;
  }
  var revealDelayMs = Number(state.revealDelayMs);
  if (!Number.isFinite(revealDelayMs) || revealDelayMs < 0) {
    revealDelayMs = GAME_CONFIG.TIME_BETWEEN_QUESTIONS_MS;
  }
  var revealDelayTicks = Math.max(0, Math.ceil((revealDelayMs / 1000) * ticksPerSecond));
  var endGraceTicks = Math.ceil((GAME_CONFIG.MATCH_END_GRACE_MS / 1000) * ticksPerSecond);

  // Process messages
  for (var i = 0; i < messages.length; i++) {
    var message = messages[i];
    if (message.opCode === 12) {
      try {
        var syncDataString = decodeData(message.data);
        var syncData = JSON.parse(syncDataString || '{}');
        var nowMs = Date.now();
        dispatcher.broadcastMessage(
          13,
          JSON.stringify({
            clientTimeMs: syncData.clientTimeMs || 0,
            serverReceiveTimeMs: nowMs,
            serverSendTimeMs: nowMs,
          }),
          [message.sender]
        );
      } catch (error) {
        logger.error('Error processing time sync: ' + error);
      }
      continue;
    }
    if (message.opCode === 10) {
      if (state.spectators && state.spectators[message.sender.userId]) {
        continue;
      }
      try {
        var dataString = decodeData(message.data);
        var data = JSON.parse(dataString);
        handleAnswer(state, message.sender.userId, data.answerIndex, tick, dispatcher, logger);
      } catch (error) {
        logger.error('Error processing answer: ' + error);
      }
    }
    // OpCode 14 = Surrender - immediate forfeit
    if (message.opCode === 14) {
      if (state.spectators && state.spectators[message.sender.userId]) {
        continue;
      }
      logger.info('Player surrendered: ' + message.sender.userId);
      // Find the opponent (winner)
      var surrenderingPlayerId = message.sender.userId;
      var winnerId: string | null = null;
      for (var oderId in state.players) {
        if (oderId !== surrenderingPlayerId) {
          winnerId = oderId;
          break;
        }
      }
      if (winnerId && state.phase !== 'ended') {
        endMatch(state, tick, dispatcher, nk, logger, winnerId, 'surrender');
        return { state: state };
      }
    }

    // OpCode 40 = Rematch Request
    if (message.opCode === 40) {
      if (state.spectators && state.spectators[message.sender.userId]) {
        continue;
      }
      if (state.phase === 'ended') {
        var requesterId = message.sender.userId;
        logger.info('Rematch requested by: ' + requesterId);

        // Initialize rematch tracking if not exists
        if (!state.rematchRequests) {
          state.rematchRequests = {};
          state.rematchRequestTime = Date.now();
        }

        // Record the request
        state.rematchRequests[requesterId] = true;

        // Notify other players about the rematch request
        dispatcher.broadcastMessage(
          41, // OpCode 41 = Rematch Request Received
          JSON.stringify({
            requesterId: requesterId,
            requesterUsername: state.players[requesterId]?.username || 'Unknown',
          }),
          null,
          message.sender // Exclude the sender
        );

        // Check if all human players have requested rematch
        var allHumansRequested = true;
        var humanPlayerIds: string[] = [];
        for (var oderId in state.players) {
          if (oderId !== state.botId) {
            humanPlayerIds.push(oderId);
            if (!state.rematchRequests[oderId]) {
              allHumansRequested = false;
            }
          }
        }

        // If all humans requested or if playing with bot
        if (allHumansRequested && humanPlayerIds.length >= 1) {
          if (state.rematchCreated && state.rematchId) {
            dispatcher.broadcastMessage(
              42,
              JSON.stringify({
                matchId: state.rematchId,
                category: state.category,
                alreadyCreated: true,
              }),
              [message.sender]
            );
            continue;
          }

          logger.info('All players requested rematch, creating new match');
          state.rematchCreated = true;

          // Create a new match with the same settings
          try {
            var newMatchId = nk.matchCreate('quiz_match', {
              category: state.category || 'general',
              parentCategory: state.parentCategory || '',
              isChallenge: 'true',
              isRematch: 'true',
              originalMatchId: state.matchId || '',
              player1: humanPlayerIds[0] || '',
              player2: humanPlayerIds[1] || '',
            });
            state.rematchId = newMatchId;

            // Notify all players about the new match
            dispatcher.broadcastMessage(
              42, // OpCode 42 = Rematch Match Created
              JSON.stringify({
                matchId: newMatchId,
                category: state.category,
                alreadyCreated: false,
              })
            );

            logger.info('Rematch match created: ' + newMatchId);
          } catch (error) {
            state.rematchCreated = false;
            state.rematchId = null;
            logger.error('Error creating rematch: ' + error);
            dispatcher.broadcastMessage(
              43, // OpCode 43 = Rematch Failed
              JSON.stringify({ error: 'Failed to create rematch' })
            );
          }
        }
      }
    }
  }

  if (checkForDisconnectForfeit(state, tick, dispatcher, nk, logger)) {
    return { state: state };
  }

  if (state.phase === 'question') {
    maybeAnswerAsBot(state, tick, dispatcher, logger);
  }

  // Phase transitions
  if (state.phase === 'waiting') {
    var waitingTimeoutMs = (state.isChallenge || state.isTournament)
      ? WAITING_TIMEOUT_MS_CHALLENGE_OR_TOURNAMENT
      : WAITING_TIMEOUT_MS_DEFAULT;
    var waitingTimeoutTicks = Math.ceil((waitingTimeoutMs / 1000) * ticksPerSecond);
    if (ticksSincePhaseStart >= waitingTimeoutTicks) {
      var expectedPlayers = Array.isArray(state.expectedPlayers) ? state.expectedPlayers : [];
      var normalizedExpectedPlayers: string[] = [];
      var expectedSeen: {[key: string]: boolean} = {};
      for (var ep = 0; ep < expectedPlayers.length; ep++) {
        var expectedId = expectedPlayers[ep];
        if (typeof expectedId !== 'string' || expectedId.length === 0 || expectedSeen[expectedId]) {
          continue;
        }
        expectedSeen[expectedId] = true;
        normalizedExpectedPlayers.push(expectedId);
      }
      if (normalizedExpectedPlayers.length !== expectedPlayers.length) {
        state.expectedPlayers = normalizedExpectedPlayers;
      }
      expectedPlayers = normalizedExpectedPlayers;

      var waitingGraceTicks = Math.ceil((GAME_CONFIG.DISCONNECT_GRACE_MS / 1000) * ticksPerSecond);

      var connectedExpectedIds: string[] = [];
      var missingExpectedCount = 0;
      var expectedPendingGrace = false;
      var expectedDisconnectedPastGrace = false;
      for (var ex = 0; ex < expectedPlayers.length; ex++) {
        var expectedUserId = expectedPlayers[ex];
        var expectedPlayer = state.players ? state.players[expectedUserId] : null;
        if (expectedPlayer && expectedPlayer.connected) {
          connectedExpectedIds.push(expectedUserId);
          continue;
        }

        if (expectedPlayer && typeof expectedPlayer.lastDisconnectTick === 'number') {
          if ((tick - expectedPlayer.lastDisconnectTick) >= waitingGraceTicks) {
            expectedDisconnectedPastGrace = true;
          } else {
            expectedPendingGrace = true;
          }
          continue;
        }

        missingExpectedCount++;
      }

      var clearExpectedPlayers = function() {
        for (var cp = 0; cp < expectedPlayers.length; cp++) {
          if (expectedPlayers[cp]) {
            clearPlayerGameState(nk, expectedPlayers[cp]);
          }
        }
      };

      if (
        expectedPlayers.length >= 2
        && connectedExpectedIds.length === 1
        && !expectedPendingGrace
        && (missingExpectedCount > 0 || expectedDisconnectedPastGrace)
      ) {
        clearExpectedPlayers();
        logger.info('Waiting timeout reached. Awarding no-show/disconnect forfeit to ' + connectedExpectedIds[0]);
        endMatch(state, tick, dispatcher, nk, logger, connectedExpectedIds[0], 'forfeit');
      } else if (expectedPendingGrace) {
        // Reconnect grace is still active for at least one expected player; keep waiting.
      } else {
        clearExpectedPlayers();
        logger.info('Waiting timeout reached. Ending match without result.');
        endMatch(state, tick, dispatcher, nk, logger, null, 'waiting_timeout');
      }
    }
  } else if (state.phase === 'countdown') {
    var countdownSeconds = Number(state.countdownSeconds);
    if (!Number.isFinite(countdownSeconds) || countdownSeconds < 0) {
      countdownSeconds = 3;
    }
    if (ticksSincePhaseStart >= ticksPerSecond * countdownSeconds) {
      startQuestion(state, tick, dispatcher, logger);
    }
  } else if (state.phase === 'question') {
    var questionStartTick = Number(state.questionStartTick);
    if (!Number.isFinite(questionStartTick)) {
      // Recover from any corrupted/missing questionStartTick so timeout still advances.
      var phaseStartTick = Number(state.phaseStartTick);
      questionStartTick = Number.isFinite(phaseStartTick) ? phaseStartTick : tick;
      state.questionStartTick = questionStartTick;
    }
    var questionTime = (tick - questionStartTick) / ticksPerSecond;
    var questionTimedOut = !Number.isFinite(questionTime) || questionTime >= questionTimeLimit;
    var allAnswered = true;
    for (var oderId in state.players) {
      if (!state.players[oderId].answeredCurrent) {
        allAnswered = false;
        break;
      }
    }
    if (questionTimedOut || allAnswered) {
      revealAnswer(state, tick, dispatcher, logger);
    }
  } else if (state.phase === 'reveal') {
    if (ticksSincePhaseStart >= revealDelayTicks) {
      state.currentQuestionIndex++;
      if (state.currentQuestionIndex >= state.questions.length) {
        endMatch(state, tick, dispatcher, nk, logger);
      } else {
        startQuestion(state, tick, dispatcher, logger);
      }
    }
  } else if (state.phase === 'ended') {
    if (ticksSincePhaseStart >= endGraceTicks) {
      return null;
    }
  }

  return { state: state };
}

export function getConnectedSpectatorCount(state: any): number {
  if (!state || !state.spectators) return 0;
  var count = 0;
  for (var userId in state.spectators) {
    if (state.spectators[userId]?.connected) {
      count++;
    }
  }
  return count;
}

export function updateTournamentSpectatorCount(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  state: any
): void {
  if (!state || !state.isTournament || !state.tournamentMatchId || !state.allowSpectators) {
    return;
  }
  try {
    var count = getConnectedSpectatorCount(state);
    nk.sqlExec(
      `UPDATE tournament_matches SET spectator_count = $1 WHERE id = $2`,
      [count, state.tournamentMatchId]
    );
  } catch (error) {
    logger.warn('Failed to update spectator count: ' + error);
  }
}

export function matchTerminate(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  graceSeconds: number
): {state: nkruntime.MatchState} | null {
  logger.info('Match terminated. graceSeconds=' + graceSeconds);

  var players = state.players || {};
  for (var userId in players) {
    var player = players[userId];
    if (player && !player.isBot) {
      clearPlayerGameState(nk, userId);
    }
  }

  if (state.isTournament && state.tournamentMatchId) {
    // If this is a tournament bot match killed by idle timeout and no human
    // ever joined (state.players is empty or only contains bots), don't reset
    // the match to 'ready'.  Resetting creates an infinite cycle:
    //   auto-start → idle-kill (30 s) → reset → auto-start → …
    // Instead, leave the row in 'in_progress' with its dead nakama_match_id
    // and original last_activity_at.  repairStuckTournamentMatchStarts will
    // forfeit the absent human after the 90-second idle threshold and advance
    // the bot.
    if (graceSeconds === 0 && state.botMatch) {
      var humanEverJoined = false;
      for (var uid in players) {
        if (!players[uid].isBot) {
          humanEverJoined = true;
          break;
        }
      }
      if (!humanEverJoined) {
        logger.info(
          'Tournament bot match ' + state.tournamentMatchId +
          ' terminated with no human — skipping reset so repair can forfeit.'
        );
        // Skip the DB reset below and proceed to phase=ended cleanup.
      } else {
        // Human joined at some point — normal reset.
        try {
          nk.sqlExec(
            `UPDATE tournament_matches SET
             status = 'ready',
             nakama_match_id = NULL,
             started_at = NULL,
             spectator_count = 0,
             ready_at = NOW()
             WHERE id = $1
               AND status NOT IN ('completed', 'bye')`,
            [state.tournamentMatchId]
          );
        } catch (error) {
          logger.warn('Failed to reset tournament match during terminate: ' + error);
        }
      }
    } else {
      // Human-vs-human or server shutdown — normal reset.
      // Preserve existing last_activity_at (omit from SET) so
      // repairStuckTournamentMatchStarts can detect cycles.
      try {
        nk.sqlExec(
          `UPDATE tournament_matches SET
           status = 'ready',
           nakama_match_id = NULL,
           started_at = NULL,
           spectator_count = 0,
           ready_at = NOW()
           WHERE id = $1
             AND status NOT IN ('completed', 'bye')`,
          [state.tournamentMatchId]
        );
      } catch (error) {
        logger.warn('Failed to reset tournament match during terminate: ' + error);
      }
    }
  }

  if (state.phase !== 'ended') {
    state.phase = 'ended';
    state.phaseStartTick = tick;
    if (!state.lastMatchEnd) {
      state.lastMatchEnd = {
        winnerId: null,
        finalScores: {},
        mmrChanges: {},
        playerStats: {},
        category: state.category || '',
        reason: 'terminated',
      };
    }
    try {
      dispatcher.broadcastMessage(30, JSON.stringify(state.lastMatchEnd));
    } catch (broadcastError) {
      logger.warn('Failed to broadcast terminate match end payload: ' + broadcastError);
    }
  }

  return { state: state };
}

export function matchSignal(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  data: string
): {state: nkruntime.MatchState, data?: string} | null {
  return { state: state, data: 'ok' };
}

// ============================================================================
