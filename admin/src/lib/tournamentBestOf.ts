export const BEST_OF_OPTIONS = [1, 3, 5] as const;

type BestOfValue = typeof BEST_OF_OPTIONS[number];

export interface BestOfByRoundConfig {
  opening: BestOfValue;
  winners: BestOfValue[];
  losers: BestOfValue[];
  grand_final: BestOfValue;
  default: BestOfValue;
}

function normalizeBestOf(value: unknown, fallback: BestOfValue = 1): BestOfValue {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (BEST_OF_OPTIONS.includes(num as BestOfValue)) {
    return num as BestOfValue;
  }
  return fallback;
}

function toByteArray(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    return value.map((next) => next as number);
  }
  if (!value || typeof value !== 'object') {
    return null;
  }

  const arrayLike = value as Record<string, unknown> & { length?: unknown };
  const lengthNum = Number(arrayLike.length);
  if (Number.isInteger(lengthNum) && lengthNum > 0 && lengthNum <= 1024 * 1024) {
    const out: number[] = [];
    for (let i = 0; i < lengthNum; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(arrayLike, String(i))) {
        return null;
      }
      out.push(Number(arrayLike[String(i)]));
    }
    return out;
  }

  const keys = Object.keys(arrayLike);
  if (keys.length === 0 || keys.some((key) => !/^\d+$/.test(key))) {
    return null;
  }
  keys.sort((a, b) => Number(a) - Number(b));
  if (Number(keys[0]) !== 0) {
    return null;
  }

  const out: number[] = [];
  for (let idx = 0; idx < keys.length; idx += 1) {
    if (Number(keys[idx]) !== idx) {
      return null;
    }
    out.push(Number(arrayLike[keys[idx]]));
  }
  return out;
}

function coerceFiniteNumber(value: unknown): number | null {
  const num = Number(value);
  if (Number.isFinite(num)) {
    return num;
  }
  if (value && typeof value === 'object') {
    try {
      const primitive = typeof (value as { valueOf?: () => unknown }).valueOf === 'function'
        ? (value as { valueOf: () => unknown }).valueOf()
        : value;
      const fromValueOf = Number(primitive);
      if (Number.isFinite(fromValueOf)) {
        return fromValueOf;
      }
    } catch {
      // Ignore and continue fallback coercions.
    }
    try {
      const asString = String(value);
      if (/^-?\d+(\.\d+)?$/.test(asString)) {
        const fromString = Number(asString);
        if (Number.isFinite(fromString)) {
          return fromString;
        }
      }
    } catch {
      // Ignore and return null below.
    }
  }
  return null;
}

function tryNormalizeSerializable(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function parseJsonFromByteArray(value: unknown): unknown | null {
  const bytes = toByteArray(value);
  if (!bytes || bytes.length === 0) {
    return null;
  }

  let text = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const nextRaw = coerceFiniteNumber(bytes[i]);
    if (nextRaw === null || nextRaw < 0 || nextRaw > 255) {
      return null;
    }
    const next = nextRaw;
    text += String.fromCharCode(Math.floor(next));
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parsePossiblyEncodedJson(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (Array.isArray(value) || typeof value === 'object') {
    const decoded = parseJsonFromByteArray(value);
    if (decoded !== null) {
      return decoded;
    }
    const normalized = tryNormalizeSerializable(value);
    if (normalized !== null && normalized !== undefined) {
      const decodedNormalized = parseJsonFromByteArray(normalized);
      if (decodedNormalized !== null) {
        return decodedNormalized;
      }
      if (typeof normalized === 'string') {
        try {
          return JSON.parse(normalized);
        } catch {
          return normalized;
        }
      }
      return normalized;
    }
    return value;
  }
  return value;
}

function readRoundValue(raw: unknown, index: number): unknown {
  if (Array.isArray(raw)) {
    return raw[index];
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const usesZeroBased = Object.prototype.hasOwnProperty.call(obj, '0');
    const key = usesZeroBased ? String(index) : String(index + 1);
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return obj[key];
    }
  }
  return undefined;
}

function normalizeRounds(raw: unknown, length: number, fallback: BestOfValue): BestOfValue[] {
  return Array.from({ length }, (_, idx) => normalizeBestOf(readRoundValue(raw, idx), fallback));
}

export function buildBestOfConfig(
  bracketSize: number,
  format: string,
  seedingMode: string,
  input?: unknown
): BestOfByRoundConfig {
  const totalRounds = Math.ceil(Math.log2(bracketSize));
  const isDouble = format === 'double_elimination';
  const totalLosersRounds = isDouble ? Math.max(0, (totalRounds - 1) * 2) : 0;
  const base: BestOfByRoundConfig = {
    opening: 1,
    winners: Array.from({ length: totalRounds }, () => 1),
    losers: Array.from({ length: totalLosersRounds }, () => 1),
    grand_final: isDouble ? 5 : 1,
    default: 1,
  };

  const parsed = parsePossiblyEncodedJson(input);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    if (seedingMode !== 'random_opening_round') {
      base.opening = base.winners[0] || base.default;
    }
    return base;
  }

  const source = parsed as Record<string, unknown>;
  const defaultValue = normalizeBestOf(source.default, base.default);
  const config: BestOfByRoundConfig = {
    opening: normalizeBestOf(source.opening ?? source.opening_round, base.opening),
    winners: normalizeRounds(source.winners, totalRounds, defaultValue),
    losers: normalizeRounds(source.losers, totalLosersRounds, defaultValue),
    grand_final: normalizeBestOf(source.grand_final ?? source.grandFinal, base.grand_final),
    default: defaultValue,
  };

  if (seedingMode !== 'random_opening_round') {
    config.opening = config.winners[0] || config.default;
  }

  return config;
}
