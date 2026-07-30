/**
 * Logger utility for consistent logging across the application.
 *
 * In development: All logs are shown in console
 * In production: Only errors are logged (can be extended to send to error tracking)
 */

const isDevelopment = import.meta.env.DEV;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  /** Prefix to add to all log messages */
  prefix?: string;
  /** Force logging even in production (use sparingly) */
  forceLog?: boolean;
}

const formatMessage = (level: LogLevel, prefix: string, args: unknown[]): unknown[] => {
  const timestamp = new Date().toISOString();
  const levelStr = level.toUpperCase().padEnd(5);
  return [`[${timestamp}] [${levelStr}]${prefix ? ` [${prefix}]` : ''}`, ...args];
};

/**
 * Creates a logger instance with optional prefix
 */
export const createLogger = (options: LoggerOptions = {}) => {
  const { prefix = '', forceLog = false } = options;
  const shouldLog = isDevelopment || forceLog;

  return {
    /**
     * Debug level logging - only shown in development
     */
    debug: (...args: unknown[]) => {
      if (shouldLog) {
        console.log(...formatMessage('debug', prefix, args));
      }
    },

    /**
     * Info level logging - only shown in development
     */
    info: (...args: unknown[]) => {
      if (shouldLog) {
        console.info(...formatMessage('info', prefix, args));
      }
    },

    /**
     * Warning level logging - only shown in development
     */
    warn: (...args: unknown[]) => {
      if (shouldLog) {
        console.warn(...formatMessage('warn', prefix, args));
      }
    },

    /**
     * Error level logging - always logged (production sends to Sentry)
     * Errors should always be visible for debugging
     */
    error: (...args: unknown[]) => {
      // Always log errors
      console.error(...formatMessage('error', prefix, args));
    },
  };
};

/**
 * Default logger instance for general use
 */
export const logger = createLogger();

/**
 * Game-specific logger
 */
export const gameLogger = createLogger({ prefix: 'Game' });

/**
 * Network/API logger
 */
export const networkLogger = createLogger({ prefix: 'Network' });

/**
 * Auth logger
 */
export const authLogger = createLogger({ prefix: 'Auth' });

export default logger;
