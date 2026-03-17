import { getLanguage, isSupportedFile, loadConfig } from './config';
import { getAuthorName, getDiff, getDiffTwoDot, getFileAtRef, getLastCommitMessage } from './git';
import type { Regression } from './graph/detect';
import { detectRegressions } from './graph/detect';
import type { PRFootprint, SymbolRef } from './graph/footprint';
import { addFootprint, getRecentFootprints } from './graph/store';
import { type ExtractedSymbol, extractSymbols, parseFile, resolveImportPath } from './parser/ast';
import type { DiffFile } from './parser/diff';
import { getAddedLineNumbers, parseDiff } from './parser/diff';

export interface StoreOptions {
  pr: number;
  base: string;
  head: string;
  author?: string;
  title?: string;
  mergedAt?: string;
  twoDot?: boolean;
}

export interface StoreResult {
  symbolsAdded: number;
  symbolsReferenced: number;
  footprint: PRFootprint;
}

export interface CheckOptions {
  base: string;
  lookbackDays: number;
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
      for (const sym of oldSymbols) {
        deletedSymbols.push(toRef(sym, filePath));
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

  const footprints = getRecentFootprints(opts.lookbackDays);
  const regressions = detectRegressions(deletedSymbols, modifiedSymbols, footprints);

  return {
    regressions,
    deletedCount: deletedSymbols.length,
    modifiedCount: modifiedSymbols.length,
  };
}
