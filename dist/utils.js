"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePath = normalizePath;
exports.deduplicateRefs = deduplicateRefs;
exports.formatDuration = formatDuration;
/**
 * Normalize a file path for consistent symbol matching.
 * Strips extensions and /index suffixes so that:
 *   src/utils/index.ts -> src/utils
 *   src/helpers.ts     -> src/helpers
 */
function normalizePath(filePath) {
    let normalized = filePath.replace(/\.(ts|tsx|js|jsx)$/, '');
    normalized = normalized.replace(/\/index$/, '');
    return normalized;
}
/**
 * Deduplicate an array of symbol references by name+file+kind.
 */
function deduplicateRefs(refs) {
    const seen = new Set();
    return refs.filter((ref) => {
        const key = `${ref.name}:${ref.file}:${ref.kind}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
/**
 * Format a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60)
        return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}m ${remaining}s`;
}
//# sourceMappingURL=utils.js.map