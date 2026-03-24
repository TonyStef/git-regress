import { getLanguage, isSupportedFile, loadConfig } from './config';
import { getAuthorName, getDiff, getDiffTwoDot, getFileAtRef, getLastCommitMessage, getRepoRoot } from './git';
import type { Regression } from './graph/detect';
import { detectRegressions } from './graph/detect';
import type { PRFootprint, SymbolRef } from './graph/footprint';
import { addFootprint, getRecentFootprints } from './graph/store';
import { type ExtractedSymbol, extractSymbols, parseFile } from './parser/ast';
import type { DiffFile } from './parser/diff';
import { getAddedLineNumbers, parseDiff } from './parser/diff';
import { canonicalizePath, createResolver } from './resolve';

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

function groupByKey(symbols: ExtractedSymbol[]): Map<string, ExtractedSymbol[]> {
  const groups = new Map<string, ExtractedSymbol[]>();
  for (const sym of symbols) {
    const key = `${sym.name}:${sym.kind}`;
    const group = groups.get(key);
    if (group) group.push(sym);
    else groups.set(key, [sym]);
  }
  return groups;
}

function hasSignatureChange(oldGroup: ExtractedSymbol[], newGroup: ExtractedSymbol[]): boolean {
  const oldSigs = oldGroup
    .map((s) => s.signature)
    .filter(Boolean)
    .sort();
  const newSigs = newGroup
    .map((s) => s.signature)
    .filter(Boolean)
    .sort();
  if (oldSigs.length === 0 || newSigs.length === 0) return false;
  if (oldSigs.length !== newSigs.length) return true;
  return oldSigs.some((sig, i) => sig !== newSigs[i]);
}

/**
 * Store a symbol footprint for a merged PR.
 * Shared by CLI and GitHub Action entry points.
 */
export async function runStore(opts: StoreOptions): Promise<StoreResult> {
  const base = opts.base;
  const head = opts.head;
  const author = opts.author || getAuthorName();
  const title = opts.title || getLastCommitMessage();
  const mergedAt = opts.mergedAt || new Date().toISOString();
  const resolver = createResolver(getRepoRoot(), opts.tsconfigPath);

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
        symbolsAdded.push(toRef(sym, canonicalizePath(filePath)));
      }
    }

    for (const imp of imports) {
      if (addedLines.has(imp.line)) {
        const resolvedFile = resolver.resolve(filePath, imp.source);
        if (!resolvedFile) continue;
        for (const name of imp.names) {
          symbolsReferenced.push({ name, file: resolvedFile, kind: 'variable' });
        }
      }
    }
  }

  const footprint: PRFootprint = {
    number: opts.pr,
    merged_at: mergedAt,
    author,
    title,
    symbols_added: symbolsAdded,
    symbols_referenced: symbolsReferenced,
  };

  addFootprint(footprint);

  return {
    symbolsAdded: symbolsAdded.length,
    symbolsReferenced: symbolsReferenced.length,
    footprint,
  };
}

/**
 * Check current branch for semantic regressions against recently merged PRs.
 * Shared by CLI and GitHub Action entry points.
 */
export async function runCheck(opts: CheckOptions): Promise<CheckResult> {
  const raw = getDiff(opts.base, 'HEAD');
  const supported = filterSupported(parseDiff(raw));

  const deletedSymbols: SymbolRef[] = [];
  const modifiedSymbols: SymbolRef[] = [];

  for (const file of supported) {
    const filePath = file.oldPath ?? file.newPath!;

    if (file.status === 'deleted') {
      const oldSource = getFileAtRef(opts.base, filePath);
      if (!oldSource) continue;
      const oldSymbols = await extractSymbols(oldSource, getLanguage(filePath));
      const canonical = canonicalizePath(filePath);
      for (const [, group] of groupByKey(oldSymbols)) {
        deletedSymbols.push(toRef(group[0], canonical));
      }
      continue;
    }

    if (file.status === 'added') continue;

    const oldSource = getFileAtRef(opts.base, file.oldPath!);
    const newSource = getFileAtRef('HEAD', file.newPath!);
    if (!oldSource || !newSource) continue;

    const lang = getLanguage(file.newPath!);
    const oldSymbols = await extractSymbols(oldSource, lang);
    const newSymbols = await extractSymbols(newSource, lang);
    const canonical = canonicalizePath(file.newPath ?? file.oldPath!);

    const oldGroups = groupByKey(oldSymbols);
    const newGroups = groupByKey(newSymbols);

    for (const [key, oldGroup] of oldGroups) {
      const newGroup = newGroups.get(key);
      if (!newGroup) {
        deletedSymbols.push(toRef(oldGroup[0], canonical));
      } else if (hasSignatureChange(oldGroup, newGroup)) {
        modifiedSymbols.push(toRef(oldGroup[0], canonical));
      }
    }
  }

  const footprints = getRecentFootprints(opts.lookbackDays);
  const regressions = detectRegressions(deletedSymbols, modifiedSymbols, footprints);

  return {
    regressions,
    deletedCount: deletedSymbols.length,
    modifiedCount: modifiedSymbols.length,
  };
}
