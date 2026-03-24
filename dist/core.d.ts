import type { Regression } from './graph/detect';
import type { PRFootprint } from './graph/footprint';
export interface StoreOptions {
    pr: number;
    base: string;
    head: string;
    author?: string;
    title?: string;
    mergedAt?: string;
    twoDot?: boolean;
    tsconfigPath?: string;
}
export interface StoreResult {
    symbolsAdded: number;
    symbolsReferenced: number;
    footprint: PRFootprint;
}
export interface CheckOptions {
    base: string;
    lookbackDays: number;
    tsconfigPath?: string;
}
export interface CheckResult {
    regressions: Regression[];
    deletedCount: number;
    modifiedCount: number;
}
/**
 * Store a symbol footprint for a merged PR.
 * Shared by CLI and GitHub Action entry points.
 */
export declare function runStore(opts: StoreOptions): Promise<StoreResult>;
/**
 * Check current branch for semantic regressions against recently merged PRs.
 * Shared by CLI and GitHub Action entry points.
 */
export declare function runCheck(opts: CheckOptions): Promise<CheckResult>;
