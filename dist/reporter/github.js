"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postPRComment = postPRComment;
const rest_1 = require("@octokit/rest");
const cli_1 = require("./cli");
const COMMENT_TAG = '<!-- git-regress -->';
/**
 * Post, update, or clean up the git-regress PR comment.
 *
 * - If regressions exist: create or update the warning comment.
 * - If no regressions: find any existing warning comment and update it to "all clear",
 *   so stale warnings don't persist after fixes.
 */
async function postPRComment(regressions, options) {
    const octokit = new rest_1.Octokit({ auth: options.token });
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
    const body = `${COMMENT_TAG}\n${(0, cli_1.formatRegressions)(regressions)}`;
    if (existing) {
        await octokit.issues.updateComment({
            owner: options.owner,
            repo: options.repo,
            comment_id: existing.id,
            body,
        });
    }
    else {
        await octokit.issues.createComment({
            owner: options.owner,
            repo: options.repo,
            issue_number: options.prNumber,
            body,
        });
    }
}
async function findExistingComment(octokit, options) {
    const comments = await octokit.paginate(octokit.issues.listComments, {
        owner: options.owner,
        repo: options.repo,
        issue_number: options.prNumber,
    });
    return comments.find((c) => c.body?.includes(COMMENT_TAG));
}
//# sourceMappingURL=github.js.map