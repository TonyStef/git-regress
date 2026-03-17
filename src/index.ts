#!/usr/bin/env node

import { Command } from 'commander';
import { runCheck, runStore } from './core';
import { formatRegressions } from './reporter/cli';
import { type GitHubReportOptions, postPRComment } from './reporter/github';

function parseIntOrFail(value: string, name: string): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) {
    throw new Error(`Invalid ${name}: "${value}" (expected a positive integer)`);
  }
  return n;
}

/**
 * When running as a GitHub Action (GITHUB_ACTIONS=true), delegate to the
 * action entry point instead of the CLI. This lets action.yml point at
 * this same dist/index.js while keeping the CLI available for local use.
 */
if (process.env.GITHUB_ACTIONS === 'true') {
  require('./action');
} else {
  const program = new Command();

  program
    .name('git-regress')
    .description('Detects semantic regressions across PRs that git merge conflict detection misses')
    .version('0.1.0');

  program
    .command('store')
    .description('Store symbol footprint for a merged PR')
    .requiredOption('--pr <number>', 'PR number')
    .option('--base <ref>', 'Base branch', 'main')
    .option('--head <ref>', 'Head ref (must be the merge commit or PR branch tip)', 'HEAD')
    .option('--author <name>', 'PR author')
    .option('--title <text>', 'PR title')
    .option('--merged-at <iso>', 'PR merge timestamp (ISO 8601)')
    .option('--two-dot', 'Use two-dot diff (base..head) instead of three-dot (base...head)')
    .action(
      async (opts: {
        pr: string;
        base: string;
        head: string;
        author?: string;
        title?: string;
        mergedAt?: string;
        twoDot?: boolean;
      }) => {
        try {
          const prNumber = parseIntOrFail(opts.pr, '--pr');
          const result = await runStore({
            pr: prNumber,
            base: opts.base,
            head: opts.head,
            author: opts.author,
            title: opts.title,
            mergedAt: opts.mergedAt,
            twoDot: opts.twoDot,
          });

          console.log(`Stored footprint for PR #${prNumber}`);
          console.log(`  ${result.symbolsAdded} symbol(s) added, ${result.symbolsReferenced} symbol(s) referenced`);
        } catch (err: unknown) {
          console.error('Error storing footprint:', (err as Error).message);
          process.exit(1);
        }
      },
    );

  program
    .command('check')
    .description('Check current branch for semantic regressions against recently merged PRs')
    .option('--base <ref>', 'Base branch', 'main')
    .option('--lookback <days>', 'Lookback window in days', '14')
    .option('--github-token <token>', 'GitHub token for posting PR comments')
    .option('--owner <owner>', 'GitHub repo owner')
    .option('--repo <repo>', 'GitHub repo name')
    .option('--pr <number>', 'PR number for GitHub comment')
    .action(
      async (opts: {
        base: string;
        lookback: string;
        githubToken?: string;
        owner?: string;
        repo?: string;
        pr?: string;
      }) => {
        try {
          const lookbackDays = parseIntOrFail(opts.lookback, '--lookback');
          const { regressions } = await runCheck({ base: opts.base, lookbackDays });

          console.log(formatRegressions(regressions));

          if (opts.githubToken && opts.owner && opts.repo && opts.pr) {
            const ghOpts: GitHubReportOptions = {
              token: opts.githubToken,
              owner: opts.owner,
              repo: opts.repo,
              prNumber: parseIntOrFail(opts.pr, '--pr'),
            };
            try {
              await postPRComment(regressions, ghOpts);
            } catch (err: unknown) {
              console.error('Warning: Failed to post GitHub comment:', (err as Error).message);
            }
          }

          if (regressions.length > 0) {
            process.exit(1);
          }
        } catch (err: unknown) {
          console.error('Error checking for regressions:', (err as Error).message);
          process.exit(1);
        }
      },
    );

  program.parse();
}
