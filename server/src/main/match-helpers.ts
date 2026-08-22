import { getMmrCeiling, getMmrFloor, getQuestionCache, getQuestionsPerMatch, QUESTION_CACHE_MIN_SIZE, QUESTION_CACHE_TTL_MS } from './config';
import { BOT_CONFIG, GAME_CONFIG, QUESTION_HISTORY_MAX, normalizeCategory } from './constants';
import { clearPlayerGameState } from './friends';
import { buildMatchQuestionsData, calculateFixedMmrRating, getRankTierKeyForMmr, recordMatchHistorySql, saveMatchHistory, updatePlayerMmr, updatePlayerStats, updatePracticeStats } from './mmr';
import { autoReportTournamentResult } from './tournament-advance';

// HELPER FUNCTIONS
// ============================================================================

export function buildQuestionPayload(state: any, tick: number): any {
  var question = state.questions[state.currentQuestionIndex];
  var scores: {[key: string]: number} = {};
  var answeredBy: {[key: string]: boolean} = {};
  var ticksPerSecond = state.tickRate || 10;
  var questionStartTick = typeof state.questionStartTick === 'number' ? state.questionStartTick : tick;
  var serverTimeMs = Date.now();
  var elapsedMs = Math.max(0, (tick - questionStartTick) * 1000 / ticksPerSecond);
  var questionStartTimeMs = serverTimeMs - elapsedMs;
  var timeLimitMs = state.timePerQuestionMs || GAME_CONFIG.TIME_PER_QUESTION_MS;
  var questionType = question && (question.questionType || question.question_type) ? (question.questionType || question.question_type) : 'mcq';

  for (var oderId in state.players) {
    scores[oderId] = state.players[oderId].score;
    answeredBy[oderId] = !!state.players[oderId].answeredCurrent;
  }

  return {
    questionNumber: state.currentQuestionIndex + 1,
    totalQuestions: state.questions.length,
    category: state.category || null,
    matchPacing: state.matchPacing || null,
    question: {
      id: question.id,
      text: question.questionText,
      options: question.options,
      difficulty: question.difficulty,
      type: questionType,
      passage: question.passageText || question.passage_text || '',
    },
    timeLimit: Math.ceil(timeLimitMs / 1000),
    timeLimitMs: timeLimitMs,
    questionStartTimeMs: questionStartTimeMs,
    serverTimeMs: serverTimeMs,
    scores: scores,
    answeredBy: answeredBy,
  };
}

export function buildRevealPayload(state: any): any {
  var question = state.questions[state.currentQuestionIndex];
  var playerResults: {[key: string]: any} = {};

  for (var oderId in state.players) {
    var player = state.players[oderId];
    var answer = null;
    for (var i = 0; i < player.answers.length; i++) {
      if (player.answers[i].questionIndex === state.currentQuestionIndex) {
        answer = player.answers[i];
        break;
      }
    }
    var scoreGained = 0;
    if (answer) {
      if (typeof answer.scoreGained === 'number') {
        scoreGained = answer.scoreGained;
      } else if (answer.correct) {
        scoreGained = 100 + calculateSpeedBonus(answer.timeMs) + calculateStreakBonus(answer.streakAfter || player.streak);
      }
    }
    playerResults[oderId] = {
      answerIndex: answer ? answer.answerIndex : null,
      correct: answer ? answer.correct : false,
      scoreGained: scoreGained,
      totalScore: player.score,
      streak: player.streak,
      timeMs: answer ? answer.timeMs : null,
    };
  }

  return {
    questionNumber: state.currentQuestionIndex + 1,
    category: state.category || null,
    matchPacing: state.matchPacing || null,
    correctIndex: question.correctIndex,
    explanation: question.explanation,
    playerResults: playerResults,
  };
}

function markTimeoutAnswers(state: any, tick: number): void {
  if (!state || !state.players) {
    return;
  }

  var timePerQuestionMs = state.timePerQuestionMs || GAME_CONFIG.TIME_PER_QUESTION_MS;
  for (var playerId in state.players) {
    var player = state.players[playerId];
    if (!player || player.answeredCurrent) {
      continue;
    }

    player.answeredCurrent = true;
    player.streak = 0;
    player.answers.push({
      questionIndex: state.currentQuestionIndex,
      answerIndex: null,
      timeMs: timePerQuestionMs,
      correct: false,
      flagged: 'timeout',
      scoreGained: 0,
      streakAfter: 0,
      timeout: true,
      serverTick: tick,
    });
  }
}

export function getBotAccuracy(difficulty: string): number {
  if (difficulty === 'easy') return BOT_CONFIG.ACCURACY_EASY;
  if (difficulty === 'hard') return BOT_CONFIG.ACCURACY_HARD;
  return BOT_CONFIG.ACCURACY_MEDIUM;
}

function clampNumber(value: number, minValue: number, maxValue: number): number {
  if (!Number.isFinite(value)) return minValue;
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

function toNumber(value: any, fallback: number): number {
  var parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function pickWrongAnswerIndex(question: any, optionsCount: number, nearMissChance: number): number {
  var correctIndex = Number(question.correctIndex);
  var wrongIndexes: number[] = [];
  for (var i = 0; i < optionsCount; i++) {
    if (i !== correctIndex) {
      wrongIndexes.push(i);
    }
  }
  if (wrongIndexes.length === 0) {
    return 0;
  }

  var shouldNearMiss = Math.random() < nearMissChance;
  if (!shouldNearMiss || wrongIndexes.length === 1) {
    return wrongIndexes[Math.floor(Math.random() * wrongIndexes.length)];
  }

  var closestDistance = Number.MAX_SAFE_INTEGER;
  for (var j = 0; j < wrongIndexes.length; j++) {
    var distance = Math.abs(wrongIndexes[j] - correctIndex);
    if (distance < closestDistance) {
      closestDistance = distance;
    }
  }

  var nearMissIndexes: number[] = [];
  for (var k = 0; k < wrongIndexes.length; k++) {
    if (Math.abs(wrongIndexes[k] - correctIndex) === closestDistance) {
      nearMissIndexes.push(wrongIndexes[k]);
    }
  }
  if (nearMissIndexes.length === 0) {
    return wrongIndexes[Math.floor(Math.random() * wrongIndexes.length)];
  }
  return nearMissIndexes[Math.floor(Math.random() * nearMissIndexes.length)];
}

export function scheduleBotAnswer(state: any, tick: number, logger: nkruntime.Logger): void {
  if (!state.botMatch || !state.botId || !state.players[state.botId]) {
    return;
  }

  var bot = state.players[state.botId];
  var question = state.questions[state.currentQuestionIndex];
  if (!question) {
    return;
  }
  var optionsCount = Array.isArray(question.options) ? question.options.length : 0;
  if (optionsCount < 2) {
    return;
  }

  var timePerQuestionMs = state.timePerQuestionMs || GAME_CONFIG.TIME_PER_QUESTION_MS;
  var minDelay = Math.max(BOT_CONFIG.ANSWER_DELAY_MIN_MS, GAME_CONFIG.MIN_ANSWER_TIME_MS + 200);
  var maxDelay = Math.min(BOT_CONFIG.ANSWER_DELAY_MAX_MS, timePerQuestionMs - 500);

  var accuracy = getBotAccuracy(question.difficulty || 'medium');
  var nearMissChance = 0;
  var tournamentDifficulty = state.botDifficultyProfile && typeof state.botDifficultyProfile === 'object'
    ? state.botDifficultyProfile
    : null;
  if (tournamentDifficulty) {
    var tournamentRound = parseInt(String(state.tournamentRound || 1), 10);
    if (!Number.isFinite(tournamentRound) || tournamentRound < 1) {
      tournamentRound = 1;
    }
    var roundOffset = tournamentRound - 1;

    var minAccuracy = clampNumber(toNumber(tournamentDifficulty.minAccuracy, 0.65), 0.05, 0.995);
    var maxAccuracy = clampNumber(toNumber(tournamentDifficulty.maxAccuracy, 0.995), 0.1, 0.999);
    if (maxAccuracy < minAccuracy) {
      var tmp = minAccuracy;
      minAccuracy = maxAccuracy;
      maxAccuracy = tmp;
    }

    var baseAccuracy = clampNumber(
      toNumber(tournamentDifficulty.baseAccuracy, maxAccuracy),
      minAccuracy,
      maxAccuracy
    );
    var roundAccuracyBonus = clampNumber(toNumber(tournamentDifficulty.roundAccuracyBonus, 0), 0, 0.2);
    var difficultyAdjust = 0;
    var questionDifficulty = String(question.difficulty || '').toLowerCase();
    if (questionDifficulty === 'easy') {
      difficultyAdjust = 0.035;
    } else if (questionDifficulty === 'hard') {
      difficultyAdjust = -0.05;
    }
    accuracy = clampNumber(baseAccuracy + roundOffset * roundAccuracyBonus + difficultyAdjust, minAccuracy, maxAccuracy);

    var profileMinDelay = Math.floor(clampNumber(
      toNumber(tournamentDifficulty.minDelayMs, BOT_CONFIG.ANSWER_DELAY_MIN_MS),
      200,
      60000
    ));
    var profileMaxDelay = Math.floor(clampNumber(
      toNumber(tournamentDifficulty.maxDelayMs, BOT_CONFIG.ANSWER_DELAY_MAX_MS),
      200,
      90000
    ));
    var roundDelayReduction = Math.floor(clampNumber(
      toNumber(tournamentDifficulty.roundDelayReductionMs, 0),
      0,
      10000
    ));

    minDelay = Math.max(profileMinDelay, GAME_CONFIG.MIN_ANSWER_TIME_MS + 200);
    var profileRoundMaxDelay = profileMaxDelay - roundOffset * roundDelayReduction;
    if (profileRoundMaxDelay < minDelay) {
      profileRoundMaxDelay = minDelay;
    }
    var maxAllowedForQuestion = Math.max(minDelay, timePerQuestionMs - 250);
    maxDelay = Math.min(profileRoundMaxDelay, maxAllowedForQuestion);

    nearMissChance = clampNumber(toNumber(tournamentDifficulty.nearMissChance, 0.65), 0, 1);
  }

  var delayMs = minDelay + Math.random() * Math.max(0, maxDelay - minDelay);
  var ticksPerSecond = state.tickRate || 10;
  bot.botAnswerTick = tick + Math.ceil((delayMs / 1000) * ticksPerSecond);

  var willBeCorrect = Math.random() < accuracy;
  if (willBeCorrect) {
    bot.botAnswerIndex = question.correctIndex;
  } else {
    bot.botAnswerIndex = pickWrongAnswerIndex(question, optionsCount, nearMissChance);
  }

  logger.debug('Bot scheduled answer at tick ' + bot.botAnswerTick);
}

export function maybeAnswerAsBot(
  state: any,
  tick: number,
  dispatcher: nkruntime.MatchDispatcher,
  logger: nkruntime.Logger
): void {
  if (!state.botMatch || !state.botId || !state.players[state.botId]) {
    return;
  }

  var bot = state.players[state.botId];
  if (bot.answeredCurrent) {
    return;
  }

  if (typeof bot.botAnswerTick === 'number' && tick >= bot.botAnswerTick) {
    var answerIndex = typeof bot.botAnswerIndex === 'number' ? bot.botAnswerIndex : 0;
    handleAnswer(state, bot.oderId, answerIndex, tick, dispatcher, logger);
  }
}

export function sendMatchStateSnapshot(
  state: any,
  tick: number,
  dispatcher: nkruntime.MatchDispatcher,
  presence: nkruntime.Presence
): void {
  var ticksPerSecond = state.tickRate || 10;

  if (state.phase === 'countdown') {
    var elapsedCountdown = (tick - (state.phaseStartTick || 0)) / ticksPerSecond;
    var configuredCountdown = Number(state.countdownSeconds);
    if (!Number.isFinite(configuredCountdown) || configuredCountdown < 0) {
      configuredCountdown = 3;
    }
    var countdownRemaining = Math.max(0, Math.ceil(configuredCountdown - elapsedCountdown));
    dispatcher.broadcastMessage(
      2,
      JSON.stringify({
        countdown: countdownRemaining,
        category: state.category,
        parentCategory: state.parentCategory || null,
        matchPacing: state.matchPacing || null,
      }),
      [presence]
    );
    return;
  }

  if (state.phase === 'question') {
    var questionPayload = buildQuestionPayload(state, tick);
    dispatcher.broadcastMessage(20, JSON.stringify(questionPayload), [presence]);
    return;
  }

  if (state.phase === 'reveal') {
    var questionPayloadForReveal = buildQuestionPayload(state, tick);
    dispatcher.broadcastMessage(20, JSON.stringify(questionPayloadForReveal), [presence]);
    var revealPayload = state.lastReveal || buildRevealPayload(state);
    dispatcher.broadcastMessage(21, JSON.stringify(revealPayload), [presence]);
    return;
  }

  if (state.phase === 'ended' && state.lastMatchEnd) {
    dispatcher.broadcastMessage(30, JSON.stringify(state.lastMatchEnd), [presence]);
  }
}

// Refresh question cache for a category (called on server init and periodically)
export function refreshQuestionCache(
  category: string,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): void {
  function getRows(result: any): any[] {
    if (Array.isArray(result)) return result;
    if (result && result.rows) return result.rows;
    return [];
  }

  try {
    // Load all questions for category at once (much more efficient than per-match queries)
    var query = `SELECT id, category, difficulty, question_text, options, correct_index, explanation, source_reference, question_type, passage_text
                 FROM questions
                 WHERE category = $1 AND is_active = true
                 ORDER BY RANDOM()
                 LIMIT 200`;
    var result = nk.sqlQuery(query, [category]);
    var rows = getRows(result);

    var questions: any[] = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var options = row.options;

      try {
        // Handle various formats that JSONB might be returned as
        if (Array.isArray(options) && options.length > 0 && typeof options[0] === 'number') {
          var byteString = '';
          for (var j = 0; j < options.length; j++) {
            byteString += String.fromCharCode(options[j]);
          }
          options = JSON.parse(byteString);
        } else if (typeof options === 'string') {
          options = JSON.parse(options);
        }
      } catch (parseError) {
        logger.warn('Invalid question options for id ' + row.id + ' (category ' + category + '): ' + parseError);
        continue;
      }

      if (!Array.isArray(options) || options.length < 2 || options.length > 6) {
        logger.warn('Skipping question with invalid options length for id ' + row.id + ' (category ' + category + '): ' + (Array.isArray(options) ? options.length : 'non_array'));
        continue;
      }

      var correctIndex = typeof row.correct_index === 'number' ? row.correct_index : parseInt(row.correct_index, 10);
      if (!Number.isFinite(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
        logger.warn('Skipping question with invalid correct_index for id ' + row.id + ' (category ' + category + '): ' + row.correct_index);
        continue;
      }

      questions.push({
        id: row.id,
        category: row.category,
        difficulty: row.difficulty,
        questionText: row.question_text,
        options: options,
        correctIndex: correctIndex,
        explanation: row.explanation || '',
        sourceReference: row.source_reference || '',
        questionType: row.question_type || 'mcq',
        passageText: row.passage_text || '',
      });
    }

    getQuestionCache()[category] = {
      questions: questions,
      lastRefresh: Date.now(),
    };
    logger.info('Cached ' + questions.length + ' questions for category: ' + category);
  } catch (error) {
    logger.error('Error refreshing question cache for ' + category + ': ' + error);
  }
}

// Randomize answer options per match without mutating cached questions.
export function randomizeOptionsForQuestion(question: any): any {
  if (!question) return question;

  var copy: any = {};
  for (var key in question) {
    if (Object.prototype.hasOwnProperty.call(question, key)) {
      copy[key] = question[key];
    }
  }

  if (!Array.isArray(question.options)) {
    return copy;
  }

  var options = question.options.slice();
  if (options.length < 2) {
    copy.options = options;
    return copy;
  }

  var indices: number[] = [];
  for (var i = 0; i < options.length; i++) {
    indices.push(i);
  }

  for (var j = indices.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var tmp = indices[j];
    indices[j] = indices[k];
    indices[k] = tmp;
  }

  var shuffledOptions: any[] = [];
  var originalCorrectIndex = typeof question.correctIndex === 'number'
    ? question.correctIndex
    : (typeof question.correct_index === 'number' ? question.correct_index : -1);
  var newCorrectIndex = -1;

  for (var m = 0; m < indices.length; m++) {
    var originalIndex = indices[m];
    shuffledOptions.push(options[originalIndex]);
    if (originalIndex === originalCorrectIndex) {
      newCorrectIndex = m;
    }
  }

  copy.options = shuffledOptions;
  if (newCorrectIndex >= 0) {
    copy.correctIndex = newCorrectIndex;
    copy.correct_index = newCorrectIndex;
  }

  return copy;
}

export function randomizeOptionsForQuestions(questions: any[]): any[] {
  var randomized: any[] = [];
  for (var i = 0; i < questions.length; i++) {
    randomized.push(randomizeOptionsForQuestion(questions[i]));
  }
  return randomized;
}

function normalizeQuestionDifficulty(value: any): 'easy' | 'medium' | 'hard' {
  if (value === 'easy' || value === 'hard') return value;
  return 'medium';
}

function shuffleInPlace(arr: any[]): any[] {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

function buildFallbackQuestions(category: string, questionsNeeded: number, reason: string): any[] {
  var fallbackQuestions: any[] = [];
  for (var i = 0; i < questionsNeeded; i++) {
    fallbackQuestions.push({
      id: 'fallback_' + i,
      category: category,
      difficulty: i < 2 ? 'easy' : i < 5 ? 'medium' : 'hard',
      questionText: 'Fallback question ' + (i + 1) + ' for ' + category,
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctIndex: 0,
      explanation: reason,
      sourceReference: '',
      questionType: 'mcq',
      passageText: '',
    });
  }
  return fallbackQuestions;
}

export function selectQuestionsFromList(
  category: string,
  allQuestions: any[],
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  excludeIds?: string[],
  questionsNeededOverride?: number,
  allowSyntheticFallback: boolean = true
): any[] {
  category = normalizeCategory(category);
  var questionsNeeded = (typeof questionsNeededOverride === 'number' && questionsNeededOverride > 0)
    ? questionsNeededOverride
    : getQuestionsPerMatch(nk, logger);

  if (!Array.isArray(allQuestions) || allQuestions.length === 0) {
    if (allowSyntheticFallback) {
      logger.warn('Question list empty for ' + category + ', using fallback questions');
      return buildFallbackQuestions(category, questionsNeeded, 'Question list empty - using fallback question.');
    }
    logger.warn('Question list empty for ' + category + ', returning no questions');
    return [];
  }

  // Select random questions from list, excluding recently seen ones
  var excludeSet: {[key: string]: boolean} = {};
  if (excludeIds && excludeIds.length > 0) {
    for (var e = 0; e < excludeIds.length; e++) {
      excludeSet[excludeIds[e]] = true;
    }
  }

  var easy: any[] = [];
  var medium: any[] = [];
  var hard: any[] = [];

  for (var c = 0; c < allQuestions.length; c++) {
    var q = allQuestions[c];
    if (!q || excludeSet[q.id]) continue;
    var diff = normalizeQuestionDifficulty(q.difficulty);
    if (diff === 'easy') easy.push(q);
    else if (diff === 'hard') hard.push(q);
    else medium.push(q);
  }

  shuffleInPlace(easy);
  shuffleInPlace(medium);
  shuffleInPlace(hard);

  var easyCount = Math.round(questionsNeeded * 2 / 7);
  var hardCount = Math.round(questionsNeeded * 2 / 7);
  var mediumCount = questionsNeeded - easyCount - hardCount;

  var selected: any[] = [];
  for (var ei = 0; ei < easyCount && ei < easy.length; ei++) selected.push(easy[ei]);
  for (var mi = 0; mi < mediumCount && mi < medium.length; mi++) selected.push(medium[mi]);
  for (var hi = 0; hi < hardCount && hi < hard.length; hi++) selected.push(hard[hi]);

  var allAvailable = easy.concat(medium).concat(hard);
  var usedIds: {[key: string]: boolean} = {};
  for (var s = 0; s < selected.length; s++) {
    usedIds[selected[s].id] = true;
  }

  while (selected.length < questionsNeeded && allAvailable.length > 0) {
    var candidate = allAvailable.shift();
    if (candidate && !usedIds[candidate.id]) {
      selected.push(candidate);
      usedIds[candidate.id] = true;
    }
  }

  if (allowSyntheticFallback) {
    while (selected.length < questionsNeeded) {
      selected.push({
        id: 'fallback_' + selected.length,
        category: category,
        difficulty: 'medium',
        questionText: 'Fallback question ' + (selected.length + 1),
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctIndex: 0,
        explanation: 'Not enough questions in pool.',
        sourceReference: '',
        questionType: 'mcq',
      });
    }
  }

  shuffleInPlace(selected);
  return selected;
}

// Select questions from cache (fast, no DB queries during match)
export function selectQuestions(
  category: string,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  excludeIds?: string[],
  questionsNeededOverride?: number,
  allowSyntheticFallback: boolean = true
): any[] {
  category = normalizeCategory(category);
  var now = Date.now();
  var cache = getQuestionCache()[category];
  var questionsNeeded = (typeof questionsNeededOverride === 'number' && questionsNeededOverride > 0)
    ? questionsNeededOverride
    : getQuestionsPerMatch(nk, logger);
  var minRequired = Math.max(QUESTION_CACHE_MIN_SIZE, questionsNeeded);

  // Refresh cache if needed (expired or empty)
  if (!cache || cache.questions.length < minRequired ||
      (now - cache.lastRefresh) > QUESTION_CACHE_TTL_MS) {
    refreshQuestionCache(category, nk, logger);
    cache = getQuestionCache()[category];
  }

  // If cache is still empty, use fallback
  if (!cache || cache.questions.length === 0) {
    if (allowSyntheticFallback) {
      logger.warn('Question cache empty for ' + category + ', using fallback questions');
      return buildFallbackQuestions(category, questionsNeeded, 'Cache empty - using fallback question.');
    }
    logger.warn('Question cache empty for ' + category + ', returning no questions');
    return [];
  }

  // Select random questions from cache, excluding recently seen ones
  var excludeSet: {[key: string]: boolean} = {};
  if (excludeIds && excludeIds.length > 0) {
    for (var e = 0; e < excludeIds.length; e++) {
      excludeSet[excludeIds[e]] = true;
    }
  }

  // Separate by difficulty
  var easy: any[] = [];
  var medium: any[] = [];
  var hard: any[] = [];

  for (var c = 0; c < cache.questions.length; c++) {
    var q = cache.questions[c];
    if (excludeSet[q.id]) continue;
    if (q.difficulty === 'easy') easy.push(q);
    else if (q.difficulty === 'hard') hard.push(q);
    else medium.push(q);
  }

  // Shuffle each pool
  shuffleInPlace(easy);
  shuffleInPlace(medium);
  shuffleInPlace(hard);

  // Pick questions proportionally (roughly 2:3:2 ratio scaled to questionsNeeded)
  var easyCount = Math.round(questionsNeeded * 2 / 7);
  var hardCount = Math.round(questionsNeeded * 2 / 7);
  var mediumCount = questionsNeeded - easyCount - hardCount;

  var selected: any[] = [];
  for (var ei = 0; ei < easyCount && ei < easy.length; ei++) selected.push(easy[ei]);
  for (var mi = 0; mi < mediumCount && mi < medium.length; mi++) selected.push(medium[mi]);
  for (var hi = 0; hi < hardCount && hi < hard.length; hi++) selected.push(hard[hi]);

  // Fill remaining from any pool if we don't have enough
  var allAvailable = easy.concat(medium).concat(hard);
  var usedIds: {[key: string]: boolean} = {};
  for (var s = 0; s < selected.length; s++) {
    usedIds[selected[s].id] = true;
  }

  while (selected.length < questionsNeeded && allAvailable.length > 0) {
    var candidate = allAvailable.shift();
    if (candidate && !usedIds[candidate.id]) {
      selected.push(candidate);
      usedIds[candidate.id] = true;
    }
  }

  // Final fallback if still not enough
  if (allowSyntheticFallback) {
    while (selected.length < questionsNeeded) {
      selected.push({
        id: 'fallback_' + selected.length,
        category: category,
        difficulty: 'medium',
        questionText: 'Fallback question ' + (selected.length + 1),
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctIndex: 0,
        explanation: 'Not enough questions in cache.',
        sourceReference: '',
        questionType: 'mcq',
      });
    }
  }

  // Shuffle final selection
  shuffleInPlace(selected);

  return selected;
}

export function updateRecentQuestions(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  category: string,
  questionIds: string[]
): void {
  try {
    var reads: nkruntime.StorageReadRequest[] = [
      { collection: 'player_data', key: 'recent_questions', userId: userId },
    ];
    var results = nk.storageRead(reads);
    var recent = results[0]?.value || {};
    var existing: string[] = recent[category] || [];

    var newIds: string[] = [];
    for (var i = 0; i < questionIds.length; i++) {
      var id = questionIds[i];
      if (id && id.indexOf('fallback_') !== 0 && id.indexOf('error_fallback_') !== 0) {
        newIds.push(id);
      }
    }

    var seen: {[key: string]: boolean} = {};
    for (var j = 0; j < newIds.length; j++) {
      seen[newIds[j]] = true;
    }

    var merged: string[] = newIds.slice();
    for (var k = 0; k < existing.length; k++) {
      if (!seen[existing[k]]) {
        merged.push(existing[k]);
      }
    }

    if (merged.length > QUESTION_HISTORY_MAX) {
      merged = merged.slice(0, QUESTION_HISTORY_MAX);
    }

    recent[category] = merged;

    nk.storageWrite([
      {
        collection: 'player_data',
        key: 'recent_questions',
        userId: userId,
        value: recent,
        permissionRead: 0,
        permissionWrite: 0,
      },
    ]);
  } catch (error) {
    logger.warn('Could not update recent questions for ' + userId + ': ' + error);
  }
}

export function updateQuestionAnalytics(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  state: any
): void {
  if (!state.questions || state.questions.length === 0) {
    return;
  }

  var players: any[] = [];
  for (var oderId in state.players) {
    if (!state.players[oderId].isBot) {
      players.push(state.players[oderId]);
    }
  }

  if (players.length === 0) {
    return;
  }

  var questionCount = typeof state.questionsAsked === 'number'
    ? state.questionsAsked
    : state.questions.length;
  for (var i = 0; i < questionCount; i++) {
    var question = state.questions[i];
    if (!question.id || question.id.indexOf('fallback_') === 0 || question.id.indexOf('error_fallback_') === 0) {
      continue;
    }
    var shownCount = players.length;
    var correctCount = 0;
    var totalTime = 0;
    var answerCount = 0;

    for (var j = 0; j < players.length; j++) {
      var player = players[j];
      var answer = null;
      for (var k = 0; k < player.answers.length; k++) {
        if (player.answers[k].questionIndex === i) {
          answer = player.answers[k];
          break;
        }
      }

      if (answer && !answer.flagged) {
        totalTime += answer.timeMs;
        answerCount++;
        if (answer.correct) {
          correctCount++;
        }
      } else {
        totalTime += state.timePerQuestionMs || GAME_CONFIG.TIME_PER_QUESTION_MS;
        answerCount++;
      }
    }

    if (answerCount === 0) {
      continue;
    }

    var avgTimeMs = Math.round(totalTime / answerCount);
    try {
      nk.sqlExec(
        `UPDATE questions
         SET times_shown = times_shown + $1,
             times_correct = times_correct + $2,
             average_answer_time_ms = CASE
               WHEN times_shown + $1 > 0
               THEN ((average_answer_time_ms * times_shown) + ($3 * $1)) / (times_shown + $1)
               ELSE $3
             END
         WHERE id = $4`,
        [shownCount, correctCount, avgTimeMs, question.id]
      );
    } catch (error) {
      logger.warn('Failed to update question analytics for ' + question.id + ': ' + error);
    }
  }
}

export function handleAnswer(
  state: any,
  playerId: string,
  answerIndex: number,
  tick: number,
  dispatcher: nkruntime.MatchDispatcher,
  logger: nkruntime.Logger
): void {
  // Anti-cheat: Verify game phase
  if (state.phase !== 'question') {
    logger.warn('ANTICHEAT: Player ' + playerId + ' tried to answer outside question phase');
    return;
  }

  var player = state.players[playerId];
  if (!player) {
    logger.warn('ANTICHEAT: Unknown player ' + playerId + ' tried to answer');
    return;
  }

  // Anti-cheat: Prevent multiple answers
  if (player.answeredCurrent) {
    logger.warn('ANTICHEAT: Player ' + playerId + ' tried to answer multiple times');
    return;
  }

  var question = state.questions[state.currentQuestionIndex];
  if (!question) {
    logger.error('No question found at index ' + state.currentQuestionIndex);
    return;
  }
  var optionsCount = Array.isArray(question.options) ? question.options.length : 0;

  // Anti-cheat: Validate answer index is within valid range for this question
  if (typeof answerIndex !== 'number' || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= optionsCount) {
    logger.warn('ANTICHEAT: Player ' + playerId + ' sent invalid answer index: ' + answerIndex + ' (options=' + optionsCount + ')');
    player.suspiciousActions = (player.suspiciousActions || 0) + 1;
    return;
  }

  var timeMs = ((tick - state.questionStartTick) / state.tickRate) * 1000;

  // Anti-cheat: Answer too fast (inhuman speed)
  if (timeMs < GAME_CONFIG.MIN_ANSWER_TIME_MS) {
    logger.warn('ANTICHEAT: Player ' + playerId + ' answered too quickly (' + timeMs + 'ms)');
    player.suspiciousActions = (player.suspiciousActions || 0) + 1;
    // Still mark as answered but with no score
    player.answeredCurrent = true;
    player.streak = 0;
    player.answers.push({
      questionIndex: state.currentQuestionIndex,
      answerIndex: answerIndex,
      timeMs: timeMs,
      correct: false,
      flagged: 'too_fast',
      scoreGained: 0,
      streakAfter: player.streak,
    });
    // Include answerIndex for Beneficial Knowledge-style real-time opponent answer highlighting
    dispatcher.broadcastMessage(11, JSON.stringify({ userId: playerId, answerIndex: answerIndex }));
    return;
  }

  // Anti-cheat: Answer after time expired (with small tolerance for latency)
  var timePerQuestionMs = state.timePerQuestionMs || GAME_CONFIG.TIME_PER_QUESTION_MS;
  var maxTimeMs = timePerQuestionMs + 2000; // 2 second tolerance
  if (timeMs > maxTimeMs) {
    logger.warn('ANTICHEAT: Player ' + playerId + ' answered after time expired (' + timeMs + 'ms)');
    player.answeredCurrent = true;
    player.streak = 0;
    player.answers.push({
      questionIndex: state.currentQuestionIndex,
      answerIndex: answerIndex,
      timeMs: timeMs,
      correct: false,
      flagged: 'too_slow',
      scoreGained: 0,
      streakAfter: player.streak,
    });
    // Include answerIndex for Beneficial Knowledge-style real-time opponent answer highlighting
    dispatcher.broadcastMessage(11, JSON.stringify({ userId: playerId, answerIndex: answerIndex }));
    return;
  }

  var correct = answerIndex === question.correctIndex;
  var newStreak = correct ? player.streak + 1 : 0;
  var baseScore = correct ? 100 : 0;
  var speedBonus = correct ? calculateSpeedBonus(timeMs) : 0;
  var streakBonus = correct ? calculateStreakBonus(newStreak) : 0;
  var totalScore = baseScore + speedBonus + streakBonus;

  player.answeredCurrent = true;
  player.score += totalScore;
  player.streak = newStreak;
  player.answers.push({
    questionIndex: state.currentQuestionIndex,
    answerIndex: answerIndex,
    timeMs: timeMs,
    correct: correct,
    scoreGained: totalScore,
    streakAfter: newStreak,
  });

  logger.info('Player ' + playerId + ' answered: ' + (correct ? 'correct' : 'wrong') + ', +' + totalScore + ' points (time: ' + Math.round(timeMs) + 'ms)');
  // Include answerIndex for Beneficial Knowledge-style real-time opponent answer highlighting
  dispatcher.broadcastMessage(11, JSON.stringify({ userId: playerId, answerIndex: answerIndex }));
}

export function calculateSpeedBonus(timeMs: number): number {
  var timeSeconds = timeMs / 1000;
  if (timeSeconds <= 3) return 50;
  if (timeSeconds <= 5) return 35;
  if (timeSeconds <= 8) return 20;
  if (timeSeconds <= 10) return 10;
  return 0;
}

export function calculateStreakBonus(streak: number): number {
  if (streak >= 5) return 60;
  if (streak >= 4) return 40;
  if (streak >= 3) return 25;
  if (streak >= 2) return 10;
  return 0;
}

export function startQuestion(
  state: any,
  tick: number,
  dispatcher: nkruntime.MatchDispatcher,
  logger: nkruntime.Logger
): void {
  if (typeof state.matchStartTick !== 'number') {
    state.matchStartTick = tick;
  }
  state.phase = 'question';
  state.questionStartTick = tick;
  state.phaseStartTick = tick;
  state.questionsAsked = Math.max(state.questionsAsked || 0, state.currentQuestionIndex + 1);

  for (var oderId in state.players) {
    state.players[oderId].answeredCurrent = false;
  }

  logger.info('Starting question ' + (state.currentQuestionIndex + 1));

  var questionPayload = buildQuestionPayload(state, tick);
  state.lastQuestion = questionPayload;
  state.lastReveal = null;
  scheduleBotAnswer(state, tick, logger);
  dispatcher.broadcastMessage(20, JSON.stringify(questionPayload));
}

export function revealAnswer(
  state: any,
  tick: number,
  dispatcher: nkruntime.MatchDispatcher,
  logger: nkruntime.Logger
): void {
  // Normalize unanswered players so reveal/stats/history are consistent.
  markTimeoutAnswers(state, tick);
  state.phase = 'reveal';
  state.phaseStartTick = tick;
  logger.info('Revealing answer for question ' + (state.currentQuestionIndex + 1));

  var revealPayload = buildRevealPayload(state);
  state.lastReveal = revealPayload;
  dispatcher.broadcastMessage(21, JSON.stringify(revealPayload));
}

export function endMatch(
  state: any,
  tick: number,
  dispatcher: nkruntime.MatchDispatcher,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  forcedWinnerId?: string | null,
  endReason?: string
): void {
  if (state.phase === 'ended' && state.lastMatchEnd) {
    logger.info('Skipping duplicate endMatch for already-ended match ' + (state.matchId || 'unknown'));
    return;
  }
  if (state.ending) {
    logger.warn('Skipping re-entrant endMatch while prior end operation is still running for match ' + (state.matchId || 'unknown'));
    return;
  }

  state.ending = true;
  try {
    state.phase = 'ended';
    state.phaseStartTick = tick;

  var players = [];
  for (var oderId in state.players) {
    players.push(state.players[oderId]);
  }
  var realPlayers = [];
  for (var i = 0; i < players.length; i++) {
    if (!players[i].isBot) {
      realPlayers.push(players[i]);
    }
  }
  var hasBot = realPlayers.length !== players.length;

  var winnerId: string | null = null;
  var forcedWinnerSpecified = typeof forcedWinnerId !== 'undefined';
  if (typeof forcedWinnerId !== 'undefined') {
    winnerId = forcedWinnerId;
  } else if (players.length === 1) {
    winnerId = players[0].oderId;
  } else if (players.length === 2) {
    if (players[0].score > players[1].score) winnerId = players[0].oderId;
    else if (players[1].score > players[0].score) winnerId = players[1].oderId;
  }

  // If the match completed while a player is disconnected, treat it as a forfeit.
  // This prevents a disconnected/leaving player from winning (and gaining MMR) simply because the match finished quickly.
  // HOWEVER: skip this override when the match ended naturally (all questions were answered).
  // In that case the scores reflect real gameplay and the higher-scoring player earned the win.
  var allQuestionsAnswered = (typeof state.questionsAsked === 'number' ? state.questionsAsked : 0) >= (state.questions || []).length;
  if (!forcedWinnerSpecified && players.length === 2 && !hasBot && !allQuestionsAnswered) {
    var connectedPlayers: any[] = [];
    for (var i = 0; i < players.length; i++) {
      if (players[i] && players[i].connected) {
        connectedPlayers.push(players[i]);
      }
    }
    if (connectedPlayers.length === 1) {
      winnerId = connectedPlayers[0].oderId;
      endReason = 'forfeit';
    } else if (connectedPlayers.length === 0) {
      winnerId = null;
      endReason = 'all_disconnected';
    }
  }

  if (!forcedWinnerSpecified && state.practiceMode === true && players.length === 1) {
    if (endReason === 'all_disconnected' || endReason === 'waiting_timeout') {
      winnerId = null;
    }
  }

  logger.info('Match ended. Winner: ' + (winnerId || 'draw') + (endReason ? ' (' + endReason + ')' : ''));

  // Calculate player stats
  var finalScores: {[key: string]: number} = {};
  var playerStats: {[key: string]: any} = {};
  for (var i = 0; i < players.length; i++) {
    var p = players[i];
    finalScores[p.oderId] = p.score;
    var correctAnswers = 0;
    for (var j = 0; j < p.answers.length; j++) {
      if (p.answers[j].correct) correctAnswers++;
    }
    var totalTime = 0;
    for (var j = 0; j < p.answers.length; j++) {
      totalTime += p.answers[j].timeMs;
    }
    playerStats[p.oderId] = {
      correctAnswers: correctAnswers,
      totalAnswers: p.answers.length,
      averageTime: p.answers.length > 0 ? totalTime / p.answers.length : 0,
    };
  }

  var questionIds: string[] = [];
  var askedCount = typeof state.questionsAsked === 'number'
    ? state.questionsAsked
    : (state.questions || []).length;
  for (var qi = 0; qi < askedCount; qi++) {
    questionIds.push(state.questions[qi].id);
  }

  // Calculate MMR changes for ranked/normal modes
  var mmrChanges: {[key: string]: {
    oldMmr: number;
    newMmr: number;
    change: number;
    newRankTier: string;
    globalOldMmr?: number;
    globalNewMmr?: number;
    globalChange?: number;
    updateFailed?: boolean;
  }} = {};
  var practiceSummary: any = null;

  if (players.length === 2 && !hasBot) {
    var player1 = players[0];
    var player2 = players[1];

    // If everyone disconnected, do not adjust MMR or W/L counters.
    // Treat as a canceled match to avoid rewarding/leaking MMR when no one finished.
    if (endReason === 'all_disconnected') {
      mmrChanges[player1.oderId] = {
        oldMmr: player1.mmr,
        newMmr: player1.mmr,
        change: 0,
        globalOldMmr: player1.globalMmr || player1.mmr,
        globalNewMmr: player1.globalMmr || player1.mmr,
        globalChange: 0,
        newRankTier: getRankTierKeyForMmr(nk, logger, player1.globalMmr || player1.mmr),
      };
      mmrChanges[player2.oderId] = {
        oldMmr: player2.mmr,
        newMmr: player2.mmr,
        change: 0,
        globalOldMmr: player2.globalMmr || player2.mmr,
        globalNewMmr: player2.globalMmr || player2.mmr,
        globalChange: 0,
        newRankTier: getRankTierKeyForMmr(nk, logger, player2.globalMmr || player2.mmr),
      };
    } else
    // Skip MMR updates for friend challenge matches (no boosting allowed)
    if (state.isChallenge) {
      logger.info('Skipping MMR update for friend challenge match');

      // Report zero MMR changes for challenge matches
      mmrChanges[player1.oderId] = {
        oldMmr: player1.mmr,
        newMmr: player1.mmr,  // No change
        change: 0,
        globalOldMmr: player1.globalMmr || player1.mmr,
        globalNewMmr: player1.globalMmr || player1.mmr,
        globalChange: 0,
        newRankTier: getRankTierKeyForMmr(nk, logger, player1.globalMmr || player1.mmr),
      };
      mmrChanges[player2.oderId] = {
        oldMmr: player2.mmr,
        newMmr: player2.mmr,  // No change
        change: 0,
        globalOldMmr: player2.globalMmr || player2.mmr,
        globalNewMmr: player2.globalMmr || player2.mmr,
        globalChange: 0,
        newRankTier: getRankTierKeyForMmr(nk, logger, player2.globalMmr || player2.mmr),
      };
    } else {
      // Normal MMR calculation for non-challenge matches

      // Determine scores (1 = win, 0.5 = draw, 0 = loss)
      var score1 = winnerId === player1.oderId ? 1 : (winnerId === null ? 0.5 : 0);
      var score2 = winnerId === player2.oderId ? 1 : (winnerId === null ? 0.5 : 0);

      var player1Global = {
        rating: player1.globalMmr || player1.mmr,
        rd: player1.globalRd || player1.rd,
        volatility: player1.globalVolatility || player1.volatility,
      };
      var player2Global = {
        rating: player2.globalMmr || player2.mmr,
        rd: player2.globalRd || player2.rd,
        volatility: player2.globalVolatility || player2.volatility,
      };
      var mmrFloor = getMmrFloor(nk, logger);
      var mmrCeiling = getMmrCeiling(nk, logger);
      var rankedMmrDelta = GAME_CONFIG.RANKED_FIXED_MMR_DELTA;
      var hasStartedQuestionRound = typeof state.questionsAsked === 'number' && state.questionsAsked > 0;
      var isForfeitPenaltyReason = endReason === 'surrender' || endReason === 'forfeit';
      var applyForfeitPenalty = winnerId !== null
        && !state.isTournament
        && hasStartedQuestionRound
        && isForfeitPenaltyReason;
      var player1Delta = rankedMmrDelta;
      var player2Delta = rankedMmrDelta;
      var penalizedLoserId: string | null = null;
      if (applyForfeitPenalty) {
        var lossMultiplier = Number.isFinite(GAME_CONFIG.RANKED_FORFEIT_LOSS_MULTIPLIER)
          ? Math.max(1, Math.floor(Math.abs(GAME_CONFIG.RANKED_FORFEIT_LOSS_MULTIPLIER)))
          : 1;
        if (winnerId === player1.oderId) {
          player2Delta = rankedMmrDelta * lossMultiplier;
          penalizedLoserId = player2.oderId;
        } else if (winnerId === player2.oderId) {
          player1Delta = rankedMmrDelta * lossMultiplier;
          penalizedLoserId = player1.oderId;
        } else {
          applyForfeitPenalty = false;
        }
      }
      if (applyForfeitPenalty && penalizedLoserId) {
        logger.info(
          'Applying ranked forfeit penalty: reason='
          + endReason
          + ', winner='
          + winnerId
          + ', loser='
          + penalizedLoserId
          + ', baseDelta='
          + rankedMmrDelta
          + ', loserDelta='
          + (penalizedLoserId === player1.oderId ? player1Delta : player2Delta)
          + ', questionsAsked='
          + (typeof state.questionsAsked === 'number' ? state.questionsAsked : 0)
          + ', isTournament='
          + (state.isTournament === true)
        );
      } else {
        logger.info(
          'Applying fixed ranked MMR delta: +/-'
          + rankedMmrDelta
          + ' (draw = 0, floor='
          + mmrFloor
          + ', ceiling='
          + mmrCeiling
          + ')'
        );
      }

      // Calculate category ratings
      var categoryResult1 = calculateFixedMmrRating(
        { rating: player1.mmr, rd: player1.rd, volatility: player1.volatility },
        score1,
        logger,
        player1Delta,
        mmrFloor,
        mmrCeiling
      );

      var categoryResult2 = calculateFixedMmrRating(
        { rating: player2.mmr, rd: player2.rd, volatility: player2.volatility },
        score2,
        logger,
        player2Delta,
        mmrFloor,
        mmrCeiling
      );

      // Calculate global ratings
      var globalResult1 = calculateFixedMmrRating(
        player1Global,
        score1,
        logger,
        player1Delta,
        mmrFloor,
        mmrCeiling
      );

      var globalResult2 = calculateFixedMmrRating(
        player2Global,
        score2,
        logger,
        player2Delta,
        mmrFloor,
        mmrCeiling
      );

      // Update both players' MMR with transaction-like behavior
      // Track success for logging purposes
      var player1UpdateSuccess = updatePlayerMmr(nk, logger, player1.oderId, state.category, categoryResult1.newRating, globalResult1.newRating, score1 === 1, score1 === 0.5);
      var player2UpdateSuccess = updatePlayerMmr(nk, logger, player2.oderId, state.category, categoryResult2.newRating, globalResult2.newRating, score2 === 1, score2 === 0.5);

      // Log any failures
      if (!player1UpdateSuccess) {
        logger.error('MMR update FAILED for player 1 (' + player1.username + '), match may be inconsistent');
      }
      if (!player2UpdateSuccess) {
        logger.error('MMR update FAILED for player 2 (' + player2.username + '), match may be inconsistent');
      }

      // Set MMR changes for client regardless of storage success (client will refresh)
      mmrChanges[player1.oderId] = {
        // Category MMR (for the specific category played)
        oldMmr: player1.mmr,
        newMmr: player1UpdateSuccess ? categoryResult1.newRating.rating : player1.mmr,
        change: player1UpdateSuccess ? categoryResult1.ratingChange : 0,
        // Global MMR (shown on global leaderboard)
        globalOldMmr: player1Global.rating,
        globalNewMmr: player1UpdateSuccess ? globalResult1.newRating.rating : player1Global.rating,
        globalChange: player1UpdateSuccess ? globalResult1.ratingChange : 0,
        // Rank tier based on global MMR
      newRankTier: getRankTierKeyForMmr(nk, logger, player1UpdateSuccess ? globalResult1.newRating.rating : player1Global.rating),
      // Include storage failure flag for client awareness
      updateFailed: !player1UpdateSuccess,
    };

    mmrChanges[player2.oderId] = {
      // Category MMR (for the specific category played)
      oldMmr: player2.mmr,
      newMmr: player2UpdateSuccess ? categoryResult2.newRating.rating : player2.mmr,
      change: player2UpdateSuccess ? categoryResult2.ratingChange : 0,
      // Global MMR (shown on global leaderboard)
      globalOldMmr: player2Global.rating,
      globalNewMmr: player2UpdateSuccess ? globalResult2.newRating.rating : player2Global.rating,
      globalChange: player2UpdateSuccess ? globalResult2.ratingChange : 0,
      // Rank tier based on global MMR
      newRankTier: getRankTierKeyForMmr(nk, logger, player2UpdateSuccess ? globalResult2.newRating.rating : player2Global.rating),
      // Include storage failure flag for client awareness
      updateFailed: !player2UpdateSuccess,
    };

      if (player1UpdateSuccess && player2UpdateSuccess) {
        logger.info('MMR updated - ' + player1.username + ': ' + player1.mmr + ' -> ' + categoryResult1.newRating.rating +
          ', ' + player2.username + ': ' + player2.mmr + ' -> ' + categoryResult2.newRating.rating);
      } else {
        logger.warn('MMR update had failures - P1 success: ' + player1UpdateSuccess + ', P2 success: ' + player2UpdateSuccess);
      }
    } // End of else (non-challenge match MMR calculation)

    // Save match history for both players (both challenge and normal matches)
    var timestamp = Date.now();
    var matchId = state.matchId || 'match_' + timestamp;
    var historyScore1 = winnerId === player1.oderId ? 1 : (winnerId === null ? 0.5 : 0);
    var historyScore2 = winnerId === player2.oderId ? 1 : (winnerId === null ? 0.5 : 0);

    // Player 1's match record
    saveMatchHistory(nk, logger, player1.oderId, {
      matchId: matchId,
      category: state.category,
      opponentId: player2.oderId,
      opponentName: player2.username,
      playerScore: player1.score,
      opponentScore: player2.score,
      result: historyScore1 === 1 ? 'win' : (historyScore1 === 0.5 ? 'draw' : 'loss'),
      mmrChange: mmrChanges[player1.oderId]?.change || 0,
      newMmr: mmrChanges[player1.oderId]?.newMmr || player1.mmr,
      correctAnswers: playerStats[player1.oderId].correctAnswers,
      totalQuestions: askedCount,
      timestamp: timestamp,
      isFriendChallenge: state.isChallenge || false,
      isBotMatch: false,
    });

    // Player 2's match record
    saveMatchHistory(nk, logger, player2.oderId, {
      matchId: matchId,
      category: state.category,
      opponentId: player1.oderId,
      opponentName: player1.username,
      playerScore: player2.score,
      opponentScore: player1.score,
      result: historyScore2 === 1 ? 'win' : (historyScore2 === 0.5 ? 'draw' : 'loss'),
      mmrChange: mmrChanges[player2.oderId]?.change || 0,
      newMmr: mmrChanges[player2.oderId]?.newMmr || player2.mmr,
      correctAnswers: playerStats[player2.oderId].correctAnswers,
      totalQuestions: askedCount,
      timestamp: timestamp,
      isFriendChallenge: state.isChallenge || false,
      isBotMatch: false,
    });

    // Persist match history for admin analytics (PvP only)
    if (!hasBot && players.length === 2) {
      var ticksPerSecond = state.tickRate || 10;
      var durationSeconds = typeof state.matchStartTick === 'number'
        ? Math.max(0, Math.round((tick - state.matchStartTick) / ticksPerSecond))
        : 0;
      var questionsData = buildMatchQuestionsData(state, player1, player2);
      var p1GlobalOld = mmrChanges[player1.oderId]?.globalOldMmr || player1.globalMmr || player1.mmr;
      var p1GlobalNew = mmrChanges[player1.oderId]?.globalNewMmr || p1GlobalOld;
      var p2GlobalOld = mmrChanges[player2.oderId]?.globalOldMmr || player2.globalMmr || player2.mmr;
      var p2GlobalNew = mmrChanges[player2.oderId]?.globalNewMmr || p2GlobalOld;

      recordMatchHistorySql(nk, logger, {
        matchId: matchId,
        category: state.category,
        player1Id: player1.oderId,
        player2Id: player2.oderId,
        player1Score: player1.score,
        player2Score: player2.score,
        winnerId: winnerId,
        player1MmrBefore: p1GlobalOld,
        player2MmrBefore: p2GlobalOld,
        player1MmrAfter: p1GlobalNew,
        player2MmrAfter: p2GlobalNew,
        questionsData: questionsData,
        durationSeconds: durationSeconds,
      });
    }

    // Update performance stats for both players (even for challenge matches - for accuracy tracking)
    var isPerfect1 = winnerId === player1.oderId && playerStats[player1.oderId].correctAnswers === askedCount;
    var isPerfect2 = winnerId === player2.oderId && playerStats[player2.oderId].correctAnswers === askedCount;
    var isChallengeMatch = state.isChallenge || false;
    var player1ChallengeWin = isChallengeMatch && winnerId === player1.oderId;
    var player2ChallengeWin = isChallengeMatch && winnerId === player2.oderId;

    updatePlayerStats(
      nk, logger, player1.oderId,
      playerStats[player1.oderId].correctAnswers,
      playerStats[player1.oderId].totalAnswers,
      playerStats[player1.oderId].averageTime,
      player1.streak,
      isPerfect1,
      player1ChallengeWin
    );

    updatePlayerStats(
      nk, logger, player2.oderId,
      playerStats[player2.oderId].correctAnswers,
      playerStats[player2.oderId].totalAnswers,
      playerStats[player2.oderId].averageTime,
      player2.streak,
      isPerfect2,
      player2ChallengeWin
    );

    updateRecentQuestions(nk, logger, player1.oderId, state.category, questionIds);
    updateRecentQuestions(nk, logger, player2.oderId, state.category, questionIds);
  } else if (state.practiceMode === true && players.length >= 1 && !hasBot && realPlayers.length >= 1) {
    var practicePlayer = realPlayers[0];
    var practiceCategoryMmr = practicePlayer.mmr;
    var practiceGlobalMmr = practicePlayer.globalMmr || practicePlayer.mmr;
    var practicePlayerStats = playerStats[practicePlayer.oderId] || {
      correctAnswers: 0,
      totalAnswers: 0,
      averageTime: 0,
    };

    mmrChanges[practicePlayer.oderId] = {
      oldMmr: practiceCategoryMmr,
      newMmr: practiceCategoryMmr,
      change: 0,
      globalOldMmr: practiceGlobalMmr,
      globalNewMmr: practiceGlobalMmr,
      globalChange: 0,
      newRankTier: getRankTierKeyForMmr(nk, logger, practiceGlobalMmr),
    };

    var practiceSessionAccuracy = askedCount > 0
      ? Math.round((practicePlayerStats.correctAnswers / askedCount) * 100)
      : 0;
    var practiceTotals = updatePracticeStats(
      nk,
      logger,
      practicePlayer.oderId,
      state.category,
      practicePlayer.score || 0,
      practicePlayerStats.correctAnswers || 0,
      askedCount
    );

    practiceSummary = {
      session: {
        score: practicePlayer.score || 0,
        correctAnswers: practicePlayerStats.correctAnswers || 0,
        totalQuestions: askedCount,
        accuracy: practiceSessionAccuracy,
      },
      overall: {
        sessionsPlayed: practiceTotals.overallSessionsPlayed,
        averageAccuracy: practiceTotals.overallAverageAccuracy,
      },
      category: {
        categoryKey: state.category,
        bestScore: practiceTotals.categoryBestScore,
        sessionsPlayed: practiceTotals.categorySessionsPlayed,
        averageAccuracy: practiceTotals.categoryAverageAccuracy,
      },
    };

    updateRecentQuestions(nk, logger, practicePlayer.oderId, state.category, questionIds);
  } else if (players.length >= 1 && hasBot && realPlayers.length >= 1) {
    var humanPlayer = realPlayers[0];
    var botPlayer = null;
    for (var b = 0; b < players.length; b++) {
      if (players[b].isBot) {
        botPlayer = players[b];
        break;
      }
    }

    var humanScore = winnerId === humanPlayer.oderId ? 1 : (winnerId === null ? 0.5 : 0);
    var humanResult: 'win' | 'draw' | 'loss' = humanScore === 1 ? 'win' : (humanScore === 0.5 ? 'draw' : 'loss');
    var humanMmr = humanPlayer.mmr;
    var humanGlobalMmr = humanPlayer.globalMmr || humanPlayer.mmr;

    mmrChanges[humanPlayer.oderId] = {
      // Category MMR (no change for bot matches)
      oldMmr: humanMmr,
      newMmr: humanMmr,
      change: 0,
      // Global MMR (no change for bot matches)
      globalOldMmr: humanGlobalMmr,
      globalNewMmr: humanGlobalMmr,
      globalChange: 0,
      newRankTier: getRankTierKeyForMmr(nk, logger, humanGlobalMmr),
    };

    if (botPlayer) {
      mmrChanges[botPlayer.oderId] = {
        oldMmr: botPlayer.mmr,
        newMmr: botPlayer.mmr,
        change: 0,
        globalOldMmr: botPlayer.mmr,
        globalNewMmr: botPlayer.mmr,
        globalChange: 0,
        newRankTier: getRankTierKeyForMmr(nk, logger, botPlayer.mmr),
      };
    }

    var botTimestamp = Date.now();
    var botMatchId = state.matchId || 'match_' + botTimestamp;

    saveMatchHistory(nk, logger, humanPlayer.oderId, {
      matchId: botMatchId,
      category: state.category,
      opponentId: botPlayer ? botPlayer.oderId : 'bot',
      opponentName: botPlayer ? botPlayer.username : 'Bot',
      playerScore: humanPlayer.score,
      opponentScore: botPlayer ? botPlayer.score : 0,
      result: humanResult,
      mmrChange: 0,
      newMmr: humanMmr,
      correctAnswers: playerStats[humanPlayer.oderId].correctAnswers,
      totalQuestions: askedCount,
      timestamp: botTimestamp,
      isBotMatch: true,
    });

    var isPerfectHuman = winnerId === humanPlayer.oderId && playerStats[humanPlayer.oderId].correctAnswers === askedCount;
    updatePlayerStats(
      nk, logger, humanPlayer.oderId,
      playerStats[humanPlayer.oderId].correctAnswers,
      playerStats[humanPlayer.oderId].totalAnswers,
      playerStats[humanPlayer.oderId].averageTime,
      humanPlayer.streak,
      isPerfectHuman,
      false
    );

    updateRecentQuestions(nk, logger, humanPlayer.oderId, state.category, questionIds);
  }

  updateQuestionAnalytics(nk, logger, state);

  var matchEndPayload: any = {
    winnerId: winnerId,
    finalScores: finalScores,
    mmrChanges: mmrChanges,
    playerStats: playerStats,
    category: state.category,
    reason: endReason || 'completed',
    mode: state.practiceMode === true ? 'practice' : 'ranked',
  };
  if (practiceSummary) {
    matchEndPayload.practiceSummary = practiceSummary;
  }
  state.lastMatchEnd = matchEndPayload;
  dispatcher.broadcastMessage(30, JSON.stringify(matchEndPayload));

  // Auto-report tournament match result if this is a tournament match
  if (state.isTournament && state.tournamentMatchId) {
    var tournamentPlayer1UserId = state.tournamentPlayer1UserId || null;
    var tournamentPlayer2UserId = state.tournamentPlayer2UserId || null;
    var tournamentPlayer1IsBot = state.tournamentPlayer1IsBot === true || state.tournamentPlayer1IsBot === 'true';
    var tournamentPlayer2IsBot = state.tournamentPlayer2IsBot === true || state.tournamentPlayer2IsBot === 'true';

    var botParticipants: any[] = [];
    for (var bp = 0; bp < players.length; bp++) {
      if (players[bp] && players[bp].isBot) {
        botParticipants.push(players[bp]);
      }
    }

    var getScoreByUserId = function(userId: string | null): number | null {
      if (!userId) return null;
      if (!state.players || !state.players[userId]) return null;
      return Number(state.players[userId].score) || 0;
    };

    var getBotScore = function(preferredBotId: string | null): number | null {
      if (!botParticipants.length) return null;
      if (preferredBotId) {
        for (var bi = 0; bi < botParticipants.length; bi++) {
          if (botParticipants[bi].oderId === preferredBotId) {
            return Number(botParticipants[bi].score) || 0;
          }
        }
      }
      return Number(botParticipants[0].score) || 0;
    };

    var runtimeBotId = state.botId || null;
    var player1Score = 0;
    var player2Score = 0;

    var mappedPlayer1Score = getScoreByUserId(tournamentPlayer1UserId);
    if (mappedPlayer1Score !== null) {
      player1Score = mappedPlayer1Score;
    } else if (tournamentPlayer1IsBot) {
      var botScore1 = getBotScore(runtimeBotId);
      player1Score = botScore1 !== null ? botScore1 : 0;
    } else if (players.length > 0) {
      player1Score = Number(players[0].score) || 0;
    }

    var mappedPlayer2Score = getScoreByUserId(tournamentPlayer2UserId);
    if (mappedPlayer2Score !== null) {
      player2Score = mappedPlayer2Score;
    } else if (tournamentPlayer2IsBot) {
      var botScore2 = getBotScore(runtimeBotId);
      player2Score = botScore2 !== null ? botScore2 : 0;
    } else if (players.length > 1) {
      player2Score = Number(players[1].score) || 0;
    }

    var reportWinnerId: string | null = null;
    if (winnerId) {
      var winnerPlayer = state.players ? state.players[winnerId] : null;
      if (winnerPlayer) {
        reportWinnerId = winnerPlayer.isBot ? null : winnerId;
      } else if (winnerId === tournamentPlayer1UserId || winnerId === tournamentPlayer2UserId) {
        reportWinnerId = winnerId;
      }
    }

    autoReportTournamentResult(nk, logger, state.tournamentMatchId, reportWinnerId, player1Score, player2Score);
  }

    // Clear game state for real players so they can challenge again
    for (var i = 0; i < realPlayers.length; i++) {
      clearPlayerGameState(nk, realPlayers[i].oderId);
    }
  } finally {
    state.ending = false;
  }
}

