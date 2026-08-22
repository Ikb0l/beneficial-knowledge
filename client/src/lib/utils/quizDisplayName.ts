export const QUIZ_DISPLAY_NAME_MAX_LENGTH = 8;

export function formatQuizDisplayName(
  value: string | null | undefined,
  fallback = 'Player'
): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const source = normalized || fallback;
  if (source.length <= QUIZ_DISPLAY_NAME_MAX_LENGTH) {
    return source;
  }
  return source.slice(0, QUIZ_DISPLAY_NAME_MAX_LENGTH);
}

