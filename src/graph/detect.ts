import type { PRFootprint, SymbolRef } from './footprint';

export interface RegressionMatch {
  pr: PRFootprint;
  relationship: 'added' | 'referenced';
}

export interface Regression {
  symbol: SymbolRef;
  type: 'deleted' | 'modified';
  affectedPRs: RegressionMatch[];
}

export function detectRegressions(
  deletedSymbols: SymbolRef[],
  modifiedSymbols: SymbolRef[],
  footprints: PRFootprint[],
): Regression[] {
  const regressions: Regression[] = [];

  for (const symbol of deletedSymbols) {
    const matches = findAffectedPRs(symbol, footprints);
    if (matches.length > 0) {
      regressions.push({ symbol, type: 'deleted', affectedPRs: matches });
    }
  }

  for (const symbol of modifiedSymbols) {
    const matches = findAffectedPRs(symbol, footprints);
    if (matches.length > 0) {
      regressions.push({ symbol, type: 'modified', affectedPRs: matches });
    }
  }

  return regressions;
}

function symbolMatches(stored: SymbolRef, target: SymbolRef, ignoreKind = false): boolean {
  return stored.name === target.name && stored.file === target.file && (ignoreKind || stored.kind === target.kind);
}

function findAffectedPRs(symbol: SymbolRef, footprints: PRFootprint[]): RegressionMatch[] {
  const matches: RegressionMatch[] = [];

  for (const fp of footprints) {
    const wasAdded = fp.symbols_added.some((s) => symbolMatches(s, symbol));
    if (wasAdded) {
      matches.push({ pr: fp, relationship: 'added' });
      continue;
    }

    const wasReferenced = fp.symbols_referenced.some((s) => symbolMatches(s, symbol, true));
    if (wasReferenced) {
      matches.push({ pr: fp, relationship: 'referenced' });
    }
  }

  return matches;
}
