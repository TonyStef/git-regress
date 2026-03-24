/**
 * Simple performance timing utilities for measuring operation durations.
 */
export interface TimingResult {
    label: string;
    durationMs: number;
}
export declare function measureSync<T>(label: string, fn: () => T): {
    result: T;
    timing: TimingResult;
};
export declare function formatTiming(timing: TimingResult): string;
