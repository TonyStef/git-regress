/**
 * Simple performance timing utilities for measuring operation durations.
 */

export interface TimingResult {
  label: string;
  durationMs: number;
}

export function measureSync<T>(label: string, fn: () => T): { result: T; timing: TimingResult } {
  const start = performance.now();
  const result = fn();
  const durationMs = Math.round(performance.now() - start);
  return { result, timing: { label, durationMs } };
}

export function formatTiming(timing: TimingResult): string {
  return `${timing.label}: ${timing.durationMs}ms`;
}
