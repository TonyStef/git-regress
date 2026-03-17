import { Octokit } from '@octokit/rest';
import type { Regression } from '../graph/detect';
import { formatRegressions } from './cli';

const COMMENT_TAG = '<!-- git-regress -->';

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
export async function postPRComment(regressions: Regression[], options: GitHubReportOptions): Promise<void> {
  const octokit = new Octokit({ auth: options.token });

  const existing = await findExistingComment(octokit, options);

  if (regressions.length === 0) {
    if (existing) {
      const body = `${COMMENT_TAG}\nNo semantic regressions detected. All clear.`;
      await octokit.issues.updateComment({
        owner: options.owner,
        repo: options.repo,
        comment_id: existing.id,
        body,
      });
    }
    return;
  }

  const body = `${COMMENT_TAG}\n${formatRegressions(regressions)}`;

  if (existing) {
    await octokit.issues.updateComment({
      owner: options.owner,
      repo: options.repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await octokit.issues.createComment({
      owner: options.owner,
      repo: options.repo,
      issue_number: options.prNumber,
      body,
    });
  }
}

async function findExistingComment(
  octokit: Octokit,
  options: GitHubReportOptions,
): Promise<{ id: number } | undefined> {
  const comments = await octokit.paginate(octokit.issues.listComments, {
    owner: options.owner,
    repo: options.repo,
    issue_number: options.prNumber,
  });

  return comments.find((c) => c.body?.includes(COMMENT_TAG));
}
