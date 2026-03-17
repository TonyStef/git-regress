import type { Regression } from '../graph/detect';
export interface GitHubReportOptions {
    token: string;
    owner: string;
    repo: string;
    prNumber: number;
}
/**
 * Post, update, or clean up the git-regress PR comment.
 *
 * - If regressions exist: create or update the warning comment.
 * - If no regressions: find any existing warning comment and update it to "all clear",
 *   so stale warnings don't persist after fixes.
 */
export declare function postPRComment(regressions: Regression[], options: GitHubReportOptions): Promise<void>;
