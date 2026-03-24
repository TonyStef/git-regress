"use strict";
/**
 * Simple performance timing utilities for measuring operation durations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.measureSync = measureSync;
exports.formatTiming = formatTiming;
function measureSync(label, fn) {
    const start = performance.now();
    const result = fn();
    const durationMs = Math.round(performance.now() - start);
    return { result, timing: { label, durationMs } };
}
function formatTiming(timing) {
    return `${timing.label}: ${timing.durationMs}ms`;
}
//# sourceMappingURL=timing.js.map