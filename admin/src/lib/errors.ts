function sanitizeErrorMessage(message: string): string {
  if (!message) return 'Unknown error';
  const normalized = message.toLowerCase();
  if (normalized.includes('rpc function not found')) {
    return 'This admin feature is unavailable on the current server build.';
  }
  return message;
}

export function getErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return sanitizeErrorMessage(err);
  if (err instanceof Error) return sanitizeErrorMessage(err.message || 'Unknown error');

  if (typeof err === 'object') {
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.length > 0) return sanitizeErrorMessage(maybeMessage);

    const maybeError = (err as { error?: unknown }).error;
    if (typeof maybeError === 'string' && maybeError.length > 0) return sanitizeErrorMessage(maybeError);
  }

  try {
    return sanitizeErrorMessage(JSON.stringify(err));
  } catch {
    return 'Unknown error';
  }
}
