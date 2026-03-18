/**
 * Normalize a file path for consistent symbol matching.
 * Strips extensions and /index suffixes so that:
 *   src/utils/index.ts -> src/utils
 *   src/helpers.ts     -> src/helpers
 */
export declare function normalizePath(filePath: string): string;
/**
 * Deduplicate an array of symbol references by name+file+kind.
 */
export declare function deduplicateRefs<T extends {
    name: string;
    file: string;
    kind: string;
}>(refs: T[]): T[];
/**
 * Format a duration in milliseconds to a human-readable string.
 */
export declare function formatDuration(ms: number): string;
