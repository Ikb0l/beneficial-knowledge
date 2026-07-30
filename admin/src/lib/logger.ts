/**
 * Logger utility for the admin panel.
 *
 * In development: All logs are shown in console
 * In production: Only errors are logged
 */

const isDevelopment = import.meta.env.DEV;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const formatMessage = (level: LogLevel, prefix: string, args: unknown[]): unknown[] => {
  const timestamp = new Date().toISOString();
  const levelStr = level.toUpperCase().padEnd(5);
  return [`[${timestamp}] [${levelStr}]${prefix ? ` [${prefix}]` : ''}`, ...args];
};

/**
 * Creates a logger instance with optional prefix
 */
export const createLogger = (prefix = '') => {
  return {
    debug: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log(...formatMessage('debug', prefix, args));
      }
    },

    info: (...args: unknown[]) => {
      if (isDevelopment) {
        console.info(...formatMessage('info', prefix, args));
      }
    },

    warn: (...args: unknown[]) => {
      if (isDevelopment) {
        console.warn(...formatMessage('warn', prefix, args));
      }
    },

    error: (...args: unknown[]) => {
      // Always log errors
      console.error(...formatMessage('error', prefix, args));
    },
  };
};

/**
 * Default logger instance for admin panel
 */
export const logger = createLogger('Admin');

/**
 * API logger for admin operations
 */
export const apiLogger = createLogger('API');

/**
 * Auth logger for admin authentication
 */
export const authLogger = createLogger('Auth');

export default logger;
