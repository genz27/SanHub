/* eslint-disable no-console */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

const SORA_LOG_LEVEL: LogLevel = (() => {
  const raw = (process.env.SORA_LOG_LEVEL || '').toLowerCase();
  if (raw in LOG_LEVELS) return raw as LogLevel;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
})();

const shouldLog = (level: LogLevel) => LOG_LEVELS[level] >= LOG_LEVELS[SORA_LOG_LEVEL];

export const logDebug = (...args: unknown[]) => {
  if (shouldLog('debug')) console.log(...args);
};
export const logInfo = (...args: unknown[]) => {
  if (shouldLog('info')) console.log(...args);
};
export const logWarn = (...args: unknown[]) => {
  if (shouldLog('warn')) console.warn(...args);
};
export const logError = (...args: unknown[]) => {
  if (shouldLog('error')) console.error(...args);
};
