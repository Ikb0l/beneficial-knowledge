// useBracketLayout - Calculate positions for bracket visualization
import { useMemo } from 'react';
import type { TournamentMatch, TournamentParticipant } from '../stores/tournamentStore';

// Dimensions for bracket layout - larger for better readability
const MATCH_WIDTH = 220;           // Was 180 (+22%)
const MATCH_WIDTH_MOBILE = 160;    // Was 120 (+33%)
const MATCH_HEIGHT = 100;          // Was 72 (+39%)
const MATCH_HEIGHT_MOBILE = 80;    // Was 52 (+54%)
const ROUND_GAP = 56;              // Was 48
const ROUND_GAP_MOBILE = 32;       // Was 24
const VERTICAL_GAP = 20;           // Was 16
const VERTICAL_GAP_MOBILE = 12;    // Was 8

export interface MatchPosition {
  matchId: string;
  match: TournamentMatch;
  round: number;
  position: number; // vertical position within round (0-indexed)
  x: number;        // horizontal offset (px)
  y: number;        // vertical offset (px)
  width: number;
  height: number;
  nextMatchId: string | null; // for drawing connectors
  feedsIntoPosition: 'top' | 'bottom' | null; // which slot in next match
}

export interface BracketLayoutResult {
  positions: MatchPosition[];
  totalWidth: number;
  totalHeight: number;
  roundLabels: { round: number; x: number; label: string }[];
}

interface LayoutOptions {
  isMobile: boolean;
  bracketType: 'winners' | 'losers' | 'grand_final';
}

/**
 * Get round label based on round number and total rounds
 */
function getRoundLabel(
  round: number,
  totalRounds: number,
  bracketType: string,
  isDoubleElim: boolean
): string {
  if (bracketType === 'grand_final') {
    return 'Grand Final';
  }

  if (bracketType === 'losers') {
    return `LR${round}`;
  }

  // Winners bracket
  const roundsFromFinal = totalRounds - round;
  if (roundsFromFinal === 0) {
    return isDoubleElim ? 'WB Final' : 'Final';
  }
  if (roundsFromFinal === 1) {
    return isDoubleElim ? 'WB Semi' : 'Semifinal';
  }
  if (roundsFromFinal === 2) {
    return isDoubleElim ? 'WB Quarter' : 'Quarterfinal';
  }
  return `Round ${round}`;
}

/**
 * Find which match a winner advances to
 */
function findNextMatch(
  match: TournamentMatch,
  allMatches: TournamentMatch[]
): { matchId: string; position: 'top' | 'bottom' } | null {
  // For standard brackets, look for the next round match.
  // The match number pattern: in round R with N matches, match M advances to:
  // round R+1, match ceil(M/2), position is top if M is odd, bottom if even.
  //
  // Double-elimination losers bracket has a different progression:
  // - Odd losers rounds advance 1:1 into the next (even) losers round.
  // - Even losers rounds merge 2:1 into the next (odd) losers round.

  const bracketType = match.bracketType || 'winners';

  // Losers bracket: odd rounds advance 1:1, even rounds advance 2:1
  if (bracketType === 'losers') {
    const nextRound = match.roundNumber + 1;
    const isOddRound = match.roundNumber % 2 === 1;

    const nextMatchNumber = isOddRound
      ? match.matchNumber
      : Math.ceil(match.matchNumber / 2);

    // When moving from odd -> even round, the winner typically occupies the "top" slot,
    // with the incoming loser from winners bracket in the bottom slot.
    const feedsIntoPosition = isOddRound
      ? 'top'
      : (match.matchNumber % 2 === 1 ? 'top' : 'bottom');

    const nextMatch = allMatches.find(
      m => m.bracketType === 'losers' &&
           m.roundNumber === nextRound &&
           m.matchNumber === nextMatchNumber
    );

    if (nextMatch) {
      return { matchId: nextMatch.id, position: feedsIntoPosition as 'top' | 'bottom' };
    }
  }

  if (bracketType === 'grand_final') {
    if ((match.matchNumber || 1) === 1) {
      const resetMatch = allMatches.find(
        m =>
          m.bracketType === 'grand_final' &&
          m.matchNumber === 2 &&
          m.roundNumber > match.roundNumber
      );
      if (resetMatch) {
        return { matchId: resetMatch.id, position: 'top' };
      }
    }
    return null;
  }

  const nextRound = match.roundNumber + 1;
  const nextMatchNumber = Math.ceil(match.matchNumber / 2);
  const feedsIntoPosition = match.matchNumber % 2 === 1 ? 'top' : 'bottom';

  const nextMatch = allMatches.find(
    m => (m.bracketType || 'winners') === bracketType &&
         m.roundNumber === nextRound &&
         m.matchNumber === nextMatchNumber
  );

  if (nextMatch) {
    return { matchId: nextMatch.id, position: feedsIntoPosition as 'top' | 'bottom' };
  }

  // For winners bracket final in double elimination, check grand final
  if (bracketType === 'winners') {
    const grandFinal = allMatches.find(m => m.bracketType === 'grand_final');
    if (grandFinal && !allMatches.some(
      m => (m.bracketType || 'winners') === 'winners' && m.roundNumber > match.roundNumber
    )) {
      return { matchId: grandFinal.id, position: 'top' };
    }
  }

  // For losers bracket final, check grand final
  if (bracketType === 'losers') {
    const grandFinal = allMatches.find(m => m.bracketType === 'grand_final');
    if (grandFinal && !allMatches.some(
      m => m.bracketType === 'losers' && m.roundNumber > match.roundNumber
    )) {
      return { matchId: grandFinal.id, position: 'bottom' };
    }
  }

  return null;
}

/**
 * Calculate bracket layout for a specific bracket type (winners/losers/grand_final)
 */
function calculateBracketTypeLayout(
  matches: TournamentMatch[],
  allMatches: TournamentMatch[],
  options: LayoutOptions,
  startY: number = 0
): BracketLayoutResult {
  const { isMobile, bracketType } = options;

  const matchWidth = isMobile ? MATCH_WIDTH_MOBILE : MATCH_WIDTH;
  const matchHeight = isMobile ? MATCH_HEIGHT_MOBILE : MATCH_HEIGHT;
  const roundGap = isMobile ? ROUND_GAP_MOBILE : ROUND_GAP;
  const verticalGap = isMobile ? VERTICAL_GAP_MOBILE : VERTICAL_GAP;

  if (matches.length === 0) {
    return { positions: [], totalWidth: 0, totalHeight: 0, roundLabels: [] };
  }

  // Group by round
  const roundsMap: Record<number, TournamentMatch[]> = {};
  matches.forEach(match => {
    const round = match.roundNumber;
    if (!roundsMap[round]) roundsMap[round] = [];
    roundsMap[round].push(match);
  });

  // Sort rounds and matches within rounds
  const rounds = Object.keys(roundsMap).map(Number).sort((a, b) => a - b);
  rounds.forEach(round => {
    roundsMap[round].sort((a, b) => a.matchNumber - b.matchNumber);
  });

  const isDoubleElim = allMatches.some(m => m.bracketType === 'losers');

  // Calculate positions
  const positions: MatchPosition[] = [];
  const roundLabels: { round: number; x: number; label: string }[] = [];

  // Track inbound edges so later rounds can be positioned by their feeders.
  const inbound = new Map<string, MatchPosition[]>();

  rounds.forEach((round, roundIndex) => {
    const matchesInRound = roundsMap[round];
    const x = roundIndex * (matchWidth + roundGap);

    // Generate round label
    roundLabels.push({
      round,
      x: x + matchWidth / 2,
      label: bracketType === 'grand_final' && roundIndex > 0
        ? 'Grand Final Reset'
        : getRoundLabel(round, rounds[rounds.length - 1], bracketType, isDoubleElim),
    });

    matchesInRound.forEach((match, matchIndex) => {
      // Round 1: evenly space matches.
      // Later rounds: place a match between its inbound feeders.
      let y = startY + matchIndex * (matchHeight + verticalGap);
      if (roundIndex > 0) {
        const incoming = inbound.get(match.id) || [];
        if (incoming.length > 0) {
          const sumY = incoming.reduce((acc, pos) => acc + pos.y, 0);
          y = sumY / incoming.length;
        }
      }

      const nextMatchInfo = findNextMatch(match, allMatches);
      const pos: MatchPosition = {
        matchId: match.id,
        match,
        round,
        position: matchIndex,
        x,
        y,
        width: matchWidth,
        height: matchHeight,
        nextMatchId: nextMatchInfo?.matchId || null,
        feedsIntoPosition: nextMatchInfo?.position || null,
      };

      positions.push(pos);

      if (pos.nextMatchId) {
        const existing = inbound.get(pos.nextMatchId) || [];
        existing.push(pos);
        inbound.set(pos.nextMatchId, existing);
      }
    });
  });

  // Calculate total dimensions
  const totalWidth = rounds.length * (matchWidth + roundGap) - roundGap;
  const allYPositions = positions.map(p => p.y);
  const minY = Math.min(...allYPositions);
  const maxY = Math.max(...allYPositions) + matchHeight;
  const totalHeight = maxY - minY;

  return { positions, totalWidth, totalHeight, roundLabels };
}

/**
 * Calculate user's path through the bracket
 */
export function calculateUserPath(
  matches: TournamentMatch[],
  participants: TournamentParticipant[],
  currentUserId: string | null
): Set<string> {
  if (!currentUserId) return new Set();

  const userPath = new Set<string>();

  // Find user's participant ID
  const userParticipant = participants.find(p => p.userId === currentUserId);
  if (!userParticipant) return userPath;

  // Find all matches where user participated
  const userMatches = matches.filter(match => {
    if (match.player1Id === userParticipant.id || match.player2Id === userParticipant.id) {
      return true;
    }
    const p1UserId = match.player1UserId || participants.find(p => p.id === match.player1Id)?.userId;
    const p2UserId = match.player2UserId || participants.find(p => p.id === match.player2Id)?.userId;
    return p1UserId === currentUserId || p2UserId === currentUserId;
  });

  const matchById = new Map<string, TournamentMatch>();
  matches.forEach(m => matchById.set(m.id, m));

  // Add all user matches and their subsequent path (forward only on wins)
  userMatches.forEach(match => {
    userPath.add(match.id);

    // If user won, trace path forward
    const winnerByParticipant = !!match.winnerId && match.winnerId === userParticipant.id;
    const winnerUserId = match.winnerUserId ||
      (match.winnerId ? participants.find(p => p.id === match.winnerId)?.userId : null);

    if (winnerByParticipant || winnerUserId === currentUserId) {
      // Find next match using the same progression rules as the layout connectors.
      let currentMatch: TournamentMatch | null = match;
      let safety = 0;
      while (currentMatch && safety < matches.length + 5) {
        const nextInfo = findNextMatch(currentMatch, matches);
        if (!nextInfo) break;
        const next = matchById.get(nextInfo.matchId) || null;
        if (!next) break;
        userPath.add(next.id);
        currentMatch = next;
        safety++;
      }
    }
  });

  return userPath;
}

/**
 * Main hook for bracket layout calculation
 */
export function useBracketLayout(
  matches: TournamentMatch[],
  participants: TournamentParticipant[],
  format: 'single_elimination' | 'double_elimination',
  currentUserId: string | null,
  isMobile: boolean = false
): {
  winnersLayout: BracketLayoutResult;
  losersLayout: BracketLayoutResult;
  grandFinalLayout: BracketLayoutResult;
  userPath: Set<string>;
  totalWidth: number;
  totalHeight: number;
} {
  return useMemo(() => {
    const matchHeight = isMobile ? MATCH_HEIGHT_MOBILE : MATCH_HEIGHT;

    // Separate matches by bracket type
    const winnersMatches = matches.filter(m => m.bracketType === 'winners' || !m.bracketType);
    const losersMatches = matches.filter(m => m.bracketType === 'losers');
    const grandFinalMatches = matches.filter(m => m.bracketType === 'grand_final');

    // Calculate winners bracket layout
    const winnersLayout = calculateBracketTypeLayout(
      winnersMatches,
      matches,
      { isMobile, bracketType: 'winners' },
      0
    );

    const showLosersBracket = format === 'double_elimination';
    const emptyLayout: BracketLayoutResult = { positions: [], totalWidth: 0, totalHeight: 0, roundLabels: [] };

    // Calculate losers bracket layout (positioned below winners)
    const losersStartY = showLosersBracket ? winnersLayout.totalHeight + 48 : 0; // Gap between brackets
    const losersLayout = showLosersBracket
      ? calculateBracketTypeLayout(
        losersMatches,
        matches,
        { isMobile, bracketType: 'losers' },
        losersStartY
      )
      : emptyLayout;

    // Calculate grand final layout (to the right, vertically centered)
    const grandFinalStartY = winnersLayout.totalHeight / 2 - (matchHeight / 2);
    const grandFinalLayout = calculateBracketTypeLayout(
      grandFinalMatches,
      matches,
      { isMobile, bracketType: 'grand_final' },
      grandFinalStartY
    );

    // Adjust grand final X position to be after both brackets
    const maxBracketWidth = Math.max(winnersLayout.totalWidth, losersLayout.totalWidth);
    grandFinalLayout.positions.forEach(pos => {
      pos.x = maxBracketWidth + (isMobile ? ROUND_GAP_MOBILE : ROUND_GAP);
    });
    grandFinalLayout.roundLabels.forEach(label => {
      label.x = maxBracketWidth + (isMobile ? ROUND_GAP_MOBILE : ROUND_GAP) + (isMobile ? MATCH_WIDTH_MOBILE : MATCH_WIDTH) / 2;
    });

    // Calculate user path
    const userPath = calculateUserPath(matches, participants, currentUserId);

    // Calculate total dimensions
    const totalWidth = maxBracketWidth +
      (grandFinalMatches.length > 0 ? (isMobile ? ROUND_GAP_MOBILE : ROUND_GAP) + (isMobile ? MATCH_WIDTH_MOBILE : MATCH_WIDTH) : 0);

    const totalHeight = Math.max(
      winnersLayout.totalHeight,
      showLosersBracket && losersLayout.totalHeight > 0 ? losersStartY + losersLayout.totalHeight : 0,
      grandFinalLayout.totalHeight
    );

    return {
      winnersLayout,
      losersLayout,
      grandFinalLayout,
      userPath,
      totalWidth,
      totalHeight,
    };
  }, [matches, participants, format, currentUserId, isMobile]);
}

export default useBracketLayout;
