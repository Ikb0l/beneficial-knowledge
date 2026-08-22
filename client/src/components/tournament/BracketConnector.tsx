// BracketConnector - SVG connector lines between bracket matches
import { motion } from 'framer-motion';
import type { MatchPosition } from '../../hooks/useBracketLayout';


export interface BracketConnectorProps {
  from: MatchPosition;
  to: MatchPosition;
  isHighlighted: boolean;
  isWinnerPath: boolean;
}

export function BracketConnector({ from, to, isHighlighted, isWinnerPath }: BracketConnectorProps) {
  const fromX = from.x + from.width;
  const fromY = from.y + from.height / 2;
  const toX = to.x;
  const toY = from.feedsIntoPosition === 'top'
    ? to.y + to.height * 0.25
    : to.y + to.height * 0.75;
  const midX = fromX + (toX - fromX) / 2;

  const path = `M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`;

  let strokeColor: string;
  let strokeWidth: number;
  let glowFilter: string | undefined;

  if (isWinnerPath) {
    strokeColor = 'url(#grad-winner)';
    strokeWidth = 2.5;
    glowFilter = 'url(#glow-winner)';
  } else if (isHighlighted) {
    strokeColor = 'url(#grad-highlight)';
    strokeWidth = 2.5;
    glowFilter = 'url(#glow-highlight)';
  } else {
    strokeColor = 'rgba(255,255,255,0.12)';
    strokeWidth = 1.5;
  }

  return (
    <motion.path
      d={path}
      fill="none"
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      filter={glowFilter}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    />
  );
}

export interface BracketConnectorsProps {
  positions: MatchPosition[];
  userPath: Set<string>;
  completedMatches: Set<string>;
}

export function BracketConnectors({ positions, userPath, completedMatches }: BracketConnectorsProps) {
  const positionMap = new Map<string, MatchPosition>();
  positions.forEach(pos => positionMap.set(pos.matchId, pos));

  return (
    <>
      <defs>
        <linearGradient id="grad-winner" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.5" />
          <stop offset="50%" stopColor="#4ade80" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="grad-highlight" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
          <stop offset="50%" stopColor="#67e8f9" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.4" />
        </linearGradient>
        <filter id="glow-winner">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-highlight">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {positions.map(fromPos => {
        if (!fromPos.nextMatchId) return null;
        const toPos = positionMap.get(fromPos.nextMatchId);
        if (!toPos) return null;
        const isHighlighted = userPath.has(fromPos.matchId) && userPath.has(fromPos.nextMatchId);
        const isWinnerPath = completedMatches.has(fromPos.matchId);
        return (
          <BracketConnector
            key={`conn-${fromPos.matchId}-${fromPos.nextMatchId}`}
            from={fromPos} to={toPos}
            isHighlighted={isHighlighted}
            isWinnerPath={isWinnerPath && !isHighlighted}
          />
        );
      })}
    </>
  );
}

export default BracketConnector;
