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
