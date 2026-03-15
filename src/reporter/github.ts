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

export async function postPRComment(regressions: Regression[], options: GitHubReportOptions): Promise<void> {
  if (regressions.length === 0) return;

  const octokit = new Octokit({ auth: options.token });
  const body = `${COMMENT_TAG}\n${formatRegressions(regressions)}`;

  const comments = await octokit.paginate(octokit.issues.listComments, {
    owner: options.owner,
    repo: options.repo,
    issue_number: options.prNumber,
  });

  const existing = comments.find((c) => c.body?.includes(COMMENT_TAG));

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
