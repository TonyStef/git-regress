/**
 * Simple structured logger for git-regress CLI and Action output.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
}

export function createLogEntry(level: LogLevel, message: string): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
  };
}

export function formatLogEntry(entry: LogEntry): string {
  const prefix = entry.level === 'error' ? 'ERROR' : entry.level === 'warn' ? 'WARN' : entry.level.toUpperCase();
  return `[${prefix}] ${entry.message}`;
}
