"use strict";
/**
 * Simple structured logger for git-regress CLI and Action output.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogEntry = createLogEntry;
exports.formatLogEntry = formatLogEntry;
function createLogEntry(level, message) {
    return {
        level,
        message,
        timestamp: new Date().toISOString(),
    };
}
function formatLogEntry(entry) {
    const prefix = entry.level === 'error' ? 'ERROR' : entry.level === 'warn' ? 'WARN' : entry.level.toUpperCase();
    return `[${prefix}] ${entry.message}`;
}
//# sourceMappingURL=logger.js.map