#!/usr/bin/env node

import { Command } from 'commander';
import { getLanguage, isSupportedFile, loadConfig } from './config';
import { getAuthorName, getDiff, getDiffTwoDot, getFileAtRef, getLastCommitMessage } from './git';
import { detectRegressions } from './graph/detect';
import type { PRFootprint, SymbolRef } from './graph/footprint';
import { addFootprint, getRecentFootprints } from './graph/store';
import { type ExtractedSymbol, extractSymbols, parseFile, resolveImportPath } from './parser/ast';
import type { DiffFile } from './parser/diff';
import { getAddedLineNumbers, parseDiff } from './parser/diff';
import { formatRegressions } from './reporter/cli';
import { type GitHubReportOptions, postPRComment } from './reporter/github';

function parseIntOrFail(value: string, name: string): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) {
    throw new Error(`Invalid ${name}: "${value}" (expected a positive integer)`);
  }
  return n;
}

function filterSupported(files: DiffFile[]): DiffFile[] {
  const config = loadConfig();
  return files.filter((f) => {
    const p = f.newPath ?? f.oldPath;
    return p && isSupportedFile(p, config);
  });
}

function toRef(sym: ExtractedSymbol, file: string): SymbolRef {
  return { name: sym.name, file, kind: sym.kind };
}

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
        const base = opts.base;
        const head = opts.head;
        const author = opts.author || getAuthorName();
        const title = opts.title || getLastCommitMessage();
        const mergedAt = opts.mergedAt || new Date().toISOString();

        const raw = opts.twoDot ? getDiffTwoDot(base, head) : getDiff(base, head);
        const supported = filterSupported(parseDiff(raw));

        const symbolsAdded: SymbolRef[] = [];
        const symbolsReferenced: SymbolRef[] = [];

        for (const file of supported) {
          const filePath = file.newPath!;
          const source = getFileAtRef(head, filePath);
          if (!source) continue;

          const lang = getLanguage(filePath);
          const addedLines = getAddedLineNumbers(file);
          const { symbols, imports } = await parseFile(source, lang);

          for (const sym of symbols) {
            if (addedLines.has(sym.line)) {
              symbolsAdded.push(toRef(sym, filePath));
            }
          }

          for (const imp of imports) {
            if (addedLines.has(imp.line)) {
              const resolvedFile = resolveImportPath(filePath, imp.source);
              for (const name of imp.names) {
                symbolsReferenced.push({ name, file: resolvedFile, kind: 'variable' });
              }
            }
          }
        }

        const footprint: PRFootprint = {
          number: prNumber,
          merged_at: mergedAt,
          author,
          title,
          symbols_added: symbolsAdded,
          symbols_referenced: symbolsReferenced,
        };

        addFootprint(footprint);

        console.log(`Stored footprint for PR #${prNumber}`);
        console.log(`  ${symbolsAdded.length} symbol(s) added, ${symbolsReferenced.length} symbol(s) referenced`);
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
        const base = opts.base;
        const lookbackDays = parseIntOrFail(opts.lookback, '--lookback');

        const raw = getDiff(base, 'HEAD');
        const supported = filterSupported(parseDiff(raw));

        const deletedSymbols: SymbolRef[] = [];
        const modifiedSymbols: SymbolRef[] = [];

        for (const file of supported) {
          const filePath = file.oldPath ?? file.newPath!;

          if (file.status === 'deleted') {
            const oldSource = getFileAtRef(base, filePath);
            if (!oldSource) continue;
            const oldSymbols = await extractSymbols(oldSource, getLanguage(filePath));
            for (const sym of oldSymbols) {
              deletedSymbols.push(toRef(sym, filePath));
            }
            continue;
          }

          if (file.status === 'added') continue;

          const oldSource = getFileAtRef(base, file.oldPath!);
          const newSource = getFileAtRef('HEAD', file.newPath!);
          if (!oldSource || !newSource) continue;

          const lang = getLanguage(file.newPath!);
          const oldSymbols = await extractSymbols(oldSource, lang);
          const newSymbols = await extractSymbols(newSource, lang);

          const newSymbolMap = new Map<string, ExtractedSymbol>();
          for (const sym of newSymbols) {
            newSymbolMap.set(`${sym.name}:${sym.kind}`, sym);
          }

          for (const oldSym of oldSymbols) {
            const key = `${oldSym.name}:${oldSym.kind}`;
            const newSym = newSymbolMap.get(key);
            const canonicalPath = file.newPath ?? file.oldPath!;

            if (!newSym) {
              deletedSymbols.push(toRef(oldSym, canonicalPath));
            } else if (oldSym.signature && newSym.signature && oldSym.signature !== newSym.signature) {
              modifiedSymbols.push(toRef(oldSym, canonicalPath));
            }
          }
        }

        const footprints = getRecentFootprints(lookbackDays);
        const regressions = detectRegressions(deletedSymbols, modifiedSymbols, footprints);

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
