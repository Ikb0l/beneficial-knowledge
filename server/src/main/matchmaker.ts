import { getCategoriesFromDb, getDefaultCategoryKey, getMatchmakingMmrTolerance, getMmrCeiling, getMmrFloor, getPlayableCategoryKeys, isValidCategoryFromDb } from './config';
import { GAME_CONFIG, normalizeCategory } from './constants';
import { setPlayerGameState } from './friends';

// MATCHMAKER
// ============================================================================

export function onMatchmakerMatched(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  matches: nkruntime.MatchmakerResult[]
): string {
  // matches is an array of MatchmakerResult; each result has a users[] list
  if (!matches || !Array.isArray(matches) || matches.length === 0) {
    logger.warn('onMatchmakerMatched: empty match result');
    return '';
  }

  var rawUsers: any[] = [];
  var firstResult: any = matches[0] as any;
  if (firstResult && Array.isArray(firstResult.users)) {
    var groupedResults: any[] = matches as unknown as any[];
    for (var r = 0; r < groupedResults.length; r++) {
      var groupUsers = groupedResults[r]?.users;
      if (Array.isArray(groupUsers)) {
        for (var u = 0; u < groupUsers.length; u++) {
          rawUsers.push(groupUsers[u]);
        }
      }
    }
  } else {
    // Fallback for legacy shape where matches is a flat list of users
    rawUsers = matches as unknown as any[];
  }

  if (rawUsers.length < 2) {
    logger.warn('onMatchmakerMatched: need at least 2 users, got ' + rawUsers.length);
    return '';
  }

  var uniqueMatches: any[] = [];
  var seenUsers: {[key: string]: boolean} = {};
  for (var i = 0; i < rawUsers.length; i++) {
    var match = rawUsers[i] as any;
    var presence = match.presence || match;
    var userId = presence?.userId || presence?.user_id || '';
    if (!userId || seenUsers[userId]) {
      continue;
    }
    seenUsers[userId] = true;
    uniqueMatches.push(match);
  }
  if (uniqueMatches.length < 2) {
    logger.warn('onMatchmakerMatched: duplicate userIds detected, skipping match creation');
    return '';
  }
  if (uniqueMatches.length > 2) {
    // Defensive fallback: this handler is a 1v1 flow. If runtime delivers
    // extra entries, keep deterministic first two to avoid invalid oversized matches.
    logger.warn('onMatchmakerMatched: expected 2 players, got ' + uniqueMatches.length + ' (using first two)');
    uniqueMatches = uniqueMatches.slice(0, 2);
  }

  logger.debug('Creating match for ' + uniqueMatches.length + ' players');

  // Get parent category and multi-subcategory intent from users' string properties
  var parentCategory = '';
  var parentCategories: {[key: string]: boolean} = {};
  var userSelectionByUserId: {[key: string]: { allInCategory: boolean; subcategories: string[] }} = {};
  for (var c = 0; c < uniqueMatches.length; c++) {
    var user = uniqueMatches[c] as any;
    var presenceForSelection = user.presence || user;
    var selectionUserId = presenceForSelection?.userId || presenceForSelection?.user_id || '';
    if (!selectionUserId) continue;
    var props = user.properties || {};
    var stringProps = props.string_properties || props.stringProperties || user.stringProperties || user.string_properties || {};
    var userParent = normalizeCategory(String(stringProps.category || props.category || user.category || ''));

    var serializedSubs = String(stringProps.subcategories || props.subcategories || user.subcategories || '').trim();
    var parsedSubs: string[] = [];
    if (serializedSubs) {
      var rawSubs = serializedSubs.split(',');
      for (var si = 0; si < rawSubs.length; si++) {
        var normalized = normalizeCategory(rawSubs[si] || '');
        if (normalized) parsedSubs.push(normalized);
      }
    }
    var legacySub = normalizeCategory(String(
      stringProps.subcategory || stringProps.subCategory || props.subcategory || props.subCategory || user.subcategory || user.subCategory || ''
    ));
    if (legacySub) parsedSubs.push(legacySub);
    var dedupSubs: {[key: string]: boolean} = {};
    var normalizedSubs: string[] = [];
    for (var ns = 0; ns < parsedSubs.length; ns++) {
      var subKey = parsedSubs[ns];
      if (subKey && !dedupSubs[subKey]) {
        dedupSubs[subKey] = true;
        normalizedSubs.push(subKey);
      }
    }

    var allInRaw = stringProps.all_in_category || stringProps.allInCategory || props.all_in_category || props.allInCategory || user.all_in_category || user.allInCategory;
    var allInCategory = allInRaw === true || allInRaw === '1' || allInRaw === 1 || String(allInRaw || '').toLowerCase() === 'true';
    if (!allInCategory && normalizedSubs.length === 0) {
      // Legacy behavior: no explicit subcategory means "all in parent category".
      allInCategory = true;
    }

    if (userParent) {
      parentCategories[userParent] = true;
      if (!parentCategory) {
        parentCategory = userParent;
      }
    }

    userSelectionByUserId[selectionUserId] = {
      allInCategory: allInCategory,
      subcategories: normalizedSubs,
    };
  }

  var parentKeys = Object.keys(parentCategories);
  if (parentKeys.length > 1) {
    logger.warn('onMatchmakerMatched: parent category mismatch in matched users: ' + parentKeys.join(', ') + ' (using first)');
    parentCategory = parentKeys[0] || parentCategory;
  }

  parentCategory = normalizeCategory(parentCategory);
  if (!parentCategory || !isValidCategoryFromDb(nk, logger, parentCategory)) {
    var fallbackParent = getDefaultCategoryKey(nk, logger);
    if (!fallbackParent) {
      logger.error('onMatchmakerMatched: no valid categories available');
      return '';
    }
    parentCategory = fallbackParent;
  }

  // Determine match category by overlapping selected subcategory sets.
  var dbCategories = getCategoriesFromDb(nk, logger);
  var matchCategory = parentCategory;
  var subcategoryForValidation: string | null = null;
  var parentObj = dbCategories[parentCategory];
  var parentChildren: string[] = [];
  if (parentObj && parentObj.id) {
    for (var key in dbCategories) {
      var candidate = dbCategories[key];
      if (candidate && candidate.parentId && String(candidate.parentId) === String(parentObj.id)) {
        var childKey = normalizeCategory(String(candidate.categoryKey || key || ''));
        if (childKey) parentChildren.push(childKey);
      }
    }
  }
  if (parentChildren.length === 0) {
    parentChildren = [parentCategory];
  }
  parentChildren = getPlayableCategoryKeys(nk, logger, parentChildren);
  if (parentChildren.length === 0) {
    logger.error('onMatchmakerMatched: no playable categories available for parent=' + parentCategory);
    return '';
  }
  var parentChildSet: {[key: string]: boolean} = {};
  for (var pc = 0; pc < parentChildren.length; pc++) {
    parentChildSet[parentChildren[pc]] = true;
  }

  var effectiveSelections: string[][] = [];
  var hasAnyExplicitSubSelection = false;
  for (var es = 0; es < uniqueMatches.length; es++) {
    var userForSelection = uniqueMatches[es] as any;
    var userPresence = userForSelection.presence || userForSelection;
    var selectionUserIdForEffective = userPresence?.userId || userPresence?.user_id || '';
    var selection = userSelectionByUserId[selectionUserIdForEffective] || { allInCategory: true, subcategories: [] };
    var validSubs: string[] = [];
    for (var vs = 0; vs < selection.subcategories.length; vs++) {
      var sub = selection.subcategories[vs];
      if (parentChildSet[sub]) validSubs.push(sub);
    }
    if (!selection.allInCategory && validSubs.length > 0) {
      hasAnyExplicitSubSelection = true;
      effectiveSelections.push(validSubs);
    } else {
      effectiveSelections.push(parentChildren.slice());
    }
  }

  var overlap = effectiveSelections.length > 0 ? effectiveSelections[0].slice() : parentChildren.slice();
  for (var oi = 1; oi < effectiveSelections.length; oi++) {
    var candidateSet = effectiveSelections[oi];
    var candidateLookup: {[key: string]: boolean} = {};
    for (var ci = 0; ci < candidateSet.length; ci++) {
      candidateLookup[candidateSet[ci]] = true;
    }
    var nextOverlap: string[] = [];
    for (var ov = 0; ov < overlap.length; ov++) {
      if (candidateLookup[overlap[ov]]) nextOverlap.push(overlap[ov]);
    }
    overlap = nextOverlap;
  }

  if (overlap.length === 0) {
    logger.info('onMatchmakerMatched: no overlapping subcategories for parent=' + parentCategory + ', skipping match creation');
    return '';
  }

  var overlapIndex = Math.floor(Math.random() * overlap.length);
  matchCategory = overlap[overlapIndex] || parentCategory;
  if (hasAnyExplicitSubSelection && matchCategory !== parentCategory) {
    subcategoryForValidation = matchCategory;
  }

  var mmrTolerance = getMatchmakingMmrTolerance(nk, logger);
  var mmrFloor = getMmrFloor(nk, logger);
  var mmrCeiling = getMmrCeiling(nk, logger);
  var globalByUser: {[key: string]: any} = {};
  var categoryByUser: {[key: string]: any} = {};
  var haveStored = true;

  try {
    var reads: nkruntime.StorageReadRequest[] = [];
    for (var r = 0; r < uniqueMatches.length; r++) {
      var matchEntry = uniqueMatches[r] as any;
      var pres = matchEntry.presence || matchEntry;
      var uid = pres?.userId || pres?.user_id;
      if (uid) {
        reads.push({ collection: 'player_data', key: 'global_mmr', userId: uid });
        reads.push({ collection: 'player_data', key: 'category_mmr', userId: uid });
      }
    }
    if (reads.length > 0) {
      var results = nk.storageRead(reads);
      for (var s = 0; s < results.length; s++) {
        var res = results[s];
        if (res.key === 'global_mmr') {
          globalByUser[res.userId] = res.value;
        } else if (res.key === 'category_mmr') {
          categoryByUser[res.userId] = res.value;
        }
      }
    }
  } catch (error) {
    haveStored = false;
    logger.warn('onMatchmakerMatched: failed to read stored MMR for validation: ' + error);
  }

  for (var v = 0; v < uniqueMatches.length; v++) {
    var matchUser = uniqueMatches[v] as any;
    var presence = matchUser.presence || matchUser;
    var userId = presence?.userId || presence?.user_id;
    if (!userId) {
      logger.warn('onMatchmakerMatched: missing userId in match user');
      return '';
    }

    // Debug: log the structure to understand property access
    logger.debug('onMatchmakerMatched: matchUser keys: ' + Object.keys(matchUser).join(', '));
    logger.debug('onMatchmakerMatched: matchUser.properties: ' + JSON.stringify(matchUser.properties));

    var props = matchUser.properties || {};
    // Try multiple property paths to find MMR
    var numericProps = props.numeric_properties || props.numericProperties || matchUser.numericProperties || matchUser.numeric_properties || props || {};
    var providedMmr = Number(numericProps.mmr);

    // If still not found, check if MMR is directly in properties
    if (!Number.isFinite(providedMmr) && props.mmr !== undefined) {
      providedMmr = Number(props.mmr);
    }
    if (!Number.isFinite(providedMmr) && matchUser.mmr !== undefined) {
      providedMmr = Number(matchUser.mmr);
    }

    if (!Number.isFinite(providedMmr)) {
      logger.warn('onMatchmakerMatched: invalid MMR property for user ' + userId + ', numericProps: ' + JSON.stringify(numericProps) + ' (using stored MMR)');
      providedMmr = GAME_CONFIG.STARTING_MMR;
    }
    if (providedMmr < mmrFloor || providedMmr > mmrCeiling) {
      logger.warn('onMatchmakerMatched: MMR out of bounds for user ' + userId + ': ' + providedMmr + ' (clamping)');
      providedMmr = Math.min(Math.max(providedMmr, mmrFloor), mmrCeiling);
    }
    if (haveStored) {
      var storedGlobal = globalByUser[userId]?.mmr;
      var storedCategory = subcategoryForValidation ? categoryByUser[userId]?.[matchCategory]?.mmr : null;
      var globalMmr = Number.isFinite(storedGlobal) ? storedGlobal : GAME_CONFIG.STARTING_MMR;
      var categoryMmr = Number.isFinite(storedCategory) ? storedCategory : GAME_CONFIG.STARTING_MMR;
      var deltaGlobal = Math.abs(providedMmr - globalMmr);
      var deltaCategory = subcategoryForValidation ? Math.abs(providedMmr - categoryMmr) : 0;
      if (deltaGlobal > mmrTolerance && (!subcategoryForValidation || deltaCategory > mmrTolerance)) {
        logger.warn('onMatchmakerMatched: MMR mismatch for user ' + userId +
          ' (provided=' + providedMmr + ', global=' + globalMmr + (subcategoryForValidation ? ', category=' + categoryMmr : '') + ')');
      }
    }
  }

  var firstPresence = uniqueMatches[0]?.presence || uniqueMatches[0];
  var secondPresence = uniqueMatches[1]?.presence || uniqueMatches[1];
  var player1Id = firstPresence?.userId || firstPresence?.user_id || '';
  var player2Id = secondPresence?.userId || secondPresence?.user_id || '';
  var matchId = nk.matchCreate('quiz_match', {
    category: matchCategory,
    parentCategory: parentCategory,
    player1: player1Id,
    player2: player2Id,
  });
  logger.info('Match created: ' + matchId + ' for parent=' + parentCategory + ' category=' + matchCategory + ' with ' + uniqueMatches.length + ' players');

  // Set game state to 'matched' for all players (for challenge safety checks)
  for (var i = 0; i < uniqueMatches.length; i++) {
    var matchedUser = uniqueMatches[i] as any;
    var presence = matchedUser.presence || matchedUser;
    var userId = presence?.userId || presence?.user_id;
    if (userId) {
      setPlayerGameState(nk, userId, 'matched');
    }
  }

  return matchId;
}

// ============================================================================
