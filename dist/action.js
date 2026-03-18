"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const cache = __importStar(require("@actions/cache"));
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const core_1 = require("./core");
const store_1 = require("./graph/store");
const cli_1 = require("./reporter/cli");
const github_1 = require("./reporter/github");
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
function remoteRef(baseBranch) {
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
async function resolvePRNumber(token) {
    // 1. Explicit input
    const explicit = core.getInput('pr-number');
    if (explicit) {
        const n = parseInt(explicit, 10);
        if (!Number.isNaN(n) && n > 0)
            return n;
    }
    // 2. Merge commit message pattern
    const commitMsg = github.context.payload.head_commit?.message ?? '';
    const mergeMatch = commitMsg.match(/^Merge pull request #(\d+)/);
    if (mergeMatch)
        return parseInt(mergeMatch[1], 10);
    // 3. Squash merge pattern: "feat: something (#123)"
    const squashMatch = commitMsg.match(/\(#(\d+)\)\s*$/);
    if (squashMatch)
        return parseInt(squashMatch[1], 10);
    // 4. Query the API
    try {
        const octokit = github.getOctokit(token);
        const { owner, repo } = github.context.repo;
        const { data: prs } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
            owner,
            repo,
            commit_sha: github.context.sha,
        });
        const merged = prs.find((pr) => pr.merged_at);
        if (merged)
            return merged.number;
    }
    catch (err) {
        core.warning(`Could not query GitHub API for PR number: ${err.message}`);
    }
    return null;
}
/**
 * Restore footprints from the GitHub Actions cache.
 * The cache is shared across all branches in the repo.
 * Returns true if cache was found, false otherwise.
 */
async function restoreFootprintsCache() {
    try {
        const hitKey = await cache.restoreCache([FOOTPRINTS_PATH], CACHE_KEY, [CACHE_KEY]);
        if (hitKey) {
            core.info(`Restored footprints from cache (key: ${hitKey}).`);
            return true;
        }
        core.info('No cached footprints found. This is normal on first run.');
        return false;
    }
    catch (err) {
        core.warning(`Failed to restore cache: ${err.message}`);
        return false;
    }
}
/**
 * Save footprints to the GitHub Actions cache.
 * Uses a unique key per save so updates always persist (cache is immutable
 * per key, so we append a timestamp to make each save unique).
 */
async function saveFootprintsCache() {
    try {
        const uniqueKey = `${CACHE_KEY}-${Date.now()}`;
        await cache.saveCache([FOOTPRINTS_PATH], uniqueKey);
        core.info(`Saved footprints to cache (key: ${uniqueKey}).`);
    }
    catch (err) {
        // cache.saveCache throws if key already exists — not a problem
        if (err.message?.includes('already exists')) {
            core.info('Cache already up to date.');
        }
        else {
            core.warning(`Failed to save cache: ${err.message}`);
        }
    }
}
async function handlePush() {
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
    const result = await (0, core_1.runStore)({
        pr: prNumber,
        base: `${remoteRef(baseBranch)}~1`,
        head: 'HEAD',
        author,
        title,
        mergedAt: new Date().toISOString(),
        twoDot: true,
    });
    core.info(`Stored: ${result.symbolsAdded} symbol(s) added, ${result.symbolsReferenced} symbol(s) referenced`);
    // Prune old footprints to keep the cache small
    const pruned = (0, store_1.pruneOldFootprints)(lookbackDays);
    if (pruned > 0) {
        core.info(`Pruned ${pruned} expired footprint(s) older than ${lookbackDays} days.`);
    }
    // Save updated footprints to cache
    await saveFootprintsCache();
    core.setOutput('mode', 'store');
    core.setOutput('pr-number', prNumber);
}
async function handlePullRequest() {
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
    const { regressions } = await (0, core_1.runCheck)({ base: remoteRef(baseBranch), lookbackDays });
    // Log results to the Actions console
    core.info((0, cli_1.formatRegressions)(regressions));
    // Post or update PR comment (also cleans up stale warnings)
    try {
        await (0, github_1.postPRComment)(regressions, {
            token,
            owner,
            repo,
            prNumber,
        });
    }
    catch (err) {
        core.warning(`Failed to post PR comment: ${err.message}`);
    }
    // Set outputs
    core.setOutput('mode', 'check');
    core.setOutput('regression-found', regressions.length > 0);
    core.setOutput('regression-count', regressions.length);
    if (regressions.length > 0) {
        core.setFailed(`Found ${regressions.length} potential semantic regression(s). See the PR comment for details.`);
    }
}
async function run() {
    try {
        const eventName = github.context.eventName;
        const mode = core.getInput('mode');
        core.info(`Event: ${eventName}, configured mode: ${mode || 'auto'}`);
        if (mode === 'store') {
            await handlePush();
        }
        else if (mode === 'check') {
            await handlePullRequest();
        }
        else {
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
                    core.warning(`Unsupported event: "${eventName}". git-regress supports "push" (for store) and "pull_request" (for check). Skipping.`);
            }
        }
    }
    catch (err) {
        core.setFailed(err.message);
    }
}
run();
//# sourceMappingURL=action.js.map