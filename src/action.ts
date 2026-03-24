import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { runCheck, runStore } from './core';
import { pruneOldFootprints } from './graph/store';
import { formatRegressions } from './reporter/cli';
import { postPRComment } from './reporter/github';

const LOOKBACK_DEFAULT = 14;
const CACHE_KEY = 'git-regress-footprints';
const FOOTPRINTS_PATH = '.git-regress';

/**
 * In GitHub Actions, `actions/checkout` checks out a detached HEAD (the merge
 * commit for PRs, or the pushed commit for pushes). The local branch name
 * (e.g. `main`) doesn't exist — only `origin/main` does.
 *
 * Prefix `origin/` so git diff/show can resolve the ref.
 */
function remoteRef(baseBranch: string): string {
  return `origin/${baseBranch}`;
}

/**
 * Extract the merged PR number from a push event.
 *
 * Strategy (in order):
 * 1. The user explicitly provided a pr-number input -> use that.
 * 2. GitHub merge commits follow the pattern "Merge pull request #N from ..." -> parse it.
 * 3. Squash merges include "(#N)" in the commit message -> parse it.
 * 4. Query the GitHub API for PRs associated with the head commit.
 */
async function resolvePRNumber(token: string): Promise<number | null> {
  // 1. Explicit input
  const explicit = core.getInput('pr-number');
  if (explicit) {
    const n = parseInt(explicit, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }

  // 2. Merge commit message pattern
  const commitMsg = github.context.payload.head_commit?.message ?? '';
  const mergeMatch = commitMsg.match(/^Merge pull request #(\d+)/);
  if (mergeMatch) return parseInt(mergeMatch[1], 10);

  // 3. Squash merge pattern: "feat: something (#123)"
  const squashMatch = commitMsg.match(/\(#(\d+)\)\s*$/);
  if (squashMatch) return parseInt(squashMatch[1], 10);

  // 4. Query the API
  try {
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const { data: prs } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: github.context.sha,
    });
    const merged = prs.find((pr: { merged_at: string | null }) => pr.merged_at);
    if (merged) return merged.number;
  } catch (err: unknown) {
    core.warning(`Could not query GitHub API for PR number: ${(err as Error).message}`);
  }

  return null;
}

/**
 * Restore footprints from the GitHub Actions cache.
 * The cache is shared across all branches in the repo.
 * Returns true if cache was found, false otherwise.
 */
async function restoreFootprintsCache(): Promise<boolean> {
  try {
    const hitKey = await cache.restoreCache([FOOTPRINTS_PATH], CACHE_KEY, [CACHE_KEY]);
    if (hitKey) {
      core.info(`Restored footprints from cache (key: ${hitKey}).`);
      return true;
    }
    core.info('No cached footprints found. This is normal on first run.');
    return false;
  } catch (err: unknown) {
    core.warning(`Failed to restore cache: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Save footprints to the GitHub Actions cache.
 * Uses a unique key per save so updates always persist (cache is immutable
 * per key, so we append a timestamp to make each save unique).
 */
async function saveFootprintsCache(): Promise<void> {
  try {
    const uniqueKey = `${CACHE_KEY}-${Date.now()}`;
    await cache.saveCache([FOOTPRINTS_PATH], uniqueKey);
    core.info(`Saved footprints to cache (key: ${uniqueKey}).`);
  } catch (err: unknown) {
    // cache.saveCache throws if key already exists — not a problem
    if ((err as Error).message?.includes('already exists')) {
      core.info('Cache already up to date.');
    } else {
      core.warning(`Failed to save cache: ${(err as Error).message}`);
    }
  }
}

async function handlePush(): Promise<void> {
  const token = core.getInput('github-token', { required: true });
  const baseBranch = core.getInput('base-branch') || 'main';
  const lookbackStr = core.getInput('lookback-days') || String(LOOKBACK_DEFAULT);
  const lookbackDays = parseInt(lookbackStr, 10) || LOOKBACK_DEFAULT;

  // Only run store on pushes to the base branch
  const expectedRef = `refs/heads/${baseBranch}`;
  if (github.context.ref !== expectedRef) {
    core.info(`Push to ${github.context.ref}, not ${expectedRef}. Skipping store.`);
    return;
  }

  const prNumber = await resolvePRNumber(token);
  if (!prNumber) {
    core.info('Could not determine merged PR number from this push. Skipping store.');
    core.info('This is normal for direct pushes that are not PR merges.');
    return;
  }

  // Restore existing footprints from cache before adding new ones
  await restoreFootprintsCache();

  // Extract metadata from the push event payload
  const payload = github.context.payload;
  const author = payload.head_commit?.author?.username ?? payload.sender?.login ?? 'unknown';
  const title = payload.head_commit?.message?.split('\n')[0] ?? '';

  core.info(`Storing footprint for PR #${prNumber}...`);

  const tsconfigPath = core.getInput('tsconfig-path') || undefined;

  const result = await runStore({
    pr: prNumber,
    base: `${remoteRef(baseBranch)}~1`,
    head: 'HEAD',
    author,
    title,
    mergedAt: new Date().toISOString(),
    twoDot: true,
    tsconfigPath,
  });

  core.info(`Stored: ${result.symbolsAdded} symbol(s) added, ${result.symbolsReferenced} symbol(s) referenced`);

  // Prune old footprints to keep the cache small
  const pruned = pruneOldFootprints(lookbackDays);
  if (pruned > 0) {
    core.info(`Pruned ${pruned} expired footprint(s) older than ${lookbackDays} days.`);
  }

  // Save updated footprints to cache
  await saveFootprintsCache();

  core.setOutput('mode', 'store');
  core.setOutput('pr-number', prNumber);
}

async function handlePullRequest(): Promise<void> {
  const token = core.getInput('github-token', { required: true });
  const baseBranch = core.getInput('base-branch') || 'main';
  const lookbackStr = core.getInput('lookback-days') || String(LOOKBACK_DEFAULT);
  const lookbackDays = parseInt(lookbackStr, 10) || LOOKBACK_DEFAULT;

  const prNumber = github.context.payload.pull_request?.number;
  if (!prNumber) {
    core.setFailed('Could not determine PR number from pull_request event.');
    return;
  }

  const { owner, repo } = github.context.repo;

  // Restore footprints from cache before checking
  await restoreFootprintsCache();

  core.info(`Checking PR #${prNumber} for semantic regressions...`);

  const tsconfigPath = core.getInput('tsconfig-path') || undefined;

  const { regressions } = await runCheck({ base: remoteRef(baseBranch), lookbackDays, tsconfigPath });

  // Log results to the Actions console
  core.info(formatRegressions(regressions));

  // Post or update PR comment (also cleans up stale warnings)
  try {
    await postPRComment(regressions, {
      token,
      owner,
      repo,
      prNumber,
    });
  } catch (err: unknown) {
    core.warning(`Failed to post PR comment: ${(err as Error).message}`);
  }

  // Set outputs
  core.setOutput('mode', 'check');
  core.setOutput('regression-found', regressions.length > 0);
  core.setOutput('regression-count', regressions.length);

  if (regressions.length > 0) {
    core.setFailed(`Found ${regressions.length} potential semantic regression(s). See the PR comment for details.`);
  }
}

async function run(): Promise<void> {
  try {
    const eventName = github.context.eventName;
    const mode = core.getInput('mode');

    core.info(`Event: ${eventName}, configured mode: ${mode || 'auto'}`);

    if (mode === 'store') {
      await handlePush();
    } else if (mode === 'check') {
      await handlePullRequest();
    } else {
      // Auto-detect from event
      switch (eventName) {
        case 'push':
          await handlePush();
          break;
        case 'pull_request':
        case 'pull_request_target':
          await handlePullRequest();
          break;
        default:
          core.warning(
            `Unsupported event: "${eventName}". git-regress supports "push" (for store) and "pull_request" (for check). Skipping.`,
          );
      }
    }
  } catch (err: unknown) {
    core.setFailed((err as Error).message);
  }
}

run();
