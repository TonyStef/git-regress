/**
 * Simple structured logger for git-regress CLI and Action output.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
}
export declare function createLogEntry(level: LogLevel, message: string): LogEntry;
export declare function formatLogEntry(entry: LogEntry): string;
